# PH1GC-FIN-GOV-001 Unblock History Repair

## Scope

- Task: `PH1GC-FIN-GOV-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-FIN-GOV-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-05-22`

## Diagnosis

The parent is blocked by owner-lane branch/worktree contamination, not by a
missing document commit.

1. The canonical spec and UAT already landed on `origin/dev` in
   `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
   (`PH1GC-DOC-BATCH-1`), which includes
   `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
   and `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`.
2. The parent owner branch `codex2/ph1gc-fin-gov-001` is still a local-only ref
   at the same merged `origin/dev` commit `6607dea8`; there is no
   `origin/codex2/ph1gc-fin-gov-001`.
3. The owner still has two helper branches with the same task stem, but neither
   is the canonical parent replay branch:
   `origin/codex2/ph1gc-fin-gov-001-unblock-history-repair @ 4bf930192ccd51f332eaf9e3370cbf7c29cb4da0`
   carries only this diagnosis artifact, while local
   `codex2/ph1gc-fin-gov-001-unblock-manual-unblock @ 6607dea8` remains an empty
   alias of `origin/dev`.
4. The reviewer-side unblock branch
   `origin/codex/ph1gc-fin-gov-001-unblock-manual-unblock @ 0d4ac04bd198595843f960bfd7bf0a8e8266f4ea`
   preserves the accepted blocker diagnosis, but it also does not create a
   canonical owner replay branch.
5. The real follow-on delivery inputs already exist on separate remote branches:
   `origin/claude2/wf-fin-gov-001-e2e @ ddc02c4e24ecf924e83d47f0cc86c1c21ce223f6`
   and `origin/codex2/ph1gc-matrix-002 @ 07b3a245a87a93fbea09c806e8a7ea5c085d3df5`.
   Because the owner lane has no pushed parent branch, the control plane still
   sees branch ambiguity instead of a resumable delivery rail.

## Evidence

### Branch and worktree state

- `origin/dev @ 6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- local `codex2/ph1gc-fin-gov-001 @ 6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- local + remote `codex2/ph1gc-fin-gov-001-unblock-history-repair @ 4bf930192ccd51f332eaf9e3370cbf7c29cb4da0`
- local `codex2/ph1gc-fin-gov-001-unblock-manual-unblock @ 6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- `git ls-remote --heads origin` returns no refs for:
  - `refs/heads/codex2/ph1gc-fin-gov-001`
  - `refs/heads/codex2/ph1gc-fin-gov-001-unblock-manual-unblock`
- `git ls-remote --heads origin` confirms these related pushed refs:
  - `refs/heads/codex2/ph1gc-fin-gov-001-unblock-history-repair @ 4bf93019`
  - `refs/heads/codex/ph1gc-fin-gov-001-unblock-manual-unblock @ 0d4ac04b`
- `git branch -vv` shows the parent branch and manual-unblock helper still
  tracking `origin/dev`, while the history-repair helper now tracks its own
  remote review branch
- `git worktree list --porcelain` shows separate worktrees for:
  - `codex2/ph1gc-fin-gov-001`
  - `codex2/ph1gc-fin-gov-001-unblock-history-repair`
  - `codex2/ph1gc-fin-gov-001-unblock-manual-unblock`
- `git show --name-only --stat 6607dea8` confirms the PH1GC-FIN-GOV-001 spec and
  UAT already merged through the doc-batch commit, so the remaining gap is not
  a missing parent artifact on `dev`

### Machine-truth anchors

- Parent task `PH1GC-FIN-GOV-001` is `blocked` in canonical `ai-status.json`
- Parent `next` already points to the real remaining work:
  adopt `origin/claude2/wf-fin-gov-001-e2e @ ddc02c4` and then replay
  `origin/codex2/ph1gc-matrix-002 @ 07b3a245`
- This helper task existed in machine truth, but the expected artifact path did
  not exist on `dev` or on the assigned helper branch before this repair commit

## Exact Contamination

The contamination is a four-part mismatch:

1. The parent task name `PH1GC-FIN-GOV-001` already points at merged doc work on
   `origin/dev`.
2. The owner kept three branch/worktree names with the same task stem, but only
   the helper review branch was ever pushed; the actual parent branch is still a
   local-only alias of `origin/dev` with no owner-lane remote.
3. The pushed unblock artifacts live on helper branches, so the control plane
   has diagnosis evidence but still no owner replay branch.
4. The two real follow-on delivery commits live on other task branches, so the
   parent cannot be resumed cleanly until one owner branch becomes the canonical
   place where those commits are replayed and pushed.

This means the parent is not blocked by a missing spec/UAT commit. It is blocked
because the owner lane never established a pushed parent branch after the doc
batch merged, leaving the remaining E2E/matrix replay path without a canonical
owner history.

## Non-Destructive Repair Path

Do not force-push, rename, or rewrite any existing branch. Repair by reusing the
existing owner parent branch name and making the first owner-lane replay commit
there.

1. Reuse the existing worktree
   `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-fin-gov-001`
   on local branch `codex2/ph1gc-fin-gov-001`. Its current tip `6607dea8` is a
   clean `origin/dev` anchor, even though it is not yet a canonical remote ref.
2. From that branch, replay the already-pushed E2E work from
   `origin/claude2/wf-fin-gov-001-e2e` onto the parent branch. The concrete
   source commits are:
   - `f450a1e8` `feat(WF-FIN-GOV-001-E2E): add governance-aware billing/reporting E2E-010 shell`
   - `ddc02c4e` `feat(WF-FIN-GOV-001-E2E): bind invoice evidence to governed booking and harden FG-08/FG-09`
3. Replay `origin/codex2/ph1gc-matrix-002 @ 07b3a245` after the E2E branch is
   applied so the WF-FIN-GOV-001 / E2E-010 matrix row rides on the same owner
   branch.
4. Push that replay result as the first non-empty owner remote:

```bash
git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-fin-gov-001 fetch origin
git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-fin-gov-001 cherry-pick f450a1e8 ddc02c4e
git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-fin-gov-001 cherry-pick 07b3a245
git -C /home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ph1gc-fin-gov-001 push -u origin codex2/ph1gc-fin-gov-001
```

5. Leave both helper branches untouched. They remain valid audit evidence and do
   not require force-push or deletion.
6. After the push succeeds, rerun the parent handoff against the pushed owner
   branch instead of any helper branch:

```bash
AI_NAME=Codex2 scripts/ai-status.sh handoff PH1GC-FIN-GOV-001 Codex \
  "History repair complete: resume review on origin/codex2/ph1gc-fin-gov-001 after replaying WF-FIN-GOV-001-E2E (f450a1e8, ddc02c4e) and PH1GC-MATRIX-002 (07b3a245). The branch was previously local-only at merged doc-batch commit 6607dea8; no force-push or branch rename required."
```

7. If any replay conflict appears, record that as a normal implementation blocker
   on `PH1GC-FIN-GOV-001`; do not reopen history repair unless the pushed owner
   branch itself becomes ambiguous again.

## Why This Is Safe

- No existing remote ref is rewritten.
- No force-push is required.
- The merged doc-batch commit on `origin/dev` stays untouched.
- The parent resumes on its own owner branch name instead of borrowing the
  reviewer helper branch.
- The helper branches remain available as immutable contamination evidence.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`, `docs/ops/branch-strategy.md`, and
  `.orchestrator/skills/worker-anchor-commit.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Compared related branch and worktree state:
  - `git branch -vv | grep 'ph1gc-fin-gov-001'`
  - `git worktree list --porcelain`
  - `git show-ref --verify refs/heads/codex2/ph1gc-fin-gov-001`
  - `git show-ref --verify refs/heads/codex2/ph1gc-fin-gov-001-unblock-history-repair`
  - `git show-ref --verify refs/heads/codex2/ph1gc-fin-gov-001-unblock-manual-unblock`
  - `git ls-remote --heads origin 'refs/heads/codex2/ph1gc-fin-gov-001' 'refs/heads/codex2/ph1gc-fin-gov-001-unblock-history-repair' 'refs/heads/codex2/ph1gc-fin-gov-001-unblock-manual-unblock' 'refs/heads/codex/ph1gc-fin-gov-001-unblock-manual-unblock' 'refs/heads/claude2/wf-fin-gov-001-e2e' 'refs/heads/codex2/ph1gc-matrix-002'`
- Confirmed merged doc-batch provenance:
  - `git show --stat --summary --name-only 6607dea8`
- Confirmed follow-on commits are already pushed elsewhere:
  - `git log --oneline 6607dea8..ddc02c4e`
  - `git log --oneline 6607dea8..07b3a245`
