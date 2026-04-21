# GAP-P2S3-003 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S3-003` — regulatory-registry: real-time ETA from `ops.phase1_driver_locations`  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex` / `(unset in machine truth)`  
**Last Revised:** `2026-04-18T04:18:07Z (UTC)`  
**Status:** `review_approved` (review approved by `Codex2` at `2026-04-18T04:16:51Z`; owner finalize now belongs to `Codex` after the `2026-04-18T04:16:53Z` owned-finalize dispatch)

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S3-003` 的 acceptance checklist、dependency map、repo baseline、gap inventory 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務直接實作或 closeout。

- In scope: support-only acceptance framing for replacing static ETA with `driver_locations`-backed ETA, shared-truth dependency gates, repo evidence anchors, downstream impact map, reviewer checklist, and handoff / closeout commands.
- Out of scope: 修改 `packages/contracts/src/index.ts` 的 L1 真相、直接實作 `regulatory-registry` / `owned-mobility` runtime、補 geocoding 產品語意、替 `GAP-P2S2-003` 或 `GAP-P2S2-004` 補做主線工作、或把 `GAP-P2S3-004` 的 SSE / EventSource scope 提前吃進這張 packet。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S3-003` 在 machine truth 中目前是 `backlog`，Owner=`Codex`，`reviewer=""`，effort=`M`，正式依賴只有 `GAP-P2S2-003`（V0019 migration）與 `GAP-P2S2-004`（driver location heartbeat + haversine ETA baseline）。
- 本 sidecar `GAP-P2S3-003-SIDECAR-ACCEPTANCE` 在 machine truth 中目前由 `Codex` 持有，Reviewer=`Codex2`，`status=review_approved`，task object `last_update=2026-04-18T04:16:51Z`，`next="GAP-P2S3-003 acceptance packet ready: machine truth still keeps the parent in backlog behind GAP-P2S2-003 and GAP-P2S2-004, the packet correctly frames the task as replacing static supply-pair ETA with driver_locations-backed ETA, preserves existing ETA-facing contracts as the default boundary, flags destination-coordinate sourcing as an explicit reviewer hotspot, and keeps SSE / dispatch-board scope out of this support-only sidecar."`；`Codex2` 已於 `2026-04-18T04:16:51Z` 核准，且 `2026-04-18T04:16:53Z` shared L0 已將 owner finalize dispatch 回送給 `Codex`。
- 最新 handoff / routing snapshot 以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl` 為準；本次 authoritative reviewer evidence 已更新到 `2026-04-18T04:14:24Z-2026-04-18T04:15:09Z` 這一段 reviewer-routing 鏈：owner handoff 後曾因 reviewer-terminal failure 暫時回派 `Qwen`，但 shared truth 隨後在 `2026-04-18T04:15:06Z` 自動收斂回 `Codex2`，並於 `2026-04-18T04:15:09Z` 記錄最新 wake / worker start。
- 在最新一輪 queue / activity evidence 中，可見 `2026-04-18T04:14:24Z` 的 `Codex -> Codex2` handoff row，緊接著 `2026-04-18T04:14:48Z` 的 `Codex2 -> Qwen` reviewer rebalance、`2026-04-18T04:14:53Z` 的 `Qwen` worker start、`2026-04-18T04:15:06Z` 的 auto-reassignment back to `Codex2`，以及 `2026-04-18T04:15:09Z` 的 `Codex2` wake / worker start evidence。
- reviewer-routing 鏈在本 task 上於 `2026-04-18T04:10:20Z-2026-04-18T04:12:24Z` 再次來回於 `Codex2` / `Qwen` 之間，最後共享 machine truth 收斂到：
  - `2026-04-18T04:10:20Z` 因 `Codex2` unavailable/occupied，reviewer 暫時 rebalance 給 `Qwen`
  - `2026-04-18T04:10:25Z` 啟動第一輪 `Qwen` reviewer worker
  - `2026-04-18T04:11:00Z` 因 Qwen token failure 自動回派 reviewer 給 `Codex2`
  - `2026-04-18T04:11:06Z` 再次發生 availability-first rebalance，reviewer 暫時切回 `Qwen`
  - `2026-04-18T04:11:25Z` 啟動第二輪 `Qwen` reviewer worker
  - `2026-04-18T04:11:40Z` 因 Qwen token failure 自動回派 reviewer 給 `Codex2`
  - `2026-04-18T04:11:45Z` 再次發生 availability-first rebalance，reviewer 暫時切回 `Qwen`
  - `2026-04-18T04:12:08Z` 啟動第三輪 `Qwen` reviewer worker
  - `2026-04-18T04:12:16Z` shared L0 再寫入最新 `Qwen -> Codex2` pending handoff row
  - `2026-04-18T04:12:21Z` 因 Qwen token failure 自動收斂回 `Codex2`
  - `2026-04-18T04:12:24Z` 記錄最新 `Codex2` wake 與 worker start，作為目前等待 reviewer 回應的 authoritative snapshot
- Planning / consensus 對此 task 的產品語意其實很窄：
  - `starter-draft.md:406` 只有 backlog table row：`GAP-P2S3-003 | regulatory-registry real-time ETA | Qwen | M`。
  - `consensus-packet.md:57` 收斂為 `regulatory-registry: real-time ETA from driver_locations | Codex | M | V0019 + GAP-P2S2-004`。
  - 也就是說，`GAP-P2S3-003` 在 accepted docs 中沒有額外的獨立 endpoint / contract prose；已明確寫清楚的 ETA baseline 邏輯主要仍在 `GAP-P2S2-004`（`GET /driver-eta` + haversine）。

### Repo Baseline Anchors

- `apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts` 目前只有 vehicles / drivers / contracts / policies / exclusivities routes，**不存在** `driver-location` 或 `driver-eta` 路由；代表 `GAP-P2S2-004` 尚未落地，parent formal gate 仍未解除。
- `apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts` 目前只讀寫 `reg.phase1_registry_*` tables 與 `reg.phase1_registry_supply_pairs`；repo 內沒有任何 `ops.phase1_driver_locations` read path。
- `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:569-599` 的 `getEligibleCandidates()` 目前直接把 `pair.etaMinutes` 從既有 `supplyPairs` 帶出，這是**靜態 ETA baseline**，不是 live location-backed ETA。
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:819-840,1022-1030` 目前把 `getEligibleCandidates(order.serviceBucket)` 的結果直接用在 dispatch candidate list 與 `DispatchJobRecord.latestEtaMinutes`；因此 ETA consumer surfaces 已經存在，但資料來源仍是 static supply-pair seed。
- `packages/contracts/src/index.ts:454-457,710-723` 已有 `EtaSnapshot.etaMinutes`、`DispatchCandidate.etaMinutes`、`DispatchJobRecord.latestEtaMinutes`；就 repo 現況來看，`GAP-P2S3-003` 預設**不需要**再新開 ETA 類 contracts 才能讓現有 consumer surfaces 吃到 live value。
- `packages/contracts/src/index.ts:442-444,627-628` 的 `AddressPayload` / `OwnedOrderRecord.pickup` / `dropoff` 目前只有地址字串，沒有座標欄位；這是 parent 實作時最需要明講的隱性前提，因為「從 driver_locations 算 ETA」必須先說明 destination coordinates 來源。
- `packages/api-client/src/index.ts:375-387` 已有 `listDispatchJobs()` / `listDispatchCandidates()`，但沒有任何 dedicated `driver-eta` client method；這再次說明現有 UI 消費點在 dispatch surfaces，而不是一條新的前端直連 client API。
- repo 掃描目前找不到 `ops.phase1_driver_locations` 的 runtime usage；它只出現在 accepted planning docs 與 `GAP-P2S2-003` / `GAP-P2S2-004` sidecar packet。

### Gap Summary

| 問題                                                     | 影響                                                                     | 根本原因                                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| ETA source 仍是 `supplyPairs[].etaMinutes`               | dispatch candidates / dispatch jobs 顯示的 ETA 不是 live location-backed | `GAP-P2S3-003` 尚未把 source-of-truth 從 static pair seed 切到 `driver_locations` |
| `ops.phase1_driver_locations` 尚無 read path             | regulatory-registry 無法從最新 driver coordinates 算出 ETA               | `GAP-P2S2-003` / `GAP-P2S2-004` 仍未完成                                          |
| accepted docs 沒有額外定義新 contract / 新 endpoint      | 容易在 parent 實作時 scope 漂移，誤把本 task 寫成另一張 API / SSE 票     | `GAP-P2S3-003` 只在 backlog row 被命名，沒有額外 prose                            |
| order / dispatch payload 缺少 pickup/dropoff coordinates | 若要把 live ETA 灌回 dispatch surfaces，destination source 必須被明講    | 現有 `AddressPayload` 只有 address string                                         |

---

## 3) Parent Acceptance Framing

`GAP-P2S3-003` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把共享 truth、accepted planning 與 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Formal dependency gates must be satisfied before parent closeout

- [ ] `GAP-P2S2-003` 已完成，repo 內存在 `V0019__driver_locations.sql`，且 `ops.phase1_driver_locations` 成為可查詢的 migration truth。
- [ ] `GAP-P2S2-004` 已完成，至少有一條被證據支持的 live ETA baseline 可從 `driver_locations` 計算，而不是仍停留在 planning-only / sidecar-only 狀態。
- [ ] reviewer 不應接受任何繞過 formal gates 的 parent closeout，例如僅靠新的 in-memory ETA seed、僅重命名 `pair.etaMinutes`、或只改 UI 文案卻未打通 `driver_locations` 來源。

### AC-2 — ETA source-of-truth must move from static `supplyPairs` to live `driver_locations`

- [ ] 若 parent 宣稱完成，repo evidence 必須顯示 ETA 已不再單純由 `reg.phase1_registry_supply_pairs.record.etaMinutes` 充當來源。
- [ ] reviewer 不應接受 `RegulatoryRegistryService.getEligibleCandidates()` 仍原封不動回傳 `pair.etaMinutes` 的 closeout。
- [ ] 若 `supplyPairs` 仍保留做 vehicle / driver pairing，ETA 也必須是另行以 live location 計算後覆寫或補入，而不是把 pair seed 當成「real-time」。
- [ ] 若最新 driver location 缺失，fallback 行為必須明確且有證據，不可靜默把舊 static ETA 冒充為 live ETA。

### AC-3 — Existing ETA consumer contracts should remain stable unless an explicit truth change is reviewed

- [ ] `DispatchCandidate.etaMinutes`、`DispatchJobRecord.latestEtaMinutes`、`EtaSnapshot.etaMinutes` 這些既有 consumer-facing fields 預設可沿用；parent closeout 不應無故夾帶新的 L1 contract churn。
- [ ] `packages/api-client` 既有 `listDispatchJobs()` / `listDispatchCandidates()` flow 應維持可用，除非 parent owner 明確另開 canonical truth 變更。
- [ ] reviewer 若看到 parent closeout 把本 task包成新 public endpoint / 新 DTO 擴張，應要求說明其必要性與是否超出 accepted backlog row。

### AC-4 — Destination coordinate source must be explicit and evidence-backed

- [ ] 由於目前 `OwnedOrderRecord.pickup` / `dropoff` 仍是 string-only `AddressPayload`，parent closeout 必須清楚說明 ETA destination lat/lng 的來源，而不是隱含假設。
- [ ] 可接受的說明方向包含：重用 `GAP-P2S2-004` 已建立的 `driver-eta` baseline、從現有 canonical data source 讀取 coordinates、或把 scope 嚴格限制在已知 destination coordinates 的 surface。
- [ ] reviewer 不應接受未經證實的 geocoding 假設、硬編碼座標、或以 address string 直接偽裝成精準 ETA 計算。

### AC-5 — Parent evidence must show at least one live ETA read path, but must not overclaim SSE scope

- [ ] 若 parent 宣稱完成，應至少有一個 ETA consumer path 真的吃到 live value，例如 dispatch candidate list、dispatch job `latestEtaMinutes`、或其他 regulatory-registry read path。
- [ ] 「real-time」在本 task 中可被接受為 on-demand / read-time recomputation；它**不等於** SSE / EventSource push transport。
- [ ] reviewer 不應接受把 `GAP-P2S3-004` 的 dispatch board live updates 或 `GAP-P2S2-007` 的 SSE task events 一併宣稱完成。

### AC-6 — Verification should prove ETA changes when driver location changes

- [ ] parent closeout 應提供一組 evidence，證明當 driver coordinates 改變時，回傳或呈現的 ETA 會跟著改變，而不是永遠固定在 seed value。
- [ ] 合理證據可以是 unit tests、service-level tests、repository-backed request example、或人工驗證步驟；但重點必須是「live location affects ETA output」。
- [ ] 如果正式 dependencies 尚未滿足，reviewer 應要求 reopen，而不是接受「先以靜態數值佔位、之後再補」的 closeout。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`GAP-P2S3-003.depends_on=["GAP-P2S2-003","GAP-P2S2-004"]`。

| Dep    | Source         | Status    | Notes                                                                                           |
| ------ | -------------- | --------- | ----------------------------------------------------------------------------------------------- |
| D-UP-1 | `GAP-P2S2-003` | `backlog` | 必要前置：`ops.phase1_driver_locations` migration 與 schema baseline                            |
| D-UP-2 | `GAP-P2S2-004` | `backlog` | 必要前置：driver heartbeat upsert 與 live ETA baseline（haversine + driver location read path） |

### Practical Review Dependencies

| Dep   | Type                                              | Why It Matters                                                                                        |
| ----- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| D-P-1 | `starter-draft.md:406` + `consensus-packet.md:57` | accepted scope 只有「real-time ETA from driver_locations」這個窄 row，沒有更多產品語意可任意擴張      |
| D-P-2 | `regulatory-registry.service.ts:569-599`          | 目前 static ETA baseline 的直接證據；review 時應確認這一段是否被 live source 取代                     |
| D-P-3 | `owned-mobility.service.ts:819-840,1022-1030`     | dispatch jobs / candidates 已是 ETA consumer surfaces，可用來檢查 live value 是否真正進入既有 runtime |
| D-P-4 | `packages/contracts/src/index.ts:442-444,627-628` | pickup / dropoff 只有 address string，destination coordinate source 必須被 explicitly 說明            |
| D-P-5 | `packages/contracts/src/index.ts:454-457,710-723` | 現有 ETA-facing contracts 已存在，可作為「盡量不動 L1 truth」的邊界                                   |

### Forward (Downstream) Dependencies

| Dep     | Status                                  | Why It Matters                                                                                                  |
| ------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| D-FWD-1 | `GAP-P2S3-004` (`backlog`)              | ops-console SSE dispatch board live updates 直接依賴此 task 提供可更新的 ETA 值來源                             |
| D-FWD-2 | dispatch analytics / dashboard surfaces | `averageEtaMinutes` 與 dispatch card 目前讀 `latestEtaMinutes`；live ETA 若落地，可被現有 ops surfaces 立即吃到 |
| D-FWD-3 | future driver-facing / ops read models  | 任何沿用 `DispatchCandidate.etaMinutes` 或 `EtaSnapshot` 的 surface 都會受到 source-of-truth 切換影響           |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md`
- Repo anchors:
  - `apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts`
  - `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`
  - `apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  - `packages/contracts/src/index.ts`
  - `packages/api-client/src/index.ts`
  - `apps/ops-console-web/lib/ops-analytics.ts`
  - `apps/ops-console-web/app/dashboard/page.tsx`
  - `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`

---

## 5) Evidence Inventory

| ID   | Evidence                                                    | Expected Anchor                                                           |
| ---- | ----------------------------------------------------------- | ------------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                              | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`              |
| E-2  | Accepted Sprint 3 backlog row for `GAP-P2S3-003`            | `consensus-packet.md:57`                                                  |
| E-3  | Starter draft only names the task without extra prose       | `starter-draft.md:406`                                                    |
| E-4  | `GAP-P2S2-003` + `GAP-P2S2-004` are formal blockers         | `ai-status.json:3532-3543`, `current-work.md:64`                          |
| E-5  | No `driver-location` / `driver-eta` routes yet              | `regulatory-registry.controller.ts`                                       |
| E-6  | Static ETA still comes from `supplyPairs[].etaMinutes`      | `regulatory-registry.service.ts:569-599`                                  |
| E-7  | Repository never reads `ops.phase1_driver_locations`        | `regulatory-registry.repository.ts`                                       |
| E-8  | Existing consumer surfaces already use ETA fields           | `owned-mobility.service.ts:819-840,1022-1030`, `ops-analytics.ts:176-192` |
| E-9  | Existing contracts already expose ETA fields                | `packages/contracts/src/index.ts:454-457,710-723`                         |
| E-10 | pickup / dropoff currently lack coordinates                 | `packages/contracts/src/index.ts:442-444,627-628`                         |
| E-11 | API client consumes dispatch ETA through existing endpoints | `packages/api-client/src/index.ts:375-387`                                |
| E-12 | dashboard / dispatch UI already render ETA or `ETA pending` | `dashboard/page.tsx:166-171`, `dispatch-workflow.tsx:54-64`               |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S3-003` 仍是 `backlog`，owner=`Codex`，正式依賴只有 `GAP-P2S2-003` / `GAP-P2S2-004`；sidecar 目前已是 `review_approved`，owner=`Codex`，reviewer=`Codex2`，且 latest review/ownership snapshot 已收斂到 `2026-04-18T04:16:51Z` 的 `Codex2` approval 與 `2026-04-18T04:16:53Z` 的 owner finalize dispatch。
2. packet 是否把 accepted scope 維持在「real-time ETA from driver_locations」這個 backlog row，而沒有自行擴成 SSE、geocoding、或新 public contract 設計票。
3. AC-2 是否正確把 reviewer 焦點放在「替換 static `pair.etaMinutes` source」而不是做表面 rename。
4. AC-4 是否正確標出 destination coordinate source 目前在 repo 內不是顯式產品真相，要求 parent closeout 必須說清楚而不是偷偷假設。
5. AC-3 是否合理保守：既有 `DispatchCandidate.etaMinutes` / `DispatchJobRecord.latestEtaMinutes` 已可承載 live value，預設不需要額外 contract churn。
6. AC-5 是否正確區分本 task 與 `GAP-P2S3-004`：本 task 要求 live ETA read path，不要求 SSE push。
7. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S3-003 acceptance packet ready: machine truth still keeps the parent in backlog behind GAP-P2S2-003 and GAP-P2S2-004, the packet correctly frames the task as replacing static supply-pair ETA with driver_locations-backed ETA, preserves existing ETA-facing contracts as the default boundary, flags destination-coordinate sourcing as an explicit reviewer hotspot, and keeps SSE / dispatch-board scope out of this support-only sidecar.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / overreach beyond accepted backlog row / weak static-vs-live ETA boundary / missing destination-coordinate hotspot / accidental contract or SSE scope drift]`

---

## 7) Handoff Command

若之後 packet 需要再修訂並重新送審，owner（`Codex`）可再次交給 reviewer（`Codex2`）：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff GAP-P2S3-003-SIDECAR-ACCEPTANCE Codex2 "GAP-P2S3-003 acceptance packet refreshed at support/sidecars/GAP-P2S3-003/GAP-P2S3-003-SIDECAR-ACCEPTANCE.md. It keeps machine truth aligned on parent backlog behind GAP-P2S2-003 and GAP-P2S2-004, updates the sidecar review snapshot to the latest 2026-04-18T04:14:24Z owner handoff plus the 2026-04-18T04:14:48Z-2026-04-18T04:15:09Z reviewer-routing chain ending in the latest Codex2 wake/worker-start evidence after transient Qwen fallback, frames the core acceptance check as replacing static supply-pair ETA with driver_locations-backed ETA, preserves existing ETA-facing contracts as the default boundary, flags destination-coordinate sourcing as a required explicit decision, and keeps SSE or dispatch-board scope out of this support-only sidecar."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve GAP-P2S3-003-SIDECAR-ACCEPTANCE "GAP-P2S3-003 acceptance packet ready: machine truth still keeps the parent in backlog behind GAP-P2S2-003 and GAP-P2S2-004, the packet correctly frames the task as replacing static supply-pair ETA with driver_locations-backed ETA, preserves existing ETA-facing contracts as the default boundary, flags destination-coordinate sourcing as an explicit reviewer hotspot, and keeps SSE / dispatch-board scope out of this support-only sidecar."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen GAP-P2S3-003-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / overreach beyond accepted backlog row / weak static-vs-live ETA boundary / missing destination-coordinate hotspot / accidental contract or SSE scope drift]"
```

---

## 9) Owner Closeout

此 sidecar 已經完成 reviewer 核准；目前由 owner（`Codex`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done GAP-P2S3-003-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S3-003 at support/sidecars/GAP-P2S3-003/GAP-P2S3-003-SIDECAR-ACCEPTANCE.md. The packet preserves the formal V0019 plus GAP-P2S2-004 dependency gate, the static-versus-live ETA source boundary, the destination-coordinate reviewer hotspot, the downstream dependency map into GAP-P2S3-004 and existing dispatch ETA consumers, and the non-canonical support-only handoff path without changing runtime or L1 truth."
```

Parent absorption / 主線採納仍由 parent owner `Codex` 視需要決定，不由此 sidecar 自動推進。

---

## 10) Change Log

- 2026-04-18T04:18:07Z — review-approved sync：將 header、current-state baseline、reviewer hotspot 與 owner closeout 說明對齊 shared L0 最新 machine truth，明記 `Codex2` 已於 `2026-04-18T04:16:51Z` 核准，且 `2026-04-18T04:16:53Z` owner finalize dispatch 已回到 `Codex`；acceptance framing、dependency map、static-versus-live ETA 邊界、destination-coordinate hotspot 與 SSE scope fence 不變。
- 2026-04-18T04:15:09Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T04:14:24Z-2026-04-18T04:15:09Z` 的最新 reviewer-routing 鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T04:14:24Z` 的 owner handoff、`2026-04-18T04:14:48Z` 的暫時 `Codex2 -> Qwen` rebalance、`2026-04-18T04:15:06Z` 的 auto-reassignment，以及 `2026-04-18T04:15:09Z` 的 `Codex2` wake / worker start；原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T04:12:24Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T04:10:20Z-2026-04-18T04:12:24Z` 的 reviewer 再次改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T04:12:16Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T04:12:21Z` 的 auto-reassignment，以及 `2026-04-18T04:12:24Z` 的 `Codex2` wake / worker start；並明記 `current-work.md` 因生成於 `2026-04-18T04:12:49Z` 而已反映 pending handoff row，最新 reviewer authoritative evidence 仍以 activity log 為準。原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T01:47:17Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T01:46:03Z-2026-04-18T01:47:17Z` 的 reviewer 再次改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T01:47:08Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T01:47:14Z` 的 auto-reassignment，以及 `2026-04-18T01:47:17Z` 的 `Codex2` wake / worker start；並明記 `current-work.md` 因生成於 `2026-04-18T01:47:09Z` 而只收進 pending handoff row。原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T01:41:40Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T01:40:49Z-2026-04-18T01:41:40Z` 的 reviewer 再次改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T01:41:30Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T01:41:37Z` 的 auto-reassignment，以及 `2026-04-18T01:41:40Z` 的 `Codex2` wake / worker start；並明記 `current-work.md` 因生成於 `2026-04-18T01:41:31Z` 而只收進 pending handoff row。原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T01:39:02Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T01:37:27Z-2026-04-18T01:39:02Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T01:38:52Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T01:38:59Z` 的 auto-reassignment 與 `Codex2` wake / worker start，以及 `2026-04-18T01:39:02Z` 的 superseded `Qwen` worker evidence；並明記 `current-work.md` 因生成於 `2026-04-18T01:38:53Z` 而只收進 pending handoff row。原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T01:34:03Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T01:32:15Z-2026-04-18T01:34:03Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T01:33:47Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T01:33:53Z` 的 auto-reassignment，以及 `2026-04-18T01:34:03Z` 的 `Codex2` wake / worker start；並明記 `current-work.md` 因生成於 `2026-04-18T01:33:57Z` 而只收進 pending handoff row。原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T01:29:41Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T01:28:28Z-2026-04-18T01:29:41Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T01:29:32Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T01:29:38Z` 的 auto-reassignment，以及 `2026-04-18T01:29:41Z` 的 `Codex2` wake / worker start；並明記 `current-work.md` 因生成於 `2026-04-18T01:29:33Z` 而只收進 pending handoff row。原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T01:24:36Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T01:23:01Z-2026-04-18T01:24:36Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T01:24:27Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T01:24:33Z` 的 auto-reassignment、`2026-04-18T01:24:34Z` 的 `Codex2` wake / worker start，以及 `2026-04-18T01:24:36Z` 的 superseded `Qwen` worker evidence；並明記 `current-work.md` 因生成於 `2026-04-18T01:24:28Z` 而只收進 pending handoff row。原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T01:20:10Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T01:19:11Z-2026-04-18T01:20:10Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T01:19:54Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T01:20:01Z` 的 auto-reassignment，以及 `2026-04-18T01:20:10Z` 的 `Codex2` wake / worker start；並明記 `current-work.md` 因生成於 `2026-04-18T01:20:05Z` 而只收進 pending handoff row。原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-17T18:44Z — 初版建立：依 shared L0 truth、accepted `consensus-packet.md` / `starter-draft.md` row、以及 repo scan（`regulatory-registry.service.ts` 仍由 static `supplyPairs[].etaMinutes` 提供 ETA、`regulatory-registry.repository.ts` 尚無 `driver_locations` read path、`owned-mobility` / ops-console 已有 ETA consumer surfaces、但 pickup / dropoff 仍缺座標欄位）整理 `GAP-P2S3-003` 的 acceptance framing、dependency map、reviewer hotspots 與 `Codex2` handoff 指引。
- 2026-04-18T01:15:27Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T01:14:32Z-2026-04-18T01:15:27Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T01:15:18Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T01:15:24Z` 的 auto-reassignment，以及 `2026-04-18T01:15:27Z` 的 `Codex2` wake / worker start；並明記 `current-work.md` 因生成於 `2026-04-18T01:15:19Z` 而略晚於最新 activity log。原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T01:12:42Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T01:11:40Z-2026-04-18T01:12:42Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T01:12:35Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T01:12:41Z` 的 auto-reassignment，以及 `2026-04-18T01:12:42Z` 的 `Codex2` wake / worker start；原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T00:36:54Z — metadata refresh：將 header、current-state、reviewer hotspot 與 handoff command 對齊 shared L0 最新 machine truth（sidecar 仍為 `review`、owner=`Codex`、reviewer=`Codex2`、`ai-status.json.last_update=2026-04-18T00:36:45Z`、`next` 為最新 `Qwen -> Codex2` 自動回派）；並補入 `2026-04-18T00:35:33Z-2026-04-18T00:36:54Z` reviewer-routing 鏈與最新 pending handoff / wake evidence，acceptance framing 本身不變。
- 2026-04-18T00:38:19Z — owner handoff refresh：依最新 shared L0 再次對齊 packet metadata 與 reviewer hotpot，將 authoritative row 更新為 `ai-status.json.last_update=2026-04-18T00:38:19Z`、`current-work.md` 的 pending `Codex -> Codex2` handoff row，並補入 `ai-activity-log.jsonl` 中同 timestamp 的 `Codex` handoff event；原有 parent backlog / formal dependency、static-versus-live ETA 邊界、destination-coordinate hotspot 與 SSE scope fence 均未改動。
- 2026-04-18T00:40:02Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state 與 handoff command 對齊 `2026-04-18T00:39:38Z-2026-04-18T00:40:02Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer handoff 為 `2026-04-18T00:39:52Z` 的 `Qwen -> Codex2` pending row，並保留 packet 的 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T00:45:10Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T00:44:19Z-2026-04-18T00:44:46Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T00:44:36Z` 的 `Qwen -> Codex2` 自動回派加上 `2026-04-18T00:44:46Z` 的 `Codex2` wake / worker start；原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T00:49:27Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T00:48:22Z-2026-04-18T00:49:00Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T00:48:52Z` 的 `Qwen -> Codex2` pending handoff 加上 `2026-04-18T00:48:58Z` 的 `Codex2` wake / worker start，並補記 `2026-04-18T00:49:00Z` 的 superseded worker evidence；原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T00:53:27Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T00:52:08Z-2026-04-18T00:53:25Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T00:53:10Z` 的 `Qwen -> Codex2` pending handoff 加上 `2026-04-18T00:53:25Z` 的 `Codex2` wake / worker start；原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T00:58:13Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T00:55:55Z-2026-04-18T00:58:03Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T00:57:55Z` 的 `Qwen -> Codex2` pending handoff 加上 `2026-04-18T00:58:03Z` 的 `Codex2` wake / worker start；原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T01:03:13Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T01:01:38Z-2026-04-18T01:03:13Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T01:03:03Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T01:03:10Z` 的 auto-reassignment，以及 `2026-04-18T01:03:13Z` 的 `Codex2` wake / worker start；原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
- 2026-04-18T01:07:47Z — reviewer-routing refresh：依 shared L0 最新狀態將 header、current-state、reviewer hotspot 與 handoff command 對齊 `2026-04-18T01:06:38Z-2026-04-18T01:07:47Z` 的 reviewer 來回改派鏈，更新 authoritative reviewer snapshot 為 `2026-04-18T01:07:38Z` 的 `Qwen -> Codex2` pending handoff、`2026-04-18T01:07:44Z` 的 auto-reassignment，以及 `2026-04-18T01:07:47Z` 的 `Codex2` wake / worker start；原有 parent backlog / dependency gate / static-versus-live ETA 邊界 / destination-coordinate hotspot / SSE scope fence 不變。
