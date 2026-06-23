import { useTranslation } from "react-i18next";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { settingsLikeMainScrollClassName } from "#/utils/settings-like-page-layout-classes";
import AppSettingsScreen from "./app-settings";

/**
 * Application preferences as a top-level rail destination. The "Settings" hub
 * was dissolved (#1456), so this page supplies its own title header that the
 * old settings layout used to provide.
 */
export default function ApplicationScreen() {
  const { t } = useTranslation("openhands");

  return (
    <main
      data-testid="application-screen"
      className={settingsLikeMainScrollClassName}
    >
      <div className="mx-auto flex w-full min-w-0 max-w-[800px] flex-col gap-6">
        <header className="space-y-1">
          <Typography.H2>{t(I18nKey.SIDEBAR$SETTINGS)}</Typography.H2>
          <p className="text-sm leading-5 text-tertiary-light">
            {t(I18nKey.SETTINGS$PAGE_APPLICATION_SUBLINE)}
          </p>
        </header>
        <AppSettingsScreen />
      </div>
    </main>
  );
}
