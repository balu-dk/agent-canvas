import React from "react";
import { useTranslation } from "react-i18next";
import { v4 as uuidv4 } from "uuid";
import { SettingsDropdownInput } from "#/components/features/settings/settings-dropdown-input";
import { SettingsInput } from "#/components/features/settings/settings-input";
import { BrandButton } from "#/components/features/settings/brand-button";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import {
  ACP_PROVIDERS,
  getAcpProviderSecrets,
  getAcpProviderDisplayName,
} from "#/constants/acp-providers";
import {
  deleteAgentProfile,
  getAgentProfiles,
  getDefaultAgentProfile,
  loadAgentProfilesFromServer,
  saveAgentProfile,
  setDefaultAgentProfile,
  AGENT_PROFILES_CHANGED_EVENT,
  type AgentProfile,
} from "#/api/agent-profile-store";
import { notifyAgentProfilesChanged } from "#/hooks/use-agent-profiles";
import { SecretsService } from "#/api/secrets-service";
import { displayErrorToast } from "#/utils/custom-toast-handlers";
import { cn } from "#/utils/utils";

const OPENHANDS_ENGINE_KEY = "openhands";

interface ProfileDraft {
  id: string;
  name: string;
  engine: string;
  credentialEnvVar: string | null;
  credentialValue: string;
}

const emptyDraft = (): ProfileDraft => ({
  id: uuidv4(),
  name: "",
  engine: "claude-code",
  credentialEnvVar: null,
  credentialValue: "",
});

/** Secret-name-safe slug of a profile name: "Claude (privat)" -> "CLAUDE_PRIVAT". */
const secretSuffixFor = (name: string): string =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "PROFILE";

const engineLabel = (engine: string): string =>
  engine === OPENHANDS_ENGINE_KEY
    ? "OpenHands"
    : (getAcpProviderDisplayName(engine) ?? engine);

/**
 * Settings → Agent section for managing agent profiles: named
 * engine + provider + credential bundles the user can keep side by side
 * and pick per conversation from the home chat input. The model is not
 * part of a profile (chat-input concern).
 *
 * Per-profile credentials are stored as ordinary custom secrets with a
 * profile-derived suffix (e.g. CLAUDE_CODE_OAUTH_TOKEN_WORK) and injected
 * under the provider's canonical env var at conversation start.
 */
export function AgentProfilesSection() {
  const { t } = useTranslation("openhands");
  const [profiles, setProfiles] = React.useState<AgentProfile[]>(() =>
    getAgentProfiles(),
  );
  const [defaultId, setDefaultId] = React.useState<string | null>(
    () => getDefaultAgentProfile()?.id ?? null,
  );
  const [draft, setDraft] = React.useState<ProfileDraft | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  const refresh = React.useCallback(() => {
    setProfiles(getAgentProfiles());
    setDefaultId(getDefaultAgentProfile()?.id ?? null);
    notifyAgentProfilesChanged();
  }, []);

  // Hydrate from the server on mount (fresh browser / another device) and
  // re-read whenever profiles change anywhere in the app.
  React.useEffect(() => {
    let active = true;
    void loadAgentProfilesFromServer().then(() => {
      if (active) {
        setProfiles(getAgentProfiles());
        setDefaultId(getDefaultAgentProfile()?.id ?? null);
      }
    });
    const onChange = () => {
      setProfiles(getAgentProfiles());
      setDefaultId(getDefaultAgentProfile()?.id ?? null);
    };
    window.addEventListener(AGENT_PROFILES_CHANGED_EVENT, onChange);
    return () => {
      active = false;
      window.removeEventListener(AGENT_PROFILES_CHANGED_EVENT, onChange);
    };
  }, []);

  const credentialFields =
    draft && draft.engine !== OPENHANDS_ENGINE_KEY
      ? getAcpProviderSecrets(draft.engine).filter((field) => field.secret)
      : [];

  const handleEngineChange = (engine: string) => {
    if (!draft) return;
    const fields = getAcpProviderSecrets(engine).filter(
      (field) => field.secret,
    );
    setDraft({
      ...draft,
      engine,
      credentialEnvVar: fields[0]?.name ?? null,
      credentialValue: "",
    });
  };

  const handleEdit = (profile: AgentProfile) => {
    const fields = getAcpProviderSecrets(profile.engine).filter(
      (field) => field.secret,
    );
    setDraft({
      id: profile.id,
      name: profile.name,
      engine: profile.engine,
      credentialEnvVar: profile.credentialEnvVar ?? fields[0]?.name ?? null,
      // Blank = keep the profile's existing stored credential on save.
      credentialValue: "",
    });
  };

  const handleSaveDraft = async () => {
    if (!draft?.name.trim()) return;
    setIsSaving(true);
    try {
      const existing = profiles.find((p) => p.id === draft.id) ?? null;
      let credentialSecretName: string | null = null;
      let credentialEnvVar: string | null = null;
      const credentialValue = draft.credentialValue.trim();
      if (draft.engine !== OPENHANDS_ENGINE_KEY) {
        if (draft.credentialEnvVar && credentialValue) {
          credentialSecretName = `${draft.credentialEnvVar}_${secretSuffixFor(draft.name)}`;
          credentialEnvVar = draft.credentialEnvVar;
          await SecretsService.createSecret(
            credentialSecretName,
            credentialValue,
            `Agent profile: ${draft.name}`,
          );
        } else if (existing?.engine === draft.engine) {
          // Editing without pasting a new credential keeps the stored one.
          credentialSecretName = existing.credentialSecretName ?? null;
          credentialEnvVar = existing.credentialEnvVar ?? null;
        }
      }

      saveAgentProfile({
        id: draft.id,
        name: draft.name.trim(),
        engine: draft.engine,
        credentialEnvVar,
        credentialSecretName,
      });
      if (profiles.length === 0 && !defaultId) {
        setDefaultAgentProfile(draft.id);
      }
      setDraft(null);
      refresh();
    } catch (error) {
      displayErrorToast(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (id: string) => {
    deleteAgentProfile(id);
    refresh();
  };

  const handleSetDefault = (id: string) => {
    setDefaultAgentProfile(id);
    refresh();
  };

  const engineItems = [
    { key: OPENHANDS_ENGINE_KEY, label: "OpenHands" },
    ...ACP_PROVIDERS.map((provider) => ({
      key: provider.key,
      label: provider.display_name,
    })),
  ];

  return (
    <section
      data-testid="agent-profiles-section"
      className="flex flex-col gap-4"
    >
      <div className="flex items-center justify-between">
        <Typography.H3>{t(I18nKey.AGENT_PROFILE$SECTION_TITLE)}</Typography.H3>
        {!draft && (
          <BrandButton
            testId="agent-profile-add-button"
            type="button"
            variant="secondary"
            onClick={() => setDraft(emptyDraft())}
          >
            {t(I18nKey.AGENT_PROFILE$ADD)}
          </BrandButton>
        )}
      </div>
      <Typography.Text className="text-sm text-[var(--oh-text-dim)]">
        {t(I18nKey.AGENT_PROFILE$SECTION_DESCRIPTION)}
      </Typography.Text>

      {profiles.length > 0 && (
        <ul className="flex flex-col gap-2">
          {profiles.map((profile) => {
            const isDefault = profile.id === defaultId;
            return (
              <li
                key={profile.id}
                data-testid={`agent-profile-row-${profile.id}`}
                className="flex items-center gap-3 rounded-lg border border-[var(--oh-border)] px-3 py-2"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">
                    {profile.name}
                    {isDefault && (
                      <span className="ml-2 rounded bg-[var(--oh-interactive-hover)] px-1.5 py-0.5 text-[11px] uppercase tracking-wide">
                        {t(I18nKey.AGENT_PROFILE$DEFAULT)}
                      </span>
                    )}
                  </span>
                  <span className="truncate text-xs text-[var(--oh-text-dim)]">
                    {engineLabel(profile.engine)}
                    {profile.credentialSecretName
                      ? ` · ${profile.credentialSecretName}`
                      : ""}
                  </span>
                </div>
                {!isDefault && (
                  <button
                    type="button"
                    data-testid={`agent-profile-set-default-${profile.id}`}
                    className="text-xs text-[var(--oh-text-dim)] hover:text-[var(--oh-foreground)] transition-colors"
                    onClick={() => handleSetDefault(profile.id)}
                  >
                    {t(I18nKey.AGENT_PROFILE$SET_DEFAULT)}
                  </button>
                )}
                <button
                  type="button"
                  data-testid={`agent-profile-edit-${profile.id}`}
                  className="text-xs text-[var(--oh-text-dim)] hover:text-[var(--oh-foreground)] transition-colors"
                  onClick={() => handleEdit(profile)}
                >
                  {t(I18nKey.AGENT_PROFILE$EDIT)}
                </button>
                <button
                  type="button"
                  data-testid={`agent-profile-delete-${profile.id}`}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                  onClick={() => handleDelete(profile.id)}
                >
                  {t(I18nKey.BUTTON$DELETE)}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <div
          data-testid="agent-profile-form"
          className="flex flex-col gap-4 rounded-lg border border-[var(--oh-border)] p-4"
        >
          <SettingsInput
            testId="agent-profile-name-input"
            name="agent-profile-name"
            label={t(I18nKey.AGENT_PROFILE$NAME)}
            type="text"
            className="w-full"
            value={draft.name}
            onChange={(value) => setDraft({ ...draft, name: value })}
          />

          <SettingsDropdownInput
            testId="agent-profile-engine-input"
            name="agent-profile-engine"
            label={t(I18nKey.AGENT_PROFILE$ENGINE)}
            items={engineItems}
            selectedKey={draft.engine}
            isClearable={false}
            onSelectionChange={(key) => {
              if (key) handleEngineChange(String(key));
            }}
          />

          {credentialFields.length > 0 && (
            <>
              {credentialFields.length > 1 && (
                <SettingsDropdownInput
                  testId="agent-profile-credential-var-input"
                  name="agent-profile-credential-var"
                  label={t(I18nKey.AGENT_PROFILE$CREDENTIAL)}
                  items={credentialFields.map((field) => ({
                    key: field.name,
                    label: field.name,
                  }))}
                  selectedKey={draft.credentialEnvVar ?? undefined}
                  isClearable={false}
                  onSelectionChange={(key) =>
                    setDraft({
                      ...draft,
                      credentialEnvVar: key ? String(key) : null,
                      credentialValue: "",
                    })
                  }
                />
              )}
              <SettingsInput
                testId="agent-profile-credential-input"
                name="agent-profile-credential"
                label={
                  draft.credentialEnvVar ?? t(I18nKey.AGENT_PROFILE$CREDENTIAL)
                }
                type="password"
                className="w-full"
                value={draft.credentialValue}
                onChange={(value) =>
                  setDraft({ ...draft, credentialValue: value })
                }
              />
              <Typography.Text
                className={cn("text-xs text-[var(--oh-text-dim)]")}
              >
                {t(I18nKey.AGENT_PROFILE$CREDENTIAL_HINT)}
              </Typography.Text>
            </>
          )}

          <div className="flex gap-2">
            <BrandButton
              testId="agent-profile-save-button"
              type="button"
              variant="primary"
              isDisabled={isSaving || !draft.name.trim()}
              onClick={handleSaveDraft}
            >
              {t(I18nKey.AGENT_PROFILE$SAVE)}
            </BrandButton>
            <BrandButton
              testId="agent-profile-cancel-button"
              type="button"
              variant="secondary"
              isDisabled={isSaving}
              onClick={() => setDraft(null)}
            >
              {t(I18nKey.BUTTON$CANCEL)}
            </BrandButton>
          </div>
        </div>
      )}
    </section>
  );
}
