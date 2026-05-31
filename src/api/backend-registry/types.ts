export type BackendKind = "agent-server" | "cloud";
export type AgentServerTransport = "same-origin" | "remote";
export type BackendConnectionKind = AgentServerTransport | "cloud";

export interface Backend {
  id: string;
  name: string;
  host: string;
  apiKey: string;
  kind: BackendKind;
  agentServerTransport?: AgentServerTransport;
}

type BackendBaseUrlInput = Pick<
  Backend,
  "host" | "kind" | "agentServerTransport"
>;

export function getBackendConnectionKind(
  backend: Backend,
): BackendConnectionKind {
  if (backend.kind === "cloud") return "cloud";
  return backend.agentServerTransport ?? "remote";
}

export function getBackendBaseUrl(backend: BackendBaseUrlInput): string {
  if (
    backend.kind === "agent-server" &&
    backend.agentServerTransport === "same-origin" &&
    typeof window !== "undefined"
  ) {
    return window.location.origin;
  }

  return backend.host;
}

export interface BackendSelection {
  backendId: string;
  orgId?: string | null;
}

export interface ResolvedActiveBackend {
  backend: Backend;
  orgId: string | null;
}
