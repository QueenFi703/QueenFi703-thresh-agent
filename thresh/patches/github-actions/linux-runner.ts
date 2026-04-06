import type { Patch, WorkflowAnalysis, RunContext, PatchResult } from "../../shared/types.js";

/**
 * linux-runner patch
 *
 * Replaces every occurrence of `windows-latest` (and `windows-2019` / `windows-2022`)
 * in workflow files with `ubuntu-latest`, keeping the rest of the file intact.
 *
 * Motivation: many starter workflows ship with `windows-latest` but the repository
 * only needs a Linux runner. Switching cuts minute consumption by ~2× and avoids
 * PowerShell compatibility surprises in bash-oriented projects.
 */

const WINDOWS_RUNNER_RE = /\bwindows-latest\b|\bwindows-2019\b|\bwindows-2022\b/g;

export const linuxRunnerPatch: Patch = {
  id: "github-actions/linux-runner",
  name: "Replace Windows runner with ubuntu-latest",

  detect(analysis: WorkflowAnalysis): boolean {
    return analysis.workflows.some((wf) => WINDOWS_RUNNER_RE.test(wf.raw));
  },

  apply(_ctx: RunContext, analysis: WorkflowAnalysis): PatchResult {
    // Find the first affected file.  The agent loops and calls apply once per
    // matching file, so we only need to return one result here.
    const target = analysis.workflows.find((wf) => {
      WINDOWS_RUNNER_RE.lastIndex = 0;
      return WINDOWS_RUNNER_RE.test(wf.raw);
    })!;

    WINDOWS_RUNNER_RE.lastIndex = 0;
    const patched = target.raw.replace(WINDOWS_RUNNER_RE, "ubuntu-latest");

    return {
      patchId: "github-actions/linux-runner",
      path: target.path,
      content: patched,
      sha: target.sha,
      commit: true,
      summary: `Replace Windows runner with ubuntu-latest in ${target.name}`,
    };
  },
};
