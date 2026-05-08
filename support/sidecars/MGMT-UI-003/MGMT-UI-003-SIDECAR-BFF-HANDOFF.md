# MGMT-UI-003 - BFF and Frontend Handoff Packet

- Sidecar Task: `MGMT-UI-003-SIDECAR-BFF-HANDOFF`
- Parent Task: `MGMT-UI-003` - Shared Management Shell And Surface Token Hardening
- Parent Status Snapshot: `done` as of `2026-05-08T16:02:42Z`
- Parent Owner / Reviewer: `Claude` / `Claude2`
- Parent Commit: `abaf01e29f76c288f73add308156b46d6d5ef142` - `MGMT-UI-003 Adopt shared management shell and surface tokens in app surfaces`
- Sidecar Owner / Reviewer: `Codex` / `Codex2`
- Date: `2026-05-08`
- Class: support / sidecar - does not mutate canonical truth
- Repair Note: this packet replaces the earlier stale draft that was incorrectly scoped to tenant/commute-hub material instead of the actual MGMT-UI-003 shared-shell target: `packages/ui-web`, `apps/platform-admin-web`, and `apps/ops-console-web`.

## Purpose

Capture the current shared-shell baseline, route/layout/nav inventory, concrete BFF/query gaps, and downstream carry-forward actions for the management-console shell wave after `MGMT-UI-003` landed.

This packet is execution context only. It does not reopen `MGMT-UI-003`, change product truth, or authorize runtime edits. It is meant to save the next owner from re-deriving:

- what the shared shell already standardized
- where the two apps still drift from that shell
- which detail routes are already wired vs. still list-filter based
- which BFF follow-ups belong in downstream slices rather than back in the shell task

## Canonical And Design Anchors

- Parent execution packet:
  `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md:177-199`
- Design review backlog:
  `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md:40,246,274-306`
- Parent machine-truth closeout:
  `ai-status.json:11786-11825`
- Shared shell/token baseline:
  - `packages/ui-web/src/management-theme.ts:15-143`
  - `packages/ui-web/src/management-shell.tsx:8-45`
  - `packages/ui-web/src/app-sidebar.tsx:22-127`
  - `packages/ui-web/src/page-header.tsx:19-47`
  - `packages/ui-web/src/index.tsx:5-45`
- App shell wiring:
  - `apps/platform-admin-web/app/layout.tsx:11-28`
  - `apps/platform-admin-web/components/admin-nav.tsx:24-113`
  - `apps/ops-console-web/app/layout.tsx:19-36`
  - `apps/ops-console-web/components/sidebar.tsx:24-129`
- Transport/auth seams:
  - `apps/platform-admin-web/app/control-plane-proxy/[...path]/route.ts:1-221`
  - `apps/ops-console-web/app/control-plane-proxy/[...path]/route.ts:1-221`
  - `apps/platform-admin-web/lib/admin-client.ts:13-46`
  - `apps/platform-admin-web/lib/platform-admin-client-factory.ts:14-30`
  - `apps/ops-console-web/lib/api-client.ts:20-69`
  - `apps/ops-console-web/lib/api-client.server.ts:41-83`
- API method inventory used below:
  `packages/api-client/src/index.ts:974-1116,1435-1830`

## Shared-Shell Inventory

### 1. What MGMT-UI-003 already standardized

| Area                          | Current artifact                                                                                                                                                           | Evidence                                                                                                                                                      |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Surface tokens                | Shared spacing, radius, typography, tone, and density helpers now live in `management-theme.ts`.                                                                           | `packages/ui-web/src/management-theme.ts:15-143`                                                                                                              |
| Main shell                    | `managementMainShellStyle()` provides the shared `main` container used by both apps.                                                                                       | `packages/ui-web/src/management-theme.ts:111-129`, `apps/platform-admin-web/app/layout.tsx:20-25`, `apps/ops-console-web/app/layout.tsx:28-33`                |
| Sidebar shell                 | Both apps now render through the same `AppSidebar` abstraction.                                                                                                            | `packages/ui-web/src/app-sidebar.tsx:22-127`, `apps/platform-admin-web/components/admin-nav.tsx:75-112`, `apps/ops-console-web/components/sidebar.tsx:89-128` |
| Active nested-route highlight | `AppSidebar` marks a nav item active when `currentPath === href` or `currentPath.startsWith(href + "/")`, so deep routes inherit parent highlight without app-local logic. | `packages/ui-web/src/app-sidebar.tsx:82-109`                                                                                                                  |
| Page-header spacing           | `PageHeader` now reads tokenized `pageHeaderMarginBottom` through `densityValue()`.                                                                                        | `packages/ui-web/src/page-header.tsx:35-45`                                                                                                                   |
| Future-ready shell wrappers   | `ManagementShell` and `ManagementPageStack` were extracted and exported.                                                                                                   | `packages/ui-web/src/management-shell.tsx:14-45`, `packages/ui-web/src/index.tsx:10-24`                                                                       |

### 2. Shared management primitives already available for downstream adoption

These are already in `packages/ui-web`, so downstream app tasks should use them instead of creating another visual sub-system:

- `SectionHeader` - `packages/ui-web/src/management-primitives.tsx:77`
- `KpiCard` / `KpiRow` - `packages/ui-web/src/management-primitives.tsx:176,236`
- `FilterPill` / `FilterPillRow` - `packages/ui-web/src/management-primitives.tsx:263,315`
- `WorkflowPanel` - `packages/ui-web/src/management-primitives.tsx:523`
- `CalloutBanner` - `packages/ui-web/src/management-primitives.tsx:810`
- `StatusChip` - `packages/ui-web/src/management-primitives.tsx:845`
- `Stepper` - `packages/ui-web/src/management-primitives.tsx:922`
- `Timeline` - `packages/ui-web/src/management-primitives.tsx:1132`

### 3. Shell edges that are still app-specific

- Brand copy, icon, and nav schema remain app-owned, not shared-package-owned:
  `apps/platform-admin-web/components/admin-nav.tsx:29-72`,
  `apps/ops-console-web/components/sidebar.tsx:29-87`
- Transport/auth stays app-specific even though the shell is shared:
  `platform_admin` auth is stamped in the platform-admin control-plane proxy,
  while `ops_user` auth is stamped in the ops-console proxy.
- No shared topbar abstraction exists. The current reusable shell is effectively:
  left rail + main content area + per-page header/components.

## Route, Layout, And Navigation Inventory

### Platform Admin

Primary layout and navigation:

- Layout renders `AdminNav` plus `main style={managementMainShellStyle()}`:
  `apps/platform-admin-web/app/layout.tsx:19-25`
- Left-rail routes are:
  `/`, `/tenants`, `/partners`, `/users`, `/fleet`, `/switchboard`,
  `/pricing`, `/payments`, `/health`, `/notices`, `/audit`,
  `/feature-flags`, `/adapter-registry`
  from `apps/platform-admin-web/components/admin-nav.tsx:29-72`

Actual page routes present in repo:

- Top-level routes:
  `apps/platform-admin-web/app/page.tsx`
  `apps/platform-admin-web/app/tenants/page.tsx`
  `apps/platform-admin-web/app/partners/page.tsx`
  `apps/platform-admin-web/app/users/page.tsx`
  `apps/platform-admin-web/app/fleet/page.tsx`
  `apps/platform-admin-web/app/switchboard/page.tsx`
  `apps/platform-admin-web/app/pricing/page.tsx`
  `apps/platform-admin-web/app/payments/page.tsx`
  `apps/platform-admin-web/app/health/page.tsx`
  `apps/platform-admin-web/app/notices/page.tsx`
  `apps/platform-admin-web/app/audit/page.tsx`
  `apps/platform-admin-web/app/feature-flags/page.tsx`
  `apps/platform-admin-web/app/adapter-registry/page.tsx`
- Deep route already present:
  `apps/platform-admin-web/app/payments/reconciliation/[issueId]/page.tsx`

Operator drill paths already wired:

- Home launcher cards route from `/` into the main governance modules:
  `apps/platform-admin-web/app/page.tsx:10-118`
- `payments` links into the deep reconciliation detail route through row actions:
  `apps/platform-admin-web/app/payments/page.tsx:1291-1296`
- Because the shared sidebar matcher understands nested paths, the deep route keeps
  `/payments` highlighted without extra code:
  `packages/ui-web/src/app-sidebar.tsx:82-109`

Important shell mismatch to carry forward:

- The home launcher cards currently omit `/adapter-registry` even though the left
  nav includes it.
  Compare `apps/platform-admin-web/app/page.tsx:10-66` with
  `apps/platform-admin-web/components/admin-nav.tsx:66-71`.

### Ops Console

Primary layout and navigation:

- Layout renders `Sidebar` plus `main style={managementMainShellStyle()}`:
  `apps/ops-console-web/app/layout.tsx:27-33`
- Root route redirects directly to `/dashboard`:
  `apps/ops-console-web/app/page.tsx:1-4`
- Left-rail routes are:
  `/dashboard`, `/dispatch`, `/complaints`, `/callcenter`, `/reports`,
  `/revenue`, `/attendance`, `/incidents`, `/maintenance`, `/vehicles`,
  `/drivers`, `/contracts`, `/feature-flags`
  from `apps/ops-console-web/components/sidebar.tsx:29-87`

Actual page routes present in repo:

- `apps/ops-console-web/app/dashboard/page.tsx`
- `apps/ops-console-web/app/dispatch/page.tsx`
- `apps/ops-console-web/app/callcenter/page.tsx`
- `apps/ops-console-web/app/complaints/page.tsx`
- `apps/ops-console-web/app/incidents/page.tsx`
- `apps/ops-console-web/app/reports/page.tsx`
- `apps/ops-console-web/app/revenue/page.tsx`
- `apps/ops-console-web/app/attendance/page.tsx`
- `apps/ops-console-web/app/maintenance/page.tsx`
- `apps/ops-console-web/app/drivers/page.tsx`
- `apps/ops-console-web/app/drivers/[driverId]/page.tsx`
- `apps/ops-console-web/app/vehicles/page.tsx`
- `apps/ops-console-web/app/contracts/page.tsx`
- `apps/ops-console-web/app/feature-flags/page.tsx`

Operator drill paths already wired:

- Dashboard quick links already point operators into
  `/dispatch`, `/revenue`, `/incidents`, `/maintenance`, and `/reports`:
  `apps/ops-console-web/app/dashboard/page.tsx:373-378`
- Driver registry rows already link into `/drivers/[driverId]`:
  `apps/ops-console-web/app/drivers/page.tsx:192-199`
- Shared sidebar nested matching means `/drivers/[driverId]` keeps `/drivers`
  highlighted automatically:
  `packages/ui-web/src/app-sidebar.tsx:82-109`

## Transport And BFF Inventory

### 1. Current transport split is intentional

Platform Admin:

- Almost every route page is a client component and talks through
  `usePlatformAdminClient()`.
- The client factory rewrites `/api/...` paths when the runtime base URL points at
  `/control-plane-proxy`, so the page code remains agnostic to direct-vs-proxy
  transport:
  `apps/platform-admin-web/lib/admin-client.ts:13-46`,
  `apps/platform-admin-web/lib/platform-admin-client-factory.ts:6-30`

Ops Console:

- The app is mixed:
  - server-rendered read-heavy pages such as `dashboard`, `dispatch`,
    `drivers`, `drivers/[driverId]`, `revenue`, `vehicles`, `contracts`
  - client-heavy workflow pages such as `callcenter`, `complaints`,
    `incidents`, `maintenance`, `reports`
- Server reads go through `getServerOpsClient()` and client workflows go through
  `getOpsClient()` / `createOpsDispatchEventSource()`:
  `apps/ops-console-web/lib/api-client.server.ts:41-83`,
  `apps/ops-console-web/lib/api-client.ts:20-69`

Carry-forward implication:

- Do not try to "finish" shell sharing by collapsing the two apps onto one auth
  or fetch strategy. Shared shell UI and shared auth transport are different
  layers.

### 2. Current focused APIs that already exist

No shell-only BFF change is required for left-nav or layout work. The biggest
admin shell routes already have targeted methods in `@drts/api-client`:

- tenants:
  `listPlatformTenants()`, `getPlatformTenant()`,
  `updatePlatformTenantSettings()`, `updatePlatformTenantOnboarding()`,
  `setPlatformTenantRolloutStage()`
  at `packages/api-client/src/index.ts:1524-1663`
- users:
  `listPlatformAdminUsers()`, `createPlatformAdminUser()`,
  `updatePlatformAdminUserRole()`
  at `packages/api-client/src/index.ts:1665-1685`
- notices and maintenance:
  `listPlatformNotices()`, `createPlatformNotice()`,
  `resolvePlatformNotice()`, `getMaintenanceMode()`, `setMaintenanceMode()`
  at `packages/api-client/src/index.ts:1687-1717`
- adapters:
  `listPlatformAdapters()`, `getPlatformAdapter()`, `updatePlatformAdapter()`
  at `packages/api-client/src/index.ts:1795-1810`

### 3. Concrete query gaps still visible in the live routes

| Surface                              | Current behavior                                                                                                                                                                           | Evidence                                                                                                                                                  | Carry-forward recommendation                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ops driver detail                    | Page loads `listDrivers()`, `listDriverLocations()`, `getPlatformPresence({ driverId })`, `listForwarderOrders()`, and `listDriverStatements()`, then filters several lists by `driverId`. | `apps/ops-console-web/app/drivers/[driverId]/page.tsx:193-281` plus method definitions at `packages/api-client/src/index.ts:974-1116,1443-1445,1820-1829` | Add focused reads before the next detail-wave task: `getDriver(driverId)`, `getDriverLocation(driverId)`, filtered statements/orders, or a composed driver-detail read model. |
| Ops driver list                      | Page loads the full driver registry and the full location snapshot list, then joins them in-memory.                                                                                        | `apps/ops-console-web/app/drivers/page.tsx:74-91`                                                                                                         | Acceptable for current shell work, but if registry volume grows, consider a summary endpoint or embedding latest location state into the driver list read model.              |
| Platform-admin reconciliation detail | Detail route loads full issue, invoice, statement, reimbursement, and settlement lists, then finds the issue by `issueId`.                                                                 | `apps/platform-admin-web/app/payments/reconciliation/[issueId]/page.tsx:92-128`                                                                           | Add `getReconciliationIssue(issueId)` and consider a focused "linked finance refs" read if the detail page stays route-backed.                                                |
| Future partner detail route          | API client has `listPlatformPartnerEntries()` and credential list endpoints, but no single-entry getter today.                                                                             | `packages/api-client/src/index.ts:1530-1617`                                                                                                              | Before `ADM-UI-006` expands a partner detail route, add `getPlatformPartnerEntry(entrySlug)` or an equivalent targeted read.                                                  |
| Future tenant detail route           | The targeted getter already exists, but the current top-level page still behaves like a list-plus-inline-edit surface.                                                                     | `packages/api-client/src/index.ts:1637-1643`, `apps/platform-admin-web/app/tenants/page.tsx:167-196`                                                      | Use `getPlatformTenant()` as the detail-route source of truth instead of carrying list-selected state into `/tenants/[tenantId]`.                                             |

## Shared Primitive And Token Drift

### High-signal drift items

| Severity | Drift                                                                                                                 | Evidence                                                                                                                                                           | Why it matters                                                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Platform Admin still carries a second visual system through `admin-*` CSS and `MgmtComponents`.                       | `apps/platform-admin-web/app/globals.css:3-219`, `apps/platform-admin-web/components/mgmt/MgmtComponents.tsx:1-260`                                                | Shared shell is now real, but page surfaces can still drift because many admin pages are not using the shared management primitives at all. |
| Medium   | `ManagementShell` and `ManagementPageStack` are exported but currently unused outside `packages/ui-web`.              | Repo search on `2026-05-08` found no app import sites outside `packages/ui-web`.                                                                                   | Page spacing, section rhythm, and density are still often hand-rolled per page.                                                             |
| Medium   | Density is modeled in tokens, but both apps call `managementMainShellStyle()` with the default comfortable mode only. | `packages/ui-web/src/management-theme.ts:11-27,111-129`, `apps/platform-admin-web/app/layout.tsx:24`, `apps/ops-console-web/app/layout.tsx:32`                     | The design pack asks for dense management surfaces; the abstraction exists, but app pages do not thread it yet.                             |
| Medium   | Several exported primitives still hardcode surface values instead of reading shared token helpers.                    | `packages/ui-web/src/card.tsx:8-40`, `packages/ui-web/src/stat-card.tsx:11-63`, `packages/ui-web/src/badge.tsx:20-48`, `packages/ui-web/src/data-table.tsx:31-151` | Downstream pages using these components can remain visually close to the shell while still bypassing the token source of truth.             |
| Low      | Platform Admin home launcher and left rail are out of sync.                                                           | `apps/platform-admin-web/app/page.tsx:10-66`, `apps/platform-admin-web/components/admin-nav.tsx:29-72`                                                             | New shell users can miss `/adapter-registry` unless they rely on the rail instead of the home page.                                         |
| Low      | Locale-toggle footer code is duplicated in both nav components.                                                       | `apps/platform-admin-web/components/admin-nav.tsx:81-111`, `apps/ops-console-web/components/sidebar.tsx:96-126`                                                    | Not a correctness bug, but any footer-shell refinement must be changed twice.                                                               |

### Concrete page examples of drift

- Platform Admin pages still primarily render `admin-page-header`, `admin-card`,
  and `admin-table` patterns instead of `PageHeader`, `KpiRow`, `CalloutBanner`,
  `FilterPillRow`, or `StatusChip`:
  `users`, `tenants`, `partners`, `pricing`, `payments`, `health`,
  `notices`, `audit`, `feature-flags`, `switchboard`, `fleet`
- Ops Console uses the shared shell and `PageHeader` broadly, but several pages
  still rely on older `StatCard` / `Card` / `Badge` / inline-style compositions:
  `dashboard`, `dispatch`, `revenue`, `contracts`, `drivers/[driverId]`

This is not a reason to reopen MGMT-UI-003. It is a handoff note for downstream
owners so they stop adding new one-off surface systems while working inside
`MGMT-UI-004`, `MGMT-UI-005`, and the app-level route tasks.

## Carry-Forward Actions

1. Keep the current shell base as-is: `AppSidebar` plus `managementMainShellStyle()`
   is the landed anti-drift foundation. Do not fork a second shell wrapper per app.
2. When a downstream route is touched, prefer `ManagementPageStack`,
   `SectionHeader`, `KpiRow`, `KpiCard`, `FilterPillRow`, `CalloutBanner`,
   `StatusChip`, `WorkflowPanel`, and `Timeline` from
   `packages/ui-web/src/management-primitives.tsx` instead of adding more
   page-local cards or badges.
3. Retire `apps/platform-admin-web/components/mgmt/MgmtComponents.tsx` and the
   `admin-*` CSS classes opportunistically as app tasks rewrite those pages.
   Do not extend that legacy system.
4. Before deep detail-route work expands, negotiate focused BFF reads for:
   - reconciliation issue detail
   - driver detail aggregation
   - future partner detail
     Reuse `getPlatformTenant()` for tenant detail rather than inventing new list
     filtering on the detail route.
5. Preserve the current auth split:
   - `platform_admin` stays on the platform-admin proxy/client path
   - `ops_user` stays on the ops-console proxy/client path
     Shared shell UI is not a reason to merge actor identity rules.
6. If dense mode becomes a requirement on a downstream page, thread the existing
   `density` model through the shell/page-header primitives rather than minting
   new spacing constants in app CSS.
7. If Platform Admin home continues to act as a launcher, add `/adapter-registry`
   to its shortcut grid so launcher and left rail expose the same top-level modules.

## Reviewer Checklist

- Confirm this packet is now scoped to the actual MGMT-UI-003 shared-shell target:
  `packages/ui-web`, `apps/platform-admin-web`, and `apps/ops-console-web`.
- Confirm the packet distinguishes landed shell work from downstream route/BFF
  follow-up work.
- Confirm no canonical truth, runtime auth logic, or production code is modified
  by this sidecar artifact.
- Confirm the packet includes all four requested evidence groups:
  shell inventory, route/layout/nav references, shared primitive/token gaps, and
  parent carry-forward actions.

Approve with:

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve MGMT-UI-003-SIDECAR-BFF-HANDOFF \
  "Reviewed: packet now targets the actual MGMT-UI-003 shared-shell surfaces with concrete shell, route, nav, token-drift, and BFF carry-forward evidence only."
```

Reopen with:

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen MGMT-UI-003-SIDECAR-BFF-HANDOFF \
  "<reason>"
```

## Evidence Inventory

- Sidecar artifact:
  `support/sidecars/MGMT-UI-003/MGMT-UI-003-SIDECAR-BFF-HANDOFF.md`
- Parent machine-truth snapshot:
  `ai-status.json:11786-11825`
- Sidecar machine-truth snapshot:
  `ai-status.json:12426-12449`
- Route inventory source:
  filesystem snapshot under
  `apps/platform-admin-web/app` and `apps/ops-console-web/app`
- Shared package inventory source:
  `packages/ui-web/src/*`
- API method inventory source:
  `packages/api-client/src/index.ts`

Support artifact refreshed by `Codex` on `2026-05-08`. No canonical truth or runtime code changed by this packet.
