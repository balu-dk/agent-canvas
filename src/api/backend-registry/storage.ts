import { makeDefaultLocalBackend } from "./default-backend";
import { hasConfiguredAgentServerDefaults } from "../agent-server-config";
import type {
  AgentServerTransport,
  Backend,
  BackendKind,
  BackendSelection,
} from "./types";

export const BACKENDS_STORAGE_KEY = "openhands-backends";
export const ACTIVE_BACKEND_STORAGE_KEY = "openhands-active-backend";

function normalizeBackendKind(value: unknown): BackendKind | null {
  if (value === "agent-server" || value === "cloud") return value;
  if (value === "local") return "agent-server";
  return null;
}

function normalizeAgentServerTransport(
  value: unknown,
): AgentServerTransport | null {
  if (value === "same-origin" || value === "remote") return value;
  if (value === "packaged") return "same-origin";
  if (value === "separate") return "remote";
  return null;
}

function normalizeBackend(value: unknown): Backend | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Partial<Backend>;
  const rawKind = (value as { kind?: unknown }).kind;
  const rawAgentServerTransport = (
    value as {
      agentServerTransport?: unknown;
      agentServerSource?: unknown;
    }
  ).agentServerTransport;
  const rawAgentServerSource = (value as { agentServerSource?: unknown })
    .agentServerSource;
  if (
    typeof v.id === "string" &&
    v.id.length > 0 &&
    typeof v.name === "string" &&
    typeof v.host === "string" &&
    typeof v.apiKey === "string" &&
    normalizeBackendKind(rawKind)
  ) {
    const kind = normalizeBackendKind(rawKind);
    if (!kind) return null;
    const agentServerTransport =
      kind === "agent-server"
        ? normalizeAgentServerTransport(
            rawAgentServerTransport ?? rawAgentServerSource,
          )
        : undefined;

    return {
      id: v.id,
      name: v.name,
      host: v.host,
      apiKey: v.apiKey,
      kind,
      ...(agentServerTransport ? { agentServerTransport } : {}),
    };
  }

  return null;
}

export function writeStoredBackends(backends: Backend[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BACKENDS_STORAGE_KEY, JSON.stringify(backends));
  } catch {
    /* ignore quota / serialization errors */
  }
}

export function readStoredBackends(): Backend[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BACKENDS_STORAGE_KEY);

    // First install: only seed a package-provided agent-server backend when
    // deployment config actually provided backend defaults. Frontend-only dev
    // should start with an empty registry so no backend looks preconfigured.
    if (raw === null) {
      if (!hasConfiguredAgentServerDefaults()) return [];
      const seeded = [makeDefaultLocalBackend()];
      writeStoredBackends(seeded);
      return seeded;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const valid = parsed
      .map(normalizeBackend)
      .filter((backend): backend is Backend => backend !== null);

    // If the stored array is empty (or everything in it failed validation),
    // re-seed only when deployment config provided backend defaults.
    if (valid.length === 0) {
      if (!hasConfiguredAgentServerDefaults()) return [];
      const seeded = [makeDefaultLocalBackend()];
      writeStoredBackends(seeded);
      return seeded;
    }

    return valid;
  } catch {
    return [];
  }
}

export function readStoredActiveBackend(): BackendSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_BACKEND_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as BackendSelection).backendId !== "string"
    ) {
      return null;
    }
    const orgIdRaw = (parsed as BackendSelection).orgId;
    return {
      backendId: (parsed as BackendSelection).backendId,
      orgId:
        typeof orgIdRaw === "string" && orgIdRaw.length > 0 ? orgIdRaw : null,
    };
  } catch {
    return null;
  }
}

export function writeStoredActiveBackend(
  selection: BackendSelection | null,
): void {
  if (typeof window === "undefined") return;
  try {
    if (!selection) {
      window.localStorage.removeItem(ACTIVE_BACKEND_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      ACTIVE_BACKEND_STORAGE_KEY,
      JSON.stringify({
        backendId: selection.backendId,
        orgId: selection.orgId ?? null,
      }),
    );
  } catch {
    /* ignore */
  }
}
