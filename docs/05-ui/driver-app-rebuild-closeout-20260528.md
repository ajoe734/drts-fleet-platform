# Driver App Rebuild Closeout (2026-05-28)

Owner: Codex2
Reviewer: Claude2
Task: `UI-FE-DRV-UMBRELLA`

## Outcome

`UI-FE-DRV-UMBRELLA` closeout evidence is complete for the rebuild wave:

- all 9 dependent driver-app rebuild tasks are `done` in canonical machine truth
- SOS press-and-hold contract is restored to **2 seconds** in code and test
- driver-app canvas primitives no longer import `@drts/ui-web`; the route layer now uses a task-local driver canvas theme
- device-class screenshots are captured for `412×892` and `360×780`

## Dependency Closure

The canonical task state in `/home/edna/workspace/drts-fleet-platform/ai-status.json` records all 9 dependencies as `done`:

| Task            | Surface           | Status | Commit                                     |
| --------------- | ----------------- | ------ | ------------------------------------------ |
| `UI-FE-DRV-ONB` | onboarding        | `done` | `1b5e58570123e23897b5e02082e28a5bfef0e599` |
| `UI-FE-DRV-IDX` | workspace cockpit | `done` | `e687d13d1b2de6d20a3b909959cd45723f218190` |
| `UI-FE-DRV-JOB` | jobs inbox        | `done` | `2fccea771970b00c57d27a3c3cf6e587d20ab39b` |
| `UI-FE-DRV-TRP` | trip              | `done` | `c3f68db6bb2483c9ae2c570400e994b1c4e02069` |
| `UI-FE-DRV-PP`  | platform presence | `done` | `9b940f78657c44c0a06a1d50e8cf5bcbd02ce1b8` |
| `UI-FE-DRV-EAR` | earnings          | `done` | `45bc2178`                                 |
| `UI-FE-DRV-SHF` | shift             | `done` | `ac16c0753b464182bd7cb08f6248506e1f004a21` |
| `UI-FE-DRV-SOS` | incident / SOS    | `done` | `cee0171b`                                 |
| `UI-FE-DRV-SET` | settings          | `done` | `cfaa53615aabc5c1fd4f310d5d3b94b2eb776a76` |

## Umbrella Verification

Code and contract:

- [apps/driver-app/app/incident.tsx](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ui-fe-drv-umbrella/apps/driver-app/app/incident.tsx:49) now sets `SOS_LONG_PRESS_DELAY_MS = 2000` and updates all user-facing copy to `2 秒`.
- [apps/driver-app/tests/unit/incident-screen.test.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ui-fe-drv-umbrella/apps/driver-app/tests/unit/incident-screen.test.ts:117) asserts the SOS CTA exposes `delayLongPress = 2000` and still requires long-press plus confirmation before submission.
- [apps/driver-app/components/canvas-primitives/canvas-theme.ts](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ui-fe-drv-umbrella/apps/driver-app/components/canvas-primitives/canvas-theme.ts:1) holds the task-local driver canvas theme used by the app after removing `@drts/ui-web` imports from driver-app runtime code.

Commands run in this worktree:

- `pnpm install --frozen-lockfile`
- `pnpm --filter @drts/ui-tokens build`
- `pnpm --filter @drts/contracts build`
- `pnpm --filter @drts/driver-app typecheck`
- `pnpm --filter @drts/driver-app build`
- `pnpm --filter @drts/driver-app test -- --runInBand apps/driver-app/tests/unit/incident-screen.test.ts`
- `grep -Rni '@drts/ui-web' apps/driver-app/app apps/driver-app/components apps/driver-app/lib apps/driver-app/tests`

Device-class evidence:

- [support/sidecars/UI-FE-DRV-UMBRELLA/incident-412x892.png](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ui-fe-drv-umbrella/support/sidecars/UI-FE-DRV-UMBRELLA/incident-412x892.png)
- [support/sidecars/UI-FE-DRV-UMBRELLA/incident-360x780.png](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ui-fe-drv-umbrella/support/sidecars/UI-FE-DRV-UMBRELLA/incident-360x780.png)
- [support/sidecars/UI-FE-DRV-UMBRELLA/browser-verification.json](/home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-ui-fe-drv-umbrella/support/sidecars/UI-FE-DRV-UMBRELLA/browser-verification.json)

Browser verification used `CI=1 EXPO_PUBLIC_DRIVER_ID=driver-dev-001 pnpm --filter @drts/driver-app exec expo start --web --port 19007` and Playwright against `/incident`. The resulting JSON records:

- `hasContent = true`
- `hasOverlay = false`
- `longPressCopyFound = true`
- `reviewCopyFound = true`
- `longPressButtonFound = true`

## Notes

- The local Expo web verification still reports browser-console CORS failures when localhost tries to call the deployed API origin directly. This did not block the SOS screen from rendering or the device-class screenshot capture, but it remains a known limitation of using Expo web against the remote backend without a local proxy.
- `expo prebuild` regenerates `apps/driver-app/android/` and `apps/driver-app/ios/` as untracked directories during `build`; they are verification byproducts and are not part of this task's tracked diff.
