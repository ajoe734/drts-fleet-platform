# SR-UAT-HARNESS-001 — 跨角色獨立測試租戶與証據 harness

| 欄位          | 內容                                                                          |
| ------------- | ----------------------------------------------------------------------------- |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-UAT-HARNESS-001.md`          |
| Owner         | Gemini                                                                        |
| Reviewer      | Gemini2                                                                       |
| Base SHA      | `ea1b1b4f0359d5ca5ab00ad604d37281a74d70df` (= `origin/dev` tip at task start) |
| Candidate SHA | recorded at `handoff` via `git rev-parse HEAD` (see task board)               |

## 1. 重現與基準

`origin/dev` 在本任務開始時基準為 `ea1b1b4f0359d5ca5ab00ad604d37281a74d70df`（已含 `FIX-IAM-UNGRANTABLE-002`、`SR-MAIL-002`、`SR-DESIGN-001`、`UV-EXEC-002` 等前置修復）。9/6 audit SHA（`08b7a32…`）是歷史觀察而非當前程式真值；本任務直接從 `ea1b1b4f03` 出發，不重做或回退既有修復。

### 缺口重現

在 base SHA 狀態下：

1. 缺乏統一的跨角色、多租戶端到端驗收測試框架，下游 15 個 `SR-QA-*`（`SR-QA-IDENTITY-001`、`SR-QA-TENANT-001`、`SR-QA-BOOKING-001`、`SR-QA-DISPATCH-001` 等）與 9 個 `SR-LIVE-*` 任務無法重用統一的租戶隔離機制與數據驗證邏輯。
2. 平行測試 shard 缺乏 namespace 自動隔離與自清理機制，容易在多 worker 平行執行時造成資料庫與記憶體污染。
3. 測試記錄缺乏統一的 SHA（Base SHA、Candidate SHA、HEAD SHA）、HTTP 請求歷程、Console 紀錄、產物雜湊（SHA-256）與角色身分紀錄，且未做 PII 去識別化。
4. 缺乏明確的環境邊界防護：既有測試曾允許 fakeheaders 任意穿透，違反「只能測試 local/sandbox，live 時需合法身份不 fakeheaders」的系統防護邊界。

## 2. 這個任務做了什麼

本任務在 `write_scopes` 內建立了完整的共用 UAT Harness 與驗收工具：

### 1. 共用 Harness 模組 (`tests/e2e/system-remediation/shared/`)

- `namespace-manager.ts` — `UatNamespaceManager` 與 `UatNamespace`：
  - 提供多 shard（例如 shard 0 與 shard 1）獨立命名空間產生，確保各 shard 具備完全互斥的 prefix（`uat_s${shard}_...`）與租戶識別碼。
  - 每個 namespace 自動配給獨立的 Tenant A（`enterprise` 企業租戶）與 Tenant B（`credit_card` 信用卡禮賓租戶）。
  - 支援 ID 與名稱命名空間限定化（`qualifyId`、`qualifyName`）與資源註冊追蹤。
  - 具備乾淨的自我清理方法（`cleanup()`），僅清除本 namespace 所屬資源，互不影響亦不觸碰全域種子資料。
  - 提供 `assertNoCrossPollution()` 斷言，保證多 shard 平行執行時零污染。
- `role-personas.ts` — 權威 IAM 角色 Persona 與驗證標頭生成：
  - 定義 DRTS 完整權威角色：`platform_admin`、`tenant_admin`、`ops_user`（`ops_dispatcher`）、`driver_user`、`partner_api_key`、`bank_finance`、`referral_passenger`。
  - 支援從指定 `UatTenantContext` 動態產生綁定該租戶的專屬 Persona（Admin、Operator、Driver、Passenger）。
  - `generateAuthHeaders()` 實作環境守衛：
    - `local` / `sandbox` 模式：產生標準身分與角色標頭（`x-actor-type`、`x-actor-id`、`x-realm`、`x-scopes`、`x-tenant-id` 等）。
    - `live` 模式：**嚴格拒絕 synthetic fakeheaders**，若嘗試在 live 模式產生 fakeheaders 則立即拋出異常，杜絕身分冒用。
- `pii-redactor.ts` — PII 與機敏資訊去識別化工具：
  - 去識別化台灣手機號碼（例如 `0912-345-678` → `0912-***-678`、`0912345678` → `0912-***-678`）。
  - 去識別化市話號碼（例如 `02-2700-9999` → `02-***-9999`）。
  - 去識別化電子信箱（例如 `admin@acme.example` → `a***@acme.example`）。
  - 去識別化台灣身分證字號（ROC ID）（例如 `A123456789` → `A12***789`）。
  - 去識別化信用卡與銀行帳號（`****-****-****-****`）。
  - 去識別化 Bearer Tokens、API Key、密碼、Token 參數（`Bearer [REDACTED_TOKEN]`、`token=[REDACTED]`、`"password": "[REDACTED]"`）。
  - 支援字串與深度巢狀物件／陣列遞迴脫敏（`redactObject`）。
- `evidence-recorder.ts` — 完整證據記錄器 `UatEvidenceRecorder`：
  - 自動解析並記錄 Base SHA、Candidate SHA、Git HEAD SHA。
  - 記錄完整 HTTP 呼叫（Method、去識別化 URL、狀態碼、耗時毫秒、去識別化 Headers 與 Request/Response Body、發起 Actor 角色）。
  - 記錄 Console 輸出（等級、去識別化訊息、原始碼位置）。
  - 記錄產物與檔案（名稱、路徑、MIME、Byte 大小、**SHA-256 雜湊值**）。
  - 記錄參與角色與受測資源 ID（Resource IDs）。
  - 具備失敗非零退出機制：若有未預期錯誤，狀態設為 `failed`，`exitCode` 設為 `1`，且 `assertSuccess()` 會擲出帶有 exitCode 1 的 Error。
  - 支援產出持久化 JSON 證據包（`saveToFile()`）。
  - 支援明確宣告未執行的 Live／真機限制（`recordLiveLimitation()`），絕不冒充通過。
- `browser-helpers.ts` — Playwright 瀏覽器操作輔助工具：
  - `attachBrowserEvidenceCollector()`：即時監聽 Playwright 頁面的 `console`、`pageerror`、`request`、`response` 事件並自動脫敏注入 `UatEvidenceRecorder`。
  - `setupPagePersona()`：為瀏覽器頁面注入對應 Persona 的授權設定。
  - `performPublicLogin()`：公共登入路徑模擬與跳轉檢查。
  - `assertTenantIsolationOnPage()`：頁面層級跨租戶防護斷言，檢查非當前租戶之識別碼或品牌名稱是否洩漏於 DOM。
- `index.ts` — 統一導出模組。
- `harness-verification.spec.ts` — Playwright 端到端驗證測試。

### 2. Playwright 專用配置 (`playwright.system-remediation.config.ts`)

- 配置針對 `./tests/e2e/system-remediation` 的測試路徑。
- 支援平行 worker、sharding、失敗時 trace 與截圖保留、JSON 與 list 報表產出。

### 3. 單元測試 (`tests/unit/system-remediation/sr-uat-harness-001/`)

- `namespace-manager.test.ts` — 驗證多 shard 隔離、租戶獨立性、資源無衝突斷言、獨立清理能力。
- `role-personas.test.ts` — 驗證角色定義、租戶 Persona 綁定、local/sandbox 標頭生成、live fakeheaders 防護。
- `pii-redactor.test.ts` — 驗證信箱、手機、市話、身分證、Bearer token、密碼欄位、巢狀物件之脫敏。
- `evidence-recorder.test.ts` — 驗證 SHA 記錄、HTTP/Console 脫敏記錄、產物 SHA-256 計算、live 限制紀錄、失敗 non-zero exit 行為、JSON 儲存。
- `browser-helpers.test.ts` — 驗證瀏覽器事件轉發、身分設定、頁面層級租戶隔離檢查。

## 3. 驗收條件對應

| 驗收條件                                                                                                                          | 對應實作與證據                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **harness在兩個parallel shards資料互不污染，可清理自己namespace**                                                                 | `namespace-manager.ts` 實作 `UatNamespaceManager`，以 `shardIndex` 與隨機 token 建立互斥命名空間及專屬 Tenant A/B；`assertNoCrossPollution()` 驗證兩 shard 資源集合完全不相交；`cleanup()` 僅清除呼叫端 namespace 資源，保留並行 shard 資源。於 `namespace-manager.test.ts` 與 `harness-verification.spec.ts` 4 項測試全數驗證通過。                                                                                     |
| **記錄SHA、HTTP/console、artifact/hash与role，失敗会退出nonzero；有PII去識別**                                                    | `evidence-recorder.ts` 記錄 base SHA、candidate SHA、git HEAD SHA、HTTP 耗時與狀態、Console 訊息、產物 SHA-256 雜湊與位元組大小、執行角色與資源 ID；若遇到錯誤或失敗狀態，`exitCode` 設為 1 並於 `assertSuccess()` 拋出 non-zero 異常；所有字串與物件經過 `pii-redactor.ts` 脫敏（電話、信箱、身分證、tokens 皆遮蔽）。於 `pii-redactor.test.ts`、`evidence-recorder.test.ts`、`harness-verification.spec.ts` 驗證通過。 |
| **證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列，不冒充成功**                                     | 本文件第 1 節記錄 Base SHA、第 4 節記錄實際執行指令與 exit code；第 5 節完整明列未做的真機/live 部分（如真實硬體 GPS、PSTN 實體線路、真機推播等），誠實記錄邊界。                                                                                                                                                                                                                                                        |
| **先 commit＋普通 push，再 handoff；owner 不直接 done，獨立 reviewer、同 candidate CI／merge及 required_acceptance 完備才可結案** | 嚴格遵守工作規範，實作完成後先以 task-scoped anchor commit 提交、push 至遠端分支，再透過 `ai-status.sh handoff` 交付 `Gemini2` review。                                                                                                                                                                                                                                                                                  |

# 4. 實際指令與結果

```bash
# 1. 檢查 whitespace 與程式碼排版
$ git diff --check
(exit 0，無任何空白字元錯誤)

# 2. 檢查 ESLint (Root linter)
$ pnpm lint:root
> drts-fleet-platform@0.1.0 lint:root
> eslint eslint.config.mjs playwright*.config.ts vitest.config.ts tests --max-warnings=0
(exit 0，0 errors, 0 warnings)

# 3. 檢查 TypeScript 型別 (Root + Turbo typecheck)
$ pnpm typecheck
(exit 0，27 successful, 27 total)

# 4. 列出 Playwright 系統補救 UAT 測試清單
$ pnpm exec playwright test -c playwright.system-remediation.config.ts --list
Listing tests:
  shared/harness-verification.spec.ts:11:7 › SR-UAT-HARNESS-001: Parallel Shard and Tenant Isolation Verification › maintains complete data and namespace isolation between two parallel shards
  shared/harness-verification.spec.ts:64:7 › SR-UAT-HARNESS-001: Parallel Shard and Tenant Isolation Verification › generates role personas and enforces live fakeheaders guardrails
  shared/harness-verification.spec.ts:90:7 › SR-UAT-HARNESS-001: Parallel Shard and Tenant Isolation Verification › records evidence with SHA, HTTP/console logs, artifact hashes, and PII redaction
  shared/harness-verification.spec.ts:155:7 › SR-UAT-HARNESS-001: Parallel Shard and Tenant Isolation Verification › handles execution failure with non-zero exit code
Total: 4 tests in 1 file
(exit 0)

# 5. 執行 Playwright 整合驗證測試
$ pnpm exec playwright test -c playwright.system-remediation.config.ts
Running 4 tests using 4 workers
  ✓  1 … handles execution failure with non-zero exit code (87ms)
  ✓  2 … complete data and namespace isolation between two parallel shards (65ms)
  ✓  3 … records evidence with SHA, HTTP/console logs, artifact hashes, and PII redaction (95ms)
  ✓  4 … generates role personas and enforces live fakeheaders guardrails (48ms)
  4 passed (1.7s)
(exit 0)

# 6. 執行 Vitest 單元測試套件
$ pnpm exec vitest run tests/unit/system-remediation/sr-uat-harness-001/
 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-uat-harness-001

 Test Files  5 passed (5)
      Tests  23 passed (23)
   Duration  587ms
(exit 0)
```

## 5. 未做的部分（明列，不冒充成功）

- **未啟動真實外部資料庫進行 DDL/DML drop namespace**：本 harness 提供 process/runtime-level 命名空間隔離與資源標記追蹤清理。針對 PostgreSQL 物理 schema/database 建立與刪除，屬於 `SR-QA-CONCURRENCY-001` 與 `UV-EXEC-024` 的持久化併發驗收範疇。
- **未包含真實第三方電信 PSTN / 簡訊 / 推播**：本 harness 透過 `recordLiveLimitation()` 明確記錄實體 PSTN 轉接、SMS 閘道與 APNs/FCM 真機裝置之限制，這類驗證屬於 `SR-LIVE-ENTRY-001`、`SR-LIVE-MAIL-001`、`SR-LIVE-PUSH-001`。
- **未包含實體車機硬體與 GPS 定位硬體**：硬體車機回傳座標由模擬與 mock fixture 處理，真機訊號驗收屬於 `SR-LIVE-MAP-001` 與 `SR-LIVE-DRIVER-001`。

## 6. Write scope 遵守情況

本任務僅在指定的四個 write_scopes 內新增與修改檔案，未修改任何全域或非專屬範圍檔案：

- `tests/e2e/system-remediation/shared/`：
  - `tests/e2e/system-remediation/shared/pii-redactor.ts`
  - `tests/e2e/system-remediation/shared/namespace-manager.ts`
  - `tests/e2e/system-remediation/shared/role-personas.ts`
  - `tests/e2e/system-remediation/shared/evidence-recorder.ts`
  - `tests/e2e/system-remediation/shared/browser-helpers.ts`
  - `tests/e2e/system-remediation/shared/index.ts`
  - `tests/e2e/system-remediation/shared/harness-verification.spec.ts`
- `playwright.system-remediation.config.ts`
- `tests/unit/system-remediation/sr-uat-harness-001/`：
  - `tests/unit/system-remediation/sr-uat-harness-001/namespace-manager.test.ts`
  - `tests/unit/system-remediation/sr-uat-harness-001/role-personas.test.ts`
  - `tests/unit/system-remediation/sr-uat-harness-001/pii-redactor.test.ts`
  - `tests/unit/system-remediation/sr-uat-harness-001/evidence-recorder.test.ts`
  - `tests/unit/system-remediation/sr-uat-harness-001/browser-helpers.test.ts`
- `docs/04-uat/system-remediation-20260906/SR-UAT-HARNESS-001.md`（本檔案）
