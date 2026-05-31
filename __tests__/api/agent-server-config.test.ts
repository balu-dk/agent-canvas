import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_SERVER_CONFIG_STORAGE_KEY,
  DEFAULT_WORKING_DIR,
  buildConversationWorkingDir,
  getAgentServerBaseUrl,
  getAgentServerFormDefaults,
  getAgentServerSessionApiKey,
  getAgentServerTransport,
  hasConfiguredAgentServerDefaults,
  getAgentServerWorkingDir,
  saveAgentServerConfig,
  shouldLoadPublicSkills,
} from "#/api/agent-server-config";

const ORIGINAL_LOCATION = window.location;

function mockWindowLocation(url: string) {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: new URL(url),
  });
}

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: ORIGINAL_LOCATION,
  });
});

describe("agent server config", () => {
  it("leaves the agent server unconfigured when no URL or transport is configured", () => {
    mockWindowLocation("https://canvas.example.dev/settings");

    expect(getAgentServerBaseUrl()).toBe("");
    expect(getAgentServerTransport()).toBe("remote");
    expect(hasConfiguredAgentServerDefaults()).toBe(false);
  });

  it("uses the browser origin when same-origin transport is configured", () => {
    vi.stubEnv("VITE_AGENT_SERVER_TRANSPORT", "same-origin");
    mockWindowLocation("https://canvas.example.dev/settings");

    expect(getAgentServerBaseUrl()).toBe("https://canvas.example.dev");
    expect(getAgentServerTransport()).toBe("same-origin");
    expect(hasConfiguredAgentServerDefaults()).toBe(true);
  });

  it("preserves a localhost agent server URL from stored config", () => {
    mockWindowLocation("https://work-1.example.dev/settings");
    window.localStorage.setItem(
      AGENT_SERVER_CONFIG_STORAGE_KEY,
      JSON.stringify({ baseUrl: "http://127.0.0.1:8000" }),
    );

    expect(getAgentServerBaseUrl()).toBe("http://127.0.0.1:8000");
    expect(getAgentServerTransport()).toBe("remote");
  });

  it("preserves a non-local backend URL from stored config", () => {
    mockWindowLocation("https://work-1.example.dev/settings");
    window.localStorage.setItem(
      AGENT_SERVER_CONFIG_STORAGE_KEY,
      JSON.stringify({ baseUrl: "https://agent.example.com" }),
    );

    expect(getAgentServerBaseUrl()).toBe("https://agent.example.com");
  });

  it("does not use launcher auth for remote form defaults", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "env-session-key");

    expect(getAgentServerFormDefaults()).toEqual({
      baseUrl: "",
      sessionApiKey: "",
    });
    expect(getAgentServerSessionApiKey()).toBeNull();
  });

  it("uses launcher-injected auth for same-origin and ignores stale stored UI auth", () => {
    vi.stubEnv("VITE_AGENT_SERVER_TRANSPORT", "same-origin");
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    mockWindowLocation("https://canvas.example.dev/settings");
    window.localStorage.setItem(
      AGENT_SERVER_CONFIG_STORAGE_KEY,
      JSON.stringify({ sessionApiKey: "stale-session-key" }),
    );

    expect(getAgentServerFormDefaults()).toEqual({
      baseUrl: "https://canvas.example.dev",
      sessionApiKey: "fresh-session-key",
    });
    expect(getAgentServerSessionApiKey()).toBe("fresh-session-key");
  });

  it("defaults the working dir to the relative workspace path", () => {
    expect(getAgentServerWorkingDir()).toBe(DEFAULT_WORKING_DIR);
  });

  it("nests each conversation's working dir under the configured base using the hex id (matching the server's persistence dir name)", () => {
    vi.stubEnv("VITE_WORKING_DIR", "/srv/workspaces/");

    expect(
      buildConversationWorkingDir("4a8dca37-3bf0-48de-a0af-949d711c3d48"),
    ).toBe("/srv/workspaces/4a8dca373bf048dea0af949d711c3d48");
  });

  it("uses saved interface settings for remote agent servers", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "env-session-key");

    saveAgentServerConfig({
      baseUrl: "https://saved-agent.example.com/",
      sessionApiKey: "saved-session-key ",
      transport: "remote",
    });

    expect(getAgentServerFormDefaults()).toEqual({
      baseUrl: "https://saved-agent.example.com",
      sessionApiKey: "saved-session-key",
    });
    expect(getAgentServerBaseUrl()).toBe("https://saved-agent.example.com");
    expect(getAgentServerSessionApiKey()).toBe("saved-session-key");
  });

  it("uses stored UI auth for remote and ignores launcher-injected auth", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "env-session-key");

    saveAgentServerConfig({
      baseUrl: "https://saved-agent.example.com/",
      sessionApiKey: "saved-session-key",
      transport: "remote",
    });

    expect(getAgentServerTransport()).toBe("remote");
    expect(getAgentServerSessionApiKey()).toBe("saved-session-key");
  });

  it("persists same-origin transport without storing a remote base URL", () => {
    mockWindowLocation("https://canvas.example.dev/settings");

    saveAgentServerConfig({
      baseUrl: "https://canvas.example.dev",
      sessionApiKey: "saved-session-key",
      transport: "same-origin",
    });

    expect(getAgentServerBaseUrl()).toBe("https://canvas.example.dev");
    expect(getAgentServerTransport()).toBe("same-origin");
    expect(
      JSON.parse(window.localStorage.getItem(AGENT_SERVER_CONFIG_STORAGE_KEY)!),
    ).toEqual({
      sessionApiKey: "saved-session-key",
      transport: "same-origin",
    });
  });

  it("loads public skills by default when VITE_LOAD_PUBLIC_SKILLS is unset", () => {
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "");

    expect(shouldLoadPublicSkills()).toBe(true);
  });

  it("loads public skills when VITE_LOAD_PUBLIC_SKILLS is explicitly 'true'", () => {
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "true");

    expect(shouldLoadPublicSkills()).toBe(true);
  });

  it("does not load public skills only when VITE_LOAD_PUBLIC_SKILLS is explicitly 'false'", () => {
    vi.stubEnv("VITE_LOAD_PUBLIC_SKILLS", "false");

    expect(shouldLoadPublicSkills()).toBe(false);
  });
});
