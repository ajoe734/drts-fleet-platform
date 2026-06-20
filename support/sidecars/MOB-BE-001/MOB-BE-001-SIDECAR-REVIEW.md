# MOB-BE-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `MOB-BE-001`
**Parent Owner / Reviewer:** `Codex2` / `Codex`
**Sidecar Owner / Reviewer:** `Codex` / `Codex2`
**Generated:** `2026-06-20` (UTC)
**Refreshed At:** `2026-06-20T06:13:04Z`
**Snapshot Basis:** `scripts/ai-status.sh show`, `git show`, `git branch --contains`, `git merge-base --is-ancestor`, `git diff --check`, and commit-scoped `git grep`
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

The reviewer-facing packet needs two separate machine-truth snapshots:

1. the last handoff state that `Codex2` reviewed
2. the current reopened owner state while this correction is being prepared

Last reviewed handoff snapshot:

- source=`ai-activity-log.jsonl`
- handoff_at=`2026-06-20T06:10:44Z`
- task_id=`MOB-BE-001-SIDECAR-REVIEW`
- owner=`Codex`
- reviewer=`Codex2`
- status=`review`
- handoff_commit=`104204da3d84d6af1132fe71c054cc2002e230c9`
- handoff_message=`Handoff to Codex2: Refreshed support/sidecars/MOB-BE-001/MOB-BE-001-SIDECAR-REVIEW.md so the packet matches current machine truth, removes stale review_approved/closeout narration, and frames reviewer focus against parent commit 4b093cd23003ace8287962ad80e31f61ad7581fb. Verification: git diff --check. Commit: 104204da3d84d6af1132fe71c054cc2002e230c9 on origin/codex/mob-be-001-sidecar-review.`

Review failure that triggered this refresh:

- source=`ai-activity-log.jsonl`
- reopened_at=`2026-06-20T06:11:46Z`
- reopened_by=`Codex2`
- reopen_reason=`support/sidecars/MOB-BE-001/MOB-BE-001-SIDECAR-REVIEW.md:42-57 still says the sidecar row is status=in_progress with next intended transition to reviewer handoff, but machine truth at review time is already status=review with last_update=2026-06-20T06:10:44Z.`

Current owner refresh state:

- source=`scripts/ai-status.sh show MOB-BE-001-SIDECAR-REVIEW`
- status=`in_progress`
- helper_parent=`MOB-BE-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- last_update=`2026-06-20T06:12:19Z`
- next=`Refreshing review packet to match the actual sidecar handoff/review timeline before resubmitting to Codex2.`

Interpretation:

- the packet under review must describe the audited handoff snapshot as `review`
- the owner's current `in_progress` state exists only because the reviewer reopened the sidecar for this packet correction
- after this document refresh, the owner should hand the packet back to `Codex2` for a new `review` transition

### 2.2 Parent row

`scripts/ai-status.sh show MOB-BE-001` currently records:

- id=`MOB-BE-001`
- owner=`Codex2`
- reviewer=`Codex`
- status=`done`
- title=`Batch heartbeat API + telemetry.driver_location_events`
- last_update=`2026-06-20T05:54:20Z`

Recorded parent `next` summary:

> Owner finalized approved task. Closeout commit
> 4b093cd23003ace8287962ad80e31f61ad7581fb is now reachable from origin/dev via
> merge commit 8ed60a27a1bfab03ecee55216d038c02e28b6703. Verified after
> integration with pnpm --filter @drts/api typecheck and pnpm --filter @drts/api
> test -- regulatory-registry.service.test.ts driver-telemetry.controller.test.ts.
> Integration status: merged_to_dev; no dev deployment claimed.

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
review commit lives on `codex2/mob-be-001`, `origin/codex2/mob-be-001`, and
`origin/dev`.

Integration caveat:

- `git merge-base --is-ancestor 4b093cd23003ace8287962ad80e31f61ad7581fb origin/dev`
  returns success
- the parent implementation is already merged into `origin/dev`
- this packet therefore serves as a review-history and evidence-handoff artifact,
  not as a gate on the parent runtime change

Reviewer caveat:

- this sidecar worktree branch is `codex/mob-be-001-sidecar-review`
- the sidecar branch tip is only the packet carrier and is intentionally
  different from the parent review commit
- audit the parent against `4b093cd23003ace8287962ad80e31f61ad7581fb`, not
  against the sidecar branch tip

Artifact delivery note:

- the prior packet refresh on the sidecar branch is commit
  `358b53e2e1cba67cb257095877ef0838c7a25b7d`
- the most recent handoff packet revision under review is commit
  `104204da3d84d6af1132fe71c054cc2002e230c9`
- this refresh corrects the stale sidecar-row narration by separating the
  `2026-06-20T06:10:44Z` review handoff snapshot from the later reopened
  owner-refresh state

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
- The parent closeout later re-ran the broader targeted suite after integration:
  - `pnpm --filter @drts/api typecheck`
  - `pnpm --filter @drts/api test -- regulatory-registry.service.test.ts driver-telemetry.controller.test.ts`
- The regression coverage added in this commit is targeted and sufficient for
  the bug being fixed:
  - legacy regression test at commit-scoped anchor
    `apps/api/tests/unit/regulatory-registry.service.test.ts:468`
  - out-of-order batch regression test at commit-scoped anchor
    `apps/api/tests/unit/regulatory-registry.service.test.ts:597`
- Prior review feedback on this sidecar packet was correct that the older packet
  overstated verification cleanliness. At this refresh point, local
  `git diff --check` returns no output, so there is no current trailing-whitespace
  failure in the sidecar worktree.
- Prior review feedback on this sidecar packet was also correct that the earlier
  version conflated the owner refresh state with the already-recorded `review`
  handoff state. This revision fixes that timeline error explicitly.

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

This sidecar packet is the support artifact to hand off to the assigned reviewer.
The parent implementation is already closed on `origin/dev`; the only remaining
purpose here is to keep the review packet accurate for sidecar review.

Suggested review framing:

- audit the parent task against commit `4b093cd23003ace8287962ad80e31f61ad7581fb`
- treat this packet as evidence compression only
- do not infer parent correctness from the sidecar worktree `HEAD`
- confirm the packet now distinguishes the audited `review` handoff snapshot at
  `2026-06-20T06:10:44Z` from the later reopened owner state
- confirm the packet still matches current machine truth for the already-closed
  parent task
- approve only the packet accuracy; parent implementation correctness is already
  recorded in the parent task closeout
- once packet accuracy is confirmed, approve the sidecar task so the owner can
  perform final machine-truth closeout
