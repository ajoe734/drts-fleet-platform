# PAX-RECEIPT-E04-CAPTURE-20261015

Owner: Codex · Reviewer: Claude2

## 2026-10-16 source preparation checkpoint (historical)

This is an implementation checkpoint, **not a review candidate or completed
acceptance**. Baseline: `b726c5cd0` (the assigned worktree's accepted dev source).
Initial reader anchor: `d5844da3c3f5cd88c058a3ca6aa21a36aa5f7d2a`.

The original task spec remains authoritative:
`/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/PAX-RECEIPT-E04-CAPTURE-20261015.md`.
Source diagnosis: `actual8558-E04-authoritative-field-reader-location.json`
(SHA256 `ec1eba12e124ff80f160c753dcdb2a7a249da01c08f8649ba686aca936de1c3a`)
and `actual127925-E04-operator-fleet-legal-name-link-readonly-location.json`
in the same directory. There have been no E04 candidates or review returns.

## Actual source and remaining repair units

- `OwnedMobilityService.completeDriverTask` and
  `finalizeDriverTaskCompletionInTransaction` call the synchronous surname
  getter and `buildMultiTaxiCertificateEvent`. The producer still does **not**
  supply `e04Snapshot`. This defect remains open at this checkpoint.
- `RegulatoryRegistryService.getDriverDeclaredSurnameSnapshot` reads the
  declared `driverSurname` and `updatedAt` from DriverProfileService; it does
  not infer a surname from a full name. The new
  `getDriverCompletionReceiptIdentity` first calls the existing
  `prepareProfileAuthority`, then obtains the public credential through a new
  driver-targeted production repository read. Missing/error reads do not use
  the registry's startup credential. A valid public E04 mask is retained;
  otherwise only actual trailing registration digits can produce a mask.
- `PaymentMethodService.getReceiptDisplay` resolves the original UUID and
  delegates to `PaymentMethodRepository.findReceiptDisplay`, which selects
  only `card_type,last4` for that owner and active method. No default-card
  selection, PSP request, token decryption or account lock is involved.
- The completion callers are not connected to these new ports yet. Existing
  completion/replay behavior and the CertificateSupport validator remain
  unchanged. The writer and passenger mapper must be exercised after capture
  is connected, including a master update followed by receipt reread and
  completion retry.

## Exact scope coordination needed

The current task scope has no Fleet master or Fleet contract write paths.
The original source diagnosis confirms that neither driver affiliation,
contract partner, display labels nor coincident IDs prove the operating
authorization's operator identity. The task progress requests normal Supervisor
scope coordination for exactly:

- `packages/contracts/src/index.ts`
- `apps/api/src/modules/fleet-partner/fleet-partner.service.ts`
- `apps/api/src/modules/fleet-partner/fleet-partner.repository.ts`

Intended minimum: optional explicit `multiTaxiOperatorIds` on the existing
Fleet JSON master/create/update contract, preserved by existing ACK-backed
master writes, plus a narrow unambiguous operator lookup. Owned completion
must resolve **this order's** `operatingAuthorizationId` to its persisted
operator, then read that explicit Fleet mapping and snapshot `legalName`.
Missing/ambiguous mapping must retain the existing missing-fields response.
No new migration, affiliation semantics, governance or validator change is
proposed. Existing allowed module files suffice for stateless repository DI
and ReviewSupply's canonical Fleet service writer.

After scope coordination, ReviewSupply must create an explicitly synthetic
Fleet through the existing writer, use the returned Fleet ID to persist the
explicit mapping and await ACK. It also needs an explicit synthetic declared
surname and structurally valid synthetic registration metadata through the
existing profile/registry ports. Existing opt-in and 演練／非正式 labels remain
required. No real institution or legal-issuance claim is authorized.

Only credential-read additions near the registry getter are included here;
C073 offboarding/debranding/lifecycle/persistFinalExitChangeOrThrow behavior
is not modified.

## Evidence matrix (§0.7)

| Finding / acceptance                                          | Source / repair                                                             | Baseline → checkpoint                                                                                                    | Checks / evidence                                                                                         | Remaining limits                                                                                     |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Completion produces no E04                                    | Both Owned completion callers and `buildMultiTaxiCertificateEvent`          | Confirmed by the original bounded producer/writer diagnosis; still open                                                  | Existing source probe and original spec; no new dynamic old/new capture claim                             | Fleet scope coordination, complete producer→writer→mapper regression and immutable replay proof      |
| Stale completion identity sources                             | Registry completion identity port and targeted credential repository reader | Baseline synchronous getter has no PG refresh; new reader tests exercise real profile/registry services and repositories | `tests/unit/pax-receipt-e04-capture-20261015/authority-readers.test.ts`; transport rows only are fixtures | Not yet connected to completion; real PG and credential lifecycle coverage remain pending            |
| Selected passenger payment display                            | Payment method service/repository metadata reader                           | New port reads owner+UUID metadata; invalid/legacy references remain absent                                              | Same unit file; no provider/cipher supplied                                                               | Real PostgreSQL ownership/deletion behavior and completion capture remain pending                    |
| `pax-receipt-e04_real-completion-snapshot-and-readback`       | Entire completion/event/receipt/readback pipeline                           | **Pending**                                                                                                              | No acceptance recorded                                                                                    | New same-SHA hosted PG/CI, writer/mapper and snapshot/replay evidence required                       |
| `pax-receipt-e04_explicit-simulation-and-shared-dev-delivery` | Explicit ReviewSupply sources and immutable Cloud Run delivery              | **Pending**                                                                                                              | No acceptance recorded                                                                                    | New review/CI/merge, immutable shared-dev delivery and new same-version three-journey smoke required |

Local check evidence is under the assigned worker's
`.local/pax-receipt-e04-capture-20261015/`. The unit boundary is SQL transport
fixtures, not runtime or PostgreSQL acceptance. No product server, browser
runner, database or Compose environment was started on this VM.

Check results and exact published checkpoint SHA are recorded below and in
the original task's machine-truth progress. Hosted checks have not been
triggered for this unfinished checkpoint.

### Local check results

Source/test checkpoint: `b7a03c16f` (only this evidence document changes after
that checkpoint). All commands below completed and their exit results were
read before this checkpoint was published.

| Command                                                                                                                                                         | Result                                                                   | Log under `.local/pax-receipt-e04-capture-20261015/` |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `pnpm exec vitest run tests/unit/pax-receipt-e04-capture-20261015/authority-readers.test.ts tests/unit/pax-receipt-complaint-20261009/receipt-download.test.ts` | Exit 0; 2 files, 42 tests passed (13 new reader cases, 29 receipt cases) | `readers-receipt-unit.log`                           |
| `pnpm --filter @drts/contracts build`                                                                                                                           | Exit 0                                                                   | `contracts-build.log`                                |
| `pnpm --filter @drts/control-plane-auth build`                                                                                                                  | Exit 0                                                                   | `control-plane-auth-build.log`                       |
| `pnpm --filter @drts/api typecheck`                                                                                                                             | Exit 0 after rebuilding workspace dependencies                           | `api-typecheck.log`                                  |
| `pnpm exec eslint <four changed production TS files> tests/unit/pax-receipt-e04-capture-20261015/authority-readers.test.ts --max-warnings=0`                    | Exit 0                                                                   | `scoped-eslint.log`                                  |

The first reader run failed because the SQL profile fixture omitted
`deviceBindings`; this was a fixture failure, not a successful defect
reproduction. The fixture now extends the existing native profile shape.
The initial API typecheck also failed against stale contracts declarations;
rebuilding the two workspace packages resolved it. Neither initial failure
is claimed as a production regression reproduction or acceptance evidence.

No PG/browser/HTTP/deployment check has been run for this checkpoint. Both
required acceptance keys remain pending. This branch must remain in owner
progress until the Fleet scope request, full capture and required regressions
are completed; do not hand off these preparation anchors as a finished E04
candidate.

## 2026-10-16 completed source and owner verification

This section supersedes the open implementation items in the historical
checkpoint above. It does **not** record hosted acceptance, deployment or DONE.
Production source and hosted assertions are anchored at
`e600f3e38ff09c6375b5890bd8f5d992c71dce04`; reproducible before-source loading and
scoped test typechecking were added at
`c60ca4ac6` (subsequent edits only format that loader and document results).
There have been no review returns or previous E04 candidates.

### Final source path and boundaries

- Both `OwnedMobilityService.completeDriverTask` and
  `finalizeDriverTaskCompletionInTransaction` call
  `captureCompletionIdentity` and `captureMultiTaxiE04` before constructing the
  completion event/outbox. The snapshot copies all four **actual** fare
  components, not a quote or an allocation of the total. Existing plate,
  start/end, distance, duration and declared-surname provenance remain in the
  immutable event. Existing idempotency/replay and receipt conflict handling
  retain the original snapshot after source changes.
- `RegulatoryRegistryRepository.findCompletionOperatorId` resolves this order's
  persisted `operatingAuthorizationId`. `FleetPartnerRepository` selects only
  explicit `multiTaxiOperatorIds` mappings and accepts exactly one legal name.
  `FleetPartnerService` preserves that optional JSON master field in existing
  create/update writes and detached clones. Writes still await the original ACK;
  no ID equality, affiliation or display label supplies issuer identity.
- `RegulatoryRegistryService.getDriverCompletionReceiptIdentity` refreshes the
  target declared profile and credential. `PaymentMethodService.getReceiptDisplay`
  reads the order's selected active payment UUID under the order's passenger;
  neither PSP tokens nor a default method supply receipt display facts.
- The existing global `PassengerAppModule` exports `PaymentMethodService`.
  `OwnedMobilityModule` registers stateless Fleet/registry repositories. Existing
  direct constructor callers remain compatible because the new completion
  dependencies are appended and optional. All three direct `ReviewSupplyService`
  callers were updated for the two required rehearsal authorities.
- Opt-in `ReviewSupplyService.prepare` uses the existing ACK-backed Fleet writer
  and actual returned Fleet ID, persists its explicit operator mapping, declares
  the synthetic surname through DriverProfileService, and refreshes structurally
  valid synthetic credential metadata. Its return and Fleet legal name explicitly
  say 合成／演練／非正式. Existing rehearsal page/record labels and opt-in remain.
  No external legal registration, PSP operation or regulatory approval is claimed.
- Missing actual fare, declared surname, credential, selected owner method,
  authorization or unique Fleet mapping leaves E04 absent. The original writer,
  passenger mapper, download readiness validator and ownership checks are
  unchanged. Registry C073 lifecycle/offboarding hunks are unchanged.

### Finding and acceptance evidence (§0.7)

| Finding / acceptance                                                     | Source and repair                                                                                                                                             | Before → fixed result                                                                                                                                                                                                                                             | Command and evidence                                                                                                                                                                       | Unverified limits                                                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Both completion callers omit E04 despite available authority             | Owned completion callers, capture helpers, `buildMultiTaxiCertificateEvent`; production Fleet/registry/payment readers                                        | Immutable accepted-baseline Owned source `b726c5cd08c932502d768e5766bbdf4753e4a1f4`: **2 expected failures**, `event.e04Snapshot === undefined`, one per caller. Same assertions with fixed source: **2 pass**, within the 15-case capture suite                  | `pnpm exec vitest run --config tests/unit/pax-receipt-e04-capture-20261015/before.vitest.config.ts`, exit 1, `before-producer.log`; fixed command below                                    | Bounded old-producer reproduction only: all authority ports/fixtures/assertions stay at fixed source, only immutable original Owned source is loaded. No active worktree reset, no production logic mocked              |
| Event→writer→raw receipt→mapper/artifact and same-order immutable replay | Capture suite calls actual Owned service, CertificateSupport service/repository, MultiTaxi repository and passenger mapper                                    | Fixed direct and transactional callers retain four actual fare components, plate/times/distance/duration, Unicode declared surname and selected payment. Later profile/Fleet/card/credential changes and duplicate completion/delivery preserve original receipt  | `completion-capture.test.ts`; fixed suite `regression.log` / `regression.json`                                                                                                             | Local SQL transport rows are synthetic; no PG transactions, lease recovery or external issuer acceptance claimed                                                                                                        |
| Missing source facts and ambiguous operator mapping                      | Same caller/writer/readback paths and original validator                                                                                                      | Six source-absence scenarios per caller retain `PASSENGER_RECEIPT_LEGAL_FIELDS_MISSING` / `PASSENGER_E04_NOT_READY`; wrong order cannot read the artifact                                                                                                         | Same 15-case capture suite; `authority-readers.test.ts` covers targeted refresh/absence/errors and owner+method metadata                                                                   | Real PostgreSQL execution remains pending                                                                                                                                                                               |
| Explicit mapping persistence/ACK                                         | Fleet create/update, clone and lookup                                                                                                                         | Mutation of returned mapping cannot mutate master; pending write is not visible before ACK; failed update retains previous mapping                                                                                                                                | Capture suite plus existing Fleet ACK regression                                                                                                                                           | Concurrent real DB behavior requires hosted CI                                                                                                                                                                          |
| `pax-receipt-e04_real-completion-snapshot-and-readback`                  | `completion-capture.hosted.test.ts`: formal migrations, production repositories, transaction/outbox drain, original writer, trusted passenger HTML/PDF reader | **Pending**; hosted tests are deliberately skipped locally. Tests assert actual outbox delivery, persisted snapshot, same-passenger readback, peer master updates, deleted card, replay/duplicate delivery, cross-passenger refusal and missing-mapping readiness | Existing `ci-integ.yml` unit shards discover this test; harness requires `GITHUB_ACTIONS=true` and a hosted PG URL, creates a migrated isolated database and validates migration checksums | No hosted PG result or acceptance key recorded yet. Native precompletion setup is a dependency fixture, not browser booking or real external legal/PSP data                                                             |
| `pax-receipt-e04_explicit-simulation-and-shared-dev-delivery`            | ReviewSupply production writers; `tests/e2e/pax-review-shared-order-demo.spec.ts` existing three-journey `download` path                                      | **Pending**. New assertions inspect each new order's raw E04, actual fare equality, standard passenger download API/HTML, actual receipt UI and explicit synthetic Fleet label, alongside existing rehearsal record download                                      | Existing `ui-shared-order-e2e` hosted job and immutable shared-dev smoke workflow; no new workflow or VM runner                                                                            | Requires exact candidate review/CI/merge, authorized immutable Cloud Run deployment, verified live `DEV_GCP_*` target, and new same-version three-order smoke. Historical Demo results give no credit to this candidate |

Before/fixed probes use the same completion test; only the old-source command
loads accepted-baseline Owned code. External SQL/event transports are fixtures in
socket-free cases. The hosted suite instead uses the existing formal migration
harness and production repositories, with synthetic source records and payment
provider responses explicitly identified. No validator is replaced or weakened.

### Current check ledger

All local evidence below is in this assigned worktree's
`.local/pax-receipt-e04-capture-20261015/`. Commands run with Node 22 / pnpm
10.33.0 / Vitest 4.1.4 (Node `v22.23.2`); exact local results and hosted status
follow below.

| Check                                                                                                                              | Result                                                                                                                           | Evidence                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @drts/contracts build` then `pnpm --filter @drts/control-plane-auth build` then `pnpm --filter @drts/api typecheck` | Exit 0 for the complete sequential command, shell session `83365`                                                                | Worker tool transcript; completed and read before handoff                                                                                                                                                                                                                                                                     |
| `pnpm exec tsc -p tests/unit/pax-receipt-e04-capture-20261015/tsconfig.json --noEmit`                                              | Exit 0; includes E04 tests, imported production paths/harness and the changed three-journey browser spec                         | `scoped-typecheck.log` (empty success output)                                                                                                                                                                                                                                                                                 |
| `git diff --name-only b726c5cd0 -- '*.ts' '*.tsx'` piped to `pnpm exec eslint --max-warnings=0`                                    | Exit 0                                                                                                                           | `eslint.log` (empty success output)                                                                                                                                                                                                                                                                                           |
| Changed TS/TSX/MD/JSON paths piped to `pnpm exec prettier --check`; `git diff --check`                                             | Exit 0 after formatting the new before-source loader                                                                             | Worker shell session `42042`; earlier formatting-only failure was corrected                                                                                                                                                                                                                                                   |
| `pnpm typecheck:root`                                                                                                              | **Exit 2**, 75 diagnostics; not a full-root pass                                                                                 | `root-typecheck.log`: unresolved `@drts/tenant-auth` / `@drts/passenger-client` workspace dependencies, and canonical-vs-worktree private `ApiClient` type identities among the errors. Root `node_modules` and API dependencies are canonical symlinks in this worker. No change to these unrelated source files is proposed |
| Initial expanded regression                                                                                                        | **Exit 1**, 501 passed / 1 failed / 5 hosted cases skipped                                                                       | `regression.log`, `regression.json`. Unchanged `review-context.test.tsx` expected its explicit `apps/passenger-app-web/node_modules/next/navigation` mock path, which was missing here; isolated rerun reproduced the same failure (`review-context-isolated.log`)                                                            |
| Restore only the ignored local Next dependency link and rerun Review Context                                                       | Exit 0, 3 passed                                                                                                                 | `ln -s ../../node_modules apps/passenger-app-web/node_modules`; `pnpm exec vitest run tests/unit/pax-review-shared-order-demo-20261015/review-context.test.tsx`; `review-context-linked.log`. No tracked source/test change                                                                                                   |
| Entire expanded regression after restoring dependency link, source `691d4e9aef362bbf41c836fdcf5b34946f69b0bf`                      | **Exit 0**, 41 files passed / 4 hosted files skipped; **502 tests passed / 5 hosted tests skipped**, no failures, 121.76 seconds | `regression-linked.log`, `regression-linked.json`; all started checks have ended and their results have been read                                                                                                                                                                                                             |

The expanded regression command (also rerun after restoring that dependency
link) is:

```sh
pnpm exec vitest run \
  tests/unit/pax-receipt-e04-capture-20261015 \
  tests/unit/pax-receipt-complaint-20261009 \
  tests/unit/pax-review-shared-order-demo-20261015 \
  tests/unit/owned-mobility.test.ts \
  tests/unit/fleet-partner.service.test.ts \
  tests/unit/fleet-partner.repository.test.ts \
  tests/unit/regulatory-registry.test.ts \
  tests/unit/platform-fleet-partner-persistence-ack-20261015/persistence.test.ts \
  tests/unit/driver-completion-actual-fare-input-20261013/actual-fare.test.ts \
  --reporter=default --reporter=json \
  --outputFile.json=.local/pax-receipt-e04-capture-20261015/regression-linked.json
```

Hosted PG/HTTP/browser checks and shared-dev smoke are **not executed on this
VM**. The PR candidate must receive its own complete hosted checks, independent
review and normal merge. Neither required acceptance key is satisfied by local
fixtures, a preparation anchor or a historical candidate/deployment.

Durable machine evidence is also copied to the canonical local artifact folder:
`/home/lupin/workspace/drts-fleet-platform/.local/passenger-transport-bureau-review-20261015/e04-codex-owner-20261016/source-691d4e9ae/`.
Its `SHA256SUMS` identifies the logs/reports; `candidate.json` records the final
pushed candidate, PR and source/evidence identity. The final candidate adds this
check ledger to the already verified source. Review/CI/merge and both acceptance
keys must bind to the final full candidate SHA recorded by the handoff CLI.

## CI repair: native precompletion capacity (2026-10-16)

Candidate `2868dbc109df79a88c3c51806c033e949d815033`, PR #2727, received
its first actual hosted PG result in CI run `38843863978`, root unit shard 4,
job `116790014238`: **exit 1**, 2 failures / 2640 passes / 2 skips. Both
E04 hosted cases stopped in `fixture()` before completion or E04 assertions.
This is a fixture failure, not successful reproduction of a product defect.
No independent reviewer return has been recorded for this candidate.

| Finding / acceptance                                          | Source and repair                                                                                                                                                                                                                                                                                               | Before → fixed result                                                                                                                                                                                                                                                                     | Command / evidence                                                                                                                                                                   | Unverified limits                                                                                             |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Hosted fixture commits a live assignment without capacity     | `completion-capture.hosted.test.ts:fixture`; formal `infra/migrations/V0091__dispatch_reservation_commit_invariant.sql:ops.assert_dispatch_assignment_reserved`; production `OwnedMobilityRepository.withTransaction`, `persistOrderWorkflow`, `reserveDispatchResources`, `occupyDispatchResourceReservations` | Old candidate: both tests reject with SQLSTATE 23514, "lacks paired dispatch_resource_reservations", at fixture persistence. Repair stages the order/job/assignment/task and both reservations within one production transaction, then marks the accepted assignment's capacity occupied. | [Failed job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38843863978/job/116790014238); worker `.local/pax-receipt-e04-capture-20261015/dispatch-ci/root-shard4.log` | Fixed PG result pending; VM cannot execute PG. No schema, trigger, product lifecycle or E04 validator change. |
| `pax-receipt-e04_real-completion-snapshot-and-readback`       | Same hosted completion/outbox/writer/readback tests; additionally assert a paired occupied group before completion and released resources after production completion                                                                                                                                           | **Pending**, no acceptance credit from a fixture failure or socket-free regression                                                                                                                                                                                                        | Existing hosted CI must run the revised candidate                                                                                                                                    | Both original hosted E04 assertions and immutable/readback/absence checks remain required.                    |
| `pax-receipt-e04_explicit-simulation-and-shared-dev-delivery` | Existing three-journey browser and immutable shared-dev path                                                                                                                                                                                                                                                    | **Pending**, unchanged                                                                                                                                                                                                                                                                    | Same-version review, full CI, merge, deployment and new smoke remain required                                                                                                        | No historical deployment or old candidate green check is borrowed.                                            |

The repair uses the production assignment writer's insert-before-reserve order
because the reservation's assignment foreign key is immediate. The original
deferred reservation constraint remains enabled. Precompletion dispatch/start
is still an explicitly synthetic dependency fixture; it does not establish
browser booking or real legal/PSP acceptance. Local validation and the next
candidate's hosted outcome will be recorded below when finished.

### Repair validation

Repair source anchor: `e96180f1511f1413ce818c2908e63918f8f91c1a`.
Node `v22.23.2`, pnpm `10.33.0`, Vitest `4.1.4`. Evidence directory:
worker `.local/pax-receipt-e04-capture-20261015/dispatch-ci/`, copied with
hashes to canonical
`.local/passenger-transport-bureau-review-20261015/e04-codex-owner-20261016/ci-repair-e96180f15/`.

| Check                                                                                                                                                                    | Result                                                                             | Evidence / limit                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec tsc -p tests/unit/pax-receipt-e04-capture-20261015/tsconfig.json --noEmit`                                                                                    | Exit 0                                                                             | `scoped-typecheck.log`; includes the revised PG test and existing browser spec                                                                                                                                                                                     |
| `pnpm exec eslint tests/unit/pax-receipt-e04-capture-20261015/completion-capture.hosted.test.ts --max-warnings=0`; Prettier on changed test/document; `git diff --check` | Exit 0                                                                             | Completed local checks; no product source was changed in this repair                                                                                                                                                                                               |
| E04 + receipt/complaint + shared-order unit directories, default worker count                                                                                            | Exit 1: 357 passed, 5 failed, 5 hosted skipped                                     | `regression.log/json`: missing ignored Passenger Next dependency link caused review-context mock mismatch; booking DOM waits and two 60s subprocess probe failures occurred with concurrent repository checks. These failures are retained, not counted as a pass. |
| Restore the existing ignored dependency link with `ln -s ../../node_modules apps/passenger-app-web/node_modules`; rerun the same three directories with `--maxWorkers=1` | **Exit 0: 362 passed, 5 hosted skipped; 35 files passed / 4 hosted files skipped** | `regression-linked.log/json`; 197.25 seconds. No timeout/retry/assertion or tracked dependency configuration changed. Both injection probes, booking caller and review context pass in this run.                                                                   |
| Revised formal-PG fixture / immutable E04 readback                                                                                                                       | **Pending hosted CI**                                                              | Local hosted skips provide no PostgreSQL acceptance credit. The old candidate's fixture failure is precisely identified above.                                                                                                                                     |

Reproducible revised local regression command:

```sh
pnpm exec vitest run \
  tests/unit/pax-receipt-e04-capture-20261015 \
  tests/unit/pax-receipt-complaint-20261009 \
  tests/unit/pax-review-shared-order-demo-20261015 \
  --maxWorkers=1 --reporter=default --reporter=json \
  --outputFile.json=.local/pax-receipt-e04-capture-20261015/dispatch-ci/regression-linked.json
```

All started local checks have ended and their results have been read. The
published candidate `2868dbc109df79a88c3c51806c033e949d815033` remains intact
while its remaining integration/browser jobs finish. The revision needs a new
same-SHA review/CI cycle after normal push and handoff; neither acceptance key,
merge nor shared-dev delivery is claimed by these local checks.

### Original candidate CI finished before revision push

Both original runs have now finished on
`2868dbc109df79a88c3c51806c033e949d815033`; neither was cancelled to publish
this repair. Run `38843863978` failed its root shard 4 as recorded above.
Integration run `38843863970` also finished **failure**: shard 4 job
`116793338084` has the identical two fixture reservation failures, 2640 passes
and 2 skips. Its other unit shards, build, typecheck, lint, integration,
dependency/IAM checks, cross-surface E2E and UI-route E2E passed.

The original candidate's [three-journey browser job](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38843863970/job/116792018019)
finished **success** at `2026-10-16T03:29:39Z`: the single browser scenario
containing all three journeys passed (8.8 minutes), with the new E04 raw
snapshot/readback/download assertions. Hosted Driver probes also passed 8/8.
Artifact: `pax-review-shared-order-38843863970`, GitHub artifact ID
`12022868242`. Logs `integration-shard4.log` and
`original-three-journeys.log`, plus terminal `original-integration.json`, are
preserved in the same local evidence directory. These results diagnose and
bound the old candidate; the revised candidate still requires its own full
CI, independent review, normal merge and same-version shared-dev acceptance.
