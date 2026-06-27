# UI Extensions

Agent Canvas can load **UI extensions**: small, customer-supplied bundles that add UI
(sidebar buttons, panels, commands) **without modifying Agent Canvas** and **without giving
third-party code access to your DOM, cookies, or credentials**. Every extension runs
sandboxed and is gated by permissions you approve at install time.

This page has two parts:

- [**Try an extension**](#try-an-extension) - enable the feature and install one.
- [**Author and publish an extension**](#author-and-publish-an-extension) - build your own
  and share it.

> **Status:** UI extensions are an experimental, opt-in feature. They are off by default
> and must be enabled with a build-time flag (below). For the full design and the internal
> module reference, see [`src/extensions/README.md`](../src/extensions/README.md).

---

## Try an extension

### 1. Turn the feature on

UI extensions are gated behind the `VITE_ENABLE_EXTENSIONS` build-time flag. If the feature
is off, the Extensions page shows: *"The extensions feature is turned off. Set
VITE_ENABLE_EXTENSIONS=true to enable it."*

- **Running from source (dev):** add the flag to your `.env` and (re)start the dev server:

  ```bash
  echo 'VITE_ENABLE_EXTENSIONS=true' >> .env
  npm run dev
  ```

- **Docker / pre-built image:** the flag is baked in at build time (Vite inlines
  `VITE_*` vars), so a stock image has extensions disabled. To enable them you must build
  the frontend with `VITE_ENABLE_EXTENSIONS=true`.

### 2. Open the Extensions page

With the flag on, go to **`/extensions`** (the **Extensions** entry in the left sidebar,
just below **Skills**). You'll see your installed extensions, or an empty state if you have
none yet.

### 3. Install one

Click **Add** to open the install dialog. It has two sources:

- **From a source ref** - paste one of:

  | Form | Example | When to use |
  |---|---|---|
  | `npm:<pkg>[@<range>]` | `npm:@acme/hello@^1` | Published to npm (recommended, versioned) |
  | `gh:<owner>/<repo>[/<subpath>][@<range>]` | `gh:acme/extensions/packages/hello@^1` | A public GitHub repo at a tag |
  | `https://...` | `https://cdn.example.com/hello` | A raw bundle directory (dev / self-hosted) |

  `npm:` and `gh:` refs are **versioned**: a semver range (e.g. `^1`) resolves to a pinned
  release served from a CDN, so you get reproducible installs and update notifications. A
  plain `https://` URL has no version channel.

- **From marketplace** - paste a plugin marketplace location (`github://owner/repo`,
  `owner/repo`, a `github.com` URL, or a direct catalog URL). Agent Canvas reads the
  catalog, lists the UI extensions it offers (each showing its source), and you pick one.

### 4. Review and approve permissions

Installing is **two-step, all-or-nothing consent** (like VS Code): Agent Canvas fetches and
validates the manifest, shows you exactly which permissions it requests, and installs
**nothing** until you confirm. Today an extension can request:

| Permission | What it means |
|---|---|
| **Read the active conversation** (`conversation:read`) | See the current conversation's title/metadata. |
| **Store data on your device** (`storage`) | Keep its own data in your browser's local storage. |

An extension with no permissions listed can contribute UI but cannot call any privileged
host API.

### 5. Keep extensions updated

For versioned (`npm:`/`gh:`) installs, Agent Canvas periodically re-checks the source. When
a newer release that still satisfies your installed range is available, the extension's card
shows an **"Update available"** badge and an **Update** button. Updating is safe by design:
if the new version needs **more permissions** or a newer host than you have, the update is
**refused** and your current version keeps running - you'd re-add it through the normal
consent flow to grant the new permissions.

### 6. Remove an extension

Each installed card has an **Uninstall** button. Installs are stored locally in your browser
(the resolved bundle location, version, and the permissions you granted - never the code
itself), so removing one is immediate and local. Extensions provided by an operator via
configuration appear with a **Dev** badge and are managed centrally rather than uninstalled
here.

---

## Author and publish an extension

### What an extension is

An extension is a **folder** (a "bundle") containing:

- an **`extension.json`** manifest (declares your buttons, panels, commands, and permissions),
- an optional **worker script** (`main.js`) that runs your logic off the main thread, and
- optional **webview assets** (e.g. `panel.html`) for custom UI.

Two principles shape the model:

- **Declarative-first.** Sidebar buttons, views, and commands are declared as data; Agent
  Canvas renders them. Showing a button runs none of your code.
- **Isolated logic.** Your `main()` runs in a Web Worker (no DOM) and reaches the app only
  through the capability-gated `agentCanvas` API; custom UI runs in a sandboxed iframe with
  no network access.

### Start from the working sample

The fastest path is to copy the bundled sample and modify it:

```
examples/extensions/hello-sidebar/
  extension.json     # the manifest
  main.js            # worker entry (registers a command, reads the conversation)
  panel.html         # a sandboxed webview panel
  icon.svg           # the sidebar rail icon
  package.json       # makes the folder npm-publish-ready
```

It contributes a **Hello** sidebar button, a webview panel, and a **Hello: Say hi** command,
and requests only `conversation:read`. See
[`examples/extensions/hello-sidebar/README.md`](../examples/extensions/hello-sidebar/README.md).

### The manifest (`extension.json`)

```jsonc
{
  "id": "acme.hello",                       // unique, reverse-DNS style
  "name": "Hello",
  "version": "1.0.0",                        // shown in the UI; keep in sync with releases
  "publisher": "acme",
  "engines": { "agentCanvas": "^1.0.0" },    // host versions you support (semver range)
  "main": "main.js",                          // optional worker entry
  "activationEvents": ["onCommand:hello.say"],
  "capabilities": ["conversation:read"],      // permissions; surfaced for consent
  "contributes": {
    "viewsContainers": {
      "activitybar": [{ "id": "hello.container", "title": "Hello", "icon": "icon.svg" }]
    },
    "views": {
      "hello.container": [{ "id": "hello.panel", "name": "Hello", "type": "webview", "page": "panel.html" }]
    },
    "commands": [{ "command": "hello.say", "title": "Hello: Say hi" }]
  }
}
```

### Your logic (`main.js`, runs in a Web Worker)

```js
export function activate(ctx) {
  ctx.agentCanvas.commands.register("hello.say", async () => {
    const convo = await ctx.agentCanvas.conversation.getActive();
    await ctx.agentCanvas.window.showInformationMessage(
      `Active conversation: ${convo?.title ?? "none"}`,
    );
  });
}

export function deactivate() {
  // Optional cleanup; command disposables are handled for you.
}
```

### Custom UI (webviews)

A view of `"type": "webview"` loads your HTML (`page`) inside a **sandboxed iframe** with an
opaque origin and `connect-src 'none'` - it cannot read host data or reach the network. It
talks to the app only through the same capability-gated API (in the sample, a small inlined
client; a real bundle would import the published webview SDK). See the sample's `panel.html`.

### Permissions and host compatibility

- Request the **least** you need. The only permissions today are `conversation:read` and
  `storage`; anything you list is shown to the user for explicit consent.
- Set `engines.agentCanvas` to the host range you actually support. Agent Canvas refuses to
  install (or restore) an extension whose range doesn't match the running host.

### Publish a versioned release

You don't host anything - publish the bundle directory and users load the pinned files from
a CDN. Pick the channel that matches the ref users will type:

- **npm** (`npm:<pkg>`): make the bundle folder an npm package (its `package.json` `files`
  must ship `extension.json` plus every asset the manifest references), keep `package.json`
  and `extension.json` `version` in lockstep, then `npm publish --access public`. Users
  install `npm:@acme/hello@^1`.
- **GitHub** (`gh:<owner>/<repo>`): commit the bundle, bump `extension.json` `version`, then
  `git tag v1.0.0 && git push --tags`. Users install `gh:owner/repo/<subpath>@^1` (omit the
  subpath when the bundle is the repo root).

Full step-by-step (including monorepos): **"Publishing a versioned release"** in
[`src/extensions/README.md`](../src/extensions/README.md).

### Share via a marketplace (optional)

To offer several extensions from one place, add a plugin marketplace file to a public repo.
UI extensions go in a dedicated **`uiExtensions`** array (never `plugins`):

```jsonc
// .plugin/marketplace.json
{
  "name": "My extensions",
  "owner": { "name": "Acme" },
  "plugins": [],
  "uiExtensions": [
    { "name": "hello", "source": "npm:@acme/hello@^1", "description": "Adds a Hello panel." }
  ]
}
```

Each `source` may be a versioned `npm:`/`gh:` ref (pinned + host-checked like the install
box) or a path/`https://` URL. Users browse it via the **From marketplace** tab. A complete
example is [`examples/extensions/.plugin/marketplace.json`](../examples/extensions/.plugin/marketplace.json).

### Releasing updates

Bump `extension.json` `version` (and the `package.json` / git tag) and republish. Users on a
compatible range get an **Update available** prompt. Honour semver: a release that needs
**new permissions** or a **wider host range** should be a new **major**, because the in-place
update path intentionally refuses permission growth and host-incompatible versions (users
re-consent through the Add flow instead).

---

## How extensions stay safe

- **Sandboxed UI.** Webviews run in `sandbox="allow-scripts"` iframes with an opaque origin -
  no access to host cookies, storage, or DOM.
- **No exfiltration.** A host-enforced `connect-src 'none'` Content-Security-Policy means an
  extension's UI has no network channel - it cannot "phone home."
- **Least privilege.** Every privileged call is gated by the manifest's `capabilities`, which
  you approve at install time (all-or-nothing).
- **Pinned, reproducible installs.** Versioned refs resolve to a specific release; the exact
  pinned location is stored so reloads re-install the same bytes.

Operators serving their own extension files can add an extra isolation layer (a dedicated
subdomain) - see **section 6** of the [Self-hosting guide](./SELF_HOSTING.md).

## See also

- [`src/extensions/README.md`](../src/extensions/README.md) - full reference: architecture,
  manifest schema, source-ref resolution, security model, and publishing.
- [`examples/extensions/hello-sidebar/`](../examples/extensions/hello-sidebar/) - the working
  sample bundle.
- [Self-hosting guide](./SELF_HOSTING.md) - hosting extension files on your own origin.
