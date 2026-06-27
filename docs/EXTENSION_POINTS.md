# UI Extension Points: current and future

This is a **design / roadmap** guide for contributors. It describes how the UI extension
system plugs into Agent Canvas today, the seam for adding a new extension point, and a
catalog of candidate future extension points mapped to the actual UI surfaces that would
host them. It complements:

- [`EXTENSIONS.md`](./EXTENSIONS.md) - the user/author guide (try and publish extensions).
- [`../src/extensions/README.md`](../src/extensions/README.md) - the implementation reference.
- [`proposals/ui-extensions.md`](./proposals/ui-extensions.md) - the original design proposal
  (its sections 2, 6, and 7 already sketch several of the items below).

> Scope note: nothing here is committed work. It is a map of where the architecture is
> *designed* to grow, so new contribution points land consistently instead of ad hoc.

---

## How an extension plugs in today

Extensions extend the UI through **two complementary mechanisms**, both deliberately
narrow:

1. **Declarative contribution points** - static JSON under `contributes` in
   `extension.json`. The shell renders them; **showing them runs no extension code**. Today:

   | Contribution | Manifest key | Hosted by |
   |---|---|---|
   | Activity-bar (rail) button | `contributes.viewsContainers.activitybar` | `src/components/features/sidebar/sidebar-rail-body.tsx` |
   | View / panel (webview) | `contributes.views` | the panel host + `extension-webview.tsx` |
   | Command | `contributes.commands` | the Command-K menu (`src/components/features/command-menu/`) |
   | Menu item | `contributes.menus` | named menu slots, e.g. `conversation-tabs-context-menu.tsx` (`src/extensions/menu-slots.ts` + `extension-menu-items.tsx`) |

2. **A capability-gated host API** - the imperative surface an extension's **Web Worker**
   (and sandboxed webview) calls over RPC. Today (`src/extensions/host/host-api.ts`):

   | RPC method | Capability required | Backed by (`create-app-host-deps.ts`) |
   |---|---|---|
   | `window.showInformationMessage` | none | a host toast |
   | `commands.execute` | none | dispatch a contributed command |
   | `conversation.getActive` | `conversation:read` | the active conversation summary |
   | `storage.get` / `storage.set` | `storage` | namespaced `localStorage` |

Supporting pieces: contributions are collected in `contribution-registry.ts` (keyed by
`extensionId`, with derived flat lists for stable selectors), consumed by host components
through the hooks in `use-contributions.ts` (`useActivityBarItems`, `useExtensionCommands`,
`useExtensionViews`), and a worker activates lazily on an **activation event**
(`"*"`, `"onStartup"`, `onCommand:<id>`, `onView:<id>` - see `types.ts`/`manifest.ts`).

### Two kinds of "extension point"

Every idea below is one (or both) of:

- **Declarative point** - a new `contributes.*` key that places extension-described items
  into a host surface. Runs no extension code, so it needs **no new capability**.
- **Imperative API** - a new host RPC method the worker/webview can call. If it exposes data
  or performs an action, it needs a **capability + install-time consent**.

---

## The recipe for adding a new extension point

Adding a point is a small, well-bounded change across the same files each time.

**To add a declarative contribution point:**

1. **Schema** - extend `ContributesManifest` and its hand-rolled validator in
   `src/extensions/manifest.ts` (fail loudly on malformed input - this is the trust
   boundary for declarative data).
2. **Type** - add the resolved item type to `src/extensions/types.ts` and include it in
   `ExtensionContributions`.
3. **Registry** - add it to the derived flat lists in `contribution-registry.ts` so
   register/unregister stays atomic per extension.
4. **Hook** - expose a `useX()` selector in `use-contributions.ts`.
5. **Host** - have the target UI component subscribe to the hook and render the items.
6. **Activation (optional)** - if the point should lazily wake the worker, extend the
   `ActivationEvent` union and `ACTIVATION_PATTERN` (e.g. an `onMenu:<id>` trigger).

**To add an imperative API method:**

1. **Method** - add it to the map in `host-api.ts`; gate any privileged call with
   `requireCapability(...)`.
2. **Dep** - wire the real implementation in `create-app-host-deps.ts` (keep the subsystem
   app-agnostic via the `HostApiDeps` interface).
3. **Capability** - if it needs a new permission, add it to `KNOWN_CAPABILITIES`
   (`manifest.ts`), give it a consent label in
   `src/components/features/extensions/capability-labels.ts` + an i18n key, and remember the
   label is shown in the install dialog.
4. **SDK type** - surface it on the `agentCanvas` API types in `src/extensions/sdk/` so
   authors get types and the webview client can proxy it.
5. **Versioning** - keep changes **additive**; a breaking API change means bumping the host
   major that `engines.agentCanvas` checks against.

This uniformity is the point: a new surface is "schema + type + registry + hook + host" (or
"method + dep + capability"), never a fork of the rendering shell.

---

## Candidate future extension points

Each entry lists the **host surface** (a real component today), the **VS Code analog**, the
**shape** it would take, and the **trust** implications. See the grounded findings immediately
below for the re-ordering that supersedes the original "value/effort" guesswork.

### Surface inventory & findings (grounded in the current UI)

A pass over the *actual* Agent Canvas UI (not the VS Code analogy) reshaped this list. Three
findings dominate:

1. **Most host surfaces are the same context-menu primitive.** The conversation-tabs menu,
   the conversation header menu (rename / show skills, `conversation-name-context-menu.tsx`),
   the left-sidebar per-conversation menu (rename / export / delete,
   `conversation-card/conversation-card-context-menu.tsx`), and the chat "add" menu
   (`chat-input-actions.tsx`) are **all built on the same `ContextMenu` / `ContextMenuListItem`
   primitives**. So they are *not* new mechanisms — each is one more `MENU_SLOTS` id + a
   `<ExtensionMenuItems slot=… />` render line on the `contributes.menus` point we already
   shipped. The menus mechanism generalizes to all of them.

2. **`when` / enablement is the shared dependency, and the host already has the context.** The
   app already shows/hides/disables *built-in* UI from a small set of host facts:
   - rail nav links: `linkDisabled = settings.email_verified === false`
     (`sidebar-rail-body.tsx`);
   - `/new`, the planner tab, `/model`, and the slash menu switch on `backend.kind`
     (cloud vs local);
   - settings nav items filter by feature flags and disable by agent kind (`disabledByAcp`) in
     `use-settings-nav-items.ts`.
   Contributed items in these menus will look broken without the same gating, so a small
   **`when` evaluator over a whitelisted, read-only UI-context** (backend kind, agent state,
   email-verified, repo-connected, feature flags) is a **prerequisite** for the menu/nav points
   to feel native. It needs **no capability** — it exposes host-owned facts, not extension data.
   Build it once; menus, settings nav, and future rail items all reuse it.

3. **Two surfaces from the old UI no longer exist.** There is **no profile/account menu** (the
   OSS `UserAvatar` is a placeholder; the real account menu lives in the `deploy` wrapper) and
   **no standalone top-right icon bar** — what looks like one is the **right-side collapsible
   panel's tab strip** (files / task list / terminal / browser). A panel-tab contribution there
   reuses the `views` webview plumbing.

Grounded surface map:

| Real surface | Component | Built from | Contribution cost |
|---|---|---|---|
| Right-panel tabs' context menu | `conversation-tabs/conversation-tabs-context-menu.tsx` | `ContextMenu` | **done** (menus slot) |
| Conversation header menu (rename, show skills) | `conversation-name-context-menu.tsx` | `ContextMenu` | + a slot |
| Left-sidebar conversation menu (rename/export/delete) | `conversation-card/conversation-card-context-menu.tsx` | `ContextMenu` | + a slot (curate destructive items) |
| Chat "add" menu (next to code/plan) | `chat/components/chat-input-actions.tsx` | `ContextMenu` | + a slot |
| Left rail nav (customize/automate/settings + activity bar) | `sidebar/sidebar-rail-body.tsx` | item list | activity-bar items **done** |
| Settings pages (gear → `/settings`) | `settings-navigation.tsx`, `use-settings-nav-items.ts`, `OSS_NAV_ITEMS`, `routes/settings.tsx` | data-driven nav + routed webview body | nav-merge + one catch-all route |
| Right-panel tab/panel | `conversation-tabs/` | webview panel | new tab-slot (reuses `views`) |

**Revised order (grounded):**
1. **`when` / whitelisted UI-context primitive** — shared dependency of everything below; no capability.
2. **Chat "add" menu slot** — XS; pure reuse of the menus mechanism.
3. **Settings page contribution** — webview body + merge into `use-settings-nav-items` + one
   catch-all `/settings/x/:extensionId` route; **no new capability** if the page persists via
   the extension's existing `storage`.
4. **Right-panel tab/panel** — webview + a tab-slot.
5. **Conversation / card context-menu slots** — add on demand (card menu has destructive
   items → keep contributed items in their own group below built-ins).

### 1. Menus (`contributes.menus`) — ✅ implemented

Shipped as the first declarative point built on this recipe (see the "today" table above).

- **Surface:** named menu slots. The first host slot is the conversation-tabs context menu
  (`conversation-tabs-context-menu.tsx`); add a slot by registering its id in
  `src/extensions/menu-slots.ts` and rendering `<ExtensionMenuItems slot={…} />`.
- **Analog:** VS Code `contributes.menus`.
- **Shape:** a `contributes.menus` map of *slot id → items*; each item is
  `{ "command": "<id>", "group"?: "<name>" }`, bound to one of the extension's own
  contributed `commands`. The item's label is resolved from that command's title, and
  selecting it activates the worker (`onCommand:<id>`) and runs the command — the same path
  the Command-K menu uses.
  ```jsonc
  "contributes": {
    "commands": [{ "command": "hello.say", "title": "Hello: Say hi" }],
    "menus": { "conversationTabs/context": [{ "command": "hello.say" }] }
  }
  ```
- **Trust:** declarative; the action is just an existing contributed command, so **no new
  capability**. The "menu contribution location" registry is `menu-slots.ts` (the `MENU_SLOTS`
  ids) plus the registry's derived `menuItemsBySlot`, queried via `useMenuItems(slot)`.
- **Not yet:** `when`-clause visibility (there is no host `when` evaluator) and an
  `onMenu:<slot>` activation event (unnecessary — command activation already covers it).

### 2. Chat "add" menu (and why *not* slash commands)
- **Surface:** the chat "add" menu in the submission area (next to the code/plan selector),
  `src/components/features/chat/components/chat-input-actions.tsx` — built on the **same
  `ContextMenu` primitives** as the menus point, so this is **one more `MENU_SLOTS` id**
  (e.g. `chatInput/actions`), not a new mechanism.
- **Analog:** editor toolbar / quick actions.
- **Shape:** a `contributes.menus` slot whose items run a contributed command. Declarative;
  **no new capability** to render or to run the command.
- **Slash commands are deliberately *not* a contribution point.** `useSlashCommand`
  (`src/hooks/chat/use-slash-command.ts`) populates the `/` menu from `BUILT_IN_COMMANDS` +
  conversation skills + microagents. **Skills already own "type `/` to run a workflow,"** so a
  `contributes.slashCommands` point would compete with that and split the model.
- **Trust:** declarative entry + existing command. *Inserting text into* / *submitting* the
  conversation is a separate, higher-value step needing the `conversation:write` capability
  (see #8) — keep it out of the cheap declarative slice.

### 3. Command metadata + the `when` / UI-context primitive
- **Surface:** `src/components/features/command-menu/`, and — more importantly — every gated
  menu/nav surface above.
- **Analog:** VS Code command `category`, `enablement`, `icon`, plus `when`-clause context keys.
- **Shape:** enrich the `commands`/`menus` points with grouping, icons, and **`when`-style
  visibility** evaluated against a small, whitelisted, read-only **UI-context** (backend kind,
  agent state, email-verified, repo-connected, feature flags). The host already derives all of
  these for built-ins (see finding #2), so this exposes existing facts, not new data.
- **Trust:** declarative; **no new capability**.
- **Promoted:** this is now a **prerequisite**, not optional polish — contributed menu/nav
  items look broken without it, and it is the shared dependency of #2, #5, and future rail
  items. Build the evaluator + UI-context once.

### 4. Status-bar items
- **Surface:** *none yet* - there is no status bar component today.
- **Analog:** VS Code status bar.
- **Shape:** introduce a host status-bar region first, then a `contributes.statusBar` point
  (text/icon + tooltip + command), optionally driven by a worker for live values.
- **Trust:** declarative shell; live values would use the existing `commands`/API surface.
  Larger because it adds a brand-new host surface, not just a contribution slot.

### 5. Settings pages (gear → `/settings`)
- **Surface:** the settings nav is **already a data-driven, context-gated list** —
  `OSS_NAV_ITEMS` → `useSettingsNavItems()` returns `{ type: "item" | "header" | "divider" }`
  entries, filtered by feature flags and disabled by agent kind, rendered by
  `settings-navigation.tsx` (`settings-desktop-sidebar.tsx` / mobile drawer). Pages are routed
  under `routes/settings.tsx`.
- **Analog:** VS Code `contributes.configuration` + setting UIs.
- **Shape:** a `contributes.settingsPages` entry (`{ id, title, page, when? }`) whose nav item
  is **merged into `useSettingsNavItems()`** and whose body is a **sandboxed webview** (reuse
  `contributes.views` / `ExtensionWebview`).
- **The one piece of new plumbing:** settings pages are static file-routes, so contributed
  pages can't add routes at runtime — add a single **catch-all child route**
  (`/settings/x/:extensionId`) that mounts the host `ExtensionWebview` for the selected page
  (mirrors the main-area `ExtensionPanel`).
- **Trust:** **no new capability** if the page is *extension-owned* and persists through the
  existing `storage` capability. A host-schema-driven settings form that writes *host* settings
  is a separate, sensitive, later capability — defer it.

### 6. Custom event / message renderers
- **Surface:** the conversation event renderers in `src/components/conversation-events/`.
- **Analog:** VS Code custom editors / notebook renderers.
- **Shape:** let an extension register a **webview renderer for a custom event/message type**,
  fed render data over RPC. Powerful for domain-specific output (compliance results, charts).
- **Trust:** webview sandbox already prevents host-data access and network egress; the new
  surface is a render-data API (read-only) gated by `conversation:read` or a narrower
  capability. Performance/throughput of the relay needs care (proposal open question #4).

### 7. Theming and keybindings
- **Surface:** the app theme tokens and the keybinding layer behind the command menu.
- **Analog:** `contributes.themes` / `contributes.keybindings`.
- **Shape:** declarative theme/keybinding contribution points. Proposal lists these as a
  natural Phase 2 "once commands land."
- **Trust:** declarative; the main risk is collision/precedence rules, not security.

### 8. Imperative API growth (the `agentCanvas` surface)
The worker/webview API is intentionally minimal today (`conversation.getActive`, `storage.*`,
`window.showInformationMessage`, `commands.execute`). Likely additions, each behind its own
capability + consent label:

- `window.showWarning/ErrorMessage` (no new capability) and richer notifications.
- `conversation.subscribe` / event stream - **read**, behind `conversation:read`.
- `conversation.postMessage` / `conversation.run` - **write**, behind a new
  `conversation:write` capability (this is what makes #2 and #6 actionable).
- `workspace`/`files` read - behind a new, clearly-scoped capability (high sensitivity;
  weigh carefully).
- `settings`/`environment` read - behind a new capability.

Keep this driven by **real consumers** (proposal open question #3): add a method when an
extension point needs it, not speculatively.

---

## Explicitly out of scope (and why)

These come from the proposal and remain the right boundaries:

- **Direct editor/host-DOM access.** Extensions never touch the editor or app DOM - custom UI
  must go through a **sandboxed webview**. This is the core security guarantee; a "render in
  the host DOM" point would break it and should not be added.
- **Extension-to-extension APIs / dependency graphs.** No inter-extension imports for now.
- **Native (non-webview) rich tree views** beyond simple declarative items.

---

## Guardrails to preserve when extending

Whatever point you add, keep these invariants - they are what make the system safe to grow:

1. **Declarative-first.** Prefer a static `contributes.*` point over an API call. Rendering a
   contributed item must never execute extension code.
2. **Least privilege + consent.** Any new data or action goes behind a `KNOWN_CAPABILITIES`
   entry surfaced in the install dialog (all-or-nothing). Declarative-only points need none.
3. **Isolation is non-negotiable.** Logic stays in the Web Worker; custom UI stays in the
   `sandbox="allow-scripts"`, opaque-origin, `connect-src 'none'` iframe. No new point may
   hand an extension the host origin, cookies, or network.
4. **Stable, per-extension contracts.** Register/unregister by `extensionId`; derive flat
   lists for stable selector references; never let one extension's contribution destabilize
   another's.
5. **Versioned host API.** Treat the `agentCanvas` API as a public contract gated by
   `engines.agentCanvas`; additive changes are free, breaking changes bump the host major.

## See also

- [`../src/extensions/README.md`](../src/extensions/README.md) - architecture, file map, and
  the source-ref/security details referenced above.
- [`proposals/ui-extensions.md`](./proposals/ui-extensions.md) - sections 2 (VS Code mapping),
  4 (technical design), 6 (out of scope), 7 (open questions).
- [`EXTENSIONS.md`](./EXTENSIONS.md) - the user- and author-facing guide.
