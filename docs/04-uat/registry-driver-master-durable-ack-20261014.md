# REGISTRY-DRIVER-MASTER-DURABLE-ACK-20261014

Owner Codex; reviewer Codex2. Status: implementation verified; exact candidate identity is recorded by the
normal handoff in machine truth and `candidate-evidence.json`. Independent review,
same-head hosted CI, protected merge and acceptance remain pending. Original C064/C061/C115 source repair only; parent/HOLD/native/role/
legal/provider/full-system requirements remain unchanged.

## Authority and repair boundary

- Current task spec: `/home/lupin/workspace/drts-fleet-platform/.local/registry-driver-master-durable-ack-20261014-root/task-spec-v3.json`,
  SHA256 `7daa06eaf8e743cd37676dc85648c5b5d4ce9ef5fe8da2951b703dfee6c0887f`.
  Original V1 SHA256 `46d474083cf1b71675bad517059ec41c4bcbf0e14035a8ad4f9ef47f287cf37c`
  and V2 SHA256 `66807c00aa515b315c9e6768f22294ab89495dd15b5ce5590beeda531e192d40`
  remain in the original machine artifacts. V2 granted the exact 15 test adapters
  at 04:22 UTC; V3 granted only the necessary inherited work-state scheduling
  hunk at 04:32 UTC. Neither was edited before the matching grant.
- PRD §11.4 defines platform-owned service buckets and dynamically evaluated
  driver eligibility. Existing DTOs, routes, allowed lifecycle states, license
  fields, timestamps, actor guards and successful audit contents are preserved.
- C060 dependency `DRIVER-PROFILE-DURABLE-SAVE-ACK-20261013` was genuinely DONE
  before edits: candidate `035aba04fe05d37e96c00134e728546ead6d67ba`, PR #2617,
  merge `ac9183feb65b71a3716eb4b14d070471161df643`.
- Task started on accepted `origin/dev` `32eb87f19e2a7ccb978057785bfad4116246916f`.
  Registry and profile production source blobs are identical to immutable
  qualification baseline `db212a3d6e6a0eced76fe2cebb0c05a46b8511c1`
  (`git diff db212a3d6 HEAD -- apps/api/src/modules/regulatory-registry apps/api/src/modules/driver-profile`
  was empty before source edits). Published history remains intact.

## Findings and evidence

Evidence directory (machine-specific):
`/home/lupin/workspace/drts-fleet-platform/.local/registry-driver-master-durable-ack-20261014-root/evidence/`.
Node 22.23.2, pnpm 10.33.0, Vitest 4.1.4, TypeScript 5.9.3.

| Finding / acceptance                                                                                                          | Production source and change                                                                                                                                                                                                                                                                                                                                                                                                 | Old → new result                                                                                                                                                                                                                                                                           | Command / exit / evidence                                                                                                                                                                                                                                                                                                                                                       | Remaining requirement                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1: four commands return before registry storage and swallow rejection; `registry_driver_master_saved_ack_waits_real_storage` | `RegulatoryRegistryService.createDriver`, `updateDriverServiceBuckets`, `updateDriverLifecycle`, `updateDriverLicenses`; bounded `saveDriverMaster`, staged clones and per-driver queue; controller awaits all four before its existing envelope                                                                                                                                                                             | Immutable db212: 8 business failures (pending/reject per command), 4 successful serialization/readback controls. After initial source checkpoint 0540775f6: same 12 pass. Dedicated first run: 39 pass, zero skip. Subsequent declared-validity regression added; final run recorded below | `pnpm exec vitest run tests/unit/registry-driver-master-durable-ack-20261014/baseline.test.ts --reporter=json --outputFile=<report>`: baseline exit 1 (`baseline-db212-final.json`), after exit 0 (`after-baseline.json`). `pnpm exec vitest run tests/unit/registry-driver-master-durable-ack-20261014 --reporter=json --outputFile=<report>`: exit 0 (`dedicated-first.json`) | Acceptance not yet recorded; controlled query proof only                                                                                                               |
| F2: async producer affects inherited test callers; `registry_driver_master_failure_and_existing_caller_regressions`           | Exact caller inventory below. Validation, duplicate creation through ACK, queue failure recovery, six command permutations, distinct-driver independence, response cloning, lifecycle timestamps, missing/disabled registry and C060 failure tested through actual producers/controllers                                                                                                                                     | Dedicated 39 pass; existing callers **147 pass / 25 fail / zero skip**, unchanged fixtures have missing awaits or disabled storage. No adapters edited outside scope                                                                                                                       | Existing-file Vitest invocation / exit 1, `existing-callers.json` and `.log`. Exact paths in report and below; no passing full-regression claim                                                                                                                                                                                                                                 | Initial scope obstruction preserved here; V2 adapters and final 337/131 passing regressions resolve it. Acceptance still awaits lifecycle verification                 |
| F3: inherited work-state caller bypasses master queue and writes stale full row                                               | `RegulatoryRegistryController.updateDriverWorkState` → service `updateDriverWorkState` → unchanged best-effort `persistChanges` → repository full-record UPSERT. Licenses master is pending; work-state `paused` starts a second query with old `licensesValid=true`. Master ACK commits false; delayed inherited query overwrites it with true. Master publication also overwrites the inherited local `paused` side effect | Actual production query diagnostic confirms final memory false/available versus stored true/paused. This was an unresolved checkpoint obstruction; V3 fixes it with actual before/after evidence below                                                                                     | From `apps/api`: `pnpm exec node -r ts-node/register/transpile-only ../../tests/unit/registry-driver-master-durable-ack-20261014/competing-writer-probe.mjs`, exit 0 = **obstruction confirmed**, `competing-writer-final.json`. Only external query controlled; own built packages resolved because worker node_modules is shared                                              | Reported BEFORE any outside-scope writer edits. V3 granted and repaired only this same-process coordination. Global persist rewrite / ALLwriters work remains excluded |
| F4: preserve raw declared license validity when staging, so expiry does not become a permanent local flag                     | Three updates persist their existing decorated snapshot, but publish the raw staged record. `decorateDriver` continues to derive current expiry validity; future renewal can restore validity without an explicit flag patch, as before                                                                                                                                                                                      | Dedicated expiry → renewal regression added after inspection; final check below                                                                                                                                                                                                            | `regressions.test.ts`, production service/controller/repository                                                                                                                                                                                                                                                                                                                 | Existing expiry scanner fixtures still require the scoped adapters below                                                                                               |
| `registry_driver_master_ack_same_candidate_review_ci_merge`                                                                   | Task branch `codex/registry-driver-master-durable-ack-20261014`; anchors 030d2d778 and 0540775f6 ordinarily pushed                                                                                                                                                                                                                                                                                                           | Final candidate identity comes from normal handoff; independent review / hosted same-head CI / protected merge pending                                                                                                                                                                     | Status CLI records exact handoff after the final ordinary push; no `done` called                                                                                                                                                                                                                                                                                                | Independent same-SHA review, hosted CI, protected merge and acceptance pending; source delivery is not integration completion                                          |

Baseline setup failure is retained separately: `baseline-db212.json` contains
zero tests because the detached checkout lacked the contracts package's `zod`
dependency link (exit 1). It is **not** defect reproduction. The locked immutable
checkout was given existing package dependency links and rerun; final proof has
12 actual production cases, including all four successful controls. The original
8 failures are actual fulfilled-before-ACK / fulfilled-after-rejection behavior,
not missing fixtures. `fixture.reload` calls real profile and registry
`onModuleInit`, repository `loadState`, and public read methods, then destroys the
module; no copied business logic or replacement schema.

## Exact outside-scope caller coordination request

This is the original request inventory, retained for scope traceability. V2
authorized these exact adapters; 13 paths needed edits, while the two existing
C060 assertion files passed unchanged after the shared fixture and F5 fix. Edits
are limited to awaits/async callbacks and controlled external query constructor
wiring. A TypeScript AST audit verifies all 15 paths retain 846 original
assertions, case names and parameter domains (`original-assertion-preservation.json`);
this supplements the actual regression runs rather than replacing them.

| File                                                                                                                  | Relevant symbol / original caller lines                                            | Required bounded adaptation                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/tests/unit/regulatory-registry.service.test.ts`                                                             | `createService` default `isEnabled:false`; create at 368; lifecycle at 401/413/418 | Enabled save fixture for affected commands; await lifecycle results                                                                                                                                       |
| `apps/api/tests/unit/auth-bootstrap.test.ts`                                                                          | Awaited lifecycle at 3195/3245                                                     | Inspect associated registry fixture; already-awaited calls still require enabled master storage                                                                                                           |
| `tests/unit/regulatory-registry.test.ts`                                                                              | service-bucket cases 853/877/898/911/923                                           | Enabled external-query fixture; async result/error assertions preserving both validation codes                                                                                                            |
| `tests/unit/driver-profile-durable-save-ack-20261013/fixture.ts`                                                      | `fixture` constructs registry without repository                                   | Add actual enabled registry repository query boundary; preserve controlled profile writes and alias queue                                                                                                 |
| `tests/unit/driver-profile-durable-save-ack-20261013/regressions.test.ts`                                             | Actual registry caller 120/140/197/200/212/218                                     | Verify shared fixture adaptation suffices; preserve profile failure, duplicate, partial effects                                                                                                           |
| `tests/unit/driver-profile-durable-save-ack-20261013/alias-serialization.test.ts`                                     | Actual registry alias caller 136                                                   | Verify actual master ACK fixture in commit/reject branches; preserve all R1 assertions                                                                                                                    |
| `tests/unit/system-remediation/sr-qa-driver-001/driver-license-expiry-gap.test.ts`                                    | licenses 143/170/173                                                               | Enabled save fixture and await before eligibility/T-30 assertions                                                                                                                                         |
| `tests/unit/system-remediation/sr-qa-driver-001/shift-clockin-suspension-gap.test.ts`                                 | lifecycle 63/89                                                                    | Await real master ACK before clock-in                                                                                                                                                                     |
| `tests/unit/system-remediation/sr-qa-driver-001/device-session-binding.test.ts`                                       | lifecycle 269                                                                      | Await enabled master save before binding refusal                                                                                                                                                          |
| `tests/unit/system-remediation/sr-live-map-001/session-bootstrap.test.ts`                                             | controller lifecycle 484                                                           | Await master ACK before existing work-state offline restoration; preserve fixture isolation assertions                                                                                                    |
| `tests/unit/driver-device-session.test.ts`                                                                            | lifecycle 278                                                                      | Await enabled save before revoke/rebind assertions                                                                                                                                                        |
| `tests/unit/system-remediation/sr-driver-gaps-20260911/driver-gaps-remediation.test.ts`                               | lifecycle 62, licenses 89/298/331/334                                              | Enabled saves and await before clock-in/dispatch/T-30                                                                                                                                                     |
| `tests/unit/system-remediation/sr-qa-webhook-001/sr-qa-webhook-001.test.ts`                                           | C115-5 licenses 1808/1834                                                          | Precise async/fixture adapter in this case; retain scanner/renewal assertions. Other external webhook receiver cases are unrelated to product runtime                                                     |
| `tests/unit/system-remediation/sr-credential-expiry-20260913/credential-expiry-reconciliation.test.ts`                | licenses 44/77/96/174/195/208/250/279                                              | Save ACK fixture plus awaits; retain original in-memory expiry-event controls. Simply enabling the entire expiry repository switches its scanner/event logic to SQL and is not a valid fixture adaptation |
| `tests/integration/system-remediation/sr-credential-expiry-20260913/credential-expiry-controller-and-service.test.ts` | licenses 40/80                                                                     | Same precise save-boundary adaptation; retain complete event/renewal lifecycle assertions                                                                                                                 |

Production callers of the four named commands are their controller endpoints;
other matches are tests. The inherited work-state endpoint was the competing full-row writer repaired
under V3; the original diagnosis and coordination request remain above. Provisioning
`SupplyReviewService` → `provisionFromSubmission` → `provisionDriverFromDraft`
creates a fresh random driver ID, so it does not ordinarily target an existing
named-command row. Startup seed persistence and expiry scans remain inherited;
there is no cross-process or ALLwriters serialization claim.

## Partial effects and verification limits

`createDriver` first awaits the existing strict profile save. A later registry
failure leaves that profile and its profile-save audit committed; the dedicated
failure case verifies this while master memory/audit/envelope remain absent.
Missing profile storage can reject first with
`DRIVER_PROFILE_STORAGE_UNAVAILABLE`; missing registry alone rejects with
`DRIVER_MASTER_STORAGE_UNAVAILABLE` **after** the profile save. No rollback,
compensation or cross-repository atomicity is promised.

Unit evidence controls only the external query boundary. SQL generation,
serialization, enabled guards, actual service logic, audit, controller envelope
and startup readback run unchanged production code. This is not real PG,
process restart, hosted HTTP, role/device/native/legal/provider/deployment or
full-system evidence. No project development environment, browser/E2E, local PG
or Docker was started. The broad existing test file uses an external webhook
test receiver; it does not host the product environment.

Initial API typecheck exited 2 due to missing worktree contracts/auth build
outputs and consequently stale contract types; log `api-typecheck.log` retained.
After local `pnpm --filter @drts/contracts build` and
`pnpm --filter @drts/control-plane-auth build` (both exit 0),
`pnpm --filter @drts/api typecheck` exited 0 (`api-typecheck-rerun.log`). This
builds packages only, without starting services or changing tracked sources.
Initial standalone race probes could not resolve shared-node_modules package
builds; retained `.stderr` files are setup failures, not obstruction proof. The
final probe resolves this worktree's built packages and confirms the production
race using the legal work-state value `paused`.

## Retained checkpoint verification

- Identical final `baseline.test.ts` + `fixture.ts` against immutable db212:
  **8 business failures / 4 successful controls**, exit 1,
  `baseline-db212-closeout.json`. Same production cases on the fixed source:
  **40 dedicated cases pass / zero fail / zero skip**, exit 0,
  `dedicated-closeout.json`. This includes F4 expiry → renewal.
- API actual affected test files were also run from `apps/api`:
  `pnpm exec vitest run tests/unit/regulatory-registry.service.test.ts tests/unit/auth-bootstrap.test.ts --reporter=json --outputFile=<report>`:
  **124 pass / 4 fail / zero skip**, exit 1, `api-existing-callers.json`.
  Failures are exactly two awaited auth suspension saves with disabled registry,
  one create save with disabled registry, and one synchronous lifecycle case.
  These add evidence for the first two requested adapter scopes. The root
  existing-caller run above (147/25) predates F4; it is preserved, not presented
  as a full passing final regression.
- API typecheck at the final production source: exit 0,
  `api-typecheck-final.log`. Dedicated test/source typecheck via
  `pnpm exec tsc -p <evidence>/tsconfig-scoped.json --noEmit`: exit 0,
  `scoped-typecheck-rerun.log`. The scoped config extends the real root config
  and includes only the dedicated test leaf; it still checks imported production
  source, without relaxing strict options.
- Initial scoped test typecheck exited 2 because strict indexed accesses needed
  explicit non-null assertions after controlled-write assertions/flushes;
  `scoped-typecheck.log` is retained. Initial standalone `.cjs` diagnostic failed
  ESLint's CommonJS import rule; it was converted to `.mjs` with Node
  `createRequire` for the actual CommonJS production modules, without disabling
  lint rules. Its intermediate unresolved `require` conversion is retained in
  `scoped-eslint-rerun.log` and `competing-writer-mjs.stderr` as a tooling failure,
  not product evidence. The final legal-value race proof is
  `competing-writer-mjs-final.json` (exit 0 = obstruction detected).
- Final scoped ESLint, Prettier and `git diff --check` results and source/report
  hashes are recorded in `checkpoint-evidence.json` and task `progress`. All
  launched checks are read to completion before yielding.

The preceding section records the earlier checkpoint, not the final candidate.
Its failures and source/scope limits are preserved; the final results below
supersede only their unresolved implementation disposition.

## V2/V3 repair and final source evidence

| Finding / acceptance                                                  | Final repair and exact production path                                                                                                                                                                                                                                                                                                                                                               | Immutable before → after                                                                                                                                                                                                                                                                                                                   | Evidence / exit                                                                                                                                                                                                                   | Remaining limit                                                                                                                                                                                     |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 / `registry_driver_master_saved_ack_waits_real_storage`            | Four named commands require enabled registry storage, await actual `persistChanges`, then publish staged master and successful audit. Four controller envelopes await the actual result                                                                                                                                                                                                              | db212 identical 12 cases: 8 business failures + 4 success controls → all 12 pass; dedicated final 58 pass                                                                                                                                                                                                                                  | `baseline-db212-closeout.json` exit 1; `final-root-regressions.json` exit 0. Exact command list and source/report hashes in `candidate-evidence.json`                                                                             | Controlled external query; no real PG/process restart/HTTP saved-ACK acceptance                                                                                                                     |
| F2 / `registry_driver_master_failure_and_existing_caller_regressions` | V2 actual enabled `RegulatoryRegistryRepository` fixtures and exact awaits; C060/profile/device/auth/shift/scanner/renewal/surname/settings assertions retained                                                                                                                                                                                                                                      | Initial root 147/25 and API 124/4 → final root **337/0**, API **131/0**, zero skip. Original C060 46, surname 37, settings 16 + helper 7 all pass unchanged                                                                                                                                                                                | `final-root-regressions.json`, `final-api-regressions.json`, both exit 0; `original-assertion-preservation.json` verifies 846 assertions/15 scopes                                                                                | No broad test/source rewrite. Hosted full suite still pending                                                                                                                                       |
| F3 same-row full-record overwrite                                     | Inherited setter keeps synchronous return and immediate local effect. Only its persistence uses the same driver queue, building from latest committed master plus its own two fields. Named intent captures local revision, so later setters remain visible even before queued staging begins. Publication overlays only `workState`/`updatedAt`; master rejection never publishes its staged fields | Immutable f10cb: 14 identical F3/F5 cases fail 11 + pass 3 controls; repaired identical 14 pass. Six initial F3 cases also preserved as 6 failures. Final 12 F3 cases cover before/after/multiple setters, two pending named commands, distinct-driver independence, disabled storage, synchronous guard and inherited best-effort failure | `f3-f5-immutable-before.json` exit 1; `f3-before.json` exit 1; final root exit 0. Standalone `competing-writer-probe.mjs --expect-coherent`: exit 0, `f3-coherent-final.json`, one pending query and final stored/memory equality | Same service instance only. Work-state remains best-effort, including its original local side effect on storage rejection; no new work-state durable ACK, cross-process lock or global writer claim |
| F4 expiry-derived validity                                            | `stageDriverMaster` fills existing derived metadata through `decorateDriver` while retaining the committed declared validity flag. Three strict updates publish raw staged state; read/response still derive expiry validity                                                                                                                                                                         | Expired → future renewal without a flag patch retains original behavior; dedicated production regression passes                                                                                                                                                                                                                            | Final root, `regressions.test.ts`; exit 0                                                                                                                                                                                         | Inherited restart/PG semantics are not redesigned                                                                                                                                                   |
| F5 C060 actual alias caller order                                     | `createDriver` invokes strict `upsertAdminProfile` immediately, before enqueuing only the registry continuation. A later canonical patch cannot enter the profile queue ahead of that call                                                                                                                                                                                                           | f10cb 2 meaningful query-record failures (first query is canonical patch) → same 2 pass; original 20 R1 alias cases also all pass                                                                                                                                                                                                          | `f5-before.json`, `f3-f5-immutable-before.json` exits 1; final root exit 0                                                                                                                                                        | Profile can commit before registry fails; no cross-repository atomicity                                                                                                                             |
| F6 historical readback staging                                        | Bounded `stageDriverMaster` uses existing production decoration before copying a loaded row that predates derived arrays/profile metadata. Retains scalar declared validity. Inherited queued persistence uses the same helper                                                                                                                                                                       | f10cb production repository readback: 3 named failures + 1 inherited success control → same 4 pass. The earlier V3 root run's historical work-state failure is retained                                                                                                                                                                    | `f6-immutable-before.json` exit 1; `f6-after-first.json` exit 0; `v3-root-callers.json` 225/1 exit 1 → final root 337/0 exit 0                                                                                                    | Actual repository `loadState` and module init with controlled queries; no fabricated table/schema or PG claim                                                                                       |
| `registry_driver_master_ack_same_candidate_review_ci_merge`           | Final ordinary commit/push → matching local/remote/PR head → normal `handoff` to Codex2                                                                                                                                                                                                                                                                                                              | Owner implementation/checks verified; independent same-head review, CI, protected merge and acceptance not yet recorded                                                                                                                                                                                                                    | `candidate-evidence.json` and machine lifecycle                                                                                                                                                                                   | Every remaining lifecycle gate must refer to this exact candidate; merge SHA remains separate                                                                                                       |

The V2 legacy expiry adapter models an explicit external availability transition:
it enables the actual repository for a master INSERT, records the actual
serialized write, then disconnects immediately after query ACK so the original
expiry-event tests exercise their inherited disconnected event store. It does
not implement expiry SQL or replace scanner/renewal business logic. Original
case inputs and assertions remain unchanged. This boundary is distinct from
production storage guards and is not a disabled-storage success fallback.

The final production/test source is anchored at
`56e69bb1d245d57e5c52d8f8fe99cec2d79ab304`; the subsequent delivery commit changes
only this evidence document. Final owner results are:

- Root affected regression set: 337 pass / 0 fail / 0 skip (23 files), including
  58 dedicated cases, original C060/surname/settings, inherited work-state
  consumer `owned-mobility`, auth/device/shift/scanner and actual controller calls.
- API affected regression set: 131 pass / 0 fail / 0 skip (3 files).
- API typecheck, dedicated/source scoped typecheck and ESLint over every changed
  TypeScript/module file: exit 0 (`final-api-typecheck.log`,
  `final-scoped-typecheck.log`, `final-eslint.log`). `git diff --check` passes.
- Standard `pnpm typecheck:root` exits 2 in this shared-node_modules worker:
  missing `@drts/passenger-client` build declarations and duplicate private
  `ApiClient` identity resolving into the concurrent Codex2 worktree. These
  diagnostics are outside the modified sources, retained in
  `v3-root-typecheck.log`. An evidence-only config extending the real root
  config, with the four actual workspace packages mapped to this checkout's
  source paths, passes full-root TypeScript checking (exit 0,
  `v3-root-typecheck-source-paths.log`); strict options/includes are unchanged.
  This does not claim the standard command passed; fresh hosted full CI remains
  the official integration gate. No repository config or shared dependencies
  were modified to obtain that result.
- Formatting checks cover changed source/tests/document except the auth fixture's
  inherited formatting. Its old db212 and current file both fail whole-file
  Prettier; only the granted import/constructor lines were changed there, so
  unrelated auth handlers were not reformatted. Logs
  `auth-baseline-format-old.log` / `auth-baseline-format-current.log` retain that
  limitation. All other task-owned changed files pass Prettier.

All launched owner checks are completed and results read before handoff. The
original checkpoint failures, source histories and task-spec generations remain
available; no regression was skipped/deleted/weakened and no `done` was called.
Candidate SHA/branch/PR and SHA256 hashes are frozen in the original evidence
artifact and normal handoff. This is source delivery, not deployment, real PG,
full-system, native, role, provider or legal acceptance.
