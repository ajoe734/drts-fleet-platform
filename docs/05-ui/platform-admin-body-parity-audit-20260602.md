# Platform Admin Body Parity Audit

- Date: 2026-06-02
- Auditor: Codex
- Target app: `apps/platform-admin-web`
- Runtime baseline: `origin/dev` at `3996828ad79cee93ce2b0dfff9c244c21a52bee1`
- Dev URL audited: `https://drts-dev-platform-admin-web-ne55h7sy3a-uc.a.run.app`

## 1. Authority

The implementation target is the visual + functional pair below:

- Visual authority: `docs/05-ui/drts-design-canvas/Platform Admin.html`
- Canvas JSX reference: `docs/05-ui/drts-design-canvas/platform-screens-1.jsx`, `platform-screens-2.jsx`, `platform-screens-3.jsx`
- Functional authority: `docs/05-ui/platform-admin-design-handoff-packet-20260525.md`
- Wave acceptance: `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md`

`UI-FE-ADM` acceptance is **all 18 routes per Platform Admin canvas**, including plaintext-once secret modal, pricing version model, and reimbursement state machine. The shell/menu fix in PR #485 only fixes the shared chrome. It does not complete body parity.

## 2. Audit Method

- Read the canvas and handoff packet, especially the 18 `PA_*` screen functions.
- Inspected runtime route files under `apps/platform-admin-web/app/**/page.tsx`.
- Ran remote route census against dev after PR #485 deploy.
- Compared route presence, page title/body structure, tabs, primary cards/tables, state-machine components, high-risk action affordances, and required evidence/health/empty-state patterns.

## 3. Executive Summary

The current Platform Admin is **not body-parity complete**.

What is now correct:

- Shared shell/menu no longer uses the old `AppSidebar`.
- Remote dev has one 224px Platform Admin sidebar, topbar identity chip, refresh badge, and API health footer.

Still missing or incomplete:

- **3 of 18 canvas routes are 404:** `/tenants/[tenantId]`, `/payments/reimbursements`, `/payments/reimbursements/[batchId]`.
- The sidebar still needs the canvas reimbursement nav item once reimbursement routes exist.
- Most existing route bodies are partial or structurally different from `Platform Admin.html`.
- Several routes still use legacy `.admin-*` CSS or generic management primitives rather than the canvas Platform Admin body language.
- Current bodies often include extra forms/panels not present in the canvas, while missing canvas-critical state machines, tab sets, legal-hold badges, maintenance preview, and high-risk action patterns.

## 4. Remote Route Census

Captured on 2026-06-02 against dev at `3996828a`.

| Route                                | Dev status | Canvas status | Audit result                                                               |
| ------------------------------------ | ---------: | ------------- | -------------------------------------------------------------------------- |
| `/`                                  |        200 | Required      | Exists; body differs from canvas home layout.                              |
| `/tenants`                           |        200 | Required      | Exists; body differs from canvas tabbed tenant lifecycle table.            |
| `/tenants/[tenantId]`                |        404 | Required      | **Missing route.**                                                         |
| `/tenant-governance`                 |        200 | Required      | Exists; body differs from canvas Q-ADM01 heatmap dashboard.                |
| `/partners`                          |        200 | Required      | Exists; partially close, but body is not canvas parity.                    |
| `/partners/[entrySlug]`              |        200 | Required      | Exists; missing/unclear plaintext-once credential modal parity.            |
| `/users`                             |        200 | Required      | Exists; body differs from canvas simple RBAC table.                        |
| `/fleet`                             |        200 | Required      | Exists; large body not canvas parity despite covering some concepts.       |
| `/switchboard`                       |        200 | Required      | Exists; title/body still diverge from Public Info & Placards canvas.       |
| `/pricing`                           |        200 | Required      | Exists; body differs from canvas pricing tabs/version model.               |
| `/adapter-registry`                  |        200 | Required      | Exists; body is not canvas card-grid registry parity.                      |
| `/payments`                          |        200 | Required      | Exists; body partially close but reimbursement route split is missing.     |
| `/payments/reimbursements`           |        404 | Required      | **Missing route.**                                                         |
| `/payments/reimbursements/[batchId]` |        404 | Required      | **Missing route.**                                                         |
| `/health`                            |        200 | Required      | Exists; still old Health & Alerts shape, not canvas 5-tab Platform Health. |
| `/notices`                           |        200 | Required      | Exists; not canvas Notices/Maintenance/Broadcast History parity.           |
| `/audit`                             |        200 | Required      | Exists; title/body differ from Audit & Evidence Governance canvas.         |
| `/feature-flags`                     |        200 | Required      | Exists; closer than most, but not exact canvas body.                       |

## 5. Priority Model

- **P0:** Missing route or canvas acceptance blocker.
- **P1:** Existing route body must be rebuilt to match canvas.
- **P2:** Contract wiring, polish, test coverage, and visual verification needed after P0/P1.

## 6. Cross-Route Work Items

### P0. Restore the complete canvas route map

Implement the three missing routes:

- `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx`
- `apps/platform-admin-web/app/payments/reimbursements/page.tsx`
- `apps/platform-admin-web/app/payments/reimbursements/[batchId]/page.tsx`

Update shell/nav after reimbursement route creation:

- Add `代墊批次` / `Reimbursements` nav item under Platform & Commerce.
- Route `/payments` tab "Reimbursements ->" should navigate to `/payments/reimbursements`, not pretend this route is a local tab.

### P1. Standardize Platform Admin body primitives

Create or adopt a single Platform Admin page-body primitive set so all route bodies share the same canvas density and structure:

- Page header with title/subtitle/tabs/actions/meta.
- KPI row/cards matching the canvas grid.
- Canvas table density/columns/actions.
- Banner, pill, action button, detail list, stepper, timeline, secret modal.
- Consistent page padding: canvas body uses `padding: 24` with `gap: 16`.

This can live in `apps/platform-admin-web/components/platform-admin-canvas-*` or be promoted into `@drts/ui-web` if shared. The important part is not to mix `.admin-*`, `Management*`, and `Canvas*` ad hoc on the same app body.

### P1. Remove legacy body styling from Platform Admin pages

The following pages still need body conversion away from legacy/generic styles:

- `/health`
- `/audit`
- `/adapter-registry`
- parts of `/fleet`, `/users`, `/tenant-governance`

The root shell is fixed; this item is specifically about the body content inside `<main>`.

### P1. Use canvas-critical action patterns

Every page with state-changing CTAs needs `ActionButton` behavior driven by `availableActions[]`:

- Medium risk: modal confirm + audit receipt.
- High risk: modal confirm + required reason + audit receipt.
- Disabled actions: display `disabledReasonCode` cleanly, not dead buttons.

Critical high-risk examples:

- Tenant rollback hold.
- Partner credential issue/rotate/revoke.
- Pricing publish.
- Reimbursement approve/mark paid.
- Maintenance mode.
- Legal hold / deletion exception.
- Feature flag toggle / override.
- Adapter credential edit/rotate/disable.

### P2. Add route-level parity verification

Add Playwright smoke coverage for all 18 routes:

- route returns non-404
- one Platform Admin shell only
- correct page title
- required tabs visible
- required key body sections visible
- high-risk CTAs present where canvas requires them

Recommended artifact names:

- `platform-admin-home.png`
- `platform-admin-tenants.png`
- `platform-admin-tenant-detail.png`
- `platform-admin-reimbursements.png`
- `platform-admin-reimbursement-detail.png`
- and so on for all 18 routes.

## 7. Route-by-Route Audit

### 1. `/` Platform Home

Canvas target:

- Title `平台治理工作首頁`.
- Four KPI cards: active tenants, partner entries, active drivers, open reconciliation.
- `今日治理待辦` card with three banners: BGMT token expiry, GoCab sync_failed, tenant rollback_hold.
- `模組捷徑` card with six module shortcuts.
- `近期高敏感操作` audit table.

Current gaps:

- Existing home is conceptually similar but not canvas parity.
- KPI content/order/counts differ.
- Governance to-do copy and card hierarchy differ.
- Recent audit table does not match canvas columns and actor-type pill treatment.

Required implementation:

- Rebuild body to the exact canvas sections and ordering.
- Keep live data where available, but map it into the canvas card/table structure.
- Ensure shortcut cards link to route targets and preserve canvas icon/accent treatment.

Priority: **P1**

### 2. `/tenants`

Canvas target:

- Title `租戶`.
- Subtitle lifecycle wording.
- Tabs: all, production, pilot, sandbox, rollback hold with counts.
- Actions: filter, export, create tenant.
- Table columns: tenant, stage, gate, modules, monthly quota, integration, updated.
- Rows link to `/tenants/[tenantId]`.

Current gaps:

- Runtime route exists, but body does not match the canvas lifecycle table layout.
- Missing route drilldown makes row navigation incomplete.
- Needs tabbed stage filters and gate/readiness columns matching canvas.

Required implementation:

- Rebuild as tabbed lifecycle table.
- Add row link to new tenant detail route.
- Represent stage/gate/modules/quota/integration exactly as canvas columns.

Priority: **P1**, blocked by `/tenants/[tenantId]` P0 for complete flow.

### 3. `/tenants/[tenantId]`

Canvas target:

- Tenant detail rollout workspace.
- Tabs: overview, modules, onboarding, rollout, roles, webhook baseline, billing baseline, audit.
- Header action: open Tenant Console.
- High-risk action: enter rollback_hold with required reason.
- Rollout state-machine stepper.
- Onboarding package detail list.
- Roles & invites table.

Current gaps:

- Route is 404 on dev.

Required implementation:

- Create `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx`.
- Use tenant list row data / API client to load tenant detail.
- Implement rollout stepper, onboarding package, roles/invites.
- Wire high-risk rollback hold confirmation with required reason and audit receipt.

Priority: **P0**

### 4. `/tenant-governance`

Canvas target:

- Title `跨租戶治理`.
- Four KPI cards: quota warning, approval backlog, cost-center anomaly, risk signals.
- `Quota 使用熱圖` table with progress bars and threshold status pills.

Current gaps:

- Runtime route exists, but body is a different management dashboard with a broader detail/table structure.
- Missing canvas heatmap layout and exact KPI set.
- Remote census found no standard `h1`, so semantic/header parity also needs cleanup.

Required implementation:

- Replace/reshape body into canvas KPI row + heatmap table.
- Move deeper tenant drilldown/details behind tenant detail route or expandable row only if canvas-approved.
- Ensure quota warning thresholds use canvas progress-bar treatment.

Priority: **P1**

### 5. `/partners`

Canvas target:

- Title `合作夥伴 entry`.
- Actions: filter, create entry.
- Table columns: entry, program, subtype, auth, eligibility, status, readiness.
- Entry cell includes branded two-letter icon and slug.

Current gaps:

- Runtime has a much larger filter/create form workflow and extra panels.
- Table is close in spirit but not canvas parity in density/ordering/scope.
- Must ensure create flow is availableActions-driven, medium risk.

Required implementation:

- Rebuild default body to canvas table-first layout.
- Move complex create form into modal/drawer or a lower-priority expanded panel only if product wants it.
- Ensure row opens `/partners/[entrySlug]`.

Priority: **P1**

### 6. `/partners/[entrySlug]`

Canvas target:

- Title `${bank} · ${program}` with active status pill.
- Tabs: Overview, Branding, Auth, Eligibility, Credentials, Audit.
- Two-column layout:
  - Entry basic data detail list.
  - Readiness checklist.
  - Active credentials masked-only table.
- High-risk issue/rotate credential actions.
- Plaintext-once secret modal for Q-ADM07.

Current gaps:

- Runtime detail exists and is closer than many pages, but not confirmed body parity.
- Plaintext-once modal parity must be verified against canvas, including one-time reveal, scope, expiry, and acknowledgment behavior.
- Need ensure credentials are masked except modal reveal.

Required implementation:

- Align tabs, detail list, readiness card, and masked credentials table exactly to canvas.
- Implement or adjust plaintext-once modal as a first-class component.
- Add test that plaintext secret is only shown in the modal and not persisted in list/detail after acknowledgment.

Priority: **P1**

### 7. `/users`

Canvas target:

- Title `平台人員`.
- Subtitle `6 個角色 · RBAC 守門以後端為準`.
- Action: invite.
- Simple RBAC table: name, email, role, status, updated, actions.
- Row actions: update role, suspend, both driven by action descriptors.

Current gaps:

- Runtime route has KPI cards and a create/invite form workflow not present in canvas default body.
- Remote census found no standard `h1`.
- Needs canvas table-first body and row action treatment.

Required implementation:

- Rebuild default view as the canvas user table.
- Move invite form into modal/drawer.
- Ensure role labels use `pa_*` role codes with translation maps.

Priority: **P1**

### 8. `/fleet`

Canvas target:

- Title `車隊與合規治理`.
- Six tabs: Vehicles, Drivers, Contracts, Device Binding, Exclusivity Reviews, Offboarding.
- Vehicles table with ops deep-link action.
- Drivers tab warning banner and driver compliance table.
- Contracts table.
- Device binding table.
- Exclusivity Reviews tab with Q-ADM08 banner and approve/reject actions.
- Offboarding tab with Q-ADM09 state-machine stepper and active flow table.

Current gaps:

- Runtime is large and covers some workflows, but not canvas body parity.
- Current body has extensive forms and panels that do not match canvas ordering/density.
- Must verify exclusivity/offboarding state transitions are displayed as canvas stepper/table, not only forms.

Required implementation:

- Rebuild tab structure and default tab body to canvas.
- Keep existing forms only as modal/drawer flows behind canvas row/action buttons.
- Implement offboarding state-machine stepper exactly as canvas.
- Ensure exclusivity hard-rule banner is visible.

Priority: **P1**

### 9. `/switchboard`

Canvas target:

- Title `Public Info & Placards`.
- Subtitle mentions route name preserved as `/switchboard` and Q-ADM14 one public info version -> many placards.
- Tabs: versions, placards, history.
- Actions: create draft, publish version.
- Two-column body:
  - Public info versions table.
  - Current placard preview card with PDF/download/generate action.

Current gaps:

- Runtime title is still `交換台`.
- Body is not canvas Public Info & Placards parity.
- Needs explicit placard preview card and Q-ADM14 source lineage treatment.

Required implementation:

- Rename visible body title/subtitle to canvas.
- Rebuild tabs and two-column layout.
- Keep publish as high-risk required-reason action.
- Make placard generation medium-risk action tied to selected source public-info version.

Priority: **P1**

### 10. `/pricing`

Canvas target:

- Title `Pricing`.
- Tabs: Passenger Pricing, Driver Fee Plans, Subsidy / Reimbursement, Published Versions.
- Actions: create draft, publish.
- Info banner: backend is canonical quoted fare authority.
- Passenger pricing table + service bucket fee breakdown card.
- Driver fee plans table.
- Subsidy/reimbursement table.
- Published versions history table.

Current gaps:

- Runtime has a very large form-heavy page and title `計價`.
- Tab model and visible default body do not match canvas.
- Publish flow must be high-risk with required reason and audit receipt.

Required implementation:

- Rebuild default body to canvas tab layout.
- Move create/edit forms into modal/drawer or a lower section after table, not before canvas table.
- Implement publish modal and version replacement warning per Q-ADM10.
- Preserve existing pricing API calls but map results into canvas version/history tables.

Priority: **P1**

### 11. `/adapter-registry`

Canvas target:

- Title `External Platform Adapter Registry`.
- Danger banner for token expiry.
- Card grid, two columns, one card per adapter.
- Each card shows source, kind pill, status pill, latency, last event, orders 24h.
- Actions: edit credential, rotate, disable, ops pause TTL for forwarders.

Current gaps:

- Runtime route exists but is not canvas card-grid parity.
- It still uses generic `PageHeader` / `AdapterList` composition.
- Remote body includes `404` text in route census sample; this should be checked as a data/error rendering issue even though HTTP status is 200.

Required implementation:

- Rebuild page body as canvas danger banner + adapter card grid.
- Convert edit modal actions into canvas high-risk action buttons.
- Clearly separate platform-admin credential/config authority from ops pause/retry authority.
- Fix any 404 text shown inside the body unless it is a legitimate adapter status field.

Priority: **P1**

### 12. `/payments`

Canvas target:

- Title `結算治理`.
- Tabs: Settlement matrix, Tenant invoices, Driver statements, Reimbursements ->, Reconciliation issues.
- Four KPI cards: outstanding, diff total, avg handling, reopen rate.
- Reconciliation issues table with actions assign/resolve.
- Reimbursements tab is a link to separate route, not the full reimbursement queue.

Current gaps:

- Runtime body is partially close but contains many extra sections/forms below the canvas table.
- Reimbursement data is embedded in `/payments` instead of split into `/payments/reimbursements`.
- KPI values and table columns/actions need canvas parity.

Required implementation:

- Keep `/payments` focused on settlement/reconciliation.
- Move reimbursement batch queue and detail into dedicated routes.
- Ensure Reimbursements tab navigates to `/payments/reimbursements`.
- Use canvas reconciliation table/action density.

Priority: **P1**, with reimbursement split as **P0**.

### 13. `/payments/reimbursements`

Canvas target:

- Title `代墊批次 · Reimbursement batches`.
- Subtitle 6-state state machine: draft -> pending_approval -> approved -> exported -> paid -> reconciled.
- Tabs: all, pending approval, exported, done.
- Table columns: batch, scope, amount, state, submitter, submitted, updated.
- Rows drill to `/payments/reimbursements/[batchId]`.

Current gaps:

- Route is 404 on dev.

Required implementation:

- Create route and data loader.
- Pull current reimbursement table logic out of `/payments`.
- Add row links to batch detail.
- Add nav badge/item under Platform & Commerce.

Priority: **P0**

### 14. `/payments/reimbursements/[batchId]`

Canvas target:

- Header with batch id + state pill.
- Actions: copy comment, approve high-risk required reason.
- State-machine stepper for six states.
- Header detail list.
- State timeline derived from audit.
- Line item table.

Current gaps:

- Route is 404 on dev.

Required implementation:

- Create route and data loader.
- Implement stepper, detail list, audit timeline, line items.
- Wire approve/paid/reconciled actions from `availableActions[]`.

Priority: **P0**

### 15. `/health`

Canvas target:

- Title `Platform Health`.
- HealthBanner at content top when degraded.
- Tabs: Alerts, Dispatch, Webhook, Filing, Adapters.
- Four KPI cards: dispatch lag p95, webhook queue, eligibility queue, reporting failures 24h.
- Active alerts list.
- Adapter inventory table.

Current gaps:

- Runtime title is `健康與警示`.
- Body uses legacy `.admin-*` styling.
- Current route is mainly two tabs: workflow alerts and adapters.
- Missing canvas 5-tab model and KPI/alert/card ordering.

Required implementation:

- Rebuild body using canvas components.
- Keep route-level degraded banner only when page-critical dependencies degrade.
- Add Dispatch/Webhook/Filing tab content or placeholder states using `EmptyReason`.

Priority: **P1**

### 16. `/notices`

Canvas target:

- Title `Notices & Maintenance`.
- Tabs: Notices, Maintenance Mode, Broadcast History.
- Notices table.
- Maintenance tab: status card, toggle, reason/start/end fields, maintenance notice preview.
- Broadcast history table with cross-app targets/delivery.
- Critical/maintenance notices push cross-app banners.

Current gaps:

- Runtime body exists but is not canvas tab/body parity.
- Needs explicit Maintenance Mode and Broadcast History canvas layouts.
- High-risk maintenance action must require reason.

Required implementation:

- Rebuild with the three canvas tabs.
- Add maintenance preview card.
- Map publish/broadcast status to delivery table.
- Ensure notice severity and target audiences match Q-ADM15.

Priority: **P1**

### 17. `/audit`

Canvas target:

- Title `Audit & Evidence Governance`.
- Refresh tier T6 manual.
- Tabs: Audit log, Retention policies, Active legal holds, Deletion exceptions.
- Filter pill row with counts.
- Audit table with actor type pill and resource cell badges:
  - `HOLD` legal hold badge.
  - `EXEMPT` deletion exception badge.
- Legal hold and deletion exception summary cards.

Current gaps:

- Runtime title is `稽核軌跡`.
- Body uses legacy `.admin-*` styling and different section hierarchy.
- It has legal hold/deletion exception data, but not canvas badge-in-resource-cell treatment.
- Needs manual refresh affordance aligned with shell/body.

Required implementation:

- Rebuild body to the canvas audit table + filter pills + two summary cards.
- Add inline HOLD/EXEMPT resource badges with tooltips.
- Keep policy/holds/exceptions data but reorganize into canvas tabs.

Priority: **P1**

### 18. `/feature-flags`

Canvas target:

- Title `Feature Flags · WRITE authority`.
- Meta pill: writable only here.
- Action: add tenant override, high-risk required reason.
- Table columns: key, scope, state toggle, updated by, at, actions.
- Row actions: toggle, history.

Current gaps:

- Runtime is closer than many pages and already uses canvas primitives, but has extra guardrail/notes/scope cards not in the canvas default body.
- Needs exact title/meta/table/action placement parity.
- Toggle/override must be high-risk reason-required with audit receipt.

Required implementation:

- Tighten default body to the canvas table-first layout.
- Move extended guardrail explanatory content below or into collapsible help, unless design approves it.
- Ensure toggle/override behavior is descriptor-driven.

Priority: **P1**

## 8. Suggested Implementation Slices

### Slice A: Missing routes and navigation

Deliverables:

- `/tenants/[tenantId]`
- `/payments/reimbursements`
- `/payments/reimbursements/[batchId]`
- Reimbursement nav item and `/payments` tab link.

Acceptance:

- All 18 routes return HTTP 200 on dev.
- Row links from tenants and reimbursements work.

### Slice B: Legacy-to-canvas body conversion

Deliverables:

- Convert `/health`, `/audit`, `/adapter-registry`, `/users`, `/tenant-governance` away from legacy/generic bodies.

Acceptance:

- No `.admin-page-header`, `.admin-card`, `.admin-table`, `.admin-toggle-*` on Platform Admin route bodies.
- Canvas titles/tabs/cards/tables present.

### Slice C: Finance and commerce parity

Deliverables:

- `/pricing`
- `/payments`
- `/switchboard`
- reimbursement routes from Slice A refined.

Acceptance:

- Pricing has canvas four-tab version model.
- Payments has separate reimbursement queue/detail routes.
- Switchboard is Public Info & Placards with placard preview/source lineage.

### Slice D: Governance workflow parity

Deliverables:

- `/tenants`
- `/tenants/[tenantId]`
- `/partners`
- `/partners/[entrySlug]`
- `/fleet`

Acceptance:

- Tenant rollout stepper is present.
- Partner plaintext-once modal is implemented and tested.
- Fleet exclusivity/offboarding canvas state machines are present.

### Slice E: Cross-cutting action/contract wiring

Deliverables:

- `availableActions[]`-driven CTA rendering.
- `EmptyReason` rendering states.
- Action receipt toast with audit link.
- High-risk required-reason modal.
- Header search/notification integration where backend support exists.

Acceptance:

- Screen tests cover enabled/disabled/high-risk action rendering.
- Empty states render all six reasons distinctly.

## 9. Verification Checklist for Completion

Before claiming UI-FE-ADM complete:

- `pnpm --filter @drts/platform-admin-web lint`
- `pnpm --filter @drts/platform-admin-web typecheck`
- `pnpm --filter @drts/platform-admin-web build`
- Playwright route smoke for all 18 routes.
- Screenshot set for all 18 routes at 1440x950.
- Visual review against `Platform Admin.html` artboards.
- Remote dev deploy and remote Playwright smoke after deploy.

Minimum remote smoke assertions:

- every canvas route returns 200
- one Platform Admin shell only
- sidebar width 224px
- body title matches canvas
- required tabs present
- required key tables/cards present
- no legacy nested shell
- no legacy body CSS class on converted pages

## 10. Open Decisions

These should be resolved before coding large P1 bodies:

- Whether to keep extra operational forms currently embedded in runtime pages. Recommendation: move them into modals/drawers behind canvas actions unless design explicitly approves inline forms.
- Whether `Platform Admin.html` bilingual labels should be rendered as bilingual in zh locale or split by locale. Current shell uses zh primary only to avoid truncation; body audit should follow design/product decision.
- Whether missing backend contracts should be stubbed with fixtures first or implemented with backend work in the same slice. Recommendation: UI can use fixtures for visual parity, but CTA state must be shaped like `availableActions[]` from day one.

## 11. Current Status

As of this audit:

- Shell/menu: fixed and deployed in PR #485.
- Body parity: incomplete.
- Route parity: incomplete due to 3 missing routes.
- This document is the implementation backlog for completing Platform Admin UI-FE-ADM body parity.
