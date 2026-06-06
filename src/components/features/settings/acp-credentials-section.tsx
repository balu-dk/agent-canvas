import React from "react";
import { useTranslation } from "react-i18next";
import { AcpSecretField } from "#/components/features/settings/acp-secret-field";
import { BrandButton } from "#/components/features/settings/brand-button";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { useSearchSecrets } from "#/hooks/query/use-get-secrets";
import { useSaveAcpSecrets } from "#/hooks/use-save-acp-secrets";
import {
  getAcpCredentialConflicts,
  getAcpProviderSecrets,
} from "#/constants/acp-providers";

/**
 * Settings → Agent credentials section for a built-in ACP provider: the same
 * fields the onboarding step collects, saved through the same flow
 * ({@link useSaveAcpSecrets}), so credentials can be added or rotated after
 * onboarding. Renders nothing for providers without credential fields.
 */
export function AcpCredentialsSection({
  providerKey,
}: {
  providerKey: string;
}) {
  const { t } = useTranslation("openhands");
  const { data: existingSecrets } = useSearchSecrets();
  const fields = React.useMemo(
    () => getAcpProviderSecrets(providerKey),
    [providerKey],
  );
  const [values, setValues] = React.useState<Record<string, string>>({});
  const { saveFilled, isSaving } = useSaveAcpSecrets(fields);

  const secretExists = React.useCallback(
    (name: string) => (existingSecrets ?? []).some((s) => s.name === name),
    [existingSecrets],
  );

  // Reset local values when provider changes
  React.useEffect(() => {
    setValues({});
  }, [providerKey]);

  if (fields.length === 0) return null;

  const isDirty = fields.some((f) => Boolean(values[f.name]?.trim()));
  const conflicts = getAcpCredentialConflicts(
    providerKey,
    (name) => Boolean(values[name]?.trim()) || secretExists(name),
  );

  const handleSave = async () => {
    if (await saveFilled(values)) {
      setValues({});
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Typography.Text className="text-sm font-medium text-white">
          {t(I18nKey.SETTINGS$ACP_CREDENTIALS_TITLE)}
        </Typography.Text>
        <Typography.Text className="text-xs text-[#717888]">
          {t(I18nKey.SETTINGS$ACP_CREDENTIALS_DESCRIPTION)}
        </Typography.Text>
      </div>

      <div className="flex flex-col gap-5">
        {fields.map((field) => (
          <AcpSecretField
            key={field.name}
            field={field}
            value={values[field.name] ?? ""}
            onChange={(value) =>
              setValues((prev) => ({ ...prev, [field.name]: value }))
            }
            alreadySet={secretExists(field.name)}
            testId={`settings-acp-secret-${field.name}`}
            showOptionalTag
          />
        ))}
      </div>

      {conflicts.map(([credential, conflicting]) => (
        <p
          key={`${credential}:${conflicting}`}
          data-testid="acp-credential-conflict-warning"
          className="text-sm text-amber-300"
        >
          {t(I18nKey.SETTINGS$ACP_CREDENTIAL_CONFLICT_WARNING, {
            credential,
            conflicting,
          })}
        </p>
      ))}

      <BrandButton
        testId="acp-credentials-save-button"
        type="button"
        variant="primary"
        isDisabled={isSaving || !isDirty}
        onClick={handleSave}
      >
        {isSaving
          ? t(I18nKey.SETTINGS$SAVING)
          : t(I18nKey.SETTINGS$SAVE_CHANGES)}
      </BrandButton>
    </div>
  );
}
