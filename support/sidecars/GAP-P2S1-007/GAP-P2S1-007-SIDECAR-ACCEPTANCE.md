# GAP-P2S1-007 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S1-007` — owned-mobility: code comment clarifying enterprise dispatch `minPhotoCount=1` intent  
**Current Sidecar Owner:** `Claude`  
**Assigned Reviewer:** `Codex` (parent owner; reviews sidecar before absorbing into parent closeout)  
**Parent Owner / Reviewer:** `Codex` / `Codex2`  
**Last Revised:** `2026-04-17T12:32Z (UTC)`  
**Status:** `review` (shared L0 now shows owner=`Claude`, reviewer=`Codex`, awaiting reviewer response after handoff)

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S1-007` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作。

- **In scope:** support-only acceptance framing, dependency mapping, repo-scan evidence anchors, intent-clarification baseline, reviewer checklist.
- **Out of scope:** 修改 `owned-mobility.service.ts` 主線 runtime、L1/L2 真相修改、contracts/schema 變更、機器可讀狀態檔直接編修，或以任何方式更動 `minPhotoCount` 預設值。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S1-007` 在 machine truth 中目前是 `in_progress`，Owner=`Codex`，沒有 formal `depends_on` blocker。
- 本 sidecar `GAP-P2S1-007-SIDECAR-ACCEPTANCE` 在目前 shared L0 task row 中是 `status=review`，Owner=`Claude`、Reviewer=`Codex`。
- Planning consensus 對此 task 有完整溯源：
  - `review-round-1.md` Q1 把原始 `GAP-P1-004`（minPhotoCount phase boundary）推進到 P2-S1，並明確結論：**不應該改預設值，而是加 code comment 說明意圖**。改掉預設值會破壞 2 條現有測試 fixture，且會削弱刻意設計的 enterprise 驗證需求。
  - `backlog-proposal.md` row `GAP-P1-004` 確認：fix = 加 code comment + 把 driver app proof bundle delivery (GAP-P2S2-001) 排入後續 sprint，而非改 service 預設值。
  - `consensus-packet.md` 以 XS sizing 收錄，表示唯一實作工件就是 code comment；沒有 migration、沒有 contracts 修改、沒有 route 變更。

### Repo Baseline Anchors

- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:467`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:467) — enterprise dispatch booking 路徑：`minPhotoCount: command.minPhotoCount ?? 1`，預設值 `1` 目前**沒有伴隨任何 code comment**，intent 不顯眼。
- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:208`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:208) — `createOrder`（標準路徑）的 `minPhotoCount: 0`，與 enterprise 路徑對比：無 comment，差異不透明。
- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:71`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:71) — `BOOKING_RULES.enterprise_dispatch`：定義 enterprise booking 的 modifiable/cancelable/confirmation windows，沒有 proofRequirements policy 說明。
- [`tests/unit/owned-mobility.test.ts:258`](/home/edna/workspace/drts-fleet-platform/tests/unit/owned-mobility.test.ts:258) — enterprise dispatch 測試 fixture 顯式帶入 `minPhotoCount: 1`；如果 service 預設被改掉，這條 fixture 仍然會通過，但驗證語意會靜默錯誤。
- [`tests/unit/wire-contract-conformance.test.ts:334`](/home/edna/workspace/drts-fleet-platform/tests/unit/wire-contract-conformance.test.ts:334) — wire conformance 測試 fixture 同樣使用 `minPhotoCount: 1`；改預設值不會讓此 fixture 失敗，但 intent 未見說明。
- [`apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1685`](/home/edna/workspace/drts-fleet-platform/apps/api/src/modules/owned-mobility/owned-mobility.service.ts:1685) — `submitProof()` 驗證 `proof.photoIds.length < order.proofRequirements.minPhotoCount`：伺服器端 proof gate 是真實執行的，不是 dead code，所以 `minPhotoCount=1` 的企業規則是有 enforcement 效力的。

結論：`GAP-P2S1-007` 唯一的實作工件是在 `owned-mobility.service.ts:467`（及可選的 `:208`）附近加入 code comment，解釋 `minPhotoCount ?? 1` 的 enterprise proof requirement 意圖，讓未來維護者不會誤認為 magic number 或 bug 而改掉。

---

## 3) Parent Acceptance Framing

`GAP-P2S1-007` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把 shared truth 與現有 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Code comment 必須出現在正確的位置

- [ ] `owned-mobility.service.ts:467` 附近（`proofRequirements` 物件內或其緊接上方）有 code comment 說明 `minPhotoCount ?? 1` 是**企業派遣 (enterprise dispatch) 刻意要求的預設最低照片數量**，非 magic number。
- [ ] Comment 明確指出預設值 `1` 的業務語意：enterprise 訂單需要司機在完成行程時上傳至少一張完工照，作為費用報銷/合規依據。
- [ ] 若有對比說明（例如與 `createOrder` 路徑的 `minPhotoCount: 0` 差異），則比對邏輯需一致、不互相矛盾。

### AC-2 — 預設值本身不得變更

- [ ] `minPhotoCount: command.minPhotoCount ?? 1` 的 `1` 預設值**不得被改為 `0` 或其他數字**；task 的唯一工件是 comment，不是邏輯修改。
- [ ] 若 PR 引入了任何預設值變更，應被視為 scope drift 並退回。
- [ ] `tests/unit/owned-mobility.test.ts:258` 與 `tests/unit/wire-contract-conformance.test.ts:334` 的現有 fixture 應維持原樣（`minPhotoCount: 1`），不因此 task 而被改動。

### AC-3 — 無 migration / contracts / route 變更

- [ ] 本 task 不引入任何 `packages/contracts` 型別修改。
- [ ] 本 task 不引入任何 DB migration。
- [ ] 本 task 不新增或修改任何 `@Controller` route surface。
- [ ] `BOOKING_RULES` 的 enterprise_dispatch windows 定義不在本 task scope 內。

### AC-4 — Comment 需與 planning consensus 保持一致

- [ ] Comment 語意與 `review-round-1.md` Q1 verdict 一致：enterprise dispatch 刻意要求 proof，正確路徑是 driver app 送出合法 proof bundle（GAP-P2S2-001），而非放寬伺服器端 gate。
- [ ] Comment 不得暗示這是「暫時性」設定或「未來會移除」，因為 consensus 已確認這是長期 enterprise proof policy。
- [ ] Comment 不得混淆 `createOrder`（標準/consumer path，`minPhotoCount=0`）與 `createTenantBooking`（enterprise/tenant path，`minPhotoCount=1`）的業務分野。

---

## 4) Dependency Map

### Formal Dependencies

> 以 machine truth 為準，`GAP-P2S1-007.depends_on=[]`。

| Dep    | Source | Status | Notes                                                                |
| ------ | ------ | ------ | -------------------------------------------------------------------- |
| D-UP-1 | none   | `n/a`  | parent task 沒有 formal blocker；這是單模組內部 comment-only gap-fix |

### Practical Context Dependencies

| Dep     | Type                                        | Why It Matters                                                                            |
| ------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| D-P-1   | Planning consensus (`review-round-1.md` Q1) | 確立 comment-only scope，禁止改預設值                                                     |
| D-P-2   | `backlog-proposal.md` `GAP-P1-004` row      | 確認 implementation shape：code comment + downstream driver-app proof task (GAP-P2S2-001) |
| D-P-3   | Consensus sizing (XS)                       | 預算只夠 code comment，任何 logic change 超出 budget                                      |
| D-P-4   | Enterprise `submitProof()` gate at `:1685`  | 證明 `minPhotoCount` 有實際 enforcement effect，comment 需反映這一點                      |
| D-FWD-1 | `GAP-P2S2-001`                              | Driver app proof bundle delivery 是 downstream，本 task 不 block 也不 include 它          |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Consensus / planning anchors:
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/review-round-1.md` (Q1)
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/backlog-proposal.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/consensus-packet.md`
- Repo anchors:
  - `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` (`:467`, `:208`, `:71`, `:1685`)
  - `tests/unit/owned-mobility.test.ts` (`:258`)
  - `tests/unit/wire-contract-conformance.test.ts` (`:334`)

---

## 5) Evidence Inventory

| ID   | Evidence                                                          | Expected Anchor                                    |
| ---- | ----------------------------------------------------------------- | -------------------------------------------------- |
| E-1  | Parent / sidecar machine state                                    | `ai-status.json`, `current-work.md`                |
| E-2  | minPhotoCount phase boundary verdict                              | `review-round-1.md` Q1                             |
| E-3  | Required implementation shape (comment-only)                      | `backlog-proposal.md` GAP-P1-004 row               |
| E-4  | Consensus sizing XS                                               | `consensus-packet.md` GAP-P2S1-007 row             |
| E-5  | Enterprise dispatch path — unadorned `minPhotoCount ?? 1` default | `owned-mobility.service.ts:467`                    |
| E-6  | Standard order path default `minPhotoCount: 0`                    | `owned-mobility.service.ts:208`                    |
| E-7  | Enterprise booking rules configuration block                      | `owned-mobility.service.ts:71`                     |
| E-8  | Proof gate enforcement exists (server-side validation real)       | `owned-mobility.service.ts:1685–1691`              |
| E-9  | Test fixture with explicit `minPhotoCount: 1`                     | `tests/unit/owned-mobility.test.ts:258`            |
| E-10 | Wire-conformance fixture using `minPhotoCount: 1`                 | `tests/unit/wire-contract-conformance.test.ts:334` |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：`GAP-P2S1-007` parent 是 `in_progress`，沒有 formal blocker；sidecar 目前為 `review`，owner=`Claude`、reviewer=`Codex`。
2. acceptance framing 是否正確鎖定 **comment-only** scope：不允許改預設值、不允許改測試 fixture、不允許引入 contracts / migration / route。
3. AC-1 是否清楚要求 comment 出現在 `:467` 的 `proofRequirements` 物件附近或緊接上方，而非在其他位置留下孤立說明。
4. AC-4 是否與 `review-round-1.md` Q1 verdict 一致：enterprise dispatch 的 `minPhotoCount=1` 是永久性 proof policy，不是暫時 workaround。
5. E-8（`submitProof` gate）是否被正確引用為「proof gate 有實際執行效力」的證據，讓 comment 的說明有 runtime 依據。
6. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S1-007 acceptance packet ready: machine truth shows parent in_progress with no formal blockers, sidecar scope is correctly locked to comment-only at service.ts:467, AC checklist correctly prohibits default-value change, preserves existing test fixtures, and forbids any contracts/migration/route scope drift, aligns with review-round-1 Q1 verdict that enterprise minPhotoCount=1 is intentional proof policy, and stays within support-only sidecar boundaries without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / scope drift / wrong target location / AC logic that allows default-value change / overclaimed verification]`

---

## 7) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex`）：

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff GAP-P2S1-007-SIDECAR-ACCEPTANCE Codex "GAP-P2S1-007 acceptance packet ready at support/sidecars/GAP-P2S1-007/GAP-P2S1-007-SIDECAR-ACCEPTANCE.md. It keeps machine truth aligned on parent in_progress with no formal blockers, locks sidecar scope to comment-only at owned-mobility.service.ts:467, frames the gap as an undocumented enterprise proof requirement (minPhotoCount=1 default), preserves the review-round-1 Q1 verdict that the default must not change, and provides a reviewer-usable checklist without changing canonical truth."
```

---

## 8) Reviewer Actions

Reviewer（`Codex`）核准：

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve GAP-P2S1-007-SIDECAR-ACCEPTANCE "GAP-P2S1-007 acceptance packet ready: machine truth keeps parent in_progress with no formal blockers, sidecar correctly locks scope to comment-only at service.ts:467, AC checklist correctly prohibits default-value change and test-fixture modification, aligns with review-round-1 Q1 verdict on enterprise proof policy, and stays within support-only sidecar boundaries."
```

Reviewer（`Codex`）退回：

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen GAP-P2S1-007-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / scope drift / wrong target location / AC logic that allows default-value change / overclaimed verification]"
```

---

## 9) Owner Closeout

此 sidecar 進入 `review_approved` 後，由 owner（`Claude`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done GAP-P2S1-007-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S1-007 at support/sidecars/GAP-P2S1-007/GAP-P2S1-007-SIDECAR-ACCEPTANCE.md. The packet preserves the enterprise dispatch minPhotoCount=1 intent baseline, the comment-only scope, and the reviewer handoff path without changing canonical truth."
```

---

## 10) Change Log

- 2026-04-17T12:32Z — metadata refresh：將 header 與 current-state 敘述對齊 shared L0 最新 machine truth（parent reviewer=`Codex2`、sidecar status=`review`、reviewer=`Codex`）。
- 2026-04-17T12:30Z — 初版建立：依共享 machine truth、consensus docs (`review-round-1.md` Q1、`backlog-proposal.md`、`consensus-packet.md`) 與 repo 掃描 (`owned-mobility.service.ts:467`、`:208`、`:1685`；test fixtures)，整理 `GAP-P2S1-007` 的 acceptance checklist、dependency map、enterprise-dispatch proof-requirement baseline、以及 reviewer handoff 指引。
