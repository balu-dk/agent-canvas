import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVE_BACKEND_STORAGE_KEY,
  BACKENDS_STORAGE_KEY,
  readStoredActiveBackend,
  readStoredBackends,
  writeStoredActiveBackend,
  writeStoredBackends,
} from "#/api/backend-registry/storage";
import { getBackendSessionApiKey } from "#/api/backend-registry/auth";
import type { Backend } from "#/api/backend-registry/types";

beforeEach(() => {
  vi.stubEnv("VITE_AGENT_SERVER_TRANSPORT", "same-origin");
  vi.stubEnv("VITE_SESSION_API_KEY", "test-session-key");
});

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllEnvs();
});

describe("backend-registry storage", () => {
  it("round-trips a list of backends", () => {
    const backends: Backend[] = [
      {
        id: "abc",
        name: "Local 1",
        host: "http://127.0.0.1:9000",
        apiKey: "key-1",
        kind: "agent-server",
      },
      {
        id: "xyz",
        name: "Production",
        host: "https://app.all-hands.dev",
        apiKey: "bearer-2",
        kind: "cloud",
      },
    ];

    writeStoredBackends(backends);

    expect(readStoredBackends()).toEqual(backends);
  });

  it("returns empty list when storage is malformed", () => {
    window.localStorage.setItem(BACKENDS_STORAGE_KEY, "{not-json");
    expect(readStoredBackends()).toEqual([]);
  });

  it("seeds the default Local backend when storage key is missing", () => {
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).toBeNull();

    const result = readStoredBackends();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "default-local", kind: "agent-server" });
    // Persists the seed so a subsequent read returns the same entry.
    expect(window.localStorage.getItem(BACKENDS_STORAGE_KEY)).not.toBeNull();
    expect(readStoredBackends()).toEqual(result);
  });

  it("re-seeds the default Local backend when storage holds an empty array", () => {
    window.localStorage.setItem(BACKENDS_STORAGE_KEY, JSON.stringify([]));

    const result = readStoredBackends();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "default-local", kind: "agent-server" });
  });

  it("re-seeds the default Local backend when every stored entry is invalid", () => {
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([{ kind: "cloud" }, "not-an-object"]),
    );

    const result = readStoredBackends();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "default-local", kind: "agent-server" });
  });

  it("filters out backends with invalid shape", () => {
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        { id: "ok", name: "x", host: "y", apiKey: "z", kind: "agent-server" },
        { id: "missing-kind", name: "x", host: "y", apiKey: "z" },
        { kind: "cloud" },
        "not-an-object",
      ]),
    );

    expect(readStoredBackends()).toEqual([
      { id: "ok", name: "x", host: "y", apiKey: "z", kind: "agent-server" },
    ]);
  });

  it("keeps a missing API key on the default Local backend", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: window.location.origin,
          apiKey: "",
          kind: "agent-server",
        },
      ]),
    );

    const result = readStoredBackends();

    expect(result[0]).toMatchObject({
      id: "default-local",
      apiKey: "",
    });
    expect(
      JSON.parse(window.localStorage.getItem(BACKENDS_STORAGE_KEY)!)[0],
    ).toMatchObject({
      id: "default-local",
      apiKey: "",
    });
  });


  it("keeps and uses a stored remote API key on the default Local backend", () => {
    vi.stubEnv("VITE_AGENT_SERVER_TRANSPORT", "remote");
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: "https://agent.example.com",
          apiKey: "stored-session-key",
          kind: "agent-server",
          agentServerTransport: "remote",
        },
      ]),
    );

    const result = readStoredBackends();

    expect(result[0]).toMatchObject({
      id: "default-local",
      apiKey: "stored-session-key",
      agentServerTransport: "remote",
    });
    expect(getBackendSessionApiKey(result[0])).toBe("stored-session-key");
    expect(
      JSON.parse(window.localStorage.getItem(BACKENDS_STORAGE_KEY) ?? "[]")[0],
    ).toMatchObject({
      id: "default-local",
      apiKey: "stored-session-key",
      agentServerTransport: "remote",
    });
  });

  it("keeps but does not use a stale same-origin API key on the default Local backend", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: window.location.origin,
          apiKey: "stale-session-key",
          kind: "agent-server",
          agentServerTransport: "same-origin",
        },
      ]),
    );

    const result = readStoredBackends();

    expect(result[0]).toMatchObject({
      id: "default-local",
      apiKey: "stale-session-key",
      agentServerTransport: "same-origin",
    });
    expect(getBackendSessionApiKey(result[0])).toBe("fresh-session-key");
    expect(
      JSON.parse(window.localStorage.getItem(BACKENDS_STORAGE_KEY) ?? "[]")[0],
    ).toMatchObject({
      id: "default-local",
      apiKey: "stale-session-key",
      agentServerTransport: "same-origin",
    });
  });

  it("does not fill the default Local backend API key after its host is edited", () => {
    vi.stubEnv("VITE_SESSION_API_KEY", "fresh-session-key");
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        {
          id: "default-local",
          name: "Local",
          host: "http://127.0.0.1:9999",
          apiKey: "",
          kind: "agent-server",
        },
      ]),
    );

    expect(readStoredBackends()[0]).toMatchObject({
      id: "default-local",
      host: "http://127.0.0.1:9999",
      apiKey: "",
    });
  });

  it("round-trips active selection with orgId", () => {
    writeStoredActiveBackend({ backendId: "xyz", orgId: "org-1" });
    expect(readStoredActiveBackend()).toEqual({
      backendId: "xyz",
      orgId: "org-1",
    });
  });

  it("normalizes missing orgId to null", () => {
    writeStoredActiveBackend({ backendId: "xyz" });
    expect(readStoredActiveBackend()).toEqual({
      backendId: "xyz",
      orgId: null,
    });
  });

  it("clears storage when active selection is set to null", () => {
    writeStoredActiveBackend({ backendId: "xyz", orgId: "o" });
    writeStoredActiveBackend(null);

    expect(window.localStorage.getItem(ACTIVE_BACKEND_STORAGE_KEY)).toBeNull();
    expect(readStoredActiveBackend()).toBeNull();
  });

  it("returns null active selection when storage is malformed", () => {
    window.localStorage.setItem(ACTIVE_BACKEND_STORAGE_KEY, "{broken");
    expect(readStoredActiveBackend()).toBeNull();
  });
});
