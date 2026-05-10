# Platform Admin And Ops Console Design Execution Packet

Date: 2026-05-08
Source design archive: `docs/05-ui/drts.zip`
Source review and backlog analysis: `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`

## Purpose

Materialize the new `Platform Admin` and `Ops Console` design wave into
supervisor-ready implementation slices.

This packet is intentionally execution-oriented. It assumes:

- both apps already have route-level foundations in this repo
- the design archive is the visual and information-architecture source of truth
- backend authority boundaries remain unchanged

This wave is not a generic reskin. It is a workflow-depth implementation wave
for the two management consoles.

## Scope In

- `apps/platform-admin-web`
- `apps/ops-console-web`
- `packages/ui-web` shared desktop management primitives when required
- additive route/detail-page work required to realize the supplied design
- design-verification and implementation-evidence packet for these two apps

## Scope Out

- `Tenant Console` productization
- `Partner Booking` app / funnel
- `Driver App`
- backend semantic changes that would alter authority boundaries
- rewriting the design source files under `docs/05-ui/`

## Source Design Inventory

The relevant source files inside `docs/05-ui/drts.zip` are:

- `platform-screens.jsx`
- `ops-screens.jsx`
- `mgmt-shell.jsx`
- `mgmt-data.jsx`
- `mgmt-screens.jsx`
- `mgmt-tokens.jsx`

These files define the intended:

- shell hierarchy
- page grouping
- KPI strip patterns
- dense-table patterns
- stepper and timeline patterns
- detail-page expectations
- workflow semantics for rollout, dispatch, reconciliation, and incident review

## Current Repo Baseline

### Platform Admin Routes Already Present

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

### Ops Console Routes Already Present

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

## Design-Driven Gaps This Wave Must Close

### Platform Admin

- governance-first home rather than plain entry dashboard
- tenant detail / rollout workflow route
- partner detail / readiness route
- reconciliation issue detail route
- denser pricing, settlement, switchboard, and health surfaces
- clearer adapter / flag / notice / audit governance framing

### Ops Console

- explicit `owned` vs `forwarded` dispatch boards
- dispatch detail workflow
- richer callcenter workspace
- stronger complaint and incident work queues
- more operational revenue / reporting / maintenance framing
- tighter registry presentation for drivers / vehicles / contracts

### Explicit Carry-Through For The Additional Selected Gaps

The follow-on selected gaps are treated as:

- new deep-page follow-up tasks where the current packet was still too coarse
- explicit continuations of already-materialized active tasks where a duplicate
  ticket would create overlap

Concretely:

- `UI-PA-03` maps to new `ADM-UI-005`
- `UI-PA-04` maps to new `ADM-UI-006`
- `UI-PA-10` remains explicitly carried by `ADM-UI-003`, which is already
  active and in review; do not open a duplicate reconciliation-detail ticket
- `UI-OPS-02` maps to new `OPS-UI-006`
- `UI-OPS-03` maps to new `OPS-UI-007`
- `UI-OPS-05` maps to new `OPS-UI-008`

## Non-Negotiable Guardrails

- `owned` and `forwarded` order semantics must remain visibly and behaviorally distinct
- UI must not fabricate local truth for external-platform states
- state mutations must continue through backend command endpoints
- audit remains append-only and read-only from frontend
- use existing contracts and `@drts/api-client` surfaces where possible
- do not fork a separate design-only data layer into production code

## Task Breakdown

### MGMT-UI-001 — Shared Desktop Management Primitive Alignment

Status note:

- This initial primitive extraction task is already closed in machine truth.
- The follow-up tasks `MGMT-UI-003` through `MGMT-UI-005` below refine that
  base into stricter anti-drift foundations for shell, table/filter/status,
  and workflow primitives.

Owner: `Codex2`
Reviewer: `Claude2`

Write scope:

- `packages/ui-web/src/index.tsx`
- additive shared desktop-management helpers under `packages/ui-web` only if needed

Work:

- Add the shared desktop primitives needed by both consoles:
  - dense KPI row primitives
  - grouped section headers / page header affordances
  - filter-pill row patterns
  - banner / callout primitives
  - stepper and timeline primitives
  - dense detail-list / metadata patterns
  - reusable status chips that preserve authority boundaries
- Keep existing app imports workable; do not force same-turn rewrites of all pages.

Acceptance:

- `pnpm --filter @drts/ui-web typecheck`
- `pnpm --filter @drts/platform-admin-web typecheck`
- `pnpm --filter @drts/ops-console-web typecheck`

### MGMT-UI-003 — Shared Management Shell And Surface Token Hardening

Owner: `Codex2`
Reviewer: `Claude2`

Depends on: `MGMT-UI-001`

Write scope:

- `packages/ui-web/src/index.tsx`
- additive shared shell helpers under `packages/ui-web`
- app-level shell wiring in `apps/platform-admin-web` and `apps/ops-console-web`
  only if required to validate the abstraction

Work:

- Standardize shared shell decisions for the management consoles:
  - sidebar rhythm
  - topbar / page-header composition
  - section spacing and content density
  - shared management-surface style helpers
  - console-safe token usage for desktop management views
- Ensure the shell layer is reusable by Platform Admin and Ops Console without
  app-specific forks.

Acceptance:

- `pnpm --filter @drts/ui-web typecheck`
- `pnpm --filter @drts/platform-admin-web typecheck`
- `pnpm --filter @drts/ops-console-web typecheck`

### MGMT-UI-004 — Shared Table, Filter, And Status System Hardening

Owner: `Codex`
Reviewer: `Codex2`

Depends on: `MGMT-UI-001`

Write scope:

- `packages/ui-web/src/index.tsx`
- additive table / filter / status-chip helpers under `packages/ui-web`

Work:

- Standardize the shared management data-view language:
  - dense table shell expectations
  - filter-pill row behavior
  - status-chip / badge semantics
  - authority-safe owned / forwarded / warning / degraded state treatment
  - metadata row density for admin and ops surfaces
- Avoid per-page one-off table and badge implementations that drift from each
  other over time.

Acceptance:

- `pnpm --filter @drts/ui-web typecheck`
- `pnpm --filter @drts/platform-admin-web typecheck`
- `pnpm --filter @drts/ops-console-web typecheck`

### MGMT-UI-005 — Shared Stepper, Timeline, And Detail-Metadata Hardening

Owner: `Claude2`
Reviewer: `Codex`

Depends on: `MGMT-UI-001`

Write scope:

- `packages/ui-web/src/index.tsx`
- additive workflow/detail primitives under `packages/ui-web`

Work:

- Standardize shared workflow-detail primitives:
  - stepper
  - timeline
  - detail-list / metadata grid
  - workflow callout / drawer-friendly content blocks
- These primitives must support rollout, reconciliation, dispatch detail, and
  incident-response surfaces without each page inventing its own pattern.

Acceptance:

- `pnpm --filter @drts/ui-web typecheck`
- `pnpm --filter @drts/platform-admin-web typecheck`
- `pnpm --filter @drts/ops-console-web typecheck`

### ADM-UI-002 — Governance Home And Tenant / Partner / User Surfaces

Owner: `Claude`
Reviewer: `Codex`

Depends on: `MGMT-UI-001`, `MGMT-UI-003`, `MGMT-UI-004`, `MGMT-UI-005`

Write scope:

- `apps/platform-admin-web/app/page.tsx`
- `apps/platform-admin-web/app/tenants/**`
- `apps/platform-admin-web/app/partners/**`
- `apps/platform-admin-web/app/users/page.tsx`
- `apps/platform-admin-web/components/admin-nav.tsx`

Work:

- Rebuild platform admin home to match governance-first dashboard intent.
- Align tenants list with design filters and denser governance table.
- Add tenant detail / rollout route with tabs:
  - overview
  - modules
  - onboarding
  - rollout
  - roles
  - webhook baseline
  - billing baseline
  - audit
- Align partners list and add partner detail / readiness route.
- Align platform users page with stronger RBAC/governance framing.

Acceptance:

- `pnpm --filter @drts/platform-admin-web typecheck`

### ADM-UI-003 — Fleet, Switchboard, Pricing, Payments, And Reconciliation Detail

Owner: `Codex`
Reviewer: `Claude2`

Depends on: `MGMT-UI-001`, `ADM-MP-002`

Write scope:

- `apps/platform-admin-web/app/fleet/page.tsx`
- `apps/platform-admin-web/app/switchboard/**`
- `apps/platform-admin-web/app/pricing/page.tsx`
- `apps/platform-admin-web/app/payments/**`

Work:

- Align fleet page with drivers / vehicles / contracts / exclusivity / offboarding framing.
- Rework switchboard toward public-info versioning and placard issuance workflow.
- Align pricing page with publish-window and override-governance model.
- Align payments page with reconciliation-issue-first operations.
- Add reconciliation issue detail route with summary, timeline, linked references, and resolution workflow.

Acceptance:

- `pnpm --filter @drts/platform-admin-web typecheck`

### ADM-UI-004 — Health, Notices, Audit, Flags, And Adapter Registry Alignment

Owner: `Gemini2`
Reviewer: `Copilot`

Depends on: `MGMT-UI-001`, `MGMT-UI-003`, `MGMT-UI-004`, `MGMT-UI-005`, `ADM-MP-001`

Write scope:

- `apps/platform-admin-web/app/health/page.tsx`
- `apps/platform-admin-web/app/notices/page.tsx`
- `apps/platform-admin-web/app/audit/page.tsx`
- `apps/platform-admin-web/app/feature-flags/page.tsx`
- `apps/platform-admin-web/app/adapter-registry/**`

Work:

- Align health page with alert inventory plus adapter visibility.
- Rework notices page to include both notices and maintenance mode controls.
- Align audit page with evidence-governance framing.
- Align feature flag page with scope-safe platform governance semantics.
- Extend adapter registry visual alignment from `ADM-UI-001` into a richer inventory presentation if still needed by the design pack.

Acceptance:

- `pnpm --filter @drts/platform-admin-web typecheck`

### OPS-UI-002 — Dashboard, Dispatch Boards, And Dispatch Detail

Owner: `Codex2`
Reviewer: `Claude`

Depends on: `MGMT-UI-001`, `MGMT-UI-003`, `MGMT-UI-004`, `MGMT-UI-005`, `OPS-UI-001`, `OPS-MP-001`, `OPS-MP-002`

Write scope:

- `apps/ops-console-web/app/dashboard/page.tsx`
- `apps/ops-console-web/app/dispatch/**`
- `apps/ops-console-web/components/sidebar.tsx`

Work:

- Rebuild dashboard into a shift command view with urgent banners and health signals.
- Align `/dispatch` with explicit `Owned` and `Forwarded` boards.
- Preserve and extend the completed `OPS-UI-001` forwarded-board work rather than replacing it.
- Add owned dispatch detail workflow with candidate, compliance gate, timeline, and action panel.

Acceptance:

- `pnpm --filter @drts/ops-console-web typecheck`

### OPS-UI-003 — Callcenter, Complaints, And Incident Workflow Alignment

Owner: `Claude2`
Reviewer: `Codex`

Depends on: `MGMT-UI-001`, `MGMT-UI-003`, `MGMT-UI-004`, `MGMT-UI-005`

Write scope:

- `apps/ops-console-web/app/callcenter/page.tsx`
- `apps/ops-console-web/app/complaints/page.tsx`
- `apps/ops-console-web/app/incidents/page.tsx`

Work:

- Rebuild callcenter into session workspace model.
- Align complaints queue with SLA and escalation-first handling.
- Align incident list and detail states with SOS / service recovery workflow.
- Preserve complaint-to-incident and driver-SOS operational authority rules.

Acceptance:

- `pnpm --filter @drts/ops-console-web typecheck`

### OPS-UI-004 — Reports, Revenue, Attendance, And Maintenance Alignment

Owner: `Gemini`
Reviewer: `Copilot`

Depends on: `MGMT-UI-001`, `MGMT-UI-003`, `MGMT-UI-004`, `MGMT-UI-005`, `OPS-MP-002`

Write scope:

- `apps/ops-console-web/app/reports/page.tsx`
- `apps/ops-console-web/app/revenue/page.tsx`
- `apps/ops-console-web/app/attendance/page.tsx`
- `apps/ops-console-web/app/maintenance/page.tsx`

Work:

- Align reports page with report jobs / filing package framing.
- Align revenue page with settlement matrix and mismatch review.
- Align attendance page with shift monitoring intent.
- Align maintenance page with work-order and dispatch-impact view.

Acceptance:

- `pnpm --filter @drts/ops-console-web typecheck`

### OPS-UI-005 — Driver / Vehicle / Contract / Ops-Flag Registry Alignment

Owner: `Gemini2`
Reviewer: `Claude2`

Depends on: `MGMT-UI-001`, `MGMT-UI-003`, `MGMT-UI-004`, `MGMT-UI-005`, `OPS-MP-003`

Write scope:

- `apps/ops-console-web/app/drivers/**`
- `apps/ops-console-web/app/vehicles/page.tsx`
- `apps/ops-console-web/app/contracts/page.tsx`
- `apps/ops-console-web/app/feature-flags/page.tsx`
- `apps/ops-console-web/components/driver-platform-actions.tsx` only if required for design parity

Work:

- Align driver registry and detail presentation with the design’s denser operational registry model.
- Align vehicles and contracts pages to the same registry language.
- Keep ops feature flags read-only and clearly platform-issued.
- Preserve existing driver platform eligibility management from `OPS-MP-003`.

Acceptance:

- `pnpm --filter @drts/ops-console-web typecheck`

### ADM-UI-005 — Tenant Detail And Rollout Workflow Deep-Page Hardening

Owner: `Claude`
Reviewer: `Codex`

Depends on: `ADM-UI-002`, `MGMT-UI-004`, `MGMT-UI-005`

Write scope:

- `apps/platform-admin-web/app/tenants/[tenantId]/**`

Work:

- Take the tenant detail route from "present" to explicit design parity.
- Ensure the route supports the designed governance tabs and deep-page affordances:
  - overview
  - modules
  - onboarding
  - rollout
  - roles
  - webhook baseline
  - billing baseline
  - audit
- Reuse shared table / metadata / timeline primitives instead of page-local
  one-off implementations.

Acceptance:

- `pnpm --filter @drts/platform-admin-web typecheck`

### ADM-UI-006 — Partner Detail And Entry Readiness Deep-Page Hardening

Owner: `Codex2`
Reviewer: `Claude2`

Depends on: `ADM-UI-002`, `MGMT-UI-004`, `MGMT-UI-005`

Write scope:

- `apps/platform-admin-web/app/partners/[partnerId]/**`

Work:

- Take the partner detail route from list-drill entry to full readiness surface.
- Ensure the route supports:
  - overview
  - branding
  - auth
  - eligibility
  - credentials
  - audit
  - readiness checklist
- Keep partner-entry authority and rollout semantics explicit; do not blur this
  page into a generic tenant detail clone.

Acceptance:

- `pnpm --filter @drts/platform-admin-web typecheck`

### OPS-UI-006 — Owned And Forwarded Dispatch Board Authority Hardening

Owner: `Claude2`
Reviewer: `Codex`

Depends on: `OPS-UI-002`, `MGMT-UI-004`

Write scope:

- `apps/ops-console-web/app/dispatch/page.tsx`
- `apps/ops-console-web/app/dispatch/**`

Work:

- Make the `Owned` and `Forwarded` dispatch boards explicitly distinct in
  board structure, table schema, badge language, and queue semantics.
- Preserve the already-completed forwarded-board baseline from `OPS-UI-001`
  and extend it instead of replacing it.
- Do not allow local UI abstraction to flatten both boards into one generic
  order-board surface.

Acceptance:

- `pnpm --filter @drts/ops-console-web typecheck`

### OPS-UI-007 — Dispatch Detail Workflow Hardening

Owner: `Codex2`
Reviewer: `Claude`

Depends on: `OPS-UI-002`, `OPS-UI-006`, `MGMT-UI-005`, `OPS-MP-001`, `OPS-MP-002`

Write scope:

- `apps/ops-console-web/app/dispatch/**`

Work:

- Drive the dispatch detail surface to workflow parity for the selected gap.
- Ensure the detail workflow exposes:
  - candidate table
  - compliance gate
  - timeline
  - action panel
  - authority-safe owned / forwarded cues where relevant
- Reuse the shared timeline / detail metadata primitives instead of inventing a
  dispatch-only pattern.

Acceptance:

- `pnpm --filter @drts/ops-console-web typecheck`

### OPS-UI-008 — Callcenter Session Workspace Hardening

Owner: `Codex`
Reviewer: `Claude2`

Depends on: `OPS-UI-003`, `MGMT-UI-004`, `MGMT-UI-005`

Write scope:

- `apps/ops-console-web/app/callcenter/page.tsx`

Work:

- Take the callcenter surface from section coverage to full session-workspace
  parity.
- Ensure the page supports:
  - session list
  - active call detail
  - phone booking entry
  - callback flow
  - complaint handoff
- Preserve authority boundaries between phone-order creation, booking lookup,
  and complaint escalation.

Acceptance:

- `pnpm --filter @drts/ops-console-web typecheck`

### MGMT-UI-002 — Platform Admin And Ops Console Verification Packet

Owner: `Copilot`
Reviewer: `Claude`

Depends on: `ADM-UI-002`, `ADM-UI-003`, `ADM-UI-004`, `ADM-UI-005`, `ADM-UI-006`, `OPS-UI-002`, `OPS-UI-003`, `OPS-UI-004`, `OPS-UI-005`, `OPS-UI-006`, `OPS-UI-007`, `OPS-UI-008`

Write scope:

- `support/sidecars/MGMT-UI-002/`
- additive docs/evidence only

Work:

- Compare implemented Platform Admin and Ops Console surfaces against the design pack.
- Record route-by-route deltas, accepted deviations, and authority-safety checks.
- Capture verification notes for:
  - route coverage
  - typecheck results
  - owned vs forwarded guardrails
  - missing detail flows if any remain

Acceptance:

- `pnpm --filter @drts/platform-admin-web typecheck`
- `pnpm --filter @drts/ops-console-web typecheck`
- verification packet filed under `support/sidecars/MGMT-UI-002/`

## Dispatch Rule

1. Treat `MGMT-UI-001` as the already-landed primitive baseline.
2. Dispatch `MGMT-UI-003`, `MGMT-UI-004`, and `MGMT-UI-005` before any new
   page-family rewrite that is still in backlog or todo.
3. Do not dispatch backlog/todo page-family rewrites before the follow-up
   foundation tasks above land.
4. `ADM-UI-003` may continue as an in-flight task, but it should adopt the
   shared foundation hardening before review closeout where relevant.
5. After the foundation follow-ups land, these tasks may run in parallel
   because their write scopes are disjoint:
   - `ADM-UI-002`
   - `ADM-UI-004`
   - `OPS-UI-002`
   - `OPS-UI-003`
   - `OPS-UI-004`
   - `OPS-UI-005`
6. After the page-family baselines land, these route-depth follow-up tasks may
   run in parallel where their write scopes do not overlap:
   - `ADM-UI-005`
   - `ADM-UI-006`
   - `OPS-UI-006`
   - `OPS-UI-007`
   - `OPS-UI-008`
7. Preserve completed work from `ADM-UI-001`, `OPS-UI-001`, `ADM-MP-001`,
   `ADM-MP-002`, `OPS-MP-001`, `OPS-MP-002`, and `OPS-MP-003`; extend them,
   do not regress or duplicate them.
8. Treat `MGMT-UI-002` as the final evidence gate for this wave.

## Auto-Worker Guardrails

- Use the design source as layout and IA truth, not as fake-runtime data truth.
- Reuse existing API client and contracts instead of adding one-off fetch surfaces.
- Do not collapse `owned` and `forwarded` cards, tables, or action paths into one generic component without explicit authority cues.
- Keep route additions additive and scoped; do not rewrite unrelated control-plane or backend code.
- If a worker cannot complete verification, record the blocker honestly in machine truth instead of silently skipping it.
