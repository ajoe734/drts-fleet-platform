# Driver App Multi-Platform Execution Packet

**Date:** 2026-05-07
**Mode:** `supervisor_managed_execution`
**Product source:** `docs/01-product/driver-app-multi-platform-product-spec-20260507.md`
**Scope:** `apps/driver-app`, `apps/api`, `apps/ops-console-web`, `apps/platform-admin-web`, `apps/tenant-portal-web`, shared contracts/client packages

## Purpose

This packet materializes the multi-platform driver app specification into
supervisor/autoworker execution tasks. The work closes the gap between the
current partial multi-platform foundation and a product that can safely receive,
display, operate, and manage orders from DRTS owned dispatch and external
ride-hailing / taxi platforms.

## Current Truth

The system does not yet fully satisfy multi-platform ride-order aggregation.

What exists:

- `forwarder` backend module with inbound order ingestion, broadcast, accept
  relay, sync failure, manual fallback, reconciliation, adapter health, and
  native status sync concepts.
- Driver tasks can carry `sourcePlatform`.
- Driver app can show platform task badges, platform presence, and platform
  earnings.

What must still be materialized:

- Driver-facing external platform offer / accept-pending / lost-race /
  cancelled / sync-failed experiences.
- Driver-safe API view models instead of raw forwarded/owned interpretation in
  screens.
- Ops management surfaces for forwarded orders, adapter health, reconciliation,
  and driver platform eligibility.
- Platform admin adapter registry and finance authority controls.
- Tenant/partner visibility for owned vs externally fulfilled work.

## Global Worker Rules

Every worker must:

- Read `docs/01-product/driver-app-multi-platform-product-spec-20260507.md`.
- Stay inside the assigned write scope.
- Treat other workers as active in the repo and avoid reverting unrelated edits.
- Preserve existing driver identity, provisioning, pending completion replay,
  trip tracking, proof, and stale-session behavior unless a task explicitly
  scopes a change.
- Preserve owned vs forwarded authority separation.
- Do not claim production external platform support unless adapter auth,
  webhook verification, idempotency, and management controls are complete.
- Keep runtime user copy in Traditional Chinese unless the value is a platform
  brand, ID, API code, or technical identifier.
- Run task-scoped verification and report blockers honestly.

## Dispatch Graph

| Order | Task                                                                                                           | Dispatch rule                                |
| ----- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1     | `API-MP-001`, `DRV-MP-001`, `ADM-MP-001`                                                                       | Can start immediately.                       |
| 2     | `API-MP-002`, `API-MP-003`, `DRV-MP-002`, `DRV-MP-003`, `OPS-MP-001`, `OPS-MP-002`                             | Wait for the relevant model/foundation task. |
| 3     | `DRV-MP-004`, `DRV-MP-005`, `DRV-MP-006`, `DRV-MP-007`, `DRV-MP-008`, `OPS-MP-003`, `ADM-MP-002`, `TEN-MP-001` | Wait for API/foundation dependencies.        |
| 4     | `DRV-MP-009`, `DRV-MP-010`                                                                                     | Wait for platform presence/task/trip pieces. |

## Materialized Tasks

### `API-MP-001` — Unified Driver Task View Model

**Write scope:** `packages/contracts`, `packages/api-client`, `apps/api/src/modules/owned-mobility`, `apps/api/src/modules/forwarder`
**Depends on:** none

Define and expose a driver-safe unified task view model that normalizes owned
and forwarded work without forcing the mobile UI to infer authority from raw
payloads.

Acceptance:

- Contracts expose a unified driver task/order view model with order domain,
  source platform, native status, allowed actions, authority, sync issue, and
  blocking reason fields.
- API maps existing owned and forwarded records into the view model.
- API client exposes a typed list/detail method for the driver app.
- Unit coverage verifies owned and forwarded examples.

Verification:

```bash
pnpm --filter @drts/api typecheck
pnpm --filter @drts/api test -- --run tests/unit/forwarder.service.test.ts
```

### `API-MP-002` — Driver-Safe Forwarded Order Actions

**Write scope:** `packages/contracts`, `packages/api-client`, `apps/api/src/modules/forwarder`, `apps/api/src/modules/owned-mobility`
**Depends on:** `API-MP-001`

Expose mobile-safe action endpoints and response payloads for external-platform
offers, including accept/reject/accept-pending and terminal platform outcomes.

Acceptance:

- Driver app can determine whether accept/reject is allowed.
- Accept relay returns a safe accept-pending state.
- Lost-race and cancelled-by-platform terminal outcomes close local task state
  without exposing unsafe mutation.
- Sync failure returns driver-safe copy and management correlation IDs.

Verification:

```bash
pnpm --filter @drts/api typecheck
pnpm --filter @drts/api test -- --run tests/unit/forwarder.service.test.ts tests/unit/forwarder.controller.test.ts
```

### `API-MP-003` — Production Adapter Hardening Baseline

**Write scope:** `apps/api/src/modules/forwarder`, `packages/contracts`, docs/runbooks for adapter rollout
**Depends on:** `API-MP-001`

Harden the adapter contract and rollout baseline for real external platforms:
auth, webhook verification, idempotency, health, rate-limit handling, and
credential status reporting.

Acceptance:

- Adapter interface documents required production capabilities.
- Stub adapters are clearly labeled non-production.
- Health includes auth/webhook/rate-limit/degraded states.
- Inbound ingestion is idempotent by platform and external order ID.

Verification:

```bash
pnpm --filter @drts/api typecheck
pnpm --filter @drts/api test -- --run tests/unit/forwarder.service.test.ts
```

### `DRV-MP-001` — Driver Multi-Platform Mobile Foundation

**Write scope:** `apps/driver-app/components/ui`, `apps/driver-app/components/platform-*`, optional shell integration
**Depends on:** none

Extend the existing mobile UI foundation for multi-platform authority,
platform health, external-platform status, and forwarded task state.

Acceptance:

- Shared components support platform badges, authority banners, task action
  state chips, platform health cards, and sticky bottom actions.
- Owned and forwarded visual language is reusable across pages.
- No page-specific business logic is buried in generic components.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
```

### `DRV-MP-002` — Workspace Multi-Platform Cockpit

**Write scope:** `apps/driver-app/app/onboarding.tsx`, workspace-related driver app helpers
**Depends on:** `DRV-MP-001`, `API-MP-001`

Turn the ready workspace into a multi-platform cockpit showing shift, platform
readiness, urgent tasks, re-auth blockers, and next best action.

Acceptance:

- Workspace shows owned vs external platform readiness.
- Re-auth, offline, adapter degraded, and task urgency states are visible.
- Next action adapts to provisioning, shift, platform, task, and trip state.
- Unprovisioned registration flow remains guarded and keeps the current test
  defaults until final testing replaces them.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app test -- --run tests/unit/driver-identity-bootstrap.test.ts tests/unit/driver-identity-routing.test.ts
```

### `DRV-MP-003` — Unified Task Inbox

**Write scope:** `apps/driver-app/app/jobs.tsx`, platform task badge/card components
**Depends on:** `DRV-MP-001`, `API-MP-001`

Materialize owned and forwarded tasks in one inbox with filters and clear
authority/action states.

Acceptance:

- Inbox distinguishes owned vs forwarded tasks.
- Filters include all, needs action, in progress, platform closed, and sync
  issue.
- Task cards show source platform, native status, local status, allowed action,
  route lock, and sync/fallback indicators.
- Driver-safe copy explains lost race, platform cancellation, and sync failure.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
```

### `DRV-MP-004` — Forwarded Offer Accept/Reject UX

**Write scope:** `apps/driver-app/app/jobs.tsx`, `apps/driver-app/app/trip.tsx`, driver app API client integration
**Depends on:** `DRV-MP-003`, `API-MP-002`

Wire driver-facing accept/reject for supported forwarded offers and model
accept-pending/terminal outcomes.

Acceptance:

- Driver can accept a supported external platform offer.
- Accept transitions to accept-pending until platform confirmation.
- Driver can reject where backend reports reject is allowed.
- Lost race/cancelled/sync-failed are terminal or management-handled states.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app test -- --run tests/unit/pending-completion-replay.test.ts
```

### `DRV-MP-005` — Trip Authority Redesign

**Write scope:** `apps/driver-app/app/trip.tsx`, `apps/driver-app/components/route-display.tsx`
**Depends on:** `DRV-MP-003`, `API-MP-001`

Refactor trip UI so owned and forwarded trips share layout but never confuse
authority, allowed actions, proof, tracking, or platform-controlled state.

Acceptance:

- Owned trips keep one primary local lifecycle action.
- Forwarded trips show platform authority and only allowed actions.
- Accept-pending, confirmed, lost-race, cancelled, and sync-failed states are
  first-class.
- Completion proof, tracking blockers, stale-session reroute, and replay remain
  intact.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app test -- --run tests/unit/completion-proof.test.ts tests/unit/pending-completion-replay.test.ts tests/unit/use-pending-completion-replay.test.ts tests/unit/driver-location-heartbeat.test.ts
```

### `DRV-MP-006` — Platform Presence Health Center

**Write scope:** `apps/driver-app/app/platform-presence.tsx`, `apps/driver-app/components/platform-status-card.tsx`, `apps/driver-app/components/platform-binding.tsx`
**Depends on:** `DRV-MP-001`, `API-MP-001`

Upgrade platform presence into a health center covering account binding,
online/offline, re-auth, token expiry, adapter status, and eligibility blockers.

Acceptance:

- Each platform card explains whether it can receive orders and why not.
- Re-auth, adapter degraded, token expired, account unbound, and eligibility
  blocked states are visible.
- Per-platform busy state works.
- Settings can reuse the platform account component.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
```

### `DRV-MP-007` — Earnings Authority Redesign

**Write scope:** `apps/driver-app/app/earnings.tsx`, `apps/driver-app/components/earnings-by-platform.tsx`, `apps/driver-app/lib/money.ts`
**Depends on:** `DRV-MP-001`, `API-MP-001`

Make earnings show owned vs external-platform finance authority clearly,
including shadow-only forwarded records.

Acceptance:

- Platform breakdown labels payout/settlement authority.
- Forwarded shadow-only values are not presented as payable DRTS settlement.
- Pending payout vs paid remains clear.
- Partial stale-data warnings are preserved.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
```

### `DRV-MP-008` — Shift Availability Integration

**Write scope:** `apps/driver-app/app/shift.tsx`, workspace/availability helpers if needed
**Depends on:** `DRV-MP-001`, `API-MP-001`

Connect shift state to multi-platform readiness, so drivers and managers can
identify platform-online but not-on-shift mismatches.

Acceptance:

- Shift page remains a clear punch-clock flow.
- Workspace can warn when platform presence and shift state conflict.
- Odometer validation and provisioned identity guard remain intact.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app test -- --run tests/unit/driver-identity-bootstrap.test.ts
```

### `DRV-MP-009` — Settings Platform Binding

**Write scope:** `apps/driver-app/app/settings.tsx`, `apps/driver-app/components/platform-binding.tsx`
**Depends on:** `DRV-MP-006`

Make settings expose platform account binding and per-platform availability
details consistently with the presence health center.

Acceptance:

- Bound/unbound/re-auth/token/eligibility states are visible.
- Platform binding runtime copy is Traditional Chinese.
- Global vs per-platform auto-accept implications are clear.
- Dirty/save/partial-error behavior remains.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
```

### `DRV-MP-010` — SOS Source Platform Context

**Write scope:** `apps/driver-app/app/incident.tsx`, incident payload integration, related tests
**Depends on:** `DRV-MP-003`, `API-MP-001`

Ensure SOS launched during an external-platform task carries source-platform
context safely into incident creation.

Acceptance:

- Incident payload can preserve platform code, external order ID, local mirror
  order ID, and native status when available.
- SOS remains two-step confirmed.
- Driver copy stays safety-focused and not adapter-debug-focused.

Verification:

```bash
pnpm --filter @drts/driver-app typecheck
pnpm --filter @drts/driver-app test -- --run tests/unit/incident-screen.test.ts
```

### `OPS-MP-001` — Forwarded Order Board

**Write scope:** `apps/ops-console-web`, API client bindings as needed
**Depends on:** `API-MP-001`, `API-MP-002`

Build an ops board for inbound, broadcasted, accept-pending, terminal, and
sync-failed forwarded orders.

Acceptance:

- Ops can filter by platform, status, sync error, manual fallback, accepted
  driver, and reconciliation state.
- Detail view shows mirror ID, external ID, authoritative snapshot, local/native
  status, candidates, accepted driver, sync error, fallback, reconciliation, and
  audit summary.
- Ops actions are available for broadcast, sync failure, manual fallback, and
  reconciliation completion where supported.

Verification:

```bash
pnpm --filter @drts/ops-console-web typecheck
```

### `OPS-MP-002` — Adapter Health and Reconciliation Operations

**Write scope:** `apps/ops-console-web`, `apps/api/src/modules/operational-observability` if needed
**Depends on:** `API-MP-003`

Expose adapter health, sync errors, reconciliation issues, and operational
alerts for external platform degradation.

Acceptance:

- Ops can see healthy/degraded/down/auth/rate-limit/webhook states.
- Sync error and reconciliation queues are actionable.
- Stuck accept-pending and manual fallback backlog are visible.

Verification:

```bash
pnpm --filter @drts/ops-console-web typecheck
pnpm --filter @drts/api typecheck
```

### `OPS-MP-003` — Driver Platform Eligibility Management

**Write scope:** `apps/ops-console-web`, driver availability/eligibility API integrations
**Depends on:** `API-MP-001`, `OPS-MP-002`

Add management views for why drivers can or cannot receive external-platform
orders.

Acceptance:

- Driver list/detail shows shift, platform presence, account binding,
  eligibility, active order, stale location, and recent relay failures.
- Ops can take a driver offline for a platform, request re-auth, or suppress
  matching during incidents where backend allows.

Verification:

```bash
pnpm --filter @drts/ops-console-web typecheck
```

### `ADM-MP-001` — Platform Adapter Registry

**Write scope:** `apps/platform-admin-web`, platform admin API/contracts if needed
**Depends on:** none

Create the platform admin control plane for adapter enablement, rollout,
credential status, webhook status, supported actions, and policy.

Acceptance:

- Admin can see platform code, display name, environment, enabled state, adapter
  type, credential status, webhook status, health, supported actions, and
  rollout stage.
- Admin can disable a degraded platform without disabling owned dispatch.
- Policy fields cover service buckets, max candidates, accept timeout, manual
  fallback threshold, and finance authority mode.

Verification:

```bash
pnpm --filter @drts/platform-admin-web typecheck
```

### `ADM-MP-002` — Finance and Reconciliation Authority

**Write scope:** `apps/platform-admin-web`, billing/settlement API integrations as needed
**Depends on:** `ADM-MP-001`, `API-MP-001`

Expose forwarded shadow ledger and external-platform finance authority in admin
finance/reconciliation views.

Acceptance:

- Admin/finance can distinguish owned payable records from forwarded
  shadow-only records.
- Reconciliation queue shows platform, mirror order, external order, reason,
  owner, status, and notes.
- UI prevents treating external-platform payout authority as DRTS payable.

Verification:

```bash
pnpm --filter @drts/platform-admin-web typecheck
```

### `TEN-MP-001` — Tenant/Partner Source-Domain Visibility

**Write scope:** `apps/tenant-portal-web`, tenant API/client integration if needed
**Depends on:** `API-MP-001`

Update tenant/partner-facing surfaces so externally fulfilled work is visible
without exposing low-level adapter internals.

Acceptance:

- Booking detail/list/reporting can show owned vs externally fulfilled source.
- SLA copy distinguishes DRTS dispatch delay from external platform adapter
  delay where applicable.
- Tenant billing/reporting labels external-platform finance authority.

Verification:

```bash
pnpm --filter @drts/tenant-portal-web typecheck
```

## Final Gate

The wave is not complete until:

- All materialized tasks are `done`.
- Driver app emulator smoke confirms provisioning, workspace, task inbox,
  forwarded offer states, trip authority states, platform presence, earnings,
  shift, settings, and SOS.
- Ops can inspect and resolve forwarded order operational states.
- Platform admin can disable/configure an external platform.
- Finance-facing surfaces cannot confuse shadow-only external platform records
  with DRTS payable settlement.
