# ADM-UI-004 — BFF and Frontend Handoff Packet

- Sidecar Task: `ADM-UI-004-SIDECAR-BFF-HANDOFF`
- Parent Task: `ADM-UI-004` (Health, Notices, Audit, Flags, And Adapter Registry Alignment)
- Parent Owner: `Codex`
- Parent Reviewer: `Codex2`
- Sidecar Owner: `Codex2`
- Sidecar Reviewer: `Claude2`
- Date: 2026-05-08
- Validation Status: Re-verified against current page implementations and
  `packages/api-client/src/index.ts` on 2026-05-08 after availability-first
  reassignment.
- Class: support / sidecar — does not mutate canonical truth

## Purpose

Compile BFF query inventory, frontend operator journeys, and the carry-forward
materials the parent owner needs to continue ADM-UI-004 without re-deriving
contracts, route boundaries, or shared primitives. The packet reads the current
state of the five governance surfaces (`/health`, `/notices`, `/audit`,
`/feature-flags`, `/adapter-registry`), maps each surface to the available
`@drts/api-client` methods, and lists the gaps the parent owner must either
absorb, escalate, or design around.

This document is execution-oriented context. It does not replace canonical
truth in `phase1_*` documents, the design execution packet at
`docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`,
or the management-UI design review at
`docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`.

Reassignment note: the packet was originally drafted before the supervisor
reassigned this sidecar. `Codex` refreshed the content during review repair,
and the current owner (`Codex2`) is closing out that reviewer-approved
revision against the same checked-in platform-admin pages and API-client
surface.

## Canonical Anchors

- Design execution packet:
  `docs/03-runbooks/platform-admin-ops-console-design-execution-packet-20260508.md`
  (ADM-UI-004 section spans lines 326–351; design pack line refs UI-PA-11..15)
- Design review backlog:
  `docs/05-ui/drts-management-ui-review-execution-tasks-20260508.md`
  (UI-PA-11..15 rows define the design intent for these five surfaces)
- Shared primitives baseline: `packages/ui-web/src/management-primitives.tsx`
  (delivered through `MGMT-UI-001`; sidebar/shell extensions are still landing
  through `MGMT-UI-003`/`004`/`005`)
- BFF proxy entry:
  `apps/platform-admin-web/app/control-plane-proxy/[...path]/route.ts`
  (forwards to `${DRTS_API_URL}/api/...` and stamps platform-admin auth via
  `@drts/control-plane-auth`)
- Client factory hook:
  `apps/platform-admin-web/lib/admin-client.ts` (`usePlatformAdminClient()`)
  and `apps/platform-admin-web/lib/platform-admin-client-factory.ts`
- Backend authority modules already in place:
  - `apps/api/src/modules/operational-observability/`
  - `apps/api/src/modules/audit/` and evidence governance helpers
  - `apps/api/src/modules/platform-admin/` (notices, maintenance, adapters)
  - `apps/api/src/modules/forwarder/` (`/api/forwarder/adapters/health`)

## Authority Guardrails

These guardrails were already accepted in the design execution packet and the
phase-1 service contracts. They are restated here so the parent owner does not
re-decide them under design pressure:

- Audit is append-only; the frontend may only read and filter. Retention,
  legal hold, and deletion-exception writes route through dedicated audit
  endpoints, not through the audit page.
- Maintenance mode and notices are platform-issued. The frontend submits
  commands; it does not store local-only "draft" maintenance state.
- Feature flag writes are scoped governance; tenant-override editing is _not_
  in scope for `ADM-UI-004`. The page must remain platform-issued and global,
  with tenant overrides shown read-only when present.
- Adapter registry is the truth surface for adapter rollout/credential state.
  It must not duplicate the forwarder adapter health table; the design pack
  treats the two as distinct (registry = inventory and rollout posture,
  health = live operational status with last-check timestamps).
- Status chips, KPI rows, filter pills, dense tables, callout banners, and
  the workflow detail blocks must come from
  `packages/ui-web/src/management-primitives.tsx`. Page-local one-off
  implementations of these must be removed when touched, not extended.

## Surface-By-Surface Operator Journey

Each subsection captures: (1) the design intent, (2) the current page
implementation in `apps/platform-admin-web/app/<route>/page.tsx`, and (3) the
BFF call surface available to the page through `usePlatformAdminClient()`.

### 1. `/health` — Alert inventory + adapter visibility

Design intent (UI-PA-11): governance-first alert + adapter view. KPI strip,
sortable alert list with severity, measured value, and threshold context, and
a sibling adapter inventory pane that links back to the adapter registry.

Current page (`apps/platform-admin-web/app/health/page.tsx`):

- Two-tab toggle (`alerts`, `adapters`).
- Alerts tab pulls
  `client.getOperationalObservability(): OperationalObservabilitySnapshot`
  and filters to `roleViews[route='platform']` plus alerts that include
  `platform` in `alert.routes`.
- Adapter tab pulls `client.getForwarderAdaptersHealth()` and renders adapter
  status / last check / last error.
- KPI cards summarize dispatch lag, webhook failures, eligibility queue,
  reporting jobs, and adapter degradation counts directly from the
  observability snapshot.

Available BFF queries:

| Need                             | Method                          | Path                                 |
| -------------------------------- | ------------------------------- | ------------------------------------ |
| Operational alerts + KPI metrics | `getOperationalObservability()` | `GET /api/operational-observability` |
| Forwarder adapter health table   | `getForwarderAdaptersHealth()`  | `GET /api/forwarder/adapters/health` |

BFF gaps for ADM-UI-004:

- `OperationalObservabilitySnapshot.roleViews` already encodes the
  `platform` vs `ops` partition. The page does not need a new endpoint to
  produce a "platform-only" alert list — keep using the existing snapshot.
- The design pack asks for "drill targets" from each adapter status row.
  Today the adapter row exposes `adapterId`, `status`, `lastCheckedAt`,
  `lastError`. Linking into `/adapter-registry/<id>` requires the adapter
  registry detail route (out of scope here; tracked under
  `ADM-UI-001` follow-on if the adapter registry adopts a detail page).
- Threshold metadata for KPI cards is already in
  `OperationalObservabilitySnapshot.alerts[i].thresholds` (warning, critical,
  unit). No new BFF call required to show threshold context — the page just
  needs to consume it instead of hardcoding card labels.

Carry-forward for parent owner:

- Reuse `KpiRow` + `KpiCard` from
  `packages/ui-web/src/management-primitives.tsx` for the metric strip
  rather than the current `admin-card` div grid.
- Replace the bespoke alert table with the shared dense table styles and
  `StatusChip` from the same module so severity language matches Notices,
  Audit, Adapter Registry, and Ops Console health surfaces.
- The design pack expects the adapter sub-view to read like an inventory
  preview that links to `/adapter-registry`; do not duplicate the registry
  rollout/credential columns into the health page.

### 2. `/notices` — Notices + maintenance mode

Design intent (UI-PA-12): a single page where platform staff can publish
notices, target specific audiences, set maintenance mode windows, and see the
currently active maintenance reason as a banner.

Current page (`apps/platform-admin-web/app/notices/page.tsx`):

- `notices` tab — list, severity filter (info/warning/critical), audience
  selector (all/tenants/ops/drivers), inline create form, resolve action.
- `maintenance` tab — read-out of current `enabled`, `reason`, `updatedAt`;
  toggle + reason form; submit applies the mode change.
- A red banner appears at the top of the page when maintenance is active.

Available BFF queries:

| Need                 | Method                            | Path                                            |
| -------------------- | --------------------------------- | ----------------------------------------------- |
| List notices         | `listPlatformNotices()`           | `GET /api/platform-admin/notices`               |
| Create notice        | `createPlatformNotice(command)`   | `POST /api/platform-admin/notices`              |
| Resolve notice       | `resolvePlatformNotice(noticeId)` | `POST /api/platform-admin/notices/{id}/resolve` |
| Get maintenance mode | `getMaintenanceMode()`            | `GET /api/platform-admin/maintenance-mode`      |
| Set maintenance mode | `setMaintenanceMode(command)`     | `POST /api/platform-admin/maintenance-mode`     |

BFF gaps for ADM-UI-004:

- Scheduling is already supported in the contracts: `CreatePlatformNoticeCommand`
  exposes `scheduledAt`, and `SetPlatformMaintenanceModeCommand` exposes
  `scheduledStart` / `scheduledEnd`. The current page does not surface or send
  those fields, so the gap is frontend form/wiring work, not a backend command
  extension. Do **not** regress to local-only scheduling state while adding
  the missing controls.
- The list/read models already carry scheduled notice/maintenance state, but
  the current page copy and forms read like immediate-only actions. The parent
  owner needs to decide whether ADM-UI-004 adds scheduling inputs now or keeps
  the current narrow UX and explicitly documents the omission.
- Audience targeting beyond `all|tenants|ops|drivers` is not supported by the
  command. The design's per-tenant or per-rollout-cohort targeting is out of
  scope for this slice.

Carry-forward for parent owner:

- Use `WorkflowPanel` + `CalloutBanner` from `management-primitives.tsx` for
  the active-maintenance banner. The current inline red div should be retired
  the next time the page is touched.
- Use `FilterPillRow` + `FilterPill` for severity and status filters when
  rebuilding the notice list to align with Audit and Adapter Registry.

### 3. `/audit` — Append-only log + evidence governance

Design intent (UI-PA-13): audit log with per-module, per-actor filtering plus
sibling sections for retention policies, active legal holds, and active
deletion exceptions. Detail expansion shows old/new value summaries.

Current page (`apps/platform-admin-web/app/audit/page.tsx`):

- Top filter row: module + actor type, refresh button.
- KPI strip: policy families count, signed-download families, active legal
  holds, active deletion exceptions.
- Retention policies table with family, authority module, retention days,
  download mode, legal-hold support flag.
- Two side-by-side governance cards for active legal holds and active
  deletion exceptions.
- Audit log table with expand-on-click row showing
  `oldValuesSummary` / `newValuesSummary` JSON.

Available BFF queries:

| Need                                 | Method                                                   | Path                                                                              |
| ------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| List audit records                   | `listAuditLogs()`                                        | `GET /api/audit`                                                                  |
| List retention policies              | `listEvidencePolicies()`                                 | `GET /api/audit/evidence-policies` (returns `EvidenceGovernanceCatalog.policies`) |
| Get one policy                       | `getEvidencePolicy(family)`                              | `GET /api/audit/evidence-policies/{family}`                                       |
| Subject-scoped governance lookup     | `getEvidenceSubjectGovernance(family, subjectId, opts?)` | `GET /api/audit/evidence-governance/{family}/{subjectId}`                         |
| List active + historical legal holds | `listEvidenceLegalHolds()`                               | `GET /api/audit/legal-holds`                                                      |
| Place legal hold                     | `placeEvidenceLegalHold(command)`                        | `POST /api/audit/legal-holds`                                                     |
| Release legal hold                   | `releaseEvidenceLegalHold(holdId, command)`              | `POST /api/audit/legal-holds/{id}/release`                                        |
| List deletion exceptions             | `listEvidenceDeletionExceptions()`                       | `GET /api/audit/deletion-exceptions`                                              |
| Register deletion exception          | `registerEvidenceDeletionException(command)`             | `POST /api/audit/deletion-exceptions`                                             |
| Resolve deletion exception           | `resolveEvidenceDeletionException(id, command)`          | `POST /api/audit/deletion-exceptions/{id}/resolve`                                |

BFF gaps for ADM-UI-004:

- The audit list endpoint returns the latest records but exposes neither
  pagination nor server-side time-range filters in the current
  `listAuditLogs()` signature. The frontend does only client-side filtering
  on `module` and `actor`. For volume realism, paginated audit retrieval is
  out of ADM-UI-004 scope and would require a contract extension; flag this
  as carry-forward to the audit module owner.
- The current `listAuditLogs()` returns `unknown[]`; the page coerces fields
  defensively. Type-tightening to `AuditLogRecord[]` is a small contract
  win the parent owner can pair with this slice if `Codex`/contracts agree.
- `placeEvidenceLegalHold` / `registerEvidenceDeletionException` /
  `resolveEvidenceDeletionException` already exist but are not wired into
  the page. The design review (UI-PA-13) calls for "evidence-governance
  framing" — the page is read-only for these governance objects today.
  Evidence-governance write surfaces are an authority decision; treat them
  as a separate slice rather than scope creep into ADM-UI-004 unless the
  parent owner explicitly negotiates that with Codex/Copilot.

Carry-forward for parent owner:

- The bespoke `AuditMetricCard`/`GovernanceTableCard`/`AuditValueCard`
  helpers in this page predate `MGMT-UI-001`. Replace them with `KpiRow`,
  dense `admin-table` styling, and `DetailMetadataGrid` from
  `management-primitives.tsx` so the audit surface stops drifting from the
  shared visual language.
- Keep the JSON expansion of `oldValuesSummary` / `newValuesSummary` —
  it is the backend-issued canonical summary and must not be reformatted
  client-side beyond pretty-printing.

### 4. `/feature-flags` — Platform-issued governance

Design intent (UI-PA-14): scope-clarity oriented governance. Show flag key,
description, owner/updated metadata, scope (global vs tenant override),
and a safe toggle UX.

Current page (`apps/platform-admin-web/app/feature-flags/page.tsx`):

- Filter toggles: all / enabled / disabled.
- Table columns: flag, status badge, description, tenant override badge,
  updated timestamp, toggle action.
- Toggle calls `client.updateFeatureFlag(key, !flag.enabled)` then re-fetches.

Available BFF queries:

| Need              | Method                                  | Path                           |
| ----------------- | --------------------------------------- | ------------------------------ |
| Read flag summary | `getFeatureFlags(): FeatureFlagSummary` | `GET /api/admin/flags`         |
| Toggle flag       | `updateFeatureFlag(key, enabled)`       | `PATCH /api/admin/flags/{key}` |

BFF gaps for ADM-UI-004:

- The current `FeatureFlag` shape includes `tenantId` for overrides, but the
  page currently only renders the override as an info badge. There is no
  dedicated endpoint to _list_ per-flag overrides for governance review;
  tenant overrides surface only when the same key returns multiple records.
  This is acceptable for ADM-UI-004 because tenant-override editing is out
  of scope (per design pack — keep platform issuance read-only for tenant
  overrides). Flag this as a known limitation in the verification packet.
- "Owner" metadata called out in the design review (UI-PA-14) is not present
  in the contract today. Without a contract extension to add `ownerTeam` /
  `ownerEmail` to `FeatureFlag`, the page can only show description + scope
  - last-updated. Decide with Codex whether the contract gets an additive
    `ownerTeam` field as part of this slice or a follow-up.

Carry-forward for parent owner:

- Reuse `StatusChip` for enabled/disabled and tenant-override badges so the
  language matches the rest of the governance pages.
- Wrap the bare HTML toggle in a confirmation step using `WorkflowCallout`
  - `CalloutBanner` so the safe-toggle framing the design demands is real,
    not just visual. Toggle-without-confirm on global flags is the obvious
    governance hazard the design pack is calling out.

### 5. `/adapter-registry` — Inventory + rollout posture

Design intent (UI-PA-15): denser registry with per-adapter rollout state,
credential state, webhook posture, environment, version. The card-style
prototype in the design archive is the visual target; the existing list is
already close, so most of the work is alignment to shared primitives.

Current page (`apps/platform-admin-web/app/adapter-registry/page.tsx` +
`components/AdapterList.tsx`):

- `page.tsx` is already wrapped with shared `PageHeader` copy and
  `AdapterList.tsx` renders through `DataViewCard`, `DataFilterBar`,
  `DataTable`, `StatusChip`, and `AuthorityBadge` from `@drts/ui-web`.
- Filters are already split into `all`, `forwarded`, `enabled`, and
  `attention`, with rows highlighting non-healthy / invalid / failed
  adapters.
- Table rows currently show name + platform code + type, environment +
  version + rollout stage, enabled/health/webhook chips, finance authority
  badges, rollout and credential posture, and an edit action.
- Edit modal calls `apiClient.updatePlatformAdapter(id, command)` and
  refreshes the list locally.
- Notably uses a _separately-instantiated_ `ApiClient({ baseUrl: "" })`
  rather than the shared `usePlatformAdminClient()` hook — this is a
  pre-existing inconsistency from `ADM-UI-001`.

Available BFF queries:

| Need           | Method                               | Path                                      |
| -------------- | ------------------------------------ | ----------------------------------------- |
| List adapters  | `listPlatformAdapters()`             | `GET /api/platform-admin/adapters`        |
| Get adapter    | `getPlatformAdapter(id)`             | `GET /api/platform-admin/adapters/{id}`   |
| Update adapter | `updatePlatformAdapter(id, command)` | `PATCH /api/platform-admin/adapters/{id}` |

BFF gaps for ADM-UI-004:

- No new endpoint required. The design's denser cards (kind, latency, last
  rollout milestone) are already representable from `PlatformAdapter` plus
  the forwarder health snapshot if the page chooses to join them in-memory.
- "Latency" indicators in the design prototype have no first-class field on
  `PlatformAdapter`. Treat as a design aspiration unless `forwarder/adapters/
health` is extended to return a latency sample. Do not invent a frontend
  latency value.

Carry-forward for parent owner:

- Keep the shared `DataViewCard` / `DataFilterBar` / `DataTable` /
  `StatusChip` / `AuthorityBadge` baseline already landed here. Extend it
  toward the denser inventory target rather than regressing to bespoke
  `admin-card` markup.
- Replace the bespoke `apiClient` instantiation in `AdapterList.tsx` with
  `usePlatformAdminClient()` so that this page goes through the shared
  control-plane proxy + auth path like the other four surfaces. Leaving the
  bespoke client in place is a known authority-bypass risk for non-local
  deployments.
- Optional: combine the registry view with a sibling read-only "live status"
  column sourced from `getForwarderAdaptersHealth()` so operators do not
  need to flip back to `/health` to see if a registered adapter is
  currently degraded.

## Cross-Surface Carry-Forward

These items apply across all five pages and are the "one batch of cleanup"
the parent owner should plan for:

1. **Shared primitive adoption.** Health, Notices, Audit, and Feature Flags
   still rely on bespoke `admin-card` / `admin-table` / `admin-toolbar`
   markup. Migrate those surfaces onto the management primitives in
   `packages/ui-web/src/management-primitives.tsx`
   (`SectionHeader`, `KpiRow`, `FilterPillRow`, `StatusChip`,
   `WorkflowPanel`, `CalloutBanner`, `Stepper`, `Timeline`,
   `DetailMetadataGrid`) and treat Adapter Registry's current
   `DataViewCard`/`DataFilterBar`/`DataTable` composition as the nearest
   in-repo reference point.
2. **i18n key parity.** All five pages already use `useTranslation()` and
   `formatPlatformCodeLabel`/`getPlatformLabel`. Maintain that pattern; do
   not introduce raw English strings in new sections. Audit/Notices/Health
   already cover the `health.*`, `audit.*`, `notices.*`, `flags.*`,
   `adapterRegistry.*` namespaces. Adapter Registry today uses an inline
   English/中文 `copy` object in the page wrapper — fold that into the
   translation namespace if the parent owner touches that wrapper.
3. **Loading states.** The current pattern is `loading -> "loading…"`
   sentinel string. Consider a shared management skeleton loader; this is
   not blocking for ADM-UI-004 but should be flagged for `MGMT-UI-002`
   verification.
4. **Error surfacing.** All pages still surface failures through inline red
   `admin-card` containers, even where shared primitives are otherwise in
   use. Migrate to `CalloutBanner` with `tone="danger"` while touching the
   surfaces.
5. **Auth path consistency.** Adapter Registry must move off the bespoke
   `new ApiClient({ baseUrl: "" })` pattern. All other surfaces correctly
   use `usePlatformAdminClient()`.

## Open Questions / Decisions To Escalate

The parent owner must reach a decision on each of these before review
closeout. None of them are sidecar work; they are the seams the BFF/contract
owners need to weigh in on.

1. **Notice scheduling UX.** Should ADM-UI-004 expose
   `CreatePlatformNoticeCommand.scheduledAt` now, or intentionally defer the
   field and document the page as immediate-publish only? Owner: parent task
   `Codex` + reviewer `Codex2`. Default: defer UI wiring only if the omission
   is explicitly recorded in parent verification.
2. **Maintenance scheduling UX.** Should ADM-UI-004 expose
   `SetPlatformMaintenanceModeCommand.scheduledStart` /
   `scheduledEnd` now, or keep the current immediate toggle + reason affordance?
   Owner: parent task `Codex` + reviewer `Codex2`. Default: do not invent
   local scheduling truth; either wire the backend fields or document the gap.
3. **Feature flag owner metadata.** Add `ownerTeam` to `FeatureFlag`?
   Owner: contracts / `Codex`. Default: keep description + scope only.
4. **Audit log pagination + time range filter.** Add to `listAuditLogs()`?
   Owner: audit module. Default: client-side filter only, document
   pagination as a follow-up.
5. **Audit page evidence-governance write surfaces.** Promote legal-hold
   placement / deletion-exception registration / release / resolve actions
   into the page? Owner: parent task `Codex` + reviewer `Codex2`,
   coordinate on authority semantics before expanding beyond read-only
   governance cards.

The default for every open question above is "do not invent local truth on
the frontend; document the limitation in the `MGMT-UI-002` verification
packet." That keeps ADM-UI-004 honest about what the design materialized
versus what the design aspired to but the contracts do not yet support.

## Do-Not-Break List

When the parent owner opens these pages, they must preserve:

- `OperationalObservabilitySnapshot.roleViews` partition logic for
  platform-only alert filtering. Do not collapse to "show every alert."
- `EvidenceGovernanceCatalog.policies` consumption; do not derive policy
  state from raw JSON shapes that bypass `EvidenceRetentionPolicyRecord`.
- `PlatformNoticeStatus.scheduled` rendering. Even though the create form
  cannot produce that state today, backend records may already use it; the
  list must continue to render scheduled rows correctly.
- `PlatformAdapter.config.isEnabled` semantics — this is the platform
  enabled flag, not a UI-derived value. Keep edits going through
  `updatePlatformAdapter`.
- The append-only nature of `/api/audit`. The page must never POST to it.

## Acceptance For This Sidecar

- This packet exists at
  `support/sidecars/ADM-UI-004/ADM-UI-004-SIDECAR-BFF-HANDOFF.md`. ✓
- No canonical truth files mutated by this slice. ✓
- BFF method inventory enumerated for each surface against the actual
  `@drts/api-client` exports as of 2026-05-08. ✓
- Open contract questions enumerated and assigned escalation owners. ✓
- Handed off to reviewer `Claude2` via `scripts/ai-status.sh handoff`. (See
  status update step.)

## Verification That Was Not Possible Here

- The packet is a documentation artifact only; there is no executable
  acceptance command for it. The parent task's acceptance
  (`pnpm --filter @drts/platform-admin-web typecheck`) is unaffected by
  this sidecar.
- BFF response shapes were verified by reading `packages/api-client/src/index.ts`
  and the consuming pages. They were not exercised against a live backend.

## Closeout Note

This packet does not commit canonical implementation. It is a research and
handoff artifact intended to make `ADM-UI-004` faster for `Codex`, easier
for `Claude2` to review at the sidecar layer, and sharper for `Codex2`'s
parent-task review. If new BFF gaps surface during the parent
implementation, append to the "Open Questions" section rather than silently
filling the gap with frontend-only state.
