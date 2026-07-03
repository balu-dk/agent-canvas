import { useTranslation } from "react-i18next";
import {
  useChatInputModelState,
  type ChatInputModelState,
} from "#/hooks/use-chat-input-model-state";
import { useSwitchAcpModel } from "#/hooks/mutation/use-switch-acp-model";
import { useAgentProfileSelectionStore } from "#/stores/agent-profile-selection-store";
import { useAcpModelMemoryStore } from "#/stores/acp-model-memory-store";
import { ComboboxCaretInline } from "#/ui/combobox-caret";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import CheckIcon from "#/icons/checkmark.svg?react";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { NavigationLink } from "#/components/shared/navigation-link";
import { ContextMenu } from "#/ui/context-menu";
import { ContextMenuListItem } from "#/components/features/context-menu/context-menu-list-item";
import { Divider } from "#/ui/divider";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { chatInputPillButtonClassName } from "#/utils/form-control-classes";
import React from "react";

const MODEL_LABEL_MAX_CHARS = 10;
// ACP surfaces show the provider's human label (e.g. "Claude Opus 4.7"),
// which is longer than a raw model id, so the inline button gets a wider cap
// before truncating. The full string still shows in the title + popover.
const ACP_MODEL_LABEL_MAX_CHARS = 22;

function truncateModelLabel(
  model: string,
  maxChars: number = MODEL_LABEL_MAX_CHARS,
): string {
  if (model.length <= maxChars) {
    return model;
  }
  return `${model.slice(0, maxChars)}…`;
}

interface ChatInputModelMenuContentProps {
  model: ChatInputModelState;
  onClose: () => void;
  dividerInset?: "menu";
  settingsLinkClassName?: string;
  settingsIconClassName?: string;
}

export function ChatInputModelMenuContent({
  model,
  onClose,
  dividerInset,
  settingsLinkClassName,
  settingsIconClassName,
}: ChatInputModelMenuContentProps) {
  const { t } = useTranslation("openhands");
  const switchAcpModel = useSwitchAcpModel();
  const setPendingModel = useAgentProfileSelectionStore(
    (state) => state.setPendingModel,
  );
  const addCustomModel = useAcpModelMemoryStore((s) => s.addCustomModel);
  const removeCustomModel = useAcpModelMemoryStore((s) => s.removeCustomModel);
  const recordLastModel = useAcpModelMemoryStore((s) => s.recordLastModel);
  const [isAddingCustom, setIsAddingCustom] = React.useState(false);
  const [customValue, setCustomValue] = React.useState("");
  const customInputRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (isAddingCustom) customInputRef.current?.focus();
  }, [isAddingCustom]);
  const hasModelRows = model.showAcpPicker || Boolean(model.displayModel);

  const handleSelectAcpModel = (modelId: string) => {
    if (modelId !== model.currentModelId) {
      if (model.isPendingProfileMode) {
        // A pending agent profile drives the next conversation: the pick is
        // transient and rides the profile's diff at start. PATCHing global
        // settings here would be overwritten by that diff anyway.
        setPendingModel(modelId);
      } else {
        switchAcpModel.mutate({
          conversationId: model.switchConversationId,
          model: modelId,
        });
      }
    }
    // Remember the pick per backend+engine so the next session defaults to it.
    if (model.acpEngine) {
      recordLastModel(model.backendId, model.acpEngine, modelId);
    }
    onClose();
  };

  const handleAddCustomModel = () => {
    const modelId = customValue.trim();
    if (!modelId || !model.acpEngine) return;
    // Persist the id so it becomes a permanent picker option, then select it.
    addCustomModel(model.backendId, model.acpEngine, modelId);
    setCustomValue("");
    setIsAddingCustom(false);
    handleSelectAcpModel(modelId);
  };

  const handleRemoveCustomModel = (
    event: React.MouseEvent,
    modelId: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (model.acpEngine) {
      removeCustomModel(model.backendId, model.acpEngine, modelId);
    }
  };

  return (
    <>
      {model.showAcpPicker ? (
        <>
          {/* role="presentation" keeps this a valid <li> child of the
              ContextMenu <ul> without exposing the section label as a
              selectable menu item (the label text is still announced). */}
          <li role="presentation" className="px-2 pt-1 pb-0.5">
            <Typography.Text className="text-[11px] font-medium text-[var(--oh-text-dim)] uppercase tracking-wide leading-4">
              {t(I18nKey.MODEL$AVAILABLE_MODELS)}
            </Typography.Text>
          </li>
          {model.availableAcpModels.map((option) => {
            const isSelected = option.id === model.currentModelId;
            return (
              <ContextMenuListItem
                key={option.id}
                testId={`chat-input-acp-model-option-${option.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleSelectAcpModel(option.id);
                }}
                className={cn(
                  "flex items-center gap-2",
                  isSelected && "bg-[var(--oh-interactive-hover)]",
                )}
              >
                <span
                  className="flex-1 truncate text-sm leading-5"
                  title={option.label}
                >
                  {option.label}
                </span>
                {option.custom && (
                  <button
                    type="button"
                    aria-label={t(I18nKey.COMMON$REMOVE)}
                    title={t(I18nKey.COMMON$REMOVE)}
                    className="shrink-0 px-1 text-[var(--oh-text-dim)] hover:text-[var(--oh-foreground)]"
                    onClick={(event) =>
                      handleRemoveCustomModel(event, option.id)
                    }
                  >
                    ×
                  </button>
                )}
                {isSelected && (
                  <CheckIcon
                    width={14}
                    height={14}
                    className="shrink-0"
                    aria-hidden
                  />
                )}
              </ContextMenuListItem>
            );
          })}
          {model.acpEngine &&
            (isAddingCustom ? (
              <li className="px-2 py-1">
                <div className="flex items-center gap-1">
                  <input
                    ref={customInputRef}
                    type="text"
                    value={customValue}
                    placeholder={t(I18nKey.SETTINGS$AGENT_CUSTOM_MODEL)}
                    aria-label={t(I18nKey.SETTINGS$AGENT_CUSTOM_MODEL)}
                    data-testid="chat-input-acp-model-custom-input"
                    className="min-w-0 flex-1 rounded border border-[var(--oh-border)] bg-transparent px-2 py-1 text-sm leading-5 text-[var(--oh-foreground)] outline-none focus:border-[var(--oh-interactive)]"
                    onChange={(event) => setCustomValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleAddCustomModel();
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        setIsAddingCustom(false);
                        setCustomValue("");
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={!customValue.trim()}
                    className="shrink-0 rounded px-2 py-1 text-sm text-[var(--oh-interactive)] hover:bg-[var(--oh-interactive-hover)] disabled:opacity-40"
                    onClick={(event) => {
                      event.preventDefault();
                      handleAddCustomModel();
                    }}
                  >
                    {t(I18nKey.BUTTON$ADD)}
                  </button>
                </div>
              </li>
            ) : (
              <ContextMenuListItem
                testId="chat-input-acp-model-custom"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsAddingCustom(true);
                }}
                className="text-sm text-[var(--oh-text-dim)]"
              >
                {`+ ${t(I18nKey.SETTINGS$AGENT_CUSTOM_MODEL)}`}
              </ContextMenuListItem>
            ))}
        </>
      ) : model.displayModel ? (
        <li className="text-sm">
          <div className="p-2 leading-5 text-[var(--oh-foreground)] break-all">
            {model.displayModel}
          </div>
        </li>
      ) : null}
      {hasModelRows && <Divider inset={dividerInset} />}
      <li className="text-sm">
        <NavigationLink
          to={model.destinationPath}
          onClick={onClose}
          className={cn(
            "flex h-[30px] items-center gap-2 rounded p-2 leading-5 text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)] transition-colors",
            settingsLinkClassName,
          )}
        >
          <SettingsGearIcon
            width={16}
            height={16}
            className={cn("shrink-0", settingsIconClassName)}
            aria-hidden
          />
          <span>{model.destinationLabel}</span>
        </NavigationLink>
      </li>
    </>
  );
}

export function ChatInputModel() {
  const model = useChatInputModelState();
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = useClickOutsideElement<HTMLUListElement>(
    () => setIsPopoverOpen(false),
    triggerRef,
  );

  if (!model.displayModel) {
    return null;
  }

  const truncatedModelLabel = truncateModelLabel(
    model.displayModel,
    model.isAcpContext ? ACP_MODEL_LABEL_MAX_CHARS : MODEL_LABEL_MAX_CHARS,
  );

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        className={chatInputPillButtonClassName}
        title={model.displayModel}
        data-testid="chat-input-llm-model"
        aria-expanded={isPopoverOpen}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsPopoverOpen((open) => !open);
        }}
      >
        <span>{truncatedModelLabel}</span>
        <ComboboxCaretInline isOpen={isPopoverOpen} />
      </button>

      {isPopoverOpen && (
        <ContextMenu
          ref={popoverRef}
          testId="chat-input-llm-model-popover"
          position="top"
          alignment="left"
          spacing="none"
          className="z-[60] mb-2 min-w-[200px] max-w-[320px] max-h-[60vh] overflow-y-auto"
        >
          <ChatInputModelMenuContent
            model={model}
            onClose={() => setIsPopoverOpen(false)}
          />
        </ContextMenu>
      )}
    </div>
  );
}
