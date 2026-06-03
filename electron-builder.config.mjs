/**
 * electron-builder configuration for the Agent Canvas desktop app.
 *
 * The root package.json has `"main": "./dist/index.cjs"` for npm library
 * consumers. The `afterPack` hook patches it to `"./electron/main.mjs"`
 * inside the packaged app so Electron finds the right entry point without
 * touching the published npm package.
 *
 * Packaged app layout (inside Resources/app/):
 *   electron/
 *     main.mjs        ← Electron entry (main field patched to this)
 *     loading.html
 *   scripts/          ← backend scripts (Node.js built-ins only)
 *   config/           ← defaults.json
 *   build/            ← static frontend (npm run build:app output)
 *
 * No node_modules are bundled — all scripts use only Node.js built-ins.
 * The bundled uv binary (resources/bin/) goes to <Resources>/bin/.
 */

import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";

/** @type {import('electron-builder').Configuration} */
const config = {
  appId: "dev.openhands.agent-canvas",
  productName: "Agent Canvas",
  copyright: "Copyright © 2025 All Hands AI",

  directories: {
    output: "dist-electron",
  },

  // Do not pack into asar — scripts are spawned as child processes by
  // dev-with-automation.mjs and must exist as real files on disk.
  asar: false,

  // Files included in the packaged app (paths relative to project root).
  // node_modules is intentionally omitted — scripts only use Node.js built-ins.
  files: [
    "electron/**",
    "scripts/**/*.{mjs,cjs}",
    "config/**",
    "build/**",
    "package.json",
  ],

  // Patch the packaged package.json to point Electron at our main process.
  // The root package.json has main: './dist/index.cjs' for npm consumers;
  // inside the packaged app we need main: './electron/main.mjs'.
  afterPack: async ({ appOutDir, electronPlatformName }) => {
    // On macOS the app bundle has an extra Contents/ layer.
    const appResourcesDir =
      electronPlatformName === "darwin"
        ? join(appOutDir, "Contents", "Resources", "app")
        : join(appOutDir, "resources", "app");

    const pkgPath = join(appResourcesDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    pkg.main = "./electron/main.mjs";
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    console.log(`[afterPack] Patched package.json main → ${pkg.main}`);
  },

  // Bundled uv binary — placed in <Resources>/bin/ so Electron can inject
  // it into PATH before starting the backend stack.
  // Run `npm run download-uv` (called by build:desktop) to populate this.
  extraResources: [
    { from: "resources/bin/", to: "bin/", filter: ["**/*"] },
  ],

  // ── macOS ──────────────────────────────────────────────────────────────────
  mac: {
    category: "public.app-category.developer-tools",
    target: [
      { target: "dmg", arch: ["universal"] },
    ],
    // Add icon: "electron/build-resources/icon.icns" once a 512×512 source
    // image is available. Run: electron-icon-builder --input=icon.png --output=electron/build-resources
  },

  dmg: {
    title: "Agent Canvas",
    contents: [
      { x: 130, y: 220 },
      { x: 410, y: 220, type: "link", path: "/Applications" },
    ],
    window: { width: 540, height: 380 },
  },

  // ── Windows ────────────────────────────────────────────────────────────────
  win: {
    target: [
      { target: "nsis", arch: ["x64"] },
    ],
    // Add icon: "electron/build-resources/icon.ico" once artwork is available.
  },

  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },

  // ── Linux ──────────────────────────────────────────────────────────────────
  linux: {
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    category: "Development",
    // Add icon: "electron/build-resources/icon.png" once artwork is available.
  },
};

export default config;
