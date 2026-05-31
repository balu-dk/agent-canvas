import {
  getAgentServerBaseUrl,
  getAgentServerSessionApiKey,
  getAgentServerTransport,
} from "../agent-server-config";
import type { Backend } from "./types";

/**
 * Stable id for the package-provided agent-server backend that is seeded into
 * the registry on a fresh install. After seeding, this backend is a normal
 * registered entry — the user can rename it, edit its host/api key, or remove
 * it like any other backend.
 *
 * The id is also used by `saveAgentServerConfig` to keep the registry
 * entry in sync with the legacy `openhands-agent-server-config` storage
 * that the recovery / agent-server settings page edits.
 */
export const DEFAULT_LOCAL_BACKEND_ID = "default-local";

export const DEFAULT_LOCAL_BACKEND_NAME = "Local";

/**
 * Construct the package-provided agent-server backend from environment
 * config (`VITE_AGENT_SERVER_TRANSPORT`, `VITE_SESSION_API_KEY`, plus the
 * `openhands-agent-server-config` localStorage overrides).
 *
 * Used in two places:
 *   1. As the seed entry written to `openhands-backends` on first load.
 *   2. As a last-resort fallback inside the active store when the
 *      registry has no agent-server backend at all (e.g. the user removed
 *      every entry). The synthetic fallback is never persisted.
 */
export function makeDefaultLocalBackend(): Backend {
  return {
    id: DEFAULT_LOCAL_BACKEND_ID,
    name: DEFAULT_LOCAL_BACKEND_NAME,
    host: getAgentServerBaseUrl(),
    apiKey: getAgentServerSessionApiKey() ?? "",
    kind: "agent-server",
    agentServerTransport: getAgentServerTransport(),
  };
}
