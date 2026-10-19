# RECONCILIATION-ISSUE-PERSISTENCE-ACK-20261015

Current continuation: Codex2 owner / Codex independent reviewer, normal R3
execution branch `codex2/reconciliation-issue-persistence-ack-20261015-root-r3-20261019`.
The complete original four clauses/four keys/three scopes remain unchanged.
The earlier Claude2 sections below are preserved history; the R3 section records
the actual lost-ACK finding and its new evidence. No earlier CI or test total is
borrowed as the new candidate's result.

## Historical Claude2 delivery, preserved

Status: implemented and pushed; PR opened (https://github.com/ajoe734/drts-fleet-platform/pull/2728), awaiting review/CI/merge.
Owner: Claude2. Reviewer: Claude. Original finding: C074-F1.

## Source and version identity

- Base: `origin/dev` at `b726c5cd08c932502d768e5766bbdf4753e4a1f4` (fetched at dispatch time).
- Branch: `claude2/reconciliation-issue-persistence-ack-20261015-delivery-r2-20261016`. No rebase, amend, reset or force push used.
- Task spec: `.local/goal-continuation-20261016T013025Z-original-area-and-reconciliation-root/RECONCILIATION-ISSUE-PERSISTENCE-ACK-20261015-R2-full-original-task-normal-source-continuation.task-spec.json` (and its R1 predecessor, same directory tree under `goal-continuation-20261015T1226-...`), audit ref `C074-C075-C088-current-accepted-payment-reconciliation-dataflow-readonly-audit.json`.
- Candidate identity: the final published branch HEAD at handoff time; full SHA, PR URL and manifest are recorded in canonical machine truth. Same-SHA mandatory CI, independent Claude review and protected merge remain pending at the time of writing.

## Findings and repair boundary

`BillingSettlementService.createReconciliationIssue`, `assignReconciliationIssue`, `addReconciliationIssueComment`, `resolveReconciliationIssue` and `reopenReconciliationIssue` previously mutated the shared `this.reconciliationIssues` array (for create) or the shared record object returned by `requireReconciliationIssue` (for the other four) _before_ calling `persistChanges`. Because `requireReconciliationIssue` returns a live reference into the shared array (not a clone), and `persistChanges`/`persistChangesRequired` already rejects and rethrows when the injected `BillingSettlementRepository` rejects a write, any rejected or still-pending canonical write left the in-memory cache (and therefore every `listReconciliationIssues`/`requireReconciliationIssue` readback and the controller response built from it) already showing the new issue, the new owner/status, the new comment, the new resolution, or the incremented reopen counter — a phantom state the durable store never actually has.

The fix stages the complete intended change in a private clone (`draft`) built off `cloneReconciliationIssue`, calls `persistChanges` with that staged clone, and only mutates the shared cache (`this.reconciliationIssues` prepend for create; `Object.assign(issue, draft)` for the other four, since `issue` is the live array reference) after the repository has acknowledged the write. On rejection, `persistChangesRequired` already rethrows (calling `reportPersistenceFailure` first when the repository implements it) and now nothing downstream has been touched — no array mutation, no field mutation, no audit log entry, because `recordAudit` is called after the (now successful) publish, exactly as before. The five production hunks changed are the five command methods only; `requireReconciliationIssue`'s own reference-returning behavior is unchanged (it has no other callers), `listReconciliationIssues`, `syncDerivedForwarderIssues`, `createIssueComment`, `mergeArtifactIds` and `persistChanges`/`persistChangesRequired` are unchanged.

A second, related gap: because the four read-modify-write mutators build their `draft` from the shared object's _current_ field values and only write back after their own `await persistChanges(...)` resolves, two concurrent calls against the **same** `issueId` (e.g. two comments, or an assign racing a resolve) could both read the same pre-write snapshot and the later `Object.assign` would silently clobber the earlier one's change (a lost update), even though each individual write was itself correctly ACKed. This is the same class of race the already-merged `PLATFORM-FLEET-PARTNER-PERSISTENCE-ACK-20261015` (#2659) fixed for `FleetPartnerService.updateFleetPartner` with a per-record promise queue; the same pattern is applied here as `serializeReconciliationIssueUpdate`, keyed by `issueId`, wrapping the full body (including validation) of `assignReconciliationIssue`, `addReconciliationIssueComment`, `resolveReconciliationIssue` and `reopenReconciliationIssue`. `createReconciliationIssue` needs no queue: it only ever appends a brand-new object, so it never reads-then-writes an existing shared record. The queue is a local, in-process `Map<string, Promise<void>>`; it introduces no multi-instance, distributed-transaction or cross-service lock, and independent issues are never serialized against each other.

Deliberate noDB/demo behavior (no repository configured → `persistChangesRequired` returns immediately, mutation proceeds synchronously as before), the resolved→reassignment `RECONCILIATION_ISSUE_RESOLVED` denial, the not-resolved→reopen `RECONCILIATION_ISSUE_NOT_RESOLVED` denial, forwarder/shadow issue sync (`syncDerivedForwarderIssues`), and Finance create/assign/comment/evidence/resolve/reopen success-audit-after-publish are all unchanged in effect and covered by regression below. No other module (`generateDriverStatements`/C089, tenant invoice reader/C077, C080 batch workflow, parent payment/refund ledger) was touched; `rg -n 'requireReconciliationIssue\(' apps/api` confirms its only four callers are the four methods edited here.

## Regression design and reproducibility

`tests/unit/reconciliation-issue-persistence-ack-20261015/reconciliation-issue-persistence-ack.test.ts` calls the real `BillingSettlementService` methods under test. Only the external persistence boundary is doubled: a small `FlakyReconciliationIssueRepository` implements the exact `BillingSettlementRepository` contract the service depends on (`isEnabled`/`loadState`/`persistChanges`/`reportPersistenceFailure`) with an in-memory durable table, a `failNextPersist` toggle to reject exactly one write, and a `holdNextPersist()` gate to keep exactly one write in flight — the same "mock the repository contract, never the service logic" convention already used for this same service in `tests/unit/audit-artifact-durability-20261002.test.ts`'s `emptyRepository()` helper and for `FlakyDocumentArtifactStore` in its R5 suite.

10 cases cover: for each of the five commands, a rejected write followed by a healthy retry, asserting (a) the pre-write in-memory snapshot is byte-identical to the post-rejection snapshot (`toEqual`), (b) no audit log entry was recorded for the rejected attempt (`getAuditLogsSnapshot` filtered by `actionName`/`resourceId`), (c) the retry publishes the exact intended result with no duplicate comment/evidence/reopen-count, and (d) a **fresh** `BillingSettlementService` instance sharing only the same repository's durable rows (`onModuleInit` → `loadState`) reads back the identical published state. Two original-authority regressions (resolved-reassignment denial, not-resolved reopen denial) and one noDB/demo full-lifecycle regression (no repository injected at all) guard the preserved behavior from `before_after_requirements`. Two concurrency cases prove (e) an in-flight write on one issue does not block an independent issue's create, and (f) two concurrent comments on the _same_ issue are serialized so the second starts from the first's acknowledged state instead of losing it — this second case would fail without `serializeReconciliationIssueUpdate` (the later `Object.assign` would overwrite the earlier comment).

These are in-process async-contract tests, not live PostgreSQL acceptance; no VM product/dev/preview/HTTP/browser/E2E/Docker/cloud/IAM/Operator process was started, consistent with the task's "no VM product/dev/preview/HTTP/PG/browser/E2E/Docker servers" instruction.

| Finding / required acceptance                                        | Source and modification                                                                                                                                                                                    | Before → fixed                                                                                                                                                                                                                                                                                                                                              | Commands, exit and evidence                                                                                                                                                                                                                                                                                                                                                                           | Outstanding limits                                                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| C074-F1 / `reconciliation-issues_canonical-ACK-before-publication`   | All 5 command methods in `billing-settlement.service.ts`: staged `draft` persisted before the shared cache/array is touched                                                                                | Rejected write still published the new issue/owner/status/comment/resolution/reopen-count → rejected write leaves cache and `listReconciliationIssues`/`requireReconciliationIssue` readback byte-identical to before, no audit entry                                                                                                                       | `npx vitest run tests/unit/reconciliation-issue-persistence-ack-20261015/reconciliation-issue-persistence-ack.test.ts`, exit 0, 10/10 passed, `.local/reconciliation-issue-persistence-ack-20261015/new-regression.log`                                                                                                                                                                               | Repository boundary is a hand-rolled in-memory double of the `BillingSettlementRepository` contract, not a live PG socket                          |
| `reconciliation-issues_pending-rejection-and-retry-readback`         | Same methods; a healthy retry after a rejection publishes the exact staged result; fresh-instance `onModuleInit`/`loadState` reload agrees                                                                 | Same suite's "ACK publishes the exact staged result ... fresh reload agrees" assertions per command                                                                                                                                                                                                                                                         | Same run/log as above; 5 of the 10 cases assert the `reloadIssue` fresh-instance readback                                                                                                                                                                                                                                                                                                             | Reload is from the same in-memory durable table (test double), not a second live PG connection                                                     |
| `reconciliation-issues_original-lifecycle-and-authority-regressions` | Resolved-reassignment and not-resolved-reopen denials unchanged; noDB/demo full lifecycle unchanged; added `serializeReconciliationIssueUpdate` per-issue queue; existing Finance suites re-run unmodified | All of `tests/unit/system-remediation/sr-qa-finance-001/`, `audit-artifact-durability-20261002.test.ts`, `billing-settlement.repository.test.ts`, `pax-payment-core-20261009/billing-recovery-writer.test.ts`, `billing-settlement.service.test.ts`, `billing-settlement.test.ts`, `billing-settlement-statements.test.ts` plus the 10 new cases still pass | `npx vitest run <paths above>`, exit 0, 159/159 passed, `.local/reconciliation-issue-persistence-ack-20261015/impacted-regression.log`                                                                                                                                                                                                                                                                | Full `pnpm test:unit`/`turbo run test` was not re-run in full; only the impacted suites listed                                                     |
| `reconciliation-issues_exact-candidate-validation`                   | This checkpoint; normal candidate lifecycle                                                                                                                                                                | API typecheck and scoped ESLint pass on the touched files                                                                                                                                                                                                                                                                                                   | `npx tsc -p apps/api/tsconfig.json --noEmit`, exit 0, `.local/reconciliation-issue-persistence-ack-20261015/typecheck-api.log` (empty = clean); `npx eslint apps/api/src/modules/billing-settlement/billing-settlement.service.ts tests/unit/reconciliation-issue-persistence-ack-20261015 --max-warnings=0`, exit 0, `.local/reconciliation-issue-persistence-ack-20261015/lint.log` (empty = clean) | Candidate handoff, mandatory CI, independent Claude review, protected merge and acceptance recording remain pending after this document is written |

## Checks and honest limits

- `pnpm --filter @drts/contracts build` and `pnpm --filter @drts/control-plane-auth build` were run first; both exited 0. The initial `apps/api` typecheck attempt failed with ~70 `TS2305`/`TS2339` errors across unrelated passenger-app/oauth/otp/payment-method/platform-admin/regulatory/tenant-partner/vehicle-eligibility/voice-booking files — all pre-existing stale-`dist` artifacts from `@drts/contracts`/`@drts/control-plane-auth`, not caused by this change (none of those files or modules were touched). After the two package builds, `apps/api` typecheck is clean (see table above).
- Node `v22.23.2`, pnpm `10.33.0`, Vitest `4.1.4`.
- Evidence logs are archived under `.local/reconciliation-issue-persistence-ack-20261015/` in this isolated worktree (gitignored, machine-specific, not commit evidence).
- No product dev/preview/browser/E2E server, Docker Compose, or cloud/IAM/Operator command was run, per the VM restriction for this dispatch. No claim is made of live PostgreSQL, HTTP, browser or hosted acceptance; those remain for the normal candidate CI/review/merge/acceptance lifecycle. Owner does not call `done` — candidate handoff only.

## Independent re-verification (later wake, same candidate SHA 3d396ab1d)

A later wake of this same task found the candidate already committed and pushed, matching `origin`'s head for `claude2/reconciliation-issue-persistence-ack-20261015-delivery-r2-20261016` exactly, but not yet opened as a PR and not yet handed off in machine truth. Rather than trust the prior wake's logged claims, every check in the table above was re-run from scratch in this worktree against the unchanged candidate SHA:

- `npx vitest run tests/unit/reconciliation-issue-persistence-ack-20261015/reconciliation-issue-persistence-ack.test.ts`: exit 0, 10/10 passed.
- `npx vitest run` across the same impacted-suite list (`sr-qa-finance-001/*`, `audit-artifact-durability-20261002`, `billing-settlement.repository.test.ts`, `pax-payment-core-20261009/billing-recovery-writer.test.ts`, `billing-settlement.service.test.ts`, `billing-settlement.test.ts`, `billing-settlement-statements.test.ts`): exit 0, 159/159 passed.
- `pnpm --filter @drts/contracts build` then `pnpm --filter @drts/control-plane-auth build` then `npx tsc -p apps/api/tsconfig.json --noEmit`: all exit 0, typecheck log empty.
- `npx eslint apps/api/src/modules/billing-settlement/billing-settlement.service.ts tests/unit/reconciliation-issue-persistence-ack-20261015 --max-warnings=0`: exit 0, no output.

All four results match the originally logged evidence exactly. Opened `https://github.com/ajoe734/drts-fleet-platform/pull/2728` (base `dev`) for the already-pushed candidate. The `ai-status.sh handoff` call to record this for reviewer Claude deferred (`orchestrator_approval_broker` MCP `CONNECT_TIMEOUT`, a session-wide infrastructure outage unrelated to this task — `ai-status.sh show` still succeeds, only mutating subcommands defer); this document and the PR are the durable record until that write lands.

## Second independent re-verification (later wake, same candidate SHA c4940cef6, broker still down)

A third wake re-confirmed, from scratch, that nothing has changed: local `HEAD` is still `c4940cef639014d9d84591d26fb61a6e8c9920f7`, matches `origin`'s head for `claude2/reconciliation-issue-persistence-ack-20261015-delivery-r2-20261016` exactly (`git ls-remote`), and matches PR #2728's `headRefOid`. Re-ran `npx vitest run tests/unit/reconciliation-issue-persistence-ack-20261015/reconciliation-issue-persistence-ack.test.ts`: exit 0, 10/10 passed — same result as both prior wakes. `gh pr view 2728` shows CI still in progress (`Unit test API image`, `build`, `Product root unit tests (shard 3/4)`, `cross-surface-e2e`, `ui-route-e2e`, `ui-shared-order-e2e` not yet completed), `mergeStateStatus: BLOCKED` (expected pending review+CI), zero reviews posted yet — no reviewer action to react to.

`AI_NAME=Claude2 ai-status.sh handoff RECONCILIATION-ISSUE-PERSISTENCE-ACK-20261015 c4940cef639014d9d84591d26fb61a6e8c9920f7 claude2/reconciliation-issue-persistence-ack-20261015-delivery-r2-20261016 Claude` was attempted again this wake and was again classified as `defer` before executing (same `orchestrator_approval_broker` MCP `CONNECT_TIMEOUT` outage as the prior wake; `ai-status.sh show` for this task still succeeds, confirming the defer is the broker, not this specific command or its argument form). No machine-truth handoff write has landed across three consecutive wakes for this reason. This document and PR #2728 remain the durable record; no further code change is needed from the owner side — the next action is either the broker recovering so the handoff write can land, or Supervisor/reviewer action taken directly against machine truth once the broker is back.

## R3: acknowledged updates survive current-collection refresh (2026-10-19)

### Original authority and immutable lineage

- Full original R2 spec SHA256:
  `871a354d25b222471417a3cb88be5f24602823190bb4f7593530c9c10189d1d2`.
  Its four complete clauses and the four original keys remain the requirements;
  old draft role wording is superseded solely by current normal Codex2/Codex routing.
- Preserved Claude2 published checkpoint:
  `2d79b068b229d8ba88fff30191c85de392ff9f38`, old PR2728 and its full history.
- Fresh accepted remote dev was read as
  `87f5991b956fba9e53543cdadeddfc33833dacc1` and ordinarily merged into that
  checkpoint as `5970b7fa620190c49802e69f2b9efeb3d2c9d57c`.
  No published history was rewritten. The failed sparse hook preparations were
  retained; with no functional WIP present, the failed uncommitted merge was
  normally aborted and the same ordinary merge completed using existing hooks.
- Root's complete R1 review is
  `Root-Reconciliation2d79-original-full4-fourkey-independent-request-changes.json`,
  SHA256 `40c8c236cdec3917cf10f5c43b898d46cde2e445f916667755c999384b17e5b6`.
  Normal routing and PDF-disjoint coordination receipts are preserved in the
  current task's read dependencies. The PDF-only c281d785 handoff is untouched.
- Machine evidence directory `E`:
  `.local/goal-continuation-20261019T0200Z-accepted61fa7-full-CI-and-native-continuation-root/reconciliation-issue-original-functional-evidence/`.
  `E/delivery-result.json` and its final source/hash manifests hold the eventual
  immutable candidate, PR, handoff generation, actual raw exits and exact paths.

### R1 reproduction and actual production repair

The original four existing-issue commands correctly staged and awaited SQL,
but retained a reference into the old collection. During that await, an actual
Forwarder arrival followed by the actual Controller list refresh cloned the
collection. `Object.assign(issue, draft)` then updated a detached object after
SQL ACK. Subsequent derived bulk persistence included unchanged manual rows,
allowing the old issue state to overwrite the acknowledged durable row.

All five commands now publish an acknowledged row by `issueId` into the current
collection through `publishReconciliationIssue`. The four existing-row commands
build audit/receipt from that published row. Their staging, validations,
rejection propagation, audit-after-ACK and existing per-issue command queue stay
intact. Independent issue additions survive publication.

`syncDerivedForwarderIssues` retains its synchronous derived queue/context
visibility and original forwarder field derivation, but persists only changed
derived IDs. It cannot bulk-upsert unrelated pre-ACK manual rows. Derived writes
share the existing per-issue queue with commands and select the current row when
their turn begins; an earlier delayed derived write cannot arrive after a later
command ACK and undo it. No global lock, distributed transaction, new policy,
role, money rule, timeout or schema was introduced. The existing persistence
helper still reports and rethrows actual SQL failures.

`E/production-hunk-boundary.json` independently compares the actual TypeScript
AST against the ordinary merge: only the original five commands,
`syncDerivedForwarderIssues`, and the new direct publication helper differ.
The other 139 class members, all imports/pure functions/PDF helpers, and the
original ten-case regression file are unchanged. PDF renderers/six producer
invocations, C089, PartnerRate, Finance policies, repository, Controller, SDK,
contracts and guards are not edited.

### Meaningful before/fixed evidence and full original keys

The new formal regression
`tests/unit/reconciliation-issue-persistence-ack-20261015/reconciliation-current-collection.test.ts`
uses the actual Controller, actual Repository SQL/JSON serialization, actual
Forwarder ingest/report/list, and actual Billing service. Only the external
DatabaseService query transport is controlled. It stores the production
repository's actual serialized `record`, rather than reimplementing its SQL or
the service's staging/publication judgments.

| Original key                                                         | Original conditions mapped to actual evidence                                                                                                                                                                                                                                                                                                                                                                                                                                           | Result and boundary                                                                                                                                                                                                                     |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reconciliation-issues_canonical-ACK-before-publication`             | All five original commands retain complete private draft and await persistence before manual shared publication/audit. Deferred and rejected actual repository SQL leave the whole old Controller/list/durable row/audit intact. R1's four actual Forwarder refresh races now publish the complete acknowledged row into the current collection and preserve independent derived B.                                                                                                     | Before at merge5970b7 with the original issue implementation: four lost-ACK cases FAIL and five pending/reject/retry cases PASS, direct1. Fixed both original/new suites:20 PASS/direct0; included in final206.                         |
| `reconciliation-issues_pending-rejection-and-retry-readback`         | Each actual command rejects without a success audit, then healthy retry has exact same source/order/tenant/partner/evidence/comments/counter and fresh supported Repository reload. Returned nested evidence/comment arrays are detached. Original same-issue comment queue remains; changed derived rows no longer bulk-write stale manual rows. The delayed derived-SQL case proves that the existing per-ID queue also prevents an old derived write completing after a command ACK. | New delayed-derived before:1 FAIL/9 not selected/direct1. Fixed all10 new production-boundary cases PASS, without changing the original10 assertions. SQL transport is controlled; no live PG claim.                                    |
| `reconciliation-issues_original-lifecycle-and-authority-regressions` | Original noDB full lifecycle, resolved-reassignment/not-resolved-reopen denials, same-issue sequencing, independent issue concurrency and original Forwarder/shadow context retained. Actual enabled-SQL five-command cases plus untouched Finance C068/C074/C075/C076/C077–C079/C080–C081/C082–C087/C088, repository/service/Controller, payment-recovery, statement and reimbursement export regressions run together.                                                                | Final17 files/206 executed PASS/0 FAIL/0 SKIP, direct0. All selected tests are socket-free; no real provider finance success, financial-policy change or hosted all-party reversal claimed.                                             |
| `reconciliation-issues_exact-candidate-validation`                   | Normal current owner routing/start, preserved old history and ordinary accepted merge; actual before/fixed raw logs, unchanged original tests and bounded AST comparison. Source-mapped task typecheck, existing full API typecheck and affected ESLint completed. Ordinary hooked commit/plain push, exact candidate publication and normal immutable handoff are recorded in E, followed by independent Root review/own mandatory CI/protected merge.                                 | Task TSC0; API TSC0 after only worktree-local ignored contracts/control-plane-auth declaration builds; affected lint0. No prior CI borrowed. Hosted CI/review/merge/keys are separate pending lifecycle outcomes, not owner acceptance. |

### Commands, direct exits, preparation failures and limits

Each named E check has its original `.log`, `-receipt.json` (exact argv/cwd/time
and direct process exit), and JSON test reporter where applicable.

- `before-current-collection-actual-forwarder`: original production methods at
  merge5970b7; 9 executed,5 PASS/4 FAIL/direct1, no unhandled errors. The accepted
  Forwarder now has asynchronous ingest/report methods, so the formal fixture
  awaits both actual producers. The earlier unawaited adaptation's four fixture
  errors are preserved in `before-current-collection-loaded` and are not defect
  reproduction credit. The first missing-Zod load error is likewise retained;
  only existing package dependency links were added, with no install.
- `before-derived-ordering`: same original production methods;1 FAIL/9 not
  selected/direct1 proves old derived SQL is not sequenced before assignment.
- `fixed-original-and-current-collection`:2 files/20 PASS/direct0. These20 are
  included in, and never added to, the final206.
- `final-complete-finance`: actual17 selected files/206 PASS/0 SKIP/direct0.
  Earlier broad checks failed on sparse missing UI/import/read-only files;
  their179/204 partial passes and errors remain in E. Materializing precisely
  their actual read dependencies allowed the complete same-source check, with
  no product/test assertion changes to make those failures disappear.
- `final-source-types`: `node node_modules/typescript/bin/tsc -p
tests/unit/reconciliation-issue-persistence-ack-20261015/tsconfig.json --noEmit
--incremental false`, direct0. The tracked task config maps its actual test
  and production dependency graph to this worktree's Source.
- `final-api-types`: existing `apps/api/tsconfig.json --noEmit --incremental
false`, direct0. Its declared local dist paths were generated only inside
  this worktree using the existing contracts/control-plane-auth TypeScript
  configs; no canonical Root outputs, dependencies or Source were changed.
- `final-affected-lint`: service and whole original task test directory,
  `--max-warnings=0`, direct0. Final ordinary commit hooks remain enabled.

No product/dev/preview/HTTP/WebSocket/browser/E2E/PostgreSQL/Docker server or
cloud/IAM/Operator operation ran here. The query transport is a socket-free
boundary, not real PostgreSQL or a replicated deployed service. The original
noDB and accepted Finance/provider limitations remain. This Source repair does
not claim C075 provider success, full C088 all-party reversal, hosted finance,
all134, Final or whole-goal completion. The owner does not approve or record its
own acceptance keys; Root is the assigned independent reviewer.
