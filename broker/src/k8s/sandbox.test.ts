import { describe, expect, it } from "vitest";
import type { K8sClient } from "./client.js";
import {
  buildSandboxResource,
  conversationIdFromSandboxName,
  derivePodView,
  deriveSandboxStatus,
  isNativeCreated,
  podViewToStartTaskStatus,
  sandboxName,
  sandboxToAppConversation,
} from "./sandbox.js";
import type { PodView, SandboxResource } from "../types.js";
import type { BrokerConfig } from "../config.js";

const CLIENT = {
  sandboxApiVersion: "v1alpha1",
  namespace: "agent-canvas",
} as unknown as K8sClient;

const CONFIG: BrokerConfig = {
  port: 18002,
  kubeContext: "orbstack",
  namespace: "agent-canvas",
  brokerSessionApiKey: "brokerkey",
  agentServerImage: "ghcr.io/openhands/agent-server",
  agentServerImageTag: "1.24.0-python",
  llmModel: "anthropic/claude-3-5-sonnet-20241022",
  llmApiKey: "sk-test",
  llmBaseUrl: null,
  sandboxApiVersionOverride: null,
};

describe("naming helpers", () => {
  it("sandboxName / conversationIdFromSandboxName round-trip", () => {
    const id = "b6354027-13e8-4f81-a64e-a1b9b6dab44c";
    expect(sandboxName(id)).toBe(`conv-${id}`);
    expect(conversationIdFromSandboxName(`conv-${id}`)).toBe(id);
  });

  it("returns null for non-conv names", () => {
    expect(conversationIdFromSandboxName("other-thing")).toBeNull();
  });
});

describe("buildSandboxResource", () => {
  const sb = buildSandboxResource(CLIENT, CONFIG, {
    conversationId: "abc",
    sessionApiKey: "sk-sess",
    secretKey: "sk-secret",
    title: "My title",
    selectedRepository: "owner/repo",
    llmModel: CONFIG.llmModel,
    createdAt: "2026-05-31T00:00:00.000Z",
  });

  it("uses the discovered apiVersion and conv- name", () => {
    expect(sb.apiVersion).toBe("agents.x-k8s.io/v1alpha1");
    expect(sb.metadata.name).toBe("conv-abc");
    expect(sb.metadata.namespace).toBe("agent-canvas");
  });

  it("carries managed-by + conversation-id labels", () => {
    expect(sb.metadata.labels?.["app.kubernetes.io/managed-by"]).toBe(
      "agent-canvas-broker",
    );
    expect(sb.metadata.labels?.["agent-canvas/conversation-id"]).toBe("abc");
  });

  it("stores per-conversation state in annotations", () => {
    const ann = sb.metadata.annotations ?? {};
    expect(ann["agent-canvas/session-api-key"]).toBe("sk-sess");
    expect(ann["agent-canvas/secret-key"]).toBe("sk-secret");
    expect(ann["agent-canvas/title"]).toBe("My title");
    expect(ann["agent-canvas/selected-repository"]).toBe("owner/repo");
    expect(ann["agent-canvas/created-at"]).toBe("2026-05-31T00:00:00.000Z");
  });

  it("requests a Service and a workspace PVC, replicas=1", () => {
    expect(sb.spec.service).toBe(true);
    expect(sb.spec.replicas).toBe(1);
    expect(sb.spec.volumeClaimTemplates).toBeTruthy();
  });

  it("sets the agent-server container env + image + port", () => {
    const spec = sb.spec.podTemplate as {
      spec: {
        containers: Array<{
          image: string;
          ports: Array<{ containerPort: number }>;
          env: Array<{ name: string; value: string }>;
        }>;
      };
    };
    const c = spec.spec.containers[0];
    expect(c.image).toBe("ghcr.io/openhands/agent-server:1.24.0-python");
    expect(c.ports[0].containerPort).toBe(8000);
    const envByName = Object.fromEntries(c.env.map((e) => [e.name, e.value]));
    expect(envByName.OH_SESSION_API_KEYS_0).toBe("sk-sess");
    expect(envByName.OH_SECRET_KEY).toBe("sk-secret");
    expect(envByName.OH_ENABLE_VSCODE).toBe("false");
    expect(envByName.OH_ENABLE_VNC).toBe("false");
    expect(envByName.OH_CONVERSATIONS_PATH).toBe("/workspace/conversations");
  });
});

describe("derivePodView", () => {
  it("returns null for a null pod", () => {
    expect(derivePodView(null)).toBeNull();
  });

  it("marks Pending with no container statuses as pulling", () => {
    const view = derivePodView({
      status: { phase: "Pending", conditions: [], containerStatuses: [] },
    } as never);
    expect(view).toEqual({ phase: "Pending", ready: false, waitingReason: null, pulling: true });
  });

  it("detects readiness via the Ready condition", () => {
    const view = derivePodView({
      status: {
        phase: "Running",
        conditions: [{ type: "Ready", status: "True" }],
        containerStatuses: [{ state: { running: {} } }],
      },
    } as never);
    expect(view?.ready).toBe(true);
    expect(view?.pulling).toBe(false);
  });

  it("surfaces a crash-loop waiting reason", () => {
    const view = derivePodView({
      status: {
        phase: "Running",
        conditions: [{ type: "Ready", status: "False" }],
        containerStatuses: [{ state: { waiting: { reason: "CrashLoopBackOff" } } }],
      },
    } as never);
    expect(view?.waitingReason).toBe("CrashLoopBackOff");
  });

  it("treats ContainerCreating as pulling (benign)", () => {
    const view = derivePodView({
      status: {
        phase: "Pending",
        conditions: [{ type: "Ready", status: "False" }],
        containerStatuses: [{ state: { waiting: { reason: "ContainerCreating" } } }],
      },
    } as never);
    expect(view?.pulling).toBe(true);
    expect(view?.waitingReason).toBeNull();
  });
});

describe("podViewToStartTaskStatus", () => {
  const pulling: PodView = { phase: "Pending", ready: false, waitingReason: null, pulling: true };
  const running: PodView = { phase: "Running", ready: false, waitingReason: null, pulling: false };
  const ready: PodView = { phase: "Running", ready: true, waitingReason: null, pulling: false };

  it("paused replicas → WAITING_FOR_SANDBOX", () => {
    expect(podViewToStartTaskStatus(ready, 0).status).toBe("WAITING_FOR_SANDBOX");
  });

  it("no pod → WAITING_FOR_SANDBOX", () => {
    expect(podViewToStartTaskStatus(null, 1).status).toBe("WAITING_FOR_SANDBOX");
  });

  it("pulling → WAITING_FOR_SANDBOX (never premature ERROR)", () => {
    expect(podViewToStartTaskStatus(pulling, 1).status).toBe("WAITING_FOR_SANDBOX");
  });

  it("running-not-ready → STARTING_CONVERSATION", () => {
    expect(podViewToStartTaskStatus(running, 1).status).toBe("STARTING_CONVERSATION");
  });

  it("ready → READY", () => {
    const r = podViewToStartTaskStatus(ready, 1);
    expect(r.status).toBe("READY");
    expect(r.detail).toBeNull();
  });

  it("crash loop → ERROR", () => {
    const crashed: PodView = {
      phase: "Running",
      ready: false,
      waitingReason: "CrashLoopBackOff",
      pulling: false,
    };
    expect(podViewToStartTaskStatus(crashed, 1).status).toBe("ERROR");
  });

  it("hard image error (not pulling) → ERROR", () => {
    const badImage: PodView = {
      phase: "Pending",
      ready: false,
      waitingReason: "ErrImagePull",
      pulling: false,
    };
    expect(podViewToStartTaskStatus(badImage, 1).status).toBe("ERROR");
  });

  it("image pull backoff WHILE pulling → still WAITING_FOR_SANDBOX", () => {
    const backoff: PodView = {
      phase: "Pending",
      ready: false,
      waitingReason: "ImagePullBackOff",
      pulling: true,
    };
    expect(podViewToStartTaskStatus(backoff, 1).status).toBe("WAITING_FOR_SANDBOX");
  });
});

describe("deriveSandboxStatus", () => {
  it("replicas 0 → PAUSED", () => {
    expect(deriveSandboxStatus(null, 0)).toBe("PAUSED");
  });
  it("replicas>0 + ready → RUNNING", () => {
    expect(
      deriveSandboxStatus({ phase: "Running", ready: true, waitingReason: null, pulling: false }, 1),
    ).toBe("RUNNING");
  });
  it("replicas>0 + not ready → STARTING", () => {
    expect(deriveSandboxStatus(null, 1)).toBe("STARTING");
  });
});

describe("sandboxToAppConversation", () => {
  const base: SandboxResource = {
    apiVersion: "agents.x-k8s.io/v1alpha1",
    kind: "Sandbox",
    metadata: {
      name: "conv-abc",
      namespace: "agent-canvas",
      labels: { "agent-canvas/conversation-id": "abc" },
      annotations: {
        "agent-canvas/created-at": "2026-05-31T00:00:00.000Z",
        "agent-canvas/session-api-key": "sk-sess",
        "agent-canvas/title": "Hello",
        "agent-canvas/llm-model": "anthropic/claude-3-5-sonnet-20241022",
        "agent-canvas/selected-repository": "owner/repo",
      },
    },
    spec: { replicas: 1 },
  };
  const opts = { publicOrigin: "http://localhost:8000" };

  it("running+ready exposes conversation_url and session_api_key", () => {
    const ready: PodView = { phase: "Running", ready: true, waitingReason: null, pulling: false };
    const conv = sandboxToAppConversation(base, ready, opts);
    expect(conv.id).toBe("abc");
    expect(conv.sandbox_id).toBe("abc");
    expect(conv.sandbox_status).toBe("RUNNING");
    expect(conv.conversation_url).toBe("http://localhost:8000/sandbox-runtime/abc");
    expect(conv.session_api_key).toBe("sk-sess");
    expect(conv.title).toBe("Hello");
    expect(conv.llm_model).toBe("anthropic/claude-3-5-sonnet-20241022");
    expect(conv.selected_repository).toBe("owner/repo");
    expect(conv.agent_kind).toBe("openhands");
    expect(conv.workspace).toEqual({ working_dir: "/workspace/project" });
  });

  it("paused → null url/key and PAUSED status", () => {
    const paused = { ...base, spec: { replicas: 0 } };
    const conv = sandboxToAppConversation(paused, null, opts);
    expect(conv.sandbox_status).toBe("PAUSED");
    expect(conv.conversation_url).toBeNull();
    expect(conv.session_api_key).toBeNull();
  });

  it("starting (not ready) → STARTING and null url/key", () => {
    const starting: PodView = {
      phase: "Running",
      ready: false,
      waitingReason: null,
      pulling: false,
    };
    const conv = sandboxToAppConversation(base, starting, opts);
    expect(conv.sandbox_status).toBe("STARTING");
    expect(conv.conversation_url).toBeNull();
    expect(conv.session_api_key).toBeNull();
  });
});

describe("isNativeCreated", () => {
  it("true only when the annotation is the string 'true'", () => {
    const yes = {
      metadata: { name: "conv-x", annotations: { "agent-canvas/native-created": "true" } },
    } as unknown as SandboxResource;
    const no = { metadata: { name: "conv-x", annotations: {} } } as unknown as SandboxResource;
    expect(isNativeCreated(yes)).toBe(true);
    expect(isNativeCreated(no)).toBe(false);
  });
});
