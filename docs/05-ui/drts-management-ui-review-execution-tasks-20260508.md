# DRTS UI Design Review And Execution Tasks

Date: 2026-05-08

## Purpose

This document reviews the management-side UI package in `docs/05-ui/drts.zip` and converts it into execution tasks that can be scheduled into implementation backlog.

The goal here is not visual critique. The goal is to answer:

1. What exactly did the design team produce?
2. Which parts already have code footholds in this repo?
3. Which execution tasks should be created to implement the designed flows safely?

## Reviewed Sources

- Design package archive: `docs/05-ui/drts.zip`
- Reviewed prototype sources inside the archive:
  - `platform-screens.jsx`
  - `ops-screens.jsx`
  - `tenant-screens.jsx`
  - `partner-screens.jsx`
  - `mgmt-shell.jsx`
  - `mgmt-data.jsx`
  - `mgmt-screens.jsx`
- Current repo implementation surfaces:
  - `apps/platform-admin-web`
  - `apps/ops-console-web`
  - `apps/tenant-portal-web`
- Reference product / authority docs:
  - `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
  - `docs/02-architecture/authority/rgp-002-authority-map.md`
  - `docs/02-architecture/tenant-commute-hub-boundary.md`
  - `docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md`

## What The Design Package Actually Contains

This archive is not a flat screenshot handoff. It is a structured prototype bundle with:

- A shared desktop management shell for `Platform Admin`, `Ops Console`, and `Tenant Console`
- A shared fake-data layer that already encodes realistic state models
- Complete page-level flows for:
  - `Platform Admin`
  - `Ops Console`
  - `Tenant Console`
  - `Partner Booking`
- A separate `Driver App` prototype also included in the zip

The management prototype covers much more than list pages. It includes:

- Detail pages
- Rollout / workflow pages
- Timeline views
- Stepper-based progress views
- Reconciliation issue handling
- Maintenance mode and notices
- Webhook delivery visibility
- Incident response flows

That means implementation should not be treated as "reskin existing tables". The design pack is asking for deeper workflow UI.

## Surface Inventory

### Platform Admin

Prototype screens found:

- `PA_Home`
- `PA_Tenants`
- `PA_TenantDetail`
- `PA_Partners`
- `PA_PartnerDetail`
- `PA_Users`
- `PA_Fleet`
- `PA_Switchboard`
- `PA_Pricing`
- `PA_Payments`
- `PA_ReconDetail`
- `PA_Health`
- `PA_Notices`
- `PA_Audit`
- `PA_Flags`
- `PA_Adapters`

### Ops Console

Prototype screens found:

- `OC_Dashboard`
- `OC_DispatchOwned`
- `OC_DispatchForwarded`
- `OC_DispatchDetail`
- `OC_Callcenter`
- `OC_Complaints`
- `OC_Incidents`
- `OC_IncidentDetail`
- `OC_Reports`
- `OC_Revenue`
- `OC_Attendance`
- `OC_Maintenance`
- `OC_Drivers`
- `OC_Vehicles`
- `OC_Contracts`
- `OC_Flags`

### Tenant Console

Prototype screens found:

- `TN_Home`
- `TN_Bookings`
- `TN_BookingDetail`
- `TN_NewBooking`
- `TN_Passengers`
- `TN_Addresses`
- `TN_CostCenter`
- `TN_Rules`
- `TN_Invoices`
- `TN_Reports`
- `TN_ApiKeys`
- `TN_Webhooks`
- `TN_Audit`
- `TN_Users`
- `TN_Settings`

### Partner Booking

Prototype screens found:

- `PB_Landing`
- `PB_Eligibility`
- `PB_Book`
- `PB_Confirmed`
- `PB_Trips`
- `PB_Receipt`
- `PB_Help`

### Driver App

Driver screens are also present in this zip, but there is already a separate dedicated driver-app design packet in repo. This document notes the driver presence for scope awareness, but the execution tasks below focus on the management and tenant-facing web surfaces from `drts.zip`.

## Alignment Summary Against Current Repo

### Platform Admin

Current repo already has route-level footholds for the major list pages:

- `/`
- `/tenants`
- `/partners`
- `/users`
- `/fleet`
- `/switchboard`
- `/pricing`
- `/payments`
- `/health`
- `/notices`
- `/audit`
- `/feature-flags`
- `/adapter-registry`

Main gap:

- Current app has most top-level pages, but the design adds workflow depth that is not fully represented in routing yet:
  - tenant detail and rollout page
  - partner detail page
  - reconciliation issue detail page
  - denser governance home
  - more explicit adapter and health operational drill-downs

### Ops Console

Current repo already has route-level footholds for the major work areas:

- `/dashboard`
- `/dispatch`
- `/callcenter`
- `/complaints`
- `/incidents`
- `/reports`
- `/revenue`
- `/attendance`
- `/maintenance`
- `/drivers`
- `/drivers/[driverId]`
- `/vehicles`
- `/contracts`
- `/feature-flags`

Main gap:

- Current app covers the main sections, but the design demands stronger workflow surfaces:
  - owned dispatch queue as primary board
  - forwarded dispatch as distinct authority surface
  - dispatch detail flow
  - richer incident detail handling
  - call session workspace flow
  - more explicit revenue and settlement visibility

### Tenant Portal

Current repo has a sunset shell with useful pieces:

- `booking-list`
- `bookings/new`
- `billing`
- `reports`
- `api-keys`
- `webhooks`
- `passengers`
- `addresses`
- `users`
- `audit`
- `notifications`
- `sla`
- `feature-flags`

Main gap:

- Current app is not shaped like the new `Tenant Console` prototype
- Naming, route structure, home/dashboard, approval model, cost-center model, settings model, and integration UX do not yet align
- The design implies productization, while the current app is still closer to a transitional shell

### Partner Booking

Main gap:

- No first-class repo surface currently matches the partner booking funnel in this design pack
- This should be treated as either:
  - a dedicated partner entry app, or
  - a constrained mode inside the future tenant / channel-facing surface

## Implementation Boundaries That Must Not Be Broken

- `owned` and `forwarded` order flows must remain separate authority models
- Status changes must go through backend command endpoints, not editable frontend state
- Audit is append-only and read-only from the frontend
- Artifact downloads should continue to use short-lived server-issued URLs
- Eligibility, pricing truth, dispatchability, fee split, and settlement truth remain backend authority
- `tenant-portal-web` must not be treated as permanent authority truth if the product is being reintroduced as a formal `Tenant Console`

## Execution Recommendation

Recommended delivery waves:

1. Foundation and shared management shell alignment
2. Platform Admin workflow-depth implementation
3. Ops Console workflow-depth implementation
4. Tenant Console productization
5. Partner Booking entry funnel
6. Cross-system QA, role testing, and UAT hardening

This order reduces rework because the design pack shares layout, data table patterns, filters, stepper/timeline patterns, and authority badges across all management surfaces.

## Execution Tasks

## Workstream A: Foundation And Shared UI Infrastructure

| ID        | Pri | Task                                                                                                                                             | Deliverable                                                                                                         |
| --------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| UI-FND-01 | P0  | Decide whether to extend `@drts/ui-web` or create a management-specific shell layer for the new dense console patterns.                          | Shared direction for sidebar, topbar, page header, KPI row, table shell, banner, stepper, timeline, drawer, modal.  |
| UI-FND-02 | P0  | Extract common management primitives from design language into reusable React components.                                                        | Shared components that support Platform Admin, Ops Console, and Tenant Console without copy-paste page composition. |
| UI-FND-03 | P0  | Define console-level tokens per surface: `platform-admin`, `ops-console`, `tenant-console`.                                                      | Stable token model for spacing, density, surfaces, status tones, badges, and table rhythm.                          |
| UI-FND-04 | P0  | Introduce authority-safe badges and state chips for `owned`, `forwarded`, compliance gate, incident severity, webhook health, and rollout stage. | Shared visual semantics that preserve business boundaries.                                                          |
| UI-FND-05 | P0  | Standardize dense table behavior and filter bar behavior across admin surfaces.                                                                  | One reusable table/filter pattern with loading, empty, error, pagination, and row-drill support.                    |
| UI-FND-06 | P1  | Standardize stepper, timeline, and workflow drawer patterns.                                                                                     | Shared interaction model for rollout, incident response, reconciliation, and booking activity history.              |
| UI-FND-07 | P1  | Add route-level loading, empty, and degraded states aligned with management console usage.                                                       | Consistent UX for partial outages, stale sync, and missing integration data.                                        |
| UI-FND-08 | P1  | Define a seeded local fixture / storybook-style harness using the prototype data model.                                                          | Faster implementation and review loop before live API wiring.                                                       |

## Workstream B: Platform Admin

| ID       | Pri | Task                                                                                           | Current Base                                            | Deliverable                                                                                                                   |
| -------- | --- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| UI-PA-01 | P0  | Refresh the home dashboard to match governance-first information architecture.                 | `apps/platform-admin-web/app/page.tsx`                  | KPI strip, governance todo banners, module shortcuts, recent sensitive audit actions.                                         |
| UI-PA-02 | P0  | Upgrade tenants list to design parity.                                                         | `apps/platform-admin-web/app/tenants/page.tsx`          | Stage filters, denser listing, rollout-oriented columns, stable row drill entry.                                              |
| UI-PA-03 | P0  | Create tenant detail route and rollout workflow page.                                          | missing detail route                                    | `/tenants/[tenantId]` with tabs for overview, modules, onboarding, rollout, roles, webhook baseline, billing baseline, audit. |
| UI-PA-04 | P0  | Implement partner entry detail route.                                                          | list exists in `/partners`                              | `/partners/[partnerId]` with overview, branding, auth, eligibility, credentials, audit, readiness checklist.                  |
| UI-PA-05 | P1  | Improve platform users page to align with role-governance emphasis.                            | `apps/platform-admin-web/app/users/page.tsx`            | Clearer internal role table, status, invite flow entry, audit linkage.                                                        |
| UI-PA-06 | P1  | Align fleet page with compliance workflow framing.                                             | `apps/platform-admin-web/app/fleet/page.tsx`            | Drivers, vehicles, contracts, exclusivity, offboarding tabs with compliance warnings and export actions.                      |
| UI-PA-07 | P0  | Rework switchboard page toward versioning and placard issuance flow.                           | `apps/platform-admin-web/app/switchboard/page.tsx`      | Public info version table, current placard preview, publish flow, draft/version history framing.                              |
| UI-PA-08 | P0  | Align pricing page with publish-window governance.                                             | `apps/platform-admin-web/app/pricing/page.tsx`          | Pricing rules table, fee plan visibility, publish flow entry, override governance framing.                                    |
| UI-PA-09 | P0  | Align payments page with reconciliation-issue-first operations.                                | `apps/platform-admin-web/app/payments/page.tsx`         | Settlement matrix entry, invoices/statements context, issue list with filters and KPIs.                                       |
| UI-PA-10 | P0  | Create reconciliation issue detail route.                                                      | missing detail route                                    | `/payments/reconciliation/[issueId]` or equivalent with summary, timeline, evidence, linked refs, resolution workflow.        |
| UI-PA-11 | P1  | Refresh health page to show active alerts and adapter inventory in one operator-friendly view. | `apps/platform-admin-web/app/health/page.tsx`           | KPI strip, alert list, adapter status table, drill targets.                                                                   |
| UI-PA-12 | P1  | Rework notices page to cover both notices and maintenance mode.                                | `apps/platform-admin-web/app/notices/page.tsx`          | Notice list plus maintenance mode control panel with schedule and rationale.                                                  |
| UI-PA-13 | P1  | Align audit page with evidence-governance model.                                               | `apps/platform-admin-web/app/audit/page.tsx`            | Audit log view plus retention/legal hold/deletion-exception tabs or sections.                                                 |
| UI-PA-14 | P1  | Improve feature flag governance page to support scope clarity and safe editing UX.             | `apps/platform-admin-web/app/feature-flags/page.tsx`    | Global vs tenant override clarity, owner/updated metadata, safer toggle framing.                                              |
| UI-PA-15 | P1  | Align adapter registry with the design pack’s inventory framing.                               | `apps/platform-admin-web/app/adapter-registry/page.tsx` | Rich adapter cards or denser registry with health, kind, latency, rollout state, credentials state.                           |

## Workstream C: Ops Console

| ID        | Pri | Task                                                                                              | Current Base                                      | Deliverable                                                                                |
| --------- | --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| UI-OPS-01 | P0  | Refresh dashboard into a true shift command view.                                                 | `apps/ops-console-web/app/dashboard/page.tsx`     | Today queue, health signals, top incidents, urgent actions, fast call-session entry.       |
| UI-OPS-02 | P0  | Rework dispatch page into explicit `Owned` and `Forwarded` boards.                                | `apps/ops-console-web/app/dispatch/page.tsx`      | Separate tabs and authority-aware table schemas for self-operated vs forwarded orders.     |
| UI-OPS-03 | P0  | Implement owned dispatch detail workflow.                                                         | partial dispatch code exists                      | Candidate table, compliance gates, activity timeline, assignment and override actions.     |
| UI-OPS-04 | P0  | Implement forwarded dispatch operational board to design parity.                                  | `dispatch/forwarded-order-board.tsx` exists       | Clear mirror/external/adaptor/mismatch states and reconciliation entry workflow.           |
| UI-OPS-05 | P0  | Upgrade callcenter page into session workspace model.                                             | `apps/ops-console-web/app/callcenter/page.tsx`    | Session list, active call detail, phone booking form, callback flow, complaint handoff.    |
| UI-OPS-06 | P1  | Align complaints page with queue-plus-SLA handling.                                               | `apps/ops-console-web/app/complaints/page.tsx`    | KPIs, queue filters, assignee state, breach visibility, incident escalation linkage.       |
| UI-OPS-07 | P0  | Align incident list page and add incident detail route parity.                                    | `apps/ops-console-web/app/incidents/page.tsx`     | SOS-rich detail page with timeline, recovery actions, linked entities, escalation actions. |
| UI-OPS-08 | P1  | Rework reports page into report jobs plus filing artifacts model.                                 | `apps/ops-console-web/app/reports/page.tsx`       | Job table, status, expiry, artifact access rules, filing grouping.                         |
| UI-OPS-09 | P1  | Rework revenue page into settlement-matrix-first operational review.                              | `apps/ops-console-web/app/revenue/page.tsx`       | KPI row, channel mix framing, mismatch review, reconciliation linkage.                     |
| UI-OPS-10 | P1  | Upgrade attendance page toward schedule/shift monitoring.                                         | `apps/ops-console-web/app/attendance/page.tsx`    | Daily shift summary and gantt-like attendance visibility.                                  |
| UI-OPS-11 | P1  | Align maintenance page with work-order operational framing.                                       | `apps/ops-console-web/app/maintenance/page.tsx`   | Status tabs, overdue emphasis, dispatch impact cues.                                       |
| UI-OPS-12 | P1  | Align drivers, vehicles, and contracts pages to the prototype’s denser operational registry view. | existing route pages present                      | Consistent registry patterns with dispatchability and compliance visibility.               |
| UI-OPS-13 | P2  | Align ops feature flags page with platform-issued read-only model.                                | `apps/ops-console-web/app/feature-flags/page.tsx` | Read-only ops-visible flags view with safe metadata.                                       |

## Workstream D: Tenant Console Productization

| ID       | Pri | Task                                                                                                    | Current Base                                        | Deliverable                                                                                                                                            |
| -------- | --- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UI-TN-01 | P0  | Decide productization path for `tenant-portal-web`: evolve in place vs create new `tenant-console-web`. | sunset shell only                                   | Clear execution decision before broad UI rewrite.                                                                                                      |
| UI-TN-02 | P0  | Implement tenant console shell and information architecture matching prototype.                         | current layout is minimal bootstrap                 | New nav model: home, bookings, new booking, passengers, addresses, cost centers, rules, invoices, reports, API keys, webhooks, audit, users, settings. |
| UI-TN-03 | P0  | Add tenant home dashboard.                                                                              | no equivalent                                       | Usage KPIs, active bookings, invoice summary, notices, integration reminders.                                                                          |
| UI-TN-04 | P0  | Rename and align booking routes with new console model.                                                 | `booking-list`, `bookings/new`                      | `bookings`, `bookings/[bookingId]`, `bookings/new` or equivalent with dashboard-consistent navigation.                                                 |
| UI-TN-05 | P0  | Upgrade booking detail page into activity-rich trip detail.                                             | basic detail exists                                 | Timeline, driver summary, fare summary, linked invoice context, allowed actions only.                                                                  |
| UI-TN-06 | P0  | Upgrade new booking page from wizard shell to policy-aware booking form.                                | `bookings/new/page.tsx`                             | Service type, passenger selection, address book integration, cost center, approval impact, fare estimate, draft/save/submit flow.                      |
| UI-TN-07 | P1  | Align passenger and address pages to design parity.                                                     | pages already exist                                 | Denser registries, import flow entry, owner/tags/state visibility.                                                                                     |
| UI-TN-08 | P0  | Add cost center management page.                                                                        | missing                                             | Department/quota/usage/approval owner management surface.                                                                                              |
| UI-TN-09 | P0  | Add approval and quota rules page.                                                                      | current `sla` and `notifications` do not cover this | Rule priority view for policy conditions and approval behavior.                                                                                        |
| UI-TN-10 | P1  | Reframe billing into invoices-first UX.                                                                 | current route is `/billing`                         | Invoice summary, invoice list, dispute cues, artifact download pattern.                                                                                |
| UI-TN-11 | P1  | Align reports page with tenant analytics and artifact jobs.                                             | current reports exists                              | Job table and signed-download UX matching admin/ops pattern.                                                                                           |
| UI-TN-12 | P0  | Upgrade API key management UX.                                                                          | current route exists                                | Prefix/mask/scope/last used/expiry/revocation model plus create/rotate/revoke flows.                                                                   |
| UI-TN-13 | P0  | Upgrade webhooks page into endpoints plus deliveries model.                                             | current route exists                                | Endpoint list, event subscriptions, delivery logs, retries/replay visibility.                                                                          |
| UI-TN-14 | P1  | Align tenant audit page with immutable activity framing.                                                | current route exists                                | Better module/action/resource/request visibility and filters.                                                                                          |
| UI-TN-15 | P0  | Align tenant users page with formal role model.                                                         | current route exists                                | Tenant admin/operator/finance/integration/viewer style roles and invitation status.                                                                    |
| UI-TN-16 | P1  | Add tenant settings page.                                                                               | missing equivalent                                  | General settings, localization, billing contact, tenant status summary, privacy/integration settings.                                                  |
| UI-TN-17 | P0  | Replace demo-style auth assumptions with real tenant identity and RBAC enforcement.                     | current shell still transitional                    | Productized tenant auth/context model driven by backend authority.                                                                                     |

## Workstream E: Partner Booking

| ID       | Pri | Task                                                                                                            | Deliverable                                                                          |
| -------- | --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| UI-PB-01 | P1  | Decide whether partner booking is a dedicated app or a restricted mode under the future tenant/channel surface. | Clear product and routing decision.                                                  |
| UI-PB-02 | P1  | Implement partner-branded landing page and benefits summary.                                                    | Cardholder-facing landing with entitlement summary and CTA.                          |
| UI-PB-03 | P1  | Implement first-use eligibility/linking flow.                                                                   | Consent and account-link flow without exposing sensitive card data.                  |
| UI-PB-04 | P1  | Implement partner booking form with entitlement math.                                                           | Branded booking flow showing benefit usage, price offset, and remaining entitlement. |
| UI-PB-05 | P2  | Implement assigned/live confirmed state.                                                                        | Driver assignment, ETA, map placeholder/live-state surface.                          |
| UI-PB-06 | P2  | Implement trip history, receipt, help, and dispute entry.                                                       | Self-service post-booking lifecycle surface for partner users.                       |

## Workstream F: Cross-System API, Auth, And Data Work

| ID       | Pri | Task                                                                                               | Deliverable                                                                                                                                |
| -------- | --- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| UI-XS-01 | P0  | Produce route-to-endpoint mapping for every new detail and flow page before implementation starts. | One implementation map linking UI surfaces to actual repo APIs or identified backend gaps.                                                 |
| UI-XS-02 | P0  | Identify missing backend endpoints for detail pages introduced only by the design.                 | Gap list for tenant detail, partner detail, reconciliation detail, webhook deliveries, cost center/rule management, partner booking flows. |
| UI-XS-03 | P0  | Confirm authority-safe command actions for every mutate button in the prototypes.                  | Mutation matrix for publish, resolve, assign, invite, cancel, rotate, enable, disable, and maintenance mode actions.                       |
| UI-XS-04 | P0  | Normalize query/filter models across admin tables.                                                 | Shared filter DTO strategy for search, date ranges, status chips, and pagination.                                                          |
| UI-XS-05 | P1  | Standardize artifact access for reports, receipts, placards, and invoice files.                    | Signed URL and expiry-safe download UX.                                                                                                    |
| UI-XS-06 | P1  | Add badge/count data sources for nav-level unread, queue, and warning counts.                      | Reliable lightweight counters for health, queue, incident, complaint, and booking reminders.                                               |
| UI-XS-07 | P1  | Create seed fixtures or API mocks aligned to `mgmt-data.jsx` semantics.                            | Stable fixtures for development, UI tests, and design review parity.                                                                       |
| UI-XS-08 | P1  | Perform copy and i18n audit across the new surfaces.                                               | Consistent locale keys and terminology for platform, ops, tenant, and partner contexts.                                                    |

## Workstream G: QA, UAT, And Release Readiness

| ID       | Pri | Task                                                                                                                            | Deliverable                                                     |
| -------- | --- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| UI-QA-01 | P0  | Write UAT scenarios for Platform Admin rollout, partner entry, pricing publish, maintenance mode, and reconciliation workflows. | Role-based UAT checklist tied to page flows.                    |
| UI-QA-02 | P0  | Write UAT scenarios for Ops dispatch, callcenter, complaint escalation, incident response, and maintenance impact.              | Operator workflow acceptance matrix.                            |
| UI-QA-03 | P0  | Write UAT scenarios for Tenant booking, cost center rules, API key lifecycle, webhook delivery review, and invoice download.    | Tenant-admin and tenant-operator acceptance matrix.             |
| UI-QA-04 | P1  | Add visual regression coverage for critical management flows.                                                                   | Screenshot or DOM-regression coverage on key list/detail pages. |
| UI-QA-05 | P1  | Add permission tests for role visibility and forbidden actions.                                                                 | UI + backend contract checks for RBAC boundaries.               |
| UI-QA-06 | P1  | Add degraded-state tests for adapter outage, stale data, and empty queue conditions.                                            | Reliable UX under partial operational failure.                  |

## Suggested Build Order

### Wave 1

- UI-FND-01 to UI-FND-05
- UI-PA-01 to UI-PA-04
- UI-OPS-01 to UI-OPS-05
- UI-XS-01 to UI-XS-04

### Wave 2

- UI-PA-07 to UI-PA-10
- UI-OPS-06 to UI-OPS-10
- UI-TN-01 to UI-TN-06
- UI-TN-12 to UI-TN-15

### Wave 3

- UI-TN-07 to UI-TN-17
- UI-PB-01 to UI-PB-06
- UI-QA-01 to UI-QA-06

## Key Takeaways

- `Platform Admin` and `Ops Console` already have real route foundations, so they are best candidates for immediate design implementation.
- `Tenant Console` is not a pure redesign task. It is a productization task plus redesign task.
- `Partner Booking` is a real separate surface in the design pack and should not be hidden inside a generic tenant backlog item.
- The design pack is strongest where it introduces workflow depth. That is also where implementation complexity is highest.
- The first engineering decision should be shared shell/component strategy, otherwise each console will drift during implementation.
