# SR-OPS-CONTRACT-001 — 合約清單接詳情並呈現可用條款

Owner：Gemini2；Reviewer：Gemini。日期：2026-09-10 UTC。

## 1. 版本與追溯 (Version & Traceability)

- **工作分支 (Branch)**：`gemini2/sr-ops-contract-001`
- **工作樹目錄 (Worktree)**：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-ops-contract-001`
- **基準 SHA (Base SHA)**：`49d365eec908d5e420f6148dd7d080009ad497bf` (`origin/dev`)
- **任務類型與工作流**：Priority P1 / Workstream `ops` / Class `implementation` / Serial Resource `ops-contract-ui`
- **規劃參照 (Planning Reference)**：
  - `docs/04-uat/system-remediation-20260906/source/capabilities.json` (`C134`: 調度與營運 — 合約詳情可進入並提供執行條款)
  - `docs/04-uat/system-remediation-20260906/source/new-gaps.json` (`N13`: 合約列表仍停用詳情入口；`N14`: 合約詳情缺少執行派車所需營運條款)
  - `docs/04-uat/system-remediation-20260906/source/findings.json`
  - `docs/03-runbooks/system-remediation-20260906/SR-OPS-CONTRACT-001.md`
  - `docs/03-runbooks/system-remediation-execution-tasks-20260906.md`
  - `/home/lupin/workspace/drts-fleet-platform/.local/role-routing-20260908T114940Z/report.md`
- **相依與前置任務繼承**：
  - 前置任務 `SR-CONTRACT-READ-001` 已 canonical merge（merge commit `9efb479a6ff741e6f6b0ffb7cfad534308c10ff6`），其提供之端點 `GET /api/regulatory-registry/contracts/:contractId/operational-view`、`ContractOperationalViewRecord` 與權威營運條款投影模型為本任務之直接資料源。
- **功能項目追溯 (Feature Traceability)**：
  - **N13 列表詳情接線與原篩選返回**：
    - 清除 `apps/ops-console-web/app/contracts/page.tsx` 中陳舊之 `contract_detail_pending`，`open_contract_detail` 正式啟用（`enabled: true`，`disabledReasonCode: undefined`）。
    - 3 筆合約（`contract-demo-001`, `contract-demo-004`, `contract-av-demo-001`）無論在「全部」、「即將到期」或「夥伴方案」標籤，均生成攜帶當前篩選狀態之 `detailHref`（`?returnTo=${encodeURIComponent(currentFilterUrl)}`）。
    - `ContractsTable` 合約 ID 欄位與操作區「詳情」按鈕皆支援一鍵進入合約詳情。
    - 合約詳情頁面（`apps/ops-console-web/app/contracts/[contractId]/page.tsx`）解析 `returnTo` 與各項過濾參數，頁首「返回」按鈕及載入失敗之重試按鈕均能精確返回原篩選狀態，完全避免篩選條件遺失。
  - **N14 / C134 營運條款真值呈現與三態區分**：
    - 合約詳情頁面串接 `ContractOperationalViewRecord`，完整呈現派車執行所需的 7 項營運條款：
      1. 可修改時窗 (`modifiableWindow`：出車前截止修改與前置時窗)
      2. 憑證要求 (`proofRequirements`：照片、簽章、行程確認、遙測日誌、相機快照及數位存證旗標)
      3. 等候規則 (`waitingRule`：免費等候時間與逾時計費區間)
      4. No-show 規則 (`noShowRule`：判定閾值與是否計費)
      5. SLA 設定檔 (`slaProfile`：設定檔識別碼、目標響應分鐘數、到位時窗)
      6. 目前生效版本 (`effectiveVersion`：版本號、版本標籤、生效起迄)
      7. 授權模式 (`authMode`：夥伴 API Key / 租戶模式)
    - 嚴格落實三態劃分（`available`, `not_applicable`, `missing_data`）：
      - `available`：呈現後端權威數值與條款描述。
      - `not_applicable`：以 Canvas Pill（neutral tone）明確標註「不適用」（如計程車標準合約無修改時窗或存證需求）。
      - `missing_data`：以 Canvas Pill（warn tone）明確標註「資料未提供」，禁止捏造假預設、假簽名或固定百分比。
    - 版本歷程（Version History）：在既有時間軸中動態注入由 `effectiveVersion` 取得之生效版本歷程節點（版本號、生效起日與 revision），確保版本變更具備可追溯性。
  - **唯讀角色無編輯與跨 App 治理轉向**：
    - Ops Console 作為營運唯讀鏡像，頁首清楚標示「唯讀 · ops 範圍」；頁面無任何編輯、異動或終止等 Mutation 表單與按鈕。
    - 治理轉向 Card 明確引導至 Platform Admin（`targetApp: "platform-admin"`, `openMode: "new_tab"`）：
      - 夥伴合作方案合約導向 `/partners?partnerId=...`
      - 車隊車輛合約導向 `/fleet?vehicleId=...`

---

## 2. 驗證執行紀錄與實際結果 (Verification Evidence)

所有檢查皆於隔離任務工作樹 `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-ops-contract-001` 執行，完全符合派工範圍限制，未修改 `write_scopes` 以外之任何檔案。

| 檢查項目 / 指令                                                                       | Exit Code | 耗時  | 實際結果摘要                                                      |
| :------------------------------------------------------------------------------------ | :-------: | :---: | :---------------------------------------------------------------- |
| `git diff --check`                                                                    |     0     | 0.05s | 工作目錄零 whitespace error                                       |
| `pnpm --filter @drts/ops-console-web typecheck`                                       |     0     | 4.2s  | `@drts/ops-console-web` TypeScript 編譯檢查通過（零型別錯誤）     |
| `pnpm --filter @drts/ops-console-web lint`                                            |     0     | 2.1s  | `@drts/ops-console-web` ESLint 零錯誤通過                         |
| `pnpm exec vitest run tests/unit/system-remediation/sr-ops-contract-001/`            |     0     | 2.34s | 1 test file, 12 passed (100% 通過，0 失敗)                        |
| `pnpm run test:unit tests/unit/system-remediation/sr-ops-contract-001/`              |     0     | 2.00s | 1 test file, 12 passed (Root vitest discovery 通過)               |
| `pnpm exec vitest run tests/unit/system-remediation/sr-contract-read-001/`           |     0     | 2.46s | 1 test file, 19 passed (前置任務回歸驗證 100% 通過)               |
| `pnpm exec eslint tests/unit/system-remediation/sr-ops-contract-001/`                 |     0     | 1.8s  | 測試檔案 ESLint 零警告零錯誤                                      |
| `python3 tools/ci/check_test_coverage.py`                                             |     0     | 0.15s | CI test coverage path 映射全數覆蓋 (67 test files)                 |

---

## 3. 測試覆蓋矩陣 (12 Unit Tests in Suite)

單元測試位於 `tests/unit/system-remediation/sr-ops-contract-001/sr-ops-contract-001.test.ts`，涵蓋以下 4 大維度：

1. **N13 清除 contract_detail_pending 與啟用詳情入口**：
   - 驗證 `synthesizeAvailableActions` 正式啟用 `open_contract_detail`（`enabled: true`, `disabledReasonCode: undefined`）。
   - 驗證後端舊記錄中包含之 `contract_detail_pending` 經正規化後完全移除，且符合 TS `exactOptionalPropertyTypes` 嚴格約束。
2. **N13 列表到詳情導航與原篩選返回**：
   - 驗證 3 筆合約在帶有 `tab`, `q`, `status`, `type`, `expiring` 之多重篩選情境下均正確產生 `detailHref`。
   - 驗證點擊詳情後解析 `returnTo` 可 100% 完整還原原過濾條件，不依賴手動輸入 URL。
   - 驗證由直接 URL 篩選參數進入時，仍能自動組出相應返回路徑；空參數時安全退回 `/contracts`。
   - 驗證跨站惡意 URL（如 `https://evil.com` 或 `javascript:`）被嚴格攔截並安全降級回 `/contracts`。
3. **N14 / C134 營運條款真值呈現與三大狀態嚴格劃分**：
   - `contract-demo-001` (`standard_taxi`)：
     - 修改時窗：狀態為 `not_applicable`，值為 `null`，無虛構時窗數字。
     - 憑證要求：狀態為 `not_applicable`，值為 `null`，無虛構簽核存證。
     - 等候規則：狀態為 `available`，真值為 5 分鐘免費等候，逾時每 3 分鐘計費。
     - No-show 規則：狀態為 `available`，真值為 10 分鐘判定且免收費用。
     - SLA 設定檔：狀態為 `available`，設定檔為 `sla_standard_taxi_taichung-port`（目標響應 10m，到位時窗 15m）。
     - 生效版本：狀態為 `available`，版本標籤 `v1.0`，版本序號 1。
     - 授權模式：狀態為 `missing_data`，明確顯示缺資料而非偽裝成已驗證。
   - `contract-demo-004` (`business_dispatch`)：
     - 修改時窗：狀態為 `available`，出車前 30 分鐘截止（前置 120 分鐘）。
     - 憑證要求：狀態為 `available`，包含照片與行程確認，需司機簽名與允許數位存證。
     - 等候規則：狀態為 `available`，等候寬限 15 分鐘，逾時每 5 分鐘計費。
     - No-show 規則：狀態為 `available`，20 分鐘判定且收取費用。
     - SLA 設定檔：狀態為 `available`，設定檔為 `sla_enterprise_taichung-port`。
   - `contract-av-demo-001` (AV 自動駕駛商務派單)：
     - 修改時窗：狀態為 `available`，包含 AV 專屬任務描述。
     - 憑證要求：狀態為 `available`，包含遙測日誌與鏡頭快照，免簽名（AV 無司機簽署）。
     - 等候規則：寬限 10 分鐘；No-show 15 分鐘收取費用。
   - 關聯夥伴渠道（Tenant Partner Authority）：
     - 驗證經由 `partner-bank-demo-001` 關聯之合約取得真授權模式（`partner_api_key` / `bank_card_inline`）與專屬時窗。
4. **唯讀邊界與跨 App 治理轉向**：
   - 驗證 ops scope 僅提供唯讀鏡像，不包含任何 mutation 函式或編輯入口。
   - 驗證夥伴方案合約與車輛合約分別正確路由至 Platform Admin 夥伴治理（`/partners?partnerId=...`）與車隊治理（`/fleet?vehicleId=...`），並標註 `openMode: "new_tab"`。
5. **租戶、夥伴與範疇跨界隔離防護**：
   - 驗證跨範圍存取一律回傳 403 `CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN`，杜絕跨 scope 合約資料洩漏。

---

## 4. 變更範圍守護 (Write Scopes Compliance)

本任務嚴格限制在指定的 3 個 `write_scopes` 範圍內進行修改與新增：

1. `apps/ops-console-web/app/contracts/`
   - `page.tsx`：清除 `contract_detail_pending`，啟用 `open_contract_detail`，在合約列中建構保留篩選的 `detailHref`。
   - `contracts-tables.tsx`：擴充 `ContractRow` 型別包含 `detailHref`，合約 ID 與操作欄詳情按鈕均以 `theme.accent` 樣式連結至對應詳情。
   - `[contractId]/page.tsx`：接收 `searchParams` 並計算 `backHref`；非同步載入 `ContractOperationalViewRecord`；以 `Card` 與 `DL` 完整投影 7 項營運條款，落實三態標記；時間軸呈現版本節點；提供治理轉向至 Platform Admin。
2. `tests/unit/system-remediation/sr-ops-contract-001/`
   - `sr-ops-contract-001.test.ts`：12 項完整涵蓋導航、篩選返回、三態條款、AV 特例、夥伴授權與唯讀隔離之單元測試。
3. `docs/04-uat/system-remediation-20260906/SR-OPS-CONTRACT-001.md`
   - 本驗證執行紀錄與追溯證據文件。

---

## 5. 驗證界線與非即時排除聲明 (Boundaries & Non-Live Exclusions)

依據系統補救與安全治理規範，本任務具備明確邊界限制，以下項目明示排除於本任務之外，不冒稱已完成實機驗收：

- **VM 限制遵守**：未啟動任何產品開發伺服器 (`pnpm dev`)、端對端瀏覽器測試伺服器 (`playwright test` / `pnpm exec playwright`) 或 Docker Compose 容器基礎設施。
- **無實體車載硬體或 OBD/CAN 遙測連線**：AV 自動駕駛之遙測存證與相機快照為投影契約與驗證資料結構，未連線至真實自駕車輛車載端點。
- **無生產資料庫 DDL 異動**：本任務為前端接線與唯讀投影呈現，沿用既有權威資料結構，未執行未核定之 SQL Migration。
- **合約異動流程由 Platform Admin 專責**：合約建立、條款修訂、終止流程屬於管理員治理權限，本任務維持 Ops Console 唯讀鏡像規範，不侵入寫入流程。
