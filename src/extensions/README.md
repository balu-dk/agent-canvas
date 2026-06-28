# UI Extensions

A VS Code–style mechanism that lets customer-supplied bundles contribute UI (sidebar
buttons, panels, commands) **without modifying Agent-Canvas source** and **without
giving third-party code access to the host DOM, cookies, or credentials**.

See `docs/proposals/ui-extensions.md` for the full design and rationale, and
`docs/EXTENSION_POINTS.md` for the catalog of current/future contribution points and the
recipe for adding a new one.

## Architecture at a glance

```
extension.json (declarative)        ──parse──▶  manifest.ts
        │                                            │
        ▼                                            ▼
   loader.ts  ──register──▶  contribution-registry.ts  ──▶  Sidebar / Command menu / Menus (native UI)
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
| Registry | `contribution-registry.ts`, `use-contributions.ts`, `menu-slots.ts` |
| Visibility (`when`) | `when.ts` (tiny evaluator), `ui-context.tsx` (whitelisted host UI-context) |
| Loader / manager | `loader.ts`, `extension-manager.ts` |
| Host runtime | `host/rpc.ts`, `host/host-api.ts`, `host/extension-host.ts`, `host/webview-transport.ts`, `host/create-app-host-deps.ts` |
| Worker/webview SDK | `sdk/runtime.ts`, `sdk/worker-bootstrap.ts`, `sdk/api-proxy.ts`, `sdk/webview-client.ts` |
| Security | `webview-security.ts` (canonical CSP / sandbox / origin) |
| Compatibility | `engines.ts` (`engines.agentCanvas` host-range check) |
| App mounting | `feature-flag.ts`, `panel-store.ts`, `dev-bundle-source.ts`, `../components/providers/extension-manager-provider.tsx`, `../components/features/extensions/extension-panel.tsx` |
| Management UI | `installed-store.ts`, `installed-persistence.ts`, `../routes/extensions.tsx`, `../components/features/extensions/{installed-extension-card,add-extension-modal,capability-labels}.tsx` |
| Source resolution | `sources/{ref,resolve,jsdelivr}.ts` (npm/gh/url → pinned bundle) |
| Distribution | `marketplace/{source,catalog,client}.ts` (git/marketplace loading) |
| UI | `../components/features/sidebar/sidebar-contribution-button.tsx`, `../components/features/extensions/extension-webview.tsx`, `../components/features/extensions/extension-menu-items.tsx` |

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
    "commands": [{ "command": "hello.say", "title": "Hello: Say hi" }],
    "menus": {
      "conversationTabs/context": [
        { "command": "hello.say", "when": "backend == cloud" }
      ]
    }
  }
}
```

A menu item's optional **`when`** clause gates its visibility against a small,
whitelisted, read-only **UI-context** of host facts (`when.ts` + `ui-context.tsx`).
The grammar is intentionally tiny — a `&&`-conjunction of `key`, `!key`, `key == value`
and `key != value` terms (no expression language). Available keys: `backend`
(`cloud`/`local`), `agentState`, `emailVerified`, `repoConnected`, and the
`flag.hide_llm_settings` / `flag.hide_users_page` feature flags. Hiding an item reads
host facts only — it runs **no** extension code, so `when` needs no capability.

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

## Publishing a versioned release

Authors **don't host anything** — you publish the bundle directory (the folder containing
`extension.json`) to npm or tag it in a public GitHub repo, and the browser loads the
pinned files from jsDelivr. Pick the channel that matches how you want users to reference
it (see "Installing & versioning" for the ref grammar):

**npm (`npm:<pkg>[@<range>]`)** — best for per-package versioning, including monorepos:

1. Make the bundle folder an npm package. The package root **is** the bundle directory, so
   `extension.json` sits next to `package.json`, and `files` must ship every asset the
   manifest references (`main`, webview `page`s, icons):
   ```jsonc
   // package.json
   {
     "name": "@acme/hello-extension",
     "version": "1.0.0",
     "files": ["extension.json", "main.js", "panel.html", "icon.svg"]
   }
   ```
2. Keep `package.json` `version` and `extension.json` `version` in lockstep — the ref
   resolves an npm version, and the management UI shows `extension.json`'s `version`.
3. `npm publish` (use `--access public` for a first scoped publish).
4. Users install `npm:@acme/hello-extension@^1`; jsDelivr serves the pinned files.

**GitHub (`gh:<owner>/<repo>[/<subpath>][@<range>]`)** — best when the source already
lives in a repo; no npm account needed:

1. Commit the bundle directory. For a single extension it can be the repo root; in a
   monorepo each extension is a subdirectory (the `subpath`).
2. Bump `extension.json` `version`, then **`git tag`** a matching semver tag (e.g.
   `v1.2.0`) and push it — ranges resolve against tags.
3. Users install `gh:acme/extensions/packages/hello@^1` (omit the subpath when the bundle
   is the repo root).

**Releasing an update.** Bump `extension.json` `version` (and `package.json`/the git tag),
republish/retag. Installed users see it via `checkForUpdate` when the new version still
satisfies their recorded range — so honour semver: a release that needs **new
capabilities** or a wider `engines.agentCanvas` range should be a new **major**, since the
in-place update path refuses capability growth and host-incompatible versions (it re-runs
consent instead). Unversioned `https://` URLs have no update channel.

`examples/extensions/hello-sidebar/` is a complete bundle (with a `package.json` ready for
`npm publish`); `examples/extensions/.plugin/marketplace.json` shows the same extension
referenced as a local path, an `npm:` ref, and a `gh:` monorepo ref.

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
   data**. `default-src 'none'` denies everything not explicitly re-allowed. Additional
   directives: a per-load **`script-src 'nonce-…'`** (the server stamps the matching
   nonce onto the bundle's `<script>` tags, so an injected inline script without the
   nonce is blocked), **`frame-ancestors`** (who may embed the webview), and a
   document-level **`sandbox allow-scripts`** mirroring the iframe sandbox.
3. **Capability-gated RPC** — the webview's only outbound path is `postMessage` to the
   host. The host accepts a message only when both `event.source` is the frame **and**
   `event.origin` is the opaque origin, then gates every privileged call by the
   extension's granted `capabilities`.

`webview-security.ts` exposes `buildWebviewCsp({ nonce, frameAncestors })`,
`generateCspNonce()`, and `stampCspNonce(html, nonce)` so the runtime and the asset
server share one implementation. Where an asset server cannot rewrite HTML to stamp a
nonce, omitting it falls back to `script-src 'unsafe-inline'` — still acceptable because
the frame is sandboxed and `connect-src 'none'` blocks exfiltration.

**Serving webview assets.** The core guarantees are enforced **client-side** — the
sandboxed iframe has an opaque origin and `connect-src 'none'`, so wherever a bundle's
HTML is served from, the webview cannot read host data or reach the network. In the
default flow nothing extra is needed: bundles are fetched by the browser directly from
the extension's own URL (e.g. `raw.githubusercontent.com`), already a separate origin.
Whoever *does* serve webview HTML should additionally send the
`Content-Security-Policy` above; the dev middleware (`vite.config.ts`) does this and
stamps a fresh nonce per response via `stampCspNonce`.

**Optional defence in depth:** an operator hosting their own bundles can serve them from
a dedicated isolated origin and set `frameAncestors` to the host app's origin — a
reverse-proxy recipe (and when it's actually worth doing) is in
[`docs/SELF_HOSTING.md`](../../docs/SELF_HOSTING.md) § 6. This is optional, not required
for the baseline guarantees.

## Managing extensions

With the feature enabled, the **`/extensions`** route lists installed extensions and
opens an install modal with two sources:

- **From a source ref** — `npm:<pkg>`, `gh:<owner>/<repo>[/<subpath>]`, or a raw
  `https://` bundle URL (a `github.com` folder URL is normalized to
  `raw.githubusercontent.com`). See "Installing & versioning" below.
- **From marketplace** — a plugin marketplace in a git repo (`github://owner/repo`,
  `owner/repo`, a `github.com` URL, or a direct catalog URL). The catalog is read from
  `.plugin/marketplace.json` (preferred) or `.claude-plugin/marketplace.json`, its UI
  extensions are listed, and you pick one to install. See `marketplace/` and
  "Distributing extensions" below.

Installing is two-step **capability consent**: the manifest is fetched and validated,
its requested permissions are shown, and nothing is registered until you confirm
(all-or-nothing, like VS Code). User installs are persisted to `localStorage` (the
resolved bundle URL + source ref + version + granted capabilities only — never code) and
re-installed on startup by re-fetching and re-validating; `dev` bundles from
`DEV_EXTENSION_BUNDLE_URLS` are config-driven and shown with a "Dev" badge. State lives in
`installed-store.ts` (the reactive inventory the UI renders) rather than a backend, since
UI extensions are entirely client-side.

## Installing & versioning (source refs)

Authors **don't host anything**: they `git tag` or `npm publish`, and the browser loads
the pinned files from a CDN. A **source ref** names *which* extension and *what* version,
independent of where the bytes live (`sources/ref.ts`):

| Ref | Example | Notes |
|---|---|---|
| `npm:<pkg>[@<range>]` | `npm:@acme/hello@^1` | per-package versioning; best for monorepos |
| `gh:<owner>/<repo>[/<subpath>][@<range>]` | `gh:acme/exts/packages/hello@^1` | a repo at a tag; `subpath` selects one extension in a monorepo |
| `https://…` | `https://cdn.example.com/ext` | a raw bundle **directory** (dev / self-hosted) |

A ref with **no subpath resolves to the package/repo root — the zero-config default**;
the monorepo case just adds a `subpath`. The manifest filename is always
`extension.json`.

Resolution is a single per-source seam, so a future first-party registry (`registry:`)
slots in without touching the loader:

```
source string ─parse→ ExtensionSourceRef ─resolve→ ArtifactDescriptor ─acquire→ BundleSource ─→ loadExtension
                       (ref.ts)            (resolve.ts)                 (toBundleSource)
```

- **Resolve** (`sources/resolve.ts`, `sources/jsdelivr.ts`): `npm:`/`gh:` use
  `data.jsdelivr.com` to turn a semver range (default `*` = latest) into a concrete
  version, then point at the pinned `cdn.jsdelivr.net/...@<version>` directory — which
  serves loose files with `Access-Control-Allow-Origin: *` and correct MIME, so dynamic
  `import()` of the worker and framing of the webview "just work". `url:` passes through.
- **`ArtifactDescriptor`** is the stable contract: `{ sourceRef, kind, version, baseUrl,
  format: "dir" }`. `format` is `"dir"` today; `"zip"` is reserved for a registry that
  ships single archives (it would unpack + mint `blob:` URLs in `toBundleSource`).
- **Host compatibility** is enforced at the consent boundary: `engines.agentCanvas` is
  checked against `AGENT_CANVAS_HOST_VERSION` (`engines.ts`) and an incompatible version
  is rejected before anything registers (and skipped on startup restore).
- **Determinism:** the *resolved, pinned* base URL is persisted, so reloads re-install the
  exact same version without re-hitting the registry. `sourceRef` + `version` are kept for
  display and updates.
- **Updates:** `checkForUpdate(id)` re-resolves the stored ref within its recorded range
  and reports a newer pinned artifact (a `url` source has no update channel);
  `updateExtension(id)` applies it, but **non-destructively refuses** - leaving the running
  version intact - when the new version is host-incompatible or requests capabilities
  beyond those already granted (the caller re-runs the consent flow for the latter).

## Distributing extensions (plugin marketplace)

UI extensions are distributed via an **OpenHands plugin marketplace** file (which mirrors
the Claude Code marketplace spec — see `software-agent-sdk` and `Plugin-Directory`), but
they are listed under a **dedicated `uiExtensions` array — never in `plugins`**:

```jsonc
{
  "name": "My extensions",
  "owner": { "name": "Acme" },
  "plugins": [],            // agent plugins (Claude Code / OpenHands plugin loader)
  "uiExtensions": [         // read ONLY by Agent Canvas
    { "name": "hello-sidebar", "source": "./hello-sidebar" }
  ]
}
```

Each entry's `source` points at a bundle directory containing an `extension.json`
manifest. It may be a **versioned source ref** - `npm:<pkg>[@<range>]` or
`gh:<owner>/<repo>[/<subpath>][@<range>]` (string, or the `{ "source": "npm"|"gh", ... }`
object form) - so marketplace installs are pinned and host-checked exactly like the
install box; or a path relative to the catalog repo / absolute `https://` URL (legacy,
unversioned). This separation is
deliberate: Claude Code and the OpenHands plugin loader only enumerate `plugins`, so a UI
extension **never appears as an installable plugin in a context that can't render it**.
Both parsers ignore unknown top-level keys, so the file stays a valid marketplace
manifest. (A per-entry `category`/flag would not work — those tools list every `plugins`
entry regardless.) As a second layer, putting the file at `.plugin/marketplace.json` (the
OpenHands-native location) keeps it invisible to Claude Code, which only discovers
`.claude-plugin/marketplace.json`. A repo therefore looks like:

```
.plugin/marketplace.json          # plugins: [] + uiExtensions: [...]
hello-sidebar/
  extension.json                  # the UI extension manifest
  main.js, panel.html, icon.svg   # the bundle
```

See `examples/extensions/.plugin/marketplace.json` for a complete example. Everything is
fetched over HTTPS from `raw.githubusercontent.com` (CORS-enabled), so public repos need
no git clone or backend. Private repos are not yet supported from the browser.

## Status

M1–M4, app mounting (flag-gated via `VITE_ENABLE_EXTENSIONS`), CSP/origin hardening
(sandbox + opaque origin, `connect-src 'none'`, per-load nonce `script-src`,
`frame-ancestors`, document-level `sandbox`), the `/extensions` management UI with
install-time capability consent, git/marketplace distribution (loading UI extensions
from a plugin marketplace in a git repo), **versioned `npm:`/`gh:` source refs
resolved via jsDelivr with `engines.agentCanvas` host-compatibility enforcement**, and
**in-place update detection/application** (`checkForUpdate`/`updateExtension`, surfaced in
the management UI alongside each install's source ref), and the **`contributes.menus`
declarative contribution point** (menu items bound to a contributed command, placed into
named menu slots via `menu-slots.ts` and rendered by `extension-menu-items.tsx` — the
first host slot is the conversation-tabs context menu), and the **`when` / UI-context
visibility primitive** (a tiny `&&`-conjunction evaluator in `when.ts` over a
whitelisted, read-only host UI-context in `ui-context.tsx`, applied by `useMenuItems`
so hidden items render no extension code and need no capability) are implemented and tested
(`__tests__/extensions/`, `__tests__/extensions/sources/`,
`__tests__/extensions/marketplace/`, `__tests__/components/features/extensions/`,
`__tests__/routes/extensions.test.tsx`). Remaining work (a `zip`
acquirer, a first-party `registry:` resolver + hosted marketplace/registry service with
submission/approval, private-repo auth, deploying a dedicated isolated asset origin, and a
formal security review) is tracked in the proposal's "Implementation status" section.
