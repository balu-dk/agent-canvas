# hello-sidebar (sample UI extension)

A minimal sample for the VS Code–style UI extension system (see
`docs/proposals/ui-extensions.md` and `src/extensions/README.md`).

It contributes one of **every declarative contribution point available today**, so it
doubles as an end-to-end test bundle:

- an Activity Bar (sidebar) button **Hello** with an icon,
- a webview panel (`panel.html`) shown when the button is selected,
- a command **Hello: Say hi** that reads the active conversation and shows a host
  message,
- two **menu items** (`contributes.menus`) bound to that same command — one in the
  conversation-tabs context menu (`conversationTabs/context`) and one in the chat input
  "add"/overflow actions menu (`chatInput/actions`). The chat-input item carries a
  **`when` clause** (`"emailVerified"`) to demonstrate host-fact visibility gating, and
- a **settings page** (`contributes.settingsPages`) — `settings.html` — merged into the
  Settings sidebar and mounted at `/settings/x/acme.hello`, which **persists a value via
  the `storage` capability**.

Files:

- `extension.json` — the declarative manifest (parsed by `src/extensions/manifest.ts`).
- `main.js` — worker entry; runs off the host thread with no DOM access.
- `panel.html` — sandboxed webview UI (reads the active conversation, shows a host message).
- `settings.html` — sandboxed settings-page webview that saves/loads a greeting via
  `storage.get` / `storage.set`.
- `icon.svg` — the rail icon.
- `package.json` — makes the bundle directory `npm publish`-ready; `files` ships exactly
  the assets the manifest references.

This sample requests two capabilities, both surfaced for consent at install time:
`conversation:read` (the panel/command read the active conversation) and `storage` (the
settings page persists its greeting). The menu items and the settings nav item are purely
declarative — showing or `when`-hiding them runs **no** extension code.

## `when` visibility

A menu item or settings page may carry an optional **`when`** clause that the host
evaluates against a small, whitelisted, read-only **UI-context** of host facts. The grammar
is intentionally tiny — a `&&`-conjunction of `key`, `!key`, `key == value`, and
`key != value` terms (no expression language). Available keys: `backend` (`cloud`/`local`),
`agentState`, `emailVerified`, `repoConnected`, and the `flag.hide_llm_settings` /
`flag.hide_users_page` feature flags. Examples: `"backend == cloud"`, `"!repoConnected"`,
`"emailVerified && backend == cloud"`.

## Publishing this bundle

The bundle directory **is** the publishable unit — see "Publishing a versioned release" in
[`src/extensions/README.md`](../../../src/extensions/README.md) for the full guide.

- **npm:** from this folder, `npm publish --access public`, then install
  `npm:@acme/hello-extension@^1`. Keep `package.json` and `extension.json` `version` in
  lockstep.
- **GitHub:** commit this folder, `git tag v1.0.0 && git push --tags`, then install
  `gh:<owner>/<repo>/examples/extensions/hello-sidebar@^1`.

Both resolve to pinned files served by jsDelivr — no hosting required.
