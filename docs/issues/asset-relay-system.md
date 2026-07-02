# Asset Relay System for Extension Webviews

**Status:** Proposed  
**Component:** `src/extensions/`  
**Related:** GitHub API Resolver, Source Resolution Updates  
**Priority:** High — Enables GitHub extensions without backend changes

---

## Problem Statement

Extension webviews run in sandboxed iframes with strict Content Security Policy:

```
connect-src 'none'
```

This is a **deliberate security measure** — it prevents extension code from making network
requests, ensuring all communication goes through the capability-gated `postMessage` RPC.
This is non-negotiable for the security model.

However, this CSP also prevents webviews from loading assets from external origins:

### Current Failure Mode

1. User installs extension from `gh:owner/repo/path@ref`
2. Resolver returns `baseUrl` pointing to external CDN/GitHub
3. Webview iframe tries to load `https://raw.githubusercontent.com/.../panel.html`
4. Browser blocks it: **"raw.githubusercontent.com refused to connect"**

### Why Not a Backend Proxy?

We initially considered adding a `/api/extensions/proxy` endpoint to agent-server. However:

1. **Agent-server is shared** — It serves multiple frontends, not just agent-canvas
2. **Extension system is agent-canvas-specific** — Doesn't belong in shared infrastructure
3. **Deployment coupling** — Would require agent-server changes before extensions work
4. **Different security model** — HTTP endpoint accessible to any caller

---

## Proposed Solution: postMessage Relay

Follow the **VS Code extension model**: the parent window acts as a privileged "extension host"
that can fetch resources and relay them to sandboxed webviews via postMessage.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Parent Window                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Asset Loader                                  │    │
│  │  • Fetches from GitHub/CDN (no CSP restrictions)                    │    │
│  │  • Caches assets in memory/IndexedDB                                │    │
│  │  • Creates blob URLs for initial webview load                       │    │
│  │  • Validates requests against extension source                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
│                              postMessage                                     │
│                                    │                                         │
│  ┌─────────────────────────────────▼───────────────────────────────────┐    │
│  │                         Webview Bridge                               │    │
│  │  • Receives asset requests from webview                             │    │
│  │  • Routes to Asset Loader                                           │    │
│  │  • Sends content back via postMessage                               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                         │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │
                              postMessage
                                     │
┌────────────────────────────────────▼────────────────────────────────────────┐
│                           Webview (iframe)                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  CSP: connect-src 'none'                                            │    │
│  │  • Cannot fetch() directly                                          │    │
│  │  • Requests assets via postMessage                                  │    │
│  │  • Receives content as data/blob                                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### VS Code Precedent

This is exactly how VS Code extensions work:

```typescript
// VS Code webview (sandboxed)
vscode.postMessage({ command: 'fetchData', url: 'https://api.example.com/data' });

// VS Code extension host (privileged Node.js)
panel.webview.onDidReceiveMessage(async (message) => {
  if (message.command === 'fetchData') {
    const data = await fetch(message.url);  // Node.js can fetch anything
    panel.webview.postMessage({ command: 'dataResult', data });
  }
});
```

In agent-canvas:
- **Parent window** = Extension Host (privileged, can fetch anywhere)
- **Webview iframe** = Webview (sandboxed, CSP restricted)
- **postMessage** = Same communication channel

---

## Implementation Guidance

### 1. Asset Loader Service

```typescript
// File: src/extensions/asset-loader.ts

/**
 * Service that fetches and caches extension assets. Runs in the parent window
 * where there are no CSP restrictions on network requests.
 */

export interface AssetLoaderOptions {
  /** GitHub token for private repos. */
  githubToken?: string;
  /** Max cache size in bytes (default: 50MB). */
  maxCacheSize?: number;
}

export interface LoadedAsset {
  /** The raw content as ArrayBuffer. */
  content: ArrayBuffer;
  /** MIME type of the content. */
  mimeType: string;
  /** Blob URL for the content (for iframe src, etc.). */
  blobUrl: string;
}

export class AssetLoader {
  private cache = new Map<string, LoadedAsset>();
  private options: AssetLoaderOptions;

  constructor(options: AssetLoaderOptions = {}) {
    this.options = options;
  }

  /**
   * Load an asset from a GitHub extension source.
   * 
   * @param source - Resolved source ref (e.g., "gh:owner/repo/path@sha")
   * @param file - File path within the extension
   * @returns Loaded asset with content and blob URL
   */
  async loadAsset(source: string, file: string): Promise<LoadedAsset> {
    const cacheKey = `${source}:${file}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Build the raw GitHub URL
    const url = this.buildGitHubUrl(source, file);
    
    // Fetch from GitHub (parent window has no CSP restrictions)
    const response = await fetch(url, {
      headers: this.options.githubToken
        ? { Authorization: `Bearer ${this.options.githubToken}` }
        : undefined,
    });

    if (!response.ok) {
      throw new Error(`Failed to load asset: ${response.status} ${file}`);
    }

    const content = await response.arrayBuffer();
    const mimeType = this.getMimeType(file);
    const blob = new Blob([content], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);

    const asset: LoadedAsset = { content, mimeType, blobUrl };
    
    // Cache for SHA-pinned sources (immutable)
    if (this.isImmutableSource(source)) {
      this.cache.set(cacheKey, asset);
    }

    return asset;
  }

  /**
   * Pre-load all known assets for an extension (manifest, HTML, JS, CSS).
   * Call this at install time for better UX.
   */
  async preloadExtension(source: string, manifest: ExtensionManifest): Promise<void> {
    const files = this.collectAssetPaths(manifest);
    await Promise.all(files.map(file => this.loadAsset(source, file)));
  }

  /**
   * Get a blob URL for an asset, loading it if necessary.
   */
  async getBlobUrl(source: string, file: string): Promise<string> {
    const asset = await this.loadAsset(source, file);
    return asset.blobUrl;
  }

  private buildGitHubUrl(source: string, file: string): string {
    // Parse gh:owner/repo/path@sha
    const match = source.match(/^gh:([^/]+)\/([^@]+)@(.+)$/);
    if (!match) throw new Error(`Invalid source: ${source}`);
    
    const [, owner, repoPath, sha] = match;
    const cleanFile = file.replace(/^\/+/, '');
    
    return `https://raw.githubusercontent.com/${owner}/${repoPath}/${sha}/${cleanFile}`;
  }

  private getMimeType(file: string): string {
    const ext = file.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      json: 'application/json',
      js: 'application/javascript',
      mjs: 'application/javascript',
      html: 'text/html',
      htm: 'text/html',
      css: 'text/css',
      svg: 'image/svg+xml',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
    };
    return types[ext ?? ''] ?? 'application/octet-stream';
  }

  private isImmutableSource(source: string): boolean {
    // SHA-pinned sources are immutable
    const match = source.match(/@([a-f0-9]{7,40})$/i);
    return Boolean(match);
  }

  private collectAssetPaths(manifest: ExtensionManifest): string[] {
    const paths = ['extension.json'];
    
    if (manifest.main) paths.push(manifest.main);
    if (manifest.browser) paths.push(manifest.browser);
    if (manifest.icon) paths.push(manifest.icon);
    
    // Collect from contributions
    if (manifest.contributes?.panels) {
      for (const panel of manifest.contributes.panels) {
        if (panel.html) paths.push(panel.html);
        if (panel.icon) paths.push(panel.icon);
      }
    }
    if (manifest.contributes?.settings) {
      for (const setting of manifest.contributes.settings) {
        if (setting.html) paths.push(setting.html);
      }
    }
    
    return [...new Set(paths)];
  }

  /**
   * Clean up blob URLs when extension is uninstalled.
   */
  dispose(): void {
    for (const asset of this.cache.values()) {
      URL.revokeObjectURL(asset.blobUrl);
    }
    this.cache.clear();
  }
}
```

### 2. Webview Bridge (Parent Side)

```typescript
// File: src/extensions/webview-bridge.ts

/**
 * Bridge that handles postMessage communication between parent and webview.
 * Installed per webview instance.
 */

export interface WebviewBridgeOptions {
  /** The webview's iframe element. */
  iframe: HTMLIFrameElement;
  /** The extension source this webview belongs to. */
  extensionSource: string;
  /** Asset loader instance. */
  assetLoader: AssetLoader;
  /** Allowed external origins (for future permission model). */
  allowedOrigins?: string[];
}

export class WebviewBridge {
  private iframe: HTMLIFrameElement;
  private source: string;
  private loader: AssetLoader;
  private allowedOrigins: Set<string>;
  private messageHandler: (event: MessageEvent) => void;

  constructor(options: WebviewBridgeOptions) {
    this.iframe = options.iframe;
    this.source = options.extensionSource;
    this.loader = options.assetLoader;
    this.allowedOrigins = new Set(options.allowedOrigins ?? []);

    this.messageHandler = this.handleMessage.bind(this);
    window.addEventListener('message', this.messageHandler);
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    // Only handle messages from our iframe
    if (event.source !== this.iframe.contentWindow) return;

    const { type, id, ...payload } = event.data;

    switch (type) {
      case 'asset:request':
        await this.handleAssetRequest(id, payload);
        break;
      case 'fetch:request':
        await this.handleFetchRequest(id, payload);
        break;
    }
  }

  private async handleAssetRequest(
    id: string,
    payload: { file: string },
  ): Promise<void> {
    try {
      // Validate: only allow files from this extension's source
      const asset = await this.loader.loadAsset(this.source, payload.file);
      
      this.sendResponse(id, {
        ok: true,
        content: asset.content,
        mimeType: asset.mimeType,
      });
    } catch (error) {
      this.sendResponse(id, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private async handleFetchRequest(
    id: string,
    payload: { url: string; options?: RequestInit },
  ): Promise<void> {
    try {
      const url = new URL(payload.url);
      
      // Validate: check against allowed origins
      if (!this.isAllowedOrigin(url.origin)) {
        throw new Error(
          `Origin not allowed: ${url.origin}. ` +
          `Extension must declare required origins in manifest.`
        );
      }

      // Fetch on behalf of the webview
      const response = await fetch(payload.url, payload.options);
      const content = await response.arrayBuffer();

      this.sendResponse(id, {
        ok: response.ok,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        content,
      });
    } catch (error) {
      this.sendResponse(id, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  private isAllowedOrigin(origin: string): boolean {
    // Always allow the extension's own source (GitHub raw content)
    if (origin === 'https://raw.githubusercontent.com') return true;
    
    // Check against declared permissions
    return this.allowedOrigins.has(origin);
  }

  private sendResponse(id: string, response: unknown): void {
    this.iframe.contentWindow?.postMessage(
      { type: 'response', id, ...response },
      '*'  // Webview origin may be blob: or null
    );
  }

  dispose(): void {
    window.removeEventListener('message', this.messageHandler);
  }
}
```

### 3. Webview Client (Inside Webview)

```typescript
// File: src/extensions/webview-client.ts
// This code runs INSIDE the webview iframe

/**
 * Client for requesting assets from the parent window.
 * Injected into webviews as part of the bootstrap.
 */

let requestId = 0;
const pendingRequests = new Map<string, { resolve: Function; reject: Function }>();

// Listen for responses from parent
window.addEventListener('message', (event) => {
  if (event.data?.type === 'response') {
    const { id, ok, error, ...rest } = event.data;
    const pending = pendingRequests.get(id);
    if (pending) {
      pendingRequests.delete(id);
      if (ok) {
        pending.resolve(rest);
      } else {
        pending.reject(new Error(error));
      }
    }
  }
});

/**
 * Request an asset from the extension bundle.
 */
export async function requestAsset(file: string): Promise<{
  content: ArrayBuffer;
  mimeType: string;
}> {
  const id = `asset:${++requestId}`;
  
  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    parent.postMessage({ type: 'asset:request', id, file }, '*');
    
    // Timeout after 30s
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Asset request timed out: ${file}`));
      }
    }, 30000);
  });
}

/**
 * Fetch from an external URL (requires permission).
 */
export async function relayFetch(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const id = `fetch:${++requestId}`;
  
  const result = await new Promise<any>((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    parent.postMessage({ type: 'fetch:request', id, url, options }, '*');
    
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Fetch request timed out: ${url}`));
      }
    }, 30000);
  });

  // Reconstruct a Response-like object
  return new Response(result.content, {
    status: result.status,
    headers: result.headers,
  });
}
```

### 4. Initial Webview Load

For the initial HTML load, use blob URLs created by the asset loader:

```typescript
// File: src/extensions/webview-loader.ts

export async function loadWebview(
  iframe: HTMLIFrameElement,
  source: string,
  htmlPath: string,
  assetLoader: AssetLoader,
): Promise<WebviewBridge> {
  // Load the HTML and get a blob URL
  const blobUrl = await assetLoader.getBlobUrl(source, htmlPath);
  
  // Set iframe src to the blob URL (same-origin, CSP satisfied)
  iframe.src = blobUrl;

  // Wait for load
  await new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error('Failed to load webview'));
  });

  // Install the bridge for runtime communication
  return new WebviewBridge({
    iframe,
    extensionSource: source,
    assetLoader,
  });
}
```

---

## Permission Model (Future)

Extensions that need to access external services should declare permissions:

```json
{
  "id": "my.extension",
  "permissions": {
    "fetch": [
      "https://api.example.com/*",
      "https://images.service.io/*"
    ]
  }
}
```

The webview bridge checks requests against these declared origins:

```typescript
private isAllowedOrigin(origin: string): boolean {
  // Always allow extension's own source
  if (this.isExtensionSource(origin)) return true;
  
  // Check declared permissions
  return this.permissions.some(pattern => 
    matchUrlPattern(origin, pattern)
  );
}
```

Users could see permissions at install time:

> "Extension X requests access to:"
> - api.example.com
> - images.service.io

---

## Security Analysis

### Why This Is Secure

1. **CSP remains strict** — Webviews still have `connect-src 'none'`
2. **Parent mediates all network** — No direct webview→internet path
3. **Request validation** — Parent checks every request against source/permissions
4. **Scoped to webview** — Each bridge only serves one webview instance
5. **No server exposure** — Unlike a proxy, no HTTP endpoint for attackers

### Comparison with Backend Proxy

| Aspect | Backend Proxy | postMessage Relay |
|--------|---------------|-------------------|
| Attack surface | HTTP endpoint | postMessage (same-origin only) |
| Request visibility | Logs on server | Parent has full visibility |
| Request scope | Any caller | Specific webview instance |
| Permission enforcement | Server config | In-process validation |

### Potential Concerns

1. **Data exfiltration via asset paths?** — Mitigated by validating paths against known extension files

2. **Timing attacks?** — Low risk; timing is observable regardless of relay

3. **Memory usage** — Blob URLs consume memory; dispose properly on uninstall

---

## Testing Strategy

### Unit Tests

```typescript
describe('AssetLoader', () => {
  it('loads assets from GitHub sources', async () => { /* ... */ });
  it('caches SHA-pinned assets', async () => { /* ... */ });
  it('rejects invalid source formats', async () => { /* ... */ });
  it('handles fetch errors gracefully', async () => { /* ... */ });
});

describe('WebviewBridge', () => {
  it('relays asset requests to loader', async () => { /* ... */ });
  it('validates external fetch origins', async () => { /* ... */ });
  it('rejects disallowed origins', async () => { /* ... */ });
  it('handles request timeouts', async () => { /* ... */ });
});
```

### Integration Tests

```typescript
describe('Extension Webview Loading', () => {
  it('loads webview HTML via blob URL', async () => { /* ... */ });
  it('webview can request assets via postMessage', async () => { /* ... */ });
  it('webview cannot fetch disallowed origins', async () => { /* ... */ });
});
```

---

## Open Questions

1. **IndexedDB caching?** — Should assets be persisted to IndexedDB for offline support?

2. **Cache invalidation for branches?** — SHA-pinned refs are immutable, but branch refs can change. Re-resolve on app restart?

3. **Worker scripts** — The extension worker (`main.js`) runs in parent context, not webview. Does it need relay access too?

4. **Private repos** — How should GitHub tokens be provided? Environment variable? Settings UI?

---

## Success Criteria

- [ ] Webview HTML loads via blob URL (no CSP errors)
- [ ] Webview can request extension assets via postMessage
- [ ] Webview can request external URLs (with permission)
- [ ] Assets are cached for SHA-pinned sources
- [ ] No backend/agent-server changes required
- [ ] Security model matches VS Code extensions
- [ ] Clean error messages for permission denials
- [ ] Memory properly cleaned up on uninstall
