import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BACKENDS_STORAGE_KEY,
  readStoredBackends,
  writeStoredBackends,
} from "./storage";
import type { Backend } from "./types";

const K8S_BACKEND: Backend = {
  id: "k8s-1",
  name: "Kubernetes Agent Sandbox",
  host: "http://localhost:8000",
  apiKey: "broker-session-key",
  kind: "k8s",
};

const LOCAL_BACKEND: Backend = {
  id: "local-1",
  name: "Local",
  host: "http://localhost:8000",
  apiKey: "local-key",
  kind: "local",
};

describe("backend storage isValidKind", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("accepts a stored k8s backend through validation", () => {
    // readStoredBackends filters with isValidBackend → isValidKind. A k8s
    // backend that survives the round trip proves isValidKind accepts "k8s".
    writeStoredBackends([LOCAL_BACKEND, K8S_BACKEND]);

    const result = readStoredBackends();

    expect(result).toEqual([LOCAL_BACKEND, K8S_BACKEND]);
    expect(result.some((b) => b.kind === "k8s")).toBe(true);
  });

  it("rejects an unknown backend kind", () => {
    // Write directly so the invalid entry isn't normalized away by
    // writeStoredBackends' typed signature.
    window.localStorage.setItem(
      BACKENDS_STORAGE_KEY,
      JSON.stringify([
        LOCAL_BACKEND,
        { ...K8S_BACKEND, id: "bogus", kind: "kubernetes" },
      ]),
    );

    const result = readStoredBackends();

    expect(result).toEqual([LOCAL_BACKEND]);
    expect(result.some((b) => b.id === "bogus")).toBe(false);
  });
});
