# GAP-P2S2-PREP Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S2-PREP` — driver-app: install `expo-image-picker` + `expo-location`, update `app.json` permissions  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex` / `(unset in machine truth)`  
**Last Revised:** `2026-04-18T00:37:44Z (UTC)`  
**Status:** `review_approved` (reviewer `Codex2` approved at `2026-04-18T00:36:35Z`; pending owner finalize dispatch belongs to `Codex`)

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S2-PREP` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- **In scope:** support-only acceptance framing, repo-scan evidence anchors, Expo capability bootstrap baseline, downstream dependency impact on `GAP-P2S2-001` / `GAP-P2S2-002` / `GAP-P2S2-005`, reviewer checklist.
- **Out of scope:** 修改 `apps/driver-app/app/trip.tsx` 的行程流程、修改 `packages/contracts/src/index.ts` 的 `CompletionProofBundle` / `DriverCompleteTaskCommand` canonical contract、直接吸收 `GAP-P2S2-001` proof bundle、`GAP-P2S2-002` trip metrics、`GAP-P2S2-005` heartbeat sender，或把 review-round 中的 scope tension 直接升格成新的 machine truth。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S2-PREP` 在 machine truth 中目前是 `backlog`，Owner=`Codex`，正式上游依賴為 `-`。
- 本 sidecar `GAP-P2S2-PREP-SIDECAR-ACCEPTANCE` 在 machine truth 中目前由 `Codex` 持有，Reviewer=`Codex2`，`status=review_approved`，`last_update=2026-04-18T00:36:35Z`，`next="GAP-P2S2-PREP acceptance packet ready: machine truth shows parent backlog with no formal upstream dependency, sidecar scope correctly locked to Expo capability bootstrap for driver-app ( +  + app.json permissions) under Expo SDK 54.0.33, AC checklist keeps proof bundle / trip metrics / heartbeat implementation plus contract changes out of scope, downstream impact on GAP-P2S2-001/002/005 is framed as bootstrap readiness only, and the task-manager / attachment-strategy tension is recorded as a practical note rather than a sidecar-driven canonical rewrite."`
- 最新 handoff queue 以 `current-work.md` / `ai-status.json` 為準，顯示一筆 pending `Codex2 -> Codex` finalize handoff，建立時間 `2026-04-18T00:36:35Z`。
- 最新 reviewer / finalize 鏈在 shared truth 中已收斂為：
  - `2026-04-18T00:36:35Z` `Codex2` 以 `review_approved` 核准此 packet
  - `2026-04-18T00:36:37Z` orchestrator 依 review-approval 狀態自動建立 owner finalize wake（`owned_finalize_dispatch`）
  - `2026-04-18T00:36:44Z` orchestrator 對 `Codex` 啟動 owner finalize worker；本 packet 需由 owner 正式關閉為 `done`
- Accepted consensus 對 parent 的 machine-facing範圍目前凍結為：
  - `GAP-P2S2-PREP | driver-app: 安裝 expo-image-picker + expo-location，更新 app.json permissions | Codex | XS`
  - dependency graph 把它視為 `GAP-P2S2-001`、`GAP-P2S2-002`、`GAP-P2S2-005` 的共同前置（`consensus-packet.md:30,38-43,70-73`）。
- 但 planning R1 另外保留了一條**不可直接覆蓋 machine truth 的 guardrail**：
  - `A-0 / Sprint 2 PREP 不能只安裝 expo-image-picker 與 expo-location；若 A-1/A-2/A-5 共享前置成立，至少還要明示 expo-task-manager 與 attachment-id issuance strategy`（`review-round-1.md:33-35,54-66`）。
  - 這代表 PREP sidecar 不能自行把 `expo-task-manager` 變成新的 canonical acceptance gate，但必須把這個下游張力清楚記錄給 reviewer / parent owner。

### Repo Baseline Anchors

- [`apps/driver-app/package.json:15-35`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/package.json:15) — driver app `dependencies` 目前沒有 `expo-image-picker`、`expo-location`、`expo-task-manager`；Expo SDK 版本為 `~54.0.33`。
- [`apps/driver-app/app.json:2-10`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app.json:2) — 目前只有 `plugins: ["expo-router"]`，沒有 image picker/location plugin，也沒有對應 permission / background config。
- [`apps/driver-app/app/trip.tsx:84-89`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:84) — `completeTask(...)` 仍只送 `actualDistanceKm: 0` / `actualDurationSec: 0`，沒有 proof，也沒有任何 location/media bootstrap 路徑；代表 PREP 尚未落地，下游任務仍缺 capability。
- [`packages/contracts/src/index.ts:467-476`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:467) + [`:609-614`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:609) — repo canonical contract 目前仍是 `CompletionProofBundle.photoIds: string[]` 與 `DriverCompleteTaskCommand.proof?: CompletionProofBundle`；PREP 不應自行改動這個真相。

### Gap Summary

| 問題                                                       | 影響                                                                                                         | 根本原因                                                                                                     |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `expo-image-picker` 不存在                                 | `GAP-P2S2-001` 無法合法取得照片 / 啟動 proof capture flow                                                    | PREP 尚未執行                                                                                                |
| `expo-location` 不存在                                     | `GAP-P2S2-002` 無法蒐集真實距離/時間；`GAP-P2S2-005` 也沒有定位 runtime                                      | PREP 尚未執行                                                                                                |
| `app.json` 沒有 image/location plugin 與 permission config | OS 層不會授權相機/相簿/定位使用                                                                              | PREP 尚未執行                                                                                                |
| review-round guardrail 與 accepted row 有張力              | reviewer 若不明確記錄，容易把 PREP scope 誤寫成「已完整處理 background/task-manager 與 attachment strategy」 | packet 若只抄 accepted row，會遺漏下游風險；若直接把 R1 guardrail 改成 acceptance gate，又會越權改 canonical |

---

## 3) Parent Acceptance Framing

`GAP-P2S2-PREP` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把共享 truth、consensus docs 與 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Expo package bootstrap 依 accepted parent row 完成

- [ ] `apps/driver-app/package.json` 的 `dependencies` 已加入 `expo-image-picker` 與 `expo-location`。
- [ ] 套件版本是透過 Expo SDK 54.0.33 相容方式加入（例如 `npx expo install ...` 產生的版本），而不是手填不相容 semver。
- [ ] 若實作同時把 `expo-task-manager` 一併加進來，closeout message 必須明確標示這是**additive bootstrap**，不是 sidecar 自行改寫 parent title；若沒有加，也不應在 closeout 中假稱 background runtime 已完整 bootstrap。
- [ ] package install 不應夾帶與 PREP 無關的 driver-app/runtime 套件變更。

### AC-2 — `app.json` permissions / plugins 已補齊到可支援下游使用

- [ ] `apps/driver-app/app.json` 仍保持合法 JSON，且在既有 `expo-router` 之外，加入 image picker / location 對應的 Expo plugin 或等效 config。
- [ ] image/media 權限說明已補齊，足以支援 `GAP-P2S2-001` 的 photo picker / capture flow。
- [ ] location 權限說明已補齊，足以支援 `GAP-P2S2-002` 的前景 trip metrics flow。
- [ ] 若實作選擇順手補背景定位相關 config，closeout 應清楚區分哪些設定屬 accepted PREP row、哪些是為 `GAP-P2S2-005` 預先鋪底的 additive work。

### AC-3 — PREP 仍是 capability bootstrap，不偷吸收 sibling implementation

- [ ] parent 完成不要求修改 `apps/driver-app/app/trip.tsx` 的 photo picker UI、proof assembly、distance accumulation、duration tracking、background heartbeat sender。
- [ ] parent 完成不要求修改 `packages/contracts/src/index.ts` 的 `CompletionProofBundle.photoIds` / `attachmentId` canonical contract。
- [ ] parent 完成不要求新增 media upload path、attachment-id issuance path、或 base64 inline proof contract；那些仍屬 `GAP-P2S2-001` / `GAP-P2S2-001-CONTRACTS` 的下游決策面。
- [ ] parent closeout 若提到 downstream readiness，必須用「bootstrap 已就緒」表述，而不是聲稱 sibling tasks 已部分完成。

### AC-4 — Downstream dependency impacts 要寫清楚，不可過度承諾

- [ ] `GAP-P2S2-001` 只應被描述為「現在可依賴 image picker + app permissions bootstrap」，不能因此跳過 `GAP-P2S2-001-CONTRACTS` 或 proof acquisition strategy。
- [ ] `GAP-P2S2-002` 只應被描述為「現在可依賴 Expo Location + permission bootstrap」，不表示 trip metrics 已實作。
- [ ] `GAP-P2S2-005` 的 formal dependency 雖然包含 PREP，但 reviewer 應確認 closeout 是否明確交代 background/task-manager 路徑：
  - 若 PREP 實作已加 `expo-task-manager` / 背景定位 config，closeout 應直接說明。
  - 若 PREP 僅交付 accepted row 的 image-picker/location/bootstrap，則 closeout 應保留 `GAP-P2S2-005` 仍需自行完成 background capability 的事實。
- [ ] packet 不把 review-round-1 的 guardrail 直接升格成 parent fail/pass gate，但 reviewer 應確認 closeout 至少**記錄**這條張力，而不是默默忽略。

### AC-5 — Verification 能證明 bootstrap 已落地且沒有破壞 driver app baseline

- [ ] `pnpm --filter @drts/driver-app typecheck` 通過，無新增 TypeScript 錯誤。
- [ ] 若實作有更新 lockfile / Expo config，變更與 `apps/driver-app` 的 package/config bootstrap 相對應，沒有 unrelated workspace churn。
- [ ] 若環境允許，Expo config 可正常解析（例如 `expo config` 或等效檢查）；若無法在此 repo環境驗證，也應在 closeout message 註明未驗證項。
- [ ] PREP 完成後，driver app baseline 不應出現明顯回歸，例如 JSON 配置損壞、package parse 失敗、或 build/typecheck 因新依賴而直接爆掉。

---

## 4) Dependency Map

### Formal Dependencies

> 以 machine truth 為準，`GAP-P2S2-PREP.depends_on = []`（無正式上游依賴）。

| Dep      | Source | Status | Notes                                             |
| -------- | ------ | ------ | ------------------------------------------------- |
| _(none)_ | -      | -      | PREP 本身是 Sprint 2 的 capability bootstrap 起點 |

### Practical Context Dependencies

| Dep   | Type                                                       | Why It Matters                                                                                |
| ----- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| D-P-1 | accepted consensus row (`consensus-packet.md:30`)          | 凍結 parent 的 machine-facing標題：`expo-image-picker + expo-location + app.json permissions` |
| D-P-2 | review-round-1 guardrail (`review-round-1.md:33-35,54-66`) | 記錄下游張力：若 A-1/A-2/A-5 視為共享前置，task-manager / attachment strategy 不能被完全忽略  |
| D-P-3 | `apps/driver-app/package.json` baseline                    | 目前完全缺 image-picker/location/task-manager，說明 parent 尚未落地                           |
| D-P-4 | `apps/driver-app/app.json` baseline                        | 目前只有 `expo-router` plugin，說明 app permissions/config 尚未鋪底                           |
| D-P-5 | `apps/driver-app/app/trip.tsx` baseline                    | 下游任務仍停在 `0/0` / 無 proof；PREP 是為它們鋪 capability，不是替代它們                     |
| D-P-6 | `packages/contracts/src/index.ts` baseline                 | canonical contract 仍是 `photoIds` / `attachmentId`；PREP 不能自行修改這條真相                |

### Forward (Downstream) Dependencies

| Dep            | Status    | Why It Matters                                                                                                                                    |
| -------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GAP-P2S2-001` | `backlog` | 需要 image picker + app permissions bootstrap 才能做 proof bundle                                                                                 |
| `GAP-P2S2-002` | `backlog` | 需要 Expo Location + permission bootstrap 才能做 trip metrics                                                                                     |
| `GAP-P2S2-005` | `backlog` | machine truth formally depends on PREP, but background/task-manager details remain a practical follow-up tension that closeout must state clearly |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-1.md`
- Repo anchors:
  - `apps/driver-app/package.json`
  - `apps/driver-app/app.json`
  - `apps/driver-app/app/trip.tsx`
  - `packages/contracts/src/index.ts`

---

## 5) Evidence Inventory

| ID  | Evidence                                                        | Expected Anchor                                              |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------ |
| E-1 | Parent / sidecar machine state                                  | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl` |
| E-2 | Accepted PREP row                                               | `consensus-packet.md:30`                                     |
| E-3 | Accepted downstream dependency graph                            | `consensus-packet.md:38-43,70-73`                            |
| E-4 | R1 guardrail on task-manager / attachment strategy              | `review-round-1.md:33-35,54-66`                              |
| E-5 | Driver app baseline lacks all three Expo packages today         | `apps/driver-app/package.json:15-35`                         |
| E-6 | Driver app app.json only has `expo-router` plugin               | `apps/driver-app/app.json:2-10`                              |
| E-7 | Downstream trip flow still sends `0/0` and no proof             | `apps/driver-app/app/trip.tsx:84-89`                         |
| E-8 | Canonical proof contract still uses `photoIds` / `attachmentId` | `packages/contracts/src/index.ts:467-476,609-614`            |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S2-PREP` 仍是 `backlog`、Owner=`Codex`、無 formal upstream dependency；sidecar reviewer 是 `Codex2`。
2. packet metadata 是否已對齊最新 shared L0：`last_update=2026-04-18T00:36:35Z`、`status=review_approved`、handoff queue 為 pending `Codex2 -> Codex` owner-finalize handoff。
3. AC-1 / AC-2 是否把 accepted parent row 鎖在「image-picker + location + app.json permissions」，沒有自行把 `expo-task-manager` 升格成新的 canonical gate。
4. AC-4 是否把 `review-round-1` 的 guardrail 正確處理成**需要記錄的 practical tension**，而不是直接忽略，或反過來越權改寫 parent scope。
5. packet 是否清楚區分 downstream readiness：
   - `GAP-P2S2-001` / `GAP-P2S2-002` 只取得 capability bootstrap。
   - `GAP-P2S2-005` 的 background path 若未一併鋪底，就不能被過度承諾為 fully ready。
6. packet 是否明確禁止 PREP 偷取 `trip.tsx` runtime、proof contract、media upload、base64 inline proof 等 sibling / canonical work。
7. support artifact 是否完全停留在支援材料層，沒有修改 L1 truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S2-PREP acceptance packet ready: machine truth shows parent backlog with no formal upstream dependency, sidecar scope correctly locked to Expo capability bootstrap for driver-app (`expo-image-picker`+`expo-location` + app.json permissions) under Expo SDK 54.0.33, AC checklist keeps proof bundle / trip metrics / heartbeat implementation and contract changes out of scope, downstream impact on GAP-P2S2-001/002/005 is framed as bootstrap readiness only, and the review-round task-manager / attachment-strategy tension is recorded as a practical closeout note rather than a sidecar-driven canonical rewrite.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / scope drift / overclaimed downstream readiness / task-manager tension handled incorrectly / proof contract scope leaked into PREP]`

---

## 7) Handoff Command

Owner（`Codex`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff GAP-P2S2-PREP-SIDECAR-ACCEPTANCE Codex2 "GAP-P2S2-PREP acceptance packet refreshed at support/sidecars/GAP-P2S2-PREP/GAP-P2S2-PREP-SIDECAR-ACCEPTANCE.md. It keeps machine truth aligned on parent backlog with no formal upstream dependency, updates the sidecar review snapshot to the latest 2026-04-18T00:34:26Z Qwen -> Codex2 pending handoff plus the 2026-04-18T00:33:29Z-2026-04-18T00:34:36Z reviewer-routing chain ending in the latest Codex2 wake/worker-start, frames PREP as Expo capability bootstrap for apps/driver-app (`expo-image-picker` + `expo-location` + app.json permissions) under SDK 54.0.33, keeps proof bundle / trip metrics / heartbeat runtime plus contract changes out of scope, maps downstream impact on GAP-P2S2-001/002/005 as bootstrap readiness only, and records the review-round task-manager / attachment-strategy tension as a practical closeout note rather than a canonical rewrite."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve GAP-P2S2-PREP-SIDECAR-ACCEPTANCE "GAP-P2S2-PREP acceptance packet ready: machine truth shows parent backlog with no formal upstream dependency, sidecar scope correctly locked to Expo capability bootstrap for driver-app (`expo-image-picker` + `expo-location` + app.json permissions) under SDK 54.0.33, AC checklist keeps proof bundle / trip metrics / heartbeat implementation plus contract changes out of scope, downstream impact on GAP-P2S2-001/002/005 is framed as bootstrap readiness only, and the task-manager / attachment-strategy tension is recorded as a practical note rather than a sidecar-driven canonical rewrite."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen GAP-P2S2-PREP-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / scope drift / overclaimed downstream readiness / task-manager tension handled incorrectly / proof contract scope leaked into PREP]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Codex`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done GAP-P2S2-PREP-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S2-PREP at support/sidecars/GAP-P2S2-PREP/GAP-P2S2-PREP-SIDECAR-ACCEPTANCE.md. The packet preserves machine truth on PREP as Expo capability bootstrap (`expo-image-picker` + `expo-location` + app.json permissions), keeps proof bundle / trip metrics / heartbeat runtime and canonical contract work out of scope, maps downstream impact on GAP-P2S2-001/002/005 as bootstrap readiness only, and records the task-manager / attachment-strategy tension as a practical closeout note without changing canonical truth."
```

---

## 10) Change Log

- 2026-04-17T18:12Z — 初版建立：依共享 machine truth、accepted consensus row、review-round-1 guardrail、以及 driver-app repo baseline（`package.json` 缺 `expo-image-picker` / `expo-location` / `expo-task-manager`、`app.json` 只有 `expo-router`、`trip.tsx` 仍送 `0/0` / 無 proof、contracts 仍為 `photoIds` / `attachmentId`）整理 `GAP-P2S2-PREP` 的 acceptance checklist、formal/practical dependency map、evidence inventory 與 reviewer handoff 指引。
- 2026-04-18T00:25:24Z — metadata refresh：將 header 與 current-state 敘述對齊 shared L0 最新 machine truth（sidecar 仍為 `review`、owner=`Codex`、reviewer=`Codex2`、`ai-status.json.last_update=2026-04-18T00:25:24Z`、`next` 為最新 `Qwen -> Codex2` 自動回派）；並補入 `2026-04-18T00:22:52Z-2026-04-18T00:25:31Z` reviewer-routing 鏈與最新 pending handoff / wake evidence，acceptance framing 本身不變。
- 2026-04-18T00:29:59Z — metadata refresh：將 header、current-state 與 handoff command 對齊 shared L0 最新 machine truth（sidecar 仍為 `review`、owner=`Codex`、reviewer=`Codex2`、`ai-status.json.last_update=2026-04-18T00:29:52Z`、`next` 仍為最新 `Qwen -> Codex2` 自動回派）；並補入 `2026-04-18T00:28:40Z-2026-04-18T00:29:59Z` reviewer-routing 鏈與最新 pending handoff / wake evidence，acceptance framing 本身不變。
- 2026-04-18T00:34:36Z — metadata refresh：將 header、current-state、reviewer hotspots 與 handoff command 對齊 shared L0 最新 machine truth（sidecar 仍為 `review`、owner=`Codex`、reviewer=`Codex2`、`ai-status.json.last_update=2026-04-18T00:34:26Z`、`next` 仍為最新 `Qwen -> Codex2` 自動回派）；並補入 `2026-04-18T00:33:29Z-2026-04-18T00:34:36Z` reviewer-routing 鏈與最新 pending handoff / wake evidence，acceptance framing 本身不變。
- 2026-04-18T00:37:44Z — metadata refresh：將 header、current-state 與 reviewer hotspots 對齊 shared L0 最新 machine truth（sidecar 已進入 `review_approved`、owner=`Codex`、reviewer=`Codex2`、`ai-status.json.last_update=2026-04-18T00:36:35Z`、handoff queue 改為 pending `Codex2 -> Codex` finalize handoff）；並補入 `2026-04-18T00:36:35Z-2026-04-18T00:36:44Z` 的 approval/finalize-dispatch 鏈，acceptance framing 本身不變。
