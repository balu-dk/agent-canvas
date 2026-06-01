import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Backend, ResolvedActiveBackend } from "../backend-registry/types";

const getActiveBackend = vi.fn();
vi.mock("../backend-registry/active-store", () => ({
  getActiveBackend: () => getActiveBackend() as ResolvedActiveBackend,
}));

const axiosRequest = vi.fn();
const axiosGet = vi.fn();
vi.mock("axios", () => ({
  default: {
    request: (...args: unknown[]) => axiosRequest(...args),
    get: (...args: unknown[]) => axiosGet(...args),
  },
}));

import { callBroker, getActiveK8sBackend, pingBroker } from "./broker-client";

const K8S_BACKEND: Backend = {
  id: "k8s-1",
  name: "Kubernetes Agent Sandbox",
  host: "http://localhost:8000/",
  apiKey: "broker-key",
  kind: "k8s",
};

function activeK8s(): ResolvedActiveBackend {
  return { backend: K8S_BACKEND, orgId: null };
}

describe("getActiveK8sBackend", () => {
  beforeEach(() => {
    getActiveBackend.mockReset();
  });

  it("returns the active backend when it is k8s", () => {
    getActiveBackend.mockReturnValue(activeK8s());
    expect(getActiveK8sBackend()).toBe(K8S_BACKEND);
  });

  it("throws when the active backend is not k8s", () => {
    getActiveBackend.mockReturnValue({
      backend: { ...K8S_BACKEND, kind: "local" },
      orgId: null,
    });
    expect(() => getActiveK8sBackend()).toThrow(/k8s backend/);
  });
});

describe("callBroker", () => {
  beforeEach(() => {
    getActiveBackend.mockReset();
    axiosRequest.mockReset();
    getActiveBackend.mockReturnValue(activeK8s());
  });

  it("prepends /api/k8s, strips trailing host slash, and sends the session key header", async () => {
    axiosRequest.mockResolvedValue({ data: { ok: true } });

    const data = await callBroker<{ ok: boolean }>({
      method: "GET",
      path: "/app-conversations/search?limit=20",
    });

    expect(data).toEqual({ ok: true });
    const config = axiosRequest.mock.calls[0][0];
    expect(config.method).toBe("GET");
    expect(config.url).toBe(
      "http://localhost:8000/api/k8s/app-conversations/search?limit=20",
    );
    expect(config.headers["X-Session-API-Key"]).toBe("broker-key");
  });

  it("forwards the body for write methods", async () => {
    axiosRequest.mockResolvedValue({ data: null });
    const body = { title: "hi" };

    await callBroker({ method: "POST", path: "/app-conversations", body });

    const config = axiosRequest.mock.calls[0][0];
    expect(config.method).toBe("POST");
    expect(config.data).toBe(body);
  });
});

describe("pingBroker", () => {
  beforeEach(() => {
    axiosGet.mockReset();
  });

  it("GETs /api/k8s/health and returns true on 2xx", async () => {
    axiosGet.mockResolvedValue({ status: 200 });

    const ok = await pingBroker(K8S_BACKEND);

    expect(ok).toBe(true);
    expect(axiosGet.mock.calls[0][0]).toBe(
      "http://localhost:8000/api/k8s/health",
    );
  });

  it("returns false when the health probe rejects", async () => {
    axiosGet.mockRejectedValue(new Error("connection refused"));
    expect(await pingBroker(K8S_BACKEND)).toBe(false);
  });
});
