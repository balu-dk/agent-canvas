import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listGitHubBranches, clearGitHubTokenCache } from "./github-direct";

vi.mock("../backend-registry/active-store", () => ({
  getActiveBackend: () => ({ backend: { id: "b1" } }),
}));
vi.mock("../agent-server-client-options", () => ({
  getAgentServerClientOptions: () => ({}),
}));
vi.mock("@openhands/typescript-client/clients", () => ({
  SettingsClient: class {
    getSecret() {
      return Promise.resolve("tok");
    }
  },
}));

const makeBranches = (names: string[]) =>
  names.map((name) => ({
    name,
    commit: { sha: `sha-${name}` },
    protected: false,
  }));

const mockPages = (pages: ReturnType<typeof makeBranches>[]) => {
  const fetchMock = vi.fn();
  pages.forEach((page) => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => page });
  });
  // Any extra page requests resolve empty (defensive).
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
};

describe("listGitHubBranches pagination", () => {
  beforeEach(() => {
    clearGitHubTokenCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pages past the first 100 so a mid-alphabet default branch is included", async () => {
    // 100 branches alphabetically before `main`, then `main` on page 2.
    const firstPage = makeBranches(
      Array.from(
        { length: 100 },
        (_, i) => `dependabot/${String(i).padStart(3, "0")}`,
      ),
    );
    const secondPage = makeBranches(["main", "release"]);
    const fetchMock = mockPages([firstPage, secondPage]);

    const { items } = await listGitHubBranches("owner/repo");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain("page=1");
    expect(fetchMock.mock.calls[1][0]).toContain("page=2");
    expect(items.map((b) => b.name)).toContain("main");
    expect(items).toHaveLength(102);
  });

  it("stops after one request when the first page is short", async () => {
    const fetchMock = mockPages([makeBranches(["main", "dev"])]);

    const { items } = await listGitHubBranches("owner/repo");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(items.map((b) => b.name)).toEqual(["main", "dev"]);
  });

  it("query-filters across all fetched pages", async () => {
    const firstPage = makeBranches(
      Array.from({ length: 100 }, (_, i) => `feat/${i}`),
    );
    const secondPage = makeBranches(["main", "maintenance"]);
    mockPages([firstPage, secondPage]);

    const { items } = await listGitHubBranches("owner/repo", "main");

    expect(items.map((b) => b.name).sort()).toEqual(["main", "maintenance"]);
  });
});
