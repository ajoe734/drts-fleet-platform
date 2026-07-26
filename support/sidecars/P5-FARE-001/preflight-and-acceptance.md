# P5-FARE-001 — Fleet F fare/payment/receipt/retention

Task-ID: P5-FARE-001
Owner: Gemini
Reviewer: Claude
Dependencies: `P5-PAX-001`, `MTX-AUTH-001`
Status: ready for handoff / review

## 1. Preflight and Task Overview

Fleet F (`P5-FARE-001`) covers the multi-taxi fare authority, fare-change rules, payment status machine, token-scoped electronic receipt certificates, 730-day operational retention floor, legal hold integration, and audited controlled exports.

This document presents the preflight verification and acceptance evidence for all required criteria.

## 2. Acceptance Evidence Matrix

| Acceptance Item                                 | Specification / Requirement                                                                                                                                                                                                            | Evidence / Test Verification                                                                                                                                                                           |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Fare version immutable per confirmed ride    | Confirmed ride's `farePolicyVersion` remains pinned to its quote/route snapshot even if the active authorization's fare version is updated.                                                                                            | `p5-fare-001-acceptance.test.ts` → Test 1 verifies that modifying `activeFareVersionId` does not alter the `farePolicyVersion` on operational trip records of confirmed/completed rides.               |
| 2. Fare-change rule visible before confirmation | `RouteFareDisclosureSnapshot` includes `fareChangeRuleDisplayText`. Confirmed rides cannot be mutated via quote anomaly overrides.                                                                                                     | `p5-fare-001-acceptance.test.ts` → Test 2 & `fare-anomaly.service.test.ts` assert that passenger-confirmed quote snapshots reject anomaly overrides (`recordQuoteAnomaly` fails closed).               |
| 3. Payment unavailable never appears paid       | Payment states `not_selected`, `failed`, `manual_recovery`, `authorized`, `refunded` NEVER display or report as `captured`/paid. Provider port absence returns explicit `payment_recovery_provider_not_provisioned`.                   | `p5-fare-001-acceptance.test.ts` → Test 3 & `billing-payment-exception.test.ts` verify read authority fail-closed behavior, disabled action reason codes, and masking of raw card/provider references. |
| 4. Certificate token-scoped                     | Electronic receipt certificates require valid, unexpired, token-scoped access tokens (`passengerAccess.accessToken`). Raw tokens are peppered SHA-256 digests. Invalid or expired tokens return opaque `PASSENGER_RIDE_TOKEN_INVALID`. | `p5-fare-001-acceptance.test.ts` → Test 4 & `multi-taxi-passenger-authority.test.ts` assert token digest secrecy and identical opaque error envelopes.                                                 |
| 5. Completed trip record coverage 100%          | 100% of completed `multi_taxi_direct` orders map 1:1 to `MultiTaxiTripOperationalAdminView`.                                                                                                                                           | `p5-fare-001-acceptance.test.ts` → Test 5 verifies complete mapping of completed orders to operational trip records.                                                                                   |
| 6. Retention floor 730 days                     | Operational trip records calculate `retainUntil` as `completedAt + 730 UTC days` (2 full years retention floor).                                                                                                                       | `p5-fare-001-acceptance.test.ts` → Test 5 asserts `retainUntil - generatedAt >= 730 days`.                                                                                                             |
| 7. Legal hold prevents purge                    | `readOperationalRecordLegalHold` queries evidence governance (`proof_bundle`). Active legal holds set state to `active` and include hold case details.                                                                                 | `p5-fare-001-acceptance.test.ts` → Test 6 & `multi-taxi.service.test.ts` verify active legal hold filtering and display.                                                                               |
| 8. Controlled export audited                    | Server-generated controlled export (`ReportingFilingService`) generates signed download URLs with 15-min TTL and records audit logs containing actor ID, request ID, record count, and access action.                                  | `p5-fare-001-acceptance.test.ts` → Test 6 & `multi-taxi-controlled-export.test.ts` verify full lifecycle: preview -> create export job -> background completion -> signed URL download -> audit trail. |
| 9. Unit+integration+e2e green                   | All test suites pass cleanly across backend (`@drts/api`), passenger web (`@drts/passenger-web`), and platform admin web (`@drts/platform-admin-web`).                                                                                 | API unit tests: 141 files / 992 tests PASS; passenger web: 5 files / 37 tests PASS; platform admin web: 4 files / 29 tests PASS.                                                                       |

## 3. Test Command Executions

```text
pnpm --filter @drts/api test                          PASS (141 files / 992 tests)
pnpm --filter @drts/passenger-web test                PASS (5 files / 37 tests)
pnpm --filter @drts/platform-admin-web test           PASS (4 files / 29 tests)
```

## 4. UI Contract & Realm Tokens Verification

- Platform Admin Web and Passenger Web follow `@drts/ui-tokens` realm token guidelines.
- No ad-hoc hex overrides or raw unstyled components introduced.
- Ops and Admin surfaces adhere to `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/08_multi_taxi_operations_ui_design_requirements_20260723.md` §9-§10.

## 5. Closeout Summary

All acceptance criteria for `P5-FARE-001` are fully satisfied and verified with empirical test evidence. Ready for reviewer (`Claude`) handoff.
