# Source Resolution Updates for GitHub Extensions

**Status:** Proposed  
**Component:** `src/extensions/sources/`  
**Related:** GitHub API Resolver, Asset Relay System  
**Priority:** Medium — Ties the other two issues together

---

## Problem Statement

The current source resolution pipeline for `gh:` extensions has a tight coupling to jsDelivr:

```
parseSourceRef ──▶ resolveSourceRef ──▶ jsDelivr API ──▶ CDN URL ──▶ Direct HTTP Load
```

This creates several issues:

1. **Single Point of Failure** — jsDelivr outage = no extension installs
2. **CDN-Specific URL Format** — `baseUrl` is a jsDelivr URL, not abstractable
3. **Direct Loading** — Webviews try to fetch directly, hitting CSP errors
4. **No Relay Integration** — No seam to route through the asset relay

We need to update the resolution flow to support the postMessage relay:

```
parseSourceRef ──▶ resolveSourceRef ──▶ GitHub API ──▶ Relay Source Ref ──▶ Asset Relay
```

---

## Proposed Solution

Refactor the source resolution to:

1. **Decouple version resolution from CDN** — Use GitHub API for `gh:`, keep jsDelivr for `npm:`
2. **Return relay-compatible descriptors** — `baseUrl` becomes a source ref for the asset loader
3. **Create appropriate BundleSource** — Factory that returns relay or direct sources
4. **Maintain backward compatibility** — Existing `npm:` and `url:` sources continue working

### Updated Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ parseSourceRef  │ ──▶ │ resolveSourceRef │ ──▶ │ ArtifactDescriptor  │
│ (unchanged)     │     │ (uses GitHub API)│     │ (with resolved SHA) │
└─────────────────┘     └──────────────────┘     └─────────────────────┘
                               │                          │
                               ▼                          ▼
                        ┌──────────────┐          ┌─────────────────┐
                        │ GitHub API   │          │ toBundleSource  │
                        │ Resolver     │          │ (updated)       │
                        └──────────────┘          └─────────────────┘
                                                          │
                                                          ▼
                                                  ┌─────────────────┐
                                                  │ RelayedBundle   │
                                                  │ Source (new)    │
                                                  └─────────────────┘
```

---

## Implementation Guidance

### 1. Update ArtifactDescriptor

The descriptor needs to carry enough information for either direct loading or relay:

```typescript
// File: src/extensions/sources/resolve.ts

export interface ArtifactDescriptor {
  /** Canonical source ref string (for persistence/display). */
  sourceRef: string;
  
  /** Source kind for routing to correct bundle source factory. */
  kind: ExtensionSourceRef["kind"];
  
  /** Resolved concrete version (SHA for gh, version for npm). */
  version?: string;
  
  /**
   * For `npm:`/`url:`: direct URL to the bundle directory.
   * For `gh:`: the resolved source ref for the asset loader.
   * 
   * The interpretation depends on `kind` — use `toBundleSource()` to get
   * the appropriate loader.
   */
  baseUrl: string;
  
  /** Physical packaging format. */
  format: "dir";
  
  /**
   * Whether this source requires the asset relay system.
   * True for `gh:` (webviews can't fetch GitHub directly due to CSP).
   * False for `npm:` (jsDelivr has CORS and works directly).
   */
  requiresRelay: boolean;
}
```

### 2. Update resolveSourceRef

```typescript
// File: src/extensions/sources/resolve.ts

import { resolveGitHubRef } from "./github-api";
import { resolveNpmVersion, npmBaseUrl } from "./jsdelivr";

export async function resolveSourceRef(
  ref: ExtensionSourceRef,
  fetchImpl: FetchLike = fetch,
): Promise<ArtifactDescriptor> {
  const sourceRef = formatSourceRef(ref);
  
  switch (ref.kind) {
    case "npm": {
      // npm continues using jsDelivr — it works and has good CDN properties
      const version = await resolveNpmVersion(ref.name, ref.range, fetchImpl);
      return {
        sourceRef,
        kind: "npm",
        version,
        baseUrl: npmBaseUrl(ref.name, version),
        format: "dir",
        requiresRelay: false,  // jsDelivr has CORS, works directly
      };
    }
    
    case "gh": {
      // GitHub uses our resolver + asset relay
      const resolved = await resolveGitHubRef(
        ref.owner,
        ref.repo,
        ref.range,
      );
      
      // Build the source ref that the asset loader will use
      const relaySourceRef = `gh:${ref.owner}/${ref.repo}${
        ref.subpath ? `/${ref.subpath}` : ""
      }@${resolved.sha}`;
      
      return {
        sourceRef,
        kind: "gh",
        version: resolved.sha,
        baseUrl: relaySourceRef,  // For asset loader, not a direct URL
        format: "dir",
        requiresRelay: true,  // Must go through relay for CSP
      };
    }
    
    case "url": {
      // Raw URLs pass through unchanged
      // Note: These may or may not work depending on CORS/CSP
      return {
        sourceRef,
        kind: "url",
        baseUrl: ref.baseUrl,
        format: "dir",
        requiresRelay: false,  // User's responsibility
      };
    }
  }
}
```

### 3. Update toBundleSource Factory

```typescript
// File: src/extensions/sources/resolve.ts

import { createHttpBundleSource } from "../dev-bundle-source";
import { createRelayedBundleSource } from "./relayed-bundle-source";

/**
 * Turn a resolved descriptor into a BundleSource for the loader.
 * Routes to the appropriate source implementation based on the descriptor.
 */
export function toBundleSource(
  descriptor: ArtifactDescriptor,
  assetLoader?: AssetLoader,
): BundleSource {
  if (descriptor.requiresRelay) {
    if (!assetLoader) {
      throw new Error(
        `GitHub sources require an AssetLoader. ` +
        `Provide one via the extension host context.`
      );
    }
    // GitHub sources go through the asset relay
    return createRelayedBundleSource(descriptor.baseUrl, assetLoader);
  }
  
  // npm and url sources load directly via HTTP
  return createHttpBundleSource(descriptor.baseUrl);
}
```

### 4. Create RelayedBundleSource

```typescript
// File: src/extensions/sources/relayed-bundle-source.ts

import type { BundleSource } from "../loader";
import type { AssetLoader } from "../asset-loader";

/**
 * A BundleSource that loads extension assets through the asset relay system.
 * 
 * This is used for sources (like GitHub) where webviews can't fetch directly
 * due to CSP. The parent window's AssetLoader fetches content and provides
 * blob URLs or relays content via postMessage.
 * 
 * @param source - The resolved source ref (e.g., "gh:owner/repo/path@sha")
 * @param assetLoader - The parent window's asset loader instance
 */
export function createRelayedBundleSource(
  source: string,
  assetLoader: AssetLoader,
): BundleSource {
  return {
    readManifest: async () => {
      const asset = await assetLoader.loadAsset(source, "extension.json");
      const text = new TextDecoder().decode(asset.content);
      return JSON.parse(text);
    },
    
    assetUrl: async (path: string) => {
      // Return a blob URL that the webview can load
      return assetLoader.getBlobUrl(source, path);
    },
  };
}
```

### 5. Update the Install Flow

```typescript
// File: src/extensions/install.ts (conceptual)

async function installExtension(
  sourceInput: string,
  assetLoader: AssetLoader,
) {
  // 1. Parse the source ref
  const ref = parseSourceRef(sourceInput);
  
  // 2. Resolve to artifact descriptor (uses GitHub API for gh:)
  const descriptor = await resolveSourceRef(ref);
  
  // 3. Create appropriate bundle source (uses relay for gh:)
  const bundleSource = toBundleSource(descriptor, assetLoader);
  
  // 4. Load the manifest
  const manifest = await bundleSource.readManifest();
  
  // 5. Pre-load all assets for better UX (blob URLs ready for webview)
  if (descriptor.requiresRelay) {
    await assetLoader.preloadExtension(descriptor.baseUrl, manifest);
  }
  
  // 6. Load and validate the extension
  const result = await loadExtension(bundleSource, extensionHost);
  
  if (!result.ok) {
    throw new Error(result.errors.join(", "));
  }
  
  // 7. Persist the installation
  await persistInstallation({
    sourceRef: descriptor.sourceRef,
    version: descriptor.version,
  });
}
```

### 6. Webview Loading Changes

When loading a webview, use the asset loader to get blob URLs:

```typescript
// File: src/extensions/webview/loader.ts

async function loadExtensionWebview(
  iframe: HTMLIFrameElement,
  panel: PanelContribution,
  descriptor: ArtifactDescriptor,
  assetLoader: AssetLoader,
): Promise<WebviewBridge> {
  if (descriptor.requiresRelay) {
    // Get blob URL for the HTML file
    const blobUrl = await assetLoader.getBlobUrl(
      descriptor.baseUrl,
      panel.html,
    );
    iframe.src = blobUrl;
  } else {
    // Direct URL (npm sources)
    iframe.src = `${descriptor.baseUrl}/${panel.html}`;
  }

  // Wait for load
  await new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error('Failed to load webview'));
  });

  // Install the bridge for runtime asset requests
  return new WebviewBridge({
    iframe,
    extensionSource: descriptor.baseUrl,
    assetLoader,
  });
}
```

---

## Testing Strategy

### Unit Tests

```typescript
// File: src/extensions/sources/__tests__/resolve.test.ts

describe("resolveSourceRef", () => {
  describe("gh: sources", () => {
    it("resolves branch with slashes", async () => {
      const ref = parseSourceRef("gh:owner/repo@feature/test");
      const descriptor = await resolveSourceRef(ref);
      
      expect(descriptor.kind).toBe("gh");
      expect(descriptor.requiresRelay).toBe(true);
      expect(descriptor.baseUrl).toMatch(/^gh:owner\/repo@[a-f0-9]+$/);
    });
    
    it("includes subpath in relay source", async () => {
      const ref = parseSourceRef("gh:owner/repo/packages/ext@v1");
      const descriptor = await resolveSourceRef(ref);
      
      expect(descriptor.baseUrl).toContain("/packages/ext@");
    });
  });
  
  describe("npm: sources", () => {
    it("continues using jsDelivr directly", async () => {
      const ref = parseSourceRef("npm:@acme/ext@^1.0.0");
      const descriptor = await resolveSourceRef(ref);
      
      expect(descriptor.kind).toBe("npm");
      expect(descriptor.requiresRelay).toBe(false);
      expect(descriptor.baseUrl).toContain("cdn.jsdelivr.net");
    });
  });
});

describe("toBundleSource", () => {
  it("returns relayed source for gh:", () => {
    const assetLoader = new AssetLoader();
    const descriptor: ArtifactDescriptor = {
      sourceRef: "gh:owner/repo@abc123",
      kind: "gh",
      version: "abc123",
      baseUrl: "gh:owner/repo@abc123",
      format: "dir",
      requiresRelay: true,
    };
    
    const source = toBundleSource(descriptor, assetLoader);
    expect(source).toBeDefined();
  });
  
  it("throws if gh: source missing assetLoader", () => {
    const descriptor: ArtifactDescriptor = {
      sourceRef: "gh:owner/repo@abc123",
      kind: "gh",
      version: "abc123",
      baseUrl: "gh:owner/repo@abc123",
      format: "dir",
      requiresRelay: true,
    };
    
    expect(() => toBundleSource(descriptor)).toThrow(/AssetLoader/);
  });
  
  it("returns HTTP source for npm:", () => {
    const descriptor: ArtifactDescriptor = {
      sourceRef: "npm:@acme/ext@1.0.0",
      kind: "npm",
      version: "1.0.0",
      baseUrl: "https://cdn.jsdelivr.net/npm/@acme/ext@1.0.0",
      format: "dir",
      requiresRelay: false,
    };
    
    const source = toBundleSource(descriptor);
    expect(source).toBeDefined();
  });
});
```

### Integration Tests

```typescript
describe("Extension Installation Flow", () => {
  it("installs gh: extension through relay", async () => {
    const assetLoader = new AssetLoader();
    
    // Mock GitHub raw content
    fetchMock.get(
      "https://raw.githubusercontent.com/owner/repo/abc123/extension.json",
      { id: "test.ext", name: "Test", version: "1.0.0" }
    );
    
    // Install should succeed
    await installExtension("gh:owner/repo@abc123", assetLoader);
    
    // Verify extension is registered
    expect(contributionRegistry.get("test.ext")).toBeDefined();
  });
  
  it("webview loads from blob URL", async () => {
    const assetLoader = new AssetLoader();
    const iframe = document.createElement("iframe");
    
    // Mock the HTML content
    fetchMock.get(
      "https://raw.githubusercontent.com/owner/repo/abc123/panel.html",
      "<html><body>Hello</body></html>"
    );
    
    const descriptor: ArtifactDescriptor = {
      sourceRef: "gh:owner/repo@abc123",
      kind: "gh",
      version: "abc123",
      baseUrl: "gh:owner/repo@abc123",
      format: "dir",
      requiresRelay: true,
    };
    
    const bridge = await loadExtensionWebview(
      iframe,
      { html: "panel.html" },
      descriptor,
      assetLoader,
    );
    
    // iframe.src should be a blob URL
    expect(iframe.src).toMatch(/^blob:/);
  });
});
```

---

## Migration Path

### Phase 1: Add New Code (Non-Breaking)

1. Add `github-api.ts` resolver
2. Add `AssetLoader` class
3. Add `relayed-bundle-source.ts`
4. Add `requiresRelay` field to descriptor (default `false`)
5. Update `toBundleSource` to check `requiresRelay`

All existing code continues working.

### Phase 2: Switch gh: to New Path

1. Update `resolveSourceRef` for `gh:` case to use GitHub API
2. Set `requiresRelay: true` for `gh:` descriptors
3. Wire up `AssetLoader` in extension host context

`gh:` extensions now use the new path.

### Phase 3: Clean Up (Optional)

1. Remove jsDelivr GitHub resolution code
2. Remove direct CDN loading for `gh:` sources
3. Update documentation

---

## Open Questions

1. **Asset Loader Lifecycle**: Where should the `AssetLoader` instance live? Extension host context? Global singleton?

2. **Version Display**: When showing "v1.0.0" vs "abc123f", should we always show the tag name if available, even though we resolve to SHA internally?

3. **URL Sources**: Should `url:` sources also go through the relay for consistency, or is direct loading acceptable?

4. **npm Sources in Webviews**: npm extensions currently load directly. If a webview has strict CSP, should npm also use the relay?

---

## Success Criteria

- [ ] `gh:owner/repo@feature/branch` resolves and loads successfully
- [ ] `npm:@scope/pkg@^1` continues working (no regression)
- [ ] Webviews load via blob URLs without CSP errors
- [ ] Extension worker (`main.js`) loads and activates
- [ ] Icons and assets load correctly
- [ ] Existing installations continue working after update
- [ ] Clear error messages for resolution failures
- [ ] No backend/agent-server changes required
- [ ] Unit and integration tests pass
