/**
 * Core shared types for Thresh — the self-healing GitHub Actions pipeline system.
 */

// ─── Workflow file representation ─────────────────────────────────────────────

/** A workflow file read from the repository, either via API or from disk. */
export interface WorkflowFile {
  /** Filename (e.g. "ci.yml"), without the `.github/workflows/` prefix. */
  name: string;
  /** Full path relative to repo root (e.g. ".github/workflows/ci.yml"). */
  path: string;
  /** Raw YAML text content. */
  raw: string;
  /** Blob SHA — required when committing changes via the GitHub API. */
  sha: string;
  /**
   * Parsed YAML as a plain JS object.
   * Optional: local-runner mode skips YAML parsing since patches operate on raw text.
   */
  parsed?: Record<string, unknown>;
}

// ─── Analysis result ──────────────────────────────────────────────────────────

/** The result of the perception layer's analysis of the repository. */
export interface WorkflowAnalysis {
  workflows: WorkflowFile[];
  /** Owner of the repository (e.g. "QueenFi703"). */
  owner: string;
  /** Repository name (e.g. "thresh-agent"). */
  repo: string;
}

// ─── Patch result ─────────────────────────────────────────────────────────────

/** The output of applying a single patch. */
export interface PatchResult {
  /** Patch id that produced this result. */
  patchId: string;
  /** Repo-relative path of the file that was (or would be) modified. */
  path: string;
  /** Updated file content to write. */
  content: string;
  /** Blob SHA of the original file — needed to create a commit via the API. */
  sha: string;
  /**
   * When true, Thresh will commit this fix automatically.
   * When false, Thresh only leaves a review comment describing the issue.
   */
  commit: boolean;
  /** Human-readable summary of what was changed (used in commit message / PR comment). */
  summary: string;
}

// ─── Run context ──────────────────────────────────────────────────────────────

/** Runtime context passed through the agent. */
export interface RunContext {
  /** GitHub token (PAT or GITHUB_TOKEN) for API calls. */
  token: string;
  /** Whether to auto-commit fixes — controlled by the `commit-fixes` Action input. */
  commitFixes: boolean;
  /**
   * Absolute path to GITHUB_WORKSPACE on the runner.
   * Populated in local (composite Action) mode; undefined in server / webhook mode.
   */
  workspace?: string;
  /** Optional: pull-request number that triggered the run. */
  prNumber?: number;
}

// ─── Patch interface ──────────────────────────────────────────────────────────

/** Every patch implements this interface and self-registers in patches/index.ts. */
export interface Patch {
  /** Unique, stable identifier (e.g. "github-actions/linux-runner"). */
  id: string;
  /** Short human-readable name shown in commit messages and comments. */
  name: string;
  /**
   * Returns true if this patch is applicable to the given analysis.
   * Called before `apply` — if false, `apply` is never invoked.
   */
  detect(analysis: WorkflowAnalysis): boolean;
  /**
   * Produces a PatchResult describing what change to make.
   * Only called when `detect` returned true.
   */
  apply(ctx: RunContext, analysis: WorkflowAnalysis): PatchResult;
}
