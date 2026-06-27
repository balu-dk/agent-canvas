import type { BundleSource } from "./loader";

/**
 * A {@link BundleSource} backed by HTTP, used in development to load example bundles
 * served by the Vite dev middleware (see `vite.config.ts`). `baseUrl` points at the
 * directory exposing the bundle's `extension.json` and assets, e.g.
 * `"/__extensions/hello-sidebar"`.
 */
export function createHttpBundleSource(
  baseUrl: string,
  manifestPath = "extension.json",
): BundleSource {
  const root = baseUrl.replace(/\/$/, "");
  const manifest = manifestPath.replace(/^\//, "");
  return {
    readManifest: async () => {
      const response = await fetch(`${root}/${manifest}`);
      if (!response.ok) {
        throw new Error(
          `failed to fetch ${root}/${manifest}: HTTP ${response.status}`,
        );
      }
      return response.json();
    },
    assetUrl: async (path) => `${root}/${path.replace(/^\//, "")}`,
  };
}
