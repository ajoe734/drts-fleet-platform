# GAP-P2S3-006 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S3-006` — db: V0020\_\_settlement_driver_index.sql + per-driver settlement trip query  
**Current Sidecar Owner:** `Claude`  
**Assigned Reviewer:** `Codex`  
**Parent Owner:** `Gemini`  
**Last Revised:** `2026-04-17T19:20:00Z (UTC)`  
**Status:** `done` — reviewer `Codex` approved at `2026-04-17T19:16:30Z`; owner `Claude` finalized closeout.

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S3-006` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- In scope: support-only acceptance framing, dependency mapping, repo-scan evidence anchors, current migration baseline, repository query baseline, reviewer checklist.
- Out of scope: `infra/migrations/V0020__settlement_driver_index.sql` 的實際建立、`billing-settlement.repository.ts` 的實際修改、L1/L2 真相修改、或改寫 machine truth。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S3-006` 在 machine truth 中為 `backlog`，Owner=`Gemini`，正式 dependency 為 V0019（對應 `GAP-P2S2-003`）。
- 本 sidecar `GAP-P2S3-006-SIDECAR-ACCEPTANCE` 在 shared truth 中目前是 `review`，Owner=`Claude`，Reviewer=`Codex`，`last_update=2026-04-17T19:12:26Z`，`next` 為「Auto-reassigned review from Gemini to Codex after repeated Gemini unknown critical error: An unexpected critical error occurred:[object Object]」。
- `ai-activity-log.jsonl` 顯示近期 reviewer-routing 鏈條為：`2026-04-17T19:11:59Z` `Claude -> Gemini` owner handoff 建立，`2026-04-17T19:12:26Z` review 自動改派至 `Codex`，`2026-04-17T19:12:59Z` reviewer wake 已派給 `Codex`。因此本 packet 應以「最新 shared-L0 reviewer 為 `Codex`」為準，而不是停留在先前的 `Gemini` reviewer 快照。

### Migration Baseline

- 目前 `infra/migrations/` 最高版本為 `V0018A__driver_profiles.sql`（GAP-P2S1-004-API follow-up）。
- `V0019__driver_locations.sql`（GAP-P2S2-003 對應的 single-row-per-driver upsert 表）**尚不存在**；為 V0020 的正式前置依賴。
- `V0020__settlement_driver_index.sql` 尚不存在；為本 parent task 的目標輸出。

### Relevant Existing Tables (from V0011 + V0012)

- `ops.phase1_driver_tasks`（V0011）: `task_id`, `order_id`, `dispatch_job_id`, `assignment_id`, `status`, `created_at`, `updated_at`, `record jsonb`
  - **無 `driver_id` 專屬欄位**；driver ID 儲存在 `record->>'driverId'` JSONB 欄位中。
  - 現有 index：`idx_phase1_driver_tasks_driver_status ON ops.phase1_driver_tasks(status, updated_at DESC)`——**不涵蓋 driver_id，無法支援高效 per-driver 查詢**。
- `billing.phase1_driver_statements`（V0012）: 有 `driver_id varchar(100) NOT NULL` 欄位，已有 index `idx_phase1_driver_statements_driver ON billing.phase1_driver_statements(driver_id, period_month DESC)`。
- `billing.phase1_reimbursement_batches`（V0012）: 有 `driver_id varchar(100) NOT NULL` 欄位，已有 index `idx_phase1_reimbursement_batches_driver ON billing.phase1_reimbursement_batches(driver_id, period_month DESC)`。

### Repository Query Baseline

- `billing-settlement.repository.ts` 目前提供：
  - `listLiveCompletedTenantTrips(tenantId, periodStart, periodEnd)` — 以 `orders.record->>'tenantId' = $1` 限縮至特定 tenant。
  - `listLiveDriverTripsInPeriod(periodStart, periodEnd)` — **所有 driver**，只以 `tasks.status = 'completed'` + period 過濾，**未以 driverId 過濾**。
- **缺少的方法**：`listLiveDriverTripsInPeriodForDriver(driverId, periodStart, periodEnd)` ── 以單一 driver 過濾、高效查詢各 driver 的 settlement trip，為 per-driver statement 生成所需。
- 現有 `listLiveDriverTripsInPeriod` 查詢中以 `tasks.record->>'driverId'` 存取 driver ID，但沒有對應的 index，全表掃描風險高。

### Service Wiring Baseline

- `billing-settlement.service.ts` 中 `listLiveDriverStatementTripsInPeriod` （private method，line ~996）呼叫 `this.billingSettlementRepository.listLiveDriverTripsInPeriod(periodStart, periodEnd)` 取得全部 trips，再以 `statementsByDriver.get(trip.driverId)` 在 service 層做 in-memory 分組（line ~537）。
- 此 in-memory 分組模式在 driver 數量多時效率差；V0020 + per-driver query 的目的是讓 repository 層直接以 driver_id 索引查詢，避免全表加載。

---

## 3) Parent Acceptance Framing

`GAP-P2S3-006` 在 machine truth 的 task description 定義為「db: V0020\_\_settlement_driver_index.sql + per-driver settlement trip query」。以下 checklist 展開此任務的驗收條件，僅作為支援材料，不新增產品語意。

### AC-1 — Migration file exists and is idempotent

- [ ] `infra/migrations/V0020__settlement_driver_index.sql` 已建立。
- [ ] 檔案包含 `CREATE INDEX IF NOT EXISTS` 語法（或等效冪等寫法），符合現有 migration pattern。
- [ ] migration 不建立新 table，只新增 index（純 index，~10 LOC）。

### AC-2 — Index targets ops.phase1_driver_tasks driver_id

- [ ] V0020 在 `ops.phase1_driver_tasks` 表上建立針對 `(record->>'driverId')` 的 functional index（或等效的 expression index），以支援 per-driver 高效查詢。
- [ ] index 名稱遵循 `idx_phase1_*` 前綴慣例（參考 V0011、V0012 既有命名）。
- [ ] index 包含 `status` 或 `updated_at` 欄位作為 composite key 的一部分，以支援 `WHERE status = 'completed' AND (record->>'driverId') = $1` 這類查詢。

### AC-3 — Repository exposes per-driver query method

- [ ] `billing-settlement.repository.ts` 新增 `listLiveDriverTripsInPeriodForDriver(driverId, periodStart, periodEnd)` 方法（或功能等效的 per-driver variant）。
- [ ] 新方法 SQL 以 `(record->>'driverId') = $1` 過濾，可利用 V0020 建立的 index。
- [ ] 新方法回傳型別為 `LiveSettlementTripRecord[]`，與現有 `listLiveCompletedTenantTrips` / `listLiveDriverTripsInPeriod` 一致。

### AC-4 — V0019 dependency is respected

- [ ] V0020 migration 不依賴 `ops.phase1_driver_locations` table 本身（index 只針對 settlement 相關 tables）；但 V0020 檔案編號需晚於 V0019，以確保 migration 順序正確。
- [ ] 即使 SQL 本身不直接引用 `ops.phase1_driver_locations`，shared truth 仍把 V0019 / `GAP-P2S2-003` 視為 formal blocker；在 `GAP-P2S2-003` 完成前，不應把 V0020 宣告為 ready-to-merge 或 parent-done。

### AC-5 — No canonical truth mutation

- [ ] `infra/migrations/` 中只新增 V0020 檔案，不修改 V0001–V0018A 任何既有 migration。
- [ ] `apps/api/src/modules/billing-settlement/` 以外的核心 runtime/registry/governance 不被修改。
- [ ] L1 product truth 文件（phase1_prd_detailed_v1.md 等）不被修改。

---

## 4) Dependency Map

### Formal Upstream Dependency

> 以 consensus packet 為準，`GAP-P2S3-006` 的正式 dependency 為 V0019（`GAP-P2S2-003`）。

| Dep    | Source                 | Status    | Notes                                          |
| ------ | ---------------------- | --------- | ---------------------------------------------- |
| D-UP-1 | `GAP-P2S2-003` / V0019 | `backlog` | driver_locations migration，V0020 需在其後執行 |

### Practical Review Dependencies

| Dep   | Type                                                             | Why It Matters                                                                 |
| ----- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| D-P-1 | `infra/migrations/V0011__phase1_runtime_snapshots.sql`           | 確認 `ops.phase1_driver_tasks` schema（無 driver_id 欄位，driver ID 在 JSONB） |
| D-P-2 | `infra/migrations/V0012__phase1_remaining_runtime_snapshots.sql` | 確認 billing tables 既有 driver_id 欄位與 index                                |
| D-P-3 | `billing-settlement.repository.ts`                               | 確認現有查詢 pattern 與缺少的 per-driver variant                               |
| D-P-4 | `billing-settlement.service.ts` (line ~537, ~996)                | 確認 service 層 in-memory driver grouping 模式（需被 per-driver query 改善）   |
| D-P-5 | `infra/migrations/V0018A__driver_profiles.sql`                   | 確認目前最高 migration 版號，V0019/V0020 需接續                                |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md`
- Repo anchors:
  - `infra/migrations/V0011__phase1_runtime_snapshots.sql`
  - `infra/migrations/V0012__phase1_remaining_runtime_snapshots.sql`
  - `infra/migrations/V0018A__driver_profiles.sql`
  - `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`
  - `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`

---

## 5) Evidence Inventory

| ID  | Evidence                                                               | Expected Anchor                                             |
| --- | ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| E-1 | Parent task machine state (backlog, Gemini, depends V0019)             | `ai-status.json`, `current-work.md`                         |
| E-2 | Formal GAP-P2S3-006 → V0019 dependency chain                           | `consensus-packet.md` (line ~60, ~80)                       |
| E-3 | Latest migration is V0018A (V0019/V0020 absent)                        | `infra/migrations/` directory listing                       |
| E-4 | ops.phase1_driver_tasks has no driver_id column                        | `V0011__phase1_runtime_snapshots.sql:50-59`                 |
| E-5 | Existing idx_phase1_driver_tasks_driver_status doesn't cover driver_id | `V0011__phase1_runtime_snapshots.sql:102-103`               |
| E-6 | billing.phase1_driver_statements already has driver_id + index (V0012) | `V0012__phase1_remaining_runtime_snapshots.sql:93-101, 163` |
| E-7 | listLiveDriverTripsInPeriod queries all drivers (no driverId filter)   | `billing-settlement.repository.ts:206-256`                  |
| E-8 | Service does in-memory driver grouping (inefficient at scale)          | `billing-settlement.service.ts:537-538, 996-1010`           |
| E-9 | Consistent migration naming/index pattern from V0011/V0012             | `idx_phase1_*` prefix, `IF NOT EXISTS` idempotency          |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer（`Codex`）應優先確認：

1. packet 是否忠實保留 machine truth：`GAP-P2S3-006` 仍為 `backlog`，正式 dependency 為 V0019/`GAP-P2S2-003`。
2. packet 是否已改成目前 shared-L0 reviewer routing：sidecar 是 `review`、Owner=`Claude`、Reviewer=`Codex`，而非舊的 `Gemini` reviewer 快照。
3. AC-2 中的 index target 是否正確識別：`ops.phase1_driver_tasks` 上的 `(record->>'driverId')` functional index 是最有效的設計，而非重複建 billing tables 的 index（後者已存在）。
4. AC-3 的 per-driver query method 是否符合 repository 現有 pattern（`listLiveCompletedTenantTrips` 命名慣例）。
5. AC-4 是否保留 formal blocker 語意，而不是把 V0019 說成可被實務上繞過。
6. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S3-006 acceptance packet ready: shared truth keeps the parent at backlog depending on V0019/GAP-P2S2-003, the sidecar reviewer is now Codex after the 2026-04-17T19:12:26Z auto-reassignment, the packet correctly identifies ops.phase1_driver_tasks as missing a driver_id index (driver ID lives in JSONB record->>'driverId'), the billing tables already have driver_id indexes from V0012 (no duplication needed), the per-driver repository method is still absent, and AC-4 preserves V0019 as a formal blocker instead of relaxing machine truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / index target misidentification / dependency drift / scope violation]`

---

## 7) Handoff Command

Owner（`Claude`）若需再修訂本文件，應交給目前 reviewer（`Codex`）：

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff GAP-P2S3-006-SIDECAR-ACCEPTANCE Codex "GAP-P2S3-006 acceptance packet ready at support/sidecars/GAP-P2S3-006/GAP-P2S3-006-SIDECAR-ACCEPTANCE.md. It preserves the formal backlog status and V0019 dependency, aligns the reviewer routing to Codex after the 2026-04-17T19:12:26Z auto-reassignment, identifies ops.phase1_driver_tasks (record->>driverId functional index) as the primary index target for V0020, documents the missing per-driver repository method, and keeps V0019 as a formal blocker without changing canonical truth."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S3-006-SIDECAR-ACCEPTANCE "GAP-P2S3-006 acceptance packet ready: shared truth keeps the parent at backlog depending on V0019/GAP-P2S2-003, reviewer routing is aligned to Codex after the 2026-04-17T19:12:26Z auto-reassignment, the packet correctly identifies ops.phase1_driver_tasks missing a driver_id functional index, billing.phase1_driver_statements and reimbursement_batches already have driver_id indexes from V0012, the per-driver repository method is absent and documented, and V0019 remains a formal blocker."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S3-006-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / reviewer-routing mismatch / index target misidentification / dependency drift / scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Claude`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done GAP-P2S3-006-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S3-006 at support/sidecars/GAP-P2S3-006/GAP-P2S3-006-SIDECAR-ACCEPTANCE.md. The packet preserves the V0019 dependency, identifies the ops.phase1_driver_tasks functional index gap, documents the missing per-driver repository method, and does not change canonical truth."
```

---

## 10) Change Log

- 2026-04-17T19:15Z — 初版建立：依共享 machine truth、consensus packet、infra/migrations 掃描與 billing-settlement repository 掃描，整理 `GAP-P2S3-006` 的 acceptance checklist、dependency map、migration baseline、repository query 缺口，以及 reviewer handoff 指引。
- 2026-04-17T19:15:17Z — `Codex` reviewer refresh：將 packet metadata 對齊目前 shared truth（reviewer `Codex`、status `review`、`2026-04-17T19:12:26Z` auto-reassignment / `19:12:59Z` reviewer wake），並把 AC-4 修正為保留 V0019 的 formal blocker 語意，不再暗示可繞過 machine-truth dependency。
- 2026-04-17T19:20Z — Owner closeout：`Codex` 於 `2026-04-17T19:16:30Z` approve，sidecar 進入 `review_approved`。Owner `Claude` 依 Section 9 程序將 sidecar 收尾為 `done`，更新 shared machine truth，packet 內容不變（support-only，未修改 canonical truth）。
