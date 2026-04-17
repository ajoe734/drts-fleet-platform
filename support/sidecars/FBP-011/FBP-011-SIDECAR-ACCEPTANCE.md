# FBP-011 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `FBP-011` — Finance / billing / reimbursement / filing completion  
**Current Owner:** Codex  
**Assigned Reviewer:** Claude  
**Parent Reviewer At Closeout:** Claude  
**Last Revised:** 2026-04-16 (UTC)  
**Status:** FINALIZED SUPPORT ARTIFACT — parent `FBP-011` is `done`; sidecar closes with `NO_COMMIT_REQUIRED=1`

---

## 1) Scope Boundary (Non-Negotiable)

本 sidecar 僅建立與維護支援性材料。不得修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不得改寫主線契約。

- **In scope:** acceptance checklist、dependency map、evidence inventory、review / owner closeout 指引。
- **Out of scope:** 產品語意調整、核心契約變更、runtime 程式碼修改、或任何 canonical 層直接變更。

---

## 2) Current State Baseline (Machine Truth)

以目前共享狀態與 repo 現況為準（2026-04-16 UTC）：

- 父任務 `FBP-011` 在 `ai-status.json` 中為 `done`，Owner=`Codex`，Reviewer=`Claude`，`depends_on=[]`。
  - task row 的正式 closeout commit 為 `b00b01b`
  - `commit_subject` 為 `feat(FBP-011): complete finance and filing operator flows`
  - `acceptance` 欄位只有以下三條 machine truth：
    - `tenant billing、driver fee、reimbursement、invoice / statement / filing flows 對齊 blueprint breadth`
    - `financial truth 與 artifact lifecycle 維持後端 authority，不出現前端自算真值`
    - `reporting / filing output 與 operator surfaces 能正確對接`
- 本 sidecar `FBP-011-SIDECAR-ACCEPTANCE` 在 `ai-status.json` 中為 `review_approved`，Owner=`Codex`，Reviewer=`Claude`。
  - `2026-04-16T00:24:34Z` reviewer message 已確認：dependency map 對齊 `FBP-011.depends_on=[]`，review-stage machine truth preserved accurately，且 finance-compliance evidence anchors package 正確。
  - 此 helper 僅為 support artifact；owner closeout 必須使用 `NO_COMMIT_REQUIRED=1`，不產生新的 canonical / runtime commit。
- `ai-activity-log.jsonl` 與 `current-work.md` 共同確認：父任務已於 `2026-04-16T00:25:10Z` 正式收尾為 `done`，本 packet 現在只剩 owner 的 no-commit closeout。

### Parent Review / Closeout Chain (Shared Truth)

共享狀態完整保留了 `FBP-011` 從 review-ready 到 finalized closeout 的 reviewer 轉派與核准鏈：

1. `2026-04-15T19:28:45Z` — Codex handoff：回交 parent review，主張已補齊 reimbursement approve/pay、statement lookup/list filters、filing-package list support、shared api-client coverage、platform-admin pricing/payments surface、ops reports filing-package generation/history，並附驗證命令。
2. `2026-04-15T19:28:50Z` — parent reviewer 自動由 `Copilot -> Qwen` 改派，原因是 Copilot 的 `--model claude` 不可用。
3. `2026-04-15T23:08:03Z` — parent reviewer 再由 `Qwen -> Claude` availability-first 改派。
4. `2026-04-15T23:15:54Z` — Claude 對 parent `FBP-011` 給出 `review_approved`：all ACs pass，`@drts/api` + `@drts/platform-admin-web` + `@drts/ops-console-web` typecheck clean，8 unit tests green。
5. `2026-04-16T00:23:21Z` — sidecar reviewer 也由 `Qwen -> Claude` availability-first 改派。
6. `2026-04-16T00:24:34Z` — Claude 對本 sidecar 給出 `review_approved`，並明確記錄 parent 已到 `review_approved`，因此 packet 內的 evidence claims 已獲 substantiation。
7. `2026-04-16T00:25:10Z` — Codex 將 parent `FBP-011` 正式收尾為 `done`，closeout message 鎖定 commit `b00b01b` 與驗證集。

**重要收尾形狀：**

- parent `FBP-011` 的 machine truth 已完成，正式 closeout commit 是 `b00b01b`
- 本 sidecar 不產生新的 code commit，只保留 acceptance framing、dependency map、reviewer chain 與 evidence anchors
- packet 必須同時保留早期 `Copilot -> Qwen` review reassignment 與後續 `Qwen -> Claude` availability reassignment，避免 reviewer lineage 被簡化錯寫

---

## 3) Parent Acceptance Criteria Evaluation

以下三條 acceptance criteria 直接引自 `ai-status.json` -> `FBP-011.acceptance`。

| Parent AC                                                                                              | Verdict | Evidence Anchors                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant billing、driver fee、reimbursement、invoice / statement / filing flows 對齊 blueprint breadth` | PASS    | `apps/api/src/modules/billing-settlement/`, `apps/api/src/modules/reporting-filing/`, `apps/platform-admin-web/app/payments/page.tsx`, `apps/platform-admin-web/app/pricing/page.tsx`, `apps/ops-console-web/app/reports/page.tsx`, `tests/unit/billing-settlement.test.ts`, `tests/unit/reporting-filing.test.ts`                                                                                                                                 |
| `financial truth 與 artifact lifecycle 維持後端 authority，不出現前端自算真值`                         | PASS    | `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`, `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`, `apps/api/src/modules/reporting-filing/reporting-filing.service.ts`, `apps/api/src/modules/reporting-filing/reporting-filing.repository.ts`, `apps/api/src/modules/reporting-filing/download-signing.util.ts`, `tests/unit/billing-settlement.test.ts`, `tests/unit/reporting-filing.test.ts` |
| `reporting / filing output 與 operator surfaces 能正確對接`                                            | PASS    | `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts`, `packages/api-client/src/index.ts`, `apps/ops-console-web/app/reports/page.tsx`, `tests/unit/client-integration.test.ts`, `tests/unit/reporting-filing.test.ts`                                                                                                                                                                                                            |

### Acceptance Closeout Nuance

- 這份 packet 不新增任何 parent acceptance；只把既有三條 machine truth 轉成 reviewer / downstream 可消費的 acceptance framing。
- parent 的 PASS 判定不是來自 sidecar，而是來自：
  - Claude 對 `FBP-011` 的正式 `review_approved`
  - Codex 之後的 `done` closeout
- sidecar 的價值在於把 finance-compliance family 的 evidence anchor 壓縮成 downstream 可直接引用的 support artifact。

---

## 4) Dependency Map (Normative Truth Sources)

### 正式上游依賴（Machine-Enforced）

> **唯一共同真相是 `ai-status.json`。**  
> `FBP-011.depends_on = []`，所以此任務 **沒有正式 upstream dependency**。

| Dep    | Source               | Status | Notes                                                                                     |
| ------ | -------------------- | ------ | ----------------------------------------------------------------------------------------- |
| D-UP-0 | `FBP-011.depends_on` | `[]`   | 不得把 `FBP-008`、`FBP-009`、`WD-006`、`WE-*` 或其他 baseline slice 腦補成 formal blocker |

### Informative Context Baseline（非正式依賴，僅供 reviewer / downstream 理解）

下列內容是 evidence context，但不是 machine-enforced blockers：

| Context                             | Anchor                                                                                          | Why It Matters                                                  |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Parent closeout commit              | `b00b01b`                                                                                       | parent `FBP-011` 的正式 machine-tracked closeout commit         |
| Parent review-ready handoff         | `ai-activity-log.jsonl` @ `2026-04-15T19:28:45Z`                                                | 定義 finance-compliance breadth claims 與 validation set        |
| Parent reviewer approval            | `ai-activity-log.jsonl` @ `2026-04-15T23:15:54Z`                                                | 將三條 parent acceptance 從 claim 提升為 approved fact          |
| Billing authority module            | `apps/api/src/modules/billing-settlement/`                                                      | invoice / statement / reimbursement server authority 所在       |
| Reporting / filing authority module | `apps/api/src/modules/reporting-filing/`                                                        | report jobs / filing packages / signed downloads authority 所在 |
| Platform-admin finance surfaces     | `apps/platform-admin-web/app/pricing/page.tsx`, `apps/platform-admin-web/app/payments/page.tsx` | authoritative operator UI；不應自算 financial truth             |
| Ops reporting surface               | `apps/ops-console-web/app/reports/page.tsx`                                                     | report job / filing package generation/history operator surface |

### 下游 machine dependencies

`FBP-011` 雖無上游依賴，但 machine truth 已明確記錄下游工作需要它：

| Dep    | Task      | Status | Notes                                                                                                                        |
| ------ | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| D-DN-1 | `FBP-012` | `todo` | `FBP-012.depends_on=["FBP-011"]`；public info / placard / regulatory reporting parity 直接接在 finance/filling closeout 之後 |
| D-DN-2 | `FBP-013` | `todo` | `FBP-013.depends_on` 包含 `FBP-011`；rollout evidence closeout 需要 finance / filing family frozen evidence                  |

### Reviewer / Consumer Guardrail

- 不要把同波次已完成工作寫成 `FBP-011` 的 formal upstream deps。
- 不要因為 parent 已 `done` 就省略 review lineage；`Copilot -> Qwen -> Claude` 的 reviewer 演進是 shared truth 的一部分。

---

## 5) Artifact Map & Evidence Inventory

### Parent Task Artifact Map

| Surface                    | Path                                            | Evidence Role                                                                               |
| -------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Billing / settlement API   | `apps/api/src/modules/billing-settlement/`      | tenant billing profile、invoice、driver fee plan、driver statement、reimbursement authority |
| Reporting / filing API     | `apps/api/src/modules/reporting-filing/`        | report jobs、dispatch-recording export、filing package generation / listing / fetch         |
| Shared API client          | `packages/api-client/src/index.ts`              | typed client parity for fee plans / statements / reimbursements / reports / filing packages |
| Platform-admin pricing UI  | `apps/platform-admin-web/app/pricing/page.tsx`  | draft pricing + published driver fee plan operator surface                                  |
| Platform-admin payments UI | `apps/platform-admin-web/app/payments/page.tsx` | invoice / statement / reimbursement operator surface                                        |
| Ops reports UI             | `apps/ops-console-web/app/reports/page.tsx`     | report job + filing package generation/history surface                                      |
| Billing lifecycle tests    | `tests/unit/billing-settlement.test.ts`         | invoice / statement / reimbursement lifecycle evidence                                      |
| Reporting lifecycle tests  | `tests/unit/reporting-filing.test.ts`           | report-job / filing-package immutability and artifact evidence                              |
| Client list-envelope tests | `tests/unit/client-integration.test.ts`         | shared client unwrapping for finance/reporting list endpoints                               |

### Evidence Inventory

| #    | Evidence Item                   | Anchor                                                                                                                                                                                                        | Notes                                                                                                                                                                                                                                                                     |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-1  | Parent task machine state       | `ai-status.json` -> `FBP-011`                                                                                                                                                                                 | `done`, owner `Codex`, reviewer `Claude`, `commit_hash=b00b01b`, `depends_on=[]`                                                                                                                                                                                          |
| E-2  | Parent review-ready handoff     | `ai-activity-log.jsonl` @ `2026-04-15T19:28:45Z`                                                                                                                                                              | records breadth claims and full validation command set                                                                                                                                                                                                                    |
| E-3  | Parent reviewer lineage         | `ai-activity-log.jsonl` @ `2026-04-15T19:28:50Z` and `2026-04-15T23:08:03Z`                                                                                                                                   | preserves `Copilot -> Qwen -> Claude` reviewer reassignment chain                                                                                                                                                                                                         |
| E-4  | Parent approval message         | `ai-activity-log.jsonl` @ `2026-04-15T23:15:54Z`                                                                                                                                                              | states all ACs pass, typecheck clean, and 8 unit tests green                                                                                                                                                                                                              |
| E-5  | Parent closeout message         | `ai-activity-log.jsonl` @ `2026-04-16T00:25:10Z`                                                                                                                                                              | locks `b00b01b` as machine-tracked closeout commit                                                                                                                                                                                                                        |
| E-6  | Sidecar machine state           | `ai-status.json` -> `FBP-011-SIDECAR-ACCEPTANCE`                                                                                                                                                              | `review_approved`, owner `Codex`, reviewer `Claude`                                                                                                                                                                                                                       |
| E-7  | Sidecar reviewer lineage        | `ai-activity-log.jsonl` @ `2026-04-16T00:23:21Z`                                                                                                                                                              | preserves sidecar reviewer reassignment `Qwen -> Claude`                                                                                                                                                                                                                  |
| E-8  | Billing controller endpoints    | `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`                                                                                                                                    | tenant billing profile, invoice generation/list/get, fee-plan publish/list, driver statement generation/list/get, reimbursement list/get/approve/pay                                                                                                                      |
| E-9  | Reporting controller endpoints  | `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts`                                                                                                                                        | report job create/list/get and filing package generate/list/get, including tenant-prefixed report routes                                                                                                                                                                  |
| E-10 | Billing backend authority       | `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`, `apps/api/src/modules/billing-settlement/billing-settlement.repository.ts`                                                           | fee-plan immutability, statement/reimbursement lifecycle, persisted billing truth                                                                                                                                                                                         |
| E-11 | Reporting backend authority     | `apps/api/src/modules/reporting-filing/reporting-filing.service.ts`, `apps/api/src/modules/reporting-filing/reporting-filing.repository.ts`, `apps/api/src/modules/reporting-filing/download-signing.util.ts` | immutable filing package / report artifacts, signed download metadata, persisted reporting truth                                                                                                                                                                          |
| E-12 | Platform-admin pricing surface  | `apps/platform-admin-web/app/pricing/page.tsx`                                                                                                                                                                | UI creates draft pricing rules and publishes authoritative driver fee plans through client methods, not local settlement math                                                                                                                                             |
| E-13 | Platform-admin payments surface | `apps/platform-admin-web/app/payments/page.tsx`                                                                                                                                                               | UI loads invoices/statements/reimbursements and triggers generate / approve / pay via API client                                                                                                                                                                          |
| E-14 | Ops reporting surface           | `apps/ops-console-web/app/reports/page.tsx`                                                                                                                                                                   | UI loads report jobs + filing packages, submits create-report / generate-filing actions, and renders artifact history                                                                                                                                                     |
| E-15 | Shared client parity            | `packages/api-client/src/index.ts`                                                                                                                                                                            | includes `listDriverFeePlans`, `publishDriverFeePlan`, `listDriverStatements`, `getDriverStatement`, `listReimbursementBatches`, `approveReimbursementBatch`, `markReimbursementPaid`, `createReportJob`, `listReportJobs`, `generateFilingPackage`, `listFilingPackages` |
| E-16 | Billing lifecycle tests         | `tests/unit/billing-settlement.test.ts`                                                                                                                                                                       | verifies signed invoice artifacts, immutable fee plan versioning, driver statement generation, reimbursement approve/pay and payout-status propagation                                                                                                                    |
| E-17 | Reporting lifecycle tests       | `tests/unit/reporting-filing.test.ts`                                                                                                                                                                         | verifies immutable filing package manifest/hash + signed download metadata and dispatch recording index export with missing-recording flags                                                                                                                               |
| E-18 | Client envelope tests           | `tests/unit/client-integration.test.ts`                                                                                                                                                                       | verifies list-envelope unwrapping for `/api/reports/jobs`, `/api/driver-statements`, `/api/driver-fee-plans`, `/api/reimbursements`, `/api/filing-packages`                                                                                                               |

---

## 6) Sidecar Acceptance Criteria

### AC-S1 — 僅建立 / 更新 support artifact，未改 canonical truth

- [x] 本 helper 的輸出限於 `support/sidecars/FBP-011/FBP-011-SIDECAR-ACCEPTANCE.md`
- [x] 未修改任何 L1 canonical truth、核心 runtime / contract / registry / governance 檔案
- [x] 未改寫 parent task 的 machine truth，只引用現有 `ai-status.json` / `current-work.md` / `ai-activity-log.jsonl`

### AC-S2 — Packet 對齊目前 machine truth 與 finalized parent closeout chain

- [x] 直接採用 `FBP-011.acceptance` 的三條 parent acceptance，未擅自增刪
- [x] 明確標示 parent task 已是 `done`，正式 closeout commit 為 `b00b01b`
- [x] formal dependency map 嚴格對齊 `FBP-011.depends_on=[]`
- [x] reviewer reassignment chain `Copilot -> Qwen -> Claude` 被保留
- [x] sidecar reviewer reassignment `Qwen -> Claude` 被保留

### AC-S3 — Packet 包含可執行 handoff / review / closeout 指令

- [x] §8 保留 owner -> reviewer handoff 指令
- [x] §9 保留 reviewer approve / reopen 指令
- [x] §10 提供 owner no-commit closeout 指令

---

## 7) Reviewer / Downstream Focus

Claude 已完成 reviewer approval；後續引用此 packet 的人應優先確認：

1. 這份 packet 仍是 support-only，沒有改寫 canonical / runtime truth。
2. dependency map 仍嚴格遵守 `FBP-011.depends_on=[]`。
3. `Copilot -> Qwen -> Claude` 的 reviewer lineage 與 parent `done` closeout chain 都被保留。
4. finance-compliance evidence anchors 是否足以支援 `FBP-012` / `FBP-013` 之後的 rollout-evidence 或 regulatory-reporting downstream work。
5. packet 是否仍然清楚區分 machine truth、approval fact、以及 support-only companion artifact 的角色。

**已記錄的 reviewer approval wording：**

> `FBP-011 acceptance packet ready: dependency map stays aligned with FBP-011.depends_on=[], review-stage machine truth is preserved accurately (including Copilot→Qwen reviewer reassignment chain), and all finance-compliance evidence anchors (billing-settlement controller routes, reporting-filing controller routes, platform-admin payments/pricing surfaces, ops reports surface, typed api-client methods, unit/integration test evidence) are correctly packaged as support-only material. Parent task FBP-011 is now review_approved, confirming the evidence claims in this packet were substantiated.`

---

## 8) Handoff Commands (Historical / Reproducible)

**Owner（Codex）-> Reviewer（Claude）**

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff FBP-011-SIDECAR-ACCEPTANCE Claude "FBP-011 acceptance packet ready in support/sidecars/FBP-011/FBP-011-SIDECAR-ACCEPTANCE.md. It preserves the parent task's 3 finance-compliance acceptance checks, keeps dependency mapping aligned with machine truth (FBP-011.depends_on=[]), and packages the current review-ready evidence across billing-settlement, reporting-filing, platform-admin pricing/payments, and ops reports surfaces. Support artifact only; no canonical truth changes."
```

---

## 9) Reviewer Actions (Historical / Reproducible)

**Reviewer（Claude）-> review_approved**

```bash
AI_NAME=Claude python3 scripts/ai_status.py approve FBP-011-SIDECAR-ACCEPTANCE "FBP-011 acceptance packet ready: dependency map stays aligned with FBP-011.depends_on=[], review-stage machine truth is preserved accurately (including Copilot→Qwen reviewer reassignment chain), and all finance-compliance evidence anchors (billing-settlement controller routes, reporting-filing controller routes, platform-admin payments/pricing surfaces, ops reports surface, typed api-client methods, unit/integration test evidence) are correctly packaged as support-only material. Parent task FBP-011 is now review_approved, confirming the evidence claims in this packet were substantiated."
```

**Reviewer（Claude）-> reopen**

```bash
AI_NAME=Claude python3 scripts/ai_status.py reopen FBP-011-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency-map drift / evidence-anchor error / scope violation]"
```

---

## 10) Owner Closeout Steps

審查通過（`review_approved`）後，由 Owner（Codex）正式收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done FBP-011-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; FBP-011 acceptance packet and dependency map are ready in support/sidecars/FBP-011/ for Claude and downstream rollout-evidence consumers."
```

---

## 11) Notes for Parent Owner / Downstream Consumers

1. 這份 packet 不是新的 reviewer verdict；它只是把已完成的 parent acceptance、dependency map、review lineage 與 evidence anchors 壓縮成 acceptance-oriented support artifact。
2. `FBP-012` 可直接把本 packet 當作 finance / filing family upstream evidence companion，特別是 billing-settlement 與 reporting-filing 的 authority 邊界。
3. `FBP-013` 若要做 rollout evidence closeout，應把這份 acceptance packet 當成 finance-compliance slice 的 frozen support packet，而不是重新回寫 parent machine truth。
4. 若未來有人發現 finance / filing evidence 還有缺口，應 reopen 新的 execution 或 sidecar slice；不要透過改寫本 packet 來覆蓋既有 closeout history。

---

## 12) Change Log

- 2026-04-15 — Codex 建立初版 `FBP-011` acceptance packet，對齊 parent review-stage machine truth、review handoff message、formal dependency graph 與 finance-compliance evidence anchors。
- 2026-04-16 — Codex 依共享 machine truth 更新 packet：同步 parent `done` 狀態與 closeout commit `b00b01b`、補齊 `Copilot -> Qwen -> Claude` reviewer chain 與 sidecar `Qwen -> Claude` reviewer reassignment、並保留 no-commit owner closeout指令。
