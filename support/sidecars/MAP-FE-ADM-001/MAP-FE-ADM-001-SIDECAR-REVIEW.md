# MAP-FE-ADM-001 Review Packet & Evidence Summary

**Sidecar Kind:** `review_packet`
**Parent Task:** `MAP-FE-ADM-001` - Platform Admin geofence governance UI
**Parent Owner / Reviewer:** `Codex2` / `Codex`
**Sidecar Owner / Reviewer:** `Codex` / `Codex2`
**Last reviewed implementation head:** `codex/map-fe-adm-001-gateb-corrective @ 69b0980c6`
**Generated:** `2026-07-01` (UTC)
**Status:** `REVIEW SUPPORT ARTIFACT` - support-only; does not modify canonical truth or parent runtime code.

This packet reflects the current machine-truth posture after reviewer `Codex` reopened the
parent task at `2026-07-01T02:07:04Z`. It replaces the stale "parent is still in review on
PR #1026" framing with the actual state: the corrective branch added meaningful Gate B proof,
but the parent task is back to `in_progress` because review still found three concrete gaps.

## 1. Scope Boundary

In scope:

- anchor the sidecar to current machine truth for this sidecar and parent task
- summarize what `69b0980c6` did add
- record the exact reviewer reopen reasons that still block parent approval
- hand reviewer-ready evidence back to owner without changing canonical truth

Out of scope:

- editing the parent implementation
- changing L1/L2 product truth, contracts, or governance semantics
- claiming the parent branch passed review
- claiming MAP-QA-002, MAP-REL, or downstream callcenter proof is complete

## 2. Machine-Truth Anchors

### Sidecar task - `MAP-FE-ADM-001-SIDECAR-REVIEW`

Stable identity fields from `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001-SIDECAR-REVIEW`:

- owner=`Codex`
- reviewer=`Codex2`
- depends_on=`MAP-BE-006`
- helper_parent=`MAP-FE-ADM-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- artifact=`support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-SIDECAR-REVIEW.md`

Lifecycle state is intentionally not treated as durable here. Reviewer should rely on
`scripts/ai-status.sh show` at read time for the live sidecar status.

### Parent task - `MAP-FE-ADM-001`

Current machine-truth snapshot from `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001`:

- owner=`Codex2`
- reviewer=`Codex`
- status=`in_progress`
- dependencies=`MAP-BE-006`, `MAP-UI-002`, `MAP-UI-002-HARDEN-001`, `MAP-UI-002-INTEGRATE-001`
- planning ref=`docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- gap ref=`docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`

Current parent `next` summary says review failed because:

- `/service-areas` still relies on only a fallback screen-requirements note
- affected-preview freshness ignores `effectiveFrom` changes
- submit-review requires a UI reason but never sends it to API audit
- GeoJSON import does not surface mutation receipts

Practical meaning:

- the prior sidecar packet that described the parent as a live `review` target is stale
- reviewer handoff must now be framed as a reopen packet for owner corrective work

## 3. Routing Trail

Task-scoped `ai-activity-log.jsonl` anchors:

- `2026-07-01T02:03:18Z` - `Codex2` handed off the corrective target
  `codex/map-fe-adm-001-gateb-corrective @ 69b0980c6`
- `2026-07-01T02:07:04Z` - `Codex` reopened the parent after reviewing `69b0980c6`
- `2026-07-01T02:12:42Z` - `Codex2` reopened this sidecar so the packet could be refreshed to
  current machine truth and the actual residual gaps

This sidecar must align to the last two events above, not the earlier `02:03:18Z`
review-ready moment.

## 4. What The Corrective Branch Did Add

The corrective branch still matters. Reviewer reopen is not "nothing changed"; it is "the
branch improved materially, but not enough to clear review."

Evidence anchors on `69b0980c6`:

- `apps/platform-admin-web/app/service-areas/page.tsx`
  - dedicated `/service-areas` governance route
  - reason-gated review / publish / retire controls
  - task-scoped `ServiceAreaGeometryEditor`
  - affected sample preview section and publish gate
  - mutation receipt panel
- `apps/platform-admin-web/components/service-area-geometry-editor.tsx`
  - task-scoped polygon/circle editor with import/export and validation state
- `apps/platform-admin-web/lib/service-area-governance.ts`
  - coordinate validation and self-intersection rejection helpers
  - affected sample construction / evaluation summary helpers
- `packages/api-client/src/index.ts`
  - typed service-area create/update/submit-review/publish/retire/evaluate helpers
- `tests/unit/platform-admin-service-area-governance.test.ts`
  - helper coverage for invalid geometry and affected preview logic
- `tests/e2e/platform-admin-service-area-governance.spec.ts`
  - mocked smoke that exercises preview, publish receipt, and retire receipt
- `docs/05-ui/platform-admin-service-area-governance-screen-requirements-20260701.md`
  - fallback screen-requirements note added by the corrective pass
- `support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-FINAL-EVIDENCE.md`
  - owner evidence summary for the corrective scope

Practical meaning:

- the reopen is not disputing that `69b0980c6` improved the branch
- the reopen is specifically about residual correctness and evidence-boundary gaps

## 5. Reviewer Reopen Findings

### 5.1 Parent status mismatch was the first stale-packet failure

The previous sidecar packet said parent `MAP-FE-ADM-001` was `review` on draft `PR #1026`.
Current machine truth is `in_progress` with a recorded review failure at
`2026-07-01T02:07:04Z`. Any reviewer packet that keeps the earlier framing is stale.

### 5.2 Affected preview freshness is keyed too narrowly

Relevant code in `service-areas/page.tsx`:

- `hasFreshAffectedPreview` only checks whether `affectedPreview.selectionKey === selectedRecordKey`
  and `summary.total > 0`
- `selectedRecordKey` is derived from record kind/id/version
- `runAffectedPreview()` uses `effectiveFrom || selectedRecord.effectiveFrom` when building
  samples

Why review failed:

- changing `effectiveFrom` changes the publish-relevant evaluator request
- but the freshness test does not include `effectiveFrom`
- a preview can therefore remain "fresh" in UI state after the operator changes the effective
  window, which undercuts the publish gate claim

### 5.3 Submit-review requires a reason in UI but never sends that reason to API audit

Relevant code:

- `requireSelectionAndReason()` blocks review/publish/retire unless `reason.trim()` exists
- `submitReview()` then calls `client.submitServiceAreaBoundaryForReview(id)` or
  `client.submitStopPolicyForReview(id)` with no command body
- `packages/api-client/src/index.ts` defines those helpers as bare POSTs to `/submit-review`
  without `{ body: ... }`

Why review failed:

- the UI presents review submission as reason-gated lifecycle evidence
- but the reason is not forwarded to backend audit on submit-review
- this means the claimed audit trail is incomplete for one of the core lifecycle transitions

### 5.4 GeoJSON draft import does not surface mutation receipts

Relevant code:

- `runAction()` only stores receipts when the action returns a `ServiceAreaAdminMutationResponse`
- `createDraftFromImport()` awaits `client.createServiceAreaBoundary(...)` or
  `client.createStopPolicy(...)` but does not return the awaited result
- the page copy says the mutation receipt panel covers "publish, retire, review submit,
  geometry save, or draft import"

Why review failed:

- the receipt panel contract overclaims import behavior
- import can create a draft but the returned mutation receipt is discarded before
  `setLastMutationReceipt(result)` can run
- reviewer therefore cannot accept the receipt/audit evidence claim for import flows

## 6. Current Read Of The Corrective Branch

The cleanest reviewer summary is:

- `69b0980c6` closes the earlier "no GeometryEditor / no preview / no receipt surface"
  objections at a repo-local UI level
- the screen-requirements note is still best read as fallback support evidence, not as proof
  that the broader screen-handoff concern is fully settled
- the branch does not yet satisfy review because the publish-proof freshness key, submit-review
  audit reason propagation, and import receipt surfacing are still inconsistent with the
  evidence being claimed
- MAP-QA-002, MAP-REL, and downstream callcenter behavior remain outside this sidecar and
  should stay outside the claim boundary

## 7. Reviewer Handoff Guidance

Owner `Codex2` should refresh the parent branch and next handoff around these exact fixes:

1. Make affected-preview freshness invalidated by every publish-relevant input, including
   `effectiveFrom`.
2. Ensure submit-review sends the reason payload required by the UI so backend audit can record
   it.
3. Ensure GeoJSON import returns and surfaces a mutation receipt if the UI claims that evidence
   exists.
4. Keep the screen-requirements fallback and task-scoped GeometryEditor evidence clearly scoped
   as repo-local corrective proof, not full production acceptance.

Suggested reviewer handoff wording:

> `packet refreshed to current machine truth: parent MAP-FE-ADM-001 is back to in_progress after review failed on 69b0980c6. Corrective branch evidence is summarized, but reviewer still needs owner fixes for affected-preview freshness vs effectiveFrom, submit-review reason propagation to API audit, and GeoJSON import mutation receipts.`

Suggested approval wording for a future refresh:

> `sidecar matches current machine truth and accurately reflects the latest parent review posture, reviewed head, remaining reopen findings, and support-only scope without overclaiming QA/release readiness.`

## 8. Verification

Verification used for this sidecar refresh:

- `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001-SIDECAR-REVIEW`
- `AI_NAME=Codex scripts/ai-status.sh show MAP-FE-ADM-001`
- `grep -n 'MAP-FE-ADM-001' /home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl | tail -n 20`
- `git show 69b0980c6:apps/platform-admin-web/app/service-areas/page.tsx | sed -n '288,730p'`
- `git show 69b0980c6:apps/platform-admin-web/app/service-areas/page.tsx | sed -n '1218,1296p'`
- `git show 69b0980c6:packages/api-client/src/index.ts | sed -n '2940,3035p'`
- `git diff --check -- support/sidecars/MAP-FE-ADM-001/MAP-FE-ADM-001-SIDECAR-REVIEW.md`

Not applicable:

- runtime tests
- typecheck
- lint
- app execution

Reason: this sidecar only updates support documentation and cites already-recorded parent
review evidence.
