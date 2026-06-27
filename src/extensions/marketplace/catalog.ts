/**
 * Types and a dependency-free validator for an OpenHands plugin marketplace catalog
 * (`marketplace.json`), mirroring the schema used by `software-agent-sdk` and
 * `Plugin-Directory`, which itself mirrors the official Claude Code marketplace schema.
 *
 * UI extensions live in a dedicated top-level `uiExtensions` array — NOT in `plugins`.
 * Agent tooling (Claude Code, the OpenHands plugin loader) only reads `plugins`, and
 * both parsers ignore unknown top-level keys, so a UI extension never appears as an
 * installable plugin in contexts that can't render it. The file stays a valid
 * (possibly empty-`plugins`) marketplace.json, so it still "lives within" the spec.
 */

import {
  githubUrlToSource,
  githubUrlPath,
  rawGithubUrl,
  type GithubSource,
  type MarketplaceSource,
} from "./source";

export interface CatalogOwner {
  name: string;
  email?: string;
}

export interface CatalogAuthor {
  name: string;
  email?: string;
  url?: string;
}

export interface GithubEntrySource {
  source: "github";
  repo: string;
  ref?: string;
  sha?: string;
  path?: string;
}

export interface UrlEntrySource {
  source: "url";
  url: string;
  ref?: string;
  sha?: string;
}

/** A plugin entry's source: a string path (relative to the catalog repo) or an object. */
export type EntrySource = string | GithubEntrySource | UrlEntrySource;

export interface MarketplaceEntry {
  name: string;
  source: EntrySource;
  description?: string;
  version?: string;
  author?: CatalogAuthor;
  category?: string;
  homepage?: string;
}

export interface MarketplaceCatalog {
  name: string;
  owner: CatalogOwner;
  /** Agent plugins (read by Claude Code / the OpenHands plugin loader). */
  plugins?: MarketplaceEntry[];
  /** UI extensions — read only by Agent Canvas, never listed as agent plugins. */
  uiExtensions?: MarketplaceEntry[];
  metadata?: { description?: string; version?: string; pluginRoot?: string };
}

export type CatalogParseResult =
  | { ok: true; catalog: MarketplaceCatalog }
  | { ok: false; errors: string[] };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateEntrySource(value: unknown, path: string, errors: string[]) {
  if (typeof value === "string") {
    if (!value.trim()) errors.push(`${path}: empty source string`);
    return;
  }
  if (!isObject(value)) {
    errors.push(`${path}: expected string or object`);
    return;
  }
  const kind = value.source;
  if (kind === "github") {
    if (typeof value.repo !== "string" || !value.repo.includes("/")) {
      errors.push(`${path}.repo: expected "owner/repo"`);
    }
  } else if (kind === "url") {
    if (typeof value.url !== "string" || !value.url) {
      errors.push(`${path}.url: expected a non-empty string`);
    }
  } else {
    errors.push(`${path}.source: expected "github" or "url"`);
  }
}

function validateEntryArray(value: unknown, key: string, errors: string[]) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    errors.push(`${key}: expected an array`);
    return;
  }
  value.forEach((entry, i) => {
    const path = `${key}[${i}]`;
    if (!isObject(entry)) {
      errors.push(`${path}: expected an object`);
      return;
    }
    if (typeof entry.name !== "string" || !entry.name.trim()) {
      errors.push(`${path}.name: expected a non-empty string`);
    }
    if (entry.source === undefined) {
      errors.push(`${path}.source: required`);
    } else {
      validateEntrySource(entry.source, `${path}.source`, errors);
    }
  });
}

/**
 * Parse + validate raw catalog JSON. `plugins` and `uiExtensions` are both optional
 * (a UI-only marketplace may omit `plugins`). Unknown fields are ignored, not rejected.
 */
export function parseCatalog(input: unknown): CatalogParseResult {
  const errors: string[] = [];
  if (!isObject(input)) {
    return { ok: false, errors: ["catalog: expected an object"] };
  }
  if (typeof input.name !== "string" || !input.name.trim()) {
    errors.push("name: expected a non-empty string");
  }
  if (!isObject(input.owner) || typeof input.owner.name !== "string") {
    errors.push("owner.name: expected a non-empty string");
  }
  validateEntryArray(input.plugins, "plugins", errors);
  validateEntryArray(input.uiExtensions, "uiExtensions", errors);

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, catalog: input as unknown as MarketplaceCatalog };
}

function parentUrl(url: string): string {
  const idx = url.lastIndexOf("/");
  return idx >= 0 ? url.slice(0, idx) : url;
}

/**
 * Resolve a plugin entry's source to the raw base URL of its bundle directory.
 * `catalogUrl` is the URL the catalog was fetched from (used to resolve relative
 * string sources for non-GitHub catalogs). Returns null for sources that cannot be
 * fetched directly from the browser (e.g. a non-raw git URL).
 */
export function resolveEntryBundleUrl(
  source: MarketplaceSource,
  catalogUrl: string,
  entry: MarketplaceEntry,
): string | null {
  const entrySource = entry.source;

  if (typeof entrySource === "string") {
    const relative = entrySource.replace(/^\.\//, "").replace(/^\/+/, "");
    if (source.kind === "github") {
      return rawGithubUrl(source, relative);
    }
    // Non-GitHub catalog: resolve relative to the catalog file's directory.
    return `${parentUrl(catalogUrl)}/${relative}`;
  }

  if (entrySource.source === "github") {
    const [owner, repo] = entrySource.repo.split("/");
    const gh: GithubSource = {
      kind: "github",
      owner,
      repo,
      ref: entrySource.ref ?? entrySource.sha ?? "main",
    };
    return rawGithubUrl(gh, entrySource.path ?? "");
  }

  // entrySource.source === "url": only github web URLs can be mapped to a raw base.
  const gh = githubUrlToSource(entrySource.url);
  if (gh) {
    if (entrySource.ref) gh.ref = entrySource.ref;
    return rawGithubUrl(gh, githubUrlPath(entrySource.url) ?? "");
  }
  return null;
}
