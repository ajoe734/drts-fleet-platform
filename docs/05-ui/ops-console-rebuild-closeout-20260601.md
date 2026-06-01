# Ops Console Rebuild Closeout (2026-06-01)

Owner: Codex
Reviewer: Codex2
Task: `UI-FE-OPS-UMBRELLA`
Supersedes: [`docs/05-ui/ops-console-rebuild-closeout-20260528.md`](./ops-console-rebuild-closeout-20260528.md)
Design packet: [`docs/05-ui/ops-console-design-handoff-packet-20260525.md`](./ops-console-design-handoff-packet-20260525.md)

## Scope

This closeout reruns umbrella acceptance for the 20-route Ops Console rebuild and records the final branch-level verification:

- all dependency routes from packet §5 remain represented by shipped Storybook closeout stories and the assembled app,
- `apps/ops-console-web` still builds and type-checks cleanly on the umbrella branch,
- route smoke on a local production server still returns the expected status codes and graceful fallback behavior,
- no new integration regressions were observed while re-running closeout on 2026-06-01.

## Integration notes

The umbrella branch still carries the two integration repairs captured in the 2026-05-28 packet:

1. `apps/ops-console-web/app/contracts/[contractId]/page.tsx` uses the current `@drts/contracts` export surface and renders the read-only contract detail from `VehicleContractRecord`.
2. `apps/ops-console-web/app/complaints/[caseNo]/page.tsx` plus [`artifact/route.ts`](../../apps/ops-console-web/app/complaints/[caseNo]/artifact/route.ts) degrade cleanly when the upstream complaint artifact payload is unavailable, returning a read-only unavailable state and explicit `503` JSON instead of an unhandled exception.

## Verification

Commands executed on 2026-06-01 from branch `codex/ui-fe-ops-umbrella`:

- `pnpm --filter @drts/ops-console-web build`
  Result: PASS
- `pnpm --filter @drts/ops-console-web typecheck`
  Result: PASS
- `pnpm --filter @drts/ui-web build-storybook`
  Result: PASS
- `pnpm --filter @drts/ops-console-web start`
  Result: PASS for local smoke on `http://127.0.0.1:3003`

Storybook parity artifact used by the umbrella closeout:

- `packages/ui-web/src/ops-console-closeout.stories.tsx`

Smoke run against local server on `http://127.0.0.1:3003` after build:

| Route                            | Result                                                                   |
| -------------------------------- | ------------------------------------------------------------------------ |
| `/dashboard`                     | `200`                                                                    |
| `/dispatch`                      | `200`                                                                    |
| `/dispatch/DSP-1001`             | `404` expected with unseeded placeholder ID                              |
| `/callcenter`                    | `200`                                                                    |
| `/complaints`                    | `200`                                                                    |
| `/complaints/CASE-1001`          | `200`                                                                    |
| `/incidents`                     | `200`                                                                    |
| `/incidents/INC-1001`            | `404` expected with unseeded placeholder ID                              |
| `/approval-requests`             | `200`                                                                    |
| `/reports`                       | `200`                                                                    |
| `/revenue`                       | `200`                                                                    |
| `/attendance`                    | `200`                                                                    |
| `/maintenance`                   | `200`                                                                    |
| `/drivers`                       | `200`                                                                    |
| `/drivers/DRV-1001`              | `200`                                                                    |
| `/vehicles`                      | `200`                                                                    |
| `/vehicles/VEH-1001`             | `200`                                                                    |
| `/contracts`                     | `200`                                                                    |
| `/contracts/CTR-1001`            | `200`                                                                    |
| `/feature-flags`                 | `200`                                                                    |
| `/complaints/CASE-1001/artifact` | `503` graceful JSON fallback when upstream export payload is unavailable |

The app process emitted no post-ready runtime errors while the smoke requests were executed.

## Dependency matrix

The route/task mapping from packet §5 is unchanged from the 2026-05-28 umbrella closeout. The current `ai-status` active-board listing no longer surfaces those archived child `done` tasks individually, so this packet carries forward the shipped task tuple evidence and re-verifies the integrated branch output.

| Task            | Packet / route             | Canvas anchor      | Commit     | Branch                          |
| --------------- | -------------------------- | ------------------ | ---------- | ------------------------------- |
| UI-FE-TOKENS    | Tokens / shared primitives | n/a                | `d3f5766f` | `origin/claude2/ui-fe-tokens`   |
| UI-FE-OPS-DSH   | `/dashboard`               | `dashboard`        | `35ae4509` | `origin/codex2/ui-fe-ops-dsh`   |
| UI-FE-OPS-DSP   | `/dispatch`                | `dispatch-ready`   | `7be06a44` | `origin/codex/ui-fe-ops-dsp`    |
| UI-FE-OPS-DSPID | `/dispatch/[dispatchId]`   | `dispatch-detail`  | `c60c7113` | `origin/codex/ui-fe-ops-dspid`  |
| UI-FE-OPS-CC    | `/callcenter`              | `callcenter`       | `ea233a00` | `origin/codex/ui-fe-ops-cc`     |
| UI-FE-OPS-CMP   | `/complaints`              | `complaints`       | `36e314d4` | `origin/codex2/ui-fe-ops-cmp`   |
| UI-FE-OPS-CMPID | `/complaints/[caseNo]`     | `complaint-detail` | `43f1f457` | `origin/codex/ui-fe-ops-cmpid`  |
| UI-FE-OPS-INC   | `/incidents`               | `incidents`        | `66b43ccd` | `origin/codex2/ui-fe-ops-inc`   |
| UI-FE-OPS-INCID | `/incidents/[incidentId]`  | `incident-detail`  | `33e3eca3` | `origin/codex2/ui-fe-ops-incid` |
| UI-FE-OPS-APR   | `/approval-requests`       | `approvals`        | `26587e81` | `origin/codex2/ui-fe-ops-apr`   |
| UI-FE-OPS-RPT   | `/reports`                 | `reports`          | `14b19bb0` | `origin/codex2/ui-fe-ops-rpt`   |
| UI-FE-OPS-REV   | `/revenue`                 | `revenue`          | `18ecca75` | `origin/codex2/ui-fe-ops-rev`   |
| UI-FE-OPS-ATT   | `/attendance`              | `attendance`       | `b86636b5` | `origin/codex/ui-fe-ops-att`    |
| UI-FE-OPS-MNT   | `/maintenance`             | `maintenance`      | `f87e5362` | `origin/codex/ui-fe-ops-mnt`    |
| UI-FE-OPS-DRV   | `/drivers`                 | `drivers`          | `68643cba` | `origin/codex2/ui-fe-ops-drv`   |
| UI-FE-OPS-DRVID | `/drivers/[driverId]`      | `driver-detail`    | `880c4345` | `origin/codex2/ui-fe-ops-drvid` |
| UI-FE-OPS-VEH   | `/vehicles`                | `vehicles`         | `c42ac488` | `origin/codex2/ui-fe-ops-veh`   |
| UI-FE-OPS-VEHID | `/vehicles/[vehicleId]`    | `vehicle-detail`   | `b9fe9412` | `origin/codex2/ui-fe-ops-vehid` |
| UI-FE-OPS-CON   | `/contracts`               | `contracts`        | `2be190a2` | `origin/codex/ui-fe-ops-con`    |
| UI-FE-OPS-CONID | `/contracts/[contractId]`  | `contract-detail`  | `a22ab80e` | `origin/codex2/ui-fe-ops-conid` |
| UI-FE-OPS-FF    | `/feature-flags`           | `flags`            | `b4b69202` | `origin/codex/ui-fe-ops-ff`     |

## Closeout status

As of 2026-06-01:

- the umbrella branch passes the required build, type-check, Storybook, and route-smoke acceptance checks,
- the ops closeout Storybook surface still covers every packet §5 route anchor through `packages/ui-web/src/ops-console-closeout.stories.tsx`,
- this branch is ready for reviewer handoff once the task-scoped closeout commit is recorded and pushed.
