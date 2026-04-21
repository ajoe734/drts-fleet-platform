# GAP-P2S3-008 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S3-008` — driver-app: settings.tsx -> driver-profile API (blocked on GAP-P2S1-004-API)  
**Current Sidecar Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Qwen` / `(unassigned)`  
**Last Revised:** `2026-04-17T12:06Z (UTC)`  
**Status:** `review` (latest shared-L0 snapshot keeps owner `Codex2`, reviewer `Codex`, updates the task row to `status=review` with `last_update=2026-04-17T12:04:35Z`, and carries a pending `Codex2 -> Codex` handoff whose message still treats `2026-04-17T12:01:13Z` as the latest completed reviewer-routing baseline)

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S3-008` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- In scope: support-only acceptance framing, dependency mapping, repo-scan evidence anchors, current `settings.tsx` baseline, reviewer checklist.
- Out of scope: `apps/driver-app/app/settings.tsx` runtime 修改、`driver-profile` API/contracts 主線實作、L1/L2 真相修改、或改寫 machine truth。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S3-008` 在 machine truth 中為 `blocked`，Owner=`Qwen`，formal blocker 只有 `GAP-P2S1-004-API`。
- 本 sidecar `GAP-P2S3-008-SIDECAR-ACCEPTANCE` 在目前 shared L0 中最新 task row 為 `status=review`、Owner=`Codex2`、Reviewer=`Codex`、`last_update=2026-04-17T12:04:35Z`；handoff queue 也同步顯示一筆 pending `Codex2 -> Codex` review handoff。這表示本文件除了保留 `2026-04-17T12:01:13Z` 的最新 completed handoff baseline 外，也必須明確落在目前 `review` snapshot，而不是停在 `2026-04-17T12:02:28Z` 的 reopen 狀態。
- `ai-status.json` / `ai-activity-log.jsonl` 共同顯示這一輪最新穩定 reviewer-facing 鏈條是：`2026-04-17T12:01:13Z` owner `Codex2` handoff 給 reviewer `Codex`，`2026-04-17T12:02:28Z` `Codex` reopen 要求修正文案，之後 `2026-04-17T12:04:35Z` 再由 `Codex2 -> Codex` 送出新的 review handoff；因此本 packet 現在以「最新 completed handoff + 最新 reopen finding + 最新 active review snapshot」作為 machine-truth baseline，而不再把 `2026-04-17T11:57:53Z` 的舊 review 路由或 `Qwen -> Codex` 誤寫成目前 pending handoff。
- `ai-activity-log.jsonl` 顯示這份 packet 的近期事件鏈為：
  - `2026-04-17T11:46:48Z`：`Codex2` 已將 packet handoff 給當時 reviewer `Qwen`。
  - `2026-04-17T11:47:07Z` / `11:47:18Z` / `11:47:44Z`：review 因 Qwen terminal token failure 多次自動改派回 `Codex`。
  - `2026-04-17T11:47:12Z` / `11:47:26Z`：期間一度有 availability-first reviewer rebalance 回 `Qwen`，但後續都被視為 stale 或再次改派回 `Codex`。
  - `2026-04-17T11:49:28Z`：`Codex` 正式退回 packet，指出 header 與 Sections 2/7/8 仍停留在 pre-review 快照。
  - `2026-04-17T11:51:22Z`：`Codex2 -> Codex` 的修訂後 handoff 建立，machine truth 一度進入 `review` snapshot。
  - `2026-04-17T11:53:22Z`：`Codex` 再次 reopen，指出 packet 仍只停在 `11:49:28Z`，沒有區分較新的 `11:51:22Z review` snapshot。
  - `2026-04-17T11:53:25Z` / `11:53:30Z` / `11:53:36Z` / `11:53:54Z` / `11:54:00Z`：owner 在 `Codex2`、`Codex`、`Qwen` 間經歷一輪 orchestrator rebalance / auto-reassign，之後一度收斂到 `Owner=Codex2`、`Reviewer=Codex`、`11:53:55Z in_progress`。
  - `2026-04-17T11:55:46Z`：`Codex2 -> Codex` 的後續 handoff 已送出，作為這一輪 reviewer-ready packet 的基礎。
  - `2026-04-17T11:56:40Z` / `11:57:10Z` / `11:57:21Z` / `11:57:47Z` / `11:57:59Z`：reviewer 多次因 `Qwen` terminal token failure 被自動改派回 `Codex`。
  - `2026-04-17T11:56:51Z` / `11:57:15Z` / `11:57:29Z` / `11:57:53Z`：期間有 availability-first reviewer rebalance 回 `Qwen`，但每次都被標記為 stale 或再次 auto-reassign 回 `Codex`。
  - `2026-04-17T11:57:53Z`：`current-work.md` / handoff queue 對齊為較新的 review snapshot：Owner=`Codex2`、Reviewer=`Codex`、status=`review`。
  - `2026-04-17T11:58:02Z`：review-ready wake 已正式派給 `Codex`。
  - `2026-04-17T11:59:36Z`：`Codex` 最新 reopen 明確要求 header、Section 2 與 reviewer wording 全數落到 `11:57:53Z review` 快照。
  - `2026-04-17T12:01:13Z`：`Codex2 -> Codex` 的最新完成 handoff 建立，訊息已改成以 `11:49:28Z reopen`、`11:53:55Z owner snapshot`、`11:57:53Z review routing` 為歷史背景，並把 reviewer routing 明確落在 `Codex2 -> Codex`。
  - `2026-04-17T12:02:28Z`：`Codex` 再次 reopen，指出 Section 2 仍誤把 pending review handoff 寫成 `Qwen -> Codex`，而 Section 7 仍保留一條凍結在 `11:51:22Z` / `11:53:55Z` 的重複 handoff 指令；因此後續修訂先以 `12:01:13Z` handoff + `12:02:28Z` reopen 作為 L0 對齊點。
  - `2026-04-17T12:04:35Z`：`Codex2 -> Codex` 再次送出更新後的 review handoff；`current-work.md` / `ai-status.json` 對齊到 `status=review`、Owner=`Codex2`、Reviewer=`Codex`、`last_update=2026-04-17T12:04:35Z`，handoff queue 也出現新的 pending reviewer entry。
  - `2026-04-17T12:04:36Z`：Orchestrator 對 `Codex` 重新派送 `review_ready_dispatch`；這是目前 reviewer wake 的最新 shared-L0 狀態。
- `docs-site/index.html` 只是 supervisor dashboard shell，對本 task 沒有額外產品語意。

### Repo Baseline Anchors

- [`apps/driver-app/app/settings.tsx`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/settings.tsx:18) 目前仍在 `useEffect` 中呼叫 `client.getDriverSettings("driver-demo-001")`。
- [`apps/driver-app/app/settings.tsx`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/settings.tsx:42) 儲存流程仍呼叫 `client.updateDriverSettings("driver-demo-001", ...)`。
- [`packages/api-client/src/index.ts`](/home/edna/workspace/drts-fleet-platform/packages/api-client/src/index.ts:1150) 只暴露 `getDriverSettings(driverId)` 與 `updateDriverSettings(driverId, command)`，尚無任何 `driver-profile` client method。
- [`apps/api/src/modules/driver-settings/driver-settings.controller.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/driver-settings/driver-settings.controller.ts:8) 與 [`driver-settings.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/driver-settings/driver-settings.service.ts:28) 目前提供的是 language / notifications / autoAccept / radius 這類偏好設定 surface。
- [`apps/api/src/modules/driver-profile/`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules) 目前不存在；repo 掃描結果為 `ABSENT`。
- [`apps/api/src/app.module.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/app.module.ts:17) 匯入 `DriverSettingsModule` 與 [`apps/api/src/app.module.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/app.module.ts:29) 的 `RegulatoryRegistryModule`，但沒有 `DriverProfileModule`。
- [`packages/contracts/src/index.ts`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:1) 尚未出現 `DriverProfileRecord`、`CreateDriverProfileCommand`、`UpdateDriverProfileCommand`。
- [`apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:50) 的 `DriverRegistryRecord` seed 目前只呈現 `driverId`、`name`、`supportedServiceBuckets`、`workState`、`licensesValid` 這類 registry baseline。

結論：`GAP-P2S3-008` 不是單純把既有 settings screen 指到新 URL；它正式依賴 `GAP-P2S1-004-API` 先交付 standalone `driver-profile` API，而 repo 現況仍停在 demo-driver 綁定的 `driver-settings` 偏好設定 surface。

---

## 3) Parent Acceptance Framing

`GAP-P2S3-008` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把 shared truth 既有語意展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Formal sequencing remains explicit

- [ ] parent `GAP-P2S3-008` 的正式 blocker 仍只引用 `GAP-P2S1-004-API`。
- [ ] 若 `GAP-P2S1-004-API` 尚未完成，`settings.tsx` integration 不可被 sidecar 或 handoff 說明誤寫成 ready。
- [ ] reviewer handoff 需明示：本 task 消費的是新 `driver-profile` API，而不是舊 `driver-settings` endpoint。

### AC-2 — Settings screen must switch from old driver-settings surface to driver-profile surface

- [ ] `settings.tsx` 不再以 `getDriverSettings("driver-demo-001")` / `updateDriverSettings("driver-demo-001", ...)` 作為主要資料來源。
- [ ] app 端改用正式 `driver-profile` client method 與對應 contracts 型別，而不是保留 `any` payload。
- [ ] reviewer 能從 screen data flow 看出讀取與儲存都已改接 `driver-profile` surface，而非只改其中一半。

### AC-3 — Demo-driver hardwire should not survive the final integration

- [ ] `driver-demo-001` 不應繼續作為 integration 完成態的固定 driver ID。
- [ ] screen 應以實際 driver context、auth context、或 parent API 約定的 self-service path 取代 demo seed wiring。
- [ ] sidecar/handoff 不得把目前 demo baseline 誤稱為「已接上 production-ready profile API」。

### AC-4 — Boundary with driver-settings and regulatory-registry remains clear

- [ ] 偏好設定 legacy surface 只能被描述為 current baseline，不可被用來宣稱 `GAP-P2S3-008` 已完成。
- [ ] `regulatory-registry` 仍屬 registry/compliance baseline，不是這個 screen 的 self-service write target。
- [ ] parent closeout 說明應把「UI wiring 完成」與「upstream driver-profile API/contracts 已存在」分開陳述。

---

## 4) Dependency Map

### Formal Upstream Dependency

> 以 machine truth 為準，`GAP-P2S3-008.depends_on=["GAP-P2S1-004-API"]`。

| Dep    | Source             | Status    | Notes                                                                     |
| ------ | ------------------ | --------- | ------------------------------------------------------------------------- |
| D-UP-1 | `GAP-P2S1-004-API` | `blocked` | parent API slice 尚未完成，且它本身仍 blocked on `GAP-P2S1-004-CONTRACTS` |

### Practical Review Dependencies

| Dep   | Type                              | Why It Matters                                                      |
| ----- | --------------------------------- | ------------------------------------------------------------------- |
| D-P-1 | `GAP-P2S1-004-API` sidecar packet | 說明 standalone `driver-profile` module 與 contracts-first 依賴鏈   |
| D-P-2 | Current `settings.tsx` baseline   | 說明目前仍是 `driver-settings` + demo driver wiring                 |
| D-P-3 | Current API client baseline       | 說明 repo 尚無 `driver-profile` client methods                      |
| D-P-4 | Current API module baseline       | 說明 repo 尚無 `driver-profile` module / route surface              |
| D-P-5 | Regulatory registry baseline      | 避免 reviewer 把 registry 當成 settings self-service profile target |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/consensus-packet.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/review-round-4.md`
- Repo anchors:
  - `apps/driver-app/app/settings.tsx`
  - `packages/api-client/src/index.ts`
  - `apps/api/src/modules/driver-settings/*`
  - `apps/api/src/modules/regulatory-registry/*`
  - `apps/api/src/app.module.ts`
  - `packages/contracts/src/index.ts`
  - `support/sidecars/GAP-P2S1-004-API/GAP-P2S1-004-API-SIDECAR-ACCEPTANCE.md`

---

## 5) Evidence Inventory

| ID  | Evidence                                               | Expected Anchor                                                                                           |
| --- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| E-1 | Parent / sidecar machine state                         | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                                              |
| E-2 | Formal `P2S1-004-API -> P2S3-008` sequencing           | `consensus-packet.md`, `review-round-4.md`                                                                |
| E-3 | Current settings screen still on old surface           | `apps/driver-app/app/settings.tsx:18-49`                                                                  |
| E-4 | API client only exposes legacy driver-settings methods | `packages/api-client/src/index.ts:1150-1155`                                                              |
| E-5 | Driver-settings module is current write surface        | `apps/api/src/modules/driver-settings/driver-settings.controller.ts`, `driver-settings.service.ts`        |
| E-6 | Driver-profile module absent                           | `apps/api/src/modules/driver-profile/` missing, `apps/api/src/app.module.ts` has no `DriverProfileModule` |
| E-7 | Driver-profile contracts absent                        | `packages/contracts/src/index.ts` lacks `DriverProfileRecord` / create/update commands                    |
| E-8 | Registry baseline remains separate                     | `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts:50-69`                           |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer（目前為 `Codex`）應優先確認：

1. packet 是否忠實保留 machine truth：`GAP-P2S3-008` 仍正式 blocked on `GAP-P2S1-004-API`。
2. packet 是否清楚把目前 `settings.tsx` 描述成 legacy `driver-settings` baseline，而不是 `driver-profile` integration 已完成。
3. demo driver hardwire (`driver-demo-001`) 是否被正確標記為現況缺口，而非可接受完成態。
4. packet 是否維持與 `GAP-P2S1-004-API` sidecar 一致的 boundary：profile self-service vs registry baseline。
5. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S3-008 acceptance packet ready: machine truth still blocks the parent on GAP-P2S1-004-API, the packet now treats the 2026-04-17T12:01:13Z Codex2 -> Codex handoff as the latest completed reviewer-routing baseline while also matching the current 2026-04-17T12:04:35Z shared-L0 review snapshot, keeps the earlier 2026-04-17T11:49:28Z reopen / 11:53:55Z owner snapshot / 11:57:53Z review routing only as historical churn, settings.tsx is still correctly framed as legacy driver-settings plus demo-driver wiring, and the reviewer checklist remains support-only without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / dependency drift / baseline misclassification / scope violation]`

---

## 7) Handoff Command

Owner（`Codex2`）完成修訂後，交給目前 reviewer（`Codex`）：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff GAP-P2S3-008-SIDECAR-ACCEPTANCE Codex "GAP-P2S3-008 acceptance packet ready at support/sidecars/GAP-P2S3-008/GAP-P2S3-008-SIDECAR-ACCEPTANCE.md. It preserves the formal blocker on GAP-P2S1-004-API, treats the 2026-04-17T12:01:13Z Codex2 -> Codex handoff as the latest reviewer-routing baseline, keeps the earlier 2026-04-17T11:49:28Z reopen / 2026-04-17T11:53:55Z owner snapshot / 2026-04-17T11:57:53Z review routing as historical churn only, captures settings.tsx as legacy driver-settings wiring against driver-demo-001, and keeps the reviewer checklist support-only without changing canonical truth."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S3-008-SIDECAR-ACCEPTANCE "GAP-P2S3-008 acceptance packet ready: machine truth still blocks the parent on GAP-P2S1-004-API, the packet now treats the 2026-04-17T12:01:13Z Codex2 -> Codex handoff as the latest completed reviewer-routing baseline while also matching the current 2026-04-17T12:04:35Z shared-L0 review snapshot, keeps the earlier 2026-04-17T11:49:28Z reopen, 2026-04-17T11:53:55Z owner snapshot, and 2026-04-17T11:57:53Z review routing as historical churn only, settings.tsx is correctly framed as a legacy driver-settings baseline rather than completed driver-profile wiring, and the support material stays within sidecar scope."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S3-008-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency drift / baseline misclassification / scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Codex2`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex2 python3 scripts/ai_status.py done GAP-P2S3-008-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S3-008 at support/sidecars/GAP-P2S3-008/GAP-P2S3-008-SIDECAR-ACCEPTANCE.md. The packet preserves the GAP-P2S1-004-API dependency, the current settings.tsx legacy baseline, and the latest reviewer-routing baseline from the 2026-04-17T12:01:13Z Codex2 -> Codex handoff without changing canonical truth."
```

---

## 10) Change Log

- 2026-04-17 — 初版建立：依共享 machine truth、`GAP-P2S1-004-API` sidecar、planning docs 與 repo 掃描，整理 `GAP-P2S3-008` 的 acceptance checklist、dependency map、legacy settings baseline、以及 reviewer handoff 指引。
- 2026-04-17T11:49Z — 依 `Codex` review reopen 更新：header 與 Sections 2/7/8 對齊最新 L0 快照，改用目前 `Reviewer=Codex`、記錄 `2026-04-17T11:46:48Z` handoff 與 `2026-04-17T11:49:28Z` reopen，並保留 `current-work.md` 僅為較早 generated snapshot。
- 2026-04-17T11:54Z — 依 `Codex` 二次 reopen 更新：Section 2 明確區分 `2026-04-17T11:49:28Z` reopen 與其後 `2026-04-17T11:51:22Z review` snapshot，並補記 `11:53:25Z` 至 `11:54:03Z` 的 owner rebalance / auto-reassign 鏈；同步刷新 handoff、approve、done 指令用語以對齊最新 `Owner=Codex2`、`Reviewer=Codex`、`last_update=2026-04-17T11:53:55Z`。
- 2026-04-17T12:00Z — 依 `Codex` 三次 reopen 更新：header、Section 2、reviewer 建議核准用語與 handoff/approve/done 指令改為以 shared L0 的 `2026-04-17T11:57:53Z review` routing 為準，補記 `2026-04-17T11:55:46Z` handoff 與其後 Qwen auto-reassign churn / `2026-04-17T11:59:36Z` reopen 要求，不改 task scope。
- 2026-04-17T12:04Z — 依 `Codex` 四次 reopen 更新：Section 2 不再把 `Qwen -> Codex` 誤寫成目前 pending review handoff，而是改以 `2026-04-17T12:01:13Z` 的 `Codex2 -> Codex` 最新完成 handoff 搭配 `2026-04-17T12:02:28Z` reopen 為 shared-L0 基線；同步移除 Section 7 重複且過時的 handoff 指令，並刷新 approve/done 用語。
- 2026-04-17T12:06Z — reviewer-facing 對齊更新：header 與 Section 2 補上目前 `2026-04-17T12:04:35Z` 的 `review` task row / pending handoff snapshot，同時保留 `2026-04-17T12:01:13Z` 為最新 completed reviewer-routing baseline；同步刷新建議核准用語與 approve 指令，避免文件再次停在 reopen snapshot。
