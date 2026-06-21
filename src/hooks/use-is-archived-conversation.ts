import { useActiveConversation } from "#/hooks/query/use-active-conversation";
import { isUnavailableSandboxStatus } from "#/utils/conversation-archive-status";

export function useIsArchivedConversation() {
  const { data: conversation } = useActiveConversation();
  return isUnavailableSandboxStatus(conversation?.sandbox_status);
}
