# SR-LEAVE-FE-001 — 司機與主管請假操作畫面：完成證據

- Task: `SR-LEAVE-FE-001`
- Owner: `Gemini2`
- Reviewer: `Claude`
- Planning Ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`（Gap `N01`、Capability `C052`）
- Base SHA (`origin/dev`): `6a2b7dabff3aba1777d3622700f4efd0a7626bad`
- Candidate SHA: 於 `handoff` 時以 `git rev-parse HEAD` 鎖定（見 task board 與 machine truth）
- Worktree: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-leave-fe-001`
- Branch: `gemini2/sr-leave-fe-001`

---

## 1. 問題根因與修復目標盤點（N01 / C052）

依據 2026-09-06 系統審計盤點（`capabilities.json`），Gap `N01`（Capability `C052`：司機與主管請假操作畫面）指出過去平台缺乏司機端與主管端完整的請假前端操作介面與契約連動：

1. **司機端（Driver App）缺口**：
   - 缺少專屬請假申請、列表、詳情與撤回頁面。
   - 未與後端權威 API 客戶端（`createDriverLeave`、`listDriverLeaves`、`withdrawDriverLeave`）連接。
   - 缺少時間合法性檢核：未考量「過去時間」之 15 分鐘寬限期（`MAX_PAST_APPLICATION_GRACE_MS`），未檢核起訖時間先後順序與同一司機既有假單重疊（`overlap`）。
   - 缺少伺服器錯誤狀態對齊（`409 LEAVE_OVERLAPPING_REQUEST`、`409 LEAVE_INVALID_STATE_TRANSITION`、`400 LEAVE_MISSING_REQUIRED_FIELDS`、`403 LEAVE_FORBIDDEN_ACCESS`、`404 LEAVE_NOT_FOUND`）。
   - 缺少行動裝置虛擬鍵盤與安全區域排版考量（`KeyboardAvoidingView` 與底欄安全間距）。

2. **主管端（Ops Console）缺口**：
   - 缺少多佇列分類檢視（`pending`、`approved`、`rejected`、`withdrawn`、`history`、`shift_impact`）。
   - 未實作核准（`approve`）與駁回（`reject`）決策動作，未支援選填之審核備註（`reviewNotes`）。
   - 缺少伺服器狀態衝突處理（409 衝突時拒絕 override / force-approve，提示重新讀取最新資料）。
   - 缺少班表連動與派單資格壓制可視化（展示受影響班次 `leaveReassigned` 標記與 `driver_matching_suppressions` 壓制）。

3. **UI Design Contract 與規範遵循**：
   - 司機端與主管端必須使用權威 `@drts/ui-tokens` 之 realm tokens（司機端使用 `driver.light` / `driver.dark`，主管端使用 `ops.light` / `ops.dark`；不可使用硬編碼之 raw hex 色彩調色盤）。
   - 時間呈現須統一採用 `Asia/Taipei`（UTC+8），並在介面上並列標記原始 UTC ISO 時間，消除時區認知落差。
   - 嚴格遵守 `i18n-guard` 與模組化架構，避免 inline JSX 文字違規。

---

## 2. 核心實作說明

### 2.1 司機端請假功能（`apps/driver-app/`）

- **路由入口（`apps/driver-app/app/leave.tsx`）**：
  - Expo Router 頁面，整合 `getDriverClient()` 與 `getDriverId()`。
  - 管理司機端檢視切換（`list` 列表、`new` 申請、`detail` 詳情、`conflict` 衝突卡片、`impact` 班次影響）。
  - 自動載入該司機假單，並處理建立假單（`createDriverLeave`）與撤回假單（`withdrawDriverLeave`）。

- **元件架構（`apps/driver-app/components/leave/`）**：
  1. `leave-tokens.ts`:
     - 整合 `@drts/ui-tokens` 之 `REALM_COLORS.driver`。
     - 定義假別中英對照（`LEAVE_TYPE_LABELS`）、狀態中英對照（`LEAVE_STATUS_LABELS`）。
     - 宣告權威時間規則：`MAX_PAST_APPLICATION_GRACE_MS = 15 * 60 * 1000`（過去 15 分鐘內仍允許送出申請，超過則拒絕）。
     - 實作時間驗證函式 `validateLeaveTimeRange` 與重疊檢查函式 `checkLeaveOverlap`。
     - 實作 Asia/Taipei（UTC+8）雙語格式化函式 `fmtTaipei` 與 `formatLeaveRangeZh`。
  2. `leave-chips.tsx`:
     - `LeaveTypeChip` 與 `LeaveStatusChip` 元件，套用 `@drts/ui-tokens` 語意色彩與 `Pill` 元件。
  3. `driver-leave-list.tsx` (`DRV_LeaveList`):
     - 呈現假單列表卡片，顯示假別、狀態 Chip、台北時段與 UTC ISO、事由摘要及班次連動標籤（`leaveReassigned`）。
     - 支援 Empty State、載入中與錯誤狀態重試按鈕。
     - 底部固定 CTA「申請請假」，符合行動裝置單手操作佈局。
  4. `driver-leave-form.tsx` (`DRV_LeaveForm`):
     - 假別 Segmented Selector（特休、事假、病假、喪假、緊急事假）。
     - 起始與結束時間選擇，即時顯示 Asia/Taipei 與 UTC 時間。
     - 15 分鐘過去時間寬限期提示橫幅（`Banner tone="info"`）。
     - 即時重疊警示橫幅（若與既有生效假單重疊立即提示）。
     - 多行事由輸入框（帶鍵盤聚焦光暈效果）。
     - 外層包覆 `KeyboardAvoidingView` 並於底部保留安全間距（`paddingBottom: 24`），防範鍵盤遮擋。
  5. `driver-leave-detail.tsx` (`DRV_LeaveDetail`):
     - 假單狀態頂部強調條（Pending: 暖黃、Approved: 綠、Rejected: 紅、Withdrawn: 灰）。
     - 審核歷程時間軸（申請送出、主管審核及 `reviewNotes`、司機撤回時間）。
     - 班次連動警示（核准後將自動標記調離與下線壓制）。
     - 待審核（`pending`）狀態提供「撤回假單」CTA，終態假單提供返回列表 CTA。
  6. `driver-leave-conflict.tsx` (`DRV_LeaveConflict` & `DRV_LeaveDispatchConflict`):
     - 409 狀態轉移衝突、409 重疊假單衝突、400 缺少欄位、403 跨司機權限阻擋、404 不存在等伺服器錯誤狀態卡片。
  7. `driver-leave-shift-impact.tsx` (`DRV_LeaveShiftImpact`):
     - 顯示請假期間重疊班次調離預覽，以及調度系統資格壓制（`DRIVER_ON_LEAVE`）說明。

### 2.2 主管端請假審核功能（`apps/ops-console-web/`）

- **頁面入口（`apps/ops-console-web/app/leave/page.tsx`）**：
  - Next.js 頁面，整合 `getOpsClient()` 與權威 `@drts/api-client`。
  - 提供 6 大分頁 Tabs：
    - `pending`: 待審核佇列（快速核准 / 駁回 / 詳情操作）。
    - `approved`: 已核准佇列。
    - `rejected`: 已駁回佇列。
    - `withdrawn`: 司機已撤回佇列。
    - `history`: 歷史稽核紀錄分頁（支援日期區間與決策狀態雙重篩選）。
    - `shift_impact`: 班表連動與派單資格壓制看板。
  - 假別篩選（全部、特休、病假、事假、喪假、緊急事假）與司機搜尋欄位。
  - 核准與駁回動作調用 `opsClient.reviewDriverLeave(leaveId, command)`，支援選填 `reviewNotes`。

- **元件架構（`apps/ops-console-web/app/leave/`）**：
  1. `leave-types.ts`:
     - 假別與狀態定義、`FX_OPS_LEAVE` 與 `FX_OPS_SHIFT_BOARD` 靜態 fallback 與測試資料。
  2. `leave-chips.tsx`:
     - 主管端專屬 `OpsLeaveTypeChip` 與 `OpsLeaveStatusChip`。
  3. `leave-detail-view.tsx` (`LeaveDetailView`):
     - 雙欄網格檢視：左側假單申請明細與 `reviewNotes` 輸入框；右側重疊班次預覽與 `leaveReassigned` 提示。
     - 底部提供核准與駁回按鈕，支援防連擊停用狀態。
  4. `leave-conflict-view.tsx` (`LeaveConflictView`):
     - 處理 409 伺服器衝突（雙重審核衝突 `LEAVE_INVALID_STATE_TRANSITION`、重疊衝突 `LEAVE_OVERLAPPING_REQUEST`）。
     - 明確宣告「無 override / force-approve 控制項」，提供「重新讀取最新狀態」按鈕。
  5. `leave-history-view.tsx` (`LeaveHistoryView`):
     - 歷史決策稽核資料表（包含結果、時段、審核人、審核時間、審核備註）。
     - 司機自行撤回項目顯示專屬標記。
  6. `leave-shift-impact-view.tsx` (`LeaveShiftImpactView`):
     - 班表連動狀態看板，使用 `Pill dot tone="driver"` 標示司機，展示 `leaveReassigned` 調離標記與 `ineligible` 壓制狀態。
  7. `translations.ts`:
     - 抽取主管端介面文案至專屬 `translations.ts`，確保完全符合全庫 `i18n-guard` 檢驗。

---

## 3. Write Scopes 遵循檢查

本任務嚴格僅限於指定的 5 處 write scope 範圍：
1. `apps/driver-app/components/leave/`（包含 7 個元件檔與 index.ts）
2. `apps/driver-app/app/leave.tsx`
3. `apps/ops-console-web/app/leave/`（包含 6 個元件/頁面檔與 translations.ts）
4. `tests/unit/system-remediation/sr-leave-fe-001/`（包含 sr-leave-fe-001.test.ts）
5. `docs/04-uat/system-remediation-20260906/SR-LEAVE-FE-001.md`

無任何越界修改共用套件、中央設定檔或非授權之 app 目錄。

---

## 4. 驗證指令與執行日誌（附 Exit Code）

### 4.1 Git Diff 格式檢查與空白守衛
```text
$ git diff --check
exit code: 0
```

### 4.2 司機端套件 Typecheck 檢查
```text
$ pnpm --filter @drts/driver-app typecheck

> @drts/driver-app@0.1.0 typecheck /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-leave-fe-001/apps/driver-app
> tsc --noEmit

exit code: 0
```

### 4.3 主管端套件 Typecheck 檢查
```text
$ pnpm --filter @drts/ops-console-web typecheck

> @drts/ops-console-web@0.1.0 typecheck /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-leave-fe-001/apps/ops-console-web
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully

exit code: 0
```

### 4.4 本次專屬迴歸單元測試（17/17 全部通過）
```text
$ pnpm exec vitest run tests/unit/system-remediation/sr-leave-fe-001/

 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-leave-fe-001

 Test Files  1 passed (1)
      Tests  17 passed (17)
   Start at  11:23:53
   Duration  830ms (transform 476ms, setup 0ms, import 608ms, tests 23ms, environment 0ms)

exit code: 0
```

涵蓋測試項目：
- Driver Realm Tokens 遵循（`REALM_COLORS.driver`、`#166534`、`#14532D`、`Pill tone="driver"`）。
- 假別中英標籤對齊契約（`annual`, `sick`, `personal`, `bereavement`, `emergency`）。
- 假單狀態對齊（`pending`, `approved`, `rejected`, `withdrawn`）。
- 過去時間驗證與 15 分鐘寬限期（未來有效、過去 5 分鐘在寬限內有效、過去 30 分鐘超期拒絕）。
- 結束時間早於起始時間主動拒絕。
- 假單重疊檢測（`checkLeaveOverlap`）。
- 時區格式化（Asia/Taipei UTC+8 與原始 UTC ISO 輸出）。
- Typed Driver API Client 整合（`createDriverLeave`, `listDriverLeaves`, `withdrawDriverLeave`）。
- Typed Ops API Client 整合（`listDriverLeaves`, `reviewDriverLeave`）。
- Ops 審核備註策略（`reviewNotes` 選填支援，非強制必填）。
- 伺服器衝突錯誤碼型別對齊（409, 400, 403, 404）。
- 終態假單唯讀行為。
- 班表連動與調離標記格式。
- 司機端與主管端假單資料結構交叉一致性。

### 4.5 i18n 守衛檢查（全庫 533 檔案掃描零違規）
```text
$ pnpm run i18n:guard

> drts-fleet-platform@0.1.0 i18n:guard /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-leave-fe-001
> node tools/ci/i18n-guard.mjs

i18n-guard: OK (533 files scanned across 10 apps, 55 exemption(s) from i18n-guard-baseline.json)

exit code: 0
```

### 4.6 UI Realm Token 守衛檢查
```text
$ python3 tools/ci/check_ui_realm_tokens.py --enforce
ui-realm-token guard: OK (2 canonical hexes; no off-token brand colors)

exit code: 0
```

### 4.7 全庫語法與代碼風格檢查（pnpm run lint）
```text
$ pnpm run lint
> drts-fleet-platform@0.1.0 lint /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-leave-fe-001
> pnpm lint:root && turbo run lint --concurrency=2

Tasks:    21 successful, 21 total
exit code: 0
```

---

## 5. 驗證界限與未施作部分說明（Explicit Limitations）

依據本次虛擬機與環境限制規範：
1. **無真機行動裝置/模擬器限制**：
   - 司機端 React Native 元件採用標準 Expo Router 語法與 `@drts/ui-tokens`，並使用 `KeyboardAvoidingView` 與底欄安全間距，但本次無法在物理行動裝置或真機模擬器進行手勢觸控與虛擬鍵盤彈出之即時畫面錄影與截圖。
2. **無即時產品伺服器與 Docker 限制**：
   - 依作業限制未啟動即時後端產品伺服器（product server）、Docker Compose 或資料庫服務。
   - 前端與 API Client 之整合透過嚴格型別定義（TypeScript `strict`）與 Vitest 單元測試進行隔離驗證。
3. **未執行瀏覽器自動化測試（Browser Test Runner）**：
   - 本次未啟動 Playwright / Cypress 等瀏覽器測試端點，由靜態型別與 Vitest 單元測試覆蓋核心邏輯。
   - Live API 資料庫持久化驗證留待全系統整合測試與 E2E 驗收階段完成。
