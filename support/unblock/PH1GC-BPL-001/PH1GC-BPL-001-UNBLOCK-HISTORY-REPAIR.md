# PH1GC-BPL-001 Unblock History Repair

## Scope

- Task: `PH1GC-BPL-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-BPL-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-05-22`

## Current Canonical State

The original unblock diagnosis was stale. Current canonical state no longer
shows the parent as blocked:

1. `origin/dev@6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21` already contains
   `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` via
   PR `#237` (`PH1GC-DOC-BATCH-1: deliver BPL-001/002/003 + PARTNER-001 +
   FIN-GOV-001 + ADM-001 (#237)`).
2. Canonical `ai-status.json` now records `PH1GC-BPL-001` as `review`, not
   `blocked`.
3. Canonical parent `next` already says the audit doc was refreshed against
   `origin/dev@6607dea8` and canonical `current-work.md`; it is no longer a
   replay-or-reland instruction.
4. The live helper branch tip is
   `origin/codex2/ph1gc-bpl-001-unblock-history-repair@867b4b851da582458e0e4c9431646452f8c2d3a2`,
   not `1e9d6445`.

## Exact Contamination

The contamination that blocked the prior repair attempt was a stale-history
artifact, not missing content on trunk:

1. PR `#237` moved shared history forward by landing the parent audit file on
   `origin/dev`.
2. Earlier helper evidence was written against the pre-merge world and claimed
   the parent still needed replay/re-land work.
3. Commit `1e9d6445c16cca4bd094aa1faa5549284a49eb26` preserved that stale
   diagnosis on the helper branch.
4. Commit `867b4b851da582458e0e4c9431646452f8c2d3a2` advanced the helper branch
   but still kept stale statements in the artifact itself:
   the "Current canonical refs" section still pointed the remote helper ref to
   `1e9d6445`, and the diagnosis still said canonical machine truth had the
   parent in `blocked`.
5. Current canonical machine truth has already moved past that. The remaining
   repair is to align this helper artifact with the actual review-state reality
   instead of re-describing the old blockage as if it were still active.

## Evidence

### Current canonical refs

- `origin/dev @ 6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- `origin/codex2/ph1gc-bpl-001-unblock-history-repair @ 867b4b851da582458e0e4c9431646452f8c2d3a2`
- `codex2/ph1gc-bpl-001 @ 6e3228a19c85cf73d4ef95f2f9f838d4782cfe8a`
- `codex/ph1gc-bpl-001 @ bf176edd9c100ad121face524588c3144bdcd15d`
- `origin/codex2/ph1gc-bpl-001-sidecar-acceptance @ 158629cc66051e1c32c1107813d70f9e4c09430e`

### Historical stale-state evidence

- `origin/codex2/ph1gc-bpl-001-unblock-history-repair@1e9d6445c16cca4bd094aa1faa5549284a49eb26`
  is the earlier pushed anchor commit that captured the outdated replay path.
- `codex/ph1gc-bpl-001-unblock-history-repair@6607dea8` remains useful only as
  audit evidence that one helper alias had already been refreshed to the merged
  trunk while the active helper note still described the old blockage.

### Verified facts

- `git ls-tree -r origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  returns the audit path on trunk.
- `git show --stat --summary origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  shows commit `6607dea8` created that file on `origin/dev` via PR `#237`.
- Canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
  now records `PH1GC-BPL-001` as `review` with an updated closeout-oriented
  `next` field.
- Canonical `/home/edna/workspace/drts-fleet-platform/current-work.md`
  mirrors the parent as `review`, not `blocked`.
- `git branch -vv | grep 'ph1gc-bpl-001'`
  shows `codex2/ph1gc-bpl-001` is already ahead of `origin/dev` by one
  task-scoped normalization commit, while the older `codex/ph1gc-bpl-001`
  branch is still behind trunk by one commit.

## Non-Destructive Repair Path

Do not rewrite or force-push any shared branch.

1. Preserve `1e9d6445` as historical evidence of the stale diagnosis.
2. Preserve `867b4b85` as evidence that the helper branch moved forward but the
   artifact text itself still needed one more repair pass.
3. Publish this corrected helper note on the same branch/PR so the audit trail
   shows the exact progression from stale diagnosis to corrected diagnosis.
4. Do not reopen the parent as `blocked`. Canonical machine truth already has
   the correct unblocked posture: the parent is in `review`.
5. Parent work should continue from the current owner branch
   `codex2/ph1gc-bpl-001`, not from the older behind-trunk
   `codex/ph1gc-bpl-001` branch alias.

## Parent Next Step

No additional parent machine-truth rewrite is required in this helper task.
Canonical `PH1GC-BPL-001.next` is already the correct unblocked next step:

`Updated docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md to reconcile against origin/dev 6607dea8 and canonical current-work.md 2026-05-22T08:49:48Z; normalized every workflow-family Closure line to a single directive §A label; verified no residual mixed closure labels and no 'to discuss' wording remains.`

Operationally, the handoff is:

1. Reviewer `Codex` reviews parent task `PH1GC-BPL-001` on
   `codex2/ph1gc-bpl-001@6e3228a1`.
2. If review passes, owner `Codex2` closes the parent with normal task-scoped
   closeout commit/push metadata.
3. No replay of doc content and no force-push of shared history is part of the
   valid path anymore.

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- The merged canonical audit file on `origin/dev` stays untouched.
- The stale helper commits remain visible as audit evidence.
- The parent proceeds from current review-state truth instead of replaying
  already-landed content.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/current-work.md`
- Compared related refs with `git branch -vv` and `git log --decorate --graph`
- Verified current trunk content with:
  - `git ls-tree -r origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  - `git show --stat --summary origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
- Verified current helper/parent refs with:
  - `git rev-parse origin/codex2/ph1gc-bpl-001-unblock-history-repair`
  - `git rev-parse codex2/ph1gc-bpl-001`
  - `git rev-parse codex/ph1gc-bpl-001`
- Verified historical stale evidence with:
  - `git show --no-patch --pretty=fuller 1e9d6445`
  - `git show --no-patch --pretty=fuller 867b4b85`
