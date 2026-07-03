import { useMemo, useState } from "react";
import { Outlet, redirect, useLocation, useMatches } from "react-router";
import { useTranslation } from "react-i18next";
import { Route } from "./+types/settings";
import OptionService from "#/api/option-service/option-service.api";
import { queryClient } from "#/query-client-config";
import { SettingsLayout } from "#/components/features/settings";
import { WebClientConfig } from "#/api/option-service/option.types";
import { QUERY_KEYS, CONFIG_CACHE_OPTIONS } from "#/hooks/query/query-keys";
import { Typography } from "#/ui/typography";
import { useBreakpoint } from "#/hooks/use-breakpoint";
import { useSettingsNavItems } from "#/hooks/use-settings-nav-items";
import { OSS_NAV_ITEMS } from "#/constants/settings-nav";
import {
  getFirstAvailablePath,
  isSettingsPageHidden,
} from "#/utils/settings-utils";
import { SettingsSectionHeaderProvider } from "#/contexts/settings-section-header-context";
import { OpenHandsEngineGate } from "#/components/features/settings/openhands-engine-gate";
import { useSettings } from "#/hooks/query/use-settings";
import { useEffectivePendingAgentProfile } from "#/hooks/use-agent-profiles";

export const clientLoader = async ({ request }: Route.ClientLoaderArgs) => {
  const url = new URL(request.url);
  const { pathname } = url;

  const config = await queryClient.fetchQuery<WebClientConfig>({
    queryKey: QUERY_KEYS.WEB_CLIENT_CONFIG,
    queryFn: OptionService.getConfig,
    ...CONFIG_CACHE_OPTIONS,
  });

  const featureFlags = config?.feature_flags;

  if (isSettingsPageHidden(pathname, featureFlags)) {
    const fallbackPath = getFirstAvailablePath(featureFlags);
    if (fallbackPath && fallbackPath !== pathname) {
      return redirect(fallbackPath);
    }
  }

  // NOTE: pages flagged ``disabledByAcp`` (LLM, Condenser, …) are no longer
  // redirected or greyed out while an ACP agent occupies the applied engine
  // slot. They stay reachable and render an in-page gate
  // ({@link OpenHandsEngineGate}) that explains the situation and offers a
  // one-click engine switch — under the agent-profiles model the applied
  // slot is ephemeral, so locking whole settings sections on it was
  // hostile UX.
  return null;
};

function SettingsScreen() {
  const { t } = useTranslation("openhands");
  const location = useLocation();
  const matches = useMatches();
  const navItems = useSettingsNavItems();
  const isMobile = useBreakpoint(768);
  const [hideSectionHeader, setHideSectionHeader] = useState(false);
  const { data: settings } = useSettings();

  // OpenHands-engine-only pages (LLM, Condenser, …) show an in-page gate when
  // the agent in effect is ACP. The SELECTED agent profile decides this, not
  // the applied slot: picking an OpenHands profile must reveal its model/LLM
  // settings immediately, without a manual engine switch. Only fall back to
  // the applied slot when no profile is in effect.
  const pendingProfile = useEffectivePendingAgentProfile();
  const effectiveIsAcp = pendingProfile
    ? pendingProfile.engine !== "openhands"
    : settings?.agent_settings?.agent_kind === "acp";
  const currentNavItem = OSS_NAV_ITEMS.find(
    (item) => item.to === location.pathname,
  );
  const showOpenHandsGate = !!currentNavItem?.disabledByAcp && effectiveIsAcp;

  const { currentSectionTitle, currentSectionSubtitle } = useMemo(() => {
    const currentRenderedItem = navItems.find(
      (item) => item.type === "item" && item.item.to === location.pathname,
    );
    if (currentRenderedItem?.type === "item") {
      return {
        currentSectionTitle: currentRenderedItem.item.text,
        currentSectionSubtitle: currentRenderedItem.item.subtitle,
      };
    }
    const firstItem = navItems.find((item) => item.type === "item");
    if (firstItem?.type === "item") {
      return {
        currentSectionTitle: firstItem.item.text,
        currentSectionSubtitle: firstItem.item.subtitle,
      };
    }
    return {
      currentSectionTitle: "SETTINGS$TITLE",
      currentSectionSubtitle: null as string | null,
    };
  }, [navItems, location.pathname]);

  const routeHandle = matches.find((m) => m.pathname === location.pathname)
    ?.handle as { hideTitle?: boolean } | undefined;
  const isMobileHub = isMobile && location.pathname === "/settings";
  const shouldHideTitle =
    routeHandle?.hideTitle === true || isMobileHub || hideSectionHeader;

  return (
    <main data-testid="settings-screen" className="min-h-0">
      <SettingsSectionHeaderProvider
        setHideSectionHeader={setHideSectionHeader}
      >
        <SettingsLayout navigationItems={navItems}>
          <div className="flex flex-col gap-6 pb-8">
            {!shouldHideTitle && (
              <header className="space-y-1">
                <Typography.H2>{t(currentSectionTitle)}</Typography.H2>
                {currentSectionSubtitle ? (
                  <p
                    data-testid="settings-page-subtitle"
                    className="text-sm leading-5 text-tertiary-light"
                  >
                    {t(currentSectionSubtitle)}
                  </p>
                ) : null}
              </header>
            )}
            {showOpenHandsGate ? <OpenHandsEngineGate /> : <Outlet />}
          </div>
        </SettingsLayout>
      </SettingsSectionHeaderProvider>
    </main>
  );
}

export default SettingsScreen;
