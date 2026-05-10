# DRTS ZIP UI vs Current Implementation Diff Report 20260510

## Scope

This report compares the design prototype bundle in
`docs/05-ui/drts.zip` against the current repo implementation across these
surfaces:

- Platform Admin
- Ops Console
- Tenant Console
- Partner Booking
- Driver App

The design bundle reviewed from the zip includes:

- `mgmt-shell.jsx`
- `platform-screens.jsx`
- `ops-screens.jsx`
- `tenant-screens.jsx`
- `partner-screens.jsx`
- `driver-screens-1.jsx`
- `driver-screens-2.jsx`
- `driver-screens-3.jsx`
- `components.jsx`
- `mgmt-data.jsx`

Current implementation was compared against:

- [apps/platform-admin-web](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web:1)
- [apps/ops-console-web](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web:1)
- [apps/tenant-console-web](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web:1)
- [apps/tenant-portal-web](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web:1)
- [apps/driver-app](/home/edna/workspace/drts-fleet-platform/apps/driver-app:1)
- [packages/ui-web](/home/edna/workspace/drts-fleet-platform/packages/ui-web:1)

## Executive Summary

The zip is not just a visual mock. It defines a full product posture:

- one shared management shell for `platform / ops / tenant`
- a separate branded partner funnel
- a complete driver mobile experience
- explicit primitives for KPI cards, banners, tables, detail metadata, stepper,
  timeline, owned-vs-forwarded authority banners, and status chips

Current repo status is uneven:

- `Platform Admin`: route-complete and functionally deep, but visually still too
  close to the old management shell.
- `Ops Console`: functionally strong and mostly design-parity by workflow, but
  shell and detail-page treatment still diverge from the prototype.
- `Tenant Console`: largest gap. The target app exists, but a large part of the
  designed tenant product is still missing or placeholder-level.
- `Partner Booking`: authority-safe flow exists, but it is not the branded
  cardholder funnel shown in the design.
- `Driver App`: closest overall on flow coverage; current app is often more
  behaviorally complete than the prototype, but visual execution is still repo-
  native rather than artboard-native.

## High-Level Verdict

| Surface         | Design coverage in zip | Current state                                                           | Verdict                                              |
| --------------- | ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Platform Admin  | 16 screens             | 16 matching routes/pages                                                | Functionally aligned, visually not redesign-complete |
| Ops Console     | 16 screens             | 14 direct routes + 2 detail experiences embedded in page state          | Behaviorally aligned, shell/detail topology differs  |
| Tenant Console  | 15 screens             | 6 real, 3 partial, 6 missing in `tenant-console-web`                    | Major parity gap                                     |
| Partner Booking | 7 screens              | 4 funnel stages present, 3 missing, branded UX absent                   | Functional skeleton only                             |
| Driver App      | 9 experiences          | All 9 experiences present, with 2 merged into onboarding/workspace flow | Closest parity, behavior stronger than mock          |

## Shared Shell and Design-System Differences

### What the zip defines

The zip's shared management chrome in `mgmt-shell.jsx` is opinionated:

- grouped sidebar with section dividers and per-item badges
- fixed topbar with breadcrumb, search, shortcut hint, bell, user chip
- compact 46px chrome
- page-local tabs under the page header
- consistent use of `Kpi`, `Banner`, `Table`, `DL`, `Stepper`, `Timeline`

### What the repo currently uses

- Platform and Ops still use the generic sidebar shell from
  [packages/ui-web/src/app-sidebar.tsx](/home/edna/workspace/drts-fleet-platform/packages/ui-web/src/app-sidebar.tsx:1)
- Layouts are still driven by
  [apps/platform-admin-web/app/layout.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/layout.tsx:1)
  and
  [apps/ops-console-web/app/layout.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/layout.tsx:1)
- The current management shell token set in
  [packages/ui-web/src/management-theme.ts](/home/edna/workspace/drts-fleet-platform/packages/ui-web/src/management-theme.ts:1)
  is cleaner than before, but still conservative
- There is no shared global topbar equivalent to the prototype's breadcrumb +
  search + env + user cluster

### Net difference

- The zip expects a visibly new control-plane shell.
- Current repo has stronger workflow primitives than before, but still reads as
  an evolved old shell, not a new shell.
- This is the main reason Platform Admin and Ops can be technically improved yet
  still feel visually "the same."

## Platform Admin

### Design inventory

The zip defines these Platform Admin screens:

1. Home
2. Tenants
3. Tenant Detail / Rollout
4. Partners
5. Partner Detail
6. Users
7. Fleet
8. Switchboard
9. Pricing
10. Payments
11. Reconciliation Detail
12. Health
13. Notices
14. Audit
15. Flags
16. Adapters

### Current route inventory

Current repo has all 16 equivalent surfaces:

- [app/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/page.tsx:1)
- [app/tenants/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/tenants/page.tsx:1)
- [app/tenants/[tenantId]/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/tenants/%5BtenantId%5D/page.tsx:1)
- [app/partners/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/partners/page.tsx:1)
- [app/partners/[entrySlug]/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/partners/%5BentrySlug%5D/page.tsx:1)
- [app/users/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/users/page.tsx:1)
- [app/fleet/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/fleet/page.tsx:1)
- [app/switchboard/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/switchboard/page.tsx:1)
- [app/pricing/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/pricing/page.tsx:1)
- [app/payments/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/payments/page.tsx:1)
- [app/payments/reconciliation/[issueId]/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/payments/reconciliation/%5BissueId%5D/page.tsx:1)
- [app/health/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/health/page.tsx:1)
- [app/notices/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/notices/page.tsx:1)
- [app/audit/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/audit/page.tsx:1)
- [app/feature-flags/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/feature-flags/page.tsx:1)
- [app/adapter-registry/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/adapter-registry/page.tsx:1)

### Main differences

- Route parity is strong. This is not the weak area.
- Current pages are often functionally richer than the mock because they read
  real backend records and send real commands.
- The biggest mismatch is shell language, not page existence.
- The prototype sidebar has grouped sections and small alert badges; current nav
  in [components/admin-nav.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/components/admin-nav.tsx:1)
  is flatter.
- The prototype has a global topbar with breadcrumb/search/user/env. Current app
  does not.
- The prototype page headers are compact and choreographed around tabs. Current
  pages rely on page-local stacks and cards, which work, but do not visually
  match the prototype.

### Surface-specific notes

- `Home`: current implementation is functionally aligned and governance-rich.
- `Tenant detail`: current page in
  [tenants/[tenantId]/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/tenants/%5BtenantId%5D/page.tsx:1)
  already contains rollout stepper, onboarding, roles, billing, webhook
  baseline, and audit; functionally it meets or exceeds the static mock.
- `Partner detail`: same pattern; current page is stronger on real governance.
- `Switchboard`: current page already includes the extra governance blocks the
  user saw in deployed dev. The issue here is not missing code; it is that the
  visual language still reads as old-shell evolution.
- `Reconciliation detail`: current page is more workflow-capable than the mock.

### Verdict

Platform Admin is not blocked by missing product surfaces. It is blocked by
insufficient visual departure from the legacy shell.

## Ops Console

### Design inventory

The zip defines these Ops screens:

1. Dashboard
2. Dispatch Owned
3. Dispatch Forwarded
4. Dispatch Detail
5. Callcenter
6. Complaints
7. Incidents
8. Incident Detail
9. Reports
10. Revenue
11. Attendance
12. Maintenance
13. Drivers
14. Vehicles
15. Contracts
16. Flags

### Current route inventory

Current repo has these direct routes:

- [app/dashboard/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dashboard/page.tsx:1)
- [app/dispatch/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/page.tsx:1)
- [app/callcenter/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/callcenter/page.tsx:1)
- [app/complaints/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/complaints/page.tsx:1)
- [app/incidents/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/incidents/page.tsx:1)
- [app/reports/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/reports/page.tsx:1)
- [app/revenue/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/revenue/page.tsx:1)
- [app/attendance/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/attendance/page.tsx:1)
- [app/maintenance/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/maintenance/page.tsx:1)
- [app/drivers/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/drivers/page.tsx:1)
- [app/vehicles/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/vehicles/page.tsx:1)
- [app/contracts/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/contracts/page.tsx:1)
- [app/feature-flags/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/feature-flags/page.tsx:1)

Detail experiences are present, but embedded:

- owned/forwarded split in
  [app/dispatch/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/page.tsx:1),
  [dispatch-workflow.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:1),
  and
  [forwarded-order-board.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/forwarded-order-board.tsx:1)
- incident detail and recovery workspace inside
  [app/incidents/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/incidents/page.tsx:1)

### Main differences

- Functional parity is high.
- Current implementation is often deeper than the mock on actual operations.
- The mock treats `Dispatch Detail` and `Incident Detail` as separate screen
  moments; current repo keeps those as embedded workspace states instead of
  standalone routes.
- Current callcenter workspace in
  [app/callcenter/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/callcenter/page.tsx:1)
  is much richer than the static mock in live command behavior.
- Current incident workspace in
  [app/incidents/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/incidents/page.tsx:1)
  is stronger on recovery actions and escalation semantics than the mock.
- Like Platform Admin, Ops still uses the generic sidebar shell in
  [components/sidebar.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/components/sidebar.tsx:1)
  instead of the prototype's grouped/badged shell.

### Verdict

Ops Console is not missing its core product. It diverges mainly in shell,
navigation treatment, and the fact that prototype "detail screens" are rendered
as embedded workspaces instead of explicit route pages.

## Tenant Console

### Design inventory

The zip defines 15 tenant-admin screens:

1. Home
2. Bookings
3. Booking Detail
4. New Booking
5. Passengers
6. Addresses
7. Cost Center
8. Rules
9. Invoices
10. Reports
11. API Keys
12. Webhooks
13. Audit
14. Users
15. Settings

### Current tenant target app

The repo-local target app is [apps/tenant-console-web](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web:1).

Direct tenant-admin routes there today:

- [app/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/page.tsx:1)
- [app/bookings/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/bookings/page.tsx:1)
- [app/bookings/[bookingId]/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/bookings/%5BbookingId%5D/page.tsx:1)
- [app/bookings/new/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/bookings/new/page.tsx:1)
- [app/api-keys/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/api-keys/page.tsx:1)
- [app/webhooks/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/webhooks/page.tsx:1)
- [app/audit/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/audit/page.tsx:1)
- [app/users/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/users/page.tsx:1)
- [app/settings/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/settings/page.tsx:1)

### Current parity status

| Designed tenant screen | Current status        | Notes                                                 |
| ---------------------- | --------------------- | ----------------------------------------------------- |
| Home                   | Present               | Real dashboard exists                                 |
| Bookings               | Present               | Real list exists                                      |
| Booking Detail         | Present               | Real detail exists                                    |
| New Booking            | Partial               | Placeholder shell only                                |
| Passengers             | Missing in target app | Exists only in sunset `tenant-portal-web`             |
| Addresses              | Missing in target app | Exists only in sunset `tenant-portal-web`             |
| Cost Center            | Missing               | No route in target app                                |
| Rules                  | Missing               | No route in target app                                |
| Invoices               | Missing in target app | Closest legacy surface is `tenant-portal-web/billing` |
| Reports                | Missing in target app | Exists only in sunset `tenant-portal-web`             |
| API Keys               | Partial               | IA shell only, not full management surface            |
| Webhooks               | Partial               | IA shell only, not full management surface            |
| Audit                  | Present               | Real page exists                                      |
| Users                  | Present               | Real page exists                                      |
| Settings               | Present               | Real page exists                                      |

### Major differences

- The prototype expects one coherent tenant-admin product.
- Current repo still splits tenant capability across:
  - [apps/tenant-console-web](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web:1)
  - [apps/tenant-portal-web](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web:1)
- That split is not acceptable as parity because
  [apps/tenant-portal-web/README.md](/home/edna/workspace/drts-fleet-platform/apps/tenant-portal-web/README.md:1)
  explicitly marks the old portal as sunset.
- Current target shell in
  [components/tenant-shell.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/components/tenant-shell.tsx:1)
  still exposes internal execution language to end users:
  - `TEN-UI-001`
  - `XS-UI-004`
  - `Authority: /api/tenant/*`
  - `Current production traffic still lives in tenant-commute-hub`
- Prototype tenant copy is product-facing. Current target copy is still
  implementation-facing.
- `New Booking`, `API Keys`, and `Webhooks` are explicitly partial today:
  - [bookings/new/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/bookings/new/page.tsx:1)
  - [api-keys/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/api-keys/page.tsx:1)
  - [webhooks/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/webhooks/page.tsx:1)

### Verdict

Tenant Console is the largest gap between zip design intent and current repo
reality. The information architecture has started, but parity is not close.

## Partner Booking

### Design inventory

The zip defines 7 partner-funnel screens:

1. Landing
2. Eligibility / Linking
3. Booking Form
4. Confirmed
5. Trips
6. Receipt
7. Help

### Current partner-mode implementation

Current repo-local partner flow lives under
[apps/tenant-console-web/app/partner](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/partner:1):

- [partner/(public)/login/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/partner/%28public%29/login/page.tsx:1)
- [partner/(authenticated)/start/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/partner/%28authenticated%29/start/page.tsx:1)
- [partner/(authenticated)/eligibility/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/partner/%28authenticated%29/eligibility/page.tsx:1)
- [partner/(authenticated)/booking/new/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/partner/%28authenticated%29/booking/new/page.tsx:1)
- [partner/(authenticated)/booking/[bookingId]/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/app/partner/%28authenticated%29/booking/%5BbookingId%5D/page.tsx:1)

### Main differences

- Current partner mode is functionally safe, but visually and tonally it is not
  the branded cardholder funnel from the zip.
- The zip shows a mobile-first CTBC-branded consumer flow with benefit counter,
  card-treatment header, receipt/trips/help, and polished service perks.
- Current implementation uses a constrained shell in
  [components/partner-shell.tsx](/home/edna/workspace/drts-fleet-platform/apps/tenant-console-web/components/partner-shell.tsx:1)
  that emphasizes boundaries and authority, not consumer-brand experience.
- Missing from current flow:
  - trips/history screen
  - receipt screen
  - help/support surface
- Present and stronger than the mock:
  - explicit negative-path handling for `eligible`, `ineligible`,
    `manual_review`, inactive entry, and eligibility-required gating

### Verdict

Partner mode currently implements a backend-safe funnel skeleton, not the
designed branded partner product.

## Driver App

### Design inventory

The zip defines 9 driver experiences:

1. Provisioning
2. Workspace cockpit
3. Inbox
4. Trip
5. Platform presence
6. Earnings
7. Shift
8. SOS
9. Settings

### Current implementation

Current app route coverage is strong:

- [app/onboarding.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/onboarding.tsx:1)
- [app/jobs.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/jobs.tsx:1)
- [app/trip.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:1)
- [app/platform-presence.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/platform-presence.tsx:1)
- [app/earnings.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/earnings.tsx:1)
- [app/shift.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/shift.tsx:1)
- [app/incident.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/incident.tsx:1)
- [app/settings.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/settings.tsx:1)

Two design experiences are merged in current app:

- provisioning
- workspace cockpit

Both are handled inside
[app/onboarding.tsx](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/onboarding.tsx:1)
depending on whether the device is provisioned.

### Main differences

- Current driver app is behaviorally richer than the prototype:
  - identity bootstrap
  - location heartbeat
  - forwarded accept/lost-race/sync-failed handling
  - completion proof workflow
  - pending completion replay
- The prototype is visually more art-directed.
- Current app is closer in product flow than any other surface except Platform
  and Ops, but it still does not visually match the exact artboard language.

### Verdict

Driver App is the closest flow-level implementation match. Most remaining
differences are visual rather than architectural.

## What Current Implementation Already Exceeds

The zip is static. Current repo already exceeds it in several areas:

- Platform Admin reconciliation workflow is real, not just presentational.
- Ops callcenter and incident handling support actual commands and case state.
- Driver trip flow supports real owned vs forwarded negative outcomes.
- Partner mode has explicit authority-safe rejection paths the mock only hints
  at.
- Tenant booking detail and command flow already speaks to backend truth rather
  than fixture-only UI.

These should not be treated as regressions. They are stronger than the mock.

## Biggest Gaps by Severity

### Critical

- Tenant product is not parity-complete.
- Partner branded consumer funnel is not parity-complete.
- Platform Admin and Ops shell redesign is not visually complete.

### High

- Current tenant-admin copy still exposes internal implementation language.
- Tenant capability is fragmented across target app and sunset app.
- New booking, API keys, and webhooks in `tenant-console-web` are still partial.

### Medium

- Ops detail experiences are embedded rather than route-first like the mock.
- Platform/Ops navigation lacks the prototype's grouped shell language and topbar.
- Partner flow lacks trips, receipt, and help follow-through surfaces.

## Recommended Interpretation

If the benchmark is "does the repo already contain the whole product the zip is
showing?", the answer is:

- `Platform Admin`: mostly yes in workflow coverage, no in final visual redesign
- `Ops Console`: mostly yes in workflow coverage, no in final shell parity
- `Tenant Console`: no
- `Partner Booking`: no
- `Driver App`: mostly yes

If the benchmark is "does deployed dev feel like the zip?", the answer is still
`no`, mainly because:

- management shell redesign is incomplete
- tenant is incomplete
- partner is incomplete
