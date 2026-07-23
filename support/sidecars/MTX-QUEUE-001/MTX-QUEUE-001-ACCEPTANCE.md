# MTX-QUEUE-001 Acceptance Evidence

Date: 2026-07-23
Task ID: MTX-QUEUE-001
Title: Fleet C queue semantics (runtime)
Owner: Gemini
Reviewer: Copilot

## Acceptance Matrix

| Item | Requirement | Code Location | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | `multi_taxi_direct` + `virtual_matching` passes | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` | `verified` | Unit test in `owned-mobility.service.test.ts` passes (`queueCheckInMultiTaxi` returns `virtual_matching`) |
| 2 | `physical_rank` denied | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` | `verified` | `assertQueuePolicy` throws `MULTI_TAXI_QUEUE_MODE_FORBIDDEN` |
| 3 | `taxi_stand` denied | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` | `verified` | `assertQueuePolicy` throws `MULTI_TAXI_QUEUE_MODE_FORBIDDEN` |
| 4 | `ordinary_taxi` policy independently configurable | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` | `verified` | `setProfileQueuePolicy` / `getProfileQueuePolicy` configures ordinary_taxi queue modes independently; check-in enforces policy while check-out remains allowed for existing entries after policy change |

## Contract Updates

- Added `ProfileQueuePolicyMap` and `DEFAULT_PROFILE_QUEUE_POLICY_MAP` to `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`.

## Test Commands Executed

```bash
npm test -- apps/api/tests/unit/owned-mobility.service.test.ts
npm test
```
