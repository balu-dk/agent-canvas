import { describe, expect, it, vi } from "vitest";
import { fetchMarketplace } from "#/extensions/marketplace/client";

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as Response;
}

const CATALOG = {
  name: "Examples",
  owner: { name: "Acme" },
  plugins: [
    {
      name: "hello-sidebar",
      source: "./hello-sidebar",
      description: "Hello panel",
      version: "1.0.0",
      author: { name: "Acme" },
      category: "ui-extension",
      uiExtension: { manifest: "extension.json" },
    },
    // A regular agent plugin is ignored by the UI-extension listing.
    { name: "linter", source: "./linter", commands: "./commands" },
  ],
};

describe("fetchMarketplace", () => {
  it("falls back from .plugin to .claude-plugin and lists UI extensions", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(null, false, 404))
      .mockResolvedValueOnce(jsonResponse(CATALOG));

    const result = await fetchMarketplace("github://acme/repo", fetchImpl);

    expect(fetchImpl.mock.calls[0][0]).toContain(".plugin/marketplace.json");
    expect(fetchImpl.mock.calls[1][0]).toContain(
      ".claude-plugin/marketplace.json",
    );
    expect(result.catalogName).toBe("Examples");
    expect(result.listings).toEqual([
      {
        name: "hello-sidebar",
        description: "Hello panel",
        version: "1.0.0",
        author: "Acme",
        homepage: undefined,
        bundleUrl:
          "https://raw.githubusercontent.com/acme/repo/main/hello-sidebar",
        manifestPath: "extension.json",
      },
    ]);
  });

  it("throws when no catalog is found", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(null, false, 404));
    await expect(
      fetchMarketplace("github://acme/repo", fetchImpl),
    ).rejects.toThrow(/no marketplace catalog found/);
  });

  it("throws on an invalid catalog", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ name: "x", plugins: [] }));
    await expect(
      fetchMarketplace("https://cdn.example/c.json", fetchImpl),
    ).rejects.toThrow(/invalid marketplace catalog/);
  });
});
