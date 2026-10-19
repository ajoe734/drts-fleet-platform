# Driver terminal location display — 2026-10-19

Task: `DRIVER-TERMINAL-LOCATION-DISPLAY-20261019`  
Owner: Codex2; independent reviewer: Codex  
Base: `61fa7cf44fb25d8be36634357fa3549286b96b84`

## Observed defect

The deployed shared-dev Driver page correctly showed a terminal task and disabled
its controls, but its Map location panel still promised heartbeat retries when
there was no fix. A retained recent fix could instead say “GPS 即時回報”. These
are location-display findings; the captured evidence does not establish network
heartbeats after termination.

The existing, independently qualified evidence includes:

| Same order UUID                        | Stage                          | PNG in the original finite qualification directory              |
| -------------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| `d8dd613e-7d40-4b28-8f26-77a8604e2083` | `C-cancelled-history`          | `decoded/core/51-C-cancelled-history-driver.png`                |
| `ae15eff2-acc1-4ad2-bd8e-839d011d8932` | `D-accepted-then-cancelled`    | `decoded/additional/08-D-accepted-then-cancelled-driver.png`    |
| `6e8b4ea2-f622-4fc1-86a0-86b00e348a2e` | `H-arrived-then-cancelled`     | `decoded/additional/17-H-arrived-then-cancelled-driver.png`     |
| `fb4bf6f3-704f-4ed0-8b1c-0e513b7e81ce` | `G-driver-rejected-same-order` | `decoded/additional/38-G-driver-rejected-same-order-driver.png` |

The original evidence directory is
`.local/passenger-transport-bureau-review-20261015/parallel-work-routing-20261018/accepted61fa-original-shared-cloud-finite-qualification-20261019/`.
Root's finding receipt is
`.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/Root-accepted61fa-current-Journey-payment-and-terminal-GPS-finding-handoff.json`,
SHA-256 `c6f80b184228c7555a6a81caf82c2b6a6d88c59042cf5564c060b388d967bc1e`.

## Implementation and expected behavior

Both actual `DriverTripMap` implementations pass their task to
`getDriverLocationFixState`. The helper uses the existing contracts
`DRIVER_TASK_TRANSITIONS` table: a status with no permitted next transition is
terminal. It does not introduce another terminal-status business table.

| Task and location                                                      | Expected location panel                                                                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completed, cancelled or rejected; no valid coordinate                  | “本任務定位已停止”; no last location available, with no retry promise                                                                             |
| Completed, cancelled or rejected; valid retained coordinate of any age | “本任務定位已停止”; last known coordinate is for reference and does not represent current position; coordinate prefix is “Last driver coordinate” |
| Active; no valid coordinate                                            | Existing missing-fix message                                                                                                                      |
| Active; valid fix within 60 seconds                                    | Existing fresh-fix message, accuracy and coordinate                                                                                               |
| Active; valid fix older than 60 seconds                                | Existing stale-fix message, accuracy and coordinate                                                                                               |

On the native map, terminal tasks set both `showsUserLocation` and
`showsMyLocationButton` to false. Active fresh/stale fixes retain the existing
user-location behavior; active missing fixes retain the previous button behavior.
Pickup/dropoff coordinates, route authority, fallback, and external-navigation
handoff are unchanged. A retained driver coordinate is not claimed to be a
task-specific GPS history record.

## Local verification

All commands run without a product, browser, HTTP, PostgreSQL or Compose server,
using the existing dependencies from an isolated locked worktree. No installation
was performed.

From `apps/driver-app`:

```sh
pnpm exec vitest run tests/unit/driver-navigation.test.ts tests/unit/driver-trip-map.test.ts
pnpm exec eslint lib/driver-navigation.ts components/driver-trip-map.tsx components/driver-trip-map.web.tsx tests/unit/driver-navigation.test.ts tests/unit/driver-trip-map.test.ts --max-warnings=0
pnpm exec tsc --noEmit
```

The unchanged baseline passed 13 tests. With regression assertions and the old
production code, 5 assertions failed and 13 tests passed: all three terminal
statuses still returned fresh GPS, and both real Map components showed the
missing-GPS retry text. After the correction, all 18 tests pass; scoped ESLint and
driver-app typecheck pass.

The existing helper cases cover active missing/fresh/stale behavior. The added
terminal cases exercise completed/cancelled/rejected tasks with missing, invalid,
fresh and stale coordinates. The existing component test imports both real
native and web components and checks terminal missing/retained location text,
preserved pickup/dropoff content, and the native MapView location props. Existing
forwarded-route and navigation assertions remain in place. The MapView is mocked
in this unit test; these results do not claim real SDK rendering.

Task-owned local logs and the final candidate receipt are under
`.local/driver-terminal-location-display-20261019-evidence/`:

- `regression-before-fix.log`: expected 5 failing regression cases on the original production implementation.
- `candidate-navigation-map-tests.log`: final source, 18 passing tests.
- `candidate-scoped-eslint.log`: scoped lint, exit 0.
- `candidate-driver-typecheck.log`: driver-app typecheck, exit 0.
- `candidate-verification.json`: commands, outcomes and source/log hashes.
- `candidate-handoff.json`: full immutable candidate SHA, PR and normal handoff result.

The first test invocation from repository root found no tests because Vitest's
include is relative to `apps/driver-app`; the commands above use that directory.
An intermediate sparse-worktree attempt lacked the tracked shared tsconfig;
adding that read-only config resolved the setup issue. A whitespace-only text
collector mismatch was corrected before the passing run. The first anchor hook
also required the tracked API ESLint configuration imported by the root config;
it was added to the sparse checkout and the normal hooks then passed.

## Shared-dev and native review still to execute

The new candidate has not been deployed or viewed in a browser or on a native
device. On an authorized shared-dev deployment and a separately available native
device/build, the reviewer can open a completed/cancelled/rejected task with and
without a retained coordinate, confirm the stopped/history text in the actual Map
panel, and confirm the native current-location pin/button are absent. An active
task should retain its existing missing/stale/fresh and navigation behavior.

Neither this unit verification nor the earlier cloud snapshots establish actual
native GPS, post-terminal network behavior, a real external map/provider session,
human formal acceptance, or full Passenger UC01–16 completion. The existing cloud
run used documented SIM locations; this change does not alter that producer,
heartbeat/network code, backend commands, or authentication. The Passenger payment
wrapper finding remains with its original Journey owner. The original valid
terminal-task closeout remains separate.

Acceptance keys
`driver_terminal_location_display_matches_task_state` and
`driver_terminal_location_display_exact_candidate_validation` are submitted for
independent reviewer assessment; the owner does not record them or approve,
merge, publish or deploy this candidate.
