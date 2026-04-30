# Operational Glossary And Copy Audit

Status: active baseline for `OPX-GV-005`  
Last updated: 2026-04-30  
Owner: `Codex2`

## Purpose

This runbook defines the minimum shared terminology and multilingual copy rules
for Phase 1 operational surfaces. It exists to stop the same workflow concept
from appearing with different user-facing labels across:

- `apps/platform-admin-web`
- `apps/ops-console-web`
- `apps/driver-app`
- `tenant-commute-hub/src`
- operator-facing runbooks and UAT notes

Canonical product enums and domain semantics still come from:

- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/00_source_of_truth_and_glossary.md`
- `phase1_prd_detailed_v1.md`
- `phase1_service_contracts_v1.md`
- `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`

This document governs display copy, not business-state authority.

## Language Policy

- Operator surfaces may expose code / enum values in diagnostics, but visible UI
  labels must use one shared meaning per workflow concept.
- Traditional Chinese copy must stay in Traditional Chinese. Avoid mixing in
  Simplified Chinese variants such as `運營`.
- Code literals such as `recording_pending` remain acceptable in audit,
  developer, and runbook contexts when the exact contract value matters.
- User-facing labels should translate the concept, then optionally preserve the
  literal code in a note or evidence view when required.

## Canonical Terms

| Concept                       | English UI label          | Traditional Chinese UI label | Notes                                                                                             |
| ----------------------------- | ------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| platform workflow health      | `Health & Alerts`         | `健康與警示`                 | Use for platform workflow alerts and adapter visibility. Do not call this page `Health & Quotas`. |
| recording lifecycle           | `Recording State`         | `錄音狀態`                   | Valid user-facing states are `Ready`, `Pending`, `Missing` / `已就緒`, `待補錄音`, `缺漏`.        |
| dispatch follow-up action     | `Open in dispatch`        | `在派車台開啟`               | Use when linking from call-center detail into dispatch workflow.                                  |
| settlement responsibility     | `Payer`                   | `付款方`                     | The party financially charged for the trip.                                                       |
| benefit or subsidy authority  | `Sponsor`                 | `贊助方`                     | Distinct from payer; use for card-benefit or partner-funded trips.                                |
| driver compensation authority | `Driver payout authority` | `司機付款權責`               | Use in settlement matrix and finance views.                                                       |
| vehicle retirement workflow   | `Offboarding`             | `退場`                       | Use for vehicle lifecycle exit, not generic deactivation.                                         |
| brand-removal task            | `Debranding`              | `除標識`                     | Use for required vehicle branding removal work.                                                   |
| tenant cutover pause          | `Rollback Hold`           | `回滾保留`                   | Use for rollout pause after rollback-risk detection.                                              |
| operator role                 | `Ops` / `Operator`        | `營運` / `營運人員`          | Traditional Chinese must use `營運`, not `運營`.                                                  |

## Surface Rules

### Platform Admin

- Workflow health uses `Health & Alerts` because the page is alert- and
  adapter-focused.
- Tenant quotas remain tenant-onboarding data, not part of the health-page
  title.
- Settlement matrix copy must distinguish payer, sponsor, document ownership,
  payout authority, and reimbursement rule.

### Ops Console

- Call-center, dispatch, reports, and revenue must all use the same `營運`
  terminology in Traditional Chinese copy.
- Call-center recording status must show the translated state, while preserving
  literal flags such as `recording_pending` only where evidence precision is
  necessary.
- `Open in dispatch` is the canonical link text from call-center detail to the
  dispatch board.

### Driver App

- Driver shift, trip, earnings, jobs, and incident flows should use consistent
  Traditional Chinese runtime copy for task, trip, proof, and SOS concepts.
- A dedicated locale layer is still future work, but active driver workflows
  should not drift between English and Traditional Chinese for the same
  user-facing state or action.

### Tenant / Partner Portal

- Booking eligibility outcomes must be translated into governed UI labels.
- Raw contract literals such as `verificationReasonCode` may appear only in an
  explicit diagnostic context, not as the primary visible booking outcome copy.

## Audit Snapshot

The following baseline alignments were completed as part of `OPX-GV-005`:

- `apps/platform-admin-web/lib/translations.ts`
  - renamed health surface to `Health & Alerts` / `健康與警示`
  - aligned finance matrix copy around payer / sponsor / payout / discount
  - added rollout / offboarding / debranding / rollback-hold terminology
- `apps/platform-admin-web/lib/localized-labels.ts`
  - aligned code labels for `rollback_hold`, `offboarding_pending_debranding`,
    `debranding_required`, `completed`, and `not_required`
- `apps/platform-admin-web/app/payments/page.tsx`
  - rendered canonical settlement responsibility fields instead of channel-only
    prose shortcuts
- `apps/ops-console-web/lib/translations.ts`
  - aligned call-center recording-state copy
  - aligned revenue matrix responsibility labels
  - normalized Traditional Chinese `營運` wording
- `apps/ops-console-web/app/callcenter/page.tsx`
  - exposed recording state directly in list and detail views
  - added `Open in dispatch` bridge from linked order detail
- `apps/driver-app/app/shift.tsx`
  - aligned clock-in / clock-out, shift-tracking, vehicle, location, and
    attendance copy to Traditional Chinese
- `apps/driver-app/app/trip.tsx`
  - aligned task actions, trip metrics, proof requirements, forwarded-task
    notes, and tracking-error alerts to Traditional Chinese
- `apps/driver-app/app/jobs.tsx`
  - aligned inbox, task-state, forwarded-platform, and fixed-price copy to
    Traditional Chinese
- `apps/driver-app/app/earnings.tsx`
  - aligned earnings, statement, payout, and period-toggle copy to Traditional
    Chinese
- `apps/driver-app/app/incident.tsx`
  - aligned SOS, safety, and incident submission copy to Traditional Chinese
- `apps/driver-app/components/earnings-by-platform.tsx`
  - aligned per-platform breakdown labels to Traditional Chinese
- `tenant-commute-hub/src/pages/NewBooking.tsx`
  - translated eligibility outcome labels and reasons for the tenant booking
    flow while preserving raw reason codes only in explicit diagnostic copy
- `docs/04-uat/phase1-uat-scenarios.md`
  - renamed the health UAT section to match the actual product surface

## Review Checklist

- Verify renamed labels still match the actual workflow ownership of the page.
- Verify zh strings do not contain Simplified Chinese drift for operator-facing
  labels.
- Verify identical workflow concepts use identical labels across admin, ops,
  runbook, and UAT references.
- Verify code literals are only shown when the contract value itself matters.

## Residual Risks

- `apps/driver-app` still lacks a centralized locale system, so future feature
  work must continue checking for ad hoc string drift.
- Some historic planning documents still say `Health & Quotas`; treat those as
  stale wording unless and until the underlying surface semantics change again.
