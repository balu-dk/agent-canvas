import { describe, expect, it } from "vitest";
import {
  ACP_CUSTOM_PRESET_KEY,
  ACP_PROVIDERS,
  ACP_VERTEX_SAFE_MODEL,
  buildAcpAgentSettingsDiff,
  getAcpPreferredDefaultModel,
  getAcpProvider,
  getAcpProviderDisplayName,
  getAcpProviderSecrets,
  getAllReservedAcpFileSecretNames,
  getReservedAcpSecretNames,
} from "#/constants/acp-providers";

describe("getAcpProviderDisplayName", () => {
  it("resolves the three built-in registry keys to their human names", () => {
    expect(getAcpProviderDisplayName("claude-code")).toBe("Claude Code");
    expect(getAcpProviderDisplayName("codex")).toBe("Codex");
    expect(getAcpProviderDisplayName("gemini-cli")).toBe("Gemini CLI");
  });

  it("returns null for the Custom-command preset so callers can fall back to the generic 'ACP' label", () => {
    // The custom preset has no canonical brand name — the registry
    // resolver intentionally returns null so the conversation card renders
    // ``CONVERSATION$ACP_AGENT_GENERIC`` ("ACP") instead.
    expect(getAcpProviderDisplayName("custom")).toBeNull();
  });

  it("returns null for unknown / forward-compatible keys", () => {
    // A future ACP server Canvas's registry doesn't know about yet
    // shouldn't crash or render a random fragment of the key — fall back
    // to the generic chip.
    expect(getAcpProviderDisplayName("future-acp-server")).toBeNull();
  });

  it("returns null for empty / null / undefined input", () => {
    expect(getAcpProviderDisplayName(null)).toBeNull();
    expect(getAcpProviderDisplayName(undefined)).toBeNull();
    expect(getAcpProviderDisplayName("")).toBeNull();
  });
});

describe("ACP provider registry", () => {
  it("keeps every built-in default model in the UX suggestions", () => {
    for (const provider of ACP_PROVIDERS) {
      expect(provider.default_model, provider.key).toBeTruthy();
      expect(provider.available_models, provider.key).toBeTruthy();
      expect(
        provider.available_models?.some(
          (model) => model.id === provider.default_model,
        ),
        provider.key,
      ).toBe(true);
    }
  });

  it("does not suggest generic default model placeholders", () => {
    for (const provider of ACP_PROVIDERS) {
      for (const model of provider.available_models ?? []) {
        expect(model.id.toLowerCase()).not.toBe("default");
        expect(model.label.toLowerCase()).not.toContain("default");
      }
    }
  });

  it("seeds built-in ACP diffs with the provider default model", () => {
    for (const provider of ACP_PROVIDERS) {
      expect(buildAcpAgentSettingsDiff(provider.key)).toMatchObject({
        agent_kind: "acp",
        acp_server: provider.key,
        acp_model: provider.default_model,
      });
    }
  });

  it("keeps custom ACP diffs model-optional", () => {
    expect(buildAcpAgentSettingsDiff(ACP_CUSTOM_PRESET_KEY)).toMatchObject({
      agent_kind: "acp",
      acp_server: ACP_CUSTOM_PRESET_KEY,
      acp_model: null,
    });
  });
});

describe("getAcpProviderSecrets — reserved containerized credentials", () => {
  // Field name -> what we collect it for. These are the credentials a fresh
  // container (no host login) needs; they reach the agent-server inline as
  // StaticSecrets. The set is sourced from the validated container contract
  // (agent-canvas#1013/#1014) — if a refactor drops one, ACP auth in a
  // container silently breaks, so assert each provider's exact field set.
  it("collects the api key, reserved subscription/Vertex creds, then base URL — in that order — for Codex", () => {
    const names = getAcpProviderSecrets("codex").map((f) => f.name);
    expect(names).toEqual(["OPENAI_API_KEY", "CODEX_AUTH_JSON", "OPENAI_BASE_URL"]);
  });

  it("collects the OAuth token + api key for Claude Code", () => {
    const names = getAcpProviderSecrets("claude-code").map((f) => f.name);
    expect(names).toEqual([
      "ANTHROPIC_API_KEY",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
    ]);
  });

  it("collects the Vertex SA JSON + project/location/flag for Gemini CLI", () => {
    const names = getAcpProviderSecrets("gemini-cli").map((f) => f.name);
    expect(names).toEqual([
      "GEMINI_API_KEY",
      "GOOGLE_APPLICATION_CREDENTIALS_JSON",
      "GOOGLE_CLOUD_PROJECT",
      "GOOGLE_CLOUD_LOCATION",
      "GOOGLE_GENAI_USE_VERTEXAI",
      "GEMINI_BASE_URL",
    ]);
  });

  it("renders file-content blobs as multiline secret fields", () => {
    const codexBlob = getAcpProviderSecrets("codex").find(
      (f) => f.name === "CODEX_AUTH_JSON",
    );
    expect(codexBlob).toMatchObject({ multiline: true, secret: true, reserved: true });

    const geminiBlob = getAcpProviderSecrets("gemini-cli").find(
      (f) => f.name === "GOOGLE_APPLICATION_CREDENTIALS_JSON",
    );
    expect(geminiBlob).toMatchObject({ multiline: true, secret: true, reserved: true });
  });

  it("never marks the base URL reserved (so it's not auto-sent as an inline secret)", () => {
    // ANTHROPIC_BASE_URL alongside a Claude OAuth token breaks bearer auth —
    // canvas must never auto-promote a base URL to a StaticSecret.
    for (const key of ["codex", "claude-code", "gemini-cli"]) {
      const baseUrl = getAcpProviderSecrets(key).find((f) =>
        f.name.endsWith("_BASE_URL"),
      );
      expect(baseUrl?.reserved, key).toBeFalsy();
    }
  });

  it("returns [] for OpenHands / custom / unknown / empty", () => {
    expect(getAcpProviderSecrets("openhands")).toEqual([]);
    expect(getAcpProviderSecrets(ACP_CUSTOM_PRESET_KEY)).toEqual([]);
    expect(getAcpProviderSecrets("future-acp-server")).toEqual([]);
    expect(getAcpProviderSecrets(null)).toEqual([]);
  });
});

describe("getReservedAcpSecretNames", () => {
  it("returns every reserved field name (api key + subscription/Vertex creds, not base URL)", () => {
    expect(getReservedAcpSecretNames("codex")).toEqual([
      "OPENAI_API_KEY",
      "CODEX_AUTH_JSON",
    ]);
    expect(getReservedAcpSecretNames("claude-code")).toEqual([
      "ANTHROPIC_API_KEY",
      "CLAUDE_CODE_OAUTH_TOKEN",
    ]);
    expect(getReservedAcpSecretNames("gemini-cli")).toEqual([
      "GEMINI_API_KEY",
      "GOOGLE_APPLICATION_CREDENTIALS_JSON",
      "GOOGLE_CLOUD_PROJECT",
      "GOOGLE_CLOUD_LOCATION",
      "GOOGLE_GENAI_USE_VERTEXAI",
    ]);
  });

  it("returns [] for non-ACP / unknown keys", () => {
    expect(getReservedAcpSecretNames("openhands")).toEqual([]);
    expect(getReservedAcpSecretNames(null)).toEqual([]);
  });
});

describe("getAllReservedAcpFileSecretNames", () => {
  it("collects the multiline file-content blobs across all providers", () => {
    // These are the only reserved creds the SDK materialises to disk; they must
    // never travel as LookupSecrets (eager materialisation would time out).
    expect(new Set(getAllReservedAcpFileSecretNames())).toEqual(
      new Set(["CODEX_AUTH_JSON", "GOOGLE_APPLICATION_CREDENTIALS_JSON"]),
    );
  });

  it("excludes the non-file reserved creds (tokens, project, API keys)", () => {
    const fileNames = getAllReservedAcpFileSecretNames();
    expect(fileNames).not.toContain("CLAUDE_CODE_OAUTH_TOKEN");
    expect(fileNames).not.toContain("GOOGLE_CLOUD_PROJECT");
    expect(fileNames).not.toContain("ANTHROPIC_API_KEY");
  });
});

describe("getAcpPreferredDefaultModel", () => {
  it("overrides Gemini with the Vertex-safe model rather than the registry default", () => {
    // gemini-cli's preview default 404s on many Vertex projects; canvas
    // preselects a broadly-available model instead.
    expect(getAcpPreferredDefaultModel("gemini-cli")).toBe(ACP_VERTEX_SAFE_MODEL);
    expect(getAcpPreferredDefaultModel("gemini-cli")).not.toBe(
      getAcpProvider("gemini-cli")?.default_model,
    );
  });

  it("keeps the registry default for the other providers", () => {
    expect(getAcpPreferredDefaultModel("codex")).toBe(
      getAcpProvider("codex")?.default_model,
    );
    expect(getAcpPreferredDefaultModel("claude-code")).toBe(
      getAcpProvider("claude-code")?.default_model,
    );
  });

  it("returns null for OpenHands / custom / unknown", () => {
    expect(getAcpPreferredDefaultModel("openhands")).toBeNull();
    expect(getAcpPreferredDefaultModel(ACP_CUSTOM_PRESET_KEY)).toBeNull();
    expect(getAcpPreferredDefaultModel("future-acp-server")).toBeNull();
  });
});
