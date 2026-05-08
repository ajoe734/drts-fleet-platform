# Tenant Console And Cross-System Design Execution Packet

Date: 2026-05-08
Source design archive: `docs/05-ui/drts.zip`
Source review and backlog analysis: `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
Primary product reference: `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`

## Purpose

Materialize the selected `Tenant Console` and cross-system guardrail gaps into
supervisor-ready execution slices.

This packet is intentionally narrower than the full tenant design review. It
focuses on the user-selected backlog ranges:

- `UI-TN-01` through `UI-TN-06`
- `UI-TN-12` through `UI-TN-17`
- `UI-XS-01` through `UI-XS-04`

## Why This Needs A Separate Packet

The current repo truth is intentionally conflicted on purpose:

- `apps/tenant-portal-web` exists and has useful route footholds
- repo topology docs also mark it as a sunset reference shell
- the new management design pack treats `Tenant Console` as a real product
  surface again

That means `Tenant Console` cannot be dispatched like a normal page-reskin
wave. It needs:

- a topology/productization decision first
- explicit route-to-endpoint and command-authority mapping
- a real tenant identity / RBAC cutover path

## Scope In

- `apps/tenant-portal-web` if `TEN-UI-001` confirms evolve-in-place
- a new tenant app entry in this repo if `TEN-UI-001` confirms rebuild /
  supersession
- `packages/api-client` and shared frontend helpers only where tenant-surface
  integration requires it
- docs / authority records required to remove topology ambiguity
- cross-system route / endpoint / command / filter mapping required before
  productization

## Scope Out

- full `Partner Booking` funnel implementation
- cost center, rules, invoices, and reports productization beyond the selected
  backlog slice
- backend business-semantic changes that alter tenant / platform authority
- first-party passenger surfaces
- `Driver App`

## Source Design Inventory

The relevant source files inside `docs/05-ui/drts.zip` are:

- `tenant-screens.jsx`
- `partner-screens.jsx`
- `mgmt-shell.jsx`
- `mgmt-data.jsx`
- `mgmt-tokens.jsx`

These files define the intended:

- tenant workspace shell
- booking list / detail / create flows
- integration-governance surfaces
- tenant user / audit / settings framing
- partner-mode constraints

## Current Repo Baseline

Current `apps/tenant-portal-web` footholds already exist for:

- `/`
- `/booking-list`
- `/bookings/new`
- `/billing`
- `/reports`
- `/api-keys`
- `/webhooks`
- `/passengers`
- `/addresses`
- `/users`
- `/audit`
- `/notifications`
- `/sla`
- `/feature-flags`

Current repo truth also records:

- `apps/tenant-portal-web` as a sunset reference shell
- `/api/tenant/*` as the authority boundary that any revived tenant console
  must continue to use
- `TEN-MP-001` as a completed baseline for owned vs externally fulfilled
  source-domain visibility on tenant surfaces

## Design-Driven Gaps This Wave Must Close

### Tenant Console

- productization path: evolve existing shell vs create a new app target
- workspace shell and route map aligned to the new prototype
- tenant home dashboard
- booking list and detail parity
- policy-aware new-booking flow
- API key and webhook management productization
- audit, users, and settings parity
- real tenant identity and RBAC enforcement instead of transitional/demo
  assumptions

### Cross-System Guardrails

- route-to-endpoint mapping before UI implementation fan-out
- missing backend gap inventory for prototype-only detail surfaces
- authority-safe command-action matrix
- normalized filter / query model for management and tenant tables

## Non-Negotiable Guardrails

- `TEN-UI-001` must resolve the tenant topology ambiguity before broad tenant
  UI rewrites start
- `/api/tenant/*` remains the only backend authority surface for tenant-console
  execution
- frontend must not directly mutate booking or order state fields
- all booking status changes, cancels, invites, rotates, enables, disables, and
  maintenance actions must map to command endpoints
- tenant roles and scopes must be server-issued; do not preserve demo cookie
  role simulation as the productized truth
- partner booking mode must remain constrained and must not expose tenant-admin
  navigation
- artifact download flows must continue to rely on short-lived server-issued
  URLs

## Task Breakdown

### TEN-UI-001 — Tenant Console Productization Topology Decision

Owner: `Codex`
Reviewer: `Claude`

Depends on: `TEN-MP-001`

Write scope:

- `docs/01-product/platform-admin-ops-tenant-console-product-spec-20260508.md`
- `docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md`
- `docs/02-architecture/tenant-commute-hub-boundary.md`
- `apps/tenant-portal-web/README.md`
- additive canonical decision/runbook records if needed

Work:

- Decide whether this repo should:
  - evolve `apps/tenant-portal-web` in place into the new tenant console, or
  - introduce a new tenant-console target and formally supersede the sunset
    shell
- Record the chosen topology, migration rule, and route ownership clearly so
  the supervisor does not dispatch tenant UI work into an ambiguous target.
- Define how partner-mode constraints relate to the chosen tenant-console
  landing zone.

Acceptance:

- topology decision filed with no contradictory canonical tenant-surface record
  left unresolved

### XS-UI-001 — Route-To-Endpoint Mapping Packet

Owner: `Claude2`
Reviewer: `Codex`

Depends on: `TEN-UI-001`

Write scope:

- `docs/03-runbooks/tenant-console-and-cross-system-design-execution-packet-20260508.md`
- additive support packet if needed under `support/sidecars/XS-UI-001/`

Work:

- Produce a route-to-endpoint map for the selected new or upgraded tenant
  surfaces.
- Include:
  - shell / home
  - bookings list / detail / new booking
  - API keys
  - webhooks
  - audit
  - users
  - settings
- Distinguish between existing endpoints, probable endpoint owners, and unknown
  authority gaps.

Acceptance:

- route-to-endpoint mapping filed and cited in machine truth

Filed packet (2026-05-08):

- `support/sidecars/XS-UI-001/route-to-endpoint-map.md` is the canonical
  route-to-endpoint map for the selected tenant-console surfaces and the
  authority-gap inventory partitioned to `XS-UI-002` / `XS-UI-003` /
  `XS-UI-004`. Implementation slices `TEN-UI-002` … `TEN-UI-008` MUST consume
  this packet rather than reinventing tenant-side endpoint names; new tenant
  endpoint claims require an update to §3 / §6 there first.

### XS-UI-002 — Missing Backend Endpoint Gap Inventory

Owner: `Codex2`
Reviewer: `Claude`

Depends on: `XS-UI-001`

Write scope:

- additive docs/evidence only

Work:

- Identify backend gaps introduced by the selected prototype surfaces.
- At minimum, assess:
  - booking detail richness vs existing tenant read models
  - webhook delivery-log visibility
  - tenant settings surface
  - formal role / invite management
  - any topology-specific gaps from `TEN-UI-001`

Acceptance:

- backend-gap inventory filed with clear "exists / missing / unclear" status per
  surface

### XS-UI-003 — Tenant And Management Command Action Matrix

Owner: `Codex`
Reviewer: `Claude2`

Depends on: `XS-UI-001`

Write scope:

- additive docs/evidence only

Work:

- Confirm the command-action matrix for the selected prototype actions.
- At minimum, cover:
  - booking create / update / cancel
  - invite / suspend / role change
  - API key issue / rotate / revoke
  - webhook enable / disable / retry / replay if supported
  - maintenance / notice / publish / resolve actions that cross into
    management-console parity

Acceptance:

- command-action matrix filed with authority-safe action mapping or explicit
  blocker notes

### XS-UI-004 — Shared Query And Filter Model Normalization

Owner: `Claude`
Reviewer: `Codex2`

Depends on: `XS-UI-001`

Write scope:

- additive docs/evidence only
- shared frontend contract surfaces only if normalization work is code-backed

Work:

- Normalize search / status / date-range / pagination expectations across the
  selected admin and tenant list surfaces.
- Record where a shared DTO or filter-shape contract should be introduced or
  reused rather than letting each surface invent its own query semantics.

Acceptance:

- filter / query normalization packet filed with explicit recommended shared
  shape

### TEN-UI-002 — Tenant Console Shell And Information Architecture Materialization

Owner: `Claude2`
Reviewer: `Codex`

Depends on: `TEN-UI-001`, `XS-UI-001`, `XS-UI-004`

Write scope:

- tenant-console app shell target chosen by `TEN-UI-001`
- shared tenant navigation / layout components under the chosen target

Work:

- Implement the tenant shell and navigation model matching the prototype.
- Align primary route groups for:
  - home
  - bookings
  - new booking
  - API keys
  - webhooks
  - audit
  - users
  - settings
- Keep partner-mode restrictions explicit if the same codebase supports both
  tenant-admin and partner-booking entry modes.

Acceptance:

- tenant target app typecheck passes

### TEN-UI-003 — Tenant Home Dashboard Materialization

Owner: `Codex2`
Reviewer: `Claude`

Depends on: `TEN-UI-002`, `XS-UI-001`

Write scope:

- tenant target app home route

Work:

- Build the tenant home dashboard with:
  - tenant identity context
  - active-booking summary
  - billing / notice reminders
  - integration reminders
  - quick-entry actions

Acceptance:

- tenant target app typecheck passes

### TEN-UI-004 — Booking List And Booking Detail Productization

Owner: `Claude`
Reviewer: `Codex2`

Depends on: `TEN-UI-002`, `XS-UI-001`, `XS-UI-003`

Write scope:

- tenant target app booking list/detail routes

Work:

- Align booking list and detail to the new tenant console model.
- Ensure the detail surface exposes:
  - timeline
  - passenger / route context
  - driver / fulfillment summary when authority allows
  - fare / invoice context where available
  - allowed actions only
- Replace transitional route naming where required by the chosen topology.

Acceptance:

- tenant target app typecheck passes

### TEN-UI-005 — Policy-Aware New Booking Workflow Materialization

Owner: `Codex`
Reviewer: `Claude2`

Depends on: `TEN-UI-002`, `XS-UI-001`, `XS-UI-003`

Write scope:

- tenant target app new-booking route

Work:

- Upgrade the create-booking flow to a policy-aware operational form.
- Include:
  - passenger selection
  - address-book integration
  - cost-center and approval-impact framing where current authority allows
  - notes / service attributes
  - draft / submit affordances only if backed by authority-safe flows

Acceptance:

- tenant target app typecheck passes

### TEN-UI-006 — API Key And Webhook Productization

Owner: `Codex2`
Reviewer: `Codex`

Depends on: `TEN-UI-002`, `XS-UI-001`, `XS-UI-002`, `XS-UI-003`

Write scope:

- tenant target app API-key and webhook routes
- `packages/api-client` only if required for supported tenant integrations

Work:

- Productize API key and webhook management surfaces to the selected design
  depth.
- API-key surface must support:
  - prefix / mask
  - scope
  - expiry
  - last used
  - issue / rotate / revoke flows
- Webhook surface must support:
  - endpoint list
  - event subscriptions
  - delivery visibility where authority exists
  - retry / replay affordances only if backend support is confirmed

Acceptance:

- tenant target app typecheck passes

### TEN-UI-007 — Audit, Users, Settings, And Formal Role Model

Owner: `Claude2`
Reviewer: `Codex`

Depends on: `TEN-UI-002`, `XS-UI-001`, `XS-UI-003`

Write scope:

- tenant target app audit, users, and settings routes

Work:

- Align tenant audit, users, and settings surfaces to the selected prototype
  scope.
- Replace informal role assumptions with the formal tenant role framing from
  the product spec:
  - tenant admin
  - operator
  - finance / analyst
  - integration manager
  - viewer

Acceptance:

- tenant target app typecheck passes

### TEN-UI-008 — Real Tenant Identity And RBAC Cutover

Owner: `Codex`
Reviewer: `Claude`

Depends on: `TEN-UI-001`, `TEN-UI-007`, `XS-UI-003`, `TEN-MP-001`

Write scope:

- tenant target app auth/context wiring
- `packages/api-client` only if required
- additive docs/runbook truth if auth assumptions change

Work:

- Remove transitional/demo-style role assumptions from the revived tenant
  surface.
- Ensure tenant identity, scopes, and role-gated navigation/actions are derived
  from backend authority rather than local simulation.
- Keep source-domain visibility from `TEN-MP-001` intact while replacing the
  role model underneath it.

Acceptance:

- tenant target app typecheck passes
- role-gated navigation/actions are authority-driven rather than demo-local

### TEN-UI-009 — Tenant Console Verification Packet

Owner: `Codex`
Reviewer: `Claude2`

Depends on: `XS-UI-001`, `XS-UI-002`, `XS-UI-003`, `XS-UI-004`, `TEN-UI-002`, `TEN-UI-003`, `TEN-UI-004`, `TEN-UI-005`, `TEN-UI-006`, `TEN-UI-007`, `TEN-UI-008`

Write scope:

- `support/sidecars/TEN-UI-009/`
- additive docs/evidence only

Work:

- Record route-by-route tenant-console design parity.
- Capture:
  - chosen topology outcome from `TEN-UI-001`
  - endpoint and command mappings used
  - accepted deviations
  - unresolved backend gaps
  - tenant identity / RBAC verification notes

Acceptance:

- tenant target app typecheck passes
- verification packet filed under `support/sidecars/TEN-UI-009/`

## Dispatch Rule

1. Dispatch `TEN-UI-001` first. Do not start broad tenant UI rewrites while the
   target app topology remains ambiguous.
2. After the topology decision lands, dispatch `XS-UI-001`.
3. Dispatch `XS-UI-002`, `XS-UI-003`, and `XS-UI-004` before finalizing any
   tenant workflow implementation that depends on endpoint, command, or query
   truth.
4. After `TEN-UI-002` lands, `TEN-UI-003`, `TEN-UI-004`, `TEN-UI-005`,
   `TEN-UI-006`, and `TEN-UI-007` may run in parallel where their write scopes
   are disjoint.
5. Hold `TEN-UI-008` until the role/governance surfaces and command matrix are
   explicit.
6. Treat `TEN-UI-009` as the final evidence gate for this selected tenant wave.

## Auto-Worker Guardrails

- If `TEN-UI-001` keeps `apps/tenant-portal-web` as the target, workers must
  still remove the sunset/demo assumptions from behavior and docs as directed.
- If `TEN-UI-001` opens a new app target, workers must avoid dual-maintaining
  two divergent tenant products without a documented migration rule.
- Do not fabricate webhook delivery, settings, or invite behavior in frontend
  copy if backend support is still unresolved.
- Keep partner-mode restrictions explicit; do not leak tenant-admin navigation
  into partner entry paths.
- If an action is not backed by an authority-safe command endpoint, record the
  blocker in machine truth instead of papering over it with fake controls.
