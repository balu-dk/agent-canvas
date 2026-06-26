import { describe, expect, it } from "vitest";
import { parseManifest } from "#/extensions/manifest";

const validManifest = {
  id: "acme.compliance",
  name: "Compliance",
  version: "1.2.0",
  publisher: "acme",
  engines: { agentCanvas: "^1.0.0" },
  main: "main.js",
  activationEvents: ["onView:compliance.panel", "onCommand:compliance.scan"],
  capabilities: ["conversation:read"],
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
    commands: [
      { command: "compliance.scan", title: "Compliance: Scan Conversation" },
    ],
  },
};

describe("parseManifest", () => {
  it("accepts a fully-specified valid manifest", () => {
    const result = parseManifest(validManifest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.id).toBe("acme.compliance");
      expect(result.manifest.contributes?.commands).toHaveLength(1);
      expect(
        result.manifest.contributes?.viewsContainers?.activitybar?.[0].title,
      ).toBe("Compliance");
    }
  });

  it("accepts a minimal manifest (declarative, no main/contributes)", () => {
    const result = parseManifest({
      id: "acme.minimal",
      name: "Minimal",
      version: "0.0.1",
      engines: { agentCanvas: "^1.0.0" },
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a non-object payload", () => {
    const result = parseManifest("nope");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/expected a JSON object/);
  });

  it("requires id, name, version and engines.agentCanvas", () => {
    const result = parseManifest({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const joined = result.errors.join("\n");
      expect(joined).toMatch(/id:/);
      expect(joined).toMatch(/name:/);
      expect(joined).toMatch(/version:/);
      expect(joined).toMatch(/engines/);
    }
  });

  it("rejects an id that is not in publisher.name format", () => {
    const result = parseManifest({ ...validManifest, id: "nodot" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join()).toMatch(/publisher\.name/);
  });

  it("rejects unknown capabilities", () => {
    const result = parseManifest({
      ...validManifest,
      capabilities: ["conversation:read", "filesystem:write"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join()).toMatch(/unknown capability/);
  });

  it("rejects unknown activation events", () => {
    const result = parseManifest({
      ...validManifest,
      activationEvents: ["onSomethingWeird"],
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.join()).toMatch(/unknown activation event/);
  });

  it("rejects non-webview view types with a precise path", () => {
    const result = parseManifest({
      ...validManifest,
      contributes: {
        views: {
          "compliance.container": [{ id: "v", name: "V", type: "tree" }],
        },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.join()).toMatch(
        /contributes\.views\.compliance\.container\[0\]\.type/,
      );
  });

  it("collects multiple errors at once", () => {
    const result = parseManifest({ id: "bad", engines: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(1);
  });
});
