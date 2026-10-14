# SR-OPERATIONAL-EVIDENCE-RESTART-20261014

Owner: Pi. Independent reviewer: Codex. Source-only evidence-persistence repair.
Base: `620bc67bf394d45281393391d7c7f14bf933794e`.
Frozen task brief: `.local/pi-continue-finish-20261014/task-spec.json` under the
canonical repository root; SHA-256
`3ed9317e7d7330f1cd080a7ef604b9eef7f7a3a4fe03a17220afc05700bae4c6`.

## EVIDENCE-RESTART-001 — real hosted failure and lost evidence

[Deploy 38441804240](https://github.com/ajoe734/drts-fleet-platform/actions/runs/38441804240)
checked out this exact source for `publish/v2026.10.13.5`. Images, DB migration,
10-service deployment and health check succeeded. The workflow is nevertheless
**failure**, not a completed acceptance: operational candidate checks passed
14/14; browser checks passed 15/16 with the fleet submission journey failing.
The deploy outcome is `deployed=yes`, not "nothing deployed".

Job `115460151283` failed at the upload helper's bounded PUT, after the
60-second lifecycle budget. Its actual trace contains 31 completed assertions
on transient PUT 503 responses; it does not expose their error bodies, so those
trace assertions alone cannot prove that every one was the scanner-unavailable
code. The later admin upload has five recorded `DOCUMENT_SCANNER_UNAVAILABLE`
responses then a genuine clean receipt. This does **not** repair or establish
success of the failed fleet journey, or prove the backend's root cause.

Artifact `11837673503`,
`operational-browser-evidence-620bc67bf394d45281393391d7c7f14bf933794e`, was
downloaded and its entire ZIP digest verified:
`dae52c561344ba6193652fe36f0a64d09981a39ef92141eee078f9c827a02a17`.
Logs prove the first referral and enterprise mutations passed. But the final
`operational-browser-evidence.json` starts at the subsequent admin setup. The
failed fleet setup and both earlier passing journeys disappeared. Playwright
discards a worker after test failure; the next module load creates a fresh
`evidence` array, and its `afterAll` overwrites the same aggregate JSON.

## Repair and unchanged boundaries

- `tests/e2e/operational-evidence-journal.ts` appends each existing event
  synchronously to a filesystem journal before returning to the test. An
  interrupted worker's already-recorded events remain even without `afterAll`.
- The key binds candidate SHA, resolved materialized-manifest path and manifest
  bytes. The existing authorized wrapper creates a unique materialized manifest
  for each invocation and shares it with restarted workers. Different candidates
  or invocations are not merged. The existing single-worker configuration stays.
- `record()` in the actual spec supplies `workerIndex`, `testId`, and `retry`;
  `afterAll` combines the current journal, rather than replacing prior workers'
  records with a new in-memory array. Public aggregate shape stays
  `{candidateSha, manifest, evidence}`. No entry claims full journey success.
- Incomplete, malformed or foreign-identity records fail rather than silently
  disappearing. Filesystem failure remains a failure.
- All journeys, controls, readbacks, SHA assertions, upload code, scanner policy,
  60-second budget, 45-attempt limit, manifests, workflows, providers, IAM,
  object/DB cleanup restrictions and original acceptance keys are unchanged.
  Mandatory formatter whitespace is not a predicate or behavior change.
- The new journal contains only the existing deliberately selected evidence
  fields and non-secret test attribution. It does not capture headers, cookies,
  JWTs, provider credentials or raw response bodies.

## Verification and limitations

Evidence is under the canonical root's
`.local/pi-continue-finish-20261014/` (machine-specific, not hosted acceptance).

| Finding/check                 | Actual exercised behavior                                                                                                                                                                                                             | Results                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Same actual spec regression   | Vitest controls only Playwright registration and the API boundary; invokes the production spec's retired-surface callback, flushes, reloads the whole module as a new worker and flushes again. No duplicated persistence algorithm.  | At old base: one genuine assertion failure, first worker URL lost (`baseline.json` SHA-256 `f869488008a440166da03777778e77de882fb99e7d28d8ba81875872c78cccb1`). Repaired same assertion passes.                                                                                                                                                                                                                                                                                                                     |
| Journal and attribution       | Real filesystem; immediate write before flush, independent writer instances, separate exited Node process, SHA/manifest isolation, reserved-field integrity, corrupt journal rejection, existing JSON shape and no manufactured pass. | New focused tests execute the real journal and actual spec. Final run: **13 focused passed / 0 failed / 0 skipped**, included in the 103-case regression below; these counts are not added together.                                                                                                                                                                                                                                                                                                                |
| Existing affected regressions | Existing document-upload, operational manifest and healthcheck-identity suites retained verbatim.                                                                                                                                     | Initial broader run: 101 passed / 1 failure at the unrelated created-order matching-timeout fixture (`regression.json`). Isolated reproduction passed; unchanged full rerun: 102 passed / 0 failed / 0 skipped before the separate-process test was added (`regression-repeat.json`). Initial failure is preserved, not a zero-flakiness claim. Final after-hook-format/separate-process-test run: **103 passed / 0 failed / 0 skipped**, `final-regression.json`; SHA-256 is bound in the owner candidate receipt. |
| Typing                        | `pnpm typecheck:root`, then `pnpm typecheck`.                                                                                                                                                                                         | Root exited 0; full workspace 33/33 successful **cached** tasks. First wrong command targeting nonexistent `tsconfig.tests.json` exited 1 and is not a typing failure or pass.                                                                                                                                                                                                                                                                                                                                      |
| Formatting/lint               | Scoped ESLint and new-file Prettier; normal pre-commit hooks.                                                                                                                                                                         | Final exact-candidate checks in owner receipt. Initial old spec's whole-file formatting check failed on pre-existing formatting; normal hooks format it without behavior changes.                                                                                                                                                                                                                                                                                                                                   |

The initial unlocked interactive worktree was removed by repository maintenance
between baseline and editing. Baseline results remained under `.local/`. Work
continues on the same branch/base in a separately **locked** owner worktree;
there was no reset/rewrite, lost candidate, bypass or new published branch.

No browser, HTTP/API, PostgreSQL, Docker or product development server ran on
this VM. Unit API responses are controlled; they do not prove real role/provider
or upload acceptance. Independent exact-SHA review, mandatory same-SHA hosted
CI and protected merge are pending until their actual results are recorded.
AST-normalized comparison confirms that all spec statements other than the
persistence imports/collector, `record` and `afterAll` are unchanged. All original
helper, manifest, Playwright config, wrapper and workflow blobs are unchanged;
`semantic-boundary.json` binds the exact checks.
The root release coordinator owns the next immutable cut; no deployment or
rerun is dispatched by this task. `.5` fleet scanner/PUT failure, original
native Android+iOS, lawful receipt/payment facts, provider, cross-role,
cleanup/history HOLD and full-system acceptance remain open.
