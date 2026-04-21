# GAP-P2S2-007 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S2-007` — api: NestJS SSE endpoint for driver task assignment events (replaces WebSocket plan)  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner:** `Codex` (per machine truth, `status=backlog`, `reviewer=""`, `depends_on: -`)  
**Last Revised:** `2026-04-18T00:24Z (UTC)`  
**Status:** `review_approved` — shared L0 authoritative task row in `ai-status.json` keeps sidecar `GAP-P2S2-007-SIDECAR-ACCEPTANCE` at `review_approved` under owner=`Codex`, reviewer=`Codex2`, with `last_update=2026-04-18T00:22:43Z` and `next="GAP-P2S2-007 acceptance packet ready: machine truth shows parent backlog with no formal dependency, packet correctly anchors GET /api/driver/task-events on @Sse + EventEmitter2, requires explicit auth coverage and per-driver scoping, ties event emission to real OwnedMobilityService task lifecycle mutations, reuses DomainEventEnvelope/DriverTaskRecord additively, and captures the accepted Phase 2 Cloud Run single-instance assumption plus downstream GAP-P2S3-004 dependency without mutating canonical truth."`; the latest generated `current-work.md` aligns with that `review_approved` state, records the pending `Codex2 -> Codex` finalize handoff created at `2026-04-18T00:22:43Z`, and shows the `2026-04-18T00:22:47Z` `owned_finalize_dispatch` wake plus worker start for `Codex`, while `ai-activity-log.jsonl` preserves the preceding reviewer-routing chain ending in the `2026-04-18T00:20:26Z` Codex2 wake/worker-start, followed by the `2026-04-18T00:22:43Z` Codex2 `review_approved` event, the `2026-04-18T00:22:44Z` superseded Codex2 worker event, and the `2026-04-18T00:22:47Z` owner finalize dispatch. Parent `GAP-P2S2-007` remains `backlog` under owner=`Codex`.

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S2-007` 的 acceptance checklist、dependency map、repo baseline 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務直接實作。

- **In scope:** support-only acceptance framing, SSE route/event contract guidance, repo-scan evidence anchors, auth boundary / reconnect / single-instance assumptions, downstream dependency map, reviewer checklist.
- **Out of scope:** 修改 L1 canonical truth、直接改 `owned-mobility` / `ops-console-web` / `driver-app` runtime、引入 Redis pub-sub 或正式 IAP/OIDC auth、或替 `GAP-P2S3-004` 提前做 ops-console SSE consumer。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S2-007` 在 machine truth 中目前是 `backlog`，Owner=`Codex`，無正式上游依賴，effort=`M`。
- 本 sidecar `GAP-P2S2-007-SIDECAR-ACCEPTANCE` 在 machine truth 中目前是 `review_approved`，Owner=`Codex`、Reviewer=`Codex2`；`ai-status.json` 的 authoritative task row 目前停在 `last_update=2026-04-18T00:22:43Z`，`next` 即 Codex2 的核准摘要。`current-work.md` 最新 handoff queue 也已切到 pending `Codex2 -> Codex` finalize row（建立於 `2026-04-18T00:22:43Z`），並在 Latest Checkpoints 顯示 `2026-04-18T00:22:47Z` 的 `owned_finalize_dispatch` wake / worker-start。`ai-activity-log.jsonl` 則保留完整 reviewer-routing 與核准鏈：先有 `2026-04-18T00:18:38Z`、`2026-04-18T00:18:51Z`、`2026-04-18T00:19:20Z`、`2026-04-18T00:19:33Z`、`2026-04-18T00:20:26Z` 幾次 auto-reassignment back to `Codex2`，中間在 `2026-04-18T00:18:11Z`、`2026-04-18T00:18:44Z`、`2026-04-18T00:19:00Z`、`2026-04-18T00:19:27Z`、`2026-04-18T00:19:42Z` 出現 Qwen wake queued、availability-first claim 與 stale-wake skip，並在 `2026-04-18T00:18:21Z-2026-04-18T00:18:22Z`、`2026-04-18T00:19:03Z-2026-04-18T00:19:05Z`、`2026-04-18T00:19:46Z-2026-04-18T00:19:52Z` 記錄 Qwen wake queued + worker started，最後在 `2026-04-18T00:20:26Z` 記錄針對 `Codex2` 的 wake queued + worker started，並於 `2026-04-18T00:22:43Z` 記錄 Codex2 `review_approved`，再由 `2026-04-18T00:22:47Z` owner finalize dispatch 接手。換句話說，owner-awaiting 的最新共享 L0 快照應以 `ai-status.json` 的 `00:22:43Z` `review_approved` task row、`current-work.md` 的 `Codex2 -> Codex` finalize handoff，再加上 `ai-activity-log.jsonl` 中到 `00:22:47Z` 為止的核准/收尾歷史為主。
- Planning consensus 已定案：
  - `gap-phase2-planning-20260417/starter-draft.md:165-173` 明確規格：`GET /api/driver/task-events`、`text/event-stream`、NestJS `@Sse()` + `fromEvent(EventEmitter)`、事件名 `task_assigned` / `task_updated` / `task_cancelled`。
  - `gap-phase2-planning-20260417/consensus-packet.md:45` 收錄為 `@Sse + EventEmitter2` API slice，Owner=`Codex`，effort=`M`。
  - `review-round-1.md:166-176` 要求 execution packet 顯式寫出 `auth boundary + reconnect policy + single-instance assumption`，並禁止把 browser `EventSource(..., { headers })` 當成既定 web contract。
  - `review-round-3.md:37-45` 確認 Cloud Run Phase 2 可接受 in-memory `EventEmitter2` 廣播，但 multi-instance production fan-out 需要 Phase 3 的 Redis pub-sub。

### Repo Baseline Anchors

- [`apps/api/package.json`](/home/edna/workspace/drts-fleet-platform/apps/api/package.json:14) 目前沒有 `@nestjs/event-emitter` 或 `eventemitter2` 依賴。
- [`apps/api/src/app.module.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/app.module.ts:38) 目前只註冊 `ThrottlerModule` 與各 domain modules；沒有 `EventEmitterModule.forRoot(...)`。
- repo 搜尋目前找不到任何 `@Sse()`、`EventEmitter2`、`driver/task-events`、`dispatch-events`、`EventSource` 實作；SSE 在本 repo 仍是 net-new capability。
- [`apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:314) 已暴露 `GET /api/driver/tasks` 與 driver task lifecycle routes，但沒有 SSE route。
- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1034) 是目前唯一穩定的 driver task 狀態來源：
  - `assignDispatch()` 建立 `DriverTaskRecord` 並將狀態設為 `pending_acceptance`（`:1070-1187`）。
  - `acceptDriverTask()` / `rejectDriverTask()` / `departDriverTask()` / `arrivedPickup()` / `startDriverTask()` / `completeDriverTask()` 依序更新 task 狀態（`:1425-1780`）。
  - `cancelOwnedOrder()` 會將既有 task 狀態設為 `cancelled`（`:1190-1273`）。
- [`apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:316) 目前 `listDriverTasks()` 直接回傳 `ownedMobilityService.listDriverTasks()`，未以 caller identity 做 driver-specific 過濾。
- [`apps/api/src/common/auth/auth.policy.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/common/auth/auth.policy.ts:174) 只對 `driver/tasks*` 路徑定義 driver-task auth policy；`driver/task-events` 目前**不在 policy table 中**。
- [`apps/api/src/common/auth/bootstrap-auth.guard.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/common/auth/bootstrap-auth.guard.ts:59) 若 route 沒有 policy 或 decorator，guard 會允許 anonymous/pass-through；因此新 SSE route 若不補 auth policy 或 decorator，會意外變成匿名可達。
- [`packages/api-client/src/index.ts`](/home/edna/workspace/drts-fleet-platform/packages/api-client/src/index.ts:405) 目前只有 polling-style `listDriverTasks()` 與 task mutation API，沒有任何 SSE helper。
- [`packages/api-client/src/index.ts`](/home/edna/workspace/drts-fleet-platform/packages/api-client/src/index.ts:1201) 與 [`:1212`](/home/edna/workspace/drts-fleet-platform/packages/api-client/src/index.ts:1212) 顯示 ops/driver client 目前完全依賴 bootstrap `x-actor-type` / `x-actor-id` / `x-realm` headers。
- [`apps/driver-app/app/jobs.tsx`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/jobs.tsx:80) 目前以 `loadTasks()` + `RefreshControl` 輪詢 `client.listDriverTasks()`。
- [`apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`](/home/edna/workspace/drts-fleet-platform/apps/ops-console-web/app/dispatch/dispatch-workflow.tsx:144) 目前在 dispatch action 後使用 `router.refresh()` 刷新頁面，沒有 live stream。
- [`packages/contracts/src/index.ts`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:73) 已有泛用 `DomainEventEnvelope<T>`，且 [`DriverTaskRecord`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:764) 已存在；但 repo 內沒有 `task_assigned` / `task_updated` / `task_cancelled` 的專用 event payload type。

### Gap Summary

| 問題                                                                             | 影響                                                                  | 根本原因                                                                       |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| API repo 完全沒有 SSE / EventEmitter 基礎                                        | `GAP-P2S2-007` 需同時補 runtime wiring 與 route surface               | `apps/api/package.json` / `app.module.ts` 尚未引入 event emitter               |
| driver task 事件來源雖存在，但全都散落在 `OwnedMobilityService` mutation methods | 若 SSE 用 polling/snapshot 假裝即時，會和真實 task lifecycle 脫鉤     | 目前沒有 domain-event seam                                                     |
| 新路徑 `driver/task-events` 不在 `auth.policy.ts` 中                             | 若未補 policy/decorator，global auth guard 會讓 SSE route 變成匿名    | auth policy 目前只覆蓋 `driver/tasks*`                                         |
| 現有 bootstrap auth 依賴 custom headers                                          | browser `EventSource` 與現有 web client 無法直接沿用這組 headers      | repo 目前只有 fetch client，沒有 SSE client transport                          |
| `listDriverTasks()` 目前不做 driver-specific 過濾                                | 若 SSE 直接重用這個 helper，可能把所有 driver tasks 廣播給單一 driver | `owned-mobility.controller.ts:316-320` + service `listDriverTasks()` 無 filter |

---

## 3) Parent Acceptance Framing

`GAP-P2S2-007` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把 shared truth、consensus 決議與 repo baseline 展開成 reviewer-facing acceptance，不新增產品語意。

### AC-1 — SSE route surface 存在，且 auth 不是匿名

- [ ] 新增 `GET /api/driver/task-events`，HTTP response 為 `text/event-stream`，以 NestJS `@Sse()`（或語意等效的 Nest SSE 寫法）實作。
- [ ] 新 route 需明確納入 auth 保護：
  - 更新 `auth.policy.ts` 讓 `driver/task-events` 落入 driver-task realm/scope，**或**
  - 在 route 上加 `@RequireRealms(...)` / `@RequireScopes(...)` decorator。
- [ ] SSE route **不得**用 `@OpenRoute()` 或任何 anonymous shortcut 繞過現有 auth guard。
- [ ] reviewer 應能從程式碼確認：新 route 不會因為 `resolveRouteAuthPolicy()` 缺漏而變成未驗證路徑。

### AC-2 — EventEmitter2 backbone 為 Phase 2 單 instance 基線

- [ ] `apps/api` 新增 `@nestjs/event-emitter`（及其依賴 `eventemitter2`）並在 `AppModule` 或對應 module 中啟用 `EventEmitterModule.forRoot(...)`（或語意等效）。
- [ ] Phase 2 實作可接受 in-memory emitter；**不**需要在本 task 引入 Redis / PubSub / external broker。
- [ ] 程式碼內需明示 Phase 3 operational note：Cloud Run multi-instance fan-out 將來要改成 Redis pub-sub 或等效外部總線，不把單 instance 假設偷偷藏起來。
- [ ] SSE controller/service 不得用 `setInterval + listDriverTasks()` 輪詢假裝即時；事件來源必須接在真實 mutation path。

### AC-3 — Event contract 對齊 consensus，且重用既有 contracts

- [ ] 事件名使用 consensus 既定三種：`task_assigned`、`task_updated`、`task_cancelled`。
- [ ] event payload 優先重用既有 [`DomainEventEnvelope<T>`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:73) 與 [`DriverTaskRecord`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:764)；若新增型別，需為 additive-only，不可改寫既有 driver task semantics。
- [ ] payload 至少能讓 consumer 判斷 `taskId`、`orderId`、`driverId`、`status` 與 `occurredAt`；不得為只有字串訊息、缺少 subject identity 的鬆散 blob。
- [ ] 若 event envelope 類型放在 `packages/contracts/src/index.ts`，必須保持 additive-only；若不放 contracts，controller/service 內部型別也需明確，不用 `any`。

### AC-4 — 事件必須來自真實 driver task lifecycle mutation points

- [ ] `task_assigned` 由 `OwnedMobilityService.assignDispatch()` 成功建立 `DriverTaskRecord` 後發送，不是從 controller 層憑空組字串。
- [ ] `task_updated` 來自至少以下任一真實狀態遷移後發送：`acceptDriverTask()`、`rejectDriverTask()`、`departDriverTask()`、`arrivedPickup()`、`startDriverTask()`、`completeDriverTask()`。
- [ ] `task_cancelled` 來自 `cancelOwnedOrder()` 對既有 task 設為 `cancelled` 的路徑；不得靠 client 猜測或用 order status poll 模擬。
- [ ] 發送時機需在 mutation 已經完成並具備穩定 task snapshot 之後，避免 stream 事件與持久狀態不一致。

### AC-5 — Stream 必須做 subject scoping，不能複製現有全量列表問題

- [ ] SSE stream 預設只推送屬於當前 driver 的 task events；不得直接把 `listDriverTasks()` 的全量結果或全域事件流暴露給單一 driver。
- [ ] 若實作允許非-driver realm（例如 ops/system smoke）連線，該路徑必須是顯式、受控且不成為 driver app 的預設客戶端契約。
- [ ] reviewer 應能從 route/controller/service 看出 `driverId` 取得來源（例如 `@CurrentIdentity()` + `identity.actorId`，參考 `platform-presence.controller.ts` 的 pattern），而不是由 query param 任意冒充。

### AC-6 — Auth boundary 與 reconnect policy 必須顯式，不得假設 browser custom headers

- [ ] packet / code comments / reviewer notes 需明示：現有 ops/driver bootstrap auth 依賴 `x-actor-*` headers，browser `EventSource` 不應被假設能直接帶這些 custom headers。
- [ ] 後端 route 的驗證方式必須與實際 consumer 能力一致；在未引入新 transport 前，可接受以 internal smoke / curl 驗證 API seam，但不能把不存在的 web header model 寫成既定 contract。
- [ ] stream 需留有 reconnect 策略訊號或明確註記（例如 SSE `retry` hint、keepalive / comment event、或 controller-level comment），使 downstream `GAP-P2S3-004` 能接手，不讓 reconnect policy 留成隱性知識。

### AC-7 — 不提前實作 downstream frontend / Redis / auth overhaul

- [ ] 本 task 不修改 `apps/driver-app/` 或 `apps/ops-console-web/` 的 SSE consumer；這些屬後續 adoption / downstream task。
- [ ] 本 task 不引入 Redis pub-sub、WebSocket gateway、或新的 Cloud IAP/OIDC auth model；這些分別屬 Phase 3 或 `GAP-P2S3-001`。
- [ ] 本 task 不修改 L1 canonical truth，也不重寫 `DriverTaskRecord` / `OwnedOrderRecord` 等核心 contract。

### AC-8 — TypeScript / verification baseline

- [ ] `pnpm --filter @drts/api typecheck` 通過，無新增 TypeScript 錯誤。
- [ ] 若 `packages/contracts` 有 additive event types，`pnpm --filter @drts/contracts build` 通過。
- [ ] 至少具備一組 API-level verification：可用 test / unit / manual smoke 證明 `assignDispatch()` 後能看到 `task_assigned` stream event，且 route 不是匿名。
- [ ] 實作中不使用 `any` 掩蓋 event payload 或 auth identity 型別。

---

## 4) Dependency Map

### Formal Dependencies

> 以 machine truth 為準，`GAP-P2S2-007.depends_on` = `-`（無正式上游依賴）。

| Dep      | Source | Status | Notes                              |
| -------- | ------ | ------ | ---------------------------------- |
| _(none)_ | -      | -      | 無正式上游依賴；此 task 可獨立開始 |

### Practical Context Dependencies

| Dep   | Type                                                        | Why It Matters                                                                    |
| ----- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| D-P-1 | Planning consensus (`starter-draft.md:165-173`)             | 定義 route、transport (`@Sse`) 與三個事件名                                       |
| D-P-2 | `consensus-packet.md:45`                                    | 確認 `@Sse + EventEmitter2` 是已接受方案，Owner=`Codex`，effort=`M`               |
| D-P-3 | `review-round-1.md:166-176`                                 | auth boundary / reconnect policy / single-instance assumption 必須寫進 acceptance |
| D-P-4 | `review-round-3.md:37-45`                                   | Cloud Run Phase 2 可用 in-memory emitter；Phase 3 要補 Redis pub-sub              |
| D-P-5 | `owned-mobility.service.ts:1034-1780`                       | 現有真實 driver task lifecycle mutation points，是事件來源                        |
| D-P-6 | `auth.policy.ts:174-180` + `bootstrap-auth.guard.ts:59-107` | 新路徑若未補 policy/decorator，guard 會意外允許匿名                               |
| D-P-7 | `packages/api-client/src/index.ts:1201-1223`                | 目前 bootstrap auth 依賴 custom headers；不能假設 browser SSE client 原生可重用   |
| D-P-8 | `packages/contracts/src/index.ts:73-84,764-782`             | 已有 `DomainEventEnvelope` 與 `DriverTaskRecord`，可做 additive event contract    |

### Forward (Downstream) Dependencies

| Dep     | Status                           | Why It Matters                                                                                       |
| ------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| D-FWD-1 | `GAP-P2S3-004` (`backlog`)       | ops-console SSE dispatch board live updates 正式依賴本 task 的 event backbone                        |
| D-FWD-2 | current driver-app polling inbox | 雖未獨立建票，未來 driver inbox adoption 將消費本 stream；本 task 需避免把 auth/scoping 做成錯誤基線 |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md` (`:165-173`, C-1)
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md` (`:45`, `:82-83`)
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-1.md` (`:166-176`)
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-3.md` (`:37-45`)
- Repo anchors:
  - `apps/api/package.json`
  - `apps/api/src/app.module.ts`
  - `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  - `apps/api/src/common/auth/auth.policy.ts`
  - `apps/api/src/common/auth/bootstrap-auth.guard.ts`
  - `packages/api-client/src/index.ts`
  - `packages/contracts/src/index.ts`
  - `apps/driver-app/app/jobs.tsx`
  - `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`

---

## 5) Evidence Inventory

| ID   | Evidence                                                                           | Expected Anchor                                                        |
| ---- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                                                     | `ai-status.json`, `current-work.md`                                    |
| E-2  | C-1 spec: `GET /api/driver/task-events`, `@Sse`, 3 event names                     | `starter-draft.md:165-173`                                             |
| E-3  | Parent accepted as `@Sse + EventEmitter2`; downstream `GAP-P2S3-004` depends on it | `consensus-packet.md:45,58,82-83`                                      |
| E-4  | Auth/reconnect/single-instance must be explicit                                    | `review-round-1.md:166-176`                                            |
| E-5  | Cloud Run Phase 2 in-memory emitter acceptable; Redis pub-sub is Phase 3           | `review-round-3.md:37-45`                                              |
| E-6  | No event-emitter dependency in API package                                         | `apps/api/package.json:14-22`                                          |
| E-7  | No EventEmitterModule in AppModule                                                 | `apps/api/src/app.module.ts:38-63`                                     |
| E-8  | Driver task creation source is `assignDispatch()`                                  | `owned-mobility.service.ts:1034-1187`                                  |
| E-9  | Driver task update/cancel sources are task lifecycle + `cancelOwnedOrder()`        | `owned-mobility.service.ts:1190-1780`                                  |
| E-10 | Existing `GET /api/driver/tasks` returns unscoped list                             | `owned-mobility.controller.ts:314-322`                                 |
| E-11 | New `driver/task-events` route would currently miss auth policy coverage           | `auth.policy.ts:174-180`                                               |
| E-12 | Global auth guard only enforces when a policy/decorator exists                     | `bootstrap-auth.guard.ts:59-107`                                       |
| E-13 | Current bootstrap clients require custom headers; no SSE helper exists             | `packages/api-client/src/index.ts:405-432,1201-1223`                   |
| E-14 | Current consumers still poll / refresh, not stream                                 | `apps/driver-app/app/jobs.tsx:80-129`; `dispatch-workflow.tsx:144-149` |
| E-15 | `DomainEventEnvelope` and `DriverTaskRecord` already exist                         | `packages/contracts/src/index.ts:73-84,764-782`                        |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S2-007` 仍為 `backlog`、無 formal dependency；sidecar 最新 reviewer-awaiting 快照是建立於 `2026-04-18T00:20:14Z` 的 pending `Qwen -> Codex2`，authoritative row 仍由 owner=`Codex` / reviewer=`Codex2` 持有。
2. acceptance 是否正確抓到 auth 關鍵點：`driver/task-events` 不在 `auth.policy.ts`，若不補 policy/decorator 會變成匿名 route。
3. acceptance 是否正確要求 per-driver scoping，而不是複製現有 `listDriverTasks()` 全量回傳的資料邊界問題。
4. 事件來源是否正確鎖定在 `OwnedMobilityService` 的真實 mutation points，而不是 polling DB / interval 假串流。
5. event contract 是否正確重用既有 `DomainEventEnvelope` / `DriverTaskRecord`，沒有發明新的產品語意。
6. 是否清楚區分本 task（API SSE backbone）與 `GAP-P2S3-004`（ops-console frontend consumer）、`GAP-P2S3-001`（auth overhaul）、Phase 3 Redis pub-sub（multi-instance fan-out）。
7. sidecar 是否完全停留在 support artifact，未修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S2-007 acceptance packet ready: machine truth shows parent backlog with no formal dependency, packet correctly anchors the SSE API slice on GET /api/driver/task-events with @Sse + EventEmitter2, requires explicit auth coverage for the new route, requires per-driver stream scoping instead of reusing the current unfiltered listDriverTasks path, wires events to real OwnedMobilityService task lifecycle mutations (assign/update/cancel), reuses DomainEventEnvelope/DriverTaskRecord additively, and captures the accepted Phase 2 single-instance Cloud Run assumption plus downstream GAP-P2S3-004 dependency without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / auth-policy gap not captured / per-driver scoping missing / event source not tied to real task lifecycle / payload contract over-invented / scope drift into frontend or Redis/auth overhaul]`

---

## 7) Handoff Command

Owner（`Codex`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff GAP-P2S2-007-SIDECAR-ACCEPTANCE Codex2 "GAP-P2S2-007 acceptance packet refreshed at support/sidecars/GAP-P2S2-007/GAP-P2S2-007-SIDECAR-ACCEPTANCE.md. It keeps machine truth aligned on parent backlog with no formal dependency, updates the sidecar review snapshot to the latest 2026-04-18T00:20:14Z Qwen -> Codex2 handoff plus the 2026-04-18T00:18:11Z-2026-04-18T00:20:26Z reviewer-routing chain ending in the 2026-04-18T00:20:26Z Codex2 wake/worker-start, anchors the API slice on GET /api/driver/task-events with @Sse + EventEmitter2, captures the missing auth-policy coverage for driver/task-events, requires per-driver scoping instead of reusing the current unfiltered listDriverTasks path, ties task_assigned/task_updated/task_cancelled emission to real OwnedMobilityService mutation points, and records the accepted Phase 2 single-instance Cloud Run assumption with Phase 3 Redis pub-sub follow-up."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve GAP-P2S2-007-SIDECAR-ACCEPTANCE "GAP-P2S2-007 acceptance packet ready: machine truth shows parent backlog with no formal dependency, packet correctly anchors GET /api/driver/task-events on @Sse + EventEmitter2, requires explicit auth coverage and per-driver scoping, ties event emission to real OwnedMobilityService task lifecycle mutations, reuses DomainEventEnvelope/DriverTaskRecord additively, and captures the accepted Phase 2 Cloud Run single-instance assumption plus downstream GAP-P2S3-004 dependency without mutating canonical truth."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen GAP-P2S2-007-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / auth-policy gap not captured / per-driver scoping missing / event source not tied to real task lifecycle / payload contract over-invented / scope drift into frontend or Redis/auth overhaul]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Codex`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done GAP-P2S2-007-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S2-007 at support/sidecars/GAP-P2S2-007/GAP-P2S2-007-SIDECAR-ACCEPTANCE.md. The packet preserves parent backlog status, GET /api/driver/task-events @Sse + EventEmitter2 framing, auth-policy and per-driver scoping gates, OwnedMobilityService lifecycle event-source mapping, additive DomainEventEnvelope/DriverTaskRecord guidance, and the Phase 2 single-instance Cloud Run assumption with downstream GAP-P2S3-004 linkage, without changing canonical truth."
```

---

## 10) Change Log

- `2026-04-17T17:51Z` — 初版建立：依 shared machine truth、`starter-draft.md:165-173`、`consensus-packet.md:45,58,82-83`、`review-round-1.md:166-176`、`review-round-3.md:37-45` 與 repo 掃描（`apps/api/package.json` 無 `@nestjs/event-emitter`、`app.module.ts` 無 `EventEmitterModule`、`OwnedMobilityService` 為現有 task lifecycle mutation source、`auth.policy.ts` 未覆蓋 `driver/task-events`、`packages/api-client` 只有 bootstrap header fetch client、`jobs.tsx` / `dispatch-workflow.tsx` 仍為 polling/refresh）整理 acceptance checklist、auth/scoping 風險、single-instance operational assumption、與 reviewer handoff 指引。
- `2026-04-18T00:21Z` — 對齊最新 reviewer-routing machine truth：將 sidecar 狀態快照更新到 `ai-status.json` / `current-work.md` 的 `2026-04-18T00:20:14Z` reviewer-awaiting row，並補入 `ai-activity-log.jsonl` 到 `2026-04-18T00:20:26Z` 為止的 Qwen fallback loops 與 `Codex2` wake/worker-start，以便 reviewer 直接依最新 shared truth 核准。
