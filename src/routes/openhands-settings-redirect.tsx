import { Navigate, useLocation } from "react-router";

/**
 * Back-compat redirects for the pre-grouping deep links: the LLM,
 * Condenser and Verification pages moved under `/settings/openhands`
 * as sub-tabs. Registered for all three legacy paths; the tab is derived
 * from the pathname's last segment.
 */
export default function OpenHandsSettingsRedirect() {
  const { pathname } = useLocation();
  const tab = pathname.split("/").filter(Boolean).pop() ?? "llm";
  return <Navigate to={`/settings/openhands?tab=${tab}`} replace />;
}
