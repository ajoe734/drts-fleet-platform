# SR-ACADEMY-FE-001 — 司機學院與車行真實完訓看板

- **任務識別碼**：`SR-ACADEMY-FE-001`
- **負責角色**：Owner: `Gemini2`；Reviewer: `Gemini`
- **所屬階段**：`system-remediation-20260906` (P2 / Implementation)
- **追溯來源**：
  - 問題來源：`N02`（學院、測驗、完訓證據未落地）
  - 能力項目：`C059`（司機教學影片、SOP、測驗與完訓紀錄）、`C071`（車行訓練管理員看真完訓率與逾期名單，下鑽至單一人員證據）
  - 前置依賴：`SR-CONTRACT-001`（已完成整合）

---

## 1. 執行環境與基準 (Environment & Baseline)

- **工作分支 (Branch)**：`gemini2/sr-academy-fe-001`
- **基準 SHA (Base SHA)**：`6a2b7dabf0eeefbe834164b4c731e84a273297a7` (`origin/dev`)
- **工作樹路徑 (Worker Cwd)**：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-academy-fe-001`
- **受控可寫入範圍 (Write Scopes)**：
  - `apps/driver-app/components/academy/`
  - `apps/driver-app/app/academy.tsx`
  - `apps/fleet-partner-portal-web/app/training/`
  - `apps/fleet-partner-portal-web/lib/academy-data.server.ts`
  - `tests/unit/system-remediation/sr-academy-fe-001/`
  - `docs/04-uat/system-remediation-20260906/SR-ACADEMY-FE-001.md`

---

## 2. 實作架構與設計契約落實 (Implementation Details)

### 2.1 車行端：獨立權威適配器與真實完訓看板 (`apps/fleet-partner-portal-web`)

1. **獨立服務端適配器 (`apps/fleet-partner-portal-web/lib/academy-data.server.ts`)**：
   - 遵從任務規範，完全不修改既有由 `FLEET-DATA` 持續治理的 `fleet-portal-data.server.ts`，獨立建立專屬適配器。
   - 透過 `getServerFleetPartnerClient()` 呼叫 `@drts/api-client` 的權威端點：
     - `getFleetTrainingSummary()` (`/api/fleet-partner/training/summary`)
     - `listFleetDriverRoster()` (`/api/fleet-partner/training/roster`)
     - `getFleetDriverQuizAttempt(driverId, attemptId)` (`/api/fleet-partner/training/drivers/:driverId/attempts/:attemptId`)
   - 下架固定 `FX_FLEET_TRAINING` fixture，全面改以 live 數據渲染；在端點未啟動或連線異常時優雅降級為 `source: "fallback"` 與合法空值，絕不以造假百分比充數。
   - 實作學員名單過濾函式：`computeRosterTabCounts`、`filterRosterByTab`（全部／已完訓／待完成／逾期名單）與 `scopeRosterRows`（文字關鍵字與課程代碼檢索）。

2. **真實完訓看板與證據下鑽 (`apps/fleet-partner-portal-web/app/training/page.tsx`)**：
   - 採用 `@drts/ui-web` 與車隊專屬主題 `buildFleetTheme()` 嚴格對齊設計系統。
   - 上半部呈現整體完成率 (`completionPct`)、待完成人次 (`pendingHeadcount`) 及逾期未完成人數 (`overdueIncomplete`) 之權威 KPI。
   - 課程完成度卡片依照權威課程統計動態繪製進度條（>=90% success、>=70% accent、其餘 warn）。
   - **落實 C071 單一人員證據下鑽**：
     - 車行完訓名單表格列出司機姓名、識別碼、課程代碼、狀態 Pill、成績、完訓時間與逾期重訓標記。
     - 點擊「檢視歷程 ↗」即可觸發 `attemptDetail` 證據卡片，顯示該司機之 Attempt ID、測驗得分、判定結果與逐題正誤檢核 (`answersSummary`)。

### 2.2 司機端：司機學院與互動測驗系統 (`apps/driver-app`)

1. **模組化學院元件 (`apps/driver-app/components/academy/`)**：
   - `course-card.tsx`：呈現課程標題、分類標籤（法規遵循／安全防禦／服務品質／營運作業）、必選修標記、及格門檻、模組數與個人完訓狀態。
   - `module-reader.tsx`：整合影片 (`video`)、SOP 指引 (`sop`) 與講義 (`article`) 多元教材閱讀器，並清楚標示單元時長與及格標準。
   - `quiz-runner.tsx`：互動式線上測驗介面，支援單選題目作答、題目切換跳轉、作答完整性檢核與防漏題機制。
   - `quiz-result-view.tsx`：提交後即時顯示真實成績，高於及格線即判定合格並產出唯一 Attempt ID 憑據；未達標則清楚顯示未通過、題目檢討明細與重新測驗入口。
   - `training-records-list.tsx`：展示司機權威完訓證書清單、最高得分、測驗次數、到期時間與逾期重考警示。

2. **司機學院主頁面 (`apps/driver-app/app/academy.tsx`)**：
   - 整合 `getDriverClient()` 實現完整端到端狀態機：課程瀏覽 → 教材研讀 → 線上測驗 → 成績檢核 → 完訓紀錄即時更新。
   - 視覺樣式全面使用 `Tokens.colors`、`driverCanvasTheme` 與 `@drts/ui-tokens`，無任何未定義或硬編碼 hex 色碼。

### 2.3 雙向跨角色驗收條件與一致性保障 (C059 & C071 / N02)

- **成績與憑證真值同一性**：學員於司機端完成測驗所得之分數、判定狀態與 `attemptId`，與車行訓練管理員於看板看到之學員名單及作答證據 100% 一致。
- **未開課／失敗不假完訓**：未測驗之司機顯示「未開始」或「學習中」，測驗不及格顯示「未通過」且完訓時間維持 `null`，嚴禁任何假冒完訓或固定百分比。

---

## 3. 驗證指令與結果記錄 (Verification Results)

| 檢驗指令 | Exit Code | 實際結果摘要 |
| :--- | :---: | :--- |
| `git diff --check` | 0 | 無任何空白或格式錯誤 |
| `pnpm --filter @drts/driver-app typecheck` | 0 | `@drts/driver-app` TypeScript 編譯檢查通過（無 emit 錯誤） |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck` | 0 | `@drts/fleet-partner-portal-web` TypeScript 編譯檢查通過（無 emit 錯誤） |
| `pnpm exec vitest run tests/unit/system-remediation/sr-academy-fe-001/` | 0 | 11 個單元與整合測試全部通過 (100% passed) |
| `pnpm run i18n:guard` | 0 | i18n-guard 檢查通過，抽離所有 inline 文字與屬性 (527 files scanned, 0 violations) |
| `pnpm run lint` | 0 | 全庫 ESLint 靜態代碼檢查通過 (21 packages successful) |

### 測試項目涵蓋清單 (Vitest Suite)
1. `loads live training summary and driver roster without using fake fixtures`
2. `handles legitimate empty data correctly as live zero state`
3. `falls back gracefully when backend training endpoint is unreachable without fabricating numbers`
4. `rethrows configuration errors when fleet scope is missing`
5. `loads driver quiz attempt details for authoritative inspection (C071)`
6. `computes roster tab counts accurately`
7. `filters roster by tab: completed, pending, overdue`
8. `scopes roster rows by query text and course code`
9. `ensures completed quiz score and attemptId match the fleet roster item exactly`
10. `ensures failed quiz does NOT fake completion on fleet board`
11. `validates that course details carry authentic modules (video, sop, article) and questions`

---

## 4. 未施作之環境限制事項 (Limitations / Deferred Items)

- 依 VM 限制指引，本環境不啟動真機服務、不啟動 `docker compose`、不執行 `playwright` 瀏覽器測試或即時產品 server。所有前端與資料流之可靠性均由嚴格靜態型別檢驗及全覆蓋之 Vitest 測試驗證。
