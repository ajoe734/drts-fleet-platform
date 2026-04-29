# P1PX-BE-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `P1PX-BE-001` — partner registry and eligibility persistence
**Current Sidecar Owner:** `Codex2`
**Assigned Reviewer:** `Codex`
**Parent Owner / Reviewer At Snapshot:** `Codex2` / `Claude`
**Last Revised:** `2026-04-28T15:00:12Z (UTC)`
**Final Status Snapshot:** `done` — shared L0 records sidecar `P1PX-BE-001-SIDECAR-ACCEPTANCE` at owner=`Codex2`, reviewer=`Codex`, no-commit closeout, and `next="Completed the support-only acceptance packet for P1PX-BE-001 after review approval. The packet freezes the durable partner registry and eligibility persistence acceptance framing, evidence map, and downstream dependencies without altering canonical/runtime truth."`

---

## 1) Scope Boundary

本 sidecar 只整理 `P1PX-BE-001` 的 acceptance framing、dependency map、evidence anchors、reviewer guardrails 與 handoff wording，不修改 L1 canonical truth，也不代替 parent task 再做主線實作。

- In scope: support-only acceptance checklist, commit/evidence inventory, current machine-truth freeze, downstream dependency map, reviewer focus points.
- Out of scope: 修改 `packages/contracts` / `apps/api` / `infra/migrations` / tests 的主線內容、重寫 parent machine truth、替 `P1PX-BE-002` 或 `P1PX-BE-003` 先做 implementation、或把這份 packet 當成 canonical contract source。

---

## 2) Current State Baseline

以 `ai-status.json`、task brief、execution packet、parent commit `db06e6f` 與目前 repo baseline 為準：

- parent `P1PX-BE-001` 已是 `done`，Owner=`Codex2`，Reviewer=`Claude`，`last_update=2026-04-28T14:54:35Z`
- parent `next` 已明確記錄 closeout 結論：
  - durable partner-entry and eligibility persistence 已在 commit `db06e6f` 完成
  - contract metadata、repository load/upsert、migration `V0021`、service bootstrap/persistence、reload-path tests 已納入
  - verification 已回報通過：
    - `pnpm --filter @drts/api typecheck`
    - `pnpm test:unit -- tenant-partner-foundation`
    - `pnpm test:unit -- owned-mobility`
- 本 sidecar `P1PX-BE-001-SIDECAR-ACCEPTANCE` 已完成 no-commit closeout，formal acceptance 只有：
  - `Create support artifacts only`
  - `Do not edit canonical truth`
  - `Hand off the packet to the assigned reviewer`

### Parent Delivery Freeze

這份 packet 應保留一個核心事實：`P1PX-BE-001` 不是 backlog 也不是 review，而是已正式 `done` 的 upstream persistence slice。這代表 reviewer 在閱讀這份 packet 時，焦點應該放在 acceptance packet 是否忠實整理既有完成事實與 downstream implications，而不是重新評估 parent implementation 是否還應回到 `in_progress`。

### Repo Evidence Snapshot

- `packages/contracts/src/index.ts:47-66,181-253` 新增 partner auth/eligibility enums 與 partner entry / eligibility verification record contracts。
- `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts:74-98,110-178,235-247` 將 `partnerEntries` 與 `partnerEligibilityVerifications` 納入 repository state/load path。
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:371-475` 在 module init 時載入 persisted partner state；若資料庫為空，才 bootstrap seed entries 到 durable store。
- `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:880-936` 在 eligibility verification 後，立即寫入 durable persistence 與 tenant audit。
- `infra/migrations/V0021__partner_registry_and_eligibility_persistence.sql:1-36` 新增 partner entries / eligibility verifications 兩張表與必要 indexes。
- `tests/unit/tenant-partner-foundation.test.ts:238-280` 覆蓋 partner entries 與 eligibility verifications 在 repository reload 後仍可存活。
- `tests/unit/owned-mobility.test.ts:529-585` 覆蓋 reload 後的 eligibility verification 仍可被 owned-mobility booking 建立流程重用。

---

## 3) Parent Acceptance Framing

`P1PX-BE-001` 的 machine-truth acceptance 只有三條 verification commands。以下 checklist 只把 execution packet 與已落地 evidence 展開成 reviewer-facing framing，不新增新的產品真相。

### AC-1 — Durable partner entry persistence exists

- [x] execution packet 要求 durable schema for partner channel entries。
- [x] `V0021` 已建立 `admin.phase1_partner_channel_entries` 與 tenant/partner indexes。
- [x] repository `TenantPartnerState` 與 `loadState()` 已把 `partnerEntries` 納入 durable authority path。
- [x] service bootstrap 僅在沒有 persisted state 時才把 seed 寫入 store，而不是長期依賴 process-local authority。

### AC-2 — Durable eligibility verification persistence exists

- [x] execution packet 要求 durable schema for partner eligibility verifications。
- [x] `V0021` 已建立 `admin.phase1_partner_eligibility_verifications` 與 entry/tenant indexes。
- [x] service `verifyPartnerEligibility()` 已把 verification record 寫入 persistence，並保存 request/audit metadata。
- [x] eligibility record 包含 verification status, reason code, benefit reference, issuer authorization reference, expiry, request metadata。

### AC-3 — Reload-path behavior is proven, not assumed

- [x] `tests/unit/tenant-partner-foundation.test.ts:238-258` 驗證 partner entries 在 repository reload 後仍存在。
- [x] `tests/unit/tenant-partner-foundation.test.ts:260-299` 驗證 eligibility verifications 在 repository reload 後仍存在。
- [x] `tests/unit/owned-mobility.test.ts:529-585` 驗證 reloaded verification 可以在有效期內被 booking creation 重用。
- [x] parent closeout 已把這些 reload-path tests 明確寫入 machine truth `next`。

### AC-4 — Seed data remains bootstrap-only, not sole authority

- [x] execution packet 要求 seed demo entries 只能作 dev bootstrap，不可繼續作唯一 authority source。
- [x] service `onModuleInit()` 只有在 `loadState()` 回來完全空白時才做 bootstrap persistence。
- [x] persisted partner entries 若已存在，service 會以 persisted data 為主，而非每次重新 seed 覆蓋。

### AC-5 — Existing owned-mobility partner booking flow still works

- [x] execution packet acceptance 要求 existing owned-mobility partner booking tests 仍通過。
- [x] parent machine truth 已記錄 `pnpm test:unit -- owned-mobility` 通過。
- [x] reload-path reuse test 證明 eligibility persistence 不只存在於 foundation module，還能被 downstream booking flow 使用。

---

## 4) Dependency Map

### 4.1 Formal Machine Dependencies

| Dep      | Source                                           | Status    | Why It Matters                                                                    |
| -------- | ------------------------------------------------ | --------- | --------------------------------------------------------------------------------- |
| D-UP-1   | `P1PX-BE-001.depends_on`                         | none      | parent 是直接 productization slice，沒有 formal upstream blocker                  |
| D-DOWN-1 | `P1PX-BE-002.depends_on=["P1PX-BE-001"]`         | `backlog` | partner-authenticated ingress 以這個 durable persistence 作為既有 authority layer |
| D-DOWN-2 | `P1PX-BE-003.depends_on=["P1PX-BE-001"]`         | `backlog` | partner truth carry-through review 依賴 eligibility/entry persistence 已存在      |
| D-DOWN-3 | `P1PX-DOC-001.depends_on` includes `P1PX-BE-001` | `backlog` | blueprint truth sync 最終會吸收這個 slice 的 closeout 敘事與 evidence             |

### 4.2 Practical Review Dependencies

| Dep   | Anchor                                                                                   | Why It Matters                                                           |
| ----- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| D-P-1 | `docs/03-runbooks/phase1-productization-execution-packet-20260428.md:65-113`             | parent objective, write scope, acceptance, verification source           |
| D-P-2 | `ai-status.json:5930-5969`                                                               | parent machine-truth closeout, commit hash, verification, reviewer notes |
| D-P-3 | `packages/contracts/src/index.ts:47-66,181-253`                                          | durable contract layer for partner entry + eligibility records           |
| D-P-4 | `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts:74-98,110-178,235-247` | repository persistence/load integration                                  |
| D-P-5 | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:371-475,880-936`          | bootstrap/load semantics and eligibility persistence write path          |
| D-P-6 | `infra/migrations/V0021__partner_registry_and_eligibility_persistence.sql:1-36`          | database schema + index anchors                                          |
| D-P-7 | `tests/unit/tenant-partner-foundation.test.ts:238-299`                                   | reload-path proof inside foundation service                              |
| D-P-8 | `tests/unit/owned-mobility.test.ts:529-585`                                              | downstream reuse proof inside booking flow                               |

### 4.3 Informative Consumer Map

| Consumer                                          | Status         | Why It Matters                                                                                                                |
| ------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `P1PX-BE-002` owner/reviewer (`Codex` / `Codex2`) | active backlog | next slice should build authenticated ingress on top of persisted partner authority, not reintroduce in-memory shortcuts      |
| `P1PX-BE-003` owner/reviewer (`Codex` / `Claude`) | active backlog | carry-through review should treat eligibility verification as persisted truth available across order/audit/reporting surfaces |
| reviewer `Codex` for this sidecar                 | pending        | needs a crisp packet that freezes what is already done and what remains downstream                                            |

---

## 5) Evidence Inventory

| ID   | Evidence                                                                | Expected Anchor                                                                          |
| ---- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| E-1  | Parent task machine state                                               | `ai-status.json:5930-5969`                                                               |
| E-2  | Sidecar task machine state                                              | `ai-status.json:6176-6199`                                                               |
| E-3  | Parent objective / required work / acceptance / verification            | `docs/03-runbooks/phase1-productization-execution-packet-20260428.md:65-113`             |
| E-4  | Partner contract enums and record types                                 | `packages/contracts/src/index.ts:47-66,181-253`                                          |
| E-5  | Repository state includes partner entries and eligibility verifications | `apps/api/src/modules/tenant-partner/tenant-partner.repository.ts:74-98,110-178,235-247` |
| E-6  | Service bootstraps only when persistence is empty                       | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:390-430`                  |
| E-7  | Service loads persisted state and preserves persisted partner authority | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:433-475`                  |
| E-8  | Eligibility verification persists immediately with audit metadata       | `apps/api/src/modules/tenant-partner/tenant-partner.service.ts:880-936`                  |
| E-9  | Database migration tables and indexes                                   | `infra/migrations/V0021__partner_registry_and_eligibility_persistence.sql:1-36`          |
| E-10 | Foundation reload tests                                                 | `tests/unit/tenant-partner-foundation.test.ts:238-299`                                   |
| E-11 | Owned-mobility reuse test                                               | `tests/unit/owned-mobility.test.ts:529-585`                                              |
| E-12 | Parent closeout commit record                                           | `git show --stat --oneline db06e6f`                                                      |

---

## 6) Reviewer Hotspots (`Codex`)

Reviewer 應優先確認：

1. packet 是否忠實描述 machine truth：parent `P1PX-BE-001` 已是 `done`，sidecar 也已完成 support-only no-commit closeout。
2. packet 是否把 parent 的真正完成邊界講清楚：這張 slice 完成的是 durable persistence、reload-path proof 與 owned-mobility reuse，不是 authenticated ingress hardening。
3. packet 是否清楚標出 downstream dependence：`P1PX-BE-002` 和 `P1PX-BE-003` 應被視為建立在這層 persisted authority 之上，而不是重新定義 authority source。
4. packet 是否維持 sidecar guardrail：只能整理 support artifact，不應改寫 canonical truth 或宣稱自己完成任何新的 runtime behavior。

---

## 7) Sidecar Acceptance Checklist

### AC-S1 — `Create support artifacts only`

- [x] 只新增 `support/sidecars/P1PX-BE-001/P1PX-BE-001-SIDECAR-ACCEPTANCE.md`
- [x] 內容限於 acceptance framing、dependency map、evidence anchors、reviewer guardrails、handoff wording
- [x] 未聲稱已替 parent 再做額外 implementation

### AC-S2 — `Do not edit canonical truth`

- [x] 未修改任何 L1 canonical truth、核心 runtime/registry/governance 實作
- [x] machine truth 僅會透過 `scripts/ai_status.py` 進行 sidecar state transition
- [x] packet 只引用 shared truth、execution packet 與既有 repo evidence

### AC-S3 — `Hand off the packet to the assigned reviewer`

- [x] owner 以 `handoff` 送交 reviewer `Codex`
- [x] reviewer 視 packet 是否準確，再決定 `approve` 或要求修正
- [x] reviewer 通過後，owner 再以 `NO_COMMIT_REQUIRED=1 ... done` 做 no-commit closeout

---

## 8) Historical Handoff / Closeout Commands

Owner handoff to reviewer:

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff P1PX-BE-001-SIDECAR-ACCEPTANCE Codex "P1PX-BE-001 acceptance packet is ready in support/sidecars/P1PX-BE-001/P1PX-BE-001-SIDECAR-ACCEPTANCE.md. It freezes the current machine truth for the already-done persistence slice: parent P1PX-BE-001 closed in commit db06e6f with durable partner-entry and eligibility persistence, V0021 schema support, reload-path tests, and owned-mobility reuse coverage. The packet keeps this helper strictly support-only, maps P1PX-BE-002 and P1PX-BE-003 as downstream consumers, and does not mutate canonical or runtime truth."
```

Reviewer approval if aligned:

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve P1PX-BE-001-SIDECAR-ACCEPTANCE "P1PX-BE-001 acceptance packet is aligned with current machine truth, accurately freezes the done persistence slice, and scopes the sidecar to support-only acceptance/dependency guidance without mutating canonical/runtime truth."
```

Owner no-commit closeout after approval:

```bash
AI_NAME=Codex2 NO_COMMIT_REQUIRED=1 python3 scripts/ai_status.py done P1PX-BE-001-SIDECAR-ACCEPTANCE "Completed the support-only acceptance packet for P1PX-BE-001 after review approval. The packet freezes the durable partner registry and eligibility persistence acceptance framing, evidence map, and downstream dependencies without altering canonical/runtime truth."
```

---

## 9) Change Log

- `2026-04-28T15:09Z` — 初版建立。依 dispatch brief、`AI_COLLABORATION_GUIDE.md`、task brief、`ai-status.json` machine truth、execution packet、parent commit `db06e6f` 與 repo evidence，整理 `P1PX-BE-001` 的 acceptance framing、dependency map、evidence inventory、reviewer hotspots 與 handoff wording。
- `2026-04-28T15:00:12Z` — sidecar 完成 no-commit closeout；本檔保留為 support-only evidence packet，不再代表 active work。
