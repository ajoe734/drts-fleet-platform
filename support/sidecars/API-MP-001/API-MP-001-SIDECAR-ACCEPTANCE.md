# API-MP-001 SIDECAR ACCEPTANCE PACKET

- Parent Task: `API-MP-001` - Unified Driver Task View Model
- Sidecar Task: `API-MP-001-SIDECAR-ACCEPTANCE`
- Owner: `Codex`
- Reviewer: `Codex2`
- Scope: support artifact only; no canonical truth or runtime changes

## 1. Objective

Prepare a reviewer-facing packet for `API-MP-001` so the parent owner can
implement and review against a concrete acceptance checklist, dependency map,
and spec-to-code anchor list.

Primary source anchors:

- `docs/01-product/driver-app-multi-platform-product-spec-20260507.md`
- `docs/03-runbooks/driver-app-multi-platform-execution-packet-20260507.md`
- `phase1_prd_detailed_v1.md`
- `phase1_service_contracts_v1.md`

## 2. Canonical Acceptance Summary

From the execution packet, `API-MP-001` must deliver:

- A unified driver task/order view model in `packages/contracts`
- API mapping from existing owned and forwarded records
- Typed API client list/detail methods for the driver app
- Unit coverage for both owned and forwarded examples

Verification expected by the parent task:

```bash
pnpm --filter @drts/api typecheck
pnpm --filter @drts/api test -- --run tests/unit/forwarder.service.test.ts
```

Targeted reviewer spot-checks against live code:

- `apps/api/tests/unit/forwarder.service.test.ts`
- `apps/api/tests/unit/forwarder.controller.test.ts`

## 3. Required Unified View Fields

The product spec requires the unified driver task view model to expose:

- `taskId`
- `orderId`
- `orderDomain`
- `sourcePlatform`
- `platformDisplayName`
- `externalOrderId`
- `nativeStatus`
- `localStatus`
- `driverActionState`
- `allowedActions`
- `routeLocked`
- `fareAuthority`
- `settlementAuthority`
- `driverPayoutAuthority`
- `requiresManualFallback`
- `requiresReauth`
- `syncIssueSummary`
- `pickupSummary`
- `dropoffSummary`
- `deadlineAt`
- `updatedAt`

Execution acceptance also implies driver-safe blocker coverage so downstream
screens do not infer unavailable actions from raw payloads. The current live
contract uses `blockingReason` for that seam.

## 4. Spec-To-Code Anchor Map

Live code already contains most of the contract, client, and service seams for
the parent slice. Reviewer focus should be end-to-end wiring and semantic
correctness, not just greenfield DTO creation:

- `packages/contracts/src/index.ts`
  - `UnifiedDriverTaskView` already models `orderDomain`, `sourcePlatform`,
    `platformDisplayName`, `externalOrderId`, `nativeStatus`, `localStatus`,
    `driverActionState`, `allowedActions`, `routeLocked`, the authority
    triplet, fallback/reauth flags, `syncIssueSummary`, `blockingReason`,
    pickup/dropoff summaries, `deadlineAt`, and `updatedAt`.
  - `DriverTaskRecord` remains the owned-task/raw lifecycle source and should
    not absorb forwarded-only semantics.
- `packages/api-client/src/index.ts`
  - Legacy owned-task access still exists at `listDriverTasks()`.
  - The unified seam now exists at `listUnifiedDriverTasks()` and
    `getUnifiedDriverTask()`, targeting `/api/driver/task-views` list/detail
    endpoints.
- `apps/api/src/modules/forwarder/forwarder.service.ts`
  - `listDriverTaskViews()` merges owned tasks and forwarded orders into a
    single sorted driver-safe list.
  - `getDriverTaskView()` resolves both owned task IDs and forwarded mirror
    order IDs, and throws `DRIVER_TASK_VIEW_NOT_FOUND` when absent.
  - Mapping helpers preserve authority split instead of flattening `owned` and
    `forwarded` into one lifecycle.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  - Owned tasks and orders remain the raw local lifecycle inputs consumed by
    the unified view mapper.
- `apps/api/src/modules/forwarder/forwarder.controller.ts`
  - Live controller wiring already exposes `/api/driver/task-views` list and
    `/api/driver/task-views/:taskId` detail handlers through
    `listDriverTaskViews()` and `getDriverTaskView()`.
  - Reviewer focus should stay on controller/service/client semantic alignment
    and success-envelope behavior rather than route existence.
- `apps/api/tests/unit/forwarder.service.test.ts`
  - Live tests cover mixed owned/forwarded list mapping and sync-failed
    forwarded blocking states.
- `apps/api/tests/unit/forwarder.controller.test.ts`
  - Live controller tests cover success-envelope wrapping for
    `listDriverTaskViews()`.
  - If the parent slice changes detail-route lookup or envelope behavior,
    extend controller coverage so list/detail expectations remain aligned.

Reviewer focus:

- Confirm unified list/detail surfaces exist end-to-end, not only in
  types/client.
- Ensure the new API contract does not collapse `owned` and `forwarded` into a
  shared state machine.
- Ensure forwarded records remain projection/mirror semantics rather than being
  rewritten as owned assignments.
- Ensure the mobile client no longer needs to infer authority or blocker copy
  from low-level raw task payloads.

## 5. Dependency Map

### Upstream Dependencies

- None in machine truth. `API-MP-001` is a wave-1 foundation slice.

### Direct Downstream Tasks

- `API-MP-002` needs the unified model to add safe forwarded accept/reject
  actions.
- `API-MP-003` needs the unified model to expose adapter/authority/runtime
  hardening without inventing a second task shape.
- `DRV-MP-002` needs multi-platform workspace readiness and blocker summaries.
- `DRV-MP-003` needs unified inbox cards, filters, and action-state copy.
- `DRV-MP-005` needs trip authority separation on top of the same task model.
- `DRV-MP-006` needs platform presence/reauth/eligibility blocker display.
- `DRV-MP-007` needs finance authority labels consistent with task authority.
- `DRV-MP-008` needs shift readiness mismatch signals tied to platform/task
  status.
- `DRV-MP-010` needs source platform, native status, and authority context for
  SOS confirmation copy.
- `OPS-MP-001` needs forwarded order board states aligned with the shared
  owned/forwarded vocabulary.
- `OPS-MP-003` needs driver platform eligibility and relay failure context.
- `ADM-MP-002` needs admin finance/reconciliation authority labels consistent
  with driver task finance authority.
- `TEN-MP-001` needs tenant/partner source-domain visibility without exposing
  adapter internals.

### Semantic Dependencies From Canonical Truth

- `phase1_prd_detailed_v1.md`
  - `owned` and `forwarded` must remain separately modeled.
  - Jobs inbox may show both, but badges and status semantics differ.
  - Forwarded orders may be mirrored and reconciled only; native authority
    stays external.
- `phase1_service_contracts_v1.md`
  - Forwarder owns mirror data, sync state, and reconciliation state.
  - `confirmed_by_platform` is the only forwarded state that can yield a
    formally fulfillable driver state.
  - External-platform failures must not downgrade forwarded work into owned
    orders.

## 6. Review Checklist

- [ ] `UnifiedDriverTaskView` remains the dedicated driver-safe contract and
      `DriverTaskRecord` stays owned-task/raw-lifecycle oriented.
- [ ] Contract preserves explicit `orderDomain`, `sourcePlatform`, authority
      fields, and driver-safe blocker context.
- [ ] Forwarded projections expose `nativeStatus`, sync issue state, and manual
      fallback state without implying local authority where the platform
      remains authoritative.
- [ ] Owned projections expose local lifecycle state without fake
      external-platform semantics.
- [ ] API mapping covers both owned and forwarded examples.
- [ ] API client methods `listUnifiedDriverTasks()` and
      `getUnifiedDriverTask()` match actual server list/detail route wiring.
- [ ] Controller and service tests reflect the same live task-view API surface
      with no controller/test drift.
- [ ] Unit coverage demonstrates at least one owned case and one forwarded
      case.
- [ ] Dependency map includes direct downstream consumer `DRV-MP-010` plus the
      other machine-truth consumers of `API-MP-001`.
- [ ] No canonical truth documents or unrelated runtime domains are modified by
      this sidecar.

## 7. Handoff Notes For Parent Owner / Reviewer

- Treat this packet as a support checklist, not new product truth.
- `/api/driver/task-views` list/detail route exposure is already present in the
  live controller; closeout should instead verify that controller, service,
  api-client, and tests still agree after any parent-slice refactors.
- If implementation discovers missing enum definitions or unclear action-state
  taxonomy, resolve them in parent-task code/tests and cite the higher
  precedence source.
- If a field cannot be derived safely for one domain, prefer explicit `null` or
  domain-safe absence over UI-side guesswork.
- If blocker or authority wording changes, re-check downstream assumptions in
  `DRV-MP-002`, `DRV-MP-003`, `DRV-MP-005`, `DRV-MP-006`, `DRV-MP-010`,
  `OPS-MP-001`, and `TEN-MP-001`.

## 8. Evidence

- `docs/01-product/driver-app-multi-platform-product-spec-20260507.md`
- `docs/03-runbooks/driver-app-multi-platform-execution-packet-20260507.md`
- `packages/contracts/src/index.ts`
- `packages/api-client/src/index.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `apps/api/src/modules/forwarder/forwarder.service.ts`
- `apps/api/src/modules/forwarder/forwarder.controller.ts`
- `apps/api/tests/unit/forwarder.service.test.ts`
- `apps/api/tests/unit/forwarder.controller.test.ts`
- `.orchestrator/evidence/copilot-20260507T135653Z-423f843a.json`
- `.orchestrator/evidence/copilot-20260507T140559Z-ff24cb54.json`
- `ai-status.json` review log for `API-MP-001-SIDECAR-ACCEPTANCE`
