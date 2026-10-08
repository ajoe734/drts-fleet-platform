# PUSH-CHANNEL-PG-QA-20261006

Owner: Codex2. Reviewer: Codex. Baseline: `7785a1abd1cf1fffe06cfdef50df2956fc2eaf9f`.
All five dependencies are `done` as of 2026-10-08. Work is in progress; no PG pass or acceptance is claimed yet.

## Scope and execution boundary

Follow `AI_COLLABORATION_GUIDE.md` §0.7 and the channel design D2–D7.
The new harness creates an isolated random database on the explicitly configured
hosted PostgreSQL service and applies all files in `infra/migrations` unchanged.
It calls production services/repositories. No substitute table definitions or
SQL simulators stand in for those boundaries. No server is started on the VM.

## Findings and acceptance ledger

| Finding / acceptance                                                 | Source and change                                                                                                                                       | Baseline → current result                                                                             | Command / evidence                                        | Remaining limitation                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| PG-QA-F1: partner writer accepts an order already routed first-party | `tenant-partner/order-partner-notification-route.ts` `persistOrderPartnerNotificationRoute`; first-party writer has a one-sided check and advisory lock | Static evidence: partner INSERT neither checks V0107 nor takes the same lock; PG reproduction pending | Reported via owner `progress` to Supervisor on 2026-10-08 | Product source is outside QA write scopes; Supervisor must coordinate owner repair |
| `push-channel-pg-qa_hosted_postgres_suites_zero_skips`               | New production-migration suites and CI gate                                                                                                             | Pending                                                                                               | Hosted run not started                                    | Must read exact candidate results, including original 7/7/7 PG gates               |
| `push-channel-pg-qa_regression_and_dormant_proof`                    | Partner, C111–C115, cancellation and disabled-first-party checks                                                                                        | Pending                                                                                               | Checks not started                                        | C111–C115 receiver tests must run hosted; no local receiver                        |

SQL/migration comparison, per-case counts, commands and hosted run evidence will
be added here as each verification unit completes. The F1 finding stays open
until a corrected production writer passes the same reproducer.

## Implemented checks and first anchor evidence

Published anchor `d7f9bd0577d5ef31a690bbf472562f0bd099e6b0`,
[draft PR #2433](https://github.com/ajoe734/drts-fleet-platform/pull/2433).
This is not a review candidate. The first hosted run is
[CI 37725218260](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37725218260);
results pending when this section was written. Do not infer PG success from
local test collection or the separate integration workflow's skipped jobs.

| Suite                                 | Exact required passed cases | Production behavior                                                                                                                                                                                                                                                                 |
| ------------------------------------- | --------------------------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `referral.postgres.test.ts`           |                           9 | Referral booking/route transaction visibility, replay, absent/revoked durable identity, SQL savepoint recovery, assignment/reassignment generations, superseded transport relevance, outbox failure rollback, cancellation, delayed ETA generation, disclosure MAX/profile fallback |
| `registry.postgres.test.ts`           |                          11 | Partial unique index, concurrent cross-passenger rebind, rotation, fenced invalidation, concurrent cap, cross-rebind deadlock regression, 60-day resolver, SQL failure rollback, concurrent route replay, both-direction route exclusion                                            |
| `delivery.postgres.test.ts`           |                          10 | Four channel decisions, no-channel/ambiguous sealed outcomes, competing service workers, frozen retry recipients, twelve immutable context fields, expired/replaced fence, outcome rollback, disabled service, revocation during metadata await                                     |
| `dormant.test.ts`                     |                           3 | Production provider/transport early guard, tracked deployment config scan, production AST caller inventory plus Nest controller metadata                                                                                                                                            |
| Existing sequence / transport / UI PG |                   7 / 7 / 7 | Existing suite files and original gate assertions unchanged                                                                                                                                                                                                                         |
| C111–C115                             |                          34 | Existing hosted receiver/API-key/webhook/settlement/geo/recording regressions unchanged                                                                                                                                                                                             |

The new gate additionally discovers every partner notification `.test.ts` and
`.test.tsx` suite and all referral/registry/router/FCM suites, requiring each to
appear exactly once, run at least one case, and have no skipped/failed case or
hook failure. It rejects duplicate case identities and missing reports. Nine
Python regressions prove rejection of missing/duplicate suites, non-passed
statuses, under/over counts, hook failures, wrong paths and skipped regressions.

Completed local checks on the anchor's code, Node 22.23.2 / pnpm 10.33.0:

- `pnpm exec tsc -p tsconfig.json --noEmit`: exit 0.
- `pnpm exec eslint tests/unit/push-channel-pg-qa-20261006 --max-warnings=0`: exit 0.
- `python3 -m unittest tools/ci/test_partner_notification_postgres_gate.py`: exit 0, 9 passed.
- Scoped Vitest over new QA, router, registry, FCM, referral and all
  `sr-partner-notify` suites: exit 0, **467 passed, 49 PG skipped**, 42 passing
  files / 6 skipped files. The PG URLs and `DATABASE_URL` were explicitly unset.
  No C111–C115 receiver was started on this VM.
- Running the new gate on that incomplete local report: exit 1, correctly
  rejecting all six skipped PG suites and the absent hosted C111–C115 suite.

Machine-specific logs: assigned worker `.local/push-channel-pg-qa-20261006/`
(`typecheck.log`, `lint.log`, `gate-tests.log`, `local-tests.log`,
`local-tests.json`, `local-gate-negative.log`). Initial formatting could not run
because dependency links were broken; frozen-lockfile installation restored
the dependencies before the successful checks. A package setup failure is not
a product regression or a PG execution result.

## SQL / migration field comparison

This compares the SQL actually executed by the wave's production repositories,
including shared reads/writes reached from its services. Types below are the
SQL types, not mock fixture types. Every new PG database applies **all**
production migration files; these are the relevant authorities:

- [V0011 runtime snapshots](../../../infra/migrations/V0011__phase1_runtime_snapshots.sql),
  [V0021 partner registry](../../../infra/migrations/V0021__partner_registry_and_eligibility_persistence.sql),
  [V0030 identity links](../../../infra/migrations/V0030__partner_user_identity_link_persistence.sql).
- [V0056 runtime/outbox](../../../infra/migrations/V0056__multi_taxi_runtime_compliance_closure.sql),
  [V0064 generated booking ownership](../../../infra/migrations/V0064__owned_booking_cross_instance_identity.sql),
  [V0087 reservations](../../../infra/migrations/V0087__dispatch_resource_reservations.sql),
  [V0088 voice/actor identity](../../../infra/migrations/V0088__voice_runtime_identity_linkage.sql),
  [V0089 aggregate version](../../../infra/migrations/V0089__owned_order_aggregate_version.sql),
  [V0090 assignment reservation fence](../../../infra/migrations/V0090__dispatch_assignment_reservation_fence.sql).
- [V0099 claims/receipts](../../../infra/migrations/V0099__sr_passenger_push_delivery.sql),
  [V0104 partner route/counter](../../../infra/migrations/V0104__sr_partner_notification_binding_and_routing.sql),
  [V0105 partner delivery context](../../../infra/migrations/V0105__sr_partner_notification_delivery_context.sql),
  [V0107 devices/first-party route](../../../infra/migrations/V0107__push_channel_first_party_registry_and_routing.sql),
  [V0108 first-party context](../../../infra/migrations/V0108__push_channel_first_party_delivery_context.sql).

| Production symbol / table                                                                                                  | Columns used and migration agreement                                                                                                                                                                                                                                                                                                                                                                                                                          | Behavior / drift disposition                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PartnerUserIdentityLinkRepository.resolveOrCreate`, `findByDrtsPassengerId`; `admin.phase1_partner_user_identity_links`   | V0030: entry_slug varchar(150), partner_user_ref / record recipient varchar(255), drts_passenger_id varchar(100), status/consent_scope varchar(50), linked_at/last_seen_at/created_at/updated_at timestamptz, record jsonb; composite PK entry_slug+partner_user_ref                                                                                                                                                                                          | Durable identity used by real referral service; no invented tenant column in this table                                                                                                                                                                                 |
| `persistOrderPartnerNotificationRoute` (called by both repositories); `mobility.phase1_order_partner_notification_routes`  | V0104: order_id/partner_user_ref/passenger_subject_ref/ride_ref varchar(255), tenant_id/partner_id/drts_passenger_id varchar(100), entry_slug varchar(150) FK, consent_bundle_version/notification_policy_version varchar(50), identity_linked_at/created_at timestamptz; order PK + ride_ref unique                                                                                                                                                          | Columns match. **PG-QA-F1**: partner writer omits reverse exclusion and shared lock; schema has no cross-table exclusion constraint                                                                                                                                     |
| Shared route writer and `allocateNotificationEventSequence`; `mobility.phase1_partner_notification_sequences`              | V0104: order_id varchar(255) PK/FK to partner route; next_sequence bigint                                                                                                                                                                                                                                                                                                                                                                                     | INSERT only after new route; UPDATE RETURNING next_sequence-1 shares outbox transaction; bigint converted to JS number; original concurrent/replay/rollback 7-case suite retained                                                                                       |
| `OwnedMobilityRepository.persistOrderWorkflow`, order locks                                                                | V0011 order_id/order_no, status, order_source, service_bucket, dispatch_semantics, timestamps, record jsonb; V0056 runtime_profile_code; V0064 generated tenant_id/booking_id; V0088 actor/link columns; V0089 generated aggregate_version integer >0                                                                                                                                                                                                         | Uses real generated columns and existing snapshot writes; booking+route visibility and rollback checked                                                                                                                                                                 |
| `loadOrderCancellationForUpdate`; assignments/jobs/tasks                                                                   | V0011 assignment_id/dispatch_job_id/order_id/task_id varchar(100), status varchar(50), created_at/updated_at timestamptz, record jsonb; tasks have assignment_id; V0087 reservations use uuid IDs, assignment/order FKs and active resource partial unique index; V0090 deferrable assignment trigger                                                                                                                                                         | Assignment generation is `count(*)`, **not** a nonexistent assignment_version column; durable route scope checks order/tenant/partner/entry/passenger                                                                                                                   |
| `persistChangesWithExecutor` ETA and outbox write                                                                          | V0056 outbox_id/order_id/passenger_subject_ref varchar(255), event_type text, assignment_version nullable integer, payload jsonb, status checked text, attempt_count integer, next_attempt_at/created_at/delivered_at timestamptz; V0011 task assignment_id and V0104 order route join                                                                                                                                                                        | ETA reads its task's stable `referral-assignment:` outbox generation. No migration enum change needed for trip_cancelled because event_type is text. PG probes cover the production ETA write, delayed old-task generation after reassignment, and MAX/profile fallback |
| `findPartnerNotificationRelevance`                                                                                         | V0011/V0056 order_id, status, runtime_profile_code; V0056 disclosure order_id and assignment_version integer; V0011 assignments order_id                                                                                                                                                                                                                                                                                                                      | MAX(disclosure assignment_version) first, then business_dispatch count fallback only; mapped to number                                                                                                                                                                  |
| `PassengerPushDevicesRepository.registerDevice`, cap, touch/revoke/invalidate/resolve; `iam.phase1_passenger_push_devices` | V0107 device_id uuid default gen_random_uuid; passenger varchar(100); platform varchar(10); provider varchar(20); app_id varchar(150); app_version/consent varchar(50); token text; token_sha256 varchar(64); status varchar(10); status_reason text; registered_at/last_seen_at/invalidated_at/created_at/updated_at timestamptz                                                                                                                             | Active-only provider+hash unique index allows preserved revoked history. Global transaction advisory lock serializes registration/cap. Null/stale last_seen_at excluded; cap=10 and cutoff=60 days executed in PG. Public records exclude raw token                     |
| `writeFirstPartyRoute`, `findOrderFirstPartyNotificationRoute`                                                             | V0107 order_id varchar(255) PK, tenant_id/passenger varchar(100), subject/ride_ref varchar(255), app_id varchar(150), policy/consent varchar(50), created_at timestamptz; ride_ref unique; policy CHECK first_party_notification_v1                                                                                                                                                                                                                           | Field mappings match; first-party replay/content mismatch enforced. First-party writer checks partner under advisory lock; missing reciprocal implementation is F1                                                                                                      |
| `resolvePassengerNotificationChannel`                                                                                      | `to_jsonb` on V0104 + V0107 rows by order_id; all mapped fields listed above                                                                                                                                                                                                                                                                                                                                                                                  | Snapshot-based partner/first-party/ambiguous/none; explicit corruption fixture tests fail-closed ambiguous case without trusting the broken writer                                                                                                                      |
| `listDuePartnerNotifications`, `claimPartnerNotification`                                                                  | V0056 outbox state, payload and dates; V0105 retry_disposition/retry_policy_snapshot/expires_at; V0099 outbox_id varchar(255), subject varchar(255), worker_id text, claim_state checked text, fence_token integer, lease_expires_at/claimed_at timestamptz                                                                                                                                                                                                   | channelRouting → firstPartyNotification → partner context → partner payload priority preserved; row lock plus claim UPSERT fence shared by all channels                                                                                                                 |
| `prepareFirstPartyNotificationContext`, context mapper                                                                     | V0108 outbox_id varchar(255) PK/FK, order_id varchar(255) FK to V0107, tenant_id varchar(100); route_snapshot/retry_policy_snapshot jsonb object, target_devices/device_outcomes jsonb array, wire_message jsonb, wire_message_hash text, event_sequence positive bigint, expires_at/created_at/delivered_at timestamptz, delivery_target varchar(30), delivery_stage varchar(20), retry_disposition varchar(30), failure_reason varchar(50), receipt_id text | INSERT columns and mapping match. Trigger guards every field except six outcome/evidence fields; twelve mutation probes and idempotent preparation exercise immutability                                                                                                |
| `findFirstPartyNotificationDeviceToken`                                                                                    | V0108 target_devices JSON parsed as deviceId uuid/tokenSha256 text; V0107 device_id/token_sha256/token/status/passenger/app/last_seen_at; V0099 fence_token/claim_state/lease_expires_at                                                                                                                                                                                                                                                                      | Join and casts match physical types. Eligibility and clock_timestamp fence rechecked just before send; rotated/rebound/revoked devices cannot be replaced with new recipients                                                                                           |
| `recordPushDeliveryOutcome`                                                                                                | V0099 receipt_id uuid default, outbox_id/subject varchar(255), dedupe_key/provider fields text, fence_token integer, device_delivery_state defaults unknown; V0108 delivery_stage/retry_disposition/failure_reason/receipt_id/delivered_at/device_outcomes; V0056 payload JSON plus outcome status/counters/dates                                                                                                                                             | Context, receipt, outbox update and claim release share transaction. Bad final status must roll everything back. FCM accepted receipt remains provider_accepted, never device_received                                                                                  |

No SQL column/type mismatch is established by this static comparison. F1 is a
behavioral invariant gap, not a renamed column. Runtime conclusions remain
pending hosted execution; the independent reviewer must inspect the final
candidate and the result ledger, not infer success from this table.

## Hosted round 1 — fixture failure, not a product reproduction

Run 37725218260, published anchor `d7f9bd0577d5ef31a690bbf472562f0bd099e6b0`,
Product smoke job `113141976285`, artifact `11527404674` (`test-results`).
Downloaded and read the Vitest JSON on 2026-10-08. Root result: **6094 passed,
28 failed, 49 pending**. All 28 new PG failures came from `beforeEach`:
`booking_audit_intent is append-only; TRUNCATE is not permitted`.
All production migrations had applied; the harness's cascading reset was invalid.
This is QA finding **PG-QA-H1**, and is not a dynamic reproduction of F1.

- Existing sequence/transport/UI PG suites: **7/7/7 passed, zero skipped**;
  reran the unchanged original gate against the downloaded JSON: exit 0.
- C111–C115: **34 passed, zero skipped**. Partner notification suites, including
  component, cross-app and navigation integration cases, passed with zero skips.
- Dormant checks: **3 passed**. New PG gate correctly failed.
- API unit step did not run after root test failure. The unrelated 49 pending
  root tests are not represented as successful PG acceptance.
- Integration run 37725218325 completed successfully only as an owner draft
  checkpoint; its product jobs were skipped. Full log read and saved locally.

H1 repair: preserve all production audit triggers and create each test database
with `CREATE DATABASE ... TEMPLATE <closed migrated database>`. Only the
harness's randomly named databases are dropped. No TRUNCATE, trigger disabling,
schema rewrite or shared-database cleanup remains in the harness. Each test
gets all production tables, constraints and migrations with fresh data.

The follow-up also adds delayed ETA and disclosure MAX/profile probes (new PG
counts now **9/11/10**, 30 total). Narrow collection: 3 dormant passed / 30 PG
skipped, typecheck and lint exit 0, nine gate tests passed. These local results
only establish compilation/discovery. The follow-up hosted result is still due.
