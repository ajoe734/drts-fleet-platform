# GAP-P2S2-001-CONTRACTS Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S2-001-CONTRACTS` — contracts: `CompletionProofBundle.photos: string[]` (base64) + server-side 限制  
**Current Sidecar Owner:** `Claude`  
**Assigned Reviewer:** `Codex`  
**Parent Owner / Reviewer:** `Codex` / `(unset in machine truth)`  
**Last Revised:** `2026-04-17T16:17Z (UTC)`  
**Status:** `review` — sidecar owner=`Claude`, reviewer=`Codex`, `last_update=2026-04-17T16:15:16Z`, with a pending handoff from `Claude` to `Codex`. Parent `GAP-P2S2-001-CONTRACTS` is `backlog` under owner=`Codex` with no formal upstream dependencies.

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S2-001-CONTRACTS` 的 acceptance checklist、dependency map、shared-truth snapshot、repo/test evidence anchors 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- In scope: support-only acceptance framing, current repo baseline for `CompletionProofBundle`, accepted contract target shape, server-side validation spec, dependency mapping from/to parent, reviewer checklist, and closeout commands.
- Out of scope: 實際修改 `packages/contracts/src/index.ts`、`owned-mobility.service.ts` 或任何測試 fixture；不做 driver-app 端 proof assembly（那是 `GAP-P2S2-001` 的責任）；不改 L1/L2 canonical truth；不引入或恢復 `GAP-P2S2-009` 類型的媒體 upload 依賴。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、accepted consensus packet 與目前 repo 掃描為準：

- 父任務 `GAP-P2S2-001-CONTRACTS` 在 machine truth 中目前是 `backlog`，Owner=`Codex`，無 formal upstream deps。
- 本 sidecar `GAP-P2S2-001-CONTRACTS-SIDECAR-ACCEPTANCE` 在目前 shared L0 task row 中是 `status=review`，Owner=`Claude`，Reviewer=`Codex`，artifact path=`support/sidecars/GAP-P2S2-001-CONTRACTS/GAP-P2S2-001-CONTRACTS-SIDECAR-ACCEPTANCE.md`；handoff queue 中已有 `Claude -> Codex` 的待處理 review handoff（`2026-04-17T16:15:16Z`）。
- 接受的 consensus packet (`gap-phase2-planning-20260417`) 明確：
  - 取消獨立 `GAP-P2S2-009`（media upload 任務），改為 base64 inline 路線。
  - 將此 contracts 微調（`photoIds` → `photos: string[]`）獨立為 `GAP-P2S2-001-CONTRACTS`（Sprint 2 P0 前置依賴）。
  - `review-round-3.md:68-88` 確認 base64 方案可行（每張 <512KB client-side 壓縮），並提出合約目標型別。
  - `review-round-4.md:59-63` 補充 server-side 驗證規格：每張 base64 length < `600 * 1024 * 1.33`（等效 <600KB binary 壓縮後），最多 5 張。

### Repo Baseline Anchors

- [`packages/contracts/src/index.ts:467-477`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:467) — 目前 `CompletionProofBundle` 定義：

  ```typescript
  export interface CompletionExpenseItem {
    type: string;
    amountMinor: number;
    attachmentId: string; // ID reference — NOT changed by this task
  }

  export interface CompletionProofBundle {
    photoIds: string[]; // ← 待更名為 photos: string[]
    signatureId?: string | null;
    expenseItems?: CompletionExpenseItem[];
  }
  ```

- [`packages/contracts/src/index.ts:609-614`](/home/edna/workspace/drts-fleet-platform/packages/contracts/src/index.ts:609) — `DriverCompleteTaskCommand.proof?: CompletionProofBundle`：合約型別存在，payload 欄位名稱跟著 `CompletionProofBundle` 變更即完成。

- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1674-1705`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1674) — `completeDriverTask` 目前實作：

  ```typescript
  const proof = {
    photoIds: [...(command.proof?.photoIds ?? [])], // ← 待改為 photos
    signatureId: command.proof?.signatureId ?? null,
    expenseItems: [...(command.proof?.expenseItems ?? [])],
  };
  // ...
  if (proof.photoIds.length < order.proofRequirements.minPhotoCount) {
    // ← 待改為 proof.photos.length
    throw MIN_PHOTO_COUNT_NOT_MET;
  }
  ```

  此外需在 proof 組裝後加入 base64 size/count 驗證（per accepted `review-round-4.md` spec）。

- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:2402-2409`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:2402) — `cloneTask` helper 目前也複製 `photoIds`：

  ```typescript
  proof: task.proof ? {
    photoIds: [...task.proof.photoIds],  // ← 待改為 photos
    ...
  } : null
  ```

- [`tests/e2e/fixtures/e2e-driver-complete.json:1-10`](/home/edna/workspace/drts-fleet-platform/tests/e2e/fixtures/e2e-driver-complete.json:1) — 目前 fixture 使用 `photoIds`:

  ```json
  { "proof": { "photoIds": ["FILE-1001"], "signatureId": "FILE-2001" } }
  ```

  parent task 完成後這個 fixture 需同步更新或新增 base64 payload 版本。

- [`tests/unit/owned-mobility.test.ts:545-553`](/home/edna/workspace/drts-fleet-platform/tests/unit/owned-mobility.test.ts:545) — 單元測試仍使用 `photoIds`，是「現況 baseline」，不是 acceptance 的合法終點。

### Gap Summary

| 問題                                                           | 影響                                                  | 根本原因                         |
| -------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------- |
| `CompletionProofBundle.photoIds` ≠ accepted `photos: string[]` | 下游 `GAP-P2S2-001` app task 無法對正 contract shape  | 本 parent task 尚未實作          |
| `owned-mobility.service.ts` 讀 `photoIds` 欄位                 | 合約改完後 server side 會讀空值，proof gate 失效      | 需要隨合約同步更新               |
| 無 base64 size/count server-side 驗證                          | 照片過大 / 過多時只有 DB row size 作為隱性上限        | 本 parent task 要補上 validation |
| E2E + unit fixtures 仍是 `photoIds`                            | closeout 若只改合約不改測試，測試覆蓋會跑過空值或中斷 | fixtures 需隨 parent task 同步   |

---

## 3) Parent Acceptance Framing

`GAP-P2S2-001-CONTRACTS` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 把 accepted backlog、shared truth 與 repo baseline 展開為 reviewer-facing 驗收項，不新增產品語意。

### AC-1 — Contract type rename must be atomic

- [ ] `packages/contracts/src/index.ts` 的 `CompletionProofBundle.photoIds` 已更名為 `photos: string[]`。
- [ ] 欄位型別仍為 `string[]`（base64 encoded），JSDoc/inline comment 明確標注用途（base64 encoded, max 512KB each）。
- [ ] `CompletionExpenseItem.attachmentId: string` 保持不變 — 這是一個 ID reference，不是 base64 payload，不應被本任務修改。
- [ ] `DriverCompleteTaskCommand.proof?: CompletionProofBundle` 結構本身不需要其他欄位異動，只跟著介面定義更新即可。

### AC-2 — Server-side validator must enforce base64 size + count limits

- [ ] `owned-mobility.service.ts` 的 `completeDriverTask` 在組裝 proof 後，對 `proof.photos` 陣列做以下驗證（per `review-round-4.md:59-63`）：
  - 每張 base64 string 長度 < `600 * 1024 * 1.33`（≈ 819,200 字元），超出時必須回傳明確的 request validation error。
  - 照片總數 <= 5，超出時必須回傳明確的 request validation error。
- [ ] 現有 `MIN_PHOTO_COUNT_NOT_MET` 判斷式改用 `proof.photos.length`（從 `proof.photoIds.length` 更新）。
- [ ] 新加的 size/count 驗證位置在 `minPhotoCount` gate **之前**或之後皆可，但不可省略。
- [ ] 若 parent owner 為上述驗證新增 API error code / message，應沿用既有 NestJS / `ApiRequestError` 慣例，並在 parent closeout 中明確記錄實際採用的名稱；本 sidecar 不預先凍結字串。

### AC-3 — All internal uses of `photoIds` must be updated

- [ ] `owned-mobility.service.ts` 的 `completeDriverTask` 組裝 proof object 時已改為 `photos: [...(command.proof?.photos ?? [])]`。
- [ ] `owned-mobility.service.ts` 的 `cloneTask` helper 已改為 `photos: [...task.proof.photos]`。
- [ ] TypeScript typecheck (`pnpm --filter @drts/api typecheck` 或 `pnpm --filter @drts/contracts typecheck`) 在合約改完後不得出現 `photoIds` 相關型別錯誤。
- [ ] Reviewer 應確認 `photoIds` 在整個 `owned-mobility.service.ts` 及 `packages/contracts/src/index.ts` 中已完全消失（無殘留引用）。

### AC-4 — Test fixtures and unit tests must follow new shape

- [ ] `tests/e2e/fixtures/e2e-driver-complete.json` 已把 `proof.photoIds` 更新為 `proof.photos`（值改為合法 base64 string 或 placeholder）。
- [ ] `tests/unit/owned-mobility.test.ts` 中涉及 `proof.photoIds` 的測試行已同步更新，並補上針對 size/count 超限的 rejection 測試（至少各一條）。
- [ ] 若 parent owner 補上新的 server-side validator 測試，每條測試應斷言實際實作採用的 validation failure shape，並與 parent closeout 記錄一致。

### AC-5 — `GAP-P2S2-009` must NOT be re-introduced

- [ ] Parent closeout 不可再引入「獨立 media upload 任務」或「GCS SDK 依賴」作為隱性前提。
- [ ] 本 contracts task 完成後，直接下游 `GAP-P2S2-001`（app task）應能從 `packages/contracts` 匯入更新後的 `CompletionProofBundle` 並對正 base64 shape，不需要任何額外 infrastructure task。

### AC-6 — Downstream unblock must be verifiable

- [ ] `GAP-P2S2-001` 在 machine truth 中有 formal dep `GAP-P2S2-001-CONTRACTS`；本 parent task 標記為 `done` 後，reviewers 應確認該 dep 可被視為已滿足。
- [ ] Reviewer 確認 contracts package 本身可獨立 build (`pnpm --filter @drts/contracts build` 或 typecheck 通過)，不因此次改動引入新的 build 失敗。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`GAP-P2S2-001-CONTRACTS.depends_on=[]`（無 formal 依賴）。

本任務沒有 formal upstream deps，可在目前 sprint 立即開始。

### Formal Downstream Dependents

| Task           | Type                | What It Needs From This Task                                                                                                                                                      |
| -------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GAP-P2S2-001` | hard downstream dep | `CompletionProofBundle.photos: string[]` 落地後 driver-app 才能對正 payload shape；`owned-mobility.service.ts` 完成 base64 validation 後 server-side gate 才能驗收 base64 payload |

### Practical Review Dependencies

| Dep   | Type                                                       | Why It Matters                                                                                       |
| ----- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| D-P-1 | accepted consensus packet (`gap-phase2-planning-20260417`) | 凍結 base64 inline 方案，取消 `GAP-P2S2-009`，約定 `CompletionProofBundle.photos: string[]` 型別目標 |
| D-P-2 | `review-round-3.md:79-88`                                  | 提供 contract target 型別定義草稿（含 `signatureId` 保留語意）                                       |
| D-P-3 | `review-round-4.md:53-63`                                  | 補充 server-side 驗證規格：`600 * 1024 * 1.33` byte 上限 + max 5 張                                  |
| D-P-4 | current `owned-mobility.service.ts:1674-1705`              | 說明 server-side 有哪三個地方使用 `photoIds`，全部需要更新                                           |
| D-P-5 | existing fixtures & unit tests                             | 說明目前測試仍停在 `photoIds` baseline，closeout 時需全部同步更新                                    |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Accepted planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md:13-14,38-39`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-3.md:68-91`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-4.md:53-63`
- Repo anchors:
  - `packages/contracts/src/index.ts:467-477` (CompletionProofBundle + CompletionExpenseItem)
  - `packages/contracts/src/index.ts:609-614` (DriverCompleteTaskCommand)
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1674-1705` (completeDriverTask)
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:2402-2409` (cloneTask)
  - `tests/e2e/fixtures/e2e-driver-complete.json`
  - `tests/unit/owned-mobility.test.ts:545-553`

---

## 5) Evidence Inventory

| ID   | Evidence                                         | Expected Anchor                                                                 |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                   | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                    |
| E-2  | Accepted base64 inline contract decision         | `consensus-packet.md:13-14` (取消 GAP-P2S2-009 + 確認 photos: string[])         |
| E-3  | Contract target type definition                  | `review-round-3.md:79-88` (proposed `CompletionProofBundle` shape)              |
| E-4  | Server-side size/count validation spec           | `review-round-4.md:59-63` (600KB threshold + max 5 photos)                      |
| E-5  | Current `photoIds` in contract                   | `packages/contracts/src/index.ts:473-474`                                       |
| E-6  | Server-side `photoIds` reads (3 locations)       | `owned-mobility.service.ts:1675, 1696, 2404`                                    |
| E-7  | E2E fixture using `photoIds`                     | `tests/e2e/fixtures/e2e-driver-complete.json:6`                                 |
| E-8  | Unit test using `photoIds`                       | `tests/unit/owned-mobility.test.ts:545-553`                                     |
| E-9  | `CompletionExpenseItem.attachmentId` stays as-is | `packages/contracts/src/index.ts:467-471` (ID reference, not base64)            |
| E-10 | Downstream dependency gate                       | `current-work.md` — `GAP-P2S2-001.depends_on` includes `GAP-P2S2-001-CONTRACTS` |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S2-001-CONTRACTS` 仍是 `backlog`，owner=`Codex`，no formal deps；sidecar 是 owner=`Claude` / reviewer=`Codex` 的 support-only artifact。
2. acceptance framing 是否正確區分「contract rename scope」（`photoIds` → `photos`）與「不在 scope 內的項目」（`CompletionExpenseItem.attachmentId`、driver-app 端 proof assembly、GPS heartbeat）。
3. server-side validation spec（AC-2）的 threshold 是否忠實反映 `review-round-4.md:62` 的 `600 * 1024 * 1.33` 規格，而非套用其他數值。
4. AC-3 是否明確列出 `owned-mobility.service.ts` 的三個 `photoIds` 使用點（`completeDriverTask` 組裝、`minPhotoCount` 判斷、`cloneTask`），確保 parent task 不會遺漏任何一個。
5. AC-5 是否明確禁止重新引入 `GAP-P2S2-009`，確認 accepted consensus 的取消決定被本 packet 傳遞。
6. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S2-001-CONTRACTS acceptance packet ready: machine truth still keeps the parent in backlog with no formal deps, the packet correctly maps the photoIds→photos rename scope, identifies all three server-side uses of photoIds in owned-mobility.service.ts, captures the review-round-4 base64 size/count validation spec (600KB threshold + max 5 photos), explicitly excludes CompletionExpenseItem.attachmentId from the rename scope, prohibits re-introduction of GAP-P2S2-009, and stays within support-only sidecar boundaries.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / contract-scope confusion / server-side spec drift / missing photoIds usage points / support-scope violation]`

---

## 7) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff GAP-P2S2-001-CONTRACTS-SIDECAR-ACCEPTANCE Codex "GAP-P2S2-001-CONTRACTS acceptance packet ready at support/sidecars/GAP-P2S2-001-CONTRACTS/GAP-P2S2-001-CONTRACTS-SIDECAR-ACCEPTANCE.md. It keeps machine truth aligned on parent backlog with no formal deps, maps the photoIds→photos rename scope against the accepted consensus base64 contract, identifies all three owned-mobility.service.ts photoIds usages, captures the review-round-4 server-side validation spec (600KB per-photo threshold + max 5 photos), correctly excludes CompletionExpenseItem.attachmentId from scope, prohibits GAP-P2S2-009 re-introduction, and stays within support-only sidecar boundaries."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S2-001-CONTRACTS-SIDECAR-ACCEPTANCE "GAP-P2S2-001-CONTRACTS acceptance packet ready: machine truth still keeps the parent in backlog with no formal deps, the packet correctly maps the photoIds→photos rename scope, identifies all three server-side uses of photoIds in owned-mobility.service.ts, captures the review-round-4 base64 size/count validation spec (600KB threshold + max 5 photos), explicitly excludes CompletionExpenseItem.attachmentId from the rename scope, prohibits re-introduction of GAP-P2S2-009, and stays within support-only sidecar boundaries."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S2-001-CONTRACTS-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / contract-scope confusion / server-side spec drift / missing photoIds usage points / support-scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Claude`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done GAP-P2S2-001-CONTRACTS-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S2-001-CONTRACTS at support/sidecars/GAP-P2S2-001-CONTRACTS/GAP-P2S2-001-CONTRACTS-SIDECAR-ACCEPTANCE.md. The packet preserves the parent backlog state, maps the photoIds→photos rename scope, identifies all three owned-mobility.service.ts photoIds usages, captures the review-round-4 server-side validation spec, correctly excludes CompletionExpenseItem.attachmentId, and stays within support-only sidecar boundaries."
```

Parent absorption / 主線採納仍由 parent owner `Codex` 視需要決定，不由此 sidecar 自動推進。

---

## 10) Change Log

- 2026-04-17T16:15Z — 初版建立：依 shared L0 truth、accepted `gap-phase2-planning-20260417` consensus（review-round-3 + review-round-4）、以及 repo 掃描，整理 `GAP-P2S2-001-CONTRACTS` 的 acceptance checklist（AC-1 contract rename、AC-2 server-side validation、AC-3 internal updates、AC-4 test fixture alignment、AC-5 no GAP-P2S2-009 re-introduction、AC-6 downstream unblock）、dependency map、repo baseline anchors（3 `photoIds` usages in `owned-mobility.service.ts`、E2E fixture、unit test）、與 reviewer handoff / closeout 指引。
