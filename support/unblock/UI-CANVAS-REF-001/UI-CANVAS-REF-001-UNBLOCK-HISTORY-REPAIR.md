# UI-CANVAS-REF-001 Unblock History Repair

## Scope

- Task: `UI-CANVAS-REF-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `UI-CANVAS-REF-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Initial audit timestamp: `2026-08-01T13:13:12Z`
- Repair confirmation timestamp: `2026-08-01T13:31:00Z`
- Review-failure revalidation timestamp: `2026-08-01T13:33:44Z`
- Canonical machine-truth root:
  `/home/lupin/drts-fleet-platform`
- Assigned helper worktree:
  `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/codex-ui-canvas-ref-001-unblock-history-repair`
- Assigned helper branch:
  `codex/ui-canvas-ref-001-unblock-history-repair`

## Diagnosis

`UI-CANVAS-REF-001` was blocked by branch/status evidence drift, not by missing
UI implementation.

1. The canonical merged UI payload already exists on `origin/dev` at
   `d73940cf129ce89ef1685cea9202f10a8f086c8c`
   (`UI-CANVAS-REF-001: rebuild referral embed canvas parity (#1224)`).
2. The parent owner-closeout commit exists on local branch
   `codex/ui-canvas-ref-001 @ 46dddf75d9058cd35b65075e6aa3fe20d29e5a9d`.
3. At review time, machine truth had claimed that same commit was already pushed
   on `origin/codex/ui-canvas-ref-001`, while the helper artifact correctly
   recorded the remote as still being at
   `3968700a4c0a4636ef504e486a7d27c9ac54c4f7`.
4. The repo config explains why this was easy to misread:
   `remote.origin.fetch` is only `+refs/heads/dev:refs/remotes/origin/dev`.
   This repo does not automatically maintain remote-tracking refs for
   `origin/codex/*`, so `refs/remotes/origin/codex/ui-canvas-ref-001` can stay
   stale even when the actual GitHub branch has moved.
5. Review then exposed a second helper-rail drift: the pushed helper branch
   `origin/codex/ui-canvas-ref-001-unblock-history-repair` had already advanced
   to `fe309c2e41f5b736257182f1c8ae164f5dae7005`, while the artifact in the
   previous helper commit still claimed local/remote helper parity at
   `e3fa22aa07c2faca88b7f081c03cc7f520d2861a`.
6. The assigned local helper branch had also diverged from the pushed helper
   rail. Its HEAD was `0117b769f929dc0f5adcf5515371aa1866519361`, a polluted
   single-parent sibling of `fe309c2` that incorrectly captured a repo-wide
   snapshot instead of the task-scoped artifact-only delta.
7. The helper worktree itself remains contaminated as an execution surface:
   `git status --short` reports repo-wide untracked noise instead of a normal
   checkout, so this worktree is suitable for history audit only, not for
   treating filesystem state as canonical branch truth.

## Exact Contamination

The blocking contamination was:

1. Parent machine-truth drift: `UI-CANVAS-REF-001.next` said pushed closeout
   evidence existed on `origin/codex/ui-canvas-ref-001@46dddf75` before that
   claim was revalidated against the real remote branch.
2. Verification source drift: the repo only auto-tracks `origin/dev`, so
   `refs/remotes/origin/codex/ui-canvas-ref-001` was not a trustworthy source
   of truth for the non-`dev` branch unless explicitly refreshed or compared via
   `git ls-remote`.
3. Helper evidence drift: the pushed helper branch advanced to `fe309c2`, but
   the artifact text still claimed the helper local/remote head was `e3fa22aa`.
4. Local helper branch drift: the assigned branch name pointed at polluted
   local-only commit `0117b769`, which diverged from the pushed helper rail and
   bundled unrelated repo contents.
5. Helper worktree hygiene drift: the assigned helper checkout is not a clean
   materialized tree, so history evidence must come from git objects and remote
   refs, not from assuming the worktree filesystem reflects a normal branch
   checkout.

## Repair Performed

This task repaired the unblock path without force-pushing or rewriting shared
history.

1. Verified the actual GitHub remote branch with:
   `git ls-remote --heads origin refs/heads/codex/ui-canvas-ref-001`
2. Confirmed the actual remote head now resolves to
   `46dddf75d9058cd35b65075e6aa3fe20d29e5a9d`.
3. Revalidated the actual pushed helper branch with:
   `git ls-remote --heads origin refs/heads/codex/ui-canvas-ref-001-unblock-history-repair`
4. Confirmed the pushed helper branch had advanced to
   `origin/codex/ui-canvas-ref-001-unblock-history-repair@fe309c2e41f5b736257182f1c8ae164f5dae7005`,
   so the previous artifact's `e3fa22aa` claim was stale.
5. Isolated the polluted local helper-only commit by preserving it under a
   backup local ref, then rebuilt the expected helper branch from the pushed
   helper rail so this repair remains an additive fast-forward on shared
   history.
6. Updated the local stale remote-tracking ref
   `refs/remotes/origin/codex/ui-canvas-ref-001` to `46dddf75` so subsequent
   local evidence matches the real remote branch instead of the old `3968700a`
   snapshot.
7. Rewrote the helper artifact and parent task next-step evidence to match the
   repaired truth:
   parent closeout replay must reference the pushed parent branch at
   `46dddf75`, while reviewers should use `git ls-remote` or an explicit fetch
   refspec for non-`dev` branches in this repo.

## Evidence

### Canonical implementation proof

- `origin/dev @ d73940cf129ce89ef1685cea9202f10a8f086c8c`
- commit subject:
  `UI-CANVAS-REF-001: rebuild referral embed canvas parity (#1224)`

### Parent closeout proof

- local parent branch:
  `codex/ui-canvas-ref-001 @ 46dddf75d9058cd35b65075e6aa3fe20d29e5a9d`
- actual remote parent branch from `git ls-remote`:
  `origin/codex/ui-canvas-ref-001 @ 46dddf75d9058cd35b65075e6aa3fe20d29e5a9d`
- closeout commit subject:
  `UI-CANVAS-REF-001: sync owner closeout metadata`
- commit parent:
  `3968700a4c0a4636ef504e486a7d27c9ac54c4f7`
  (`UI-CANVAS-REF-001: finalize approved referral embed closeout`)

### Helper task proof

- previous pushed helper head observed during review failure:
  `origin/codex/ui-canvas-ref-001-unblock-history-repair @ fe309c2e41f5b736257182f1c8ae164f5dae7005`
- stale helper head still cited by the previous artifact:
  `e3fa22aa07c2faca88b7f081c03cc7f520d2861a`
- polluted local-only helper sibling that must not be pushed as task truth:
  `0117b769f929dc0f5adcf5515371aa1866519361`
- previous pushed helper commit subject:
  `UI-CANVAS-REF-001-UNBLOCK-HISTORY-REPAIR: reconcile remote ref evidence and parent replay path`

### Repo-config proof for stale tracking ref behavior

- `git config --get-all remote.origin.fetch`
- result:
  `+refs/heads/dev:refs/remotes/origin/dev`

That config means `origin/codex/*` is not auto-maintained by ordinary fetches.
For this repo, non-`dev` branch verification must use one of:

- `git ls-remote --heads origin refs/heads/<branch>`
- `git fetch origin refs/heads/<branch>:refs/remotes/origin/<branch>`

## Concrete Parent Next Step

`UI-CANVAS-REF-001` is unblocked for lifecycle replay only. The parent should
close out from pushed branch evidence, not from the contaminated helper
worktree:

1. `AI_NAME=Codex /home/lupin/drts-fleet-platform/scripts/ai-status.sh handoff UI-CANVAS-REF-001 Gemini2 "...origin/codex/ui-canvas-ref-001@46dddf75..."`
2. `AI_NAME=Gemini2 /home/lupin/drts-fleet-platform/scripts/ai-status.sh approve UI-CANVAS-REF-001 "...verified pushed branch evidence..."`
3. `AI_NAME=Codex COMMIT_HASH=46dddf75d9058cd35b65075e6aa3fe20d29e5a9d COMMIT_SUBJECT='UI-CANVAS-REF-001: sync owner closeout metadata' PUSH_REMOTE=origin PUSH_BRANCH=codex/ui-canvas-ref-001 INTEGRATION_STATUS=branch_pushed /home/lupin/drts-fleet-platform/scripts/ai-status.sh done UI-CANVAS-REF-001 "..."`

## Why This Is Safe

- no force-push was used
- no shared history was rewritten
- `origin/dev` remains the canonical merged implementation evidence
- parent closeout evidence is now explicitly tied to the real pushed branch
- helper-task evidence remains on its own branch for audit
- future reviewers have a concrete rule for verifying non-`dev` refs in this
  repo

## Verification Performed

- `AI_NAME=Codex /home/lupin/drts-fleet-platform/scripts/ai-status.sh show UI-CANVAS-REF-001`
- `AI_NAME=Codex /home/lupin/drts-fleet-platform/scripts/ai-status.sh show UI-CANVAS-REF-001-UNBLOCK-HISTORY-REPAIR`
- `git branch --show-current`
- `git show --stat --summary e3fa22aa`
- `git show --stat --summary fe309c2`
- `git show --stat --summary 0117b769`
- `git show --stat --summary 46dddf75`
- `git show --stat --summary 3968700a`
- `git show 46dddf75 --no-patch --pretty=raw`
- `git for-each-ref --format='%(refname:short) %(objectname:short) %(upstream:short)' refs/heads/codex/ui-canvas-ref-001 refs/remotes/origin/codex/ui-canvas-ref-001 refs/heads/codex/ui-canvas-ref-001-unblock-history-repair`
- `git rev-list --left-right --count fe309c2e41f5b736257182f1c8ae164f5dae7005...0117b769f929dc0f5adcf5515371aa1866519361`
- `git rev-list --left-right --count origin/codex/ui-canvas-ref-001...codex/ui-canvas-ref-001`
- `git config --get-all remote.origin.fetch`
- `git ls-remote --heads origin refs/heads/codex/ui-canvas-ref-001`
- `git ls-remote --heads origin refs/heads/codex/ui-canvas-ref-001-unblock-history-repair`
- `git update-ref refs/remotes/origin/codex/ui-canvas-ref-001 46dddf75d9058cd35b65075e6aa3fe20d29e5a9d`

No runtime tests were run in this helper task. This repair is branch/history
evidence repair plus machine-truth reconciliation.
