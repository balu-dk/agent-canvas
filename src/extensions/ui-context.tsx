import React from "react";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useConfig } from "#/hooks/query/use-config";
import { useSettings } from "#/hooks/query/use-settings";
import { useAgentState } from "#/hooks/use-agent-state";
import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { EXTENSIONS_ENABLED } from "./feature-flag";
import type { WhenContext } from "./when";

/**
 * The host **UI-context**: a small, whitelisted, read-only set of facts that a
 * declarative `when` clause may gate on (see `when.ts`). These are facts the host
 * already derives for its own built-ins — backend kind, agent state, whether email
 * is verified, whether a repo is connected, and a couple of feature flags — so
 * exposing them to gating needs **no capability**. They are host data, never
 * extension data, and reading them runs no extension code.
 *
 * Keys (stable contract authors target in `when`):
 * - `backend`            — `"cloud"` | `"local"`
 * - `agentState`         — the active conversation's agent state (e.g. `running`)
 * - `emailVerified`      — boolean; `false` only when the host says so explicitly
 * - `repoConnected`      — boolean; a repository is attached to the conversation
 * - `flag.hide_llm_settings`, `flag.hide_users_page` — host feature flags
 */

/** Shared empty context so consumers without a provider get a stable reference. */
const EMPTY_UI_CONTEXT: WhenContext = {};

const UiContext = React.createContext<WhenContext>(EMPTY_UI_CONTEXT);

/**
 * Read the host UI-context. Returns a shared empty object when no provider is
 * mounted (extensions disabled, or a unit test rendering a bare component), so
 * unconditional contributions render without any provider plumbing.
 */
export function useUiContext(): WhenContext {
  return React.useContext(UiContext);
}

/**
 * Provide an explicit UI-context value. Used by {@link ExtensionUiContextProvider}
 * (which derives the value from host state) and by tests that want to assert
 * `when`-gating against a fixed set of facts.
 */
export function UiContextProvider({
  value,
  children,
}: {
  value: WhenContext;
  children: React.ReactNode;
}) {
  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

/**
 * Derive the whitelisted UI-context from existing host state and provide it to
 * `when`-gated contributions. It mirrors the gating the app already does for
 * built-ins (see `sidebar.tsx`, `use-settings-nav-items.ts`, the conversation-tabs
 * menu) so contributed items can hide/show consistently.
 *
 * Mounted deep enough in the tree (see `routes/root-layout.tsx`) to read the
 * navigation/conversation context; gated behind the feature flag by the exported
 * {@link ExtensionUiContextProvider} wrapper so it adds nothing when extensions ship
 * dark.
 */
function ExtensionUiContextProviderInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { backend } = useActiveBackend();
  const { data: settings } = useSettings();
  const { data: config } = useConfig();
  const { curAgentState } = useAgentState();
  const { data: conversation } = useActiveConversation();

  const featureFlags = config?.feature_flags;
  // Mirror the built-in gating: treat email as verified unless explicitly `false`.
  const emailVerified = settings?.email_verified !== false;
  const repoConnected = Boolean(conversation?.selected_repository);
  const hideLlmSettings = Boolean(featureFlags?.hide_llm_settings);
  const hideUsersPage = Boolean(featureFlags?.hide_users_page);

  const value = React.useMemo<WhenContext>(
    () => ({
      backend: backend.kind,
      agentState: curAgentState,
      emailVerified,
      repoConnected,
      "flag.hide_llm_settings": hideLlmSettings,
      "flag.hide_users_page": hideUsersPage,
    }),
    [
      backend.kind,
      curAgentState,
      emailVerified,
      repoConnected,
      hideLlmSettings,
      hideUsersPage,
    ],
  );

  return <UiContextProvider value={value}>{children}</UiContextProvider>;
}

/**
 * Feature-flag gate for {@link ExtensionUiContextProviderInner}. A no-op pass-through
 * when the extension system is disabled, so the host derives no extra state and pays
 * no cost unless `VITE_ENABLE_EXTENSIONS=true`. When disabled, `useUiContext()` falls
 * back to the shared empty context, which is harmless since the contribution registry
 * is also empty.
 */
export function ExtensionUiContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!EXTENSIONS_ENABLED) {
    return <>{children}</>;
  }
  return (
    <ExtensionUiContextProviderInner>
      {children}
    </ExtensionUiContextProviderInner>
  );
}
