# Task Evidence Report: SR-DESIGN-001

## 1. 任務基本資訊 (Task Metadata)

- **Task ID**: `SR-DESIGN-001`
- **任務名稱**: 補齊請假／學院／Host的最小可實作契約
- **Owner**: `Gemini2`
- **Reviewer**: `Codex2`
- **工作類型**: `documentation`
- **優先級**: `P2`
- **Workstream**: `design`
- **狀態**: `in_progress` -> 待 commit, push, handoff 進入 `review`
- **Base SHA**: `afefd55d3d23dd361d2dd81fd5f80eedb6671002`
- **Previous Rejected Candidate SHA**: `769cb2231aae522b972211c521e4d696d266693f`
- **GitHub Pull Request**: `https://github.com/ajoe734/drts-fleet-platform/pull/1632`
- **Branch**: `gemini2/sr-design-001`
- **Worker Cwd**: `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-design-001`
- **Canonical Root**: `/home/lupin/drts-fleet-platform`

---

## 2. 追溯矩陣與範圍對齊 (Traceability Matrix)

| Gap ID | Capability ID | 角色 | 領域 | 規格依據 | 交付契約規範 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **N01** | **C052** | 司機／排班主管 | 請假工作流程 | PRD §9.4.7 Shift & Attendance | `docs/04-uat/system-remediation-20260906/feature-contracts.md` §2 |
| **N02** | **C059** | 司機 | 學院培訓與測驗 | PRD §9.4.9 Settings & Academy | `docs/04-uat/system-remediation-20260906/feature-contracts.md` §3 |
| **N02** | **C071** | 車行訓練管理員 | 車行完訓真值看板 | PRD §9.4.9 Settings & Academy | `docs/04-uat/system-remediation-20260906/feature-contracts.md` §3 |
| **N03** | **C012** | 車主 Host | 自車受限唯讀投影 | PRD §12.6 Host 自車四項權限 | `docs/04-uat/system-remediation-20260906/feature-contracts.md` §4 |

---

## 3. Codex2 審查意見逐項收斂與修正 (Review Findings Resolution)

針對 Codex2 於前次 candidate `769cb2231` 審查退回之 8 項意見，本次提交完成全面修正與收斂：

1. **[P1] 統一為權威 ApiSuccessEnvelope 規格**:
   - 全面替換 `docs/04-uat/system-remediation-20260906/feature-contracts.md` 中所有 JSON 範例，統一採用 `packages/contracts/src/index.ts:728-734` 與 `apps/api/src/common/api-envelope.ts:14-24` 之 `{ data, meta: { requestId, timestamp } }` 與清單結構 `{ items, pageInfo }`。
   - 於單元測試中加入 Schema Envelope 結構校驗測試，確保無頂層 `success` 混用。
2. **[P1] 對齊排班權威表與調離註記、收斂請假寬限邊界**:
   - 修正班表權威表為 `ops.phase1_driver_shifts`（`V0015__ops_driver_domains.sql:77-92`），對齊 `ShiftStatus` (`active`, `completed`, `abandoned`)。
   - 明訂班次重疊判定公式（`scheduled_start < leaveEnd && scheduled_end > leaveStart`），並於 `record` jsonb 中注入 `leaveReassigned: true`、`reassignedReason: "DRIVER_ON_LEAVE"`、`leaveId` 標籤，同步記錄於 `DriverLeaveRecord.impactedShiftIds`。
   - 收斂請假時間邊界：明訂常數 `MAX_PAST_APPLICATION_GRACE_MS = 15 * 60 * 1000` (15 分鐘)，允許 15 分鐘內之突發緊急請假，超過 15 分鐘前之過去申請一律回傳 `400 LEAVE_INVALID_TIME_RANGE`，消除正負 AC 衝突。
3. **[P1] 補齊平台在線 (Platform Presence) 與派單壓制連動**:
   - 定義請假期間呼叫 `POST /api/platform-presence/online` 將 `PlatformPresenceRecord.eligibility` 設為 `"ineligible"` 並回傳 `409 DRIVER_ON_LEAVE`。
   - 定義已在線司機進入請假生效時間時，由調度核心自動寫入 `ops.phase1_driver_matching_suppressions`（`V0015:108`），即時壓制派單媒合。
   - 補齊正向 AC-LEAVE-POS-3, AC-LEAVE-POS-4 與負向防護 AC。
4. **[P1] Host 資料源權威對齊、明列未知落點、收斂維保狀態**:
   - 廢除不存在之虛擬表，維保權威來源改為 `ops.phase1_maintenance_logs`（`V0015:53-71`），案件改為 `crm.phase1_complaint_cases`（`V0011:77-85`），司機收益改為 `ops.phase1_platform_earnings_ledger`（`V0018:5-20`）。
   - 維保狀態枚舉嚴格對齊 `packages/contracts/src/index.ts:6710-6716` 之 `MAINTENANCE_STATUSES`，納入 `"overdue"`。
   - 因現行 DB 尚無車主抽成分潤規則與合約拆帳率，`HostVehicleEarningsSummary` 中之 `fleetCommission` 與 `netEarnings` 明確標記為 `null`，`settlementStatus` 標為 `"pending_policy"`，作為 `SR-HOST-BE-001` 之決策落點，不虛構財務算法。
5. **[P1] 收斂 IAM 角色與 Scope 於既有 Catalog**:
   - 請假：司機使用 `driver_user` (`driver:read`, `driver:write`)；營運主管使用 `ops_user` (`driver:read`, `driver:write`, `dispatch:read`, `dispatch:write`)。
   - 學院：車行管理者使用 `tenant_ops_admin` (`reports:read`, `driver:read`)。
   - Host：使用 realm `partner`，身分對應 `individual_owner`，授權沿用既有 scopes `owned:read`, `reports:read`, `maintenance:read` 並以 Resource constraint `kind: "object"` (`reg.vehicles.owner_partner_id === identity.partnerId`) 約束。
   - 登入途徑：明確依循 Partner OIDC PKCE BFF 憑證登入取得包含 `partnerId` 之 Claim。
6. **[P2] 補齊司機完訓回讀 API、下鑽路由與題庫版本釘選**:
   - 新增司機完訓紀錄清單 `GET /api/driver-academy/records` 與單次作答證據 `GET /api/driver-academy/courses/:id/attempts/:attemptId`。
   - 新增車行端下鑽司機答題證據路由 `GET /api/fleet-partner/training/drivers/:driverId/attempts/:attemptId`。
   - 提交測驗指令新增 `courseVersion`，並明訂作答版本落後當前題庫時回傳 `409 COURSE_VERSION_STALE`，保障版本可追溯性。
7. **[P2] 多課程完訓指標收斂、監管資料庫與 trainingRequired 連動**:
   - 收斂車行完訓分母：以該車行有效司機總數 $N_{\text{total}}$ 為基準，單一司機必須通過**全部必修課程**方計為完訓，完訓率上限嚴格鎖定 100%，待完成人數非負。
   - 資料庫映射：通過測驗寫入 `reg.driver_training_records`（`V0004:108-118`），司機總體資格寫入 `reg.driver_reg_profiles.training_status`（`'pending' | 'passed' | 'expired' | 'waived'`）。
   - 派單資格連動：對齊 `runtime-eligibility-evaluator.service.ts:300`，當 `trainingRequired: true` 時，若司機 `training_status !== 'passed'` 則觸發 `softReasonCodes: ["DRIVER_TRAINING_INCOMPLETE"]` 並阻擋派車。
8. **[P2] 強化單元測試反例防護與有意義驗證**:
   - `isValidTimeRange`: 加入非日期字串校驗（`'not-a-date'` 正確回傳 `false`），強化嚴格小於與 15 分鐘寬限判定。
   - `gradeQuizSubmission`: 加入題號唯一性與完整性檢查，提交重複題號（如 5 次 `q1`）拋出 `QUIZ_INCOMPLETE_OR_DUPLICATE_SUBMISSION`，加入 `courseVersion` 檢查。
   - `computeFleetTrainingSummary`: 重寫為多課程聚合運算，單一司機完成 2 門課回傳 `100%`、`pendingHeadcount: "0"`，杜絕 200% 與負數異常。
   - 增加 `evaluateDriverTrainingEligibility` 驗證與 `trainingRequired` 派單阻擋。
   - 增加 `MAINTENANCE_STATUSES` 包含 `overdue` 驗證。

---

## 4. 交付 Artifacts 清單

本任務僅在授權之 `write_scopes` 內建立檔案，未變更任何非授權之中央設定檔：
1. `docs/04-uat/system-remediation-20260906/feature-contracts.md`:
   - 完整定義請假、學院、Host 三大家族契約。
   - 包含權威 Envelope、精確 IAM、資料源權威映射、狀態機、正負 AC 與決策落點。
2. `tests/unit/system-remediation/sr-design-001/sr-design-contracts.test.ts`:
   - 14 項單元測試，全面覆蓋時間有效性、重複作答防弊、多課程分母聚合、在線資格壓制、車主物主隔離與防枚舉、Envelope 結構。
3. `docs/04-uat/system-remediation-20260906/SR-DESIGN-001.md`:
   - 本任務之完整證據報告與審查收斂說明。

---

## 5. 下游 Migration 與任務對照 (Downstream Plan)

- **SR-LEAVE-BE-001**: 後端請假服務實作，分配 Migration `V0086__sr_driver_leave.sql`
- **SR-ACADEMY-BE-001**: 後端學院服務實作，分配 Migration `V0087__sr_driver_academy.sql`
- **SR-HOST-BE-001**: 後端 Host 投影服務實作，分配 Migration `V0088__sr_host_vehicle_access.sql`
- **SR-CONTRACT-001**: 集中導出型別至 `@drts/contracts`，註冊 `schema-allocation.json`
- **SR-WIRE-001**: 全域模組接線與 App 裝配

---

## 6. 驗證指令與結果記錄 (Verification Evidence)

### 6.1 git diff --check
- **Command**: `git diff --check`
- **Working Directory**: `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-design-001`
- **Exit Code**: `0`
- **Output**:
  ```text
  (clean, no trailing whitespace or merge conflict markers)
  ```

### 6.2 Vitest 契約不變式單元測試 (14 Tests Passed)
- **Command**: `npx vitest run tests/unit/system-remediation/sr-design-001/`
- **Working Directory**: `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-design-001`
- **Exit Code**: `0`
- **Output**:
  ```text
   RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-design-001

   Test Files  1 passed (1)
        Tests  14 passed (14)
     Start at  06:48:49
     Duration  748ms (transform 190ms, setup 0ms, import 249ms, tests 37ms, environment 1ms)
  ```

### 6.3 Canonical Consistency 規範一致性檢查
- **Command**: `python3 tools/ci/git/check_canonical_consistency.py --ci --base origin/dev --head HEAD`
- **Working Directory**: `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-design-001`
- **Exit Code**: `0`
- **Output**:
  ```text
  [consistency] l1-edit-authority: 0 finding(s)
  [consistency] cited-paths: 0 finding(s)
  [consistency] cited-decisions: 0 finding(s)
  [consistency] task-claims: 0 finding(s)
  [consistency] OK
  ```

---

## 7. 未執行的 Live / 真機項目說明 (Explicit Non-Live Exclusions & Resource Identifiers)

本任務性質為 `documentation` 與系統最小設計契約，為維持審查誠信，明確宣告以下項目未執行亦不冒充完成：
1. **實體行動裝置與真機硬體驗收**:
   - 未執行 iOS / Android 真機之通知權限授權、背景 GPS 輪詢、安全區 (SafeArea) 與軟體鍵盤避讓。
2. **外部郵件/通訊閘道傳輸**:
   - 未發送真實第三方 SMTP 郵件或 Twilio / SMS 驗證碼。
3. **車輛實體 OBD / CAN Bus 介接**:
   - 未連接實車硬體遙測或車載行車記錄器。
4. **真實環境資料庫 Migration 與 Live API 部署**:
   - `V0086__sr_driver_leave.sql`、`V0087__sr_driver_academy.sql`、`V0088__sr_host_vehicle_access.sql` 均規劃由下游後端任務建立並執行；本次未對實體 DB 執行 DDL 異動。
   - 前後端 NestJS 與 Next.js 之真實 HTTP controller 與畫面元件由下游 FE/BE 任務依本契約獨立實作。
