import { create } from "zustand";
import type {
  ActivityBarItem,
  CommandItem,
  ExtensionContributions,
  ViewItem,
} from "./types";

/**
 * Central, in-memory registry of UI contributions from enabled extensions.
 *
 * This is the heart of the extension system: enabled extensions register their
 * (already validated and resolved) contributions here, and host UI — the sidebar
 * rail, the command menu, panel containers — subscribes to render them. It is the
 * frontend analog of VS Code's contribution registry.
 *
 * Contributions are keyed by `extensionId` so disabling/uninstalling an extension is
 * an atomic `unregister(extensionId)` that removes every surface it added.
 *
 * Implemented with zustand (the project's store convention). The flattened
 * `activityBarItems` / `commands` / `views` arrays are derived once per mutation and
 * stored alongside the source map, so component selectors return **stable references**
 * between mutations — essential to avoid `useSyncExternalStore` re-render loops.
 */
interface ContributionRegistryState {
  /** Resolved contributions, grouped by owning extension id (source of truth). */
  byExtension: Record<string, ExtensionContributions>;
  /** Derived flat list of all activity-bar items, in extension insertion order. */
  activityBarItems: ActivityBarItem[];
  /** Derived flat list of all contributed commands. */
  commands: CommandItem[];
  /** Derived flat list of all contributed views. */
  views: ViewItem[];

  /** Register (or replace) all contributions for an extension. */
  register: (
    extensionId: string,
    contributions: ExtensionContributions,
  ) => void;
  /** Remove every contribution owned by an extension. No-op if unknown. */
  unregister: (extensionId: string) => void;
  /** Remove all contributions (primarily for tests/teardown). */
  clear: () => void;
}

function flatten<T>(
  byExtension: Record<string, ExtensionContributions>,
  pick: (contributions: ExtensionContributions) => T[] | undefined,
): T[] {
  return Object.values(byExtension).flatMap((c) => pick(c) ?? []);
}

function derive(byExtension: Record<string, ExtensionContributions>) {
  return {
    byExtension,
    activityBarItems: flatten(byExtension, (c) => c.activityBarItems),
    commands: flatten(byExtension, (c) => c.commands),
    views: flatten(byExtension, (c) => c.views),
  };
}

export const useContributionRegistry = create<ContributionRegistryState>(
  (set) => ({
    byExtension: {},
    activityBarItems: [],
    commands: [],
    views: [],

    register: (extensionId, contributions) =>
      set((state) =>
        derive({ ...state.byExtension, [extensionId]: contributions }),
      ),

    unregister: (extensionId) =>
      set((state) => {
        if (!(extensionId in state.byExtension)) {
          return state;
        }
        const next = { ...state.byExtension };
        delete next[extensionId];
        return derive(next);
      }),

    clear: () => set(derive({})),
  }),
);

export function selectActivityBarItems(
  state: ContributionRegistryState,
): ActivityBarItem[] {
  return state.activityBarItems;
}

export function selectCommands(
  state: ContributionRegistryState,
): CommandItem[] {
  return state.commands;
}

export function selectViews(state: ContributionRegistryState): ViewItem[] {
  return state.views;
}

/**
 * Non-reactive accessors for use outside React (loader, extension host, tests).
 * Components should prefer the hooks in `use-contributions.ts`.
 */
export const contributionRegistry = {
  register: (extensionId: string, contributions: ExtensionContributions) =>
    useContributionRegistry.getState().register(extensionId, contributions),
  unregister: (extensionId: string) =>
    useContributionRegistry.getState().unregister(extensionId),
  clear: () => useContributionRegistry.getState().clear(),
  getActivityBarItems: () =>
    useContributionRegistry.getState().activityBarItems,
  getCommands: () => useContributionRegistry.getState().commands,
  getViews: () => useContributionRegistry.getState().views,
  /** Resolve a single contributed view by id (used by the webview host). */
  getView: (viewId: string): ViewItem | undefined =>
    useContributionRegistry.getState().views.find((v) => v.id === viewId),
};
