import { describe, expect, it } from "vitest";
import { buildNativeCreateBody } from "./create-conversation.js";
import type { BrokerConfig } from "../config.js";

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

describe("buildNativeCreateBody", () => {
  it("produces the validated StartConversationRequest shape", () => {
    const body = buildNativeCreateBody({
      conversationId: "b6354027-13e8-4f81-a64e-a1b9b6dab44c",
      config: CONFIG,
    }) as {
      conversation_id: string;
      workspace: { kind: string; working_dir: string };
      agent: { kind: string; llm: Record<string, unknown>; tools: Array<{ name: string }> };
      autotitle: boolean;
    };

    expect(body.conversation_id).toBe("b6354027-13e8-4f81-a64e-a1b9b6dab44c");
    expect(body.workspace).toEqual({ kind: "LocalWorkspace", working_dir: "/workspace/project" });
    expect(body.agent.kind).toBe("Agent");
    expect(body.agent.llm).toEqual({
      model: "anthropic/claude-3-5-sonnet-20241022",
      api_key: "sk-test",
      usage_id: "agent",
    });
    expect(body.agent.tools).toEqual([
      { name: "terminal" },
      { name: "file_editor" },
      { name: "task_tracker" },
    ]);
    expect(body.autotitle).toBe(true);
  });

  it("includes base_url only when configured", () => {
    const withBase = buildNativeCreateBody({
      conversationId: "x",
      config: { ...CONFIG, llmBaseUrl: "https://proxy.example/v1" },
    }) as { agent: { llm: { base_url?: string } } };
    expect(withBase.agent.llm.base_url).toBe("https://proxy.example/v1");

    const withoutBase = buildNativeCreateBody({ conversationId: "x", config: CONFIG }) as {
      agent: { llm: { base_url?: string } };
    };
    expect(withoutBase.agent.llm.base_url).toBeUndefined();
  });

  it("threads through the initial message with run:true", () => {
    const body = buildNativeCreateBody({
      conversationId: "x",
      config: CONFIG,
      initialMessage: {
        role: "user",
        content: [{ type: "text", text: "Hello from the smoke test." }],
      },
    }) as { initial_message?: { role: string; content: unknown[]; run: boolean } };

    expect(body.initial_message).toEqual({
      role: "user",
      content: [{ type: "text", text: "Hello from the smoke test." }],
      run: true,
    });
  });

  it("omits initial_message when none is given", () => {
    const body = buildNativeCreateBody({ conversationId: "x", config: CONFIG }) as {
      initial_message?: unknown;
    };
    expect(body.initial_message).toBeUndefined();
  });
});
