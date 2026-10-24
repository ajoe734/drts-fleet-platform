# PAX-PSP-ADAPTER-20261009 UAT 規格與驗收紀錄：綠界 ECPay 站內付 2.0 信用卡綁定與刷卡元件

- **Task ID**: `PAX-PSP-ADAPTER-20261009`
- **Owner**: `Gemini2`
- **Reviewer**: `Claude`
- **User Decision (2026-10-24)**: 採用 **綠界 ECPay 站內付 2.0 信用卡綁定**（綁定特店會員模式；不走平台商 `PlatformID` 模式）。

---

## 1. 實作範圍與對應規格

### 1.1 金流商 Adapter (`apps/api/src/modules/passenger-app/payment/`)
- **`ecpay-cipher.ts`**：
  - 實作綠界站內付 2.0 專用加解密演算法：`JSON.stringify` → `encodeURIComponent` → `AES-128-CBC`（PKCS7 padding，16-byte ASCII `HashKey` / `HashIV`）→ Base64；解密反之並將 `+` 正規化為 `%20` 後 `decodeURIComponent`。
  - `verifyAndUnwrapEcpayEnvelope` 驗證外層 `MerchantID`、`RpHeader.Timestamp` / `RqHeader.Timestamp`（10 分鐘時間窗）與 `Data` / `ResultData` 密文完整性，遭竄改或過期一律拒絕。
  - `deriveEcpayMerchantMemberId` 由 `drtsPassengerId` 與 `MerchantID` 雜湊產生不可逆之特店會員編號（`mbr_<32-hex>`），並明確阻擋手機號碼或 Email 作為輸入。
- **`ecpay-payment-provider.ts` (`EcpayPaymentProvider`)**：
  - **取得綁卡驗證 Token (`createBindingSession`)**：呼叫 `/Merchant/GetTokenbyBindingCard`（Stage: `https://ecpg-stage.ecpay.com.tw` / Prod: `https://ecpg.ecpay.com.tw`）取得供前端 WEB JS SDK 初始化之 `Token`。
  - **建立信用卡綁定 (`bind`)**：呼叫 `/Merchant/CreateBindCard`，以一次性 `BindCardPayToken` 交換長期 `BindCardID`；若綠界回傳 `ThreeDInfo.ThreeDURL` 則回傳 `action_required` 導向 3DS 驗證，完成後僅保存 KMS 加密之 `BindCardID` 與遮罩後卡片資訊（`last4`、`cardType`、`expiryMonth`、`expiryYear`）。
  - **回呼通知驗證 (`verifyNotification`)**：驗證綠界 `ReturnURL` / `OrderResultURL` 之加密信封與 `RtnCode`，不接受未經驗證之明文欄位。
  - **行程完成幕後扣款 (`capture` / `readCapture`)**：
    - 呼叫 `/Merchant/CreatePaymentWithCardID`，固定帶入 `Need3D: 0`、新台幣整數金額（`1 .. 200,000` 元）與 `>= 30 秒` HTTP timeout（預設 `35,000 ms`）。
    - 遵守綠界規範：**同一 `BindCardID` 一旦授權失敗即記錄於 `declinedBindCardIds`，禁止對該 `BindCardID` 再次自動重試授權**。
    - 逾時或未收到明確回應時回傳 `unknown`，透過 `/1.0.0/Cashier/QueryTrade` (`readCapture`) 查詢原始交易狀態。
  - **信用卡退款 (`refund` / `readRefund`)**：呼叫 `/1.0.0/Credit/DoAction` (`Action: "R"`) 執行退刷。
- **All-or-Nothing Secret 掛載與防呆 (`payment-runtime.config.ts`, `payment-capture.config.ts`, `.github/workflows/deploy-dev.yml`)**：
  - `PSP_PROVIDER=ecpay` 要求 `PSP_MERCHANT_ID`、`PSP_HASH_KEY`、`PSP_HASH_IV`、`PSP_SANDBOX`、`PSP_TOKEN_ENCRYPTION_KEY_NAME` 五個環境變數全有或全無；任一缺漏即退回 `UnconfiguredPaymentProvider` (`available: false`)。
  - 當 `provider.name === "ecpay"` 時，`paymentCapturePolicyFromEnv` 強制禁止 `retryDefinitiveDeclines: true`。

### 1.2 前端 Hosted Fields 元件與每會員 5 張卡上限 (`apps/passenger-app-web/components/payment/`)
- **`ecpay-hosted-fields.tsx` (`EcpayHostedFields`, `createEcpayHostedFieldsPort`)**：
  - 使用 `@drts/ui-tokens` (`P5` token) 渲染 `<div id="ECPayPayment" data-testid="ecpay-hosted-fields-container" />`，由綠界 WEB JS SDK (`sdk-1.0.0.js`) 掛載跨網域安全刷卡 iframe。
  - 我方 DOM 內不含任何卡號、到期日或安全碼 `<input>` 欄位；`collectCredential()` 僅透過 `ECPay.getBindCardPayToken` 取得一次性 `BindCardPayToken`。
- **每會員最多綁定 5 張信用卡 (`payment-methods-screen.tsx`, `payment-method.service.ts`, `payment-method.repository.ts`)**：
  - 配合綠界「綁定特店會員」模式每會員最多 5 張卡限制：當已綁定達 5 張卡時，`PM-01` 與 `PM-02` 顯示提示訊息（「每個會員最多可綁定 5 張信用卡。如需新增第 6 張卡片，請先移除既有卡片。」）並停用新增／綁定按鈕；後端 `PaymentMethodService` 與 `PaymentMethodRepository.completeBinding` 亦同步以 `409 card_limit_exceeded` 阻擋第 6 張卡。

---

## 2. 自動化單元與整合測試證據

- `apps/api/tests/unit/ecpay-payment-provider.test.ts`
- `tests/unit/pax-psp-adapter-20261009/ecpay-payment-provider.test.ts`
- `tests/unit/pax-psp-adapter-20261009/ecpay-psp-adapter.test.tsx`
- 既有回歸測試：
  - `tests/unit/pax-payment-core-20261009/`
  - `tests/unit/pax-web-payment-ui-20261009/`
  - `tests/unit/pax-web-deploy-20261009/deployment-contract.test.ts`
  - `tests/unit/dev-pax-review-env-transport-20261016/transport.test.ts`

> **安全稽核**：倉庫程式碼、測試與文件僅使用合成測試常數（如 `SYNTHETIC_MID_01`、`SYNTHETIC_KEY_16`、`SYNTHETIC_IV__16`），未寫入任何真實或綠界公開測試特店之 `MerchantID`、`HashKey`、`HashIV`。

---

## 3. Sandbox 實機驗收狀態 (`pax-psp_adapter_sandbox_verified`)

- **目前狀態**：`blocked`（等待使用者於 GCP Secret Manager 建立綠界 Stage 測試特店 secrets 後執行 `deploy-dev.yml` 與 Sandbox 綁卡／3DS／扣款／退款實測）。
- **前置步驟**：
  1. 使用者於具備 GCP Secret Manager 權限之環境執行 `.local/passenger-app-20261009/psp-ecpay/create-ecpay-secrets.sh`，建立 `drts-dev-psp-merchant-id`、`drts-dev-psp-hash-key`、`drts-dev-psp-hash-iv`、`drts-dev-psp-sandbox`、`drts-dev-psp-token-encryption-key-name`。
  2. 觸發 `deploy-dev.yml` 部署 `drts-dev` 環境。
  3. 於綠界 Stage Sandbox 完成綁卡（含 3DS 驗證）、行程完成自動扣款（`CreatePaymentWithCardID`）與退款（`DoAction R`），並將遮罩後之回應證據保存於 `.local/passenger-app-20261009/psp-ecpay/`。
