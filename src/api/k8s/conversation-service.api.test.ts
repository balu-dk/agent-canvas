import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AppConversation,
  AppConversationStartRequest,
  AppConversationStartTask,
} from "../conversation-service/agent-server-conversation-service.types";

// Mock the broker client so we can assert each control-plane function hits
// the right broker path without any network / backend state.
const callBroker = vi.fn();
vi.mock("./broker-client", () => ({
  callBroker: (...args: unknown[]) => callBroker(...args),
}));

// Mock the repo overlay so search/batchGet results pass through unchanged
// (the overlay itself is covered where it lives).
vi.mock("../conversation-service/repo-overlay", () => ({
  overlayStoredRepoSelection: (c: AppConversation | null) => c,
}));

import {
  batchGetK8sConversations,
  createK8sAppConversation,
  deleteK8sConversation,
  getK8sAppConversationStartTask,
  pauseK8sSandbox,
  readK8sConversationFile,
  resumeK8sSandbox,
  searchK8sConversations,
} from "./conversation-service.api";

function makeConversation(id: string): AppConversation {
  return {
    id,
    created_by_user_id: null,
    selected_repository: null,
    selected_branch: null,
    git_provider: null,
    title: null,
    trigger: null,
    pr_number: [],
    llm_model: null,
    metrics: null,
    created_at: "2026-05-31T00:00:00Z",
    updated_at: "2026-05-31T00:00:00Z",
    execution_status: null,
    conversation_url: null,
    session_api_key: null,
    sandbox_id: null,
    sub_conversation_ids: [],
  };
}

describe("k8s conversation-service control-plane paths", () => {
  beforeEach(() => {
    callBroker.mockReset();
  });

  it("searchK8sConversations GETs /app-conversations/search with params", async () => {
    callBroker.mockResolvedValue({
      items: [makeConversation("a")],
      next_page_id: "next",
    });

    const page = await searchK8sConversations(20, "page-2");

    expect(callBroker).toHaveBeenCalledTimes(1);
    const arg = callBroker.mock.calls[0][0];
    expect(arg.method).toBe("GET");
    expect(arg.path).toContain("/app-conversations/search?");
    expect(arg.path).toContain("limit=20");
    expect(arg.path).toContain("page_id=page-2");
    expect(arg.path).toContain("sort_order=UPDATED_AT_DESC");
    // Must NOT include the /api/k8s prefix — callBroker prepends that.
    expect(arg.path.startsWith("/api/k8s")).toBe(false);

    expect(page.items).toHaveLength(1);
    expect(page.next_page_id).toBe("next");
  });

  it("batchGetK8sConversations GETs /app-conversations with repeated ids", async () => {
    callBroker.mockResolvedValue([makeConversation("a"), null]);

    const result = await batchGetK8sConversations(["a", "b"]);

    const arg = callBroker.mock.calls[0][0];
    expect(arg.method).toBe("GET");
    expect(arg.path).toContain("/app-conversations?");
    expect(arg.path).toContain("ids=a");
    expect(arg.path).toContain("ids=b");
    expect(result).toHaveLength(2);
  });

  it("batchGetK8sConversations short-circuits on empty ids", async () => {
    const result = await batchGetK8sConversations([]);
    expect(result).toEqual([]);
    expect(callBroker).not.toHaveBeenCalled();
  });

  it("createK8sAppConversation POSTs /app-conversations with the request body", async () => {
    const task = { id: "t1", status: "WORKING" } as AppConversationStartTask;
    callBroker.mockResolvedValue(task);
    const request: AppConversationStartRequest = { title: "hi" };

    const result = await createK8sAppConversation(request);

    const arg = callBroker.mock.calls[0][0];
    expect(arg.method).toBe("POST");
    expect(arg.path).toBe("/app-conversations");
    expect(arg.body).toBe(request);
    expect(result).toBe(task);
  });

  it("deleteK8sConversation DELETEs /app-conversations/{id}", async () => {
    callBroker.mockResolvedValue(undefined);

    await deleteK8sConversation("conv-1");

    const arg = callBroker.mock.calls[0][0];
    expect(arg.method).toBe("DELETE");
    expect(arg.path).toBe("/app-conversations/conv-1");
  });

  it("pauseK8sSandbox POSTs /sandboxes/{id}/pause", async () => {
    callBroker.mockResolvedValue(undefined);

    await pauseK8sSandbox("sb-1");

    const arg = callBroker.mock.calls[0][0];
    expect(arg.method).toBe("POST");
    expect(arg.path).toBe("/sandboxes/sb-1/pause");
  });

  it("resumeK8sSandbox POSTs /sandboxes/{id}/resume", async () => {
    callBroker.mockResolvedValue(undefined);

    await resumeK8sSandbox("sb-1");

    const arg = callBroker.mock.calls[0][0];
    expect(arg.method).toBe("POST");
    expect(arg.path).toBe("/sandboxes/sb-1/resume");
  });

  it("getK8sAppConversationStartTask GETs /app-conversations/start-tasks and unwraps the first", async () => {
    const task = { id: "t1", status: "READY" } as AppConversationStartTask;
    callBroker.mockResolvedValue([task]);

    const result = await getK8sAppConversationStartTask("t1");

    const arg = callBroker.mock.calls[0][0];
    expect(arg.method).toBe("GET");
    expect(arg.path).toContain("/app-conversations/start-tasks?");
    expect(arg.path).toContain("ids=t1");
    expect(result).toBe(task);
  });

  it("getK8sAppConversationStartTask returns null when the batch is empty", async () => {
    callBroker.mockResolvedValue([]);
    const result = await getK8sAppConversationStartTask("missing");
    expect(result).toBeNull();
  });

  it("readK8sConversationFile GETs /app-conversations/{id}/file with file_path", async () => {
    callBroker.mockResolvedValue("file-contents");

    const result = await readK8sConversationFile("conv-1", "/workspace/a.txt");

    const arg = callBroker.mock.calls[0][0];
    expect(arg.method).toBe("GET");
    expect(arg.path).toContain("/app-conversations/conv-1/file?");
    expect(arg.path).toContain("file_path=");
    expect(result).toBe("file-contents");
  });

  it("readK8sConversationFile returns empty string when broker yields nullish", async () => {
    callBroker.mockResolvedValue(undefined);
    const result = await readK8sConversationFile("conv-1", "/a.txt");
    expect(result).toBe("");
  });
});
