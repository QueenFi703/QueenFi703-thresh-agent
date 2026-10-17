import { describe, it, afterEach, before as beforeAll, after as afterAll, mock } from "node:test";
import assert from "node:assert/strict";
import {
  DREDGE_MCP_GATEWAY_URL,
  THRESH_OPERATIONAL_WORKFLOW,
  THRESH_TOOL_HIERARCHY,
  buildWorkflowPlan,
  classifyIncident,
  requiresHumanApproval,
} from "../agent/workflow.js";
import type { WorkflowAnalysis } from "../shared/types.js";

function makeAnalysis(raw: string): WorkflowAnalysis {
  return {
    owner: "QueenFi703",
    repo: "thresh-agent",
    workflows: [{ name: "ci.yml", path: ".github/workflows/ci.yml", raw, sha: "abc" }],
  };
}

describe("Thresh operational workflow", () => {
  it("defines the DREDGE MCP gateway as the capability boundary", () => {
    assert.strictEqual(DREDGE_MCP_GATEWAY_URL, "https://dredgeoriongateway.com/mcp");
    assert.ok((THRESH_OPERATIONAL_WORKFLOW.find((step) => step.id === "mcp")?.purpose)?.includes(DREDGE_MCP_GATEWAY_URL));
  });

  it("keeps the requested tool hierarchy in order", () => {
    assert.deepStrictEqual(THRESH_TOOL_HIERARCHY.map((tool) => tool.name), [
      "File search",
      "MCP",
      "GitHub",
      "Guardrails",
      "User approval",
      "If/else",
      "While",
    ]);
  });

  it("classifies CI/CD incidents from workflow content", () => {
    assert.strictEqual(classifyIncident(makeAnalysis("name: CI\njobs:\n  test:\n    runs-on: ubuntu-latest")), "ci-cd");
  });

  it("requires approval for consequential security and deployment operations", () => {
    assert.strictEqual(requiresHumanApproval({ type: "security", severity: "medium" }), true);
    assert.strictEqual(requiresHumanApproval({ type: "deployment", severity: "medium" }), true);
    assert.strictEqual(requiresHumanApproval({ type: "ci-cd", severity: "critical" }), true);
    assert.strictEqual(requiresHumanApproval({ type: "ci-cd", severity: "low" }), false);
  });

  it("builds a closed-loop classify-to-report plan", () => {
    const plan = buildWorkflowPlan(makeAnalysis("deploy to production"));

    assert.strictEqual(plan.incidentType, "deployment");
    assert.strictEqual(plan.requiresApproval, true);
    assert.strictEqual(plan.steps[0].id, "thresh");
    assert.strictEqual(plan.steps.at(-1)?.id, "report");
  });
});
