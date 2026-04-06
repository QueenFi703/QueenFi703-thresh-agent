/**
 * thresh/run.ts — Composite Action entry point
 *
 * Reads Action inputs from environment variables (set by action.yml) and
 * invokes the agent in local (GITHUB_WORKSPACE) mode.
 *
 * Executed via:  tsx thresh/run.ts
 */
import fs from "node:fs";
import { run } from "./agent/index.js";
import type { RunContext } from "./shared/types.js";

const token = process.env.INPUT_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN ?? "";
const commitFixes = (process.env.INPUT_COMMIT_FIXES ?? "true").toLowerCase() !== "false";
const owner = process.env.GITHUB_REPOSITORY_OWNER ?? "";
const repoFull = process.env.GITHUB_REPOSITORY ?? "/";
const repo = repoFull.split("/")[1] ?? repoFull;
const ref = (process.env.GITHUB_REF ?? "").replace(/^refs\/heads\//, "") || undefined;

// Resolve PR number: prefer explicit input, then read from GITHUB_EVENT_PATH.
function resolvePrNumber(): number | undefined {
  const explicit = process.env.INPUT_PR_NUMBER ?? "";
  if (explicit) {
    const n = parseInt(explicit, 10);
    return isNaN(n) ? undefined : n;
  }
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (eventPath && fs.existsSync(eventPath)) {
    try {
      const event = JSON.parse(fs.readFileSync(eventPath, "utf-8")) as Record<string, unknown>;
      const pr = (event.pull_request as Record<string, unknown> | undefined)?.number;
      if (typeof pr === "number") return pr;
    } catch {
      // ignore parse errors
    }
  }
  return undefined;
}

const prNumber = resolvePrNumber();

if (!token) {
  console.error("[thresh] ERROR: github-token input is required.");
  process.exit(1);
}

if (!owner || !repo) {
  console.error("[thresh] ERROR: Could not determine repository from GITHUB_REPOSITORY.");
  process.exit(1);
}

const ctx: RunContext = {
  token,
  commitFixes,
  workspace: process.env.GITHUB_WORKSPACE,
  prNumber,
};

console.log(`[thresh] Running on ${owner}/${repo}${ref ? ` @ ${ref}` : ""}`);
console.log(`[thresh] commit-fixes: ${commitFixes}`);

run({ ctx, owner, repo, ref })
  .then((results) => {
    console.log(`[thresh] Done. ${results.length} patch(es) detected.`);
  })
  .catch((err: unknown) => {
    console.error("[thresh] Fatal error:", err);
    process.exit(1);
  });
