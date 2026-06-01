import axios from "axios";
import { getActiveBackend } from "../backend-registry/active-store";
import type { Backend } from "../backend-registry/types";

/**
 * Strip any trailing slashes from a host so we can safely concatenate a
 * leading-slash path without producing a double slash.
 */
function normalizeHost(host: string): string {
  return host.replace(/\/+$/, "");
}

interface BrokerRequest {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /**
   * Path on the broker's k8s control-plane, RELATIVE to `/api/k8s`.
   *
   * IMPORTANT: `callBroker` prepends `/api/k8s` for you — do NOT include it
   * in `path`. Pass control-plane paths like:
   *   - "/app-conversations"
   *   - "/app-conversations/search?limit=20"
   *   - "/app-conversations/{id}/file?file_path=..."
   *   - "/sandboxes/{id}/pause"
   * The broker mounts all of these under `/api/k8s/*`.
   */
  path: string;
  /** Optional JSON body for non-GET methods. */
  body?: unknown;
  /**
   * Per-sandbox session key for runtime-scoped calls. The control-plane
   * itself authenticates with the broker session key (`backend.apiKey`);
   * `sessionApiKey` is accepted for parity with the cloud proxy and reserved
   * for future runtime-scoped control-plane calls. When unset, only the
   * broker session key header is sent.
   */
  sessionApiKey?: string | null;
  /**
   * Axios responseType for binary payloads (e.g. ZIP downloads). Leave
   * undefined for the default JSON handling.
   */
  responseType?: "blob";
}

/**
 * Resolve the active backend, asserting it is a k8s backend.
 *
 * k8s control-plane calls must run against a k8s backend — they hit the
 * in-app sandbox broker mounted under `/api/k8s` on the broker host. Throws
 * if the active backend is any other kind so call sites fail loudly instead
 * of silently talking to the wrong host.
 */
export function getActiveK8sBackend(): Backend {
  const active = getActiveBackend().backend;
  if (active.kind !== "k8s") {
    throw new Error("Kubernetes conversations call requires a k8s backend.");
  }
  return active;
}

/**
 * Call the in-app Kubernetes sandbox broker's control-plane.
 *
 * The browser talks same-origin to `${backend.host}/api/k8s/*`; the broker
 * (running on the host with the kubeconfig) reaches the cluster. `callBroker`
 * prepends `/api/k8s` to `req.path`, so callers pass broker-relative paths
 * (e.g. `"/app-conversations/search?..."`).
 *
 * Auth: the broker session key (`backend.apiKey`) is sent as
 * `X-Session-API-Key`. Mirrors the local agent-server auth scheme — see
 * `buildAuthHeaders` in `backend-registry/auth.ts`.
 */
export async function callBroker<T = unknown>(req: BrokerRequest): Promise<T> {
  const backend = getActiveK8sBackend();
  const headers: Record<string, string> = {};
  if (backend.apiKey) {
    headers["X-Session-API-Key"] = backend.apiKey;
  }

  const url = `${normalizeHost(backend.host)}/api/k8s${req.path}`;

  const response = await axios.request<T>({
    method: req.method,
    url,
    headers,
    ...(req.body !== undefined ? { data: req.body } : {}),
    ...(req.responseType ? { responseType: req.responseType } : {}),
    timeout: 30_000,
  });

  return response.data;
}

/**
 * Ping the broker's health endpoint for a specific backend.
 *
 * Hits `${backend.host}/api/k8s/health` (no auth required) and returns
 * `true` on any 2xx. Used by the backend health poller to show a status dot
 * for k8s backends, mirroring how local/cloud backends are probed.
 */
export async function pingBroker(backend: Backend): Promise<boolean> {
  try {
    const response = await axios.get(
      `${normalizeHost(backend.host)}/api/k8s/health`,
      { timeout: 10_000 },
    );
    return response.status >= 200 && response.status < 300;
  } catch {
    return false;
  }
}
