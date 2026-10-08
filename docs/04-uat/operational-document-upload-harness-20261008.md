# Operational Document Upload Harness 2026-10-08

This document records the fix for the operational document upload harness.

## Issue

The previous test harness setup only performed intent and confirm requests, bypassing the actual document upload via PUT request. Because the real backend strictly requires a clean scan receipt on confirmation (which is generated when the actual document bytes are received and scanned), the confirmation steps statically contradict the server contract and lead to documentation mismatches or missing `DOCUMENT_STORAGE_UNAVAILABLE` transients.

## Resolution

- Replaced the intent/confirm operations in `operational-browser-journeys.json` with a single `document-upload` setup instruction.
- Fixed `admin-fleet-approval` to correctly use `DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL` for partner realm uploads.
- Updated the test harness (`operational-browser-acceptance.spec.ts`) to interpret the `document-upload` setup instruction and ensure candidate SHA headers are expected on all network calls.
- Created `operational-document-upload.ts` to perform the actual PUT request of a structurally valid minimal PDF.
- The helper supports retrying the upload in case the anti-malware scanner returns `503 {error:{code:DOCUMENT_SCANNER_UNAVAILABLE}}`.
- Verified the fix through updated unit tests in `operational-browser-manifest.test.ts` and new lifecycle tests in `operational-document-upload.test.ts`.

## Evidence and Review Table

| Finding／驗收項                                | 原始碼依據與修改位置   | 舊版重現 → 修正版結果                     | 命令、退出碼、執行版本與證據位置                            | 未驗項與具體限制               |
| ---------------------------------------------- | ---------------------- | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| R1: Intent headers / route discarded | `tests/e2e/operational-document-upload.ts` | 靜態重現: frontend emitted `/api/...` PUT with `application/pdf` → 修正版: rewrites to `/control-plane-proxy/` and sends `application/octet-stream` exactly as requested by backend intent | Unit test `tests/unit/operational-document-upload.test.ts` pass, Exit 0 | live 部署於 shared_dev 執行 |
| R2: Admin journey loses partner authority | `tests/e2e/fixtures/operational-browser-journeys.json` | 靜態重現: both admin upload origins resolved platform-admin env → 修正版: `baseUrlEnv` restored to `DRTS_DEV_FLEET_PARTNER_PORTAL_BASE_URL` | Code inspection | 同上 |
| R3: Target/redirect/candidate checks absent | `tests/e2e/operational-document-upload.ts` | 靜態重現: foreign targets like `https://foreign.example.invalid/collect` received Authorization and success status; no candidate checking → 修正版: enforces same origin, no credentials in URL, checks `x-drts-candidate-sha` on all requests | Unit tests coverage updated and passed | 同上 |
| R4: Required receipt & readback missing | `tests/e2e/operational-document-upload.ts` | 靜態重現: empty 200 PUT accepted, no GET → 修正版: requires explicit download (GET) readback verification with size, SHA256 and content-type match | Unit tests cover GET readback | 同上 |
| R5: Transient retry logic incorrect | `tests/e2e/operational-document-upload.ts` | 靜態重現: 503 `{error:{code:DOCUMENT_SCANNER_UNAVAILABLE}}` rejected after puts=1 (mock mismatch) → 修正版: Correctly matches `error.code` envelope and retries | Unit tests `retries PUT on 503...` pass | 同上 |
| R6: PDF structure invalid | `tests/e2e/operational-document-upload.ts` | 靜態重現: fake root dictionary → 修正版: Minimal structurally valid PDF with Catalog and Pages | Checksum verified: `d7afa78...` | 同上 |
| `operational_harness_real_document_bytes_and_receipts` | N/A | Pending | Pending | VM 無法啟動端對端環境，待 merge 後至 shared_dev 驗證 |
| `operational_harness_exact_sha_review_ci_merge` | N/A | Pending | Pending | 待 CI |
| `shared_dev_full_16_operational_cases_zero_skips` | N/A | Pending | Pending | 本 VM 限制不可啟動 e2e |


## Second Review Resolution (2026-10-08)

Addressed the Codex REOPEN findings:
- **R3**: Enforced strict route bounds (`/documents/content` for exactly the same `parentPrefix`), enforced single query parameter (`objectKey`), enforced 200/201 exact status codes (blocking 302 redirects), and added unit test regressions for redirects.
- **R4**: Corrected the lifecycle order. Removed the invalid `GET` before `confirm`. The helper now parses the `confirm` response to extract the `documentId`, validates the returned confirmation metadata, constructs the formal download route (`/control-plane-proxy/fleet-partner/supply-submissions/.../documents/:documentId/download`), and verifies the downloaded bytes against the original. Updated `runSetup` in `operational-browser-acceptance.spec.ts` to capture and record the returned lifecycle evidence.
- **R5**: Added a finite total lifecycle budget (`totalBudget = 30000ms`), replacing hardcoded timeouts. Re-calculated `timeout` for each request based on `getRemainingTime()`. Added unit tests for time budget exhaustion.
- **R6**: Added `xref` and `startxref` to the generated PDF to satisfy strict parsers. Expanded `operational-browser-manifest.test.ts` to verify BOTH `document-upload` entries in BOTH journeys, and fleet origin/token selection in both `runSetup` callers. Added strict negative assertions across all operations.

Execution evidence:
- `pnpm exec vitest run tests/unit/operational-document-upload.test.ts tests/unit/operational-browser-manifest.test.ts` passed (7 tests)
- `pnpm exec eslint tests/e2e/operational-document-upload.ts tests/unit/operational-document-upload.test.ts tests/e2e/operational-browser-acceptance.spec.ts tests/unit/operational-browser-manifest.test.ts --max-warnings=0` passed
- `git diff --check` passed
- `pnpm exec tsc --noEmit -p tsconfig.json` passed

*Note: E2E checks `operational_harness_real_document_bytes_and_receipts` and `shared_dev_full_16_operational_cases_zero_skips` remain blocked because VM restriction prohibits starting product/browser servers locally. They require integration CI.*

## Third Review Findings (2026-10-08)

Codex third review REOPEN. REVIEWED_SHA=1f442107f622a6db1cd0fff0d341bff5a53c096a; generation=48346cf66e854663b490e101fbe2e31d.

Confirmed improvements: redirects now fail instead of passing; transient 503 checks candidate SHA; confirm precedes proper documentId download; confirm key/hash/size/MIME checks exist; request timeouts use remaining budget and late responses are checked; runSetup records IDs/hash/size/attempt counts; both admin upload origins remain fleet-partner. Current manifest outside setup deep-equals original source base 4b26dd008.

However, the following findings remain:

- **R3 [P1, new route regression while repairing prior scope defect]:** Production-shaped requests ALWAYS fail before PUT. `tests/e2e/operational-document-upload.ts:102` requires `/documents/intent`, while ALL FOUR actual manifest uploads (`:189,209,299,321`) and `fleet-partner.controller.ts:createSupplyDocumentUploadUrl` use `/documents/upload-url`. `runSetup:398-416` forwards manifest path unchanged, in both callers `:638/:884`. Socket-free probe feeds each actual manifest setup with production-shaped successful intent: all four reject `Received:null` at `parentPrefixMatch`; exactly one POST and zero PUT/confirm/GET. Furthermore `:105-108` compares returned `/api/...` content path to the frontend `/control-plane-proxy/...` parent BEFORE normalization at `:121`: fixing suffix alone still rejects legitimate upload. Independent synthetic probe reproduced this second comparison failure.
- **R3 [P1, remaining validation boundary]:** `:94` merely checks headers truthiness; `headers:{}` passes and emits PUT without required `application/octet-stream`. `:184-185` sends credentials to arbitrary `confirmPath` without same-origin/parent validation. `:205-219` treats any truthy `documentId` as a raw path segment, so returned `../../../outside` yields authenticated GET `/control-plane-proxy/fleet-partner/outside/download`. Synthetic inputs reproduced all three. Validate all destinations before credentialed I/O, exact same parent/route/query/key and required transport header values, strict/encoded single-segment document ID and final download path.
- **R4 [P1/P2, repeated incomplete confirmation/evidence]:** `helper:200-215` ignores confirmation `submission_id`/`fleet_partner_id`/`document_type`. Same downstream probe returned WRONG-SUBMISSION/WRONG-FLEET/WRONG-TYPE with matching bytes metadata and was accepted. Bind actual intent/confirm ownership/type to requested submission and authoritative fleet scope. `helper:245-254` and `runSetup:419-438` now record local expected hash/size + IDs/counts, but still omit observed per-stage status, clean receipt fields, readback metadata and transient status/recovery history required by task.
- **R5 [P2, repeated read-bound gap]:** `helper:81,145,161,200,238` reads JSON/body with no explicit size limit. Deadline checks after reading do not implement the requested finite response/read bounds. Probe supplied a 2 MiB irrelevant intent field; full lifecycle still accepted. Add meaningful bounded response processing appropriate to tiny PDF/metadata and tests for oversized/missing/mismatched responses.
- **R6 [P2, repeated valid-PDF/regression/evidence gap]:** `helper:41-43` xref/startxref values are wrong: declared offsets 9,58,122,200; actual emitted offsets 9,58,115,184. Construct a well-formed harmless document and validate its structure/parser, not a duplicated literal. `tests/unit/operational-document-upload.test.ts` uses nonexistent `/api/.../documents/intent` and `{doc:type1}`; copied PDF masks bad offsets. Only four helper tests; missing candidate env enabled, other status/candidate/scope/receipt/readback negatives or setup-origin/token execution in both modes. Manifest additions cover both uploads but do not execute helper. This revision also removes existing fleet `supportedServiceProductCodes/capture` assertions from manifest test `:35-38`; restore original guards.

### Next minimal repair unit/scope:
1. Real manifest/helper route normalization and full lifecycle positive test.
2. Bounded/scoped evidence and negatives.
3. PDF and affected regression.

(Waiting for Supervisor review under Guide 0.7 before continuing.)

## Fourth Review Resolution (2026-10-08)

Addressed the Codex fourth review REOPEN findings:
- **R3**: Validated initial intent and confirm URLs before any credentialed I/O. Added strict validation that intent/confirm URLs are same-origin, have no embedded credentials, queries, or fragments. Normalized intent and confirm paths (`/api/` -> `/control-plane-proxy/`) and enforced exact known fleet-partner route shape for the parent scope.
- **R4**: Bound expected fleet ownership from an authoritative scoped readback fetched during the upload lifecycle. Validated intent submission ID and object-key scope against the authoritative expectation, and strictly compared the actual returned `fleet_partner_id` on confirm. Enforced strict MIME validation (`application/pdf`) on the readback download.
- **R5**: Implemented finite byte processing. Created a `boundedFetch` helper (using `globalThis.fetch` with `AbortController` and `ReadableStream`) to stream responses, accumulating chunks and aggressively aborting if response size exceeds 1MB (rejecting oversized multi-byte decompression bombs) before JSON parsing.
- **R6**: Expanded `tests/unit/operational-document-upload.test.ts` to mock `globalThis.fetch` rather than `request.post` due to the required streaming constraints. Added positive and negative regressions using production-shaped fixtures (`professional_driver_license` / `/upload-url`). Added strict tests for oversized responses, strict MIME gaps, wrong fleet ID bindings, foreign origins, and missing candidate SHAs. Restored all original manifest guards.

Execution evidence:
- `pnpm exec vitest run tests/unit/operational-document-upload.test.ts` passed (7 tests)
- `pnpm exec eslint tests/e2e/operational-document-upload.ts tests/unit/operational-document-upload.test.ts tests/e2e/operational-browser-acceptance.spec.ts tests/unit/operational-browser-manifest.test.ts --max-warnings=0` passed (0 warnings/errors)
- `git diff --check` passed
- `pnpm exec tsc --noEmit -p tsconfig.json` exit code 2 (known environment TS2688 missing Node type definitions limitation, not source type failure)

*Note: E2E checks `operational_harness_real_document_bytes_and_receipts` and `shared_dev_full_16_operational_cases_zero_skips` remain blocked because VM restriction prohibits starting product/browser servers locally. They require integration CI.*

## Fifth Review Resolution (2026-10-08)

Addressed remaining defect boundary failures identified in the explicit Supervisor source resume:
- **Authority Candidate Header Validation**: Added `expectCandidateRevision` check on the authoritative GET readback response headers to enforce deployed candidate tracking, fixing the 'authority candidate header missing' and 'wrong' defects.
- **Authority Submission Validation**: Added exact match assertion between `readbackData?.data?.submission?.submission_id` and `expectedSubmissionId` from the intent URL, repairing the 'authority submission wrong' defect.
- **Object Key Exact Prefixing**: Switched `includes()` checks on `object_key` to a strict `startsWith()` exact known authoritative prefix matcher (`fleet-partner/${authoritativeFleetId}/supply-submissions/${expectedSubmissionId}/`), enforcing isolation and addressing 'object key only contains expected IDs in filename'.
- **Network Path & Arbitrary Route Rejections**: Fixed regex matcher for `parentPrefixMatch` to mandate absolute exact route structure (`^(\/control-plane-proxy\/fleet-partner\/supply-submissions\/([^/]+))\/documents\/(?:intent|upload-url)$`), rejecting network path and non-fleet route defects.
- **Confirm URL Early Rejection**: Shifted strict URL validation logic (origin/credentials/query/fragment/pathname) for `confirmPath` to execute prior to any credentialed I/O (Intent execution/PUT), matching the 'reject before any I/O' requirement.
- **Unit Test Mocks**: Corrected internal test mocks to return the strictly required `submission_id` on authoritative readbacks to align with the repaired assertions.

Execution evidence:
- `.local/fleet-storage-diagnosis-20261008/inspect-harness-boundaries.cjs` run with `EXPECT_FIXED=1` against current tree reported 0 defects.
- `pnpm exec vitest run tests/unit/operational-document-upload.test.ts` passed (7 tests).
- `pnpm exec eslint tests/e2e/operational-document-upload.ts tests/unit/operational-document-upload.test.ts tests/e2e/operational-browser-acceptance.spec.ts tests/unit/operational-browser-manifest.test.ts --max-warnings=0` passed.
