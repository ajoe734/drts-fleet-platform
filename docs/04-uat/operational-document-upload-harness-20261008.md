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
