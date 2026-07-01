# MAP-BE-005 Review Packet & Evidence Summary

- **Sidecar Kind:** `review_packet`
- **Parent Task:** `MAP-BE-005`
- **Parent Owner / Reviewer:** `Codex` / `Claude2`
- **Sidecar Owner / Reviewer:** `Codex` / `Codex2`
- **Refreshed:** `2026-07-01` (UTC)
- **Snapshot Basis:** `scripts/ai-status.sh show`, `ai-activity-log.jsonl` slices, `git rev-parse`, `git rev-list`, `git diff`, `git show`, `git blame`, and current code anchors
- **Status:** `REVIEW SUPPORT ARTIFACT`

This packet is support-only. It preserves the previously approved
`2026-06-30` packet evidence, but refreshes the lifecycle narrative for the
`2026-07-01` redispatch of the same sidecar task ID.

Current reviewer caveats:

- this sidecar ID already reached `review_approved` and `done` on
  `2026-06-30`
- orchestrator recreated the same sidecar ID on `2026-07-01T03:38:59Z` and
  reassigned ownership after a `Gemini` worker failure
- the owner branch still carries support-artifact history only; parent
  `MAP-BE-005` implementation remains on `origin/dev` through commit
  `deb5e1d366f1789c29bd26818b14ffcb801a43a3`
  (`MAP-BE-004: finalize service-area booking creation enforcement (#1013)`)

Review implication: audit the refreshed packet, the current machine-truth
slices, and the current-file anchors. Do not expect a new parent implementation
diff on this sidecar branch.

---

## 1. Scope Boundary

In scope:

- snapshot the current `MAP-BE-005-SIDECAR-REVIEW` row at `2026-07-01`
- preserve the earlier `2026-06-30` approved-cycle history for the same task ID
- snapshot the current parent `MAP-BE-005` row
- map the parent acceptance bullets to concrete current-file anchors
- document the current branch-state caveat so review targets the right surface
- hand the refreshed packet to `Codex2` without touching parent code

Out of scope:

- editing L1/L2 canonical truth
- editing parent implementation, tests, migrations, or contracts
- changing `ai-status.json`, `current-work.md`, or `ai-activity-log.jsonl`
  except through official status commands
- re-closing the task from this packet itself; closeout remains a separate
  owner step after reviewer approval

---

## 2. Machine-Truth Snapshots

### 2.1 Current sidecar row (`2026-07-01T03:39:39Z`)

At refresh time, `AI_NAME=Codex scripts/ai-status.sh show
MAP-BE-005-SIDECAR-REVIEW` recorded:

- `owner=Codex`
- `reviewer=Codex2`
- `status=in_progress`
- `last_update=2026-07-01T03:39:39Z`
- `helper_parent=MAP-BE-005`
- `helper_kind=review_packet`
- `mutates_canonical=false`
- `next=Preparing MAP-BE-005 review packet and evidence summary for reviewer handoff`

This is the current owner-work state after the `2026-07-01` redispatch.

### 2.2 Prior completed-cycle checkpoints (`2026-06-30`)

Before the `2026-07-01` redispatch, the same sidecar task ID had already
completed one full review cycle:

- `2026-06-30T22:22:03Z`: `Codex2` recorded `review_approved` for approved
  packet commit `a833c2163`
- `2026-06-30T22:23:41Z`: formal owner closeout commit
  `2fac7332d2b6b466ae1a45a5ed9e0d082ec17a0d` was created on
  `codex/map-be-005-sidecar-review`
- `2026-06-30T22:23:56Z`: `Codex` recorded `done` with
  `integration_status=not_applicable`

Historical branch fact: `git diff --name-only a833c2163..2fac7332d -- support/sidecars/MAP-BE-005/MAP-BE-005-SIDECAR-REVIEW.md`
is empty, so the closeout commit changed task lifecycle state only, not the
packet content itself.

### 2.3 Parent row at refresh time

At the same refresh time, `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-005`
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

There are still no later parent `review_approved` or `done` events in machine
truth. The authoritative parent state remains `review`.

### 2.5 Sidecar lifecycle chain

Relevant `ai-activity-log.jsonl` entries for `MAP-BE-005-SIDECAR-REVIEW`:

| Event | Timestamp UTC | Agent | Note |
| --- | --- | --- | --- |
| `assign` | `2026-06-30T21:27:58Z` | `Codex` | Sidecar first assigned to `Gemini2` with reviewer `Codex`. |
| `sidecar_task_created` | `2026-06-30T21:28:00Z` | `Orchestrator` | Review-packet sidecar first created for `MAP-BE-005`. |
| `task_proactive_rebalanced` | `2026-06-30T22:03:34Z` | `Orchestrator` | Ownership moved from `Gemini` to `Codex`; reviewer moved from `Codex` to `Codex2`. |
| `start` | `2026-06-30T22:04:07Z` | `Codex` | First Codex owner cycle began. |
| `handoff` | `2026-06-30T22:08:28Z` | `Codex` | First packet revision handed to `Codex2`. |
| `reopen` | `2026-06-30T22:09:40Z` | `Codex2` | Review failed because commit `4a47b84c6` still had trailing whitespace. |
| `handoff` | `2026-06-30T22:12:41Z` | `Codex` | Whitespace-repaired packet handed back to `Codex2`. |
| `reopen` | `2026-06-30T22:14:09Z` | `Codex2` | Review failed because the packet still described stale machine-truth state as current. |
| `handoff` | `2026-06-30T22:17:25Z` | `Codex` | Timeline-split packet revision handed back to `Codex2`. |
| `review_approved` | `2026-06-30T22:18:38Z` | `Codex2` | Approved packet commit `a833c2163`. |
| `done` | `2026-06-30T22:23:56Z` | `Codex` | First cycle formally closed out; branch pushed and integration marked `not_applicable`. |
| `assign` | `2026-07-01T03:38:58Z` | `Codex` | Same sidecar ID assigned again, this time to `Gemini` with reviewer `Codex`. |
| `sidecar_task_created` | `2026-07-01T03:38:59Z` | `Orchestrator` | Same sidecar ID auto-created again for `MAP-BE-005`. |
| `worker_failed` | `2026-07-01T03:39:08Z` | `Orchestrator` | `Gemini` worker exited before producing a terminal task state. |
| `task_proactive_rebalanced` | `2026-07-01T03:39:11Z` | `Orchestrator` | Availability-first reassignment moved owner from `Gemini` to `Codex` and reviewer from `Codex` to `Codex2`. |
| `start` | `2026-07-01T03:39:39Z` | `Codex` | Current owner cycle began to refresh and re-handoff the packet. |

The key lifecycle fact is that the `2026-07-01` work is a second owner cycle on
the same task ID, not an undiscovered continuation of the old `2026-06-30`
reopen.

---

## 3. Revision And Branch Caveat

### 3.1 Current branch facts

Current repository facts in this sidecar worktree:

- `git rev-parse HEAD` resolves to
  `2fac7332d2b6b466ae1a45a5ed9e0d082ec17a0d`
- `git rev-parse origin/dev` resolves to
  `f452f019f9d887850c907a28a60ce627b930049b`
- `git rev-list --left-right --count origin/dev...HEAD` reports `0 4`
- `git diff --name-only origin/dev...HEAD` lists only:
  `support/sidecars/MAP-BE-005/MAP-BE-005-SIDECAR-REVIEW.md`

That means the owner branch is a support-only branch whose entire diff versus
`origin/dev` is the packet file.

Parent implementation caveat:

- `git blame` on the key `MAP-BE-005` lines still attributes the current
  implementation to commit `deb5e1d366f1789c29bd26818b14ffcb801a43a3`
- `git show --stat --format=fuller deb5e1d36` confirms that commit already
  contains the main `MAP-BE-005` surfaces:
  - `packages/contracts/src/index.ts` `+433`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` `+614 / -3`
  - `apps/api/tests/unit/owned-mobility.service.test.ts` `+401`
  - `apps/api/tests/unit/service-area.service.test.ts` `+404`
  - plus the `geo` and `service-area` module/controller/repository/service
    files

### 3.2 Review implication

- do not expect a new parent implementation diff on this sidecar branch
- do not use `origin/dev...HEAD` as proof of the parent runtime work; it proves
  only the support artifact branch scope
- use the current-file anchors in Sections 4 and 5 plus the parent machine-truth
  handoff evidence
- confirm that this refreshed packet correctly explains both the prior completed
  cycle and the current redispatch cycle for the same sidecar ID

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
  returns cloned `spatialAudit` data from `getOrder`, preventing caller
  mutation from mutating the stored record

Test proof:

- `apps/api/tests/unit/owned-mobility.service.test.ts:454-557` mutates the
  first returned snapshot, confirms evaluator is only called once, and verifies
  a fresh read still shows the original serviceable snapshot and evidence refs

### 4.3 `audit events emitted`

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6319-6365`
  emits `order.spatial_audit.snapshot_created` and stores audit-event refs back
  into the snapshot
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6515`
  threads `spatialAuditSnapshotId` into later service-area audit summaries

Test proof:

- `apps/api/tests/unit/owned-mobility.service.test.ts:371-387` asserts the
  audit log is recorded with actor, surface, decision, request id, and
  provenance completeness

### 4.4 `legacy text-only state explicit`

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6070-6072`
  adds the `service_area_legacy_text_manual_review` compliance flag when
  coordinates are missing
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6293-6295`
  falls back to `legacy_text` when no coordinates exist
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:6123-6138`
  blocks dispatch when review-required gates remain

Test proof:

- `apps/api/tests/unit/owned-mobility.service.test.ts:390-452` verifies missing
  pickup/dropoff coordinates become explicit `legacy_text` provenance, queue
  the order into manual review, and prevent auto-dispatch

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
6. Packet lifecycle accuracy matters here: the file should distinguish the
   `2026-06-30` completed cycle from the `2026-07-01` redispatch cycle on the
   same task ID.
7. Treat the revision history carefully: current `HEAD` already contains the
   support artifact history, while the parent task is still `review`. Do not
   treat the sidecar's prior `done` event as parent closeout.

---

## 6. Suggested Reviewer Commands

If the reviewer wants to reproduce the evidence quickly:

- `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-005-SIDECAR-REVIEW`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-BE-005`
- `grep -n 'MAP-BE-005-SIDECAR-REVIEW' "$AI_STATUS_ROOT/ai-activity-log.jsonl" | tail -n 40`
- `git diff --name-only origin/dev...HEAD`
- `git show --check HEAD -- support/sidecars/MAP-BE-005/MAP-BE-005-SIDECAR-REVIEW.md`
- `grep -n '[[:blank:]]$' support/sidecars/MAP-BE-005/MAP-BE-005-SIDECAR-REVIEW.md`
- `git show --stat --format=fuller 2fac7332d`
- `git show --stat --format=fuller deb5e1d36`
- `git blame -L 586,603 packages/contracts/src/index.ts`
- `git blame -L 6062,6555 apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `git blame -L 289,557 apps/api/tests/unit/owned-mobility.service.test.ts`

Optional validation rerun, if the reviewer wants fresh execution instead of
accepting the parent handoff evidence:

- `pnpm --filter @drts/api test -- --runInBand apps/api/tests/unit/owned-mobility.service.test.ts apps/api/tests/unit/service-area.service.test.ts`

---

## 7. Sidecar Scope Compliance

- [x] Support artifact only: the owner branch diff versus `origin/dev` is still
  the packet file only
- [x] No canonical-truth edits: parent code, docs, contracts, and runtime are
  unchanged by this packet refresh
- [x] Prior completed cycle preserved: the `2026-06-30` approved/closed cycle
  is explicitly documented instead of overwritten
- [x] Redispatch captured: the `2026-07-01` recreated-task timeline is now
  explicit
- [x] Reviewer re-handoff ready: once this refresh is committed, validated, and
  pushed, the owner can hand the packet back to `Codex2`

---

## 8. Refresh Summary

- `2026-06-30` already produced an approved packet revision (`a833c2163`) and a
  formal closeout commit (`2fac7332d`)
- `2026-07-01` recreated the same sidecar task ID and reassigned it back to
  `Codex` after a `Gemini` worker failure
- this refresh does not change the parent evidence map; it updates the packet so
  reviewer context matches current machine truth
- the branch-state caveat is now explicit: the owner branch contains support
  material only, while the parent implementation surface remains rooted on
  `origin/dev` via `deb5e1d36`
- no parent code or test reruns were added by this packet refresh; the packet
  still records the parent owner's earlier validation claims and current code
  anchors

---

## 9. Handoff Note

When handing this packet to `Codex2`, summarize:

- the sidecar already completed one approved cycle on `2026-06-30`, but the
  same task ID was recreated on `2026-07-01`
- current machine truth is `in_progress` only because this is a new redispatch
  cycle; after owner handoff it should return to `review`
- parent `MAP-BE-005` is still `review` in machine truth
- current owner branch differs from `origin/dev` only by this packet file
- parent implementation proof still comes from the current-file anchors plus the
  parent handoff evidence, not from a new sidecar branch code diff
- `deb5e1d36` remains the key integration commit containing the `MAP-BE-005`
  runtime surface even though its subject is labeled `MAP-BE-004`
- the historical `2026-06-30` approved packet content was unchanged by the
  formal closeout commit; this refresh is about lifecycle clarity for the new
  dispatch, not a new parent implementation claim

If the sidecar review passes, the reviewer should run:

- `AI_NAME=Codex2 scripts/ai-status.sh approve MAP-BE-005-SIDECAR-REVIEW "<review conclusion>"`

After that, the owner can handle sidecar closeout according to the normal
`review_approved -> done` protocol.
