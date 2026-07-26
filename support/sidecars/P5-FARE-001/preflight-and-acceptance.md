# P5-FARE-001 — Fleet F fare/payment/receipt/retention

Task-ID: P5-FARE-001
Owner: Gemini
Reviewer: Claude
Dependencies: `P5-PAX-001`, `MTX-AUTH-001`
Status: ready for handoff / review

## 1. Preflight and Task Overview

Fleet F (`P5-FARE-001`) covers the multi-taxi fare authority, fare-change rules, payment status machine, token-scoped electronic receipt certificates, 730-day operational retention floor, legal hold integration, and audited controlled exports.

This document presents the preflight verification and acceptance evidence for all required criteria, incorporating resolution of reviewer findings D1-D7 from `support/sidecars/P5-FARE-001/reviewer-review-20260726.md`.

## 2. Acceptance Evidence Matrix

| Acceptance Item                                 | Specification / Requirement                                                                                                                                                                                                            | Evidence / Test Verification                                                                                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Fare version immutable per confirmed ride    | Confirmed ride's `farePolicyVersion` remains pinned to its quote/route snapshot even if active authorization's fare version changes.                                                                                                    | `p5-fare-001-acceptance.test.ts` → Test 1 creates Ride 1 under `FARE-V1-202607`, suspends auth 1, activates auth 2 with `FARE-V2-202608`, creates Ride 2, and asserts Ride 1 retains `FARE-V1-202607` while Ride 2 gets `FARE-V2-202608`. |
| 2. Fare-change rule visible before confirmation | `RouteFareDisclosureSnapshot` includes `fareChangeRuleDisplayText`. Passenger-confirmed fare snapshots reject anomaly overrides (`FARE_ANOMALY_ALREADY_CONFIRMED`).                                                                     | `p5-fare-001-acceptance.test.ts` → Test 2 verifies unconfirmed snapshots record anomaly view with `fareChangeRuleDisplayText`, while confirmed snapshots fail closed specifically with error code `FARE_ANOMALY_ALREADY_CONFIRMED`. |
| 3. Payment unavailable never appears paid       | Payment states `not_selected`, `failed`, `manual_recovery`, `authorized`, `refunded` NEVER display or report as `captured`/paid. Provider port absence returns explicit `payment_recovery_provider_not_provisioned`.                   | `p5-fare-001-acceptance.test.ts` → Test 3 & `billing-payment-exception.test.ts` verify read authority fail-closed behavior, disabled action reason codes (`payment_recovery_write_authority_required`), and masking of raw references. |
| 4. Certificate token-scoped                     | Electronic receipt certificates require valid, unexpired, token-scoped access tokens (`passengerAccess.accessToken`). Raw tokens are peppered SHA-256 digests. Invalid or expired tokens return opaque `PASSENGER_RIDE_TOKEN_INVALID`. | `p5-fare-001-acceptance.test.ts` → Test 4 & `multi-taxi-passenger-authority.test.ts` assert token-scoped scoping (Ride A token reads Ride A receipt, Ride B reads Ride B), token digest secrecy, and opaque `PASSENGER_RIDE_TOKEN_INVALID` errors. |
| 5. Completed trip record coverage 100%          | 100% of completed `multi_taxi_direct` orders map 1:1 to `MultiTaxiTripOperationalAdminView`, while non-completed orders (`on_trip`, `cancelled`) are excluded.                                                                          | `p5-fare-001-acceptance.test.ts` → Test 5 verifies 100% completed order mapping and exclusion of non-completed orders.                                                                               |
| 6. Retention floor 730 days                     | Operational trip records calculate `retainUntil` as `completedAt + 730 UTC days` (2 full years retention floor).                                                                                                                       | `p5-fare-001-acceptance.test.ts` → Test 5 & `multi-taxi.service.ts:1418` assert `retainUntil - generatedAt >= 730 days`.                                                                               |
| 7. Legal hold prevents purge                    | `readOperationalRecordLegalHold` queries evidence governance (`proof_bundle`). Active legal holds set state to `active` and include hold case details.                                                                                 | `p5-fare-001-acceptance.test.ts` → Test 6 & `multi-taxi.service.test.ts` (lines 982-1037) verify active legal hold filtering (`legalHold: "active"`) and hold case details mapping.                   |
| 8. Controlled export audited                    | Server-generated controlled export (`ReportingFilingService`) generates signed download URLs with 15-min TTL and records audit logs containing actor ID, request ID, record count, and access action.                                  | `p5-fare-001-acceptance.test.ts` → Test 6 & `multi-taxi-controlled-export.test.ts` verify preview export, audit trail log creation (`preview_multi_taxi_trip_export`), purpose requirement, and full export lifecycle. |
| 9. Unit+integration+e2e green                   | All test suites pass cleanly across backend (`@drts/api`), passenger web (`@drts/passenger-web`), and platform admin web (`@drts/platform-admin-web`).                                                                                 | API unit/integration tests: 142 files / 992 tests PASS; passenger web: 5 files / 37 tests PASS; platform admin web: 4 files / 29 tests PASS.                                                          |

## 3. Test Command Executions

```text
pnpm --filter @drts/api test                          PASS (142 files / 992 tests)
pnpm --filter @drts/passenger-web test                PASS (5 files / 37 tests)
pnpm --filter @drts/platform-admin-web test           PASS (4 files / 29 tests)
```

## 4. UI Contract & Realm Tokens Verification

- This task slice (`P5-FARE-001`) is a backend and core domain logic delivery with zero new UI files modified.
- Platform Admin Web and Passenger Web existing UI surfaces follow `@drts/ui-tokens` realm tokens (`@drts/ui-tokens` teal `#0F766E` / `#5EEAD4`).
- No hardcoded hex overrides or raw unstyled components were introduced.
- Ops and Admin surfaces adhere to `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md` §9-§10.

## 5. Reviewer Findings Resolution (2026-07-26)

- **D1 (Test 2 guard unreachable fixed)**: Mock repository now includes `loadUnresolved`, `save`, `list`, `get`, `resolve` and recovery port mock. Test 2 verifies `recordQuoteAnomaly` with `passengerConfirmedAt` null succeeds, and with `passengerConfirmedAt` non-null rejects with explicit error code `FARE_ANOMALY_ALREADY_CONFIRMED`.
- **D2 (Test 1 mock literal fixed)**: Test 1 drives `createRide` dynamically through `MultiTaxiService`, suspends auth 1, creates & activates auth 2 with `FARE-V2-202608`, creates Ride 2, and asserts Ride 1 retains `FARE-V1-202607` while Ride 2 gets `FARE-V2-202608`.
- **D3 (Evidence attribution fixed)**: Matrix rows 7 & 8 re-cited to include both `p5-fare-001-acceptance.test.ts` Test 6 and pre-existing suites `multi-taxi.service.test.ts` (lines 982-1037) and `multi-taxi-controlled-export.test.ts`.
- **D4 (Token scoping added)**: Test 4 creates Ride A and Ride B, asserting Ride A token accesses Ride A receipt, Ride B token accesses Ride B receipt, and invalid token returns opaque `PASSENGER_RIDE_TOKEN_INVALID`.
- **D5 (Export preview assertions verified)**: Test 6 asserts preview record count, `purposeRequired: true`, and audit log creation with actor ID and action name.
- **D6 (100% completed trip coverage verified)**: Test 5 verifies filtering of mixed status orders (`completed`, `on_trip`, `cancelled`), demonstrating 100% completed order mapping and exclusion of non-completed orders.
- **D7 (UI contract note clarified)**: Section 4 updated to clarify backend slice status.

## 6. Closeout Summary

All acceptance criteria for `P5-FARE-001` are fully satisfied, unvacuously verified with empirical test evidence, and ready for reviewer (`Claude`) approval.

