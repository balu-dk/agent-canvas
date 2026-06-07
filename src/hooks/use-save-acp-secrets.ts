import React from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import { I18nKey } from "#/i18n/declaration";
import { useCreateSecret } from "#/hooks/mutation/use-create-secret";
import { useActiveBackend } from "#/contexts/active-backend-context";
import { type ACPProviderSecretField } from "#/constants/acp-providers";
import {
  displayErrorToast,
  displaySuccessToast,
  displayWarningToast,
} from "#/utils/custom-toast-handlers";
import { retrieveAxiosErrorMessage } from "#/utils/retrieve-axios-error-message";

/**
 * Shared save flow for the ACP credential forms (the onboarding step and the
 * Settings → Agent section): persists each filled field as a global secret,
 * refreshes the secret queries, and toasts the outcome — a warning instead of
 * "Saved" when a file-content credential landed on a backend that can't
 * materialise it to disk (cloud, pending agent-canvas#1016), so we don't claim
 * success for an orphaned credential.
 *
 * ``saveFilled`` resolves ``true`` when every filled field saved (or nothing
 * needed saving) and ``false`` on failure, so callers can gate navigation /
 * form resets on it. Empty fields are never written — a blank input is a
 * deliberate skip, not a request to clear an existing secret.
 */
export function useSaveAcpSecrets(fields: ACPProviderSecretField[]) {
  const { t } = useTranslation("openhands");
  const queryClient = useQueryClient();
  const { mutateAsync: createSecret } = useCreateSecret();
  const activeBackend = useActiveBackend();
  const [isSaving, setIsSaving] = React.useState(false);

  // Local agent-servers materialise file-content credentials via the SDK's
  // acp_file_secrets defaults; cloud doesn't yet (agent-canvas#1016).
  // TODO(#1016): once cloud materialises file secrets, a kind check can't tell
  // a new cloud from an old one — replace with a capability/version probe.
  const consumesFileCredentials = activeBackend.backend.kind === "local";

  const saveFilled = async (values: Record<string, string>) => {
    const toSave = fields
      .map((field) => ({ field, value: values[field.name]?.trim() }))
      .filter(
        (entry): entry is { field: ACPProviderSecretField; value: string } =>
          Boolean(entry.value),
      );
    if (toSave.length === 0) return true;

    setIsSaving(true);
    try {
      // Sequential so a mid-list failure leaves the earlier secrets saved and
      // surfaces a single, specific error rather than a race of toasts.
      for (const { field, value } of toSave) {
        await createSecret({ name: field.name, value });
      }
      await queryClient.invalidateQueries({ queryKey: ["secrets-search"] });
      await queryClient.invalidateQueries({ queryKey: ["secrets"] });

      const savedOrphanedFileCredential =
        !consumesFileCredentials && toSave.some(({ field }) => field.multiline);
      if (savedOrphanedFileCredential) {
        displayWarningToast(t(I18nKey.ONBOARDING$ACP_SECRETS_ORPHANED_WARNING));
      } else {
        displaySuccessToast(t(I18nKey.SETTINGS$SAVED));
      }
      return true;
    } catch (error) {
      const message = retrieveAxiosErrorMessage(error as AxiosError);
      displayErrorToast(message || t(I18nKey.ERROR$GENERIC));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return { saveFilled, isSaving };
}
