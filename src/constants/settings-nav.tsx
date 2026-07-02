import { AppWindow } from "lucide-react";
import KeyIcon from "#/icons/key.svg?react";
import CircuitIcon from "#/icons/u-circuit.svg?react";
import RobotIcon from "#/icons/u-robot.svg?react";

export interface SettingsNavItem {
  icon: React.ReactElement;
  to: string;
  text: string;
  /** Short grey subline under the page title (`settings.tsx`). */
  subtitle: string;
  // When true, this item is greyed out (and its route redirects to
  // ``/settings/agent``) while the active agent is ACP. The ACP sub-agent
  // manages its own LLM / condenser / MCP, so these OpenHands-side
  // surfaces have nothing useful to configure. Drives both the navigation
  // disable in ``use-settings-nav-items.ts`` and the loader redirect in
  // ``routes/settings.tsx`` from a single source.
  disabledByAcp?: boolean;
}

export const OSS_NAV_ITEMS: SettingsNavItem[] = [
  {
    icon: <RobotIcon width={16} height={16} />,
    to: "/settings/agent",
    text: "SETTINGS$NAV_AGENT",
    subtitle: "SETTINGS$PAGE_AGENT_SUBLINE",
  },
  {
    // OpenHands-engine settings grouped under one entry: LLM, Condenser
    // and Verification live as sub-tabs on the page. The whole group is
    // engine-specific, hence the single ``disabledByAcp`` (which now
    // renders the in-page OpenHandsEngineGate rather than greying out).
    icon: <CircuitIcon width={16} height={16} />,
    to: "/settings/openhands",
    text: "SETTINGS$NAV_OPENHANDS",
    subtitle: "SETTINGS$PAGE_OPENHANDS_SUBLINE",
    disabledByAcp: true,
  },
  {
    icon: <AppWindow className="size-4" strokeWidth={2} aria-hidden />,
    to: "/settings/app",
    text: "SETTINGS$NAV_APPLICATION",
    subtitle: "SETTINGS$PAGE_APPLICATION_SUBLINE",
  },
  {
    icon: <KeyIcon width={16} height={16} />,
    to: "/settings/secrets",
    text: "SETTINGS$NAV_SECRETS",
    subtitle: "SETTINGS$PAGE_SECRETS_SUBLINE",
  },
];
