import type { Patch, WorkflowAnalysis, RunContext, PatchResult } from "../../shared/types.js";

/**
 * permissions patch
 *
 * Inserts a minimal `permissions: read-all` block into workflow files that
 * contain no top-level `permissions:` key at all.
 *
 * Insertion strategy (keeps the YAML valid):
 *   1. If the file starts with a YAML front-matter separator (`---`), insert
 *      immediately after the first `---` line.
 *   2. Otherwise, insert immediately after the first `name:` line (the
 *      conventional first key in a workflow file).
 *   3. If neither landmark is found, prepend to the file.
 *
 * Why `read-all`?  It is the most conservative safe default: every job that
 * needs write access must declare it explicitly, satisfying the GitHub
 * "principle of least privilege" recommendation.
 */

const PERMISSIONS_BLOCK = "permissions: read-all\n";

/** Returns true when no top-level `permissions:` key exists in the raw YAML. */
function missingPermissions(raw: string): boolean {
  // Match `permissions:` only at column 0 (top-level key).
  return !/^permissions\s*:/m.test(raw);
}

/** Inserts the permissions block after the best available anchor line. */
function insertPermissions(raw: string): string {
  // Strategy 1 — YAML document separator on its own line.
  const sepIdx = raw.search(/^---\s*$/m);
  if (sepIdx !== -1) {
    const lineEnd = raw.indexOf("\n", sepIdx);
    const insertAt = lineEnd === -1 ? raw.length : lineEnd + 1;
    return raw.slice(0, insertAt) + PERMISSIONS_BLOCK + raw.slice(insertAt);
  }

  // Strategy 2 — first top-level `name:` key.
  const nameMatch = raw.match(/^name\s*:.*$/m);
  if (nameMatch && nameMatch.index !== undefined) {
    const lineEnd = raw.indexOf("\n", nameMatch.index);
    const insertAt = lineEnd === -1 ? raw.length : lineEnd + 1;
    return raw.slice(0, insertAt) + PERMISSIONS_BLOCK + raw.slice(insertAt);
  }

  // Strategy 3 — prepend.
  return PERMISSIONS_BLOCK + raw;
}

export const permissionsPatch: Patch = {
  id: "github-actions/permissions",
  name: "Insert missing top-level permissions block",

  detect(analysis: WorkflowAnalysis): boolean {
    return analysis.workflows.some((wf) => missingPermissions(wf.raw));
  },

  apply(_ctx: RunContext, analysis: WorkflowAnalysis): PatchResult {
    const target = analysis.workflows.find((wf) => missingPermissions(wf.raw))!;
    const patched = insertPermissions(target.raw);

    return {
      patchId: "github-actions/permissions",
      path: target.path,
      content: patched,
      sha: target.sha,
      commit: true,
      summary: `Add top-level permissions: read-all to ${target.name}`,
    };
  },
};
