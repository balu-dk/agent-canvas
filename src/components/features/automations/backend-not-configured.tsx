import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import ExclamationCircleIcon from "#/icons/exclamation-circle.svg?react";
import { getAgentServerBaseUrl } from "#/api/agent-server-config";

interface BackendNotConfiguredProps {
  onRetry: () => void;
}

export function BackendNotConfigured({ onRetry }: BackendNotConfiguredProps) {
  const { t } = useTranslation("openhands");
  const baseUrl = getAgentServerBaseUrl();

  return (
    <div className="flex flex-col items-center justify-center py-20 px-4">
      <ExclamationCircleIcon className="size-12 text-amber-500" />
      <h2 className="mt-4 text-lg font-semibold text-content">
        {t(I18nKey.AUTOMATIONS$BACKEND_NOT_CONFIGURED_TITLE)}
      </h2>
      <p className="mt-2 text-sm text-content-muted text-center max-w-md">
        {t(I18nKey.AUTOMATIONS$BACKEND_NOT_CONFIGURED_MESSAGE)}
      </p>
      <div className="mt-4 rounded-lg bg-surface-elevated border border-border px-4 py-3">
        <code className="text-sm text-content font-mono">{baseUrl}</code>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-lg border border-border px-4 py-2 text-sm text-white hover:bg-surface-elevated"
      >
        {t(I18nKey.AUTOMATIONS$BACKEND_NOT_CONFIGURED_RETRY)}
      </button>
    </div>
  );
}
