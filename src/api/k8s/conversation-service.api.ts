import type {
  AppConversation,
  AppConversationPage,
  AppConversationStartRequest,
  AppConversationStartTask,
} from "../conversation-service/agent-server-conversation-service.types";
import { overlayStoredRepoSelection } from "../conversation-service/repo-overlay";
import { callBroker } from "./broker-client";

/**
 * k8s control-plane client. Mirrors `src/api/cloud/conversation-service.api.ts`
 * name-for-name and shape-for-shape, but routes through the in-app sandbox
 * broker (`callBroker`, which prepends `/api/k8s`) instead of the cloud proxy.
 *
 * Only app-conversation lifecycle *metadata* lives here (the control plane).
 * Anything that talks to the running runtime (sendMessage, events history,
 * file read/upload, WebSocket — the data plane) reuses the local
 * agent-server code paths with a `{ conversationUrl, sessionApiKey }`
 * override and must NOT go through this module.
 */

/**
 * Search the k8s app-conversations list. Mirrors
 * `searchCloudConversations` — hits the broker's
 * `GET /api/k8s/app-conversations/search`.
 */
export async function searchK8sConversations(
  limit: number = 20,
  pageId?: string,
): Promise<AppConversationPage> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (pageId) params.set("page_id", pageId);
  params.set("sort_order", "UPDATED_AT_DESC");

  const data = await callBroker<{
    items: AppConversation[];
    next_page_id: string | null;
  }>({
    method: "GET",
    path: `/app-conversations/search?${params.toString()}`,
  });

  return {
    items: (data?.items ?? []).map(
      (item) => overlayStoredRepoSelection(item) as AppConversation,
    ),
    next_page_id: data?.next_page_id ?? null,
  };
}

/**
 * Batch-fetch k8s app-conversations by id. Mirrors
 * `batchGetCloudConversations` — hits the broker's
 * `GET /api/k8s/app-conversations?ids=...`.
 */
export async function batchGetK8sConversations(
  ids: string[],
): Promise<(AppConversation | null)[]> {
  if (ids.length === 0) return [];
  const params = new URLSearchParams();
  for (const id of ids) params.append("ids", id);
  const data = await callBroker<(AppConversation | null)[]>({
    method: "GET",
    path: `/app-conversations?${params.toString()}`,
  });
  return (data ?? []).map(overlayStoredRepoSelection);
}

/**
 * Create a v1 app-conversation on the k8s backend. Mirrors
 * `createCloudAppConversation` — POSTs the `AppConversationStartRequest`
 * to the broker's `POST /api/k8s/app-conversations`, returning an
 * `AppConversationStartTask` (initially WORKING). The caller polls
 * `getK8sAppConversationStartTask` until READY or ERROR.
 *
 * Secrets (the LLM key) stay broker-side; the runtime is provisioned with
 * its own ephemeral `session_api_key` returned in the task.
 */
export async function createK8sAppConversation(
  request: AppConversationStartRequest,
): Promise<AppConversationStartTask> {
  return callBroker<AppConversationStartTask>({
    method: "POST",
    path: "/app-conversations",
    body: request,
  });
}

/**
 * Delete a v1 app-conversation on the k8s backend. Mirrors
 * `deleteCloudConversation` — hits the broker's
 * `DELETE /api/k8s/app-conversations/{id}`, which tears down the backing
 * Sandbox CR. The JSON response (if any) is discarded.
 */
export async function deleteK8sConversation(
  conversationId: string,
): Promise<void> {
  await callBroker<unknown>({
    method: "DELETE",
    path: `/app-conversations/${conversationId}`,
  });
}

/**
 * Pause the k8s sandbox backing a v1 app-conversation. Mirrors
 * `pauseCloudSandbox` — hits the broker's
 * `POST /api/k8s/sandboxes/{sandboxId}/pause`, which scales the Pod to 0
 * (preserving workspace state on the PVC).
 */
export async function pauseK8sSandbox(sandboxId: string): Promise<void> {
  await callBroker<unknown>({
    method: "POST",
    path: `/sandboxes/${sandboxId}/pause`,
  });
}

/**
 * Resume a paused k8s sandbox. Mirrors `resumeCloudSandbox` — hits the
 * broker's `POST /api/k8s/sandboxes/{sandboxId}/resume`, which scales the
 * Pod back to 1. This is a lightweight unpause, NOT a fresh create: the
 * native conversation already exists on the PVC and is not re-created.
 */
export async function resumeK8sSandbox(sandboxId: string): Promise<void> {
  await callBroker<unknown>({
    method: "POST",
    path: `/sandboxes/${sandboxId}/resume`,
  });
}

/**
 * Fetch a single v1 app-conversation start task. Mirrors
 * `getCloudAppConversationStartTask` — uses the broker's batch start-tasks
 * endpoint with a single id and unwraps the first result.
 */
export async function getK8sAppConversationStartTask(
  taskId: string,
): Promise<AppConversationStartTask | null> {
  const params = new URLSearchParams();
  params.set("ids", taskId);
  const data = await callBroker<(AppConversationStartTask | null)[]>({
    method: "GET",
    path: `/app-conversations/start-tasks?${params.toString()}`,
  });
  return data?.[0] ?? null;
}

/**
 * Read a file from a k8s conversation's sandbox workspace. Mirrors
 * `readCloudConversationFile` — hits the broker's
 * `GET /api/k8s/app-conversations/{id}/file?file_path=...` and returns the
 * file content as a string.
 */
export async function readK8sConversationFile(
  conversationId: string,
  filePath: string,
): Promise<string> {
  const params = new URLSearchParams();
  params.append("file_path", filePath);
  const data = await callBroker<string>({
    method: "GET",
    path: `/app-conversations/${conversationId}/file?${params.toString()}`,
  });
  return data ?? "";
}
