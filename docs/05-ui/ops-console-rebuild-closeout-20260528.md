# Ops Console Rebuild Closeout (2026-05-28)

Owner: Codex
Reviewer: Codex2
Task: `UI-FE-OPS-UMBRELLA`
Design packet: [`docs/05-ui/ops-console-design-handoff-packet-20260525.md`](./ops-console-design-handoff-packet-20260525.md)

## Scope

This closeout covers the umbrella acceptance for the 20-route Ops Console rebuild:

- all dependency tasks are `done` in canonical machine truth,
- Storybook has an ops-specific closeout review artifact,
- the assembled `apps/ops-console-web` build is green on the umbrella branch,
- representative route smoke no longer produces unhandled runtime errors.

## Integration notes

The umbrella branch had to absorb two integration repairs beyond the child task tuples:

1. `apps/ops-console-web/app/contracts/[contractId]/page.tsx` was adapted to the current `@drts/contracts` export surface. The reviewer-approved task snapshot referenced an `OpsContractDetailRecord` type that is not present on current `dev`, so the branch now builds a read-only detail view from `VehicleContractRecord` and preserves ops-safe deep links.
2. `apps/ops-console-web/app/complaints/[caseNo]/page.tsx` and [`artifact/route.ts`](../../apps/ops-console-web/app/complaints/[caseNo]/artifact/route.ts) now degrade cleanly when the upstream complaint API does not return JSON. The detail page renders a read-only unavailable state instead of throwing, and the artifact route returns explicit `503` JSON instead of surfacing an unhandled server exception.

## Verification

Commands executed on this umbrella branch:

- `pnpm --filter @drts/ops-console-web build`
  Result: PASS
- `pnpm --filter @drts/ops-console-web typecheck`
  Result: PASS
- `pnpm --filter @drts/ui-web build-storybook`
  Result: PASS

Storybook artifact added by this closeout:

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

The second smoke pass produced no unhandled server exceptions in the app process log.

## Dependency matrix

The table below binds each dependency task to the packet §5 route brief, its canvas anchor, and the shipped task tuple recorded in canonical `ai-status.json`.

| Task            | Packet / route             | Canvas anchor      | Owner   | Reviewer | Done at (UTC)        | Commit     | Branch                          |
| --------------- | -------------------------- | ------------------ | ------- | -------- | -------------------- | ---------- | ------------------------------- |
| UI-FE-TOKENS    | Tokens / shared primitives | n/a                | Claude2 | Codex2   | 2026-05-26T08:25:08Z | `d3f5766f` | `origin/claude2/ui-fe-tokens`   |
| UI-FE-OPS-DSH   | `/dashboard`               | `dashboard`        | Codex2  | Claude2  | 2026-05-26T14:33:44Z | `35ae4509` | `origin/codex2/ui-fe-ops-dsh`   |
| UI-FE-OPS-DSP   | `/dispatch`                | `dispatch-ready`   | Codex   | Codex2   | 2026-05-26T17:52:01Z | `7be06a44` | `origin/codex/ui-fe-ops-dsp`    |
| UI-FE-OPS-DSPID | `/dispatch/[dispatchId]`   | `dispatch-detail`  | Codex   | Codex2   | 2026-05-28T09:36:58Z | `c60c7113` | `origin/codex/ui-fe-ops-dspid`  |
| UI-FE-OPS-CC    | `/callcenter`              | `callcenter`       | Codex   | Codex2   | 2026-05-28T09:35:08Z | `ea233a00` | `origin/codex/ui-fe-ops-cc`     |
| UI-FE-OPS-CMP   | `/complaints`              | `complaints`       | Codex2  | Codex    | 2026-05-26T16:00:26Z | `36e314d4` | `origin/codex2/ui-fe-ops-cmp`   |
| UI-FE-OPS-CMPID | `/complaints/[caseNo]`     | `complaint-detail` | Codex   | Claude2  | 2026-05-26T17:21:59Z | `43f1f457` | `origin/codex/ui-fe-ops-cmpid`  |
| UI-FE-OPS-INC   | `/incidents`               | `incidents`        | Codex2  | Codex    | 2026-05-26T16:06:57Z | `66b43ccd` | `origin/codex2/ui-fe-ops-inc`   |
| UI-FE-OPS-INCID | `/incidents/[incidentId]`  | `incident-detail`  | Codex2  | Codex    | 2026-05-26T20:29:58Z | `33e3eca3` | `origin/codex2/ui-fe-ops-incid` |
| UI-FE-OPS-APR   | `/approval-requests`       | `approvals`        | Codex2  | Claude2  | 2026-05-27T05:49:20Z | `26587e81` | `origin/codex2/ui-fe-ops-apr`   |
| UI-FE-OPS-RPT   | `/reports`                 | `reports`          | Codex2  | Claude2  | 2026-05-26T16:38:38Z | `14b19bb0` | `origin/codex2/ui-fe-ops-rpt`   |
| UI-FE-OPS-REV   | `/revenue`                 | `revenue`          | Codex2  | Claude   | 2026-05-27T05:59:43Z | `18ecca75` | `origin/codex2/ui-fe-ops-rev`   |
| UI-FE-OPS-ATT   | `/attendance`              | `attendance`       | Codex   | Claude2  | 2026-05-26T19:09:27Z | `b86636b5` | `origin/codex/ui-fe-ops-att`    |
| UI-FE-OPS-MNT   | `/maintenance`             | `maintenance`      | Codex   | Codex2   | 2026-05-26T20:37:46Z | `f87e5362` | `origin/codex/ui-fe-ops-mnt`    |
| UI-FE-OPS-DRV   | `/drivers`                 | `drivers`          | Codex2  | Claude2  | 2026-05-26T19:35:38Z | `68643cba` | `origin/codex2/ui-fe-ops-drv`   |
| UI-FE-OPS-DRVID | `/drivers/[driverId]`      | `driver-detail`    | Codex2  | Claude   | 2026-05-27T06:37:24Z | `880c4345` | `origin/codex2/ui-fe-ops-drvid` |
| UI-FE-OPS-VEH   | `/vehicles`                | `vehicles`         | Codex2  | Claude   | 2026-05-27T06:39:37Z | `c42ac488` | `origin/codex2/ui-fe-ops-veh`   |
| UI-FE-OPS-VEHID | `/vehicles/[vehicleId]`    | `vehicle-detail`   | Codex2  | Claude2  | 2026-05-28T10:34:40Z | `b9fe9412` | `origin/codex2/ui-fe-ops-vehid` |
| UI-FE-OPS-CON   | `/contracts`               | `contracts`        | Codex   | Claude   | 2026-05-28T04:44:32Z | `2be190a2` | `origin/codex/ui-fe-ops-con`    |
| UI-FE-OPS-CONID | `/contracts/[contractId]`  | `contract-detail`  | Codex2  | Codex    | 2026-05-26T20:55:10Z | `a22ab80e` | `origin/codex2/ui-fe-ops-conid` |
| UI-FE-OPS-FF    | `/feature-flags`           | `flags`            | Codex   | Claude2  | 2026-05-28T03:30:18Z | `b4b69202` | `origin/codex/ui-fe-ops-ff`     |

## Closeout status

As of this packet:

- all 20 dependency tasks required by `UI-FE-OPS-UMBRELLA` are `done` in canonical machine truth,
- the umbrella branch adds the missing ops Storybook review artifact,
- local build and smoke verification are green enough for reviewer handoff,
- the branch still needs the normal task-scoped commit, push, and reviewer approval before the owner can mark the umbrella task `done`.
