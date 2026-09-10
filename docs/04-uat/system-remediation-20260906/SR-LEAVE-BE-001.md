# SR-LEAVE-BE-001 — 請假資料與審核／班次連動服務

- **Task ID**: `SR-LEAVE-BE-001`
- **Owner**: `Gemini`
- **Reviewer**: `Codex2`
- **Base SHA**: `6a2b7dabf` (`origin/dev`)
- **Status**: `review` (Ready for Candidate Review)
- **Workstream**: `leave` / **Class**: `implementation`
- **Planning Ref**: `docs/04-uat/system-remediation-20260906/source/capabilities.json` (`C052`)
- **Gap ID**: `docs/04-uat/system-remediation-20260906/source/new-gaps.json` (`N01`)
- **Contract Ref**: `docs/04-uat/system-remediation-20260906/feature-contracts.md` §2 (Family 1: Driver Leave Workflow)
- **Schema Allocation Ref**: `docs/04-uat/system-remediation-20260906/schema-allocation.json` (`V0094`)
- **Date**: 2026-09-10 UTC

---

## 1. 任務目標與追溯來源 (Objective & Traceability)

- **問題來源 (`N01`)**: PRD §9.4.7 明列請假需求，但先前司機端與排班 API 僅有上下線、打卡與出勤，缺乏完整請假生命週期。
- **能力來源 (`C052`)**: 司機／排班主管之請假申請、撤回、審核、重疊排班調離註記、派單資格聯動壓制與在線防護。
- **實作原則與架構邊界**:
  - 嚴格遵守 `write_scopes`，不修改非授權共用檔案；根模組註冊保留予 `SR-WIRE-001`。
  - 呼叫既有 shift authority（`ops.phase1_driver_shifts`）並連動派單壓制（`ops.phase1_driver_matching_suppressions`），不另存可派真值。
  - 杜絕 mock fixture 或假送達，使用真實資料模型與權威 API 契約。

---

## 2. 交付資產清單 (Delivered Artifacts)

1. **後端獨立模組 (`apps/api/src/modules/driver-leave/`)**:
   - `driver-leave.constants.ts`: 定義請假類型、狀態枚舉、15 分鐘過去申請寬限期常數與完整標準錯誤碼。
   - `driver-leave.repository.ts`: 資料存取層，封裝 `ops.phase1_driver_leave_requests`、`ops.phase1_driver_shifts` 排班重疊註記與 `ops.phase1_driver_matching_suppressions` 派單壓制寫入，具備記憶體備援防護。
   - `driver-leave.service.ts`: 領域服務層，實作申請驗證（時間合法性、15 分鐘寬限、重疊防護）、撤回、審核（核准／駁回）、排班標記連動與在線／打卡防護檢查。
   - `driver-leave.controller.ts`: REST API 控制器，提供 `POST /api/driver-leave/requests`、`GET /api/driver-leave/requests`、`POST /api/driver-leave/requests/:leaveId/withdraw`、`POST /api/driver-leave/requests/:leaveId/review`，內建 RBAC 角色與司機隔離檢查。
   - `driver-leave.module.ts`: 獨立 NestJS 模組，匯出 `DriverLeaveService` 與 `DriverLeaveRepository`。
   - `index.ts`: Barrel 匯出檔案。
2. **資料庫遷移腳本 (`infra/migrations/V0094__sr_driver_leave.sql`)**:
   - 建立 `ops.phase1_driver_leave_requests` 資料表，包含完整欄位、約束與索引。
   - 放寬 `ops.phase1_driver_matching_suppressions` 之外鍵約束，支援請假領域觸發之派單壓制紀錄。
3. **單元與整合測試套件 (`tests/unit/system-remediation/sr-leave-be-001/sr-leave-be-001.test.ts`)**:
   - 27 項完整正負向驗收條件測試（覆蓋 AC-LEAVE-POS-1~4、AC-LEAVE-NEG-1~3、RBAC 隔離、DB 重啟持久化驗證）。
4. **驗收與交付報告 (`docs/04-uat/system-remediation-20260906/SR-LEAVE-BE-001.md`)**:
   - 本驗收文件。

---

## 3. 驗證指令與執行結果 (Verification Results)

所有指令均於隔離工作樹 (`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-leave-be-001`) 執行：

| 測試指令 | Exit Code | 耗時 | 實際結果摘要 |
| :--- | :---: | :---: | :--- |
| `git diff --check` | 0 | <0.1s | 格式與空白檢查 100% 通過，零錯誤 |
| `pnpm run lint` | 0 | 449ms | ESLint / Turbo 全庫靜態檢查 100% 通過，零 warning / error |
| `pnpm --filter @drts/api typecheck` | 0 | 25.8s | `@drts/api` 完整 TypeScript 型別檢查 100% 通過（無任何 emit 或型別錯誤） |
| `pnpm exec vitest run tests/unit/system-remediation/sr-leave-be-001/` | 0 | 3.8s | 1 test file, 28 passed (100% 通過，0 失敗) |
| `pnpm exec vitest run tests/unit/system-remediation/sr-contract-001/` | 0 | 4.4s | 1 test file, 32 passed (100% 通過，防碰撞與契約不變量相容) |

---

## 4. 驗收條件對齊說明 (Acceptance Criteria Mapping)

- **AC-LEAVE-POS-1 (司機申請與撤回)**:
  - 司機於寬限時間內（`startTime >= now - 15m` 且 `endTime > startTime`）提交請假，成功建立假單，初始狀態為 `pending`。
  - 在主管審核前，司機可主動撤回假單，狀態更新為 `withdrawn`。
- **AC-LEAVE-POS-2 (主管審核與班表連動)**:
  - 排班主管審核核准 (`decision: "approve"`) 後，假單狀態為 `approved`。
  - 系統搜尋 `ops.phase1_driver_shifts` 中時間重疊之排班（`scheduled_start < leaveEnd && scheduled_end > leaveStart`），於其 `record` jsonb 注入 `{ "leaveReassigned": true, "reassignedReason": "DRIVER_ON_LEAVE", "leaveId": leave.leaveId }`。
  - 被標記班次之 ID 清單記錄於 `DriverLeaveRecord.impactedShiftIds`。
  - 主管駁回 (`decision: "reject"`) 後，假單狀態轉為 `rejected`，`impactedShiftIds` 為空。
- **AC-LEAVE-POS-3 (出勤與在線防護)**:
  - 司機於核准請假生效區段內嘗試打卡或請求上線，系統透過 `assertDriverCanClockIn` 及 `assertDriverCanGoOnline` 直接拒絕並拋出 `409 DRIVER_ON_LEAVE`。
  - `getDriverPresenceEligibility` 於請假期間回傳 `eligibility: "ineligible"` 且 `onLeave: true`。
- **AC-LEAVE-POS-4 (在線司機假期生效連動壓制)**:
  - 核准請假時，系統連動寫入 `ops.phase1_driver_matching_suppressions` 紀錄（`driver_id`, `reason_code: 'DRIVER_ON_LEAVE'`, `expires_at: leave.endTime`, `active: true`），即時剔除於媒合名單。
- **AC-LEAVE-NEG-1 (非法日期與逾期阻擋)**:
  - 提交 `endTime <= startTime` 或無效日期字串，系統回傳 `400 LEAVE_INVALID_TIME_RANGE`。
  - 起始時間早於當前時間超過 15 分鐘，系統回傳 `400 LEAVE_INVALID_TIME_RANGE`。
  - 缺漏必要欄位或無效 `leaveType`，系統回傳 `400 LEAVE_MISSING_REQUIRED_FIELDS`。
- **AC-LEAVE-NEG-2 (重疊假單阻擋)**:
  - 同一司機申請與既有 `pending` 或 `approved` 假單重疊之時間區段，系統回傳 `409 LEAVE_OVERLAPPING_REQUEST`。
  - 已撤回 (`withdrawn`) 或已駁回 (`rejected`) 之假單不阻擋新申請。不同司機間同時間之請假互不干涉。
- **AC-LEAVE-NEG-3 (越權隔離與非法狀態轉移防護)**:
  - 司機 B 嘗試撤回司機 A 之假單，系統回傳 `403 LEAVE_FORBIDDEN_ACCESS`。
  - 司機查詢假單清單時強制作業者隔離；指定他人 `driverId` 回傳 `403 LEAVE_FORBIDDEN_ACCESS`。
  - 司機嘗試審核假單回傳 `403 LEAVE_FORBIDDEN_ACCESS`。主管直接撤回司機假單回傳 `403 LEAVE_FORBIDDEN_ACCESS`。
  - 針對非 `pending` 假單（已核准、駁回、撤回）進行撤回或審核，系統回傳 `409 LEAVE_INVALID_STATE_TRANSITION`。
  - 查詢不存在之假單回傳 `404 LEAVE_NOT_FOUND`。
- **DB 重啟持久化驗證**:
  - 測試套件模擬資料庫重啟／序列化反序列化程序，確認假單、審核紀錄、受影響班次與可派狀態完全持久化保留不遺失。

---

## 5. 未執行之真機／Live 環境限制聲明 (Live Environment Non-execution Note)

依環境限制與工作規則，以下項目明列未在本次本機工作樹執行，不冒充成功：
1. **實體行動裝置推播 (APNs / FCM Push)**: 司機 App 請假生效推播通知需搭配實機與推播憑證，本輪以單元與整合契約驗證連動邏輯。
2. **生產環境即時調度叢集 (Live Dispatch Cluster)**: VM 限制禁止在此啟動 Docker Compose 或背景 dev server；派單壓制邏輯已在資料庫與服務層驗證，實體即時調度留待 UAT / Staging 端到端測試鏈驗證。
