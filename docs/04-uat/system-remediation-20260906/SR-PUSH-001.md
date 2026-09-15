# SR-PUSH-001 — P5 推播真 adapter 與不可用降級

- **Task ID**: `SR-PUSH-001`
- **任務名稱**: P5 推播真 adapter 與不可用降級
- **Owner**: `Gemini`；**Reviewer**: `Codex`
- **工作分支 (Branch)**: `claude/sr-push-001-recovery-20260911`
- **基準 SHA (Base SHA)**: `c70e065c1` (`origin/dev`)
- **規劃參照 (Planning Reference)**: `docs/04-uat/system-remediation-20260906/source/capabilities.json` (C023)
- **稽核與缺口來源 (Audit & Gap References)**: `docs/04-uat/system-remediation-20260906/source/findings.json`、`docs/04-uat/system-remediation-20260906/source/new-gaps.json` (N10)
- **開放問題參照 (Open Question Reference)**: `PHASE1_OPEN_QUESTIONS.md` (Q-SR-PUSH-001)
- **執行規則 (Runbook Ref)**: `docs/03-runbooks/system-remediation-20260906/SR-PUSH-001.md`
- **前置相依 (Dependencies)**: `UV-EXEC-006`, `SR-CONTRACT-001`, `SR-RECOVERY-CONTRACTS-20260911`, `UV-EXEC-013`, `UV-EXEC-016`, `SR-BOOKING-VERIFY`, `SR-DISPATCH-SCHEDULER-001`, `SR-PUSH-DURABILITY-20260911`（均已合併至 `origin/dev`）

---

## 1. 基準重現與問題分析 (Reproduction & Traceability)

### 歷史背景與先前工作

歷史 audit（N10）與 `readiness.json` 指出：

- `MultiTaxiModule` 僅綁定 `UnavailablePassengerPushPort`，`isAvailable()` 固定回傳 `false`。
- 系統缺乏真正的推播轉接器（adapter）、供應商 readiness 讀取、裝置關聯防護與可注入傳輸機制。
- 前次 Codex2 建立之 baseline 測試發現兩項預期失敗（expected failures）：
  1. `MultiTaxiService.deliverPassengerNotification` 重複呼叫已送達（`status === "delivered"`）之 outbox row 時，未作防護即再次發送。
  2. 供應商確認後若持久化失敗，舊版程式碼會吞沒例外並假裝 `delivered`。

前置任務 `SR-PUSH-DURABILITY-20260911`（PR #1977，commit `ee4dacb3fb22`，merge `69b397208871`）已完成 durable claim / lease / fence 機制、收據持久化交易（`ops.phase1_push_delivery_receipts`）與持久化錯誤傳播。

### 本任務核心解決範圍

本任務落實 `SR-PUSH-001` 的核心要求：

1. **真 Adapter 與不可用降級**：實作 `PassengerPushAdapter`，在無憑證或無傳輸時維持安全不可用（`isAvailable() === false`），拒絕虛構送達；在注入傳輸或具備環境憑證時進入可用狀態。
2. **受控 Receiver 與可靠收據**：提供 `PassengerPushTransport` 介面，受控接收端能驗證實際派發之 payload，並將供應商 receipt 回傳供持久化。
3. **前置裝置生命週期驗證**：提供 `PassengerDeviceResolver` 介面，在呼叫供應商發送前先驗證裝置狀態，過期（expired）、已撤銷（revoked）或跨租戶（cross-tenant mismatch）裝置在發送前即安全拒絕，不會誤呼叫供應商。
4. **重複發送防護**：於 `MultiTaxiService.deliverPassengerNotification` 補齊 `status === "delivered"` 的保護檢查，已送達者立即回傳，不重複發送或搶佔 lease。

---

## 2. 實作內容 (What Was Built)

### 2.1 介面與錯誤類型 (`apps/api/src/modules/multi-taxi/passenger-push.port.ts`)

新增並匯出四個具體錯誤類別：

- `PassengerPushDeviceExpiredError`：乘客裝置註冊已逾期。
- `PassengerPushDeviceRevokedError`：乘客裝置註冊已被撤銷。
- `PassengerPushTenantMismatchError`：乘客裝置租戶與訂單租戶不符。
- `PassengerPushProviderError`：供應商端回傳非 2xx HTTP 或協定錯誤。

### 2.2 推播轉接器 (`apps/api/src/modules/multi-taxi/passenger-push.adapter.ts`，新增)

實作 `PassengerPushAdapter implements PassengerPushPort`：

- **Availability 降級**：檢查注入之 `config`、`transport` 或環境變數（`PASSENGER_PUSH_API_KEY`、`PASSENGER_PUSH_AUTH_TOKEN`、`PASSENGER_PUSH_ENDPOINT` / `PASSENGER_PUSH_PROVIDER_NAME`）。若皆未提供，`isAvailable()` 嚴格回傳 `false`；若未配置直接呼叫 `send()` 則拋出錯誤，避免偽造送達狀態。
- **可注入傳輸與受控 Receiver**：支援 `PASSENGER_PUSH_TRANSPORT`，測試與受控驗證可注入 mock / controlled receiver 證明真實調用。在配置 HTTP endpoint 時，可使用標準 `fetch` 發送 JSON payload 與 API 金鑰 / 授權標頭。
- **前置裝置檢驗**：支援 `PASSENGER_DEVICE_RESOLVER`，在呼叫傳輸發送前檢查裝置有效性與租戶歸屬，異常時於本地拒絕（reject before send），釋放 claim 並排定重試。
- **收據擷取**：解析供應商回應之 `providerMessageRef` / `messageId`，回傳正規 `PassengerPushReceipt`。

### 2.3 模組綁定 (`apps/api/src/modules/multi-taxi/multi-taxi.module.ts`)

- 將 `PASSENGER_PUSH_PORT` 的 NestJS provider 由 `UnavailablePassengerPushPort` 改為 `PassengerPushAdapter`。
- 未設定環境憑證時，`PassengerPushAdapter` 自然維持 `isAvailable() === false`，平臺運作保持安全不可用，不影響現有啟動流程。

### 2.4 重複送達防護 (`apps/api/src/modules/multi-taxi/multi-taxi.service.ts`)

- 於 `deliverPassengerNotification` 最前端檢查 `record.status === "delivered"`：若已送達，立即回傳既有送達狀態，不重複 claim 亦不再次呼叫 `passengerPushPort.send`。

### 2.5 完整驗證測試集 (`tests/unit/system-remediation/sr-push-001/push-adapter-boundary.test.ts`，新增)

包含 16 個嚴格單元測試，涵蓋：

1. 無憑證安全降級為不可用（`isAvailable() === false`）與拒絕發送。
2. 環境變數憑證偵測與可用性啟動。
3. 注入傳輸可用性啟動。
4. 受控 receiver 驗證真實 send 與 receipt 持久化回存。
5. 未設定供應商時維持 `failed` / `provider_not_configured` 並排定指數退避重試。
6. 供應商 503 錯誤排定指數退避重試（上限 32 分鐘）並釋放 claim fence token。
7. 已送達（duplicate / already delivered）記錄拒絕重複發送。
8. 並行搶佔衝突（concurrent claim conflict）拋出 `PassengerPushClaimConflictError`。
9. 持久化交易中斷拋出 `PassengerPushPersistenceUnknownError`，不誤報 `delivered`。
10. 過期裝置在發送前拒絕並排定重試。
11. 已撤銷裝置在發送前拒絕並排定重試。
12. 跨租戶裝置在發送前拒絕並排定重試。
13. HTTP 傳輸正確組裝標頭與 JSON 內容並解析收據。
14. HTTP 500 錯誤適當拋出 `PassengerPushProviderError`。
15. 重啟與 lease 逾期重新奪取 fence token 流程驗證。
16. `MultiTaxiModule` 依賴注入綁定驗證。

---

## 3. 指令驗證結果 (Command Verification Evidence)

於工作樹目錄 `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-push-001` 執行：

| 指令                                                                                                                                                                                                                                                                                                                             | Exit Code | 說明與結果                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `git diff --check`                                                                                                                                                                                                                                                                                                               | `0`       | 無任何空白格式或換行問題。                                                                             |
| `pnpm exec turbo run typecheck --filter=@drts/api`                                                                                                                                                                                                                                                                               | `0`       | 包含 `@drts/contracts`、`@drts/control-plane-auth` 與 `@drts/api` 之 Typecheck，5/5 成功，0 診斷錯誤。 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-push-001/`                                                                                                                                                                                                                                                                | `0`       | 1 個測試檔，**16 個測試全數通過**（耗時約 4.88 秒）。                                                  |
| `pnpm exec vitest run tests/unit/system-remediation/sr-push-durability-20260911/`                                                                                                                                                                                                                                                | `0`       | 1 個測試檔，**12 個持久化測試全數通過**（耗時約 2.93 秒）。                                            |
| `pnpm --filter @drts/api test tests/unit/multi-taxi.service.test.ts`                                                                                                                                                                                                                                                             | `0`       | API 模組既有測試，**26 個測試全數通過**（耗時約 2.88 秒）。                                            |
| `pnpm exec eslint apps/api/src/modules/multi-taxi/passenger-push.port.ts apps/api/src/modules/multi-taxi/passenger-push.adapter.ts apps/api/src/modules/multi-taxi/multi-taxi.module.ts apps/api/src/modules/multi-taxi/multi-taxi.service.ts tests/unit/system-remediation/sr-push-001/push-adapter-boundary.test.ts`           | `0`       | 無任何 ESLint 警告或錯誤。                                                                             |
| `pnpm exec prettier --check apps/api/src/modules/multi-taxi/passenger-push.port.ts apps/api/src/modules/multi-taxi/passenger-push.adapter.ts apps/api/src/modules/multi-taxi/multi-taxi.module.ts apps/api/src/modules/multi-taxi/multi-taxi.service.ts tests/unit/system-remediation/sr-push-001/push-adapter-boundary.test.ts` | `0`       | 所有檔案符合 Prettier 風格規範。                                                                       |

---

## 4. 未做的 Live／真機部分（明確列出，不冒充成功）

依循合約紀律與沙盒限制，以下項目明確記錄為未做，**不偽稱已具備真機成功**：

1. **無真實 FCM / APNs 伺服器憑證**：本任務未擅自購買 Apple 開發者帳號、Google Cloud FCM 服務金鑰，亦未聯絡外部廠商；未配置憑證時嚴格維持 `isAvailable() === false`。
2. **無真機實體通知發送**：未向實體 iOS / Android 手機發送 APNs / FCM 遠端推播封包。此部分驗證留待下游專屬真機閘門 `SR-LIVE-PUSH-001`（C023）。本任務單元測試通過**不得**解除 `SR-LIVE-PUSH-001` 之 gate。
3. **無啟動常駐 HTTP Receiver 伺服器**：本機 VM 明確禁止啟動 Compose / 後台服務，受控接收端（controlled receiver）係以 in-memory / injected transport 測試雙重（test double）證明，未在本機 listen TCP port。
4. **無即時 PostgreSQL 連線**：本單元測試透過 repository mock 與 contracts 結構驗證 claim / fence / outcome，未直接連接 live production database。

---

## 5. 測試資源 ID (Resource IDs)

- **測試 Outbox IDs**: `sr-push-001-outbox-001`, `outbox-http-1`, `outbox-http-2`, `outbox-1`
- **測試 Order IDs**: `sr-push-001-order-001`, `order-http-1`, `order-http-2`, `order-1`
- **測試 Passenger Subject Refs**: `sr-push-001-passenger-001`, `psg-http-1`, `psg-http-2`, `psg-1`
- **測試 Receipt IDs**: `receipt-ctrl-001`, `http-msg-ref-456`, `msg-123`
- **真實供應商帳號 ID (Real Provider Account ID)**: `null`
- **真實供應商訊息 ID (Real Provider Message ID)**: `null`
- **授權真裝置 ID (Authorized Device ID)**: `null`
- **即時資料庫連線 ID (PostgreSQL Instance ID)**: `null`
