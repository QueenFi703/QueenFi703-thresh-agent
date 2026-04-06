import { Octokit } from "@octokit/rest";
import type { WorkflowAnalysis, WorkflowFile } from "../shared/types.js";

/**
 * perception.ts — Workflow reader for webhook / server mode
 *
 * Fetches all `.github/workflows/*.yml` (and `.yaml`) files from the GitHub
 * API and returns a `WorkflowAnalysis` ready for the decision engine.
 */

/** Maximum number of workflow files fetched in one pass. */
const MAX_WORKFLOWS = 50;

/**
 * Build a `WorkflowAnalysis` by reading the repo's workflows via the GitHub
 * REST API.
 *
 * @param token  GitHub token (installation token or PAT).
 * @param owner  Repository owner.
 * @param repo   Repository name.
 * @param ref    Git ref to read from (default: the repo's default branch).
 */
export async function perceive(
  token: string,
  owner: string,
  repo: string,
  ref?: string
): Promise<WorkflowAnalysis> {
  const octokit = new Octokit({ auth: token });

  // List all entries under .github/workflows/
  let entries: { name: string; path: string; sha: string; type: string }[] = [];
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: ".github/workflows",
      ...(ref ? { ref } : {}),
    });
    if (!Array.isArray(data)) {
      entries = [];
    } else {
      entries = data as typeof entries;
    }
  } catch {
    // Directory doesn't exist — return empty analysis.
    return { workflows: [], owner, repo };
  }

  const yamlEntries = entries
    .filter(
      (e) =>
        e.type === "file" &&
        (e.name.endsWith(".yml") || e.name.endsWith(".yaml"))
    )
    .slice(0, MAX_WORKFLOWS);

  const workflows: WorkflowFile[] = await Promise.all(
    yamlEntries.map(async (entry) => {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: entry.path,
        ...(ref ? { ref } : {}),
      });

      if (Array.isArray(data) || data.type !== "file") {
        throw new Error(`Unexpected content type for ${entry.path}`);
      }

      const raw = Buffer.from(data.content, "base64").toString("utf-8");

      return {
        name: entry.name,
        path: entry.path,
        raw,
        sha: data.sha,
      };
    })
  );

  return { workflows, owner, repo };
}
