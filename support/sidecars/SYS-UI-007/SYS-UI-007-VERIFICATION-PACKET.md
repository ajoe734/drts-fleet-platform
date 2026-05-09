# SYS-UI-007 Verification Packet

Task: `SYS-UI-007`  
Owner: `Codex2`  
Reviewer: `Claude`  
Date: `2026-05-09`

## Scope

Close the remaining forwarded-authority presentation gap across:

- `apps/driver-app`
- `apps/ops-console-web`
- `apps/platform-admin-web`
- `apps/tenant-console-web`
- `apps/tenant-portal-web`

Acceptance target from `ai-status.json`:

> `driver / ops / admin / tenant surfaces present a coherent forwarded-authority model with route-level evidence`

## What Changed In This Slice

This task did not need new driver / ops / admin feature work. Those surfaces already carried the forwarded-state and adapter-health model. The remaining gap was tenant-facing explanation:

- `apps/tenant-console-web/lib/source-domain.ts:3-84`
  - distinguishes `forwarded_authority` from generic partner/external fulfillment
  - adds explicit status boundary, escalation hint, and finance-authority copy
- `apps/tenant-portal-web/lib/source-domain.ts:8-226`
  - applies the same forwarded-authority model to booking, invoice, and report source summaries
- `apps/tenant-console-web/app/bookings/page.tsx:31-35,143-155`
  - warns that tenant routes do not own `accept_pending`, `confirmed_by_platform`, `lost_race`, `cancelled_by_platform`, or `sync_failed`
- `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx:119-150,212-236`
  - adds forwarded-authority boundary and finance-authority explanation on detail
- `apps/tenant-portal-web/app/booking-list/page.tsx:42-46,179-194`
  - mirrors the same list-level warning on the legacy tenant portal route
- `apps/tenant-portal-web/app/booking-list/[orderId]/page.tsx:96-116,196-224`
  - mirrors the same detail-level authority boundary and finance authority
- `apps/tenant-portal-web/app/billing/page.tsx:36-41,99-109`
  - adds an explicit forwarded-finance warning when invoice lines remain under external settlement ownership

## Route-Level Evidence

### Driver

- `apps/driver-app/app/jobs.tsx:84-97`
  - renders forwarded status labels for `accept_pending`, `confirmed_by_platform`, `lost_race`, `cancelled_by_platform`, and `sync_failed`
- `apps/driver-app/app/jobs.tsx:129-153,256-340`
  - maps reauth / sync-failure / platform-closed states into authority banners and operational notes
- `apps/driver-app/app/trip.tsx:194-230,271-385,400-420`
  - trip surface distinguishes forwarded pending / confirmed / lost / cancelled / sync-failed states and locks local lifecycle actions accordingly

### Ops

- `apps/ops-console-web/app/dispatch/forwarded-order-board.tsx:182-228`
  - canonical forwarded board status variants and filters
- `apps/ops-console-web/app/dispatch/forwarded-order-board.tsx:518-543`
  - KPI row tracks `accept_pending`, `sync_failed`, manual fallback, and reconciliation pressure
- `apps/ops-console-web/app/dispatch/forwarded-order-board.tsx:743-875`
  - ops actions cover sync, manual fallback, sync-failed reporting, and reconciliation completion
- `apps/ops-console-web/app/dispatch/forwarded-order-board.tsx:1115-1393`
  - board + detail route expose mirrored status, native status, settlement authority, ledger mode, reconciliation, and last sync error

### Platform Admin

- `apps/platform-admin-web/app/health/page.tsx:568-628`
  - health route tracks forwarded-order pressure via total forwarded, sync-failed, accept-pending, and reconciliation metrics
- `apps/platform-admin-web/app/health/page.tsx:707-804`
  - health route exposes credential / auth / webhook control state, including degraded and `reauth_required` conditions
- `apps/platform-admin-web/app/adapter-registry/components/AdapterList.tsx:302-327,428-580`
  - registry route filters forwarded adapters, shows owned vs forwarded finance authority, and exposes enablement, live health, credentials, webhook, auth, rollout, and health chips in one readiness table

### Tenant Console

- `apps/tenant-console-web/lib/source-domain.ts:30-84`
  - canonical tenant-console source classification now treats issuer-authorized bookings as `forwarded_authority`
- `apps/tenant-console-web/app/bookings/page.tsx:143-155`
  - list route states that forwarded adapter-native statuses do not become tenant workflow actions
- `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx:119-150`
  - detail route shows the authority owner plus a forwarded-authority boundary callout
- `apps/tenant-console-web/app/bookings/[bookingId]/page.tsx:212-236`
  - finance section clarifies that pricing visibility can exist while settlement authority remains external

### Tenant Portal

- `apps/tenant-portal-web/lib/source-domain.ts:35-220`
  - legacy portal routes now share the same forwarded-authority, escalation, and external-finance model
- `apps/tenant-portal-web/app/booking-list/page.tsx:179-194`
  - booking list warns that forwarded adapter-native lifecycle states stay off tenant routes
- `apps/tenant-portal-web/app/booking-list/[orderId]/page.tsx:96-116,196-224`
  - booking detail shows authority owner, forwarded boundary, and finance authority
- `apps/tenant-portal-web/app/billing/page.tsx:99-109`
  - billing route warns when invoice lines stay under external finance authority

## Verification

Commands run:

```bash
pnpm --filter @drts/tenant-console-web typecheck
pnpm --filter @drts/tenant-portal-web typecheck
```

Result:

- `PASS` — tenant console typecheck
- `PASS` — tenant portal typecheck

## Acceptance Readout

- Driver: forwarded lifecycle states and reauth / sync-failure cues are explicit.
- Ops: forwarded board, reconciliation, and manual-fallback operations are explicit.
- Admin: readiness, degraded, credential, auth, and forwarded posture are explicit.
- Tenant: forwarded authority is no longer generic prose; tenant routes now state the boundary, escalation path, and finance-authority rule wherever external-platform authority applies.

Conclusion:

`SYS-UI-007` acceptance is satisfied and ready for reviewer handoff.
