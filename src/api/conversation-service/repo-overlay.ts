import { getStoredConversationMetadata } from "../conversation-metadata-store";
import type { AppConversation } from "./agent-server-conversation-service.types";

/**
 * A managed backend (cloud or k8s) does not always echo
 * `selected_repository` / `selected_branch` / `git_provider` back from
 * its `GET …/app-conversations` list until its own background hydration
 * completes. We persist the selection to local storage at connect time
 * (see `AgentServerConversationService.updateConversationRepository`)
 * and overlay it here so the chat-page git control bar reflects the
 * connection immediately, instead of snapping back to the empty
 * "Connect Repo" state on every refetch.
 *
 * Server values take precedence whenever they're populated; the
 * local-storage fallback only fills in fields the server returned as
 * `null`/`undefined`.
 *
 * Shared by `src/api/cloud/conversation-service.api.ts` and
 * `src/api/k8s/conversation-service.api.ts` so both managed backends apply
 * the exact same overlay to their search / batchGet results.
 */
export function overlayStoredRepoSelection(
  conversation: AppConversation | null,
): AppConversation | null {
  if (!conversation?.id) return conversation;
  const stored = getStoredConversationMetadata(conversation.id);
  if (!stored) return conversation;

  return {
    ...conversation,
    selected_repository:
      conversation.selected_repository ?? stored.selected_repository ?? null,
    selected_branch:
      conversation.selected_branch ?? stored.selected_branch ?? null,
    git_provider: conversation.git_provider ?? stored.git_provider ?? null,
    selected_workspace:
      conversation.selected_workspace ?? stored.selected_workspace ?? null,
  };
}
