# PH1GC-BPL-001 Unblock History Repair

## Scope

- Task: `PH1GC-BPL-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-BPL-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-05-22`

## Current Canonical State

The original unblock diagnosis was stale. Current canonical state no longer
shows the parent as blocked and now records it as fully closed out:

1. `origin/dev@6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21` already contains
   `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md` via
   PR `#237` (`PH1GC-DOC-BATCH-1: deliver BPL-001/002/003 + PARTNER-001 +
   FIN-GOV-001 + ADM-001 (#237)`).
2. Canonical `ai-status.json` now records `PH1GC-BPL-001` as `done`, not
   `blocked`.
3. Canonical parent `next` already records the closeout result on
   `codex2/ph1gc-bpl-001@7c818c27`, so it is no longer a replay-or-reland
   instruction and no longer a review handoff.
4. The live helper branch tip is
   `origin/codex2/ph1gc-bpl-001-unblock-history-repair@9e0055b3169db2d249afb85600606346b5a82806`,
   not `867b4b85` or `1e9d6445`.

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
5. Commit `9e0055b3169db2d249afb85600606346b5a82806` then updated the narrative
   away from the stale blocked posture, but republished the artifact with
   `867b4b85` still labeled as the live helper tip and `6e3228a1` still labeled
   as the parent owner branch tip even though `codex2/ph1gc-bpl-001` had already
   advanced to `7c818c27`.
6. The exact remaining contamination is therefore self-referential stale ref
   evidence inside the helper note, not missing content on trunk and not a need
   to rewrite shared history.

## Evidence

### Current canonical refs

- `origin/dev @ 6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- `origin/codex2/ph1gc-bpl-001-unblock-history-repair @ 9e0055b3169db2d249afb85600606346b5a82806`
- `codex2/ph1gc-bpl-001 @ 7c818c2743f5f10c891945c5a54e3788456a2bfa`
- `codex/ph1gc-bpl-001 @ bf176edd9c100ad121face524588c3144bdcd15d`
- `origin/codex2/ph1gc-bpl-001-sidecar-acceptance @ 158629cc66051e1c32c1107813d70f9e4c09430e`

### Historical stale-state evidence

- `origin/codex2/ph1gc-bpl-001-unblock-history-repair@1e9d6445c16cca4bd094aa1faa5549284a49eb26`
  is the earlier pushed anchor commit that captured the outdated replay path.
- `origin/codex2/ph1gc-bpl-001-unblock-history-repair@867b4b851da582458e0e4c9431646452f8c2d3a2`
  is the intermediate pushed commit that refreshed the note once but still
  claimed `1e9d6445` was the live helper tip.
- `origin/codex2/ph1gc-bpl-001-unblock-history-repair@9e0055b3169db2d249afb85600606346b5a82806`
  is the later pushed commit that corrected the review-state diagnosis but still
  carried forward `867b4b85` and parent tip `6e3228a1` as live refs.
- `codex/ph1gc-bpl-001-unblock-history-repair@6607dea8` remains useful only as
  audit evidence that one helper alias had already been refreshed to the merged
  trunk while the active helper note still described the old blockage.

### Verified facts

- `git ls-tree -r origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  returns the audit path on trunk.
- `git show --stat --summary origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  shows commit `6607dea8` created that file on `origin/dev` via PR `#237`.
- Canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
  now records `PH1GC-BPL-001` as `done` with an updated closeout-oriented
  `next` field.
- Canonical `/home/edna/workspace/drts-fleet-platform/current-work.md`
  mirrors the parent as `done`, not `blocked`.
- `git branch -vv | grep 'ph1gc-bpl-001'`
  shows `codex2/ph1gc-bpl-001` now points to `7c818c27`, while the older
  `codex/ph1gc-bpl-001` branch is still behind trunk by one commit.

## Non-Destructive Repair Path

Do not rewrite or force-push any shared branch.

1. Preserve `1e9d6445` as historical evidence of the stale diagnosis.
2. Preserve `867b4b85` as evidence that the helper branch moved forward but the
   artifact text itself still needed one more repair pass.
3. Preserve `9e0055b3` as evidence that the diagnosis was corrected before the
   live-ref section was fully refreshed.
4. Publish this corrected helper note on the same branch/PR so the audit trail
   shows the exact progression from stale diagnosis to fully consistent current
   refs.
5. Do not reopen the parent as `blocked`. Canonical machine truth already has
   the correct unblocked posture: the parent is `done`.
6. Preserve the current owner closeout branch/result on
   `codex2/ph1gc-bpl-001@7c818c27`; do not route follow-up work through the
   older behind-trunk `codex/ph1gc-bpl-001` branch alias.

## Parent Next Step

No additional parent machine-truth rewrite is required in this helper task.
Canonical `PH1GC-BPL-001.next` already records the final unblocked closeout:

`Updated docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md to reconcile against origin/dev 6607dea8 and canonical current-work.md 2026-05-22T08:49:48Z; normalized every workflow-family Closure line to a single directive §A label; verified no residual mixed closure labels and no 'to discuss' wording remains.`

Operationally, the resulting parent state is:

1. Parent task `PH1GC-BPL-001` is already closed on
   `codex2/ph1gc-bpl-001@7c818c27`.
2. Commit `7c818c27` is already pushed to `origin/codex2/ph1gc-bpl-001`.
3. No replay of doc content and no force-push of shared history is part of the
   valid path anymore.

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- The merged canonical audit file on `origin/dev` stays untouched.
- The stale helper commits remain visible as audit evidence.
- The parent proceeds from current closeout-state truth instead of replaying
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
  - `git show --no-patch --pretty=fuller 9e0055b3`
