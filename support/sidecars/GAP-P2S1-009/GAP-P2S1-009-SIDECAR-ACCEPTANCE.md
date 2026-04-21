# GAP-P2S1-009 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S1-009` — billing-settlement: per-tenant store refactor — remove `DEMO_TENANT_ID` hardcode  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2` (also parent owner; decides whether to absorb this packet into parent closeout)  
**Parent Owner / Reviewer:** `Codex2` / `Codex`  
**Last Revised:** `2026-04-17T13:23Z (UTC)`  
**Status:** `handoff_ready` — shared L0 keeps parent `GAP-P2S1-009` at `review_approved` under owner=`Codex2`, reviewer=`Codex`, with finalize handoff pending; this sidecar is support-only and should now be handed to reviewer `Codex2`

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S1-009` 的 acceptance checklist、dependency map、現況基線與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務做正式 `done` closeout。

- In scope: support-only acceptance framing, dependency mapping, shared-truth snapshot, repo-scan evidence anchors, reviewer checklist, and sidecar handoff commands.
- Out of scope: `billing-settlement` runtime/contract/governance 實作修改、L1/L2 真相修改、parent 任務狀態直接定案、或任何未經腳本的 machine-truth 編修。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S1-009` 在 machine truth 中目前是 `review_approved`，Owner=`Codex2`，Reviewer=`Codex`，`last_update=2026-04-17T13:20:16Z`。
- 共享 review 結論已凍結三個重點：
  - `billing-settlement` controller / service / repository 的 billing profile 與 tenant invoice 讀寫已改成 tenant-scoped。
  - tenant billing routes 現在強制要求 `x-tenant-id`。
  - service 端新增 header tenant 與 command tenantId 的一致性防護，避免跨租戶 invoice 操作。
- `current-work.md` 的 handoff queue 目前有一筆 pending `Codex -> Codex2` finalize handoff，建立於 `2026-04-17T13:20:16Z`；這表示 parent 任務正等待 owner `Codex2` 決定是否正式收尾為 `done`。
- 本 sidecar `GAP-P2S1-009-SIDECAR-ACCEPTANCE` 在 shared L0 中目前是 `todo`，Owner=`Codex`，Reviewer=`Codex2`，`last_update=2026-04-17T13:17:45Z`；其 acceptance 只要求建立支援材料、不得修改 canonical truth、並把 packet handoff 給 assigned reviewer。
- `ai-activity-log.jsonl` 顯示本 sidecar 今日只有 dispatch / reassignment churn：
  - `2026-04-17T13:16:37Z` owner `Codex` worker 首次被喚醒。
  - `2026-04-17T13:17:11Z` 該 worker 因更高優先 review/finalize 工作被 superseded。
  - `2026-04-17T13:17:25Z` 到 `2026-04-17T13:17:51Z` 間因 repeated terminal failure 在 `Codex` / `Qwen` 間短暫 reassign，最後回到 `Codex`。
  - `2026-04-17T13:20:17Z` sidecar 再次以 `owned_ready_dispatch` 喚醒 `Codex`；這就是本輪支援工作。
- planning baseline 對 parent `009` 的 root cause 已明確收斂：
  - `backlog-proposal.md` 將其定義為 `BillingSettlementService` 移除 `DEMO_TENANT_ID` 硬編碼 authority，讓 billing profile / invoice operations 依 request tenant scope 執行。
  - `consensus-packet.md` 將其列為 Sprint 1 高優先主線任務之一，與 `GAP-P2S1-010` 一起消除 demo-tenant-only state。
- `docs-site/index.html` 只是協作看板 shell，對本 task 沒有額外產品語意。

### Repo Baseline Anchors

- `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts:33-110` 現在以 `requireTenantId()` 強制 tenant billing profile / invoice routes 取得 `x-tenant-id`，不再從 route surface 默默吃 demo tenant。
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts:141-203` 以 `tenantBillingProfiles` map 與 persisted state hydration 維持 tenant-scoped profile/invoice state，而不是單一 demo tenant bucket。
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts:277-416` 的 `generateTenantInvoice()`、`listTenantInvoices()`、`getTenantInvoice()` 都以傳入 tenantId 作為 authority。
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts:1171-1183` 的 `assertTenantScope()` 會在 header tenant 與 command tenantId 不一致時拋出 `TENANT_SCOPE_MISMATCH`。
- `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts:64-129` 與 `:258-312` 已把 `tenantBillingProfiles` / `tenantInvoices` 納入 load/persist 邏輯，提供 repository-backed tenant persistence。
- `tests/unit/billing-settlement.test.ts:64-135` 已有 tenant billing profile / invoice isolation 與 `TENANT_SCOPE_MISMATCH` 測試。
- `tests/unit/billing-settlement.test.ts:137-173` 另有 persistence-enabled live tenant invoice 測試，證明 tenant-scoped invoice path 會走 repository live query。
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts:41` 的 `DEMO_TENANT_ID` 常數仍存在於 demo seed / default profile helper；因此 parent `009` 的 acceptance 範圍應被理解為「移除 billing profile / invoice authority 對 demo tenant 的依賴」，而不是要求把整個檔案中的 demo seed 常數完全刪空。

結論：parent `009` 的 shared truth 已不是「是否要做 tenant scope」，而是「tenant-scoped billing profile / invoice authority 已經 review approved，等待 parent owner closeout」。本 sidecar 只需把這個結論與證據整理給 `Codex2`。

---

## 3) Parent Acceptance Framing

`GAP-P2S1-009` 在 machine truth 中沒有單獨 `acceptance[]` 欄位；以下 checklist 只把共享真相、review notes 與 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Tenant billing endpoints must stop relying on implicit demo tenant authority

- [ ] `tenant/billing/profile` 與 `tenant/invoices` 相關 controller route 明確要求 `x-tenant-id`。
- [ ] reviewer 能從 route surface 看出 tenant billing read/write 已不再透過 route 層隱含 demo tenant。
- [ ] packet 不得把「檔案仍存在 `DEMO_TENANT_ID` demo seed helper」誤寫成 parent acceptance 失敗，只要 billing authority 已移出 demo tenant hardcode 即符合本 task 範圍。

### AC-2 — Billing profile and tenant invoice state must be tenant-scoped end-to-end

- [ ] service 層以 tenantId 讀寫 billing profile，不再只有單一 demo tenant profile bucket。
- [ ] tenant invoice list/get/generate 都以 tenantId 過濾，不允許跨 tenant 直接讀回他租戶的 invoice。
- [ ] repository hydration / persistChanges 已攜帶 `tenantBillingProfiles` 與 `tenantInvoices`，讓 tenant scope 在 persistence-enabled 路徑也成立。

### AC-3 — Header tenant and command tenant must be consistent

- [ ] `generateTenantInvoice()` 在 `x-tenant-id` 與 `command.tenantId` 不一致時回 `TENANT_SCOPE_MISMATCH`。
- [ ] reviewer 可從 service 邏輯與測試看出這是 cross-tenant guard，而不是單純 validation wording。
- [ ] parent closeout 不得只宣稱「header required」，還要把 mismatch guard 一起列入 acceptance evidence。

### AC-4 — Verification bundle must prove tenant isolation without overclaiming adjacent slices

- [ ] `tests/unit/billing-settlement.test.ts` 已覆蓋 tenant billing profile / invoice isolation、tenant mismatch rejection、以及 persistence-enabled live tenant invoice。
- [ ] shared truth 記錄的驗證 bundle是 `pnpm --filter @drts/api test -- --run tests/unit/billing-settlement.test.ts tests/unit/billing-settlement.service.test.ts` 加上 `pnpm --filter @drts/api typecheck`；packet 應保留這個 bundle，但要區分其中 `billing-settlement.service.test.ts` 也承載 `GAP-P2S1-003` 的 live driver statement evidence。
- [ ] support packet 不得把 parent `009` 誤寫成已完成 `GAP-P2S1-003` 的 driver-statement live-query closeout。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`GAP-P2S1-009.depends_on=[]`。

| Dep    | Source | Status | Notes                           |
| ------ | ------ | ------ | ------------------------------- |
| D-UP-1 | none   | `n/a`  | parent task 沒有 formal blocker |

### Formal Downstream Dependencies

| Dep      | Source         | Status    | Notes                                                                                                                                    |
| -------- | -------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| D-DOWN-1 | `GAP-P2S1-011` | `blocked` | `GAP-P2S1-011` 正式 blocked on `GAP-P2S1-009` + `GAP-P2S1-010`，因此 `009` owner closeout 會影響 downstream test-update slice 的實際解鎖 |

### Practical Review Dependencies

| Dep   | Type                                      | Why It Matters                                                                                                                                         |
| ----- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-P-1 | Parent finalize handoff                   | `Codex -> Codex2` pending finalize handoff 說明 parent 已 review approved，等待 owner 判斷是否正式收尾                                                 |
| D-P-2 | Shared-module overlap with `GAP-P2S1-003` | `current-work.md` 仍記錄 `003` closeout 曾被 `009` 的 overlapping `billing-settlement.*` drift 阻塞；`009` owner closeout 也代表這個模組邊界已趨於穩定 |
| D-P-3 | Consensus root-cause anchor               | `backlog-proposal.md` / `consensus-packet.md` 定義 acceptance 範圍是 billing profile / invoice tenant authority，不是刪除所有 demo seed constants      |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Planning anchors:
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/backlog-proposal.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/consensus-packet.md`
  - `docs/02-architecture/consensus/impl-gap-fix-planning-20260417/review-round-4.md`
- Repo anchors:
  - `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`
  - `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
  - `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`
  - `tests/unit/billing-settlement.test.ts`
  - `tests/unit/billing-settlement.service.test.ts`

---

## 5) Evidence Inventory

| ID   | Evidence                                                      | Expected Anchor                                                         |
| ---- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                                | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`            |
| E-2  | Parent review-approved snapshot and review notes              | `ai-status.json` task entry for `GAP-P2S1-009`                          |
| E-3  | Parent finalize handoff awaiting owner `Codex2`               | `current-work.md` handoff queue entry created at `2026-04-17T13:20:16Z` |
| E-4  | Root-cause / intended scope                                   | `backlog-proposal.md` row for removing billing demo-tenant hardcode     |
| E-5  | Route-level tenant header enforcement                         | `billing-settlement.controller.ts:33-110`                               |
| E-6  | Service-level tenant-scoped profile/invoice authority         | `billing-settlement.service.ts:141-203`, `:277-416`                     |
| E-7  | Header / command mismatch guard                               | `billing-settlement.service.ts:1171-1183`                               |
| E-8  | Repository-backed tenant persistence                          | `billing-settlement.repository.ts:64-129`, `:258-312`                   |
| E-9  | Tenant isolation and mismatch tests                           | `tests/unit/billing-settlement.test.ts:64-173`                          |
| E-10 | Shared verification bundle including overlapping 003 file set | `current-work.md` review note / handoff message for `GAP-P2S1-009`      |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S1-009` 現在是 `review_approved`，不是 `done`；pending finalize handoff 仍要由 `Codex2` 決定是否吸收進主線 closeout。
2. acceptance framing 是否明確鎖定 billing profile / tenant invoice authority 已 tenant-scoped，而不是誤要求刪除所有 demo seed / fallback 常數。
3. packet 是否正確區分 `009` 的 tenant-scoped billing acceptance 與 `003` 的 live driver statement acceptance，避免把共享驗證 bundle 誤寫成 `009` 完成所有 billing-settlement work。
4. downstream impact 是否寫清楚：`GAP-P2S1-011` 仍正式 blocked on `009 + 010`，而 `003` 的現存 blocker 與 `009` 穩定化也有實務關聯。
5. support artifact 是否完全沒有修改 canonical truth、contracts、或 parent runtime。

**建議核准用語：**

> `GAP-P2S1-009 acceptance packet ready: it preserves the parent review_approved snapshot and pending finalize handoff to Codex2, correctly frames the accepted scope as tenant-scoped billing profile and tenant invoice authority rather than wholesale demo-seed removal, captures the x-tenant-id requirement plus TENANT_SCOPE_MISMATCH guard and tenant isolation evidence, and stays within support-only sidecar boundaries without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / acceptance-scope drift / 003-vs-009 evidence mixup / support-scope violation]`

---

## 7) Handoff Command

Owner（`Codex`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff GAP-P2S1-009-SIDECAR-ACCEPTANCE Codex2 "GAP-P2S1-009 acceptance packet ready at support/sidecars/GAP-P2S1-009/GAP-P2S1-009-SIDECAR-ACCEPTANCE.md. It freezes the parent review_approved snapshot, the tenant-scoped billing profile and tenant invoice baseline, the x-tenant-id requirement plus TENANT_SCOPE_MISMATCH guard, and the shared verification bundle without changing canonical truth."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve GAP-P2S1-009-SIDECAR-ACCEPTANCE "GAP-P2S1-009 acceptance packet ready: it preserves the parent review_approved snapshot and pending finalize handoff, correctly scopes acceptance to tenant-scoped billing profile and tenant invoice authority, separates 009 evidence from adjacent 003 driver-statement work, and remains support-only."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen GAP-P2S1-009-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / acceptance-scope drift / 003-vs-009 evidence mixup / support-scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Codex`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done GAP-P2S1-009-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S1-009 at support/sidecars/GAP-P2S1-009/GAP-P2S1-009-SIDECAR-ACCEPTANCE.md. The packet preserves the parent review_approved snapshot, tenant-scoped billing acceptance baseline, and reviewer handoff path without changing canonical truth."
```

Parent absorption / canonical closeout 則仍由 parent owner `Codex2` 依主線任務 `GAP-P2S1-009` 另行決定。

---

## 10) Change Log

- 2026-04-17T13:23Z — 初版建立：依共享 L0 truth、review-approved parent snapshot、consensus root-cause 與 repo 掃描，整理 `GAP-P2S1-009` 的 acceptance checklist、dependency map、tenant-scoped billing evidence、以及 reviewer handoff 指引。
