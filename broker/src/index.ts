import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { configWarnings, imageRef, loadConfig } from "./config.js";
import { isAuthorized } from "./auth.js";
import { createK8sClient } from "./k8s/client.js";
import { PortForwardManager } from "./proxy/port-forward.js";
import {
  handleRuntimeRequest,
  handleRuntimeUpgrade,
} from "./proxy/runtime-proxy.js";
import {
  type AppConversationsDeps,
  handleBatchGet,
  handleCreate,
  handleDelete,
  handlePatch,
  handleSearch,
  handleStartTasks,
} from "./api/app-conversations.js";
import { handlePause, handleResume } from "./api/sandboxes.js";
import { handleDownload, handleFileRead } from "./api/conversation-files.js";
import { pathOnly, queryParams, readJson, sendError, sendJson } from "./api/http-util.js";

const RUNTIME_PREFIX = "/sandbox-runtime/";
const K8S_PREFIX = "/api/k8s";

async function main(): Promise<void> {
  const config = loadConfig();
  for (const w of configWarnings(config)) console.warn(`[broker] WARNING: ${w}`);

  const client = await createK8sClient(config);
  const forwards = new PortForwardManager(client);
  // Browser-facing origin. The frontend reaches the broker through the ingress
  // at localhost:8000, so conversation_url is rooted there (see plan).
  const publicOrigin = process.env.BROKER_PUBLIC_ORIGIN ?? "http://localhost:8000";

  const deps: AppConversationsDeps = {
    client,
    config,
    forwards,
    publicOrigin,
    nativeCreateInFlight: new Set<string>(),
  };

  const server = createServer((req, res) => {
    handleHttp(req, res, deps).catch((err) => {
      console.error("[broker] unhandled request error:", err);
      if (!res.headersSent) sendError(res, 500, "Internal broker error");
      else res.destroy();
    });
  });

  // WebSocket upgrades — only the runtime proxy handles upgrades.
  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    if (url.startsWith(RUNTIME_PREFIX)) {
      handleRuntimeUpgrade(client, forwards, req, socket, head).catch(() => {
        socket.destroy();
      });
    } else {
      socket.destroy();
    }
  });

  server.on("clientError", (err: NodeJS.ErrnoException, socket) => {
    const benign = ["ECONNRESET", "EPIPE", "ECONNABORTED"].includes(err.code ?? "");
    if (!benign) console.error("[broker] client error:", err.message);
    if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
    else socket.destroy();
  });

  server.listen(config.port, () => {
    console.log("");
    console.log("[broker] agent-canvas sandbox broker");
    console.log(`[broker]   listening      http://localhost:${config.port}`);
    console.log(`[broker]   kube context   ${config.kubeContext}`);
    console.log(`[broker]   namespace      ${config.namespace}`);
    console.log(`[broker]   sandbox CRD    agents.x-k8s.io/${client.sandboxApiVersion}`);
    console.log(`[broker]   image          ${imageRef(config)}`);
    console.log(`[broker]   public origin  ${publicOrigin}`);
    console.log(`[broker]   routes         ${K8S_PREFIX}/* , ${RUNTIME_PREFIX}<uuid>/*`);
    console.log("");
  });

  const shutdown = () => {
    console.log("[broker] shutting down...");
    forwards.closeAll();
    server.close(() => process.exit(0));
    // Force-exit if connections linger.
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  process.on("uncaughtException", (err: NodeJS.ErrnoException) => {
    const benign = ["ECONNRESET", "EPIPE", "ECONNABORTED", "ERR_STREAM_PREMATURE_CLOSE"].includes(
      err.code ?? "",
    );
    if (benign) {
      console.warn(`[broker] ignoring socket reset: ${err.code}`);
      return;
    }
    throw err;
  });
}

async function handleHttp(
  req: IncomingMessage,
  res: ServerResponse,
  deps: AppConversationsDeps,
): Promise<void> {
  const url = req.url ?? "";
  const method = req.method ?? "GET";

  // ── Data-plane: runtime proxy (no broker-key check) ──────────────────────
  if (url.startsWith(RUNTIME_PREFIX)) {
    await handleRuntimeRequest(deps.client, deps.forwards, req, res);
    return;
  }

  // ── Control-plane: /api/k8s/* ────────────────────────────────────────────
  if (!url.startsWith(K8S_PREFIX)) {
    sendError(res, 404, "Not found");
    return;
  }

  const path = pathOnly(url);
  const subPath = path.slice(K8S_PREFIX.length); // e.g. "/health", "/app-conversations/abc"

  // Health is unauthenticated.
  if (subPath === "/health") {
    sendJson(res, 200, { status: "ok" });
    return;
  }

  // Everything else requires the broker session key.
  if (!isAuthorized(req, deps.config.brokerSessionApiKey)) {
    sendError(res, 401, "Unauthorized");
    return;
  }

  await routeControlPlane(deps, method, subPath, url, req, res);
}

async function routeControlPlane(
  deps: AppConversationsDeps,
  method: string,
  subPath: string,
  fullUrl: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const params = queryParams(fullUrl);

  // ── /app-conversations collection ────────────────────────────────────────
  if (subPath === "/app-conversations") {
    if (method === "POST") {
      const body = await readJson(req);
      await handleCreate(deps, body as never, res);
      return;
    }
    if (method === "GET") {
      // GET /app-conversations?ids= → batch get
      const ids = params.getAll("ids");
      await handleBatchGet(deps, ids, res);
      return;
    }
    sendError(res, 405, "Method not allowed");
    return;
  }

  if (subPath === "/app-conversations/search" && method === "GET") {
    const limit = Number.parseInt(params.get("limit") ?? "20", 10) || 20;
    const pageId = params.get("page_id");
    await handleSearch(deps, limit, pageId, res);
    return;
  }

  if (subPath === "/app-conversations/start-tasks" && method === "GET") {
    const ids = params.getAll("ids");
    await handleStartTasks(deps, ids, res);
    return;
  }

  // ── /app-conversations/{id}[/file|/download] ─────────────────────────────
  const convMatch = subPath.match(/^\/app-conversations\/([^/]+)(\/file|\/download)?$/);
  if (convMatch) {
    const conversationId = decodeURIComponent(convMatch[1]);
    const suffix = convMatch[2];

    if (suffix === "/file" && method === "GET") {
      const filePath = params.get("file_path") ?? "";
      if (!filePath) {
        sendError(res, 400, "file_path is required");
        return;
      }
      await handleFileRead(
        { client: deps.client, forwards: deps.forwards },
        conversationId,
        filePath,
        res,
      );
      return;
    }

    if (suffix === "/download" && method === "GET") {
      await handleDownload(
        { client: deps.client, forwards: deps.forwards },
        conversationId,
        res,
      );
      return;
    }

    if (!suffix && method === "DELETE") {
      await handleDelete(deps, conversationId, res);
      return;
    }

    if (!suffix && method === "PATCH") {
      const body = await readJson<{ title?: string; public?: boolean }>(req);
      await handlePatch(deps, conversationId, body, res);
      return;
    }

    sendError(res, 405, "Method not allowed");
    return;
  }

  // ── /sandboxes/{id}/{pause,resume} ───────────────────────────────────────
  const sandboxMatch = subPath.match(/^\/sandboxes\/([^/]+)\/(pause|resume)$/);
  if (sandboxMatch && method === "POST") {
    const conversationId = decodeURIComponent(sandboxMatch[1]);
    const action = sandboxMatch[2];
    const sdeps = { client: deps.client, forwards: deps.forwards };
    if (action === "pause") await handlePause(sdeps, conversationId, res);
    else await handleResume(sdeps, conversationId, res);
    return;
  }

  sendError(res, 404, "Not found");
}

main().catch((err) => {
  console.error("[broker] fatal startup error:", err);
  process.exit(1);
});
