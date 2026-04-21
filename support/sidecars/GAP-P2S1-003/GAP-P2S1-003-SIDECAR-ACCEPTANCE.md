# GAP-P2S1-003 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S1-003` — billing: driver statement live trip ingestion (`listLiveDriverTripsInPeriod` + service wire)  
**Current Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex` / `(unassigned)`  
**Last Revised:** `2026-04-17T12:27Z (UTC)`  
**Status:** `review_approved` (latest shared-L0 task row keeps owner `Codex2`, reviewer `Codex`, `status=review_approved`, `last_update=2026-04-17T12:25:07Z`; `ai-status.json` / `current-work.md` also show the pending finalize handoff from `Codex` back to `Codex2` created at `2026-04-17T12:25:08Z`)

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S1-003` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- In scope: support-only acceptance framing, dependency mapping, repo-scan evidence anchors, live-query gap baseline, reviewer checklist.
- Out of scope: `billing-settlement` 主線 runtime 修改、L1/L2 真相修改、schema/migration 變更、或 machine-truth 以外的狀態檔直接編修。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S1-003` 在 machine truth 中目前是 `in_progress`，Owner=`Codex`，沒有 formal `depends_on` blocker；`current-work.md` 的最新 next step 是檢查 billing-settlement live driver-statement gap，準備補 repository live-query wiring 與對齊 tenant-invoice pattern 的 unit coverage。
- 本 sidecar `GAP-P2S1-003-SIDECAR-ACCEPTANCE` 在目前 shared L0 task row 中是 `status=review_approved`，Owner=`Codex2`、Reviewer=`Codex`、artifact path=`support/sidecars/GAP-P2S1-003/GAP-P2S1-003-SIDECAR-ACCEPTANCE.md`、`last_update=2026-04-17T12:25:07Z`。
- 近期 machine-truth churn 已包含一次 reviewer reopen、其後的 owner refresh、以及 reviewer auto-reassign：
  - `2026-04-17T12:11:19Z` `Codex` 以「header/status、Section 2、Section 6 仍凍結 stale snapshot」為由 reopen 此 sidecar。
  - `2026-04-17T12:11:29Z` Orchestrator 曾暫時把 owner 從 `Codex2` availability-first rebalance 到 `Codex`，隨後在 `2026-04-17T12:12:51Z` 該 worker 被 superseded。
  - `2026-04-17T12:13:02Z` Orchestrator 再把 owner 重新平衡回 `Codex2`，並在 `2026-04-17T12:13:05Z` 啟動新的 `owned_in_progress_dispatch` worker。
  - `2026-04-17T12:14:37Z` `Codex2` 完成 refresh 後正式 handoff 給 reviewer `Codex`，把 packet 送回 review-ready 狀態。
  - `2026-04-17T12:14:47Z` Orchestrator 曾短暫把 reviewer availability-first 改派到 `Qwen`，但該 review worker 未穩定完成。
  - `2026-04-17T12:15:05Z` Orchestrator 因 `Qwen` repeated `401 invalid access token or token expired` 將 reviewer auto-reassign 回 `Codex`；`current-work.md` 與 `ai-status.json` 目前都以此 review snapshot 為準。
  - `2026-04-17T12:22:04Z` `Codex` 已正式 approve 此 sidecar，machine truth 將其推進到 `review_approved`。
  - `2026-04-17T12:24:26Z` 後因其他 sidecar finalize churn 一度產生錯誤 auto-reassign 噪音，但最新 shared L0 仍維持 owner=`Codex2` / reviewer=`Codex` / `review_approved`。
  - `2026-04-17T12:25:08Z` handoff queue 新增 `Codex -> Codex2` 的 finalize dispatch，表示此 packet 正等待 owner 做正式 `done` closeout。
- planning anchors 已對此 task 有明確結論：
  - `starter-draft.md` 把 root cause 定義為 `generateDriverStatements()` 仍只吃 seed `settlementTrips`，不像 tenant invoice 已走 live settlement query。
  - `backlog-proposal.md` 明確指向 implementation shape：在 `billing-settlement.repository.ts` 新增 `listLiveDriverTripsInPeriod()`，並把 `generateDriverStatements()` 接到這條 live path。
  - `review-round-2.md` 明示 `GAP-P2S1-003` 不需要新 DB schema，現有 `ops.phase1_owned_orders` / `ops.phase1_driver_tasks` 已足夠支援查詢；這個 slice是 internal service change only。
- `docs-site/index.html` 只是 supervisor dashboard shell，對本 task 沒有額外產品語意。

### Repo Baseline Anchors

- [`apps/api/src/modules/billing-settlement/billing-settlement.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/billing-settlement/billing-settlement.service.ts:171) 仍保留 `SETTLEMENT_TRIP_SEED` 複製出的 `this.settlementTrips` in-memory baseline。
- [`apps/api/src/modules/billing-settlement/billing-settlement.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/billing-settlement/billing-settlement.service.ts:490) 的 `generateDriverStatements()` 目前只從 `this.settlementTrips.filter(...)` 找 `eligibleForDriverStatement`，沒有任何 repository live-query 分支。
- [`apps/api/src/modules/billing-settlement/billing-settlement.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/billing-settlement/billing-settlement.service.ts:962) 的 tenant invoice flow 已經會呼叫 repository live query，表示 repo 裡已存在可對齊的 implementation pattern。
- [`apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/billing-settlement/billing-settlement.repository.ts:136) 目前只有 `listLiveCompletedTenantTrips(tenantId, periodStart, periodEnd)`，尚無 driver-scoped `listLiveDriverTripsInPeriod(...)`。
- [`apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/billing-settlement/billing-settlement.controller.ts:96) 已公開 `POST /api/driver-statements/generate`，所以 parent slice 是內部資料來源修正，不是新增 route。
- [`tests/unit/billing-settlement.test.ts`](/home/edna/workspace/drts-fleet-platform/tests/unit/billing-settlement.test.ts:106) 現有 `SC-031` 單元測試只證明 seed-based driver statement generation。
- [`tests/unit/billing-settlement.test.ts`](/home/edna/workspace/drts-fleet-platform/tests/unit/billing-settlement.test.ts:52) 已有 tenant invoice live-path 測試，證明 repository-enabled pattern 已在同模組落地，但尚未對 driver statement 套用。

結論：`GAP-P2S1-003` 不是新 API 或 migration 任務，而是要把 driver statement generation 從 seed-only settlement snapshot，拉到與 tenant invoice 類似的 live completed-trip query path。

---

## 3) Parent Acceptance Framing

`GAP-P2S1-003` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把 shared truth 與現有 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Driver statements must stop being seed-only

- [ ] `generateDriverStatements()` 不再只依賴 `this.settlementTrips` 的 hardcoded seed baseline 作為唯一資料來源。
- [ ] reviewer 能清楚定位 live completed-trip ingestion 的呼叫路徑，而不是只看到 seed array 仍照舊工作。
- [ ] sidecar / closeout 不得把現有 seed-only `SC-031` 測試誤稱為 live-trip support 已完成。

### AC-2 — Implementation should mirror the existing tenant-invoice live-query pattern

- [ ] repository 新增 driver-scoped live trip query，例如 planning 指名的 `listLiveDriverTripsInPeriod()`，而不是在 service 層直接複寫 SQL。
- [ ] service 層 wiring 應延續同模組既有 repository-enabled invoice pattern，保持 persistence-enabled 與 in-memory fallback 邏輯可讀。
- [ ] reviewer 應能看出 driver statement live path 與 tenant invoice live path 的關係是「平行對齊」，不是另開一條不一致的 settlement 規則。

### AC-3 — No new schema / contract / route drift is introduced

- [ ] implementation 不需新增 migration；若 PR 引入 schema 變更，應被視為 scope drift。
- [ ] implementation 不需新增 `@drts/contracts` 型別或 route surface；這是 internal service/repository change only。
- [ ] 現有 `POST /api/driver-statements/generate` 與 statement read models 應維持 contract 相容，不以 sidecar 名義擴充 API semantics。

### AC-4 — Verification must prove live trip ingestion, not just seed regression

- [ ] 至少一條單元測試或等價驗證要模擬 repository-enabled live driver trip query，並證明產出的 statement 來自 live completed trips。
- [ ] 現有 seed regression 測試可保留，但不能作為唯一 acceptance evidence。
- [ ] reviewer handoff 應分清楚「tenant invoice 已有 live query 測試」與「driver statement 新增 live query 測試」兩件事，避免混用證據。

---

## 4) Dependency Map

### Formal Dependencies

> 以 machine truth 為準，`GAP-P2S1-003.depends_on=[]`。

| Dep    | Source | Status | Notes                                                   |
| ------ | ------ | ------ | ------------------------------------------------------- |
| D-UP-1 | none   | `n/a`  | parent task 沒有 formal blocker；這是單模組內部 gap-fix |

### Practical Review Dependencies

| Dep   | Type                               | Why It Matters                                                                     |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| D-P-1 | Planning consensus                 | 鎖定這是 `listLiveDriverTripsInPeriod` + service wire，而不是新 migration 或新 API |
| D-P-2 | Tenant invoice live-query baseline | 提供既有實作 pattern，避免 driver statement 寫出不一致路徑                         |
| D-P-3 | Billing repository baseline        | 說明 repo 目前缺的是 driver-scoped query method，不是 database capability          |
| D-P-4 | Existing SC-031 / billing tests    | 說明目前驗證只覆蓋 seed-based statement generation，需要補 live-query evidence     |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/starter-draft.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/backlog-proposal.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/review-round-2.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/consensus-packet.md`
- Product / execution anchors:
  - `phase1_service_contracts_v1.md`
  - `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`
- Repo anchors:
  - `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
  - `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`
  - `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
  - `tests/unit/billing-settlement.test.ts`

---

## 5) Evidence Inventory

| ID   | Evidence                                                     | Expected Anchor                                                                 |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                               | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                    |
| E-2  | Root-cause statement                                         | `starter-draft.md` GAP-005 section                                              |
| E-3  | Required implementation shape                                | `backlog-proposal.md` row for `GAP-P2S1-003`                                    |
| E-4  | No-migration / internal-change verdict                       | `review-round-2.md`                                                             |
| E-5  | Billing service still uses seed-only statement source        | `billing-settlement.service.ts:171`, `:490-525`                                 |
| E-6  | Existing live-query baseline for tenant invoice              | `billing-settlement.service.ts:962`, `billing-settlement.repository.ts:136-183` |
| E-7  | Driver statement route surface already exists                | `billing-settlement.controller.ts:96-107`                                       |
| E-8  | Current unit coverage is seed-only for statements            | `tests/unit/billing-settlement.test.ts:106-156`                                 |
| E-9  | Existing live-query unit coverage only covers tenant invoice | `tests/unit/billing-settlement.test.ts:52-94`                                   |
| E-10 | Product acceptance anchor for SC-031                         | `02_acceptance_scenarios_gherkin.md:475-483`                                    |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：`GAP-P2S1-003` 目前是 `in_progress` 且沒有 formal blocker，sidecar 目前是 `review_approved` snapshot，owner=`Codex2` / reviewer=`Codex` / `last_update=2026-04-17T12:25:07Z`，並寫清楚 `2026-04-17T12:11:19Z` reopen、`2026-04-17T12:14:37Z` owner handoff、`2026-04-17T12:15:05Z` reviewer auto-reassign、`2026-04-17T12:22:04Z` approve 與 `2026-04-17T12:25:08Z` finalize handoff。
2. packet 是否清楚把 root cause 寫成 `generateDriverStatements()` 仍只吃 seed `settlementTrips`，而不是泛稱 billing bug。
3. acceptance framing 是否正確要求對齊既有 tenant invoice live-query pattern，而不是自造新的 persistence path。
4. packet 是否明確保留 consensus 結論：這個 slice不需要新 migration、也不需要 contracts / route change。
5. 驗證證據是否要求新增 driver-statement live-query coverage，而不是重複引用既有 tenant invoice live-query test。
6. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**已使用的核准語意：**

> `GAP-P2S1-003 acceptance packet ready: machine truth still keeps the parent in backlog with no formal blockers, the sidecar now matches the current review snapshot under owner Codex2 / reviewer Codex at 2026-04-17T12:19:44Z, the packet correctly frames the gap as seed-only driver statement generation against the existing tenant-invoice live-query baseline, preserves the no-migration / no-contract-change scope, and stays within support-only sidecar boundaries.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / scope drift / live-query baseline misread / overclaimed verification]`

---

## 7) Handoff Command

Owner（`Codex2`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff GAP-P2S1-003-SIDECAR-ACCEPTANCE Codex "GAP-P2S1-003 acceptance packet ready at support/sidecars/GAP-P2S1-003/GAP-P2S1-003-SIDECAR-ACCEPTANCE.md. It keeps machine truth aligned on the parent backlog state with no formal blockers, updates the sidecar to the current review snapshot under owner Codex2 / reviewer Codex at 2026-04-17T12:15:00Z, frames the gap as seed-only driver statement generation versus the existing tenant-invoice live-query pattern, preserves the no-new-schema / internal-service-change verdict from review-round-2, and packages a reviewer-usable live-trip acceptance checklist without changing canonical truth."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S1-003-SIDECAR-ACCEPTANCE "GAP-P2S1-003 acceptance packet ready: machine truth still keeps the parent in backlog with no formal blockers, the sidecar now matches the current review snapshot under owner Codex2 / reviewer Codex at 2026-04-17T12:15:00Z, the packet correctly frames the gap as seed-only driver statement generation against the existing tenant-invoice live-query baseline, preserves the no-migration / no-contract-change scope, and stays within support-only sidecar boundaries."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S1-003-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / scope drift / live-query baseline misread / overclaimed verification]"
```

目前 shared truth 已顯示這一步完成；下一步是 owner closeout。

---

## 9) Owner Closeout

此 sidecar 已進入 `review_approved`；由 owner（`Codex2`）做正式 closeout：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex2 python3 scripts/ai_status.py done GAP-P2S1-003-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S1-003 at support/sidecars/GAP-P2S1-003/GAP-P2S1-003-SIDECAR-ACCEPTANCE.md. The packet now matches the current shared-L0 review-approved snapshot, preserves the billing-settlement live-query gap baseline and no-new-schema scope, and closes the finalize handoff without changing canonical truth."
```

---

## 10) Change Log

- 2026-04-17T12:27Z — 收尾前同步 shared-L0：header/status 改為 `review_approved`，Section 2 更新 parent=`in_progress`、sidecar `last_update=2026-04-17T12:25:07Z`、補入 `2026-04-17T12:22:04Z` approve 與 `2026-04-17T12:25:08Z` finalize handoff，Section 6/8/9 一併轉為 closeout-ready wording。
- 2026-04-17T12:19Z — 依 `Codex` 在 `2026-04-17T12:18:04Z` 的 reopen 意見再次刷新 machine-state baseline：header/status 改為目前 `review` snapshot，Section 2 補入 `2026-04-17T12:14:37Z` owner handoff、`2026-04-17T12:14:47Z` reviewer detour 到 `Qwen`、`2026-04-17T12:15:05Z` auto-reassign 回 `Codex`，Section 6 與 handoff/approve wording 同步對齊 `last_update=2026-04-17T12:15:00Z` 的 shared-L0。
- 2026-04-17T12:18Z — 依 `Codex` 在 `2026-04-17T12:11:19Z` 的 reopen 意見刷新 machine-state baseline：header/status 改為當時的 `in_progress` snapshot，Section 2 補入 `12:07:21Z` handoff、`12:09:19Z` review-ready、`12:11:19Z` reopen、`12:11:29Z`/`12:13:02Z` owner rebalance 與 `12:13:05Z` worker start，Section 6 reviewer wording 同步對齊該輪 shared L0。
- 2026-04-17T12:04Z — 初版建立：依共享 machine truth、consensus docs 與 repo 掃描，整理 `GAP-P2S1-003` 的 acceptance checklist、dependency map、seed-vs-live driver statement baseline、以及 reviewer handoff 指引。
