# P2-UI-ROC-002 Unblock History Repair

## Scope

- Task: `P2-UI-ROC-002-UNBLOCK-HISTORY-REPAIR`
- Parent: `P2-UI-ROC-002`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-26T20:06:59Z`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-p2-ui-roc-002-unblock-history-repair`
- Assigned helper branch:
  `codex2/p2-ui-roc-002-unblock-history-repair`

## Diagnosis

`P2-UI-ROC-002` is blocked by branch/commit history contamination, not by a
missing ROC implementation.

1. The pushed parent branch is `origin/codex2/p2-ui-roc-002 @ 8cb2b07d0`, but
   its tip commit is an empty closeout commit. `git rev-parse 8cb2b07d0^{tree}
   2a0b9ff0e^{tree}` returns the same tree id
   `7f68addd5b55569dde0a1f0e3c48079f34574ce0`, so waiting for `8cb2b07d0`
   itself to "reach dev" is the wrong integration predicate.
2. The actual ROC delivery content lives in four earlier commits on the parent
   rail:
   - `f031ce415` `wip(P2-UI-ROC-002): implement roc response screens`
   - `b6550d6a7` `wip(P2-UI-ROC-002): anchor evidence table brief alignment`
   - `5b8bff5f1` `wip(P2-UI-ROC-002): anchor roc screen requirements handoff`
   - `2a0b9ff0e` `P2-UI-ROC-002: honor ROC design authority`
3. The parent branch is also stale relative to the current integration trunk.
   `git merge-base origin/dev origin/codex2/p2-ui-roc-002` returns
   `17650b25e`, while current `origin/dev` is `5ea613786`. The parent is five
   commits ahead of the merge-base but also two integration commits behind the
   live trunk.
4. Comparing `origin/dev..origin/codex2/p2-ui-roc-002` mixes the intended ROC
   screen files with older trunk state. The apparent deletions in API/contracts
   files are not parent-task edits; they are newer `origin/dev` changes that the
   stale parent branch simply does not contain yet.
5. A local replay test from `origin/dev` proved the content can be reapplied
   non-destructively: cherry-picking `f031ce415`, `b6550d6a7`, `5b8bff5f1`, and
   `2a0b9ff0e` onto a fresh branch from `origin/dev` completed without
   conflicts.
6. That replay test produced the expected ROC diff against `origin/dev`
   (13 ROC-only files, 915 insertions / 4 deletions) while preserving newer
   trunk changes in eight unrelated files. This confirms the safe repair path is
   a fresh replay branch from current `origin/dev`, not force-pushing or trying
   to preserve the old empty closeout hash.

## Evidence

### Parent rail

- `origin/dev @ 5ea6137860a50788e9c0fea20181de58c596483b`
- `origin/codex2/p2-ui-roc-002 @ 8cb2b07d0da5fbcb960a9c9b9fe4068e738153e2`
- `git rev-list --left-right --count origin/dev...origin/codex2/p2-ui-roc-002`
  returns `2 5`
- `git merge-base origin/dev origin/codex2/p2-ui-roc-002`
  returns `17650b25e144eb44a3d0ac56aa0344feafe39a9b`
- `git log --oneline --left-right origin/dev...origin/codex2/p2-ui-roc-002`
  shows two newer trunk commits on the left and these five parent commits on the
  right:
  - `f031ce415` implementation WIP
  - `b6550d6a7` evidence-table alignment WIP
  - `5b8bff5f1` screen-requirements handoff WIP
  - `2a0b9ff0e` design-authority closeout
  - `8cb2b07d0` finalize approved ROC response screens

### Empty closeout proof

- `git diff --stat 8cb2b07d0^ 8cb2b07d0` is empty
- `git rev-list --parents -n 1 8cb2b07d0`
  shows parent `2a0b9ff0e`
- `git rev-parse 8cb2b07d0^{tree} 2a0b9ff0e^{tree}`
  returns the same tree id
  `7f68addd5b55569dde0a1f0e3c48079f34574ce0`

### Stale-trunk proof

- `git diff --name-status origin/dev..origin/codex2/p2-ui-roc-002` lists these
  non-parent files because the branch is behind `origin/dev`, not because the
  parent deleted them:
  - `apps/api/src/modules/regulatory-reporting/regulatory-report-jobs.service.ts`
  - `apps/api/src/modules/regulatory-reporting/regulatory-reporting.controller.ts`
  - `apps/api/src/modules/regulatory-reporting/regulatory-reporting.module.ts`
  - `apps/api/tests/integration/e2e-p2-010-regulatory-reporting.test.ts`
  - `docs/05-ui/platform-admin-sandbox-compliance-screen-requirements-20260626.md`
  - `packages/api-client/src/index.ts`
  - `packages/contracts/src/index.ts`
  - `support/unblock/P2-UI-CMP-001/P2-UI-CMP-001-UNBLOCK-PLANNING-DECISION.md`

### Replay proof

- A temporary local branch from `origin/dev` accepted this sequence without
  conflicts:

```bash
git switch -c tmp/p2-ui-roc-002-replay-check origin/dev
git cherry-pick f031ce415e439196fb1b2291bd9daf9d5cb2830d
git cherry-pick b6550d6a751401314a29428053e12350102b5cf9
git cherry-pick 5b8bff5f17fff6b6c9e5758ef56239599041f6ae
git cherry-pick 2a0b9ff0eb900accfc3440032ad33fbac314f679
```

- `git diff --stat origin/dev..HEAD` on that replay branch shows the intended
  ROC diff only:
  - 13 files changed
  - 915 insertions
  - 4 deletions
- `git diff --name-status <replay-head> 8cb2b07d0` differs only in the eight
  newer trunk files listed above, proving the replay preserves current `dev`
  while carrying the ROC screen work forward.
- `git diff --check origin/dev..HEAD` on the replay branch reports trailing
  whitespace in
  `docs/05-ui/roc-console-takeover-alerts-incidents-evidence-reports-screen-requirements-20260626.md`
  lines 3-7. That hygiene cleanup should be included in the replay closeout.

## Exact Contamination

The exact contamination is a three-part history mismatch:

1. The commit hash referenced by parent machine truth, `8cb2b07d0`, is an empty
   metadata closeout commit, so it is not the commit that actually carries the
   delivered ROC UI tree.
2. The real implementation is spread across four earlier commits on the parent
   branch, which means the current "wait until 8cb2b07d0 reaches origin/dev"
   instruction cannot ever be the right non-destructive merge criterion.
3. The parent branch tip is based on stale trunk state (`merge-base
   17650b25e`, current `origin/dev 5ea613786`), so the safe rail is to replay
   the four contentful commits onto fresh `origin/dev`, not to rewrite or
   force-push the existing shared branch.

## Non-Destructive Repair Path

Do not force-push, amend, or rename any shared branch.

1. Freeze `origin/codex2/p2-ui-roc-002 @ 8cb2b07d0` as audit evidence of the
   original closeout rail.
2. Create a fresh replay branch from current `origin/dev` and cherry-pick the
   four contentful parent commits:

```bash
git fetch origin
git switch -c codex2/p2-ui-roc-002-replay origin/dev
git cherry-pick f031ce415e439196fb1b2291bd9daf9d5cb2830d
git cherry-pick b6550d6a751401314a29428053e12350102b5cf9
git cherry-pick 5b8bff5f17fff6b6c9e5758ef56239599041f6ae
git cherry-pick 2a0b9ff0eb900accfc3440032ad33fbac314f679
```

3. Add one normal follow-up cleanup commit on the replay branch to remove the
   trailing whitespace in
   `docs/05-ui/roc-console-takeover-alerts-incidents-evidence-reports-screen-requirements-20260626.md`.
4. Re-run the parent verification commands on the replay branch:

```bash
CI=true pnpm install --frozen-lockfile
CI=true pnpm --filter @drts/roc-console-web typecheck
CI=true pnpm --filter @drts/roc-console-web build
```

5. Push the replay branch and open a new PR from `codex2/p2-ui-roc-002-replay`
   to `dev`. Leave `origin/codex2/p2-ui-roc-002` untouched as history evidence.
6. Update parent machine truth to point at the replay branch / PR, not at empty
   commit `8cb2b07d0`.
7. Resume the normal parent lifecycle (`handoff` -> `review` -> merge to `dev`)
   on the replay branch.

## Concrete Parent Next Step

`P2-UI-ROC-002` should stop waiting for `8cb2b07d0` itself to appear on
`origin/dev`.

Concrete next step:

1. Create `codex2/p2-ui-roc-002-replay` from current `origin/dev`.
2. Cherry-pick `f031ce415`, `b6550d6a7`, `5b8bff5f1`, and `2a0b9ff0e`.
3. Remove the trailing whitespace in the ROC screen-requirements doc.
4. Re-run ROC web typecheck and build.
5. Push the replay branch, open a PR to `dev`, and hand off the parent against
   that replay rail.

## Why This Is Safe

- No shared ref is rewritten.
- No force-push is required.
- The original parent branch remains available as audit evidence.
- The replay path has already been proven locally to cherry-pick cleanly from
  current `origin/dev`.
- The repaired rail preserves newer trunk changes instead of regressing them.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`
- Read `docs/ops/branch-strategy.md`
- Read `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine truth:
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-UI-ROC-002-UNBLOCK-HISTORY-REPAIR`
  - `AI_NAME=Codex2 scripts/ai-status.sh show P2-UI-ROC-002`
- Inspected branch/worktree state:
  - `git branch --show-current`
  - `git status --short --branch`
  - `git fetch origin --prune`
  - `git branch -vv`
  - `git worktree list --porcelain`
  - `git log --oneline --decorate --graph --boundary --max-count=60 --all`
  - `git rev-list --left-right --count origin/dev...origin/codex2/p2-ui-roc-002`
  - `git merge-base origin/dev origin/codex2/p2-ui-roc-002`
  - `git diff --stat origin/dev...origin/codex2/p2-ui-roc-002`
  - `git diff --name-status origin/dev..origin/codex2/p2-ui-roc-002`
  - `git cherry -v origin/dev origin/codex2/p2-ui-roc-002`
- Inspected commit lineage:
  - `git show --stat --summary --format=fuller 8cb2b07d0`
  - `git show --stat --summary --format=fuller 2a0b9ff0e`
  - `git show --stat --summary --format=fuller 5b8bff5f1 b6550d6a7 f031ce415`
  - `git diff --stat 8cb2b07d0^ 8cb2b07d0`
  - `git rev-list --parents -n 1 8cb2b07d0`
  - `git rev-parse 8cb2b07d0^{tree} 2a0b9ff0e^{tree}`
- Performed replay proof:
  - created a temporary local branch from `origin/dev`
  - cherry-picked `f031ce415`, `b6550d6a7`, `5b8bff5f1`, `2a0b9ff0e`
  - `git diff --stat origin/dev..HEAD`
  - `git diff --check origin/dev..HEAD`

No package tests were run in this helper task. This repair is branch-history and
machine-truth triage only.

## Owner Closeout Addendum

- `review_approved` owner closeout remains branch-scoped only. This helper task
  does not merge anything to `origin/dev` and does not claim dev deployment.
- The canonical delivery artifact is this support note on
  `codex2/p2-ui-roc-002-unblock-history-repair`, pushed through a normal
  non-force branch update.
- Parent unblock remains unchanged: replay the four contentful ROC commits onto
  fresh `origin/dev`, clean the trailing whitespace noted above, then push a new
  replay branch/PR for `P2-UI-ROC-002`.
