# FBP-008 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `FBP-008` — Platform Admin blueprint completion  
**Current Owner:** Codex  
**Assigned Reviewer:** Claude  
**Last Revised:** 2026-04-16 (UTC)  
**Status:** REVIEW APPROVED — ready for owner closeout

---

## 1) Scope Boundary (Non-Negotiable)

本 sidecar 僅建立與維護支援性材料。不得修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不得改寫主線契約。

- **In scope:** acceptance checklist、dependency map、evidence inventory、reviewer / owner handoff 指引。
- **Out of scope:** 產品語意調整、核心契約變更、runtime 程式碼修改，或任何 canonical 層直接變更。

---

## 2) Current State Baseline (Machine Truth)

以目前共享狀態與 repo 現況為準（2026-04-16 UTC）：

- 父任務 `FBP-008` 在 `ai-status.json` 中為 `done`，Owner=`Codex`，Reviewer=`Claude`，`depends_on=[]`。
  - task row 記錄的正式 closeout commit 為 `61547cc`
  - `acceptance` 欄位只有以下三條 machine truth：
    - `Platform Admin 主要 surface 與 PRD breadth 對齊`
    - `對應 control-plane authority 與 API parity 補齊，不再是 UI 有 route 但 authority 薄弱`
    - `RBAC、audit、error envelope 與 contracts 一致`
- 本 sidecar `FBP-008-SIDECAR-ACCEPTANCE` 目前在 `ai-status.json` 中為 `review_approved`，Owner=`Codex`，Reviewer=`Claude`。
  - `2026-04-15T23:18:36Z` 的 reviewer 訊息已明確確認：dependency map 對齊 machine truth（無正式 upstream deps），`61547cc + 2573c07` split evidence chain 保存正確，且三條 parent AC 均有檔案錨點。
  - 此 helper 只有 support artifact，owner closeout 應使用 `NO_COMMIT_REQUIRED=1`，不產生新的 canonical / runtime commit。
- 伴隨 sidecar `FBP-008-SIDECAR-REVIEW` 已在 `done`，review packet 位於 `support/sidecars/FBP-008/FBP-008-SIDECAR-REVIEW.md`，可作為本 acceptance packet 的 companion artifact。

### Parent Review Chain (Shared Truth)

`ai-status.json` handoff records 與 `ai-activity-log.jsonl` 一致保留了下列收尾鏈：

1. `2026-04-15T16:30:07Z` — Claude handoff：`61547cc` 完成首輪 Platform Admin breadth closeout。
2. `2026-04-15T16:47:10Z` — Codex reopen / requested changes：tenant suspend / activate platform-admin mutations 缺 tenant lifecycle audit。
3. `2026-04-15T17:02:29Z` — Codex 回交 Claude：`2573c07` 補齊 tenant create/edit authority、tenant lifecycle audit、pricing draft->publish old/new audit、audit UI old/new values。
4. `2026-04-15T17:05:07Z` — Claude review approved：明確確認三條 parent acceptance 全數成立。
5. `2026-04-15T17:06:09Z` — Codex 將 parent task 正式收尾為 `done`。

**重要證據形狀說明：**

- `FBP-008` 的 machine task row 仍以 `commit_hash=61547cc` 結案。
- 但共享 handoff / activity truth 明確顯示 reviewer-requested follow-up `2573c07` 是正式 approval 前不可缺的補強。
- 本 packet 會保留這個 split evidence chain，但不改寫 parent task row。

---

## 3) Parent Acceptance Criteria Evaluation

以下三條 acceptance criteria 直接引自 `ai-status.json` -> `FBP-008.acceptance`。

| Parent AC                                                                               | Verdict | Evidence Anchors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Platform Admin 主要 surface 與 PRD breadth 對齊`                                       | PASS    | `apps/platform-admin-web/components/admin-nav.tsx` 與 `apps/platform-admin-web/app/page.tsx` 共同列出 `/tenants`, `/users`, `/fleet`, `/switchboard`, `/pricing`, `/payments`, `/health`, `/notices`, `/audit`, `/feature-flags` 等主要 control-plane destinations；`61547cc` handoff 也明確記錄 Notices & Maintenance surface 補齊                                                                                                                                                                                                  |
| `對應 control-plane authority 與 API parity 補齊，不再是 UI 有 route 但 authority 薄弱` | PASS    | `packages/api-client/src/index.ts` 目前有 `listPlatformAdminUsers`, `publishPlatformPricingRule`, `suspendTenant`, `activateTenant` 等 dedicated platform-admin methods；`61547cc` handoff 記錄 12 個 `/api/platform-admin/*` endpoints；parent reviewer approval 明確確認所有主要頁面都已改走 dedicated platform-admin routes                                                                                                                                                                                                       |
| `RBAC、audit、error envelope 與 contracts 一致`                                         | PASS    | `packages/api-client/src/index.ts` 的 `createPlatformAdminClient()` 使用 `x-actor-type=platform_admin` 與 `x-realm=platform`；`apps/api/src/modules/platform-admin/tenants.service.ts` 有 `TENANT_CODE_CONFLICT` 與 tenant lifecycle `oldValuesSummary/newValuesSummary`；`apps/api/src/modules/platform-admin/platform-admin.service.ts` 與 `apps/platform-admin-web/app/audit/page.tsx` 對應 pricing publish + audit old/new evidence；Claude 的 approval handoff 已明確確認 RBAC、audit、ApiRequestError envelope、contracts 一致 |

### Acceptance Closeout Nuance

- 第一輪 `61547cc` 已完成 endpoint / UI / client / contract breadth closure。
- Reviewer reopen 後，`2573c07` 補齊的是 acceptance[3] 與 acceptance[2] 裡最容易漏掉的尾端治理細節：
  - tenant suspend / activate lifecycle audit
  - typed tenant create / edit authority with `enabledModules` and `quotas`
  - pricing draft -> publish workflow with versioned old/new audit
  - audit UI old/new values inspection
- 因此 reviewer 與 owner 的最終收尾其實以 `61547cc + 2573c07` 的合併證據鏈成立。

---

## 4) Dependency Map (Normative Truth Sources)

### 正式上游依賴（Machine-Enforced）

> **唯一共同真相是 `ai-status.json`。**  
> `FBP-008.depends_on = []`，所以本 task **沒有正式 upstream dependency**。

| Dep    | Source               | Status | Notes                                                        |
| ------ | -------------------- | ------ | ------------------------------------------------------------ |
| D-UP-0 | `FBP-008.depends_on` | `[]`   | 不得把任何 baseline task 腦補成 required upstream dependency |

### Informative Context Baseline（非正式依賴，僅供 reviewer/owner 理解）

下列內容可以當成 evidence context，但**不是** machine-enforced blockers：

| Context                     | Anchor                                               | Why It Matters                                                                                    |
| --------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Initial breadth closure     | commit `61547cc`                                     | 建立 12 個 dedicated platform-admin endpoints、UI route rewiring、API client / contracts baseline |
| Review-required follow-up   | commit `2573c07`                                     | 補齊 tenant lifecycle audit、pricing publish audit、audit UI old/new values                       |
| Reviewer evidence companion | `support/sidecars/FBP-008/FBP-008-SIDECAR-REVIEW.md` | 已把 split evidence chain 與 implementation anchors 展開給 Claude                                 |

### 下游 machine dependencies

`FBP-008` 本身雖無上游依賴，但它已被下游 rollout evidence 工作引用：

| Dep    | Task      | Status | Notes                                                                                                        |
| ------ | --------- | ------ | ------------------------------------------------------------------------------------------------------------ |
| D-DN-1 | `FBP-013` | `todo` | `ai-status.json` 明確記錄 `FBP-013.depends_on` 包含 `FBP-008`；本 packet 可供 rollout evidence closeout 使用 |

### Reviewer Guardrail

- 不要把 `WB-*`、`WD-*`、或其他 completed baseline task 寫成 `FBP-008` 的 required upstream deps。
- 也不要把 `FBP-009` / `FBP-011` / `FBP-012` 混成 `FBP-008` 的 formal dependency graph；共享 truth 沒有這樣定義。

---

## 5) Artifact Map & Evidence Inventory

### Parent Task Artifact Map

| Surface            | Path                                   | Evidence Role                                                                                                    |
| ------------------ | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Platform Admin API | `apps/api/src/modules/platform-admin/` | controller / service authority surface，含 users / notices / maintenance-mode / pricing-rules / tenant lifecycle |
| Platform Admin Web | `apps/platform-admin-web/`             | nav breadth、home route cards、pricing、tenants、payments、notices、audit 等 UI evidence                         |
| Shared API client  | `packages/api-client/src/index.ts`     | dedicated platform-admin typed client methods 與 `platform_admin` header posture                                 |
| Shared contracts   | `packages/contracts/src/index.ts`      | typed platform-admin records、tenant settings / quota shapes、audit old/new support fields                       |

### Evidence Inventory

| #    | Evidence Item                  | Anchor                                                                                                                                                                              | Notes                                                                                                                    |
| ---- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| E-1  | Parent task machine state      | `ai-status.json` -> `FBP-008`                                                                                                                                                       | `done`, owner `Codex`, reviewer `Claude`, `commit_hash=61547cc`, `depends_on=[]`                                         |
| E-2  | Parent approval message        | `ai-status.json` handoffs / `ai-activity-log.jsonl`                                                                                                                                 | Claude approval explicitly says all 3 acceptance criteria met and owner may mark done                                    |
| E-3  | Reopen reason                  | `ai-status.json` handoffs                                                                                                                                                           | reviewer requested tenant suspend / activate lifecycle audit before approval                                             |
| E-4  | Follow-up review-ready message | `ai-status.json` handoffs                                                                                                                                                           | `2573c07` closes remaining P1 gates and records verification commands                                                    |
| E-5  | Dedicated API client authority | `packages/api-client/src/index.ts`                                                                                                                                                  | `listPlatformAdminUsers`, `publishPlatformPricingRule`, `suspendTenant`, `activateTenant`, `createPlatformAdminClient()` |
| E-6  | Platform-admin realm posture   | `packages/api-client/src/index.ts`                                                                                                                                                  | `x-actor-type=platform_admin`, `x-realm=platform`                                                                        |
| E-7  | Surface breadth                | `apps/platform-admin-web/components/admin-nav.tsx`, `apps/platform-admin-web/app/page.tsx`                                                                                          | main control-plane route family is visible in UI shell                                                                   |
| E-8  | Tenant lifecycle audit         | `apps/api/src/modules/platform-admin/tenants.controller.ts`, `apps/api/src/modules/platform-admin/tenants.service.ts`                                                               | suspend / activate endpoints plus audit summaries and `TENANT_CODE_CONFLICT` guard                                       |
| E-9  | Pricing publish audit          | `apps/api/src/modules/platform-admin/platform-admin.controller.ts`, `apps/api/src/modules/platform-admin/platform-admin.service.ts`, `apps/platform-admin-web/app/pricing/page.tsx` | draft -> publish workflow plus old/new audit evidence                                                                    |
| E-10 | Audit UI old/new values        | `apps/platform-admin-web/app/audit/page.tsx`                                                                                                                                        | UI reads and renders `oldValuesSummary` / `newValuesSummary`                                                             |
| E-11 | Reviewer companion packet      | `support/sidecars/FBP-008/FBP-008-SIDECAR-REVIEW.md`                                                                                                                                | preserves split evidence chain without mutating machine truth                                                            |

---

## 6) Sidecar Acceptance Criteria

### AC-S1 — 僅建立 / 更新 support artifact，未改 canonical truth

- [x] 本 helper 的輸出限於 `support/sidecars/FBP-008/FBP-008-SIDECAR-ACCEPTANCE.md`
- [x] 未修改任何 L1 canonical truth、核心 runtime / contract / registry / governance 檔案
- [x] 未改寫 parent task 的 machine truth，只引用現有 `ai-status.json` / `current-work.md` / `ai-activity-log.jsonl`

### AC-S2 — Packet 對齊目前 machine truth 與 parent closeout evidence

- [x] 直接採用 `FBP-008.acceptance` 三條 parent acceptance，沒有自增 / 自刪條件
- [x] 正式 dependency map 只引用 `FBP-008.depends_on=[]`
- [x] split evidence chain (`61547cc` + `2573c07`) 有被保存，但沒有擅自改 parent `commit_hash`
- [x] evidence anchors 對應目前 repo 實際存在的檔案與 review packet

### AC-S3 — Packet 包含可執行 handoff / review / closeout 指令

- [x] §8 提供 owner -> reviewer handoff 指令
- [x] §9 提供 reviewer approve / reopen 指令
- [x] §10 提供 owner closeout 指令

---

## 7) Reviewer Focus (Claude)

Claude 審查此 sidecar 時，應優先確認：

1. 這份 packet 是否仍是 support-only，沒有改寫 canonical / runtime truth。
2. dependency map 是否嚴格遵守 `FBP-008.depends_on=[]`，沒有憑 codebase baseline 發明 formal upstream deps。
3. packet 是否正確保留 `61547cc` 與 `2573c07` 的 split evidence chain。
4. parent acceptance[1]-[3] 的 PASS 判斷是否都能對應到共享 truth 與目前檔案錨點。
5. sidecar machine state 是否正確反映目前真相：Claude 的 reviewer approval 已記錄為 `review_approved`，owner 現在只需做 no-commit closeout。

**建議核准用語：**

> `FBP-008 acceptance packet ready: dependency map stays aligned with machine truth (no formal upstream deps), split evidence chain 61547cc + 2573c07 is preserved accurately, and support-only scope is confirmed.`

**建議退回用語：**

> `packet needs revision: [specify dependency-map drift / split-evidence mismatch / machine-state mismatch / scope violation]`

---

## 8) Handoff Commands (Executable)

**Owner（Codex）-> Reviewer（Claude）**

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff FBP-008-SIDECAR-ACCEPTANCE Claude "FBP-008 acceptance packet ready in support/sidecars/FBP-008/FBP-008-SIDECAR-ACCEPTANCE.md. It preserves the parent task's 3 acceptance checks, keeps dependency mapping aligned with machine truth (FBP-008.depends_on=[]), and records the split closeout evidence across 61547cc plus reviewer-required follow-up 2573c07. Support artifact only; no canonical truth changes."
```

---

## 9) Reviewer Actions (Executable)

**Reviewer（Claude）-> review_approved**

```bash
AI_NAME=Claude python3 scripts/ai_status.py approve FBP-008-SIDECAR-ACCEPTANCE "FBP-008 acceptance packet ready: dependency map stays aligned with machine truth (no formal upstream deps), split evidence chain 61547cc + 2573c07 is preserved accurately, and support-only scope is confirmed."
```

**Reviewer（Claude）-> reopen**

```bash
AI_NAME=Claude python3 scripts/ai_status.py reopen FBP-008-SIDECAR-ACCEPTANCE "packet needs revision: [specify dependency-map drift / split-evidence mismatch / machine-state mismatch / scope violation]"
```

---

## 10) Owner Closeout Steps

審查通過（`review_approved`）後，由 Owner（Codex）正式收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done FBP-008-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; FBP-008 acceptance packet and dependency map are ready in support/sidecars/FBP-008/ for Claude and downstream rollout-evidence consumers."
```

---

## 11) Notes for Parent Owner / Downstream Consumers

1. 這份 packet 不是新的 reviewer verdict；它只是把已存在的 parent approval 條件、依賴圖與證據錨點整理成 acceptance-oriented handoff artifact。
2. 若後續 `FBP-013` 需要 rollout evidence closeout，應把這份 acceptance packet 與 `FBP-008-SIDECAR-REVIEW.md` 一起引用，因為前者偏 acceptance framing，後者偏 review evidence chain。
3. 若未來有人要追查 `FBP-008` 的「最終 commit 到底是哪一個」，答案必須保持 machine truth nuance：
   - task row closeout commit 是 `61547cc`
   - reviewer-required follow-up evidence 是 `2573c07`
   - approval / done 是基於兩者合併成立，而不是覆寫 task row
