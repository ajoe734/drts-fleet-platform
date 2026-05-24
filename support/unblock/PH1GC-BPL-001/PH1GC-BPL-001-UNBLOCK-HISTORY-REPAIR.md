# PH1GC-BPL-001 Unblock History Repair

## Scope

- Task: `PH1GC-BPL-001-UNBLOCK-HISTORY-REPAIR`
- Dispatch parent: `PH1GC-BPL-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Audit timestamp: `2026-05-24`
- Canonical machine-truth root:
  `/home/edna/workspace/drts-fleet-platform`
- Assigned helper worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-ph1gc-bpl-001-unblock-history-repair`
- Assigned helper branch:
  `codex/ph1gc-bpl-001-unblock-history-repair`

## Diagnosis

`PH1GC-BPL-001` is no longer blocked by missing content on trunk. The remaining
block is branch/history/machine-truth contamination.

1. `origin/dev` now contains
   `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`; trunk
   currently resolves to `febc3fafc078e04bd58c8e3580894521f3adc1f2`, and the
   audit file still traces back to shared merge commit
   `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
   (`PH1GC-DOC-BATCH-1: deliver BPL-001/002/003 + PARTNER-001 + FIN-GOV-001 +
   ADM-001 (#237)`).
2. The live owner branch for the parent task is now
   `origin/codex/ph1gc-bpl-001 @ 07983c8e7fa6d57d1378a041b40c436f3e2989cb`,
   which already records owner closeout verification for `PH1GC-BPL-001`.
3. An older parallel parent branch still exists on another lane:
   `origin/codex2/ph1gc-bpl-001 @ 7c818c2743f5f10c891945c5a54e3788456a2bfa`.
   It is valid audit history, but it is no longer the parent branch named by
   canonical machine truth.
4. An earlier helper packet also already exists on the other lane:
   `origin/codex2/ph1gc-bpl-001-unblock-history-repair @ c77cc04b1e7290eccd9aa0746118c2a6da8808c7`.
   That branch contains the prior repair chain
   `1e9d6445 -> 867b4b85 -> 9e0055b3 -> 3f2f790f -> 71639a72 -> 59558b67 -> 7b573b8b -> c77cc04b`.
5. The currently assigned Codex helper branch was created locally from
   `origin/dev` at `6607dea8` and never received that existing helper history.
   `git reflog` shows only one event:
   `2026-05-22 08:18:54 +0000 branch: Created from origin/dev`.
6. Canonical machine truth still says the parent is blocked because `origin/dev`
   lacks the audit file and because the content lives only on
   `origin/docs/ph1gc-doc-batch-1-20260522@7dd7a23b`. Both claims are now
   obsolete.
7. Canonical status writes were also partially jammed on `2026-05-24` because
   five open blockers in canonical `ai-status.json` used legacy `reason`
   instead of `message`, which made `scripts/ai_status.py` crash while
   regenerating `current-work.md`.

The parent is therefore blocked by stale routing and stale machine-truth
conclusions, not by missing delivery content.

## Evidence

### 1. Current canonical refs

- `origin/dev @ febc3fafc078e04bd58c8e3580894521f3adc1f2`
- audit file exists on trunk:
  `git ls-tree -r origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  returns blob `d17f3d1cb1b52b9404c6f630fbc2b2a306eb5068`
- audit file introduction on trunk:
  `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
- live parent branch:
  `origin/codex/ph1gc-bpl-001 @ 07983c8e7fa6d57d1378a041b40c436f3e2989cb`
- older parent audit branch:
  `origin/codex2/ph1gc-bpl-001 @ 7c818c2743f5f10c891945c5a54e3788456a2bfa`
- older helper branch:
  `origin/codex2/ph1gc-bpl-001-unblock-history-repair @ c77cc04b1e7290eccd9aa0746118c2a6da8808c7`
- assigned helper branch before this repair:
  local `codex/ph1gc-bpl-001-unblock-history-repair @ 6607dea8`
- remote helper branch before this repair:
  `origin/codex/ph1gc-bpl-001-unblock-history-repair` did not exist

### 2. Parent branch evidence already exists

- `origin/codex/ph1gc-bpl-001` carries closeout commit
  `07983c8e7fa6d57d1378a041b40c436f3e2989cb`
  (`PH1GC-BPL-001: record owner closeout verification`)
- that commit explicitly records:
  - `LLM-Agent: Codex`
  - `Task-ID: PH1GC-BPL-001`
  - `Reviewer: Codex2`
  - verification including `git ls-tree -r origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
- `origin/codex2/ph1gc-bpl-001` still carries the earlier review/closeout
  commit `7c818c27`, but canonical machine truth no longer names that branch as
  the parent owner branch

### 3. Assigned helper branch contamination

- the helper worktree is on `codex/ph1gc-bpl-001-unblock-history-repair`
- `git reflog show codex/ph1gc-bpl-001-unblock-history-repair` shows only:
  `6607dea8 ... branch: Created from origin/dev`
- `git diff --stat 6607dea8..codex2/ph1gc-bpl-001-unblock-history-repair -- support/unblock`
  shows the entire historical helper packet is missing from the assigned branch
- `git merge-base codex/ph1gc-bpl-001-unblock-history-repair codex2/ph1gc-bpl-001-unblock-history-repair`
  is `6607dea8`, proving the assigned helper branch forked before any helper
  repair commits were added

### 4. Canonical machine truth is stale

Canonical `/home/edna/workspace/drts-fleet-platform/ai-status.json` still
records:

- `PH1GC-BPL-001 status=blocked`
- `waiting_for=Claude`
- `last_update=2026-05-22T06:47:57Z`
- blocker/next text claiming:
  - `origin/dev` does not contain the audit file
  - the artifact exists only on `origin/docs/ph1gc-doc-batch-1-20260522@7dd7a23b`
  - the parent has no task-scoped commit/push metadata usable for done

All three claims are false as of `2026-05-24`.

### 5. Canonical status-writer incompatibility

Canonical `ai-status.json` also carries five open Phase 1 blockers using this
shape:

- `task_id`
- `kind`
- `reason`
- `waiting_for`
- `raised_by`
- `raised_at`
- `status`
- `owner`

Because those entries lack `message`, `scripts/ai_status.py` raised
`KeyError: 'message'` while rendering `current-work.md`, which blocked normal
status updates until compatibility handling was restored.

## Exact Contamination

The exact contamination is four-part:

1. The parent's blocker in canonical machine truth froze a pre-merge view of
   trunk and never updated after `6607dea8` landed on `origin/dev`.
2. The assigned helper branch name on the Codex lane was created later as a
   fresh local branch from `origin/dev`, so it visually looks like the active
   repair branch but does not contain the real helper history already published
   on `origin/codex2/ph1gc-bpl-001-unblock-history-repair`.
3. The parent's actual owner branch moved to
   `origin/codex/ph1gc-bpl-001 @ 07983c8e`, but the stale blocker still points
   reviewers at the obsolete doc-batch branch instead of the pushed owner
   closeout commit.
4. The control-plane writer itself could not persist status corrections because
   canonical blockers mixed legacy `reason` fields with newer `message`-based
   rendering expectations.

This is branch/worktree/machine-truth contamination, not a missing-doc or
shared-history corruption problem.

## Non-Destructive Repair Path

Do not force-push, rewrite, or delete any published branch.

1. Preserve the older Codex2 helper branch and older Codex2 parent branch as
   audit history:
   - `origin/codex2/ph1gc-bpl-001`
   - `origin/codex2/ph1gc-bpl-001-unblock-history-repair`
2. Rebuild the current helper packet additively on the assigned Codex helper
   branch instead of rewriting either older branch family.
3. Treat trunk and the live owner branch as the canonical delivery evidence:
   - trunk content on `origin/dev`
   - owner closeout verification on `origin/codex/ph1gc-bpl-001 @ 07983c8e`
4. Restore status-writer compatibility by teaching `scripts/ai_status.py` to
   accept legacy blocker `reason` fields as `message` when normalizing and
   rendering canonical state.
5. Use normal status commands to move the helper task into progress/review and
   to remove the stale blocker from `PH1GC-BPL-001`.
6. Update the parent's next step to reference the real current evidence:
   `origin/dev` already contains the audit file, and
   `origin/codex/ph1gc-bpl-001 @ 07983c8e` already records owner closeout
   verification.
7. If a clean helper PR is later desired, open it from the pushed Codex helper
   branch created by this repair. Do not repurpose or rewrite the older Codex2
   helper branch.

## Concrete Parent Next Step

`PH1GC-BPL-001` should leave `blocked` and resume from existing evidence, not
from replayed docs:

1. confirm `origin/dev` still contains
   `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
2. use pushed owner-branch closeout evidence on
   `origin/codex/ph1gc-bpl-001 @ 07983c8e7fa6d57d1378a041b40c436f3e2989cb`
3. keep `PH1GC-DOC-BATCH-1 @ 6607dea8` as shared-history provenance only
4. do not reopen doc replay or force-push any PH1GC branch
5. finalize the parent through the normal non-force closeout path once review
   state is re-synchronized with the pushed evidence

## Why This Is Safe

- no shared branch is force-pushed
- no published helper history is lost
- trunk remains the canonical location of the audit file
- the live owner branch remains the canonical location of the parent closeout
  evidence
- the stale Codex2 helper chain remains reachable for audit purposes
- status updates resume through additive compatibility handling, not through
  manual edits to canonical machine truth

## Verification Performed

- read `AI_COLLABORATION_GUIDE.md`
- read `docs/ops/branch-strategy.md`
- read `.orchestrator/skills/worker-anchor-commit.md`
- inspected canonical machine truth:
  - `/home/edna/workspace/drts-fleet-platform/ai-status.json`
  - `/home/edna/workspace/drts-fleet-platform/current-work.md`
- verified current trunk and parent refs:
  - `git rev-parse origin/dev`
  - `git ls-tree -r origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  - `git log --oneline --max-count=3 origin/dev -- docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`
  - `git show --no-patch --format=fuller origin/codex/ph1gc-bpl-001`
  - `git show --no-patch --format=fuller origin/codex2/ph1gc-bpl-001`
- verified helper-branch lineage and absence of a pushed Codex helper branch:
  - `git reflog show codex/ph1gc-bpl-001-unblock-history-repair`
  - `git log --oneline codex2/ph1gc-bpl-001-unblock-history-repair`
  - `git diff --stat 6607dea8..codex2/ph1gc-bpl-001-unblock-history-repair -- support/unblock`
  - `git ls-remote --heads origin codex/ph1gc-bpl-001 codex/ph1gc-bpl-001-unblock-history-repair codex2/ph1gc-bpl-001 codex2/ph1gc-bpl-001-unblock-history-repair`
- inspected the canonical blocker mismatch and status-writer failure:
  - `python3 - <<'PY' ... Path('/home/edna/workspace/drts-fleet-platform/ai-status.json') ...`
  - confirmed five open blockers carry `reason` instead of `message`
  - reviewed `scripts/ai_status.py` `write_current_work()` / `normalize_state_agents()`

No runtime tests were run. This task is a history/status repair only.
