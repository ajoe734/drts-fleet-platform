# GAP-P2S3-004 Acceptance Packet & Capability Audit

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S3-004` — ops-console: SSE dispatch board live updates  
**Current Sidecar Owner:** `Claude`  
**Assigned Reviewer:** `Codex`  
**Parent Owner:** `Codex2` (per machine truth, `status=backlog`, `depends_on: GAP-P2S2-007, GAP-P2S3-003`)  
**Last Revised:** `2026-04-17T18:51Z (UTC)`  
**Status:** `review` — shared L0 keeps sidecar owner=`Claude`, reviewer=`Codex`, `last_update=2026-04-17T18:46:18Z`; pending reviewer response belongs to `Codex` after the availability-first reassignment from `Codex2`

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S3-004` 的 acceptance checklist、dependency map、repo baseline 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務直接實作。

- **In scope:** support-only acceptance framing, ops-console dispatch board current coverage map, SSE consumer integration gaps, identified gaps between current state and consensus requirement (C-2), dependency state audit for upstream `GAP-P2S2-007` + `GAP-P2S3-003`, reviewer checklist.
- **Out of scope:** 修改 `apps/ops-console-web/app/dispatch/page.tsx`、`dispatch-workflow.tsx`、任何後端 SSE endpoint / controller / service 主線 runtime、修改 `packages/contracts/src/index.ts`（L1 真相）、引入 Redis pub-sub、修改 `GAP-P2S2-007` 的 API backbone，或修改 auth guard。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S3-004` 在 machine truth 中目前是 `backlog`，Owner=`Codex2`，依賴 `GAP-P2S2-007`（backlog）+ `GAP-P2S3-003`（backlog），sizing=`M`（~120 LOC + frontend）。
- 本 sidecar `GAP-P2S3-004-SIDECAR-ACCEPTANCE` 在 machine truth 中目前是 `review`，Owner=`Claude`，Reviewer=`Codex`；最新 task-specific routing 為 `2026-04-17T18:46:18Z` 的 availability-first reassignment（`Codex2 -> Codex`），`current-work.md` 也有對應 pending handoff row。
- Consensus 要求（`starter-draft.md:178-187` C-2 segment）：
  - `GET /api/ops/dispatch-events` → SSE stream (`text/event-stream`)
  - ops-console 前端 EventSource 客戶端
  - 事件：新訂單、派遣狀態更新、司機位置更新
  - 阻斷依賴：C-1（`GAP-P2S2-007`）+ A-4（司機位置資料，即 `GAP-P2S3-003`）
- Consensus packet 收錄（`consensus-packet.md:58`）：`GAP-P2S3-004`、Owner=`Codex2`、sizing=`M`、depends on `C-1 + GAP-P2S3-003`。
- 上游 `GAP-P2S2-007` sidecar（`support/sidecars/GAP-P2S2-007/GAP-P2S2-007-SIDECAR-ACCEPTANCE.md`）已完整整理，狀態 `review`，Reviewer=`Codex2`。
- 上游 `GAP-P2S3-003` sidecar（`support/sidecars/GAP-P2S3-003/GAP-P2S3-003-SIDECAR-ACCEPTANCE.md`）已建立，Owner=`Codex`，Reviewer=`Codex2`，目前狀態 `review`。

### Repo Baseline Anchors — Dispatch Board Current State

以下為 `dispatch-workflow.tsx` 目前**已實作**的能力（`apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`，~572 LOC）：

| 操作                            | UI 入口                                                              | 備註                                                                             |
| ------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| List all orders + dispatch jobs | `dispatch/page.tsx` 以 `getOpsClient()` + `Promise.all` 載入初始資料 | 目前是 Client Component page，但資料仍只在頁面 render 時抓一次，不做 live update |
| Queue state computation         | `getQueueState()` — `pending` / `reserved` / `exception`             | 根據 order.status + job.status 計算                                              |
| Filter modes                    | `all` / `attention` / `queued` chip buttons                          | 用戶手動切換，無 SSE 觸發                                                        |
| Search                          | `searchValue` + `useDeferredValue`                                   | orderId / orderNo / serviceBucket / status                                       |
| Queue summary cards             | Pending / Reserved / Exception count                                 | display-only，無 live count                                                      |
| Candidates fetch                | `listDispatchCandidates(jobId)` on demand                            | 手動點擊才 fetch                                                                 |
| Assign driver                   | `assignDispatch()` + `router.refresh()`                              | 操作後以 `router.refresh()` 重新拉取全頁，無 SSE                                 |
| Reassign driver                 | `redispatchOrder()` + `router.refresh()`                             | 同上                                                                             |
| Redispatch                      | `redispatchOrder()` + `router.refresh()`                             | 同上                                                                             |
| ETA display                     | `job.latestEtaMinutes` from static load                              | 無 realtime update，ETA 是靜態值                                                 |
| Row highlights                  | `row-focused` / `row-alert` / `row-warning` by order.status          | 靜態條件 class                                                                   |

**Summary:** dispatch board 有完整的 CRUD + filter + candidate fetch 基礎，並以 `router.refresh()` 應急處理後端狀態變更。完全沒有 SSE 消費能力；所有資料皆為頁面載入時的靜態快照。

---

## 3) Gap Inventory

以下 gap 根據 consensus 需求（`starter-draft.md:178-187` C-2 + `consensus-packet.md:58`）與完整 dispatch board 掃描整理，依優先順序排列。

### 優先等級定義

- **P0 – 功能缺口**：consensus 明確要求、父任務完成條件必須具備
- **P1 – UX 完整性**：consensus 要求的 realtime 體驗強化，構成 live dispatch board
- **P2 – 品質/一致性**：非 P0/P1 但值得記錄

---

#### GAP-DSP-001 — 前端完全沒有 SSE consumer（EventSource client）（P0）

**檔案：** `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`（目前無任何 EventSource 使用）  
**問題：** dispatch-workflow.tsx 目前只用 `router.refresh()` 做靜態刷新，沒有任何 `EventSource` / SSE consumer 實作。要接收 `GET /api/ops/dispatch-events` 的推送事件，需在既有 Client Component（`dispatch-workflow.tsx` 或 page-level client host）中加入 `useEffect` 管理 EventSource 生命週期。  
**需求來源：** `starter-draft.md:182` — 明確要求「ops-console 前端 EventSource 客戶端」。  
**影響：** 沒有 SSE consumer，派遣狀態更新與司機位置更新無法即時推到 UI；ops 人員只能靠手動刷新或操作後的 `router.refresh()`。  
**實作估算：** ~30-40 LOC（`useEffect` + `EventSource` 生命週期管理、event handler dispatch、cleanup on unmount）。

---

#### GAP-DSP-002 — 後端 `GET /api/ops/dispatch-events` SSE route 尚不存在（P0）

**位置：** `apps/api/src/modules/` — 目前無任何 `dispatch-events` route  
**問題：** GAP-P2S2-007 只建立 `GET /api/driver/task-events`（driver-facing），ops-console 需要另一個獨立 ops-facing SSE endpoint `GET /api/ops/dispatch-events`。兩個 stream 的授權受眾（driver vs ops）不同，不能共用。  
**需求來源：** `starter-draft.md:181` — 「`GET /api/ops/dispatch-events` → SSE stream」；`consensus-packet.md:58` 明確標注 `GAP-P2S3-004` 為獨立 task 不是 GAP-P2S2-007 的衍生。  
**影響：** 前端 SSE consumer 必須有對應後端 endpoint；若後端 endpoint 未建立，整個 live update 無法 e2e 驗證。  
**實作估算：** ~50-60 LOC（NestJS `@Sse()` route + ops realm auth policy + `EventEmitterModule` 訂閱，延伸自 GAP-P2S2-007 的 EventEmitter backbone）。

---

#### GAP-DSP-003 — ETA 欄位無 realtime 更新（P0）

**檔案：** `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:274-277`  
**問題：** ETA 欄位顯示 `job.latestEtaMinutes`，此值來自初始 render snapshot，不反映 `GAP-P2S3-003` 的即時 ETA 資料（`ops.phase1_driver_locations`）。SSE stream 需在 `driver_location_updated` 事件到達時更新 UI 中的 ETA 顯示值。  
**需求來源：** `starter-draft.md:183` 要求 stream 包含「司機位置更新」事件；`GAP-P2S3-004.depends_on` 包含 `GAP-P2S3-003`（real-time ETA）。  
**影響：** 缺少 ETA realtime 更新導致 ops 人員依賴的候車時間資訊落後；高頻調度場景（多個 pending order）影響最大。  
**實作估算：** ~15-20 LOC（SSE handler 對 `driver_location_updated` 事件，更新 local state 中對應 job 的 `latestEtaMinutes`）。

---

#### GAP-DSP-004 — 新訂單入列無 realtime 推送（P0）

**檔案：** `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:98-130`  
**問題：** `filteredOrders` 來自靜態 props，不可能在 SSE 事件中看到新訂單。consensus 明確要求「新訂單」作為 dispatch-events 的事件類型之一。  
**需求來源：** `starter-draft.md:183` — 「事件：新訂單、派遣狀態更新、司機位置更新」。  
**影響：** 新訂單需要靜態刷新或 ops 人員手動重新載入才能看到，在高頻業務場景下會有明顯延遲。  
**實作估算：** ~10-15 LOC（SSE handler 對 `order_created` / `dispatch_order_created` 事件，在 local state 中 push 新訂單到 orders 列表）。

---

#### GAP-DSP-005 — 派遣狀態無 realtime 更新（P0）

**檔案：** `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:266-317`  
**問題：** DispatchJobRecord 的 status（queued / matching / reserved / assigned / failed / redispatch_required）完全靠靜態載入，dispatch action 後只透過 `router.refresh()` 間接更新。若另一個 ops agent 改了 dispatch 狀態，本頁面無法感知。  
**需求來源：** `starter-draft.md:183` — 「派遣狀態更新」作為 stream event 之一。  
**影響：** 多人同時使用 dispatch board（或自動化 dispatch engine）時，狀態衝突只能靠手動刷新解決；高於 `router.refresh()` 延遲的動態資料不可見。  
**實作估算：** ~10-15 LOC（SSE handler 對 `dispatch_status_updated` 事件，更新 local state 中對應 job 的 `status`）。

---

#### GAP-DSP-006 — 無 SSE 連線狀態指示（P1）

**問題：** 前端 EventSource 連線中斷（網路問題、伺服器重啟）時，目前無任何機制通知 ops 人員資料已停止即時更新。需要 connection indicator 或 fallback reconnect visual。  
**需求來源：** `GAP-P2S2-007` sidecar AC-6 要求 reconnect policy 顯式表達，`GAP-P2S3-004` 作為 consumer 必須呈現這個狀態。  
**影響：** 連線中斷時 ops 人員以為資料還是 live，做出錯誤的調度判斷。  
**實作估算：** ~10-15 LOC（EventSource `onerror` + `onopen` handler → `connectionStatus` state → banner 或 indicator）。

---

#### GAP-DSP-007 — Queue summary cards 無 realtime 計數（P2）

**檔案：** `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:188-195`  
**問題：** `queueCounts`（pending / reserved / exception）由靜態 `filteredOrders` 計算，若 SSE 推送 GAP-DSP-004/005 的 order/dispatch status 更新，這些計數若不跟著更新則會顯示舊資料。  
**影響：** 非阻斷，但 live order / live status 更新後 queue count 不同步，造成頁面頂端 summary 與下方表格不一致。  
**實作估算：** ~5 LOC（確保 SSE state update 觸發 `queueCounts` recompute；若 `queueCounts` 已是 derived 計算，自動免費）。

---

### Gap Priority Summary

| ID          | 優先 | 說明                                       | 是否阻斷 GAP-P2S3-004 parent                              |
| ----------- | ---- | ------------------------------------------ | --------------------------------------------------------- |
| GAP-DSP-001 | P0   | 無前端 EventSource consumer                | **是**（核心 realtime 能力）                              |
| GAP-DSP-002 | P0   | 後端 `GET /api/ops/dispatch-events` 不存在 | **是**（e2e 無法驗證）                                    |
| GAP-DSP-003 | P0   | ETA 欄無 realtime 更新                     | **是**（consensus 明確要求 driver location stream）       |
| GAP-DSP-004 | P0   | 新訂單入列無 realtime 推送                 | **是**（consensus 明確要求 order_created 事件）           |
| GAP-DSP-005 | P0   | 派遣狀態無 realtime 更新                   | **是**（consensus 明確要求 dispatch_status_updated 事件） |
| GAP-DSP-006 | P1   | 無 SSE 連線狀態指示                        | 建議（reconnect policy 需可視化）                         |
| GAP-DSP-007 | P2   | queue summary cards 無 realtime 計數       | 不阻斷（derived state，可後補）                           |

**Parent task 判斷：** `GAP-P2S3-004` 是依賴 `GAP-P2S2-007`（SSE API backbone，backlog）與 `GAP-P2S3-003`（real-time ETA endpoint，backlog）的下游前端整合任務。兩個上游依賴均未完成，因此 GAP-P2S3-004 目前**不能開始實作**。本 sidecar 的 acceptance framing 為上游完成後的驗收準備。

---

## 4) Dependency Map

### Formal Dependencies (Machine Truth)

> 以 machine truth 為準，`GAP-P2S3-004.depends_on` = `GAP-P2S2-007, GAP-P2S3-003`。

| Dep            | Source           | Status    | Notes                                                                                                                                                                             |
| -------------- | ---------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GAP-P2S2-007` | `ai-status.json` | `backlog` | api: NestJS SSE endpoint for driver task assignment events — ops dispatch events 的 EventEmitter backbone 提供者；`GET /api/ops/dispatch-events` 需要 `EventEmitterModule` 先完成 |
| `GAP-P2S3-003` | `ai-status.json` | `backlog` | regulatory-registry: real-time ETA from ops.phase1_driver_locations — driver location SSE event 的資料來源；依賴 GAP-P2S2-003 + GAP-P2S2-004                                      |

### Practical Context Dependencies

| Dep   | Type                                                      | Why It Matters                                                                                                                                                                                                                                  |
| ----- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P-1 | Planning consensus C-2                                    | `starter-draft.md:178-187` 定義 `GET /api/ops/dispatch-events`、EventSource 前端、三類事件（新訂單 / 派遣狀態 / 司機位置）                                                                                                                      |
| D-P-2 | `consensus-packet.md:58`                                  | 確認 `GAP-P2S3-004` Codex2 ownership、M sizing、C-1 + GAP-P2S3-003 blocking dependency                                                                                                                                                          |
| D-P-3 | `consensus-packet.md:82-83`                               | 完整 dependency chain：`GAP-P2S2-003 → GAP-P2S2-004 → GAP-P2S3-003 → GAP-P2S3-004` 且 `GAP-P2S2-007 → GAP-P2S3-004`                                                                                                                             |
| D-P-4 | `GAP-P2S2-007 sidecar`                                    | `support/sidecars/GAP-P2S2-007/GAP-P2S2-007-SIDECAR-ACCEPTANCE.md` — EventEmitter backbone acceptance criteria：auth policy、per-driver scoping、real mutation event sources；`GET /api/ops/dispatch-events` 須建在同一 EventEmitterModule 之上 |
| D-P-5 | `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` | 主實作目標前端（~571 LOC）：目前是 Client Component，但資料更新完全靜態；需加入 SSE consumer                                                                                                                                                    |
| D-P-6 | `apps/ops-console-web/app/dispatch/page.tsx`              | page.tsx 目前也是 Client Component；代表沒有額外 server/client 邊界阻塞，但初始 orders / dispatchJobs 仍只在 render 時抓一次                                                                                                                    |
| D-P-7 | `packages/contracts/src/index.ts:73-84`                   | `DomainEventEnvelope<T>` 已存在；dispatch event payload 應優先重用，不重新發明                                                                                                                                                                  |
| D-P-8 | `packages/contracts/src/index.ts:764-782`                 | `DriverTaskRecord` 已存在；task assignment 事件 payload 重用                                                                                                                                                                                    |
| D-P-9 | `packages/api-client/src/index.ts:1201-1223`              | Ops client 目前依賴 bootstrap `x-actor-*` headers；SSE EventSource 的 auth transport 需確認方案（與 GAP-P2S2-007 的 auth boundary 問題相同）                                                                                                    |

### Upstream Dependency Chain (Full)

```
GAP-P2S2-003（V0019 driver_locations migration — backlog）
    └── GAP-P2S2-004（heartbeat endpoint + haversine ETA — backlog）
            └── GAP-P2S3-003（real-time ETA from driver_locations — backlog）
                    └── GAP-P2S3-004（SSE dispatch board — backlog） ← 本任務
GAP-P2S2-007（SSE task events endpoint — backlog）
    └── GAP-P2S3-004（SSE dispatch board — backlog） ← 本任務
```

**判斷：** 本任務位於最深的依賴鏈末端（深度 4），所有前置任務均為 `backlog`。**在 GAP-P2S2-007 和 GAP-P2S3-003 兩者都完成之前，GAP-P2S3-004 不應開始。**

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md:178-187` (C-2 segment)
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md:58,82-83`
- Repo anchors:
  - `apps/ops-console-web/app/dispatch/page.tsx` (client page host, ~129 LOC)
  - `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx` (main audit target, ~572 LOC)
  - `packages/contracts/src/index.ts:73-84` (DomainEventEnvelope)
  - `packages/contracts/src/index.ts:764-782` (DriverTaskRecord)
  - `packages/api-client/src/index.ts:375-382,1201-1223` (dispatch client + bootstrap auth)
  - `support/sidecars/GAP-P2S2-007/GAP-P2S2-007-SIDECAR-ACCEPTANCE.md` (upstream EventEmitter backbone acceptance)

---

## 5) Evidence Inventory

| ID   | Evidence                                                                                             | Expected Anchor                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| E-1  | Parent task is `backlog`, M size, depends_on GAP-P2S2-007 + GAP-P2S3-003                             | `ai-status.json`, `current-work.md` GAP-P2S3-004 row                                       |
| E-2  | Consensus C-2: `GET /api/ops/dispatch-events`, EventSource, 3 event types                            | `starter-draft.md:178-187`                                                                 |
| E-3  | Consensus packet: M sizing, Codex2, depends C-1 + GAP-P2S3-003                                       | `consensus-packet.md:58`                                                                   |
| E-4  | Full dependency chain: GAP-P2S2-003 → GAP-P2S2-004 → GAP-P2S3-003 → GAP-P2S3-004                     | `consensus-packet.md:79,83`                                                                |
| E-5  | GAP-DSP-001: no EventSource in dispatch-workflow.tsx                                                 | `dispatch-workflow.tsx` — no import or useEffect with EventSource; only `router.refresh()` |
| E-6  | GAP-DSP-002: no `dispatch-events` SSE route in API                                                   | repo grep for `dispatch-events`, `@Sse`, `dispatch` in api modules confirms absence        |
| E-7  | GAP-DSP-003: ETA is static, from job.latestEtaMinutes at initial render load                         | `dispatch-workflow.tsx:274-277` — `formatEta(job.latestEtaMinutes, job.updatedAt)`         |
| E-8  | GAP-DSP-004: orders come from static props, no live order injection                                  | `dispatch-workflow.tsx:69-75` — `orders` prop is initial page-render data                  |
| E-9  | GAP-DSP-005: dispatch status refreshed only via `router.refresh()`                                   | `dispatch-workflow.tsx:144-154` — `runAction` calls `router.refresh()` after mutation      |
| E-10 | dispatch-workflow.tsx is already a Client Component ("use client")                                   | `dispatch-workflow.tsx:1` — `"use client"` present                                         |
| E-11 | dispatch/page.tsx is also a Client Component; current initial load still happens before child render | `dispatch/page.tsx:1,28` — `"use client"` + `async function DispatchPage(...)`             |
| E-12 | DomainEventEnvelope and DriverTaskRecord exist in contracts                                          | `packages/contracts/src/index.ts:73-84,764-782`                                            |
| E-13 | Ops bootstrap client uses x-actor-\* headers; browser EventSource auth not resolved                  | `packages/api-client/src/index.ts:1201-1223`                                               |
| E-14 | GAP-P2S2-007 sidecar documents EventEmitter backbone gaps and AC criteria                            | `support/sidecars/GAP-P2S2-007/GAP-P2S2-007-SIDECAR-ACCEPTANCE.md`                         |
| E-15 | GAP-P2S3-003 sidecar already exists and keeps parent ETA scope separated from SSE consumer scope     | `support/sidecars/GAP-P2S3-003/GAP-P2S3-003-SIDECAR-ACCEPTANCE.md`                         |

---

## 6) Acceptance Checklist (for Parent Task Owner: Codex2)

### AC-1 — 後端 `GET /api/ops/dispatch-events` SSE endpoint 存在且受 auth 保護

- [ ] 新增 `GET /api/ops/dispatch-events`，HTTP response 為 `text/event-stream`，以 NestJS `@Sse()` 實作。
- [ ] 新 route 必須明確受 auth 保護（更新 `auth.policy.ts` 讓 `ops/dispatch-events` 落入 ops realm scope，**或**在 route 上加 `@RequireRealms(...)` / `@RequireScopes(...)` decorator）。
- [ ] **不得**以 `@OpenRoute()` 或任何 anonymous shortcut 讓 ops dispatch-events route 變成公開可存取。
- [ ] reviewer 應能確認此 route 不會因 `resolveRouteAuthPolicy()` 缺漏而成為匿名路徑（參考 `GAP-P2S2-007` sidecar AC-1 的相同要求）。

### AC-2 — 前端 EventSource consumer 整合，不破壞現有 static load pattern

- [ ] `dispatch-workflow.tsx` 已是 Client Component（`"use client"` 已存在：`dispatch-workflow.tsx:1`）；在其中加入 `useEffect` 管理 EventSource 生命週期（open / message / error / cleanup on unmount）。
- [ ] EventSource 消費 `GET /api/ops/dispatch-events`，處理至少三類事件：`order_created`（或等效）、`dispatch_status_updated`（或等效）、`driver_location_updated`（或等效）。
- [ ] 事件到達時更新 local state（orders / dispatchJobs / ETA）；**不得**對每個 SSE 事件都呼叫 `router.refresh()`（router.refresh 為頁面級刷新，等同放棄 SSE 優勢）。
- [ ] Component unmount 時明確呼叫 `eventSource.close()`，不留 memory leak。

### AC-3 — 三類事件均被 stream，且來源是真實 mutation paths

- [ ] `order_created`（或等效）：由真實 order creation mutation 後發送，不是 polling DB。
- [ ] `dispatch_status_updated`（或等效）：來自 `DispatchService` / `OwnedMobilityService` 的真實 dispatch job 狀態遷移（queued / matching / reserved / assigned / failed / redispatch_required）。
- [ ] `driver_location_updated`（或等效）：來自 `GAP-P2S3-003` 實作的即時 ETA endpoint，或由 GPS heartbeat（`GAP-P2S2-004`）寫入 `ops.phase1_driver_locations` 後發送；不是 polling `driver_locations` 表。
- [ ] 事件 payload 至少包含足夠資訊讓前端精準更新對應 UI row（例如 `orderId` / `dispatchJobId` / `latestEtaMinutes` / `status`）；不要廣播整份 orders list snapshot。

### AC-4 — ETA realtime 更新接通 GAP-P2S3-003 的資料

- [ ] `driver_location_updated` 事件的 ETA 欄位來自 `GAP-P2S3-003` 的 haversine ETA 計算（`regulatory-registry`），不是前端自行估算或靜態值。
- [ ] dispatch board ETA 欄位在收到 `driver_location_updated` 事件後確實更新 UI（不需要重新載入頁面）。
- [ ] 若 `GAP-P2S3-003` 尚未完成，`driver_location_updated` 事件可以先以 stub/placeholder 形式存在，但 payload 結構必須與 GAP-P2S3-003 的預期輸出對齊，不能事後不相容。

### AC-5 — Auth transport boundary 明確，不假設 browser EventSource 原生支援 custom headers

- [ ] packet 或 code comments 需明示：現有 ops bootstrap auth 依賴 `x-actor-type` / `x-actor-id` / `x-realm` custom headers；browser `EventSource` 不支援 custom request headers。
- [ ] 後端 route 的 auth 驗證方式必須與 browser EventSource 的實際能力一致：選擇 cookie-based token、URL query token、或 ops-only 的 internal network scope；不寫出不可能成立的 header 驗證假設。
- [ ] 此 constraint 與 `GAP-P2S2-007` sidecar AC-6 相同，兩個 SSE endpoint 應採用一致的 auth transport 方案。

### AC-6 — 連線狀態與 reconnect policy 可視化

- [ ] EventSource `onerror` handler 需更新 local state，讓 ops 人員能看到 SSE 連線已中斷的視覺提示（banner、badge、或 indicator）。
- [ ] EventSource `onopen` handler 清除離線提示，恢復 live 狀態。
- [ ] 連線中斷時 dispatch board 功能（手動 CRUD、`router.refresh()`）仍可使用（SSE 斷線不等於頁面失效）。

### AC-7 — 不觸碰上游依賴的 canonical truth，不提前實作未完成的上游

- [ ] 本 task 不修改 `GAP-P2S2-007` 的 driver task events API（`GET /api/driver/task-events`）。
- [ ] 本 task 不修改 `GAP-P2S3-003` 的 regulatory-registry ETA endpoint；如果 GAP-P2S3-003 尚未完成，`driver_location_updated` 事件可以用 stub，但不代替 GAP-P2S3-003 實作。
- [ ] 本 task 不修改 `packages/contracts/src/index.ts`（L1 真相），不改寫現有 `OwnedOrderRecord` / `DispatchJobRecord` / `DriverTaskRecord` 定義；如需 dispatch event payload type，為 additive-only 新增。

### AC-8 — TypeScript / verification baseline

- [ ] `pnpm --filter @drts/contracts build` 通過（如有 additive event type 新增）。
- [ ] `pnpm --filter @drts/api typecheck` 通過，無新增 TypeScript 錯誤。
- [ ] `pnpm --filter @drts/ops-console-web typecheck` 通過，無新增 TypeScript 錯誤。
- [ ] 至少具備一組 e2e 驗證路徑：前端 EventSource 能接收到至少一個後端 SSE 事件（可以是 `dispatch_status_updated` smoke event after manual assign action），ETA 欄位在 `driver_location_updated` 後更新。

---

## 7) Implementation Sketch (for Parent Task Owner: Codex2)

> 本節為 **non-binding reference**，提供給 `Codex2` 實作 `GAP-P2S3-004` 時的方向參考，不代替正式實作，也不修改任何 canonical truth。

### 前端 SSE Consumer（`dispatch-workflow.tsx` 局部改動）

```tsx
// In dispatch-workflow.tsx — add SSE consumer alongside existing props

// Extend state
const [liveOrders, setLiveOrders] = useState<OwnedOrderRecord[]>(orders);
const [liveJobs, setLiveJobs] = useState<DispatchJobRecord[]>(dispatchJobs);
const [sseStatus, setSseStatus] = useState<"live" | "connecting" | "offline">(
  "connecting",
);

// SSE lifecycle
useEffect(() => {
  // NOTE: browser EventSource doesn't support custom headers.
  // Auth token must come from cookie or URL param — coordinate with ops SSE auth boundary.
  const es = new EventSource("/api/ops/dispatch-events");

  es.onopen = () => setSseStatus("live");

  es.addEventListener("order_created", (e) => {
    const order: OwnedOrderRecord = JSON.parse(e.data);
    setLiveOrders((prev) => [order, ...prev]);
  });

  es.addEventListener("dispatch_status_updated", (e) => {
    const job: DispatchJobRecord = JSON.parse(e.data);
    setLiveJobs((prev) =>
      prev.map((j) => (j.dispatchJobId === job.dispatchJobId ? job : j)),
    );
  });

  es.addEventListener("driver_location_updated", (e) => {
    const { dispatchJobId, latestEtaMinutes } = JSON.parse(e.data);
    setLiveJobs((prev) =>
      prev.map((j) =>
        j.dispatchJobId === dispatchJobId ? { ...j, latestEtaMinutes } : j,
      ),
    );
  });

  es.onerror = () => setSseStatus("offline");

  return () => {
    es.close();
    setSseStatus("connecting");
  };
}, []);

// Connection status indicator
{
  sseStatus === "offline" && (
    <div className="sse-offline-banner">
      Live updates disconnected — data may be stale. Reconnecting...
    </div>
  );
}
```

### 後端 SSE route stub（`apps/api/src/modules/dispatch/` 新增）

```typescript
// GET /api/ops/dispatch-events
@Sse("dispatch-events")
dispatchEvents(@Req() req: Request): Observable<MessageEvent> {
  const identity = this.authPolicy.resolveIdentity(req); // ops realm required
  return fromEvent(this.eventEmitter, "ops.dispatch.*").pipe(
    filter((event) => /* scope to tenant */ true),
    map((event) => ({ data: JSON.stringify(event) } as MessageEvent)),
  );
}
```

**Key constraints:**

- `EventEmitterModule` must be registered in `AppModule` (GAP-P2S2-007 task)
- Auth must not use `x-actor-*` header check via bootstrap guard — resolve auth transport before wiring
- `driver_location_updated` events come from GAP-P2S3-003's haversine ETA computation

**Total estimated LOC delta:** ~120-140 LOC (frontend ~55 LOC + backend SSE route ~50 LOC + event type additions ~15-20 LOC).

---

## 8) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S3-004` 是 `backlog`（M size），owner=`Codex2`，formal depends_on=`GAP-P2S2-007, GAP-P2S3-003`（兩者均 `backlog`）；sidecar 目前是 `review`（owner=`Claude`、reviewer=`Codex`）。
2. 依賴狀態是否正確評估：`GAP-P2S2-007` 與 `GAP-P2S3-003` 均為 `backlog`，parent task 目前無法開始；sidecar 是為上游完成後的驗收準備。
3. Gap inventory 是否正確反映 consensus C-2 需求：5 個 P0 gaps（DSP-001 至 DSP-005）是否確實缺失，並有 file 證據支持。
4. auth transport boundary（browser EventSource 無法帶 custom headers）是否清楚寫入 acceptance criteria（AC-5）。
5. 實作 sketch 中的 auth constraint 是否與 GAP-P2S2-007 sidecar AC-6 一致，不製造矛盾。
6. 此 sidecar 是否完全沒有修改任何 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S3-004 acceptance packet ready: machine truth shows parent backlog (M, Codex2, depends GAP-P2S2-007+GAP-P2S3-003 both backlog). dispatch-workflow.tsx baseline audit confirmed — currently full static load + router.refresh(), no EventSource. 5 P0 gaps confirmed missing against consensus C-2 (no EventSource consumer, no /api/ops/dispatch-events backend, no realtime ETA/order/dispatch-status updates). Auth transport constraint (browser EventSource vs custom headers) correctly captured in AC-5, consistent with GAP-P2S2-007 AC-6. No canonical truth modified.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / dependency status incorrectly assessed / gap identification incorrect / auth boundary incorrectly framed / scope drift into upstream implementation / canonical truth modified]`

---

## 9) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff GAP-P2S3-004-SIDECAR-ACCEPTANCE Codex "GAP-P2S3-004 SSE dispatch board acceptance packet ready at support/sidecars/GAP-P2S3-004/GAP-P2S3-004-SIDECAR-ACCEPTANCE.md. Full repo scan of dispatch-workflow.tsx (~571 LOC), dispatch/page.tsx, contracts (DomainEventEnvelope, DriverTaskRecord), api-client confirms: current board is fully static (router.refresh only), no EventSource. 5 P0 gaps confirmed against consensus C-2 (GAP-DSP-001: no frontend EventSource consumer; GAP-DSP-002: no GET /api/ops/dispatch-events backend route; GAP-DSP-003: ETA not realtime; GAP-DSP-004: no live order push; GAP-DSP-005: no live dispatch status push). Auth transport constraint (browser EventSource incompatible with x-actor-* custom headers) documented in AC-5. Upstream deps GAP-P2S2-007 + GAP-P2S3-003 both backlog — parent task cannot start yet. No canonical truth modified."
```

---

## 10) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S3-004-SIDECAR-ACCEPTANCE "GAP-P2S3-004 acceptance packet ready: machine truth shows parent backlog (M, Codex2, depends GAP-P2S2-007+GAP-P2S3-003 both backlog). dispatch-workflow.tsx audit: current board is fully static with router.refresh, no EventSource consumer. dispatch/page.tsx baseline corrected: it is now a client page component, but data still loads as an initial snapshot rather than a live stream. 5 P0 gaps remain confirmed against consensus C-2: no frontend EventSource (GAP-DSP-001), no /api/ops/dispatch-events route (GAP-DSP-002), no realtime ETA (GAP-DSP-003), no live order push (GAP-DSP-004), no live dispatch status update (GAP-DSP-005). Auth transport boundary (browser EventSource incompatible with custom headers) is correctly captured in AC-5. No canonical truth modified."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S3-004-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency status incorrectly assessed / gap identification incorrect / auth boundary incorrectly framed / scope drift into upstream implementation / canonical truth modified]"
```

---

## 11) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Claude`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done GAP-P2S3-004-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S3-004 at support/sidecars/GAP-P2S3-004/GAP-P2S3-004-SIDECAR-ACCEPTANCE.md. Packet covers: dispatch-workflow.tsx baseline audit (10 covered static capabilities), 7 gap items (GAP-DSP-001 to GAP-DSP-007, 5 P0 + 1 P1 + 1 P2) with file evidence anchors and priority classification, upstream dependency chain audit (GAP-P2S2-007 + GAP-P2S3-003 both backlog, parent task blocked), auth transport constraint (browser EventSource vs custom headers), implementation sketch (~120-140 LOC for P0+P1 gaps), and reviewer handoff path. No canonical truth modified."
```

---

## 12) Change Log

- `2026-04-17T18:50Z` — 初版建立：依共享 machine truth、consensus docs（`gap-phase2-planning-20260417/starter-draft.md:178-187` C-2 segment、`consensus-packet.md:58,82-83` GAP-P2S3-004 row + dependency chain）與完整 repo 掃描（`dispatch-workflow.tsx` ~572 行完整讀取、`dispatch/page.tsx` ~130 行、`packages/contracts/src/index.ts:73-84,764-782`、`packages/api-client/src/index.ts:375-382,1201-1223`、`GAP-P2S2-007` sidecar），整理 GAP-P2S3-004 的 acceptance checklist（8 項 AC 含 auth transport constraint）、dispatch board 靜態能力 baseline（10 項已覆蓋能力）、7 個 gap（GAP-DSP-001 至 GAP-DSP-007，5 個 P0 核心 realtime 缺口 + 1 個 P1 連線狀態 + 1 個 P2 計數 sync）、完整上游依賴鏈 audit（parent task 目前無法開始），以及 reviewer handoff 指引。
- `2026-04-17T18:51Z` — Reviewer refresh：對齊最新 shared L0 路由（sidecar 仍由 `Claude` 擁有，但 reviewer 已從 `Codex2` availability-first reassignment 到 `Codex`），修正 `dispatch/page.tsx` 基線為現行 client page component 而非 SSR host，並同步更新 reviewer / handoff / reopen 範例與 `GAP-P2S3-003` 上游 sidecar 現況。
