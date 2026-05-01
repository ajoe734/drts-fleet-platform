# ORX-MD-002 Owner Handoff

Owner: `Codex2`  
Reviewer: `Claude`  
Date: `2026-04-30`  
Observed task status: `in_progress`

## Result

`ORX-MD-002` is ready for review on the current repo state.

This slice now makes vehicle supply lifecycle issues operator-visible across
both platform-admin and ops-console surfaces, while the registry service tracks
rejected exclusivity and offboarding/debranding as first-class dispatchability
blocks.

## Acceptance Anchors

### 1. Expired insurance and rejected exclusivity are operator-visible

- The registry service keeps rejected exclusivity and expired insurance in the
  derived vehicle lifecycle, and converts them into dispatch blocked reasons in
  [apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:998)
  and [regulatory-registry.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:1482).
- The shared contract now exposes offboarding/debranding state and the new
  blocked reason enum via
  [packages/contracts/src/index.ts](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:1678)
  and [index.ts](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:1717).
- Ops now sees warning cards plus contract/insurance/exclusivity/offboarding
  lifecycle columns in
  [apps/ops-console-web/app/vehicles/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/vehicles/page.tsx:39)
  and [vehicles/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/vehicles/page.tsx:82).

### 2. Offboarding creates and tracks debranding work

- Platform-admin now exposes a selected-vehicle detail workspace for
  dispatchability, exclusivity review, and offboarding/debranding controls in
  [apps/platform-admin-web/app/fleet/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/fleet/page.tsx:610)
  and [fleet/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/fleet/page.tsx:860).
- The backend persists offboarding start/completion, debranding ticket data,
  and debranding completion state in
  [apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:1051)
  and [regulatory-registry.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:1125).
- Regression coverage for the debranding lifecycle is in
  [apps/api/tests/unit/regulatory-registry.service.test.ts](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/regulatory-registry.service.test.ts:352).

### 3. Dispatchability warnings are visible before dispatch attempts fail

- The selected-vehicle admin panel surfaces current blocked reasons and manual
  dispatch hold/release controls in
  [apps/platform-admin-web/app/fleet/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/platform-admin-web/app/fleet/page.tsx:619).
- Ops sees a top-level warning summary before the table plus per-vehicle
  blocked reasons and debranding-pending hints in
  [apps/ops-console-web/app/vehicles/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/vehicles/page.tsx:66)
  and [vehicles/page.tsx](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/vehicles/page.tsx:155).
- Backend validation still refuses manual dispatch re-enable while any derived
  compliance block remains active in
  [apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:1183).

## Verification

Executed on current `HEAD`:

```sh
pnpm --filter @drts/contracts build
pnpm --filter @drts/api exec vitest run tests/unit/regulatory-registry.service.test.ts
pnpm --filter @drts/platform-admin-web exec tsc --noEmit
pnpm --filter @drts/ops-console-web exec tsc --noEmit
```

Observed result:

- `@drts/contracts` build passed
- targeted regulatory-registry suite passed: `10/10`
- `@drts/platform-admin-web` typecheck passed
- `@drts/ops-console-web` typecheck passed

## Review Ask

Please review against current `HEAD` and, if accepted, advance `ORX-MD-002`
from `review` to `review_approved`.
