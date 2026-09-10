# SR-LEAVE-BE-001 — 請假資料與審核／班次連動服務

- **Task ID**: `SR-LEAVE-BE-001`
- **Owner**: `Claude2`（接續自 `Gemini2`；原 Gemini/Gemini2 lane 於 2026-09-10 13:04 UTC 因 `RESOURCE_EXHAUSTED (429)` quota 暫停，實際 worker PID 已無存活程序，詳 `.local/worker-recovery-20260910/agy-quota-1302.json`）
- **Reviewer**: `Claude`
- **Prior Candidate SHA**: `d888e0deca3673ac1abe9b7164714bfeadb1caa9`（分支 `gemini2/sr-leave-be-001`，PR #1910，CI failure）
- **Continuation Base SHA**: `5e16d6ab7db121ba2f4bf0259f3541e32cd46dcf` (`origin/dev`)
- **Status**: `in_progress` → 待 handoff review
- **Workstream**: `leave` / **Class**: `implementation`
- **Planning Ref**: `docs/04-uat/system-remediation-20260906/source/capabilities.json` (`C052`)
- **Gap ID**: `docs/04-uat/system-remediation-20260906/source/new-gaps.json` (`N01`)
- **Contract Ref**: `docs/04-uat/system-remediation-20260906/feature-contracts.md` §2 (Family 1: Driver Leave Workflow)
- **Schema Allocation Ref**: `docs/04-uat/system-remediation-20260906/schema-allocation.json` (`V0094`)
- **Regression Evidence Ref**: `.local/worker-recovery-20260910/leave-independent-regression.json`, `.local/worker-recovery-20260910/leave-create-overlap-race.json`
- **Date**: 2026-09-10 UTC

### 接續說明 (Continuation Note)

本任務由 Claude2 於 `claude2/sr-leave-be-001`（base `origin/dev` @ `5e16d6ab7`）接續。既有實作以 `git checkout <candidate_sha> -- <path>` 方式自 `gemini2/sr-leave-be-001` @ `d888e0dec`（write_scopes 內 11 個檔案，無衝突）搬移進本分支，保留既有修復與歷史，不重做已完成部分。搬移後複驗：
- `driver-leave.repository.ts` 的 `createLeaveWithOverlapCheck`（交易鎖 + 排除約束）與 `reviewLeave` / `withdrawLeave` 同步 CAS 轉態，已解決 `leave-independent-regression.json` 與 `leave-create-overlap-race.json` 兩項獨立回歸（原始失敗證據見該二檔；本分支重跑同測試已 100% 通過，見下方第 3 節）。
- 發現候選 SHA 遺留一個未完成缺陷：`DriverLeaveController.createDriverLeave` 僅宣告 `@Headers("idempotency-key")` 但未實際使用，導致 `@typescript-eslint/no-unused-vars` lint 失敗。已比對既有平台慣例（`ComplaintController` 等 18+ 個 create-type 端點）補齊真正的 `IdempotencyService.execute()` 交易語意冪等防重（scope: `driver:<driverId>:leave_request_create`），並同步更新 `tests/unit/system-remediation/sr-leave-be-001/sr-leave-be-001.test.ts` 的呼叫端與建構子注入。此為 write_scopes 內檔案變更；未修改 `tests/security/idempotency-regression-guard.test.ts` 之允許清單（該檔非 write_scopes，且本次修正後不需要新增例外）。

---

## 1. 任務目標與追溯來源 (Objective & Traceability)

- **問題來源 (`N01`)**: PRD §9.4.7 明列請假需求，先前司機端與排班 API 僅有上下線、打卡與出勤，缺乏完整請假生命週期。
- **能力來源 (`C052`)**: 司機／排班主管之請假申請、撤回、審核、重疊排班調離註記、派單資格聯動壓制與在線防護。
- **Supervisor 獨立回歸修正 (`leave-independent-regression.json`)**:
  1. **Fail-Closed DB Persistence**: 當 `DatabaseService.isEnabled()` 為 true 時，任何資料庫寫入或查詢失敗均直接拋出例外（Fail-Closed），不得以 logger 吞吐例外並假冒成功，記憶體備援僅在 DB disabled 時生效。
   2. **Shared Atomic Transaction / CAS Concurrency**: 審核 (`approve` / `reject`) 與撤回 (`withdraw`) 之間可能存在平行併發請求；系統於資料庫層使用交易鎖（`SELECT ... FOR UPDATE`）及 CAS（`UPDATE ... WHERE leave_id = $1 AND status = 'pending'`），並在同一筆交易中連動標記 `ops.phase1_driver_shifts` 與寫入 `ops.phase1_driver_matching_suppressions`；在記憶體備援模式下亦即時原子更新狀態，確保重疊審核與撤回時「恰好僅有一個成功，另一者衝突拒絕（409 LEAVE_INVALID_STATE_TRANSITION）」，杜絕雙重轉態或覆蓋狀態。
   3. **Idempotency Regression Guard Alignment**: `DriverLeaveController.createDriverLeave` 注入 `IdempotencyService` 並以 `idempotencyService.execute({ scope: "driver:<driverId>:leave_request_create", idempotencyKey, ... })` 包裹建立指令（比照 `ComplaintController` 等既有平台慣例），非僅宣告未使用之 header 參數；杜絕未保護變更（unprotected_mutation），100% 通過 `tests/security/idempotency-regression-guard.test.ts`。
   4. **Concurrent Creation Overlap Prevention (`leave-create-overlap-race.json`)**: 修正先查後存（check-then-save）之間隙缺陷。於 DB 模式下實施交易級司機排他鎖（`SELECT pg_advisory_xact_lock(hashtext('driver_leave:' || $1)::bigint)`），並於同一交易內原子執行重疊查詢與新增寫入，配合 V0094 之 `btree_gist` 排除條件約束（`EXCLUDE USING gist`）；於 DB disabled 記憶體備援模式下透過 `withMemoryDriverLock` 隊列原子檢查與寫入，確保平行提交之重疊假單「恰好一筆成功，另一筆衝突拒絕（409 LEAVE_OVERLAPPING_REQUEST）」，同時保留不同司機的平行獨立性與相鄰半開區間合法性。
- **實作原則與架構邊界**:
  - 嚴格遵守 `write_scopes`，不修改非授權共用檔案；根模組註冊保留予 `SR-WIRE-001`。
  - 呼叫既有 shift authority（`ops.phase1_driver_shifts`）並連動派單壓制（`ops.phase1_driver_matching_suppressions`），不另存可派真值。
  - 杜絕 mock fixture 或假送達，使用真實資料模型與權威 API 契約。

---

## 2. 交付資產清單 (Delivered Artifacts)

1. **後端獨立模組 (`apps/api/src/modules/driver-leave/`)**:
   - `driver-leave.constants.ts`: 定義請假類型、狀態枚舉、15 分鐘過去申請寬限期常數與完整標準錯誤碼。
   - `driver-leave.repository.ts`: 資料存取層，實作 Fail-Closed 資料庫存取、`withTransaction` 交易保護、CAS 狀態轉移、`createLeaveWithOverlapCheck` 交易內排他鎖與原子建立、`ops.phase1_driver_shifts` 排班重疊註記與 `ops.phase1_driver_matching_suppressions` 派單壓制原子寫入；具備僅於 DB disabled 時啟用的記憶體備援防護與司機鎖定隊列。
   - `driver-leave.service.ts`: 領域服務層，實作申請驗證（時間合法性、15 分鐘寬限、委派資料庫或儲存庫原子建立防止併發重疊）、撤回與審核委任呼叫、排班標記連動與在線／打卡防護檢查。
   - `driver-leave.controller.ts`: REST API 控制器，提供 `POST /api/driver-leave/requests`、`GET /api/driver-leave/requests`、`POST /api/driver-leave/requests/:leaveId/withdraw`、`POST /api/driver-leave/requests/:leaveId/review`，內建 RBAC 角色與司機隔離檢查，並支援 `idempotency-key` 防重保護。
   - `driver-leave.module.ts`: 獨立 NestJS 模組，匯出 `DriverLeaveService` 與 `DriverLeaveRepository`。
   - `index.ts`: Barrel 匯出檔案。
2. **資料庫遷移腳本 (`infra/migrations/V0094__sr_driver_leave.sql`)**:
   - 建立 `ops.phase1_driver_leave_requests` 資料表，包含完整欄位、約束與索引。
   - 新增 `btree_gist` 擴充套件與 `phase1_driver_leave_no_overlap` 排除條件約束（`EXCLUDE USING gist`），於資料庫層保證同一司機有效假單（pending/approved）時段不重疊。
   - 放寬 `ops.phase1_driver_matching_suppressions` 之外鍵約束，支援請假領域觸發之派單壓制紀錄。
3. **單元與整合測試套件 (`tests/unit/system-remediation/sr-leave-be-001/`)**:
   - `sr-leave-be-001.test.ts`: 28 項完整正負向驗收條件測試（覆蓋 AC-LEAVE-POS-1~4、AC-LEAVE-NEG-1~3、RBAC 隔離、DB 重啟持久化驗證）。
   - `supervisor-persistence-race.test.ts`: 4 項獨立驗收與併發測試，涵蓋 DB 寫入失敗 fail-closed 拒絕、審核／撤回重疊時恰有一者成功與一者衝突拒絕、DB 讀取失敗全盤 fail-closed、DB 交易異常自動 rollback。
   - `supervisor-create-overlap-race.test.ts`: 3 項獨立驗收與併發建立測試，涵蓋同一司機平行重疊申請恰有一者成功與一者衝突拒絕、不同司機平行申請互不干擾全數成功、相鄰半開時間區段平行申請正常通過。
4. **驗收與交付報告 (`docs/04-uat/system-remediation-20260906/SR-LEAVE-BE-001.md`)**:
   - 本驗收文件。

---

## 3. 驗證指令與執行結果 (Verification Results)

**候選 SHA `d888e0dec` 原始驗證**（於 `.../worktrees/auto/gemini2-sr-leave-be-001`，Gemini2 lane 執行，保留原始記錄）：

| 測試指令 | Exit Code | 耗時 | 實際結果摘要 |
| :--- | :---: | :---: | :--- |
| `git diff --check` | 0 | <0.1s | 格式與空白檢查 100% 通過，零錯誤 |
| `pnpm --filter @drts/api typecheck` | 0 | 11.2s | `@drts/api` 完整 TypeScript 型別檢查 100% 通過（無任何 emit 或型別錯誤） |
| `pnpm exec vitest run tests/unit/system-remediation/sr-leave-be-001/` | 0 | 4.7s | 3 test files, 35 passed (100% 通過，0 失敗) |
| `pnpm exec vitest run tests/security/iam-route-inventory.test.ts` | 0 | 2.1s | 1 test file, 10 passed (100% 通過，IAM route inventory 與 scope catalogue 完全相容) |
| `pnpm exec vitest run tests/security/idempotency-regression-guard.test.ts` | 0 | 1.4s | 1 test file, 5 passed（**注意**：此結果實為誤判，見下方 Claude2 複驗說明，實際 header 參數未使用，lint 會失敗） |
| `pnpm exec vitest run tests/unit/system-remediation/sr-contract-001/` | 0 | 1.8s | 1 test file, 32 passed (100% 通過，防碰撞與契約不變量相容) |

**Claude2 接續複驗**（於 `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude2-sr-leave-be-001`，branch `claude2/sr-leave-be-001`，base `origin/dev` @ `5e16d6ab7`，搬移候選檔案並修正 idempotency 缺陷後實際重跑）：

| 測試指令 | Exit Code | 實際結果摘要 |
| :--- | :---: | :--- |
| `git diff --check` | 0 | 格式與空白檢查 100% 通過，零錯誤 |
| `pnpm --filter @drts/contracts build` | 0 | 補建 `packages/contracts/dist`（`apps/api/tsconfig.json` 之 `@drts/contracts` path 指向 dist，非 src） |
| `pnpm --filter @drts/control-plane-auth build` | 0 | 同上，補建相依套件 dist |
| `pnpm --filter @drts/api typecheck` | 0 | `@drts/api` 完整 TypeScript 型別檢查 100% 通過，含新 `IdempotencyService` 注入 |
| `pnpm --filter @drts/api exec eslint src/modules/driver-leave/` | 0 | 零 lint 錯誤（修正候選 SHA 遺留的 `idempotencyKey` 未使用變數錯誤） |
| `pnpm exec vitest run tests/unit/system-remediation/sr-leave-be-001/` | 0 | 3 test files, 35 passed（100% 通過，含 `supervisor-persistence-race.test.ts` 與 `supervisor-create-overlap-race.test.ts` 兩項獨立回歸測試） |
| `pnpm exec vitest run tests/security/idempotency-regression-guard.test.ts` | 0 | 1 test file, 5 passed（實際以 `IdempotencyService.execute()` 呼叫驗證，非僅 header 宣告） |
| `pnpm exec vitest run tests/security/iam-route-inventory.test.ts` | 0 | 1 test file, 10 passed（IAM route inventory 與 scope catalogue 完全相容，未受本次 controller 簽章調整影響） |

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
- **併發與持久化不變式驗證 (Concurrency & Persistence Invariants)**:
  - 驗證當 DB 啟用且查詢失敗時，全盤 fail-closed 拋出例外，不承認儲存成功。
  - 驗證當主管核准與司機撤回同時發起時，原子鎖與 CAS 保證僅有恰好一筆交易轉態成功，另一筆獲得 `409 LEAVE_INVALID_STATE_TRANSITION` 拒絕。
  - 測試套件模擬資料庫重啟／跨執行個體反序列化程序，確認假單、審核紀錄、受影響班次與可派狀態完全持久化保留不遺失。

---

## 5. 未執行之真機／Live 環境限制聲明 (Live Environment Non-execution Note)

依環境限制與工作規則，以下項目明列未在本次本機工作樹執行，不冒充成功：
1. **實體行動裝置推播 (APNs / FCM Push)**: 司機 App 請假生效推播通知需搭配實機與推播憑證，本輪以單元與整合契約驗證連動邏輯。
2. **生產環境即時調度叢集 (Live Dispatch Cluster)**: VM 限制禁止在此啟動 Docker Compose 或背景 dev server；派單壓制邏輯已在資料庫與服務層驗證，實體即時調度留待 UAT / Staging 端到端測試鏈驗證。
3. **外部遠端資料庫驗收執行器 (Remote DB Runner)**: `required_acceptance` 中的 `leave_remote_postgres_transition_races` 與 `leave_remote_shift_authority_and_restart` 依編排規劃由獨立之 `SR-LEAVE-BE-001-ACCEPTANCE-RUNNER` 提供多執行個體真實 DB 重啟驗收，未在當前單機工作樹冒充完成。
