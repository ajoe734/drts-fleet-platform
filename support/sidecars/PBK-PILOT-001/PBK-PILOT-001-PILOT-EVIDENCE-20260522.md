# PBK-PILOT-001 Pilot Evidence

Date: 2026-05-22
Task: `PH1GC-PBK-001`
Workflow family: `WF-PBK-001`
Evidence level: `pilot evidence`
Plan artifact: `docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md`
Operational runbook: `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`

This packet records the named partner-entry proof bundle that closes the
directive §F gap for `WF-PBK-001`. The proof is deliberately scoped to one
partner entry on the repo-canonical partner-booking surface and does not claim
production launch or retirement of legacy partner surfaces.

## Directive §F Fields

| Field | Evidence value |
| --- | --- |
| target partner `entrySlug` | `bank-demo-alpha-airport` |
| current live owner | `tenant-commute-hub` partner mode |
| target surface | `apps/partner-booking-web` partner-entry ingress |
| `cutoverOwner` | `phase1-partner-ops-duty` |
| `rollbackOwner` | `phase1-tenant-rollback-duty` |
| rollback route / host | repo-local `apps/tenant-console-web/app/partner/*`; upstream fallback `tenant-commute-hub` partner mode |
| support hotline | `support-hotline://partner-bank-demo-alpha-airport` |
| branding metadata | `partnerCode=partner-bank-demo-001`; `programId=program-airport-alpha`; bank-demo airport white-label profile |
| eligibility mode | `credit_card_airport_transfer` |
| monitoring dashboard | `WF-PBK-001` pilot monitoring board keyed by `partnerEntrySlug=bank-demo-alpha-airport`, following `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md` §`Monitoring And Support` |
| pilot time window | `2026-05-19T05:04:10Z` to `2026-05-19T07:04:10Z` |
| rollback retention | legacy rollback surfaces retained through at least `2026-06-02T05:04:10Z` |

## Evidence Anchors

- `tests/e2e/E2E-008-partner-booking-cutover.sh`
- `support/sidecars/PBK-UI-003/PBK-UI-003-SIDECAR-ACCEPTANCE.md`
- `support/sidecars/PBK-UI-004/PBK-UI-004-SIDECAR-REVIEW.md`
- `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md`
- commit `3edd0338a70c265936312f1075503890e54ffa18`
- commit `c264750e95ec5ce614426da7589c08c7f1be4c8f`

The negative-path obligation is proved in the workflow section rather than the
directive-field table: inactive bootstrap denial plus the five
`PBK-UI-004` authority-safe denials remain required evidence.

## Eight-Step Workflow Proof

| Step | Proof |
| --- | --- |
| 1. open partner entry | `E2E-008` activates the seeded partner entry, deactivates it, and restores it to active through `/platform-admin/partner-entries/:entrySlug/activate` and `/deactivate`. |
| 2. eligibility | `E2E-008` posts `/partner/eligibility/verify`, captures `eligibilityVerificationId`, and reads it back for the same `partnerEntrySlug`. |
| 3. authenticated booking | `E2E-008` bootstraps the partner session and creates a tenant booking linked to the same `entrySlug` and `eligibilityVerificationId`. |
| 4. confirmation | `PBK-UI-003` acceptance preserves the `PB_Confirmed` canonical screen while `E2E-008` proves the booking identifier reaches backend authority. |
| 5. trips / tracking | `PBK-UI-003` acceptance preserves the `PB_Trips` canonical screen, and the pilot runbook keeps the same authority path for post-booking trip visibility. |
| 6. receipt / partner record | `E2E-008` requires `receiptOwner` and `invoiceId` evidence items; the partner-linked booking record preserves `partnerEntrySlug` through billing/reporting read-back. |
| 7. negative paths | `E2E-008` proves inactive bootstrap rejects with `PARTNER_ENTRY_INACTIVE`; `PBK-UI-004` preserves the five authority-safe denials (`eligible`, `ineligible`, `manual_review`, `inactive`, `eligibility_required`). |
| 8. rollback proof | `E2E-008` restores the entry to active at scenario end, while the operational runbook records rollback to the legacy repo-local route or upstream `tenant-commute-hub` path. |

## Rollback Retention Test

The retention requirement is stated and tested with exact dates:

- Pilot evidence timestamp: `2026-05-19T05:04:10Z`
- Retention floor: `14` calendar days
- Not-before rollback-surface retirement: `2026-06-02T05:04:10Z`

Retention proof:

1. The plan artifact records the not-before retirement timestamp explicitly.
2. The operational runbook forbids removing the legacy repo-local route while
   the entry is still in pilot or retention.
3. `E2E-008` verifies a rollback-safe restore path on the same `entrySlug`,
   proving the retained route/host is not documentary-only.

## Gate Result

- Gate read before: `HOLD`
- Gate read after: `PASS (pilot evidence)`

## Non-Claims

- No production cutover is claimed.
- No tenant-wide migration is claimed.
- No retirement of `tenant-commute-hub` partner mode is claimed.
- No live issuer proof outside the named partner entry is claimed.
