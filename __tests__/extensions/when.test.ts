import { describe, expect, it } from "vitest";
import { evaluateWhen, type WhenContext } from "#/extensions/when";

const context: WhenContext = {
  backend: "cloud",
  agentState: "running",
  emailVerified: true,
  repoConnected: false,
  "flag.hide_llm_settings": false,
};

describe("evaluateWhen", () => {
  it("treats an undefined or empty clause as always visible", () => {
    expect(evaluateWhen(undefined, context)).toBe(true);
    expect(evaluateWhen("", context)).toBe(true);
    expect(evaluateWhen("   ", context)).toBe(true);
  });

  it("evaluates string equality and inequality", () => {
    expect(evaluateWhen("backend == cloud", context)).toBe(true);
    expect(evaluateWhen("backend == local", context)).toBe(false);
    expect(evaluateWhen("backend != local", context)).toBe(true);
    expect(evaluateWhen("backend != cloud", context)).toBe(false);
  });

  it("coerces the true/false literals to booleans for comparison", () => {
    expect(evaluateWhen("emailVerified == true", context)).toBe(true);
    expect(evaluateWhen("emailVerified == false", context)).toBe(false);
    expect(evaluateWhen("repoConnected != true", context)).toBe(true);
  });

  it("supports bare boolean key checks and negation", () => {
    expect(evaluateWhen("emailVerified", context)).toBe(true);
    expect(evaluateWhen("repoConnected", context)).toBe(false);
    expect(evaluateWhen("!repoConnected", context)).toBe(true);
    expect(evaluateWhen("!emailVerified", context)).toBe(false);
  });

  it("treats a non-empty string fact as truthy and an empty one as falsy", () => {
    expect(evaluateWhen("agentState", context)).toBe(true);
    expect(evaluateWhen("agentState", { agentState: "" })).toBe(false);
  });

  it("treats unknown keys as falsy (no throw)", () => {
    expect(evaluateWhen("unknownKey", context)).toBe(false);
    expect(evaluateWhen("!unknownKey", context)).toBe(true);
    expect(evaluateWhen("unknownKey == x", context)).toBe(false);
  });

  it("conjoins terms with && (all must hold)", () => {
    expect(evaluateWhen("backend == cloud && emailVerified", context)).toBe(
      true,
    );
    expect(evaluateWhen("backend == cloud && repoConnected", context)).toBe(
      false,
    );
    expect(
      evaluateWhen("backend == cloud && !repoConnected && agentState", context),
    ).toBe(true);
  });

  it("tolerates surrounding whitespace around terms and operators", () => {
    expect(evaluateWhen("  backend==cloud  ", context)).toBe(true);
    expect(evaluateWhen("backend == cloud&&!repoConnected", context)).toBe(true);
  });
});
