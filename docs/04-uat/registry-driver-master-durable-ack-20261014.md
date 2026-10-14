# REGISTRY-DRIVER-MASTER-DURABLE-ACK-20261014

Owner Codex; reviewer Codex2. Status: implementation checkpoint, **not a review
candidate**. Original C064/C061/C115 source repair only; parent/HOLD/native/role/
legal/provider/full-system requirements remain unchanged.

## Authority and repair boundary

- Task spec: `/home/lupin/workspace/drts-fleet-platform/.local/registry-driver-master-durable-ack-20261014-root/task-spec.json`,
  SHA256 `46d474083cf1b71675bad517059ec41c4bcbf0e14035a8ad4f9ef47f287cf37c`.
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

| Finding / acceptance                                                                                                          | Production source and change                                                                                                                                                                                                                                                                                                                                                                                                 | Old → new result                                                                                                                                                                                                                                                                           | Command / exit / evidence                                                                                                                                                                                                                                                                                                                                                       | Remaining requirement                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1: four commands return before registry storage and swallow rejection; `registry_driver_master_saved_ack_waits_real_storage` | `RegulatoryRegistryService.createDriver`, `updateDriverServiceBuckets`, `updateDriverLifecycle`, `updateDriverLicenses`; bounded `saveDriverMaster`, staged clones and per-driver queue; controller awaits all four before its existing envelope                                                                                                                                                                             | Immutable db212: 8 business failures (pending/reject per command), 4 successful serialization/readback controls. After initial source checkpoint 0540775f6: same 12 pass. Dedicated first run: 39 pass, zero skip. Subsequent declared-validity regression added; final run recorded below | `pnpm exec vitest run tests/unit/registry-driver-master-durable-ack-20261014/baseline.test.ts --reporter=json --outputFile=<report>`: baseline exit 1 (`baseline-db212-final.json`), after exit 0 (`after-baseline.json`). `pnpm exec vitest run tests/unit/registry-driver-master-durable-ack-20261014 --reporter=json --outputFile=<report>`: exit 0 (`dedicated-first.json`) | Acceptance not yet recorded; controlled query proof only                                                                                                                   |
| F2: async producer affects inherited test callers; `registry_driver_master_failure_and_existing_caller_regressions`           | Exact caller inventory below. Validation, duplicate creation through ACK, queue failure recovery, six command permutations, distinct-driver independence, response cloning, lifecycle timestamps, missing/disabled registry and C060 failure tested through actual producers/controllers                                                                                                                                     | Dedicated 39 pass; existing callers **147 pass / 25 fail / zero skip**, unchanged fixtures have missing awaits or disabled storage. No adapters edited outside scope                                                                                                                       | Existing-file Vitest invocation / exit 1, `existing-callers.json` and `.log`. Exact paths in report and below; no passing full-regression claim                                                                                                                                                                                                                                 | Supervisor must reserve precise test adapters before owner edits. Entire acceptance remains open                                                                           |
| F3: inherited work-state caller bypasses master queue and writes stale full row                                               | `RegulatoryRegistryController.updateDriverWorkState` → service `updateDriverWorkState` → unchanged best-effort `persistChanges` → repository full-record UPSERT. Licenses master is pending; work-state `paused` starts a second query with old `licensesValid=true`. Master ACK commits false; delayed inherited query overwrites it with true. Master publication also overwrites the inherited local `paused` side effect | Actual production query diagnostic confirms final memory false/available versus stored true/paused. This is an unresolved obstruction, not acceptance evidence                                                                                                                             | From `apps/api`: `pnpm exec node -r ts-node/register/transpile-only ../../tests/unit/registry-driver-master-durable-ack-20261014/competing-writer-probe.cjs`, exit 0 = **obstruction confirmed**, `competing-writer-final.json`. Only external query controlled; own built packages resolved because worker node_modules is shared                                              | Reported BEFORE any outside-scope writer edits. Need Supervisor decision on bounded same-row coordination; global persist rewrite / ALLwriters work is explicitly excluded |
| F4: preserve raw declared license validity when staging, so expiry does not become a permanent local flag                     | Three updates persist their existing decorated snapshot, but publish the raw staged record. `decorateDriver` continues to derive current expiry validity; future renewal can restore validity without an explicit flag patch, as before                                                                                                                                                                                      | Dedicated expiry → renewal regression added after inspection; final check below                                                                                                                                                                                                            | `regressions.test.ts`, production service/controller/repository                                                                                                                                                                                                                                                                                                                 | Existing expiry scanner fixtures still require the scoped adapters below                                                                                                   |
| `registry_driver_master_ack_same_candidate_review_ci_merge`                                                                   | Task branch `codex/registry-driver-master-durable-ack-20261014`; anchors 030d2d778 and 0540775f6 ordinarily pushed                                                                                                                                                                                                                                                                                                           | No candidate / independent review / hosted same-head CI / protected merge yet                                                                                                                                                                                                              | Status CLI `start` and `progress`; no `done` or handoff called                                                                                                                                                                                                                                                                                                                  | All lifecycle evidence pending; checkpoint push is not completion                                                                                                          |

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

No files in this list have been edited. Requested changes are only awaits/async
test callbacks and actual enabled registry repository with controlled external
query fixtures, preserving assertions. Baseline source inspection and the
existing-callers failure report establish the obstruction.

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
other matches are tests. The inherited work-state endpoint is a competing
full-row writer and remains an explicit unresolved finding. Provisioning
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

## Checkpoint closeout

Final dedicated/scoped checks, source/report hashes and the next checkpoint SHA
are recorded in the machine evidence artifact and task `progress` before this
worker yields. Required existing-caller scope coordination and F3 remain open;
do not hand off this checkpoint or describe it as completed.
