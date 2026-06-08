import { DEFAULT_WORKING_DIR } from "#/api/agent-server-config";

export function getGitPath(
  selectedRepository: string | null | undefined,
  workingDir?: string | null,
): string {
  // When a repo is selected, compute the path from selectedRepository
  // rather than trusting workingDir. The workingDir may be stale during
  // a repo switch (updated by the agent after cloning) while
  // selectedRepository is updated optimistically, causing the Changes tab
  // to show the wrong directory until the agent finishes cloning.
  if (selectedRepository) {
    const parts = selectedRepository.split("/");
    const repoName = parts[parts.length - 1];
    return `${DEFAULT_WORKING_DIR}/${repoName}`;
  }

  // No repo selected - use workingDir or default
  const normalizedWorkingDir = workingDir?.trim();
  if (normalizedWorkingDir) {
    return normalizedWorkingDir;
  }

  return DEFAULT_WORKING_DIR;
}
