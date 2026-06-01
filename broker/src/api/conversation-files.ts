import type { ServerResponse } from "node:http";
import type { K8sClient } from "../k8s/client.js";
import { getSandbox, readSessionApiKeyAnnotation } from "../k8s/sandbox.js";
import type { PortForwardManager } from "../proxy/port-forward.js";
import { sendError } from "./http-util.js";

export interface ConversationFilesDeps {
  client: K8sClient;
  forwards: PortForwardManager;
}

/**
 * Resolve a reachable runtime base URL (via the port-forward tunnel) and the
 * sandbox's session key, or null when the sandbox isn't running.
 */
async function resolveRuntime(
  deps: ConversationFilesDeps,
  conversationId: string,
): Promise<{ baseUrl: string; sessionApiKey: string } | null> {
  const sandbox = await getSandbox(deps.client, conversationId);
  if (!sandbox || (sandbox.spec?.replicas ?? 0) === 0) return null;
  const sessionApiKey = readSessionApiKeyAnnotation(sandbox);
  if (!sessionApiKey) return null;
  const localPort = await deps.forwards.ensure(conversationId);
  if (localPort === null) return null;
  return { baseUrl: `http://127.0.0.1:${localPort}`, sessionApiKey };
}

/**
 * GET /api/k8s/app-conversations/{id}/file?file_path=...
 * Proxy a text-file read to the runtime's `GET /file/download?path=...`.
 * Mirrors cloud's per-conversation file endpoint. The frontend k8s data-plane
 * normally reads files via the runtime proxy directly; this exists for parity
 * with the documented control-plane route table.
 */
export async function handleFileRead(
  deps: ConversationFilesDeps,
  conversationId: string,
  filePath: string,
  res: ServerResponse,
): Promise<void> {
  const runtime = await resolveRuntime(deps, conversationId);
  if (!runtime) {
    sendError(res, 502, "Sandbox not running");
    return;
  }
  const url = `${runtime.baseUrl}/file/download?path=${encodeURIComponent(filePath)}`;
  try {
    const upstream = await fetch(url, {
      headers: { "X-Session-API-Key": runtime.sessionApiKey },
    });
    const text = await upstream.text();
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") ?? "text/plain",
    });
    res.end(text);
  } catch (err) {
    sendError(res, 502, `Failed to read file: ${(err as Error).message}`);
  }
}

/**
 * GET /api/k8s/app-conversations/{id}/download
 * Best-effort proxy of the conversation working dir as an archive from the
 * runtime. Returns 501 when the runtime offers no archive endpoint in this
 * version (v1 scope) rather than failing opaquely.
 */
export async function handleDownload(
  deps: ConversationFilesDeps,
  conversationId: string,
  res: ServerResponse,
): Promise<void> {
  const runtime = await resolveRuntime(deps, conversationId);
  if (!runtime) {
    sendError(res, 502, "Sandbox not running");
    return;
  }
  // The agent-server exposes single-file download (/file/download) but no
  // whole-conversation zip in 1.24.0. The frontend's k8s download path uses the
  // local FileClient.downloadTrajectory via the runtime proxy instead, so this
  // control-plane endpoint is a parity stub.
  sendError(res, 501, "Conversation archive download is not supported by the k8s broker.");
}
