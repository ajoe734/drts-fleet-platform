# PAX-PSP-ADAPTER-20261009 UAT 規格與驗收紀錄：綠界 ECPay 站內付 2.0 信用卡綁定與刷卡元件

- **Task ID**: `PAX-PSP-ADAPTER-20261009`
- **Owner**: `Gemini2`
- **Reviewer**: `Claude`
- **User Decision (2026-10-24)**: 採用 **綠界 ECPay 站內付 2.0 信用卡綁定**（綁定特店會員模式；不走平台商 `PlatformID` 模式）。
- **Task Spec Ref**: `/home/lupin/workspace/drts-fleet-platform/.local/passenger-bureau-gap-correction-20261018/Root-native-actual3c78-publish-and-live-dev-deploy-20261024T0800/PAX-PSP-ADAPTER-20261009.v2-real-provider-and-hosted-fields-callers.task-spec.json`

---

## 1. 實作範圍與對應規格

### 1.1 金流商 Adapter (`apps/api/src/modules/passenger-app/payment/`)
- **`ecpay-cipher.ts`**：
  - 實作綠界站內付 2.0 專用加解密演算法：`JSON.stringify` → `encodeURIComponent` → `AES-128-CBC`（PKCS7 padding，16-byte ASCII `HashKey` / `HashIV`）→ Base64；解密反之並將 `+` 正規化為 `%20` 後 `decodeURIComponent`。
  - `verifyAndUnwrapEcpayEnvelope` 驗證外層 `MerchantID`、`RpHeader.Timestamp` / `RqHeader.Timestamp`（10 分鐘時間窗）與 `Data` / `ResultData` 密文完整性，遭竄改或過期一律拒絕。
  - `deriveEcpayMerchantMemberId` 由經過驗證的 `drtsPassengerId` 與 `MerchantID` 雜湊產生不可逆之特店會員編號（`mbr_<32-hex>`），並明確阻擋手機號碼、Email 或 `pax:bind:*` 冪等鍵作為輸入。
- **`ecpay-payment-provider.ts` (`EcpayPaymentProvider`)**：
  - **取得綁卡驗證 Token (`createBindingSession`)**：呼叫 `/Merchant/GetTokenbyBindingCard`（Stage: `https://ecpg-stage.ecpay.com.tw` / Prod: `https://ecpg.ecpay.com.tw`）取得供前端 WEB JS SDK 初始化之 `Token`。
  - **建立信用卡綁定 (`bind`)**：強制要求已驗證之 `context.passengerId`（禁止以 `idempotencyKey` 偽造會員代號），呼叫 `/Merchant/CreateBindCard`，以一次性 `BindCardPayToken` 交換長期 `BindCardID`；若綠界回傳 `ThreeDInfo.ThreeDURL` 則回傳 `action_required` 導向 3DS 驗證，完成後僅保存 KMS 加密之 `BindCardID` 與遮罩後卡片資訊（`last4`、`cardType`、`expiryMonth`、`expiryYear`）。
  - **回呼通知驗證與 3DS 完成歸戶 (`verifyNotification`, `PaymentMethodService.verifyNotification`, `PaymentMethodRepository.findActionRequiredBinding`)**：驗證綠界 `ReturnURL` / `OrderResultURL` 之加密信封與 `RtnCode`，核對 `MerchantMemberID` 屬於原發起綁卡之乘客，並將 `action_required` 狀態之綁卡請求透過 `PaymentTokenCipher.encrypt` 完成 `completeBinding` 落庫。
  - **行程完成幕後扣款 (`capture` / `readCapture`)**：
    - 呼叫 `/Merchant/CreatePaymentWithCardID`，固定帶入 `Need3D: 0`、新台幣整數金額（`1 .. 200,000` 元）與 `>= 30 秒` HTTP timeout（預設 `35,000 ms`）。
    - 遵守綠界規範：**同一 `BindCardID` 一旦授權失敗即記錄於 `declinedBindCardIds`，禁止對該 `BindCardID` 再次自動重試授權**。
    - 逾時或未收到明確回應時回傳 `unknown`，透過 `/1.0.0/Cashier/QueryTrade` (`readCapture`) 查詢原始交易狀態。
  - **信用卡退款 (`refund` / `readRefund`)**：呼叫 `/1.0.0/Credit/DoAction` (`Action: "R"`) 執行退刷。
- **All-or-Nothing Secret 掛載與防呆 (`payment-runtime.config.ts`, `payment-capture.config.ts`, `.github/workflows/deploy-dev.yml`)**：
  - `PSP_PROVIDER=ecpay` 要求 `PSP_MERCHANT_ID`、`PSP_HASH_KEY`、`PSP_HASH_IV`、`PSP_SANDBOX`、`PSP_TOKEN_ENCRYPTION_KEY_NAME` 五個環境變數全有或全無；任一缺漏即退回 `UnconfiguredPaymentProvider` (`available: false`)。
  - 當 `provider.name === "ecpay"` 時，`paymentCapturePolicyFromEnv` 強制禁止 `retryDefinitiveDeclines: true`。

### 1.2 前端 Hosted Fields 元件、實際路由呼叫端與每會員 5 張卡上限 (`apps/passenger-app-web/`)
- **`components/payment/ecpay-hosted-fields.tsx` (`EcpayHostedFields`, `createEcpayHostedFieldsPort`)**：
  - 使用 `@drts/ui-tokens` (`P5` token) 渲染 `<div id="ECPayPayment" data-testid="ecpay-hosted-fields-container" />`，由綠界 WEB JS SDK (`sdk-1.0.0.js`) 掛載跨網域安全刷卡 iframe。
  - 我方 DOM 內不含任何卡號、到期日或安全碼 `<input>` 欄位；`collectCredential()` 僅透過 `ECPay.getBindCardPayToken` 取得一次性 `BindCardPayToken`。
- **`lib/payment/runtime-fields.ts` 與 `app/account/payment-methods/page.tsx`**：
  - 新增 `isEcpayHostedFieldsRuntime` 與 `paymentFieldsForRuntime` 的 `NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER === "ecpay"` 選擇分支，保留既有 `reviewDemo` / `synthetic` 與 `isDemoMode()` 路徑。
  - `PaymentMethodsPage` 於 `NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER === "ecpay"` 時掛載 `<EcpayHostedFields onReady={setFields} />` 並傳入 `PaymentMethodsScreen` 的 `hostedFieldsView` 與 `approvedActionOrigins`。
- **每會員最多綁定 5 張信用卡 (`payment-methods-screen.tsx`, `payment-method.service.ts`, `payment-method.repository.ts`)**：
  - 配合綠界「綁定特店會員」模式每會員最多 5 張卡限制：當已綁定達 5 張卡時，`PM-01` 與 `PM-02` 顯示提示訊息（「每個會員最多可綁定 5 張信用卡。如需新增第 6 張卡片，請先移除既有卡片。」）並停用新增／綁定按鈕；後端 `PaymentMethodService` 與 `PaymentMethodRepository.completeBinding` 亦同步以 `409 card_limit_exceeded` 阻擋第 6 張卡。

---

## 2. §0.7 Finding 與驗收項核對表

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| `v2-real-caller-1`：實際路由 `PaymentMethodsPage` 與 `runtime-fields.ts` 未接入 `EcpayHostedFields` | `apps/passenger-app-web/app/account/payment-methods/page.tsx`、`apps/passenger-app-web/lib/payment/runtime-fields.ts` | 舊候選 `6991d45ebc9c` 僅在 `PaymentMethodsScreen` 預設 `fields === undefined` 時啟用 `EcpayHostedFields`，但實際頁面 `PaymentMethodsPage` 固定傳入 `fields={unavailable}`；修正版由 `isEcpayHostedFieldsRuntime` 與 `PaymentMethodsPage` 掛載 `EcpayHostedFields` 並走完整綁卡流程通過。 | `pnpm exec vitest run tests/unit/pax-psp-adapter-20261009/ecpay-psp-adapter.test.tsx tests/unit/pax-web-payment-ui-20261009/payment-ui.test.tsx`（exit 0，Vitest v4.1.4） | 外部綠界 Stage Sandbox SDK 實機瀏覽器載入待 secret 建立後驗收 |
| `v2-real-caller-2`：`EcpayPaymentProvider.bind` 不得以 `idempotencyKey` 偽造 `MerchantMemberID`，且 3DS 完成需歸戶至原綁卡請求 | `apps/api/src/modules/passenger-app/payment/ecpay-cipher.ts`、`ecpay-payment-provider.ts`、`payment-method.service.ts`、`payment-method.repository.ts`、`payment-method.controller.ts` | 舊候選 `6991d45ebc9c` 在 `context.passengerId` 缺漏時退回 `idempotencyKey`，且 `verifyNotification` 僅回傳驗證結果未完成 `completeBinding`；修正版強制要求已驗證之 `passengerId`、拒絕 `pax:bind:*` 偽造，並於 `verifyNotification` 核對 `MerchantMemberID` 後以 `PaymentTokenCipher` 加密寫入 `completeBinding`。 | `pnpm --filter @drts/api exec vitest run tests/unit/ecpay-payment-provider.test.ts`、`pnpm exec vitest run tests/unit/pax-payment-core-20261009/binding.test.ts tests/unit/pax-payment-core-20261009/security-boundary.test.ts`（exit 0，Vitest v4.1.4） | 外部綠界 Stage 3DS 回呼實機驗證待 secret 建立後執行 |
| `CI-shard4-router-context`：Root Vitest shard 4 執行 `ecpay-psp-adapter.test.tsx` 缺少 Next `AppRouterContext` | `tests/unit/pax-psp-adapter-20261009/ecpay-psp-adapter.test.tsx` | 舊候選 `6991d45ebc9c` 於 CI job `120866616046` 因跨 workspace `vi.mock("next/navigation")` 未攔截 `apps/passenger-app-web` 之 Next router context 而拋出 `invariant expected app router to be mounted`；修正版改以 `appRequire("next/dist/shared/lib/app-router-context.shared-runtime")` 提供 `AppRouterContext.Provider`，Root Vitest 執行全數通過。 | `pnpm exec vitest run tests/unit/pax-psp-adapter-20261009/ecpay-psp-adapter.test.tsx`（exit 0，9/9 tests passed） | 無 |
| `CI-shard4-c125-workflow-bytes`：`.github/workflows/deploy-dev.yml` 變更觸發 `operational-role-session-wiring.test.ts:897` 固定 byte/hash 斷言 | `.github/workflows/deploy-dev.yml`（本 task scope 內） vs `tests/unit/operational-role-session-wiring-20261021/operational-role-session-wiring.test.ts:897`（本 task `write_scopes` 外） | `operational-role-session-wiring.test.ts` 之 `reconstructImmutable337CallerSources()` 讀取當前 `deploy-dev.yml` 後僅扣除 C125 三個區塊並斷言 `byteLength === 156378` 及固定 `sha256`；本 task 依規格在 `deploy-dev.yml` 新增 ECPay 5-secret 掛載後，該外部測試必然相差 807 bytes（157185 vs 156378）。 | `pnpm exec vitest run tests/unit/pax-web-deploy-20261009/deployment-contract.test.ts tests/unit/dev-pax-review-env-transport-20261016/transport.test.ts`（exit 0，47/47 passed） | `tests/unit/operational-role-session-wiring-20261021/operational-role-session-wiring.test.ts` 不在本 task `write_scopes`，需 Supervisor 比照 `C125-EXISTING-UPLOAD-PROBE-CONTRACT-20261023` 協調 scope |
| `pax-psp_adapter_sandbox_verified` | `apps/api/src/modules/passenger-app/payment/`、`apps/passenger-app-web/components/payment/`、`.github/workflows/deploy-dev.yml` | Stub 與單元／契約測試全數通過（0 真實憑證寫入 repo）；Sandbox 實機綁卡、3DS、扣款、退款等待外部 secret 建立。 | 本地單元與契約測試全綠 | 外部 gate：待使用者執行 `.local/passenger-app-20261009/psp-ecpay/create-ecpay-secrets.sh` 建立 GCP Secret Manager secrets 並透過 `deploy-dev.yml` 驗證 |

---

## 3. Sandbox 實機驗收狀態 (`pax-psp_adapter_sandbox_verified`)

- **目前狀態**：`blocked` on external gate（等待使用者於 GCP Secret Manager 建立綠界 Stage 測試特店 secrets 後執行 `deploy-dev.yml` 與 Sandbox 綁卡／3DS／扣款／退款實測）。
- **前置步驟**：
  1. 使用者於具備 GCP Secret Manager 權限之環境執行 `.local/passenger-app-20261009/psp-ecpay/create-ecpay-secrets.sh`，建立 `drts-dev-psp-merchant-id`、`drts-dev-psp-hash-key`、`drts-dev-psp-hash-iv`、`drts-dev-psp-sandbox`、`drts-dev-psp-token-encryption-key-name`。
  2. 觸發 `deploy-dev.yml` 部署 `drts-dev` 環境。
  3. 於綠界 Stage Sandbox 完成綁卡（含 3DS 驗證）、行程完成自動扣款（`CreatePaymentWithCardID`）與退款（`DoAction R`），並將遮罩後之回應證據保存於 `.local/passenger-app-20261009/psp-ecpay/`。
