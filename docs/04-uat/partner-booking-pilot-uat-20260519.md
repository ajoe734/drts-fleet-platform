# Partner Booking Pilot UAT

**Date:** 2026-05-19  
**Task:** `PBK-UAT-001`  
**Workflow family:** `WF-PBK-001`  
**Owner:** `Codex2`  
**Reviewer:** `Claude`

This document defines the UAT coverage for the partner-booking pilot cutover
surface. It consolidates the five authority-safe negative paths from
`PBK-UI-004` with the pilot cutover proof carried by
`TST-E2E-008-PBK-CUTOVER` (`tests/e2e/E2E-008-partner-booking-cutover.sh`).

## Scope

- Validate one named partner entry moving through the `sandbox -> pilot`
  cutover path described by
  `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`.
- Confirm the new `apps/partner-booking-web` surface preserves the five
  authority-safe denial states introduced by `PBK-UI-004`:
  `eligible`, `ineligible`, `manual_review`, `inactive`,
  `eligibility-required`.
- Confirm pilot cutover keeps rollback-safe coexistence with the legacy
  `apps/tenant-console-web/app/partner/*` route and does not over-claim
  retirement of `tenant-commute-hub` partner mode.

## Source Anchors

- `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
- `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`
- `tests/e2e/E2E-008-partner-booking-cutover.sh`
- `apps/partner-booking-web/README.md`
- `support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md`

## Preconditions

1. The partner-entry record is `active`, names a `cutoverOwner` and
   `rollbackOwner`, and the parent tenant has `rollbackPrepared = true`.
2. `apps/partner-booking-web` still satisfies repo-local readiness:
   build, lint, typecheck, and Storybook parity for the seven `PB_*`
   funnel screens.
3. The partner entry exposes a valid `entrySlug` ingress and partner
   credential for bootstrap-session testing.
4. The legacy `apps/tenant-console-web/app/partner/*` route remains
   reachable for the same partner entry throughout pilot and retention.

## UAT Matrix

| ID | Scenario | Steps | Expected Result | Primary evidence |
| --- | -------- | ----- | --------------- | ---------------- |
| `PBK-UAT-01` | Inactive partner entry blocks bootstrap | Deactivate the partner entry, then call partner bootstrap for the same `entrySlug`. | Bootstrap fails with `403` and `PARTNER_ENTRY_INACTIVE`; no pilot traffic is admitted while the entry is inactive. | `E2E-008` leg 1; `PBK-UI-004` `inactive` route parity |
| `PBK-UAT-02` | Rollback-safe reactivation restores bootstrap | Reactivate the same entry, then repeat bootstrap and eligibility verification. | Bootstrap returns an access token, eligibility succeeds, and the returned record preserves the same `partnerEntrySlug`. | `E2E-008` leg 2 |
| `PBK-UAT-03` | Eligible partner can complete pilot booking | Use an eligible verification to create a partner-linked airport booking through backend authority. | Booking creation succeeds, `partnerEntrySlug` and `eligibilityVerificationId` persist on the booking, and the flow remains authority-backed rather than mock-only. | `E2E-008` leg 3 |
| `PBK-UAT-04` | Ineligible denial is user-visible | Open the direct `ineligible` route in `apps/partner-booking-web` and compare with the legacy partner route for the same entry. | The new app shows the same denial intent as the legacy route, stops at the eligibility gate, and does not silently fall through to booking. | `PBK-UI-004` route-state mapping; legacy parity check from cutover Stage 1 |
| `PBK-UAT-05` | Manual-review denial is user-visible | Open the direct `manual_review` route in the new app and compare with the legacy route. | The new app presents the manual-review hold state at the eligibility gate and preserves rollback-support parity with the legacy route. | `PBK-UI-004` route-state mapping; cutover Stage 1 |
| `PBK-UAT-06` | Eligibility-required denial blocks booking | Open the direct `eligibility-required` route and attempt to proceed without a verification id. | The flow stops at the booking gate, shows an eligibility-required denial, and does not create a booking. | `PBK-UI-004` scenario mapping; legacy booking gate parity |
| `PBK-UAT-07` | Legacy route remains valid during pilot | During pilot or retention, load the same negative-path scenarios on `apps/tenant-console-web/app/partner/*`. | The legacy route remains reachable and exhibits parity for the five negative paths while rollback retention is still open. | Cutover runbook Stage 1 and Acceptance |
| `PBK-UAT-08` | Finance and receipt ownership survive the cutover path | Retrieve finance evidence for the created partner-linked booking. | Receipt / invoice evidence remains retrievable and tied to the same partner-linked booking without breaking the rollback-safe active state restoration. | `E2E-008` leg 4 |
| `PBK-UAT-09` | Entry is restored to an active rollback-safe state | Finish the scenario and confirm the entry is active again. | The partner entry ends the test in `active`; pilot validation does not strand the entry in a degraded state. | `E2E-008` pass criterion 5 |

## Negative-Path Expectations

The five authority-safe states are the minimum UAT denial set for
`WF-PBK-001`.

| State | New-app route token | Expected stop screen | UAT interpretation |
| ----- | ------------------- | -------------------- | ------------------ |
| `eligible` | `eligible` | `eligibility` | Positive control: an eligible response can advance into booking flow. |
| `ineligible` | `ineligible` | `eligibility` | User receives a denial at eligibility, with no silent fallback to booking. |
| `manual_review` | `manual_review` | `eligibility` | User sees a hold/manual-review state; pilot may not bypass it. |
| `inactive` | `inactive` | `book` | Entry-level deactivation blocks bootstrap / booking access and must align with authority state. |
| `eligibility-required` | `eligibility-required` | `book` | Booking create is blocked until a valid eligibility verification exists. |

## Exit Criteria

Pilot UAT is acceptable only when all of the following are true for the named
partner entry:

1. `PBK-UAT-01` through `PBK-UAT-09` pass or have an explicit reviewer-accepted
   deferral recorded against the entry.
2. The five `PBK-UI-004` denial paths are visible in the new app and remain
   behaviourally aligned with the legacy route during pilot / retention.
3. `E2E-008` evidence confirms inactive rejection, successful reactivation,
   partner-linked booking persistence, finance evidence retrieval, and final
   restoration to `active`.
4. The cutover record captures pilot timestamp, pilot cohort, rollback target,
   support hotline path, and named evidence anchors.

## Non-Claims

This UAT pack does not claim:

- retirement of `tenant-commute-hub` partner mode,
- removal of `apps/tenant-console-web/app/partner/*`,
- closure of `WF-FWD-001`, `WF-COM-001`, or `WF-FIN-001`,
- production promotion beyond the pilot / retention boundary.
