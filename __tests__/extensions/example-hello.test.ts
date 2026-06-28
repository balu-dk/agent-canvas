import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseManifest } from "#/extensions/manifest";
import { loadExtension, type BundleSource } from "#/extensions/loader";
import { contributionRegistry } from "#/extensions/contribution-registry";

/**
 * Guards the shipped sample extension (`examples/extensions/hello-sidebar`) against
 * schema/loader drift: the documented authoring format must keep validating and
 * loading.
 */
const manifestPath = resolve(
  process.cwd(),
  "examples/extensions/hello-sidebar/extension.json",
);
const rawManifest = JSON.parse(readFileSync(manifestPath, "utf8"));

describe("examples/extensions/hello-sidebar", () => {
  afterEach(() => contributionRegistry.clear());

  it("validates against the manifest schema", () => {
    const result = parseManifest(rawManifest);
    expect(result.ok).toBe(true);
  });

  it("loads its declarative contributions through the loader", async () => {
    const source: BundleSource = {
      readManifest: async () => rawManifest,
      assetUrl: async (path) => `blob:${path}`,
    };
    const host = {
      activate: vi.fn(),
      runCommand: vi.fn(),
      openView: vi.fn(),
    };

    const result = await loadExtension(source, host);
    expect(result.ok).toBe(true);

    const items = contributionRegistry.getActivityBarItems();
    expect(items.map((i) => i.title)).toEqual(["Hello"]);
    expect(items[0].iconUrl).toBe("blob:icon.svg");

    const commands = contributionRegistry.getCommands();
    expect(commands.map((c) => c.command)).toEqual(["hello.say"]);

    const views = contributionRegistry.getViews();
    expect(views.map((v) => v.id)).toEqual(["hello.panel"]);
    // The view's `page` is resolved to an asset URL for the webview panel.
    expect(views[0].pageUrl).toBe("blob:panel.html");
    expect(views[0].capabilities).toEqual(["conversation:read", "storage"]);

    // The menu item binds to the contributed command and inherits its title.
    const menuItems = contributionRegistry.getMenuItemsForSlot(
      "conversationTabs/context",
    );
    expect(menuItems.map((m) => m.command)).toEqual(["hello.say"]);
    expect(menuItems[0].title).toBe("Hello: Say hi");

    // The second menu item targets the chat-input actions slot and carries a `when`
    // clause (host-fact gated; carried through the loader untouched).
    const chatItems =
      contributionRegistry.getMenuItemsForSlot("chatInput/actions");
    expect(chatItems.map((m) => m.command)).toEqual(["hello.say"]);
    expect(chatItems[0].when).toBe("emailVerified");

    // The settings page is resolved with its webview URL and inherits the
    // extension's capabilities (so its webview can persist via `storage`).
    const settingsPages = contributionRegistry.getSettingsPages();
    expect(settingsPages.map((p) => p.id)).toEqual(["general"]);
    expect(settingsPages[0].pageUrl).toBe("blob:settings.html");
    expect(settingsPages[0].capabilities).toEqual([
      "conversation:read",
      "storage",
    ]);
  });
});
