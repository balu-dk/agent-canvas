# Plan: Agent Profiles (engine + provider + credential, model chosen at chat)

> **Purpose:** Living plan for adding named agent profiles to Agent Canvas.
> If picking this up cold: read the "Architecture facts" section, then continue
> from the first unchecked step. Companion backend work lives in the owner's
> OpenHands fork (`~/Documents/projects/openhands`, see its
> `docs/agent-context/multi-agent-refactor-plan.md`).
>
> Owner's design (2026-07-02): profiles bundle **engine + provider + credential**;
> the **model stays a free choice in the chat input** (the existing dropdown).
> Example set:
> - Profile #1: ACP → Claude Code → credential A (OAuth token, account 1)
> - Profile #2: ACP → Claude Code → credential B (OAuth token, account 2)
> - Profile #3: ACP → Codex → credential
> - Profile #4: OpenHands → any model → LLM key (via existing LLM settings/profiles)

## Status — implemented 2026-07-02

- [x] Step 1: Profile store (`src/api/agent-profile-store.ts`) — per-backend
      localStorage, CRUD + default pointer + `getProfileCredentialAliases`.
      Transient per-tab pick: `src/stores/agent-profile-selection-store.ts`.
- [x] Step 2: Credential aliases in the start-request adapter
      (`credentialAliases` on `StartConversationOptions`; aliased env vars win
      over same-name secrets).
- [x] Step 3: Profile picker pill in the chat input
      (`src/components/features/chat/agent-profile-picker.tsx`, mounted in
      `chat-input-actions.tsx`, home/pre-conversation only; hidden until at
      least one profile exists).
- [x] Step 4: Threaded through `useCreateConversation` (explicit variable →
      picker selection → default profile; explicit null = global settings) and
      `AgentServerConversationService.createConversation`; local path PATCHes
      the profile diff before the settings snapshot and passes the aliases;
      profile name stamped into conversation metadata (`agent_profile`).
- [x] Step 5: Manager UI on Settings → Agent
      (`src/components/features/settings/agent-profiles-section.tsx`):
      list/create/delete/set-default; credential paste creates a suffixed
      secret (e.g. `CLAUDE_CODE_OAUTH_TOKEN_WORK`) via SecretsService.
- [x] Step 6: Cloud path sends the profile's `agent_settings_diff` on
      `AppConversationStartRequest` (requires the per-session engine feature
      on the app-server backend; credential aliasing on cloud still needs a
      backend-side alias feature — see the openhands repo plan).
- [x] Step 7: Tests (`__tests__/api/agent-profile-store.test.ts`, alias cases
      in `__tests__/api/agent-server-adapter.test.ts`, updated
      `home-chat-launcher.test.tsx` assertions) + typecheck/eslint/prettier
      green. i18n keys `AGENT_PROFILE$*` added in all 15 languages.

### Addendum (2026-07-02, after first live test)

- [x] **Model dropdown follows the picked profile.** Bug found in live testing:
      with profile "Test 2" (Codex) picked, the chat model dropdown still
      showed the GLOBAL agent's (Claude) models, and a pre-start model pick
      would have been overwritten by the profile diff. Fixed:
      `useEffectivePendingAgentProfile()` (`src/hooks/use-agent-profiles.ts`,
      also new home of the profiles subscription) now drives
      `use-acp-model-context` + `use-chat-input-model-state` on home; model
      picks in pending-profile mode go to the transient
      `pendingModel` on the selection store (reset on profile change) and ride
      the profile's diff at start (`agentProfileModel` param through
      `useCreateConversation` → `createConversation`).

**Architectural direction (owner decision, 2026-07-02):** "global agent
settings" should stop being a user-facing concept. The agent-server's settings
slot remains as the *mechanism* (each conversation snapshots it at start; a
profile pick applies onto it), but the UX end-state is profiles-only:
Settings → Agent should BE the default profile's editor, and every
engine/model affordance should resolve through the pending/active profile.
The addendum above is the first step; folding the Settings → Agent page into
the profile manager is the remaining step.

### Addendum 2 (2026-07-02, "no more global agent" pass — owner pushback)

The slot-PATCH shortcut is gone. Profiles are now built DIRECTLY into each
conversation's payload:

- [x] **Per-conversation overlay instead of slot writes:**
      `buildStartConversationRequest` gained `agentSettingsOverlay`, merged
      over the (encrypted) saved agent settings when building the payload.
      ACP profiles start conversations with ZERO settings-slot writes — the
      overlay carries `{agent_kind, acp_server, acp_command, acp_args,
      acp_model}`; credentials still ride LookupSecret aliases. The ONE
      remaining slot write: an OpenHands profile starting while the slot
      holds an ACP config (the LLM API key can't ride a client-side overlay,
      so the slot flips + the active LLM profile is re-activated server-side
      to restore model+key). Documented in
      `agent-server-conversation-service.api.ts`.
- [x] **OpenHands-only settings pages un-locked:** nav greying + loader
      redirect removed; `OpenHandsEngineGate`
      (`src/components/features/settings/openhands-engine-gate.tsx`, rendered
      from `routes/settings.tsx`) explains the situation in-page and offers a
      one-click "Activate OpenHands engine" (flip + LLM-profile reactivate).
- [x] **Agent page is profiles-first:** the legacy applied-engine form is
      collapsed behind an "Applied engine (advanced)" disclosure with an
      explainer; profiles gained **edit-in-place** (blank credential on edit
      = keep the stored secret).
- Known cosmetic leftover: the applied-engine form and the settings badge
  still describe slot state; full folding of that form into the default
  profile's editor remains open below.

### Addendum 3 (2026-07-02): OpenHands-engine settings grouped under one tab

- [x] LLM / Condenser / Verification are engine-specific, so they moved under
      a single **"OpenHands"** nav entry (`/settings/openhands`,
      `src/routes/openhands-settings.tsx`) with internal sub-tabs driven by
      `?tab=` — the existing screen components render unchanged inside it.
      Legacy deep links (`/settings/llm|condenser|verification`) redirect via
      `openhands-settings-redirect.tsx`. Nav constants collapsed to one item
      (still `disabledByAcp` → renders the in-page gate);
      `getFirstAvailablePath` updated; `hide_llm_settings` now hides the LLM
      sub-tab instead of a whole page. Route tests updated (no more loader
      redirect; agent-settings tests expand the Advanced disclosure).

### Addendum 4 (2026-07-02): GitHub repo listing on LOCAL backends

Canvas' repo/branch pickers (home + the in-conversation "Open Repository"
modal on the git control bar) were dead on local backends: `GitService`
returned empty pages unless `isCloudActive()`. The clone mechanism itself
already existed (Launch → metadata update + a "Clone X, checkout Y" chat
message the agent executes with `GITHUB_TOKEN`). Fixed the listing:

- [x] `src/api/git-service/github-direct.ts` — browser → api.github.com
      (GitHub REST sends `Access-Control-Allow-Origin: *`), authenticated
      with the user's PAT fetched from the backend's secrets store
      (`SettingsClient.getSecret("GITHUB_TOKEN")`, 5-min in-memory cache per
      backend). Lists up to 200 repos sorted by pushed_at + branch pages.
- [x] `GitService.searchGitRepositories/retrieveUserGitRepositories/
      getRepositoryBranches/searchRepositoryBranches` fall back to the direct
      path on local backends when `provider === "github"` (other providers
      still empty there).
- [x] `useUserProviders` surfaces "github" on local backends when a
      `GITHUB_TOKEN` custom secret exists (queried via
      `SecretsService.getSecrets()`), which lights up the provider/repo/branch
      dropdowns everywhere they're used.
- Requirement for users: save the PAT as a custom secret named exactly
  `GITHUB_TOKEN` — the same secret the agent uses to clone.

Not done / follow-ups:
- [ ] Fully fold the applied-engine (advanced) form into the default
      profile's editor and retire the slot as a visible concept.
- [ ] Cloud-path credential aliasing (backend `acp_credential_aliases`).
- [ ] Manual end-to-end run with two Claude Code profiles (needs two tokens).
- [ ] Non-GitHub providers (GitLab etc.) on local backends — same
      direct-API pattern can be replicated if needed.
- Pre-existing test failures on main (unrelated):
  `recommended-automations.test.tsx` (10), `use-websocket.test.ts` (1),
  `cloud/conversation-runtime-info.test.ts` (1).

## Architecture facts (verified 2026-07-02)

- Canvas is multi-backend: registry in localStorage (`src/api/backend-registry/`),
  `kind: "local" | "cloud"`. Local path talks directly to an agent-server via
  `@openhands/typescript-client`; cloud path posts a flat
  `AppConversationStartRequest` to `/api/v1/app-conversations`.
- **Local conversation start** (`agent-server-conversation-service.api.ts` →
  `buildStartConversationRequestWithEncryptedSettings` →
  `buildStartConversationRequest` in `src/api/agent-server-adapter.ts`):
  reads GLOBAL settings only; agent settings are fetched **encrypted**
  (`getSettingsForConversation`) so the browser never sees raw keys — which
  means the payload's engine shape follows the *global* `agent_kind`.
- **Secrets:** every saved custom secret is attached to every conversation as
  `secrets[secret.name] = LookupSecret{url: /api/settings/secrets/<name>}`
  (adapter ~L988-1013). The env var the subprocess sees = the dict KEY; the
  stored secret = the URL. Key and storage name are already decoupled on the
  wire — this is what makes per-profile credentials possible.
- **Engine/provider diffs:** `buildAcpAgentSettingsDiff(providerKey, {command, model})`
  in `src/constants/acp-providers.ts` builds the `agent_settings_diff` the
  settings PATCH expects; `{agent_kind:"openhands"}` switches back. Credential
  field names per provider: `getAcpProviderSecrets(key)`; canonical
  subscription var for claude-code is `CLAUDE_CODE_OAUTH_TOKEN`
  (`ACP_RESERVED_CREDENTIALS`). Conflict pairs (OAuth vs API key):
  `getAcpCredentialConflicts`.
- **Precedent for per-conversation choice:** the chat input already has a
  model dropdown (`chat-input-model.tsx`, `use-chat-input-model-state.ts`) and
  an LLM-profile switcher (`useSwitchLlmProfile` → `/activate` from home).
  Client-side per-conversation metadata store:
  `src/api/conversation-metadata-store.ts` (stamps `active_profile` etc.).

## Design decisions

1. **Profiles live client-side, scoped per backend id** (localStorage), like
   the backend registry and conversation metadata store. A profile:
   ```ts
   interface AgentProfile {
     id: string;
     name: string;                     // "Claude Code (privat)"
     engine: "openhands" | string;     // ACP provider key or "custom"
     command?: string[];               // custom/overridden ACP command
     credentialSecretName?: string | null; // stored secret to inject as the
                                           // provider's canonical env var
   }
   ```
   Model is deliberately NOT part of a profile (chat-input concern).
   OpenHands profiles carry no credential — the LLM key rides the existing
   LLM settings/LLM profiles.
2. **Selecting a profile before start = PATCH settings with the profile's
   diff** (reuse `buildAcpAgentSettingsDiff` + `useSaveSettings`), then create
   the conversation. This mirrors how LLM-profile `/activate` works from home
   and sidesteps the encrypted-settings/cross-kind problem entirely: each
   running conversation snapshots its agent settings at start, so concurrent
   conversations on different engines are unaffected by later switches. The
   global Settings → Agent page effectively shows "the last used profile".
3. **Credential aliasing at start:** `buildStartConversationRequest` gains
   `credentialAliases?: Record<string, string>` (envName → storedSecretName).
   For a profile with `credentialSecretName`, the alias
   `{[canonicalEnvVar]: credentialSecretName}` overrides the default
   same-name LookupSecret so the subprocess sees the *profile's* token under
   the canonical env name. Other secrets attach as today.
4. **Per-profile secrets are ordinary custom secrets** with a suffixed name
   (e.g. `CLAUDE_CODE_OAUTH_TOKEN_WORK`), created via the existing Secrets
   API from the profile manager UI.
5. **Cloud path:** send the profile's engine as `agent_settings_diff` on
   `AppConversationStartRequest` — the field exists in the owner's OpenHands
   backend fork (per-conversation engine binding). Credential aliasing on the
   cloud path needs a matching backend feature (planned there as
   `acp_credential_aliases`); until then cloud profiles switch engine only.

## Steps (detail)

1. **`src/api/agent-profile-store.ts`** — CRUD + default pointer, keyed by
   active backend id (pattern: `conversation-metadata-store.ts`). Export
   `getAgentProfiles/saveAgentProfile/deleteAgentProfile/getDefaultAgentProfile/setDefaultAgentProfile`.
2. **Adapter:** add `credentialAliases` to `StartConversationOptions` and
   apply in the secrets block; thread through
   `buildStartConversationRequestWithEncryptedSettings`.
3. **Chat input picker** (home only, pre-conversation): a dropdown listing
   profiles by name next to the model dropdown; selection stores the pending
   profile (zustand or local state in home) and PATCHes settings via the
   profile diff. Show engine icon (reuse `resolveAcpProviderIcon`).
4. **`use-create-conversation` / `createConversation`:** accept
   `agentProfile?: AgentProfile`; local path passes
   `credentialAliases` when the profile has a credential; stamp
   `agent_profile: name` into the conversation metadata store.
5. **Manager UI:** section on `src/routes/agent-settings.tsx` listing
   profiles with create/edit/delete/set-default; the create form = engine
   picker (OpenHands + ACP_PROVIDERS + custom) + optional credential paste
   (creates the suffixed secret via SecretsService).
6. **Cloud path:** include `agent_settings_diff` in the
   `AppConversationStartRequest` when a profile is selected.
7. Tests (vitest) for the store + adapter aliasing; `npm run lint`.
