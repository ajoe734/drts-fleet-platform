# Scanner oversized-response lifecycle repair — SR-GCP-SCANNER-OVERSIZE-RESPONSE-20261008

Owner Pi; independent reviewer Codex. Source-only repair; genuine hosted HTTP/storage acceptance remains on `SR-GCP-ARTIFACT-ACTIVATION-20261004`. No VM listener/engine/product/DB/browser/Compose.

## Actual source and hosted failure

Hosted [37710967398](https://github.com/ajoe734/drts-fleet-platform/actions/runs/37710967398) enforced source `593fd43cd8bb051845629d142703fe683704cc01` after reviewed/merged cold, foreground logger and canonical EICAR source fixes. Genuine clean hash/size/verdict, canonical EICAR infected hash/size and wronghash HTTP400 passed. Test4 oversized failed required413 vs empty503; later limits/fault/storage/cleanup/genuine lifecycle were unexecuted/skipped. No partial/live-complete claim.

Actual `operations/artifact-scanner/gateway/handler.ts::readBoundedBody` destroyed the IncomingMessage/request socket on overflow before resolving `too_large`, then `createRequestHandler` attempted `sendJson(413)` on that destroyed transport. Real Cloud Run request log records requestSize11535956/status503. Existing mock transport does not model destruction, so its prior pass is not evidence of a usable HTTP413.

## Bounded repair and regressions

Retain the exact 10MiB/MAX_PROOF_BYTES bound, request/hash/MIME validation, no engine work on oversized input, strict clean/infected/indeterminate semantics, private deployment settings and fail-closed gates. Overflow must discard retained chunks, settle once and drain/discard subsequent bytes without destroying the request before its JSON413 response completes. Existing Cloud Run/request timeout bounds remain; no unlimited accumulation/retry, invented scan, logging bytes or new Content-Length-only trust.

New `tests/unit/gcp-artifact-activation-20261004/test_gateway_oversize_response.test.ts` invokes the actual handler on native non-listening PassThrough streams held open across response completion; HTTP response and clamd boundaries mocked. Tests single/chunked overflow, exact maximum, response-before-destruction, tail discard/no concat/no duplicate response, zero engine work/logging on oversized data, correct hash rejection, canonical infection and indeterminate rejection. These stream assertions do NOT prove actual Cloud Run HTTP413; only a rebuilt hosted run can do that.

## Finding / acceptance ledger (updated after checks)

| Finding/key | Actual source | Old -> new proof | Checks/evidence | Remaining limits |
|---|---|---|---|---|
| F1 oversized transport prematurely destroyed; `oversize_actual_handler_response_lifecycle_and_bounds` | handler.ts readBoundedBody -> createRequestHandler -> sendJson | original593 native-stream destruction regression pending; corrected source pending | task-owned `.local/full-system-completion-20261008` logs, versions/exit status to be recorded after checks | mocked HTTP/clamd; actual listener prohibited here |
| `oversize_exact_sha_review_ci_and_merge` | existing candidate lifecycle and CI unit discovery | candidate handoff/review/CI/merge pending | assigned Codex exact-source independent review required | no source result fills parent live keys |

Original failed hosted run and adjacent source593 remain historical facts, not retried/relabelled pass. No changes to verifier expectations, ClamAV/config/protocol, limits, MIME/hash/private IAM, SDK overrides, readyvars or product deploy. All underlying engine/storage/generation/idempotency/fault/cleanup gates and one-release final journey remain open.
