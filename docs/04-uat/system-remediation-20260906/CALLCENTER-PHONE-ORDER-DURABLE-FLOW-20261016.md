# CALLCENTER-PHONE-ORDER-DURABLE-FLOW-20261016

Owner: Codex. Reviewer: Claude2. Status: in progress after the F8 CI regression and reviewer reopen recorded below; hosted acceptance remains pending. The exact candidate SHA/branch/PR is recorded by the canonical handoff transaction.

The current R4 specification is `/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/CALLCENTER-PHONE-ORDER-DURABLE-FLOW-20261016-R4-real-service-fixtures.json`, SHA256 `b97a2e8858b53ad616c567eed7ba220392c8e6eedbd5e4b7bd5cc282a447150e`. It preserves the original complete R2/R3 product and acceptance requirements and grants the eight exact fixture/caller hunks described in F8. Historical R3 evidence and the rejected candidate remain below.

## Original finding and source boundaries

Original failed source: `bcda359776c7fcc64d478624174c93d6649932d7`, generation `7f5f5cb76edd4579a8e80c56a38fcc8c`, hosted run `38844365857`, job `116792538725`. The supplied immutable evidence reports 21/22 cross-surface scenarios passed, with E2E-003 failing at the immediate canonical GET of the UUID returned by phone creation. No callback failure was observed in that original run because it stopped at the GET.

Fresh implementation base: `b726c5cd08c932502d768e5766bbdf4753e4a1f4`. Recoverable checkpoints: `b6892564c` (regression and repository transaction boundary), `612e117f8` (phone creation and recording propagation). These are WIP anchors, not reviewed candidates. No prior source's CI, merge or acceptance is borrowed.

Product authority: `phase1_prd_detailed_v1.md` §5 callcenter requirements (booking must retain call/recording identity; CTI failure cannot silently lose an order); `phase1_service_contracts_v1.md` §3.9 assigns session/recording index to callcenter and order state to the order service. Production runtime tables and identity uniqueness are defined by `infra/migrations/V0011__phase1_runtime_snapshots.sql` and `V0088__voice_runtime_identity_linkage.sql`; the writer uses `OwnedMobilityRepository.persistOrderWorkflow` and `CallcenterRepository.upsertSession`, not replacement tables or copied business SQL. No migration has been changed. Actual formal PG still has to establish that the complete phone payload can be persisted; delaying a failed SQL statement alone earns no acceptance.

Only phone creation/session/recording handlers and their local helpers are changed. E04 constructor, completion, capture and receipt handlers and complaint/callback-task endpoints remain owned by their original lanes. `getOrderForRead` remains the strict repository reader, with no memory fallback on PG miss/error.

## Implemented behavior

- Production HTTP open, link and recording callback explicitly await durable operations. Legacy synchronous methods remain available for existing memory and voice callers; the durable entrypoints reuse their draft-building logic.
- A call transaction takes a call-specific advisory lock, reads the authoritative target session and stages the new session, order and trace. The order repository uses that same executor. Publication of memory state, successful mutation audits and the order-created event follows commit. SQL/COMMIT rejection rolls back both records and propagates to the original HTTP/idempotency caller.
- Recording attachment/state listeners return their real results. The durable callback resolves its linked order through the transaction's real PG row, including on a peer whose caches were never hydrated. Session and non-voice order updates share the transaction; failed propagation cannot leave a recording-bound success or suppress an identical retry. An already committed identical attachment does not duplicate successful attachment audits.
- A cold peer opening a call allocates the existing call sequence under a transaction lock from persisted sessions, preventing its first local sequence from overwriting a committed call's linkage. Caller phone, agent metadata, evidence masking, voice fence and existing voice evidence rules retain their original authority.
- The original E2E-003 recording URL remains synthetic (`recordings.example.com`); neither these changes nor the tests establish real PSTN/media-provider acceptance.

## Findings and required acceptance

Local evidence directory (machine-specific): `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-callcenter-phone-order-durable-flow-20261016/.local/callcenter-phone-order-durable-flow-20261016/`.

| Finding / acceptance                                                 | Source and fix                                                                                                           | Old → fixed result                                                                                                                                                                                                                                                                         | Command / evidence                                                                                                                                                                                                                                              | Remaining limitation                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1: phone success before order write completes                       | `OwnedMobilityService.buildAndPersistCallCenterOrder`; shared `withPhoneOrderSession`; production `persistOrderWorkflow` | Base returns, exposes a memory order and publishes creation while its actual repository executor is held. Fixed initial regression passes.                                                                                                                                                 | `pnpm exec vitest run tests/unit/callcenter-phone-order-durable-flow-20261016/durable-ack.test.ts`; `before.log` (2 functional failures), `expanded.log` (10 pass).                                                                                             | Real migrated-PG success and genuine complete source CI pending.                                                                                                                                                           |
| F2: session open ACK before write                                    | `CallcenterController.openCallSession`, `openCallSessionForWrite`, `runPhoneSessionWrite`                                | Base controller envelopes success while session SQL is held. Fixed regression waits. Rejected commit leaves neither published session nor successful audit.                                                                                                                                | Same production controller test; original/base reproduction in `before-expanded.log`.                                                                                                                                                                           | Hosted HTTP and peer PG evidence pending.                                                                                                                                                                                  |
| F3: recording callback ignores session/order listener results        | Controller callback; `notifyRecordingAttachment`, `notifyRecordingStateChange`; owned attachment/state handlers          | Separate local base reproduction confirms early callback ACK. Fixed tests cover delayed order propagation, rollback of both records, same-payload retry and pending/failed state ACK. This is additional local evidence, not a claim about unexecuted legs of the original hosted failure. | Base detached checkout under `before-source`, exact original source SHA above; three selected real behavior cases fail. Executor simulation is explicitly limited to SQL completion/failure and row storage.                                                    | Formal PG callback/recording-state tests authored; not run on VM.                                                                                                                                                          |
| F4: failure/replay and one call–one order                            | Original controller and production `IdempotencyService`; call-session link builder                                       | Fixed tests reject failures at order/session/COMMIT boundaries without a completed cached success, then retry/replay the same key; a second order cannot replace the link.                                                                                                                 | `durable-ack.test.ts`; `expanded.log`. Local idempotency uses the production repository's existing memory mode; internal order/session writers remain real production repositories.                                                                             | Hosted companion uses real migrated idempotency rows and genuine PG rejection.                                                                                                                                             |
| F5: cold peer target/read and call identity                          | `getCallSessionForRead`, `findSession`; durable callback's PG order resolution; locked persisted sequence allocation     | Tests authored for cold-cache recording propagation and preserving the first call when a peer opens another.                                                                                                                                                                               | `durable-postgres.hosted.test.ts` and socket-free companion.                                                                                                                                                                                                    | Hosted results pending; no cross-process runtime claim.                                                                                                                                                                    |
| F6: simulated sandbox webhook still calls legacy synchronous methods | Actual alternate caller `sandbox-webhook.adapter.ts:ingest`: started/ended and recording pending/ready/failed branches   | Static caller inspection: these branches currently use `upsertExternalSession`, `closeCallSession`, `attachRecordingCallback`, `markRecordingPending` and `markRecordingFailed` without awaiting durable entrypoints.                                                                      | Exact additional scope requested via owner `progress` at 2026-10-16T03:52:21Z. Extra file has not been edited.                                                                                                                                                  | Supervisor must confirm overlap and grant the exact adapter path, after which the original owner will wire sequential awaits and add boundary tests. This is routine scope coordination, not a new external/security gate. |
| `callcenter_phone-order-and-recording_durable-ACK-full-source-CI`    | All rows above plus unchanged original E2E-003 and all 22 hermetic scenarios                                             | **Not yet satisfied.** Scoped local pass is not formal PG, full22, independent review, complete CI or protected merge.                                                                                                                                                                     | Hosted tests reuse `PaymentPostgresHarness`: full production `db-apply.sh`, checkout migration checksums, real PG and production repositories. Native trigger rejection is failure injection on the actual migrated tables; no substitute schema/writer/reader. | Root alone collects candidate full CI/full22 and publishes composed immutable shared-dev/production runtime. No worker GH poll/rerun/dispatch/deploy. Source completion gives no runtime/full-goal credit.                 |

## Verification ledger

- PASS: initial affected regression: 9 test files / 112 tests, exit 0 (`scoped.log`), including original callcenter, owned mobility, recording workflow and recording recovery cases.
- PASS: expanded fault/retry regression: 10 cases, exit 0 (`expanded.log`).
- EXPECTED FAIL on base: initial two ACK regressions (`before.log`); expanded selected open/create/recording trio fails for the actual early-success behavior (`before-expanded.log`). The selected-test filter skips the other cases only for historical comparison. A first detached-checkout attempt lacked the `zod` dependency symlink (`before-setup-failed.log`); that setup failure is excluded from regression evidence and was corrected before the real three-case reproduction.
- Initial ordinary API typecheck failed with source-versus-shared-dist contract mismatches and a new uninitialized `pending` diagnostic. The new diagnostic was fixed. A separate API source-path typecheck avoids changing the shared canonical build outputs; its result is recorded below after completion.
- Initial root typecheck failed with that same new diagnostic and existing tenant-auth exports / duplicate canonical-versus-worktree `ApiClient` identities. No unrelated files or shared dependency outputs were changed to hide these diagnostics. The final task-only and source checks are recorded below after completion; ordinary root failure is not called a pass.
- Formal PG, original HTTP E2E-003 full recording-index/report/filing/audit chain, all22, mandatory role gates, same-SHA independent review, hosted CI and protected merge: pending. No project server, browser/E2E server, Docker infrastructure or PG service has been started on the worker VM.

The additional exact-source test results, test hashes, final checkpoint and scope decision will be appended before candidate handoff. Do not infer completion from this checkpoint document.

## 2026-10-16 continued implementation

Supervisor granted the exact sandbox adapter path through R3 specification
`/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/CALLCENTER-PHONE-ORDER-DURABLE-FLOW-20261016-R3-sandbox-ACK-scope.json`,
SHA256 `6951a98fc6de6e0a39087ae523e89d01c505583dd02f5361f76f706406018364`.
This supersedes the F6 scope wait above. Anchor `026bb5a8a` adds durable external
session/close helpers and the close controller await. The sandbox controller now
awaits `ingestForWrite`; it and the original synchronous `ingest` execute the same
validated operation plan. Synchronous callers keep their existing contract;
the HTTP entry awaits each durable step in order, including order propagation.

- F6 old behavior reproduced at `026bb5a8a` with the unchanged sandbox adapter
  and controller: all five event cases fail because success settles while the
  production repository executor is held (`sandbox-before.log`, exit 1).
  The probe calls the real controller/adapter/service/repositories without an
  HTTP listener; only SQL completion and row storage are simulated.
- First continued regression: 80 pass / 1 fail, exit 1
  (`dispatch-baseline.log`). The failure was a probe assertion counting its own
  read-access audit as a successful session mutation. The test now checks
  `open_call_session` audits specifically; the product's access audit remains.
- Ordinary API typecheck: exit 2 (`api-typecheck.log`), with existing shared
  built declaration/source mismatches. API source-alias typecheck: exit 0
  (`api-source-typecheck.log`); this uses an ignored local configuration and
  does not rewrite shared package build outputs.
- New create-response consistency probes cover a late missing-recording call
  and initial ready recording flags. Results and fixes are recorded next.

Earlier checkpoint logs were not present in this dispatch's isolated worktree.
Fresh logs above and subsequent historical reproductions are retained under
the same documented `.local/callcenter-phone-order-durable-flow-20261016/`
directory. Earlier reported passes remain historical, not new-source credit.

## Final source verification and handoff evidence

Final implementation checkpoint: `fd1f87ca4387b0d4d9bece84797c6df981d2221d`.
The final candidate commit only updates this evidence document; production and
test contents match this checkpoint. No checks remain running at handoff.

| Finding / acceptance                                              | Final source boundary                                                                                                              | Old → fixed result                                                                                                                                                                                                                                          | Reproducible command / exit / evidence                                                                                                                                                                             | Still pending                                                                                               |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| F1 phone order ACK                                                | `buildAndPersistCallCenterOrder`, `withPhoneOrderSession`, real repository transaction                                             | Original `bcda359776c7fcc64d478624174c93d6649932d7` actually returns, publishes and exposes memory before held SQL; final case waits, then strict read succeeds                                                                                             | Historical `vitest ... -t 'does not envelope session\|phone create waits\|recording callback waits'`: exit 1, three actual behavioral failures (`original-before.log`); final `durable-ack.test.ts`: 24/24, exit 0 | Migrated PG and actual HTTP full22                                                                          |
| F2 open/link session ACK                                          | Controller `openCallSession`, `linkCallOrder`; `runPhoneSessionWrite`, `findSession`                                               | Original open succeeds before SQL; final rejected commit publishes no phantom session or successful mutation audit                                                                                                                                          | Same historical and final commands; `dispatch-baseline.log` separately preserves the initial audit-probe failure and its correction                                                                                | Hosted session/link evidence                                                                                |
| F3 attachment/state propagation                                   | Controller callback and actual registered owned-order listener results; phone row uses existing repository `findOrderForUpdate`    | Original callback settles while its order write is held; final rejects failed order propagation and rolls back the session; same payload retries successfully                                                                                               | `original-before.log`; final delayed/rejected attachment and pending/failed cases in `final-scoped.log`, exit 0                                                                                                    | Formal PG rejection/read-after-ACK                                                                          |
| F4 failure, replay, one-call-one-order                            | Real `OwnedMobilityController`, `IdempotencyService`, production repositories                                                      | Final rejects order/session/COMMIT failures without completed replay or creation event; same key retries/replays once; call cannot rebind                                                                                                                   | Final socket-free test suite, exit 0. Executor completion/failure/row storage only are simulated                                                                                                                   | Native migrated-PG failures/replay                                                                          |
| F5 cold peer identity/target                                      | `getCallSessionForRead`, persisted sequence allocation, transaction recording target                                               | Socket-free cold peer preserves first call/order link and reads committed recording                                                                                                                                                                         | Final socket-free suite, exit 0; formal companion authored using original migration harness                                                                                                                        | Real peer PG results                                                                                        |
| F6 sandbox alternative caller                                     | Controller awaits `SandboxWebhookAdapter.ingestForWrite`; validated plan executes durable upsert then close/recording sequentially | At `026bb5a8a03ac26d0ed3bcd338c79573f5901a71`, five old event cases actually fail early ACK; final five delay and five rejection/retry cases pass. The original synchronous `ingest` is retained for existing memory callers, and is no longer used by HTTP | `sandbox-before.log`, exit 1; `sandbox-fixed.log`, 7 files/125 pass, exit 0; final regression also passes                                                                                                          | Nine authored hosted PG cases include all five webhook events and rejected upsert; not executed on VM       |
| F7 create-response consistency                                    | `buildAndPersistCallCenterOrder` preserves listener's committed final state and deduplicates recording flags                       | At `88689f8b9b5b1be718dbbf5fbc5ef46fd06397da`, late missing state differs between response/cache and PG, initial recording duplicates `recording_bound`; both probes fail. Final both pass                                                                  | `create-final-state-before.log`, exit 1 (2 actual failures); `create-final-state-fixed.log`, exit 0 (24 pass); retained final regression passes                                                                    | Hosted canonical response equality                                                                          |
| `callcenter_phone-order-and-recording_durable-ACK-full-source-CI` | All preceding findings and original complete acceptance scope                                                                      | **Pending**, no acceptance credit claimed from local passes                                                                                                                                                                                                 | Exact candidate independent review, genuine same-source hosted complete CI, original E2E-003 index/report/filing/audit and all22, protected merge required                                                         | Root sole CI/full22 observer and runtime delivery authority; external CTI/media remain explicitly synthetic |

Historical probes were run against a
detached original checkout without resetting the active task worktree. The
probe snapshot is retained as `historical-probe-fd1f87ca4.ts` (SHA256
`3c7616bfd37d37c1927b0b2fbf2b46277afebc23c27bccf13c28430165225036`);
the original checkout itself is no longer present. An initial detached setup
attempt used the wrong working-directory-relative paths and exited 254 before
running tests; it is excluded from behavioral evidence. The corrected run
produced the three real failures in `original-before.log`.

Final commands (run from the task worktree unless stated):

```bash
pnpm exec vitest run tests/unit/callcenter-phone-order-durable-flow-20261016/ \
  tests/unit/callcenter.test.ts tests/unit/sandbox-webhook.adapter.test.ts \
  tests/unit/owned-mobility.test.ts \
  tests/unit/system-remediation/sr-qa-call-001/c043-callcenter-workflow.test.ts \
  tests/unit/system-remediation/sr-qa-call-001/c044-cti-recording-callback.test.ts \
  tests/unit/system-remediation/sr-qa-webhook-001/sr-qa-webhook-001.test.ts \
  tests/unit/system-remediation/sr-recording-recovery-20260913/recording-recovery.test.ts \
  tests/unit/audit-voice-runtime-20261002/media-recording-finalize-authorization.test.ts
# exit 0: 9 files / 164 tests PASS; 1 hosted-only file / 9 cases SKIP locally.
# These 9 skips are pending, not accepted. On GitHub they execute and missing PG fails.

# From apps/api (source aliases preserved by the root config), exit 0: 8/8 PASS:
pnpm exec vitest run --config ../../vitest.config.ts --root . tests/unit/callcenter.service.test.ts

pnpm exec eslint apps/api/src/modules/callcenter/callcenter.service.ts \
  apps/api/src/modules/callcenter/callcenter.repository.ts \
  apps/api/src/modules/callcenter/callcenter.controller.ts \
  apps/api/src/modules/callcenter/sandbox-webhook.adapter.ts \
  apps/api/src/modules/owned-mobility/owned-mobility.service.ts \
  tests/unit/callcenter-phone-order-durable-flow-20261016/ --max-warnings=0
pnpm exec tsc -p .local/callcenter-phone-order-durable-flow-20261016/api-source.tsconfig.json --noEmit
pnpm exec tsc -p .local/callcenter-phone-order-durable-flow-20261016/task-source.tsconfig.json --noEmit
```

Lint and both final source typechecks exit 0. Configurations are retained under
the local evidence directory; their source aliases avoid stale shared dist
declarations without modifying those shared files. Ordinary API typecheck
remains the separately recorded exit 2, not a pass. Full build/typecheck/CI and
original complete HTTP/PG acceptance remain mandatory at the candidate SHA.

Local result hashes: `final-scoped.log`
`6da176d18b828d2eebfce8dedd78cd251a58fe9985d593b226ede45d701e81ab`;
`original-before.log`
`bf8049f44b61fba7e4285d846725220bbbb99b0d25c5d980f9793b2e193676d8`;
`sandbox-before.log`
`56e52416f58475ca2ffe0af7d25a204598c3cfc2c9b77ec5d2b39857a0a56c2d`;
`create-final-state-before.log`
`a5e7da3bb613beb3b57d3d1f8ffe6e6709b5ac1af0b41b265c6d33b29fae253e`.
Final test source SHA256 values: `durable-ack.test.ts`
`3c7616bfd37d37c1927b0b2fbf2b46277afebc23c27bccf13c28430165225036`;
`durable-postgres.hosted.test.ts`
`5033998b4dca810bf5d10f29c8afb515174293417421aaa177f733a1080a3717`;
`production-services.ts`
`df8612da046855ae096fc56e3ee9bb6f9fa4381ab11eb5500d754d9464d4963d`.

## F8: existing phone-caller test doubles lack the new session entrypoint

The following subsection records the rejected candidate and the pre-R4 scope request. The completed R4 correction and its fresh evidence follow it.

Rejected candidate: `f004d3caad9776d8d3947ef0c398c9be9252eded`, generation
`9da4385be13c46089e8902bed4c903a9`, PR #2732. Claude2 reopened this candidate
at `2026-10-16T04:29:42Z`: CI run `38849756131`, API job `116808991611`
failed seven cases in four existing files with
`TypeError: this.callcenterService.withPhoneOrderSession is not a function`.
The canonical task slice contains the complete reviewer finding. This is the
first review of this particular regression; the earlier ACK findings and their
pending acceptance remain recorded above.

The owner independently read the original JSON artifacts already collected by
Root under
`/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/phone-f004-hosted-results/artifacts/`:
`run-38849756131-artifact-12024539557/api-test-results-shard-1.json` confirms
the reviewer finding, and
`run-38849756131-artifact-12024644672/unit-test-results-shard-4.json` identifies
two additional affected files. No new hosted workflow or runtime was started.

Actual call path:
`OwnedMobilityController.createCallCenterOrder` (where used) →
`OwnedMobilityService.createCallCenterOrder` →
`buildAndPersistCallCenterOrder` →
`CallcenterService.withPhoneOrderSession`. The production callcenter service
implements that entrypoint. The affected fixtures inject partial object
literals containing only the previous `linkOrderToCallSession` method and
listener registration methods. The exception occurs before persistence or
their original business assertions. Searching both test trees for that old
stub together with phone creation identified exactly the eight files below;
all eight were executed locally on the rejected candidate.

| Finding / acceptance                                              | Source / correction boundary                                                                                             | Old → fixed result                                                                                                                          | Commands / execution / evidence                                                                         | Remaining limitation                                                                                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F8 missing session entrypoint in existing test doubles            | Four API fixtures and four root fixtures listed below; keep the production durable boundary and every original assertion | On `f004d3caad9776d8d3947ef0c398c9be9252eded`: 8 files, 11 cases fail with the same TypeError; 141 other cases pass. Correction not applied | Three commands below, each exit 1; Node and Vitest versions are retained in the local execution receipt | Exact fixture write scopes requested through owner `progress`; R3 currently grants none of these eight paths                                                                                     |
| `callcenter_phone-order-and-recording_durable-ACK-full-source-CI` | F1–F8 and unchanged complete original acceptance                                                                         | Unsatisfied; full CI has a confirmed regression                                                                                             | Root's original immutable artifacts above; no scoped result substitutes for complete CI                 | Fix F8 after Supervisor scope coordination, rerun affected regression, publish a new full SHA and hand off to Claude2; same-source formal PG/full22/complete CI/protected merge remain mandatory |

Requested exact additional paths, fixture hunks only:

- `apps/api/tests/unit/owned-mobility.service.test.ts`
- `apps/api/tests/unit/owned-mobility-compliance-gates.test.ts`
- `apps/api/tests/unit/map-fleets-cross-surface-proof.test.ts`
- `apps/api/tests/unit/map-qa-final-evidence-proof.test.ts`
- `tests/unit/cross-app/owned-mobility-ops-map-api-closeout-proof.test.ts`
- `tests/unit/cross-app/map-fleets-closeout-proof.test.ts`
- `tests/unit/cross-app/owned-mobility-ops-map-closeout-proof.test.ts`
- `tests/unit/push-referral-route-write-20261006/referral-route.test.ts`

The repair must update these injected collaborators to the current callcenter
contract, preferably using the real repository-free service where compatible
with the fixture's purpose. It must preserve all existing business assertions
and retain the real service/repository ACK probes. Adding a production fallback
for an incomplete test double would conceal the fixture defect and is outside
this correction. These eight files have not been modified while their scope
coordination is pending; no new review candidate is claimed by this evidence
checkpoint.

All three local commands have finished:

```bash
# Task root: 2 failures / 21 passes, exit 1.
pnpm exec vitest run \
  tests/unit/cross-app/owned-mobility-ops-map-api-closeout-proof.test.ts \
  tests/unit/push-referral-route-write-20261006/referral-route.test.ts

# apps/api: 7 failures / 120 passes, exit 1.
pnpm exec vitest run --config ../../vitest.config.ts --root . \
  tests/unit/owned-mobility.service.test.ts \
  tests/unit/owned-mobility-compliance-gates.test.ts \
  tests/unit/map-fleets-cross-surface-proof.test.ts \
  tests/unit/map-qa-final-evidence-proof.test.ts

# Task root: 2 failures, exit 1.
pnpm exec vitest run \
  tests/unit/cross-app/map-fleets-closeout-proof.test.ts \
  tests/unit/cross-app/owned-mobility-ops-map-closeout-proof.test.ts
```

Fresh local logs in the task evidence directory:

| Log                              | SHA256                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| `f004-legacy-callers-before.log` | `e7000ff90f30edcee66b3efa71af4484bf2afc08254d4bf2865be19b79892663` |
| `f004-api-callers-before.log`    | `fe840c5cf253db655733a25a2f59b020ffef569ccfa8562fd9c3380f04aaec7b` |
| `f004-other-callers-before.log`  | `1371b4fa2d2a10ab37ad79eac4714d1ef3dd6362c867045c2e4bfbd08bd27be1` |

## R4 correction of F8

Supervisor granted the eight requested fixture/caller hunks on 2026-10-16;
no production fallback, schema change or wider shared-file lease was granted
or added. Recoverable implementation checkpoint: `74f96e0b9` (ordinary push,
not the review candidate). The canonical handoff records the final full SHA.

Each of the eight original fixtures now constructs the production
`CallcenterService` without a repository. Its real session linkage,
one-call-one-order check and listener registrations are exercised, instead of
reimplementing `withPhoneOrderSession` in a test double. The two API map proof
fixtures retain their existing owned-order repository boundary and now await
all seven successful phone creations before reading the resulting orders.
Fixtures without any repository retain the supported synchronous caller path.
The compliance fixture removes its unused recording-ID override (its only
caller supplied null); the actual recording gate and callback assertions stay
unchanged. Existing synthetic call IDs are already distinct within each service
instance, so no new session seeding or identifier changes were necessary.

A TypeScript AST comparison against rejected candidate
`f004d3caad9776d8d3947ef0c398c9be9252eded` verifies that all 564 original
`expect(...)` expression statements across these eight files are byte-for-byte
unchanged (`r4-assertion-preservation.log`). This is a scope check; the real
execution results below establish the behavioral regression result.

| Finding / acceptance                                              | Source and correction                                                          | Old → corrected result                                                                        | Command / version / evidence                                                                                                                                                               | Remaining limitation                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F8 missing `withPhoneOrderSession` in partial fixtures            | Eight paths listed above, fixture construction and seven necessary awaits only | Rejected f004: 11 failed / 141 passed; R4 code checkpoint 74f96e0b9: all 152 passed, no skips | API four-file command above: exit 0, 127 passed (`r4-api-callers.log`); root four-file command below: exit 0, 25 passed (`r4-root-callers.log`); Node v22.23.2, pnpm 10.33.0, Vitest 4.1.4 | New candidate independent review and full source CI pending                                                                                                                                                                                         |
| F1–F7 phone/session/recording ACK regression                      | Production code and existing task probes unchanged from f004                   | Fresh R4 execution: 9 files / 164 tests passed; API callcenter 8 passed                       | Original final command above with only `durable-ack.test.ts` selected from the task folder: exit 0 (`r4-durable-regression.log`); API callcenter command: exit 0 (`r4-api-callcenter.log`) | Nine formal migrated-PG cases deliberately not invoked on this VM; no skip or acceptance credit                                                                                                                                                     |
| `callcenter_phone-order-and-recording_durable-ACK-full-source-CI` | Original full acceptance, including F1–F8                                      | Local F8 regression resolved; acceptance remains unsatisfied                                  | Fresh log hashes and execution receipt in the same local evidence directory                                                                                                                | Same new candidate: nine migrated-PG cases, all original 22 cross-surface scenarios including complete E2E003 index/report/filing/audit chain, full CI, independent Claude2 review and protected merge; Root retains external/source CI observation |

```bash
# Root fixtures, exit 0: 4 files / 25 tests.
pnpm exec vitest run \
  tests/unit/cross-app/owned-mobility-ops-map-api-closeout-proof.test.ts \
  tests/unit/push-referral-route-write-20261006/referral-route.test.ts \
  tests/unit/cross-app/map-fleets-closeout-proof.test.ts \
  tests/unit/cross-app/owned-mobility-ops-map-closeout-proof.test.ts
```

Test-generated historical proof JSON files were copied to the local evidence
directory and restored to their tracked bytes; no historical acceptance artifact
is part of this source correction. No product server, browser server, Docker
infrastructure or new hosted workflow was started by this owner.

R4 verification checks have all finished. TypeScript 5.9.3:

```bash
# Both exit 0. Local configs retain the production strictness and use source contracts.
pnpm exec tsc -p .local/callcenter-phone-order-durable-flow-20261016/r4-api-source.tsconfig.json --noEmit
pnpm exec tsc -p .local/callcenter-phone-order-durable-flow-20261016/r4-task-source.tsconfig.json --noEmit

# Exit 2, not credited as a pass; see limitation below.
pnpm --filter @drts/api typecheck
```

Scoped ESLint (the original five production files and task probes, plus all
eight R4 fixture files) exits 0. Prettier checks for the other seven R4 test
files and this artifact exit 0. The pre-existing unrelated passenger fixture
formatting in `owned-mobility.service.test.ts` was left untouched to respect the
exact hunk grant; its whole-file format check is not claimed.

The ordinary API typecheck uses shared `dist` declarations and reports 371
TypeScript diagnostics, including missing `ops_observer`, `mail_delivery`,
invitation delivery fields and voice dialogue exports. The R4 correction
changes no production or contract source relative to f004; the source-alias
API check passes. These are recorded as a failed ordinary check, not full CI
credit. The first local source-alias config incorrectly inherited the API-only
`rootDir` and exited 2 with TS6059; its separate initial log/config is retained.
Setting `rootDir` to the worktree root fixes the local check configuration,
without changing any source or compiler strictness; its final run exits 0.

Machine-local receipt: `r4-verification.json` in the task evidence directory;
all log hashes below correspond to the finished runs. Test code is unchanged
from checkpoint `74f96e0b9`; subsequent commits only update this artifact.

| R4 log                                | Exit | SHA256                                                             |
| ------------------------------------- | ---- | ------------------------------------------------------------------ |
| `r4-api-callers.log`                  | 0    | `0cf4a22b0550d93e244de4a96a8417e698393fd7dd88568936fcf382f5e1c11a` |
| `r4-root-callers.log`                 | 0    | `51f19f02a2f1d1adc9e00d33534220ee21124c9693c972756f1c645037020819` |
| `r4-durable-regression.log`           | 0    | `9f63b2abba3d82f955a811a95b1d4f1c5353b16da43a7c7c797b45ac8a24dfac` |
| `r4-api-callcenter.log`               | 0    | `d8ca123731e10831be1a67f207da48c49cd8cb0245b660f986d10fef34028034` |
| `r4-lint.log`                         | 0    | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `r4-api-source-typecheck.log`         | 0    | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `r4-task-source-typecheck.log`        | 0    | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `r4-api-typecheck.log`                | 2    | `cd62a77969e9f0f2ed3a360a0aad39454e7d9cf42c2fc9855b147c9075e4acba` |
| `r4-api-source-typecheck-initial.log` | 2    | `b2e95886b63a210623cd723f3292c5faca02f416a9035d7b39d8ed7e427259a3` |
| `r4-format.log`                       | 0    | `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20` |
| `r4-assertion-preservation.log`       | 0    | `cd0ef334690fb9172c7fe49ee6353bba3a432c2370d7e05a846e2485c81bf908` |
