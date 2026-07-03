import { SettingsClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "../agent-server-client-options";
import { getActiveBackend } from "../backend-registry/active-store";
import { Branch, GitRepository, RepositoryPage, BranchPage } from "#/types/git";

/**
 * Direct-to-GitHub repository/branch listing for LOCAL backends.
 *
 * Cloud/app-server backends expose `/api/v1/git/repositories/search`, but a
 * bare agent-server has no git-provider API — so on local backends the
 * repo pickers were empty. GitHub's REST API sends
 * `Access-Control-Allow-Origin: *`, so the browser can call it directly,
 * authenticated with the user's PAT fetched from the backend's secrets
 * store (the same `GITHUB_TOKEN` the agent already uses to clone).
 */

const GITHUB_API = "https://api.github.com";
export const GITHUB_TOKEN_SECRET_NAME = "GITHUB_TOKEN";
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;

let tokenCache: {
  backendId: string;
  token: string | null;
  fetchedAtMs: number;
} | null = null;

/** Test hook: reset the in-memory token cache. */
export const clearGitHubTokenCache = (): void => {
  tokenCache = null;
};

/**
 * The user's GitHub PAT from the active backend's secrets store, or null
 * when none is saved. Cached briefly per backend so dropdown keystrokes
 * don't hammer the secrets endpoint.
 */
export async function getGitHubToken(): Promise<string | null> {
  const backendId = getActiveBackend().backend.id;
  const now = Date.now();
  if (
    tokenCache?.backendId === backendId &&
    now - tokenCache.fetchedAtMs < TOKEN_CACHE_TTL_MS
  ) {
    return tokenCache.token;
  }

  let token: string | null = null;
  try {
    const response = await new SettingsClient(
      getAgentServerClientOptions(),
    ).getSecret(GITHUB_TOKEN_SECRET_NAME);
    const value = typeof response === "string" ? response : String(response);
    token = value.trim() || null;
  } catch {
    token = null;
  }

  tokenCache = { backendId, token, fetchedAtMs: now };
  return token;
}

interface GitHubRepo {
  id: number;
  full_name: string;
  private: boolean;
  stargazers_count?: number;
  pushed_at?: string;
  default_branch?: string;
}

interface GitHubBranch {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

const toRepository = (repo: GitHubRepo): GitRepository => ({
  id: String(repo.id),
  full_name: repo.full_name,
  git_provider: "github",
  is_public: !repo.private,
  stargazers_count: repo.stargazers_count,
  pushed_at: repo.pushed_at,
  main_branch: repo.default_branch,
});

async function githubFetch<T>(token: string, path: string): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/**
 * List the user's repositories (owned, collaborator, org member), most
 * recently pushed first, optionally filtered by a substring query. Fetches
 * up to two pages of 100 — plenty for a picker; the query narrows the rest.
 */
export async function listGitHubRepositories(
  query: string | undefined,
  limit: number,
): Promise<RepositoryPage> {
  const token = await getGitHubToken();
  if (!token) return { items: [], next_page_id: null };

  const pages = await Promise.all([
    githubFetch<GitHubRepo[]>(token, "/user/repos?per_page=100&sort=pushed"),
    githubFetch<GitHubRepo[]>(
      token,
      "/user/repos?per_page=100&sort=pushed&page=2",
    ).catch(() => [] as GitHubRepo[]),
  ]);

  const needle = query?.trim().toLowerCase();
  const items = pages
    .flat()
    .filter((repo) => !needle || repo.full_name.toLowerCase().includes(needle))
    .slice(0, limit)
    .map(toRepository);

  return { items, next_page_id: null };
}

/**
 * List a repository's branches, query-filtered. GitHub returns branches in
 * ALPHABETICAL order, 100 per page, and the REST API has no name search — so
 * a single page silently drops the default branch (e.g. `main`, mid-alphabet)
 * in repos with many earlier branches (dependabot/, feature/ …). Page through
 * all of them (bounded) so the default branch is always present.
 */
export async function listGitHubBranches(
  repository: string,
  query?: string,
): Promise<BranchPage> {
  const token = await getGitHubToken();
  if (!token) return { items: [], next_page_id: null };

  const PER_PAGE = 100;
  const MAX_PAGES = 20; // up to 2000 branches — beyond any realistic repo
  const all: GitHubBranch[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    // Pages are walked sequentially until a short (final) page — GitHub gives
    // no total count to parallelise against.
    const batch = await githubFetch<GitHubBranch[]>(
      token,
      `/repos/${repository}/branches?per_page=${PER_PAGE}&page=${page}`,
    );
    all.push(...batch);
    if (batch.length < PER_PAGE) break; // reached the last page
  }

  const needle = query?.trim().toLowerCase();
  const items: Branch[] = all
    .filter((branch) => !needle || branch.name.toLowerCase().includes(needle))
    .map((branch) => ({
      name: branch.name,
      commit_sha: branch.commit.sha,
      protected: branch.protected,
    }));

  return { items, next_page_id: null };
}
