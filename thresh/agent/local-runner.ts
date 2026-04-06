import fs from "node:fs";
import path from "node:path";
import type { WorkflowAnalysis, WorkflowFile } from "../shared/types.js";

/**
 * local-runner.ts — Workflow reader for composite Action (CI) mode
 *
 * Reads `.github/workflows/*.yml` / `.yaml` files directly from the disk at
 * `GITHUB_WORKSPACE` (or a provided workspace path), bypassing the GitHub API.
 *
 * SHA values are set to the empty string in this mode — the agent's local
 * commit path uses `git` on disk and does not need blob SHAs.
 */

/** Resolves the workspace root, preferring the explicit arg over env var. */
export function resolveWorkspace(explicit?: string): string {
  const ws = explicit ?? process.env.GITHUB_WORKSPACE ?? process.cwd();
  if (!fs.existsSync(ws)) {
    throw new Error(`Workspace path does not exist: ${ws}`);
  }
  return ws;
}

/**
 * Build a `WorkflowAnalysis` by reading workflow files from disk.
 *
 * @param owner      Repository owner (used to populate `WorkflowAnalysis`).
 * @param repo       Repository name.
 * @param workspace  Absolute path to the workspace root (default: GITHUB_WORKSPACE).
 */
export function perceiveLocal(
  owner: string,
  repo: string,
  workspace?: string
): WorkflowAnalysis {
  const ws = resolveWorkspace(workspace);
  const workflowsDir = path.join(ws, ".github", "workflows");

  if (!fs.existsSync(workflowsDir)) {
    return { workflows: [], owner, repo };
  }

  const files = fs.readdirSync(workflowsDir);
  const workflows: WorkflowFile[] = files
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => {
      const filePath = path.join(workflowsDir, f);
      const raw = fs.readFileSync(filePath, "utf-8");
      return {
        name: f,
        path: path.relative(ws, filePath).replace(/\\/g, "/"),
        raw,
        sha: "", // not needed in local mode
      };
    });

  return { workflows, owner, repo };
}

/**
 * Writes a patched workflow file back to disk (local mode).
 *
 * @param workspace  Absolute path to workspace root.
 * @param filePath   Repo-relative path (e.g. `.github/workflows/ci.yml`).
 * @param content    New file content.
 */
export function writeLocal(
  workspace: string,
  filePath: string,
  content: string
): void {
  const abs = path.join(workspace, filePath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
}
