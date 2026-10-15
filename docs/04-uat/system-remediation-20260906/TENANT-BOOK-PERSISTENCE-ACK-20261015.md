# TENANT-BOOK-PERSISTENCE-ACK-20261015

Status: owner checkpoint; scope coordination required before candidate handoff.
Owner: Codex. Reviewer: Codex2. Original finding: C027-CURRENT-01.

## Source and version identity

- Base/source: `a8d9a55dc30c6cf9d37145e4f46ac98c12e6c8b1` (the dispatch's immutable audit source and fetched `origin/dev`).
- Historical regression checkout: `0eb53d857f17cd3d3f87a9ad8bb3460cb064563e` (test-only anchor; production files identical to base).
- Tested implementation checkpoint: `91bdaec1da96dfee4c18c96bdffd748d502c6465`.
- Branch: `codex/tenant-book-persistence-ack-20261015`. Checkpoints pushed normally; no rebase, amend, reset or force push.
- Candidate SHA: **not assigned**. This is incomplete work, not a review candidate. Same-SHA mandatory CI, independent Codex2 review, protected merge and acceptance remain pending.
- Source authority: the dispatch task spec at `.local/remaining-original-functional-fixes-20261015/TENANT-BOOK-PERSISTENCE-ACK-20261015.json`; original C027 audit at `.local/goal-continuation-20261015T0806-focused-unproved-original-Source-root/C027-current-accepted-Tenant-book-dataflow-readonly-audit.json` in the canonical repository.

## Findings and repair boundary

`TenantPartnerService.upsertPassenger`, `upsertAddress`, `upsertCostCenter` and `disableCostCenter` previously published local records, invoked background `persistChanges` and returned a record. That helper catches repository rejection. The four controller methods immediately wrapped that return in a success envelope. `TenantPartnerRepository.persistChanges` already awaits `Promise.all` over the selected SQL writes; its contract needs no modification.

The checkpoint uses `persistChangesRequired` before local publication and audit, and the controller awaits the result before constructing its envelope. An unsuccessful write never publishes the attempted record, so no whole-array rollback can overwrite another successful request. Per-resource, per-service promise queues keep ownership validation, write and publication ordered for the same passenger/address ID or tenant/cost-center code. Rejection releases that queue. These queues are local implementation synchronization, not a multi-instance policy or acceptance gate.

Passenger/address ownership and cross-tenant checks, cost-center owner/code validation, normalization, masking and quality checks remain in the production methods. No UI, SDK, contract, hard-delete, inactive-reference, peer-cache, restart or global multi-instance behavior is added.

All four controller bodies and every direct call found by `rg -n '\.(upsertPassenger|upsertAddress|upsertCostCenter|disableCostCenter)\(' apps/api tests --glob '*.ts'` were read. The portal and SDK HTTP paths already await their operations. The existing API service unit callers in the authorized file now await their writes. Other direct callers require the scope expansion below.

## Required scope coordination (unresolved)

The task's current allowlist excludes real callers that must change with this async contract. The owner requested Supervisor conflict checking and exact scope expansion through the release `ai-status.sh progress` on 2026-10-15. No excluded file has been edited. The attempted `blocker ... Supervisor` was rejected (`Unknown agent: Supervisor`, exit 1); `progress` successfully records the request without inventing a different waiting agent.

Production changes needed:

1. `apps/api/src/seed/tenant-governance-default.ts`, cost-center map around line 287: await each write before dereferencing the returned record; await the map results before the following audit and quota work. Current API typecheck fails on `created.code/name/ownerUserId/ownerName` at lines 319–323.
2. `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`, `createReferralPassengerBooking` around line 13893: await passenger creation in the missing-master fallback before continuing booking. This existing function is already async.

Existing tests need only caller-await, async callback and rejected-promise assertion adaptations, preserving their original assertions:

- `apps/api/tests/unit/owned-mobility.service.test.ts`
- `apps/api/tests/integration/tenant-governance-e2e.test.ts`
- `tests/unit/tenant-partner-foundation.test.ts`
- `tests/unit/system-remediation/sr-qa-tenant-001/tenant-directory-and-settings.test.ts`
- `tests/unit/system-remediation/sr-qa-tenant-001/tenant-approval-and-quota-lifecycle.test.ts`
- `tests/unit/system-remediation/sr-qa-booking-001-fix-quota-release/c028-tenant-quota-release.test.ts`
- `tests/integ/tenant-governance-negative.test.ts`
- `tests/security/iam-tenant-session-revocation-e2e.test.ts`
- `tests/e2e/tenant-console-oidc-production.test.ts` (its mocked fetch currently serializes an unawaited controller envelope; no browser/server run is requested).

After scope coordination, adapt those callers, run impacted regressions and typecheck/lint, publish a final candidate and use the normal same-SHA lifecycle. This document preserves these unresolved items rather than claiming an incomplete candidate is ready.

## Regression design and reproducibility

`tests/unit/tenant-book-persistence-ack-20261015/persistence-ack.test.ts` calls actual service and controller methods and the real `TenantPartnerRepository.persistChanges`/`loadState`. Only `DatabaseService.query` is simulated. The transport can defer/reject an INSERT and retains JSON records only after the deferred query succeeds; SELECT readback goes through the production repository. No business SQL or schema is recreated in the test. These are async contract tests, not live PostgreSQL acceptance.

The 14 cases cover all four delayed controller envelopes, all four rejected updates/disables, three rejected creates, no-DB successful readback and ownership/validation refusals, simultaneous cross-tenant claims of a passenger ID, and same-record failure followed by successful queued update retaining user metadata. An unrelated successful passenger mutation also survives each rejected update/disable.

The identical test file was copied into a locked detached historical checkout of `0eb53d857`, without resetting the active worktree. Its SHA-256 is `4aee0e97a15868b4dfc65b346a671aea19be0bf53ab636037940c791162681e4`. All 14 fail on old production source; all 14 pass in the implementation checkpoint. The old failures include immediate success envelopes on deferred/rejected SQL and the synchronous ownership exception not conforming to the expected asynchronous call contract.

Evidence directory (machine-specific, untracked, relative to this isolated worktree): `.local/tenant-book-persistence-ack-20261015/`. Logs and `checkpoint.json` are also archived at `/home/lupin/workspace/drts-fleet-platform/.local/tenant-book-persistence-ack-20261015/91bdaec1da96dfee4c18c96bdffd748d502c6465/` in the canonical root.

| Finding / required acceptance                                            | Source and modification                                                                                            | Before → checkpoint                                                                                                                                       | Commands, exit and evidence                                                                                                                                                                                                     | Outstanding limits                                                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| C027-CURRENT-01 / `tenant-book_existing-mutations-await-canonical-write` | Four production service methods and controller methods; existing repository async contract                         | Deferred controller success was immediate → pending until SQL transport completes; returned `data` is the concrete record                                 | Old: `pnpm exec vitest run tests/unit/tenant-book-persistence-ack-20261015/persistence-ack.test.ts` in historical checkout, exit 1, `before-final.log` (14 failed). Fixed: command below, exit 0, `fixed-final.log` (85 passed) | Final candidate/CI pending; no live PG/HTTP proof                                                                                           |
| `tenant-book_write-failure-and-readback-correctness`                     | Same methods; publication after successful required write; keyed local queues                                      | Rejection swallowed and local phantom data → rejection reaches controller caller, prior record/unrelated success retained; successful repository readback | Same before/fixed runs and test hash; actual production repository invoked                                                                                                                                                      | Simulated SQL transport only; no restart or multi-instance claim                                                                            |
| `tenant-book_original-tenant-and-noDB-scope-preserved`                   | Existing guards/validation retained; authorized API service unit callers await writes; added no-DB/ownership cases | Scoped existing service tests and new no-DB cases pass                                                                                                    | Fixed run: 71 existing service cases + 14 new cases, exit 0                                                                                                                                                                     | Other existing synchronous callers/tests await scope expansion; verified-principal HTTP guard regressions not rerun; not an acceptance pass |
| `tenant-book_exact-candidate-validation`                                 | This checkpoint and original task lifecycle                                                                        | Scope/lint checks available; final integration blocked by omitted callers                                                                                 | API/root typecheck exit 2, details below; scoped ESLint exit 0                                                                                                                                                                  | No candidate/handoff, mandatory CI, review, merge or acceptance evidence yet                                                                |

Final scoped test command (run with cwd `apps/api`, required by the existing dashboard fixture's `process.cwd()` paths):

```bash
pnpm exec vitest run --config ../../tests/unit/tenant-book-persistence-ack-20261015/vitest.config.ts
```

The scoped config overrides the include array and selects exactly the existing API tenant-partner service unit file and this task's regression file. Running the service file from repo root previously yielded one fixture path failure (84 passed, 1 failed, exit 1); rerunning from its expected API cwd passes all 85.

## Checks and honest limits

- Dependency repair: `python3 tools/development-orchestrator/bin/ensure-local-node-modules.py --root "$PWD" repair`, exit 0 (`deps.log`). The initial node_modules symlinks pointed to a removed worktree; the first failed test import is environment setup failure, not original-defect reproduction. The repair creates local worktree dependencies.
- `pnpm --filter @drts/contracts build`, exit 0 (`build-contracts.log`).
- `pnpm --filter @drts/control-plane-auth build`, exit 0 (`build-auth.log`).
- Scoped ESLint: `pnpm exec eslint apps/api/src/modules/tenant-partner/tenant-partner.service.ts apps/api/src/modules/tenant-partner/tenant-partner.controller.ts apps/api/tests/unit/tenant-partner.service.test.ts tests/unit/tenant-book-persistence-ack-20261015 --max-warnings=0`, exit 0 (`lint-final.log`).
- `pnpm --filter @drts/api typecheck`, exit 2 (`typecheck-api-final.log`): seed caller still treats `Promise<TenantCostCenterRecord>` as a synchronous record. This is an unresolved task issue requiring the exact additional production caller scope.
- `pnpm typecheck:root`, exit 2 (`typecheck-root-final.log`): excluded direct test/controller callers still use synchronous records/envelopes; see the scope list. No successful full typecheck is claimed.
- An initial unsupported Vitest `--include` invocation exited 1 before running tests. A later draft config used `mergeConfig`, whose array concatenation widened discovery; that run was interrupted with SIGTERM (exit 143, `service-unit.log`) and is not a passing regression result. The config now replaces `test.include` explicitly. Its untracked generated fixture was moved to `.local/tenant-book-persistence-ack-20261015/interrupted-test-artifact/`.
- No product dev/preview/browser/E2E server, Docker or PG server command was intentionally launched. The interrupted broad discovery is not proof of allowed runtime validation; its log is retained. No live DB, HTTP, browser, provider or shared-dev deployment evidence is claimed.
- This repair does not establish full C027, runtime delivery, Final/HOLD resolution, or the overall project goal. Original `SR-QA-BOOKING-001` evidence retains its original scope.
