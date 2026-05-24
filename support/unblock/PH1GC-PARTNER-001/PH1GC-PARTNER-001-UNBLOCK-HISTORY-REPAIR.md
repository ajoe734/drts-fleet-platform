# PH1GC-PARTNER-001 Unblock History Repair

## Scope

- Task: `PH1GC-PARTNER-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-PARTNER-001`
- Owner: `Codex2`
- Reviewer: `Gemini2`
- Audit timestamp: `2026-05-24`

## Diagnosis

The parent is not blocked by a missing spec commit. It is blocked by a stale
history-repair dispatch pointing at the wrong branch/worktree history.

1. The Phase 1 partner spec already landed on `origin/dev` in
   `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
   (`PH1GC-DOC-BATCH-1`).
2. The actual owner parent branch already exists locally and on origin as
   `codex2/ph1gc-partner-001 @ 68b13f1b3a4c5fea65fd89f1595ca73dbfa7c605`
   with subject `PH1GC-PARTNER-001: finalize merged partner eligibility spec`.
3. The assigned helper branch
   `codex2/ph1gc-partner-001-unblock-history-repair @ 92496f04dcd02ff7ddf6d035517b70e4a376a2c7`
   is not descended from the pushed parent tip. Its merge-base with the parent
   branch is only `6607dea8`, and it is `21` commits ahead of that base while
   missing the parent closeout commit `68b13f1b`.
4. There is no remote ref for
   `refs/heads/codex2/ph1gc-partner-001-unblock-history-repair`, so this helper
   branch cannot be the canonical review/closeout rail anyway.
5. Canonical machine truth currently blocks `PH1GC-PARTNER-001` for a different
   reason: `origin/dev` still contains `WF-PRT-001` rows in
   `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`, while the
   rename commit `5cacb1da` on `origin/codex2/ph1gc-matrix-001` is not yet an
   ancestor of `origin/dev`. This history-repair task therefore needs to
   isolate and remove branch ambiguity so the parent can return to that real
   upstream blocker.

## Evidence

### Branch and worktree state

- `origin/dev @ 92496f04dcd02ff7ddf6d035517b70e4a376a2c7`
- local + remote `codex2/ph1gc-partner-001 @ 68b13f1b3a4c5fea65fd89f1595ca73dbfa7c605`
- local-only helper branch
  `codex2/ph1gc-partner-001-unblock-history-repair @ 92496f04dcd02ff7ddf6d035517b70e4a376a2c7`
- reviewer lane branch
  `codex/ph1gc-partner-001 @ febc3fafc078e04bd58c8e3580894521f3adc1f2`
- `git rev-list --left-right --count codex2/ph1gc-partner-001...origin/codex2/ph1gc-partner-001`
  returns `0 0`, confirming the owner parent branch is already pushed cleanly.
- `git rev-list --left-right --count codex2/ph1gc-partner-001-unblock-history-repair...origin/codex2/ph1gc-partner-001`
  returns `21 1`, confirming the helper branch diverged away from the pushed
  parent instead of extending it.
- `git merge-base codex2/ph1gc-partner-001-unblock-history-repair origin/codex2/ph1gc-partner-001`
  returns `6607dea8`, proving the helper branch forked from the old doc-batch
  merge point rather than the parent closeout tip.
- `git ls-remote --heads origin` confirms:
  - `refs/heads/codex2/ph1gc-partner-001 @ 68b13f1b`
  - no `refs/heads/codex2/ph1gc-partner-001-unblock-history-repair`

### Parent provenance

- `git show --stat --summary --name-only 6607dea8` confirms the canonical spec
  path `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`
  was already merged through `PH1GC-DOC-BATCH-1`.
- `git show --stat --summary --name-only 68b13f1b` confirms the owner parent
  branch already carries the formal closeout commit with `LLM-Agent: Codex2`,
  `Task-ID: PH1GC-PARTNER-001`, and `Reviewer: Codex`.

## Exact Contamination

The contamination is a four-part mismatch:

1. The parent task already has a pushed owner branch and closeout commit.
2. The helper branch with the `-unblock-history-repair` stem is anchored to
   current `origin/dev`, not to the pushed parent branch.
3. The helper branch therefore contains unrelated post-parent commits and omits
   the actual parent closeout commit `68b13f1b`.
4. The helper dispatch introduces branch ambiguity on top of the real
   matrix-rename blocker, so the parent cannot cleanly return to its upstream
   dependency until the helper history is explicitly demoted to audit-only
   evidence.

This is branch/worktree/commit contamination, not missing delivery work.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any branch. Repair by treating the pushed
parent branch as canonical and this helper branch as audit evidence only, then
handing the parent back to its real upstream dependency.

1. Reuse the existing parent worktree
   `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-partner-001`
   on branch `codex2/ph1gc-partner-001`.
2. Treat `origin/codex2/ph1gc-partner-001 @ 68b13f1b3a4c5fea65fd89f1595ca73dbfa7c605`
   as the only valid owner closeout branch for `PH1GC-PARTNER-001`.
3. Leave `codex2/ph1gc-partner-001-unblock-history-repair` unmerged. It should
   remain only as the diagnostic branch that records this contamination report.
4. Update the parent machine truth so the next step explicitly says the history
   ambiguity is resolved and the remaining blocker is the matrix rename waiting
   on `PH1GC-MATRIX-001` / Claude.
5. When that upstream blocker clears, the parent owner should resume from the
   already-pushed branch `origin/codex2/ph1gc-partner-001 @ 68b13f1b...`
   instead of reopening or rebasing this helper branch.

If a reviewer wants to inspect the unblock evidence first, point them at this
artifact and the pushed parent branch. There is no need to replay, cherry-pick,
or merge anything onto the helper branch.

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The pushed owner parent branch already exists and stays unchanged.
- The helper branch remains available as immutable contamination evidence.
- The parent can close out on its own branch name instead of borrowing an
  unrelated helper history.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`, and
  `.orchestrator/skills/worker-anchor-commit.md`
- Compared related branch and worktree state:
  - `git branch -vv | grep 'ph1gc-partner-001'`
  - `git worktree list --porcelain | grep -nA2 -B1 'codex2/ph1gc-partner-001'`
  - `git rev-list --left-right --count codex2/ph1gc-partner-001...origin/codex2/ph1gc-partner-001`
  - `git rev-list --left-right --count codex2/ph1gc-partner-001-unblock-history-repair...origin/codex2/ph1gc-partner-001`
  - `git merge-base codex2/ph1gc-partner-001-unblock-history-repair origin/codex2/ph1gc-partner-001`
  - `git ls-remote --heads origin 'refs/heads/codex2/ph1gc-partner-001' 'refs/heads/codex2/ph1gc-partner-001-unblock-history-repair'`
- Confirmed parent provenance:
  - `git show --stat --summary --name-only 6607dea8`
  - `git show --stat --summary --name-only 68b13f1b`
- Checked GitHub PR visibility for both owner and helper branch heads:
  - `gh pr list --head codex2:codex2/ph1gc-partner-001 --state all --json number,title,url,headRefName,baseRefName,state,isDraft`
  - `gh pr list --head codex2:codex2/ph1gc-partner-001-unblock-history-repair --state all --json number,title,url,headRefName,baseRefName,state,isDraft`
