import {
  ServerClient,
  SettingsClient,
} from "@openhands/typescript-client/clients";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#/api/agent-server-config", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("#/api/agent-server-config")>();
  return { ...actual, hasConfiguredAgentServerDefaults: () => true };
});

import {
  __resetActiveStoreForTests,
  setActiveSelection,
  setRegisteredBackends,
} from "#/api/backend-registry/active-store";
import type { Backend } from "#/api/backend-registry/types";
import {
  loadAgentServerInfo,
  preflightAgentServerAccess,
} from "#/api/agent-server-compatibility";

const { getServerInfoMock, getSettingsMock } = vi.hoisted(() => ({
  getServerInfoMock: vi.fn(),
  getSettingsMock: vi.fn(),
}));

vi.mock("@openhands/typescript-client/clients", () => ({
  ServerClient: vi.fn(function ServerClientMock() {
    return {
      getServerInfo: getServerInfoMock,
    };
  }),
  SettingsClient: vi.fn(function SettingsClientMock() {
    return {
      getSettings: getSettingsMock,
    };
  }),
}));

const cloudBackend: Backend = {
  id: "prod",
  name: "Production",
  host: "https://app.all-hands.dev",
  apiKey: "bearer-token",
  kind: "cloud",
};

beforeEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  getServerInfoMock.mockReset();
  getSettingsMock.mockReset();
  vi.mocked(ServerClient).mockClear();
  vi.mocked(SettingsClient).mockClear();
  getServerInfoMock.mockResolvedValue({ version: "1.0.0" });
  getSettingsMock.mockResolvedValue({});
});

afterEach(() => {
  window.localStorage.clear();
  __resetActiveStoreForTests();
  vi.unstubAllEnvs();
});

describe("agent-server compatibility probes", () => {
  it("targets the bundled local backend even when the active backend is cloud", async () => {
    setRegisteredBackends([cloudBackend]);
    setActiveSelection({ backendId: cloudBackend.id });

    await loadAgentServerInfo();

    expect(ServerClient).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(ServerClient).mock.calls[0] as unknown as [
      { host?: string; apiKey?: string | null },
    ];
    const overrides = callArgs[0];

    // Must NOT use the cloud host — that endpoint doesn't exist on cloud
    // and would fail with a CORS preflight error.
    expect(overrides.host).toBeDefined();
    expect(overrides.host).not.toBe(cloudBackend.host);
    expect(overrides.host).not.toContain("all-hands.dev");
  });

  it("uses launcher auth for same-origin preflight probes", async () => {
    vi.stubEnv("VITE_AGENT_SERVER_TRANSPORT", "same-origin");
    vi.stubEnv("VITE_SESSION_API_KEY", "launcher-session-key");
    const sameOriginBackend: Backend = {
      id: "same-origin-agent",
      name: "Local",
      host: window.location.origin,
      apiKey: "stale-stored-key",
      kind: "agent-server",
      agentServerTransport: "same-origin",
    };
    setRegisteredBackends([sameOriginBackend]);

    await preflightAgentServerAccess();

    expect(ServerClient).toHaveBeenCalledOnce();
    expect(SettingsClient).toHaveBeenCalledOnce();
    expect(vi.mocked(ServerClient).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        host: window.location.origin,
        apiKey: "launcher-session-key",
      }),
    );
    expect(vi.mocked(SettingsClient).mock.calls[0][0]).toEqual(
      expect.objectContaining({
        host: window.location.origin,
        apiKey: "launcher-session-key",
      }),
    );
  });
});
