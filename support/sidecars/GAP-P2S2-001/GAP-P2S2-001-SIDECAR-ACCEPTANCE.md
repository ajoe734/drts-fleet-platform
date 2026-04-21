# GAP-P2S2-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S2-001` — driver-app: trip screen proof bundle — photo picker + `CompletionProofBundle` assembly  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex2` / `(unset in machine truth)`  
**Last Revised:** `2026-04-17T20:01Z (UTC)`  
**Status:** `review` — shared L0 currently keeps sidecar `GAP-P2S2-001-SIDECAR-ACCEPTANCE` at `review` under owner=`Codex`, reviewer=`Codex2`, `last_update=2026-04-17T19:57:55Z`, while the parent `GAP-P2S2-001` remains `backlog` under owner=`Codex2` with formal dependencies on `GAP-P2S2-PREP` and `GAP-P2S2-001-CONTRACTS`

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S2-001` 的 acceptance checklist、dependency map、shared-truth snapshot、repo/test evidence anchors 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- In scope: support-only acceptance framing, dependency mapping, proof-bundle repo baseline, reviewer checklist, and handoff / closeout commands.
- Out of scope: driver-app 主線 runtime 變更、`CompletionProofBundle` canonical contract 修改本身、server-side validator implementation、`actualDistanceKm` / `actualDurationSec` 的 Expo Location 任務、GPS heartbeat、或任何 L1/L2 真相編修。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S2-001` 在 machine truth 中目前是 `backlog`，Owner=`Codex2`，`reviewer=""`，正式依賴為 `GAP-P2S2-PREP` 與 `GAP-P2S2-001-CONTRACTS`。
- 本 sidecar `GAP-P2S2-001-SIDECAR-ACCEPTANCE` 在目前 shared L0 task row 中是 `status=review`，Owner=`Codex`、Reviewer=`Codex2`、artifact path=`support/sidecars/GAP-P2S2-001/GAP-P2S2-001-SIDECAR-ACCEPTANCE.md`、`last_update=2026-04-17T19:57:55Z`。
- `ai-activity-log.jsonl` / `current-work.md` 顯示 Qwen review worker 多次因 token 錯誤失敗後，review responsibility 已自動改派回 `Codex2`；因此正式 handoff target 以 machine truth 的 `Codex2` 為準，而不是舊版 packet 的 `Qwen`。
- accepted consensus packet 已把 A-1 proof bundle 收斂為 Sprint 2 P0 / UAT gate：
  - `consensus-packet.md` 明確取消獨立 `GAP-P2S2-009` media upload 任務，接受 inline base64 路線。
  - 同一份 packet 把 `GAP-P2S2-001` 寫成「Expo ImagePicker + base64 壓縮 + `CompletionProofBundle`」，並把 `GAP-P2S2-001-CONTRACTS` 獨立成先行依賴。
  - `review-round-4.md` 把 A-1 proof bundle 定位成 DA-007 / DA-009 的 UAT 阻斷項，而不是可延後的加分項。
- 目前 repo baseline 仍停在 pre-contract state：
  - `trip.tsx` 在 `completeTask(...)` 呼叫中完全不送 `proof`，且仍硬寫 `actualDistanceKm: 0` / `actualDurationSec: 0`。
  - `@drts/contracts` 仍定義 `CompletionProofBundle.photoIds: string[]` 與 `CompletionExpenseItem.attachmentId: string`，尚未反映 accepted backlog 的 `photos: string[]` base64 方案。
  - `owned-mobility.service.ts` 目前也只消費 `command.proof?.photoIds`、`signatureId`、`expenseItems`，並直接依 `minPhotoCount` / `signoffRequired` / `expenseProofRequired` 做 server-side reject。
  - enterprise dispatch create path 對 `proofRequirements.minPhotoCount` 的預設值仍是 `1`，表示沒有照片 proof 時，真實完成流程會被後端擋下。
- 這代表 parent `GAP-P2S2-001` 的 acceptance 不能只看 driver-app UI 是否有 photo picker；它必須同時確認：
  - PREP 已安裝 photo capture capability。
  - contracts slice 已把 proof payload shape 轉成 accepted base64 form。
  - app-side 完成流程確實送出非空 proof，而不是繼續停在 `proof: undefined`。

### Repo Baseline Anchors

- [`apps/driver-app/app/trip.tsx:85-89`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app/trip.tsx:85) — `completeTask(...)` 目前只送 `completedAt`, `actualDistanceKm: 0`, `actualDurationSec: 0`，完全沒有 `proof`。
- [`apps/driver-app/package.json`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/package.json) — `dependencies` 目前沒有 `expo-image-picker`；代表 photo capture capability 尚未存在。
- [`apps/driver-app/app.json`](/home/edna/workspace/drts-fleet-platform/apps/driver-app/app.json) — 目前只有 `expo-router` plugin，沒有 camera/media library permission 設定。
- [`packages/contracts/src/index.ts:467-476`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:467) — repo 目前的 `CompletionProofBundle` 仍是 `photoIds: string[]`，不是 accepted Sprint 2 backlog 要求的 `photos: string[]`。
- [`packages/contracts/src/index.ts:609-614`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:609) — `DriverCompleteTaskCommand.proof?: CompletionProofBundle` 已存在，表示 parent app task 不需要新增 route surface，只需要送對 payload shape。
- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1675-1736`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1675) — server 目前只複製 `proof.photoIds`、檢查 `minPhotoCount` / `signoffRequired` / `expenseProofRequired`，並直接寫入 `task.proof` / `task.actualDistanceKm` / `task.actualDurationSec`。
- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:467-473`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:467) — enterprise dispatch create path 預設 `minPhotoCount: command.minPhotoCount ?? 1`，這不是 demo-only comment，而是實際 proof gate。
- [`tests/e2e/fixtures/e2e-driver-complete.json`](/home/edna/workspace/drts-fleet-platform/tests/e2e/fixtures/e2e-driver-complete.json:1) 與 [`tests/unit/owned-mobility.test.ts:545-553`](/home/edna/workspace/drts-fleet-platform/tests/unit/owned-mobility.test.ts:545) — 現有測試證據仍使用 `proof.photoIds`，因此它們是「現況 baseline」，不是 accepted base64 contract 落地後的最終 acceptance evidence。

### Gap Summary

| 問題                                                                 | 影響                                                 | 根本原因                                                      |
| -------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| `completeTask` 仍送 `proof: undefined`                               | `minPhotoCount >= 1` 的 enterprise dispatch 無法完成 | trip screen 尚未具備 photo capture / proof assembly           |
| accepted backlog 要求 `proof.photos[]`，repo 仍是 `proof.photoIds[]` | app task 若先做，會撞上未完成的 contract gate        | `GAP-P2S2-001-CONTRACTS` 尚未落地                             |
| `expo-image-picker` 與 app permissions 尚未存在                      | UI 無法合法取得照片                                  | `GAP-P2S2-PREP` 尚未完成                                      |
| `actualDistanceKm` / `actualDurationSec` 仍為 `0`                    | 與 proof bundle 同一 call site 會互相干擾驗收        | 這是 sibling task `GAP-P2S2-002` 的責任，不應被本 task 偷吸收 |

---

## 3) Parent Acceptance Framing

`GAP-P2S2-001` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把 accepted backlog、shared truth 與 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — PREP capability gate must be satisfied before app-side proof work counts

- [ ] `GAP-P2S2-PREP` 已完成，或 parent implementation evidence 能明確追溯到同一變更中已加入 `expo-image-picker` 與必要的 app permission / plugin 設定。
- [ ] reviewer 不接受「只有 trip.tsx UI 變更」但沒有 photo capture dependency / permission wiring 的 parent closeout。
- [ ] packet 不把 `expo-location` 指標追蹤視為本 task 驗收條件；那是 `GAP-P2S2-002` 的平行依賴，不是 proof bundle gate。

### AC-2 — App-side acceptance must follow the post-contract proof shape, not the current repo baseline

- [ ] `GAP-P2S2-001-CONTRACTS` 已完成，且 acceptance evidence 反映 accepted Sprint 2 backlog 的 `CompletionProofBundle.photos: string[]` base64 路線。
- [ ] parent app task 不能以目前 repo 的 `photoIds` fixture / payload 當作最終完成證據，除非 parent owner 明確重新仲裁 accepted backlog。
- [ ] reviewer 應確認 app-side payload 與 server-side validator 使用的是同一個 proof schema，不接受「UI 已改 base64，但 server 還只吃 `photoIds`」或相反方向的半完成狀態。

### AC-3 — Trip completion must stop sending empty proof

- [ ] `trip.tsx` 的 `completeTask(...)` 呼叫不再維持 `proof: undefined`。
- [ ] parent implementation 能透過 Expo ImagePicker 取得至少一張照片，做必要壓縮 / 正規化後組入 `CompletionProofBundle`。
- [ ] 當訂單 `proofRequirements.minPhotoCount > 0` 時，driver app 需在送 request 前阻止空 proof，或至少在 UI 上明確要求補齊照片，而不是把 server-side `MIN_PHOTO_COUNT_NOT_MET` 當成唯一 UX。
- [ ] 若 contracts slice 仍保留 `signatureId` / `expenseItems` 欄位，app-side 組 bundle 時不得破壞這些欄位的既有語義。

### AC-4 — Acceptance must stay scoped to proof bundle, not absorb adjacent trip metrics / heartbeat work

- [ ] 本 task 的 acceptance 只驗證 photo proof capture + bundle assembly，不把 `actualDistanceKm` / `actualDurationSec` 真實化當成 blocking item；那些由 `GAP-P2S2-002` 負責。
- [ ] 本 task 不實作 background GPS heartbeat；那是 `GAP-P2S2-005` 的職責。
- [ ] parent closeout 若宣稱同時解掉 Expo Location 指標或 heartbeat，應被視為 scope drift，而不是這個 acceptance packet 的既定要求。

### AC-5 — UAT claims must match actual bundle fields delivered

- [ ] 如果 parent closeout聲稱已覆蓋 DA-007 / DA-009，reviewer 應要求證據顯示對應 proof bundle 欄位真的被填入，而不是只完成 photo picker UI。
- [ ] 若 implementation 只處理照片 proof，則 closeout 應精確表述為先解除 `minPhotoCount` gate，不得模糊宣稱所有 completion-proof 情境都已解完。
- [ ] 不得重新引入已被 accepted consensus 取消的獨立 media upload API 任務作為隱性依賴。

### AC-6 — Verification evidence must move beyond pre-contract `photoIds` fixtures

- [ ] 至少一條與 parent 任務直接相關的驗證，能證明 `completeTask(...)` 送出的 proof payload 不再是空值，且 shape 對齊 accepted contract。
- [ ] 現有 `tests/e2e/fixtures/e2e-driver-complete.json` 與 `tests/unit/owned-mobility.test.ts` 的 `photoIds` fixtures 只能作為 repo baseline；若 contract 已改成 `photos[]`，這些測試應同步更新或補上平行證據。
- [ ] reviewer 不應把現況 server-side `photoIds` 測試誤讀成 driver-app proof bundle 已完成。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`GAP-P2S2-001.depends_on=["GAP-P2S2-PREP","GAP-P2S2-001-CONTRACTS"]`。

| Dep    | Source                   | Status    | Notes                                                                                                                                       |
| ------ | ------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| D-UP-1 | `GAP-P2S2-PREP`          | `backlog` | `expo-image-picker` / permissions bootstrap；沒有它就沒有 photo capture capability                                                          |
| D-UP-2 | `GAP-P2S2-001-CONTRACTS` | `backlog` | accepted backlog 要求 `CompletionProofBundle.photos: string[]` + server-side size/count gate；沒有它，parent app task 不能以最終 shape 驗收 |

### Practical Review Dependencies

| Dep     | Type                                         | Why It Matters                                                                                       |
| ------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| D-P-1   | accepted consensus packet                    | 凍結 A-1 已走 base64 contract 路線，且取消了獨立 media upload task                                   |
| D-P-2   | `review-round-4.md` UAT blocker note         | 證明 proof bundle 不是 nice-to-have，而是 enterprise completion 的阻斷項                             |
| D-P-3   | current `trip.tsx` call site                 | parent 與 sibling metrics task 共享同一個 `completeTask(...)` payload，需要 reviewer 防止 scope 混線 |
| D-P-4   | current contracts / owned-mobility validator | 說明 accepted backlog 與 repo baseline 之間仍有 contract gap，不能假裝 app task 可獨立完成           |
| D-P-5   | existing proof fixtures                      | 說明現有 tests 仍停在 `photoIds` baseline，closeout 時需要特別檢查是否已更新                         |
| D-FWD-1 | `GAP-P2S2-002`                               | 同 screen 的 `actualDistanceKm` / `actualDurationSec` 真值由 sibling task 負責                       |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Accepted planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-4.md`
- Repo anchors:
  - `apps/driver-app/app/trip.tsx`
  - `apps/driver-app/package.json`
  - `apps/driver-app/app.json`
  - `packages/contracts/src/index.ts`
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  - `tests/e2e/fixtures/e2e-driver-complete.json`
  - `tests/unit/owned-mobility.test.ts`

---

## 5) Evidence Inventory

| ID   | Evidence                                                        | Expected Anchor                                                                            |
| ---- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| E-1  | Parent / sidecar machine state                                  | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                               |
| E-2  | Accepted Sprint 2 backlog for A-1                               | `consensus-packet.md:11-19,38-40,69-73`                                                    |
| E-3  | UAT blocker framing                                             | `review-round-4.md:27-40`                                                                  |
| E-4  | Current empty-proof app payload                                 | `apps/driver-app/app/trip.tsx:85-89`                                                       |
| E-5  | Missing image-picker capability                                 | `apps/driver-app/package.json`, `apps/driver-app/app.json`                                 |
| E-6  | Current repo contract still uses `photoIds`                     | `packages/contracts/src/index.ts:473-476,611-614`                                          |
| E-7  | Server-side validator still consumes `photoIds` and proof gates | `owned-mobility.service.ts:1675-1707`                                                      |
| E-8  | Enterprise dispatch default min photo count = 1                 | `owned-mobility.service.ts:467-473`                                                        |
| E-9  | Existing proof-related tests still use `photoIds`               | `tests/e2e/fixtures/e2e-driver-complete.json`, `tests/unit/owned-mobility.test.ts:545-553` |
| E-10 | Sibling metrics task separation                                 | `ai-status.json` / `current-work.md` rows for `GAP-P2S2-002`                               |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S2-001` 仍是 `backlog`、owner=`Codex2`、formal deps=`GAP-P2S2-PREP` + `GAP-P2S2-001-CONTRACTS`；sidecar 目前是 owner=`Codex` / reviewer=`Codex2` 的 `review` snapshot。
2. acceptance framing 是否把 `GAP-P2S2-001-CONTRACTS` 視為硬 gate，而不是錯把當前 `photoIds` contract 當成最終目標。
3. packet 是否明確區分本 task（proof bundle）與 `GAP-P2S2-002`（Expo Location metrics），避免在同一 `completeTask(...)` call site 上把 scope 混成一包。
4. packet 是否保留 accepted consensus 的關鍵限制：不重新引入 `GAP-P2S2-009` 類型的獨立 media upload 依賴。
5. reviewer 是否需要要求更精確的 UAT 語句，特別是在 implementation 只處理照片 proof、尚未明示其他 proof subfields 時，不得過度宣稱 `DA-009` 全覆蓋。
6. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S2-001 acceptance packet ready: machine truth still keeps the parent in backlog behind PREP and GAP-P2S2-001-CONTRACTS, the packet correctly frames the current trip.tsx gap as proof: undefined on the completion path, treats the accepted base64 proof contract as a hard upstream gate rather than reusing the repo's current photoIds baseline, keeps proof-bundle scope separate from GAP-P2S2-002 metrics work, and stays within support-only sidecar boundaries.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / contract-gate drift / proof-vs-metrics scope confusion / UAT overclaim / support-scope violation]`

---

## 7) Handoff Command

Owner（`Codex`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff GAP-P2S2-001-SIDECAR-ACCEPTANCE Codex2 "GAP-P2S2-001 acceptance packet ready at support/sidecars/GAP-P2S2-001/GAP-P2S2-001-SIDECAR-ACCEPTANCE.md. It keeps machine truth aligned on parent backlog with PREP plus GAP-P2S2-001-CONTRACTS as hard gates, captures trip.tsx:85-89 as the current empty-proof completion path, freezes the accepted base64 proof-contract target against the repo's current photoIds baseline, separates proof-bundle scope from GAP-P2S2-002 metrics work, records the Qwen->Codex2 review reassignment from shared L0 history, and stays within support-only sidecar boundaries."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve GAP-P2S2-001-SIDECAR-ACCEPTANCE "GAP-P2S2-001 acceptance packet ready: machine truth still keeps the parent in backlog behind PREP and GAP-P2S2-001-CONTRACTS, the packet correctly frames the empty-proof completion gap in trip.tsx, treats the accepted base64 proof contract as an upstream gate instead of reusing the current photoIds baseline, keeps proof scope separate from GAP-P2S2-002 metrics work, reflects the Qwen->Codex2 review reassignment from shared L0 history, and stays within support-only sidecar boundaries."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen GAP-P2S2-001-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / contract-gate drift / proof-vs-metrics scope confusion / UAT overclaim / support-scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Codex`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done GAP-P2S2-001-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S2-001 at support/sidecars/GAP-P2S2-001/GAP-P2S2-001-SIDECAR-ACCEPTANCE.md. The packet preserves the parent backlog dependency gates, the current empty-proof trip.tsx baseline, the accepted base64 proof-contract target, and the reviewer handoff path without changing canonical truth."
```

Parent absorption / 主線採納仍由 parent owner `Codex2` 視需要決定，不由此 sidecar 自動推進。

---

## 10) Change Log

- 2026-04-17T20:01Z — 再次對齊最新 shared L0 truth：將 sidecar header 的 `last_update` 刷新到 `2026-04-17T19:57:55Z`，並修正 reviewer hotspots 中殘留的舊描述，明確標示目前 machine truth 是 owner=`Codex` / reviewer=`Codex2` / `status=review`。
- 2026-04-17T19:58Z — 對齊最新 shared L0 truth：將 reviewer 由 `Qwen` 更新為 `Codex2`，把 sidecar 狀態從舊的 `in_progress` snapshot 修正為目前 machine truth 的 `review`，並補記 Qwen token failure 後的 review reassignment，更新 handoff / approve / reopen 指令與 reviewer hotspot 對象。
- 2026-04-17T15:22Z — 初版建立：依 shared L0 truth、accepted `gap-phase2-planning-20260417` consensus、以及 repo/test 掃描，整理 `GAP-P2S2-001` 的 acceptance checklist、PREP + contracts gate、current `proof: undefined` baseline、proof-vs-metrics scope boundary、與 reviewer handoff / closeout 指引。
