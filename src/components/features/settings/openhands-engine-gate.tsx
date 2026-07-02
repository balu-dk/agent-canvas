import React from "react";
import { useTranslation } from "react-i18next";
import { Typography } from "#/ui/typography";
import { BrandButton } from "#/components/features/settings/brand-button";
import { I18nKey } from "#/i18n/declaration";
import { useSettings } from "#/hooks/query/use-settings";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useSwitchLlmProfile } from "#/hooks/mutation/use-switch-llm-profile";
import { useLlmProfiles } from "#/hooks/query/use-llm-profiles";
import { getAcpProviderDisplayName } from "#/constants/acp-providers";
import { displayErrorToast } from "#/utils/custom-toast-handlers";

/**
 * Friendly in-page gate for settings sections that only apply to the
 * built-in OpenHands engine (LLM, Condenser, Verification) while an ACP
 * agent currently occupies the active settings slot.
 *
 * Replaces the old UX of greying the nav items out and redirecting: the
 * pages stay reachable, explain themselves, and offer a one-click switch.
 * Activating flips the slot to OpenHands and re-activates the active LLM
 * profile so the model + key are restored server-side. Agent profiles are
 * unaffected — the next ACP-profile conversation re-applies its engine.
 */
export function OpenHandsEngineGate() {
  const { t } = useTranslation("openhands");
  const { data: settings } = useSettings();
  const { data: llmProfiles } = useLlmProfiles();
  const { mutateAsync: saveSettings } = useSaveSettings();
  const switchProfile = useSwitchLlmProfile();
  const [isActivating, setIsActivating] = React.useState(false);

  const acpServerKey =
    typeof settings?.agent_settings?.acp_server === "string"
      ? settings.agent_settings.acp_server
      : null;
  const agentName = getAcpProviderDisplayName(acpServerKey) ?? "ACP";

  const handleActivate = async () => {
    setIsActivating(true);
    try {
      await saveSettings({ agent_settings_diff: { agent_kind: "openhands" } });
      // Restore the active LLM profile's model + key onto the freshly reset
      // OpenHands slot (the kind flip starts from clean defaults).
      const activeProfile = llmProfiles?.active_profile;
      if (activeProfile) {
        await switchProfile.mutateAsync({
          conversationId: null,
          profileName: activeProfile,
        });
      }
    } catch (error) {
      displayErrorToast(error instanceof Error ? error.message : String(error));
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <section
      data-testid="openhands-engine-gate"
      className="flex max-w-2xl flex-col gap-4 rounded-lg border border-[var(--oh-border)] p-6"
    >
      <Typography.H3>{t(I18nKey.SETTINGS$OPENHANDS_ONLY_TITLE)}</Typography.H3>
      <Typography.Text className="text-sm text-[var(--oh-text-dim)]">
        {t(I18nKey.SETTINGS$OPENHANDS_ONLY_DESCRIPTION, { agentName })}
      </Typography.Text>
      <div>
        <BrandButton
          testId="activate-openhands-engine-button"
          type="button"
          variant="primary"
          isDisabled={isActivating}
          onClick={handleActivate}
        >
          {t(I18nKey.SETTINGS$ACTIVATE_OPENHANDS)}
        </BrandButton>
      </div>
    </section>
  );
}
