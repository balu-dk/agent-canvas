import type { AgentServerTransport } from "./backend-registry/types";
import { getAgentCanvasRuntimeConfig } from "./agent-canvas-runtime-config";

export const AGENT_SERVER_CONFIG_STORAGE_KEY = "openhands-agent-server-config";
export const DEFAULT_WORKING_DIR = "workspace/project";
export type { AgentServerTransport } from "./backend-registry/types";

interface StoredAgentServerConfig {
  baseUrl?: string | null;
  sessionApiKey?: string | null;
  transport?: AgentServerTransport | null;
  workingDir?: string | null;
}

export interface AgentServerFormDefaults {
  baseUrl: string;
  sessionApiKey: string;
}

interface AgentServerConfigUpdate extends AgentServerFormDefaults {
  transport?: AgentServerTransport | null;
}

interface LauncherAgentServerConfig {
  transport: "same-origin";
  sessionApiKey: string | null;
  workingDir: string | null;
}

function readStoredConfig(): StoredAgentServerConfig {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(AGENT_SERVER_CONFIG_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredAgentServerConfig;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writeStoredConfig(config: StoredAgentServerConfig): void {
  if (typeof window === "undefined") return;

  const nextConfig = Object.fromEntries(
    Object.entries(config).flatMap(([key, value]) => {
      if (typeof value !== "string") return [];

      const trimmed = value.trim();
      if (!trimmed) return [];

      return [[key, trimmed]];
    }),
  ) as StoredAgentServerConfig;

  if (Object.keys(nextConfig).length === 0) {
    window.localStorage.removeItem(AGENT_SERVER_CONFIG_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(
    AGENT_SERVER_CONFIG_STORAGE_KEY,
    JSON.stringify(nextConfig),
  );
}

function trimToNull(value?: string | null): string | null {
  return value?.trim() || null;
}

function normalizeBaseUrl(value?: string | null): string | null {
  if (!value) return null;

  const trimmed = value.trim().replace(/\/$/, "");
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${trimmed}`;
  }

  return `http://${trimmed}`;
}

function normalizeTransport(
  value?: string | null,
): AgentServerTransport | null {
  if (value === "same-origin" || value === "remote") return value;
  return null;
}

function getRuntimeLauncherConfig(): LauncherAgentServerConfig | null {
  const agentServer = getAgentCanvasRuntimeConfig().agentServer;
  const transport = normalizeTransport(agentServer?.transport);
  if (transport !== "same-origin") return null;

  return {
    transport,
    sessionApiKey: trimToNull(agentServer?.sessionApiKey),
    workingDir: trimToNull(agentServer?.workingDir),
  };
}

function getBuildTimeLauncherConfig(): LauncherAgentServerConfig | null {
  const transport = normalizeTransport(
    import.meta.env.VITE_AGENT_SERVER_TRANSPORT?.trim(),
  );
  if (transport !== "same-origin" && import.meta.env.VITE_MOCK_API !== "true") {
    return null;
  }

  return {
    transport: "same-origin",
    sessionApiKey: trimToNull(import.meta.env.VITE_SESSION_API_KEY),
    workingDir: trimToNull(import.meta.env.VITE_WORKING_DIR),
  };
}

function getLauncherConfig(): LauncherAgentServerConfig | null {
  return getRuntimeLauncherConfig() ?? getBuildTimeLauncherConfig();
}

function getConfiguredBaseUrlOverride(): string | null {
  const storedConfig = readStoredConfig();
  const storedTransport = normalizeTransport(storedConfig.transport);
  if (storedTransport === "same-origin") return null;

  return normalizeBaseUrl(storedConfig.baseUrl);
}

function getConfiguredTransportOverride(): AgentServerTransport | null {
  const storedTransport = normalizeTransport(readStoredConfig().transport);
  if (storedTransport === "remote") return storedTransport;

  return getLauncherConfig()?.transport ?? null;
}

function getStoredSessionApiKey(): string | null {
  return trimToNull(readStoredConfig().sessionApiKey);
}

function getLauncherSessionApiKey(): string | null {
  return getLauncherConfig()?.sessionApiKey ?? null;
}

export function getAgentServerTransport(): AgentServerTransport {
  if (getConfiguredBaseUrlOverride()) return "remote";

  return (
    getConfiguredTransportOverride() ??
    (import.meta.env.VITE_MOCK_API === "true" ? "same-origin" : "remote")
  );
}

function getConfiguredAgentServerBaseUrl(): string | null {
  const baseUrl = getConfiguredBaseUrlOverride();
  if (baseUrl) return baseUrl;

  if (getLauncherConfig()) {
    return typeof window !== "undefined" ? window.location.origin : null;
  }

  return null;
}

export function getAgentServerFormDefaults(): AgentServerFormDefaults {
  return {
    baseUrl: getConfiguredAgentServerBaseUrl() ?? "",
    sessionApiKey: getAgentServerSessionApiKey() ?? "",
  };
}

export function hasConfiguredAgentServerDefaults(): boolean {
  return Boolean(getConfiguredAgentServerBaseUrl());
}

export function saveAgentServerConfig(config: AgentServerConfigUpdate): void {
  const currentConfig = readStoredConfig();
  const transport =
    config.transport ?? (normalizeBaseUrl(config.baseUrl) ? "remote" : null);

  writeStoredConfig({
    ...currentConfig,
    baseUrl:
      transport === "same-origin" ? null : normalizeBaseUrl(config.baseUrl),
    sessionApiKey: trimToNull(config.sessionApiKey),
    transport,
  });
}

export function getAgentServerBaseUrl(): string {
  return getConfiguredAgentServerBaseUrl() ?? "";
}

export function getLauncherAgentServerSessionApiKey(): string | null {
  return getLauncherSessionApiKey();
}

export function getAgentServerSessionApiKey(): string | null {
  return getAgentServerTransport() === "same-origin"
    ? getLauncherSessionApiKey()
    : getStoredSessionApiKey();
}

export function getAgentServerWorkingDir(): string {
  const launcherDir = getLauncherConfig()?.workingDir;
  if (launcherDir) return launcherDir;

  const envDir = import.meta.env.VITE_WORKING_DIR?.trim();
  if (envDir) return envDir;

  const storedDir = readStoredConfig().workingDir?.trim();
  if (storedDir) return storedDir;

  return DEFAULT_WORKING_DIR;
}

export function buildConversationWorkingDir(conversationId: string): string {
  const base = getAgentServerWorkingDir().replace(/\/+$/, "");
  const hex = conversationId.replace(/-/g, "");
  return `${base}/${hex}`;
}

export function getConfiguredWorkerUrls(): string[] {
  const raw = import.meta.env.VITE_WORKER_URLS?.trim();
  if (!raw) return [];

  return raw
    .split(",")
    .map((url: string) => normalizeBaseUrl(url))
    .filter((url: string | null): url is string => Boolean(url));
}

/**
 * Returns whether public skills from the OpenHands extensions marketplace
 * (https://github.com/OpenHands/extensions) should be loaded.
 *
 * Defaults to true. Set VITE_LOAD_PUBLIC_SKILLS=false to disable.
 */
export function shouldLoadPublicSkills(): boolean {
  return import.meta.env.VITE_LOAD_PUBLIC_SKILLS !== "false";
}
