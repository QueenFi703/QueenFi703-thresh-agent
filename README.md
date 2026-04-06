# Thresh — Self-Healing Pipelines

> **Detect and auto-fix common GitHub Actions issues via a composable patch registry.**  
> Ships as a composite GitHub Action publishable to the Marketplace.

[![CI](https://github.com/QueenFi703/QueenFi703-thresh-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/QueenFi703/QueenFi703-thresh-agent/actions/workflows/ci.yml)

---

## Quick start

```yaml
# .github/workflows/thresh.yml
name: Thresh — self-healing

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: write
  pull-requests: write

jobs:
  thresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: QueenFi703/thresh-agent@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          commit-fixes: 'true'   # auto-commits any patches applied
          pr-number: ${{ github.event.pull_request.number }}
```

That's it. On every push / PR, Thresh scans your `.github/workflows/` files,
detects known issues, and either commits the fix or leaves a review comment
depending on the `commit-fixes` setting.

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | ✅ | — | Token used to read workflows and commit fixes |
| `commit-fixes` | ❌ | `true` | Set to `false` for dry-run / report-only mode |
| `pr-number` | ❌ | — | PR number for posting a summary comment (pass `${{ github.event.pull_request.number }}`) |

---

## Built-in patches

| Patch ID | What it fixes |
|----------|---------------|
| `github-actions/linux-runner` | Replaces `windows-latest` / `windows-2019` / `windows-2022` with `ubuntu-latest` |
| `github-actions/permissions` | Inserts a top-level `permissions: read-all` block when none is present |

---

## Architecture

```
thresh-agent/
├── action.yml                   ← Marketplace entry point (composite action)
├── thresh/
│   ├── run.ts                   ← Action entry-point script (called by action.yml)
│   ├── app/server.ts            ← Probot webhook server (Railway / Vercel)
│   ├── agent/
│   │   ├── index.ts             ← Decision engine: detect → apply → commit/comment
│   │   ├── perception.ts        ← Reads workflows via GitHub API (server mode)
│   │   └── local-runner.ts      ← Reads workflows from disk (composite action mode)
│   ├── patches/
│   │   ├── index.ts             ← Patch registry
│   │   └── github-actions/
│   │       ├── linux-runner.ts  ← windows-latest → ubuntu-latest
│   │       └── permissions.ts   ← Insert missing permissions: block
│   └── shared/types.ts          ← Patch / WorkflowFile / PatchResult interfaces
└── package.json
```

### Two modes

| Mode | How it runs | When to use |
|------|-------------|-------------|
| **Composite Action** | `tsx thresh/run.ts` on the runner, reads GITHUB_WORKSPACE disk | Drop-in — no server required |
| **Probot server** | Long-running HTTP server, handles webhooks across all installed repos | Full real-time coverage |

---

## Writing a new patch

Implement the `Patch` interface and register it in `thresh/patches/index.ts`:

```typescript
import type { Patch } from "../../shared/types.js";

export const myPatch: Patch = {
  id: "my-patch",
  name: "My descriptive patch name",

  detect(analysis) {
    return analysis.workflows.some(wf => wf.raw.includes("bad-pattern"));
  },

  apply(_ctx, analysis) {
    const wf = analysis.workflows.find(wf => wf.raw.includes("bad-pattern"))!;
    return {
      patchId: "my-patch",
      path: wf.path,
      content: wf.raw.replace("bad-pattern", "fixed-pattern"),
      sha: wf.sha,
      commit: true,
      summary: `Replace bad-pattern with fixed-pattern in ${wf.name}`,
    };
  },
};
```

Then add it to the registry in `thresh/patches/index.ts`:

```typescript
import { myPatch } from "./github-actions/my-patch.js";
export const PATCHES: Patch[] = [linuxRunnerPatch, permissionsPatch, myPatch];
```

---

## Deploying the Probot server

### Railway

```bash
# Set secrets in Railway dashboard:
#   APP_ID, PRIVATE_KEY, WEBHOOK_SECRET, COMMIT_FIXES
railway up
```

The `thresh/railway.toml` is pre-configured with health-check path
`/api/github/webhooks` and restart policy.

### Vercel

```bash
vercel deploy
# Set APP_ID, PRIVATE_KEY, WEBHOOK_SECRET as environment variables
```

`thresh/vercel.json` routes all requests to `thresh/app/server.ts`.

### Required environment variables (server mode)

| Variable | Description |
|----------|-------------|
| `APP_ID` | GitHub App ID |
| `PRIVATE_KEY` | GitHub App private key (PEM, `\n`-escaped) |
| `WEBHOOK_SECRET` | GitHub App webhook secret |
| `COMMIT_FIXES` | `"true"` \| `"false"` (default: `"true"`) |
| `PORT` | HTTP port (default: `3000`) |

---

## Creating the GitHub App (server mode only)

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Fill in the fields; use `thresh/github-app-manifest.json` as reference.
3. Set **Permissions**:
   - Contents: **Write**
   - Pull requests: **Write**
   - Metadata: **Read**
   - Workflows: **Write**
4. Subscribe to events: `push`, `pull_request`, `workflow_run`.
5. Generate a private key and save it as `PRIVATE_KEY` in your deployment.

---

## Marketplace publishing

1. Ensure `action.yml` is at the **root** of a public repo ✅
2. The repo must have a **description** set in GitHub settings ✅
3. Create a release/tag (`v1.0.0`):
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. On the release page, tick **"Publish this Action to the GitHub Marketplace"**.
5. Fill in the category (e.g. *Continuous integration*) and submit.

---

## License

[MIT](LICENSE)
