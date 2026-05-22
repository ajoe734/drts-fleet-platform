# PH1GC-BPL-001 Unblock History Repair

## Scope

- Task: `PH1GC-BPL-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-BPL-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-05-22`

## Diagnosis

The parent is no longer blocked by a missing audit file. The remaining
contamination is stale machine truth plus stale helper history after `origin/dev`
advanced.

1. `origin/dev@6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21` already contains
   `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`.
   That commit is the GitHub merge of PR `#237`
   (`PH1GC-DOC-BATCH-1: deliver BPL-001/002/003 + PARTNER-001 + FIN-GOV-001 + ADM-001 (#237)`).
2. Canonical machine truth is stale:
   `PH1GC-BPL-001` is still `blocked` with `next` text from `2026-05-22T06:47:57Z`
   claiming `origin/dev` does not contain the audit file and that the doc-batch
   branch is still ahead of `dev`.
3. The helper branch already has a task-scoped pushed anchor commit
   `origin/codex2/ph1gc-bpl-001-unblock-history-repair@1e9d6445`, but that
   artifact preserves the same stale diagnosis and replay path.
4. The parent task branch `codex/ph1gc-bpl-001` still points to
   `bf176edd8e67fb9899249ab98cf1f89d3164518d`, one commit behind `origin/dev`,
   so the owner is still looking at the pre-merge baseline unless the branch is
   refreshed.
5. The older helper branch alias
   `codex/ph1gc-bpl-001-unblock-history-repair@6607dea8` and the sidecar branch
   `origin/codex2/ph1gc-bpl-001-sidecar-acceptance@158629cc` are audit evidence
   of the stale state, but neither is the reason the parent remains blocked now.

## Evidence

### Current canonical refs

- `origin/dev @ 6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- `origin/codex2/ph1gc-bpl-001-unblock-history-repair @ 1e9d6445c16cca4bd094aa1faa5549284a49eb26`
- `codex/ph1gc-bpl-001 @ bf176edd8e67fb9899249ab98cf1f89d3164518d`
- `origin/codex2/ph1gc-bpl-001-sidecar-acceptance @ 158629cc66051e1c32c1107813d70f9e4c09430e`

### Verified facts

- `git ls-tree -r origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  returns the audit path, so the parent acceptance file is already on `origin/dev`.
- `git show --stat --summary origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  shows that `6607dea8` created the file on `origin/dev` through PR `#237`.
- Canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
  still records `PH1GC-BPL-001` as `blocked` with the old "file missing from
  origin/dev" message.
- Canonical `/home/edna/workspace/drts-fleet-platform/current-work.md` mirrors
  the same stale blocker text.
- `git branch -vv | grep 'ph1gc-bpl-001'` shows the parent task branch is behind
  `origin/dev`, while this helper branch carries a stale pushed diagnosis commit.

## Exact Contamination

The contamination is now a state-sync problem, not a content-delivery problem:

1. Shared history moved forward when PR `#237` landed on `origin/dev`.
2. Parent machine truth and human summary were not refreshed, so they still
   describe the pre-merge world.
3. This helper task had already published a task-scoped anchor commit, but that
   commit froze the outdated diagnosis and therefore kept the unblock path stale.
4. The parent branch itself was never refreshed to the merged `origin/dev` tip,
   which makes the owner's local branch/worktree context lag behind canonical
   history.

## Non-Destructive Repair Path

Do not rewrite or force-push any shared branch. Repair by refreshing the stale
control-plane evidence and resuming the parent on top of the merged `dev` state.

1. Preserve the old helper commit `1e9d6445` as audit evidence; do not rewrite
   or delete it.
2. Publish this refreshed helper artifact on the same helper branch so the
   review trail shows both the stale diagnosis and the corrected diagnosis.
3. Reopen `PH1GC-BPL-001` with a new next step that reflects current truth:
   `origin/dev` already contains the required audit file via `6607dea8` / PR
   `#237`, so the parent is unblocked from content delivery.
4. Parent owner `Codex` should then refresh the parent branch from current trunk:

   `git fetch origin && git rebase origin/dev`

   on `codex/ph1gc-bpl-001` (or equivalent normal refresh if the worktree is
   clean and a fast-forward is sufficient).
5. After branch refresh, the parent owner should complete normal closeout using
   the merged artifact as canonical content evidence and add any task-scoped
   closeout metadata commit/push required by the closeout protocol. No force-push
   of shared history is needed because the canonical content is already on
   `origin/dev`.

## Recommended Next Step For Parent

Set parent `PH1GC-BPL-001` next step to:

`History repair complete: origin/dev@6607dea8 already contains docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md via PR #237. Refresh codex/ph1gc-bpl-001 onto origin/dev, verify the merged audit on branch tip, then finish the parent closeout with normal task-scoped commit/push metadata instead of replaying content or force-pushing shared history.`

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- The already-merged canonical audit file on `origin/dev` stays untouched.
- The stale helper commit remains available for audit instead of being hidden.
- The parent resumes from current truth rather than replaying already-landed content.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/current-work.md`
- Compared related refs with `git branch -vv` and `git log --decorate --graph`
- Verified current trunk content with:
  - `git ls-tree -r origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  - `git show --no-patch --pretty=fuller origin/dev`
  - `git show --stat --summary origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
- Verified stale helper evidence with:
  - `git show --no-patch --pretty=fuller 1e9d6445`
  - `git show --stat --summary 1e9d6445`
