# Tenant Console Redesign — Wave 3 Closeout (2026-05-18)

Owner: Codex2 · Reviewer of record (this closeout): Claude2
Task: `TEN-UI-RD-099`
Planning ref: [`docs/05-ui/drts-ui-redesign-workbreakdown-20260510.md`](./drts-ui-redesign-workbreakdown-20260510.md)
Parity decisions companion: [`docs/05-ui/tenant-console-parity-decisions-20260510.md`](./tenant-console-parity-decisions-20260510.md)
Supersedes: [`docs/05-ui/tenant-console-redesign-closeout-20260514.md`](./tenant-console-redesign-closeout-20260514.md)

## Purpose

This packet is the canonical Wave 3 tenant-console closeout after the late
parity-fill routes (`TEN-UI-RD-010`, `TEN-UI-RD-013`, `TEN-UI-RD-014`) were
reopened, re-reviewed, and formally closed out on 2026-05-18. All dependent
tasks `TEN-UI-RD-001`..`TEN-UI-RD-004` and `TEN-UI-RD-010`..`TEN-UI-RD-018`
are `done` in canonical machine truth at
`/home/edna/workspace/drts-fleet-platform/ai-status.json`.

This document binds each shipped tenant surface to the reviewer of record, the
final `review_approved` timestamp in
`/home/edna/workspace/drts-fleet-platform/ai-activity-log.jsonl`, and the
final task-scoped commit/branch evidence recorded in canonical machine truth.

## Verification scope

This closeout does not rerun task acceptance. It reconciles the final machine
truth for all thirteen tenant redesign tasks and replaces the stale
2026-05-14 packet entries for `TEN-UI-RD-010`, `TEN-UI-RD-013`, and
`TEN-UI-RD-014`.

Review for `TEN-UI-RD-099` should confirm:

1. Each row's reviewer and approval timestamp matches the final
   `review_approved` event for that task.
2. Each row's final commit and branch matches the `done` metadata in canonical
   `ai-status.json`.
3. Each cited canvas anchor and parity story still points at the intended
   `TN_*` tenant-console surface.

## Surface signoff matrix

| Task | Surface(s) | Owner | Reviewer | Final review approved (UTC) | Final closeout commit | Push branch | Canvas anchor | Parity story |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `TEN-UI-RD-001` | Shell adoption + globals.css strip | Claude2 | Codex | `2026-05-10T16:30:56Z` | `515f271` | `origin/feat/claude2-ui-redesign-foundation` | `Tenant Console.html#home` | `tenant-shell.stories.tsx` |
| `TEN-UI-RD-002` | Home + Bookings list + Booking Detail | Codex | Codex2 | `2026-05-11T01:36:04Z` | `aae6d02` | `origin/feat/claude2-ui-redesign-foundation` | `Tenant Console.html#home`, `#bookings`, `#booking-detail` | `tenant-home.stories.tsx`, `tenant-bookings.stories.tsx`, `tenant-booking-detail.stories.tsx` |
| `TEN-UI-RD-003` | Audit + Users + Settings | Codex2 | Codex | `2026-05-11T01:11:08Z` | `f4d91bb` | `origin/feat/claude2-ui-redesign-foundation` | `Tenant Console.html#audit`, `#users`, `#settings` | `tenant-audit.stories.tsx`, `tenant-users.stories.tsx`, `tenant-settings.stories.tsx` |
| `TEN-UI-RD-004` | Tenant shell copy cleanup | Codex2 | Claude2 | `2026-05-11T01:18:29Z` | `051b68c` | `origin/feat/claude2-ui-redesign-foundation` | shell chrome verified from `Tenant Console.html#home` | `tenant-shell.stories.tsx` |
| `TEN-UI-RD-010` | `TN_NewBooking` parity-fill | Codex2 | Codex | `2026-05-18T06:27:24Z` | `0232a1b` | `origin/codex2/ten-ui-rd-010` | `Tenant Console.html#newbooking` | `tenant-new-booking.stories.tsx` |
| `TEN-UI-RD-011` | `TN_Passengers` parity-fill | Codex | Codex2 | `2026-05-10T20:19:03Z` | `1ceb922` | `origin/feat/claude2-ui-redesign-foundation` | `Tenant Console.html#passengers` | `tenant-passengers.stories.tsx` |
| `TEN-UI-RD-012` | `TN_Addresses` parity-fill | Claude2 | Codex2 | `2026-05-10T19:14:46Z` | `4f3956b` | `origin/feat/claude2-ui-redesign-foundation` | `Tenant Console.html#addresses` | `tenant-addresses.stories.tsx` |
| `TEN-UI-RD-013` | `TN_CostCenter` parity-fill | Codex2 | Codex | `2026-05-18T07:25:29Z` | `edd8433` | `origin/codex2/ten-ui-rd-013` | `Tenant Console.html#costcenter` | `tenant-cost-centers.stories.tsx` |
| `TEN-UI-RD-014` | `TN_Rules` parity-fill | Codex2 | Codex | `2026-05-18T06:46:37Z` | `e488b58` | `origin/codex2/ten-ui-rd-014` | `Tenant Console.html#rules` | `tenant-rules.stories.tsx` |
| `TEN-UI-RD-015` | `TN_Invoices` parity-fill | Codex2 | Codex2 | `2026-05-10T19:23:35Z` | `3daab74` | `origin/feat/claude2-ui-redesign-foundation` | `Tenant Console.html#invoices` | `tenant-invoices.stories.tsx` |
| `TEN-UI-RD-016` | `TN_Reports` parity-fill | Codex2 | Codex | `2026-05-10T23:56:22Z` | `f8857db` | `origin/feat/claude2-ui-redesign-foundation` | `Tenant Console.html#reports` | `tenant-reports.stories.tsx` |
| `TEN-UI-RD-017` | `TN_ApiKeys` completion | Codex | Claude2 | `2026-05-12T14:19:22Z` | `4d8ce97` | `origin/feat/claude2-ui-redesign-foundation` | `Tenant Console.html#apikeys` | Storybook N/A per task record |
| `TEN-UI-RD-018` | `TN_Webhooks` completion | Codex2 | Codex | `2026-05-12T16:56:16Z` | `ea0c49c` | `origin/feat/claude2-ui-redesign-foundation` | `Tenant Console.html#webhooks` | `tenant-webhooks.stories.tsx` |

## Reopened parity-fill reconciliation

The 2026-05-14 closeout packet captured the first reopen wave for the three
previously blocked parity surfaces. Canonical machine truth now records the
final 2026-05-18 reviewer approvals and owner closeouts:

| Task | 2026-05-14 packet evidence | Final canonical evidence on 2026-05-18 |
| --- | --- | --- |
| `TEN-UI-RD-010` | shipped against `6e0c9fd` on `origin/codex/be-cc-001-fu-seed` | final closeout commit `0232a1b` on `origin/codex2/ten-ui-rd-010`; reviewer Codex re-approved the planning reconciliation at `2026-05-18T06:27:24Z` |
| `TEN-UI-RD-013` | shipped against `921c456` on `origin/codex/be-cc-001-fu-seed` | final closeout commit `edd8433` on `origin/codex2/ten-ui-rd-013`; reviewer Codex approved the cost-center fix at `2026-05-18T07:25:29Z` |
| `TEN-UI-RD-014` | shipped against `f0e8265` on `origin/codex2/ten-ui-rd-014-closeout` | final closeout commit `e488b58` on `origin/codex2/ten-ui-rd-014`; reviewer Codex approved the final rules route evidence at `2026-05-18T06:46:37Z` |

For those three tasks, the earlier commits remain part of the historical ship
chain, but this packet cites the final `done` metadata because that is what
canonical machine truth exposes to reviewers and the supervisor.

## Parity decision crosswalk

| Task | Parity-decisions section | 2026-05-10 decision state | Final 2026-05-18 state |
| --- | --- | --- | --- |
| `TEN-UI-RD-010` | `TN_NewBooking` | blocked pending booking governance contracts | done on `origin/codex2/ten-ui-rd-010` |
| `TEN-UI-RD-011` | `TN_Passengers` | shipped | done on `origin/feat/claude2-ui-redesign-foundation` |
| `TEN-UI-RD-012` | `TN_Addresses` | shipped | done on `origin/feat/claude2-ui-redesign-foundation` |
| `TEN-UI-RD-013` | `TN_CostCenter` | blocked pending tenant cost-center directory contract | done on `origin/codex2/ten-ui-rd-013` |
| `TEN-UI-RD-014` | `TN_Rules` | blocked pending tenant approval-rule/quota contract | done on `origin/codex2/ten-ui-rd-014` |
| `TEN-UI-RD-015` | `TN_Invoices` | shipped | done on `origin/feat/claude2-ui-redesign-foundation` |

## Reviewer signoff for `TEN-UI-RD-099`

Expected reviewer outcome for this closeout task:

- confirm the matrix above matches final machine truth
- confirm this packet supersedes the stale 2026-05-14 packet for reviewer and
  branch evidence
- confirm the parity decisions companion reflects the 2026-05-18 finalization
  note for `TEN-UI-RD-010`, `TEN-UI-RD-013`, and `TEN-UI-RD-014`
