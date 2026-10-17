import { describe, it, expect, afterEach } from "@jest/globals";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run, formatReport } from "../agent/index.js";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function workspace(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "thresh-agent-")); roots.push(root);
  fs.mkdirSync(path.join(root, ".github/workflows"), { recursive: true });
  for (const [name, raw] of Object.entries(files)) fs.writeFileSync(path.join(root, ".github/workflows", name), raw);
  return root;
}
it("blocks all writes when the workflow requires approval", async () => {
  const raw = "name: Deploy\non: push\njobs:\n  deploy:\n    runs-on: windows-latest\n";
  const root = workspace({ "deploy.yml": raw });
  const results = await run({ owner: "owner", repo: "repo", ref: "main", ctx: { token: "synthetic", commitFixes: true, workspace: root } });
  expect(results.length).toBeGreaterThan(0);
  expect(results.every((r) => r.outcome === "approval-required")).toBe(true);
  expect(fs.readFileSync(path.join(root, ".github/workflows/deploy.yml"), "utf8")).toBe(raw);
});
it("reports dry-run proposals accurately and inspects every matching file", async () => {
  const raw = "name: CI\non: push\njobs:\n  test:\n    runs-on: windows-latest\n";
  const root = workspace({ "one.yml": raw, "two.yml": raw });
  const results = await run({ owner: "owner", repo: "repo", ctx: { token: "synthetic", commitFixes: false, workspace: root } });
  expect(results.filter((r) => r.patchId === "github-actions/linux-runner")).toHaveLength(2);
  expect(results.every((r) => r.outcome !== "committed")).toBe(true);
  expect(fs.readFileSync(path.join(root, ".github/workflows/one.yml"), "utf8")).toBe(raw);
});

it("reports actual persistence rather than requested commit intent", () => {
  const proposal = { patchId: "test", path: ".github/workflows/ci.yml", content: "", sha: "", commit: true, summary: "Repair", outcome: "proposed" as const };
  expect(formatReport([proposal])).toContain("proposed; no changes saved");
  expect(formatReport([proposal])).not.toContain("✅ committed");
  expect(formatReport([{ ...proposal, outcome: "committed" }])).toContain("✅ committed");
});
