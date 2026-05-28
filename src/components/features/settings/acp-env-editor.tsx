import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { SettingsInput } from "./settings-input";
import { BrandButton } from "./brand-button";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";

const ENV_VAR_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

export interface AcpEnvEditorProps {
  existingKeys: string[];
  pendingUpdates: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}

export function AcpEnvEditor({
  existingKeys,
  pendingUpdates,
  onChange,
}: AcpEnvEditorProps) {
  const { t } = useTranslation("openhands");
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const existingSorted = [...existingKeys].sort((a, b) => a.localeCompare(b));
  const pendingOnly = Object.keys(pendingUpdates)
    .filter((k) => !existingKeys.includes(k))
    .sort((a, b) => a.localeCompare(b));
  const displayOrder = [...existingSorted, ...pendingOnly];

  const setPendingValue = (name: string, value: string) => {
    onChange({ ...pendingUpdates, [name]: value });
  };

  const cancelPending = (name: string) => {
    const next = { ...pendingUpdates };
    delete next[name];
    onChange(next);
  };

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!ENV_VAR_NAME_PATTERN.test(trimmed)) {
      setAddError(t(I18nKey.SETTINGS$AGENT_ENV_NAME_INVALID));
      return;
    }
    if (existingKeys.includes(trimmed) || trimmed in pendingUpdates) {
      setAddError(t(I18nKey.SETTINGS$AGENT_ENV_NAME_DUPLICATE));
      return;
    }
    setAddError(null);
    onChange({ ...pendingUpdates, [trimmed]: newValue });
    setNewName("");
    setNewValue("");
  };

  return (
    <div className="flex flex-col gap-2.5" data-testid="agent-env-editor">
      <Typography.Text className="text-sm">
        {t(I18nKey.SETTINGS$AGENT_ENV_TITLE)}
      </Typography.Text>
      <Typography.Text className="text-xs text-[#717888]">
        {t(I18nKey.SETTINGS$AGENT_ENV_DESCRIPTION)}
      </Typography.Text>

      {displayOrder.length === 0 ? (
        <Typography.Text
          className="text-xs text-[#717888] italic"
          testId="agent-env-empty"
        >
          {t(I18nKey.SETTINGS$AGENT_ENV_EMPTY)}
        </Typography.Text>
      ) : (
        <div className="flex flex-col gap-2">
          {displayOrder.map((name) => {
            const isExisting = existingKeys.includes(name);
            const isPending = name in pendingUpdates;
            return (
              <div
                key={name}
                data-testid={`agent-env-row-${name}`}
                className="flex items-center gap-2 min-w-0"
              >
                <code className="flex-1 min-w-0 text-sm font-mono text-white truncate">
                  {name}
                </code>
                {isPending ? (
                  <>
                    <input
                      data-testid={`agent-env-value-input-${name}`}
                      type="password"
                      placeholder={t(
                        I18nKey.SETTINGS$AGENT_ENV_VALUE_PLACEHOLDER,
                      )}
                      value={pendingUpdates[name]}
                      onChange={(e) => setPendingValue(name, e.target.value)}
                      className="bg-tertiary border border-[#717888] rounded-sm px-2 py-1 text-sm text-white placeholder:text-[#717888] flex-1 min-w-0 focus:outline-none focus:border-white"
                    />
                    <button
                      type="button"
                      data-testid={`agent-env-cancel-${name}`}
                      onClick={() => cancelPending(name)}
                      aria-label={t(I18nKey.SETTINGS$AGENT_ENV_CANCEL)}
                      className="text-tertiary-light hover:text-white p-1"
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </>
                ) : isExisting ? (
                  <>
                    <span className="text-xs text-tertiary-light italic">
                      {t(I18nKey.SETTINGS$AGENT_ENV_VALUE_SET)}
                    </span>
                    <button
                      type="button"
                      data-testid={`agent-env-replace-${name}`}
                      onClick={() => setPendingValue(name, "")}
                      className="text-sm text-primary hover:opacity-80"
                    >
                      {t(I18nKey.SETTINGS$AGENT_ENV_REPLACE)}
                    </button>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--oh-border)]">
        <div className="flex items-end gap-2">
          <SettingsInput
            testId="agent-env-new-name"
            name="agent-env-new-name"
            type="text"
            label={t(I18nKey.SETTINGS$AGENT_ENV_NAME_LABEL)}
            value={newName}
            onChange={(v) => {
              setNewName(v);
              if (addError) setAddError(null);
            }}
            placeholder="ANTHROPIC_API_KEY"
          />
          <SettingsInput
            testId="agent-env-new-value"
            name="agent-env-new-value"
            type="password"
            label={t(I18nKey.SETTINGS$AGENT_ENV_VALUE_LABEL)}
            value={newValue}
            onChange={setNewValue}
            placeholder={t(I18nKey.SETTINGS$AGENT_ENV_VALUE_PLACEHOLDER)}
          />
          <BrandButton
            testId="agent-env-add"
            type="button"
            variant="secondary"
            onClick={handleAdd}
            isDisabled={!newName.trim()}
          >
            {t(I18nKey.SETTINGS$AGENT_ENV_ADD)}
          </BrandButton>
        </div>
        {addError && (
          <Typography.Text
            className="text-xs text-red-400"
            testId="agent-env-add-error"
          >
            {addError}
          </Typography.Text>
        )}
        <Typography.Text className="text-xs text-[#717888]">
          {t(I18nKey.SETTINGS$AGENT_ENV_REMOVE_HINT)}
        </Typography.Text>
      </div>
    </div>
  );
}
