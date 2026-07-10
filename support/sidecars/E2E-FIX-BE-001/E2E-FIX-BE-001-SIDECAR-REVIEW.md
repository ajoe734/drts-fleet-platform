# E2E-FIX-BE-001 Review Packet & Evidence Summary

**Sidecar Task:** `E2E-FIX-BE-001-SIDECAR-REVIEW`  
**Parent Task:** `E2E-FIX-BE-001`  
**Helper Kind:** `review_packet`  
**Current Owner:** `Codex`  
**Assigned Reviewer:** `Gemini`  
**Parent Owner / Reviewer:** `Gemini` / `Claude`  
**Last Revised:** `2026-07-10 (UTC)`  
**Status:** `REVIEW SUPPORT ARTIFACT - support-only packet for reviewer handoff; does not modify canonical truth or runtime behavior`

---

## 1. Scope Boundary

This sidecar is support-only.

- In scope: review packet, evidence summary, reviewer hotspots, and handoff wording for the current parent review state.
- Out of scope: editing parent implementation, changing `ai-status.json` task semantics, rewriting canonical product truth, or claiming parent verification that is not visible in git/machine truth.

The packet is intentionally limited to the support artifact path:

- `support/sidecars/E2E-FIX-BE-001/E2E-FIX-BE-001-SIDECAR-REVIEW.md`

---

## 2. Shared-Truth Snapshot

### 2.1 Sidecar task snapshot

Machine-truth row: `E2E-FIX-BE-001-SIDECAR-REVIEW`

- owner=`Codex`
- reviewer=`Gemini`
- status=`in_progress`
- helper_parent=`E2E-FIX-BE-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`
- acceptance:
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`
- last_update=`2026-07-10T11:56:23Z`

### 2.2 Parent task snapshot

Machine-truth row: `E2E-FIX-BE-001`

- title=`Service-area gate: exempt products with no seeded service area`
- owner=`Gemini`
- reviewer=`Claude`
- status=`review`
- acceptance=`無服務區 product 不再被 gate 擋;有服務區者行為不變;apps/api typecheck+vitest 綠`
- next=`Implemented service-area exemption logic for products without active service area configurations and verified with unit tests`
- last_update=`2026-07-10T11:44:59Z`

### 2.3 Current visible branch state

At packet generation time, the following task-named branches all resolve to the
same commit as `origin/dev`:

- `claude/e2e-fix-be-001`
- `claude2/e2e-fix-be-001`
- `codex/e2e-fix-be-001`
- `codex2/e2e-fix-be-001`
- `gemini/e2e-fix-be-001`

Shared commit anchor:

- `origin/dev` = `c75c7fc164f5c4cbf2a9b3e36eed14e44aed76ea`
- `gemini/e2e-fix-be-001` = `c75c7fc164f5c4cbf2a9b3e36eed14e44aed76ea`

Practical meaning:

- machine truth says the parent is already in `review`
- the currently visible repo does not expose a task-specific parent diff to review
- reviewer should treat the missing diff as a first-class evidence gap, not as a silent assumption that implementation exists elsewhere

### 2.4 Related sidecar artifact already present

There is one sibling support artifact already committed on a separate branch:

- commit `6e73ffa07f795bdd99c0c89f18f29b8ef237670d`
- subject `docs(E2E-FIX-BE-001-SIDECAR-ACCEPTANCE): add acceptance packet`
- branch `codex/e2e-fix-be-001-sidecar-acceptance`

That file is useful context, but it is still support-only and does not constitute
parent implementation proof.

---

## 3. Current Runtime Evidence

### 3.1 Seeded service-area coverage is narrower than the product catalog

`apps/api/src/modules/service-area/service-area.service.ts` currently seeds only
these active areas:

- `TAIPEI_CORE` for:
  - `taxi_realtime`
  - `taxi_reservation`
  - `enterprise_dispatch`
- `TAOYUAN_AIRPORT` for:
  - `credit_card_airport_transfer`

No active default service-area seed is visible for:

- `insurance_replacement_vehicle`
- `travel_agency_transfer`
- `third_party_forwarded_order`

This aligns with the parent brief's description of the affected products.

### 3.2 The current evaluator still collapses zero-active-area cases into `not_serviceable`

Visible behavior in `ServiceAreaService`:

- `activeServiceAreas(...)` filters only `active` and currently effective area
  records that apply to the requested `serviceProductType`
- `evaluateStop(...)` sets `decision = "not_serviceable"` when
  `matchedAreas.length === 0`

Visible behavior in `OwnedMobilityService`:

- `resolveServiceAreaGate(...)` calls `serviceAreaService.evaluate(...)` once a
  service product resolves and pickup coordinates exist
- `applyServiceAreaCreationPolicy(...)` throws a `400` when
  `evaluation.decision === "not_serviceable"`

Combined effect in the visible code:

- seeded products outside an active area are blocked
- products with zero matching active definitions also still appear to fall into
  the same blocking path
- no visible exemption branch is present at the current repo commit

### 3.3 Visible tests still cover seeded-area and stop-policy behavior only

Current unit coverage visible in git:

- `apps/api/tests/unit/service-area.service.test.ts`
  - inside-area success
  - outside-area rejection
  - deny stop-policy rejection
  - manual-review stop-policy routing
  - service-product scoping between seeded products
- `apps/api/tests/unit/owned-mobility.service.test.ts`
  - coordinate-bearing call-center orders blocked by seeded deny policy
  - manual-review routing away from normal dispatch
  - provider-fallback manual review handling
  - spatial-audit snapshot persistence

Current proof gap:

- no visible test asserts that `insurance_replacement_vehicle`,
  `travel_agency_transfer`, or `third_party_forwarded_order` becomes exempt when
  there are zero active service-area definitions
- no visible diff adds that regression coverage

### 3.4 Product references exist, but not exemption logic

Repo search confirms the affected product names exist in:

- `apps/api/src/modules/service-product/service-product.service.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`

But the currently visible service-area evaluation/tests do not show explicit
branching for the parent's intended exemption behavior.

---

## 4. Review Finding

The most important review conclusion is procedural, not semantic:

- the parent task claims implementation and unit-test verification in machine truth
- the visible repo state for every task-named branch is still identical to `origin/dev`
- the visible runtime/tests therefore still present the pre-fix blocking behavior

Reviewer implication:

- if the parent owner has an unpushed local diff, parent review is not yet
  actionable from shared git evidence and should not be approved as-is
- if the current review target truly is commit `c75c7fc164f5c4cbf2a9b3e36eed14e44aed76ea`,
  then the parent fix is not visibly landed and the review should reopen or
  request refreshed evidence

This is not a claim that the parent fix is wrong. It is a claim that the fix is
not reviewable from the currently visible branch state.

---

## 5. Reviewer Hotspots

Reviewer `Gemini` should check these points first:

1. Confirm this packet remains support-only and does not reinterpret canonical
   task scope.
2. Confirm machine truth currently places parent `E2E-FIX-BE-001` in `review`
   while the visible task branches still have no diff from `origin/dev`.
3. Confirm the current code still routes `matchedAreas.length === 0` to
   `not_serviceable`, which means the intended exemption is not visible at the
   reviewed commit.
4. Confirm the current unit suites do not yet show a zero-active-service-area
   exemption regression test for the named products.
5. Decide whether the correct next action is:
   - sidecar packet approval plus escalation to parent owner for refreshed diff
   - or sidecar reopen if any evidence claim here is stale

Suggested parent-review expectation before approval:

- a visible code diff on the parent branch
- explicit regression coverage for a coordinate-bearing order whose product has
  zero active service-area definitions
- proof that seeded products still block when outside their active area
- the claimed `apps/api` typecheck and vitest results anchored to the reviewed diff

---

## 6. Suggested Review Outcomes

Suggested `approve` wording for this sidecar packet:

> `審查通過：E2E-FIX-BE-001 sidecar review packet 已正確對齊 machine truth，並明確指出目前 parent task 雖為 review，但所有 task-named branches 仍與 origin/dev 同 SHA（c75c7fc），可見 code/tests 仍只展示 seeded area / stop policy 行為，尚看不到 zero-active-service-area exemption 的 reviewable diff。support artifact only，未改 canonical truth。`

Suggested `reopen` wording for this sidecar packet:

> `packet needs refresh: [branch SHA drift / parent diff became visible / evidence anchor mismatch / support-scope violation]`

Suggested parent-review response if no new diff is produced:

> `Parent review cannot complete from current shared git evidence: machine truth claims exemption logic and unit verification, but visible task branches remain identical to origin/dev and current tests do not prove the no-active-service-area exemption path. Please refresh branch/diff and evidence before approval.`

---

## 7. Handoff Commands

Owner handoff to sidecar reviewer:

```bash
AI_NAME=Codex scripts/ai-status.sh handoff E2E-FIX-BE-001-SIDECAR-REVIEW Gemini "Review packet ready at support/sidecars/E2E-FIX-BE-001/E2E-FIX-BE-001-SIDECAR-REVIEW.md. It captures the current machine-truth snapshot, the visible runtime/test anchors, and the key evidence gap: parent task E2E-FIX-BE-001 is in review, but every task-named branch still matches origin/dev at c75c7fc, so no reviewable exemption diff is currently visible."
```

Reviewer approval:

```bash
AI_NAME=Gemini scripts/ai-status.sh approve E2E-FIX-BE-001-SIDECAR-REVIEW "Review approved. The sidecar packet accurately summarizes the current machine-truth state, code evidence, and the missing visible parent diff without changing canonical truth."
```

Reviewer reopen:

```bash
AI_NAME=Gemini scripts/ai-status.sh reopen E2E-FIX-BE-001-SIDECAR-REVIEW "packet needs refresh: [branch SHA drift / parent diff became visible / evidence anchor mismatch / support-scope violation]"
```

---

## 8. Change Log

- `2026-07-10` - Initial review packet created for `E2E-FIX-BE-001-SIDECAR-REVIEW`.
- `2026-07-10` - Packet anchored reviewer attention to the mismatch between
  parent `review` state and the currently visible no-diff branch snapshot.
- `2026-07-10` - Packet summarized the seeded service-area coverage, current
  blocking path, missing zero-active-area exemption proof, and handoff wording.
