# OPX-GV-005 Review Notes

Reviewer: `Codex`
Date: `2026-04-30`
Status: `review_approved`

## Verdict

Review approved. The previously blocked driver-app surfaces now translate the
visible workflow states that were still leaking raw enums in the last review
round, and the delivered copy matches the glossary/runbook acceptance for this
task.

## Evidence

1. The task acceptance still requires one shared glossary meaning, Traditional
   Chinese readiness where required, and no same-condition copy drift by
   surface in
   [phase1-operational-blueprint-execution-packet-20260429.md](/home/edna/workspace/drts-fleet-platform/docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md:763)
   and
   [operational-glossary-and-copy-audit.md](/home/edna/workspace/drts-fleet-platform/docs/03-runbooks/operational-glossary-and-copy-audit.md:24).

2. The driver app now has a shared Traditional Chinese label layer for the
   previously exposed workflow values:
   - task status labels in
     [operational-labels.ts](/home/edna/workspace/drts-fleet-platform/apps/driver-app/lib/operational-labels.ts:9)
   - payout status labels in
     [operational-labels.ts](/home/edna/workspace/drts-fleet-platform/apps/driver-app/lib/operational-labels.ts:21)
   - task type labels in
     [operational-labels.ts](/home/edna/workspace/drts-fleet-platform/apps/driver-app/lib/operational-labels.ts:49)

3. The resubmitted jobs flow no longer renders raw task-type or task-status
   enums as the primary visible label:
   - task-type badge routes through `formatDriverTaskTypeLabel(...)` in
     [jobs.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/jobs.tsx:45)
     and
     [jobs.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/jobs.tsx:235)
   - task-status label routes through `formatDriverTaskStatusLabel(...)` in
     [jobs.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/jobs.tsx:244)
   - previously raw direct / route-locked / platform-closed copy is now
     Traditional Chinese in
     [jobs.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/jobs.tsx:40),
     [jobs.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/jobs.tsx:97),
     and
     [jobs.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/jobs.tsx:252).

4. The trip flow no longer shows raw task status in the main detail card and
   the previously English direct / route-locked copy is now aligned to
   Traditional Chinese in
   [trip.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:45),
   [trip.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:61),
   and
   [trip.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:614).

5. The earnings surfaces no longer expose raw payout-state enums in primary UI
   copy, and the surrounding statement / platform breakdown labels are now
   Traditional Chinese:
   - payout status routes through `formatDriverPayoutStatusLabel(...)` in
     [earnings.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/earnings.tsx:184)
   - statement and period copy is aligned in
     [earnings.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/earnings.tsx:145)
   - per-platform labels are aligned in
     [earnings-by-platform.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/components/earnings-by-platform.tsx:48)

## Verification

- Source review against the updated driver-app surfaces and the glossary audit
  runbook
- `pnpm --filter @drts/driver-app typecheck`

## Non-blocking Note

- `apps/driver-app/lib/money.ts` still has a defensive English fallback
  (`"Amount pending"`) when a money object is unexpectedly absent. Under the
  active contract and API seed path, driver statements and platform earnings
  supply non-null `MoneyAmount` values, so this does not block `OPX-GV-005`.
  It is still a reasonable future locale cleanup candidate.

## Handoff

Return to `Codex2` for final closeout to `done`.
