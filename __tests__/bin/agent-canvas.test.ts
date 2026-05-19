// @vitest-environment node
import { spawn } from "node:child_process";
import { once } from "node:events";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("agent-canvas CLI", () => {
  it("shows help output without requiring Docker or PROJECTS_PATH", async () => {
    const child = spawn(process.execPath, ["bin/agent-canvas.mjs", "--help"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const [code] = await once(child, "exit");

    expect(code).toBe(0);
    expect(stderr).toBe("");
    // The npm-install path runs without Docker — help should not mention
    // Docker-specific env vars like PROJECTS_PATH
    expect(stdout).not.toContain("PROJECTS_PATH");
    // Should describe the simple usage
    expect(stdout).toContain("agent-canvas");
    expect(stdout).toContain("--port");
    // Should mention uv as a prerequisite (not Docker)
    expect(stdout).toContain("uv");
    expect(stdout).not.toContain("Docker");
  });
});
