# Scanner oversized-response lifecycle repair — SR-GCP-SCANNER-OVERSIZE-RESPONSE-20261008

Owner Pi; independent reviewer Codex. Source-only repair; genuine hosted HTTP/storage acceptance remains on `SR-GCP-ARTIFACT-ACTIVATION-20261004`. No VM listener/engine/product/DB/browser/Compose.

## Actual source and hosted failure

Hosted [37710967398](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37710967398) enforced source `593fd43cd8bb051845629d142703fe683704cc01` after reviewed/merged cold, foreground logger and canonical EICAR source fixes. Genuine clean hash/size/verdict, canonical EICAR infected hash/size and wronghash HTTP400 passed. Test4 oversized failed required413 vs empty503; later limits/fault/storage/cleanup/genuine lifecycle were unexecuted/skipped. No partial/live-complete claim.

Actual `operations/artifact-scanner/gateway/handler.ts::readBoundedBody` destroyed the IncomingMessage/request socket on overflow before resolving `too_large`, then `createRequestHandler` attempted `sendJson(413)` on that destroyed transport. Real Cloud Run request log records requestSize11535956/status503. Existing mock transport does not model destruction, so its prior pass is not evidence of a usable HTTP413.

## Bounded repair and regressions

Retain the exact 10MiB/MAX_PROOF_BYTES bound, request/hash/MIME validation, no engine work on oversized input, strict clean/infected/indeterminate semantics, private deployment settings and fail-closed gates. Overflow must discard retained chunks, settle once and drain/discard subsequent bytes without destroying the request before its JSON413 response completes. Existing Cloud Run/request timeout bounds remain; no unlimited accumulation/retry, invented scan, logging bytes or new Content-Length-only trust.

New `tests/unit/gcp-artifact-activation-20261004/test_gateway_oversize_response.test.ts` invokes the actual handler on native non-listening PassThrough streams held open across response completion; HTTP response and clamd boundaries mocked. Tests single/chunked overflow, exact maximum, response-before-destruction, tail discard/no concat/no duplicate response, zero engine work/logging on oversized data, correct hash rejection, canonical infection and indeterminate rejection. These stream assertions do NOT prove actual Cloud Run HTTP413; only a rebuilt hosted run can do that.

## Finding / acceptance ledger (updated after checks)

| Finding/key                                                                                           | Actual source                                                  | Old -> new proof                                                                   | Checks/evidence                                                                                            | Remaining limits                                   |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| F1 oversized transport prematurely destroyed; `oversize_actual_handler_response_lifecycle_and_bounds` | handler.ts readBoundedBody -> createRequestHandler -> sendJson | old handler blob14d1f8ac7 is identical at593 and baselinee788: new7 tests give2 lifecycle failures/5pass, exit1; fixed source gives7pass/0fail, exit0 | actual Vitest28pass across3files; helper51pass; Python16total=13pass+3genuine-engine skips; readiness17pass; scopedtsc/ESLint/discovery91/diff exit0 (commands/logs below) | mocked HTTP/clamd; actual listener prohibited here |
| `oversize_exact_sha_review_ci_and_merge`                                                              | existing candidate lifecycle and CI unit discovery             | candidate handoff/review/CI/merge pending                                          | assigned Codex exact-source independent review required                                                    | no source result fills parent live keys            |

## Completed source checks and explicit limitations

Node22.23.2, pnpm10.33.0, TypeScript5.9.3, Vitest4.1.4, Python3.12.3. Commands ran inside locked task worktree; machine logs under `.local/full-system-completion-20261008/`:

- Before production edit: `pnpm exec vitest run tests/unit/gcp-artifact-activation-20261004/test_gateway_oversize_response.test.ts`: exit1, exactly two response-before-destruction failures, fivepass (`oversize-old-regression.log`). Handler blob at baselinee788 and old593 is identical, verified using git rev-parse. Anchor is a red-regression checkpoint, not a candidate.
- After repair: `pnpm exec vitest run tests/unit/gcp-artifact-activation-20261004`: exit0, threefiles/28pass (`oversize-new-vitest-verified.log`). Earlier broader setup attempts failed missing zod, then Nest common; full logs retained, not pass. Corrected readonly workspace dependency links permit the whole applicable suite; no root dependency install/mutation. Actual source/strict verdict logic executes, HTTP/clamd replies mocked.
- `python3 -m unittest tools/ci/test_dev_artifact_providers.py tools/ci/test_verify_dev_artifact_backends.py -v`: exit0,51pass (`oversize-existing-helpers.log`); externalcommand/HTTP/storage boundaries mocked.
- `python3 -m unittest discover -s tests/unit/gcp-artifact-activation-20261004 -p 'test_*.py' -v`: exit0,16total,13pass+3genuineDocker/engine skips (`oversize-python.log`). Existing lifecycle fake-process ResourceWarnings retained. Skips are NOT engine proof; no CLAMD_IMAGE/realDocker engine started here.
- `python3 -m unittest discover -s tests/unit/gcp-scanner-cold-readiness-20261007 -p 'test_*.py' -v`: exit0,17pass (`oversize-readiness.log`); mocked CPU wrapper, clocks and HTTP, explicit hosted sections unexecuted.
- `pnpm exec tsc -p .local/tsconfig.sr-gcp-scanner-oversize-response-20261008.json`: exit0, full unfiltered output (`oversize-typecheck.log`), task-owned config extends correct parent base, incrementalfalse/noEmit; includes actual gateway handler and new test plus transitive imports. No filtered exit/pipeline masking.
- `pnpm exec eslint operations/artifact-scanner/gateway/handler.ts tests/unit/gcp-artifact-activation-20261004/test_gateway_oversize_response.test.ts`: exit0 (`oversize-lint.log`).
- `python3 tools/ci/check_test_coverage.py`: exit0,91trackedtest files discovered (`oversize-discovery.log`). Existing Vitest/Python discovery covers newfile; CI not edited.
- Content canonical consistency, commit trailers and complete task whitespace gates must be green at final push; sameSHA hosted CI/assigned Codex review/true merge still pending, not inferred from these local units.

Original failed hosted run and adjacent source593 remain historical facts, not retried/relabelled pass. No changes to verifier expectations, ClamAV/config/protocol, limits, MIME/hash/private IAM, SDK overrides, readyvars or product deploy. All underlying engine/storage/generation/idempotency/fault/cleanup gates and one-release final journey remain open.
