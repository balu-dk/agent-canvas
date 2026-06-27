import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { BrandButton } from "#/components/features/settings/brand-button";
import {
  extensionModuleCardPillClassName,
  extensionModuleCardSurfaceClassName,
} from "#/utils/extension-module-card-classes";
import type {
  ExtensionUpdate,
  InstalledExtension,
} from "#/extensions/installed-store";
import { capabilityLabelKey } from "./capability-labels";

interface InstalledExtensionCardProps {
  extension: InstalledExtension;
  onUninstall: () => void;
  /** A newer version found for this extension, if any. */
  update?: ExtensionUpdate | null;
  /** Apply the available update. */
  onUpdate?: () => void;
  /** Whether an update is currently being applied. */
  isUpdating?: boolean;
}

export function InstalledExtensionCard({
  extension,
  onUninstall,
  update,
  onUpdate,
  isUpdating = false,
}: InstalledExtensionCardProps) {
  const { t } = useTranslation("openhands");
  const isDev = extension.origin === "dev";
  const canUpdate = !isDev && update != null && onUpdate != null;

  return (
    <div
      data-testid={`installed-extension-card-${extension.id}`}
      className={cn(
        "flex min-w-0 flex-col gap-3 overflow-hidden p-4",
        extensionModuleCardSurfaceClassName,
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3
            data-testid={`installed-extension-name-${extension.id}`}
            className="truncate text-sm font-semibold text-white"
          >
            {extension.name}
          </h3>
          {extension.publisher ? (
            <p className="mt-0.5 truncate text-xs text-tertiary-alt">
              {t(I18nKey.EXTENSIONS$PUBLISHED_BY, {
                publisher: extension.publisher,
              })}
            </p>
          ) : null}
          {!isDev && extension.sourceRef ? (
            <p
              data-testid={`installed-extension-source-${extension.id}`}
              className="mt-0.5 truncate text-xs text-tertiary-alt"
              title={extension.sourceRef}
            >
              {t(I18nKey.EXTENSIONS$INSTALLED_SOURCE, {
                source: extension.sourceRef,
              })}
            </p>
          ) : null}
        </div>
        {isDev ? (
          <span
            className={cn(extensionModuleCardPillClassName, "flex-shrink-0")}
            title={extension.sourceUrl}
          >
            {t(I18nKey.EXTENSIONS$DEV_BADGE)}
          </span>
        ) : (
          <div className="flex flex-shrink-0 items-center gap-2">
            {canUpdate ? (
              <BrandButton
                type="button"
                variant="primary"
                testId={`update-extension-${extension.id}`}
                className="whitespace-nowrap"
                isDisabled={isUpdating}
                aria-busy={isUpdating}
                onClick={onUpdate}
              >
                {isUpdating
                  ? t(I18nKey.EXTENSIONS$UPDATING)
                  : t(I18nKey.EXTENSIONS$UPDATE_BUTTON)}
              </BrandButton>
            ) : null}
            <BrandButton
              type="button"
              variant="danger"
              testId={`uninstall-extension-${extension.id}`}
              className="whitespace-nowrap"
              onClick={onUninstall}
            >
              {t(I18nKey.EXTENSIONS$UNINSTALL_BUTTON)}
            </BrandButton>
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(extensionModuleCardPillClassName, "self-start")}
          data-testid={`installed-extension-version-${extension.id}`}
        >
          {t(I18nKey.SETTINGS$SKILLS_VERSION, { version: extension.version })}
        </span>
        {canUpdate ? (
          <span
            data-testid={`installed-extension-update-badge-${extension.id}`}
            className={cn(
              extensionModuleCardPillClassName,
              "self-start border-primary text-primary",
            )}
            title={`${update.currentVersion} -> ${update.latestVersion}`}
          >
            {t(I18nKey.EXTENSIONS$UPDATE_AVAILABLE)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-tertiary-light">
          {t(I18nKey.EXTENSIONS$PERMISSIONS_TITLE)}
        </span>
        {extension.capabilities.length === 0 ? (
          <span className="text-xs text-tertiary-alt">
            {t(I18nKey.EXTENSIONS$NO_PERMISSIONS)}
          </span>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {extension.capabilities.map((capability) => (
              <li
                key={capability}
                className={extensionModuleCardPillClassName}
                title={capability}
              >
                {t(capabilityLabelKey(capability))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
