/**
 * Resolve a {@link ExtensionSourceRef} to a concrete, immutable {@link ArtifactDescriptor}
 * and from there to a {@link BundleSource} the loader consumes.
 *
 * This is the single per-source seam in the install pipeline:
 *
 *   source string ──parse──▶ ExtensionSourceRef ──resolve──▶ ArtifactDescriptor ──acquire──▶ BundleSource ──▶ loadExtension
 *
 * `npm:` resolves via jsDelivr; `gh:` resolves via GitHub API (for branch/tag/SHA support
 * including slashed branch names) then uses jsDelivr CDN for serving; `url:` passes through
 * unchanged. A future first-party registry (`registry:`) is just another branch here that
 * returns the same descriptor shape (likely `format: "zip"` with an `integrity` hash) —
 * the acquire/load stages do not change.
 */

import { createHttpBundleSource } from "../dev-bundle-source";
import type { BundleSource } from "../loader";
import { resolveGitHubRef, type GitHubResolverOptions } from "./github-api";
import {
  formatSourceRef,
  parseSourceRef,
  type ExtensionSourceRef,
} from "./ref";
import { githubBaseUrl, npmBaseUrl, resolveNpmVersion } from "./jsdelivr";

/** Read GitHub token from environment (browser-side via Vite). */
export function getGitHubToken(): string | undefined {
  // Vite replaces import.meta.env at build time; this is undefined in Node tests
  // unless explicitly provided.
  return typeof import.meta?.env !== "undefined"
    ? import.meta.env.VITE_GITHUB_TOKEN
    : undefined;
}

export interface ArtifactDescriptor {
  /** Canonical source ref string (persisted for re-install, updates, and display). */
  sourceRef: string;
  kind: ExtensionSourceRef["kind"];
  /** Resolved concrete version (npm/gh); `undefined` for raw `url` sources. */
  version?: string;
  /** Base URL of the bundle directory (no trailing slash). */
  baseUrl: string;
  /**
   * Physical packaging. Only `"dir"` (loose files, the existing HTTP source) exists
   * today; `"zip"` is reserved for a first-party registry that ships single archives.
   */
  format: "dir";
}

type FetchLike = typeof fetch;

export interface ResolveOptions {
  /** Custom fetch implementation (for testing). */
  fetch?: FetchLike;
  /** GitHub token for private repos or higher rate limits. */
  githubToken?: string;
}

/** Resolve a parsed ref to an immutable artifact descriptor. */
export async function resolveSourceRef(
  ref: ExtensionSourceRef,
  fetchOrOptions?: FetchLike | ResolveOptions,
): Promise<ArtifactDescriptor> {
  // Normalize options for backward compatibility with (ref, fetch) signature
  const options: ResolveOptions =
    typeof fetchOrOptions === "function"
      ? { fetch: fetchOrOptions }
      : (fetchOrOptions ?? {});
  const fetchImpl = options.fetch ?? fetch;
  const githubToken = options.githubToken ?? getGitHubToken();

  const sourceRef = formatSourceRef(ref);
  switch (ref.kind) {
    case "npm": {
      const version = await resolveNpmVersion(ref.name, ref.range, fetchImpl);
      return {
        sourceRef,
        kind: "npm",
        version,
        baseUrl: npmBaseUrl(ref.name, version),
        format: "dir",
      };
    }
    case "gh": {
      // Use GitHub API for resolution (handles branches with slashes, SHAs, tags)
      const ghOptions: GitHubResolverOptions = {
        fetch: fetchImpl,
        token: githubToken,
      };
      const resolved = await resolveGitHubRef(
        ref.owner,
        ref.repo,
        ref.range,
        ghOptions,
      );
      // Use the resolved SHA as the version - jsDelivr can serve by commit SHA
      const version = resolved.sha;
      return {
        sourceRef,
        kind: "gh",
        version,
        baseUrl: githubBaseUrl(ref.owner, ref.repo, version, ref.subpath),
        format: "dir",
      };
    }
    case "url":
      return {
        sourceRef,
        kind: "url",
        baseUrl: ref.baseUrl,
        format: "dir",
      };
  }
}

/** Parse + resolve a source ref string in one step. */
export function resolveSource(
  input: string,
  fetchOrOptions?: FetchLike | ResolveOptions,
): Promise<ArtifactDescriptor> {
  return resolveSourceRef(parseSourceRef(input), fetchOrOptions);
}

/** Turn a resolved descriptor into a {@link BundleSource} for the loader. */
export function toBundleSource(descriptor: ArtifactDescriptor): BundleSource {
  // Only the `dir` format exists today; a `zip` format would unpack + mint blob URLs.
  return createHttpBundleSource(descriptor.baseUrl);
}
