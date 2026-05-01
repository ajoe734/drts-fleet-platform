# OPX-GV-003 Owner Handoff

Owner: `Codex`  
Reviewer: `Codex2`  
Date: `2026-04-30`  
Observed task status: `review`

## Result

`OPX-GV-003` is ready for review on the current repo state.

This task adds a shared operational observability snapshot, exposes it through a
role-scoped API, wires the Ops Console dashboard to the ops-routed alert set,
adds a Platform Admin health-and-alerts surface for platform-routed workflow
failures, and documents the threshold / triage contract in a runbook.

## Acceptance Anchors

### 1. Critical workflow metrics and alerts are named and routed

- Added `OperationalObservabilityModule` to the API app so the slice is loaded
  in the main runtime at [apps/api/src/app.module.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/app.module.ts:35) and [apps/api/src/app.module.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/app.module.ts:62).
- Added a role-scoped `GET /api/operational-observability` endpoint for `ops`
  and `platform` realms with `audit:read` at [operational-observability.controller.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/operational-observability/operational-observability.controller.ts:9).
- The snapshot service computes named alerts for dispatch lag, recording
  backlog, driver-state lag, webhook failure burst, and eligibility review
  backlog, with explicit thresholds and route ownership at
  [operational-observability.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/operational-observability/operational-observability.service.ts:66),
  [operational-observability.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/operational-observability/operational-observability.service.ts:107),
  and [operational-observability.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/operational-observability/operational-observability.service.ts:154).
- The runbook records the same taxonomy, thresholds, routes, and triage order
  at [docs/03-runbooks/operational-observability-alert-runbook.md](/home/edna/workspace/drts-fleet-platform/docs/03-runbooks/operational-observability-alert-runbook.md:1).

### 2. Operators have role-appropriate visibility into failures

- Ops Console dashboard now loads the shared observability snapshot alongside
  its existing KPI sources at [apps/ops-console-web/app/dashboard/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dashboard/page.tsx:186).
- The dashboard filters to the ops role-view alert keys and renders
  severity-sorted alert cards with translated titles, thresholds, and workflow
  summaries at [apps/ops-console-web/app/dashboard/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dashboard/page.tsx:294) and [apps/ops-console-web/app/dashboard/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dashboard/page.tsx:372).
- Platform Admin health now pivots from generic quotas to workflow alerts plus
  adapter detail, using the platform role-view alert set and metric cards for
  dispatch lag, webhook failures, eligibility backlog, reporting failures, and
  degraded adapters at [apps/platform-admin-web/app/health/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/health/page.tsx:125),
  [apps/platform-admin-web/app/health/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/health/page.tsx:167),
  and [apps/platform-admin-web/app/health/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/health/page.tsx:180).

### 3. Dispatch, webhook, recording, and driver-state lag are measurable

- The snapshot service materializes:
  - dispatch queue depth, ready-order lag, redispatch, exception-hold, and
    dispatch-failed counts
  - recording pending / missing linkage lag
  - stale or missing driver location state
  - webhook delivery failure burst and queue lag
  - partner eligibility review backlog
  - reporting and adapter summary counts
- These families are sourced from owned mobility, callcenter, regulatory
  registry, forwarder, reporting, and tenant-partner services in
  [operational-observability.module.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/operational-observability/operational-observability.module.ts:12)
  and computed in [operational-observability.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/operational-observability/operational-observability.service.ts:230).
- Focused service coverage proves the snapshot reports critical counts and route
  state from a mixed fixture at
  [apps/api/tests/unit/operational-observability.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/operational-observability.service.test.ts:39).

## Delivered Artifacts

- [apps/api/src/app.module.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/app.module.ts:35)
- [apps/api/src/modules/operational-observability/operational-observability.module.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/operational-observability/operational-observability.module.ts:1)
- [apps/api/src/modules/operational-observability/operational-observability.controller.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/operational-observability/operational-observability.controller.ts:1)
- [apps/api/src/modules/operational-observability/operational-observability.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/operational-observability/operational-observability.service.ts:1)
- [apps/api/tests/unit/operational-observability.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/operational-observability.service.test.ts:1)
- [apps/ops-console-web/app/dashboard/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dashboard/page.tsx:186)
- [apps/ops-console-web/lib/translations.ts](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/lib/translations.ts:105)
- [apps/platform-admin-web/app/health/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/health/page.tsx:125)
- [apps/platform-admin-web/lib/translations.ts](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/lib/translations.ts:499)
- [docs/03-runbooks/operational-observability-alert-runbook.md](/home/edna/workspace/drts-fleet-platform/docs/03-runbooks/operational-observability-alert-runbook.md:1)

## Review Boundary

- Review the task against the files listed above plus any contract types already consumed by those files.
- The current repo worktree also contains unrelated in-flight edits in adjacent ops/platform/API surfaces for other operational-blueprint tasks.
- For `OPX-GV-003`, the intended owner scope is limited to:
  - the new API observability module and its app registration
  - the ops dashboard observability card and required alert translations
  - the platform health alerts surface and required alert translations
  - the observability runbook and this handoff packet
- If you see changes outside that boundary while reviewing current `HEAD`, treat them as neighboring task noise unless they directly break this slice.

## Verification

Executed on the current repo state:

```sh
pnpm -C apps/api exec vitest run tests/unit/operational-observability.service.test.ts
pnpm -C apps/api exec tsc --noEmit
pnpm -C apps/ops-console-web exec tsc --noEmit
pnpm -C apps/platform-admin-web exec tsc --noEmit
```

Observed result:

- `tests/unit/operational-observability.service.test.ts` passed: `1 file`, `1 test`
- `apps/api` typecheck passed
- `apps/ops-console-web` typecheck passed
- `apps/platform-admin-web` typecheck passed

## Review Ask

Please review against current `HEAD` and focus on:

- whether the alert taxonomy and thresholds are internally coherent across the
  API snapshot and runbook
- whether ops-vs-platform routing is represented consistently in the two UI
  surfaces
- whether the snapshot families are sufficient to satisfy the task acceptance
  bar without accidentally creating a second authority path outside the
  underlying domain services
