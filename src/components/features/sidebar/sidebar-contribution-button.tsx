import { Puzzle } from "lucide-react";
import type { ActivityBarItem } from "#/extensions/types";
import { cn } from "#/utils/utils";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";
import { SidebarCollapsedIconSlot } from "./sidebar-collapsed-icon-slot";
import {
  SIDEBAR_ICON_SLOT_CLASS,
  SIDEBAR_ROW_INTERACTIVE_CLASS,
  sidebarNavLabelClassName,
  sidebarNavRowClassName,
} from "./sidebar-layout";

const ICON_SIZE = 18;

interface SidebarContributionButtonProps {
  item: ActivityBarItem;
  collapsed?: boolean;
  disabled?: boolean;
}

/**
 * Renders a single extension-contributed Activity Bar item on the sidebar rail.
 *
 * Unlike built-in `SidebarNavLink`s (which navigate to a route), a contributed item
 * triggers the extension's `onSelect` behaviour — typically activating the extension
 * and opening its view. It deliberately mirrors `SidebarNavLink`'s styling so
 * contributed items are visually indistinguishable from built-ins.
 *
 * Security: the icon is rendered as an `<img>` from a bundle-provided URL (never
 * injected as raw SVG markup). A missing/invalid icon falls back to a default glyph
 * so a malformed bundle can't break the rail.
 */
export function SidebarContributionButton({
  item,
  collapsed = false,
  disabled = false,
}: SidebarContributionButtonProps) {
  const icon = item.iconUrl ? (
    <img
      src={item.iconUrl}
      alt=""
      width={ICON_SIZE}
      height={ICON_SIZE}
      aria-hidden="true"
    />
  ) : (
    <Puzzle width={ICON_SIZE} height={ICON_SIZE} aria-hidden="true" />
  );

  const button = (
    <button
      type="button"
      data-testid={`sidebar-extension-${item.extensionId}-${item.id}`}
      disabled={disabled}
      aria-label={collapsed ? item.title : undefined}
      onClick={() => {
        if (!disabled) {
          item.onSelect();
        }
      }}
      className={cn(
        sidebarNavRowClassName({ collapsed }),
        !collapsed && SIDEBAR_ROW_INTERACTIVE_CLASS.idle,
        disabled && "opacity-50 pointer-events-none",
      )}
    >
      {collapsed ? (
        <SidebarCollapsedIconSlot active={false}>
          {icon}
        </SidebarCollapsedIconSlot>
      ) : (
        <span className={SIDEBAR_ICON_SLOT_CLASS}>{icon}</span>
      )}
      <span className={sidebarNavLabelClassName(collapsed)}>{item.title}</span>
    </button>
  );

  if (!collapsed) return button;

  return (
    <StyledTooltip content={item.title} placement="right">
      {button}
    </StyledTooltip>
  );
}
