import type { ServerResponse } from "node:http";
import type { BrokerConfig } from "../config.js";
import type { K8sClient } from "../k8s/client.js";
import { describeApiError } from "../k8s/client.js";
import {
  ANN_NATIVE_CREATED,
  ANN_TITLE,
  buildSandboxResource,
  conversationIdFromSandboxName,
  createSandbox,
  deleteSandbox,
  derivePodView,
  generateSecret,
  getSandbox,
  getSandboxPod,
  isNativeCreated,
  listSandboxes,
  newConversationId,
  patchAnnotations,
  podViewToStartTaskStatus,
  readSessionApiKeyAnnotation,
  sandboxToAppConversation,
} from "../k8s/sandbox.js";
import { createNativeConversation } from "../agent-server/create-conversation.js";
import type { PortForwardManager } from "../proxy/port-forward.js";
import type {
  AppConversation,
  AppConversationStartRequest,
  AppConversationStartTask,
  SandboxResource,
  SendMessageRequest,
} from "../types.js";
import { sendError, sendJson } from "./http-util.js";

/**
 * Annotation that stores the pending initial message (JSON) so a stateless
 * broker can still issue the native create when the pod becomes Ready. Removed
 * implicitly once native-created is set (we just stop reading it).
 */
const ANN_INITIAL_MESSAGE = "agent-canvas/initial-message";

export interface AppConversationsDeps {
  client: K8sClient;
  config: BrokerConfig;
  forwards: PortForwardManager;
  /** Browser-facing origin, e.g. "http://localhost:8000". */
  publicOrigin: string;
  /** Guards concurrent native-create attempts across poll calls. */
  nativeCreateInFlight: Set<string>;
}

// ── POST /api/k8s/app-conversations ─────────────────────────────────────────

/**
 * Create a sandbox for a new conversation and return a WORKING start-task
 * immediately (never block on pod readiness). The poller drives it to READY.
 */
export async function handleCreate(
  deps: AppConversationsDeps,
  body: AppConversationStartRequest,
  res: ServerResponse,
): Promise<void> {
  const conversationId = newConversationId();
  const sessionApiKey = generateSecret();
  const secretKey = generateSecret();
  const createdAt = new Date().toISOString();

  const sandbox = buildSandboxResource(deps.client, deps.config, {
    conversationId,
    sessionApiKey,
    secretKey,
    title: body.title ?? null,
    selectedRepository: body.selected_repository ?? null,
    llmModel: deps.config.llmModel,
    createdAt,
  });

  // Stash the initial message so the eventual native-create can run statelessly.
  if (body.initial_message) {
    sandbox.metadata.annotations = {
      ...sandbox.metadata.annotations,
      [ANN_INITIAL_MESSAGE]: JSON.stringify(body.initial_message),
    };
  }

  try {
    await createSandbox(deps.client, sandbox);
  } catch (err) {
    sendError(res, 502, `Failed to create sandbox: ${describeApiError(err)}`);
    return;
  }

  const task: AppConversationStartTask = {
    id: conversationId,
    created_by_user_id: null,
    status: "WORKING",
    detail: "Provisioning sandbox.",
    app_conversation_id: null,
    agent_server_url: null,
    request: body,
    created_at: createdAt,
    updated_at: createdAt,
  };
  sendJson(res, 200, task);
}

// ── GET /api/k8s/app-conversations/start-tasks?ids= ─────────────────────────

/**
 * Poll handler = reconcile loop. For each id, derives the start-task status from
 * the live pod and, when Ready and not yet native-created, fires the native
 * POST /api/conversations exactly once.
 */
export async function handleStartTasks(
  deps: AppConversationsDeps,
  ids: string[],
  res: ServerResponse,
): Promise<void> {
  const results = await Promise.all(
    ids.map((id) => reconcileStartTask(deps, id)),
  );
  sendJson(res, 200, results);
}

async function reconcileStartTask(
  deps: AppConversationsDeps,
  conversationId: string,
): Promise<AppConversationStartTask | null> {
  const sandbox = await getSandbox(deps.client, conversationId);
  if (!sandbox) return null;

  const annotations = sandbox.metadata.annotations ?? {};
  const createdAt = annotations["agent-canvas/created-at"] ?? new Date().toISOString();
  const replicas = sandbox.spec?.replicas ?? 0;
  const pod = derivePodView(await getSandboxPod(deps.client, conversationId));
  const request = reconstructStartRequest(sandbox);

  const baseTask: AppConversationStartTask = {
    id: conversationId,
    created_by_user_id: null,
    status: "WORKING",
    detail: null,
    app_conversation_id: null,
    agent_server_url: null,
    request,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
  };

  // Already created → READY (idempotent fast path for resume/refresh).
  if (isNativeCreated(sandbox)) {
    return {
      ...baseTask,
      status: "READY",
      detail: null,
      app_conversation_id: conversationId,
      agent_server_url: `${deps.publicOrigin}/sandbox-runtime/${conversationId}`,
    };
  }

  const { status, detail } = podViewToStartTaskStatus(pod, replicas);

  if (status !== "READY") {
    return { ...baseTask, status, detail };
  }

  // Pod is Ready and native conversation not yet created → create it once.
  const created = await ensureNativeConversation(deps, sandbox);
  if (!created.ok) {
    return { ...baseTask, status: "STARTING_CONVERSATION", detail: created.detail };
  }

  return {
    ...baseTask,
    status: "READY",
    detail: null,
    app_conversation_id: conversationId,
    agent_server_url: `${deps.publicOrigin}/sandbox-runtime/${conversationId}`,
  };
}

/**
 * Idempotently create the native conversation on a Ready sandbox. Guarded by:
 *  - the `native-created` annotation (persisted),
 *  - an in-flight Set (prevents concurrent poll calls from double-POSTing),
 *  - treating an existing conversation id (409/idempotent) as success.
 */
async function ensureNativeConversation(
  deps: AppConversationsDeps,
  sandbox: SandboxResource,
): Promise<{ ok: boolean; detail: string | null }> {
  const conversationId =
    sandbox.metadata.labels?.["agent-canvas/conversation-id"] ??
    conversationIdFromSandboxName(sandbox.metadata.name) ??
    sandbox.metadata.name;

  if (isNativeCreated(sandbox)) return { ok: true, detail: null };
  if (deps.nativeCreateInFlight.has(conversationId)) {
    return { ok: false, detail: "Starting the agent server." };
  }

  const sessionApiKey = readSessionApiKeyAnnotation(sandbox);
  if (!sessionApiKey) {
    return { ok: false, detail: "Sandbox is missing its session key annotation." };
  }

  deps.nativeCreateInFlight.add(conversationId);
  try {
    const localPort = await deps.forwards.ensure(conversationId);
    if (localPort === null) {
      return { ok: false, detail: "Waiting for the sandbox runtime to become reachable." };
    }

    const initialMessage = readInitialMessage(sandbox);
    const result = await createNativeConversation({
      baseUrl: `http://127.0.0.1:${localPort}`,
      sessionApiKey,
      conversationId,
      config: deps.config,
      initialMessage,
    });

    // 2xx, or a conflict meaning the conversation already exists → success.
    const idempotentConflict = result.status === 409;
    if (result.ok || idempotentConflict) {
      await patchAnnotations(deps.client, conversationId, {
        [ANN_NATIVE_CREATED]: "true",
      });
      return { ok: true, detail: null };
    }

    console.error(
      `[broker] native create failed for ${conversationId}: HTTP ${result.status} ${result.body.slice(0, 500)}`,
    );
    return {
      ok: false,
      detail: `Agent server rejected conversation create (HTTP ${result.status}).`,
    };
  } catch (err) {
    console.error(`[broker] native create error for ${conversationId}:`, (err as Error).message);
    return { ok: false, detail: "Starting the agent server." };
  } finally {
    deps.nativeCreateInFlight.delete(conversationId);
  }
}

function readInitialMessage(sandbox: SandboxResource): SendMessageRequest | null {
  const raw = sandbox.metadata.annotations?.[ANN_INITIAL_MESSAGE];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SendMessageRequest;
  } catch {
    return null;
  }
}

function reconstructStartRequest(sandbox: SandboxResource): AppConversationStartRequest {
  const annotations = sandbox.metadata.annotations ?? {};
  return {
    initial_message: readInitialMessage(sandbox),
    title: annotations[ANN_TITLE] ?? null,
    selected_repository: annotations["agent-canvas/selected-repository"] ?? null,
    llm_model: annotations["agent-canvas/llm-model"] ?? null,
  };
}

// ── GET /api/k8s/app-conversations/search ───────────────────────────────────

export async function handleSearch(
  deps: AppConversationsDeps,
  limit: number,
  pageId: string | null,
  res: ServerResponse,
): Promise<void> {
  const sandboxes = await listSandboxes(deps.client);
  const conversations = await mapSandboxesToConversations(deps, sandboxes);

  // Sort UPDATED_AT_DESC (we use created_at as the proxy; newest first).
  conversations.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));

  // Simple offset pagination using page_id as a numeric offset string.
  const offset = pageId ? Number.parseInt(pageId, 10) || 0 : 0;
  const slice = conversations.slice(offset, offset + limit);
  const nextOffset = offset + limit;
  const nextPageId = nextOffset < conversations.length ? String(nextOffset) : null;

  sendJson(res, 200, { items: slice, next_page_id: nextPageId });
}

// ── GET /api/k8s/app-conversations?ids= ─────────────────────────────────────

export async function handleBatchGet(
  deps: AppConversationsDeps,
  ids: string[],
  res: ServerResponse,
): Promise<void> {
  const results = await Promise.all(
    ids.map(async (id) => {
      const sandbox = await getSandbox(deps.client, id);
      if (!sandbox) return null;
      return mapOneSandbox(deps, sandbox);
    }),
  );
  sendJson(res, 200, results);
}

// ── DELETE /api/k8s/app-conversations/{id} ──────────────────────────────────

export async function handleDelete(
  deps: AppConversationsDeps,
  conversationId: string,
  res: ServerResponse,
): Promise<void> {
  deps.forwards.close(conversationId);
  await deleteSandbox(deps.client, conversationId);
  sendJson(res, 200, { success: true });
}

// ── PATCH /api/k8s/app-conversations/{id} (title) ───────────────────────────

export async function handlePatch(
  deps: AppConversationsDeps,
  conversationId: string,
  body: { title?: string; public?: boolean },
  res: ServerResponse,
): Promise<void> {
  const sandbox = await getSandbox(deps.client, conversationId);
  if (!sandbox) {
    sendError(res, 404, "Conversation not found");
    return;
  }
  if (typeof body.title === "string" && body.title.length > 0) {
    await patchAnnotations(deps.client, conversationId, { [ANN_TITLE]: body.title });
  }
  const updated = await getSandbox(deps.client, conversationId);
  const mapped = updated ? await mapOneSandbox(deps, updated) : null;
  sendJson(res, 200, mapped);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function mapOneSandbox(
  deps: AppConversationsDeps,
  sandbox: SandboxResource,
): Promise<AppConversation> {
  const conversationId =
    sandbox.metadata.labels?.["agent-canvas/conversation-id"] ??
    conversationIdFromSandboxName(sandbox.metadata.name) ??
    sandbox.metadata.name;
  const pod = derivePodView(await getSandboxPod(deps.client, conversationId));
  return sandboxToAppConversation(sandbox, pod, { publicOrigin: deps.publicOrigin });
}

async function mapSandboxesToConversations(
  deps: AppConversationsDeps,
  sandboxes: SandboxResource[],
): Promise<AppConversation[]> {
  return Promise.all(sandboxes.map((s) => mapOneSandbox(deps, s)));
}
