# GAP-P2S2-006 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S2-006` — forwarder: ForwarderAdapterInterface (plug-in pattern) + Grab Taiwan webhook ingest stub  
**Current Sidecar Owner:** `Claude`  
**Assigned Reviewer:** `Codex`  
**Parent Owner:** `Codex` (per machine truth, `status=backlog`, `depends_on: -`)  
**Last Revised:** `2026-04-17T17:10Z (UTC)`  
**Status:** `review` (Claude has prepared the packet; pending reviewer response belongs to `Codex`)

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S2-006` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- **In scope:** support-only acceptance framing, dependency mapping, repo-scan evidence anchors, forwarder module baseline, ForwarderAdapterInterface plug-in pattern acceptance criteria, GrabTaiwanAdapter stub acceptance criteria, webhook ingest endpoint acceptance criteria, reviewer checklist.
- **Out of scope:** 修改 `forwarder.controller.ts`、`.service.ts`、`.module.ts` 或 `.repository.ts` 主線 runtime，修改 `packages/contracts/src/index.ts`（L1 真相），新增 DB migration，或以任何方式修改任何非 forwarder 模組。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S2-006` 在 machine truth 中目前是 `backlog`，Owner=`Codex`，無正式上游依賴（`depends_on: -`）。
- 本 sidecar `GAP-P2S2-006-SIDECAR-ACCEPTANCE` 在 machine truth 中目前是 `review`，Owner=`Claude`，Reviewer=`Codex`；orchestrator 在 `2026-04-17T17:06:44Z` 建立本 sidecar 並指派給 Claude，並於 `2026-04-17T17:10:06Z` 正式 handoff 給 `Codex` reviewer。
- Planning consensus 對此 task 有完整溯源：
  - `gap-phase2-planning-20260417/starter-draft.md:146-160`（B-1 段）明確規格：`ForwarderAdapterInterface { accept, reject, complete, heartbeat, fetchEarnings }` + `GrabTaiwanAdapter`（stub，只做 log + mock response）+ 保留既有 `platformCode`/mirror order 流程，預估 ~150 LOC，M sizing（1-2 天）。
  - `gap-phase2-planning-20260417/consensus-packet.md` 收錄，無上游依賴，Codex 為 owner。
  - 開放問題 3（consensus-packet.md:114）：真正整合需要外部 Grab Taiwan API 憑證，stub 可先完成。

### Repo Baseline Anchors

- [`apps/api/src/modules/forwarder/forwarder.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/forwarder/forwarder.service.ts) — 已有 `ForwarderService`，含 `ingestExternalOrder`、`broadcastOrder`、`relayDriverAccept`、`syncNativeStatus`、`listAdapterHealth` 與完整 `platformCode`/mirror-order state machine；**不存在** `ForwarderAdapterInterface` 介面或任何 concrete adapter 類別。
- [`apps/api/src/modules/forwarder/forwarder.controller.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/forwarder/forwarder.controller.ts) — 已有 `POST forwarder/orders/inbound`（`IngestExternalOrderCommand`）、`GET forwarder/orders`、`POST forwarder/orders/:orderId/broadcast`、`POST forwarder/orders/:orderId/accept`、`POST forwarder/orders/:orderId/sync-status`、`GET forwarder/adapters/health`；**不存在** Grab Taiwan 專屬的 webhook ingest 路由（如 `POST forwarder/webhooks/grab-taiwan`）。
- [`apps/api/src/modules/forwarder/forwarder.module.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/forwarder/forwarder.module.ts) — 目前的 module 定義，**不存在** 任何 adapter 的 provider 或 injection token 宣告。
- [`apps/api/src/modules/forwarder/forwarder.repository.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/forwarder/forwarder.repository.ts) — 現有 repository，不需此 task 修改。
- [`packages/contracts/src/index.ts`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts) — 已存在 `ForwardedOrderRecord`、`AdapterHealthRecord`、`IngestExternalOrderCommand`、`BroadcastForwardedOrderCommand`、`RelayDriverAcceptCommand`、`SyncForwardedOrderStatusCommand`；**不存在** `ForwarderAdapterInterface`（或等效 interface/type）、`GrabTaiwanWebhookPayload`（或等效型別）。

### Gap Summary

| 問題                                            | 影響                                                                                                         | 根本原因              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------- |
| `ForwarderAdapterInterface` 不存在              | 無明確 plug-in 契約，下游 GAP-P2S3-007（platform code registry + service bucket enum）無法依賴穩定 interface | GAP-P2S2-006 尚未實作 |
| `GrabTaiwanAdapter` 不存在                      | 無 Grab Taiwan webhook 注入點（stub 即可，真正整合需外部憑證）                                               | GAP-P2S2-006 尚未實作 |
| Grab Taiwan webhook 專屬 ingest endpoint 不存在 | 外部 Grab Taiwan 平台無法推送 webhook 事件至本平台                                                           | GAP-P2S2-006 尚未實作 |

---

## 3) Parent Acceptance Framing

`GAP-P2S2-006` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 依共享 truth 與 consensus docs 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — ForwarderAdapterInterface 定義

- [ ] 在 `apps/api/src/modules/forwarder/` 中（例如 `forwarder-adapter.interface.ts`）定義 `ForwarderAdapterInterface`，包含以下方法簽章（或語意等效）：
  - `accept(orderId: string): Promise<void>` — 通知外部平台本地接單
  - `reject(orderId: string, reason?: string): Promise<void>` — 通知外部平台拒絕
  - `complete(orderId: string): Promise<void>` — 通知外部平台完成
  - `heartbeat(): Promise<AdapterHealthStatus>` — 回傳目前 adapter 健康狀態（使用 `AdapterHealthStatus` 從 contracts import）
  - `fetchEarnings(driverId: string, fromDate: string, toDate: string): Promise<unknown>` — 取得司機外平台收益（stub 可回傳空物件或 `null`）
- [ ] Interface 使用 TypeScript `interface` 定義（不使用 `abstract class`），可被 `GrabTaiwanAdapter` 實作。
- [ ] Interface 定義在 forwarder 模組內，**不**放在 `packages/contracts/src/index.ts`（因為這是 runtime adapter 契約，非 API wire contract）。
- [ ] `platformCode` 屬性（`readonly platformCode: string`）應包含在 interface 中，讓 `ForwarderService` 能辨識 adapter 所屬平台。

### AC-2 — GrabTaiwanAdapter stub 實作

- [ ] 在 `apps/api/src/modules/forwarder/` 中（例如 `grab-taiwan.adapter.ts`）實作 `GrabTaiwanAdapter implements ForwarderAdapterInterface`。
- [ ] `readonly platformCode = "grab_taiwan"`（或 `"GRAB_TW"`，以 starter-draft 命名慣例為準）。
- [ ] 所有 adapter 方法為 **stub 實作**：僅做 `logger.log(...)` 或 `console.log(...)` 輸出 + 回傳 mock/empty response，**不**呼叫真實外部 Grab Taiwan API。
- [ ] `heartbeat()` stub 回傳 `"healthy"` 或等效的 `AdapterHealthStatus`。
- [ ] `fetchEarnings()` stub 回傳 `[]`、`null` 或 `{ items: [] }` 等空回應，不做任何 HTTP 呼叫。
- [ ] Stub 不引入任何新的 npm HTTP 客戶端依賴（不加 `axios`、`got`、`node-fetch` 等）；若日後整合需要，交由商務憑證確認後的 follow-up ticket 處理。
- [ ] `GrabTaiwanAdapter` 以 NestJS `@Injectable()` 標記，可被 module provider 注入。

### AC-3 — Grab Taiwan webhook ingest endpoint（stub）

- [ ] `forwarder.controller.ts` 中新增 `@Post("forwarder/webhooks/grab-taiwan")` route（或 `POST forwarder/webhooks/grab-taiwan`，路徑名稱以 consensus spec 為準）。
- [ ] Endpoint 接受 `body: Record<string, unknown>`（或 `GrabTaiwanWebhookPayload` 若 contracts 有定義，否則以 `unknown` 接收）。
- [ ] Stub endpoint 記錄收到的 webhook payload（`logger.log` 或等效），然後呼叫 `forwarderService.ingestExternalOrder(...)` 做 platform-agnostic order 注入，或僅回傳 `{ received: true }`。
- [ ] 若 `IngestExternalOrderCommand` 已足夠（`platformCode + externalOrderId + payload`），直接由 webhook body 組裝後呼叫既有 `ingestExternalOrder`，不新增重複的 service layer。
- [ ] 回應以 `toApiSuccessEnvelope(...)` 包裝（對齊既有 controller 慣例）。
- [ ] 此 endpoint 目的是讓外部 Grab Taiwan 平台可以 push 事件進來，因此**不需要** `x-drts-tenant-id` header（外部 webhook 是 cross-tenant 基礎設施入口）。
- [ ] 真正的 Grab Taiwan webhook signature 驗證（HMAC 或等效）不在此 task 範圍（屬外部憑證確認後的 follow-up）；stub 可接受任何 body。

### AC-4 — ForwarderService 與 ForwarderAdapterInterface 整合（輕量）

- [ ] `ForwarderService` 不需完整重寫；只需在適當位置保留 adapter 呼叫點（hook），例如：
  - 在 `ingestExternalOrder` 中，若有對應 platformCode 的 adapter，可選擇性呼叫（不強制，stub 實作時無外部副作用）。
- [ ] **保留既有** `ForwarderService` state machine（`broadcastOrder`、`relayDriverAccept`、`syncNativeStatus`、`updateAdapterHealth`）不重寫，只加 adapter wiring，不刪除或替換現有邏輯。
- [ ] `adapterHealth` 更新（`updateAdapterHealth`）維持現有行為，不依賴 adapter 的 `heartbeat()` 強制呼叫（optional）。
- [ ] 若 `ForwarderService` 注入 `GrabTaiwanAdapter`，使用 NestJS `@Optional()` 或 injection token 模式，確保在無 adapter 時也能正常啟動（與既有 `@Optional() private readonly forwarderRepository?` 模式對齊）。

### AC-5 — Module 宣告更新

- [ ] `forwarder.module.ts` 中新增 `GrabTaiwanAdapter` 為 provider（`providers: [ForwarderService, GrabTaiwanAdapter, ...]`），確保 NestJS DI 可正確注入。
- [ ] 若使用 injection token 而非直接 class injection，token 定義清楚且不與既有 token 衝突。
- [ ] Module 不匯出 `ForwarderAdapterInterface` 或 `GrabTaiwanAdapter` 到其他模組（forwarder adapter 是 forwarder-internal concern）。

### AC-6 — 不修改 Billing、RegulatoryRegistry 或其他非 forwarder 模組

- [ ] `apps/api/src/modules/billing-settlement/` 不被修改。
- [ ] `apps/api/src/modules/regulatory-registry/` 不被修改。
- [ ] `apps/api/src/modules/audit-notification/` 不被修改。
- [ ] `packages/contracts/src/index.ts` 若需新增 `GrabTaiwanWebhookPayload` 或等效型別，為 **additive-only**（不修改既有型別）；若 body 用 `Record<string, unknown>` 接收，則完全不修改 contracts。
- [ ] 不新增任何 DB migration（GAP-P2S2-006 為純 TypeScript 模組邊界定義，無 DB schema 變更）。

### AC-7 — TypeScript 類型安全與編譯通過

- [ ] `pnpm --filter @drts/api typecheck` 通過，無新增 TypeScript 錯誤。
- [ ] `pnpm --filter @drts/contracts typecheck`（或 `build`）通過（若有修改 contracts）。
- [ ] `ForwarderAdapterInterface` 的所有方法回傳型別明確（使用 `Promise<void>` 或具體型別，不使用 `Promise<any>`）。
- [ ] `GrabTaiwanAdapter` 的 stub 實作中 `fetchEarnings` 回傳型別可為 `Promise<unknown>` 或 `Promise<never[]>`，與 interface 宣告一致。
- [ ] 不使用 `as any` cast 繞過 adapter 型別。

### AC-8 — 不引入外部 HTTP 依賴

- [ ] `package.json`（`apps/api`）不新增任何 HTTP 客戶端 npm 套件。
- [ ] `pnpm-lock.yaml` 不因此 task 新增非預期依賴。
- [ ] stub 實作中所有「外部 API 呼叫」均以 `logger.log` + 直接回傳 mock data 取代。

### AC-9 — 不衝突 GAP-P2S3-007（platform code registry + service bucket enum 延伸）

- [ ] `ForwarderAdapterInterface` 的 `platformCode` 欄位或方法命名應預留 GAP-P2S3-007 注入 platform code registry 的空間（例如不 hardcode `"grab_taiwan"` 字串散落在 service 邏輯中；`GrabTaiwanAdapter.platformCode` 為唯一宣告點）。
- [ ] 此 task 不引入 SSE、WebSocket 或任何即時推播機制（GAP-P2S2-007 / GAP-P2S3-004 的職責）。
- [ ] 此 task 不引入 `@FeatureGated` decorator（GAP-P2S3-005 的職責）。

---

## 4) Dependency Map

### Formal Dependencies

> 以 machine truth 為準，`GAP-P2S2-006.depends_on` = `-`（無正式上游依賴）。

| Dep      | Source | Status | Notes                                  |
| -------- | ------ | ------ | -------------------------------------- |
| _(none)_ | -      | -      | 無正式上游依賴；此 task 可完全平行執行 |

### Practical Context Dependencies

| Dep   | Type                                                                         | Why It Matters                                                                                                                            |
| ----- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| D-P-1 | Planning consensus (`gap-phase2-planning-20260417/starter-draft.md:146-160`) | 定義 interface 方法簽章（accept/reject/complete/heartbeat/fetchEarnings）、stub 行為、sizing（~150 LOC, M）、保留既有 state machine 要求  |
| D-P-2 | `gap-phase2-planning-20260417/consensus-packet.md` GAP-P2S2-006 row          | 確認 Codex ownership、M sizing、無上游依賴、Grab Taiwan stub 可先完成                                                                     |
| D-P-3 | `packages/contracts/src/index.ts` existing forwarder types                   | `ForwardedOrderRecord`、`AdapterHealthRecord`、`AdapterHealthStatus`（`:1496-1537`）提供 adapter interface 型別參考                       |
| D-P-4 | `forwarder.service.ts` existing state machine                                | 保留 `platformCode`/mirror-order 流程，adapter 只做輕量 wiring，不重寫 state machine                                                      |
| D-P-5 | `forwarder.controller.ts` existing patterns                                  | `toApiSuccessEnvelope`、`@Headers("x-request-id")` 使用慣例；`POST forwarder/orders/inbound` 為現有 ingest entry，新 webhook 路由與之並存 |
| D-P-6 | Open question #3 (consensus-packet.md:114)                                   | Grab Taiwan API 憑證商務進度未確認；stub 實作不依賴外部憑證，真正整合另立 ticket                                                          |

### Forward (Downstream) Dependencies

| Dep     | Status                     | Why It Matters                                                                                                |
| ------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| D-FWD-1 | `GAP-P2S3-007` (`backlog`) | Platform code registry + service bucket enum 延伸依賴本 task 的 `ForwarderAdapterInterface` 作為 routing 基礎 |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md` (`:146-160`, B-1)
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md` (GAP-P2S2-006 row, open question #3)
- Repo anchors:
  - `apps/api/src/modules/forwarder/forwarder.service.ts` (existing state machine, no adapter interface)
  - `apps/api/src/modules/forwarder/forwarder.controller.ts` (existing routes, no grab-taiwan webhook route)
  - `apps/api/src/modules/forwarder/forwarder.module.ts` (no adapter provider)
  - `packages/contracts/src/index.ts` (existing forwarder types, no ForwarderAdapterInterface)

---

## 5) Evidence Inventory

| ID   | Evidence                                                                       | Expected Anchor                                                                                          |
| ---- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                                                 | `ai-status.json`, `current-work.md`                                                                      |
| E-2  | Adapter interface spec (accept/reject/complete/heartbeat/fetchEarnings + stub) | `gap-phase2-planning-20260417/starter-draft.md:146-160` (B-1)                                            |
| E-3  | M sizing, Codex ownership, no upstream dependency                              | `consensus-packet.md` GAP-P2S2-006 row                                                                   |
| E-4  | Open question on Grab Taiwan credentials                                       | `consensus-packet.md:114` (open question #3)                                                             |
| E-5  | No ForwarderAdapterInterface in forwarder module                               | `forwarder.service.ts` — no interface or abstract adapter class                                          |
| E-6  | No GrabTaiwanAdapter in forwarder module                                       | repo scan — `apps/api/src/modules/forwarder/` has only controller/service/module/repository              |
| E-7  | No Grab Taiwan webhook route in controller                                     | `forwarder.controller.ts` — only generic `POST forwarder/orders/inbound`                                 |
| E-8  | No ForwarderAdapterInterface in contracts                                      | `packages/contracts/src/index.ts` — ForwardedOrderRecord/AdapterHealthRecord exist, no adapter interface |
| E-9  | GAP-P2S3-007 is downstream (depends on ForwarderAdapterInterface)              | `consensus-packet.md` GAP-P2S3-007 row + dependency graph                                                |
| E-10 | Existing state machine must be preserved                                       | `forwarder.service.ts:38-456` — platformCode/mirror-order/adapterHealth logic                            |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S2-006` 是 `backlog`（未實作），owner=`Codex`，無上游依賴；sidecar 是 `todo` → `review`（本 packet 完成後），owner=`Claude`，reviewer=`Codex`。
2. AC-1 是否正確定義 `ForwarderAdapterInterface` 方法簽章（5 個方法：accept/reject/complete/heartbeat/fetchEarnings）及 `platformCode` 屬性，符合 `starter-draft.md:154` 的規格。
3. AC-2 是否合理要求 `GrabTaiwanAdapter` 為純 stub（log + mock response，不呼叫外部 API，不引入 HTTP 客戶端 npm 依賴）。
4. AC-3 是否合理描述 Grab Taiwan webhook ingest endpoint：stub 接受任意 body、不驗證 HMAC signature（留待外部憑證確認後的 follow-up）、與既有 `POST forwarder/orders/inbound` 並存。
5. AC-4 是否正確要求保留既有 `ForwarderService` state machine，adapter wiring 為輕量 hook，不重寫核心邏輯。
6. AC-9 是否正確區分本 task（interface 定義 + stub）與 GAP-P2S3-007（platform code registry + service bucket routing），確保 scope 不重疊，且不引入 SSE/WebSocket 或 @FeatureGated。
7. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S2-006 acceptance packet ready: machine truth shows parent backlog with no upstream dependency, sidecar scope correctly locked to ForwarderAdapterInterface plug-in definition (accept/reject/complete/heartbeat/fetchEarnings + platformCode) and GrabTaiwanAdapter stub (log + mock, no external HTTP calls, no npm HTTP client), AC checklist correctly requires preserving existing ForwarderService state machine, requires stub Grab Taiwan webhook ingest endpoint without HMAC validation gate, prohibits non-forwarder module changes and SSE/WebSocket/FeatureGated scope, stays within support-only sidecar boundaries without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / scope drift / incorrect interface method spec / stub requirements too strict or too permissive / wrong module boundary guidance / overclaimed cross-module coverage / state machine preservation requirement missing or incorrect]`

---

## 7) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff GAP-P2S2-006-SIDECAR-ACCEPTANCE Codex "GAP-P2S2-006 acceptance packet ready at support/sidecars/GAP-P2S2-006/GAP-P2S2-006-SIDECAR-ACCEPTANCE.md. It preserves machine truth (parent backlog, no upstream dependency), specifies ForwarderAdapterInterface (accept/reject/complete/heartbeat/fetchEarnings + platformCode property), requires GrabTaiwanAdapter as pure stub (log + mock response, no HTTP clients), specifies stub webhook ingest endpoint (POST forwarder/webhooks/grab-taiwan, no HMAC validation gate), requires preserving existing ForwarderService state machine without rewrite, prohibits non-forwarder module changes and SSE/WebSocket/FeatureGated scope, and correctly separates ForwarderAdapterInterface baseline from GAP-P2S3-007 platform code registry extension."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S2-006-SIDECAR-ACCEPTANCE "GAP-P2S2-006 acceptance packet ready: machine truth shows parent backlog with no upstream dependency, sidecar scope correctly locked to ForwarderAdapterInterface plug-in pattern and GrabTaiwanAdapter stub, AC checklist preserves existing state machine, stub webhook endpoint without HMAC gate, prohibits non-forwarder scope and SSE/WebSocket/FeatureGated, correctly separates from GAP-P2S3-007 platform code registry, stays within support-only sidecar boundaries without mutating canonical truth."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S2-006-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / scope drift / incorrect interface method spec / stub requirements too strict or too permissive / wrong module boundary guidance / overclaimed cross-module coverage / state machine preservation requirement missing or incorrect]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Claude`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done GAP-P2S2-006-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S2-006 at support/sidecars/GAP-P2S2-006/GAP-P2S2-006-SIDECAR-ACCEPTANCE.md. The packet preserves no-upstream-dependency status, ForwarderAdapterInterface plug-in pattern framing (accept/reject/complete/heartbeat/fetchEarnings), GrabTaiwanAdapter stub requirements, Grab Taiwan webhook ingest endpoint framing, state machine preservation requirement, downstream dependency map (GAP-P2S3-007), and reviewer handoff path without changing canonical truth."
```

---

## 10) Change Log

- 2026-04-17T17:10Z — 初版建立：依共享 machine truth、consensus docs (`gap-phase2-planning-20260417/starter-draft.md:146-160` B-1、`consensus-packet.md` GAP-P2S2-006 row + open question #3) 與 repo 掃描（`forwarder.service.ts` 無 adapter interface；`forwarder.controller.ts` 無 grab-taiwan webhook route；`apps/api/src/modules/forwarder/` 無 adapter 類別檔案；`packages/contracts/src/index.ts` 無 ForwarderAdapterInterface），整理 `GAP-P2S2-006` 的 acceptance checklist、ForwarderAdapterInterface plug-in pattern、GrabTaiwanAdapter stub 要求、Grab Taiwan webhook ingest endpoint、以及 reviewer handoff 指引。
