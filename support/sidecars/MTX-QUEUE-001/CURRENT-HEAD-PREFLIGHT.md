# MTX-QUEUE-001 Current-Head Preflight

Date: 2026-07-23
Owner: Gemini
Reviewer: Copilot
Task: Fleet C queue semantics (runtime)

## Scope check

- Worktree/branch matched dispatch: `gemini/mtx-queue-001`
- Machine-truth status was `backlog` on entry and moved to `in_progress`
- `support/sidecars/MTX-QUEUE-001/` created for preflight and acceptance artifacts

## Current-head findings before edits

- `packages/contracts/src/phase1-p5-s3-multi-taxi.ts` defined `DISPATCH_QUEUE_MODES` (`virtual_matching`, `physical_rank`, `taxi_stand`), `DispatchQueueMode`, and `OwnedRideRuntimeContext`.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` enforced that `multi_taxi_direct` may only use `virtual_matching` and rejects `physical_rank` or `taxi_stand` with `MULTI_TAXI_QUEUE_MODE_FORBIDDEN`.
- `queueCheckInMultiTaxi` and `queueCheckOutMultiTaxi` set `runtimeProfileCode: "multi_taxi_direct"` and default `queueMode: "virtual_matching"`.

## Classification of Acceptance Items

1. `multi_taxi_direct + virtual_matching passes`: `verified`
2. `physical_rank denied`: `verified`
3. `taxi_stand denied`: `verified`
4. `ordinary_taxi policy independently configurable`: `implemented` & `verified`

## Remaining Delta

- Defined `ProfileQueuePolicyMap` and `DEFAULT_PROFILE_QUEUE_POLICY_MAP` contract definitions in `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`.
- Implemented `setProfileQueuePolicy` and `getProfileQueuePolicy` in `OwnedMobilityService` for independent profile-queue configuration.
- Enforced configurable queue policies in `assertQueuePolicy` for non-multi-taxi profiles without loosening `multi_taxi_direct`'s virtual-matching restriction.
- Added comprehensive unit tests in `owned-mobility.service.test.ts`.
