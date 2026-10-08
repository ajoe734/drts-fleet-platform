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
  replaying/inserting V0107. The repair must use exactly that lock in the
  caller's transaction before reading V0107 or writing V0104/sequence.
- V0104 defines partner `order_id varchar(255)` PK and the sequence FK;
  V0107 defines first-party `order_id varchar(255)` PK. There is no cross-table
  constraint. The new read needs only `order_id`, with the order parameter
  unchanged. No recipient/channel inference or schema fallback is permitted.
- The legacy sequence PG fixture needs full formal V0107 plus the `iam`
  schema dependency. Its original seven assertions must remain intact.

## Finding-level verification ledger

| Finding / required acceptance                        | Source and change                                                                                                            | Baseline → repaired result                                                        | Commands / evidence                                                                                                                                                                                                                                       | Pending / limitation                                               |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| PG-QA-F1 lock/check ordering and reverse write       | Shared production helper and both repository wrappers                                                                        | Baseline dedicated suite: 2 passed / 8 failed / 0 skipped, exit 1; repair pending | `pnpm exec vitest run tests/unit/push-channel-route-exclusion-20261008 --reporter=default --reporter=json --outputFile.json=.local/push-channel-route-exclusion-20261008/baseline.json`; `baseline.log`                                                   | DB I/O is mocked; actual PG mutual exclusion remains a hosted gate |
| PG-QA-F1 non-blocking booking and savepoint recovery | Production referral service/repository; new conflict and lock/read-error regressions                                         | Baseline referral run recorded in `baseline-referral.log/json`; repair pending    | `env -u DATABASE_URL -u PARTNER_NOTIFY_SEQ_TEST_DATABASE_URL pnpm exec vitest run tests/unit/push-referral-route-write-20261006 --reporter=default --reporter=json --outputFile.json=.local/push-channel-route-exclusion-20261008/baseline-referral.json` | No VM database/server is started                                   |
| `route_exclusion_shared_writer_source_regression`    | Lock/check before insert; unchanged positive/replay and route+sequence transaction boundary; formal V0107 fixture dependency | Implementation and final regression pending                                       | Same production source baseline above, test commands below                                                                                                                                                                                                | Requires repaired helper, affected regression and review           |
| `route_exclusion_exact_sha_review_ci_merge`          | Task branch `codex2/push-channel-route-exclusion-20261008`                                                                   | Pending candidate                                                                 | Exact SHA/PR will be recorded through handoff                                                                                                                                                                                                             | Independent Codex review, applicable CI and actual merge pending   |

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
