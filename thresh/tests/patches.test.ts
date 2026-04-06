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
    expect(linuxRunnerPatch.detect(makeAnalysis(withWindows))).toBe(true);
  });

  it("detects windows-2019", () => {
    expect(linuxRunnerPatch.detect(makeAnalysis(withWindows2019))).toBe(true);
  });

  it("does not detect ubuntu-latest", () => {
    expect(linuxRunnerPatch.detect(makeAnalysis(withLinux))).toBe(false);
  });

  it("replaces windows-latest with ubuntu-latest", () => {
    const result = linuxRunnerPatch.apply(CTX, makeAnalysis(withWindows));
    expect(result.content).toContain("ubuntu-latest");
    expect(result.content).not.toContain("windows-latest");
  });

  it("replaces windows-2019 with ubuntu-latest", () => {
    const result = linuxRunnerPatch.apply(CTX, makeAnalysis(withWindows2019));
    expect(result.content).toContain("ubuntu-latest");
    expect(result.content).not.toContain("windows-2019");
  });

  it("sets patchId correctly", () => {
    const result = linuxRunnerPatch.apply(CTX, makeAnalysis(withWindows));
    expect(result.patchId).toBe("github-actions/linux-runner");
  });

  it("sets commit: true", () => {
    const result = linuxRunnerPatch.apply(CTX, makeAnalysis(withWindows));
    expect(result.commit).toBe(true);
  });
});

// ─── permissions patch ────────────────────────────────────────────────────────

describe("permissions patch", () => {
  const withoutPerms = `name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n`;
  const withPerms = `name: CI\npermissions: read-all\non: push\n`;
  const withSeparator = `---\nname: CI\non: push\n`;

  it("detects missing permissions", () => {
    expect(permissionsPatch.detect(makeAnalysis(withoutPerms))).toBe(true);
  });

  it("does not detect when permissions already present", () => {
    expect(permissionsPatch.detect(makeAnalysis(withPerms))).toBe(false);
  });

  it("inserts after name: line", () => {
    const result = permissionsPatch.apply(CTX, makeAnalysis(withoutPerms));
    const lines = result.content.split("\n");
    const nameIdx = lines.findIndex((l: string) => l.startsWith("name:"));
    expect(lines[nameIdx + 1]).toMatch(/^permissions/);
  });

  it("inserts after --- separator when present", () => {
    const result = permissionsPatch.apply(CTX, makeAnalysis(withSeparator));
    const lines = result.content.split("\n");
    const sepIdx = lines.findIndex((l: string) => l.trim() === "---");
    expect(lines[sepIdx + 1]).toMatch(/^permissions/);
  });

  it("does not duplicate permissions block", () => {
    const result = permissionsPatch.apply(CTX, makeAnalysis(withoutPerms));
    const matches = (result.content.match(/^permissions/gm) ?? []).length;
    expect(matches).toBe(1);
  });

  it("sets patchId correctly", () => {
    const result = permissionsPatch.apply(CTX, makeAnalysis(withoutPerms));
    expect(result.patchId).toBe("github-actions/permissions");
  });
});
