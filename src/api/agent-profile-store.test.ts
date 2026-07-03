import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  saveAgentProfile,
  setDefaultAgentProfile,
  getDefaultAgentProfile,
  type AgentProfile,
} from "./agent-profile-store";

vi.mock("./backend-registry/active-store", () => ({
  getActiveBackend: () => ({ backend: { id: "b1" } }),
}));
vi.mock("./settings-service/settings-service.api", () => ({
  default: {
    getMiscAgentProfiles: vi.fn().mockResolvedValue(null),
    saveMiscAgentProfiles: vi.fn().mockResolvedValue(undefined),
  },
}));

const profile = (id: string, engine = "claude-code"): AgentProfile => ({
  id,
  name: `Profile ${id}`,
  engine,
});

describe("getDefaultAgentProfile", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns null when the backend has no profiles", () => {
    expect(getDefaultAgentProfile()).toBeNull();
  });

  it("falls back to the first profile when no default is marked", () => {
    saveAgentProfile(profile("a"));
    saveAgentProfile(profile("b"));
    // No default set — profiles are the only concept, so one is always in
    // effect: the first.
    expect(getDefaultAgentProfile()?.id).toBe("a");
  });

  it("returns the explicitly marked default when set", () => {
    saveAgentProfile(profile("a"));
    saveAgentProfile(profile("b"));
    setDefaultAgentProfile("b");
    expect(getDefaultAgentProfile()?.id).toBe("b");
  });

  it("re-falls back to the first profile after the default is cleared", () => {
    saveAgentProfile(profile("a"));
    saveAgentProfile(profile("b"));
    setDefaultAgentProfile("b");
    setDefaultAgentProfile(null);
    expect(getDefaultAgentProfile()?.id).toBe("a");
  });
});
