# Driver App Rebuild Umbrella Closeout Draft (2026-05-28)

Owner: Codex  
Reviewer: Claude2  
Task: `UI-FE-DRV-UMBRELLA`

## Scope

This umbrella tracks the closeout of the independent `apps/driver-app`
rebuild. All nine dependent implementation tasks are `done` in
`ai-status.json`, but the umbrella itself is not ready for reviewer handoff
yet because the final device-class runtime screenshot proof is still blocked by
an Expo web bundling failure in the verification environment.

## Dependency completion matrix

| Task | Owner | Reviewer | Status | Commit | Branch | Last update |
| --- | --- | --- | --- | --- | --- | --- |
| UI-FE-DRV-ONB | Codex | Claude2 | `done` | `1b5e58570123e23897b5e02082e28a5bfef0e599` | `origin/codex/ui-fe-drv-onb` | `2026-05-28T09:49:52Z` |
| UI-FE-DRV-IDX | Codex | Claude2 | `done` | `e687d13d1b2de6d20a3b909959cd45723f218190` | `origin/codex/ui-fe-drv-idx` | `2026-05-28T12:12:30Z` |
| UI-FE-DRV-JOB | Codex2 | Codex | `done` | `2fccea771970b00c57d27a3c3cf6e587d20ab39b` | `origin/codex2/ui-fe-drv-job` | `2026-05-26T13:35:32Z` |
| UI-FE-DRV-TRP | Codex2 | Claude2 | `done` | `c3f68db6bb2483c9ae2c570400e994b1c4e02069` | `origin/codex2/ui-fe-drv-trp` | `2026-05-26T13:21:59Z` |
| UI-FE-DRV-PP | Codex2 | Claude2 | `done` | `9b940f78657c44c0a06a1d50e8cf5bcbd02ce1b8` | `origin/codex2/ui-fe-drv-pp` | `2026-05-28T08:29:37Z` |
| UI-FE-DRV-EAR | Codex2 | Codex | `done` | `45bc2178` | `origin/codex2/ui-fe-drv-ear` | `2026-05-28T05:45:03Z` |
| UI-FE-DRV-SHF | Codex2 | Codex | `done` | `ac16c0753b464182bd7cb08f6248506e1f004a21` | `origin/codex2/ui-fe-drv-shf` | `2026-05-26T13:31:25Z` |
| UI-FE-DRV-SOS | Codex | Codex2 | `done` | `cee0171b` | `origin/codex/ui-fe-drv-sos` | `2026-05-28T09:26:06Z` |
| UI-FE-DRV-SET | Codex | Codex2 | `done` | `cfaa53615aabc5c1fd4f310d5d3b94b2eb776a76` | `origin/codex/ui-fe-drv-set` | `2026-05-28T03:33:40Z` |

## Umbrella verification performed in this lane

### 1. SOS press-and-hold contract audit

During umbrella verification, the shipped `incident.tsx` implementation was
found to violate the canonical `press-and-hold 2s` requirement:

- Design/canvas authority:
  `docs/05-ui/drts-design-canvas/Driver App.html` section
  `05 · SOS · press-and-hold 2s`
- Behaviour authority:
  `docs/05-ui/driver-app-design-handoff-packet-20260525.md` §§ 3.4, 3.13, 5
- Broken runtime before fix:
  `apps/driver-app/app/incident.tsx` used `SOS_LONG_PRESS_DELAY_MS = 800`
  with visible copy `0.8 秒`

This umbrella lane corrected the contract on anchor commit `36d235ff`
(`wip(UI-FE-DRV-UMBRELLA): anchor sos-2s-contract`):

- `apps/driver-app/app/incident.tsx`
  - `SOS_LONG_PRESS_DELAY_MS` changed from `800` to `2000`
  - visible helper copy updated from `0.8 秒` to `2 秒`
- `apps/driver-app/tests/unit/incident-screen.test.ts`
  - added an explicit `delayLongPress === 2000` assertion

### 2. Local executable checks

Executed from the assigned worktree after temporarily wiring the canonical
`node_modules` tree into the isolated worktree:

| Command | Result | Notes |
| --- | --- | --- |
| `pnpm --filter @drts/driver-app test -- incident-screen` | `PASS` | `11` files / `39` tests passed, including the new 2s assertion |
| `pnpm --filter @drts/driver-app typecheck` | `FAIL` | unrelated repo issue: `packages/api-client/src/index.ts` imports missing `TenantBookingListResponse` from `@drts/contracts` |
| `pnpm --filter @drts/driver-app build` | `FAIL` | same unrelated type error as typecheck |

The failing `typecheck/build` result is not introduced by the SOS fix; it is a
pre-existing cross-package contract/export mismatch outside the files changed in
this umbrella lane.

### 3. Device-class verification attempt

Acceptance requires screenshots for `412×892` and `360×780`. The verification
attempt used Expo web because it is the only practical device-viewport capture
surface available in this environment.

Evidence created under `support/sidecars/UI-FE-DRV-UMBRELLA/`:

- `incident-412x892-runtime-blocked.png`
- `incident-360x780-runtime-blocked.png`

These PNGs are intentionally preserved as **failed proof**, not acceptance
proof. They are blank because the browser never received an executable bundle.

Observed runtime failure:

- browser request:
  `GET /node_modules/.pnpm/.../expo-router/entry.bundle?...`
- browser result:
  `500 Internal Server Error`, MIME type `application/json`
- Metro error body:
  `Unable to resolve "@drts/contracts" from "apps/driver-app/app/incident.tsx"`
  because the package main/export target `dist/index.js` was unresolved in the
  verification rail

This means the umbrella cannot honestly claim device-class runtime verification
is complete yet.

## Current umbrella status

What is complete:

- all nine dependent tasks are `done`
- SOS `press-and-hold 2s` contract is now corrected in source
- unit-test evidence exists for the corrected hold threshold
- blocker evidence for the runtime screenshot rail is recorded

What still blocks reviewer handoff:

- runnable device-class screenshots on `412×892` and `360×780`
- a green runtime/bundle rail for Expo web, or an alternative accepted mobile
  screenshot method
- resolution or explicit waiver of the unrelated
  `TenantBookingListResponse` export/typecheck failure

## Next action required

Before `UI-FE-DRV-UMBRELLA` can move to `review`, the owner must re-run the
device-class screenshot flow on a verification rail where:

1. `@drts/contracts` and `@drts/ui-tokens` resolve to built outputs for Metro,
2. Expo web serves an executable `entry.bundle`,
3. the incident screen renders visibly at `412×892` and `360×780`,
4. the new `2 秒` copy / `delayLongPress=2000` contract is visible in the
   captured artifact.
