import { useEffect, useSyncExternalStore } from "react";
import {
  getAgentProfiles,
  getDefaultAgentProfile,
  loadAgentProfilesFromServer,
  notifyAgentProfilesChanged,
  AGENT_PROFILES_CHANGED_EVENT as PROFILES_CHANGED_EVENT,
  type AgentProfile,
} from "#/api/agent-profile-store";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useAgentProfileSelectionStore } from "#/stores/agent-profile-selection-store";

// Re-exported for existing importers (e.g. the Settings → Agent manager).
export { notifyAgentProfilesChanged };

const subscribeToProfiles = (onStoreChange: () => void): (() => void) => {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PROFILES_CHANGED_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(PROFILES_CHANGED_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
};

let profilesSnapshotCache: { raw: string; value: AgentProfile[] } | null = null;

const getProfilesSnapshot = (): AgentProfile[] => {
  const profiles = getAgentProfiles();
  const raw = JSON.stringify(profiles);
  if (profilesSnapshotCache?.raw !== raw) {
    profilesSnapshotCache = { raw, value: profiles };
  }
  return profilesSnapshotCache.value;
};

/**
 * Reactive list of the active backend's agent profiles. Hydrates from the
 * server (misc_settings.agent_profiles) once per backend so profiles saved in
 * another browser/device show up here, and local-only profiles migrate up.
 */
export function useAgentProfiles(): AgentProfile[] {
  const { backend } = useActiveBackend();
  useEffect(() => {
    void loadAgentProfilesFromServer();
  }, [backend.id]);
  return useSyncExternalStore(
    subscribeToProfiles,
    getProfilesSnapshot,
    () => [],
  );
}

/**
 * The agent profile the NEXT conversation will run on, resolved the same
 * way conversation creation resolves it: explicit picker selection →
 * the backend's default profile. `null` means "follow the global
 * Settings → Agent configuration" (explicitly picked, or no profiles /
 * no default exist).
 *
 * Consumed by the chat-input model affordance so the model list follows
 * the picked profile's engine rather than the global settings.
 */
export function useEffectivePendingAgentProfile(): AgentProfile | null {
  const profiles = useAgentProfiles();
  const selection = useAgentProfileSelectionStore((state) => state.selection);

  if (selection === null) return null;
  if (typeof selection === "string") {
    return (
      profiles.find((profile) => profile.id === selection) ??
      getDefaultAgentProfile()
    );
  }
  return getDefaultAgentProfile();
}
