import { afterEach, describe, expect, it, vi } from "vitest";

import { toAppConversation } from "#/api/agent-server-adapter";
import {
  __resetActiveStoreForTests,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import { DEFAULT_LOCAL_BACKEND_ID } from "#/api/backend-registry/default-backend";

const directInfo = (id: string) => ({
  id,
  created_at: "2026-05-05T00:00:00Z",
  updated_at: "2026-05-05T00:00:00Z",
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.unstubAllEnvs();
});

describe("toAppConversation session_api_key hydration", () => {
  it("uses launcher-injected auth for same-origin backends over stale UI auth", () => {
    vi.stubEnv("VITE_AGENT_SERVER_TRANSPORT", "same-origin");
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");

    setRegisteredBackends([
      {
        id: DEFAULT_LOCAL_BACKEND_ID,
        name: "Local",
        host: window.location.origin,
        apiKey: "stale-session-key",
        kind: "agent-server",
        agentServerTransport: "same-origin",
      },
    ]);

    const conversation = toAppConversation(directInfo("conv-1"));
    expect(conversation.session_api_key).toBe("fresh-session-key");
  });

  it("uses UI auth for remote backends and ignores launcher-injected auth", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "launcher-session-key");

    setRegisteredBackends([
      {
        id: "remote-agent",
        name: "Remote",
        host: "https://agent.example.com",
        apiKey: "remote-session-key",
        kind: "agent-server",
        agentServerTransport: "remote",
      },
    ]);

    const conversation = toAppConversation(directInfo("conv-2"));
    expect(conversation.session_api_key).toBe("remote-session-key");
  });
});
