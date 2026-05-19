#!/usr/bin/env node
/**
 * CLI entry point for @openhands/agent-canvas
 *
 * Runs the full Agent Canvas stack without Docker:
 * - Agent-server via uvx (no Docker required)
 * - Automation backend via uvx
 * - Pre-built static frontend
 *
 * Install and run:
 *   npm install -g @openhands/agent-canvas
 *   agent-canvas
 *
 * Or via npx:
 *   npx @openhands/agent-canvas
 */

import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Build output is in build/ (not build/client/) - see react-router.config.ts unpackClientDirectory
const BUILD_DIR = join(__dirname, "..", "build");

// Check for help flag first
const args = process.argv.slice(2);
if (args.includes("-h") || args.includes("--help")) {
  console.log(`
@openhands/agent-canvas - Run the Agent Canvas UI with agent-server

Runs the full stack locally: agent-server and automation backend via uvx,
pre-built static frontend. No containers required.

USAGE:
  agent-canvas [options]
  openhands [options]
  npx @openhands/agent-canvas [options]

OPTIONS:
  -p, --port <port>     Port to serve the UI on (default: 8000)
  -h, --help            Show this help message

ENVIRONMENT VARIABLES:
  OH_SECRET_KEY                Secret key for encrypting settings
  OH_AGENT_SERVER_GIT_REF      Git ref for agent-server (branch/tag/SHA)
  OH_AGENT_SERVER_VERSION      Specific PyPI version for agent-server

Note: LLM settings and workspace folders are configured through the web UI
after launching — no environment variables required.

PREREQUISITES:
  Node.js 22+ and uv (https://docs.astral.sh/uv/getting-started/installation/)

EXAMPLES:
  # Start Agent Canvas
  agent-canvas

  # Use a specific port
  agent-canvas --port 3000
`);
  process.exit(0);
}

// Check build exists before doing anything else
if (!existsSync(BUILD_DIR)) {
  console.error(`
Error: No build found at ${BUILD_DIR}

This package needs to be built first. If you installed from npm,
this is a packaging error. If running from source:

  npm install
  npm run build
`);
  process.exit(1);
}

// Import the automation stack and run without Docker (uvx-based agent-server)
let main;
try {
  ({ main } = await import("../scripts/dev-with-automation.mjs"));
} catch (err) {
  console.error("Failed to load required scripts. Try reinstalling:");
  console.error("  npm install -g @openhands/agent-canvas@latest");
  console.error(`\nError: ${err.message}`);
  process.exit(1);
}

main({
  bannerTitle: "Agent Canvas",
  staticMode: true,
  staticDir: BUILD_DIR,
  mode: "agent-canvas",
}).catch((err) => {
  console.error(`Fatal error: ${err.message}`);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
