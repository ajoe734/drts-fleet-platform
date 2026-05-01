# ORX-MD-001 Owner Handoff

Owner: `Codex`  
Reviewer: `Codex2`  
Date: `2026-04-30`  
Observed task status: `in_progress`

## Result

`ORX-MD-001` is ready for review. The driver-master lifecycle/admin surface
already satisfies the task acceptance on the current repo state:

- platform admin can create, activate, suspend, and retire driver masters
- lifecycle state still drives dispatch eligibility and auth/session validity
- device associations remain visible and revocable from the driver-master view

This turn did not need a new driver-master feature build-out. The substantive
`ORX-MD-001` behavior was already present in the repo; owner work here was
re-validation plus one compile-compatibility fix so the current head can be
typechecked cleanly after concurrent supply-lifecycle contract expansion.

## Acceptance Anchors

### 1. Driver master create / activate / suspend / retire is live

- Driver master list and create endpoints are exposed in
  [apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts:120)
  and [regulatory-registry.controller.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts:130).
- Driver lifecycle transitions are enforced in
  [apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:436)
  and [regulatory-registry.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:514).
- Platform-admin create form, lifecycle badges, and action buttons are rendered
  in [apps/platform-admin-web/app/fleet/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/fleet/page.tsx:395)
  and [fleet/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/fleet/page.tsx:1044).

### 2. Lifecycle still controls dispatch eligibility and session validity

- Driver auth/session gating still rejects suspended and retired lifecycle
  states in
  [apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:1323).
- Lifecycle-to-eligibility behavior remains covered by
  [apps/api/tests/unit/regulatory-registry.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/regulatory-registry.service.test.ts:259)
  and suspended bearer-session rejection remains covered by
  [apps/api/tests/unit/auth-bootstrap.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/auth-bootstrap.test.ts:1531).

### 3. Device associations remain visible from the driver master view

- Driver profile bindings are stored and revoked in
  [apps/api/src/modules/driver-profile/driver-profile.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/driver-profile/driver-profile.service.ts:290)
  and [driver-profile.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/driver-profile/driver-profile.service.ts:358).
- Contract shape still exposes device-binding summaries via
  [packages/contracts/src/index.ts](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:1734).
- Fleet UI still renders `profileUpdatedAt`, binding rows, and revoke-device
  actions in
  [apps/platform-admin-web/app/fleet/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/fleet/page.tsx:1093)
  and [fleet/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/fleet/page.tsx:1108).

## Verification

Executed on current `HEAD`:

```sh
pnpm --filter @drts/api exec vitest run tests/unit/regulatory-registry.service.test.ts tests/unit/auth-bootstrap.test.ts tests/unit/driver-profile.service.test.ts
pnpm --filter @drts/contracts build
pnpm --filter @drts/api exec tsc --noEmit
pnpm --filter @drts/platform-admin-web exec tsc --noEmit
```

Observed result:

- targeted API suites passed: `65/65`
- `@drts/contracts` build passed
- `@drts/api` typecheck passed
- `@drts/platform-admin-web` typecheck passed

## Compatibility Fix In This Turn

To keep the current repo head typecheckable after the concurrent
`VehicleSupplyLifecycleRecord.offboarding` contract expansion, this turn also
updated the ops-dispatch event clone path to copy the new `offboarding` field:

- [apps/api/src/common/ops-dispatch-events.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/common/ops-dispatch-events.service.ts:295)

This is a shape-synchronization fix only. It does not change driver-master
lifecycle behavior or the `ORX-MD-001` acceptance surface.

## Review Ask

Please review against the current repo state and, if accepted, advance
`ORX-MD-001` from `review` to `review_approved`.
