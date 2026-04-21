# GAP-P2S2-005 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S2-005` — driver-app: GPS location heartbeat sender (Expo Location background task)  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex2` / `(unset in machine truth)`  
**Last Revised:** `2026-04-18T00:32Z (UTC)`  
**Status:** `review` — shared L0 authoritative task row in `ai-status.json` keeps sidecar `GAP-P2S2-005-SIDECAR-ACCEPTANCE` at `review` under owner=`Codex`, reviewer=`Codex2`, with `last_update=2026-04-18T00:32:06Z` and `next="Auto-reassigned review from Qwen to Codex2 after repeated Qwen terminal: [API Error: 401 invalid access token or token expired]"`; the latest generated `current-work.md` handoff queue now shows the pending `Qwen -> Codex2` review row created at `2026-04-18T00:32:06Z`, while `ai-activity-log.jsonl` extends the reviewer-routing chain through the `2026-04-18T00:30:58Z` wake queued + availability-first reassignment to `Qwen` + stale-wake skip, the `2026-04-18T00:31:01Z-2026-04-18T00:31:03Z` Qwen wake queued + worker-start, the `2026-04-18T00:31:21Z` reassignment back to `Codex2`, the `2026-04-18T00:31:29Z` second reviewer claim + stale-wake skip, the `2026-04-18T00:31:36Z` second reassignment back to `Codex2`, the `2026-04-18T00:31:45Z` third reviewer claim + stale-wake skip, the `2026-04-18T00:31:54Z-2026-04-18T00:31:56Z` Qwen wake queued + worker-start, and the `2026-04-18T00:32:12Z-2026-04-18T00:32:14Z` final reassignment to `Codex2` plus latest Codex2 wake queued + worker started events; parent `GAP-P2S2-005` remains `backlog` under owner=`Codex2`

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S2-005` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- **In scope:** support-only acceptance framing, dependency mapping, repo-scan evidence anchors, driver-app background GPS sender baseline, reviewer checklist.
- **Out of scope:** 修改 `apps/driver-app/app/trip.tsx`、`apps/driver-app/lib/api-client.ts`、`packages/api-client/src/index.ts` 或 `packages/contracts/src/index.ts` 的主線 runtime；修改 `GAP-P2S2-004` 的 server endpoint / `GAP-P2S2-003` 的 migration；把 `GAP-P2S2-002` 的 foreground trip metrics 或 `GAP-P2S2-001` 的 proof bundle 吸收進本 task。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S2-005` 在 machine truth 中目前是 `backlog`，Owner=`Codex2`，`reviewer=""`，正式依賴為 `GAP-P2S2-PREP` + `GAP-P2S2-004`。
- 本 sidecar `GAP-P2S2-005-SIDECAR-ACCEPTANCE` 在 machine truth 中目前是 `review`，Owner=`Codex`、Reviewer=`Codex2`；`ai-status.json` 的 authoritative task row 目前停在 `last_update=2026-04-18T00:32:06Z`，`next` 已改成 `Qwen -> Codex2` 的 auto-reassignment 摘要。`current-work.md` 最新 handoff queue 也對齊為 pending `Qwen -> Codex2` row（建立於 `2026-04-18T00:32:06Z`）。`ai-activity-log.jsonl` 延伸了最新 reviewer-routing 歷史：先有 `2026-04-18T00:30:58Z` 的 wake queued、availability-first reassignment 給 `Qwen` 與 stale-wake skip，接著在 `2026-04-18T00:31:01Z-2026-04-18T00:31:03Z` 記錄 Qwen wake queued + worker started；之後於 `2026-04-18T00:31:21Z` 因 repeated Qwen terminal reassign back to `Codex2`，又在 `2026-04-18T00:31:29Z` 出現第二次 reviewer claim 給 `Qwen` 與 stale-wake skip，並於 `2026-04-18T00:31:36Z` 再次 auto-reassign 回 `Codex2`；接著在 `2026-04-18T00:31:45Z` 出現第三次 reviewer claim 給 `Qwen` 與 stale-wake skip，並於 `2026-04-18T00:31:54Z-2026-04-18T00:31:56Z` 記錄第二輪 Qwen wake queued + worker started；最後於 `2026-04-18T00:32:12Z` auto-reassign 回 `Codex2`，並在 `2026-04-18T00:32:14Z` 記錄最新一輪 `Codex2` wake queued + worker started。換句話說，reviewer-awaiting 的最新共享 L0 快照應以 `ai-status.json` 的 `00:32:06Z` task row、`current-work.md` 的 `Qwen -> Codex2` pending handoff，再加上 `ai-activity-log.jsonl` 中 `00:30:58Z-00:32:14Z` 的 handoff/reviewer-routing 鏈為主。
- Planning consensus 對此 task 的核心要求已固定：
  - `gap-phase2-planning-20260417/starter-draft.md:131-140` 明確規格：使用 Expo Location 背景能力，每 15 秒向 `/api/regulatory-registry/driver-location` POST 一次，且只在有進行中任務時啟動。
  - `gap-phase2-planning-20260417/starter-draft.md:50-58` 要求 A-0 capability bootstrap 把 proof capture / trip metrics / heartbeat 視為同一組 driver runtime capability，而不是三個互不相干的 UI patch。
  - `gap-phase2-planning-20260417/starter-draft.md:87-94` 明確提醒 A-5 應重用 A-2 的 location session / tracker，而不是維護第二套定位狀態機。
  - `gap-phase2-planning-20260417/consensus-packet.md` 收錄此 task 為 M sizing，依賴 `PREP + GAP-P2S2-004`，Parent Owner=`Codex2`。

### Repo Baseline Anchors

- [`apps/driver-app/app/trip.tsx:66-101`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:66) — `handleAction(...)` 目前只做 task action API call；`completeTask(...)` 仍硬寫 `actualDistanceKm: 0` / `actualDurationSec: 0`，且完全沒有 location subscription、background task registration、或 heartbeat transport。
- [`apps/driver-app/package.json:15-35`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/package.json:15) — driver app `dependencies` 目前沒有 `expo-location`，也沒有 `expo-task-manager`；代表 PREP / capability bootstrap 尚未落地。
- [`apps/driver-app/app.json:2-10`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app.json:2) — 目前只有 `expo-router` plugin，沒有 location plugin、background location permission、或對應的 iOS/Android 設定。
- [`apps/driver-app/lib/api-client.ts:8-18`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/lib/api-client.ts:8) — driver app 已統一透過 `getDriverClient()` 取得 shared `ApiClient`；這是 heartbeat sender 應沿用的 client entrypoint。
- [`packages/api-client/src/index.ts:405-435`](/home/edna/workspace/drts-fleet-platform/packages/api-client/src/index.ts:405) — shared API client 目前只有 driver task methods（`listDriverTasks` / `acceptTask` / `startTask` / `completeTask` 等），**沒有** `sendDriverLocationHeartbeat(...)` 或任何 `/api/regulatory-registry/driver-location` helper。
- [`packages/api-client/src/index.ts:1212-1224`](/home/edna/workspace/drts-fleet-platform/packages/api-client/src/index.ts:1212) — `createDriverClient(...)` 已固定附帶 `x-actor-type=driver_user`、`x-actor-id=<driverId>`、`x-realm=driver` headers；heartbeat sender 若繞過 shared client，會偏離既有 auth/request-id pattern。
- `packages/contracts/src/index.ts` + `packages/api-client/src/index.ts` repo scan — 目前**不存在** `DriverLocationHeartbeatCommand`、`DriverEtaResponse`、或 `/driver-location` 對應的 typed client surface；這與 `GAP-P2S2-004` 尚未實作相符。
- `docs-site/index.html` 只是協作看板 shell，不提供額外的 driver heartbeat 產品語意或 acceptance 規則。

### Gap Summary

| 問題                                           | 影響                                              | 根本原因                                            |
| ---------------------------------------------- | ------------------------------------------------- | --------------------------------------------------- |
| background GPS heartbeat sender 不存在         | regulatory-registry 無法持續收到 driver 位置      | `GAP-P2S2-005` 尚未實作                             |
| `expo-location` / `expo-task-manager` 皆未安裝 | 無法啟用 background-capable location runtime      | `GAP-P2S2-PREP` 尚未完成，capability bootstrap 仍缺 |
| `app.json` 無 location/background permissions  | OS 層無法授權背景定位                             | PREP / capability bootstrap 尚未完成                |
| shared API client 無 `/driver-location` helper | sender 若直接上線，容易各自發明 transport surface | `GAP-P2S2-004` contract + helper 尚未落地           |
| `trip.tsx` 目前沒有 location lifecycle         | sender 沒有明確的 start/stop gate 可掛入          | trip screen 仍停留在純 task action demo baseline    |

---

## 3) Parent Acceptance Framing

`GAP-P2S2-005` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把 shared truth、consensus docs 與目前 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Formal gate：PREP capability 與 upstream heartbeat endpoint 已到位

- [ ] `GAP-P2S2-PREP` 已完成，至少讓 `apps/driver-app/package.json` 具備 `expo-location`；若實作採用 `TaskManager` / `Location.startLocationUpdatesAsync(...)`，則 `expo-task-manager` 也必須在 dependencies 中存在。
- [ ] `apps/driver-app/app.json` 已具備 location plugin 與背景定位所需的 Expo config/permissions；不能只停留在 `plugins: ["expo-router"]`。
- [ ] `GAP-P2S2-004` 已提供可用的 `/api/regulatory-registry/driver-location` endpoint 與對應 contract/client surface；若 upstream 尚未落地，本 task 不應自行發明一份平行 API 真相。
- [ ] parent closeout 能指出 PREP 與 `GAP-P2S2-004` 的實際落地 commit / artifact，而不是在 heartbeat sender 內偷偷內嵌 capability bootstrap 或 server workaround。

### AC-2 — Sender 只在有進行中任務時啟動，沒有任務時必須停用

- [ ] 只有在 driver 有進行中任務時，heartbeat sender 才會註冊 / 啟動；task 完成、取消、離開進行中狀態後會停止。
- [ ] implementation 不會在 app 冷啟動、無任務列表、或 task 尚未 `start` 前就持續背景上報位置。
- [ ] component unmount、screen refresh、或 app resume 時，不會重複建立多個 heartbeat loop / background registration。
- [ ] 若 `GAP-P2S2-002` 已建立前景 location tracker，本 task 優先重用同一個 tracker/session/store，而不是再寫第二套定位狀態機。

### AC-3 — 必須是 background-capable GPS sender，不得偷降級成 foreground-only tracking

- [ ] 若 parent 任務聲稱完成的是「background task / GPS heartbeat sender」，實作必須使用 Expo 支援的背景定位機制（例如 `Location.startLocationUpdatesAsync(...)` + `TaskManager.defineTask(...)`）或等效背景能力，而不是只在畫面活著時跑 `watchPositionAsync(...)`。
- [ ] 上報頻率約為每 15 秒一次；時間常數以 named constant / config 表達，不應把 `15000` 或等效 magic number 散落在多個 call site。
- [ ] 取得 background / foreground location permission 失敗時，app 以明確 alert、toast 或 log 表達 sender 未啟動，而不是靜默降級後繼續宣稱 heartbeat 正常運作。
- [ ] location event 取值至少包含目前 latitude / longitude；若 Expo event 同時提供 accuracy，sender 可一併上報給 upstream contract。

### AC-4 — Transport 必須沿用 shared driver client / upstream contract，不自行分叉

- [ ] sender 透過 shared `ApiClient` surface 發送 heartbeat，例如新增 typed helper 到 `@drts/api-client`，或至少經由 `getDriverClient().post(...)` 走同一套 request-id / default headers 流程；不應在 driver app 中直接寫裸 `fetch(...)` 略過既有 client 層。
- [ ] sender 使用 `GAP-P2S2-004` 已定義的 request body contract（若 upstream 匯出 `DriverLocationHeartbeatCommand`，則直接引用），不在 driver app 內複製一份平行 local interface。
- [ ] heartbeat transport 不需要自行注入 `x-tenant-id`；driver realm headers 應沿用 `createDriverClient(...)` 現有模式。
- [ ] 短暫網路失敗只影響當次 heartbeat；implementation 不應因單次 POST 失敗而讓 trip screen crash，或留下無法清理的重複 background task。

### AC-5 — 與 sibling / upstream task 的 scope fence 必須維持清楚

- [ ] 本 task 不負責實作 `GAP-P2S2-004` 的 server endpoint、ETA 計算或 `GAP-P2S2-003` migration；沒有 upstream 時，本 task 應保持 blocked，而不是用 mock URL / in-memory fallback 假裝完成。
- [ ] 本 task 不把 `actualDistanceKm` / `actualDurationSec` 的 foreground trip metrics 真值化當成自己主要交付；那些屬於 `GAP-P2S2-002`，本 task 最多只重用共用 tracker。
- [ ] 本 task 不吸收 `GAP-P2S2-001` 的 proof bundle / photo picker / base64 upload。
- [ ] 本 task 不引入 SSE、WebSocket、push、或其他 dispatch event 管道（那些屬於 `GAP-P2S2-007` / `GAP-P2S3-004`）。

### AC-6 — Verification / cleanup 要能證明「開始會送、結束會停、背景不中斷」

- [ ] `pnpm --filter @drts/driver-app typecheck` 通過，無新增 TypeScript 錯誤。
- [ ] 若 `packages/api-client` 或 `packages/contracts` 因 heartbeat helper / contract 有 additive 變更，對應 package 的 typecheck/build 也通過。
- [ ] smoke path 至少能證明：有進行中任務時，約 15 秒內送出第一筆 heartbeat；task 完成後，不再繼續送。
- [ ] app 進入 background / resume 後，不會因 lifecycle 重跑而註冊重複 sender；任何 background registration 在 task 結束時都被正確取消。
- [ ] location / background task 型別使用明確 annotation，不用 `as any` 繞過 Expo API 型別。

---

## 4) Dependency Map

### Formal Dependencies

> 以 machine truth 為準，`GAP-P2S2-005.depends_on` = `GAP-P2S2-PREP` + `GAP-P2S2-004`。

| Dep    | Source          | Status    | Notes                                                                                                  |
| ------ | --------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| D-UP-1 | `GAP-P2S2-PREP` | `backlog` | capability bootstrap：Expo location/background runtime 與 app config 必須先可用                        |
| D-UP-2 | `GAP-P2S2-004`  | `backlog` | sender 需要已存在的 `/api/regulatory-registry/driver-location` endpoint 與對應 contract/client surface |

### Practical Context Dependencies

| Dep   | Type                                                                        | Why It Matters                                                                                     |
| ----- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| D-P-1 | Planning consensus (`starter-draft.md:131-140`)                             | 定義 A-5 的背景 heartbeat 核心要求：15 秒、POST `/driver-location`、只在進行中任務啟動             |
| D-P-2 | Shared capability bootstrap (`starter-draft.md:50-58`)                      | proof / trip metrics / heartbeat 共用同一組 Expo capability，不能把 A-5 當成零前置 UI patch        |
| D-P-3 | A-2 reuse note (`starter-draft.md:87-94`)                                   | A-5 應重用 A-2 tracker/session，避免 foreground/background 各自維護一套定位狀態                    |
| D-P-4 | `apps/driver-app/package.json` + `app.json` baseline                        | 目前缺 `expo-location`、`expo-task-manager`、以及背景定位 config，說明 PREP 尚未落地               |
| D-P-5 | `apps/driver-app/lib/api-client.ts` + `packages/api-client/src/index.ts`    | driver app 已有 shared client entrypoint 與 driver realm headers，heartbeat transport 應沿用       |
| D-P-6 | `packages/contracts/src/index.ts` / `packages/api-client/src/index.ts` scan | heartbeat contract / helper 目前不存在，說明本 task 不能脫離 `GAP-P2S2-004` 自己造一套平行 surface |

### Forward (Downstream) Dependencies

| Dep     | Status                               | Why It Matters                                                                           |
| ------- | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| D-FWD-1 | `GAP-P2S3-003` (`backlog`, indirect) | real-time ETA 的資料新鮮度最終會依賴 sender 實際把 driver 位置持續送進 upstream pipeline |
| D-FWD-2 | `GAP-P2S3-004` (`backlog`, indirect) | SSE dispatch board 若要顯示即時 driver 位置 / ETA，最終仍間接受益於 sender 上線          |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md` (`A-0`, `A-2`, `A-5`)
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md` (GAP-P2S2-005 row + dependency graph)
- Repo anchors:
  - `apps/driver-app/app/trip.tsx` (`handleAction`, no location sender)
  - `apps/driver-app/package.json` (missing `expo-location` / `expo-task-manager`)
  - `apps/driver-app/app.json` (missing location/background plugin + permissions)
  - `apps/driver-app/lib/api-client.ts` (driver client entrypoint)
  - `packages/api-client/src/index.ts` (driver methods exist, heartbeat helper absent)
  - `packages/contracts/src/index.ts` (heartbeat contract absent in current baseline)

---

## 5) Evidence Inventory

| ID   | Evidence                                                        | Expected Anchor                                                                                                                         |
| ---- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                                  | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                                                                            |
| E-2  | A-5 heartbeat sender spec                                       | `gap-phase2-planning-20260417/starter-draft.md:131-140`                                                                                 |
| E-3  | Shared capability bootstrap requirement                         | `gap-phase2-planning-20260417/starter-draft.md:50-58`                                                                                   |
| E-4  | A-2/A-5 should reuse one tracker                                | `gap-phase2-planning-20260417/starter-draft.md:87-94`                                                                                   |
| E-5  | Formal dependency row (`PREP + GAP-P2S2-004`)                   | `consensus-packet.md` GAP-P2S2-005 row                                                                                                  |
| E-6  | trip screen has no sender today                                 | `apps/driver-app/app/trip.tsx:66-101`                                                                                                   |
| E-7  | `expo-location` / `expo-task-manager` absent                    | `apps/driver-app/package.json:15-35`                                                                                                    |
| E-8  | app config lacks location/background setup                      | `apps/driver-app/app.json:2-10`                                                                                                         |
| E-9  | shared API client lacks heartbeat helper but has driver headers | `packages/api-client/src/index.ts:405-435`, `:1212-1224`                                                                                |
| E-10 | current repo baseline lacks heartbeat contract/client surface   | repo scan for `DriverLocationHeartbeatCommand`, `DriverEtaResponse`, `/driver-location` in `packages/contracts` + `packages/api-client` |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S2-005` 是 `backlog`，Owner=`Codex2`，正式依賴是 `GAP-P2S2-PREP` + `GAP-P2S2-004`；sidecar 最新 reviewer-awaiting 快照是建立於 `2026-04-18T00:32:06Z` 的 pending `Qwen -> Codex2`，authoritative row 仍由 owner=`Codex` / reviewer=`Codex2` 持有。
2. AC-1 是否正確把 formal gate 鎖在 PREP + upstream endpoint，而不是讓 sender 自己補一套 capability bootstrap 或 fake server surface。
3. AC-2 / AC-3 是否正確區分「background-capable heartbeat sender」與 `GAP-P2S2-002` 的 foreground-only trip metrics，避免 scope 偷降級。
4. AC-4 是否正確要求沿用 shared `getDriverClient()` / `ApiClient` / upstream contract，而不是裸 `fetch(...)` 或 local duplicated type。
5. AC-5 是否把 scope fence 寫清楚：不吸收 `GAP-P2S2-002`、`GAP-P2S2-001`、`GAP-P2S2-004`、`GAP-P2S2-003`、SSE / WebSocket 等其他工作。
6. AC-6 的 verification path 是否足以驗證「開始會送、結束會停、背景不中斷且不重複註冊」。
7. support artifact 是否完全停留在支援材料層，沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S2-005 acceptance packet ready: machine truth shows parent backlog with formal PREP + GAP-P2S2-004 gates, sidecar scope correctly locked to a background-capable driver-app GPS heartbeat sender that starts only for in-progress tasks, reuses the shared location capability where practical, sends through the shared driver client / upstream contract instead of inventing a parallel API surface, keeps GAP-P2S2-002 foreground metrics and server-side heartbeat endpoint work out of scope, and stays within support-only sidecar boundaries without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / scope drift / background-vs-foreground ambiguity / wrong client transport guidance / missing PREP or GAP-P2S2-004 gate / overclaimed sibling coverage]`

---

## 7) Handoff Command

Owner（`Codex`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff GAP-P2S2-005-SIDECAR-ACCEPTANCE Codex2 "GAP-P2S2-005 acceptance packet refreshed at support/sidecars/GAP-P2S2-005/GAP-P2S2-005-SIDECAR-ACCEPTANCE.md. It keeps machine truth aligned on parent backlog with formal PREP + GAP-P2S2-004 gates, updates the sidecar review snapshot to the latest 2026-04-18T00:32:06Z Qwen -> Codex2 handoff plus the 2026-04-18T00:30:58Z-2026-04-18T00:32:14Z reviewer-routing chain ending in the latest Codex2 wake/worker-start, anchors the work to a background-capable Expo GPS heartbeat sender that runs only for in-progress tasks, requires reuse of the shared driver client and upstream contract rather than a parallel fetch surface, and keeps GAP-P2S2-002 foreground metrics plus server-side endpoint/migration work explicitly out of scope."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve GAP-P2S2-005-SIDECAR-ACCEPTANCE "GAP-P2S2-005 acceptance packet ready: machine truth shows parent backlog with formal PREP + GAP-P2S2-004 gates, sidecar scope correctly locked to a background-capable driver-app GPS heartbeat sender for in-progress tasks, AC checklist requires reuse of the shared driver client and upstream contract, keeps GAP-P2S2-002 foreground metrics and server-side heartbeat endpoint work out of scope, and stays within support-only sidecar boundaries without mutating canonical truth."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen GAP-P2S2-005-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / scope drift / background-vs-foreground ambiguity / wrong client transport guidance / missing PREP or GAP-P2S2-004 gate / overclaimed sibling coverage]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Codex`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done GAP-P2S2-005-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S2-005 at support/sidecars/GAP-P2S2-005/GAP-P2S2-005-SIDECAR-ACCEPTANCE.md. The packet preserves the formal PREP + GAP-P2S2-004 gates, frames GAP-P2S2-005 as a background-capable Expo GPS heartbeat sender for in-progress tasks only, requires reuse of the shared driver client / upstream contract, records the current dependency and app-config gaps, and keeps sibling/server-side work out of scope without changing canonical truth."
```

---

## 10) Change Log

- 2026-04-17T17:16Z — 初版建立：依共享 machine truth、consensus docs (`gap-phase2-planning-20260417/starter-draft.md` A-0/A-2/A-5、`consensus-packet.md` GAP-P2S2-005 row) 與 repo 掃描（`trip.tsx` 無 location sender；`package.json` 缺 `expo-location` / `expo-task-manager`；`app.json` 無 location/background config；shared api client 無 heartbeat helper，但已有 driver realm headers）整理 `GAP-P2S2-005` 的 acceptance checklist、formal/practical dependency map、evidence inventory 與 reviewer handoff 指引。
- 2026-04-17T23:18Z — 依最新 shared L0 刷新 reviewer-awaiting 快照：將 packet 頂部與 §2 baseline 改寫到 `2026-04-17T23:17:34Z` 的 authoritative task row / pending handoff 狀態，補入 `2026-04-17T23:16:23Z-2026-04-17T23:17:43Z` 的 Qwen availability-first claims、stale-wake skips、worker starts、auto-reassignments back to `Codex2`，以及最新 `Codex2` wake queued + worker started 事實；既有 PREP + GAP-P2S2-004 gate、background-capable sender framing、shared client / upstream contract 約束與 sibling scope fence 均未改動。
- 2026-04-17T23:24Z — 再次依共享 L0 刷新 reviewer handoff：packet 頂部與 §2 baseline 追到 `ai-status.json.last_update=2026-04-17T23:22:52Z`、`current-work.md` 的 `2026-04-17T23:23:02Z` handoff queue，以及 `ai-activity-log.jsonl` 中 `2026-04-17T23:20:56Z-2026-04-17T23:23:07Z` 的 Qwen worker-start / stale-wake / fallback back to `Codex2` / `Codex2` wake+worker-start 鏈；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
- 2026-04-17T23:25Z — owner 以 `scripts/ai_status.py handoff` 正式交給 `Codex2` 後，再把 packet 對齊到新的 authoritative row：`ai-status.json.last_update=2026-04-17T23:25:04Z`、`current-work.md` 的 pending `Codex -> Codex2` handoff，以及 `ai-activity-log.jsonl` 中同 timestamp 的 `Codex` handoff event；原有 PREP + GAP-P2S2-004 formal gate、background-capable sender framing、shared client / upstream contract 約束、sibling scope fence 與 support-only 邊界均未改動。
- 2026-04-17T23:30Z — 依最新共享 L0 再次刷新 reviewer-awaiting 快照：packet 頂部、§2 baseline 與 reviewer hotspot 改寫到 `ai-status.json.last_update=2026-04-17T23:29:44Z`、`current-work.md` 的 pending `Qwen -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中 `2026-04-17T23:27:57Z-2026-04-17T23:30:00Z` 的 Qwen fallback / stale-wake / worker-start / reassignment loop，並納入最後的 `Codex2` wake queued + worker started 事實；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
- 2026-04-17T23:31Z — owner 再次以 `scripts/ai_status.py handoff` 對 `Codex2` 送出 refreshed packet；`ai-activity-log.jsonl` 新增 `2026-04-17T23:31:41Z` 的 handoff event，但截至本次刷新時，`ai-status.json` 的 authoritative task row 與 `current-work.md` 的 pending handoff queue 仍維持 `2026-04-17T23:29:44Z` 的 `Qwen -> Codex2` reviewer-awaiting 狀態，因此 packet 明確同時記錄 row-state 與 activity-log 兩個層次，避免誤報 machine truth 已被覆寫。
- 2026-04-17T23:46Z — 再次依共享 L0 刷新 reviewer-awaiting 快照：packet 頂部、§2 baseline 與 reviewer hotspot 改寫到 `ai-status.json.last_update=2026-04-17T23:45:08Z`、`current-work.md` 的 pending `Qwen -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中 `2026-04-17T23:44:19Z-2026-04-17T23:45:17Z` 的 Qwen fallback / wake / stale-wake / worker-start / reassignment loop，並納入最後的 `Codex2` wake queued + worker started 事實；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
- 2026-04-17T23:50Z — 再次依共享 L0 刷新 reviewer-awaiting 快照：packet 頂部、§2 baseline 與 reviewer hotspot 改寫到 `ai-status.json.last_update=2026-04-17T23:49:40Z`、`current-work.md` 的 pending `Qwen -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中 `2026-04-17T23:49:13Z-2026-04-17T23:49:55Z` 的 Qwen fallback / wake / stale-wake / worker-start / reassignment loop，並納入最後的 `Codex2` wake queued + worker started 事實；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
- 2026-04-17T23:54Z — 再次依共享 L0 刷新 reviewer-awaiting 快照：packet 頂部、§2 baseline 與 reviewer hotspot 改寫到 `ai-status.json.last_update=2026-04-17T23:54:05Z`、`current-work.md` 的 pending `Qwen -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中 `2026-04-17T23:52:41Z-2026-04-17T23:54:14Z` 的 Qwen fallback / wake / stale-wake / worker-start / reassignment loop，並納入最後的 `Codex2` wake queued + worker started 事實；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
- 2026-04-17T23:58Z — 再次依共享 L0 刷新 reviewer-awaiting 快照：packet 頂部、§2 baseline 與 reviewer hotspot 改寫到 `ai-status.json.last_update=2026-04-17T23:57:52Z`、`current-work.md` 的 pending `Qwen -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中 `2026-04-17T23:56:09Z-2026-04-17T23:58:07Z` 的 owner handoff後 reviewer fallback / wake / stale-wake / worker-start / reassignment loop，並納入最後的 `Codex2` wake queued + worker started 事實；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
- 2026-04-18T00:04Z — 再次依共享 L0 刷新 reviewer-awaiting 快照：packet 頂部、§2 baseline 與 reviewer hotspot 改寫到 `ai-status.json.last_update=2026-04-18T00:03:44Z`、`current-work.md` 的 pending `Qwen -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中 `2026-04-18T00:02:16Z-2026-04-18T00:03:53Z` 的 Qwen fallback / wake / stale-wake / worker-start / reassignment loop，並納入最後的 `Codex2` wake queued + worker started 事實；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
- 2026-04-18T00:08Z — 再次依共享 L0 刷新 reviewer-awaiting 快照：packet 頂部、§2 baseline 與 reviewer hotspot 改寫到 `ai-status.json.last_update=2026-04-18T00:08:15Z`、`current-work.md` 的 pending `Qwen -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中 `2026-04-18T00:06:29Z-2026-04-18T00:08:30Z` 的 Qwen fallback / wake / stale-wake / worker-start / reassignment loop，並納入最後的 `Codex2` wake queued + worker started 事實；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
- 2026-04-18T00:10Z — owner 以 `scripts/ai_status.py handoff` 對 `Codex2` 送出 refreshed packet 後，再把 packet 對齊到新的 authoritative row：`ai-status.json.last_update=2026-04-18T00:10:32Z`、`current-work.md` 的 pending `Codex -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中同 timestamp 的 `Codex` handoff event；既有 `2026-04-18T00:06:29Z-2026-04-18T00:08:30Z` reviewer-routing 鏈、PREP + GAP-P2S2-004 formal gate、background-capable sender framing、shared client / upstream contract 約束與 support-only 邊界均未改動。
- 2026-04-18T00:15Z — 再次依共享 L0 刷新 reviewer-awaiting 快照：packet 頂部、§2 baseline 與 reviewer hotspot 改寫到 `ai-status.json.last_update=2026-04-18T00:15:04Z`、`current-work.md` 的 pending `Qwen -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中 `2026-04-18T00:14:08Z-2026-04-18T00:15:13Z` 的 Qwen fallback / wake / stale-wake / worker-start / reassignment loop，並納入最後的 `Codex2` wake queued + worker started 事實；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
- 2026-04-18T00:17Z — 再次依共享 L0 刷新 reviewer-awaiting 快照：packet 頂部、§2 baseline、handoff command 與 reviewer hotspot 改寫到 `ai-status.json.last_update=2026-04-18T00:17:39Z`、`current-work.md` 的 pending `Qwen -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中 `2026-04-18T00:17:01Z-2026-04-18T00:17:48Z` 的 owner handoff / Codex2 fallback / Qwen worker-start / worker-superseded / reassignment back to `Codex2` / latest Codex2 wake+worker-start 鏈；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
- 2026-04-18T00:23Z — 再次依共享 L0 刷新 reviewer-awaiting 快照：packet 頂部、§2 baseline、handoff command 與 reviewer hotspot 改寫到 `ai-status.json.last_update=2026-04-18T00:22:59Z`、`current-work.md` 的 pending `Qwen -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中 `2026-04-18T00:22:28Z-2026-04-18T00:23:09Z` 的 reviewer claim / stale-wake skip / Qwen worker-start / reassignment back to `Codex2` / latest Codex2 wake+worker-start 鏈；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
- 2026-04-18T00:28Z — 再次依共享 L0 刷新 reviewer-awaiting 快照：packet 頂部、§2 baseline、reviewer hotspot 與 handoff command 改寫到 `ai-status.json.last_update=2026-04-18T00:27:25Z`、`current-work.md` 的 pending `Qwen -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中 `2026-04-18T00:26:10Z-2026-04-18T00:27:34Z` 的 reviewer claim / stale-wake skip / Qwen worker-start / reassignment back to `Codex2` / latest Codex2 wake+worker-start 鏈；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
- 2026-04-18T00:32Z — 再次依共享 L0 刷新 reviewer-awaiting 快照：packet 頂部、§2 baseline、reviewer hotspot 與 handoff command 改寫到 `ai-status.json.last_update=2026-04-18T00:32:06Z`、`current-work.md` 的 pending `Qwen -> Codex2` handoff row，以及 `ai-activity-log.jsonl` 中 `2026-04-18T00:30:58Z-2026-04-18T00:32:14Z` 的 reviewer claim / stale-wake skip / Qwen worker-start / reassignment back to `Codex2` / latest Codex2 wake+worker-start 鏈；功能範圍、formal gate、shared client 約束與 support-only 邊界均未改動。
