# UI Extensions

A VS Code–style mechanism that lets customer-supplied bundles contribute UI (sidebar
buttons, panels, commands) **without modifying Agent-Canvas source** and **without
giving third-party code access to the host DOM, cookies, or credentials**.

See `docs/proposals/ui-extensions.md` for the full design and rationale.

## Architecture at a glance

```
extension.json (declarative)        ──parse──▶  manifest.ts
        │                                            │
        ▼                                            ▼
   loader.ts  ──register──▶  contribution-registry.ts  ──▶  Sidebar / Command menu (native UI)
        │                                            ▲
        │ (on select)                                │ useContributions()
        ▼
 extension-manager.ts ──▶ host/extension-host.ts ──RPC──▶ Web Worker (sdk/runtime.ts)
        │                          │                          runs extension main()
        │                          │ createHostMethods() (capability-gated)
        ▼                          ▼
 host/webview-transport.ts ──▶ sandboxed <iframe> (ExtensionWebview)  ── same host API
```

Key properties:

- **Declarative-first.** Sidebar buttons/commands/views are declared as data; the
  shell renders them. Showing a button runs no extension code.
- **Isolated logic.** Extension `main()` runs in a Web Worker (no DOM). It reaches the
  app only via the `agentCanvas` RPC API.
- **Sandboxed custom UI.** Webviews are `sandbox="allow-scripts"` (origin-null)
  iframes using the same capability-gated API over `postMessage`.
- **Least privilege.** Every privileged call is gated by the manifest's
  `capabilities`, surfaced for consent at install time.

## File map

| Area | Files |
|---|---|
| Types | `types.ts`, `sdk/types.ts` |
| Manifest | `manifest.ts` |
| Registry | `contribution-registry.ts`, `use-contributions.ts` |
| Loader / manager | `loader.ts`, `extension-manager.ts` |
| Host runtime | `host/rpc.ts`, `host/host-api.ts`, `host/extension-host.ts`, `host/webview-transport.ts`, `host/create-app-host-deps.ts` |
| Worker/webview SDK | `sdk/runtime.ts`, `sdk/worker-bootstrap.ts`, `sdk/api-proxy.ts`, `sdk/webview-client.ts` |
| Security | `webview-security.ts` (canonical CSP / sandbox / origin) |
| App mounting | `feature-flag.ts`, `panel-store.ts`, `dev-bundle-source.ts`, `../components/providers/extension-manager-provider.tsx`, `../components/features/extensions/extension-panel.tsx` |
| Management UI | `installed-store.ts`, `installed-persistence.ts`, `../routes/extensions.tsx`, `../components/features/extensions/{installed-extension-card,add-extension-modal,capability-labels}.tsx` |
| Distribution | `marketplace/{source,catalog,client}.ts` (git/marketplace loading) |
| UI | `../components/features/sidebar/sidebar-contribution-button.tsx`, `../components/features/extensions/extension-webview.tsx` |

## Authoring an extension

A bundle is a folder with an `extension.json`, an optional worker `main`, and optional
webview assets. See `examples/extensions/hello-sidebar/` for a minimal working sample.

```jsonc
{
  "id": "acme.hello",
  "name": "Hello",
  "version": "1.0.0",
  "engines": { "agentCanvas": "^1.0.0" },
  "main": "main.js",
  "activationEvents": ["onCommand:hello.say"],
  "capabilities": ["conversation:read"],
  "contributes": {
    "viewsContainers": { "activitybar": [{ "id": "hello.container", "title": "Hello", "icon": "icon.svg" }] },
    "views": { "hello.container": [{ "id": "hello.panel", "name": "Hello", "type": "webview" }] },
    "commands": [{ "command": "hello.say", "title": "Hello: Say hi" }]
  }
}
```

```js
// main.js (runs in a Web Worker)
export function activate(ctx) {
  ctx.agentCanvas.commands.register("hello.say", async () => {
    const convo = await ctx.agentCanvas.conversation.getActive();
    await ctx.agentCanvas.window.showInformationMessage(
      `Hi! Active conversation: ${convo?.title ?? "none"}`,
    );
  });
}
```

## Security model

Webviews run **untrusted, customer-supplied** HTML/JS, so defences are layered (no
single regression is catastrophic). The canonical knobs live in `webview-security.ts`
so the runtime and the asset server can never drift apart.

1. **Sandbox** — the iframe is `sandbox="allow-scripts"` with **no
   `allow-same-origin`**, giving it an opaque (`"null"`) origin. It cannot read host
   cookies/storage/DOM, submit forms, navigate the top frame, or open popups.
2. **CSP (host-enforced)** — the asset server sends a strict
   `Content-Security-Policy` header (authoritative over any `<meta>` a bundle ships).
   The load-bearing directive is **`connect-src 'none'`**: the webview has *no network
   channel* (no fetch/XHR/WebSocket/EventSource/beacon), so it **cannot exfiltrate
   data**. `default-src 'none'` denies everything not explicitly re-allowed.
3. **Capability-gated RPC** — the webview's only outbound path is `postMessage` to the
   host. The host accepts a message only when both `event.source` is the frame **and**
   `event.origin` is the opaque origin, then gates every privileged call by the
   extension's granted `capabilities`.

`script-src 'unsafe-inline'` is currently required to run unbundled webview code with
no build step; it is acceptable only because the frame is sandboxed and cannot
exfiltrate. A future iteration can move to per-load nonces.

**Production requirement:** the dev server applies these headers via middleware
(`vite.config.ts`); a real deployment **must** serve webview assets with the same
`Content-Security-Policy` (ideally from a dedicated isolated origin/subdomain).

## Managing extensions

With the feature enabled, the **`/extensions`** route lists installed extensions and
opens an install modal with two sources:

- **From URL / git** — a bundle base URL (or a `github.com` folder URL, resolved to
  `raw.githubusercontent.com`).
- **From marketplace** — a plugin marketplace in a git repo (`github://owner/repo`,
  `owner/repo`, a `github.com` URL, or a direct catalog URL). The catalog is read from
  `.plugin/marketplace.json` (preferred) or `.claude-plugin/marketplace.json`, its UI
  extensions are listed, and you pick one to install. See `marketplace/` and
  "Distributing extensions" below.

Installing is two-step **capability consent**: the manifest is fetched and validated,
its requested permissions are shown, and nothing is registered until you confirm
(all-or-nothing, like VS Code). User installs are persisted to `localStorage` (bundle
URL + manifest path + granted capabilities only — never code) and re-installed on
startup by re-fetching and re-validating; `dev` bundles from `DEV_EXTENSION_BUNDLE_URLS`
are config-driven and shown with a "Dev" badge. State lives in `installed-store.ts` (the
reactive inventory the UI renders) rather than a backend, since UI extensions are
entirely client-side.

## Distributing extensions (plugin marketplace)

UI extensions are distributed as **OpenHands plugins** (which mirror the Claude Code
plugin spec — see `software-agent-sdk` and `Plugin-Directory`). A UI extension lives
inside that spec as an ordinary marketplace **plugin entry**, disambiguated from a
regular agent plugin by:

- `category: "ui-extension"`, and/or
- a `uiExtension` marker, e.g. `{ "manifest": "extension.json" }`, pointing at the UI
  manifest within the plugin directory.

Because both Claude Code and the OpenHands SDK allow unknown fields and a UI-extension
entry contributes **no** `commands`/`agents`/`hooks`/`mcpServers`, it loads safely
alongside regular plugins without affecting the agent. A marketplace repo therefore
looks like:

```
.plugin/marketplace.json          # lists plugins (incl. UI extensions)
hello-sidebar/
  .claude-plugin/plugin.json      # optional: marks it a ui-extension plugin
  extension.json                  # the UI extension manifest
  main.js, panel.html, icon.svg   # the bundle
```

See `examples/extensions/.plugin/marketplace.json` for a complete example. Everything is
fetched over HTTPS from `raw.githubusercontent.com` (CORS-enabled), so public repos need
no git clone or backend. Private repos are not yet supported from the browser.

## Status

M1–M4, app mounting (flag-gated via `VITE_ENABLE_EXTENSIONS`), the first round of
CSP/origin hardening, the `/extensions` management UI with install-time capability
consent, and git/marketplace distribution (loading UI extensions from a plugin
marketplace in a git repo) are implemented and tested (`__tests__/extensions/`,
`__tests__/extensions/marketplace/`, `__tests__/components/features/extensions/`,
`__tests__/routes/extensions.test.tsx`). Remaining work (a hosted marketplace/registry
service with submission/approval, private-repo auth, a dedicated isolated asset origin,
and nonce-based `script-src`) is tracked in the proposal's "Implementation status"
section.
