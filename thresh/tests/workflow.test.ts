import { describe, expect, it } from "@jest/globals";
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
    expect(DREDGE_MCP_GATEWAY_URL).toBe("https://dredgeoriongateway.com/mcp");
    expect(THRESH_OPERATIONAL_WORKFLOW.find((step) => step.id === "mcp")?.purpose).toContain(DREDGE_MCP_GATEWAY_URL);
  });

  it("keeps the requested tool hierarchy in order", () => {
    expect(THRESH_TOOL_HIERARCHY.map((tool) => tool.name)).toEqual([
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
    expect(classifyIncident(makeAnalysis("name: CI\njobs:\n  test:\n    runs-on: ubuntu-latest"))).toBe("ci-cd");
  });

  it("requires approval for consequential security and deployment operations", () => {
    expect(requiresHumanApproval({ type: "security", severity: "medium" })).toBe(true);
    expect(requiresHumanApproval({ type: "deployment", severity: "medium" })).toBe(true);
    expect(requiresHumanApproval({ type: "ci-cd", severity: "critical" })).toBe(true);
    expect(requiresHumanApproval({ type: "ci-cd", severity: "low" })).toBe(false);
  });

  it("builds a closed-loop classify-to-report plan", () => {
    const plan = buildWorkflowPlan(makeAnalysis("deploy to production"));

    expect(plan.incidentType).toBe("deployment");
    expect(plan.requiresApproval).toBe(true);
    expect(plan.steps[0].id).toBe("thresh");
    expect(plan.steps.at(-1)?.id).toBe("report");
  });
});
