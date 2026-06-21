import type { SandboxStatus } from "#/api/conversation-service/agent-server-conversation-service.types";

/**
 * Returns true for sandbox lifecycle states that render a conversation
 * "unavailable" in the UI: the sandbox is gone (MISSING), explicitly stopped
 * (STOPPED), or errored out (ERROR). These are distinct from a merely
 * archived conversation and are grouped here because they all override the
 * execution-status visual with a sandbox-lifecycle indicator.
 */
export function isUnavailableSandboxStatus(
  sandboxStatus: SandboxStatus | null | undefined,
): boolean {
  return (
    sandboxStatus === "MISSING" ||
    sandboxStatus === "STOPPED" ||
    sandboxStatus === "ERROR"
  );
}
