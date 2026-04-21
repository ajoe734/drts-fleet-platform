# GAP-P2S2-004 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S2-004` — regulatory-registry: driver location heartbeat endpoint + haversine ETA calculation  
**Current Sidecar Owner:** `Claude`  
**Assigned Reviewer:** `Codex`  
**Parent Owner:** `Codex` (per machine truth, `status=backlog`, `depends_on: GAP-P2S2-003`)  
**Last Revised:** `2026-04-17T16:52Z (UTC)`  
**Status:** `review` (Claude has prepared the packet; pending reviewer response belongs to `Codex`)

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S2-004` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- **In scope:** support-only acceptance framing, dependency mapping, repo-scan evidence anchors, regulatory-registry module baseline, haversine ETA acceptance criteria, reviewer checklist.
- **Out of scope:** 修改 `regulatory-registry.controller.ts`、`.service.ts`、`.repository.ts` 主線 runtime，修改 `packages/contracts/src/index.ts`（L1 真相），新增 DB migration，或以任何方式修改 `ops.phase1_driver_locations` schema（GAP-P2S2-003 的職責）。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S2-004` 在 machine truth 中目前是 `backlog`，Owner=`Codex`，正式依賴為 `GAP-P2S2-003`（V0019 migration）。
- 本 sidecar `GAP-P2S2-004-SIDECAR-ACCEPTANCE` 在 machine truth 中目前是 `review`，Owner=`Claude`，Reviewer=`Codex`，`last_update=2026-04-17T16:41:51Z`；handoff queue 也同步顯示一筆 pending `Claude -> Codex` reviewer handoff，代表 packet 已完成交接並等待 reviewer 正式回應。
- Planning consensus 對此 task 有完整溯源：
  - `gap-phase2-planning-20260417/starter-draft.md:120-127` 明確規格：`POST /api/regulatory-registry/driver-location` + `GET /api/regulatory-registry/driver-eta`，預估 ~120 LOC，M sizing（1-2 天）。
  - `gap-phase2-planning-20260417/consensus-packet.md` 收錄，依賴 V0019 migration，Codex 為 owner。

### Repo Baseline Anchors

- [`apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts) — 目前有 GET/POST vehicles、drivers、contracts、policies、exclusivities；**不存在** `/driver-location` 或 `/driver-eta` 路由。
- [`apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts) — 目前無任何 driver location heartbeat 或 haversine 計算邏輯。
- [`apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts) — 目前無 `upsert` driver location 方法。
- [`packages/contracts/src/index.ts`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts) — 目前**不存在** `DriverLocationHeartbeatCommand`、`DriverEtaResponse` 或等效型別；`EtaSnapshot`（`:456-459`）與 `QuoteCallEtaCommand`（`:1024-1027`）為獨立不相關合約。
- `infra/migrations/V0019__driver_locations.sql` — **尚不存在**（GAP-P2S2-003 的職責，目前 `backlog`）。
- `ops.phase1_driver_locations` 表 — **尚不存在**（需等 V0019 migration 完成）。

### Gap Summary

| 問題                                    | 影響                                                  | 根本原因                                           |
| --------------------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| `/driver-location` POST endpoint 不存在 | Driver app heartbeat sender (GAP-P2S2-005) 無目標 API | GAP-P2S2-004 尚未實作                              |
| `/driver-eta` GET endpoint 不存在       | 排班系統無法取得 ETA（GAP-P2S3-003 被阻斷）           | GAP-P2S2-004 尚未實作                              |
| Haversine 計算邏輯不存在                | 無法由 GPS 座標推算分鐘級 ETA                         | 純 service-layer 邏輯缺失                          |
| `ops.phase1_driver_locations` 表不存在  | 無法儲存司機位置                                      | GAP-P2S2-003 V0019 migration 未完成（阻斷本 task） |

---

## 3) Parent Acceptance Framing

`GAP-P2S2-004` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 依共享 truth 與 consensus docs 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — 依賴 gate：V0019 migration 必須已完成（GAP-P2S2-003）

- [ ] `infra/migrations/V0019__driver_locations.sql` 已存在於 repo。
- [ ] `ops.phase1_driver_locations` table schema 包含：`driver_id TEXT NOT NULL PRIMARY KEY`、`lat DOUBLE PRECISION NOT NULL`、`lng DOUBLE PRECISION NOT NULL`、`accuracy_m DOUBLE PRECISION`、`recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()`、`updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`。
- [ ] 有 `updated_at DESC` 索引（或等效索引）以支援最新位置查詢。
- [ ] 若依賴 gate 未通過，本 task 不應提前實作或繞過 DB 依賴（例如用 in-memory map 替代）。

### AC-2 — Contract 定義：DriverLocationHeartbeatCommand + DriverEtaResponse

- [ ] `packages/contracts/src/index.ts` 中新增（或確認已存在）`DriverLocationHeartbeatCommand`，欄位包含：`driverId: string`、`lat: number`、`lng: number`、`accuracyM?: number`（可選）。
- [ ] `packages/contracts/src/index.ts` 中新增（或確認已存在）`DriverEtaResponse`（或等效型別），欄位包含：`driverId: string`、`etaMinutes: number`、`calculatedAt: string`（ISO 8601 timestamp）、以及 lat/lng snapshot 或位置 reference。
- [ ] 若 contracts 以 Zod schema 或其他方式定義，形式與既有 contracts 慣例一致（參考 `EtaSnapshot`、`UpdateDriverWorkStateCommand` 等既有模式）。
- [ ] 型別在 contracts package 的 `src/index.ts` 中 export，可被 regulatory-registry module 直接 import。

### AC-3 — POST /api/regulatory-registry/driver-location（心跳 endpoint）

- [ ] `regulatory-registry.controller.ts` 中新增 `@Post("driver-location")` route，接受 body `DriverLocationHeartbeatCommand`（或等效）。
- [ ] Controller 正確傳入 `x-request-id` header 並以 `toApiSuccessEnvelope(...)` 包裝回應（對齊既有 controller 慣例）。
- [ ] `regulatory-registry.service.ts` 中新增對應 service 方法，呼叫 repository 執行 upsert。
- [ ] `regulatory-registry.repository.ts` 中新增 upsert 方法：以 `driver_id` 為 primary key，更新 `lat`、`lng`、`accuracy_m`、`updated_at`（`ON CONFLICT (driver_id) DO UPDATE`）。
- [ ] 成功後回傳 `{ success: true }` 或等效確認訊息，不需要回傳完整 driver record。
- [ ] `driverId`、`lat`、`lng` 為必填，缺少任一時應回傳 HTTP 400（或 NestJS 預設驗證錯誤），不靜默忽略。
- [ ] 此 endpoint **不需要** `x-drts-tenant-id` 或其他租戶 header（driver location 是 cross-tenant 基礎設施資料，與 tenant-scoped billing 不同）。

### AC-4 — GET /api/regulatory-registry/driver-eta（Haversine ETA endpoint）

- [ ] `regulatory-registry.controller.ts` 中新增 `@Get("driver-eta")` route，接受 query params：`driverId: string`、`destLat: number`（destination latitude）、`destLng: number`（destination longitude）。
- [ ] Controller 以 `@Query()` 取得 params，不使用 `@Param()`（這是 query-param endpoint，非路徑 segment）。
- [ ] Service 方法流程：
  1. 從 repository 取得 driver 最新位置（`SELECT lat, lng FROM ops.phase1_driver_locations WHERE driver_id = $1`）。
  2. 若 driver 位置不存在，回傳 HTTP 404（或語意等效的 API error），不回傳 `etaMinutes: 0`。
  3. 以 haversine 公式計算距離（km），除以假設速度（建議 30 km/h 或文件中明確的 baseline 值）得出 `etaMinutes`。
  4. 回傳 `DriverEtaResponse`（含 `driverId`、`etaMinutes`、`calculatedAt`）。
- [ ] 回應以 `toApiSuccessEnvelope(...)` 包裝（對齊既有慣例）。

### AC-5 — Haversine 實作正確性

- [ ] Haversine 公式使用球面距離（不使用歐氏直線距離）。
- [ ] 不引入外部 npm 套件作為 haversine 計算；純 TS/JS 實作即可（< 20 LOC helper function）。
- [ ] 計算結果為正數（`>= 0`），起點與終點相同時回傳 `0`。
- [ ] 速度假設（km/h）應為 service-level 常數，不硬碼在函式內部以利後續 `GAP-P2S3-003` 接手覆蓋。
- [ ] `etaMinutes` 以整數（`Math.round`）或一位小數回傳，不出現 `Infinity` 或 `NaN`。

### AC-6 — DB 整合：Repository 正確使用 PrismaClient 或原生 SQL

- [ ] Repository upsert 方法以 PrismaClient raw query（`$executeRaw`）或 NestJS 標準 DB access pattern 執行（對齊 `regulatory-registry.repository.ts` 的既有存取方式）。
- [ ] `driver-eta` GET 方法以 PrismaClient `$queryRaw` 或等效方式查詢（`SELECT lat, lng FROM ops.phase1_driver_locations WHERE driver_id = $1 LIMIT 1`）。
- [ ] 查詢結果正確 parse 為 `{ lat: number, lng: number }` 型別，不使用 `as any` cast 繞過型別。
- [ ] 若 DB 連線失敗，錯誤會被 NestJS 全域 exception filter 捕獲，不靜默吞噬。

### AC-7 — 不修改 Billing、Owned-Mobility 或其他非 regulatory-registry 模組

- [ ] `apps/api/src/modules/billing-settlement/` 不被修改。
- [ ] `apps/api/src/modules/owned-mobility/` 不被修改。
- [ ] 不修改 `apps/api/src/modules/regulatory-registry/regulatory-registry.module.ts` 以外任何其他 module（module 本身可能需要新增 DB provider import）。
- [ ] 不新增 `GAP-P2S2-003` 以外的任何 DB migration。

### AC-8 — TypeScript 類型安全與編譯通過

- [ ] `pnpm --filter @drts/api typecheck` 通過，無新增 TypeScript 錯誤。
- [ ] `pnpm --filter @drts/contracts typecheck`（或 `build`）通過，新增型別正確 export。
- [ ] 不使用 `as any` cast 繞過 DB query 型別或 haversine 計算型別。
- [ ] 所有新增 function 有明確的 return type annotation。

### AC-9 — 不衝突 GAP-P2S3-003（Real-time ETA 延伸）

- [ ] `GET /driver-eta` endpoint 的 URL、params、回應格式需為 `GAP-P2S3-003`（real-time ETA from driver_locations）預留足夠的擴展空間。
- [ ] 速度假設（`AVERAGE_SPEED_KMH`）以 service constant 而非 hardcoded literal 形式存在，供 GAP-P2S3-003 日後替換為動態速度估算。
- [ ] 此 task 不引入 WebSocket、SSE 或任何即時推播機制（GAP-P2S2-007 / GAP-P2S3-004 的職責）。

---

## 4) Dependency Map

### Formal Dependencies

> 以 machine truth 為準，`GAP-P2S2-004.depends_on` = `GAP-P2S2-003`（V0019 migration）。

| Dep    | Source         | Status    | Notes                                                                                                             |
| ------ | -------------- | --------- | ----------------------------------------------------------------------------------------------------------------- |
| D-UP-1 | `GAP-P2S2-003` | `backlog` | **必要前置**：`ops.phase1_driver_locations` table 必須存在；若 V0019 未執行，repository upsert 在 runtime 將 fail |

### Practical Context Dependencies

| Dep   | Type                                                                         | Why It Matters                                                                      |
| ----- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| D-P-1 | Planning consensus (`gap-phase2-planning-20260417/starter-draft.md:120-127`) | 定義 endpoint URL、參數、sizing（~120 LOC, M）                                      |
| D-P-2 | `gap-phase2-planning-20260417/consensus-packet.md` GAP-P2S2-004 row          | 確認 Codex ownership、M sizing、V0019 dependency                                    |
| D-P-3 | `packages/contracts/src/index.ts` (existing patterns)                        | `EtaSnapshot`（`:456-459`）、`UpdateDriverWorkStateCommand` 提供 contracts 慣例參考 |
| D-P-4 | `regulatory-registry.controller.ts` (existing patterns)                      | `@Controller`、`toApiSuccessEnvelope`、`@Headers("x-request-id")` 使用慣例          |

### Forward (Downstream) Dependencies

| Dep     | Status                     | Why It Matters                                                                                 |
| ------- | -------------------------- | ---------------------------------------------------------------------------------------------- |
| D-FWD-1 | `GAP-P2S2-005` (`backlog`) | Driver app GPS heartbeat sender 需要本 task 的 `POST /driver-location` endpoint 才能 POST 位置 |
| D-FWD-2 | `GAP-P2S3-003` (`backlog`) | Real-time ETA 延伸需要本 task 的 haversine baseline 與 driver_locations table 整合             |
| D-FWD-3 | `GAP-P2S3-004` (`backlog`) | SSE dispatch board 最終消費 GAP-P2S3-003 的 ETA，間接依賴本 task                               |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md` (`:100-143`, A-3/A-4)
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md` (GAP-P2S2-003/004 rows)
- Repo anchors:
  - `apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts` (no heartbeat/ETA routes)
  - `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts` (no heartbeat/haversine)
  - `apps/api/src/modules/regulatory-registry/regulatory-registry.repository.ts` (no location upsert)
  - `packages/contracts/src/index.ts` (no DriverLocationHeartbeatCommand/DriverEtaResponse)
  - `infra/migrations/V0019__driver_locations.sql` (does not exist yet)

---

## 5) Evidence Inventory

| ID   | Evidence                                              | Expected Anchor                                                   |
| ---- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                        | `ai-status.json`, `current-work.md`                               |
| E-2  | Endpoint spec (POST driver-location + GET driver-eta) | `gap-phase2-planning-20260417/starter-draft.md:120-127`           |
| E-3  | M sizing, Codex ownership, V0019 dependency           | `consensus-packet.md` GAP-P2S2-004 row                            |
| E-4  | V0019 schema design (Gemini R3)                       | `starter-draft.md:100-116`, `consensus-packet.md`                 |
| E-5  | No heartbeat endpoint in controller                   | `regulatory-registry.controller.ts` — no `/driver-location` route |
| E-6  | No haversine logic in service                         | `regulatory-registry.service.ts` — no haversine function          |
| E-7  | No DriverLocationHeartbeatCommand in contracts        | `packages/contracts/src/index.ts` — search confirmed absent       |
| E-8  | V0019 migration does not exist                        | `infra/migrations/` — V0019 file absent                           |
| E-9  | GAP-P2S2-005 is downstream (PREP + GAP-P2S2-004)      | `consensus-packet.md` GAP-P2S2-005 row                            |
| E-10 | GAP-P2S3-003 is downstream (V0019 + GAP-P2S2-004)     | `consensus-packet.md` GAP-P2S3-003 row                            |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S2-004` 是 `backlog`（未實作），owner=`Codex`，depends_on=`GAP-P2S2-003`；sidecar 是 `review`，owner=`Claude`，reviewer=`Codex`。
2. AC-1 是否正確要求 V0019 gate：`ops.phase1_driver_locations` table 必須存在，不能繞過此 DB 前置依賴。
3. AC-3 是否合理描述 `POST /driver-location` endpoint：body、upsert 行為、cross-tenant 不需要租戶 header 的 rationale。
4. AC-4 是否合理描述 `GET /driver-eta` endpoint：query params（不是 path params）、driver not found → 404 行為、haversine + speed constant 模式。
5. AC-5 是否明確要求 haversine（不使用歐氏距離），無外部 npm 依賴，速度假設為 service constant。
6. AC-9 是否正確區分本 task（haversine baseline ETA）與 `GAP-P2S3-003`（real-time ETA 延伸），確保 scope 不重疊，且不引入 SSE/WebSocket（GAP-P2S2-007 的職責）。
7. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S2-004 acceptance packet ready: machine truth shows parent backlog with V0019 dependency, sidecar scope correctly locked to regulatory-registry heartbeat endpoint (POST /driver-location upsert) and haversine ETA endpoint (GET /driver-eta), AC checklist correctly gates on V0019 migration, requires haversine-based ETA with speed constant, prohibits non-regulatory-registry module changes and SSE/WebSocket scope, stays within support-only sidecar boundaries without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / scope drift / incorrect endpoint spec / haversine AC too permissive or too strict / wrong DB access pattern guidance / missing V0019 gate / overclaimed cross-module coverage]`

---

## 7) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff GAP-P2S2-004-SIDECAR-ACCEPTANCE Codex "GAP-P2S2-004 acceptance packet ready at support/sidecars/GAP-P2S2-004/GAP-P2S2-004-SIDECAR-ACCEPTANCE.md. It preserves machine truth (parent backlog, V0019 dependency gate), specifies POST /regulatory-registry/driver-location (upsert) and GET /regulatory-registry/driver-eta (haversine ETA with speed constant), gates AC-1 on V0019 migration, requires pure-TS haversine without external npm deps, prohibits non-regulatory-registry and SSE/WebSocket scope, and correctly separates baseline ETA from GAP-P2S3-003 real-time ETA extension."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S2-004-SIDECAR-ACCEPTANCE "GAP-P2S2-004 acceptance packet ready: machine truth shows parent backlog with V0019 dependency, sidecar scope correctly locked to regulatory-registry heartbeat endpoint and haversine ETA, AC checklist gates on V0019 migration, requires haversine distance with speed constant, prohibits non-regulatory-registry module changes and SSE/WebSocket, correctly separates scope from GAP-P2S3-003 real-time ETA, and stays within support-only sidecar boundaries without mutating canonical truth."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S2-004-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / scope drift / incorrect endpoint spec / haversine AC too permissive or too strict / wrong DB access pattern guidance / missing V0019 gate / overclaimed cross-module coverage]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Claude`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done GAP-P2S2-004-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S2-004 at support/sidecars/GAP-P2S2-004/GAP-P2S2-004-SIDECAR-ACCEPTANCE.md. The packet preserves V0019 gate, regulatory-registry heartbeat/ETA endpoint framing, haversine baseline with speed constant, downstream dependency map (GAP-P2S2-005, GAP-P2S3-003), and reviewer handoff path without changing canonical truth."
```

---

## 10) Change Log

- 2026-04-17T16:45Z — 初版建立：依共享 machine truth、consensus docs (`gap-phase2-planning-20260417/starter-draft.md:120-127`、`consensus-packet.md` GAP-P2S2-004 row) 與 repo 掃描（`regulatory-registry.controller.ts`、`.service.ts`、`.repository.ts` 均無 heartbeat/ETA 實作；`packages/contracts/src/index.ts` 無 DriverLocationHeartbeatCommand；`infra/migrations/V0019__driver_locations.sql` 不存在），整理 `GAP-P2S2-004` 的 acceptance checklist、V0019 dependency gate、haversine ETA baseline、以及 reviewer handoff 指引。
- 2026-04-17T16:52Z — reviewer-facing 對齊修正：Section 2 的 sidecar baseline 不再停留在 `todo@2026-04-17T16:38:53Z`，改為 shared L0 當前 `review@2026-04-17T16:41:51Z` + pending `Claude -> Codex` handoff，讓 header、baseline 與 machine truth 一致。
