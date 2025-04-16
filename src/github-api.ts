/**
 * Stub GitHub API helper.
 * Real implementation should wrap Octokit or GitHub REST endpoints.
 */
export async function getRepoInfo(owner: string, repo: string): Promise<Record<string, unknown>> {
  console.warn('GitHub API stub getRepoInfo called for', owner, repo);
  return {};
}
