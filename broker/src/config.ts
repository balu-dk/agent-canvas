/**
 * Broker configuration, read once from the environment at process start.
 *
 * Secrets (LLM_API_KEY, BROKER_SESSION_API_KEY) live in env only — never in
 * config/defaults.json. See broker/README.md.
 */

export interface BrokerConfig {
  /** Port the broker's HTTP server listens on. */
  port: number;
  /** kubeconfig context to use (OrbStack: "orbstack"). */
  kubeContext: string;
  /** Namespace where Sandbox CRs + pods live. */
  namespace: string;
  /**
   * Shared secret the frontend must present as X-Session-API-Key on every
   * control-plane (/api/k8s/*) call except /api/k8s/health. The /sandbox-runtime
   * proxy does NOT check this (the sandbox checks its own session key).
   */
  brokerSessionApiKey: string;
  /** Agent-server image repository, e.g. ghcr.io/openhands/agent-server. */
  agentServerImage: string;
  /** Agent-server image tag, e.g. 1.24.0-python. */
  agentServerImageTag: string;
  /** LLM model injected into each sandbox's native conversation. */
  llmModel: string;
  /** LLM API key injected into each sandbox's native conversation. */
  llmApiKey: string;
  /** Optional LLM base URL (proxies); omitted for first-party Anthropic/OpenAI. */
  llmBaseUrl: string | null;
  /**
   * Optional override for the served Sandbox CRD version. When unset the broker
   * discovers it from the CRD at startup (default v1alpha1).
   */
  sandboxApiVersionOverride: string | null;
}

function env(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

function intEnv(name: string, fallback: number): number {
  const raw = env(name);
  if (raw === undefined) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(): BrokerConfig {
  return {
    port: intEnv("PORT", 18002),
    kubeContext: env("KUBE_CONTEXT") ?? "orbstack",
    namespace: env("NAMESPACE") ?? "agent-canvas",
    brokerSessionApiKey: env("BROKER_SESSION_API_KEY") ?? "",
    agentServerImage: env("AGENT_SERVER_IMAGE") ?? "ghcr.io/openhands/agent-server",
    agentServerImageTag: env("AGENT_SERVER_IMAGE_TAG") ?? "1.24.0-python",
    llmModel: env("LLM_MODEL") ?? "",
    llmApiKey: env("LLM_API_KEY") ?? "",
    llmBaseUrl: env("LLM_BASE_URL") ?? null,
    sandboxApiVersionOverride: env("SANDBOX_API_VERSION") ?? null,
  };
}

/** Full image reference (`<image>:<tag>`). */
export function imageRef(config: BrokerConfig): string {
  return `${config.agentServerImage}:${config.agentServerImageTag}`;
}

/** Warn (do not throw) about missing-but-important settings at startup. */
export function configWarnings(config: BrokerConfig): string[] {
  const warnings: string[] = [];
  if (!config.brokerSessionApiKey) {
    warnings.push(
      "BROKER_SESSION_API_KEY is empty — all /api/k8s/* calls will be rejected with 401.",
    );
  }
  if (!config.llmModel) {
    warnings.push("LLM_MODEL is empty — native conversation creation will fail.");
  }
  if (!config.llmApiKey) {
    warnings.push("LLM_API_KEY is empty — the agent will not be able to call the LLM.");
  }
  return warnings;
}
