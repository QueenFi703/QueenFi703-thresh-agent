import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import type { PatchResult } from "../shared/types.js";

/** Persist only approved workflow changes, then push without force to the checked-out branch. */
export function persistLocal(workspace: string, results: PatchResult[], ref?: string): void {
  const git = (...args: string[]) => execFileSync("git", ["-C", workspace, ...args], { encoding: "utf8" }).trim();
  if (!ref || ref.startsWith("refs/") || ref === "HEAD") throw new Error("A branch name is required to persist fixes.");
  git("check-ref-format", "--branch", ref);
  if (git("symbolic-ref", "--short", "HEAD") !== ref) throw new Error("Target branch must match the checkout; detached checkouts are report-only.");
  if (git("status", "--porcelain")) throw new Error("Refusing to commit fixes in a dirty workspace.");
  const remoteHead = git("ls-remote", "--exit-code", "origin", `refs/heads/${ref}`).split(/\s+/)[0];
  if (remoteHead !== git("rev-parse", "HEAD")) throw new Error("Local branch must match origin before applying fixes.");
  for (const result of results) {
    if (!/^\.github\/workflows\/[^/]+\.ya?ml$/.test(result.path)) throw new Error("Patch must target a workflow file.");
    const target = path.join(workspace, result.path);
    if (fs.realpathSync(target) !== path.resolve(target)) throw new Error("Workflow symlinks are not supported.");
  }
  for (const result of results) fs.writeFileSync(path.join(workspace, result.path), result.content, "utf8");
  git("add", "--", ...results.map((r) => r.path));
  if (!git("diff", "--cached", "--name-only")) return;
  git("-c", "user.name=thresh[bot]", "-c", "user.email=thresh[bot]@users.noreply.github.com", "commit", "-m", "fix(thresh): apply approved workflow patches");
  git("push", "origin", `HEAD:refs/heads/${ref}`);
}
