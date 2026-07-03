import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetActiveBackend, mockGetMisc, mockSaveMisc } = vi.hoisted(() => ({
  mockGetActiveBackend: vi.fn(() => ({
    backend: {
      id: "backend-a",
      name: "Backend A",
      host: "http://127.0.0.1:8000",
      apiKey: null,
      kind: "local" as const,
    },
  })),
  mockGetMisc: vi.fn(async () => null as unknown),
  mockSaveMisc: vi.fn(async () => {}),
}));

vi.mock("#/api/backend-registry/active-store", () => ({
  getActiveBackend: mockGetActiveBackend,
}));

vi.mock("#/api/settings-service/settings-service.api", () => ({
  default: {
    getMiscAgentProfiles: mockGetMisc,
    saveMiscAgentProfiles: mockSaveMisc,
  },
}));

import {
  deleteAgentProfile,
  getAgentProfile,
  getAgentProfiles,
  getDefaultAgentProfile,
  getProfileCredentialAliases,
  loadAgentProfilesFromServer,
  saveAgentProfile,
  setDefaultAgentProfile,
  type AgentProfile,
} from "#/api/agent-profile-store";

const claudeWork: AgentProfile = {
  id: "p1",
  name: "Claude Code (arbejde)",
  engine: "claude-code",
  credentialEnvVar: "CLAUDE_CODE_OAUTH_TOKEN",
  credentialSecretName: "CLAUDE_CODE_OAUTH_TOKEN_WORK",
};

const openhands: AgentProfile = {
  id: "p2",
  name: "OpenHands",
  engine: "openhands",
};

beforeEach(() => {
  window.localStorage.clear();
  mockGetMisc.mockReset().mockResolvedValue(null);
  mockSaveMisc.mockReset().mockResolvedValue(undefined);
  mockGetActiveBackend.mockReturnValue({
    backend: {
      id: "backend-a",
      name: "Backend A",
      host: "http://127.0.0.1:8000",
      apiKey: null,
      kind: "local",
    },
  });
});

describe("agent-profile-store", () => {
  it("saves, updates and deletes profiles", () => {
    saveAgentProfile(claudeWork);
    saveAgentProfile(openhands);
    expect(getAgentProfiles()).toHaveLength(2);

    saveAgentProfile({ ...claudeWork, name: "Renamed" });
    expect(getAgentProfiles()).toHaveLength(2);
    expect(getAgentProfile("p1")?.name).toBe("Renamed");

    deleteAgentProfile("p1");
    expect(getAgentProfiles()).toHaveLength(1);
    expect(getAgentProfile("p1")).toBeNull();
  });

  it("manages the default pointer, falling back on delete", () => {
    saveAgentProfile(claudeWork);
    saveAgentProfile(openhands);
    expect(getDefaultAgentProfile()).toBeNull();

    setDefaultAgentProfile("p1");
    expect(getDefaultAgentProfile()?.id).toBe("p1");

    deleteAgentProfile("p1");
    // Falls back to the first remaining profile rather than dangling.
    expect(getDefaultAgentProfile()?.id).toBe("p2");
  });

  it("scopes profiles per backend", () => {
    saveAgentProfile(claudeWork);
    expect(getAgentProfiles()).toHaveLength(1);

    mockGetActiveBackend.mockReturnValue({
      backend: {
        id: "backend-b",
        name: "Backend B",
        host: "http://other:8000",
        apiKey: null,
        kind: "local",
      },
    });
    expect(getAgentProfiles()).toHaveLength(0);
  });

  it("builds credential aliases only when env var and secret differ", () => {
    expect(getProfileCredentialAliases(claudeWork)).toEqual({
      CLAUDE_CODE_OAUTH_TOKEN: "CLAUDE_CODE_OAUTH_TOKEN_WORK",
    });
    expect(getProfileCredentialAliases(openhands)).toEqual({});
    expect(getProfileCredentialAliases(null)).toEqual({});
    expect(
      getProfileCredentialAliases({
        ...claudeWork,
        credentialSecretName: "CLAUDE_CODE_OAUTH_TOKEN",
      }),
    ).toEqual({});
  });
});

describe("agent-profile-store server persistence", () => {
  it("writes through to the server on save (full object)", () => {
    saveAgentProfile(claudeWork);
    expect(mockSaveMisc).toHaveBeenCalledWith({
      profiles: [claudeWork],
      default_profile_id: null,
    });
  });

  it("hydrates from the server, mirroring it into the local cache", async () => {
    mockGetMisc.mockResolvedValue({
      profiles: [claudeWork, openhands],
      default_profile_id: "p1",
    });
    await loadAgentProfilesFromServer(true);
    expect(getAgentProfiles().map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(getDefaultAgentProfile()?.id).toBe("p1");
  });

  it("migrates local-only profiles up to the server when the server is empty", async () => {
    saveAgentProfile(openhands); // local write (also calls save once)
    mockSaveMisc.mockClear();
    mockGetMisc.mockResolvedValue(null); // server has nothing yet
    await loadAgentProfilesFromServer(true);
    // Local profile preserved…
    expect(getAgentProfiles().map((p) => p.id)).toEqual(["p2"]);
    // …and seeded to the server.
    expect(mockSaveMisc).toHaveBeenCalledWith({
      profiles: [openhands],
      default_profile_id: null,
    });
  });
});
