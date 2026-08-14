import type { WorkflowAnalysis } from "../shared/types.js";

export const DREDGE_MCP_GATEWAY_URL = "https://dredgeoriongateway.com/mcp" as const;

export type ThreshIncidentType = "security" | "ci-cd" | "deployment" | "unknown";
export type ThreshSeverity = "low" | "medium" | "high" | "critical";

export interface ThreshIncident {
  type?: ThreshIncidentType;
  severity?: ThreshSeverity;
  description?: string;
}

export interface ThreshToolDefinition {
  name: string;
  purpose: string;
}

export interface ThreshWorkflowStep {
  id: string;
  label: string;
  purpose: string;
  next: string[];
}

export interface ThreshWorkflowPlan {
  incidentType: ThreshIncidentType;
  severity: ThreshSeverity;
  requiresApproval: boolean;
  mcpGatewayUrl: typeof DREDGE_MCP_GATEWAY_URL;
  toolHierarchy: ThreshToolDefinition[];
  steps: ThreshWorkflowStep[];
}

export const THRESH_TOOL_HIERARCHY: ThreshToolDefinition[] = [
  { name: "File search", purpose: "Understand DREDGE repositories and documentation before acting." },
  { name: "MCP", purpose: "Connect Thresh to DREDGE operational tools through a controlled gateway." },
  { name: "GitHub", purpose: "Inspect repositories, issues, Actions runs, and pull requests." },
  { name: "Guardrails", purpose: "Prevent dangerous autonomous actions." },
  { name: "User approval", purpose: "Gate production or destructive operations." },
  { name: "If/else", purpose: "Route incidents based on severity and type." },
  { name: "While", purpose: "Retry and verify controlled operations." },
];

export const THRESH_OPERATIONAL_WORKFLOW: ThreshWorkflowStep[] = [
  { id: "thresh", label: "THRESH DREDGE Agent", purpose: "Reasoning and decision layer for closed-loop operations.", next: ["classify"] },
  { id: "classify", label: "CLASSIFY", purpose: "Determine what happened and route by incident family.", next: ["security", "ci-cd", "deployment"] },
  { id: "security", label: "SECURITY", purpose: "Handle vulnerability, secret, permissions, and suspicious activity signals.", next: ["mcp"] },
  { id: "ci-cd", label: "CI/CD", purpose: "Handle build, test, workflow, runner, and release automation failures.", next: ["mcp"] },
  { id: "deployment", label: "DEPLOYMENT", purpose: "Handle rollout, environment, health-check, and production availability issues.", next: ["mcp"] },
  { id: "mcp", label: "MCP DREDGE Gateway", purpose: `Bridge through ${DREDGE_MCP_GATEWAY_URL} instead of granting direct access to every operational system.`, next: ["analyze"] },
  { id: "analyze", label: "ANALYZE", purpose: "Identify root cause using repository context and operational evidence.", next: ["safe-to-repair"] },
  { id: "safe-to-repair", label: "IF / ELSE", purpose: "Decide whether the repair is low-risk enough to execute automatically.", next: ["execute", "approval"] },
  { id: "execute", label: "EXECUTE", purpose: "Apply safe, bounded repairs through approved tools.", next: ["verify"] },
  { id: "approval", label: "APPROVAL", purpose: "Request human approval before production, destructive, or high-severity operations.", next: ["verify"] },
  { id: "verify", label: "VERIFY", purpose: "Retry and verify controlled operations until they pass or hit guardrail limits.", next: ["report"] },
  { id: "report", label: "REPORT", purpose: "Summarize classification, action, verification, and remaining risk.", next: [] },
];

export function classifyIncident(analysis: WorkflowAnalysis): ThreshIncidentType {
  const text = analysis.workflows.map((workflow) => workflow.raw).join("\n").toLowerCase();

  if (/secret|permission|security|vulnerab|codeql|dependabot|oidc/.test(text)) return "security";
  if (/deploy|release|production|environment|vercel|railway|kubernetes|docker/.test(text)) return "deployment";
  if (/test|build|ci|workflow|runner|actions\/checkout|npm|pnpm|yarn/.test(text)) return "ci-cd";

  return "unknown";
}

export function requiresHumanApproval(incident: ThreshIncident): boolean {
  return (
    incident.severity === "high" ||
    incident.severity === "critical" ||
    incident.type === "security" ||
    incident.type === "deployment"
  );
}

export function buildWorkflowPlan(
  analysis: WorkflowAnalysis,
  incident: ThreshIncident = {}
): ThreshWorkflowPlan {
  const incidentType = incident.type ?? classifyIncident(analysis);
  const severity = incident.severity ?? "medium";

  return {
    incidentType,
    severity,
    requiresApproval: requiresHumanApproval({ ...incident, type: incidentType, severity }),
    mcpGatewayUrl: DREDGE_MCP_GATEWAY_URL,
    toolHierarchy: THRESH_TOOL_HIERARCHY,
    steps: THRESH_OPERATIONAL_WORKFLOW,
  };
}
