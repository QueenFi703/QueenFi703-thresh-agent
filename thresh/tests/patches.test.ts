import { describe, it, afterEach, before as beforeAll, after as afterAll, mock } from "node:test";
import assert from "node:assert/strict";
import { linuxRunnerPatch } from "../patches/github-actions/linux-runner.js";
import { permissionsPatch } from "../patches/github-actions/permissions.js";
import type { WorkflowAnalysis, RunContext } from "../shared/types.js";

const CTX: RunContext = { token: "tok", commitFixes: false };

function makeAnalysis(raw: string): WorkflowAnalysis {
  return {
    owner: "test-owner",
    repo: "test-repo",
    workflows: [{ name: "ci.yml", path: ".github/workflows/ci.yml", raw, sha: "abc" }],
  };
}

// ─── linux-runner patch ───────────────────────────────────────────────────────

describe("linux-runner patch", () => {
  const withWindows = `name: CI\nruns-on: windows-latest\n`;
  const withWindows2019 = `name: CI\nruns-on: windows-2019\n`;
  const withLinux = `name: CI\nruns-on: ubuntu-latest\n`;

  it("detects windows-latest", () => {
    assert.strictEqual(linuxRunnerPatch.detect(makeAnalysis(withWindows)), true);
  });

  it("detects windows-2019", () => {
    assert.strictEqual(linuxRunnerPatch.detect(makeAnalysis(withWindows2019)), true);
  });

  it("does not detect ubuntu-latest", () => {
    assert.strictEqual(linuxRunnerPatch.detect(makeAnalysis(withLinux)), false);
  });

  it("replaces windows-latest with ubuntu-latest", () => {
    const result = linuxRunnerPatch.apply(CTX, makeAnalysis(withWindows));
    assert.ok((result.content)?.includes("ubuntu-latest"));
    assert.ok(!(result.content)?.includes("windows-latest"));
  });

  it("replaces windows-2019 with ubuntu-latest", () => {
    const result = linuxRunnerPatch.apply(CTX, makeAnalysis(withWindows2019));
    assert.ok((result.content)?.includes("ubuntu-latest"));
    assert.ok(!(result.content)?.includes("windows-2019"));
  });

  it("sets patchId correctly", () => {
    const result = linuxRunnerPatch.apply(CTX, makeAnalysis(withWindows));
    assert.strictEqual(result.patchId, "github-actions/linux-runner");
  });

  it("requires manual review before changing operating systems", () => {
    const result = linuxRunnerPatch.apply(CTX, makeAnalysis(withWindows));
    assert.strictEqual(result.commit, false);
  });
});

// ─── permissions patch ────────────────────────────────────────────────────────

describe("permissions patch", () => {
  const withoutPerms = `name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n`;
  const withPerms = `name: CI\npermissions: read-all\non: push\n`;
  const withSeparator = `---\nname: CI\non: push\n`;

  it("detects missing permissions", () => {
    assert.strictEqual(permissionsPatch.detect(makeAnalysis(withoutPerms)), true);
  });

  it("does not detect when permissions already present", () => {
    assert.strictEqual(permissionsPatch.detect(makeAnalysis(withPerms)), false);
  });

  it("inserts after name: line", () => {
    const result = permissionsPatch.apply(CTX, makeAnalysis(withoutPerms));
    const lines = result.content.split("\n");
    const nameIdx = lines.findIndex((l: string) => l.startsWith("name:"));
    assert.match(lines[nameIdx + 1], /^permissions/);
  });

  it("inserts after --- separator when present", () => {
    const result = permissionsPatch.apply(CTX, makeAnalysis(withSeparator));
    const lines = result.content.split("\n");
    const sepIdx = lines.findIndex((l: string) => l.trim() === "---");
    assert.match(lines[sepIdx + 1], /^permissions/);
  });

  it("does not duplicate permissions block", () => {
    const result = permissionsPatch.apply(CTX, makeAnalysis(withoutPerms));
    const matches = (result.content.match(/^permissions/gm) ?? []).length;
    assert.strictEqual(matches, 1);
  });

  it("sets patchId correctly", () => {
    const result = permissionsPatch.apply(CTX, makeAnalysis(withoutPerms));
    assert.strictEqual(result.patchId, "github-actions/permissions");
  });
});

describe("permissions insertion preserves YAML line boundaries", () => {
  for (const raw of ["name: CI", "---"]) {
  it(`handles a final anchor without a newline: ${raw}`, () => {
    const result = permissionsPatch.apply(CTX, makeAnalysis(raw));
    assert.strictEqual(result.content, `${raw}\npermissions: read-all\n`);
  });
  }
});
