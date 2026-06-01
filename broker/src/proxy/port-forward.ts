import net from "node:net";
import { PortForward } from "@kubernetes/client-node";
import type { K8sClient } from "../k8s/client.js";
import { getSandboxPod } from "../k8s/sandbox.js";

/**
 * Per-conversation local TCP tunnel into a sandbox pod's :8000.
 *
 * WHY: GROUNDING confirms the macOS host (where the broker runs) cannot resolve
 * `*.svc.cluster.local` (NXDOMAIN) nor route the pod CIDR. The only host-side
 * method that works is a `kubectl port-forward`. We do the equivalent in-process
 * with @kubernetes/client-node's PortForward over a local `net.Server` bound to
 * 127.0.0.1 on an ephemeral port. The runtime proxy then targets that local
 * port. This keeps the in-cluster serviceFQDN design intact (the proxy is just
 * pointed at 127.0.0.1:<localPort> instead of <fqdn>:8000) while remaining
 * reachable from the host.
 *
 * Each entry is keyed by conversation id and remembers the pod name it forwards
 * to; when the pod changes (e.g. after pause→resume the pod is recreated) the
 * tunnel is torn down and re-established.
 */

interface Tunnel {
  podName: string;
  localPort: number;
  server: net.Server;
}

export class PortForwardManager {
  private readonly client: K8sClient;
  private readonly tunnels = new Map<string, Tunnel>();
  /** De-dupe concurrent ensure() calls for the same conversation. */
  private readonly inflight = new Map<string, Promise<number | null>>();

  constructor(client: K8sClient) {
    this.client = client;
  }

  /**
   * Ensure a tunnel exists to the conversation's pod and return its local port,
   * or null if there's no live pod to forward to. Idempotent and concurrency-safe.
   */
  async ensure(conversationId: string): Promise<number | null> {
    const existing = this.inflight.get(conversationId);
    if (existing) return existing;

    const promise = this.ensureImpl(conversationId).finally(() => {
      this.inflight.delete(conversationId);
    });
    this.inflight.set(conversationId, promise);
    return promise;
  }

  private async ensureImpl(conversationId: string): Promise<number | null> {
    const pod = await getSandboxPod(this.client, conversationId);
    const podName = pod?.metadata?.name;
    const podReady = (pod?.status?.conditions ?? []).some(
      (c) => c.type === "Ready" && c.status === "True",
    );
    if (!podName || !podReady) {
      // No live/ready pod — drop any stale tunnel and report unavailable.
      this.close(conversationId);
      return null;
    }

    const current = this.tunnels.get(conversationId);
    if (current && current.podName === podName && current.server.listening) {
      return current.localPort;
    }
    // Pod changed or tunnel dead — rebuild.
    this.close(conversationId);

    const tunnel = await this.openTunnel(conversationId, podName);
    this.tunnels.set(conversationId, tunnel);
    return tunnel.localPort;
  }

  private async openTunnel(conversationId: string, podName: string): Promise<Tunnel> {
    const pf = new PortForward(this.client.kubeConfig);
    const namespace = this.client.namespace;

    const server = net.createServer((socket) => {
      // Forward each accepted connection to the pod's :8000.
      pf.portForward(namespace, podName, [8000], socket, null, socket).catch((err) => {
        if (!isBenign(err)) {
          console.error(
            `[broker] port-forward error for ${conversationId} (${podName}):`,
            (err as Error).message,
          );
        }
        socket.destroy();
      });
    });

    server.on("error", (err) => {
      console.error(`[broker] tunnel server error for ${conversationId}:`, err.message);
    });

    const localPort = await new Promise<number>((resolve, reject) => {
      server.once("error", reject);
      // Bind to loopback on an OS-assigned ephemeral port.
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") resolve(addr.port);
        else reject(new Error("failed to acquire local port for tunnel"));
      });
    });

    return { podName, localPort, server };
  }

  /** Tear down the tunnel for a conversation (e.g. on pause/delete). */
  close(conversationId: string): void {
    const tunnel = this.tunnels.get(conversationId);
    if (!tunnel) return;
    this.tunnels.delete(conversationId);
    try {
      tunnel.server.close();
    } catch {
      // ignore
    }
  }

  /** Tear down all tunnels (process shutdown). */
  closeAll(): void {
    for (const id of [...this.tunnels.keys()]) this.close(id);
  }
}

function isBenign(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return (
    code === "ECONNRESET" ||
    code === "EPIPE" ||
    code === "ECONNABORTED" ||
    code === "ERR_STREAM_PREMATURE_CLOSE"
  );
}
