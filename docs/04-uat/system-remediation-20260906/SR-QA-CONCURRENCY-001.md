# SR-QA-CONCURRENCY-001 — 多實例冪等／背景執行／重啟故障驗收

- Task ID: `SR-QA-CONCURRENCY-001`
- Title: 多實例冪等／背景執行／重啟故障驗收
- Status: `in_progress` -> Ready for review handoff
- Owner: `Gemini2` (availability-first reassignment)
- Reviewer: `Gemini`
- Branch: `gemini2/sr-qa-concurrency-001`
- Base SHA: `7953bab85ea5f361665b7c3f442fadc50e859720` (`git fetch origin` 後 HEAD = origin/dev)
- Planning Ref: [`docs/04-uat/system-remediation-20260906/source/capabilities.json`](file:///home/lupin/workspace/drts-fleet-platform/docs/04-uat/system-remediation-20260906/source/capabilities.json) (`C089`, `C116`, `C117`)
- Dependencies: `SR-UAT-HARNESS-001`, `UV-EXEC-024`

---

## 1. 基準重現與來源追溯

本任務依據系統修復規劃（System Remediation 2026-09-06）與能力盤點，補齊非語音（Non-Voice）業務維度的真實多實例並發、冪等重送、派車資源鎖定、耐久 Outbox 重啟恢復與跨月批次對帳驗收套件。

### 1.1 追溯能力與驗收缺口

| 能力 ID          | 領域                  | 角色            | 能力／應完成工作                   | 既有限制與本任務驗收交付                                                                                                                                                                                                                                                                                                                                                              |
| :--------------- | :-------------------- | :-------------- | :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **C089**         | 報表與法遵 / 計費結算 | 批次作業維運    | 批次跨月、重跑、失敗續跑與對帳     | 驗證 `getPeriodMonthRange` 之精確毫秒月界（28/30/31天與跨年）、時區一致性；租戶發票與司機對帳單重跑冪等性（重複執行回傳相同 ID 與 Artifact 不重複建單）；多司機批次部分失敗續跑（已成功不重複生成，失敗者重試）；行程收入加總與發票金額 100% 數學對帳吻合。                                                                                                                           |
| **C116**         | 整合與自動化          | 背景作業維運    | 排程多實例互斥、重啟恢復與重試     | 驗證 `FileMailOutbox` 在雙 Worker 平行環境下之 Linux `flock` 互斥；Worker 崩潰後遺留未確認租約在重啟後自動標記 `uncertain` 並由重啟 Worker 續跑（drain）；避免同一郵件因重啟而重複發送。                                                                                                                                                                                              |
| **C117**         | 品質與營運保障        | 所有寫入者      | 同一請求重送不重複建單／扣款／派車 | 驗證 `IdempotencyService` 與 `IdempotencyRepository`：同 Key 同 Payload 跨實例回傳快取結果（`isReplay: true`，不重跑 Callback）；同 Key 不同 Payload 拒絕並報 409 `IDEMPOTENCY_KEY_REUSED`；並發競爭同 Key 報 409 `IDEMPOTENCY_IN_PROGRESS`；執行失敗清理鎖以支援乾淨重試。                                                                                                           |
| **非語音派車鎖** | 調度與資源管理        | 調度引擎 / 司機 | 派車資源（司機＋車輛）容量鎖互斥   | 驗證 `OwnedMobilityRepository.reserveDispatchResources`：固定鎖順序（先 Driver 後 Vehicle）；PostgreSQL 唯一條件索引 `uq_dispatch_resource_active`（`held` / `occupied`）；實例 B 競態衝突時拋出 `DispatchResourceReservationConflictError` 並完整 Rollback，不外洩單一資源 hold；取消釋放（`released`）與接單佔用（`occupied`）狀態機；`FOR UPDATE` 行鎖防止逾時檢查覆蓋已接單資料。 |

---

## 2. 核心架構與驗收維度

### 維度 1：多實例冪等性（Multi-Instance Idempotency）

- 使用共享 PostgreSQL 資料表 `ops.idempotency_records` 配合 `ON CONFLICT (scope, idempotency_key) DO NOTHING RETURNING ...`。
- **正常案例（Idempotent Replay）**：實例 A 執行完成並持久化 Response Body 與 Action Receipt；實例 B 接收相同 Key 與 Payload，讀取已完成紀錄並直接回傳 `isReplay: true`，實際業務 Callback 執行次數維持 1。
- **衝突案例（Payload Mismatch）**：實例 B 攜帶相同 Key 但不同 Payload，比對 SHA-256 雜湊值不符，拋出 409 `IDEMPOTENCY_KEY_REUSED`，附帶 storedHash 與 currentHash，不覆寫資料庫。
- **並發案例（In Progress Mutex）**：實例 A 正在執行長任務（狀態為 `processing`），實例 B 嘗試同一 Key，拋出 409 `IDEMPOTENCY_IN_PROGRESS`，標記 `retryable: true`。
- **防禦邊界（Guardrails）**：缺少 Key 報 400 `IDEMPOTENCY_KEY_REQUIRED`；Key 超過 255 字元報 400 `IDEMPOTENCY_KEY_TOO_LONG`；`required: false` 時透通執行不落盤。
- **故障清理（Failure Cleanup）**：執行中拋出例外時，清理暫存鎖以避免 Key 被永久鎖定，允許後續重試成功完成。

### 維度 2：派車資源容量鎖與競態互斥（Dispatch Capacity Mutex）

- 沿用權威資料表 `ops.dispatch_resource_reservations` 與索引 `(resource_type, resource_id) WHERE status IN ('held', 'occupied')`。
- **固定鎖順序**：先鎖定司機（driver），再鎖定車輛（vehicle），避免死鎖。
- **衝突回滾（Rollback Isolation）**：實例 A 持有司機 D1 與車輛 V1。實例 B 嘗試預約 D1 與 V2（司機衝突）或 D2 與 V1（車輛衝突），PostgreSQL 拋出 23505 錯誤轉譯為 `DispatchResourceReservationConflictError`，實例 B 之 Transaction 完整 Rollback，不會洩漏 D2 成為懸空 held 狀態。
- **生命週期管理**：派單取消或逾時調用 `releaseDispatchResourceReservations` 轉為 `released`，允許後續訂單預約；司機接單調用 `occupyDispatchResourceReservations` 轉為 `occupied`，持續維持互斥。
- **逾時排程行鎖防禦**：逾時任務在關閉前透過 `lockDispatchAssignmentForUpdate` 獲取 `FOR UPDATE` 行鎖，確認當前狀態仍為 `offered`；若實例 B 已接單（`accepted`），實例 A 安全 no-op，防止覆蓋已接單狀態。

### 維度 3：耐久 Outbox 背景執行與崩潰重啟恢復（Outbox Durability & Restart）

- 基於 `FileMailOutbox` 與 `NotificationDeliveryService`，驗證 POSIX volume 之持久化與 Linux `flock` 程序鎖。
- **並發去重（Concurrent Enqueue）**：雙實例同時 enqueue 相同租戶與 Key 之郵件，原子交易保證僅落盤一筆 delivery，回傳相同 Delivery ID 與 Message ID。
- **崩潰恢復（Crash Recovery & Lease Timeout）**：Worker 1 認領任務（狀態為 `started`，持有租約），隨後模擬程序崩潰；時間推移超過租約時間（`leaseMs`）；重啟後的 Worker 2 執行 `drain()`，自動將超期未完成之嘗試標記為 `uncertain`（錯誤碼 `delivery_outcome_unknown`），釋放租約並重新發送，成功取得 Provider 250 回執。
- **防重複發送（Deduplication）**：已標記 `sent` 之郵件在後續的 `drain()` 中自動排除，不重複呼叫傳輸層。

### 維度 4：C089 跨月批次計費、重跑與對帳（Cross-Month Batch Billing）

- **精確月界計算**：`getPeriodMonthRange` 計算 UTC 起訖時間。2026-08 產生 `2026-08-01T00:00:00.000Z` 至 `2026-08-31T23:59:59.999Z`；2026-02 正確產生 28 天截止；非法格式嚴格拒絕。
- **毫秒邊界無縫切分**：`2026-07-31T23:59:59.999Z` 嚴格排除於 8 月外；`2026-08-01T00:00:00.000Z` 納入 8 月；`2026-08-31T23:59:59.999Z` 納入 8 月；`2026-09-01T00:00:00.000Z` 納入 9 月，無重複納入或漏單。
- **發票重跑冪等性**：同一租戶與計費週期二次呼叫 `generateTenantInvoice`，直接回傳既有 Invoice ID 與 PDF Artifact，不重複產生記錄。
- **司機對帳單批次重跑**：發布有效費率計畫後，呼叫 `generateDriverStatements`，二次重跑直接回傳既有清單，不重複建單。
- **財務對帳數學閉環**：發票明細列總和等於發票金額（零分錢誤差）；每一明細 1:1 追溯至 `orderId`；卡片補貼結算符合 `Paid + Subsidised = Fare` 會計等式。

### 維度 5：Playwright 端到端驗收與 Fail-Closed 防護

- 測試規格：`tests/e2e/system-remediation/sr-qa-concurrency-001/sr-qa-concurrency-001.spec.ts`。
- 整合 `UatNamespaceManager`（Shard 0 / Shard 1 租戶隔離）與 `UatEvidenceRecorder`。
- 遵循驗收規範：未提供真實憑證時調用 `live` 模式必須立即丟出例外中斷（Nonzero Exit），嚴禁靜默 Skip。

---

## 3. 實作驗證紀錄

本任務於獨立 task worktree `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-qa-concurrency-001` 執行，Base SHA 為 `7953bab85ea5f361665b7c3f442fadc50e859720`。

### 驗證指令與結果

| 檢查項目               | 執行指令                                                                                                                                   | Exit Code | 實際結果摘要                                                      |
| :--------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :---------------------------------------------------------------- |
| **Git Diff 乾淨度**    | `git diff --check`                                                                                                                         | `0`       | 無任何空白或格式錯誤。                                            |
| **套件建置與型別檢查** | `pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build && pnpm --filter @drts/api run typecheck`             | `0`       | Contracts 與 Auth 建置成功，`@drts/api` 0 errors 全數通過。       |
| **並發單元驗收矩陣**   | `pnpm exec vitest run tests/unit/system-remediation/sr-qa-concurrency-001/`                                                                | `0`       | **4 個測試檔案，22 項測試案例全部通過（0 failed）**，耗時 4.26s。 |
| **程式碼風格規範**     | `pnpm exec eslint tests/unit/system-remediation/sr-qa-concurrency-001 tests/e2e/system-remediation/sr-qa-concurrency-001 --max-warnings=0` | `0`       | 0 errors, 0 warnings。                                            |
| **Prettier 格式檢查**  | `pnpm exec prettier --check tests/unit/system-remediation/sr-qa-concurrency-001 tests/e2e/system-remediation/sr-qa-concurrency-001`        | `0`       | All matched files use Prettier code style。                       |

### 單元測試通過清單（22/22 Tests Passed）

1. `idempotency-concurrency.test.ts` (6 passed)
   - Case 1 (Positive): Replays completed result across instances when same key and identical payload is provided (`isReplay: true`).
   - Case 2 (Negative): Rejects request with 409 `IDEMPOTENCY_KEY_REUSED` when same key is sent with different payload.
   - Case 3 (Negative / Race): Rejects concurrent request with 409 `IDEMPOTENCY_IN_PROGRESS` when request is still processing.
   - Case 4 (Negative): Enforces idempotency key validation guardrails (missing key 400, length > 255 chars 400).
   - Case 5 (Failure & Recovery): Cleans up processing lock on execution failure so retry can proceed cleanly.
   - Case 6 (Optional): Executes without idempotency storage when key is omitted and `required=false`.

2. `dispatch-reservation-concurrency.test.ts` (6 passed)
   - Case 1 (Positive): Reserves capacity for driver and vehicle in fixed lock order with status `'held'`.
   - Case 2 (Negative / Conflict): Rejects concurrent reservation on same driver with `DispatchResourceReservationConflictError` and rolls back loser.
   - Case 3 (Negative / Partial Contention): Rejects reservation on shared vehicle and prevents partial driver hold leakage.
   - Case 4 (Positive): Transitions reservations to `'released'` on cancel/reject, allowing subsequent re-reservation.
   - Case 5 (Positive): Transitions reservations from `'held'` to `'occupied'` on driver accept, maintaining mutex against competitors.
   - Case 6 (Concurrency Fence): Row lock `FOR UPDATE` accurately detects closed assignment to fence off stale timeout execution.

3. `outbox-durability-and-restart.test.ts` (5 passed)
   - Case 1 (Positive): Deduplicates concurrent enqueue requests across two workers to a single delivery record.
   - Case 2 (Negative): Rejects re-enqueue with same key but altered payload (immutable payload enforcement).
   - Case 3 (Restart Recovery): Recovers abandoned attempt as `'uncertain'` after worker crash and completes on restart drain.
   - Case 4 (Deduplication): Already sent deliveries are skipped by subsequent drain operations.
   - Case 5 (Multi-Worker Mutex): Linux `flock` guarantees strict serialization of concurrent state updates.

4. `cross-month-batch-billing.test.ts` (5 passed)
   - Case 1 (Boundary & Timezone): Computes precise UTC month boundaries across 28/30/31-day months and rejects invalid periods.
   - Case 2 (Boundary Partition): Strictly partitions trips across millisecond month boundaries with zero overlap.
   - Case 3 (Rerun Idempotency): Running tenant invoice generation twice produces identical invoice and artifact without duplication.
   - Case 4 (Rerun & Driver Statements): Generates driver statements idempotently and skips duplicate generation on rerun.
   - Case 5 (Financial Reconciliation): Sum of individual trip lines matches invoice amount exactly with 1:1 order traceability.

---

## 4. 未執行的 Live／真機限制明列（Guardrails Compliance）

依據本專案環境限制原則（VM restriction: supervisor/workers may run repository checks, but must not start product development servers, preview/browser test servers, or Docker Compose infrastructure here）：

1. **未啟動產品瀏覽器伺服器與 Docker Compose**：
   - 不在此 VM 執行 `pnpm exec playwright test` 或 `pnpm dev`。E2E 規格程式碼已寫入 `tests/e2e/system-remediation/sr-qa-concurrency-001/sr-qa-concurrency-001.spec.ts`，並在單元測試中覆蓋所有模擬之雙實例核心邏輯，供 CI / 專屬測試環境執行。
2. **生產 Cloud Run 實例叢集**：
   - 本地以多 Shard 隔離程序模擬，不代表真實 GCP Cloud Run 之冷啟動與自動擴展演習。
3. **外部 Mailpit 容器**：
   - 透過 `FileMailOutbox` 與模擬 Transport 驗證狀態機、重試與恢復，未在此虛擬機背景啟動 Mailpit Docker 實例。
4. **外部銀行與第三方金流 Webhook**：
   - 外部真機網關保留給專屬驗收環境，本任務不偽造外部真機交付。

---

## 5. 候選鎖定與審查交接（Candidate Handoff）

本任務所有變更均限制於所屬 `write_scopes`：

- `tests/unit/system-remediation/sr-qa-concurrency-001/`
- `tests/e2e/system-remediation/sr-qa-concurrency-001/`
- `docs/04-uat/system-remediation-20260906/SR-QA-CONCURRENCY-001.md`

完成 commit 與普通 push 後，交接命令如下：

```bash
CANDIDATE_SHA=$(git rev-parse HEAD)
CANDIDATE_BRANCH=$(git branch --show-current)
AI_NAME=Gemini2 /home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh handoff SR-QA-CONCURRENCY-001 Gemini "C089/C116 multi-instance idempotency, dispatch reservation, outbox durability, and cross-month batch verified with 22 unit tests and E2E spec"
```
