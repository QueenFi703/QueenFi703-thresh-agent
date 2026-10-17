import { it, expect, afterEach } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { persistLocal } from "../agent/persistence.js";
import type { PatchResult } from "../shared/types.js";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "thresh-git-")); roots.push(root);
  const origin = path.join(root, "origin.git"), work = path.join(root, "work");
  const git = (...args: string[]) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--bare", origin); git("init", "-b", "main", work);
  fs.mkdirSync(path.join(work, ".github/workflows"), { recursive: true });
  const file = '.github/workflows/ci-$(touch INJECTED).yml';
  fs.writeFileSync(path.join(work, file), "name: original\n");
  git("-C", work, "add", ".");
  git("-C", work, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "initial");
  git("-C", work, "remote", "add", "origin", origin); git("-C", work, "push", "origin", "main");
  const result: PatchResult = { patchId: "test", path: file, content: "name: repaired\n", sha: "", summary: "test", commit: true };
  return { root, work, origin, file, result, git };
}
it("pushes only the intended workflow without interpreting shell syntax", () => {
  const { work, origin, file, result, git } = fixture();
  persistLocal(work, [result], "main");
  expect(git("--git-dir", origin, "show", `main:${file}`)).toBe("name: repaired");
  expect(git("-C", work, "status", "--porcelain")).toBe("");
  expect(fs.existsSync(path.join(work, "INJECTED"))).toBe(false);
});
it("rejects dirty workspaces before writing", () => {
  const { work, result, file } = fixture();
  fs.writeFileSync(path.join(work, "user-work.txt"), "keep");
  expect(() => persistLocal(work, [result], "main")).toThrow("dirty workspace");
  expect(fs.readFileSync(path.join(work, file), "utf8")).toBe("name: original\n");
});
it("rejects a mismatched target branch", () => {
  const { work, result } = fixture();
  expect(() => persistLocal(work, [result], "other")).toThrow("match the checkout");
});
it("rejects paths outside workflows", () => {
  const { work, result } = fixture();
  expect(() => persistLocal(work, [{ ...result, path: "../outside" }], "main")).toThrow("workflow file");
});
it("does not push pre-existing unpushed commits", () => {
  const { work, result, git } = fixture();
  fs.writeFileSync(path.join(work, "user-work.txt"), "keep");
  git("-C", work, "add", "user-work.txt");
  git("-C", work, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "private work");
  expect(() => persistLocal(work, [result], "main")).toThrow("match origin");
});
it("does not claim success when pushing fails", () => {
  const { work, origin, result } = fixture();
  const hook = path.join(origin, "hooks/pre-receive");
  fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  expect(() => persistLocal(work, [result], "main")).toThrow();
});
