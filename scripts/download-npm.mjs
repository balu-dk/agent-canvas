#!/usr/bin/env node
/**
 * Download the npm CLI tarball from the npm registry into resources/npm/
 * so that electron-builder can bundle it as an extraResource.
 *
 * The packaged Electron app uses this bundled npm to provide `npx` (and
 * `npm`) to any stdio MCP server that starts with `npx -y <package>` — for
 * example the Slack, GitHub, Figma, etc. marketplace entries.
 *
 * When the .app is launched from Finder/Spotlight on macOS the OS gives it
 * a minimal PATH (/usr/bin:/bin) — Homebrew, nvm, asdf, etc. installs of
 * Node.js are NOT visible. We can already provide `node` by running
 * Electron itself with ELECTRON_RUN_AS_NODE=1 (see electron/main.mjs
 * ensureNodeAndNpmWrappers), but the npm CLI itself is a pure-JS package
 * not shipped by Electron, so we have to bundle it.
 *
 * The npm package is platform-agnostic (pure JS, no native bindings — its
 * own deps are bundled via `bundledDependencies`), so we download a single
 * tarball and extract it for all platforms.
 *
 * Usage:
 *   node scripts/download-npm.mjs           # uses NPM_BUNDLE_VERSION below
 *   NPM_VERSION=11.0.0 node scripts/download-npm.mjs
 *
 * Output:
 *   resources/npm/                          # self-contained npm install
 *     bin/npm-cli.js
 *     bin/npx-cli.js
 *     lib/
 *     node_modules/                         # npm's bundled deps
 *     package.json
 */

import {
  chmodSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { get } from "node:https";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
const outDir = join(projectRoot, "resources", "npm");

// Pinned npm version bundled with the Electron desktop app. Bump as needed.
// Electron 42 ships Node ~22, which is supported by npm 10.x and 11.x.
// Override at build time with NPM_VERSION=… to test a different version.
const NPM_BUNDLE_VERSION = "10.9.2";

function fetchJson(url, headers = {}) {
  return new Promise((resolve, reject) => {
    get(url, { headers }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return resolve(fetchJson(res.headers.location, headers));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`GET ${url} → HTTP ${res.statusCode}`));
      }
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(JSON.parse(body)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    function doGet(u) {
      get(u, { headers: { "User-Agent": "agent-canvas-build" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doGet(res.headers.location);
        }
        if (res.statusCode !== 200) {
          file.destroy();
          return reject(new Error(`GET ${u} → HTTP ${res.statusCode}`));
        }
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
        file.on("error", reject);
        res.on("error", reject);
      }).on("error", (err) => {
        file.destroy();
        reject(err);
      });
    }
    doGet(url);
  });
}

async function resolveVersion() {
  const requested = process.env.NPM_VERSION?.replace(/^v/, "");
  if (requested) return requested;
  return NPM_BUNDLE_VERSION;
}

async function resolveTarballUrl(version) {
  // The npm registry exposes per-version metadata at
  //   https://registry.npmjs.org/npm/<version>
  // which contains a `dist.tarball` URL pointing at the cached .tgz.
  // We could also predict the URL pattern (registry.npmjs.org/npm/-/npm-<ver>.tgz),
  // but going through the metadata makes us robust to registry layout changes.
  const meta = await fetchJson(
    `https://registry.npmjs.org/npm/${encodeURIComponent(version)}`,
    { "User-Agent": "agent-canvas-build" },
  );
  const url = meta?.dist?.tarball;
  if (!url) {
    throw new Error(
      `Could not find tarball URL in npm registry metadata for npm@${version}`,
    );
  }
  return url;
}

function extractTarball(archivePath, targetDir) {
  // npm tarballs unpack into a top-level "package/" directory.
  // --strip-components=1 removes that so the contents land directly in targetDir.
  // The system `tar` (GNU/BSD on Unix, bsdtar on Windows 10+) handles .tar.gz natively.
  execFileSync(
    "tar",
    ["-xf", archivePath, "-C", targetDir, "--strip-components=1"],
    { stdio: "inherit" },
  );
}

function chmodBinariesRecursive(dir) {
  if (process.platform === "win32") return;
  // The npm tarball's `bin/` scripts and a handful of nested package binaries
  // need +x. Walk the tree and chmod 0755 anything under a `bin/` directory
  // so we don't have to maintain a per-version allowlist.
  const stack = [dir];
  while (stack.length) {
    const next = stack.pop();
    let entries;
    try {
      entries = readdirSync(next, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const p = join(next, entry.name);
      if (entry.isDirectory()) {
        stack.push(p);
      } else if (next.endsWith("/bin") || next.includes("/bin/")) {
        try {
          chmodSync(p, 0o755);
        } catch {}
      }
    }
  }
}

async function main() {
  const version = await resolveVersion();
  console.log(`[download-npm] Resolving tarball URL for npm@${version}`);
  const tarballUrl = await resolveTarballUrl(version);
  console.log(`[download-npm] URL: ${tarballUrl}`);

  const tmpFile = join(tmpdir(), `npm-download-${Date.now()}.tgz`);

  try {
    // Clear any previous output so stale files from a different version
    // don't linger (e.g. removed bundled deps between npm 10.x → 11.x).
    if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    console.log(`[download-npm] Downloading to ${tmpFile}`);
    await downloadFile(tarballUrl, tmpFile);
    console.log(`[download-npm] Extracting to ${outDir}`);
    // Extract directly into outDir to avoid a cross-filesystem rename
    // (renameSync from /tmp into the repo fails with EXDEV when /tmp is
    // on a different mount, which is common in container environments).
    extractTarball(tmpFile, outDir);

    chmodBinariesRecursive(outDir);

    // Sanity-check that the two CLI entry points the Electron wrapper
    // depends on actually exist before we declare success.
    for (const cli of ["bin/npm-cli.js", "bin/npx-cli.js"]) {
      const p = join(outDir, cli);
      if (!existsSync(p)) {
        throw new Error(
          `Expected ${cli} in extracted npm tarball — got ${p} missing. ` +
            `Did the tarball layout change in npm@${version}?`,
        );
      }
    }

    console.log(`[download-npm] ✓ npm@${version} ready at ${outDir}`);
  } finally {
    try {
      rmSync(tmpFile, { force: true });
    } catch {}
  }
}

main().catch((err) => {
  console.error("[download-npm] Error:", err.message);
  process.exit(1);
});
