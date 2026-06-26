import { afterEach, describe, expect, it, vi } from "vitest";
import {
  contributionRegistry,
  selectActivityBarItems,
  selectCommands,
  selectViews,
  useContributionRegistry,
} from "#/extensions/contribution-registry";
import type { ExtensionContributions } from "#/extensions/types";

function makeContributions(
  extensionId: string,
  overrides: Partial<ExtensionContributions> = {},
): ExtensionContributions {
  return {
    activityBarItems: [
      {
        extensionId,
        id: `${extensionId}.container`,
        title: `${extensionId} panel`,
        onSelect: vi.fn(),
      },
    ],
    commands: [
      {
        extensionId,
        command: `${extensionId}.run`,
        title: `${extensionId}: Run`,
        run: vi.fn(),
      },
    ],
    views: [
      {
        extensionId,
        id: `${extensionId}.view`,
        containerId: `${extensionId}.container`,
        name: "View",
        type: "webview",
      },
    ],
    ...overrides,
  };
}

describe("ContributionRegistry", () => {
  afterEach(() => {
    contributionRegistry.clear();
  });

  it("starts empty", () => {
    expect(contributionRegistry.getActivityBarItems()).toEqual([]);
    expect(contributionRegistry.getCommands()).toEqual([]);
    expect(contributionRegistry.getViews()).toEqual([]);
  });

  it("registers an extension's contributions across all surfaces", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));

    expect(contributionRegistry.getActivityBarItems()).toHaveLength(1);
    expect(contributionRegistry.getActivityBarItems()[0].title).toBe(
      "acme.a panel",
    );
    expect(contributionRegistry.getCommands()[0].command).toBe("acme.a.run");
    expect(contributionRegistry.getViews()[0].id).toBe("acme.a.view");
  });

  it("aggregates contributions from multiple extensions in insertion order", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    contributionRegistry.register("acme.b", makeContributions("acme.b"));

    const items = contributionRegistry.getActivityBarItems();
    expect(items.map((i) => i.extensionId)).toEqual(["acme.a", "acme.b"]);
  });

  it("unregister removes every surface owned by an extension", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    contributionRegistry.register("acme.b", makeContributions("acme.b"));

    contributionRegistry.unregister("acme.a");

    expect(
      contributionRegistry.getActivityBarItems().map((i) => i.extensionId),
    ).toEqual(["acme.b"]);
    expect(
      contributionRegistry.getCommands().map((c) => c.extensionId),
    ).toEqual(["acme.b"]);
    expect(contributionRegistry.getViews().map((v) => v.extensionId)).toEqual([
      "acme.b",
    ]);
  });

  it("unregister is a no-op for an unknown extension", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    contributionRegistry.unregister("does.not.exist");
    expect(contributionRegistry.getActivityBarItems()).toHaveLength(1);
  });

  it("re-registering an extension replaces its previous contributions", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    contributionRegistry.register("acme.a", {
      activityBarItems: [
        {
          extensionId: "acme.a",
          id: "acme.a.container",
          title: "Replaced",
          onSelect: vi.fn(),
        },
      ],
    });

    const items = contributionRegistry.getActivityBarItems();
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Replaced");
    // Commands from the first registration are gone after replacement.
    expect(contributionRegistry.getCommands()).toHaveLength(0);
  });

  it("getView resolves a single view by id", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    expect(contributionRegistry.getView("acme.a.view")?.name).toBe("View");
    expect(contributionRegistry.getView("missing")).toBeUndefined();
  });

  it("selectors derive flat lists from store state", () => {
    contributionRegistry.register("acme.a", makeContributions("acme.a"));
    const state = useContributionRegistry.getState();
    expect(selectActivityBarItems(state)).toHaveLength(1);
    expect(selectCommands(state)).toHaveLength(1);
    expect(selectViews(state)).toHaveLength(1);
  });
});
