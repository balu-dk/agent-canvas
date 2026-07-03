import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Persisted memory for ACP model choices, so a model the user typed once does
 * not have to be re-entered every session.
 *
 * The provider's built-in model list (from the typescript-client ACP registry)
 * is often stale — newer models (e.g. a just-released Claude/Fable model) are
 * missing. The chat-input picker lets the user enter a custom model id; this
 * store remembers those ids AND the last-used model, keyed per backend+engine:
 *
 * - `customModels` — ids the user typed, surfaced as permanent picker options.
 * - `lastModel` — the most recent pick, used to default the NEXT session's
 *   model (in pending-profile mode, where nothing else persists it).
 *
 * Keyed by backend AND engine because a model id is engine-specific (a Codex id
 * is meaningless on Claude Code) and the referenced backend owns the runtime.
 */
const keyFor = (backendId: string, engine: string): string =>
  `${backendId}::${engine}`;

interface AcpModelMemoryState {
  /** (backendId::engine) → user-entered custom model ids (most-recent last). */
  customModels: Record<string, string[]>;
  /** (backendId::engine) → last selected model id. */
  lastModel: Record<string, string>;
  addCustomModel: (backendId: string, engine: string, modelId: string) => void;
  removeCustomModel: (
    backendId: string,
    engine: string,
    modelId: string,
  ) => void;
  recordLastModel: (backendId: string, engine: string, modelId: string) => void;
}

export const useAcpModelMemoryStore = create<AcpModelMemoryState>()(
  persist(
    (set) => ({
      customModels: {},
      lastModel: {},
      addCustomModel: (backendId, engine, modelId) =>
        set((state) => {
          const key = keyFor(backendId, engine);
          const existing = state.customModels[key] ?? [];
          if (existing.includes(modelId)) return state;
          return {
            customModels: {
              ...state.customModels,
              [key]: [...existing, modelId],
            },
          };
        }),
      removeCustomModel: (backendId, engine, modelId) =>
        set((state) => {
          const key = keyFor(backendId, engine);
          const existing = state.customModels[key] ?? [];
          if (!existing.includes(modelId)) return state;
          return {
            customModels: {
              ...state.customModels,
              [key]: existing.filter((id) => id !== modelId),
            },
          };
        }),
      recordLastModel: (backendId, engine, modelId) =>
        set((state) => ({
          lastModel: {
            ...state.lastModel,
            [keyFor(backendId, engine)]: modelId,
          },
        })),
    }),
    { name: "openhands-acp-model-memory" },
  ),
);

/** Non-reactive read for imperative call sites (e.g. conversation start). */
export const getCustomAcpModels = (
  backendId: string,
  engine: string,
): string[] =>
  useAcpModelMemoryStore.getState().customModels[keyFor(backendId, engine)] ??
  [];

/** Non-reactive read of the last-used model for (backend, engine). */
export const getLastAcpModel = (
  backendId: string,
  engine: string,
): string | null =>
  useAcpModelMemoryStore.getState().lastModel[keyFor(backendId, engine)] ??
  null;
