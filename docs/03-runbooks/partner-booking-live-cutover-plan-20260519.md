# Partner Booking Live Cutover Plan

Last updated: 2026-05-22
Task ref: `PH1GC-PBK-001`
Workflow family: `WF-PBK-001`
Owner: `Codex2`
Reviewer: `Codex`
Operational companion: `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`

This document is the canonical plan artifact required by directive §F for the
partner-booking pilot proof. It names one concrete partner-entry cutover plan,
the retained rollback surface, the pilot window, and the evidence bundle that
lets `WF-PBK-001` move from `HOLD` to `PASS (pilot evidence)` without
over-claiming a tenant-wide or production cutover.

## Canonical Role

- This file is the **plan** artifact for `WF-PBK-001`.
- `partner-booking-pilot-cutover-runbook-20260519.md` remains the
  **operational** runbook for day-of execution.
- Neither file authorizes production promotion or retirement of
  `tenant-commute-hub` partner mode.

## Named Pilot Entry

The pilot proof is anchored to the seeded demo partner entry already exercised
by `tests/e2e/E2E-008-partner-booking-cutover.sh`.

| Directive §F field | Planned value |
| --- | --- |
| target partner `entrySlug` | `bank-demo-alpha-airport` |
| current live owner | `tenant-commute-hub` partner mode |
| target surface | `apps/partner-booking-web` via partner-entry ingress (`[tenantSlug]/[entrySlug]`) |
| `cutoverOwner` | `phase1-partner-ops-duty` (proof-role identifier for the pilot evidence pack) |
| `rollbackOwner` | `phase1-tenant-rollback-duty` (proof-role identifier for the pilot evidence pack) |
| rollback route / host | repo-local legacy route `apps/tenant-console-web/app/partner/*`, with upstream fallback to `tenant-commute-hub` partner mode if ingress must fully revert |
| support hotline | `support-hotline://partner-bank-demo-alpha-airport` |
| branding metadata | `partnerCode=partner-bank-demo-001`; `programId=program-airport-alpha`; bank-demo airport white-label branding profile |
| eligibility mode | `credit_card_airport_transfer` with authority-backed partner eligibility verification |
| pilot time window | `2026-05-19T05:04:10Z` to `2026-05-19T07:04:10Z` evidence window, derived from the `TST-E2E-008-PBK-CUTOVER` owner closeout commit timestamp |
| negative paths | inactive entry bootstrap denial plus the five authority-safe `PBK-UI-004` denial paths: `eligible`, `ineligible`, `manual_review`, `inactive`, `eligibility_required` |
| rollback retention | not-before retirement date `2026-06-02T05:04:10Z` (14 calendar days after the pilot evidence timestamp) |

## Workflow Proof Shape

Directive §F requires the following workflow proof:

```text
open partner entry
→ eligibility
→ authenticated booking
→ confirmation
→ trips / tracking
→ receipt / partner record
→ negative paths
→ rollback proof
```

The concrete evidence bundle for this plan is recorded under
`support/sidecars/PBK-PILOT-001/`.

## Evidence Bundle

The named verification set for this plan is:

- `tests/e2e/E2E-008-partner-booking-cutover.sh`
- `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`
- `support/sidecars/PBK-PILOT-001/PBK-PILOT-001-PILOT-EVIDENCE-20260522.md`
- `support/sidecars/PBK-PILOT-001/PH1GC-PBK-001-CLOSEOUT-20260522.md`
- `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-ACCEPTANCE.md`
- `support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md`
- commit `3edd0338a70c265936312f1075503890e54ffa18`
  (`PBK-CUTOVER-001: finalize partner-booking pilot cutover runbook`)
- commit `c264750e95ec5ce614426da7589c08c7f1be4c8f`
  (`TST-E2E-008-PBK-CUTOVER: owner closeout`)

## Retention And Rollback Proof

The required rollback retention is computed from the pilot evidence timestamp:

- Pilot evidence anchor: `2026-05-19T05:04:10Z`
- Minimum rollback retention: `14` calendar days = `336` hours
- Earliest allowed retirement of the legacy rollback surface: `2026-06-02T05:04:10Z`

The retention proof for `WF-PBK-001` is therefore:

1. The legacy repo-local partner route stays reachable through at least
   `2026-06-02T05:04:10Z`.
2. `tenant-commute-hub` partner mode remains the upstream live owner until a
   separate production-cutover task says otherwise.
3. `E2E-008` proves the entry can be deactivated, rejected at bootstrap, then
   reactivated into a rollback-safe active state on the same `entrySlug`.

## Gate Read

`WF-PBK-001 = PASS (pilot evidence)`

## Non-Claims

- This plan does not claim a tenant-wide cutover.
- This plan does not claim `tenant-commute-hub` partner mode is retired.
- This plan does not authorize production promotion.
- This plan does not convert `apps/partner-booking-web` repo-local completion
  into a production launch claim.
