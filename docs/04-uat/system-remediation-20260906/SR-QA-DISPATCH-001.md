# SR-QA-DISPATCH-001 — 派車／改派／排班與自動超時驗收

- Task ID: `SR-QA-DISPATCH-001`
- Title: 派車／改派／排班與自動超時驗收
- Status: `in_progress` -> Ready for review handoff
- Owner: `Claude`
- Reviewer: `Gemini`
- Branch: `claude/sr-qa-dispatch-001`
- Base SHA: `b671bfc72e8a9d969fed1c872b80abc8842ed6f9` (`origin/dev`)
- Candidate SHA: recorded at handoff (see task-board `handoff` event); see §3.4 for the PR #1948 CI fail-closed fix applied on top of the prior candidate `d1ecc53022b8e40ccf6d0791c8d82903580bdbc1`
- Planning Ref: [`docs/04-uat/system-remediation-20260906/source/capabilities.json`](file:///home/lupin/workspace/drts-fleet-platform/docs/04-uat/system-remediation-20260906/source/capabilities.json) (`C035`, `C036`, `C037`, `C038`, `C039`, `C040`, `C041`, `C042`, `C048`, `C134`)
- Dependencies: `SR-UAT-HARNESS-001`, `SR-OPS-MAP-001`, `UV-EXEC-016`, `SR-OPS-CONTRACT-001`, `SR-OPS-SHELL-001` — all `done` as of task pickup.
- Worktree: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-qa-dispatch-001`

---

## 1. 基準重現與來源追溯

9/6 audit（`docs/04-uat/system-remediation-20260906/source/findings.json` / `capabilities.json`）是歷史觀察，非目前程式真值。本任務先重讀當前 `origin/dev`（`b671bfc72`）程式碼，重新核對每個能力目前的真實狀態，再決定要驗證既有功能還是回報缺口。

### 1.1 能力範圍與現況

| 能力 ID  | 領域       | 能力／應完成工作                   | 本任務判定                                                                                                                       |
| :------- | :--------- | :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------- |
| **C035** | 調度與營運 | 任務清單→詳情→候選車查詢           | 已實作（`OwnedMobilityService.listDispatchJobs/listDispatchCandidates`），驗證完成                                               |
| **C036** | 調度與營運 | 人工派車、改派、撤回及並發占用     | 已實作（`assignDispatch/reassignDispatch`），單一 order 流程驗證完成；跨 order 並發互斥已由 `SR-QA-CONCURRENCY-001` 驗證，不重複 |
| **C037** | 調度與營運 | 時間到自動釋放預約／提醒／升級     | **驗收缺口屬實**：狀態機與 API 存在，但沒有背景排程自動觸發（見 §4）                                                             |
| **C038** | 調度與營運 | 自動匹配、超時、無供給與恢復       | 狀態機與手動觸發 API 已驗證正確；**自動計時鏈路缺口屬實**（見 §4）                                                               |
| **C039** | 調度與營運 | 排班佇列 check-in／out、順序與例外 | 已實作（event-sourced，經 `dispatchTraceLogs` 重建），驗證完成                                                                   |
| **C040** | 調度與營運 | 可讀地圖、位置與車輛態勢           | 由 `SR-OPS-MAP-001`（`done`）修復，不在本任務 write_scopes 內重做                                                                |
| **C041** | 調度與營運 | presence 占用與回復可派狀態        | `platform-presence` 模組本身正確；**與派車候選完全未接線的缺口屬實**（見 §4）                                                    |
| **C042** | 調度與營運 | 出勤、營收、維保看板               | 由既有 ops 閱讀入口覆蓋，非本任務新增範圍                                                                                        |
| **C048** | 調度與營運 | 跨應用追查與助理工作協作           | 由 `SR-OPS-SHELL-001`（`done`，PR #1939）修復                                                                                    |
| **C134** | 調度與營運 | 合約詳情可進入並提供執行條款       | 由 `SR-OPS-CONTRACT-001`（`done`，PR #1938）修復                                                                                 |

C040/C042/C048/C134 已由其依賴任務修復並合併至 `origin/dev`；本任務不重做，也未在 write_scopes 外新增這些能力的測試檔案（write_scopes 僅含 `tests/unit/system-remediation/sr-qa-dispatch-001/`、`tests/e2e/system-remediation/sr-qa-dispatch-001/`、本文件）。

### 1.2 重用既有實作，不另造 matcher

依 Execution Prompt 要求「重用 UV-006/016 保留實作，不另造 matcher」：

- 所有測試呼叫真實 `OwnedMobilityService`（`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`，UV-EXEC-006/UV-EXEC-016 交付的同一個類別）與真實 `OwnedMobilityRepository`，不新增任何自製 matcher 或派車演算法。
- C036 的跨 order 並發互斥（同一車不能雙派）已由 `SR-QA-CONCURRENCY-001` 的 `dispatch-reservation-concurrency.test.ts` 以真實 PostgreSQL 驗證（`DispatchResourceReservationConflictError`、`uq_dispatch_resource_reservations_active`），本任務不重造，僅在文件中引用。

---

## 2. 測試分層與檔案

### Layer A — 真實 PostgreSQL write/read-back（`dispatch-db-persistence.test.ts`）

沿用 `SR-QA-CONCURRENCY-001` 已驗證的 bootstrap（schemas + `V0011__phase1_runtime_snapshots.sql` + `V0087__dispatch_resource_reservations.sql`，admin pool 建立隔離資料庫），直接呼叫 `OwnedMobilityRepository.persistChanges`/`.loadState()`（`OwnedMobilityService` 在 repository-backed 模式下使用的同一組方法），對 `ops.phase1_dispatch_jobs`、`ops.phase1_dispatch_attempts`、`ops.phase1_dispatch_assignments`、`ops.phase1_driver_tasks`、`ops.phase1_dispatch_trace_logs` 做真實 write-then-read 驗證：

1. Suite 1（Fail-Closed）：未設定 `DATABASE_URL`/`CONCURRENCY_TEST_DATABASE_URL`/`UV_BOOKING_TEST_DATABASE_URL` 時明確拋錯，不靜默略過。
2. C035/C036 Positive：dispatch job + attempt + assignment 寫入後，原始欄位（非僅 JSON blob）與 `loadState()` 重建結果皆正確。
3. C036 Positive：reassign 後，被取代的 assignment 讀回 `status='cancelled'`，新 assignment 讀回 `status='assigned'`。
4. C038 Positive：`dispatch.timeout` trace log 寫入後，`loadState()` 讀回的 `details.timeoutReasonCode`/`escalationAction` 正確。
5. C039 Positive：queue check-in/check-out 的 `queue.entry.created`/`queue.entry.closed` trace log 寫入後可讀回，兩筆事件皆存在。
6. C036/C038 Positive：driver task 寫入後，`order_id`/`dispatch_job_id`/`assignment_id`/`status` 關聯正確讀回。

**範圍說明**：`ops.phase1_owned_orders` 的完整寫入路徑因額外欄位（`runtime_profile_code` 等，由 V0011 之後的多支 migration 累加）超出本次可安全驗證的 migration 範圍，未在本層重做；訂單層級的行為改由 Layer B 的真實 in-memory 服務驗證（見下）。`dispatch_resource_reservations` 並發鎖已由 `SR-QA-CONCURRENCY-001` 驗證，不重複。

### Layer B — 真實 `OwnedMobilityService` 業務規則回歸（in-memory 持久層，可在本機立即執行）

- `dispatch-candidates-and-assignment.test.ts`（C035 + C036，8 cases）
- `dispatch-timeout-no-supply-scheduler-gap.test.ts`（C038 + C037 結構性缺口證據，10 cases）
- `dispatch-queue-checkin-checkout.test.ts`（C039，6 cases）
- `platform-presence-multiplatform-busy.test.ts`（C041，5 cases）

這些測試呼叫真實 `OwnedMobilityService`/`PlatformPresenceService` 類別（透過 `test-support.ts` 建構真實服務實例，僅將協作者以最小替身注入，不建構假的業務邏輯），持久層維持記憶體模式（未注入 repository），因此可在本 VM 立即執行並通過，作為「已有功能先驗」的可重跑證據；不作為真實 DB 的替代，僅作為 Layer A 之外的獨立業務規則回歸層。

### Layer C — Playwright E2E 證據殼層（`sr-qa-dispatch-001.spec.ts`）

沿用 `SR-UAT-HARNESS-001` 的 `UatEvidenceRecorder`/`UatNamespaceManager` 模式，記錄 C035/C036/C038/C039 的請求/回應契約與資源 ID 追蹤，並以 `recordLiveLimitation` 明確揭露：本 VM 不得啟動 API/dev server 或瀏覽器，未執行真實 live 呼叫；真正的功能證據是 Layer A/B。**未執行 `pnpm exec playwright test`**（VM 限制，見 §5）。

---

## 3. 實作驗證紀錄

### 3.1 驗證指令與結果

| 檢查項目                                                  | 執行指令                                                                                                                                                                                                                                                                                                                                                                                                    | Exit Code                            | 實際結果摘要                                                                                                                                                                                                                                                                                                                                                                                                                 |
| :-------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Git Diff 乾淨度**                                       | `git diff --check`                                                                                                                                                                                                                                                                                                                                                                                          | `0`                                  | 無空白/格式錯誤                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Contracts 建置**                                        | `pnpm --filter @drts/contracts build`                                                                                                                                                                                                                                                                                                                                                                       | `0`                                  | 成功                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **全庫型別檢查（root tsconfig，涵蓋 `tests/**`）\*\*      | `pnpm exec tsc --noEmit -p tsconfig.json`                                                                                                                                                                                                                                                                                                                                                                   | non-zero（既有、與本任務無關的錯誤） | 本任務新增的 5 個 unit 檔 + 1 個 e2e 檔在輸出中**零筆**錯誤；殘留錯誤均為既有檔案（`apps/fleet-partner-portal-web/**`、其他既有 `tests/unit/**` 檔案）與本 isolated worktree 特有的 `packages/api-client` 型別重複宣告問題，與本任務改動無關，未新增亦未修復（超出 write_scopes）                                                                                                                                            |
| **ESLint（本任務新增檔案）**                              | `pnpm exec eslint tests/unit/system-remediation/sr-qa-dispatch-001 tests/e2e/system-remediation/sr-qa-dispatch-001 --max-warnings=0`                                                                                                                                                                                                                                                                        | `0`                                  | 0 errors, 0 warnings                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Prettier（本任務新增檔案）**                            | `pnpm exec prettier --check tests/unit/system-remediation/sr-qa-dispatch-001 tests/e2e/system-remediation/sr-qa-dispatch-001`                                                                                                                                                                                                                                                                               | `0`                                  | All matched files use Prettier code style                                                                                                                                                                                                                                                                                                                                                                                    |
| **Layer B 單元測試（可執行）**                            | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-candidates-and-assignment.test.ts tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-timeout-no-supply-scheduler-gap.test.ts tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-queue-checkin-checkout.test.ts tests/unit/system-remediation/sr-qa-dispatch-001/platform-presence-multiplatform-busy.test.ts` | `0`                                  | **29 passed**，涵蓋 C035/C036/C037(結構性缺口)/C038/C039/C041 正常與關鍵負向案例                                                                                                                                                                                                                                                                                                                                             |
| **Layer A 真實 PostgreSQL 測試（Fail-Closed，如實記錄）** | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-db-persistence.test.ts`                                                                                                                                                                                                                                                                                                     | `1`                                  | **如實 Fail-Closed**：本 VM 未提供 `DATABASE_URL`/`CONCURRENCY_TEST_DATABASE_URL`/`UV_BOOKING_TEST_DATABASE_URL`，`beforeAll` 立即拋出明確例外（6 tests skipped, 1 suite failed），與 `SR-QA-CONCURRENCY-001` 前例一致；**未偽裝成功**。程式碼已針對 `SR-QA-CONCURRENCY-001` 已驗證的相同 bootstrap 撰寫，邏輯與該任務的 Suite 2（`dispatch-reservation-concurrency.test.ts`）同構，但本次未在有 Postgres 的環境下實際執行過 |
| **Playwright E2E**                                        | `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-dispatch-001`                                                                                                                                                                                                                                                                                                                   | **未執行**                           | VM 限制：不得啟動 dev server / browser test server（見 §5），改以 `recordLiveLimitation` 如實揭露，不冒充執行                                                                                                                                                                                                                                                                                                                |

### 3.2 測試案例結構清單（Layer B，29 項，全數通過）

1. `dispatch-candidates-and-assignment.test.ts`（8 cases）
   - C035 Positive: 列出 active dispatch job 並回傳候選車池
   - C035 Negative: 無供給時候選清單為空、job 非 matching
   - C035 Positive: 新單各自獨立 dispatch job/候選集
   - C036 Positive: assign 後 `getOrder`/`listDispatchTrace` 可讀回新指派
   - C036 Negative: reassign 缺 `reasonCode` → 400 `REASSIGN_REASON_REQUIRED`
   - C036 Negative: 無 active assignment 時 reassign → 409 `ACTIVE_ASSIGNMENT_REQUIRED`
   - C036 Negative: 車輛未過 dispatchability recheck → 409 `ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT` / `VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT`
   - C036 Positive: reassign 後舊 assignment/task 以指定 reason 失效，新 assignment 生效，trace log 含新舊車輛與 reason

2. `dispatch-timeout-no-supply-scheduler-gap.test.ts`（10 cases）
   - C038 Positive: 首次 no-supply → `delayed_queue`
   - C038 Positive: 第二次 no-supply → `escalate_to_ops`
   - C038 Positive: `cancel_with_notification` → 訂單取消並記錄 operator
   - C038 Positive: 供給恢復後 `retry_dispatch` + 再次 `dispatchOrder`/`assignDispatch` 可收斂為 `assigned`（並證明恢復非自動）
   - C038 Positive: `matching_timeout` → `dispatch_timeout` + `redispatch_priority_queue`
   - C038 Negative: `acceptance_timeout` 缺 `targetAssignmentId` → 400 `ACCEPTANCE_TIMEOUT_TARGET_REQUIRED`
   - C038 Negative/Fence: 過期/不符目標的 timeout 為安全 no-op（`escalationAction: "superseded"`），不影響真實 active assignment
   - C037+C038 結構性缺口：`owned-mobility.service.ts`/`owned-autonomous-dispatch-executor.service.ts`/`owned-mobility.module.ts` 無任何 `@Cron`/`@Interval`
   - C037+C038 結構性缺口：唯一既有 `setInterval`（driver-completion-outbox 重試）與 dispatch-timeout/reservation-hold 無關，證明 sweep pattern 架構上可行但未套用於本能力

3. `dispatch-queue-checkin-checkout.test.ts`（6 cases）
   - C039 Positive: check-in 建立 entry 且 position 依站點遞增
   - C039 Negative: 同車重複 check-in 冪等（不新增第二筆）
   - C039 Positive: check-out 關閉 entry，允許同車再次 check-in（manual override / 重新排隊）
   - C039 Negative: 對未簽入車輛 check-out → 404 `QUEUE_ENTRY_NOT_FOUND`
   - C039 Negative: 查詢不存在 entry → 404 `QUEUE_ENTRY_NOT_FOUND`
   - C039 Positive/Read-back: 新實例僅憑 trace-log 事件流即可重建與寫入端一致的 queue 快照（`rebuildQueueEntriesFromTraceLogs`）

4. `platform-presence-multiplatform-busy.test.ts`（5 cases）
   - C041 Positive: 同一司機不同平台 online/offline 狀態獨立持久化
   - C041 Positive: `summary()` 讀回與寫入一致
   - C041 Negative: token 效期 <72h 標記 `reauthRequired`，效期遠者不標記
   - C041 缺口證據：司機在所有平台皆 offline，仍出現在派車候選清單（`OwnedMobilityService` 候選來源與 `PlatformPresenceService` 完全無關）
   - C041 結構性缺口：`owned-mobility.service.ts` 對 `platform-presence` 零引用

### 3.3 涉及的資源 ID／狀態轉移範例（Layer B 實際執行輸出摘錄）

- 派車：`dispatchJobId` → `assignmentId`（`status: assigned`）→ reassign 後舊 `assignmentId` 讀回 `status: cancelled`，新 `assignmentId` 讀回 `status: assigned`（見 `dispatch-candidates-and-assignment.test.ts` 最後一案）。
- 佇列：`queueEntryId`（`site-a` scope）position 1/2，check-out 後 `status: checked_out`，重新 check-in 產生**新的** `queueEntryId`（非復用舊筆）。
- 無供給升級：`noSupplyEscalation.escalationAction` 依序 `move_to_delayed_queue` → `escalate_to_ops`，`resolvedAt` 在 `cancel_with_notification` 後非 null。

### 3.4 PR #1948 CI 發現的 Layer A bootstrap 缺陷與修復（本次 dispatch 新增）

前次 handoff 時本 VM 無 `DATABASE_URL`，Layer A（`dispatch-db-persistence.test.ts`）只驗證了「未配置時明確 fail-closed」，未實際針對真實 Postgres 跑過（§3.1 已如實記錄此限制）。candidate `d1ecc53022b8e40ccf6d0791c8d82903580bdbc1` 推送後，PR #1948 的 GitHub Actions `CI` workflow（有 `postgres` service container，`DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_fleet_platform`）**真正執行了 Layer A**，`Smoke acceptance` / `Product smoke acceptance` job 回報 3 個測試失敗：

```
run: https://github.com/ajoe734/drts-fleet-platform/actions/runs/34525822672/job/103034527004
FAIL tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-db-persistence.test.ts
  > C035/C036 Positive: dispatch job + assignment + attempt write-then-read back exactly ...
  > C038 Positive: dispatch-timeout trace log write-then-read reconstructs the redispatch reason
  > C039 Positive: queue check-in/check-out trace-log stream write-then-read ...
error: relation "ops.consumer_notification_outbox" does not exist
error: relation "ops.passenger_dispatch_disclosure_snapshots" does not exist
```

**根因**：`OwnedMobilityRepository.loadState()`（`apps/api/src/modules/owned-mobility/owned-mobility.repository.ts`）在同一個 `Promise.all` 中無條件讀取 `ops.passenger_dispatch_disclosure_snapshots` 與 `ops.consumer_notification_outbox`（見 repository 檔案第 554/573 行），這兩張表由 `infra/migrations/V0056__multi_taxi_runtime_compliance_closure.sql` 建立。測試的 `beforeAll` 沿用 `SR-QA-CONCURRENCY-001` 的 bootstrap（僅 `V0011` + `V0087`），該既有 bootstrap 從未觸發過這兩張表的讀取路徑，所以沿用時遺漏了 `V0056`；本 VM 在本機一直無法跑 Layer A，這個 gap 在 handoff 前未被捕捉到。

**修復**（本次改動，僅限 `tests/unit/system-remediation/sr-qa-dispatch-001/` write_scope，未改動任何業務程式碼或 migration 檔）：

- `dispatch-db-persistence.test.ts` 的 `beforeAll` 新增 `CREATE SCHEMA reg; CREATE SCHEMA billing; CREATE SCHEMA reporting;`（`V0056` 用到但先前未建立的 schema，均由 `V0001__bootstrap_extensions_and_schemas.sql` / `V0034__phase1_delta_supply_eligibility_mobile_reporting.sql` 定義，此處直接建立同名 schema 而非整支跑那兩個大型 migration，避免拉入無關依賴）。
- 新增 `await pool.query(migration("V0056__multi_taxi_runtime_compliance_closure.sql"))`，緊接在 `V0087` 之後執行。已確認 `V0056` 第 5 行的 `ALTER TABLE ops.phase1_owned_orders ...` 依賴的表由已執行的 `V0011` 建立，`V0056` 本身不 `CREATE SCHEMA`、除 `reg.multi_taxi_operating_authorizations` 自參照外無其他外部 FK 依賴，因此在既有 bootstrap 之後套用是安全的。

**本次驗證**（本 VM 仍無 `DATABASE_URL`，無法重跑 Layer A 本身；以下為可在本 VM 執行的驗證）：

| 檢查項目                                                                 | 指令                                                                                                    | Exit Code                                                           | 結果                                                                                                                                                                             |
| :----------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layer A fail-closed 行為未被破壞（仍在無 DB 時明確拋錯，非新的靜默略過） | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-dispatch-001/dispatch-db-persistence.test.ts` | `1`（預期）                                                         | `beforeAll` 於 `CONCURRENCY_TEST_DATABASE_URL`/`UV_BOOKING_TEST_DATABASE_URL`/`DATABASE_URL` 均未設定時立即拋出同一個明確例外，6 tests skipped、1 suite failed，與修復前行為一致 |
| Layer B 迴歸未受影響                                                     | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-dispatch-001/`                                | 1 file failed（即上述預期中的 Layer A fail-closed）、4 files passed | 29 passed \| 6 skipped，與修復前相同，證明本次修改未影響其他測試檔                                                                                                               |
| Migration 依賴鏈人工核對                                                 | 讀取 `infra/migrations/V0056__multi_taxi_runtime_compliance_closure.sql` 全文                           | n/a                                                                 | 確認唯一跨表依賴（`ops.phase1_owned_orders`）已由既有 bootstrap 的 `V0011` 建立，且 `V0056` 未 `CREATE SCHEMA`／無其他外部 FK                                                    |

**未做（如實揭露，不冒充成功）**：本次修復**未在真實 Postgres 上重跑過 Layer A**——本 VM 依舊未配置可達的資料庫，VM 限制也不允許啟動 `docker compose`。修復是否讓 PR #1948 的 CI 轉綠，需由下一輪 CI 執行結果驗證（見 candidate lifecycle / PR #1948 checks），本文件與 handoff 不宣稱「CI 已通過」，只記錄「已識別根因並套用對應修復」。

---

## 4. 產品缺陷回報（不在本驗收範圍內修復，已建立來源追溯子任務）

依 Execution Prompt 要求「若發現產品缺陷，以 canonical task command 建立具來源的修復子任務，不在本驗收範圍偷偷改業務碼」，本任務發現以下屬實缺口，**未修改任何業務程式碼**，已用 `ai-status.sh assign` 建立子任務：

**`SR-DISPATCH-SCHEDULER-001`**（owner: `Codex`, reviewer: `Claude`, depends_on: `SR-QA-DISPATCH-001`）

1. **C037/C038 — 無真實背景排程觸發**：`handleDispatchTimeout`（dispatch-timeout／matching-timeout）與 reservation-hold escalation/reminder 的狀態機與 API 皆已存在且行為正確（見 §3.2），但整個 `owned-mobility` 模組沒有任何 `@Cron`/`@Interval`/`setInterval` 會自動呼叫它們；唯一現有的背景 `setInterval`（`startDriverCompletionOutboxRecoveryPolling`）服務於另一個資源（driver-completion outbox 重試），與 dispatch-timeout/reservation-hold 無關。對應「scheduler真觸發、hold」acceptance 要求：**未達成**，需另立任務新增真實背景 sweep。
2. **C041 — presence 未接入派車候選**：`platform-presence` 模組正確追蹤各平台 online/offline，但 `OwnedMobilityService.listEligibleDispatchCandidates`/`assertAssignmentEligibilityRecheck` 對其零引用；司機在其他平台忙碌或本平台已離線，仍可能被本平台重複派車。對應「多平台busy」acceptance 要求：**未達成**。

兩項均已寫入子任務的 `acceptance`/`artifacts` 並要求沿用本任務既有回歸測試作為基準（不得使其失敗）。

---

## 5. VM 限制與未做的 live／真機部分（明列，不冒充成功）

- **未執行 Playwright**：worker sandbox 禁止啟動 dev server / preview / browser test server（`pnpm exec playwright test`、`playwright test`、`pnpm dev`、`docker compose` 皆未執行）。`sr-qa-dispatch-001.spec.ts` 內容已撰寫並通過 typecheck/eslint/prettier，但**尚未實際執行**；每個 scenario 內以 `recordLiveLimitation` 明確揭露。
- **未執行真實 PostgreSQL 測試**：本 VM 未配置可達的 `DATABASE_URL`/`CONCURRENCY_TEST_DATABASE_URL`/`UV_BOOKING_TEST_DATABASE_URL`。`dispatch-db-persistence.test.ts` 依 fail-closed 設計正確拋錯（exit code 1），**未偽裝略過或成功**；其邏輯與 `SR-QA-CONCURRENCY-001` 已在有 DB 環境驗證過的同構 bootstrap 一致，但本次未實際針對真實 Postgres 執行過。
- **未做**：`ops.phase1_owned_orders` 完整欄位（`runtime_profile_code` 等後續 migration 累加欄位）的 write/read-back 未在 Layer A 重做，理由見 §2 Layer A 範圍說明。
- **未做**：C037/C038 自動觸發、C041 presence-eligibility 接線 — 已回報為產品缺陷並建立 `SR-DISPATCH-SCHEDULER-001`（§4），非本驗收任務 write_scopes。

---

## 6. 追溯來源

- [原30問題](../../04-uat/system-remediation-20260906/source/findings.json)
- [新增14工作卡](../../04-uat/system-remediation-20260906/source/new-gaps.json)
- [134能力](../../04-uat/system-remediation-20260906/source/capabilities.json)
- [主執行規則](../../03-runbooks/system-remediation-execution-tasks-20260906.md)
- [Task Spec](../../03-runbooks/system-remediation-20260906/SR-QA-DISPATCH-001.md)
- Follow-up: `SR-DISPATCH-SCHEDULER-001`（本任務建立）
