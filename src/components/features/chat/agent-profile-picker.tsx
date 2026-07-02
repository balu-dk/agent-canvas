import React from "react";
import { useTranslation } from "react-i18next";
import { ComboboxCaretInline } from "#/ui/combobox-caret";
import CheckIcon from "#/icons/checkmark.svg?react";
import SettingsGearIcon from "#/icons/settings-gear.svg?react";
import { ContextMenu } from "#/ui/context-menu";
import { ContextMenuListItem } from "#/components/features/context-menu/context-menu-list-item";
import { Divider } from "#/ui/divider";
import { NavigationLink } from "#/components/shared/navigation-link";
import { useClickOutsideElement } from "#/hooks/use-click-outside-element";
import { I18nKey } from "#/i18n/declaration";
import { cn } from "#/utils/utils";
import { chatInputPillButtonClassName } from "#/utils/form-control-classes";
import {
  getDefaultAgentProfile,
  type AgentProfile,
} from "#/api/agent-profile-store";
import { useAgentProfiles } from "#/hooks/use-agent-profiles";
import { useAgentProfileSelectionStore } from "#/stores/agent-profile-selection-store";

const PROFILE_LABEL_MAX_CHARS = 18;

function truncateLabel(label: string): string {
  if (label.length <= PROFILE_LABEL_MAX_CHARS) return label;
  return `${label.slice(0, PROFILE_LABEL_MAX_CHARS)}…`;
}

/**
 * Home-page chat-input pill for picking the agent profile (engine +
 * provider + credential bundle) the NEXT conversation should run on.
 * The model stays a separate choice (the model pill / Settings → Agent).
 *
 * Rendered only pre-conversation: a running conversation keeps the agent
 * settings it started with; switching engines mid-thread is not supported.
 */
export function AgentProfilePicker() {
  const { t } = useTranslation("openhands");
  const profiles = useAgentProfiles();
  const { selection, setSelection } = useAgentProfileSelectionStore();
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = useClickOutsideElement<HTMLUListElement>(
    () => setIsOpen(false),
    triggerRef,
  );

  // No profiles saved -> nothing to pick; global settings apply as always.
  if (profiles.length === 0) {
    return null;
  }

  const defaultProfile = getDefaultAgentProfile();
  const effectiveProfile: AgentProfile | null =
    selection === null
      ? null
      : typeof selection === "string"
        ? (profiles.find((p) => p.id === selection) ?? defaultProfile)
        : defaultProfile;

  const buttonLabel = effectiveProfile
    ? truncateLabel(effectiveProfile.name)
    : t(I18nKey.AGENT_PROFILE$GLOBAL_SETTINGS);

  const handleSelect = (value: string | null) => {
    setSelection(value);
    setIsOpen(false);
  };

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        className={chatInputPillButtonClassName}
        title={effectiveProfile?.name ?? undefined}
        data-testid="chat-input-agent-profile"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen((open) => !open);
        }}
      >
        <span>{buttonLabel}</span>
        <ComboboxCaretInline isOpen={isOpen} />
      </button>

      {isOpen && (
        <ContextMenu
          ref={popoverRef}
          testId="chat-input-agent-profile-popover"
          position="top"
          alignment="left"
          spacing="none"
          className="z-[60] mb-2 min-w-[220px] max-w-[320px] max-h-[60vh] overflow-y-auto"
        >
          {profiles.map((profile) => {
            const isSelected = effectiveProfile?.id === profile.id;
            return (
              <ContextMenuListItem
                key={profile.id}
                testId={`agent-profile-option-${profile.id}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleSelect(profile.id);
                }}
                className={cn(
                  "flex items-center gap-2",
                  isSelected && "bg-[var(--oh-interactive-hover)]",
                )}
              >
                <span
                  className="flex-1 truncate text-sm leading-5"
                  title={profile.name}
                >
                  {profile.name}
                </span>
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

          <ContextMenuListItem
            testId="agent-profile-option-global"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleSelect(null);
            }}
            className={cn(
              "flex items-center gap-2",
              effectiveProfile === null && "bg-[var(--oh-interactive-hover)]",
            )}
          >
            <span className="flex-1 truncate text-sm leading-5">
              {t(I18nKey.AGENT_PROFILE$GLOBAL_SETTINGS)}
            </span>
            {effectiveProfile === null && (
              <CheckIcon
                width={14}
                height={14}
                className="shrink-0"
                aria-hidden
              />
            )}
          </ContextMenuListItem>

          <Divider />
          <li className="text-sm">
            <NavigationLink
              to="/settings/agent"
              onClick={() => setIsOpen(false)}
              className="flex h-[30px] items-center gap-2 rounded p-2 leading-5 text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)] transition-colors"
            >
              <SettingsGearIcon
                width={16}
                height={16}
                className="shrink-0"
                aria-hidden
              />
              <span>{t(I18nKey.AGENT_PROFILE$MANAGE)}</span>
            </NavigationLink>
          </li>
        </ContextMenu>
      )}
    </div>
  );
}
