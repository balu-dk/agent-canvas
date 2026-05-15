import React from "react";
import { useTranslation } from "react-i18next";
import { useSaveSettings } from "#/hooks/mutation/use-save-settings";
import { useInstallSkill } from "#/hooks/mutation/use-install-skill";
import { useUninstallSkill } from "#/hooks/mutation/use-uninstall-skill";
import { useSettings } from "#/hooks/query/use-settings";
import { useSkills } from "#/hooks/query/use-skills";
import { useInstalledSkills } from "#/hooks/query/use-installed-skills";
import { ExtensionsNavigation } from "#/components/features/skills/extensions-navigation";
import { SkillCard } from "#/components/features/skills/skill-card";
import { SkillsToolbar } from "#/components/features/skills/skills-toolbar";
import type { SkillTypeFilter } from "#/components/features/skills/skill-type-filter";
import { I18nKey } from "#/i18n/declaration";
import {
  displayErrorToast,
  displaySuccessToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";
import type { SkillInfo } from "#/types/settings";
import { DEFAULT_SKILL_NAMES } from "#/services/default-skills";

function matchesSearch(skill: SkillInfo, query: string): boolean {
  if (!query) return true;
  const haystacks = [
    skill.name,
    skill.description ?? "",
    skill.license ?? "",
    skill.compatibility ?? "",
    ...(skill.triggers ?? []),
    ...(skill.allowed_tools ?? []),
  ];
  const lowered = query.toLowerCase();
  return haystacks.some((value) => value.toLowerCase().includes(lowered));
}

function SkillsSettingsScreen() {
  const { t } = useTranslation("openhands");

  const { mutate: saveSettings } = useSaveSettings();
  const { mutate: installSkill, isPending: isInstalling } = useInstallSkill();
  const { mutate: uninstallSkill, isPending: isUninstalling } =
    useUninstallSkill();

  const { data: settings, isLoading: settingsLoading } = useSettings();
  const { data: skills, isLoading: skillsLoading } = useSkills();
  const { data: installedSkills, isLoading: installedLoading } =
    useInstalledSkills();

  const [disabledSet, setDisabledSet] = React.useState<Set<string>>(new Set());
  const [hasHydratedInitialSettings, setHasHydratedInitialSettings] =
    React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [typeFilter, setTypeFilter] = React.useState<SkillTypeFilter>("all");
  const [marketplaceSource, setMarketplaceSource] = React.useState("");

  // Sync local disabled state with server settings when data first arrives
  React.useEffect(() => {
    if (!settings || hasHydratedInitialSettings) return;
    setDisabledSet(new Set(settings.disabled_skills ?? []));
    setHasHydratedInitialSettings(true);
  }, [settings, hasHydratedInitialSettings]);

  const handleToggle = (skillName: string, enabled: boolean) => {
    setDisabledSet((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.delete(skillName);
      } else {
        next.add(skillName);
      }
      return next;
    });
  };

  // Auto-save disabled_skills once initial settings load.
  React.useEffect(() => {
    if (!hasHydratedInitialSettings) return;
    saveSettings(
      { disabled_skills: Array.from(disabledSet) },
      {
        onError: (error) => {
          const errorMessage = retrieveAxiosErrorMessage(error);
          displayErrorToast(errorMessage || t(I18nKey.ERROR$GENERIC));
        },
      },
    );
  }, [disabledSet, hasHydratedInitialSettings, saveSettings, t]);

  const handleInstall = () => {
    const source = marketplaceSource.trim();
    if (!source) return;
    installSkill(source, {
      onSuccess: () => {
        setMarketplaceSource("");
        displaySuccessToast(
          t(I18nKey.SETTINGS$SKILLS_MARKETPLACE_INSTALL_SUCCESS),
        );
      },
      onError: (error) => {
        const errorMessage = retrieveAxiosErrorMessage(error);
        displayErrorToast(errorMessage || t(I18nKey.ERROR$GENERIC));
      },
    });
  };

  const handleUninstall = (name: string) => {
    uninstallSkill(name, {
      onSuccess: () => {
        displaySuccessToast(
          t(I18nKey.SETTINGS$SKILLS_MARKETPLACE_UNINSTALL_SUCCESS),
        );
      },
      onError: (error) => {
        const errorMessage = retrieveAxiosErrorMessage(error);
        displayErrorToast(errorMessage || t(I18nKey.ERROR$GENERIC));
      },
    });
  };

  const isLoading = settingsLoading || skillsLoading || !settings;

  const filteredSkills = React.useMemo(() => {
    if (!skills) return [];
    return skills.filter(
      (skill) =>
        (typeFilter === "all" || skill.type === typeFilter) &&
        matchesSearch(skill, searchQuery),
    );
  }, [skills, typeFilter, searchQuery]);

  // Build a set of installed skill names for quick lookup
  const installedSkillNames = React.useMemo(
    () => new Set((installedSkills ?? []).map((s) => s.name)),
    [installedSkills],
  );

  return (
    <div data-testid="skills-settings-screen" className="flex h-full gap-10">
      <ExtensionsNavigation />
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-auto custom-scrollbar-always pr-[14px] pt-8 pb-12">
        <div className="max-w-5xl flex flex-col gap-8">
          {/* Page header */}
          <div className="min-w-0 space-y-1">
            <h2 className="text-xl font-semibold leading-6 text-foreground">
              {t(I18nKey.SETTINGS$SKILLS_TITLE)}
            </h2>
            <div
              data-testid="skills-settings-description"
              className="max-w-2xl text-sm text-tertiary-light"
            >
              {t(I18nKey.SETTINGS$SKILLS_PAGE_DESCRIPTION)}
            </div>
          </div>

          {/* ── Installed Skills ─────────────────────────────────────── */}
          {!installedLoading &&
            installedSkills &&
            installedSkills.length > 0 && (
              <section
                data-testid="installed-skills-section"
                className="flex flex-col gap-3"
              >
                <h3 className="text-base font-semibold text-foreground">
                  {t(I18nKey.SETTINGS$SKILLS_INSTALLED_TITLE)}
                </h3>
                <p className="text-sm text-tertiary-light">
                  {t(I18nKey.SETTINGS$SKILLS_INSTALLED_DESCRIPTION)}
                </p>
                <div className="flex flex-col gap-2">
                  {installedSkills.map((skill) => (
                    <div
                      key={skill.name}
                      data-testid={`installed-skill-row-${skill.name}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-tertiary bg-base-secondary px-4 py-3"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm font-semibold text-white truncate">
                          {skill.name}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {skill.version && (
                          <span className="inline-flex items-center rounded-full border border-tertiary px-2 py-0.5 text-[11px] font-medium text-tertiary-light">
                            {t(I18nKey.SETTINGS$SKILLS_VERSION, {
                              version: skill.version,
                            })}
                          </span>
                        )}
                        <button
                          type="button"
                          data-testid={`uninstall-skill-${skill.name}`}
                          onClick={() => handleUninstall(skill.name)}
                          disabled={isUninstalling}
                          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50 cursor-pointer"
                        >
                          {t(I18nKey.SETTINGS$SKILLS_UNINSTALL_BUTTON)}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

          {/* ── Install from source ──────────────────────────────────── */}
          <section
            data-testid="install-skill-section"
            className="flex flex-col gap-3"
          >
            <h3 className="text-base font-semibold text-foreground">
              {t(I18nKey.SETTINGS$SKILLS_MARKETPLACE_TITLE)}
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                data-testid="marketplace-source-input"
                value={marketplaceSource}
                onChange={(e) => setMarketplaceSource(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleInstall();
                }}
                placeholder="https://github.com/OpenHands/extensions/tree/main/skills/github"
                className="flex-1 min-w-0 rounded-lg border border-tertiary bg-base-secondary px-3 py-2 text-sm text-white placeholder:text-tertiary-alt outline-none focus:border-white/40 focus:ring-1 focus:ring-white/20 transition-colors"
              />
              <button
                type="button"
                data-testid="install-skill-button"
                onClick={handleInstall}
                disabled={isInstalling || !marketplaceSource.trim()}
                className="shrink-0 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:opacity-50 cursor-pointer"
              >
                {isInstalling ? "…" : t(I18nKey.SETTINGS$SKILLS_INSTALL_BUTTON)}
              </button>
            </div>
          </section>

          {/* ── All Available Skills ─────────────────────────────────── */}
          <section className="flex flex-col gap-6">
            {isLoading && (
              <div className="flex flex-col gap-4">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-24 rounded-2xl bg-tertiary animate-pulse"
                  />
                ))}
              </div>
            )}

            {!isLoading && (!skills || skills.length === 0) && (
              <p className="text-sm text-tertiary">
                {t(I18nKey.SETTINGS$SKILLS_NO_SKILLS)}
              </p>
            )}

            {!isLoading && skills && skills.length > 0 && (
              <>
                <SkillsToolbar
                  search={searchQuery}
                  onSearchChange={setSearchQuery}
                  typeFilter={typeFilter}
                  onTypeFilterChange={setTypeFilter}
                  shown={filteredSkills.length}
                  total={skills.length}
                />
                {filteredSkills.length === 0 ? (
                  <p
                    data-testid="skills-no-match"
                    className="text-sm text-tertiary"
                  >
                    {t(I18nKey.SETTINGS$SKILLS_NO_MATCH)}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {filteredSkills.map((skill) => (
                      <SkillCard
                        key={skill.name}
                        skill={skill}
                        enabled={!disabledSet.has(skill.name)}
                        onToggle={(enabled) =>
                          handleToggle(skill.name, enabled)
                        }
                        isDefault={DEFAULT_SKILL_NAMES.includes(skill.name)}
                        isInstalled={installedSkillNames.has(skill.name)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default SkillsSettingsScreen;
