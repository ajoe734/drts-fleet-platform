# PUSH-CHANNEL-ROUTE-EXCLUSION-20261008

Owner: Codex2. Reviewer: Codex. Source baseline:
`f601cb2c3ef43c05fdad8e109370be4d814ea7e8`.

## Finding and repair boundary

PG-QA-F1 violates channel design D2: a first-party route followed by either
partner repository writer, or simultaneous opposite-channel writers, can leave
both routes committed. The resolver then returns `ambiguous`.

Read the complete original QA artifact at
`74f7f04440cdc1cd3ec9db26b218fa12f9c909fe:docs/04-uat/passenger-push-channel-20261006/PUSH-CHANNEL-PG-QA-20261006.md`,
the channel common rules and design D2–D7, and the production callers below.
[Original CI 37727675410](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37727675410)
at that SHA failed. Downloaded artifact `11527844488` (`test-results`), read both
F1 assertion failures and all four QA suite counts: referral 9 passed, registry
9 passed / 2 failed, delivery 10 passed, dormant 3 passed, zero skips.
The JSON SHA-256 is
`1792b9b4734c7de9b8148fef7d2861f6adcd1efcca17ab2ea855a5f35c5c2121`.
The original QA branch and draft PR #2433 remain unchanged.

Actual production boundary:

- `persistOrderPartnerNotificationRoute` is shared by
  `MultiTaxiRepository.writeOrderPartnerNotificationRoute` (BEGIN/COMMIT,
  rollback and null on error) and
  `OwnedMobilityRepository.writeOrderPartnerNotificationRoute` (existing
  transaction plus notification-only savepoint; standalone calls use
  `withTransaction`).
- `OwnedMobilityService.createTenantBooking` calls that writer through
  `writeReferralRoute` before booking commit/publication.
  `MultiTaxiService.writeOrderPartnerNotificationRouteIfApplicable` also
  treats notification setup as non-blocking. Resolution continues to use the
  authenticated entry, durable identity link and registry, not request claims.
- `PassengerPushDevicesRepository.writeFirstPartyRoute` already takes
  `pg_advisory_xact_lock(hashtextextended($1, 0))`, key
  `passenger-push-first-party-route:<orderId>`, before checking V0104 and
  replaying/inserting V0107. The repaired helper uses exactly that lock in the
  caller's transaction before reading V0107 or writing V0104/sequence.
- V0104 defines partner `order_id varchar(255)` PK and the sequence FK;
  V0107 defines first-party `order_id varchar(255)` PK. There is no cross-table
  constraint. The new read needs only `order_id`, with the order parameter
  unchanged. No recipient/channel inference or schema fallback is permitted.
- The legacy sequence PG fixture now applies full formal V0107 plus the `iam`
  schema dependency. All seven original test bodies and beforeEach are byte-for-byte
  unchanged from the baseline; only the beforeAll migration setup changed.

## Finding-level verification ledger

| Finding / required acceptance                        | Source and change                                                                                                            | Baseline → repaired result                                                                                                         | Commands / evidence                                                                                                                                                                                                                                       | Pending / limitation                                                                                          |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| PG-QA-F1 lock/check ordering and reverse write       | Shared production helper and both repository wrappers                                                                        | Baseline: 2 passed / 8 failed / 0 skipped (exit 1) → repaired: 10 passed / 0 skipped (exit 0)                                      | `pnpm exec vitest run tests/unit/push-channel-route-exclusion-20261008 --reporter=default --reporter=json --outputFile.json=.local/push-channel-route-exclusion-20261008/baseline.json`; `baseline.log`                                                   | DB I/O is mocked; actual PG mutual exclusion remains a hosted gate                                            |
| PG-QA-F1 non-blocking booking and savepoint recovery | Production referral service/repository; new conflict and lock/read-error regressions                                         | Baseline: 19 passed / 3 failed / 0 skipped (exit 1) → repaired: 22 passed / 0 skipped (exit 0)                                     | `env -u DATABASE_URL -u PARTNER_NOTIFY_SEQ_TEST_DATABASE_URL pnpm exec vitest run tests/unit/push-referral-route-write-20261006 --reporter=default --reporter=json --outputFile.json=.local/push-channel-route-exclusion-20261008/baseline-referral.json` | No VM database/server is started                                                                              |
| `route_exclusion_shared_writer_source_regression`    | Lock/check before insert; unchanged positive/replay and route+sequence transaction boundary; formal V0107 fixture dependency | Implemented at anchor `35505781432051e16b8fa9e0fe2b53b62782ed65`; combined regression 477 passed, first-party repository 28 passed | Same production source baseline above, test commands below                                                                                                                                                                                                | Local source regression passes; 21 PG cases skipped locally, hosted validation and independent review pending |
| `route_exclusion_exact_sha_review_ci_merge`          | Task branch `codex2/push-channel-route-exclusion-20261008`                                                                   | Verified source anchor `35505781432051e16b8fa9e0fe2b53b62782ed65`; final candidate adds only this evidence ledger                  | The full final SHA, pushed branch, PR and CI references are bound by the canonical handoff; see delivery section below                                                                                                                                    | Independent Codex review, applicable CI and actual merge pending                                              |

The dedicated tests invoke the actual helper and repositories. Only DB query
responses/errors and suspended promises are mocked, to test awaiting the lock
and opposing-route read, refusal before any insert, legal create, frozen replay,
error propagation, transaction ownership and savepoint scope. They do not model
PostgreSQL lock scheduling, rollback or visibility. The existing referral harness
mocks DB I/O while retaining production booking/route/outbox logic; its advanced
sequence replay test remains. Real concurrency and atomic rollback claims need
the original hosted PG suite.

Machine-specific evidence is under this worker's
`.local/push-channel-route-exclusion-20261008/`. Node `22.23.2`, pnpm `10.33.0`,
Vitest `4.1.4`. Initial missing Vitest dependency links were repaired with
`CI=true pnpm install --frozen-lockfile` (exit 0; `install.log`); that setup error
is not the regression reproduction.

This source repair does not close the parent QA acceptance. After integration,
the preserved QA branch must normally merge dev and rerun its 9/11/10 PG cases,
3 dormant cases, legacy 7/7/7 and C111–C115 34-case gates with zero skips.
No deployment, feature flag, secret, FCM send or migration changes are authorized.

## Repaired verification and delivery

Verified source/test anchor: `35505781432051e16b8fa9e0fe2b53b62782ed65`.
The final candidate retains that source/test tree and updates only this ledger.
The canonical task handoff supplies the full final candidate SHA and PR; it is
not a claim of independent approval, merge or parent QA acceptance.

The first-party lock/read is awaited before either insert, including on replay.
Conflict returns null before any mutation. SQL errors propagate to existing
wrapper rollback/savepoint handling. No new transaction or fallback exists in
the helper. The frozen route read and initial-sequence-on-create branch are
unchanged. Both wrappers, booking conflict and lock/read/insert failure handling
are covered through production code; original positive and advanced-counter
replay cases are retained.

All commands below finished and their logs were read. Run from the assigned
worker root unless specified. Evidence directory prefix:
`.local/push-channel-route-exclusion-20261008/`.

| Command / scope                                                                                                                                                                                                                                                                                                | Result                                                                                                                                                               | Evidence                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm exec vitest run tests/unit/push-channel-route-exclusion-20261008 tests/unit/push-referral-route-write-20261006 --reporter=default --reporter=json --outputFile.json=.local/push-channel-route-exclusion-20261008/repaired-narrow.json` (DATABASE_URL and sequence PG URL unset)                          | Exit 0; 32 passed / 0 skipped                                                                                                                                        | `repaired-narrow.log/json`                                       |
| Affected regression command below                                                                                                                                                                                                                                                                              | Exit 0; 477 passed / 0 failed / 21 PG skipped; 42 passed files, 3 skipped files                                                                                      | `regression.log/json`                                            |
| From `apps/api`: `env -u DATABASE_URL pnpm exec vitest run tests/unit/passenger-push-devices.repository.test.ts --reporter=default --reporter=json --outputFile.json=../../.local/push-channel-route-exclusion-20261008/first-party-regression.json`                                                           | Exit 0; 28 passed / 0 skipped, including first-party positive/replay/opposing-route rejection                                                                        | `first-party-regression.log/json`                                |
| `pnpm exec tsc -p tsconfig.json --noEmit`                                                                                                                                                                                                                                                                      | Exit 0                                                                                                                                                               | `typecheck-root.log`                                             |
| `pnpm --filter @drts/api typecheck`                                                                                                                                                                                                                                                                            | Initially exit 2: missing generated `@drts/control-plane-auth` declarations. Ran `pnpm --filter @drts/control-plane-auth build` (exit 0), then same typecheck exit 0 | `typecheck-api.log`, `build-auth.log`, `typecheck-api-retry.log` |
| `pnpm exec eslint apps/api/src/modules/tenant-partner/order-partner-notification-route.ts tests/unit/push-channel-route-exclusion-20261008 tests/unit/push-referral-route-write-20261006 tests/unit/system-remediation/sr-partner-notify-seq-20260918/notification-sequence.postgres.test.ts --max-warnings=0` | Exit 0                                                                                                                                                               | `lint.log`                                                       |
| `git diff --check`; compare legacy PG source from `beforeEach` onward with baseline                                                                                                                                                                                                                            | Exit 0; seven tests and setup/reset/assertions preserved                                                                                                             | Task diff                                                        |

```bash
env -u DATABASE_URL -u PARTNER_NOTIFY_SEQ_TEST_DATABASE_URL \
  -u PARTNER_NOTIFY_TRANSPORT_TEST_DATABASE_URL \
  -u PARTNER_NOTIFY_UI_TEST_DATABASE_URL \
  -u PASSENGER_PUSH_CHANNEL_TEST_DATABASE_URL \
  pnpm exec vitest run \
  tests/unit/push-channel-route-exclusion-20261008 \
  tests/unit/push-referral-route-write-20261006 \
  tests/unit/push-referral-assignment-event-20261006 \
  tests/unit/push-first-party-registry-20261006 \
  tests/unit/push-channel-router-20261006 \
  tests/unit/push-first-party-fcm-20261006 \
  tests/unit/system-remediation/sr-partner-notify-* \
  --reporter=default --reporter=json \
  --outputFile.json=.local/push-channel-route-exclusion-20261008/regression.json
```

Result JSON SHA-256 values:

- Baseline dedicated: `e207e01d500de4e20232df9e68c928636dcdb83d7ba4df41bd685cd3e407fea1`.
- Baseline referral: `fd79c2762833870b02c193d2fbb179594107db593cb576eb0f3efe3cd679e568`.
- Repaired affected regression: `3e09ec5d735219fad6555252145784ab5e01fb9a99943afd1eed6f5a322284df`.
- First-party repository: `acaaf5f63fabaa709b918546c74550d9c74709715eb45ae75c20787dd3b69689`.

The initial anchor attempt caught one test-only unused mock parameter in lint;
its mock signature was typed explicitly and lint passed before commit. Generated
file guard and `lint-staged --no-stash` run explicitly before commits, with the
automatic hook disabled only to avoid its default stash backup. No design-intent
stash, reset, amend or force push was used. Ordinary remote readback confirms
the parent QA branch still points to `74f7f04440cdc1cd3ec9db26b218fa12f9c909fe`.

Hosted CI for the final PR must run the existing legacy sequence gate against
the repaired fixture. The parent QA's two F1 reproducers and all its original
zero-skip gates remain separately required after this source repair merges.
The local mocked checks and the original failing hosted artifact do not satisfy
those gates; review, CI, merge and external acceptance are separate evidence.
