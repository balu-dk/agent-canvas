import type { ServerResponse } from "node:http";
import type { K8sClient } from "../k8s/client.js";
import { describeApiError } from "../k8s/client.js";
import { getSandbox, patchReplicas } from "../k8s/sandbox.js";
import type { PortForwardManager } from "../proxy/port-forward.js";
import { sendError, sendJson } from "./http-util.js";

export interface SandboxesDeps {
  client: K8sClient;
  forwards: PortForwardManager;
}

/**
 * POST /api/k8s/sandboxes/{id}/pause → scale spec.replicas to 0. The controller
 * terminates the pod; PVC (and thus encrypted state) survives. The runtime URL
 * goes null in the AppConversation mapper while paused.
 */
export async function handlePause(
  deps: SandboxesDeps,
  conversationId: string,
  res: ServerResponse,
): Promise<void> {
  const sandbox = await getSandbox(deps.client, conversationId);
  if (!sandbox) {
    sendError(res, 404, "Sandbox not found");
    return;
  }
  try {
    await patchReplicas(deps.client, conversationId, 0);
  } catch (err) {
    sendError(res, 502, `Failed to pause sandbox: ${describeApiError(err)}`);
    return;
  }
  // Drop the tunnel; the pod is going away.
  deps.forwards.close(conversationId);
  sendJson(res, 200, { success: true });
}

/**
 * POST /api/k8s/sandboxes/{id}/resume → scale spec.replicas to 1. The native
 * conversation already exists on the PVC, so we do NOT re-create it; the stable
 * per-sandbox OH_SECRET_KEY (annotation) lets the agent decrypt its state. The
 * poller re-populates conversation_url/session_api_key once the pod is Ready.
 */
export async function handleResume(
  deps: SandboxesDeps,
  conversationId: string,
  res: ServerResponse,
): Promise<void> {
  const sandbox = await getSandbox(deps.client, conversationId);
  if (!sandbox) {
    sendError(res, 404, "Sandbox not found");
    return;
  }
  try {
    await patchReplicas(deps.client, conversationId, 1);
  } catch (err) {
    sendError(res, 502, `Failed to resume sandbox: ${describeApiError(err)}`);
    return;
  }
  sendJson(res, 200, { success: true });
}
