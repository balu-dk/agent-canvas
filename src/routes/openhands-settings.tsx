import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { useConfig } from "#/hooks/query/use-config";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import LlmSettingsRoute from "./llm-settings";
import CondenserSettingsScreen from "./condenser-settings";
import VerificationSettingsScreen from "./verification-settings";

export const handle = { hideTitle: false };

type OpenHandsTab = "llm" | "condenser" | "verification";

/**
 * Grouped settings for the built-in OpenHands engine. LLM, Condenser and
 * Verification only mean anything when a conversation runs the OpenHands
 * engine, so they live under one "OpenHands" nav entry instead of three
 * top-level tabs — the rest of the nav stays engine-agnostic (Agent
 * profiles, Application, Secrets).
 *
 * The active sub-tab rides `?tab=` so old deep links
 * (`/settings/llm` etc.) can redirect here losslessly.
 */
export default function OpenHandsSettingsScreen() {
  const { t } = useTranslation("openhands");
  const { data: config } = useConfig();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabs: Array<{ key: OpenHandsTab; label: string }> = [
    ...(config?.feature_flags?.hide_llm_settings
      ? []
      : [{ key: "llm" as const, label: t(I18nKey.SETTINGS$NAV_LLM) }]),
    { key: "condenser", label: t(I18nKey.SETTINGS$NAV_CONDENSER) },
    { key: "verification", label: t(I18nKey.SETTINGS$NAV_VERIFICATION) },
  ];

  const requestedTab = searchParams.get("tab") as OpenHandsTab | null;
  const activeTab: OpenHandsTab = tabs.some((tab) => tab.key === requestedTab)
    ? (requestedTab as OpenHandsTab)
    : tabs[0].key;

  const selectTab = (tab: OpenHandsTab) => {
    setSearchParams({ tab }, { replace: true });
  };

  return (
    <div
      data-testid="openhands-settings-screen"
      className="flex flex-col gap-6"
    >
      <div
        role="tablist"
        className="flex w-fit rounded-lg border border-[#3D4046] overflow-hidden"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            data-testid={`openhands-settings-tab-${tab.key}`}
            className={cn(
              "px-4 py-2 text-sm transition-colors",
              activeTab === tab.key
                ? "bg-[#3D4046] font-semibold text-white"
                : "text-[#A3A3A3] hover:text-white",
            )}
            onClick={() => selectTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "llm" && <LlmSettingsRoute />}
      {activeTab === "condenser" && <CondenserSettingsScreen />}
      {activeTab === "verification" && <VerificationSettingsScreen />}
    </div>
  );
}
