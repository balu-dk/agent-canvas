import { request as httpRequest } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import type { K8sClient } from "../k8s/client.js";
import { getSandbox } from "../k8s/sandbox.js";
import type { PortForwardManager } from "./port-forward.js";

// ── Pure path parsing (unit-tested) ─────────────────────────────────────────

export interface ParsedRuntimePath {
  conversationId: string;
  /** Everything after `/sandbox-runtime/<uuid>`, always starting with "/". */
  rest: string;
}

const RUNTIME_PREFIX = "/sandbox-runtime/";

/**
 * Parse `/sandbox-runtime/<uuid>/<rest...>?<query>` into the conversation id and
 * the remainder path (with query preserved). The remainder is what gets
 * forwarded to the sandbox after stripping the `/sandbox-runtime/<uuid>` prefix.
 * Returns null when the URL is not a runtime path.
 *
 * Examples:
 *   /sandbox-runtime/abc/api/conversations      → { abc, "/api/conversations" }
 *   /sandbox-runtime/abc                          → { abc, "/" }
 *   /sandbox-runtime/abc/sockets/events/x?a=b     → { abc, "/sockets/events/x?a=b" }
 */
export function parseRuntimePath(url: string): ParsedRuntimePath | null {
  if (!url.startsWith(RUNTIME_PREFIX)) return null;
  const afterPrefix = url.slice(RUNTIME_PREFIX.length);
  if (afterPrefix.length === 0) return null;

  // Split the uuid off the front; the separator may be "/", "?", or end-of-string.
  let sepIdx = afterPrefix.length;
  for (let i = 0; i < afterPrefix.length; i++) {
    const c = afterPrefix[i];
    if (c === "/" || c === "?") {
      sepIdx = i;
      break;
    }
  }
  const conversationId = afterPrefix.slice(0, sepIdx);
  if (!conversationId) return null;

  let rest = afterPrefix.slice(sepIdx);
  if (rest === "" || rest.startsWith("?")) {
    // No path component — forward to "/" (preserving any query string).
    rest = `/${rest}`;
  }
  return { conversationId, rest };
}

// ── Benign socket error handling (copied from scripts/ingress.mjs) ───────────

const BENIGN_SOCKET_ERRORS = new Set([
  "ECONNRESET",
  "EPIPE",
  "ECONNABORTED",
  "ERR_STREAM_PREMATURE_CLOSE",
]);

export function isBenignSocketError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      BENIGN_SOCKET_ERRORS.has((err as { code: string }).code),
  );
}

// ── Upstream resolution ─────────────────────────────────────────────────────

export interface Upstream {
  hostname: string;
  port: number;
}

/**
 * Resolve the upstream host:port for a conversation. The sandbox's in-cluster
 * serviceFQDN is not reachable from the host (GROUNDING: NXDOMAIN + non-routable
 * pod CIDR), so the broker tunnels via a per-pod `kubectl port-forward` managed
 * by the PortForwardManager and targets 127.0.0.1:<localPort>.
 *
 * Returns null when the sandbox is missing or not running (paused/no pod) — the
 * caller responds 502.
 */
export async function resolveUpstream(
  client: K8sClient,
  forwards: PortForwardManager,
  conversationId: string,
): Promise<Upstream | null> {
  const sandbox = await getSandbox(client, conversationId);
  if (!sandbox) return null;
  if ((sandbox.spec?.replicas ?? 0) === 0) return null; // paused → no runtime

  const localPort = await forwards.ensure(conversationId);
  if (localPort === null) return null;
  return { hostname: "127.0.0.1", port: localPort };
}

// ── HTTP proxy (modeled on scripts/ingress.mjs proxyRequest) ────────────────

export function proxyRequest(
  req: IncomingMessage,
  res: ServerResponse,
  upstream: Upstream,
  path: string,
): void {
  const options = {
    hostname: upstream.hostname,
    port: upstream.port,
    path,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${upstream.hostname}:${upstream.port}`,
    },
  };

  const proxyReq = httpRequest(options, (proxyRes) => {
    proxyRes.on("error", (err) => {
      if (!isBenignSocketError(err)) {
        console.error(`Upstream response error for ${req.url}:`, err.message);
      }
      if (!res.headersSent) {
        res.writeHead(502);
        res.end(`Bad Gateway: ${err.message}`);
      } else {
        res.destroy();
      }
    });

    res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`Proxy error for ${req.url}:`, err.message);
    }
    if (!res.headersSent) {
      res.writeHead(502);
      res.end(`Bad Gateway: ${err.message}`);
    } else {
      res.destroy();
    }
  });

  req.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`Client request error for ${req.url}:`, err.message);
    }
    proxyReq.destroy();
  });

  res.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`Client response error for ${req.url}:`, err.message);
    }
    proxyReq.destroy();
  });

  req.pipe(proxyReq, { end: true });
}

// ── WebSocket proxy (modeled on scripts/ingress.mjs proxyWebSocket) ─────────

export function proxyWebSocket(
  req: IncomingMessage,
  socket: Duplex,
  _head: Buffer,
  upstream: Upstream,
  path: string,
): void {
  const options = {
    hostname: upstream.hostname,
    port: upstream.port,
    path,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${upstream.hostname}:${upstream.port}`,
    },
  };

  const proxyReq = httpRequest(options);

  // Attach an error handler to the client socket immediately — the client can
  // drop before the upstream upgrade completes, and an unhandled 'error' on the
  // raw TCP socket would crash the broker.
  socket.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`WebSocket client socket error for ${req.url}:`, (err as Error).message);
    }
    proxyReq.destroy();
  });

  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    const teardown = (label: string) => (err?: Error) => {
      if (err && !isBenignSocketError(err)) {
        console.error(`WebSocket ${label} error for ${req.url}:`, err.message);
      }
      socket.destroy();
      proxySocket.destroy();
    };
    proxySocket.on("error", teardown("upstream socket"));
    socket.on("error", () => proxySocket.destroy());
    socket.on("close", () => proxySocket.destroy());
    proxySocket.on("close", () => socket.destroy());

    socket.write(
      `HTTP/${proxyRes.httpVersion} ${proxyRes.statusCode} ${proxyRes.statusMessage}\r\n`,
    );
    for (let i = 0; i < proxyRes.rawHeaders.length; i += 2) {
      socket.write(`${proxyRes.rawHeaders[i]}: ${proxyRes.rawHeaders[i + 1]}\r\n`);
    }
    socket.write("\r\n");

    if (proxyHead.length > 0) socket.write(proxyHead);

    proxySocket.pipe(socket, { end: true });
    socket.pipe(proxySocket, { end: true });
  });

  proxyReq.on("error", (err) => {
    if (!isBenignSocketError(err)) {
      console.error(`WebSocket proxy error for ${req.url}:`, err.message);
    }
    socket.destroy();
  });

  proxyReq.end();
}

// ── Entry points wired from index.ts ────────────────────────────────────────

export async function handleRuntimeRequest(
  client: K8sClient,
  forwards: PortForwardManager,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const parsed = parseRuntimePath(req.url ?? "");
  if (!parsed) {
    res.writeHead(404);
    res.end("Not a runtime path");
    return;
  }
  let upstream: Upstream | null;
  try {
    upstream = await resolveUpstream(client, forwards, parsed.conversationId);
  } catch (err) {
    res.writeHead(502);
    res.end(`Bad Gateway: ${(err as Error).message}`);
    return;
  }
  if (!upstream) {
    res.writeHead(502);
    res.end("Bad Gateway: sandbox not running");
    return;
  }
  proxyRequest(req, res, upstream, parsed.rest);
}

export async function handleRuntimeUpgrade(
  client: K8sClient,
  forwards: PortForwardManager,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
  const parsed = parseRuntimePath(req.url ?? "");
  if (!parsed) {
    socket.destroy();
    return;
  }
  let upstream: Upstream | null;
  try {
    upstream = await resolveUpstream(client, forwards, parsed.conversationId);
  } catch {
    socket.destroy();
    return;
  }
  if (!upstream) {
    socket.destroy();
    return;
  }
  proxyWebSocket(req, socket, head, upstream, parsed.rest);
}
