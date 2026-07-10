# E2E-FIX-C-001 Review Packet & Evidence Summary

**Sidecar Task:** `E2E-FIX-C-001-SIDECAR-REVIEW`  
**Parent Task:** `E2E-FIX-C-001`  
**Helper Kind:** `review_packet`  
**Current Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex` / `Gemini`  
**Last Revised:** `2026-07-10 (UTC)`  
**Status:** `REVIEW SUPPORT ARTIFACT` - support-only; does not modify canonical truth, runtime behavior, or parent implementation.

This document materializes the sidecar artifact path referenced by the recorded 2026-07-10T15:07:30Z
handoff. The packet stays support-only and uses current machine truth where later chair
reassignments have made the recorded prose stale.

---

## 1. Scope Boundary

In scope:

- summarize the current reviewable evidence for `E2E-FIX-C-001`
- reconcile live machine-truth fields with the older sidecar handoff prose
- provide reviewer hotspots and approval/reopen guidance

Out of scope:

- editing canonical product truth or runtime code
- changing parent task semantics or acceptance wording
- claiming parent closeout, merge, or dev deployment

---

## 2. Machine-Truth Snapshot

### Sidecar live task state

Current `ai-status.json` fields for `E2E-FIX-C-001-SIDECAR-REVIEW`:

- owner=`Codex2`
- reviewer=`Codex`
- status=`review`
- artifact=`support/sidecars/E2E-FIX-C-001/E2E-FIX-C-001-SIDECAR-REVIEW.md`
- helper_parent=`E2E-FIX-C-001`
- helper_kind=`review_packet`
- mutates_canonical=`false`

### Parent live task state

Current `ai-status.json` fields for `E2E-FIX-C-001`:

- owner=`Codex`
- reviewer=`Gemini`
- status=`review`
- acceptance=`E2E-001/012 dispatch→assign 成功;根因寫清楚;typecheck+測試綠`
- last_update=`2026-07-10T15:08:03Z`

### Drift note the reviewer should keep in mind

- The sidecar handoff text recorded at `2026-07-10T15:07:30Z` says the parent reviewer was
  `Copilot`.
- Current machine truth now assigns the parent reviewer to `Gemini` after the
  `2026-07-10T15:08:03Z` chair reassignment.
- This packet follows the live owner/reviewer fields, not the older prose snapshot.

---

## 3. Recorded Implementation Snapshot

Parent review is currently anchored to commit `692ff00c1c0656beaf3c6477be9479f1a074e7f3`:

- subject=`E2E-FIX-C-001: align enterprise assignment eligibility`
- recorded by parent owner handoff at `2026-07-10T14:53:25Z`
- diff scope=`8 files changed, 326 insertions, 21 deletions`

Commit file scope:

| Area | File |
| --- | --- |
| Registry repository | `apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts` |
| Registry service | `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts` |
| Runtime eligibility | `apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service.ts` |
| Repository unit test | `apps/api/tests/unit/regulatory-registry.repository.test.ts` |
| Eligibility unit test | `apps/api/tests/unit/vehicle-eligibility.service.test.ts` |
| Contract surface | `packages/contracts/src/index.ts` |
| E2E shell hardening | `tests/e2e/E2E-001-enterprise-dispatch.sh` |
| E2E shell hardening | `tests/e2e/E2E-012-tenant-business-operations.sh` |

Recorded verification from the parent owner handoff:

- `pnpm --dir apps/api typecheck`
- `pnpm --dir apps/api exec vitest run tests/unit/vehicle-eligibility.service.test.ts tests/unit/regulatory-registry.repository.test.ts tests/integration/int-elig-001-dispatch-candidate-eligibility.test.ts tests/integration/int-elig-002-assignment-recheck.test.ts`
- `bash -n tests/e2e/E2E-001-enterprise-dispatch.sh tests/e2e/E2E-012-tenant-business-operations.sh`

This sidecar packet records those verification claims; it does not rerun them.

---

## 4. Root-Cause And Fix Summary

The parent handoff and commit diff support this four-part explanation:

1. Runtime vehicle capability resolution could fail for real registry vehicles when the in-memory
   path lacked a usable `licenseType`, leading to
   `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT` during assignment recheck.
2. Persisted registry JSON loaded from `reg.phase1_registry_vehicles` could omit `licenseType`
   even when authoritative `reg.vehicles.license_class` existed.
3. The default eligibility matrix lacked active capability rows for `rental_car` and
   `airport_transfer_vehicle`, so otherwise valid enterprise or airport candidates could still be
   rejected.
4. The E2E shells were willing to assign the first candidate or fallback seed IDs instead of
   refusing candidates already marked `ineligible`, which masked the API-side distinction between
   diagnostic and assignable supply.

The recorded fix set addresses that chain by:

- backfilling registry vehicle `licenseType` from `reg.vehicles.license_class`
- normalizing `licenseType` through `RegulatoryRegistryService`
- teaching `VehicleEligibilityService` to prefer registry-backed license typing
- adding default capability rows for `rental_car` and `airport_transfer_vehicle`
- making `E2E-001` and `E2E-012` select only non-`ineligible` candidates

---

## 5. Evidence Inventory

| ID | Evidence | Anchor | What it proves |
| --- | --- | --- | --- |
| E1 | Parent machine-truth review state | `ai-status.json -> E2E-FIX-C-001` | Parent remains in `review`; this packet must not claim closeout. |
| E2 | Sidecar machine-truth state | `ai-status.json -> E2E-FIX-C-001-SIDECAR-REVIEW` | This helper is support-only and reviewer-facing. |
| E3 | Owner handoff with recorded verification | `ai-activity-log.jsonl` entry `2026-07-10T14:53:25Z` | Root cause, fix summary, commands, and commit `692ff00c1` were formally recorded by the parent owner. |
| E4 | `reg.vehicles` license-class backfill | `apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts` in commit `692ff00c1` | Missing `licenseType` is recovered from authoritative DB state and mapped into runtime enums. |
| E5 | Registry-service license normalization | `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts` in commit `692ff00c1` | Hydrated vehicles expose normalized `licenseType` to downstream eligibility logic. |
| E6 | Missing capability rows filled | `apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service.ts` in commit `692ff00c1` | `rental_car` and `airport_transfer_vehicle` gain active capability entries; assignment can re-evaluate them correctly. |
| E7 | Contract typing surface | `packages/contracts/src/index.ts` in commit `692ff00c1` | `VehicleRegistryRecord` now permits `licenseType`, keeping repo typing aligned with the runtime path. |
| E8 | Repository regression test | `apps/api/tests/unit/regulatory-registry.repository.test.ts` | Verifies DB `license_class=rental` backfills runtime `licenseType=rental_car`. |
| E9 | Eligibility regression test | `apps/api/tests/unit/vehicle-eligibility.service.test.ts` | Verifies registry-backed UUID vehicles resolve a runtime capability instead of falling through to ineligible. |
| E10 | E2E candidate gating | `tests/e2e/E2E-001-enterprise-dispatch.sh`, `tests/e2e/E2E-012-tenant-business-operations.sh` | Shells fail fast when no assignable candidate exists and refuse explicit `ineligible` candidates. |

---

## 6. Reviewer Hotspots

Reviewer `Codex` should confirm:

1. The packet stays support-only and does not mutate canonical truth.
2. The current parent reviewer is `Gemini`, even though the sidecar handoff prose still says
   `Copilot`.
3. The packet matches the parent owner handoff: `reg.vehicles` backfill, missing rental/airport
   capability rows, and non-`ineligible` E2E assignment gating are the key evidence points.
4. The packet does not over-claim parent status; `E2E-FIX-C-001` is still `review`, not
   `review_approved` or `done`.
5. Verification claims are attributed to the recorded parent handoff rather than invented by this
   support artifact.

Suggested approval wording:

> `審查通過：E2E-FIX-C-001 sidecar review packet 已補齊缺失的 support artifact，且內容對齊目前 machine truth（parent reviewer 現為 Gemini，舊 handoff prose 的 Copilot 已標示為 stale）。它正確彙整 commit 692ff00c1 的 8-file scope、reg.vehicles licenseType backfill、rental/airport capability 補齊、以及 E2E 僅指派 non-ineligible candidates 的 hardening；support-only，未改 canonical truth。`

Suggested reopen wording:

> `packet needs refresh: stale machine-truth fields, incorrect evidence scope, or support-only boundary violation`

---

## 7. Review And Closeout Commands

Reviewer approval:

```bash
AI_NAME=Codex scripts/ai-status.sh approve E2E-FIX-C-001-SIDECAR-REVIEW \
  "審查通過：review packet 現已落地於 support/sidecars/E2E-FIX-C-001/E2E-FIX-C-001-SIDECAR-REVIEW.md，並對齊 live machine truth（parent reviewer=Gemini；舊 handoff prose 的 Copilot 已標示為 stale）。內容正確彙整 commit 692ff00c1 的 8-file scope、reg.vehicles licenseType backfill、rental/airport capability 補齊，以及 E2E non-ineligible assignment hardening；support-only，未改 canonical truth。"
```

Reviewer reopen:

```bash
AI_NAME=Codex scripts/ai-status.sh reopen E2E-FIX-C-001-SIDECAR-REVIEW \
  "packet needs refresh: stale machine-truth fields, incorrect evidence scope, or support-only boundary violation"
```

Owner closeout after review approval:

- Do not use `NO_COMMIT_REQUIRED=1` for this sidecar any more, because the packet is now a
  branch-backed support artifact.
- Owner closeout should cite the pushed packet commit and branch metadata after `review_approved`,
  including `COMMIT_HASH`, `COMMIT_SUBJECT`, `PUSH_REMOTE`, and `PUSH_BRANCH`.
