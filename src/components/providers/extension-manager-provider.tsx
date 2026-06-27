import React from "react";
import { ExtensionManager } from "#/extensions/extension-manager";
import { createAppHostDeps } from "#/extensions/host/create-app-host-deps";
import { createHttpBundleSource } from "#/extensions/dev-bundle-source";
import { useExtensionPanelStore } from "#/extensions/panel-store";
import {
  useInstalledExtensionsStore,
  type InstalledExtension,
  type InstalledExtensionOrigin,
  type ManifestPreview,
} from "#/extensions/installed-store";
import {
  addPersistedInstall,
  loadPersistedInstalls,
  removePersistedInstall,
} from "#/extensions/installed-persistence";
import { parseManifest, type ExtensionManifest } from "#/extensions/manifest";
import {
  githubUrlPath,
  githubUrlToSource,
  rawGithubUrl,
} from "#/extensions/marketplace/source";
import {
  fetchMarketplace,
  type MarketplaceResult,
} from "#/extensions/marketplace/client";
import {
  DEV_EXTENSION_BUNDLE_URLS,
  EXTENSIONS_ENABLED,
} from "#/extensions/feature-flag";
import type { HostApiDeps } from "#/extensions/host/host-api";

interface ExtensionContextValue {
  manager: ExtensionManager;
  deps: HostApiDeps;
  /** Fetch + validate a bundle manifest to show its requested permissions (consent). */
  previewManifest: (
    url: string,
    manifestPath?: string,
  ) => Promise<ManifestPreview>;
  /** Install a bundle from a URL and record it as a persisted user install. */
  installFromUrl: (
    url: string,
    manifestPath?: string,
  ) => Promise<InstalledExtension>;
  /** Load a plugin marketplace (git repo or URL) and list its UI extensions. */
  fetchMarketplace: (source: string) => Promise<MarketplaceResult>;
  /** Remove an extension and forget any persisted user install. */
  uninstall: (id: string) => void;
}

/** Convert a github.com folder/tree URL to a raw bundle base; pass other inputs through. */
function resolveBundleUrl(input: string): string {
  const trimmed = input.trim();
  const github = githubUrlToSource(trimmed);
  if (github) return rawGithubUrl(github, githubUrlPath(trimmed) ?? "");
  return trimmed;
}

const ExtensionContext = React.createContext<ExtensionContextValue | null>(
  null,
);

/** Access the extension manager/deps; null when the feature is disabled. */
export function useExtensionContext(): ExtensionContextValue | null {
  return React.useContext(ExtensionContext);
}

function toInstalledExtension(
  manifest: ExtensionManifest,
  sourceUrl: string,
  origin: InstalledExtensionOrigin,
  manifestPath?: string,
): InstalledExtension {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    publisher: manifest.publisher,
    capabilities: manifest.capabilities ?? [],
    sourceUrl,
    manifestPath,
    origin,
  };
}

function ExtensionManagerProviderInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const deps = React.useMemo(() => createAppHostDeps(), []);

  const managerRef = React.useRef<ExtensionManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = new ExtensionManager(deps, undefined, {
      onOpenView: (extensionId, viewId) =>
        useExtensionPanelStore.getState().openView(extensionId, viewId),
    });
  }
  const manager = managerRef.current;

  const previewManifest = React.useCallback(
    async (url: string, manifestPath?: string): Promise<ManifestPreview> => {
      const raw = await createHttpBundleSource(
        resolveBundleUrl(url),
        manifestPath,
      ).readManifest();
      const parsed = parseManifest(raw);
      if (!parsed.ok) {
        throw new Error(parsed.errors.join("; "));
      }
      const { manifest } = parsed;
      return {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        publisher: manifest.publisher,
        capabilities: manifest.capabilities ?? [],
      };
    },
    [],
  );

  const installFromUrl = React.useCallback(
    async (url: string, manifestPath?: string): Promise<InstalledExtension> => {
      const baseUrl = resolveBundleUrl(url);
      const result = await manager.install(
        createHttpBundleSource(baseUrl, manifestPath),
      );
      if (!result.ok) {
        throw new Error(result.errors.join("; "));
      }
      const extension = toInstalledExtension(
        result.manifest,
        baseUrl,
        "user",
        manifestPath,
      );
      useInstalledExtensionsStore.getState().add(extension);
      addPersistedInstall({
        id: extension.id,
        sourceUrl: extension.sourceUrl,
        capabilities: extension.capabilities,
        manifestPath,
      });
      return extension;
    },
    [manager],
  );

  const uninstall = React.useCallback(
    (id: string): void => {
      manager.uninstall(id);
      useInstalledExtensionsStore.getState().remove(id);
      removePersistedInstall(id);
      const panel = useExtensionPanelStore.getState();
      if (panel.activeExtensionId === id) panel.close();
    },
    [manager],
  );

  React.useEffect(() => {
    let cancelled = false;
    const store = useInstalledExtensionsStore.getState();

    const installFrom = async (
      url: string,
      origin: InstalledExtensionOrigin,
      manifestPath?: string,
    ) => {
      const result = await manager.install(
        createHttpBundleSource(url, manifestPath),
      );
      if (cancelled) return;
      if (result.ok) {
        store.add(
          toInstalledExtension(result.manifest, url, origin, manifestPath),
        );
      } else {
        console.warn(`[extensions] failed to install ${url}:`, result.errors);
      }
    };

    (async () => {
      for (const url of DEV_EXTENSION_BUNDLE_URLS) {
        await installFrom(url, "dev");
      }
      for (const persisted of loadPersistedInstalls()) {
        await installFrom(persisted.sourceUrl, "user", persisted.manifestPath);
      }
    })();

    return () => {
      cancelled = true;
      useInstalledExtensionsStore
        .getState()
        .installed.forEach((e) => manager.uninstall(e.id));
      useInstalledExtensionsStore.getState().clear();
      manager.host.disposeAll();
      useExtensionPanelStore.getState().close();
    };
  }, [manager]);

  const loadMarketplace = React.useCallback(
    (source: string) => fetchMarketplace(source),
    [],
  );

  const value = React.useMemo(
    () => ({
      manager,
      deps,
      previewManifest,
      installFromUrl,
      fetchMarketplace: loadMarketplace,
      uninstall,
    }),
    [
      manager,
      deps,
      previewManifest,
      installFromUrl,
      loadMarketplace,
      uninstall,
    ],
  );

  return (
    <ExtensionContext.Provider value={value}>
      {children}
    </ExtensionContext.Provider>
  );
}

/**
 * Instantiates a single {@link ExtensionManager} at app startup (wired to live host
 * dependencies), auto-installs the configured dev bundles, and exposes both via
 * context. A no-op pass-through when the feature flag is off, so the app is unchanged
 * unless `VITE_ENABLE_EXTENSIONS=true`.
 */
export function ExtensionManagerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!EXTENSIONS_ENABLED) {
    return <>{children}</>;
  }
  return (
    <ExtensionManagerProviderInner>{children}</ExtensionManagerProviderInner>
  );
}
