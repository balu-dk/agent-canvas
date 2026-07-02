import { create } from "zustand";

/**
 * The agent profile the user picked for the NEXT conversation (home-page
 * chat input). Distinct from the profile store itself: this is transient
 * per-tab UI state, cleared after a conversation is created.
 *
 * - `undefined` — no explicit choice; conversation creation falls back to
 *   the backend's default agent profile (if any).
 * - `null` — explicitly follow the global Settings → Agent configuration.
 * - `string` — id of the selected profile.
 *
 * `pendingModel` is the model picked in the chat input for the NEXT
 * conversation while a profile is in effect (null = the profile engine's
 * preferred default). It rides the profile's agent-settings diff at start
 * instead of mutating global settings, and resets when the profile
 * selection changes (models are engine-specific).
 */
interface AgentProfileSelectionState {
  selection: string | null | undefined;
  pendingModel: string | null;
  setSelection: (selection: string | null | undefined) => void;
  setPendingModel: (model: string | null) => void;
  clearSelection: () => void;
}

export const useAgentProfileSelectionStore = create<AgentProfileSelectionState>(
  (set) => ({
    selection: undefined,
    pendingModel: null,
    setSelection: (selection) => set({ selection, pendingModel: null }),
    setPendingModel: (pendingModel) => set({ pendingModel }),
    clearSelection: () => set({ selection: undefined, pendingModel: null }),
  }),
);
