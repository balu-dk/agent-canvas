import {
  ApiException,
  ApiextensionsV1Api,
  CoreV1Api,
  CustomObjectsApi,
  KubeConfig,
} from "@kubernetes/client-node";
import type { BrokerConfig } from "../config.js";

export const SANDBOX_GROUP = "agents.x-k8s.io";
export const SANDBOX_PLURAL = "sandboxes";
export const SANDBOX_CRD_NAME = "sandboxes.agents.x-k8s.io";
export const DEFAULT_SANDBOX_VERSION = "v1alpha1";

export interface K8sClient {
  /** The underlying KubeConfig (needed for PortForward). */
  kubeConfig: KubeConfig;
  customObjects: CustomObjectsApi;
  core: CoreV1Api;
  apiext: ApiextensionsV1Api;
  /** The Sandbox CRD version the broker writes/reads (e.g. "v1alpha1"). */
  sandboxApiVersion: string;
  namespace: string;
}

/**
 * Build a K8sClient from the broker config. Uses the local kubeconfig
 * (loadFromDefault) and pins the context (OrbStack: "orbstack"). The broker is
 * the only writer of these CRs and runs with the user's cluster-admin-local
 * kubeconfig, so no in-cluster RBAC is needed for dev.
 */
export async function createK8sClient(config: BrokerConfig): Promise<K8sClient> {
  const kc = new KubeConfig();
  kc.loadFromDefault();
  // Pin the context explicitly; never rely on the implicit current-context.
  kc.setCurrentContext(config.kubeContext);

  const customObjects = kc.makeApiClient(CustomObjectsApi);
  const core = kc.makeApiClient(CoreV1Api);
  const apiext = kc.makeApiClient(ApiextensionsV1Api);

  const sandboxApiVersion = await discoverSandboxApiVersion(
    apiext,
    config.sandboxApiVersionOverride,
  );

  return {
    kubeConfig: kc,
    customObjects,
    core,
    apiext,
    sandboxApiVersion,
    namespace: config.namespace,
  };
}

/**
 * Discover the served version of the Sandbox CRD. Honors an explicit override
 * first; otherwise reads the CRD and returns the served (preferably storage)
 * version. Falls back to v1alpha1 if discovery fails (e.g. CRD not installed
 * yet) so the broker can still start and surface a clearer error on first use.
 */
export async function discoverSandboxApiVersion(
  apiext: ApiextensionsV1Api,
  override: string | null,
): Promise<string> {
  if (override) return override;
  try {
    const crd = await apiext.readCustomResourceDefinition({ name: SANDBOX_CRD_NAME });
    const versions = crd.spec?.versions ?? [];
    const served = versions.filter((v) => v.served);
    // Prefer the storage version among served versions, else the first served.
    const storage = served.find((v) => v.storage);
    const chosen = storage ?? served[0];
    if (chosen?.name) return chosen.name;
  } catch (err) {
    // CRD may not be installed yet; default and let create-time fail loudly.
    // eslint-disable-next-line no-console
    console.warn(
      `[broker] could not discover Sandbox CRD version (${describeApiError(err)}); ` +
        `defaulting to ${DEFAULT_SANDBOX_VERSION}`,
    );
  }
  return DEFAULT_SANDBOX_VERSION;
}

/** Full apiVersion string for the Sandbox CR (e.g. "agents.x-k8s.io/v1alpha1"). */
export function sandboxApiVersionString(client: K8sClient): string {
  return `${SANDBOX_GROUP}/${client.sandboxApiVersion}`;
}

/** HTTP status code of a k8s API error, or null if it isn't an ApiException. */
export function apiErrorCode(err: unknown): number | null {
  if (err instanceof ApiException) return err.code;
  // Some transport errors carry a numeric `code` too; be defensive.
  if (err && typeof err === "object" && typeof (err as { code?: unknown }).code === "number") {
    return (err as { code: number }).code;
  }
  return null;
}

/** True when the API error is a 404 Not Found. */
export function isNotFound(err: unknown): boolean {
  return apiErrorCode(err) === 404;
}

/** Human-readable description of an API error for logs. */
export function describeApiError(err: unknown): string {
  if (err instanceof ApiException) {
    const body =
      typeof err.body === "string" ? err.body : JSON.stringify(err.body ?? {});
    return `HTTP ${err.code}: ${body}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
