import type { BrokerConfig } from "../config.js";
import type { SendMessageRequest } from "../types.js";

/**
 * Build the body for the native `POST /api/conversations`
 * (StartConversationRequest) on a Ready sandbox.
 *
 * Validated against agent-server 1.24.0-python /openapi.json (GROUNDING):
 *  - Discriminator is literally "kind".
 *  - workspace → LocalWorkspace (working_dir under the /workspace PVC mount).
 *  - agent → Agent { llm, tools }. llm carries model + api_key (+ base_url for
 *    proxies). usage_id is "agent".
 *  - tools → [{ name }]; include_default_tools (Finish/Think) added server-side.
 *  - initial_message → SendMessageRequest { role, content[TextContent], run }.
 *    run:true drives the normal flow (the frontend uses run:true).
 *  - conversation_id is passed so the broker controls the id.
 */
export interface BuildNativeBodyParams {
  conversationId: string;
  config: BrokerConfig;
  /** The user's first message, already in {role, content} form (optional). */
  initialMessage?: SendMessageRequest | null;
}

export function buildNativeCreateBody(params: BuildNativeBodyParams): Record<string, unknown> {
  const { conversationId, config, initialMessage } = params;

  const llm: Record<string, unknown> = {
    model: config.llmModel,
    api_key: config.llmApiKey,
    usage_id: "agent",
  };
  if (config.llmBaseUrl) llm.base_url = config.llmBaseUrl;

  const body: Record<string, unknown> = {
    conversation_id: conversationId,
    workspace: { kind: "LocalWorkspace", working_dir: "/workspace/project" },
    agent: {
      kind: "Agent",
      llm,
      tools: [
        { name: "terminal" },
        { name: "file_editor" },
        { name: "task_tracker" },
      ],
    },
    autotitle: true,
  };

  if (initialMessage) {
    body.initial_message = {
      role: initialMessage.role ?? "user",
      content: initialMessage.content ?? [],
      run: true,
    };
  }

  return body;
}

export interface NativeCreateParams {
  /** http base URL of the sandbox runtime, e.g. http://conv-<id>.<ns>.svc.cluster.local:8000 */
  baseUrl: string;
  sessionApiKey: string;
  conversationId: string;
  config: BrokerConfig;
  initialMessage?: SendMessageRequest | null;
  /** Optional fetch override (for tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export interface NativeCreateResult {
  ok: boolean;
  status: number;
  body: string;
}

/**
 * POST the native create request to a Ready sandbox. Returns the raw status +
 * body so the caller can decide idempotency (an already-existing conversation
 * id should be treated as success). Throws only on network-level failures.
 */
export async function createNativeConversation(
  params: NativeCreateParams,
): Promise<NativeCreateResult> {
  const doFetch = params.fetchImpl ?? fetch;
  const url = `${params.baseUrl.replace(/\/+$/, "")}/api/conversations`;
  const body = buildNativeCreateBody({
    conversationId: params.conversationId,
    config: params.config,
    initialMessage: params.initialMessage,
  });

  const res = await doFetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-API-Key": params.sessionApiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}
