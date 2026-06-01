/**
 * Wire types for the sandbox broker.
 *
 * The broker is a standalone Node service compiled with its own tsconfig, so it
 * cannot import the frontend's `src/**` types directly. These interfaces MIRROR
 * the frontend contract in
 *   src/api/conversation-service/agent-server-conversation-service.types.ts
 * exactly (field names + nullability). If the frontend types change, update
 * these to match. The mapping is asserted by the unit tests.
 */

// ── Mirrors src/types/agent-server/core/base/common.ts ExecutionStatus ──────
export type ExecutionStatus =
  | "idle"
  | "running"
  | "paused"
  | "waiting_for_confirmation"
  | "finished"
  | "error"
  | "stuck";

// ── Mirrors SandboxStatus (V1SandboxStatus) ─────────────────────────────────
export type SandboxStatus =
  | "PAUSED"
  | "RUNNING"
  | "STARTING"
  | "MISSING"
  | "ERROR";

// ── Mirrors AppConversationStartTaskStatus ──────────────────────────────────
export type AppConversationStartTaskStatus =
  | "WORKING"
  | "WAITING_FOR_SANDBOX"
  | "PREPARING_REPOSITORY"
  | "RUNNING_SETUP_SCRIPT"
  | "SETTING_UP_GIT_HOOKS"
  | "SETTING_UP_SKILLS"
  | "STARTING_CONVERSATION"
  | "READY"
  | "ERROR";

// Provider mirrors src/types/settings.ts Provider (keys of ProviderOptions).
// The broker never sets it to a concrete value, so a loose alias is fine.
export type Provider = string;

export type ConversationTrigger = string;

export interface MessageTextContent {
  type: "text";
  text: string;
}

export interface MessageImageContent {
  type: "image";
  image_urls: string[];
}

export type MessageContent = MessageTextContent | MessageImageContent;

export type MessageRole = "user" | "system" | "assistant" | "tool";

export interface SendMessageRequest {
  role: MessageRole;
  content: MessageContent[];
}

// ── Mirrors AppConversationStartRequest ─────────────────────────────────────
export interface AppConversationStartRequest {
  initial_message?: SendMessageRequest | null;
  processors?: unknown[];
  llm_model?: string | null;
  selected_repository?: string | null;
  selected_branch?: string | null;
  git_provider?: Provider | null;
  suggested_task?: unknown | null;
  title?: string | null;
  trigger?: ConversationTrigger | null;
  pr_number?: number[];
  parent_conversation_id?: string | null;
  agent_type?: "default" | "plan";
  sandbox_id?: string | null;
  plugins?: unknown[] | null;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  context_window: number;
  per_turn_token: number;
}

export interface MetricsSnapshot {
  accumulated_cost: number | null;
  max_budget_per_task: number | null;
  accumulated_token_usage: TokenUsage | null;
}

export interface ConversationWorkspace {
  working_dir: string | null;
}

// ── Mirrors AppConversationStartTask ────────────────────────────────────────
export interface AppConversationStartTask {
  id: string;
  created_by_user_id: string | null;
  status: AppConversationStartTaskStatus;
  detail: string | null;
  app_conversation_id: string | null;
  agent_server_url: string | null;
  request: AppConversationStartRequest;
  created_at: string;
  updated_at: string;
}

// ── Mirrors AppConversation ─────────────────────────────────────────────────
export interface AppConversation {
  id: string;
  created_by_user_id: string | null;
  selected_repository: string | null;
  selected_branch: string | null;
  git_provider: Provider | null;
  title: string | null;
  trigger: ConversationTrigger | null;
  pr_number: number[];
  agent_kind?: "openhands" | "acp" | null;
  acp_server?: string | null;
  llm_model: string | null;
  metrics: MetricsSnapshot | null;
  created_at: string;
  updated_at: string;
  execution_status: ExecutionStatus | null;
  sandbox_status?: SandboxStatus | null;
  conversation_url: string | null;
  session_api_key: string | null;
  sandbox_id: string | null;
  workspace?: ConversationWorkspace | null;
  selected_workspace?: string | null;
  public?: boolean;
  sub_conversation_ids: string[];
}

export interface AppConversationPage {
  items: AppConversation[];
  next_page_id: string | null;
}

// ── Sandbox custom resource (agents.x-k8s.io) ───────────────────────────────
// Minimal, broker-relevant view of the Sandbox CR. The spec/status carry only
// the fields the broker reads or writes; the controller owns everything else.

export interface SandboxMeta {
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  creationTimestamp?: string;
  uid?: string;
}

export interface SandboxStatusBlock {
  /** FQDN of the controller-created headless Service. */
  serviceFQDN?: string;
  /** Name of the controller-created Service. */
  service?: string;
  podIPs?: string[];
  conditions?: Array<{
    type: string;
    status: string;
    reason?: string;
    message?: string;
  }>;
  [k: string]: unknown;
}

export interface SandboxResource {
  apiVersion: string;
  kind: "Sandbox";
  metadata: SandboxMeta;
  spec: {
    replicas?: number;
    service?: boolean;
    podTemplate?: unknown;
    volumeClaimTemplates?: unknown;
    [k: string]: unknown;
  };
  status?: SandboxStatusBlock;
}

/**
 * Simplified pod view the reconcile loop needs. Derived from a V1Pod.
 */
export interface PodView {
  /** Pod.status.phase: Pending | Running | Succeeded | Failed | Unknown. */
  phase: string;
  /** True when the Ready condition is True. */
  ready: boolean;
  /**
   * A terminal/waiting reason worth surfacing (e.g. CrashLoopBackOff,
   * ErrImagePull, ImagePullBackOff). Null when nothing notable.
   */
  waitingReason: string | null;
  /** Whether any container is in a waiting state that is benign during pull. */
  pulling: boolean;
}
