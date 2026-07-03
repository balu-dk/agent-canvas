import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { useAcpModelContext } from "#/hooks/use-acp-model-context";
import { useEffectivePendingAgentProfile } from "#/hooks/use-agent-profiles";
import { useAgentProfileSelectionStore } from "#/stores/agent-profile-selection-store";
import { useAcpModelMemoryStore } from "#/stores/acp-model-memory-store";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import {
  getAcpPreferredDefaultModel,
  getAcpProvider,
  labelForAcpModel,
  resolveEffectiveAcpModel,
  type ACPModelOption,
} from "#/constants/acp-providers";

/** An ACP model picker option; `custom` marks a user-entered, removable id. */
export interface ChatInputAcpModel extends ACPModelOption {
  custom?: boolean;
}

export interface ChatInputModelState {
  isAcpContext: boolean;
  displayModel: string | null;
  currentModelId: string | null;
  availableAcpModels: ChatInputAcpModel[];
  showAcpPicker: boolean;
  switchConversationId: string | null;
  /**
   * True on home when a pending agent profile drives the model affordance.
   * Model picks must then update the transient pending selection (applied
   * with the profile at conversation start) instead of PATCHing global
   * settings — which the profile's diff would overwrite anyway.
   */
  isPendingProfileMode: boolean;
  /**
   * The ACP engine (provider key) in effect, or null outside an ACP context.
   * Together with {@link backendId} it scopes where custom-model picks and the
   * last-used default are remembered.
   */
  acpEngine: string | null;
  /** Active backend id — scopes the persisted ACP model memory. */
  backendId: string;
  destinationPath: "/settings/agent" | "/settings";
  destinationLabel: string;
}

export function useChatInputModelState(): ChatInputModelState {
  const { data: conversation } = useActiveConversation();
  const { data: settings } = useSettings();
  const { backend } = useActiveBackend();
  const { conversationId } = useOptionalConversationId();
  const pendingProfile = useEffectivePendingAgentProfile();
  const pendingModel = useAgentProfileSelectionStore(
    (state) => state.pendingModel,
  );
  const customModelsByKey = useAcpModelMemoryStore(
    (state) => state.customModels,
  );
  const lastModelByKey = useAcpModelMemoryStore((state) => state.lastModel);
  const {
    isActiveAcpConversation,
    isHomeAcp,
    isAcpContext,
    destinationPath,
    destinationLabel,
  } = useAcpModelContext();

  // On home a pending agent profile decides the engine — the model list and
  // current model must follow the profile, not the global settings it will
  // overwrite at start (Test 2 = Codex must show Codex models).
  const isPendingProfileMode = !conversation && pendingProfile !== null;

  const acpServerKey = isActiveAcpConversation
    ? conversation?.acp_server
    : isHomeAcp
      ? isPendingProfileMode
        ? pendingProfile!.engine
        : typeof settings?.agent_settings?.acp_server === "string"
          ? settings.agent_settings.acp_server
          : null
      : null;
  const acpProvider = isAcpContext ? getAcpProvider(acpServerKey) : undefined;
  const acpEngine =
    isAcpContext && typeof acpServerKey === "string" ? acpServerKey : null;

  // Persisted per backend+engine: custom model ids the user typed, and the
  // last-used model. Scoped so a Codex id never shows in the Claude picker.
  const memoryKey = acpEngine ? `${backend.id}::${acpEngine}` : null;
  const customModelIds = memoryKey ? (customModelsByKey[memoryKey] ?? []) : [];
  const lastUsedModel = memoryKey ? (lastModelByKey[memoryKey] ?? null) : null;

  const acpConfiguredModel =
    typeof settings?.agent_settings?.acp_model === "string"
      ? settings.agent_settings.acp_model
      : null;

  let currentModelId: string | null = null;
  if (isActiveAcpConversation) {
    // ACP conversations store llm_model as the acp_model (persisted at
    // creation time). Use it directly if available; fall back to the
    // settings-configured model or provider default so the chip stays visible.
    currentModelId =
      conversation?.llm_model ??
      resolveEffectiveAcpModel({
        configured: acpConfiguredModel,
        providerDefault: getAcpPreferredDefaultModel(acpServerKey),
      });
  } else if (isHomeAcp && isPendingProfileMode) {
    // Pending-profile mode: the transient pick, else the last-used model for
    // this engine (persisted), else the engine's preferred default — matching
    // exactly what conversation start will send (which applies the same
    // last-used fallback).
    currentModelId = resolveEffectiveAcpModel({
      configured: pendingModel ?? lastUsedModel,
      providerDefault: getAcpPreferredDefaultModel(acpServerKey),
    });
  } else if (isHomeAcp) {
    currentModelId = resolveEffectiveAcpModel({
      configured: acpConfiguredModel,
      // Preferred default (Vertex-safe for Gemini) — must match what the
      // start request would substitute for an unconfigured model.
      providerDefault: getAcpPreferredDefaultModel(acpServerKey),
    });
  } else {
    currentModelId = conversation?.llm_model ?? settings?.llm_model ?? null;
  }

  const displayModel =
    currentModelId && isAcpContext
      ? (labelForAcpModel(acpServerKey, currentModelId) ?? currentModelId)
      : currentModelId;
  // Provider's built-in models plus any custom ids the user has saved for this
  // engine (deduped). Custom entries are flagged so the picker can offer to
  // remove them.
  const providerModels = acpProvider?.available_models ?? [];
  const availableAcpModels: ChatInputAcpModel[] = [
    ...providerModels,
    ...customModelIds
      .filter((id) => !providerModels.some((model) => model.id === id))
      .map((id) => ({ id, label: id, custom: true })),
  ];
  // In an ACP context we always render the picker so the "Custom…" affordance
  // is reachable even when the provider ships no built-in model list.
  const showAcpPicker = isAcpContext;
  const switchConversationId = isActiveAcpConversation
    ? (conversationId ?? null)
    : null;

  return {
    isAcpContext,
    displayModel,
    currentModelId,
    availableAcpModels,
    showAcpPicker,
    switchConversationId,
    isPendingProfileMode,
    acpEngine,
    backendId: backend.id,
    destinationPath,
    destinationLabel,
  };
}
