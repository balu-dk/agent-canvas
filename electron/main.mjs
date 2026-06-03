/**
 * Electron Main Process — Agent Canvas Desktop
 *
 * Starts the full Agent Canvas stack (agent-server + automation via uvx,
 * static frontend, ingress proxy), then opens a native BrowserWindow once
 * the ingress is ready. Shows a loading screen while backends start.
 *
 * Path layout (electron-builder uses root package.json + afterPack patch):
 *
 *   Packaged (macOS example):
 *     Contents/Resources/app/
 *       electron/
 *         main.mjs          ← __dirname = .../app/electron/
 *         loading.html
 *       scripts/            ← .../app/scripts/
 *       config/             ← .../app/config/
 *       build/              ← .../app/build/
 *     Contents/Resources/bin/   ← process.resourcesPath/bin
 *       uv  uvx             ← bundled via extraResources
 *
 *   Dev (npm run desktop):
 *     electron/             ← __dirname = <repo>/electron/
 *     scripts/ config/ build/  ← one level up (<repo>/)
 *     system uvx from PATH
 *
 * In both cases __dirname is inside an 'electron/' folder whose parent
 * IS the project root, so paths are always join(__dirname, '..', ...).
 */

import {
  app,
  BrowserWindow,
  dialog,
  nativeTheme,
  shell,
} from "electron";
import { chmodSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Path resolution ───────────────────────────────────────────────────────────
// __dirname is always inside an 'electron/' folder.
// One level up is the project root in both dev and packaged mode.

const projectRoot = join(__dirname, "..");
const buildDir = join(projectRoot, "build");
const scriptsDir = join(projectRoot, "scripts");

// ── Bundled uv ────────────────────────────────────────────────────────────────

/**
 * Inject the bundled uv binary into PATH so that uvx calls inside
 * dev-with-automation.mjs resolve to our bundled binary.
 * No-op in dev mode (falls back to system uv).
 */
function injectBundledUv() {
  if (!app.isPackaged) return;

  const isWin = process.platform === "win32";
  const uvName = isWin ? "uv.exe" : "uv";
  const uvxName = isWin ? "uvx.exe" : "uvx";
  const binDir = join(process.resourcesPath, "bin");
  const uvPath = join(binDir, uvName);

  if (!existsSync(uvPath)) {
    console.warn("[desktop] Bundled uv not found at", uvPath);
    return;
  }

  // electron-builder copies files without preserving the +x bit on Unix.
  if (!isWin) {
    try {
      chmodSync(uvPath, 0o755);
      const uvxPath = join(binDir, uvxName);
      if (existsSync(uvxPath)) chmodSync(uvxPath, 0o755);
    } catch {}
  }

  const sep = isWin ? ";" : ":";
  process.env.PATH = `${binDir}${sep}${process.env.PATH ?? ""}`;
  console.log("[desktop] Injected bundled uv from", binDir);
}

/**
 * Verify uvx is reachable (either bundled or system).
 * Returns true/false — callers show a dialog on false.
 */
function uvxAvailable() {
  const cmd = process.platform === "win32" ? "uvx.exe" : "uvx";
  const r = spawnSync(cmd, ["--version"], { stdio: "pipe" });
  return r.status === 0;
}

// ── Readiness polling ─────────────────────────────────────────────────────────

async function waitForUrl(url, timeoutMs = 120_000, intervalMs = 600) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.status < 500) return;
    } catch {}
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Timed out waiting for ${url} to become ready (${timeoutMs / 1000}s).`
  );
}

// ── Windows ───────────────────────────────────────────────────────────────────

let loadingWin = null;
let mainWin = null;

function createLoadingWindow() {
  loadingWin = new BrowserWindow({
    width: 420,
    height: 280,
    resizable: false,
    frame: false,
    center: true,
    show: false,
    backgroundColor: "#0d0d1a",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  loadingWin.loadFile(join(__dirname, "loading.html"));
  loadingWin.once("ready-to-show", () => loadingWin?.show());
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWin.loadURL("http://localhost:8000");

  mainWin.once("ready-to-show", () => {
    loadingWin?.destroy();
    loadingWin = null;
    mainWin?.show();
    mainWin?.maximize();
  });

  // Open external links in the system browser rather than a new Electron window.
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("http://localhost") && !url.startsWith("http://127.0.0.1")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWin.on("closed", () => {
    mainWin = null;
  });
}

// ── Backend stack ─────────────────────────────────────────────────────────────

async function startStack() {
  const entryUrl = pathToFileURL(
    join(scriptsDir, "dev-with-automation.mjs")
  ).href;
  const { main } = await import(entryUrl);

  // main() starts agent-server + automation backend + static server + ingress.
  // skipNpmCheck: npm is not needed at runtime in static mode.
  await main({
    bannerTitle: "Agent Canvas",
    staticMode: true,
    staticDir: buildDir,
    mode: "agent-canvas",
    isPublic: false,
    skipNpmCheck: true,
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  nativeTheme.themeSource = "dark";

  injectBundledUv();

  if (!uvxAvailable()) {
    dialog.showErrorBox(
      "Missing prerequisite: uv",
      app.isPackaged
        ? "The bundled uv binary could not be found. Please reinstall Agent Canvas."
        : "uv (uvx) is not installed.\n\nInstall it from https://docs.astral.sh/uv/ then restart."
    );
    app.quit();
    return;
  }

  createLoadingWindow();

  try {
    await startStack();
    await waitForUrl("http://localhost:8000");
    createMainWindow();
  } catch (err) {
    const msg =
      err.message +
      "\n\nEnsure ports 8000, 18000, and 18001 are free, then try again.";
    dialog.showErrorBox("Agent Canvas failed to start", msg);
    app.quit();
  }
});

// Quit when all windows are closed; backend child processes are cleaned up
// by the signal handlers registered inside dev-with-automation.mjs.
app.on("window-all-closed", () => {
  app.quit();
});

// macOS: clicking the dock icon when no window is open re-launches the app.
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    // The backend is already running — just open a new renderer window.
    if (mainWin === null) createMainWindow();
  }
});
