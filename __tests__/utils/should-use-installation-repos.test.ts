import { describe, expect, it } from "vitest";
import { shouldUseInstallationRepos } from "#/utils/utils";

describe("shouldUseInstallationRepos", () => {
  it("returns false for null/undefined provider regardless of mode", () => {
    expect(shouldUseInstallationRepos(undefined, "cloud")).toBe(false);
    expect(shouldUseInstallationRepos(null, "cloud")).toBe(false);
    expect(shouldUseInstallationRepos(undefined, "agent-server")).toBe(false);
  });

  it("uses installations for github only when active backend is cloud", () => {
    expect(shouldUseInstallationRepos("github", "cloud")).toBe(true);
    expect(shouldUseInstallationRepos("github", "agent-server")).toBe(false);
    // Default (no app mode passed) preserves the old local behavior.
    expect(shouldUseInstallationRepos("github")).toBe(false);
  });

  it("always uses installations for bitbucket variants", () => {
    expect(shouldUseInstallationRepos("bitbucket", "agent-server")).toBe(true);
    expect(shouldUseInstallationRepos("bitbucket", "cloud")).toBe(true);
    expect(
      shouldUseInstallationRepos("bitbucket_data_center", "agent-server"),
    ).toBe(true);
    expect(shouldUseInstallationRepos("bitbucket_data_center", "cloud")).toBe(
      true,
    );
  });

  it("never uses installations for gitlab / azure / forgejo", () => {
    expect(shouldUseInstallationRepos("gitlab", "cloud")).toBe(false);
    expect(shouldUseInstallationRepos("gitlab", "agent-server")).toBe(false);
    expect(shouldUseInstallationRepos("azure_devops", "cloud")).toBe(false);
    expect(shouldUseInstallationRepos("forgejo", "cloud")).toBe(false);
  });
});
