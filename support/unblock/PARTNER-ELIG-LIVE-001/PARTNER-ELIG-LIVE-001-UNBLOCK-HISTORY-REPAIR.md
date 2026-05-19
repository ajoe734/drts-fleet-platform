# PARTNER-ELIG-LIVE-001 History Repair

- Task: `PARTNER-ELIG-LIVE-001-UNBLOCK-HISTORY-REPAIR`
- Parent: `PARTNER-ELIG-LIVE-001`
- Owner: `Codex`
- Reviewer: `Codex2`
- Date: `2026-05-19`
- Status: `documented non-force repair path; canonical parent next step verified`

## Diagnosis

`PARTNER-ELIG-LIVE-001` is genuinely blocked on external issuer and bank
inputs, but the unblock path became noisy because several isolated worktrees
kept tracked `ai-status.json` and `current-work.md` snapshots that were older
than the canonical machine-truth root behind `AI_STATUS_ROOT` and
`ORCH_STATUS_ROOT`.

The contamination is not a hidden product gap. It is stale branch-local machine
truth plus helper commits that preserved those stale reads.

## Exact contamination

### 1. Stale branch-local machine-truth snapshots

Canonical machine truth lives at:

- root: `/home/edna/workspace/drts-fleet-platform`
- `ai-status.json updated_at`: `2026-05-19T19:36:26Z`
- `current-work.md` mtime: `2026-05-19T19:36:37Z`

By the time this repair started, canonical truth already recorded:

- `PRT-SPEC-001 status=done`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK status=done`
- `PARTNER-ELIG-LIVE-001 status=blocked` with the explicit
  `EXT-001-BLK-001..006` hold sequence
- `PARTNER-ELIG-LIVE-001-UNBLOCK-HISTORY-REPAIR status=in_progress`

Three related isolated worktrees still carried an older snapshot:

- worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-partner-elig-live-001-unblock-manual-unblock`
  - local file mtimes: `2026-05-19T18:43:17Z`
  - local `ai-status.json updated_at`: `2026-05-19T15:56:57Z`
  - local snapshot state:
    - `PRT-SPEC-001 status=review`
    - `PARTNER-ELIG-LIVE-001 status=blocked`
      with `next="Held — see conflicts doc / external resources"`
    - both unblock child tasks absent from the local task board
- worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-partner-elig-live-001`
  - local file mtimes: `2026-05-19T19:09:06Z`
  - local `ai-status.json updated_at`: still `2026-05-19T15:56:57Z`
  - same stale task states as above
- worktree:
  `/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-partner-elig-live-001-unblock-manual-unblock-sidecar-acceptance`
  - local file mtimes: `2026-05-19T18:47:31Z` to `18:47:32Z`
  - local `ai-status.json updated_at`: still `2026-05-19T15:56:57Z`
  - same stale task states as above

This is the precise stale-snapshot mismatch: the workers saw tracked repo
copies from `15:56:57Z`, while `scripts/ai-status.sh` was writing newer truth
to the canonical root.

### 2. Stale conclusions were preserved in task-scoped commits

The stale snapshot then propagated into published helper branches:

- `origin/codex2/partner-elig-live-001-unblock-manual-unblock@052de19`
  documents that `PRT-SPEC-001` is still `review` and therefore the parent is
  not yet dependency-ready
- `origin/claude/partner-elig-live-001-unblock-manual-unblock-sidecar-acceptance@61b7960`
  copied the same stale baseline into its dependency map:
  - helper still `review`
  - helper reviewer still `Claude2`
  - `PRT-SPEC-001` closeout cited as `618d7c9`
  - grandparent sidecar path described as future-only, not yet anchored

Those branches are historically valid. They reflect what the workers saw before
canonical truth moved. But they are stale as current unblock guidance.

### 3. Later branches corrected the unblock path without rewriting history

Canonical truth moved forward on new commits instead of rewriting old ones:

- `origin/codex2/prt-spec-001@bea9ffe` superseded the earlier
  `618d7c9` closeout path and finalized `PRT-SPEC-001` with the reviewed
  `WF-PARTNER-001` naming
- `origin/codex2/partner-elig-live-001-unblock-manual-unblock@8d5c47c`
  closed the unblock helper and recorded the parent as blocked only on
  `EXT-001-BLK-001..006`
- `origin/codex/partner-elig-live-001@2628fc7` anchored the parent hold-state
  packet `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`
- `origin/claude/partner-elig-live-001-unblock-manual-unblock-sidecar-acceptance@e4dcbb1`
  refreshed the sidecar packet to current truth:
  - helper `done`
  - reviewer `Codex`
  - `PRT-SPEC-001` closeout corrected to `bea9ffe`
  - parent sidecar anchor corrected to `2628fc7`

The shared-history repair is therefore additive: newer task-scoped branches
supersede stale helper readings without deleting them.

### 4. Temporary parent status drift was already replayed and corrected

`ai-activity-log.jsonl` shows a second contamination layer in task history:

- `2026-05-19T19:04:01Z`: `Codex2` closed
  `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK` and recorded the correct
  parent hold message through `parent_resume`
- `2026-05-19T19:08:53Z`: `Orchestrator` emitted
  `chair_parent_resume_applied` with `resume_status="todo"`, briefly treating
  the parent like a resumed owner task after the unblock child finished
- `2026-05-19T19:16:57Z`: `Codex` re-blocked the parent after anchoring
  `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`
  at `2628fc7`, restoring the explicit `EXT-001-BLK-001..006` next step

That drift explains why the sidecar-acceptance refresh log briefly discussed
the grandparent as `in_progress` before later correcting it back to `blocked`.

## Non-force repair path

Do not rewrite or force-push any published branch. The safe repair is:

1. Treat the canonical root behind `scripts/ai-status.sh` as the only
   authoritative machine truth for task state.
2. Treat tracked `ai-status.json` and `current-work.md` copies inside isolated
   worktrees as stale snapshots unless they were freshly synced from the
   canonical root.
3. Preserve these stale but legitimate history points:
   - `052de19` on
     `origin/codex2/partner-elig-live-001-unblock-manual-unblock`
   - `61b7960` on
     `origin/claude/partner-elig-live-001-unblock-manual-unblock-sidecar-acceptance`
   - the temporary `chair_parent_resume_applied` log event at
     `2026-05-19T19:08:53Z`
4. Use the newer task-scoped branches as the canonical repair chain:
   - `bea9ffe` for `PRT-SPEC-001`
   - `8d5c47c` for the unblock helper closeout
   - `2628fc7` for the parent hold-state evidence packet
   - `e4dcbb1` for the refreshed support-sidecar dependency map
5. Keep this repair task additive and documentary on its own branch
   `codex/partner-elig-live-001-unblock-history-repair`, which starts at
   `origin/dev@2103814` and therefore intentionally replays the resolution as a
   new evidence note instead of modifying older helper branches.

This path preserves all prior commits, avoids force-pushing shared history, and
still leaves one auditable canonical unblock chain.

## Canonical parent next step

The parent should remain blocked on external issuer inputs only.

Canonical next step as of `2026-05-19T19:16:57Z`:

1. Keep `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`
   as the reserved parent evidence packet anchored at `2628fc7`.
2. Wait for `EXT-001-BLK-001` through `EXT-001-BLK-006`:
   - issuer or bank API contract authority
   - sandbox credentials and allowlist
   - issuer-approved eligible, ineligible, and timeout fixtures
   - timeout and retry confirmation
   - manual-review fallback sign-off
   - sensitive-data handling and retention approval
3. When those inputs arrive, attach redacted evidence under that sidecar path
   and rerun the live issuer proof from the parent task.

No further branch repair or force-push is required for the parent to stay on
the correct unblock path.

## Evidence checked

- canonical machine truth:
  - `/home/edna/workspace/drts-fleet-platform/ai-status.json`
  - `/home/edna/workspace/drts-fleet-platform/current-work.md`
  - `/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`
- stale worktree snapshots:
  - `codex2-partner-elig-live-001-unblock-manual-unblock`
  - `codex-partner-elig-live-001`
  - `claude-partner-elig-live-001-unblock-manual-unblock-sidecar-acceptance`
- task-scoped commits:
  - `052de19`
  - `61b7960`
  - `8d5c47c`
  - `2628fc7`
  - `e4dcbb1`
  - `618d7c9`
  - `0b4edb4`
  - `bea9ffe`
