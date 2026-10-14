# PAX-PUSH-DEVICE-API-20261009

Owner: Codex. Independent reviewer: Codex2. 2026-10-14 source delivery;
review, candidate CI, merge and acceptance remain separate lifecycle gates.

## Source authority and implementation

- Frozen R1: `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261014T0948-root/phaseb-push-native-preparation/push/source-continuation-proposal/PAX-PUSH-R1-READY-ATOMIC-API-AND-EXACT-EXISTING-BOOKING-TEST-ADAPTERS-20261014.md`, SHA256 `2c352b948b8e99d5f4837b27a75b0875a3689d33f155cd0d2c9a683e737d21b3`.
- Read `AI_COLLABORATION_GUIDE.md` §0.7, original common.md, accepted
  `01_system_sa_sd.md` A6/A11/A12 and `02_content_and_rules.md`.
- Fresh accepted base: `58c7845d07610c1bc3c03d0809995d7c07bc579e`.
  Optional preparation patch `b1654bc81e80393fc80d8ca44450a5efff1e0b31266e0cf75e7d27301bb4a6ba`
  was checked against this base and adopted; its earlier checks are historical,
  not this delivery's verification. First source anchor:
  `e621325b6ed552147722e9918f170c2b162a4155`, normally pushed.
- `PassengerPushController` exposes POST `/api/passenger-app/push-devices`
  and DELETE `/api/passenger-app/push-devices/:deviceId`, with passenger realm.
  `PassengerPushService.register/unregister` reuse the real
  `PassengerAccountService.getMe/current` persistent active-account/session check.
  Identity comes from the session; forged owners and ambiguous fields are rejected.
  Previous/deleted device ownership is checked against the real registry table,
  including stale rows. Registration delegates once and touches the actual device.
  Responses contain only `{deviceId}` or `{success}`; no token/hash is returned
  or logged. The existing repository sanitizes mutation failures.
- Existing `resolveRouteAuthPolicy` already covers both routes under
  `passenger-app:self`; no auth-policy change is needed. `PassengerAppModule`
  appends the facade/controller. The registry module remains controller-free;
  its global production dependency was already imported by `AppModule`.
- `PassengerBookingService.createRide` wraps the existing sixth `commitBooking`
  callback: persist ride/token, resolve active devices with unchanged ordering,
  then write the route using **the same PoolClient**. Most recently seen eligible
  device supplies actual appId and notificationConsentVersion. Without a device,
  optional notification routing is skipped and durable Web booking succeeds.
  Passenger/order IDs are trusted server values; tenant is null and rideRef is
  the non-bearer order ID. Rejection throws and rolls back the outer transaction.
- Registry `writeFirstPartyRoute/writeRouteSql` shares only existing route SQL:
  advisory lock, partner exclusion, frozen comparison and INSERT. Borrowed mode
  neither connects nor begins/settles/releases the caller's transaction.
  Standalone created/replay still commit; rejection rolls back; errors remain safe.
- Booking's new sixth dependency is required in Nest and TypeScript. The fifth
  complaint dependency retains `@Optional()` and accepts undefined; existing
  first-through-fifth values are preserved. All eight expressly granted legacy
  adapters change only imports and required constructor arguments. Socket-free
  fixtures explicitly resolve no notification devices; hosted Book/QA fixtures
  inject the production registry/repository on their real migrated database.
- Allocation is the original registry's V0116. Forward migration only drops
  NOT NULL on stored route tenant_id; contract/row type is `string | null`.
  Applied V0107/V0108 and reserved V0119 are untouched. SQL columns were compared
  against V0107; no copied/replacement DDL was introduced.
- The sole transport compatibility hunk returns existing configuration_blocked
  for null tenant immediately after relevance lookup, before creating V0108's
  nonnull delivery context. Nonnull delivery behavior remains covered.
  `PASSENGER_PUSH_FIRST_PARTY_ENABLED` stays default false; no deployment change.
- Original dormant cases 1/2 and scanner/assertions are preserved byte-for-byte;
  only case 3's authorized title and two expected caller literals change.
  Export/profile/registry/auth-bootstrap reservations are untouched.

## Finding and acceptance evidence

Machine-specific logs and runnable probe are under this task worktree's
`.local/pax-push-device-api-20261014/`. Commands below completed and results were
read. Node 22.23.2, pnpm 10.33.0, TypeScript 5.9.3, Vitest 4.1.4.

| Finding / acceptance item                                       | Production source / change                                                                                            | Old → revised result                                                                                                                                                                                                                       | Command, exit, evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Remaining limit                                                                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Atomic route transaction                                        | `PassengerPushDevicesRepository.writeFirstPartyRoute`; `PassengerBookingService.createRide`; original `commitBooking` | Native source probe at base 58c: supplied caller ignored, standalone connect/BEGIN/COMMIT/release, exit 1. Revised source uses only borrowed client, zero connect/settlement/release, exit 0.                                              | `node .local/pax-push-device-api-20261014/borrowed-client-probe.cjs <base SHA or working>`; `repro-old.log`, `repro-new.log`. Probe transpiles the real versioned repository and mocks only DB boundary. New unit tests also cover all four outcomes, SQL failure and lost COMMIT reply.                                                                                                                                                                                          | Probe/unit do not prove native PG semantics; new hosted suite pending.                                                  |
| Session/device API; `pax-push-device_api_and_first_party_route` | Actual account session check, facade/controller, production route writer/booking callback                             | 27 new socket-free cases pass, including legal registration/rotation/revoke and absent/foreign/revoked session or foreign device refusal; trusted metadata/no-device booking; rejection rollback; required DI; null and nonnull transport. | `pnpm exec vitest run tests/unit/pax-push-device-api-20261009 tests/unit/push-channel-pg-qa-20261006 tests/unit/push-channel-router-20261006 tests/unit/push-channel-route-exclusion-20261008 tests/unit/push-first-party-fcm-20261006 tests/unit/push-first-party-registry-20261006 --reporter=default --reporter=json --outputFile.json=.local/pax-push-device-api-20261014/push-regression-final.json`, exit 0. 171 pass / 0 fail / 35 skip; includes dormant 3 pass / 0 skip. | 35 skips are 30 existing hosted PG cases plus 5 new native PG cases; no local PG/server. This is not acceptance credit. |
| Preserve original registry semantics                            | Real registry unit tests and unchanged device mutations/resolver                                                      | All 28 original API unit cases pass, including exclusion/replay/content mismatch and error sanitization.                                                                                                                                   | `pnpm --filter @drts/api test tests/unit/passenger-push-devices.repository.test.ts`, exit 0; `api-registry.log`.                                                                                                                                                                                                                                                                                                                                                                  | Hosted original registry/delivery/referral gates still required.                                                        |
| Existing booking/receipt/Web callers                            | Eight exact fixture adapters; no assertions/cases/expectations weakened                                               | 48 booking access + 4 history spec + 40 rating transaction + 50 booking UI = 142 pass / 0 fail / 0 skip.                                                                                                                                   | `pnpm exec vitest run tests/unit/pax-booking-history-20261009/booking-access.test.ts tests/unit/pax-booking-history-20261009/booking-history-spec.test.ts tests/unit/pax-receipt-complaint-20261009/rating-transaction.test.ts tests/unit/pax-web-booking-ui-20261009/booking-ui.test.tsx --reporter=default --reporter=json --outputFile.json=.local/pax-push-device-api-20261014/consumers.json`, exit 0.                                                                       | Native Book/QA adapters require hosted CI.                                                                              |
| Tenant-null migration/type; default-off                         | V0116, route contract/row, single compatibility hunk, unchanged dormant scanner                                       | Static schema/type checks pass; null route transport blocks before context/provider and nonnull behavior passes.                                                                                                                           | `pnpm typecheck:root`; `pnpm --filter @drts/api typecheck`, both exit 0, `typecheck-root-final.log`, `typecheck-api-final.log`; contracts/control-plane-auth build exit 0. Scoped ESLint and Prettier checks, `git diff --check` exit 0 (`lint.log`, `lint-final.log`).                                                                                                                                                                                                           | V0116 execution/rollback visibility awaits migrated hosted DB. No tenantless V0108 delivery claim.                      |
| Same-candidate independent review / CI / merge                  | Candidate lifecycle on this task branch                                                                               | Pending at source publication; full SHA/branch/PR supplied by owner handoff, frozen by machine truth.                                                                                                                                      | Final source/doc commit → ordinary push → PR targeting dev → handoff to Codex2. CI run and review must match that full SHA.                                                                                                                                                                                                                                                                                                                                                       | No done or merge/acceptance claim from unit pass or anchor.                                                             |

Initial unit attempts failed during dependency loading, not product behavior:
the inherited node_modules linked to a removed worker. Rebuilt this worktree's
dependencies with `CI=true pnpm install --offline --frozen-lockfile --ignore-scripts`
(exit 0), and changed the new test's reflect-metadata import to the API-owned
package. Initial new PG test typecheck found quote-union narrowing and explicit
callback-this typing errors; corrected them and reran root typecheck (exit 0).
These failed attempts are not counted as passing verification.

## Hosted and external limits

`device-route.native-postgres.test.ts` adds five hosted-only cases using existing
`PaymentPostgresHarness` and production migrations, native pg and repositories:
live session/device ownership, atomic registered-metadata route+order+token+history,
no-device booking, native varchar constraint failure rolling everything back,
and borrowed replay/mismatch/rollback alongside standalone commit. Only the
external eligibility/geo/payment fixtures and deliberate constraint fault input
are controlled; route SQL, account/session and booking transaction are real.
The existing GitHub CI root unit step picks these up after migration without a
new workflow/verifier/gate. It must produce five passes, not skips, before native
PG evidence is claimed. The existing dormant/PG/regression gate remains intact.

No API, database, preview, HTTP/browser test server, Docker, native emulator,
Firebase/APNs or real provider was run on this VM. Firebase/Apple/Play/provider
inputs and true device delivery remain external work. V0108 delivery tenant is
still nonnull; enabled tenantless FCM is unsupported. No Native/Store/full-system
or release completion credit is implied by this source delivery.
