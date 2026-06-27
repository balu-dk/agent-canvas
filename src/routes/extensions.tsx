import React from "react";
import { useTranslation } from "react-i18next";
import { ExtensionsNavigation } from "#/components/features/skills/extensions-navigation";
import { InstalledExtensionCard } from "#/components/features/extensions/installed-extension-card";
import { AddExtensionModal } from "#/components/features/extensions/add-extension-modal";
import { BrandButton } from "#/components/features/settings/brand-button";
import { useExtensionContext } from "#/components/providers/extension-manager-provider";
import {
  useInstalledExtensionsStore,
  type ExtensionUpdate,
} from "#/extensions/installed-store";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { settingsLikeMainScrollClassName } from "#/utils/settings-like-page-layout-classes";
import {
  extensionModuleCardGridClassName,
  extensionModuleCardGridContainerClassName,
  extensionModuleEmptyStateClassName,
} from "#/utils/extension-module-card-classes";

export default function ExtensionsScreen() {
  const { t } = useTranslation("openhands");
  const context = useExtensionContext();
  const installed = useInstalledExtensionsStore((state) => state.installed);
  const [showAddModal, setShowAddModal] = React.useState(false);
  const [updates, setUpdates] = React.useState<Record<string, ExtensionUpdate>>(
    {},
  );
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  const checkForUpdate = context?.checkForUpdate;
  // Poll for available updates whenever the installed set changes.
  React.useEffect(() => {
    if (!checkForUpdate) return undefined;
    let cancelled = false;
    (async () => {
      const found: Record<string, ExtensionUpdate> = {};
      await Promise.all(
        installed.map(async (extension) => {
          try {
            const update = await checkForUpdate(extension.id);
            if (update) found[extension.id] = update;
          } catch {
            // A failed update check is non-fatal; just omit the affordance.
          }
        }),
      );
      if (!cancelled) setUpdates(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [checkForUpdate, installed]);

  const handleUninstall = (id: string) => {
    context?.uninstall(id);
    displaySuccessToast(t(I18nKey.EXTENSIONS$UNINSTALL_SUCCESS));
  };

  const handleUpdate = async (id: string) => {
    if (!context) return;
    setUpdatingId(id);
    try {
      await context.updateExtension(id);
      setUpdates((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      displaySuccessToast(t(I18nKey.EXTENSIONS$UPDATE_SUCCESS));
    } catch (error) {
      displayErrorToast(error instanceof Error ? error.message : String(error));
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div
      data-testid="extensions-screen"
      className="flex h-full gap-4 md:gap-6 md:pl-8 lg:gap-10 lg:pl-10"
    >
      <ExtensionsNavigation />
      <main className={cn(settingsLikeMainScrollClassName, "h-full")}>
        <div className="mx-auto flex w-full min-w-0 max-w-[800px] flex-col gap-6">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0 space-y-1">
              <h2 className="text-xl font-semibold leading-6 text-foreground">
                {t(I18nKey.EXTENSIONS$MANAGE_TITLE)}
              </h2>
              <div
                data-testid="extensions-description"
                className="max-w-2xl text-sm text-tertiary-light"
              >
                {t(I18nKey.EXTENSIONS$MANAGE_DESCRIPTION)}
              </div>
            </div>
            {context ? (
              <BrandButton
                type="button"
                variant="secondary"
                testId="extensions-add-button"
                className="flex-shrink-0 whitespace-nowrap"
                onClick={() => setShowAddModal(true)}
              >
                {t(I18nKey.EXTENSIONS$ADD_BUTTON)}
              </BrandButton>
            ) : null}
          </div>

          {!context ? (
            <div
              data-testid="extensions-disabled"
              className={extensionModuleEmptyStateClassName}
            >
              <p className="text-sm text-tertiary-light">
                {t(I18nKey.EXTENSIONS$DISABLED_NOTICE)}
              </p>
            </div>
          ) : installed.length === 0 ? (
            <div
              data-testid="extensions-empty"
              className={extensionModuleEmptyStateClassName}
            >
              <p className="text-sm text-tertiary-light">
                {t(I18nKey.EXTENSIONS$EMPTY)}
              </p>
            </div>
          ) : (
            <section
              className={cn(
                "flex min-w-0 flex-col gap-3",
                extensionModuleCardGridContainerClassName,
              )}
            >
              <div className={extensionModuleCardGridClassName}>
                {installed.map((extension) => (
                  <InstalledExtensionCard
                    key={extension.id}
                    extension={extension}
                    onUninstall={() => handleUninstall(extension.id)}
                    update={updates[extension.id]}
                    onUpdate={() => handleUpdate(extension.id)}
                    isUpdating={updatingId === extension.id}
                  />
                ))}
              </div>
            </section>
          )}

          {showAddModal && (
            <AddExtensionModal onClose={() => setShowAddModal(false)} />
          )}
        </div>
      </main>
    </div>
  );
}
