# PAX-PSP-SANDBOX-EVIDENCE-20261101 UAT 紀錄：綠界 Stage 綁卡與扣款實際證據

- **Task ID**: `PAX-PSP-SANDBOX-EVIDENCE-20261101`
- **Owner**: `Claude`
- **Reviewer**: `Claude2`
- **Acceptance key**: `pax-psp_sandbox_bind_and_charge_evidence`（完成後由 Supervisor 回填 `PAX-PSP-ADAPTER-20261009` 的 `pax-psp_adapter_sandbox_verified`）
- **Base**: `origin/dev` @ `a2696824610f`（`PAX-TRIAL-SKIP-BLOCKED-ACCOUNTS-20261101`, #3175）
- **Candidate SHA / PR**: 本文件所在 commit 即 candidate；PR 與 hosted runner run 由既有候選流程在 push 後建立，結果待回填（見 §5）。

## 1. 依據

- Task spec：`.local/passenger-app-20261009/PAX-PSP-SANDBOX-EVIDENCE-20261101.md`（不入 repo）。
- 上游規格與退款規則：`.local/passenger-app-20261009/PAX-PSP-ADAPTER-20261009.md`「2026-10-24 使用者決定：金流商用綠界 ECPay」。
- 上游 UAT：[`PAX-PSP-ADAPTER-20261009.md`](./PAX-PSP-ADAPTER-20261009.md) §3（Stage 未實機驗證、Stage 不提供 `/1.0.0/Credit/DoAction`）。
- 為什麼不能用 shared dev：`DEV_PAX_REVIEW_DEMO_ENABLED=true` 時 `.github/workflows/deploy-dev.yml` 強制 `PSP_PROVIDER=fake`（約 1176–1198 行）。本任務不修改該檔與 GitHub 變數。

## 2. 實際修改

| 檔案                                                    | 內容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/psp-sandbox-acceptance.yml`          | 新 workflow。`workflow_dispatch(candidate_sha)` 與 `pull_request: branches: [dev, main]`，`paths` 只限本 workflow、`playwright.pax-psp-sandbox.config.ts`、`tests/e2e/pax-psp-sandbox/**`。fork PR 不執行。`ubuntu-24.04` hosted runner；全域 concurrency `pax-psp-ecpay-stage-sandbox` 序列化（同一 Stage 特店、每會員 5 張上限）。以 `secrets.DEV_WIF_PROVIDER` / `secrets.DEV_WIF_SERVICE_ACCOUNT` 認證後，用 `gcloud secrets versions access latest` 從 `drts-dev-devcc-20260825` 讀 `drts-dev-psp-merchant-id`、`-hash-key`、`-hash-iv`、`-sandbox`、`-token-encryption-key-name`；secret 只存在於執行測試那一個 step 的行程環境，先逐行 `::add-mask::`（金鑰環 JSON 另遮罩緊湊形式與每把 key），不寫入 `GITHUB_ENV` 或磁碟；`drts-dev-psp-sandbox` 不是 `true` 即拒絕執行。上傳的 artifact 只含遮罩後的證據檔，不上傳 Playwright output 目錄。 |
| `playwright.pax-psp-sandbox.config.ts`                  | 單一 worker、`retries: 0`（重試會再綁一張卡）、無 `webServer`；`trace`/`video`/`screenshot` 全關（避免錄到 iframe 內的按鍵）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `tests/e2e/pax-psp-sandbox/ecpay-stage-sandbox.spec.ts` | 流程本體，見 §3。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `tests/e2e/pax-psp-sandbox/evidence.ts`                 | 遮罩規則、記錄每次綠界呼叫的 recording fetch、證據 JSON／Markdown 輸出與最終洩漏掃描。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `tests/e2e/pax-psp-sandbox/harness.ts`                  | runner 本機 `127.0.0.1` 最小 harness 頁面；載入與產品相同的 `ECPAY_JQUERY_URL`、`ECPAY_WEB_SDK_URLS.Stage`（`apps/passenger-app-web/components/payment/ecpay-csp.js`），SDK 呼叫順序與 `EcpayHostedFields` 相同；pay token 驗收規則與 `createEcpayHostedFieldsPort` 相同。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `tests/e2e/pax-psp-sandbox/ecpay-browser.ts`            | 只在綠界網域的 iframe／3D 頁面內操作：輸入 Stage 測試卡與 OTP；找不到欄位時輸出不含值的欄位清單（`sdk-controls.json`／`three-d-controls.json`）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

未修改：`apps/api/src/modules/passenger-app/payment/**`（產品 adapter）、`deploy-dev.yml`、GitHub 變數、`ai-status.json`、`.orchestrator/`。未建立任何 secret 或外部帳號。repo 內沒有任何綠界 MerchantID、HashKey、HashIV（含公開測試特店）；只有官方公開的 Stage 測試卡 `4311-9522-2222-2222`、CVV `222`、OTP `1234`。

## 3. Hosted runner 流程（全部經由已合併的 adapter）

Provider 由已合併的 `paymentRuntimeFromEnv({ PSP_PROVIDER: "ecpay", ... })` 建立，所以 all-or-nothing 組裝規則與 `PaymentTokenCipher` 也一併走過；測試另外確認 `provider.sandbox === true` 且 `baseUrl === https://ecpg-stage.ecpay.com.tw`。recording fetch 只是包住 `fetch`，記錄 HTTP 狀態，並用已合併的 `verifyAndUnwrapEcpayEnvelope` 解開回應，只取出 TransCode／RtnCode；請求由 adapter 自己組裝與加密。

| #   | 步驟                                                                                                                                                                                                                                                                                                 | 呼叫                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 01  | `createBindingSession(passengerId, { email: pax-psp-sandbox@example.com })`                                                                                                                                                                                                                          | `/Merchant/GetTokenbyBindingCard`                                      |
| 02  | harness 頁面 `ECPay.initialize("Stage", 1)` → `addBindingCard(token, zhTW)`                                                                                                                                                                                                                          | 綠界 SDK                                                               |
| 03  | 只在綠界 iframe 內輸入 `4311952222222222`、有效期限（當月＋3 年）、CVV `222`                                                                                                                                                                                                                         | 綠界 iframe                                                            |
| 04  | `getBindCardPayToken` → `BindCardPayToken`                                                                                                                                                                                                                                                           | 綠界 SDK                                                               |
| 05  | `bind(payToken, key, { passengerId })`                                                                                                                                                                                                                                                               | `/Merchant/CreateBindCard`                                             |
| 06  | 若回 `ThreeDURL`：開 3D 頁，輸入 OTP `1234`；攔截瀏覽器送往 `OrderResultURL`（adapter 預設 `https://ride.smarttransport.tw/api/passenger-app/payment-methods/ecpay/order-result`）的 POST，在 runner 本機 fulfill，不送到 DRTS 任何環境；以 `verifyNotification(ResultData)` 驗章並取得 `BindCardID` | 綠界 3D 頁                                                             |
| 06b | 比照 `PaymentMethodService.verifyNotification`，呼叫 `cancelBindingAuthorization` 撤銷綁卡驗證授權；Stage 文件記載不提供 `Credit/DoAction`，所以結果只記錄，不影響驗收                                                                                                                               | `/1.0.0/Credit/DoAction`（N），失敗時 `/1.0.0/CreditDetail/QueryTrade` |
| 07  | 卡號遮罩、卡別、到期；`PaymentTokenCipher` AES-GCM 加解密往返                                                                                                                                                                                                                                        | 本機                                                                   |
| 08  | `capture({ amountMinor: 8500, currency: "TWD", passengerId })` 扣 NT$85（Need3D=0）                                                                                                                                                                                                                  | `/Merchant/CreatePaymentWithCardID`                                    |
| 09  | `refund()`：依實際回應記錄，不偽造成功                                                                                                                                                                                                                                                               | `/1.0.0/CreditDetail/QueryTrade`，必要時 `/1.0.0/Credit/DoAction`      |
| 10  | 只要取得 `BindCardID` 就一定在 `finally` 呼叫 `unbind()`                                                                                                                                                                                                                                             | `/Merchant/DeleteMemberBindCard`                                       |

驗收條件（`evidence.acceptance.satisfied`）：綁卡完成、走過 3D、扣款 `completed`、退款已嘗試並記錄、`unbind()` 回傳 `true`。不符合時測試失敗，但證據仍會寫出並上傳。

退款判定：`refund()` 回 `completed` 記為 `stage_refund_succeeded`，並保存成功證據；其他結果（上游預期 Stage 會因缺明確關帳狀態而回 `unknown`）記為「Stage 不支援或未確認，退款證據改在正式特店取得」，連同 QueryTrade／DoAction 的 HTTP 與 RtnCode 一起保存。

## 4. 遮罩與資料保護

- 卡號只留末四碼 `2222`；`BindCardID`、`MerchantMemberID`、`MerchantTradeNo`、`TradeNo` 只留 SHA-256 前 12 碼（`*_sha12`）。
- MerchantID、HashKey、HashIV、金鑰環、merchant token、pay token、3D URL、BindCardID、交易編號在執行時都會登記到 redactor，並輸出 `::add-mask::`；測試卡號也有遮罩。寫出 artifact 前會再掃一次：發現任何登記過的值或完整卡號，就改寫成 `artifact_withheld_leak_detected`（fail closed）。
- 截圖遮蓋所有 `input`、`select`、`iframe`；畫面文字若出現完整卡號，或有 frame 無法讀取，就不截圖並記錄原因。
- `ReturnURL` 使用 adapter 預設值（`ride.smarttransport.tw` 的 callback，屬 dev 網域）。這是綠界伺服器對伺服器的回呼，runner 攔截不到；shared dev 在 review demo 模式不會掛載 ECPay，該回呼會被拒絕，不會改變 dev 資料。runner 的瀏覽器對 `*.smarttransport.tw` 的請求一律 abort。

## 5. 執行與驗證紀錄

### 5.1 本 session（雲端沙盒，沒有 WIF/GCP 憑證，也沒有對外連線到綠界）

| 命令                                                                                                           | 結果                                                         |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                               | exit 0                                                       |
| `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck:root`                                                   | exit 0（預設 heap 會 OOM，exit 134；加大 heap 後通過）       |
| `pnpm exec eslint playwright.pax-psp-sandbox.config.ts tests/e2e/pax-psp-sandbox --max-warnings=0`             | exit 0                                                       |
| `pnpm exec prettier --check`（本任務 6 個檔案）                                                                | exit 0                                                       |
| `python3 -c "import yaml,sys; yaml.safe_load(open(sys.argv[1]))" .github/workflows/psp-sandbox-acceptance.yml` | exit 0；每個 `run` 區塊 `bash -n` exit 0，內嵌 Python 可編譯 |
| `pnpm exec playwright test -c playwright.pax-psp-sandbox.config.ts --list`                                     | exit 0（1 test；只列出測試，不啟動瀏覽器）                   |
| `tsx` 離線檢查 redactor／遮罩欄位／recording fetch（stub `fetch`，使用明顯虛構的 key）                         | exit 0                                                       |
| `git diff --check origin/dev...HEAD`                                                                           | 乾淨                                                         |

沒有在本 session 執行 `playwright test`，也沒有啟動瀏覽器或 server：任務限制禁止，而且沒有真實憑證。下表的 Stage 結果一律未知，沒有任何偽造的回應或 RtnCode。

### 5.2 Hosted runner 結果（待回填）

| 項目                                                          | 值                                                          |
| ------------------------------------------------------------- | ----------------------------------------------------------- |
| candidate SHA                                                 | 待回填（本 commit）                                         |
| run URL                                                       | 待回填                                                      |
| artifact                                                      | `pax-psp-sandbox-evidence-<sha>-<run_id>-<attempt>`，待回填 |
| 01 GetTokenbyBindingCard HTTP／RtnCode／時間                  | 待回填                                                      |
| 05 CreateBindCard HTTP／RtnCode／是否回 3D                    | 待回填                                                      |
| 06 3D OTP／OrderResult RtnCode／BindCardID_sha12／末四碼      | 待回填                                                      |
| 06b 綁卡授權撤銷（DoAction N）                                | 待回填                                                      |
| 08 CreatePaymentWithCardID NT$85 HTTP／RtnCode／TradeNo_sha12 | 待回填                                                      |
| 09 refund() 結果與 QueryTrade／DoAction 回應                  | 待回填（預期 Stage 不支援，退款證據改在正式特店取得）       |
| 10 DeleteMemberBindCard 結果                                  | 待回填                                                      |

回填來源：該 run 的 `evidence.json`／`summary.md`（也會附在 job summary）與 `run-status.json`。

## 6. 剩餘未驗項目與風險

1. **WIF 是否允許 PR ref**：repo 內 `infra/gcp/dev/provision-dev-project.sh` 的 provider attribute condition 是 `assertion.repository=='ajoe734/drts-fleet-platform'`，service account binding 是 `principalSet://…/attribute.repository/ajoe734/drts-fleet-platform`，沒有限制 ref，所以同 repo 的 `pull_request` 應可認證；`ci-integ.yml` 在 PR 上也用同一組 secret。本 session 無法讀取 live provider，實際狀況以 run 的 `Authenticate with existing dev WIF` step 為準。若被拒絕，記為 blocker 並附上實際 condition，不繞過。
2. **SDK／3D 頁面 DOM**：綠界 iframe 與 Stage 3D 頁面的欄位名稱沒有公開契約，所以用屬性關鍵字定位。若第一次 run 找不到欄位，artifact 會帶出不含值的欄位清單，可據此修正選擇器（仍在本 task 的 write scope 內）。
3. **OrderResultURL 傳送方式**：預期是瀏覽器 form POST `ResultData`；若是 GET，改用 query string 解析，結果記錄在 `orderResultMethod`。
4. **退款**：依規則如實記錄；Stage 若不支援，正式特店的退款證據仍待取得（不在本 task 範圍）。
5. **adapter 缺陷**：目前靜態閱讀沒有發現需要修改產品程式的缺陷。若 run 發現缺陷，只用 blocker 回報，由 Supervisor 另開修正 task。
