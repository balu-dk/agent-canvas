import { getActiveBackend } from "#/api/backend-registry/active-store";

const STORAGE_KEY = "openhands-agent-profiles";

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

const writeBackend = (backendId: string, data: BackendProfiles): void => {
  const all = readAll();
  if (data.profiles.length === 0 && data.defaultProfileId === null) {
    delete all[backendId];
  } else {
    all[backendId] = data;
  }
  writeAll(all);
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
 * The profile new conversations use when the user doesn't pick one.
 * Null = no default; conversations follow the global Settings → Agent
 * configuration exactly as before profiles existed.
 */
export const getDefaultAgentProfile = (): AgentProfile | null => {
  const data = readBackend(activeBackendId());
  if (!data.defaultProfileId) return null;
  return data.profiles.find((p) => p.id === data.defaultProfileId) ?? null;
};

export const setDefaultAgentProfile = (id: string | null): void => {
  const backendId = activeBackendId();
  const data = readBackend(backendId);
  data.defaultProfileId =
    id !== null && data.profiles.some((p) => p.id === id) ? id : null;
  writeBackend(backendId, data);
};
