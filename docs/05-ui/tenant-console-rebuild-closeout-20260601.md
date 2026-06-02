# Tenant Console Rebuild Closeout (2026-06-01)

Owner: Codex2  
Reviewer: Codex  
Task: `UI-FE-TEN-UMBRELLA`  
App: `apps/tenant-console-web`  
Branch: `codex2/ui-fe-ten-umbrella`

## Status

This document is the formal umbrella closeout for the 2026-06-01 owner pass.

Final reconciliation update: 2026-06-02 UTC.

As of 2026-06-02 UTC:

- the umbrella route surface is present in `apps/tenant-console-web`
- the 14 tenant-console dependency tasks currently recorded in machine truth are all `done`, with `UI-FE-TEN-UMBRELLA` remaining as the owner closeout task
- app-level smoke verification is green in this worktree after repairing the remaining umbrella integration regressions

This branch is therefore eligible for owner `handoff` to reviewer once the closeout commit is recorded and pushed.

## Scope Confirmed

The tenant-console umbrella still targets the 20-route IA from the 2026-05-25 handoff packet, with `apps/tenant-console-web` as the canonical repo-local target per Q-TEN01.

Route inventory confirmed from the current app tree and `next build` output:

- `/`
- `/bookings`
- `/bookings/new`
- `/bookings/[bookingId]`
- `/passengers`
- `/addresses`
- `/users`
- `/api-keys`
- `/webhooks`
- `/notifications`
- `/integration-governance`
- `/sla`
- `/billing`
- `/invoices`
- `/cost-centers`
- `/rules`
- `/reports`
- `/audit`
- `/feature-flags`
- `/settings`

## Q-TEN02 Route Accounting

The repo contains two closely related phrasings:

- design canvas / brief language: "9 NEW routes"
- Q-TEN02 question prompt: 8 routes missing from the older partial implementation, plus clarification around the billing/invoice split

The canonical answered route set is the Q-TEN02 ruling in `docs/05-ui/system-design-answers-all-apps-20260524.md`, which requires:

- `/addresses`
- `/sla`
- `/notifications`
- `/reports`
- `/feature-flags`
- `/integration-governance`
- `/billing`
- `/invoices`
- `/bookings/new`

This branch currently ships all nine routes from that answered set.

## Verification

Executed in this worktree on 2026-06-02 UTC:

- `pnpm --filter @drts/contracts build`
- `pnpm --filter @drts/ui-tokens build`
- `pnpm --filter @drts/tenant-console-web build`
- `pnpm --filter @drts/tenant-console-web typecheck`
- `pnpm --filter @drts/tenant-console-web test`

Results:

- `@drts/contracts build`: PASS
- `@drts/ui-tokens build`: PASS
- `tenant-console-web typecheck`: PASS
- `tenant-console-web build`: PASS
- `tenant-console-web test`: PASS (`1` file, `5` tests)

Note on execution order:

- `tenant-console-web typecheck` depends on generated `.next/types`
- running `typecheck` before `build` in a fresh worktree can fail on missing generated type stubs
- after `next build` generated the route type set for this branch, `typecheck` passed cleanly

Build route output explicitly included:

- `/addresses`
- `/billing`
- `/bookings/[bookingId]`
- `/bookings/new`
- `/feature-flags`
- `/integration-governance`
- `/invoices`
- `/notifications`
- `/reports`
- `/sla`

## Integration Fixes Applied In This Closeout

To restore a clean smoke baseline on the umbrella branch, this closeout fixed the remaining integration regressions that were preventing a clean umbrella verification pass:

- `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx`
  - removed a duplicate `BookingCommandPanel` import
  - restored missing local wrapper components referenced by the page
- `apps/tenant-console-web/app/rules/page.tsx`
  - removed an undefined leftover `inferEmptyReason(...)` call
- `apps/tenant-console-web/app/rules/rules-manager.tsx`
  - removed duplicate type imports
  - restored `actionLinkStyle`
  - corrected the `updateAction` summary reference

## Machine Truth Alignment

Umbrella acceptance still requires:

- all currently recorded tenant-console dependency tasks done
- closeout doc
- 20-route IA, including the 9 required NEW routes, shipped in `apps/tenant-console-web`
- smoke test clean
- Q-TEN01 cutover plan referenced

The active canonical task board on 2026-06-02 records 14 tenant-console dependency tasks:

- `UI-FE-TEN-USR`
- `UI-FE-TEN-NTF`
- `UI-FE-TEN-SLA`
- `UI-FE-TEN-WH`
- `UI-FE-TEN-APIK`
- `UI-FE-TEN-BILL`
- `UI-FE-TEN-INV`
- `UI-FE-TEN-CC`
- `UI-FE-TEN-RUL`
- `UI-FE-TEN-IG`
- `UI-FE-TEN-RPT`
- `UI-FE-TEN-AUD`
- `UI-FE-TEN-FF`
- `UI-FE-TEN-SET`

All 14 are recorded `done`.

The older 20-task assignment snapshot referenced six additional core route IDs (`UI-FE-TEN-HOME`, `UI-FE-TEN-BKG`, `UI-FE-TEN-BKGNEW`, `UI-FE-TEN-BKGID`, `UI-FE-TEN-PSG`, `UI-FE-TEN-ADR`) that are not standalone tasks in the current canonical task board. Their shipped scope is instead evidenced at the umbrella level by the verified route inventory and `next build` output for `/`, `/bookings`, `/bookings/new`, `/bookings/[bookingId]`, `/passengers`, and `/addresses`.

This closeout therefore satisfies the remaining document, smoke, and cutover-reference evidence needed for owner handoff.

## Q-TEN01 Cutover Reference

This umbrella branch still does not claim production cutover. It confirms the repo-local canonical app and preserves the external live-owner rule.

Authority references:

- [`docs/05-ui/system-design-answers-all-apps-20260524.md`](./system-design-answers-all-apps-20260524.md) § `Q-TEN01. Canonical migration plan`
- [`docs/05-ui/tenant-console-design-handoff-packet-20260525.md`](./tenant-console-design-handoff-packet-20260525.md) § `Topology context (Q-TEN01 resolution)`
- [`docs/01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md`](../01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md)

Confirmed posture:

- `apps/tenant-console-web` is the canonical repo-local tenant admin console
- external `tenant-commute-hub` remains the live production owner until a separate cutover task records rollout / rollback evidence
- this document is therefore a ship-readiness checkpoint, not a topology-switch record

## Next Action

Owner action after this document update:

- create the task-scoped closeout commit
- push `codex2/ui-fe-ten-umbrella` with the closeout evidence
- hand off `UI-FE-TEN-UMBRELLA` to reviewer `Codex`
