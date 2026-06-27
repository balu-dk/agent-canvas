# hello-sidebar (sample UI extension)

A minimal sample for the VS Code–style UI extension system (see
`docs/proposals/ui-extensions.md` and `src/extensions/README.md`).

It contributes:

- an Activity Bar (sidebar) button **Hello** with an icon,
- a webview panel (`panel.html`) shown when the button is selected,
- a command **Hello: Say hi** that reads the active conversation and shows a host
  message,
- a menu item (`contributes.menus`) in the conversation-tabs context menu
  (`conversationTabs/context`) bound to that same command.

Files:

- `extension.json` — the declarative manifest (parsed by `src/extensions/manifest.ts`).
- `main.js` — worker entry; runs off the host thread with no DOM access.
- `panel.html` — sandboxed webview UI using `acquireAgentCanvasApi()`.
- `icon.svg` — the rail icon.
- `package.json` — makes the bundle directory `npm publish`-ready; `files` ships exactly
  the assets the manifest references.

This sample requires only the `conversation:read` capability, which the host surfaces
for consent at install time.

## Publishing this bundle

The bundle directory **is** the publishable unit — see "Publishing a versioned release" in
[`src/extensions/README.md`](../../../src/extensions/README.md) for the full guide.

- **npm:** from this folder, `npm publish --access public`, then install
  `npm:@acme/hello-extension@^1`. Keep `package.json` and `extension.json` `version` in
  lockstep.
- **GitHub:** commit this folder, `git tag v1.0.0 && git push --tags`, then install
  `gh:<owner>/<repo>/examples/extensions/hello-sidebar@^1`.

Both resolve to pinned files served by jsDelivr — no hosting required.
