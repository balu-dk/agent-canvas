import type { AgentServerTransport } from "./backend-registry/types";

export const AGENT_CANVAS_RUNTIME_CONFIG_GLOBAL =
  "__AGENT_CANVAS_RUNTIME_CONFIG__";

export interface RuntimeAgentServerConfig {
  transport?: AgentServerTransport | null;
  sessionApiKey?: string | null;
  workingDir?: string | null;
}

export interface AgentCanvasRuntimeConfig {
  agentServer?: RuntimeAgentServerConfig | null;
  runtimeServicesInfo?: unknown;
}

type RuntimeConfigWindow = Window & {
  [AGENT_CANVAS_RUNTIME_CONFIG_GLOBAL]?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getAgentCanvasRuntimeConfig(): AgentCanvasRuntimeConfig {
  if (typeof window === "undefined") return {};

  const value = (window as RuntimeConfigWindow)[
    AGENT_CANVAS_RUNTIME_CONFIG_GLOBAL
  ];
  if (!isRecord(value)) return {};

  return value as AgentCanvasRuntimeConfig;
}
