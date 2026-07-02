import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { useSettings } from "#/hooks/query/use-settings";
import { useAcpModelContext } from "#/hooks/use-acp-model-context";
import { useEffectivePendingAgentProfile } from "#/hooks/use-agent-profiles";
import { useAgentProfileSelectionStore } from "#/stores/agent-profile-selection-store";
import { useOptionalConversationId } from "#/hooks/use-conversation-id";
import {
  getAcpPreferredDefaultModel,
  getAcpProvider,
  labelForAcpModel,
  resolveEffectiveAcpModel,
  type ACPModelOption,
} from "#/constants/acp-providers";

export interface ChatInputModelState {
  isAcpContext: boolean;
  displayModel: string | null;
  currentModelId: string | null;
  availableAcpModels: ACPModelOption[];
  showAcpPicker: boolean;
  switchConversationId: string | null;
  /**
   * True on home when a pending agent profile drives the model affordance.
   * Model picks must then update the transient pending selection (applied
   * with the profile at conversation start) instead of PATCHing global
   * settings — which the profile's diff would overwrite anyway.
   */
  isPendingProfileMode: boolean;
  destinationPath: "/settings/agent" | "/settings";
  destinationLabel: string;
}

export function useChatInputModelState(): ChatInputModelState {
  const { data: conversation } = useActiveConversation();
  const { data: settings } = useSettings();
  const { conversationId } = useOptionalConversationId();
  const pendingProfile = useEffectivePendingAgentProfile();
  const pendingModel = useAgentProfileSelectionStore(
    (state) => state.pendingModel,
  );
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
    // Pending-profile mode: the transient pick, else the engine's preferred
    // default — matching exactly what conversation start will send.
    currentModelId = resolveEffectiveAcpModel({
      configured: pendingModel,
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
  const availableAcpModels = acpProvider?.available_models ?? [];
  const showAcpPicker = isAcpContext && availableAcpModels.length > 0;
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
    destinationPath,
    destinationLabel,
  };
}
