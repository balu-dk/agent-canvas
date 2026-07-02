import { useConfig } from "#/hooks/query/use-config";
import { OSS_NAV_ITEMS, SettingsNavItem } from "#/constants/settings-nav";
import { isSettingsPageHidden } from "#/utils/settings-utils";
import { I18nKey } from "#/i18n/declaration";
import { useActiveBackend } from "#/contexts/active-backend-context";

export type SettingsNavRenderedItem =
  | {
      type: "item";
      item: SettingsNavItem;
      disabled?: boolean;
      disabledAgentName?: string;
    }
  | { type: "header"; text: I18nKey }
  | { type: "divider" };

export function useSettingsNavItems(): SettingsNavRenderedItem[] {
  const { data: config } = useConfig();
  const { backend } = useActiveBackend();
  const featureFlags = config?.feature_flags;

  return OSS_NAV_ITEMS.filter(
    (item) => !isSettingsPageHidden(item.to, featureFlags),
  ).map((item) => {
    // Local backends present "LLM Profiles" as the section name + subtitle
    // for the ``/settings`` entry; cloud backends keep the canonical "LLM".
    // Apply the rename before the ACP disable check so the disabled tooltip
    // still names the visible label, not a stale one.
    const renamedItem =
      item.to === "/settings"
        ? {
            ...item,
            text:
              backend.kind === "local"
                ? I18nKey.SETTINGS$LLM_PROFILES
                : item.text,
            subtitle:
              backend.kind === "local"
                ? I18nKey.SETTINGS$PAGE_LLM_PROFILES_SUBLINE
                : item.subtitle,
          }
        : item;

    // NOTE: ``disabledByAcp`` no longer greys nav items out. Those pages
    // stay reachable and render an in-page OpenHandsEngineGate when an ACP
    // agent occupies the applied engine slot — locking settings sections on
    // ephemeral slot state was hostile UX under the agent-profiles model.
    return { type: "item", item: renamedItem };
  });
}
