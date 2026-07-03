import { beforeEach, describe, expect, it } from "vitest";
import {
  useAcpModelMemoryStore,
  getCustomAcpModels,
  getLastAcpModel,
} from "./acp-model-memory-store";

const B = "backend-1";
const CLAUDE = "claude-code";
const CODEX = "codex";

describe("acp-model-memory-store", () => {
  beforeEach(() => {
    useAcpModelMemoryStore.setState({ customModels: {}, lastModel: {} });
    window.localStorage.clear();
  });

  it("adds custom models scoped per backend+engine and dedupes", () => {
    const { addCustomModel } = useAcpModelMemoryStore.getState();
    addCustomModel(B, CLAUDE, "claude-fable-5");
    addCustomModel(B, CLAUDE, "claude-fable-5"); // duplicate ignored
    addCustomModel(B, CODEX, "gpt-5.5-codex");

    expect(getCustomAcpModels(B, CLAUDE)).toEqual(["claude-fable-5"]);
    // A Codex id must not leak into the Claude picker.
    expect(getCustomAcpModels(B, CLAUDE)).not.toContain("gpt-5.5-codex");
    expect(getCustomAcpModels(B, CODEX)).toEqual(["gpt-5.5-codex"]);
    // Unknown scope is empty, never undefined.
    expect(getCustomAcpModels("other", CLAUDE)).toEqual([]);
  });

  it("removes a custom model", () => {
    const { addCustomModel, removeCustomModel } =
      useAcpModelMemoryStore.getState();
    addCustomModel(B, CLAUDE, "claude-fable-5");
    addCustomModel(B, CLAUDE, "claude-opus-4-9");
    removeCustomModel(B, CLAUDE, "claude-fable-5");

    expect(getCustomAcpModels(B, CLAUDE)).toEqual(["claude-opus-4-9"]);
  });

  it("records the last-used model per backend+engine", () => {
    const { recordLastModel } = useAcpModelMemoryStore.getState();
    expect(getLastAcpModel(B, CLAUDE)).toBeNull();

    recordLastModel(B, CLAUDE, "claude-fable-5");
    recordLastModel(B, CODEX, "gpt-5.5-codex");
    recordLastModel(B, CLAUDE, "claude-opus-4-9"); // latest wins

    expect(getLastAcpModel(B, CLAUDE)).toBe("claude-opus-4-9");
    expect(getLastAcpModel(B, CODEX)).toBe("gpt-5.5-codex");
    expect(getLastAcpModel("other", CLAUDE)).toBeNull();
  });

  it("persists to localStorage under a stable key", () => {
    useAcpModelMemoryStore
      .getState()
      .addCustomModel(B, CLAUDE, "claude-fable-5");
    const raw = window.localStorage.getItem("openhands-acp-model-memory");
    expect(raw).toBeTruthy();
    expect(raw).toContain("claude-fable-5");
  });
});
