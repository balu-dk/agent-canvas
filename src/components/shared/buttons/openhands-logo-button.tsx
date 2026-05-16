import OpenHandsLogo from "#/assets/branding/openhands-logo.svg?react";
import { NavigationLink } from "#/components/shared/navigation-link";
import { StyledTooltip } from "#/components/shared/buttons/styled-tooltip";

/* rbren branch: useTranslation / I18nKey imports dropped — brand tooltip
   and aria label are now hardcoded to "rbren's mod" below. Original lines:
   import { useTranslation } from "react-i18next";
   import { I18nKey } from "#/i18n/declaration";
   const { t } = useTranslation("openhands");
   const tooltipText = t(I18nKey.BRANDING$OPENHANDS);
   const ariaLabel = t(I18nKey.BRANDING$OPENHANDS_LOGO); */

interface OpenHandsLogoButtonProps {
  /* rbren branch: compact mode skips the "rbren's mod" wordmark next to the
     logo. Used by the collapsed 64px sidebar rail where there's no room. */
  compact?: boolean;
}

export function OpenHandsLogoButton({
  compact = false,
}: OpenHandsLogoButtonProps = {}) {
  const tooltipText = "rbren's mod";
  const ariaLabel = "rbren's mod logo";

  return (
    <StyledTooltip content={tooltipText}>
      <NavigationLink to="/conversations" aria-label={ariaLabel}>
        <span className="flex items-center gap-2">
          {/* rbren branch: tint logo with var(--oh-muted), matching the
              inactive color of the sidebar nav icons (Code / Customize /
              Automate). Targets only originally-white SVG paths so the
              transparent face cut-out stays transparent. */}
          <OpenHandsLogo
            width={46}
            height={30}
            className="[&_path[fill='white']]:fill-[var(--oh-muted)]"
          />
          {/* rbren branch: wordmark shown next to the logo in expanded mode. */}
          {!compact && (
            <span className="text-sm font-medium text-[var(--oh-muted)] whitespace-nowrap">
              rbren&apos;s mod
            </span>
          )}
        </span>
      </NavigationLink>
    </StyledTooltip>
  );
}
