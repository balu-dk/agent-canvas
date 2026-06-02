import type { Backend } from "#/api/backend-registry/types";

export const localProxyBackend: Backend = {
  id: "local-proxy",
  name: "Local proxy",
  host: "http://localhost:3000",
  apiKey: "local-session-key",
  kind: "local",
};
