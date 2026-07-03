import { getActiveBackend } from "#/api/backend-registry/active-store";
import SettingsService from "#/api/settings-service/settings-service.api";

const STORAGE_KEY = "openhands-agent-profiles";

// Fired whenever profiles change (local write or server load) so subscribed
// surfaces re-read. Canonical here; re-exported from hooks/use-agent-profiles.
export const AGENT_PROFILES_CHANGED_EVENT = "openhands-agent-profiles-changed";

export const notifyAgentProfilesChanged = (): void => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(AGENT_PROFILES_CHANGED_EVENT));
  }
};

/**
 * A named agent configuration: engine + provider + credential.
 *
 * Profiles let the user keep several agent setups side by side (e.g. two
 * Claude Code profiles with different OAuth tokens, a Codex profile, and an
 * OpenHands profile) and pick one per conversation, instead of overwriting
 * the single global Settings → Agent configuration each time.
 *
 * The model is deliberately NOT part of a profile — it stays a free choice
 * in the chat input (the existing model dropdown). OpenHands profiles carry
 * no credential either: the LLM key rides the existing LLM settings/profiles.
 *
 * Stored client-side in localStorage, scoped per backend id (same pattern as
 * the backend registry and conversation metadata store) since the referenced
 * credential secrets live on that backend.
 */
export interface AgentProfile {
  id: string;
  /** Display name, e.g. "Claude Code (privat)". */
  name: string;
  /** "openhands", an ACP provider registry key, or "custom". */
  engine: string;
  /** Custom/overridden ACP launch command tokens (custom preset only). */
  command?: string[] | null;
  /**
   * The canonical credential env var this profile authenticates through
   * (e.g. "CLAUDE_CODE_OAUTH_TOKEN" or "OPENAI_API_KEY"), picked from the
   * provider's credential fields. Only meaningful together with
   * {@link credentialSecretName}.
   */
  credentialEnvVar?: string | null;
  /**
   * Name of a stored custom secret to inject as {@link credentialEnvVar} at
   * conversation start (credential aliasing). Null = use the plain
   * same-name secret (today's behavior).
   */
  credentialSecretName?: string | null;
}

/**
 * The credential alias map a profile contributes to conversation start:
 * env var name → stored secret name. Empty when the profile has no
 * dedicated credential (OpenHands profiles, or "use the global secret").
 */
export const getProfileCredentialAliases = (
  profile: AgentProfile | null | undefined,
): Record<string, string> => {
  if (!profile?.credentialEnvVar || !profile?.credentialSecretName) return {};
  if (profile.credentialEnvVar === profile.credentialSecretName) return {};
  return { [profile.credentialEnvVar]: profile.credentialSecretName };
};

interface BackendProfiles {
  profiles: AgentProfile[];
  defaultProfileId: string | null;
}

type StoredProfiles = Record<string, BackendProfiles>;

const readAll = (): StoredProfiles => {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as StoredProfiles;
  } catch {
    return {};
  }
};

const writeAll = (next: StoredProfiles): void => {
  if (typeof window === "undefined") return;
  if (Object.keys(next).length === 0) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
};

const activeBackendId = (): string => getActiveBackend().backend.id;

const readBackend = (backendId: string): BackendProfiles =>
  readAll()[backendId] ?? { profiles: [], defaultProfileId: null };

// Best-effort write-through to the server (misc_settings.agent_profiles) so
// profiles sync across browsers/devices. Fire-and-forget: the localStorage
// cache is the sync source for the UI, and a failed server write (offline,
// old agent-server, cloud) never blocks the local change.
const persistToServer = (backendId: string): void => {
  if (getActiveBackend().backend.id !== backendId) return;
  const data = readBackend(backendId);
  void SettingsService.saveMiscAgentProfiles({
    profiles: data.profiles,
    default_profile_id: data.defaultProfileId,
  }).catch((error) => {
    console.warn("agent-profiles: server persist failed", error);
  });
};

const writeBackend = (
  backendId: string,
  data: BackendProfiles,
  opts: { persist?: boolean; notify?: boolean } = {},
): void => {
  const all = readAll();
  if (data.profiles.length === 0 && data.defaultProfileId === null) {
    delete all[backendId];
  } else {
    all[backendId] = data;
  }
  writeAll(all);
  if (opts.persist !== false) persistToServer(backendId);
  if (opts.notify !== false) notifyAgentProfilesChanged();
};

// Track which backends we've already hydrated from the server this session so
// the load only runs once per backend (until a reload).
const hydratedBackends = new Set<string>();

/**
 * Hydrate the active backend's profiles from the server
 * (misc_settings.agent_profiles), making localStorage a cache of the
 * server-side source of truth. On a fresh browser this restores your saved
 * profiles; on an existing browser whose profiles predate server storage, it
 * migrates them up to the server once (so they start syncing).
 */
export const loadAgentProfilesFromServer = async (
  force = false,
): Promise<void> => {
  const backendId = activeBackendId();
  if (!force && hydratedBackends.has(backendId)) return;
  hydratedBackends.add(backendId);

  const serverVal = await SettingsService.getMiscAgentProfiles();
  const local = readBackend(backendId);

  if (serverVal && Array.isArray(serverVal.profiles)) {
    // Server is the source of truth — mirror it into the local cache.
    writeBackend(
      backendId,
      {
        profiles: serverVal.profiles as AgentProfile[],
        defaultProfileId: serverVal.default_profile_id ?? null,
      },
      { persist: false },
    );
  } else if (local.profiles.length > 0) {
    // Server has nothing yet but this browser has profiles → seed the server
    // once (migration). Keep the local copy as-is.
    persistToServer(backendId);
  }
};

/** All profiles for the active backend, in insertion order. */
export const getAgentProfiles = (): AgentProfile[] =>
  readBackend(activeBackendId()).profiles;

export const getAgentProfile = (id: string): AgentProfile | null =>
  getAgentProfiles().find((profile) => profile.id === id) ?? null;

/** Create or update (by id) a profile on the active backend. */
export const saveAgentProfile = (profile: AgentProfile): void => {
  const backendId = activeBackendId();
  const data = readBackend(backendId);
  const index = data.profiles.findIndex((p) => p.id === profile.id);
  if (index >= 0) {
    data.profiles[index] = profile;
  } else {
    data.profiles.push(profile);
  }
  writeBackend(backendId, data);
};

export const deleteAgentProfile = (id: string): void => {
  const backendId = activeBackendId();
  const data = readBackend(backendId);
  data.profiles = data.profiles.filter((p) => p.id !== id);
  if (data.defaultProfileId === id) {
    data.defaultProfileId = data.profiles[0]?.id ?? null;
  }
  writeBackend(backendId, data);
};

/**
 * The profile new conversations use when the user doesn't pick one. When no
 * default is explicitly marked, falls back to the first profile so a profile
 * is always in effect — profiles are the only agent concept, there is no
 * "global settings" fallback. Null only when the backend has no profiles.
 */
export const getDefaultAgentProfile = (): AgentProfile | null => {
  const data = readBackend(activeBackendId());
  const marked = data.defaultProfileId
    ? data.profiles.find((p) => p.id === data.defaultProfileId)
    : null;
  return marked ?? data.profiles[0] ?? null;
};

export const setDefaultAgentProfile = (id: string | null): void => {
  const backendId = activeBackendId();
  const data = readBackend(backendId);
  data.defaultProfileId =
    id !== null && data.profiles.some((p) => p.id === id) ? id : null;
  writeBackend(backendId, data);
};
