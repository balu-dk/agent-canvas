import { useSyncExternalStore } from "react";
import {
  getAgentProfiles,
  getDefaultAgentProfile,
  type AgentProfile,
} from "#/api/agent-profile-store";
import { useAgentProfileSelectionStore } from "#/stores/agent-profile-selection-store";

// localStorage-backed store subscription: re-read profiles when another
// surface (e.g. the Settings → Agent manager) mutates them in this tab.
const PROFILES_CHANGED_EVENT = "openhands-agent-profiles-changed";

export const notifyAgentProfilesChanged = (): void => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PROFILES_CHANGED_EVENT));
  }
};

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

/** Reactive list of the active backend's agent profiles. */
export function useAgentProfiles(): AgentProfile[] {
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
