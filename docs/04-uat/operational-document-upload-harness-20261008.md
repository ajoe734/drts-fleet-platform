# Operational Document Upload Harness 2026-10-08

This document records the fix for the operational document upload harness.

## Issue

The previous test harness setup only performed intent and confirm requests, bypassing the actual document upload via PUT request. Because the real backend strictly requires a clean scan receipt on confirmation (which is generated when the actual document bytes are received and scanned), the confirmation steps correctly returned `409 DOCUMENT_NOT_SCANNED`.

## Resolution

- Replaced the intent/confirm operations in `operational-browser-journeys.json` with a single `document-upload` setup instruction.
- Updated the test harness (`operational-browser-acceptance.spec.ts`) to interpret the `document-upload` setup instruction.
- Created `operational-document-upload.ts` to perform the actual PUT request of a harmless PDF.
- The helper supports retrying the upload in case the anti-malware scanner returns `503 DOCUMENT_SCANNER_UNAVAILABLE`.
- Verified the fix through updated unit tests in `operational-browser-manifest.test.ts` and new lifecycle tests in `operational-document-upload.test.ts`.

## Evidence and Review Table

| Finding／驗收項                                | 原始碼依據與修改位置   | 舊版重現 → 修正版結果                     | 命令、退出碼、執行版本與證據位置                            | 未驗項與具體限制               |
| ---------------------------------------------- | ---------------------- | ----------------------------------------- | ----------------------------------------------------------- | ------------------------------ |
| No PUT documents/content exists anywhere between intent and confirm. Declared fileSize:1 with repeated fabricated aaaaaaaa… SHA256 values | `tests/e2e/fixtures/operational-browser-journeys.json`, `tests/e2e/operational-browser-acceptance.spec.ts`, `tests/e2e/operational-document-upload.ts` | 舊版缺乏真實 PUT 與 scanner receipt；新版引入 `uploadOperationalDocument`，能發送真實位元組並計算 checksum | `pnpm exec vitest run tests/unit/operational-document-upload.test.ts` (Exit 0, 證據在 unit tests 中) | 本 VM 無法啟動端對端環境或 Browser 測試，真實 16 案例與 GCP 部署驗證由 Operator 於 shared_dev 執行 |
| `operational_harness_real_document_bytes_and_receipts` | 同上 | 舊版直接 POST confirm 回傳 `409 DOCUMENT_NOT_SCANNED`；新版已實現完整 lifecycle | 靜態測試通過，無 live 環境 | 同上 |
| `operational_harness_exact_sha_review_ci_merge` | N/A | 將依循 CI merge | 此表為 handoff 證據之一 | CI 在 shared 環境驗證 |
| `shared_dev_full_16_operational_cases_zero_skips` | `tests/unit/operational-browser-manifest.test.ts` | 確保 manifest 正確套用新 `document-upload` instruction 且 16 個 cases 維持不變 | `pnpm exec vitest run tests/unit/operational-browser-manifest.test.ts` (Exit 0) | 同上 |
