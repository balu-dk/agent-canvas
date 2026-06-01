import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteWorkspace } from "@openhands/typescript-client/workspace/remote-workspace";
import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import {
  resolveConversationRuntime,
  uploadFilesToConversation,
} from "#/api/conversation-file-upload.api";

const fileUploadMock = vi.fn();

vi.mock("@openhands/typescript-client/workspace/remote-workspace", () => ({
  RemoteWorkspace: vi.fn(function RemoteWorkspaceMock() {
    return { fileUpload: fileUploadMock };
  }),
}));

const batchGetCloudConversations = vi.fn();

vi.mock("#/api/cloud/conversation-service.api", () => ({
  batchGetCloudConversations: (...args: unknown[]) =>
    batchGetCloudConversations(...args),
}));

const batchGetK8sConversations = vi.fn();

vi.mock("#/api/k8s/conversation-service.api", () => ({
  batchGetK8sConversations: (...args: unknown[]) =>
    batchGetK8sConversations(...args),
}));

const cloudBackend: Backend = {
  id: "cloud-1",
  name: "Cloud",
  host: "https://app.all-hands.dev",
  apiKey: "cloud-token",
  kind: "cloud",
};

const k8sBackend: Backend = {
  id: "orbstack",
  name: "Kubernetes Agent Sandbox",
  host: "http://localhost:8000",
  apiKey: "broker-session-key",
  kind: "k8s",
};

function makeFile(name: string) {
  return new File(["content"], name, { type: "text/plain" });
}

describe("uploadFilesToConversation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    __resetActiveStoreForTests();
    fileUploadMock.mockResolvedValue(undefined);
    batchGetCloudConversations.mockReset();
    batchGetK8sConversations.mockReset();
  });

  it("uploads local conversations through the bundled agent-server host", async () => {
    setRegisteredBackends([
      {
        id: "local-1",
        name: "Local",
        host: "http://127.0.0.1:18000",
        apiKey: "local-key",
        kind: "local",
      },
    ]);
    setActiveSelection({ backendId: "local-1" });

    const result = await uploadFilesToConversation("conv-1", [
      makeFile("a.txt"),
    ]);

    expect(fileUploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "a.txt" }),
      "/workspace/project/a.txt",
    );
    expect(result.uploaded_files).toEqual(["a.txt"]);
    expect(batchGetCloudConversations).not.toHaveBeenCalled();
  });

  it("uploads cloud conversations against the provisioned runtime URL", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });
    batchGetCloudConversations.mockResolvedValue([
      {
        id: "1717df59-63ee-43bf-b32a-83428d3efdc8",
        conversation_url:
          "http://runtime.example.dev/api/conversations/1717df59-63ee-43bf-b32a-83428d3efdc8",
        session_api_key: "runtime-session-key",
        workspace: { working_dir: "/workspace/project" },
      },
    ]);

    const conversationId = "1717df59-63ee-43bf-b32a-83428d3efdc8";
    const result = await uploadFilesToConversation(conversationId, [
      makeFile("notes.md"),
    ]);

    expect(batchGetCloudConversations).toHaveBeenCalledWith([conversationId]);
    expect(RemoteWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "http://runtime.example.dev",
        apiKey: "runtime-session-key",
      }),
    );
    expect(fileUploadMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "notes.md" }),
      "/workspace/project/notes.md",
    );
    expect(result.uploaded_files).toEqual(["notes.md"]);
  });

  it("uploads k8s conversations against the broker-proxied runtime URL", async () => {
    setRegisteredBackends([k8sBackend]);
    setActiveSelection({ backendId: k8sBackend.id });
    batchGetK8sConversations.mockResolvedValue([
      {
        id: "1717df59-63ee-43bf-b32a-83428d3efdc8",
        conversation_url:
          "http://localhost:8000/sandbox-runtime/1717df59-63ee-43bf-b32a-83428d3efdc8",
        session_api_key: "sandbox-session-key",
        workspace: { working_dir: "/workspace/project" },
      },
    ]);

    const conversationId = "1717df59-63ee-43bf-b32a-83428d3efdc8";
    const result = await uploadFilesToConversation(conversationId, [
      makeFile("notes.md"),
    ]);

    // k8s resolves the runtime via the k8s control-plane, not the cloud one.
    expect(batchGetK8sConversations).toHaveBeenCalledWith([conversationId]);
    expect(batchGetCloudConversations).not.toHaveBeenCalled();
    // Upload targets the broker-proxied sandbox runtime (host + path prefix),
    // with the per-sandbox session key — the local-runtime upload path.
    expect(RemoteWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        host: `http://localhost:8000/sandbox-runtime/${conversationId}`,
        apiKey: "sandbox-session-key",
      }),
    );
    expect(result.uploaded_files).toEqual(["notes.md"]);
  });
});

describe("resolveConversationRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    __resetActiveStoreForTests();
    batchGetCloudConversations.mockReset();
    batchGetK8sConversations.mockReset();
  });

  it("resolves k8s runtimes via batchGetK8sConversations", async () => {
    setRegisteredBackends([k8sBackend]);
    setActiveSelection({ backendId: k8sBackend.id });
    batchGetK8sConversations.mockResolvedValue([
      {
        id: "conv-k8s",
        conversation_url: "  http://localhost:8000/sandbox-runtime/conv-k8s  ",
        session_api_key: "  sandbox-key  ",
      },
    ]);

    const runtime = await resolveConversationRuntime("conv-k8s");

    expect(batchGetK8sConversations).toHaveBeenCalledWith(["conv-k8s"]);
    expect(batchGetCloudConversations).not.toHaveBeenCalled();
    // Whitespace is trimmed by the resolver.
    expect(runtime).toEqual({
      conversationUrl: "http://localhost:8000/sandbox-runtime/conv-k8s",
      sessionApiKey: "sandbox-key",
    });
  });

  it("returns the hydrated conversation's runtime without a network call for k8s", async () => {
    setRegisteredBackends([k8sBackend]);
    setActiveSelection({ backendId: k8sBackend.id });

    const runtime = await resolveConversationRuntime("conv-k8s", {
      id: "conv-k8s",
      conversation_url: "http://localhost:8000/sandbox-runtime/conv-k8s",
      session_api_key: "hydrated-key",
    } as never);

    expect(batchGetK8sConversations).not.toHaveBeenCalled();
    expect(runtime).toEqual({
      conversationUrl: "http://localhost:8000/sandbox-runtime/conv-k8s",
      sessionApiKey: "hydrated-key",
    });
  });
});
