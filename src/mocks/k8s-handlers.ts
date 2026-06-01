import { http, delay, HttpResponse } from "msw";
import type {
  AppConversation,
  AppConversationStartRequest,
  AppConversationStartTask,
} from "#/api/conversation-service/agent-server-conversation-service.types";
import { ExecutionStatus } from "#/types/agent-server/core";

/**
 * MSW v2 handlers for the in-app Kubernetes sandbox broker's control-plane
 * (`/api/k8s/*`). They let component/integration tests exercise the `k8s`
 * backend kind without a cluster or a running broker.
 *
 * Wire shapes mirror the cloud mock in `conversation-handlers.ts` and the
 * client in `src/api/k8s/conversation-service.api.ts`. Because `callBroker`
 * unwraps axios `response.data`, every handler returns the JSON body the
 * client expects *after* that unwrap:
 *   - search                → `{ items, next_page_id }`
 *   - batchGet (`?ids=`)     → bare `(AppConversation | null)[]`
 *   - start-tasks (`?ids=`)  → bare `(AppConversationStartTask | null)[]`
 *   - create                → a single `AppConversationStartTask`
 *   - file                  → a JSON string (file contents)
 *   - delete/patch/pause/resume → a small JSON envelope (discarded by client)
 *
 * The broker host is `window.location.origin`, so we match the path with a
 * `*` host wildcard (same approach the cloud handlers use).
 */

const K8S_CONVERSATION_ID = "k8s-conv-1";
const K8S_SANDBOX_ID = "k8s-sandbox-1";
const K8S_SESSION_API_KEY = "k8s-session-key-1";

/** Build the same-origin runtime URL the broker hands back for a sandbox. */
function k8sConversationUrl(conversationId: string): string {
  return `http://localhost:8000/sandbox-runtime/${conversationId}`;
}

const k8sCreatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

/**
 * A single in-memory k8s app-conversation fixture in the RUNNING state, with
 * a populated runtime URL + session key (i.e. resolved past the start task).
 */
function makeK8sConversation(
  overrides: Partial<AppConversation> = {},
): AppConversation {
  return {
    id: K8S_CONVERSATION_ID,
    created_by_user_id: null,
    selected_repository: null,
    selected_branch: null,
    git_provider: null,
    title: "Kubernetes Sandbox Conversation",
    trigger: null,
    pr_number: [],
    llm_model: "openhands/claude-haiku-4-5-20251001",
    metrics: null,
    created_at: k8sCreatedAt,
    updated_at: k8sCreatedAt,
    execution_status: ExecutionStatus.IDLE,
    sandbox_status: "RUNNING",
    conversation_url: k8sConversationUrl(K8S_CONVERSATION_ID),
    session_api_key: K8S_SESSION_API_KEY,
    sandbox_id: K8S_SANDBOX_ID,
    workspace: { working_dir: "/workspace/project" },
    public: false,
    sub_conversation_ids: [],
    ...overrides,
  };
}

const K8S_CONVERSATIONS = new Map<string, AppConversation>([
  [K8S_CONVERSATION_ID, makeK8sConversation()],
]);

/**
 * Build a READY start task for a conversation. The broker reports READY once
 * the sandbox Pod is Ready and the native conversation has been created, with
 * `app_conversation_id`, `agent_server_url` (== conversation_url), and the
 * per-sandbox `session_api_key` populated.
 */
function makeReadyStartTask(
  taskId: string,
  request: AppConversationStartRequest = {},
): AppConversationStartTask {
  return {
    id: taskId,
    created_by_user_id: null,
    status: "READY",
    detail: null,
    app_conversation_id: K8S_CONVERSATION_ID,
    agent_server_url: k8sConversationUrl(K8S_CONVERSATION_ID),
    request,
    created_at: k8sCreatedAt,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Build the initial WORKING start task returned synchronously from create.
 * `app_conversation_id`/`agent_server_url` are null until the poll flips to
 * READY (the broker is provisioning the Sandbox CR + Pod).
 */
function makeWorkingStartTask(
  taskId: string,
  request: AppConversationStartRequest,
): AppConversationStartTask {
  return {
    id: taskId,
    created_by_user_id: null,
    status: "WORKING",
    detail: "Provisioning sandbox",
    app_conversation_id: null,
    agent_server_url: null,
    request,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export const K8S_HANDLERS = [
  // Create — returns a WORKING start task immediately (does not block on the
  // Sandbox CR / Pod becoming Ready). The caller polls start-tasks until READY.
  http.post("*/api/k8s/app-conversations", async ({ request }) => {
    await delay();
    const body = (await request
      .json()
      .catch(() => ({}))) as AppConversationStartRequest;
    const taskId = `k8s-task-${Math.floor(Math.random() * 100000)}`;
    return HttpResponse.json(makeWorkingStartTask(taskId, body ?? {}), {
      status: 201,
    });
  }),

  // Start-task poll — returns a bare array (the client unwraps `[0]`). We
  // resolve straight to READY so tests don't have to spin the poll loop.
  http.get("*/api/k8s/app-conversations/start-tasks", async ({ request }) => {
    const url = new URL(request.url);
    const ids = url.searchParams.getAll("ids");
    if (ids.length === 0) {
      return HttpResponse.json([]);
    }
    return HttpResponse.json(ids.map((id) => makeReadyStartTask(id)));
  }),

  // Search — returns the paginated `{ items, next_page_id }` envelope.
  http.get("*/api/k8s/app-conversations/search", async ({ request }) => {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const items = Array.from(K8S_CONVERSATIONS.values())
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit);
    return HttpResponse.json({ items, next_page_id: null });
  }),

  // Read file from the sandbox workspace — returns a JSON string.
  http.get(
    "*/api/k8s/app-conversations/:conversationId/file",
    async ({ request }) => {
      const url = new URL(request.url);
      const filePath = url.searchParams.get("file_path") ?? "";
      return HttpResponse.json(
        `// Mock contents of ${filePath}\nconsole.log("hello from the k8s sandbox");\n`,
      );
    },
  ),

  // Batch-get by id — returns a bare `(AppConversation | null)[]` aligned to
  // the requested ids (null for unknown ids).
  http.get("*/api/k8s/app-conversations", async ({ request }) => {
    const url = new URL(request.url);
    const ids = url.searchParams.getAll("ids");
    if (ids.length === 0) {
      return HttpResponse.json(Array.from(K8S_CONVERSATIONS.values()));
    }
    return HttpResponse.json(
      ids.map((id) => K8S_CONVERSATIONS.get(id) ?? null),
    );
  }),

  // Delete — tears down the backing Sandbox CR. Returns a Success envelope.
  http.delete(
    "*/api/k8s/app-conversations/:conversationId",
    async ({ params }) => {
      const conversationId = params.conversationId as string;
      K8S_CONVERSATIONS.delete(conversationId);
      return HttpResponse.json({ success: true });
    },
  ),

  // Patch — title / public flag update. Returns the updated conversation.
  http.patch(
    "*/api/k8s/app-conversations/:conversationId",
    async ({ params, request }) => {
      const conversationId = params.conversationId as string;
      const existing =
        K8S_CONVERSATIONS.get(conversationId) ??
        makeK8sConversation({ id: conversationId });
      const body = (await request.json().catch(() => ({}))) as {
        title?: string;
        public?: boolean;
      } | null;
      const updated: AppConversation = {
        ...existing,
        ...(body?.title !== undefined ? { title: body.title } : {}),
        ...(body?.public !== undefined ? { public: body.public } : {}),
        updated_at: new Date().toISOString(),
      };
      K8S_CONVERSATIONS.set(conversationId, updated);
      return HttpResponse.json(updated);
    },
  ),

  // Pause — scales the Pod to 0; workspace state preserved on the PVC.
  http.post("*/api/k8s/sandboxes/:sandboxId/pause", async ({ params }) => {
    const conversation = K8S_CONVERSATIONS.get(K8S_CONVERSATION_ID);
    if (conversation && conversation.sandbox_id === params.sandboxId) {
      K8S_CONVERSATIONS.set(K8S_CONVERSATION_ID, {
        ...conversation,
        sandbox_status: "PAUSED",
        // While paused the runtime is unreachable — null url + key so the
        // frontend applies its PAUSED (no-WS, 3s poll) behavior.
        conversation_url: null,
        session_api_key: null,
        updated_at: new Date().toISOString(),
      });
    }
    return HttpResponse.json({ success: true });
  }),

  // Resume — scales the Pod back to 1; re-populates url + key once Ready.
  http.post("*/api/k8s/sandboxes/:sandboxId/resume", async ({ params }) => {
    const conversation = K8S_CONVERSATIONS.get(K8S_CONVERSATION_ID);
    if (conversation && conversation.sandbox_id === params.sandboxId) {
      K8S_CONVERSATIONS.set(K8S_CONVERSATION_ID, {
        ...conversation,
        sandbox_status: "RUNNING",
        conversation_url: k8sConversationUrl(K8S_CONVERSATION_ID),
        session_api_key: K8S_SESSION_API_KEY,
        updated_at: new Date().toISOString(),
      });
    }
    return HttpResponse.json({ success: true });
  }),

  // Health — no auth, used by the backend health poller (`pingBroker`).
  http.get("*/api/k8s/health", async () => HttpResponse.json({ status: "ok" })),
];

/**
 * Reset the in-memory k8s mock conversation map back to its initial fixture
 * state. Tests that mutate (pause/resume/delete/patch) should call this in a
 * `beforeEach` to stay isolated, mirroring the other resettable mock modules.
 */
export function resetK8sMockData(): void {
  K8S_CONVERSATIONS.clear();
  K8S_CONVERSATIONS.set(K8S_CONVERSATION_ID, makeK8sConversation());
}
