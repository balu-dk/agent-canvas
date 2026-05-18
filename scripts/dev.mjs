#!/usr/bin/env node

/**
 * Unified Agent Canvas development launcher.
 *
 * package.json scripts route through this file. Stack-specific implementation
 * lives in launch-*.mjs modules so this remains the only dev-named script.
 */

import { spawn } from "node:child_process";
import process from "node:process";
import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";

function parseCliArgs(argv = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      sandbox: { type: "string", default: "docker" },
      port: { type: "string", short: "p" },
      "automation-ref": { type: "string" },
      "automation-repo": { type: "string" },
      "static-dir": { type: "string" },
      "frontend-only": { type: "boolean", default: false },
      "backend-only": { type: "boolean", default: false },
      "no-automation": { type: "boolean", default: false },
      "frontend-require-session-key": { type: "boolean", default: false },
      static: { type: "boolean", default: false },
      "skip-build": { type: "boolean", default: false },
      dynamic: { type: "boolean", default: false },
      verbose: { type: "boolean", short: "v", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
  });

  if (positionals.length > 0) {
    throw new Error(
      `Unexpected positional arguments: ${positionals.join(" ")}. Use flags such as --frontend-only, --backend-only, --no-automation, or --sandbox none.`,
    );
  }

  if (values["frontend-only"] && values["backend-only"]) {
    throw new Error(
      "--frontend-only and --backend-only cannot be used together",
    );
  }

  if (values.sandbox !== "docker" && values.sandbox !== "none") {
    throw new Error("--sandbox must be either 'docker' or 'none'");
  }

  return {
    ...values,
    forwarded: buildForwardedArgs(values),
  };
}

function buildForwardedArgs(values) {
  const args = [];

  for (const [name, flag] of [
    ["port", "--port"],
    ["automation-ref", "--automation-ref"],
    ["automation-repo", "--automation-repo"],
    ["static-dir", "--static-dir"],
  ]) {
    if (values[name]) {
      args.push(flag, values[name]);
    }
  }

  for (const [name, flag] of [
    ["frontend-require-session-key", "--frontend-require-session-key"],
    ["static", "--static"],
    ["skip-build", "--skip-build"],
    ["dynamic", "--dynamic"],
    ["verbose", "--verbose"],
    ["help", "--help"],
  ]) {
    if (values[name]) {
      args.push(flag);
    }
  }

  return args;
}

function showHelp() {
  console.log(`
Agent Canvas development launcher

USAGE:
  npm run dev
  npm run dev -- --frontend-only
  npm run dev -- --backend-only
  npm run dev -- --no-automation
  npm run dev -- --sandbox none
  npm run dev -- --sandbox docker

OPTIONS:
  --sandbox <docker|none>             Runtime sandbox (default: docker)
  --frontend-only                     Start only the Vite frontend
  --backend-only                      Start only the agent-server backend
  --no-automation                     Start without the automation backend
  --frontend-require-session-key      Do not inject the generated session key into the frontend
  --dynamic                           Use Vite instead of static frontend in Docker mode
  -h, --help                          Show this help
`);
}

function setForwardedArgv(args) {
  process.argv = [process.argv[0], process.argv[1], ...args];
}

function spawnInherit(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? 1}`));
      }
    });
  });
}

async function runFrontendOnly(args) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const reactRouterCommand =
    process.platform === "win32" ? "react-router.cmd" : "react-router";

  await spawnInherit(npmCommand, ["run", "make-i18n"]);
  await spawnInherit(reactRouterCommand, ["dev", ...args], {
    env: {
      ...process.env,
      VITE_MOCK_API: "false",
    },
  });
}

async function run() {
  const args = parseCliArgs();

  if (args.help) {
    showHelp();
    return;
  }

  if (args["frontend-only"]) {
    await runFrontendOnly(args.forwarded);
    return;
  }

  const backendArgs = args["backend-only"]
    ? [...args.forwarded, "--backend-only"]
    : args.forwarded;
  setForwardedArgv(backendArgs);

  if (args.sandbox === "docker") {
    const { runDockerDevEntrypoint } = await import("./launch-docker.mjs");
    await runDockerDevEntrypoint({
      backendOnly: args["backend-only"],
      noAutomation: args["no-automation"] || args["backend-only"],
    });
    return;
  }

  if (args["no-automation"] || args["backend-only"]) {
    const { main } = await import("./launch-safe.mjs");
    await main();
    return;
  }

  const { main } = await import("./launch-automation.mjs");
  await main();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
