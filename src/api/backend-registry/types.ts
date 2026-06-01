export type BackendKind = "local" | "cloud" | "k8s";

export interface Backend {
  id: string;
  name: string;
  host: string;
  apiKey: string;
  kind: BackendKind;
}

export interface BackendSelection {
  backendId: string;
  orgId?: string | null;
}

export interface ResolvedActiveBackend {
  backend: Backend;
  orgId: string | null;
}
