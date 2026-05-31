import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AGENT_SERVER_CONFIG_STORAGE_KEY } from "#/api/agent-server-config";
import {
  buildAuthHeaders,
  getBackendSessionApiKey,
} from "#/api/backend-registry/auth";
import type { Backend } from "#/api/backend-registry/types";

beforeEach(() => {
  vi.stubEnv("VITE_AGENT_SERVER_TRANSPORT", "same-origin");
  vi.stubEnv("VITE_SESSION_API_KEY", "launcher-session-key");
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe("backend-registry auth", () => {
  it("uses launcher-injected auth for same-origin agent servers", () => {
    window.localStorage.setItem(
      AGENT_SERVER_CONFIG_STORAGE_KEY,
      JSON.stringify({ sessionApiKey: "stored-session-key" }),
    );
    const backend: Backend = {
      id: "same-origin-agent",
      name: "Local",
      host: window.location.origin,
      apiKey: "backend-session-key",
      kind: "agent-server",
      agentServerTransport: "same-origin",
    };

    expect(getBackendSessionApiKey(backend)).toBe("launcher-session-key");
    expect(buildAuthHeaders(backend)).toEqual({
      "X-Session-API-Key": "launcher-session-key",
    });
  });

  it("uses UI auth for remote agent servers", () => {
    window.localStorage.setItem(
      AGENT_SERVER_CONFIG_STORAGE_KEY,
      JSON.stringify({ sessionApiKey: "stored-session-key" }),
    );
    const backend: Backend = {
      id: "remote-agent",
      name: "Remote",
      host: "https://agent.example.com",
      apiKey: "backend-session-key",
      kind: "agent-server",
      agentServerTransport: "remote",
    };

    expect(getBackendSessionApiKey(backend)).toBe("backend-session-key");
    expect(buildAuthHeaders(backend)).toEqual({
      "X-Session-API-Key": "backend-session-key",
    });
  });

  it("does not use launcher auth for remote agent servers without UI auth", () => {
    const backend: Backend = {
      id: "remote-agent",
      name: "Remote",
      host: "https://agent.example.com",
      apiKey: "",
      kind: "agent-server",
      agentServerTransport: "remote",
    };

    expect(getBackendSessionApiKey(backend)).toBeNull();
    expect(buildAuthHeaders(backend)).toEqual({});
  });
});
