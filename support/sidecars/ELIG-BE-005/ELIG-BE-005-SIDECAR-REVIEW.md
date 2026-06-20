# ELIG-BE-005 — Review Packet & Evidence Summary (Sidecar)

- **Sidecar task:** `ELIG-BE-005-SIDECAR-REVIEW`
- **Parent task:** `ELIG-BE-005` — *Assignment-time recheck (409 ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT)*
- **Helper kind:** `review_packet` (support-only; does **not** mutate canonical truth)
- **Sidecar owner:** Claude · **Sidecar reviewer:** Codex
- **Parent owner:** Codex · **Parent reviewer:** Claude2 (parent task currently `review`)
- **Prepared:** 2026-06-20

> This is a non-canonical support artifact. It collects the parent diff, spec
> citations, an independent static review, and a verification checklist so the
> parent reviewer can decide fast. The parent owner decides whether to absorb
> any finding into the mainline branch.

---

## 1. Subject under review

| Field | Value |
| --- | --- |
| Parent branch | `codex/elig-be-005` |
| Head commit | `984d80185` — `ELIG-BE-005: recheck assignment eligibility before dispatch` |
| Base (merge-base vs `origin/dev`) | `1695fcea7` |
| Trailers | `LLM-Agent: codex` · `Task-ID: ELIG-BE-005` · `Reviewer: Claude2` ✓ |
| Owner verification cmd | `pnpm exec vitest run tests/unit/owned-mobility.service.test.ts tests/integration/int-elig-002-assignment-recheck.test.ts && pnpm --filter @drts/api typecheck` |

### Diff footprint (`git diff <merge-base>..984d80185`)

```
 apps/api/src/modules/owned-mobility/owned-mobility.controller.ts |   8 +-
 apps/api/src/modules/owned-mobility/owned-mobility.service.ts    | 546 ++++++---
 apps/api/tests/integration/int-elig-002-assignment-recheck.test.ts | 142 ++
 apps/api/tests/unit/owned-mobility.service.test.ts               | 139 +-
 packages/contracts/src/index.ts                                  |   1 +
 5 files changed, 630 insertions(+), 206 deletions(-)
```

---

## 2. Acceptance vs. implementation (spec-cited)

Spec source: `docs/02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md`
(SD §3.3 Assignment, §5.2 recheck, §5.5/Decision; SA §5.7 referenced by brief).

| Acceptance clause | Required behavior (cite) | Implementation | Verdict |
| --- | --- | --- | --- |
| Assignment rechecks before dispatch | "POST /api/dispatch/assign … 內部重新 evaluate" (spec §3.3, L662–668) | `assertAssignmentEligibilityRecheck()` re-runs `VehicleEligibilityService.assertDispatchAssignmentEligible` (or registry fallback) inside `createDispatchAssignment` before any record is created | ✅ Met |
| 409s on change | "若失敗 → `409 ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT` 並回最新 reasons" (spec §3.3, L668–672) | Catches inner `ApiRequestError`, remaps to `HttpStatus.CONFLICT` `ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT` with `reasonCodes[]` + `latestEligibility` (raw inner details) | ✅ Met |
| Fresh transaction re-evaluate | "Assignment 必須使用 fresh transaction 再 evaluate 一次" (spec §5.2, L1234) | DB path: recheck runs **inside** `ownedMobilityRepository.withTransaction(tx => …)` then `persistOrderWorkflow`. In-memory path: synchronous recheck, no tx | ⚠️ Met for DB path only — see F3 |
| Driver task keeps exact product | "DriverTask 保存 exact product context" (spec §2, L101) | New optional `DriverTaskRecord.serviceProductCode?: ServiceProductType \| null` (contracts). `buildDispatchAssignmentBundle` sets it via `resolveServiceProductCodeForOrder`. Persisted in JSONB `record` blob → round-trips on reload (no migration needed) | ✅ Met |
| INT-ELIG-002 passes | spec test ledger L1624 | New `tests/integration/int-elig-002-assignment-recheck.test.ts` — asserts 409 on changed eligibility + exact product on success | ✅ Present (re-run to confirm green — see §5) |

**Conformance verdict: the diff satisfies all five acceptance clauses.** The
remaining items below are review notes, not acceptance blockers (except the
reviewer should make an explicit call on F2).

---

## 3. Static review findings

Severity: 🔴 blocker-candidate · 🟡 should-fix · ⚪ note. Each cites
`owned-mobility.service.ts` on the parent branch.

### 🟡 F1 — Public service methods widened to `: any`
`assignDispatch`, `reassignDispatch`, and `createDispatchAssignment` now declare
`: any` return types. This was done because each can return either a sync object
(in-memory path) or a `Promise<…>` (DB path). `any` defeats type checking for
every caller and hides the sync/async fork.
- **Suggest:** declare a named result type and return
  `AssignDispatchResult | Promise<AssignDispatchResult>`, or normalize to
  always-`Promise` (the controller already `await`s both — §controller diff —
  so always-async is the cleaner, fully-typed option).

### 🔴 F2 — `reassignDispatch` cancels the active assignment *before* the recheck
The old `reassignDispatch` rejected an ineligible vehicle/driver at the **top of
the method** (400 `VEHICLE_NOT_DISPATCHABLE` / `DRIVER_NOT_AVAILABLE`) **before**
touching the existing assignment. This diff **removes that early gate** and
instead relies on the recheck inside `createDispatchAssignment`, which now runs
*after* the active assignment + task have already been set to `cancelled` and
**persisted** (`persistChanges(..., "reassign_dispatch")`).

Consequences for a reassign to an ineligible candidate:
1. The previously-good assignment/task is cancelled and committed.
2. The recheck then throws `409 ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT`.
3. Net state: order left with a cancelled assignment and **no replacement**.
4. In the DB path, the cancellation `persistChanges` ran **outside** the
   `withTransaction` that wraps the new assignment — so the failure is not
   rolled back (non-atomic reassign).
5. The externally observable error code for a failed reassign **silently
   changed from 400 → 409**, and `ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT` is
   arguably the wrong semantic for an operator-initiated reassign to a
   known-ineligible target.

- **Reviewer decision needed:** is reassign-into-ineligible expected to leave the
  order unassigned? If not, re-add an eligibility pre-check at the top of
  `reassignDispatch` (before cancellation), or wrap cancel+recreate in one
  transaction. ELIG-BE-005's brief scopes only `/dispatch/assign`; the reassign
  behavior change may be an unintended side effect of de-duplicating the checks.

### ⚪ F3 — In-memory path is not transactional
Spec §5.2 ("fresh transaction") is honored only when
`ownedMobilityRepository.isEnabled()`. The in-memory fork does a plain
synchronous recheck. Acceptable for the dev/test harness, but the "fresh
transaction" guarantee should be documented as DB-path-only so no one assumes
isolation in unit-test mode.

### ⚪ F4 — Reason-code normalization is under-tested
`normalizeAssignmentEligibilityReasonCode` maps inner codes into three buckets
(`SERVICE_PRODUCT_INACTIVE`, `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`,
`DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`) and returns `null` (re-throws raw) for
anything else. Tests exercise only the **vehicle** bucket. No coverage for the
driver bucket, `SERVICE_PRODUCT_INACTIVE`, or the `null`/passthrough branch, nor
for the reassign-after-cancel path in F2.
- **Suggest:** add a driver-ineligible recheck case and a passthrough case.

### ⚪ F5 — `buildTraceLog` vs `appendTrace` (verified clean)
`buildTraceLog` is a pure variant of `appendTrace` that does **not** push into
`this.dispatchTraceLogs`; `applyDispatchAssignmentBundle` performs the push.
Confirmed there is no double-insert and the bundle builder stays side-effect-free
for the transactional path. No action — noted so the reviewer doesn't flag it.

---

## 4. Contract change review

`packages/contracts/src/index.ts`:
```ts
export interface DriverTaskRecord {
  ...
  assignmentId: string;
+ serviceProductCode?: ServiceProductType | null;   // additive, optional
  driverId: string;
  ...
}
```
- **Backward compatible:** optional field; existing producers/consumers unaffected.
- **Persistence:** stored inside the `ops.phase1_driver_tasks.record` JSONB blob
  and re-hydrated via `parseRecord` — **no schema migration required** (verified
  in `owned-mobility.repository.ts` INSERT/SELECT, both use the whole-record blob).
- **Downstream:** ELIG-MOB-001 (driver-app exact product) is the intended
  consumer; this field is the contract seam it depends on.

---

## 5. Reviewer verification checklist

Run from the parent branch (`git switch codex/elig-be-005` in a clean api checkout):

- [ ] `cd apps/api && pnpm exec vitest run tests/unit/owned-mobility.service.test.ts tests/integration/int-elig-002-assignment-recheck.test.ts` → expect green
- [ ] `pnpm --filter @drts/api typecheck` → expect 0 errors
- [ ] Confirm 409 envelope shape matches spec L668 (code + `reasonCodes` + latest reasons)
- [ ] Decide F2 (reassign cancel-before-recheck) — accept as-is or request fix
- [ ] Confirm `serviceProductCode` is present on a reloaded driver task in the DB-backed path (not only in-memory)
- [ ] Spot-check that no `origin/dev` integration (REP-BE-002 / ELIG-BE-003 chain) conflicts at merge — branch base is `1695fcea7`; `origin/dev` has advanced to `8a4ff8a8d`, so a rebase + re-run is advisable before merge (§11.6 gate)

---

## 6. Reviewer handoff

**To:** Codex (sidecar reviewer)

Summary: ELIG-BE-005 @ `984d80185` meets all five acceptance clauses with cited
spec backing. One blocker-candidate (**F2**, reassign cancels before recheck →
non-atomic, code 400→409) needs an explicit accept/reject from the parent
review; F1 (`any` returns) is a should-fix type-safety regression; F3/F4 are
low-risk notes; F5 verified clean. Contract change is additive and needs no
migration. Recommend rebase onto current `origin/dev` before the §11.6 merge gate.

`INTEGRATION_STATUS: not_applicable` (support-only review packet; no runtime change).

---

## 7. Codex reviewer validation (2026-06-20)

- Validation was run against detached parent commit `984d80185`.
- Environment repair required one dependency relink step before validation:
  `CI=true pnpm install --frozen-lockfile`.
- `cd apps/api && pnpm exec vitest run tests/unit/owned-mobility.service.test.ts tests/integration/int-elig-002-assignment-recheck.test.ts`
  passed: `2` files, `59` tests.
- `pnpm --filter @drts/api typecheck` passed.
- Manual diff review reconfirmed **F2**: `reassignDispatch()` persists the
  cancellation path before `createDispatchAssignment()` runs
  `assertAssignmentEligibilityRecheck()`, so a failed reassign can leave the
  order with no active replacement and changes the observable error semantics
  from the previous `400` pre-check behavior to a post-cancel `409`.
- The `409 ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT` envelope shape is exercised in
  both `tests/unit/owned-mobility.service.test.ts` and
  `tests/integration/int-elig-002-assignment-recheck.test.ts`.
- Not revalidated in this sidecar pass:
  DB-backed reload proof for `DriverTaskRecord.serviceProductCode`, and a fresh
  rebase/merge conflict pass against current `origin/dev`.

**Reviewer disposition:** approve this sidecar packet as accurate and sufficient
for parent-task review. Do **not** treat this as parent-branch approval; parent
review should request a fix or explicit product acceptance for **F2**.
