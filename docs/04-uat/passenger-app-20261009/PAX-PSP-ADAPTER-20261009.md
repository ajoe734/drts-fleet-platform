# PAX-PSP-ADAPTER-20261009 UAT 規格與驗收紀錄：綠界 ECPay 站內付 2.0 信用卡綁定與刷卡元件

- **Task ID**: `PAX-PSP-ADAPTER-20261009`
- **Owner**: `Gemini2`
- **Reviewer**: `Claude`
- **User Decision (2026-10-24)**: 採用 **綠界 ECPay 站內付 2.0 信用卡綁定**（綁定特店會員模式；不走平台商 `PlatformID` 模式）。
- **Task Spec Ref**: `/home/lupin/workspace/drts-fleet-platform/.local/passenger-bureau-gap-correction-20261018/Root-native-actual3c78-publish-and-live-dev-deploy-20261024T0800/PAX-PSP-ADAPTER-20261009.v4-real-callback-and-actual-CI-baseline-compatibility.task-spec.json`

---

## 1. 實作範圍與對應規格

### 1.1 金流商 Adapter (`apps/api/src/modules/passenger-app/payment/`)
- **`ecpay-cipher.ts`**：
  - 實作綠界站內付 2.0 專用加解密演算法：`JSON.stringify` → `encodeURIComponent` → `AES-128-CBC`（PKCS7 padding，16-byte ASCII `HashKey` / `HashIV`）→ Base64；解密反之並將 `+` 正規化為 `%20` 後 `decodeURIComponent`。
  - `verifyAndUnwrapEcpayEnvelope` 支援 JSON 物件、JSON 字串以及 `ReturnURL` / `OrderResultURL` 的 `application/x-www-form-urlencoded` `ResultData=<JSON>` 表單格式，驗證外層 `MerchantID`、`RpHeader.Timestamp` / `RqHeader.Timestamp`（10 分鐘時間窗）與 `Data` 密文完整性，遭竄改或過期一律拒絕。
  - `deriveEcpayMerchantMemberId` 由經過驗證的 `drtsPassengerId` 與 `MerchantID` 雜湊產生不可逆之特店會員編號（`mbr_<32-hex>`），並明確阻擋手機號碼、Email 或 `pax:bind:*` 冪等鍵作為輸入。
- **`ecpay-payment-provider.ts` (`EcpayPaymentProvider`)**：
  - **取得綁卡驗證 Token (`createBindingSession`)**：呼叫 `/Merchant/GetTokenbyBindingCard`（Stage: `https://ecpg-stage.ecpay.com.tw` / Prod: `https://ecpg.ecpay.com.tw`），強制要求已驗證之 `ConsumerInfo.Email` 或 `ConsumerInfo.Phone`，將 `OrderResultURL` 置於 `Data` 頂層（預設指向 BFF `/api/passenger-app/payment-methods/ecpay/order-result`），支援設定 `PSP_BINDING_AUTH_AMOUNT_TWD` 驗證刷卡金額，並在綁卡完成且 `TotalAmount > 0` 時透過 `/1.0.0/Credit/DoAction` (`Action: "N"`) 自動取消驗證授權。
  - **建立信用卡綁定 (`bind`)**：強制要求已驗證之 `context.passengerId`（禁止以 `idempotencyKey` 偽造會員代號），呼叫 `/Merchant/CreateBindCard`，以一次性 `BindCardPayToken` 交換長期 `BindCardID`；支援綠界官方頂層 `Data.BindCardID` 與 `CardInfo.CardValidYY` / `CardInfo.CardValidMM` 欄位（當到期日缺漏或格式錯誤時明確拒絕，絕不偽造 `12/2099`）；若綠界回傳 `ThreeDInfo.ThreeDURL` 則回傳 `action_required` 導向 3DS 驗證。
  - **回呼通知驗證與 3DS 完成歸戶 (`verifyNotification`, `PaymentMethodService.verifyNotification`, `PaymentMethodRepository.findBindingByMerchantMember`, `PaymentMethodController`)**：
    - `POST /v1/passenger/payment-methods/ecpay/callback`（綠界 `ReturnURL` 幕後回呼）不要求乘客瀏覽器 session cookie，直接透過加密信封驗簽與 `findBindingByMerchantMember` 跨實例對映原發起綁卡之乘客，將 `BindCardID` 以 `PaymentTokenCipher.encrypt` 寫入 `completeBinding`，並回傳純文字 `1|OK`（`text/plain; charset=utf-8`）。
    - `POST /v1/passenger/payment-methods/ecpay/order-result`（綠界 `OrderResultURL` 3DS 瀏覽器跳轉回呼）驗證 `ResultData` 並冪等完成綁卡後，由 BFF 以 `303 See Other` 導回 `/account/payment-methods?ecpay_3ds=completed|failed`。
  - **行程完成幕後扣款 (`capture` / `readCapture`)**：
    - `PaymentChargeService.execute` 將 `claim.passengerId` 傳入 `EcpayPaymentProvider.capture`，呼叫 `/Merchant/CreatePaymentWithCardID` 時帶入與綁卡一致之 `ConsumerInfo: { MerchantMemberID }`、固定 `Need3D: 0`、新台幣整數金額（`1 .. 200,000` 元）與 `>= 30 秒` HTTP timeout（預設 `35,000 ms`）。
    - 遵守綠界規範：**同一 `BindCardID` 一旦授權失敗即記錄於 `declinedBindCardIds`，禁止對該 `BindCardID` 再次自動重試授權**。
    - 逾時或未收到明確回應時回傳 `unknown`，透過 `/1.0.0/Cashier/QueryTrade` (`readCapture`) 查詢原始交易狀態。
  - **信用卡退款／取消授權 (`refund` / `readRefund`)**：
    - `refund()` 先呼叫 `/1.0.0/Cashier/QueryTrade` 查詢交易關帳狀態：若已關帳（`CloseStatus: 1`）執行 `DoAction` `Action: "R"`（退刷）；若同日尚未關帳（`CloseStatus: 0`，如 Stage 當日測試）執行 `Action: "N"`（取消授權）；若為要關帳（`CloseStatus: 2`）先執行 `Action: "E"`（放棄關帳）再執行 `Action: "N"`（取消授權）。
    - `readRefund()` 於本地快取不存在（跨實例或 ACK 遺失）時，以原扣款 `idempotencyKey` 推導之 `MerchantTradeNo` 呼叫 `QueryTrade` 確認是否已完成退刷／取消授權，避免重送金流請求。
- **All-or-Nothing Secret 掛載與防呆 (`payment-runtime.config.ts`, `payment-capture.config.ts`, `.github/workflows/deploy-dev.yml`)**：
  - `PSP_PROVIDER=ecpay` 要求 `PSP_MERCHANT_ID`、`PSP_HASH_KEY`、`PSP_HASH_IV`、`PSP_SANDBOX`、`PSP_TOKEN_ENCRYPTION_KEY_NAME` 五個環境變數全有或全無；任一缺漏即退回 `UnconfiguredPaymentProvider` (`available: false`)。
  - 當 `provider.name === "ecpay"` 時，`paymentCapturePolicyFromEnv` 強制禁止 `retryDefinitiveDeclines: true`。

### 1.2 前端 Hosted Fields 元件、BFF 路由與每會員 5 張卡上限 (`apps/passenger-app-web/`)
- **`components/payment/ecpay-hosted-fields.tsx` (`EcpayHostedFields`, `createEcpayHostedFieldsPort`)**：
  - 使用 `@drts/ui-tokens` (`P5` token) 渲染 `<div id="ECPayPayment" data-testid="ecpay-hosted-fields-container" />`，自動載入綠界規定之 jQuery 3.5.1 前置腳本與 WEB JS SDK (`sdk-1.0.0.js`)，並以 `ECPay.Language?.zhTW ?? "zh-TW"` 呼叫 `addBindingCard`。
  - 我方 DOM 內不含任何卡號、到期日或安全碼 `<input>` 欄位；`collectCredential()` 接受綠界官方 `PaymentInfo` 契約 `{ BindCardPayToken, MerchantTradeNo }`（不強制要求非契約之 `RtnCode: 1`），並阻擋純數字 PAN 字串。
- **`app/api/passenger-app/[...path]/route.ts`（Passenger BFF 路由）**：
  - 開放 `POST payment-methods/binding-session`、`POST payment-methods/3ds-complete`（需同源 CSRF 與 `pax_session` cookie）、`POST payment-methods/ecpay/callback`（綠界伺服器幕後回呼，驗證加密信封並回傳純文字 `1|OK`）與 `POST payment-methods/ecpay/order-result`（綠界 3DS 跨站表單 POST，驗證 `ResultData` 後以 `303 See Other` 導回 `/account/payment-methods`）。
- **`lib/payment/runtime-fields.ts` 與 `app/account/payment-methods/page.tsx`**：
  - 新增 `isEcpayHostedFieldsRuntime` 與 `paymentFieldsForRuntime` 的 `NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER === "ecpay"` 選擇分支，保留既有 `reviewDemo` / `synthetic` 與 `isDemoMode()` 路徑。
  - `PaymentMethodsPage` 於 `NEXT_PUBLIC_PAYMENT_FIELDS_PROVIDER === "ecpay"` 時掛載 `<EcpayHostedFields onReady={setFields} />` 並傳入 `PaymentMethodsScreen` 的 `hostedFieldsView` 與 `approvedActionOrigins`。
- **每會員最多綁定 5 張信用卡 (`payment-methods-screen.tsx`, `payment-method.service.ts`, `payment-method.repository.ts`)**：
  - 配合綠界「綁定特店會員」模式每會員最多 5 張卡限制：當已綁定達 5 張卡時，`PM-01` 與 `PM-02` 顯示提示訊息（「每個會員最多可綁定 5 張信用卡。如需新增第 6 張卡片，請先移除既有卡片。」）並停用新增／綁定按鈕；後端 `PaymentMethodService` 與 `PaymentMethodRepository.completeBinding` 亦同步以 `409 card_limit_exceeded` 阻擋第 6 張卡。

---

## 2. §0.7 Finding 與驗收項核對表

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| `CI-build-TS2322` / `CI-typecheck-TS2345`：`3993591177d6` 於 `pnpm --filter @drts/api build` 發生 `payment-method.service.ts(365,13): error TS2322`；`048b65ef4926` 於 `pnpm typecheck:root` 發生 `ecpay-payment-provider.test.ts(1151,63): error TS2345` | `apps/api/src/modules/passenger-app/payment/payment-method.service.ts`、`apps/api/tests/unit/ecpay-payment-provider.test.ts` | 舊版對 union 型別 `PaymentMethodResponse` 使用非分配條件型別推導出 `never`，且測試傳入簡化物件缺少 `PassengerRequestIdentity` 欄位；修正版改用 `@drts/contracts` 之明確型別 `PassengerPaymentMethod` 並補齊測試之 `PassengerRequestIdentity`，`@drts/api build` 與 `ecpay-payment-provider.test.ts` typecheck 皆 0 error 通過。 | `pnpm --filter @drts/api build`（exit 0） | 無 |
| `PSP6991-F1`：`GetTokenbyBindingCard` 缺少 `ConsumerInfo.Email/Phone`、`OrderResultURL` 放錯層級、未處理非零驗證授權取消 | `apps/api/src/modules/passenger-app/payment/ecpay-payment-provider.ts`、`payment-method.controller.ts`、`payment-method.service.ts`、`payment-runtime.config.ts` | 舊版未傳入 Email/Phone 且將 `OrderResultURL` 放在 `OrderInfo` 內；修正版由 `PaymentMethodController` 帶入已驗證 `verifiedEmail` / `verifiedPhone`，將 `OrderResultURL` 置於 `Data` 頂層，並於 `TotalAmount > 0` 綁卡完成時自動呼叫 `DoAction` (`Action: "N"`) 取消驗證授權。 | `pnpm exec vitest run apps/api/tests/unit/ecpay-payment-provider.test.ts`（exit 0，Vitest v4.1.4） | 外部綠界 Stage 實機驗收待 secret 建立 |
| `PSP6991-F2` / `ECPAY-CALLBACK-AUTH-AND-FORMAT-MISMATCH` / `THREE-DS-RETURN-HANDSHAKE-ABSENT-ON-PAGE`：`ReturnURL` 要求乘客 session、回傳 JSON 而非 `1\|OK`、缺少 `ResultData` 表單解析與 `OrderResultURL` 3DS 跳轉閉環 | `apps/api/src/modules/passenger-app/payment/ecpay-cipher.ts`、`payment-method.controller.ts`、`payment-method.service.ts`、`payment-method.repository.ts`、`apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts` | 舊版 `ecpay/callback` 掛載 `PassengerSessionGuard`、回傳 JSON 且未列入 BFF 白名單；修正版支援 `ResultData=<JSON>` 表單與 JSON 信封、透過 `findBindingByMerchantMember` 跨實例對映乘客並完成 `completeBinding`、`ecpay/callback` 回傳純文字 `1\|OK`、`ecpay/order-result` 處理 3DS 瀏覽器 POST 並以 `303 See Other` 導回 `/account/payment-methods?ecpay_3ds=completed`。 | `pnpm exec vitest run apps/api/tests/unit/ecpay-payment-provider.test.ts tests/unit/pax-psp-adapter-20261009/ecpay-psp-adapter.test.tsx`（exit 0，Vitest v4.1.4） | 外部綠界 Stage 3DS 回呼實機驗證待 secret 建立 |
| `PSP6991-F3`：未讀取官方頂層 `BindCardID` 與 `CardValidYY` / `CardValidMM`，且在缺漏時偽造 `12/2099` | `apps/api/src/modules/passenger-app/payment/ecpay-payment-provider.ts`、`payment-method.service.ts` | 舊版僅讀取 `CardInfo.ExpireDate` 且於缺漏時退回 `12/2099`；修正版優先讀取頂層 `BindCardID` 與 `CardInfo.CardValidYY` / `CardInfo.CardValidMM`，當到期日缺漏或無效時回傳 `invalid_credential` 拒絕，絕不偽造 `12/2099`。 | `pnpm exec vitest run apps/api/tests/unit/ecpay-payment-provider.test.ts`（exit 0，Vitest v4.1.4） | 無 |
| `PSP6991-F4`：`CreatePaymentWithCardID` 缺少 `ConsumerInfo.MerchantMemberID` 且 `PaymentChargeService` 未傳入 `passengerId` | `apps/api/src/modules/passenger-app/payment/ecpay-payment-provider.ts`、`payment-charge.service.ts`、`payment-provider.port.ts` | 舊版 `capture()` 未送出 `ConsumerInfo.MerchantMemberID`；修正版於 `PaymentChargeService.execute` 傳入 `claim.passengerId`，並在 `EcpayPaymentProvider.capture` 強制檢查 `passengerId`、帶入與綁卡相同之 `ConsumerInfo: { MerchantMemberID }`。 | `pnpm exec vitest run apps/api/tests/unit/ecpay-payment-provider.test.ts tests/unit/pax-payment-core-20261009/charge-workflow.test.ts`（exit 0，Vitest v4.1.4） | 外部綠界 Stage 幕後扣款待 secret 建立 |
| `PSP6991-F5`：`refund()` 固定送出 `Action: "R"` 且 `readRefund()` 僅查本地記憶體快取 | `apps/api/src/modules/passenger-app/payment/ecpay-payment-provider.ts` | 舊版 `refund()` 未查關帳狀態直接送 `R`，且 `readRefund()` 跨實例回傳 `unknown`；修正版先以 `QueryTrade` 依 `CloseStatus` 執行 `R`（已關帳）、`N`（未關帳取消授權）或 `E`→`N`（要關帳先放棄再取消），且 `readRefund()` 於快取未命中時透過 `QueryTrade` 查詢原交易狀態。 | `pnpm exec vitest run apps/api/tests/unit/ecpay-payment-provider.test.ts`（exit 0，Vitest v4.1.4） | Stage 環境若當日未關帳將走 `Action: "N"`（或 `E`→`N`）取消授權；待 secret 建立後實測 |
| `PSP6991-F6` / `SDK-SUCCESS-REQUIRES-NONCONTRACT-RTNCODE`：`collectCredential()` 要求非官方契約之 `RtnCode === 1` | `apps/passenger-app-web/components/payment/ecpay-hosted-fields.tsx`、`tests/unit/pax-psp-adapter-20261009/ecpay-psp-adapter.test.tsx` | 舊版在 `PaymentInfo` 未帶 `RtnCode: 1` 時拋出 `ecpay_pay_token_failed`；修正版依綠界官方契約接受 `{ BindCardPayToken, MerchantTradeNo }`，並自動載入 jQuery 3.5.1 前置腳本與 `ECPay.Language.zhTW`。 | `pnpm exec vitest run tests/unit/pax-psp-adapter-20261009/ecpay-psp-adapter.test.tsx`（exit 0，Vitest v4.1.4） | 外部綠界 Stage SDK iframe 實測待 secret 建立 |
| `CI-shard4-c125-workflow-bytes`：`.github/workflows/deploy-dev.yml` 變更觸發 `operational-role-session-wiring.test.ts:897` 固定 byte/hash 斷言 | `.github/workflows/deploy-dev.yml`、`tests/unit/operational-role-session-wiring-20261021/operational-role-session-wiring.test.ts`、`tests/unit/operational-role-session-wiring-20261021/fixtures/deploy-dev-337f3dd7fb530b44f4e65875dd03c7a2191e3706.yml` | 舊版 `reconstructImmutable337CallerSources()` 讀取當前 `deploy-dev.yml` 並僅扣除 C125 三個區塊後誤標為歷史 `337f3dd7` baseline，導致本 task 合法新增之 ECPay 5-secret 掛載（+807 bytes）使 `157185 === 156378` 失敗；修正版依 v4 task spec 保留當前 `currentWorkflow` 對三個 C125 區塊的存在斷言，並以真實 `337f3dd7` Git object（shallow checkout 時使用 156,378 bytes 原始 `deploy-dev-337f3dd7fb530b44f4e65875dd03c7a2191e3706.yml` fixture，blob `45f3ae0f3388750c93cf5c3b9d72354b7f5c0f60`、sha256 `1daf71f8bb8304c758e23181369ca4ac5e8dc41fc3b639ecaffba436ae3f1cb5`）驗證歷史 baseline。 | `pnpm exec vitest run tests/unit/operational-role-session-wiring-20261021/operational-role-session-wiring.test.ts tests/unit/pax-web-deploy-20261009/deployment-contract.test.ts tests/unit/dev-pax-review-env-transport-20261016/transport.test.ts`（exit 0） | 無 |
| `pax-psp_adapter_sandbox_verified` | `apps/api/src/modules/passenger-app/payment/`、`apps/passenger-app-web/components/payment/`、`.github/workflows/deploy-dev.yml` | Stub 與單元／契約測試全數通過（0 真實憑證寫入 repo）；Sandbox 實機綁卡、3DS、扣款、退款／取消授權等待外部 secret 建立。 | 本地單元與契約測試全綠 | 外部 gate：待使用者執行 `.local/passenger-app-20261009/psp-ecpay/create-ecpay-secrets.sh` 建立 GCP Secret Manager secrets 並透過 `deploy-dev.yml` 驗證 |

---

## 3. Sandbox 實機驗收狀態 (`pax-psp_adapter_sandbox_verified`)

- **目前狀態**：`blocked` on external gate（等待使用者於 GCP Secret Manager 建立綠界 Stage 測試特店 secrets 後執行 `deploy-dev.yml` 與 Sandbox 綁卡／3DS／扣款／退款實測）。
- **Stage 退刷／取消授權條件規則（依 `PSP6991-F5` 與官方契約）**：
  - 綠界 `DoAction` 之 `Action: "R"`（退刷）僅適用於已關帳（`CloseStatus: 1`）交易；於 Stage 測試環境同日授權尚未關帳（`CloseStatus: 0`）時，`EcpayPaymentProvider.refund()` 會先呼叫 `QueryTrade` 並自動執行 `Action: "N"`（取消授權；若為 `CloseStatus: 2` 要關帳則先 `Action: "E"` 放棄關帳再 `Action: "N"`）。若 Stage 支援關帳後退刷則驗證 `Action: "R"`；若同日無法關帳則以 `QueryTrade` + `DoAction` (`E`/`N`) 之遮罩證據加上已關帳 `Action: "R"` 契約測試共同佐證。
- **前置步驟**：
  1. 使用者於具備 GCP Secret Manager 權限之環境執行 `.local/passenger-app-20261009/psp-ecpay/create-ecpay-secrets.sh`，建立 `drts-dev-psp-merchant-id`、`drts-dev-psp-hash-key`、`drts-dev-psp-hash-iv`、`drts-dev-psp-sandbox`、`drts-dev-psp-token-encryption-key-name`。
  2. 觸發 `deploy-dev.yml` 部署 `drts-dev` 環境。
  3. 於綠界 Stage Sandbox 完成綁卡（含 3DS 驗證）、行程完成自動扣款（`CreatePaymentWithCardID`）與退款／取消授權（`QueryTrade` + `DoAction`），並將遮罩後之回應證據保存於 `.local/passenger-app-20261009/psp-ecpay/`。
