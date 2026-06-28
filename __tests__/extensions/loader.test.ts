import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadExtension,
  unloadExtension,
  type BundleSource,
  type ExtensionHostBridge,
} from "#/extensions/loader";
import { contributionRegistry } from "#/extensions/contribution-registry";

const manifest = {
  id: "acme.compliance",
  name: "Compliance",
  version: "1.0.0",
  engines: { agentCanvas: "^1.0.0" },
  main: "main.js",
  contributes: {
    viewsContainers: {
      activitybar: [
        { id: "compliance.container", title: "Compliance", icon: "icon.svg" },
      ],
    },
    views: {
      "compliance.container": [
        { id: "compliance.panel", name: "Policy Checks", type: "webview" },
      ],
    },
    commands: [{ command: "compliance.scan", title: "Scan" }],
    menus: {
      "conversationTabs/context": [
        { command: "compliance.scan", group: "extensions" },
      ],
    },
  },
};

function makeSource(overrides: Partial<BundleSource> = {}): BundleSource {
  return {
    readManifest: async () => manifest,
    assetUrl: async (path: string) => `blob:${path}`,
    ...overrides,
  };
}

function makeHost() {
  const host = {
    activate: vi.fn(),
    openView: vi.fn(),
    runCommand: vi.fn(),
  };
  return host satisfies ExtensionHostBridge;
}

describe("loadExtension", () => {
  afterEach(() => {
    contributionRegistry.clear();
  });

  it("registers contributions from a valid bundle", async () => {
    const host = makeHost();
    const result = await loadExtension(makeSource(), host);

    expect(result.ok).toBe(true);
    expect(contributionRegistry.getActivityBarItems()).toHaveLength(1);
    expect(contributionRegistry.getCommands()).toHaveLength(1);
    expect(contributionRegistry.getViews()).toHaveLength(1);
  });

  it("resolves the activity-bar icon via the bundle source", async () => {
    await loadExtension(makeSource(), makeHost());
    expect(contributionRegistry.getActivityBarItems()[0].iconUrl).toBe(
      "blob:icon.svg",
    );
  });

  it("wires rail selection to activate + open the container's first view", async () => {
    const host = makeHost();
    await loadExtension(makeSource(), host);

    contributionRegistry.getActivityBarItems()[0].onSelect();

    expect(host.activate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acme.compliance" }),
      "onView:compliance.panel",
    );
    expect(host.openView).toHaveBeenCalledWith(
      "acme.compliance",
      "compliance.panel",
    );
  });

  it("wires command execution to activate + runCommand", async () => {
    const host = makeHost();
    await loadExtension(makeSource(), host);

    await contributionRegistry.getCommands()[0].run();

    expect(host.activate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acme.compliance" }),
      "onCommand:compliance.scan",
    );
    expect(host.runCommand).toHaveBeenCalledWith(
      "acme.compliance",
      "compliance.scan",
    );
  });

  it("resolves menu items, labelling them from the bound command's title", async () => {
    await loadExtension(makeSource(), makeHost());

    const items = contributionRegistry.getMenuItemsForSlot(
      "conversationTabs/context",
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      extensionId: "acme.compliance",
      menu: "conversationTabs/context",
      command: "compliance.scan",
      title: "Scan",
      group: "extensions",
    });
  });

  it("wires menu selection to activate + runCommand for the bound command", async () => {
    const host = makeHost();
    await loadExtension(makeSource(), host);

    await contributionRegistry
      .getMenuItemsForSlot("conversationTabs/context")[0]
      .run();

    expect(host.activate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acme.compliance" }),
      "onCommand:compliance.scan",
    );
    expect(host.runCommand).toHaveBeenCalledWith(
      "acme.compliance",
      "compliance.scan",
    );
  });

  it("carries an item's when clause through to the resolved menu item", async () => {
    await loadExtension(
      makeSource({
        readManifest: async () => ({
          ...manifest,
          contributes: {
            ...manifest.contributes,
            menus: {
              "conversationTabs/context": [
                { command: "compliance.scan", when: "backend == cloud" },
              ],
            },
          },
        }),
      }),
      makeHost(),
    );

    const items = contributionRegistry.getMenuItemsForSlot(
      "conversationTabs/context",
    );
    expect(items[0].when).toBe("backend == cloud");
  });

  it("leaves when undefined when the item declares none", async () => {
    await loadExtension(makeSource(), makeHost());
    const items = contributionRegistry.getMenuItemsForSlot(
      "conversationTabs/context",
    );
    expect(items[0].when).toBeUndefined();
  });

  it("falls back to the command id as the label when it isn't declared", async () => {
    const host = makeHost();
    await loadExtension(
      makeSource({
        readManifest: async () => ({
          ...manifest,
          contributes: {
            menus: {
              "conversationTabs/context": [{ command: "compliance.ghost" }],
            },
          },
        }),
      }),
      host,
    );

    const items = contributionRegistry.getMenuItemsForSlot(
      "conversationTabs/context",
    );
    expect(items[0].title).toBe("compliance.ghost");
  });

  it("returns validation errors and registers nothing for a bad manifest", async () => {
    const host = makeHost();
    const result = await loadExtension(
      makeSource({ readManifest: async () => ({ id: "bad" }) }),
      host,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
    expect(contributionRegistry.getActivityBarItems()).toHaveLength(0);
  });

  it("surfaces a manifest read failure as an error result", async () => {
    const result = await loadExtension(
      makeSource({
        readManifest: async () => {
          throw new Error("boom");
        },
      }),
      makeHost(),
    );
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.join()).toMatch(/failed to read manifest/);
  });

  it("unloadExtension removes the extension's contributions", async () => {
    await loadExtension(makeSource(), makeHost());
    expect(contributionRegistry.getActivityBarItems()).toHaveLength(1);

    unloadExtension("acme.compliance");
    expect(contributionRegistry.getActivityBarItems()).toHaveLength(0);
  });
});
