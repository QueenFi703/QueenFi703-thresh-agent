import { createNodeMiddleware, createProbot, type ApplicationFunction } from "probot";
import http from "node:http";
import { run } from "../agent/index.js";
import type { RunContext } from "../shared/types.js";

/**
 * app/server.ts — Probot webhook server
 *
 * Handles three GitHub webhook events:
 *   - `push`              — run on every push to the default branch
 *   - `pull_request`      — run when a PR is opened or synchronised
 *   - `workflow_run`      — run after a workflow completes (catch failures fast)
 *
 * Deploy on Railway or Vercel (see railway.toml / vercel.json at repo root).
 *
 * Required environment variables:
 *   APP_ID                GitHub App ID
 *   PRIVATE_KEY           GitHub App private key (PEM, \n-escaped)
 *   WEBHOOK_SECRET        GitHub App webhook secret
 *   COMMIT_FIXES          "true" | "false"  (default: "true")
 */

const threshApp: ApplicationFunction = (robot) => {
  robot.on("push", async (context) => {
    const { owner, repo } = context.repo();
    const ref = context.payload.ref.replace(/^refs\/heads\//, "");
    const defaultBranch = context.payload.repository.default_branch;

    // Only heal the default branch on push.
    if (ref !== defaultBranch) return;

    const ctx: RunContext = {
      token: await context.octokit.auth({ type: "installation" }).then(
        (auth) => (auth as { token: string }).token
      ),
      commitFixes: process.env.COMMIT_FIXES !== "false",
    };

    await run({ ctx, owner, repo, ref });
  });

  robot.on(
    ["pull_request.opened", "pull_request.synchronize"],
    async (context) => {
      const { owner, repo } = context.repo();
      const ref = context.payload.pull_request.head.ref;
      const prNumber = context.payload.pull_request.number;

      const ctx: RunContext = {
        token: await context.octokit.auth({ type: "installation" }).then(
          (auth) => (auth as { token: string }).token
        ),
        commitFixes: process.env.COMMIT_FIXES !== "false",
        prNumber,
      };

      await run({ ctx, owner, repo, ref });
    }
  );

  robot.on("workflow_run.completed", async (context) => {
    const { owner, repo } = context.repo();
    const ref = context.payload.workflow_run.head_branch ?? undefined;

    const ctx: RunContext = {
      token: await context.octokit.auth({ type: "installation" }).then(
        (auth) => (auth as { token: string }).token
      ),
      commitFixes: process.env.COMMIT_FIXES !== "false",
    };

    await run({ ctx, owner, repo, ref });
  });
};

// ─── HTTP server ──────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const probot = createProbot();
const middleware = createNodeMiddleware(threshApp, { probot });

http.createServer(middleware).listen(PORT, () => {
  console.log(`[thresh/server] Listening on http://0.0.0.0:${PORT}`);
});
