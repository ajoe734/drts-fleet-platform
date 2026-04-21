# GAP-P2S2-002 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S2-002` — driver-app: trip screen Expo Location metrics (actualDistanceKm/actualDurationSec)  
**Current Sidecar Owner:** `Claude`  
**Assigned Reviewer:** `Codex` (auto-reassigned from `Qwen` at `2026-04-17T15:03:55Z` after repeated Qwen terminal `401`)  
**Parent Owner / Reviewer:** `Codex2` / `(unset in machine truth)`  
**Last Revised:** `2026-04-17T15:06Z (UTC)`  
**Status:** `review` (owner Claude has prepared the packet; pending reviewer response now belongs to `Codex`)

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S2-002` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- **In scope:** support-only acceptance framing, dependency mapping, repo-scan evidence anchors, Expo Location integration baseline, reviewer checklist.
- **Out of scope:** 修改 `trip.tsx` 主線 runtime、L1/L2 真相修改、contracts/schema 變更（`DriverCompleteTaskCommand` 已正確定義，不需要改）、新增 API endpoints、或以任何方式修改 server-side owned-mobility service。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S2-002` 在 machine truth 中目前是 `backlog`，Owner=`Codex2`，`reviewer=""`，正式依賴為 `GAP-P2S2-PREP`。
- 本 sidecar `GAP-P2S2-002-SIDECAR-ACCEPTANCE` 在目前 shared L0 task row 中是 `status=review`，Owner=`Claude`、Reviewer=`Codex`；`ai-status.json` handoff queue 保留一筆 `Qwen -> Codex` 的 pending reviewer reassignment，訊息為 repeated Qwen terminal `401`。
- Planning consensus 對此 task 有完整溯源：
  - `gap-phase2-planning-20260417/starter-draft.md` 明確指出 `trip.tsx:85-89` hardcodes `actualDistanceKm: 0, actualDurationSec: 0`，是 sprint 2 需修補的 A-2 gap。
  - `gap-phase2-planning-20260417/review-round-1.md` 確認：`trip.tsx` 完成任務時仍直接送 `actualDistanceKm: 0` / `actualDurationSec: 0`（`apps/driver-app/app/trip.tsx:66-90`）。
  - `gap-phase2-planning-20260417/consensus-packet.md` 以 M sizing（1-2 天，100-300 LOC）收錄，Owner=Codex2，依賴 `GAP-P2S2-PREP`。

### Repo Baseline Anchors

- [`apps/driver-app/app/trip.tsx:85-89`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:85) — `completeTask` call 目前硬寫 `actualDistanceKm: 0, actualDurationSec: 0`，不帶真實 Expo Location 測量值。
- [`apps/driver-app/package.json`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/package.json) — **`expo-location` 目前不在 dependencies 中**；實作前必須先完成 `GAP-P2S2-PREP`（安裝 `expo-location`、更新 `app.json` permissions）。
- [`apps/driver-app/app.json`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app.json) — 目前無 `expo-location` plugin 和 location permissions 設定（`NSLocationWhenInUseUsageDescription` 等）；`GAP-P2S2-PREP` 必須先加入。
- [`packages/contracts/src/index.ts:609-615`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:609) — `DriverCompleteTaskCommand` 定義：`actualDistanceKm: number` 和 `actualDurationSec: number` 是 **required fields**，不是 nullable，server 端有明確的 assignment（`owned-mobility.service.ts:1735-1736`）。
- [`tests/e2e/fixtures/e2e-driver-complete.json`](/home/edna/workspace/drts-fleet-platform/tests/e2e/fixtures/e2e-driver-complete.json) — E2E fixture 使用 `actualDistanceKm: 22.4, actualDurationSec: 2100`，表示 server 端正常接受真實數值。
- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1735-1736`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1735) — `task.actualDistanceKm = command.actualDistanceKm; task.actualDurationSec = command.actualDurationSec;`：server-side assignment 是真實執行的，`0, 0` 硬碼會被存入 DB 並可能影響計費邏輯。

### Gap Summary

| 問題                                       | 影響                        | 根本原因                               |
| ------------------------------------------ | --------------------------- | -------------------------------------- |
| `completeTask` 硬寫 `actualDistanceKm: 0`  | 計費/報表中行程距離永遠為 0 | `expo-location` 未安裝，無行程追蹤邏輯 |
| `completeTask` 硬寫 `actualDurationSec: 0` | 計費/報表中行程時長永遠為 0 | 無計時器在 `startTask` 時記錄開始時間  |
| `app.json` 無 location permissions         | 執行階段 OS 拒絕存取 GPS    | `GAP-P2S2-PREP` 尚未執行               |

---

## 3) Parent Acceptance Framing

`GAP-P2S2-002` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把 shared truth 與現有 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — expo-location 依賴已安裝（PREP gate）

- [ ] `apps/driver-app/package.json` 的 `dependencies` 中有 `expo-location`（版本與 expo SDK 54 相容，例如 `~18.x.x`）。
- [ ] `apps/driver-app/app.json` 的 `expo.plugins` 已加入 `expo-location`（或其 config plugin），且有 iOS 的 `NSLocationWhenInUseUsageDescription` 等 permission 說明。
- [ ] 若 PREP 由獨立 commit 完成，parent task commit log 中能追溯到 PREP 變更。

### AC-2 — Trip 開始時啟動位置追蹤

- [ ] 在 `handleAction("start")` 路徑（或 `startTask` 成功後）使用 `expo-location` API（例如 `Location.watchPositionAsync` 或 `Location.requestForegroundPermissionsAsync` + `watchPositionAsync`）開始追蹤位置。
- [ ] 追蹤精度設定合理（`accuracy: Location.Accuracy.Balanced` 或以上），不使用 `Accuracy.Lowest`。
- [ ] 請求 foreground 位置權限失敗時，App 顯示說明性 alert 而非靜默降級為 0/0 硬碼。
- [ ] 開始追蹤時同步記錄 `tripStartTime`（`Date.now()` 或 `new Date().getTime()`）以便後續計算 `actualDurationSec`。

### AC-3 — 累積距離計算（haversine 或等效）

- [ ] 每次位置更新都使用 haversine 公式（或等效球面距離公式）計算增量距離，並累積到 `totalDistanceKm` 狀態變數。
- [ ] haversine 實作不引入外部依賴（純 JS/TS 函式即可），或使用 `expo-location` 現有工具。
- [ ] 不使用直線距離（起點到終點歐氏距離）代替累積路徑距離，因為行程路線通常非直線。
- [ ] 若整個 trip 只收到一個位置點，`actualDistanceKm` 應為 `0`（沒有增量），不為 `null` 或 `undefined`。

### AC-4 — completeTask 帶入真實測量值

- [ ] `handleAction("complete")` 路徑中，`completeTask` 呼叫使用實際計算的 `actualDistanceKm`（累積距離，精度合理，例如 2 位小數）和 `actualDurationSec`（整數秒）。
- [ ] `actualDurationSec` 以 `Math.round((Date.now() - tripStartTime) / 1000)` 或等效方式計算，不硬碼為 0。
- [ ] `actualDistanceKm` 是 `number` 型別（非 null/undefined），符合 `DriverCompleteTaskCommand.actualDistanceKm: number` 合約。
- [ ] 完成後停止位置追蹤（cleanup：`subscription.remove()` 或等效），避免後台 GPS 持續耗電。

### AC-5 — 非行程期間不追蹤位置（這是 foreground-only task）

- [ ] 位置追蹤僅在「trip in progress」期間（即 `startTask` 成功後、`completeTask` 前）啟動。
- [ ] 進入非 in-progress 狀態（例如 component unmount、trip 被取消）時，subscription 被正確 cleanup。
- [ ] 本 task 不實作後台常駐 GPS heartbeat（`GAP-P2S2-005` 的職責）。本 task 僅追蹤前景行程距離與時長。

### AC-6 — 不修改 contracts 或 server-side 邏輯

- [ ] `packages/contracts/src/index.ts` 中的 `DriverCompleteTaskCommand` 定義不被修改（已正確定義，無需變更）。
- [ ] `apps/api/src/modules/owned-mobility/` 內的 service、controller、repository 不被修改。
- [ ] 本 task 不引入任何 DB migration。
- [ ] 不新增或修改任何 `@Controller` route surface。

### AC-7 — TypeScript 類型安全

- [ ] `pnpm --filter @drts/driver-app typecheck` 通過，無新增 TypeScript 錯誤。
- [ ] 位置追蹤 state 有適當型別標注（例如 `LocationSubscription | null`、`number | null` 等）。
- [ ] 不使用 `as any` cast 繞過 Location API 型別。

---

## 4) Dependency Map

### Formal Dependencies

> 以 machine truth 為準，`GAP-P2S2-002.depends_on` 在 consensus-packet 中標記為依賴 `GAP-P2S2-PREP`。

| Dep    | Source          | Status    | Notes                                                                                                                     |
| ------ | --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- |
| D-UP-1 | `GAP-P2S2-PREP` | `backlog` | **必要前置**：安裝 `expo-location`、更新 `app.json` permissions；若 PREP 未完成，`expo-location` 不存在，本 task 無法實作 |

### Practical Context Dependencies

| Dep     | Type                                                                 | Why It Matters                                                                                  |
| ------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| D-P-1   | Planning consensus (`gap-phase2-planning-20260417/starter-draft.md`) | 確認 hardcoded 0/0 為根本 gap                                                                   |
| D-P-2   | `gap-phase2-planning-20260417/consensus-packet.md` GAP-P2S2-002 row  | 確認 M sizing 與 PREP 依賴                                                                      |
| D-P-3   | `gap-phase2-planning-20260417/review-round-1.md`                     | 確認 `trip.tsx:66-90` 為 A-2 gap 的源頭                                                         |
| D-P-4   | `packages/contracts/src/index.ts:609-615`                            | `DriverCompleteTaskCommand` 要求 `actualDistanceKm: number`，非 nullable，不能送 `0` 作為實際值 |
| D-P-5   | `owned-mobility.service.ts:1735-1736`                                | Server 直接 assign `command.actualDistanceKm` 到 task 記錄，`0` 值會被存入 DB                   |
| D-FWD-1 | `GAP-P2S2-005`                                                       | GPS 後台常駐 heartbeat 是 downstream；本 task 只做 trip-scoped foreground 距離/時長追蹤         |
| D-FWD-2 | `GAP-P2S2-001`                                                       | Proof bundle（照片上傳）是平行任務；本 task 不包含 `proof` 欄位的實作                           |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-1.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md`
- Repo anchors:
  - `apps/driver-app/app/trip.tsx` (`:85-89`)
  - `apps/driver-app/package.json` (missing `expo-location`)
  - `apps/driver-app/app.json` (missing location permissions)
  - `packages/contracts/src/index.ts` (`:609-615`)
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` (`:1735-1736`)
  - `tests/e2e/fixtures/e2e-driver-complete.json` (real-value fixture)

---

## 5) Evidence Inventory

| ID   | Evidence                                                  | Expected Anchor                                                              |
| ---- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                            | `ai-status.json`, `current-work.md`                                          |
| E-2  | Hardcoded 0/0 gap identified                              | `gap-phase2-planning-20260417/starter-draft.md` A-2 gap, `review-round-1.md` |
| E-3  | Required implementation shape (Expo Location + haversine) | `consensus-packet.md` GAP-P2S2-002 row, M sizing                             |
| E-4  | PREP dependency (expo-location not installed)             | `apps/driver-app/package.json` — expo-location absent                        |
| E-5  | app.json missing location permissions                     | `apps/driver-app/app.json` — no expo-location plugin                         |
| E-6  | Contract requires non-nullable number fields              | `packages/contracts/src/index.ts:611-612`                                    |
| E-7  | Server stores field value directly from command           | `owned-mobility.service.ts:1735-1736`                                        |
| E-8  | E2E fixture proves server accepts real values             | `tests/e2e/fixtures/e2e-driver-complete.json`                                |
| E-9  | Current hardcoded zero payload                            | `apps/driver-app/app/trip.tsx:87-88`                                         |
| E-10 | GAP-P2S2-005 owns background GPS (not this task)          | `consensus-packet.md` GAP-P2S2-005 row                                       |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S2-002` 是 `backlog`（未實作），owner=`Codex2`、reviewer unset；sidecar 是 `review`，owner=`Claude`、reviewer=`Codex`。
2. AC-1 是否正確要求 PREP gate：`expo-location` 安裝與 `app.json` permissions 更新是前置條件，不能跳過。
3. AC-2~AC-4 是否合理描述 Expo Location 的 foreground trip tracking 實作模式：`watchPositionAsync` + haversine 累積 + `tripStartTime` 計時。
4. AC-5 是否明確區分本 task（trip-scoped foreground 追蹤）與 `GAP-P2S2-005`（後台常駐 heartbeat），確保 scope 不重疊。
5. AC-6 是否正確凍結「不修改 contracts 或 server-side」的邊界：`DriverCompleteTaskCommand` 已定義正確，本 task 只改 driver-app UI 行為。
6. E-7 是否正確引用 server-side assignment 作為「hardcoded 0 有實際危害」的依據。
7. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S2-002 acceptance packet ready: machine truth shows parent backlog with PREP dependency, sidecar scope correctly locked to driver-app trip.tsx Expo Location integration (foreground only, not background heartbeat), AC checklist correctly gates on expo-location install (PREP), requires haversine accumulation + startTime tracking, prohibits contracts/server-side changes, and stays within support-only sidecar boundaries without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / scope drift / wrong expo-location API guidance / AC logic that allows background tracking scope / overclaimed server-side coverage]`

---

## 7) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff GAP-P2S2-002-SIDECAR-ACCEPTANCE Codex "GAP-P2S2-002 acceptance packet ready at support/sidecars/GAP-P2S2-002/GAP-P2S2-002-SIDECAR-ACCEPTANCE.md. It keeps machine truth aligned on parent backlog with PREP dependency, identifies trip.tsx:87-88 hardcoded 0/0 as the root gap, gates AC-1 on expo-location installation, requires foreground-only Location.watchPositionAsync + haversine distance accumulation + tripStartTime for duration, prohibits contracts/server-side modification, and clearly separates scope from GAP-P2S2-005 background heartbeat."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S2-002-SIDECAR-ACCEPTANCE "GAP-P2S2-002 acceptance packet ready: machine truth shows parent backlog with PREP dependency, sidecar scope correctly locked to driver-app Expo Location foreground trip tracking, AC checklist gates on expo-location install, requires haversine distance accumulation and startTime-based duration, prohibits contracts and server-side changes, correctly distinguishes from GAP-P2S2-005 background heartbeat scope, and stays within support-only sidecar boundaries."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S2-002-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / scope drift / wrong expo-location API guidance / AC logic that allows background tracking scope / overclaimed server-side coverage]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Claude`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done GAP-P2S2-002-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S2-002 at support/sidecars/GAP-P2S2-002/GAP-P2S2-002-SIDECAR-ACCEPTANCE.md. The packet preserves the PREP gate, trip.tsx:87-88 hardcoded-zero baseline, Expo Location foreground-only integration framing, and reviewer handoff path without changing canonical truth."
```

---

## 10) Change Log

- 2026-04-17T15:06Z — metadata refresh：將 reviewer / parent ownership / status 說明對齊 shared L0 最新 machine truth（sidecar reviewer 已從 `Qwen` 改派為 `Codex`，parent owner=`Codex2` 且 reviewer unset），不變更 acceptance framing。
- 2026-04-17T15:03Z — 初版建立：依共享 machine truth、consensus docs (`gap-phase2-planning-20260417/starter-draft.md`、`review-round-1.md`、`consensus-packet.md`) 與 repo 掃描 (`trip.tsx:87-88`、`package.json`、`app.json`、`contracts:611-612`、`owned-mobility.service.ts:1735-1736`)，整理 `GAP-P2S2-002` 的 acceptance checklist、PREP dependency gate、Expo Location foreground integration baseline、以及 reviewer handoff 指引。
