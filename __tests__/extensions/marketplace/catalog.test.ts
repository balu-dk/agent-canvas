import { describe, expect, it } from "vitest";
import {
  isUiExtensionEntry,
  parseCatalog,
  resolveEntryBundleUrl,
  uiExtensionManifestPath,
  type MarketplaceEntry,
} from "#/extensions/marketplace/catalog";
import type { MarketplaceSource } from "#/extensions/marketplace/source";

const github: MarketplaceSource = {
  kind: "github",
  owner: "acme",
  repo: "repo",
  ref: "main",
};

describe("parseCatalog", () => {
  it("accepts a valid catalog and preserves unknown fields", () => {
    const result = parseCatalog({
      name: "Examples",
      owner: { name: "Acme" },
      plugins: [{ name: "hello", source: "./hello", category: "ui-extension" }],
      extraTopLevel: true,
    });
    expect(result.ok).toBe(true);
  });

  it("reports missing required fields", () => {
    const result = parseCatalog({ plugins: "nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining("name"),
          expect.stringContaining("owner.name"),
          expect.stringContaining("plugins"),
        ]),
      );
    }
  });

  it("validates plugin entry sources", () => {
    const result = parseCatalog({
      name: "x",
      owner: { name: "y" },
      plugins: [{ name: "bad", source: { source: "svn" } }],
    });
    expect(result.ok).toBe(false);
  });
});

describe("isUiExtensionEntry / manifest path", () => {
  it("recognises the category marker", () => {
    expect(
      isUiExtensionEntry({
        name: "a",
        source: "./a",
        category: "ui-extension",
      }),
    ).toBe(true);
  });

  it("recognises the uiExtension marker", () => {
    expect(
      isUiExtensionEntry({ name: "a", source: "./a", uiExtension: {} }),
    ).toBe(true);
  });

  it("ignores regular plugins", () => {
    expect(isUiExtensionEntry({ name: "a", source: "./a" })).toBe(false);
  });

  it("defaults the manifest filename and honours overrides", () => {
    expect(uiExtensionManifestPath({ name: "a", source: "./a" })).toBe(
      "extension.json",
    );
    expect(
      uiExtensionManifestPath({
        name: "a",
        source: "./a",
        uiExtension: { manifest: "ui/manifest.json" },
      }),
    ).toBe("ui/manifest.json");
  });
});

describe("resolveEntryBundleUrl", () => {
  const catalogUrl =
    "https://raw.githubusercontent.com/acme/repo/main/.plugin/marketplace.json";

  it("resolves a relative string source against the github repo", () => {
    const entry: MarketplaceEntry = { name: "hello", source: "./hello" };
    expect(resolveEntryBundleUrl(github, catalogUrl, entry)).toBe(
      "https://raw.githubusercontent.com/acme/repo/main/hello",
    );
  });

  it("resolves a github object source", () => {
    const entry: MarketplaceEntry = {
      name: "hello",
      source: { source: "github", repo: "other/pkg", ref: "v1", path: "ui" },
    };
    expect(resolveEntryBundleUrl(github, catalogUrl, entry)).toBe(
      "https://raw.githubusercontent.com/other/pkg/v1/ui",
    );
  });

  it("maps a github url object source to raw", () => {
    const entry: MarketplaceEntry = {
      name: "hello",
      source: { source: "url", url: "https://github.com/o/r/tree/main/p" },
    };
    expect(resolveEntryBundleUrl(github, catalogUrl, entry)).toBe(
      "https://raw.githubusercontent.com/o/r/main/p",
    );
  });

  it("returns null for a non-fetchable url source", () => {
    const entry: MarketplaceEntry = {
      name: "hello",
      source: { source: "url", url: "git@github.com:o/r.git" },
    };
    expect(resolveEntryBundleUrl(github, catalogUrl, entry)).toBeNull();
  });

  it("resolves relative sources against the catalog dir for url catalogs", () => {
    const urlSource: MarketplaceSource = {
      kind: "url",
      url: "https://cdn.example/repo/marketplace.json",
    };
    const entry: MarketplaceEntry = { name: "hello", source: "./hello" };
    expect(
      resolveEntryBundleUrl(
        urlSource,
        "https://cdn.example/repo/marketplace.json",
        entry,
      ),
    ).toBe("https://cdn.example/repo/hello");
  });
});
