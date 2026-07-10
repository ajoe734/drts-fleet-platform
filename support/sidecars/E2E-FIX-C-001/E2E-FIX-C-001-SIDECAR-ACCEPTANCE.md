# E2E-FIX-C-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `E2E-FIX-C-001` - Enterprise dispatch assignment eligibility regression (E2E-001/012)  
**Parent Owner:** `Codex`  
**Parent Reviewer:** `Copilot`  
**Sidecar Owner:** `Codex2`  
**Sidecar Reviewer:** `Gemini`
**Generated:** `2026-07-10` (UTC)  
**Status:** `ACCEPTANCE SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or parent implementation.

This packet summarizes the current reviewer-facing evidence for the enterprise dispatch assignment
eligibility fix. It is scoped to support material only and intentionally leaves live lifecycle
fields authoritative in `ai-status.json`.

---

## 1. Scope Boundary

In scope:

- capture the acceptance checklist for `E2E-FIX-C-001` as currently dispatched
- map the dependency chain between seeded supply, regulatory registry hydration, runtime vehicle
  eligibility, and the shell E2E flows
- provide a reviewer handoff packet with concrete code and commit anchors

Out of scope:

- editing L1/L2 canonical truth
- changing parent runtime behavior, contracts, or tests
- mutating the parent task record in `ai-status.json`

---

## 2. Machine Truth Anchors

### Sidecar - `ai-status.json -> E2E-FIX-C-001-SIDECAR-ACCEPTANCE`

- owner=`Codex2`
- reviewer=`Gemini`
- status is live in `ai-status.json`
- task_class=`sidecar`
- helper_parent=`E2E-FIX-C-001`
- helper_kind=`acceptance_packet`
- mutates_canonical=`false`
- artifacts=`support/sidecars/E2E-FIX-C-001/E2E-FIX-C-001-SIDECAR-ACCEPTANCE.md`

### Parent - `ai-status.json -> E2E-FIX-C-001`

- owner=`Codex`
- reviewer=`Copilot`
- status=`review`
- artifacts:
  - `apps/api/src/modules/owned-mobility/`
  - `tests/e2e/E2E-001-enterprise-dispatch.sh`
- acceptance:
  - `E2E-001/012 dispatch→assign 成功;根因寫清楚;typecheck+測試綠`

### Current implementation evidence lineage

- `8a4fc79df6a4a75bc67b6ff9d2f540ed1e5e2bf7`
  - `fix(E2E-FIX-C-001): recognize seeded enterprise supply`
- `692ff00c1c0656beaf3c6477be9479f1a074e7f3`
  - `E2E-FIX-C-001: align enterprise assignment eligibility`

Interpretation:

- The first commit closes the immediate seed-ID mismatch for S0002 enterprise supply.
- The second commit aligns the deeper registry-to-runtime eligibility path and updates E2E scripts
  to assign only candidates that the API marks assignable.

---

## 3. Regression Summary

Observed regression surface from the task brief:

- `E2E-001` and `E2E-012` failed during dispatch assignment with
  `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT` or
  `ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT`.

Root-cause chain captured by the parent fix set:

1. Runtime vehicle eligibility seeded a small local vehicle-ID-to-license map that did not include
   the staging-like S0002 business-dispatch vehicle UUID.
2. Regulatory registry persisted vehicle state could also lack `licenseType` in the JSON snapshot,
   even when `reg.vehicles.license_class` held the authoritative license class.
3. Candidate lists returned by `/dispatch/tasks/:dispatchJobId/candidates` could include entries
   that shells should not blindly assign if the API has already marked them `ineligible`.
4. The shell E2E scripts previously defaulted to the first candidate or fallback seed IDs, which
   obscured whether the API had actually produced an assignable enterprise candidate.

Result:

- enterprise dispatch could see supply, but assignment re-evaluation still rejected the selected
  vehicle because runtime eligibility and registry hydration were not aligned to the real seeded
  fleet records

---

## 4. Dependency Map

| Dependency surface | Evidence anchor | Why it matters |
| --- | --- | --- |
| Seeded enterprise supply IDs | `apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service.ts` | Runtime fallback capability resolution must recognize the operational seed UUIDs used by E2E/staging-like data. |
| Canonical vehicle license class | `apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts` | Parent fix now hydrates `licenseType` from `reg.vehicles.license_class` when JSON records do not carry it. |
| Registry state consumers | `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts` | Downstream eligibility and dispatch read hydrated vehicle records; missing license typing here propagates to assignment rejection. |
| Runtime eligibility matrix | `apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service.ts` | Determines which service products a vehicle may serve and whether `enterprise_dispatch` is allowed. |
| Contract surface export | `packages/contracts/src/index.ts` | Parent fix exports the added/used license-type contract so the API surface remains type-consistent. |
| Candidate selection behavior in shell acceptance | `tests/e2e/E2E-001-enterprise-dispatch.sh`, `tests/e2e/E2E-012-tenant-business-operations.sh` | E2E now fails fast if no assignable candidate exists instead of masking the regression by forcing seed fallback IDs. |

No new machine-truth dependency edges are introduced by this packet.

---

## 5. Accepted Delivery Surface

Reviewer should treat the parent fix as spanning these concrete areas:

- `apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service.ts`
  - adds S0002 seed UUID mapping for runtime capability resolution
  - keeps `enterprise_dispatch` eligibility bound to business-dispatch-capable license types
- `apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts`
  - loads `vehicle_id, license_class` from `reg.vehicles`
  - maps DB license classes into runtime `VehicleLicenseType`
  - backfills `licenseType` onto hydrated vehicle registry records
- `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`
  - consumes the now-complete hydrated registry state
- `apps/api/tests/unit/vehicle-eligibility.service.test.ts`
  - proves the S0002 business vehicle UUID resolves as `business_vehicle`
- `apps/api/tests/unit/regulatory-registry.repository.test.ts`
  - proves repository hydration maps DB `license_class` into runtime `licenseType`
- `tests/e2e/E2E-001-enterprise-dispatch.sh`
- `tests/e2e/E2E-012-tenant-business-operations.sh`
  - both scripts now select the first non-`ineligible` candidate and fail if none is assignable

---

## 6. Acceptance Checklist

Legend: `[PARENT]` = parent task acceptance support. `[SIDECAR]` = helper acceptance support.

### A. Root cause is explicit `[PARENT]`

- [x] Packet explains the seed UUID mismatch in runtime eligibility.
- [x] Packet explains the registry hydration gap where `licenseType` may be absent from persisted
      JSON but present in `reg.vehicles.license_class`.
- [x] Packet explains why candidate selection needed to stop forcing first/fallback IDs.

### B. Enterprise assignment path is covered end-to-end `[PARENT]`

- [x] Runtime capability resolution now recognizes seeded UUID
      `10000000-0000-0000-0000-000000000353` as `business_vehicle`.
- [x] Regulatory registry repository maps `license_class` values into runtime
      `VehicleLicenseType`, including `other -> business_vehicle`.
- [x] Reviewer can trace the dependency chain from DB seed/license class -> hydrated registry
      vehicle -> runtime eligibility -> dispatch candidate -> assign request.

### C. Test/evidence coverage exists `[PARENT]`

- [x] Unit coverage exists for S0002 UUID runtime eligibility recognition.
- [x] Unit coverage exists for registry license-class hydration.
- [x] E2E scripts for both `E2E-001` and `E2E-012` reject candidate payloads that are already
      marked `ineligible`.

### D. Sidecar scope is preserved `[SIDECAR]`

- [x] Only support artifact output is added under `support/sidecars/E2E-FIX-C-001/`.
- [x] No canonical truth or runtime code is edited by this sidecar task.
- [x] Packet is ready to hand off to sidecar reviewer `Gemini`.

---

## 7. Evidence Inventory

| ID | Evidence | Anchor | Relevance |
| --- | --- | --- | --- |
| E1 | Parent machine-truth state | `ai-status.json -> E2E-FIX-C-001` | Confirms parent is currently in `review`, not yet closeout-complete. |
| E2 | Seed UUID runtime recognition fix | commit `8a4fc79df6a4a75bc67b6ff9d2f540ed1e5e2bf7` | Adds S0002 seed UUIDs to runtime vehicle-license lookup. |
| E3 | Registry/license alignment fix | commit `692ff00c1c0656beaf3c6477be9479f1a074e7f3` | Aligns registry hydration and assignment behavior. |
| E4 | Seed UUID test | `apps/api/tests/unit/vehicle-eligibility.service.test.ts` | Verifies UUID `...0353` resolves to `business_vehicle` and is enterprise-dispatch eligible. |
| E5 | Registry hydration test | `apps/api/tests/unit/regulatory-registry.repository.test.ts` | Verifies DB `license_class` mapping backfills vehicle `licenseType`. |
| E6 | E2E-001 candidate gating | `tests/e2e/E2E-001-enterprise-dispatch.sh` | Prevents assigning candidates already marked ineligible. |
| E7 | E2E-012 candidate gating | `tests/e2e/E2E-012-tenant-business-operations.sh` | Same protection on the tenant business operations path. |

---

## 8. Reviewer Focus

Primary review questions for `Gemini`:

1. Does the packet accurately capture the two-layer root cause instead of attributing the failure
   only to shell scripts?
2. Does the dependency map correctly explain why registry hydration and runtime eligibility both had
   to be aligned for enterprise dispatch assignment to succeed?
3. Do the evidence anchors sufficiently support the parent acceptance wording
   `E2E-001/012 dispatch→assign 成功;根因寫清楚;typecheck+測試綠` without mutating canonical truth?
4. Is the sidecar still support-only and bounded to the allowed artifact path?

Suggested approval wording:

- `acceptance packet complete; support-only; dependency chain and evidence for E2E-FIX-C-001 assignment-eligibility regression are reviewable from the cited commits, unit tests, and E2E candidate gating`

Suggested reopen wording:

- `packet missing or misstating the registry->eligibility->assignment dependency chain; refresh evidence anchors before approval`

---

## 9. Notes For Parent Owner / Reviewer

Important current-state caveat:

- This packet reflects the parent task while it is still in `review`. It does not claim parent
  closeout, push metadata, or final `done` evidence.

Interpretation guardrail:

- The E2E script changes are evidence-hardening, not the primary business fix. The business fix is
  the runtime/regulatory alignment that makes a valid enterprise candidate remain assignable when
  `/dispatch/assign` re-evaluates eligibility.

Operational implication:

- If review later finds `typecheck+測試綠` evidence incomplete, the gap belongs to the parent task
  closeout path, not to this sidecar packet.
