# E2E-FLEET-014 Unblock History Repair

## Scope

- Task: `E2E-FLEET-014-UNBLOCK-HISTORY-REPAIR`
- Parent: `E2E-FLEET-014`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-06-05T07:30:20Z`

## Diagnosis

The parent is not blocked by missing task commits. It is blocked by an
upstream staging credential failure, while this helper dispatch was created on
the wrong branch history and therefore could not safely serve as the parent's
resume rail.

1. The actual parent owner branch already exists locally and on origin as
   `codex2/e2e-fleet-014 @ b47f4874d5a6876557215d22adf9aefc7cf768c6` with four
   task commits on top of `origin/dev`.
2. The assigned helper branch was created from the then-current
   `origin/dev @ 1a5f8b86f48e9c5cacedd3cf9cbe15964216ede4` and now only adds the
   helper audit commit
   `c6b71b13b17349150149830b63626bb3800dbfa2`; it is still not descended from
   the pushed parent tip.
3. The helper worktree therefore omits every parent task commit and carries
   only the contamination report on top of its old trunk snapshot:
   `e4da426b`, `a6012dda`, `2607ee4b`, and `b47f4874`.
4. `git worktree list --porcelain` shows separate worktrees for the parent
   branch and this helper branch, but the helper branch points at the wrong
   commit, so reopening work from this worktree would silently drop the parent
   task history.
5. Canonical machine truth already records the real blocker on the parent:
   Deploy - Staging run `27001535952` failed at
   `Build & push images -> Authenticate to GCP` because
   `google-github-actions/auth` returned `invalid_target` for the configured
   staging WIF provider. History ambiguity needs to be isolated so the parent
   can return to that actual upstream blocker.

## Evidence

### Branch and worktree state

- current `origin/dev @ 63d2ba58d61e87b731ec9645f4f59785f48d5358`
- helper branch merge-base with `origin/dev` remains
  `1a5f8b86f48e9c5cacedd3cf9cbe15964216ede4`, proving the helper rail was
  created from an older trunk snapshot
- local + remote parent branch
  `codex2/e2e-fleet-014 @ b47f4874d5a6876557215d22adf9aefc7cf768c6`
- local helper branch
  `codex2/e2e-fleet-014-unblock-history-repair @ c6b71b13b17349150149830b63626bb3800dbfa2`
  with upstream `origin/codex2/e2e-fleet-014-unblock-history-repair`
- local planning helper branch
  `codex2/e2e-fleet-014-unblock-planning-decision @ ec759b8e740e5c9883ce2db2021e5cc8446f6075`
- `git rev-list --left-right --count origin/dev...codex2/e2e-fleet-014`
  returns `1 4`, confirming the parent branch still contains the same four task
  commits beyond the old shared base while current trunk has advanced by one
  unrelated publish commit.
- `git rev-list --left-right --count origin/dev...codex2/e2e-fleet-014-unblock-history-repair`
  returns `1 1`, confirming the helper branch is just one audit commit on top
  of the old trunk snapshot and still excludes the four parent task commits.
- `git merge-base origin/dev codex2/e2e-fleet-014`
  returns `1a5f8b86f48e9c5cacedd3cf9cbe15964216ede4`, proving both the parent and
  helper rails still branch from the same older publish snapshot rather than
  from the current `origin/dev`.
- `git rev-parse codex2/e2e-fleet-014-unblock-history-repair`
  returns `c6b71b13...`, proving the helper branch now records the audit but is
  still anchored to the wrong history instead of the parent task branch.
- `git worktree list --porcelain | grep -nA2 -B1 'codex2/e2e-fleet-014'`
  shows:
  - `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-e2e-fleet-014`
    on `b47f4874`
  - `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-e2e-fleet-014-unblock-history-repair`
    on `c6b71b13`

### Parent provenance

- `git log --oneline codex2/e2e-fleet-014 --not origin/dev` returns the four
  parent commits:
  - `e4da426b` `wip(E2E-FLEET-014): anchor e2e shell`
  - `a6012dda` `wip(E2E-FLEET-014): harden e2e curl failure path`
  - `2607ee4b` `wip(E2E-FLEET-014): anchor staging e2e workflow`
  - `b47f4874` `wip(E2E-FLEET-014): anchor deploy-staging e2e hook`
- `git show --stat --summary b47f4874` confirms the pushed parent tip moved the
  E2E trigger into `.github/workflows/deploy-staging.yml` and deleted the
  separate `.github/workflows/e2e-staging.yml`.

### PR visibility

- `gh pr list --head codex2:codex2/e2e-fleet-014 --state all ...` returns `[]`
- `gh pr list --head codex2:codex2/e2e-fleet-014-unblock-history-repair --state all ...`
  returns `[]`, confirming this audit rail was closed without opening a PR

## Exact Contamination

The contamination is a four-part mismatch:

1. The real task history already lives on the pushed parent branch
   `origin/codex2/e2e-fleet-014`.
2. The helper branch name with the `-unblock-history-repair` stem was created
   from an old `origin/dev` snapshot and now contains only a single audit
   commit, not the parent branch history.
3. The helper worktree therefore looks legitimate by path and branch name while
   actually omitting all four parent task commits.
4. If the parent owner resumed from this helper branch, any new commit or push
   would fork from trunk and bypass the accepted parent history, creating a
   false repair rail and compounding the real staging blocker.

This is branch/worktree/commit contamination, not missing feature work.

## Non-Destructive Repair Path

Do not force-push, rebase, or rewrite any shared branch.

1. Treat `origin/codex2/e2e-fleet-014 @ b47f4874d5a6876557215d22adf9aefc7cf768c6`
   as the only valid owner branch for `E2E-FLEET-014`.
2. Preserve this helper branch only as the audit rail that records the
   contamination report. It should not be used for parent implementation,
   reopen, or closeout work.
3. Push this helper branch normally so the evidence is reviewable without
   rewriting any existing ref.
4. Update the parent machine-truth `next` field to say the history ambiguity is
   resolved and the remaining next step is to resume from
   `origin/codex2/e2e-fleet-014 @ b47f4874...` after the staging WIF
   `invalid_target` blocker is fixed.
5. Keep the parent status blocked on the upstream credential issue, not on this
   helper branch mismatch.

## Current Unblocked Next Step For Parent

Resume `E2E-FLEET-014` from the existing pushed owner branch
`origin/codex2/e2e-fleet-014 @ b47f4874d5a6876557215d22adf9aefc7cf768c6`
after the staging GCP Workload Identity Federation provider is corrected.
Do not resume from `codex2/e2e-fleet-014-unblock-history-repair`.

## Owner Closeout Evidence

- Reviewer state for this helper task is `review_approved`; owner closeout is
  limited to recording branch evidence and marking the helper task `done`.
- Parent machine truth now points back to the real owner branch and preserves
  the actual blocker:
  `origin/codex2/e2e-fleet-014 @ b47f4874d5a6876557215d22adf9aefc7cf768c6`
  remains canonical, while Gemini owns the staging WIF `invalid_target`
  remediation.
- Helper branch `codex2/e2e-fleet-014-unblock-history-repair` remains a normal
  non-force pushed audit rail only. It is not a resume or delivery branch for
  the parent task.
- Before final `done`, owner re-verified:
  - helper branch HEAD equals
    `origin/codex2/e2e-fleet-014-unblock-history-repair`
  - parent task `next` text explicitly says to resume from the pushed parent
    branch, not this helper branch
  - the pushed helper evidence commit is still
    `c6b71b13b17349150149830b63626bb3800dbfa2`

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The pushed parent branch remains unchanged and canonical.
- The helper branch becomes auditable evidence instead of a hidden wrong-rail
  worktree.
- The parent can return to its real upstream blocker with an explicit safe
  resume branch.

## Verification Performed

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`, and
  `.orchestrator/skills/worker-anchor-commit.md`
- Checked task machine state:
  - `AI_NAME=Codex2 scripts/ai-status.sh show E2E-FLEET-014`
  - `AI_NAME=Codex2 scripts/ai-status.sh show E2E-FLEET-014-UNBLOCK-HISTORY-REPAIR`
- Compared refs and ancestry:
  - `git fetch origin`
  - `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' 'refs/heads/codex2/e2e-fleet-014*'`
  - `git rev-list --left-right --count origin/dev...codex2/e2e-fleet-014`
  - `git rev-list --left-right --count origin/dev...codex2/e2e-fleet-014-unblock-history-repair`
  - `git merge-base origin/dev codex2/e2e-fleet-014`
  - `git rev-parse codex2/e2e-fleet-014`
  - `git rev-parse codex2/e2e-fleet-014-unblock-history-repair`
  - `git log --oneline codex2/e2e-fleet-014 --not origin/dev`
- Confirmed worktree separation and current PR visibility:
  - `git worktree list --porcelain | grep -nA2 -B1 'codex2/e2e-fleet-014'`
  - `gh pr list --head codex2:codex2/e2e-fleet-014 --state all --json number,title,url,headRefName,baseRefName,state,isDraft`
  - `gh pr list --head codex2:codex2/e2e-fleet-014-unblock-history-repair --state all --json number,title,url,headRefName,baseRefName,state,isDraft`
