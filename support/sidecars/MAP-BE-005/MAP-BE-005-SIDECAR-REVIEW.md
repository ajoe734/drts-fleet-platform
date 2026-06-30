# MAP-BE-005 Review Packet & Evidence Summary

- **Sidecar Kind:** `review_packet`
- **Parent Task:** `MAP-BE-005`
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Sidecar Owner / Reviewer:** `Codex` / `Codex2`
- **Generated:** `2026-06-30` (UTC)
- **Snapshot Basis:** `scripts/ai-status.sh show`, `ai-activity-log.jsonl`, `git show`, `git blame`, `git rev-parse`, and current code anchors
**Status:** `REVIEW SUPPORT ARTIFACT`

This packet is support-only. It does not modify canonical truth or parent
implementation files. Its job is to give the sidecar reviewer one place to
audit:

- the parent `MAP-BE-005` machine-truth state and lifecycle
- the recorded handoff evidence from the parent owner
- the exact current code anchors that implement the claimed spatial-audit slice
- the revision-history caveat that the `MAP-BE-005` surface is already present
  on `origin/dev`, but not under a standalone `MAP-BE-005` closeout commit

The main reviewer caveat is that `MAP-BE-005` is still `review` in machine
truth, but the relevant code is already on `origin/dev` and current `HEAD`
through commit `deb5e1d366f1789c29bd26818b14ffcb801a43a3`
(`MAP-BE-004: finalize service-area booking creation enforcement (#1013)`).
That means the reviewer should audit the current code anchors and the parent's
recorded handoff summary, not expect a task-local `origin/dev...HEAD` diff for
this sidecar branch.

This revision was refreshed after the `2026-06-30T22:14:09Z` sidecar reopen.
It preserves the `2026-06-30T22:12:41Z` reviewed handoff checkpoint as the
audited state, but records the reopened owner-repair state separately so the
packet does not present a stale intermediate snapshot as timeless current
machine truth.

---

## 1. Scope Boundary

In scope:

- snapshot the `MAP-BE-005` parent row at packet-refresh time
- snapshot both the reopened sidecar row at packet-refresh time and the audited
  `2026-06-30T22:12:41Z` sidecar handoff state
- map the parent acceptance bullets to concrete current-file anchors
- summarize the parent's recorded verification evidence
- document the revision-history anomaly so review does not target the wrong
  comparison base
- hand the packet to the assigned reviewer without touching parent code

Out of scope:

- editing L1/L2 canonical truth
- editing parent implementation, tests, migrations, or contracts
- changing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  except through official status commands
- reconciling the parent task's eventual closeout state; that remains parent
  owner work after review

---

## 2. Machine-Truth Snapshots

### 2.1 Packet-refresh sidecar row (`2026-06-30T22:14:42Z`)

At packet-refresh time, `scripts/ai-status.sh show MAP-BE-005-SIDECAR-REVIEW`
recorded:

- `owner=Codex`
- `reviewer=Codex2`
- `status=in_progress`
- `last_update=2026-06-30T22:14:42Z`
- `helper_parent=MAP-BE-005`
- `helper_kind=review_packet`
- `mutates_canonical=false`
- `next=Refreshing the sidecar packet snapshot and timeline so the audited handoff state is separated from the current reopened state.`

This was the owner-repair state after `Codex2` reopened the sidecar at
`2026-06-30T22:14:09Z`.

### 2.2 Audited sidecar handoff checkpoint (`2026-06-30T22:12:41Z`)

The sidecar state under review immediately before the latest reopen was:

- `status=review`
- `last_update=2026-06-30T22:12:41Z`
- `handoff_agent=Codex`
- `handoff_target=Codex2`

This checkpoint is reconstructed from the `2026-06-30T22:12:41Z` `handoff`
entry plus the `2026-06-30T22:13:02Z` orchestrator note that the background
worker exited after advancing the task to `review`.

The distinction matters: Section 2.1 is the packet-refresh reopened repair
state;
this section is the reviewed handoff state that the previous packet revision
was trying to describe.

### 2.3 Parent row at packet-refresh time

At the same packet-refresh time, `scripts/ai-status.sh show MAP-BE-005`
recorded:

- `title=Persist service-area snapshot and spatial audit`
- `owner=Codex`
- `reviewer=Claude2`
- `status=review`
- `last_update=2026-06-30T15:08:59Z`
- `depends_on=MAP-BE-004`
- `planning_ref=docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `gap_ref=docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`

Recorded parent `next` summary:

- spatial-audit snapshot persistence implemented for booking/order creation
- `OwnedOrderSpatialAuditSnapshot` contracts added
- `order.spatialAudit` JSON field added
- stop-level coordinate provenance, actor/surface metadata, decision snapshot,
  geometry refs, missing-coordinate markers, and audit event refs added
- passenger, callcenter, and tenant/partner creation paths persist immutable
  snapshots when `ServiceAreaService` is available
- gates prefer the persisted snapshot after creation instead of re-evaluating
  later geometry
- text-only legacy orders are explicit `legacy_text` / manual-review snapshots
- phone recording linkage preserves service-area flags
- recorded validation passed for prettier, contracts typecheck/lint/test,
  api typecheck/lint, and targeted api unit tests

### 2.4 Parent lifecycle chain

Relevant `ai-activity-log.jsonl` entries for `MAP-BE-005`:

| Event | Timestamp UTC | Agent | Note |
| --- | --- | --- | --- |
| `assign` | `2026-06-30T14:32:58Z` | `Codex` | Initially assigned to `Claude2` with reviewer `Codex`. |
| `assign` | `2026-06-30T15:01:11Z` | `Codex` | Reassigned to `Codex` with reviewer `Claude2`. |
| `start` | `2026-06-30T15:01:12Z` | `Codex` | Started spatial-audit persistence and test work. |
| `handoff` | `2026-06-30T15:08:59Z` | `Codex` | Handed implementation to `Claude2` with detailed evidence and validation results. |

There are no later parent `review_approved` or `done` events yet in machine
truth. The authoritative parent state remains `review`.

### 2.5 Sidecar lifecycle chain

Relevant `ai-activity-log.jsonl` entries for `MAP-BE-005-SIDECAR-REVIEW`:

| Event | Timestamp UTC | Agent | Note |
| --- | --- | --- | --- |
| `assign` | `2026-06-30T21:27:58Z` | `Codex` | Sidecar auto-assigned to `Gemini2` with reviewer `Codex`. |
| `sidecar_task_created` | `2026-06-30T21:28:00Z` | `Orchestrator` | Review-packet sidecar created for `MAP-BE-005`. |
| `worker_failed` | `2026-06-30T21:28:05Z` | `Orchestrator` | First `Gemini2` worker exited before terminal status. |
| `worker_failed` | `2026-06-30T21:28:15Z` | `Orchestrator` | Second `Gemini2` worker exited before terminal status. |
| `chair_reassignment_applied` | `2026-06-30T21:33:31Z` | `Orchestrator` | Owner reassigned from `Gemini2` to `Gemini`. |
| `task_proactive_rebalanced` | `2026-06-30T22:03:34Z` | `Orchestrator` | Availability-first reassignment moved owner from `Gemini` to `Codex` and reviewer from `Codex` to `Codex2`. |
| `start` | `2026-06-30T22:04:07Z` | `Codex` | Current sidecar owner started packet preparation. |
| `handoff` | `2026-06-30T22:08:28Z` | `Codex` | First packet revision handed to `Codex2` with a claim that `git diff --check` passed for the packet. |
| `reopen` | `2026-06-30T22:09:40Z` | `Codex2` | Review failed because commit `4a47b84c6` still carried trailing whitespace on opening metadata lines, so the recorded packet validation was not self-consistent. |
| `progress` | `2026-06-30T22:10:06Z` | `Codex` | Repairing the packet and refreshing the validation evidence before re-handoff. |
| `handoff` | `2026-06-30T22:12:41Z` | `Codex` | Repaired packet revision handed to `Codex2` with clean `git show --check HEAD` and no trailing-whitespace matches. |
| `worker_completed` | `2026-06-30T22:13:02Z` | `Orchestrator` | Background worker exited after advancing the task to `review`. |
| `reopen` | `2026-06-30T22:14:09Z` | `Codex2` | Review failed because the packet still described the `22:10:06Z` repair snapshot as current after the `22:12:41Z` handoff had already moved machine truth back to `review`. |
| `progress` | `2026-06-30T22:14:42Z` | `Codex` | Refreshing the packet snapshot and timeline so the audited handoff state is separated from the current reopened state. |

The key lifecycle fact is that the sidecar really did return to `review` at
`2026-06-30T22:12:41Z` and only moved back to `in_progress` when the reviewer
reopened it at `2026-06-30T22:14:09Z`.

---

## 3. Revision And Branch Caveat

Current repository facts in this sidecar worktree:

- `git rev-parse HEAD` and `git rev-parse origin/dev` both resolve to
  `f452f019f9d887850c907a28a60ce627b930049b`
- `git diff origin/dev...HEAD` is empty
- the sidecar branch therefore carries no task-local diff before this packet is
  added

However, `git blame` on the key `MAP-BE-005` lines attributes the current
implementation to commit `deb5e1d366f1789c29bd26818b14ffcb801a43a3`, whose
subject is:

- `MAP-BE-004: finalize service-area booking creation enforcement (#1013)`

`git show --stat --format=fuller deb5e1d36` confirms that commit already
contains the main `MAP-BE-005` surfaces:

- `packages/contracts/src/index.ts` `+433`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` `+614 / -3`
- `apps/api/tests/unit/owned-mobility.service.test.ts` `+401`
- `apps/api/tests/unit/service-area.service.test.ts` `+404`
- plus the `geo` and `service-area` module/controller/repository/service files

Review implication:

- do not expect a dedicated `MAP-BE-005` closeout commit on this branch
- do not use `origin/dev...HEAD` as the proof surface for the parent task
- use the current-file anchors in Sections 4 and 5 plus the parent handoff
  evidence from machine truth

### 3.1 Reopen Cause And Repair Target

The first sidecar handoff used commit `4a47b84c6`, which added this packet as a
new file. `git show --check 4a47b84c6 -- support/sidecars/MAP-BE-005/MAP-BE-005-SIDECAR-REVIEW.md`
reports trailing whitespace on the opening metadata lines because that revision
used Markdown hard-break spacing.

Repair implication:

- the reopen was about packet formatting / validation consistency, not parent
  scope drift
- this revision removes the metadata trailing whitespace instead of relying on
  hard-break formatting
- reviewer validation for the re-handoff should target the current `HEAD`, not
  the superseded `4a47b84c6` handoff note

---

## 4. Acceptance-To-Evidence Map

### 4.1 `created orders store coordinate provenance`

Contracts:

- `packages/contracts/src/index.ts:96-103` adds `GEO_COORDINATE_SOURCES`,
  including `legacy_text`
- `packages/contracts/src/index.ts:586-603` defines
  `OwnedOrderSpatialAuditSnapshot`
- `packages/contracts/src/index.ts:2960` adds `spatialAudit?` to
  `OwnedOrderRecord`

Creation and snapshot capture:

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:466-474`
  applies service-area creation policy for passenger orders
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:608-616`
  applies service-area creation policy for callcenter orders
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:804-808`
  applies service-area creation policy for tenant bookings
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6216-6247`
  builds the immutable spatial snapshot with actor, surface, product, decision,
  stop snapshots, geometry refs, reason codes, and missing items
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6250-6308`
  builds stop-level location and coordinate provenance, including fallback to
  `manual_pin` or `legacy_text`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6565-6578`
  resolves tenant vs partner booking actor/surface context

### 4.2 `evaluation snapshot immutable`

Snapshot-first gate resolution:

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6145-6146`
  prefers `order.spatialAudit` when present
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6197-6213`
  reconstructs service-area gate data from the stored snapshot, not a fresh
  evaluator call
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6519-6555`
  deep-clones stored service-area evaluations and spatial snapshots
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:7234-7238`
  returns cloned `spatialAudit` data from `getOrder`, preventing caller mutation
  from mutating the stored record

Test proof:

- `apps/api/tests/unit/owned-mobility.service.test.ts:454-557`
  mutates the first returned snapshot, confirms evaluator is only called once,
  and verifies a fresh read still shows the original serviceable snapshot and
  evidence refs

### 4.3 `audit events emitted`

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6319-6365`
  emits `order.spatial_audit.snapshot_created` and stores audit-event refs back
  into the snapshot
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6515`
  threads `spatialAuditSnapshotId` into later service-area audit summaries

Test proof:

- `apps/api/tests/unit/owned-mobility.service.test.ts:371-387`
  asserts the audit log is recorded with actor, surface, decision, request id,
  and provenance completeness

### 4.4 `legacy text-only state explicit`

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6070-6072`
  adds the `service_area_legacy_text_manual_review` compliance flag when
  coordinates are missing
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6293-6295`
  falls back to `legacy_text` when no coordinates exist
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6123-6138`
  blocks dispatch when review-required gates remain

Test proof:

- `apps/api/tests/unit/owned-mobility.service.test.ts:390-452`
  verifies missing pickup/dropoff coordinates become explicit `legacy_text`
  provenance, queue the order into manual review, and prevent auto-dispatch

### 4.5 `api tests pass`

The parent handoff message recorded in machine truth claims these checks passed:

- `pnpm exec prettier --check packages/contracts/src/index.ts apps/api/src/modules/owned-mobility/owned-mobility.service.ts apps/api/tests/unit/owned-mobility.service.test.ts`
- `pnpm --filter @drts/contracts typecheck`
- `pnpm --filter @drts/contracts lint`
- `pnpm --filter @drts/contracts test` (`No test files found`, allowed by `--passWithNoTests`)
- `pnpm --filter @drts/api typecheck`
- `pnpm --filter @drts/api lint`
- `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/owned-mobility.service.test.ts apps/api/tests/unit/service-area.service.test.ts`
  with `86` files / `684` tests

This sidecar packet does not independently rerun those commands. It records the
parent owner's handoff evidence and maps it back to current anchors.

---

## 5. Reviewer Hotspots

Prioritize these checks during review:

1. Passenger, callcenter, and tenant/partner creation must all route through
   `applyServiceAreaCreationPolicy(...)` before persistence.
2. `createCallCenterOrder` must keep service-area flags when recording linkage
   updates the order; `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:627-639`
   should only remove `recording_pending`, then add `recording_bound`.
3. `resolveServiceAreaGate(...)` must use stored snapshots whenever
   `order.spatialAudit` exists; otherwise support/compliance would see a later
   geometry decision instead of the intake-time decision.
4. `cloneSpatialAuditSnapshot(...)` plus the `getOrder(...)` clone path must be
   deep enough that callers cannot mutate stored snapshot state.
5. Legacy text-only orders must remain explicit manual-review cases rather than
   silently flowing into normal dispatch.
6. Treat the revision history carefully: current `HEAD` already contains the
   parent surface, but the parent task is still `review`. Do not treat that as
   parent closeout; it is a review-context caveat only.

---

## 6. Suggested Reviewer Commands

If the reviewer wants to reproduce the evidence quickly:

- `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-005-SIDECAR-REVIEW`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-005`
- `git show --check HEAD -- support/sidecars/MAP-BE-005/MAP-BE-005-SIDECAR-REVIEW.md`
- `grep -n '[[:blank:]]$' support/sidecars/MAP-BE-005/MAP-BE-005-SIDECAR-REVIEW.md`
- `git show --stat --format=fuller deb5e1d36`
- `git blame -L 586,603 packages/contracts/src/index.ts`
- `git blame -L 6062,6555 apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `git blame -L 289,557 apps/api/tests/unit/owned-mobility.service.test.ts`

Optional validation rerun, if the reviewer wants fresh execution instead of
accepting the parent handoff evidence:

- `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/owned-mobility.service.test.ts apps/api/tests/unit/service-area.service.test.ts`

---

## 7. Sidecar Scope Compliance

- [x] Support artifact only: this packet is the only intended file for the
  sidecar slice
- [x] No canonical-truth edits: parent code, docs, contracts, and runtime are
  unchanged by this packet
- [x] Reopen addressed: the previous `4a47b84c6` whitespace-only validation
  mismatch is repaired in this revision
- [x] Current-state drift addressed: the packet now separates the
  `2026-06-30T22:12:41Z` audited handoff checkpoint from the
  `2026-06-30T22:14:42Z` reopened repair state
- [x] Reviewer re-handoff ready: once this revision is committed and validated,
  the owner can hand the updated packet back to `Codex2`

---

## 8. Repair Summary

- Prior handoff `2026-06-30T22:08:28Z` over-claimed packet validation on
  `4a47b84c6`.
- Root cause was metadata-line trailing whitespace introduced by Markdown
  hard-break formatting.
- Re-handoff `2026-06-30T22:12:41Z` fixed the whitespace issue but still left
  the packet describing the earlier `22:10:06Z` repair snapshot as if it were
  the current reviewed state.
- This revision keeps both later states explicit: the audited handoff
  checkpoint at `2026-06-30T22:12:41Z` and the current reopened repair state at
  `2026-06-30T22:14:42Z`.
- Fresh handoff evidence should cite the current repair commit and a whitespace
  clean validation result for this file.

---

## 9. Handoff Note

When handing this packet to `Codex2`, summarize:

- the packet now distinguishes the `2026-06-30T22:12:41Z` audited handoff
  checkpoint from the packet-refresh reopened repair state
- the packet-refresh snapshot shows `in_progress` only because `Codex2`
  reopened the sidecar at `2026-06-30T22:14:09Z`; after re-handoff machine
  truth should return to `review`
- parent `MAP-BE-005` is still `review` in machine truth
- the implementation surface is already present on `origin/dev` / current `HEAD`
- current review should target the anchors in this packet plus the recorded
  parent handoff evidence
- the key anomaly is that `deb5e1d36` (labeled `MAP-BE-004`) already contains
  the main `MAP-BE-005` code surface
- the earlier `4a47b84c6` packet handoff was reopened for trailing whitespace;
  the current commit is the packet-repair revision

If the sidecar review passes, the reviewer should run:

- `AI_NAME=Codex2 scripts/ai-status.sh approve MAP-BE-005-SIDECAR-REVIEW "<review conclusion>"`

After that, the owner can handle sidecar closeout according to the normal
review-approved → done protocol.
