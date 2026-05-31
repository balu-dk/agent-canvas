import {
  getAgentServerTransport,
  getLauncherAgentServerSessionApiKey,
} from "../agent-server-config";
import { DEFAULT_LOCAL_BACKEND_ID } from "./default-backend";
import type { Backend } from "./types";

function isSameOriginAgentServer(backend: Backend): boolean {
  if (backend.kind !== "agent-server") return false;
  if (backend.agentServerTransport) {
    return backend.agentServerTransport === "same-origin";
  }

  return (
    backend.id === DEFAULT_LOCAL_BACKEND_ID &&
    getAgentServerTransport() === "same-origin"
  );
}

export function getBackendSessionApiKey(backend: Backend): string | null {
  if (backend.kind !== "agent-server") return null;

  if (isSameOriginAgentServer(backend)) {
    return getLauncherAgentServerSessionApiKey();
  }

  return backend.apiKey?.trim() || null;
}

/**
 * Build the auth headers to send to a backend.
 *
 * Agent-server backends use `X-Session-API-Key`. Cloud expects a bearer token
 * in the `Authorization` header.
 */
export function buildAuthHeaders(backend: Backend): Record<string, string> {
  if (backend.kind === "cloud") {
    return backend.apiKey ? { Authorization: `Bearer ${backend.apiKey}` } : {};
  }

  const sessionApiKey = getBackendSessionApiKey(backend);
  return sessionApiKey ? { "X-Session-API-Key": sessionApiKey } : {};
}
