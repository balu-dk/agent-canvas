import { create } from "zustand";
import type { Capability } from "./manifest";

/** How an installed extension entered the inventory. */
export type InstalledExtensionOrigin = "dev" | "user";

/** A record of one installed extension, surfaced by the management UI. */
export interface InstalledExtension {
  id: string;
  name: string;
  version: string;
  publisher?: string;
  /** Capabilities the user granted at install time (currently == requested). */
  capabilities: Capability[];
  /** Bundle base URL the extension was installed from. */
  sourceUrl: string;
  /**
   * `dev` entries come from `DEV_EXTENSION_BUNDLE_URLS` (config, not persisted);
   * `user` entries were installed via the UI and persist across reloads.
   */
  origin: InstalledExtensionOrigin;
}

/** Manifest metadata shown to the user for consent before an install proceeds. */
export interface ManifestPreview {
  id: string;
  name: string;
  version: string;
  publisher?: string;
  capabilities: Capability[];
}

interface InstalledExtensionsState {
  installed: InstalledExtension[];
  /** Insert or replace (by id) an installed extension. */
  add: (extension: InstalledExtension) => void;
  remove: (id: string) => void;
  clear: () => void;
}

/**
 * Reactive inventory of installed extensions. Unlike plugins (backed by a server),
 * UI extensions live entirely client-side, so this store — populated by
 * `ExtensionManagerProvider` — is the source of truth the management UI renders.
 */
export const useInstalledExtensionsStore = create<InstalledExtensionsState>(
  (set) => ({
    installed: [],
    add: (extension) =>
      set((state) => ({
        installed: [
          ...state.installed.filter((e) => e.id !== extension.id),
          extension,
        ],
      })),
    remove: (id) =>
      set((state) => ({
        installed: state.installed.filter((e) => e.id !== id),
      })),
    clear: () => set({ installed: [] }),
  }),
);
