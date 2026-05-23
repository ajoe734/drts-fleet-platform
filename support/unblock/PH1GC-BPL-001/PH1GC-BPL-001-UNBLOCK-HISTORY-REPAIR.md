# PH1GC-BPL-001 Unblock History Repair

## Scope

- Task: `PH1GC-BPL-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PH1GC-BPL-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Audit timestamp: `2026-05-23`

## Current Canonical State

This helper task is still needed, but the remaining blockage is narrower than
the earlier note claimed.

1. `origin/dev@0150cbe4e56505854d375211e25d2ab82e948fc0` currently contains
   `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`.
2. `git show origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
   still traces that file back to trunk commit
   `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21` from PR `#237`
   (`PH1GC-DOC-BATCH-1: deliver BPL-001/002/003 + PARTNER-001 + FIN-GOV-001 +
   ADM-001 (#237)`).
3. `origin/codex2/ph1gc-bpl-001@7c818c2743f5f10c891945c5a54e3788456a2bfa`
   already holds the parent closeout commit
   `docs(PH1GC-BPL-001): finalize blueprint alignment audit`.
4. Canonical machine truth has not caught up: `ai-status.json` and
   `current-work.md` still show `PH1GC-BPL-001` as `blocked` with the
   2026-05-22 blocker text claiming `origin/dev` does not contain the audit
   file and that only `origin/docs/ph1gc-doc-batch-1-20260522@7dd7a23b`
   carries the content.
5. The active helper branch is now
   `origin/codex2/ph1gc-bpl-001-unblock-history-repair@59558b678d1b9c34448a0e3143b7e2cce8e9b347`.

## Exact Contamination

The parent is no longer blocked by missing content on trunk. It is blocked by
stale branch and commit conclusions that survived into machine truth.

1. Earlier diagnosis was correct for a pre-merge snapshot where the audit file
   had not yet landed on `origin/dev`.
2. PR `#237` moved shared history forward by landing the audit file on trunk at
   `6607dea8`, but the parent task's blocker message was not refreshed after
   trunk moved.
3. Parent task `PH1GC-BPL-001` therefore still points to an obsolete absence
   claim and to the no-longer-authoritative delivery ref
   `origin/docs/ph1gc-doc-batch-1-20260522@7dd7a23b`.
4. Helper history then accumulated several commits whose artifact text lagged
   behind the helper branch tip itself:
   `1e9d6445` -> `867b4b85` -> `9e0055b3` -> `3f2f790f` -> `71639a72` ->
   `59558b67`.
5. Those helper commits are not themselves harmful, but they show the same
   class of contamination: self-referential or stale ref labels surviving after
   the branch had already advanced.
6. The exact blocker that still keeps the parent closed off from completion is
   now the stale parent blocker recorded in canonical machine truth, not a need
   to replay docs, re-land commits, or rewrite shared history.

## Evidence

### Current refs

- `origin/dev @ 0150cbe4e56505854d375211e25d2ab82e948fc0`
- audit file introduction on trunk:
  `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- `origin/codex2/ph1gc-bpl-001 @ 7c818c2743f5f10c891945c5a54e3788456a2bfa`
- `origin/codex2/ph1gc-bpl-001-unblock-history-repair @ 59558b678d1b9c34448a0e3143b7e2cce8e9b347`
- stale branch alias still behind trunk:
  `codex/ph1gc-bpl-001 @ 6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- `origin/codex2/ph1gc-bpl-001-sidecar-acceptance @ 158629cc66051e1c32c1107813d70f9e4c09430e`

### Stale-state evidence

- Parent machine truth at `ai-status.json` still records:
  - `status: blocked`
  - `last_update: 2026-05-22T06:47:57Z`
  - blocker text claiming `origin/dev` lacks the audit file and citing
    `origin/docs/ph1gc-doc-batch-1-20260522@7dd7a23b`
- `current-work.md` still mirrors the same blocker entry.
- Helper branch history records the note repair chain:
  - `1e9d6445c16cca4bd094aa1faa5549284a49eb26`
  - `867b4b851da582458e0e4c9431646452f8c2d3a2`
  - `9e0055b3169db2d249afb85600606346b5a82806`
  - `3f2f790f6c97278cd5cad4b72ea0504004a8fb57`
  - `71639a72cd89eec74afe9bed075b8d4fbaf3b4ac`
  - `59558b678d1b9c34448a0e3143b7e2cce8e9b347`

## Non-Destructive Repair Path

Do not rewrite or force-push any shared branch.

1. Preserve the existing helper history as audit evidence of how the stale
   diagnosis propagated.
2. Preserve parent closeout commit `7c818c27` on
   `origin/codex2/ph1gc-bpl-001`; do not replay the doc change on a new branch.
3. Treat `origin/dev` as the canonical source for the audit file's landed
   state; trunk already has the required content.
4. Use this helper task to clear the stale blocker by updating the parent's
   machine-truth next step instead of reopening a history-rewrite path.
5. Resume parent `PH1GC-BPL-001` at `todo` with this concrete next step:
   owner `Codex` should finalize the parent using existing evidence
   (`origin/dev` contains the audit file; closeout commit `7c818c27` is already
   pushed on `origin/codex2/ph1gc-bpl-001`), then record the normal non-force
   closeout metadata in machine truth.
6. Do not route follow-up work through the stale `codex/ph1gc-bpl-001` branch
   alias and do not describe the old doc-batch ref as the canonical source.
7. Use this helper branch's pushed closeout commit `59558b67` as the canonical
   task-scoped evidence for the unblock diagnosis refresh.

## Parent Next Step

The parent is unblocked once its stale blocker is removed. The next valid
action is:

`Codex closes PH1GC-BPL-001 from existing evidence: confirm origin/dev still contains docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md, use pushed closeout commit 7c818c27 on origin/codex2/ph1gc-bpl-001 as commit/push evidence, then move the parent out of blocked without replaying content or force-pushing history.`

## Why This Is Safe

- No shared branch is rewritten.
- No force-push is required.
- No doc replay is required.
- The merged canonical audit file on `origin/dev` stays untouched.
- The stale helper commits remain visible as audit evidence.
- The only repair is to align machine truth and follow-up routing with the
  history that already exists.

## Verification Performed For This Repair

- Read `AI_COLLABORATION_GUIDE.md`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json`
- Inspected canonical `/home/edna/workspace/drts-fleet-platform/current-work.md`
- Verified current trunk content with:
  - `git ls-tree -r origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  - `git show --stat --summary origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
- Verified current helper and parent refs with:
  - `git rev-parse origin/dev`
  - `git rev-parse origin/codex2/ph1gc-bpl-001`
  - `git rev-parse origin/codex2/ph1gc-bpl-001-unblock-history-repair`
  - `git rev-parse codex/ph1gc-bpl-001`
- Verified closeout commit evidence with:
  - `git show --no-patch --format=fuller 7c818c27`
  - `git show --no-patch --format=fuller 59558b67`
  - `git ls-remote --heads origin codex2/ph1gc-bpl-001 codex2/ph1gc-bpl-001-unblock-history-repair`
- Verified helper history progression with:
  - `git log --decorate --oneline --max-count=12 codex2/ph1gc-bpl-001-unblock-history-repair`
