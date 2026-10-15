# PAYMENT-DETAIL-MINOR-PRECISION-20261015 — UAT & Acceptance Verification Report

## 1. Metadata & Scope

- **Task ID**: `PAYMENT-DETAIL-MINOR-PRECISION-20261015`
- **Title**: 支付訂單明細原minor金額精度回讀修補
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Base Commit (`origin/dev`)**: `2c36cad43376f848bd2a7edc06e27369c060c819`
- **Candidate Branch**: `gemini/payment-detail-minor-precision-20261015`
- **Task Spec Ref**: `.local/goal-continuation-20261015T1226-remaining-original-audits-root/PAYMENT-DETAIL-MINOR-PRECISION-20261015-R1.task-spec.json`
- **Accepted Readonly Audit Ref**: `.local/goal-continuation-20261015T1226-remaining-original-audits-root/C074-C075-C088-current-accepted-payment-reconciliation-dataflow-readonly-audit.json` (Finding `C074-F2`)
- **Predecessor Dependency**: `SR-QA-FINANCE-001` (`done` — `docs/04-uat/system-remediation-20260906/SR-QA-FINANCE-001.md`)
- **Authorized Write Scopes**:
  - `apps/platform-admin-web/app/payments/[orderId]/payment-exception-detail.tsx`
  - `tests/unit/payment-detail-minor-precision-20261015/`
  - `docs/04-uat/system-remediation-20260906/PAYMENT-DETAIL-MINOR-PRECISION-20261015.md`

---

## 2. Self-Inspection Table (`AI_COLLABORATION_GUIDE.md` §0.7)

| 驗收條件 | 驗證方式 | 結果 | 證據路徑或命令輸出摘要 |
| --- | --- | --- | --- |
| `payment-detail_exact-canonical-minor-amount`: 透過既有 `PaymentExceptionDetail` 權威 loader/model/amount-field caller 保留原 canonical `amountMinor / 100` 數值精度；合法 `1250/TWD` 顯示 `$12.50`（`zh`）/ `NT$12.50`（`en`）而非四捨五入為 `$13` / `NT$13`；非整數 minor 金額不靜默流失精度，並保留整數金額（`1200/TWD` -> `$12` / `NT$12`、`35500/NTD` -> `NTD 355`）、零值（`0/TWD` -> `$0` / `NT$0`）、幣別標籤、`/ 100` 換算與 `null` unavailable 處理 | 檢視 `apps/platform-admin-web/app/payments/[orderId]/payment-exception-detail.tsx` 之 `formatAmount` 修補，並透過 `tests/unit/payment-detail-minor-precision-20261015/payment-detail-minor-precision.test.ts` 執行真实元件與後端 `BillingSettlementController` / `BillingSettlementService` / `BillingSettlementRepository` 回讀驗證 | PASS | `apps/platform-admin-web/app/payments/[orderId]/payment-exception-detail.tsx` (lines 75–90)；`pnpm exec vitest run tests/unit/payment-detail-minor-precision-20261015/` -> `12 passed (12)` (exit `0`) |
| `payment-detail_original-states-authority-and-denials`: 具意義的修補前失敗／修補後通過 socket-free 回歸測試，直接調用生產環境 `PaymentExceptionDetail` 元件與 formatter caller；涵蓋 `1250/TWD`、非整數 minor 對照、整數對照、零值與 `zh`/`en` 雙語系，並完整保留 `orderId` 比對、initial loading/reload、`null` 金額、malformed response、`not_found` (404)、`forbidden` (403)、`unavailable` (503)、遮罩 provider reference (`pay_...88f2`)、後端授權 `availableActions`（排除 `mark_paid`）、confirmation/reason/idempotency/reload 與權限拒絕行為 | 執行修補前重現（记录於 `.local/payment-detail-minor-precision-20261015/before.log`，8 項非整數 minor 精度斷言失敗且 4 項整數／零值／null 測試通過）與修補後驗證（记录於 `.local/payment-detail-minor-precision-20261015/after.log`，12 項全數通過） | PASS | `tests/unit/payment-detail-minor-precision-20261015/payment-detail-minor-precision.test.ts`、`tests/unit/payment-detail-minor-precision-20261015/production-detail.ts`、`.local/payment-detail-minor-precision-20261015/before.log` (exit `1`)、`.local/payment-detail-minor-precision-20261015/after.log` (exit `0`) |
| `payment-detail_exact-candidate-validation`: 僅於授權 `write_scopes` 內完成最小生產修補，執行受影響單元測試、typecheck、lint 與 diff 檢查，不啟動任何 VM 開發／預覽／瀏覽器／Docker 服務，並記錄完整驗收鍵值與邊界聲明 | 執行 `@drts/platform-admin-web` 測試、`sr-qa-finance-001` 財務回歸測試、`@drts/api` `billing-payment-exception` 測試、`typecheck`、`eslint --max-warnings=0` 與 `git diff --check` | PASS | 見下方第 3、4 節各驗收鍵值與命令輸出摘要（全數 exit `0`） |

---

## 3. Required Acceptance Keys Evidence

### `payment-detail_exact-canonical-minor-amount`

- **Root Cause (`C074-F2`)**:
  - `BillingSettlementRepository.findMultiTaxiPaymentException` (`apps/api/src/modules/billing-settlement/billing-settlement.repository.ts:1022-1089`) reads canonical integer minor units (`amount_minor::text`, `currency`) from `billing.multi_taxi_passenger_payments` and parses `amountMinor` via `parseMinorAmount`.
  - `BillingSettlementService.getMultiTaxiPaymentException` (`apps/api/src/modules/billing-settlement/billing-settlement.service.ts:1694-1748`) and `BillingSettlementController.getMultiTaxiPaymentException` (`apps/api/src/modules/billing-settlement/billing-settlement.controller.ts:285-296`) return `amount: { amountMinor, currency }` wrapped in `{ data }`.
  - `loadPaymentExceptionDetail` and `parsePaymentExceptionView` (`apps/platform-admin-web/app/payments/[orderId]/payment-exception-model.ts:126-267`) validate `Number.isInteger(amountMinor) && amountMinor >= 0` and preserve the exact integer `amountMinor`.
  - However, `formatAmount` in `apps/platform-admin-web/app/payments/[orderId]/payment-exception-detail.tsx` previously formatted `amount.amountMinor / 100` with `maximumFractionDigits: 0`, causing `Intl.NumberFormat` to round non-whole major amounts (`1250` minor `TWD` = `12.50` major) to `$13` (`zh-TW`) / `NT$13` (`en-US`), silently losing minor-unit precision without any approximation indicator.
- **Production Fix (`apps/platform-admin-web/app/payments/[orderId]/payment-exception-detail.tsx:75-90`)**:
  - Updated `formatAmount` to check `const hasMinorUnits = amount.amountMinor % 100 !== 0;` and pass `minimumFractionDigits: hasMinorUnits ? 2 : 0` and `maximumFractionDigits: 2` to `Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US", { style: "currency", currency: amount.currency, ... }).format(amount.amountMinor / 100)`.
  - Verified exact formatting across currencies and locales:
    - `1250` minor `TWD` -> `$12.50` (`zh`) and `NT$12.50` (`en`), round-tripping back to `1250` minor units (`parseDisplayedMinor` = `1250`, not `1300`).
    - `1205` minor `TWD` -> `$12.05` (`zh`) and `NT$12.05` (`en`).
    - `1` minor `TWD` -> `$0.01` (`zh`) and `NT$0.01` (`en`).
    - `1250` minor `NTD` -> `NTD 12.50` (`zh` and `en`).
    - `123456789` minor `TWD` -> `$1,234,567.89` (`zh`) and `NT$1,234,567.89` (`en`).
    - Whole-unit values remain unpadded: `1200` minor `TWD` -> `$12` (`zh`) / `NT$12` (`en`), `35500` minor `NTD` -> `NTD 355` (`zh` / `en`).
    - Zero value remains unpadded: `0` minor `TWD` -> `$0` (`zh`) / `NT$0` (`en`).
    - `null` amount returns localized `copy("unavailable")` (`未取得` in `zh`, `Unavailable` in `en`).
  - No financial, rounding, settlement, PSP, tax, fare, ledger, or provider operation logic was modified.

### `payment-detail_original-states-authority-and-denials`

- **Original-Before Failure Reproduction (`.local/payment-detail-minor-precision-20261015/before.log`)**:
  - Before modifying `apps/platform-admin-web/app/payments/[orderId]/payment-exception-detail.tsx`, running `pnpm exec vitest run tests/unit/payment-detail-minor-precision-20261015/` exited with code `1` (`8 failed | 4 passed (12)`):
    - `1250/TWD`: `AssertionError: expected '$13' to be '$12.50'`
    - `1205/TWD`: `AssertionError: expected '$12' to be '$12.05'`
    - `1/TWD`: `AssertionError: expected '$0' to be '$0.01'`
    - `1250/NTD`: `AssertionError: expected 'NTD 13' to be 'NTD 12.50'`
    - `123456789/TWD`: `AssertionError: expected '$1,234,568' to be '$1,234,567.89'`
    - Authoritative retry/read-only/recovery reload assertions on `1250/TWD` in `en`: `AssertionError: expected 'NT$13' to be 'NT$12.50'`
    - All 4 whole-unit (`1200/TWD`, `35500/NTD`), zero (`0/TWD`), and `null`-amount tests passed.
- **Fixed-After Verification (`.local/payment-detail-minor-precision-20261015/after.log`)**:
  - After updating `formatAmount` in `apps/platform-admin-web/app/payments/[orderId]/payment-exception-detail.tsx`, running `pnpm exec vitest run tests/unit/payment-detail-minor-precision-20261015/` exited with code `0` (`12 passed (12)`).
- **Preserved Production Component States, Authority & Denials**:
  - Exercises the real production `PaymentExceptionDetail` component (`apps/platform-admin-web/app/payments/[orderId]/payment-exception-detail.tsx`), `loadPaymentExceptionDetail` / `executePaymentExceptionRecovery` (`payment-exception-model.ts`), `createPlatformAdminClient` (`lib/admin-client.ts`), `BootstrapAuthGuard`, `BillingSettlementController`, `BillingSettlementService`, and `BillingSettlementRepository` in-process without opening any network socket or browser server.
  - Verifies initial `[data-testid="payment-exception-loading"]`, `503` `[data-testid="payment-exception-unavailable"]`, `404` `[data-testid="payment-exception-not-found"]`, mismatched `orderId` fail-closed `[data-testid="payment-exception-invalid"]`, and authoritative retry button reload.
  - Verifies missing `billing:read` scope returns `403` `[data-testid="payment-exception-forbidden"]` without exposing any amount, masked reference, or retry button.
  - Verifies read-only `billing:read` (without `billing:write`) renders the exact `NT$12.50` amount while disabling all recovery buttons with `payment_recovery_write_authority_required`.
  - Verifies masked provider reference (`pay_...88f2`, never `pay_provider_secret_88f2`), filtering out unsupported `mark_paid` actions, blank-reason fail-closed validation on `begin_manual_recovery`, `window.confirm` and `Idempotency-Key` reuse on transient `retry_capture` failure, and authoritative reload after completion.

### `payment-detail_exact-candidate-validation`

- **Commands Executed & Exit Codes**:
  1. **Before-fix reproduction**:
     - Command: `pnpm exec vitest run tests/unit/payment-detail-minor-precision-20261015/`
     - Result: Exit `1` (`8 failed | 4 passed (12)` — recorded in `.local/payment-detail-minor-precision-20261015/before.log`)
  2. **After-fix regression suite**:
     - Command: `pnpm exec vitest run tests/unit/payment-detail-minor-precision-20261015/`
     - Result: Exit `0` (`12 passed (12)` — recorded in `.local/payment-detail-minor-precision-20261015/after.log`)
  3. **Platform Admin Web unit test suite**:
     - Command: `pnpm --filter @drts/platform-admin-web test`
     - Result: Exit `0` (`9 passed (9)`, `73 passed (73)`)
  4. **Predecessor Finance & Multi-Taxi contract regression tests (`SR-QA-FINANCE-001` credit reuse check)**:
     - Command: `pnpm exec vitest run tests/unit/system-remediation/sr-qa-finance-001/c074-c075-reconciliation-payment-recovery.test.ts tests/unit/mtx-full-suite-contract.test.ts`
     - Result: Exit `0` (`2 passed (2)`, `13 passed (13)`)
  5. **API billing payment exception unit tests**:
     - Command: `pnpm --filter @drts/api exec vitest run tests/unit/billing-payment-exception.test.ts`
     - Result: Exit `0` (`1 passed (1)`, `11 passed (11)`)
  6. **Typecheck (`@drts/platform-admin-web` & root test files)**:
     - Command: `pnpm --filter @drts/platform-admin-web typecheck`
     - Result: Exit `0` (0 errors)
  7. **ESLint (`@drts/platform-admin-web` & new unit test files)**:
     - Command: `pnpm --filter @drts/platform-admin-web lint && pnpm exec eslint "apps/platform-admin-web/app/payments/[orderId]/payment-exception-detail.tsx" "tests/unit/payment-detail-minor-precision-20261015/" --max-warnings=0`
     - Result: Exit `0` (0 errors, 0 warnings)
  8. **Diff formatting check**:
     - Command: `git diff --check`
     - Result: Exit `0`

---

## 4. Scope & Capability Boundary Disclosure

- All production and test changes are strictly confined to the authorized `write_scopes`:
  - `apps/platform-admin-web/app/payments/[orderId]/payment-exception-detail.tsx`
  - `tests/unit/payment-detail-minor-precision-20261015/production-detail.ts`
  - `tests/unit/payment-detail-minor-precision-20261015/payment-detail-minor-precision.test.ts`
  - `docs/04-uat/system-remediation-20260906/PAYMENT-DETAIL-MINOR-PRECISION-20261015.md`
- No VM development server, preview server, HTTP server, browser/Playwright server, PostgreSQL instance, or Docker Compose container was started on this VM.
- Source completion of `PAYMENT-DETAIL-MINOR-PRECISION-20261015` credits only this `PaymentExceptionDetail` canonical minor-unit amount display precision fix (`C074-F2`), and does not claim completion of full `C074`/`C075`/`C088`, hosted payment/provider live execution, full 134 capabilities, Final gate, or whole Goal.
