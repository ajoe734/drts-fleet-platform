# FBP-013 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `FBP-013` — staging / smoke / UAT evidence closeout
**Current Owner:** Claude
**Assigned Reviewer:** Codex
**Parent Reviewer At Closeout:** Claude
**Last Revised:** 2026-04-16 (UTC)
**Status:** ACTIVE SUPPORT ARTIFACT — sidecar `FBP-013-SIDECAR-ACCEPTANCE` is in `review`; parent `FBP-013` remains `in_progress` while this packet tracks acceptance framing.

---

## 1) Scope Boundary (Non-Negotiable)

本 sidecar 僅建立與維護支援性材料。不得修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不得改寫主線契約。

- **In scope:** acceptance checklist、dependency map、evidence anchor inventory、review / owner closeout 指引。
- **Out of scope:** 產品語意調整、核心契約變更、runtime 程式碼修改、或任何 canonical 層直接變更。

---

## 2) Current State Baseline (Machine Truth)

以目前共享狀態與 repo 現況為準（2026-04-16 UTC）：

- 父任務 `FBP-013` 在 `ai-status.json` 中為 `in_progress`，Owner=`Qwen`，Reviewer=`Claude`，`depends_on=["FBP-008","FBP-009","FBP-011","FBP-012"]`。
  - task 尚未關閉；本 sidecar 在父任務執行期間平行建立 acceptance framing。
  - `acceptance` 欄位共三條 machine truth：
    1. `staging deploy、smoke、UAT、pilot / production evidence 有實際輸出與 named sign-off`
    2. `manual rollout matrix 與 /api/admin/flags operational gap 被正確處理，不再只是文檔備註`
    3. `每個 major execution family 的 paired verification child 被整合回 final evidence closeout`
- 父任務 owner 已於 `2026-04-16T01:58:48Z` 在 `ai-activity-log.jsonl` 中自動由 `Codex` 改派為 `Qwen`；本 packet 以下敘述均以該最新 machine truth 為準。
- 本 sidecar `FBP-013-SIDECAR-ACCEPTANCE` 在 `ai-status.json` 中為 `review`，Owner=`Claude`，Reviewer=`Codex`。
  - 此 helper 僅為 support artifact；owner closeout 必須使用 `NO_COMMIT_REQUIRED=1`，不產生新的 canonical / runtime commit。

### Pre-existing Infrastructure Baseline

本 sidecar 建立時，以下 Wave E 實作已存在於 repo（非 FBP-013 新增，而是 WE-003/WE-004/WE-005 的 prior work baseline）：

| 既有元件                  | 路徑                                  | Commit             | 狀態   |
| ------------------------- | ------------------------------------- | ------------------ | ------ |
| GCP staging deploy config | `infra/gcp/staging/`                  | `ff015a9` (WE-003) | `done` |
| Smoke test suite          | `tests/smoke/`                        | `9a233d1` (WE-004) | `done` |
| UAT scenario pack         | `docs/04-uat/phase1-uat-scenarios.md` | `5c9cc4d` (WE-005) | `done` |
| UAT execution checklist   | `docs/04-uat/phase1-uat-checklist.md` | `5c9cc4d` (WE-005) | `done` |
| CI pipeline               | `.github/workflows/`                  | `4d7d1bb` (WE-001) | `done` |
| Docker multi-stage builds | `apps/*/Dockerfile`                   | `657a4d3` (WE-002) | `done` |

FBP-013 的任務是**補齊**上述 baseline 的 evidence closeout：提供 staging deploy 實際執行輸出、smoke 實際通過紀錄、UAT 簽核記錄，以及處理遺留的 operational gap（`/api/admin/flags`、manual rollout matrix）。

### Upstream Dependencies (Machine-Enforced — All Done)

| Dep     | Task                                                 | Commit    | Status |
| ------- | ---------------------------------------------------- | --------- | ------ |
| FBP-008 | Platform Admin blueprint completion                  | `61547cc` | `done` |
| FBP-009 | Ops Console Phase 1 completion                       | `71d9fa8` | `done` |
| FBP-011 | Finance / billing / filing completion                | `b00b01b` | `done` |
| FBP-012 | Public Info / Placard / Regulatory report completion | `7f02fe1` | `done` |

所有正式上游依賴已關閉，FBP-013 可安全執行。

---

## 3) Parent Acceptance Criteria Evaluation Framework

以下三條 acceptance criteria 直接引自 `ai-status.json` -> `FBP-013.acceptance`。
本 packet 把每條展開成可驗證的 evidence anchors，供 parent owner（目前為 `Qwen`）在執行與 reviewer handoff 時參考，以及供 Claude（parent reviewer）審查時使用。

---

### AC-1: staging deploy、smoke、UAT、pilot / production evidence 有實際輸出與 named sign-off

**What PASS looks like:**

| Evidence Tier                | Required Artifact                                                                                   | Acceptance Anchor                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Staging deploy evidence      | Cloud Run deploy log 或等效 CI run link，顯示 api / platform-admin-web / ops-console-web 均 healthy | `.github/workflows/deploy-staging.yml` run result or equivalent |
| DB migration evidence        | `migrate-job` 執行成功紀錄，V0001–V0018 全部 applied                                                | `infra/gcp/staging/migrate-job.yaml` run result                 |
| Smoke test output            | `run-smoke-tests.sh` 實際執行輸出（6 test cases pass），或 CI artifact                              | `tests/smoke/` + `scripts/run-smoke-tests.sh`                   |
| UAT execution record         | 至少部分 UAT checklist 項目有執行狀態標記（✅/❌），含 P1 gate 評估                                 | `docs/04-uat/phase1-uat-checklist.md`                           |
| Named sign-off               | 至少一個明確的 Phase 1 rollout sign-off 紀錄，含 signer 身份與日期                                  | `docs/03-runbooks/phase1-rollout.md` 或等效文件                 |
| Pilot / production readiness | 若 pilot 尚未執行，需有明確的「staging-only」gate 聲明與後續 pilot 路線圖                           | FBP-013 rollout runbook 相關章節                                |

**Acceptance Gate:** parent reviewer Claude 確認上述每個 tier 均有具體的實際輸出或明確的 gate decision（non-executed tiers 需有書面說明為何可接受在目前階段跳過）。

---

### AC-2: manual rollout matrix 與 `/api/admin/flags` operational gap 被正確處理，不再只是文檔備註

**Background:**
Wave E 的 WE-003 與 WE-004 建立了 staging deploy scaffold 與 smoke suite，但留有兩個已知 operational gap：

1. **Manual rollout matrix**：服務 rollout 順序（api → web apps）目前以 README 備註方式記錄，尚未自動化成 CI 強制執行的 gate。
2. **`/api/admin/flags` endpoint**：UAT checklist PF-7 與 feature flags 流程依賴此端點，但在 WE-004 review 備註中被標示為「需確認 staging 端點可用性」。

**What PASS looks like:**

| Gap                         | Required Resolution                                                                                                                                                                                              | Evidence Location                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Manual rollout matrix       | 選項 A：GitHub Actions workflow 新增 deploy-order gate（api 健康後才 deploy web apps）；選項 B：runbook 明確記錄手動 gate 決策、責任人與何時可升級為自動化，且 Claude 審查通過此 decision                        | `deploy-staging.yml` 或 `docs/03-runbooks/phase1-rollout.md` |
| `/api/admin/flags` endpoint | 選項 A：端點存在且 smoke/UAT 驗證通過；選項 B：書面確認端點在 Phase 1 範圍內不存在、feature-flags 由 platform-admin 頁面管理（非 REST flag endpoint），且 UAT checklist 中對應項目更新為「not applicable in P1」 | `docs/04-uat/phase1-uat-checklist.md` § feature-flags 相關項 |

**Acceptance Gate:** parent reviewer Claude 確認兩個 gap 均有明確 resolution（實作 or 書面 gate decision），不再只是文檔備註。

---

### AC-3: 每個 major execution family 的 paired verification child 被整合回 final evidence closeout

**Background:**
FBP-005 至 FBP-012 每個 major family 均有對應的 sidecar acceptance / review packet（參見 §4 complete map）。FBP-013 需要把這些 paired verification artifacts 整合進 final evidence closeout，確保 rollout evidence 不只依賴父任務的 commit hash，還有對應的 sidecar acceptance framing。

**What PASS looks like:**

| Major Family           | Paired Verification Sidecar                                                       | Status at FBP-013 Closeout                    |
| ---------------------- | --------------------------------------------------------------------------------- | --------------------------------------------- |
| FBP-005 BFF parity     | `FBP-005-SIDECAR-BFF-HANDOFF`                                                     | `done` — commit `78cb874` acceptance anchored |
| FBP-006 cutover        | `FBP-006-SIDECAR-BFF-HANDOFF`                                                     | `done` — commit `ddfc087` acceptance anchored |
| FBP-007 retirement     | `FBP-007-SIDECAR-ACCEPTANCE`                                                      | `done` — commit `3ef9079` acceptance anchored |
| FBP-008 platform admin | `FBP-008-SIDECAR-ACCEPTANCE` + `FBP-008-SIDECAR-REVIEW`                           | `done` — commit `61547cc` acceptance anchored |
| FBP-009 ops console    | `FBP-009-SIDECAR-ACCEPTANCE`                                                      | `done` — commit `71d9fa8` acceptance anchored |
| FBP-010 callcenter     | `FBP-010-SIDECAR-ACCEPTANCE` + `FBP-010-SIDECAR-REVIEW`                           | `done` — commit `1d5ed4f` acceptance anchored |
| FBP-011 finance        | `FBP-011-SIDECAR-ACCEPTANCE` + `FBP-011-SIDECAR-REVIEW`                           | `done` — commit `b00b01b` acceptance anchored |
| FBP-012 public info    | `FBP-012-SIDECAR-ACCEPTANCE` + `FBP-012-SIDECAR-REVIEW`                           | `done` — commit `7f02fe1` acceptance anchored |
| Wave E baseline        | `WE-002-SIDECAR-ACCEPTANCE`, `WE-004-SIDECAR-ACCEPTANCE`, `WE-005-SIDECAR-REVIEW` | `done` — staging/smoke/UAT baselines anchored |

**Acceptance Gate:** parent reviewer Claude 確認 final evidence closeout（runbook 或 evidence summary）有一個明確的 family-to-sidecar cross-reference，讓 FBP-014（integrated E2E）的消費者可以在一個地方找到所有 family 的 acceptance 狀態。

---

## 4) Dependency Map (Normative Truth Sources)

### 正式上游依賴（Machine-Enforced）

> **唯一共同真相是 `ai-status.json`。**
> `FBP-013.depends_on = ["FBP-008","FBP-009","FBP-011","FBP-012"]`

| Dep ID | Task                                                 | Commit    | Status | Notes                                                               |
| ------ | ---------------------------------------------------- | --------- | ------ | ------------------------------------------------------------------- |
| D-UP-1 | `FBP-008` Platform Admin completion                  | `61547cc` | `done` | UI breadth + API authority 對齊                                     |
| D-UP-2 | `FBP-009` Ops Console completion                     | `71d9fa8` | `done` | dashboard/dispatch/revenue/incidents/maintenance/reports 完整       |
| D-UP-3 | `FBP-011` Finance / filing completion                | `b00b01b` | `done` | billing-settlement、reimbursement、reporting-filing operator routes |
| D-UP-4 | `FBP-012` Public Info / Regulatory report completion | `7f02fe1` | `done` | public-info CMS、placard、regulatory report、filing-package         |

**所有正式上游依賴均已關閉。FBP-013 execution 無 machine-enforced blocker。**

### Informative Context Baseline（非正式依賴，僅供 reviewer / downstream 理解）

| Context                      | Anchor              | Why It Matters                                                                     |
| ---------------------------- | ------------------- | ---------------------------------------------------------------------------------- |
| CI pipeline                  | `4d7d1bb` (WE-001)  | GitHub Actions CI；smoke suite 依賴 CI 環境                                        |
| Docker multi-stage builds    | `657a4d3` (WE-002)  | api + 3 web app images；staging deploy 依賴這些 images                             |
| GCP staging deploy scaffold  | `ff015a9` (WE-003)  | Cloud Run service YAMLs、migration job、deploy workflow                            |
| Smoke test suite             | `9a233d1` (WE-004)  | 6 critical-path tests；FBP-013 需要提供實際執行輸出                                |
| UAT scenario pack            | `5c9cc4d` (WE-005)  | 93 scenarios across 4 surfaces；FBP-013 需要推進 checklist 執行狀態                |
| tenant-portal-web retirement | `3ef9079` (FBP-007) | staging service YAML 已標注 RETIRED；smoke / UAT 不對此 service 執行               |
| BFF cutover authority        | `ddfc087` (FBP-006) | tenant-commute-hub 為唯一 tenant UI 入口；smoke/UAT tenant 路徑需走 /api/tenant/\* |

### 下游 machine dependencies

| Dep    | Task                                         | Status | Notes                                                                                       |
| ------ | -------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| D-DN-1 | `FBP-014` integrated cross-surface E2E suite | `todo` | `FBP-014.depends_on` 包含 `FBP-013`；FBP-013 的 rollout evidence closeout 為 FBP-014 的前提 |
| D-DN-2 | `FBP-015` deferred roadmap packet            | `todo` | 間接依賴；`FBP-015.depends_on = [FBP-014]`                                                  |

### Reviewer / Consumer Guardrail

- 不要把 WE-003/WE-004/WE-005 的 Wave E work 算成 FBP-013 的新增 scope；FBP-013 是在此 baseline 上補齊 evidence。
- 不要因為 WE-005 UAT checklist 已存在就跳過實際執行輸出的要求。
- 不要把 AC-2 的 gap resolution 寫成「文件備註等待後續處理」；FBP-013 必須做出明確決策。
- 不要把 retired `tenant-portal-web` 列入 FBP-013 的 smoke / UAT 驗證範圍。

---

## 5) Artifact Map & Evidence Inventory

### Parent Task Artifact Map

| Surface                   | Path                                   | Evidence Role                                                    |
| ------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| GCP staging deploy config | `infra/gcp/staging/`                   | deploy scaffold；FBP-013 需提供 actual deploy execution evidence |
| Smoke test suite          | `tests/smoke/`                         | 6 critical-path tests；FBP-013 需提供 actual run output          |
| Smoke run script          | `scripts/run-smoke-tests.sh`           | smoke runner；FBP-013 需提供 execution log                       |
| UAT scenarios             | `docs/04-uat/phase1-uat-scenarios.md`  | 93 scenarios across 4 surfaces；FBP-013 需推進 checklist         |
| UAT checklist             | `docs/04-uat/phase1-uat-checklist.md`  | 含 PF-1/PF-7 pre-flight checks；FBP-013 需更新執行狀態           |
| Phase 1 rollout runbook   | `docs/03-runbooks/phase1-rollout.md`   | rollout evidence 與 sign-off 的 canonical home                   |
| Deploy workflow           | `.github/workflows/deploy-staging.yml` | AC-2 gap resolution 可能涉及此 workflow                          |

### Evidence Inventory (To Be Populated at Parent Review-Ready)

以下為 evidence checklist，在父任務 `FBP-013` 進入 `review_ready` 前由 parent owner（目前為 `Qwen`）填充具體輸出，供 Claude 做 parent review。

| #    | Evidence Item                                          | Anchor (Placeholder)                             | Status                     |
| ---- | ------------------------------------------------------ | ------------------------------------------------ | -------------------------- |
| E-1  | Parent task machine state                              | `ai-status.json` -> `FBP-013`                    | in_progress                |
| E-2  | Parent review-ready handoff                            | `ai-activity-log.jsonl` @ TBD                    | pending                    |
| E-3  | Parent reviewer approval                               | `ai-activity-log.jsonl` @ TBD                    | pending                    |
| E-4  | Parent closeout commit hash                            | TBD                                              | pending                    |
| E-5  | Staging deploy execution log (CI run link or artifact) | `deploy-staging.yml` run TBD                     | pending                    |
| E-6  | DB migration job execution log (V0001–V0018 applied)   | `migrate-job` run TBD                            | pending                    |
| E-7  | Smoke test execution output (6 cases)                  | `tests/smoke/` run TBD                           | pending                    |
| E-8  | UAT checklist P1 gate status                           | `docs/04-uat/phase1-uat-checklist.md`            | pending (in_progress)      |
| E-9  | Named Phase 1 sign-off record                          | `docs/03-runbooks/phase1-rollout.md`             | pending                    |
| E-10 | Manual rollout matrix gap resolution                   | `deploy-staging.yml` or runbook TBD              | pending                    |
| E-11 | `/api/admin/flags` gap decision                        | `docs/04-uat/phase1-uat-checklist.md` or runbook | pending                    |
| E-12 | Family-to-sidecar cross-reference table                | runbook or evidence summary TBD                  | pending                    |
| E-13 | Wave E sidecar baselines confirmed                     | `support/sidecars/WE-002/`, `WE-004/`, `WE-005/` | baseline exists            |
| E-14 | FBP-005–FBP-012 sidecar baselines confirmed            | `support/sidecars/FBP-005/ … FBP-012/`           | baseline exists (all done) |

---

## 6) Sidecar Acceptance Criteria

### AC-S1 — 僅建立 / 更新 support artifact，未改 canonical truth

- [x] 本 helper 的輸出限於 `support/sidecars/FBP-013/FBP-013-SIDECAR-ACCEPTANCE.md`
- [x] 未修改任何 L1 canonical truth、核心 runtime / contract / registry / governance 檔案
- [x] 未改寫 parent task 的 machine truth，只引用現有 `ai-status.json` / `current-work.md` 狀態

### AC-S2 — Packet 對齊目前 machine truth

- [x] 直接採用 `FBP-013.acceptance` 的三條 parent acceptance，未擅自增刪
- [x] 明確標示 parent task 目前為 `in_progress`，owner 為 `Qwen`
- [x] formal dependency map 嚴格對齊 `FBP-013.depends_on=["FBP-008","FBP-009","FBP-011","FBP-012"]`
- [x] 所有上游依賴均已標注為 `done` with commit hash
- [x] pre-existing Wave E baseline 正確標注，不混淆 FBP-013 的新增 scope

### AC-S3 — Packet 包含可執行 handoff / review / closeout 指令

- [x] §8 保留 owner -> reviewer handoff 指令
- [x] §9 保留 reviewer approve / reopen 指令
- [x] §10 提供 owner no-commit closeout 指令

---

## 7) Reviewer / Downstream Focus

**Codex（sidecar reviewer）**審查重點：

1. 這份 packet 仍是 support-only，確認沒有改寫 canonical / runtime truth。
2. dependency map 嚴格遵守 `FBP-013.depends_on=["FBP-008","FBP-009","FBP-011","FBP-012"]`，且所有上游 commit hash 正確。
3. 三條 parent acceptance 的 evidence anchor framework 是否足以支撐 Claude（parent reviewer）在 FBP-013 進入 `review_ready` 時做出正確的 PASS/FAIL 判定。
4. AC-2 的兩個 gap（manual rollout matrix、`/api/admin/flags`）的 resolution path 是否清晰且可執行，不留給後續 reviewer 模稜兩可的空間。
5. AC-3 的 family-to-sidecar cross-reference map 是否完整覆蓋 FBP-005 至 FBP-012 的所有 paired verification children。
6. downstream consumer（FBP-014 integrated E2E）能否直接引用本 packet 作為 staging evidence 與 rollout closeout 的 acceptance framing companion。

**Claude（parent reviewer at closeout）**審查重點（parent task review-ready 後）：

1. 三條 parent AC 均已 PASS（per §3 framework）。
2. staging deploy + smoke + UAT 均有實際執行輸出或明確的 gate decision。
3. AC-2 兩個 gap 均有書面決策，不再只是 README 備註。
4. AC-3 的 family-to-sidecar cross-reference 已建立，FBP-014 可以直接消費。

---

## 8) Handoff Commands

**Owner（Claude）-> Reviewer（Codex）**

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff FBP-013-SIDECAR-ACCEPTANCE Codex "FBP-013 acceptance packet ready in support/sidecars/FBP-013/FBP-013-SIDECAR-ACCEPTANCE.md. It preserves the parent task's 3 acceptance criteria (staging/smoke/UAT evidence with named sign-off; manual rollout matrix + /api/admin/flags gap resolution; family-to-sidecar cross-reference integration), aligns the dependency map with machine truth (FBP-013.depends_on=[FBP-008,FBP-009,FBP-011,FBP-012] — all done), documents the Wave E baseline vs FBP-013 new evidence scope, and provides the evidence anchor framework for Claude's parent review when Codex marks FBP-013 review-ready. Support artifact only; no canonical truth changes."
```

---

## 9) Reviewer Actions

**Reviewer（Codex）-> review_approved**

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve FBP-013-SIDECAR-ACCEPTANCE "FBP-013 acceptance packet approved: dependency map aligned with FBP-013.depends_on=[FBP-008,FBP-009,FBP-011,FBP-012] (all done with commit hashes), three parent acceptance criteria correctly framed with evidence anchors (staging/smoke/UAT sign-off, manual-rollout+flags gap resolution, family-sidecar cross-reference), Wave E baseline vs FBP-013 new scope clearly distinguished, and downstream consumer (FBP-014) handoff guidance is correct. Support artifact only."
```

**Reviewer（Codex）-> reopen**

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen FBP-013-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency-map drift / evidence-anchor error / scope violation]"
```

---

## 10) Owner Closeout Steps

審查通過（`review_approved`）後，由 Owner（Claude）正式收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done FBP-013-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; FBP-013 acceptance packet and dependency map are ready in support/sidecars/FBP-013/ for the parent execution owner and downstream rollout-evidence consumers."
```

---

## 11) Notes for Parent Owner / Downstream Consumers

1. 這份 packet 是前向性 acceptance framing，不是 parent review verdict；它在 parent `in_progress` 期間預先建立 acceptance 框架，讓 parent owner（Qwen）、sidecar reviewer（Codex）與 Claude 有共同的驗收語言。
2. `FBP-014`（integrated cross-surface E2E）可直接把本 packet 當作 staging evidence 與 rollout closeout 的 upstream acceptance companion，特別是 AC-3 的 family-to-sidecar cross-reference map。
3. AC-2 的 gap resolution 是 FBP-013 的核心難點：parent owner 需要在 rollout runbook 或 deploy workflow 中做出明確的 gate decision，而不是繼續以「可後續補齊」備註帶過。本 sidecar 的 §3 AC-2 提供了兩種合格的 resolution path（實作 or 書面決策），parent owner 選擇任何一種均可。
4. 若 FBP-013 執行中發現 Wave E baseline 有需要修補的 bug（例如 smoke test 腳本在 staging 環境失敗），應由 parent owner 在父任務中補齊，並在本 packet §5 evidence inventory 中填充對應 anchor；不要透過改寫 packet 的 scope boundary 來擴充 sidecar 責任。
5. 本 packet 的 AC-3 cross-reference map（§3 AC-3 表格）列出了截至 2026-04-16 所有已知 FBP-005–FBP-012 sidecar pairs；若後續有新的 sidecar 被加入，parent owner 應在 FBP-013 rollout evidence 文件中同步更新，而非修改本 packet。

---

## 12) Change Log

- 2026-04-16 — Claude 建立初版 `FBP-013` acceptance packet，對齊當時的 parent `in_progress` machine truth、三條 acceptance criteria 的 evidence anchor framework（staging/smoke/UAT sign-off、rollout gap resolution、family-sidecar integration）、Wave E baseline 標注、complete sidecar cross-reference map、以及 owner/reviewer/downstream handoff 指引。
- 2026-04-16 — Codex 依最新 shared truth 做 reviewer-side drift correction：將 parent owner 更新為 `Qwen`、補記 `ai-activity-log.jsonl` 的 auto-reassignment、並將 sidecar 狀態改為 `review`，不變更任何 canonical / runtime scope。
