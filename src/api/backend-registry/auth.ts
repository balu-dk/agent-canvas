import { getAgentServerSessionApiKey } from "../agent-server-config";
import { DEFAULT_LOCAL_BACKEND_ID } from "./default-backend";
import type { Backend } from "./types";

/**
 * Build the auth headers to send to a backend.
 *
 * Local agent-server uses `X-Session-API-Key`. Cloud expects a bearer
 * token in the `Authorization` header. The k8s backend (the in-app
 * sandbox broker) also authenticates with `X-Session-API-Key`, carrying
 * the broker session key in `backend.apiKey`.
 */
export function buildAuthHeaders(backend: Backend): Record<string, string> {
  if (backend.kind === "local" && backend.id === DEFAULT_LOCAL_BACKEND_ID) {
    const configuredSessionApiKey = getAgentServerSessionApiKey();
    if (configuredSessionApiKey) {
      return { "X-Session-API-Key": configuredSessionApiKey };
    }
  }

  if (!backend.apiKey) return {};

  if (backend.kind === "cloud") {
    return { Authorization: `Bearer ${backend.apiKey}` };
  }

  // Non-cloud kinds ("local" and "k8s") authenticate with
  // `X-Session-API-Key`. k8s falls through here intentionally: the broker
  // expects the session key in this header, exactly like the local
  // agent-server. Keep this branch as the explicit, defensive default so
  // a future backend kind doesn't silently inherit cloud's bearer auth.
  return { "X-Session-API-Key": backend.apiKey };
}
