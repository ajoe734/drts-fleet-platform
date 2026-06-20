# MOB-BE-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`  
**Parent Task:** `MOB-BE-001`  
**Parent Owner / Reviewer:** `Codex2` / `Codex`  
**Sidecar Owner / Reviewer:** `Codex` / `Codex2`  
**Generated:** `2026-06-20` (UTC)  
**Snapshot Basis:** `scripts/ai-status.sh show`, `git show`, `git branch --contains`, and commit-scoped `git grep`  
**Status:** `REVIEW SUPPORT ARTIFACT`

This packet is support-only. It does not change canonical truth or parent implementation.
Its purpose is to give the assigned reviewer one place to audit the current `MOB-BE-001`
review state, the exact commit under review, the regression being fixed, and the
verification evidence already recorded by the parent owner.

---

## 1. Scope Boundary

In scope:

- snapshot the parent task's machine-truth review state
- summarize the parent commit and the bug/regression it fixes
- map acceptance criteria to concrete evidence
- warn about revision drift between the sidecar worktree and the parent commit under review
- hand off a reviewer-oriented packet without mutating parent code

Out of scope:

- editing runtime or contract implementation
- changing L1/L2 canonical truth
- changing the parent task status
- re-running verification that was already recorded by the parent owner

---

## 2. Machine-Truth Snapshot

### 2.1 Sidecar row

`scripts/ai-status.sh show MOB-BE-001-SIDECAR-REVIEW` at this recovery pass records:

- id=`MOB-BE-001-SIDECAR-REVIEW`
- owner=`Codex`
- reviewer=`Codex2`
- status=`in_progress`
- helper_parent=`MOB-BE-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`

### 2.2 Parent row

`scripts/ai-status.sh show MOB-BE-001` currently records:

- id=`MOB-BE-001`
- owner=`Codex2`
- reviewer=`Codex`
- status=`review_approved`
- title=`Batch heartbeat API + telemetry.driver_location_events`
- last_update=`2026-06-20T05:46:16Z`

Recorded parent `next` summary:

> Reviewed owner branch codex2/mob-be-001 at
> 4b093cd23003ace8287962ad80e31f61ad7581fb. No blocking findings. Verified
> stale current-location guard for legacy and batch paths plus regression tests
> coverage. Re-ran: pnpm --filter @drts/api typecheck; pnpm --filter @drts/api
> test -- regulatory-registry.service.test.ts driver-telemetry.controller.test.ts.

---

## 3. Canonical Review Revision

The parent review should be performed against commit:

- commit=`4b093cd23003ace8287962ad80e31f61ad7581fb`
- subject=`MOB-BE-001: prevent stale heartbeat current-location regressions`
- trailers:
  - `LLM-Agent: codex2`
  - `Task-ID: MOB-BE-001`
  - `Reviewer: Codex`
  - `Verification: pnpm --filter @drts/api typecheck && pnpm --filter @drts/api test -- regulatory-registry.service.test.ts`

`git branch --contains 4b093cd23003ace8287962ad80e31f61ad7581fb` shows the parent
review commit lives on `codex2/mob-be-001`.

Reviewer caveat:

- this sidecar worktree branch is `codex/mob-be-001-sidecar-review`
- its current `HEAD` is `eadba376d3e2a2c71bffea60150d6b0a8bd8939d`
- `HEAD` is not the parent review commit, so audit the parent against
  `4b093cd23003ace8287962ad80e31f61ad7581fb`, not against this sidecar branch tip

Artifact delivery note:

- this file existed only as an untracked worktree artifact before this recovery pass
- the purpose of this slice is to commit and hand off that packet so reviewer access
  matches machine-truth status

---

## 4. Commit Scope Summary

`git show --stat --summary 4b093cd23003ace8287962ad80e31f61ad7581fb` reports:

- `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`
- `apps/api/tests/unit/regulatory-registry.service.test.ts`

Stat summary:

- `2 files changed, 159 insertions(+), 17 deletions(-)`

No migrations, contracts, or canonical docs were changed in this review revision.

---

## 5. Bug Fix Summary

The parent change addresses a stale snapshot regression in two heartbeat paths:

1. Legacy endpoint path:
   `POST /api/regulatory-registry/driver-location`
2. Batch heartbeat path:
   `POST /api/driver/location-heartbeats/batch`

The failure mode being fixed is:

- an older `recordedAt` heartbeat could overwrite the service's in-memory
  `latestDriverLocations` snapshot
- the service could then publish a stale `driver_location_updated` event and
  acknowledge `currentLocationUpdated: true` even when the incoming heartbeat was older

The fix adds a shared guard:

- `applyLatestDriverLocation(...)` at commit-scoped anchor
  `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:2189`
- legacy path now uses the guard at commit-scoped anchor line `680`
- batch path now uses the guard at commit-scoped anchor line `748`

Behavioral effect:

- older heartbeats may still persist into telemetry/repository flows as designed
- but they no longer regress the in-memory "latest location" snapshot
- and they no longer publish a stale current-location update event

---

## 6. Acceptance-to-Evidence Map

Parent acceptance:

> Batch heartbeat ingests up to 100; events persisted with dedupe index; pnpm
> --filter @drts/api typecheck + test pass

Evidence relevant to this review revision:

- The parent did not change the batch limit or dedupe contract; it narrows the
  review to stale current-location regression behavior on top of the already
  accepted batch heartbeat surface.
- The recorded verification matches the parent `next` field and commit trailer:
  - `pnpm --filter @drts/api typecheck`
  - `pnpm --filter @drts/api test -- regulatory-registry.service.test.ts`
- The regression coverage added in this commit is targeted and sufficient for
  the bug being fixed:
  - legacy regression test at commit-scoped anchor
    `apps/api/tests/unit/regulatory-registry.service.test.ts:468`
  - out-of-order batch regression test at commit-scoped anchor
    `apps/api/tests/unit/regulatory-registry.service.test.ts:597`

Additional unchanged guardrail still present in tests:

- batches larger than 100 remain rejected in the same test file after the new cases

---

## 7. Reviewer Focus

Reviewer should validate these points on `4b093cd23003ace8287962ad80e31f61ad7581fb`:

- `applyLatestDriverLocation` rejects only strictly older snapshots and still
  allows equal/newer timestamps when intended
- legacy `recordDriverLocation` now publishes only when the guarded snapshot is applied
- batch `recordBatchHeartbeatItem` returns `currentLocationUpdated: false` for
  out-of-order heartbeats even if repository persistence reports
  `currentLocationUpdated: true`
- no unrelated semantics changed in batch duplicate acknowledgement behavior
- the new tests actually assert both event-publication count and final
  `listLatestDriverLocations()` state, not only response payloads

---

## 8. Handoff Notes For `Codex2`

This sidecar packet is ready to hand off to the assigned reviewer once the
sidecar status is moved from `in_progress` to `review`.

Suggested review framing:

- audit the parent task against commit `4b093cd23003ace8287962ad80e31f61ad7581fb`
- treat this packet as evidence compression only
- do not infer parent correctness from the sidecar worktree `HEAD`
- if the parent passes, sidecar review can approve the packet as an accurate
  reviewer handoff artifact
