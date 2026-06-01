import { randomUUID, randomBytes } from "node:crypto";
import { setHeaderOptions } from "@kubernetes/client-node";
import type { V1Pod } from "@kubernetes/client-node";
import type { BrokerConfig } from "../config.js";
import { imageRef } from "../config.js";
import type {
  AppConversation,
  AppConversationStartTaskStatus,
  PodView,
  SandboxResource,
  SandboxStatus,
} from "../types.js";
import {
  apiErrorCode,
  isNotFound,
  sandboxApiVersionString,
  SANDBOX_GROUP,
  SANDBOX_PLURAL,
  type K8sClient,
} from "./client.js";

// ── Naming, labels, annotations ─────────────────────────────────────────────

export const MANAGED_BY = "agent-canvas-broker";
export const LABEL_MANAGED_BY = "app.kubernetes.io/managed-by";
export const LABEL_CONVERSATION_ID = "agent-canvas/conversation-id";

const ANN_PREFIX = "agent-canvas/";
export const ANN_TITLE = `${ANN_PREFIX}title`;
export const ANN_CREATED_AT = `${ANN_PREFIX}created-at`;
export const ANN_SESSION_API_KEY = `${ANN_PREFIX}session-api-key`;
export const ANN_SECRET_KEY = `${ANN_PREFIX}secret-key`;
export const ANN_SELECTED_REPOSITORY = `${ANN_PREFIX}selected-repository`;
export const ANN_LLM_MODEL = `${ANN_PREFIX}llm-model`;
/** Set once the native POST /api/conversations has succeeded. */
export const ANN_NATIVE_CREATED = `${ANN_PREFIX}native-created`;

/** Sandbox name for a conversation: `conv-<uuid>`. */
export function sandboxName(conversationId: string): string {
  return `conv-${conversationId}`;
}

/** Extract the conversation uuid from a `conv-<uuid>` sandbox name. */
export function conversationIdFromSandboxName(name: string): string | null {
  return name.startsWith("conv-") ? name.slice("conv-".length) : null;
}

/** Generate a fresh, lowercased conversation UUID (broker controls the id). */
export function newConversationId(): string {
  return randomUUID().toLowerCase();
}

/** Generate a URL-safe random secret (session key / OH_SECRET_KEY). */
export function generateSecret(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

// ── CR construction ─────────────────────────────────────────────────────────

export interface CreateSandboxParams {
  conversationId: string;
  sessionApiKey: string;
  secretKey: string;
  title?: string | null;
  selectedRepository?: string | null;
  llmModel?: string | null;
  createdAt: string;
}

/**
 * Build the Sandbox CR body for a conversation. Mirrors the grounded,
 * cluster-validated CR (spec.service:true → controller surfaces
 * status.serviceFQDN; volumeClaimTemplates → /workspace PVC). The broker is
 * stateless: every piece of per-conversation state lives in labels/annotations
 * so it can be reconstructed from the cluster.
 */
export function buildSandboxResource(
  client: K8sClient,
  config: BrokerConfig,
  params: CreateSandboxParams,
): SandboxResource {
  const name = sandboxName(params.conversationId);
  const labels: Record<string, string> = {
    [LABEL_MANAGED_BY]: MANAGED_BY,
    [LABEL_CONVERSATION_ID]: params.conversationId,
  };

  const annotations: Record<string, string> = {
    [ANN_CREATED_AT]: params.createdAt,
    [ANN_SESSION_API_KEY]: params.sessionApiKey,
    [ANN_SECRET_KEY]: params.secretKey,
  };
  if (params.title) annotations[ANN_TITLE] = params.title;
  if (params.selectedRepository) {
    annotations[ANN_SELECTED_REPOSITORY] = params.selectedRepository;
  }
  if (params.llmModel) annotations[ANN_LLM_MODEL] = params.llmModel;

  return {
    apiVersion: sandboxApiVersionString(client),
    kind: "Sandbox",
    metadata: { name, namespace: client.namespace, labels, annotations },
    spec: {
      replicas: 1,
      // Controller creates a headless Service and surfaces status.serviceFQDN.
      service: true,
      podTemplate: {
        metadata: { labels: { ...labels } },
        spec: {
          containers: [
            {
              name: "agent-server",
              image: imageRef(config),
              ports: [{ name: "http", containerPort: 8000 }],
              env: [
                { name: "OH_SESSION_API_KEYS_0", value: params.sessionApiKey },
                { name: "OH_SECRET_KEY", value: params.secretKey },
                { name: "OH_ENABLE_VSCODE", value: "false" },
                { name: "OH_ENABLE_VNC", value: "false" },
                { name: "OH_CONVERSATIONS_PATH", value: "/workspace/conversations" },
              ],
              readinessProbe: {
                httpGet: { path: "/ready", port: 8000 },
                initialDelaySeconds: 5,
                periodSeconds: 5,
                timeoutSeconds: 3,
                failureThreshold: 60,
              },
              resources: {
                requests: { cpu: "250m", memory: "1Gi" },
                limits: { cpu: "2", memory: "4Gi" },
              },
              volumeMounts: [{ name: "workspace", mountPath: "/workspace" }],
            },
          ],
        },
      },
      volumeClaimTemplates: [
        {
          metadata: { name: "workspace" },
          spec: {
            accessModes: ["ReadWriteOnce"],
            resources: { requests: { storage: "2Gi" } },
          },
        },
      ],
    },
  };
}

// ── CRUD against the cluster ────────────────────────────────────────────────

const MERGE_PATCH = setHeaderOptions("Content-Type", "application/merge-patch+json");

export async function createSandbox(
  client: K8sClient,
  body: SandboxResource,
): Promise<SandboxResource> {
  const created = await client.customObjects.createNamespacedCustomObject({
    group: SANDBOX_GROUP,
    version: client.sandboxApiVersion,
    namespace: client.namespace,
    plural: SANDBOX_PLURAL,
    body,
  });
  return created as SandboxResource;
}

/** Get a Sandbox by conversation id, or null if it doesn't exist. */
export async function getSandbox(
  client: K8sClient,
  conversationId: string,
): Promise<SandboxResource | null> {
  try {
    const got = await client.customObjects.getNamespacedCustomObject({
      group: SANDBOX_GROUP,
      version: client.sandboxApiVersion,
      namespace: client.namespace,
      plural: SANDBOX_PLURAL,
      name: sandboxName(conversationId),
    });
    return got as SandboxResource;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

/** List all broker-managed sandboxes in the namespace. */
export async function listSandboxes(client: K8sClient): Promise<SandboxResource[]> {
  const res = await client.customObjects.listNamespacedCustomObject({
    group: SANDBOX_GROUP,
    version: client.sandboxApiVersion,
    namespace: client.namespace,
    plural: SANDBOX_PLURAL,
    labelSelector: `${LABEL_MANAGED_BY}=${MANAGED_BY}`,
  });
  const items = (res as { items?: unknown[] }).items ?? [];
  return items as SandboxResource[];
}

/** Patch spec.replicas (0 = paused, 1 = running) via a merge-patch. */
export async function patchReplicas(
  client: K8sClient,
  conversationId: string,
  replicas: number,
): Promise<void> {
  await client.customObjects.patchNamespacedCustomObject(
    {
      group: SANDBOX_GROUP,
      version: client.sandboxApiVersion,
      namespace: client.namespace,
      plural: SANDBOX_PLURAL,
      name: sandboxName(conversationId),
      body: { spec: { replicas } },
    },
    MERGE_PATCH,
  );
}

/** Merge-patch the sandbox's annotations (e.g. title, native-created flag). */
export async function patchAnnotations(
  client: K8sClient,
  conversationId: string,
  annotations: Record<string, string>,
): Promise<void> {
  await client.customObjects.patchNamespacedCustomObject(
    {
      group: SANDBOX_GROUP,
      version: client.sandboxApiVersion,
      namespace: client.namespace,
      plural: SANDBOX_PLURAL,
      name: sandboxName(conversationId),
      body: { metadata: { annotations } },
    },
    MERGE_PATCH,
  );
}

/** Delete the Sandbox CR. Owner-ref GC removes Pod + PVC + Service. */
export async function deleteSandbox(
  client: K8sClient,
  conversationId: string,
): Promise<void> {
  try {
    await client.customObjects.deleteNamespacedCustomObject({
      group: SANDBOX_GROUP,
      version: client.sandboxApiVersion,
      namespace: client.namespace,
      plural: SANDBOX_PLURAL,
      name: sandboxName(conversationId),
    });
  } catch (err) {
    if (isNotFound(err)) return;
    throw err;
  }
}

/** Look up the pod for a sandbox via the conversation-id label, or null. */
export async function getSandboxPod(
  client: K8sClient,
  conversationId: string,
): Promise<V1Pod | null> {
  try {
    const list = await client.core.listNamespacedPod({
      namespace: client.namespace,
      labelSelector: `${LABEL_CONVERSATION_ID}=${conversationId}`,
    });
    const pods = list.items ?? [];
    if (pods.length === 0) return null;
    // Prefer a non-terminating pod; fall back to the first.
    const live = pods.find((p) => !p.metadata?.deletionTimestamp);
    return live ?? pods[0];
  } catch (err) {
    if (apiErrorCode(err) === 404) return null;
    throw err;
  }
}

// ── Pure derivations (unit-tested) ──────────────────────────────────────────

/** Container-waiting reasons that indicate an unrecoverable image error. */
const IMAGE_ERROR_REASONS = new Set([
  "ErrImagePull",
  "ImagePullBackOff",
  "InvalidImageName",
  "ImageInspectError",
]);

/** Container-waiting reasons that are benign while an image is being pulled. */
const PULLING_REASONS = new Set([
  "ContainerCreating",
  "PodInitializing",
  "ImagePullBackOff", // transient backoff during a slow pull; treated as pulling
  "ErrImagePull", // first transient pull error; reconcile keeps waiting
]);

/** Container-waiting reasons that indicate a genuine crash loop. */
const CRASH_REASONS = new Set(["CrashLoopBackOff", "RunContainerError"]);

/**
 * Reduce a V1Pod to the minimal view the reconcile loop needs. Pure aside from
 * the input pod object.
 */
export function derivePodView(pod: V1Pod | null): PodView | null {
  if (!pod) return null;
  const phase = pod.status?.phase ?? "Unknown";
  const conditions = pod.status?.conditions ?? [];
  const ready = conditions.some((c) => c.type === "Ready" && c.status === "True");

  let waitingReason: string | null = null;
  let pulling = false;
  const containerStatuses = pod.status?.containerStatuses ?? [];
  for (const cs of containerStatuses) {
    const reason = cs.state?.waiting?.reason;
    if (reason) {
      if (PULLING_REASONS.has(reason)) pulling = true;
      // Surface the first crash/image-error reason as the notable one.
      if (
        waitingReason === null &&
        (CRASH_REASONS.has(reason) || IMAGE_ERROR_REASONS.has(reason))
      ) {
        waitingReason = reason;
      }
    }
  }
  // While Pending with no container status yet, the image is still being pulled
  // / the container is being created.
  if (phase === "Pending" && containerStatuses.length === 0) pulling = true;

  return { phase, ready, waitingReason, pulling };
}

/**
 * Map a pod view + replicas to a start-task status. Implements the plan's
 * state machine:
 *   - serviceFQDN set + pod Pending/pulling  → WAITING_FOR_SANDBOX
 *   - Running but not Ready                  → STARTING_CONVERSATION
 *   - Ready                                  → READY (caller does native create)
 *   - CrashLoop / hard image error           → ERROR
 * Never returns ERROR for a transient pull state — image pulls can take minutes
 * and the frontend poller has no client-side timeout.
 */
export function podViewToStartTaskStatus(
  pod: PodView | null,
  replicas: number,
): { status: AppConversationStartTaskStatus; detail: string | null } {
  // A paused sandbox shouldn't normally be polled as a start-task, but be safe.
  if (replicas === 0) {
    return { status: "WAITING_FOR_SANDBOX", detail: "Sandbox is paused." };
  }

  if (!pod) {
    return {
      status: "WAITING_FOR_SANDBOX",
      detail: "Provisioning sandbox (first run pulls the image; this can take a few minutes).",
    };
  }

  // Hard, non-recoverable failures.
  if (pod.waitingReason && CRASH_REASONS.has(pod.waitingReason)) {
    return { status: "ERROR", detail: `Agent server crashed (${pod.waitingReason}).` };
  }
  if (
    pod.waitingReason &&
    IMAGE_ERROR_REASONS.has(pod.waitingReason) &&
    !pod.pulling
  ) {
    // Only ERROR on a hard image error that is NOT a transient backoff.
    return { status: "ERROR", detail: `Failed to pull image (${pod.waitingReason}).` };
  }
  if (pod.phase === "Failed") {
    return { status: "ERROR", detail: "Sandbox pod failed." };
  }

  if (pod.ready) {
    return { status: "READY", detail: null };
  }

  if (pod.phase === "Running") {
    return { status: "STARTING_CONVERSATION", detail: "Starting the agent server." };
  }

  // Pending / pulling / unknown — keep waiting, never premature ERROR.
  return {
    status: "WAITING_FOR_SANDBOX",
    detail: "Provisioning sandbox (first run pulls the image; this can take a few minutes).",
  };
}

/**
 * Map replicas + pod readiness to the AppConversation.sandbox_status enum.
 *   replicas === 0          → PAUSED
 *   replicas > 0 + Ready    → RUNNING
 *   replicas > 0 + !Ready   → STARTING
 */
export function deriveSandboxStatus(
  pod: PodView | null,
  replicas: number,
): SandboxStatus {
  if (replicas === 0) return "PAUSED";
  if (pod?.ready) return "RUNNING";
  return "STARTING";
}

// ── CR → AppConversation mapper (pure, unit-tested) ─────────────────────────

export interface MapToAppConversationOptions {
  /** Base origin the browser uses to reach the broker, e.g. "http://localhost:8000". */
  publicOrigin: string;
}

/**
 * Map a Sandbox CR (+ derived pod view) to the AppConversation the frontend
 * expects. `conversation_url` / `session_api_key` are null while PAUSED so the
 * frontend applies its no-WS + poll behavior; they are populated once the
 * resumed pod is Ready.
 */
export function sandboxToAppConversation(
  sandbox: SandboxResource,
  pod: PodView | null,
  opts: MapToAppConversationOptions,
): AppConversation {
  const labels = sandbox.metadata.labels ?? {};
  const annotations = sandbox.metadata.annotations ?? {};
  const conversationId =
    labels[LABEL_CONVERSATION_ID] ??
    conversationIdFromSandboxName(sandbox.metadata.name) ??
    sandbox.metadata.name;

  const replicas = sandbox.spec?.replicas ?? 0;
  const sandboxStatus = deriveSandboxStatus(pod, replicas);
  const ready = sandboxStatus === "RUNNING";

  const createdAt =
    annotations[ANN_CREATED_AT] ??
    sandbox.metadata.creationTimestamp ??
    new Date().toISOString();

  // Expose the runtime URL/key only when the runtime is actually reachable
  // (running + Ready). PAUSED/STARTING → null so the UI doesn't try to connect.
  const conversationUrl = ready
    ? `${opts.publicOrigin}/sandbox-runtime/${conversationId}`
    : null;
  const sessionApiKey = ready ? annotations[ANN_SESSION_API_KEY] ?? null : null;

  return {
    id: conversationId,
    created_by_user_id: null,
    selected_repository: annotations[ANN_SELECTED_REPOSITORY] ?? null,
    selected_branch: null,
    git_provider: null,
    title: annotations[ANN_TITLE] ?? null,
    trigger: null,
    pr_number: [],
    agent_kind: "openhands",
    acp_server: null,
    llm_model: annotations[ANN_LLM_MODEL] ?? null,
    metrics: null,
    created_at: createdAt,
    updated_at: createdAt,
    execution_status: null,
    sandbox_status: sandboxStatus,
    conversation_url: conversationUrl,
    session_api_key: sessionApiKey,
    sandbox_id: conversationId,
    workspace: { working_dir: "/workspace/project" },
    selected_workspace: null,
    public: false,
    sub_conversation_ids: [],
  };
}

/** Read the stable per-sandbox session API key from annotations (or null). */
export function readSessionApiKeyAnnotation(sandbox: SandboxResource): string | null {
  return sandbox.metadata.annotations?.[ANN_SESSION_API_KEY] ?? null;
}

/** Whether the native conversation has already been created on this sandbox. */
export function isNativeCreated(sandbox: SandboxResource): boolean {
  return sandbox.metadata.annotations?.[ANN_NATIVE_CREATED] === "true";
}
