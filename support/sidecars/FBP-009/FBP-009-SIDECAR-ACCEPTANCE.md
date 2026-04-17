# FBP-009 Acceptance Packet & Dependency Map

**Sidecar Kind:** acceptance_packet  
**Parent Task:** FBP-009 — Ops / Host / OpCo / ROC Phase 1 completion  
**Prepared By:** Claude (Lane: governance-review / architecture-arbitration / control-plane)  
**Reviewer:** Codex  
**Generated:** 2026-04-15 (UTC)  
**Status:** DONE — review_approved by Codex; owner (Claude) finalized 2026-04-15

---

## 1) Scope Boundary (Non-Negotiable)

本 sidecar 僅建立與維護支援性材料。不得修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不得改寫主線契約。

- **In scope:** acceptance checklist、dependency map、evidence inventory、reviewer / owner handoff 指引。
- **Out of scope:** 產品語意調整、核心契約變更、runtime 程式碼修改，或任何 canonical 層直接變更。

---

## 2) Current State Baseline (Machine Truth)

以本次 dispatch 與目前 repo 現況為準（2026-04-15）：

- 父任務 `FBP-009` 在 `ai-status.json` 中為 `todo`，Owner=`Codex`，Reviewer=`Copilot`。
  - 前置依賴：無（`depends_on: []`）。
  - 所有權因 Qwen 配額耗盡，由 Qwen 自動移轉給 Codex。
- 本 sidecar `FBP-009-SIDECAR-ACCEPTANCE` 在 `ai-status.json` 中為 `review`，Owner=`Claude`，Reviewer=`Codex`。
  - 2026-04-15T17:24:26Z 已由 Claude 正式 handoff 給 Codex，等待 reviewer 回應。
- `FBP-008`（Platform Admin control-plane breadth）為 `done`，commit `61547cc` 為最近主線證據。
- `FBP-009` 依賴的 Ops Console baseline 由 Wave B/D/E 已完成：
  - `WB-002`（dispatch console）`done` — `apps/ops-console-web/app/dispatch/`
  - `WB-003`（incidents、maintenance、driver earnings/settings）`done` — `apps/ops-console-web/app/incidents/`, `apps/ops-console-web/app/maintenance/`
  - 本 packet 的職責：為 Codex 執行 FBP-009 之前，整理清楚驗收標準、artifact map 與 reviewer 路徑。

**本 sidecar 性質：** 此為 _pre-execution acceptance framing_——FBP-009 尚未開始，本 packet 不驗證已完成的主線實作，而是為 Codex 提供清晰的驗收框架，讓其執行後可對照核驗。

---

## 3) FBP-009 父任務驗收標準 (Parent Acceptance Criteria)

以下三條驗收標準直接引自 `ai-status.json` -> `FBP-009.acceptance`。

### AC-1 — Ops dashboard、dispatch、revenue、maintenance、incident、reports 主要 flows 與 PRD breadth 對齊

**Owner 執行時需滿足：**

- [ ] **Dashboard** (`apps/ops-console-web/app/dashboard/page.tsx`)：從 placeholder system-info 升級為真正的 operational overview，包含：
  - 活躍訂單數、待派車數、司機在線數等 KPI 卡片
  - 系統健康狀態摘要（API health、dispatch queue depth）
  - 今日 revenue 快覽（優先接既有 `platform-earnings` typed client / read model；若不足再補 ops 對應 read model）
- [ ] **Dispatch** (`apps/ops-console-web/app/dispatch/`）：`WB-002` 已建立核心 dispatch console；FBP-009 補齊：
  - Revenue 維度在 dispatch view 中的顯示（每趟預估金額、今日累計）
  - Host / OpCo / ROC 的 dispatch 路徑分流（若 PRD 有區分）
  - Queue 深度監控卡片
- [ ] **Revenue** (新頁面或 dashboard widget)：Ops Console 需有 revenue breakdown 視圖：
  - 依 tenant / operator / 時段切片
  - 使用 accepted API / read model；現況可先評估既有 `platform-earnings` baseline 是否足夠支撐 ops slice
- [ ] **Maintenance** (`apps/ops-console-web/app/maintenance/page.tsx`)：`WB-003` 已建立 CRUD；FBP-009 補齊：
  - 逾期維修提醒、overdue 狀態高亮
  - 車輛與維修工單的關聯顯示
- [ ] **Incidents** (`apps/ops-console-web/app/incidents/page.tsx`)：`WB-003` 已建立 CRUD；FBP-009 補齊：
  - Severity / Category filter 完整
  - 事件與 dispatch job / vehicle 的 link-back
- [ ] **Reports** (`apps/ops-console-web/app/reports/page.tsx`)：已有 report job list；FBP-009 補齊：
  - Report type 選擇（revenue / dispatch / incident / maintenance）
  - 觸發 job 並下載 artifact 的完整 flow

### AC-2 — operator workflow 以 accepted APIs / read models 運作，不靠 local-only workaround

**Owner 執行時需滿足：**

- [ ] 所有資料取用透過 `getOpsClient()` / `@drts/api-client` 的既有方法或等價 typed surface 進行，例如 `listOrders()`、`listDispatchJobs()`（`/api/dispatch/tasks`）、`listIncidents()`、`listMaintenance()`、`listReportJobs()` / `createReportJob()`、`getPlatformEarningsSummary()` / `getPlatformEarningsByPlatform()`。
- [ ] 不得在前端硬編碼假資料或 mock response 作為生產路徑。
- [ ] 新增的 API endpoint（若有）須在 `apps/api/src/modules/` 中實作，並在對應 module 的 `*.controller.ts` / `*.service.ts` 中定義。
- [ ] 若既有 `platform-earnings` surface 無法滿足 ops revenue slice，需在合適 API module 補齊 read model，並同步更新 `packages/contracts/src/index.ts` 與 `packages/api-client/src/index.ts`。

### AC-3 — 主要流程的 audit、RBAC、error handling 完整

**Owner 執行時需滿足：**

- [ ] 所有 create / update / action 操作的 API route 需經 `BootstrapAuthGuard` 下的 route policy 或明確 auth decorators（如 `RequireScopes` / `RequireRealms`）保護，且與 `auth.policy.ts` 的 ops / platform realm 與 scope 模式一致。
- [ ] 關鍵操作（dispatch assign、incident create/resolve、maintenance create/complete）有 audit log 呼叫（`AuditNotificationModule` 或同等機制）。
- [ ] 前端所有 API 呼叫在 error 時顯示明確錯誤訊息，不以 silent failure 收場。
- [ ] TypeScript typecheck 在 `@drts/ops-console-web` 與 `@drts/api` 上通過（無新增型別錯誤）。

---

## 4) Pre-Execution Gap Analysis (Informative, Non-Blocking)

以下是從目前 codebase 觀察到、Codex 執行 FBP-009 時可能需要處理的主要 gap，供參考：

| #   | Gap                                                                                                                                                                              | Location                                                                                                         | Priority |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------- |
| G-1 | Dashboard 目前只顯示 foundation manifest + identity，缺乏 KPI 卡片與 revenue widget                                                                                              | `apps/ops-console-web/app/dashboard/page.tsx`                                                                    | High     |
| G-2 | 現有 shared client 已有 `platform-earnings` summary / by-platform，但 ops surface 尚未消費，且 tenant / operator / 時段切片是否足夠仍待補齊                                      | `apps/ops-console-web/`, `apps/api/src/modules/platform-earnings/`, `packages/api-client/src/index.ts`           | High     |
| G-3 | Reports page 有 job list 但缺 report type 選擇與 trigger flow                                                                                                                    | `apps/ops-console-web/app/reports/page.tsx`                                                                      | Medium   |
| G-4 | Incidents page 需確認 severity / category filter 是否 wire 到 API query params                                                                                                   | `apps/ops-console-web/app/incidents/page.tsx`                                                                    | Medium   |
| G-5 | Maintenance page 缺 overdue 高亮與跨車輛關聯                                                                                                                                     | `apps/ops-console-web/app/maintenance/page.tsx`                                                                  | Low      |
| G-6 | Host / OpCo / ROC dispatch 路徑是否在 PRD 中有區分，需在執行前確認語意                                                                                                           | PRD / `owned-mobility` module                                                                                    | Clarify  |
| G-7 | `auth.policy.ts` 目前明確列出 orders / dispatch / reports，但未列出 `incidents` / `maintenance`；若 FBP-009 觸及這些寫入 flow，需確認 route policy 或顯式 auth decorators 已補齊 | `apps/api/src/common/auth/auth.policy.ts`, `apps/api/src/modules/incident/`, `apps/api/src/modules/maintenance/` | Medium   |

> **注意：** G-6 若 PRD 無明確區分，Codex 可在 `next` 欄位記錄判斷依據，不阻擋 AC-1 ~ AC-3 核驗。

---

## 5) Dependency Map (Normative Truth Sources)

### 上游脈絡基線（Informative — 非正式前置依賴）

> **重要說明：** `ai-status.json` 中 `FBP-009.depends_on = []`，無任何正式前置依賴。  
> 下表列出的是**已完成的 codebase baseline**，供 Codex 執行時參考——這些任務確實提供了 FBP-009 所需的起點，但它們的完成狀態**不阻擋** FBP-009 啟動（均已為 `done`），也**不構成** FBP-009 的正式依賴關係。

| Dep     | Task                                          | Status | Notes                                                                            |
| ------- | --------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| D-CTX-1 | `WB-002` Dispatch console                     | `done` | dispatch baseline 已建立（informative context，非 depends_on）                   |
| D-CTX-2 | `WB-003` Incidents / Maintenance / Driver ops | `done` | incident & maintenance baseline 已建立（informative context，非 depends_on）     |
| D-CTX-3 | `FBP-008` Platform Admin breadth              | `done` | commit `61547cc`；Ops 依賴的同一 API infra（informative context，非 depends_on） |

### 下游阻塞（FBP-009 必須先 done）

| Dep    | Task                                              | Status | Notes                          |
| ------ | ------------------------------------------------- | ------ | ------------------------------ |
| D-DN-1 | `FBP-010` Callcenter / complaint / dispatch-trace | `todo` | 明確 `depends_on: ["FBP-009"]` |
| D-DN-2 | `FBP-013` Staging / smoke / UAT evidence closeout | `todo` | 明確 `depends_on: ["FBP-009"]` |

### L1 Canonical Truth 引用

| #   | Document                                                                                              | Role                                |
| --- | ----------------------------------------------------------------------------------------------------- | ----------------------------------- |
| C-1 | `phase1_prd_detailed_v1.md`                                                                           | Ops / Host / OpCo / ROC PRD breadth |
| C-2 | `phase1_service_contracts_v1.md`                                                                      | API contract 定義                   |
| C-3 | `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`                             | RBAC / audit decision tables        |
| C-4 | `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`                | Ops acceptance scenarios            |
| C-5 | `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md` | Engineering conventions             |

### Artifact Map（FBP-009 主要作用域）

| Surface                   | Path                                                                  | Notes                                                                |
| ------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Ops Dashboard             | `apps/ops-console-web/app/dashboard/page.tsx`                         | 需升級為完整 KPI view                                                |
| Ops Dispatch              | `apps/ops-console-web/app/dispatch/`                                  | baseline 存在；需補 revenue + queue depth                            |
| Ops Reports               | `apps/ops-console-web/app/reports/page.tsx`                           | 需補 trigger flow + type selector                                    |
| Ops Incidents             | `apps/ops-console-web/app/incidents/page.tsx`                         | 需補完整 filter wire                                                 |
| Ops Maintenance           | `apps/ops-console-web/app/maintenance/page.tsx`                       | 需補 overdue + vehicle link                                          |
| API owned-mobility        | `apps/api/src/modules/owned-mobility/`                                | dispatch / order baseline；提供 dispatch 任務與 queue surface        |
| API platform-earnings     | `apps/api/src/modules/platform-earnings/`                             | 既有 revenue summary / by-platform baseline，但目前偏 driver-centric |
| API incident              | `apps/api/src/modules/incident/`                                      | baseline complete                                                    |
| API maintenance           | `apps/api/src/modules/maintenance/`                                   | baseline complete                                                    |
| API reporting-filing      | `apps/api/src/modules/reporting-filing/`                              | report job API baseline complete                                     |
| Shared client / contracts | `packages/api-client/src/index.ts`, `packages/contracts/src/index.ts` | 新 read model / response type 需同步匯出                             |

---

## 6) Sidecar 本身驗收標準 (Sidecar AC)

### AC-S1 — 僅建立 / 更新 support artifacts，未改 canonical truth

- [x] 本 helper 的輸出限於 `support/sidecars/FBP-009/FBP-009-SIDECAR-ACCEPTANCE.md`。
- [x] 未修改任何 L1 canonical truth、核心 runtime / contract / governance 檔案。
- [x] 未修改 `apps/`、`packages/`、`infra/`、`tests/` 或 `docs/` 中的主線程式碼。

### AC-S2 — Packet 對齊目前 machine truth 與 FBP-009 parent task

- [x] 驗收標準直接引自 `ai-status.json` -> `FBP-009.acceptance`，未擴充或縮減。
- [x] Artifact map 對應目前 repo 實際存在的檔案路徑。
- [x] Gap analysis 基於目前 codebase 狀態，標記為 informative / non-blocking。
- [x] Dependency map 引用 `ai-status.json` 中的 `depends_on` 欄位，不自行發明依賴關係。

### AC-S3 — Packet 包含可執行 handoff 與 closeout 指令

- [x] §7 提供 owner → reviewer handoff 指令。
- [x] §8 提供 reviewer approve / reopen 指令。
- [x] §9 提供 owner closeout 指令。

---

## 7) Evidence Inventory

| #    | Evidence Item                 | Location                                                                      | Notes                                                                                    |
| ---- | ----------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| E-1  | FBP-009 parent task record    | `ai-status.json` -> `FBP-009`                                                 | status=`todo`, owner=`Codex`, reviewer=`Copilot`                                         |
| E-2  | Sidecar task record           | `ai-status.json` -> `FBP-009-SIDECAR-ACCEPTANCE`                              | status=`review`; owner=`Claude`, reviewer=`Codex`; 2026-04-15T17:24:26Z handoff to Codex |
| E-3  | Dispatch console baseline     | `apps/ops-console-web/app/dispatch/`                                          | `WB-002` done                                                                            |
| E-4  | Incidents baseline            | `apps/ops-console-web/app/incidents/page.tsx`                                 | `WB-003` done                                                                            |
| E-5  | Maintenance baseline          | `apps/ops-console-web/app/maintenance/page.tsx`                               | `WB-003` done                                                                            |
| E-6  | Dashboard current state       | `apps/ops-console-web/app/dashboard/page.tsx`                                 | foundation + identity only; needs KPI upgrade                                            |
| E-7  | Reports current state         | `apps/ops-console-web/app/reports/page.tsx`                                   | job list exists; trigger flow missing                                                    |
| E-8  | Platform earnings baseline    | `apps/api/src/modules/platform-earnings/`, `packages/api-client/src/index.ts` | typed revenue summary / by-platform methods exist, but ops surface wiring is absent      |
| E-9  | FBP-008 parent closeout       | commit `61547cc`                                                              | same API infra baseline                                                                  |
| E-10 | FBP-010 downstream dependency | `ai-status.json` -> `FBP-010.depends_on`                                      | blocked on FBP-009                                                                       |
| E-11 | Auth policy baseline          | `apps/api/src/common/auth/auth.policy.ts`                                     | orders / dispatch / reports are covered; incidents / maintenance not explicitly listed   |

---

## 8) Reviewer Flow (Codex)

審查重點：

1. AC-1 的驗收項目是否覆蓋 PRD breadth（可對照 `phase1_prd_detailed_v1.md` 的 Ops 章節驗證）。
2. AC-2 的 API / read model 要求是否與既有 `getOpsClient()` / `@drts/api-client` 方法集合一致，且不會把 owner 誤導到不存在的 endpoint 或錯誤 module。
3. AC-3 的 auth / audit 要求是否與 repo 現行 `BootstrapAuthGuard` + `auth.policy.ts` 模式，以及 `phase1_llm_dev_pack_extracted/.../01_decision_tables.md` 對齊。
4. Gap analysis 是否正確識別目前 codebase 的主要 gap，不遺漏、不誇大。
5. 本 packet 是否確實限於 support artifact，未動到主線實作。

**核准用語：**

> `FBP-009 acceptance packet ready; AC-1~AC-3 framing aligns with PRD breadth and current codebase state; gap analysis accurate; support-only scope confirmed`

**若需重開用語：**

> `packet needs revision: [specify: AC framing gap / artifact path error / dependency map error / scope violation]`

---

## 9) Handoff Commands (Executable)

**Owner（Claude）-> Reviewer（Codex）**

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff FBP-009-SIDECAR-ACCEPTANCE Codex "FBP-009 acceptance packet prepared: AC framing, artifact map, gap analysis, dependency map, and handoff commands at support/sidecars/FBP-009/"
```

**Reviewer（Codex）-> review_approved**

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve FBP-009-SIDECAR-ACCEPTANCE "FBP-009 acceptance packet ready; AC-1~AC-3 framing aligns with PRD breadth and current codebase state; gap analysis accurate; support-only scope confirmed"
```

**Reviewer（Codex）-> reopen**

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen FBP-009-SIDECAR-ACCEPTANCE "packet needs revision: [specify: AC framing gap / artifact path error / dependency map error / scope violation]"
```

---

## 10) Owner Closeout Steps

審查通過（`review_approved`）後，由 Owner（Claude）正式收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done FBP-009-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; FBP-009 acceptance packet at support/sidecars/FBP-009/ ready for Codex execution reference"
```

---

## 11) Notes for FBP-009 Owner (Codex)

1. **此 packet 為執行前參考，非完整 PRD 替代品：** Codex 執行時應以 `phase1_prd_detailed_v1.md` 的 Ops 章節為 L1 truth，本 packet 的 AC 框架為輔助快速對齊用。

2. **G-6 Host / OpCo / ROC 語意需執行前確認：** 若 PRD 中 Host / OpCo / ROC 沒有不同的 dispatch 路徑，Codex 可在 `next` 欄位記錄決策依據，AC-1 的 dispatch bullet 改為「Host / OpCo 共用同一 dispatch console，無需分流」。

3. **revenue gap（G-2）的處理：** 目前 repo 已有 `platform-earnings` baseline（`/api/platform-earnings/summary`、`/api/platform-earnings/by-platform`），但 ops surface 尚未消費，且是否足夠支撐 tenant / operator / 時段切片仍待確認。若 FBP-009 需要更貼近 ops 的 revenue 視圖，優先評估擴充 `platform-earnings`；若語意不合，再在合適 module 建立新 read model。任何新增 / 調整都必須同步：
   - 在對應 API module 的 `*.controller.ts` / `*.service.ts` 定義
   - 在 `packages/contracts/src/index.ts` 匯出對應 response type
   - 在 `packages/api-client/src/index.ts` 暴露共享 typed client 方法

4. **TypeScript typecheck 是非協商的 gate：** `pnpm --filter @drts/ops-console-web typecheck` 與 `pnpm --filter @drts/api typecheck` 在 FBP-009 完成後必須全部通過，不允許以 `// @ts-ignore` 繞過。

5. **不要改動 FBP-010 範圍：** `apps/ops-console-web/app/callcenter/` 與 `apps/ops-console-web/app/complaints/` 屬於 FBP-010，FBP-009 不應修改這兩個目錄。

6. **auth policy gap 要明確處理，不要沿用不存在的 `@Roles` 慣例：** repo 現況採 `BootstrapAuthGuard` + `auth.policy.ts` / auth decorators，而不是 controller `@Roles(...)`。若 FBP-009 需要補 incidents / maintenance 的保護，請沿現有 auth 模式擴充，不要引入另一套未被 repo 採用的 guard 風格。

---

## 12) Change Log

- 2026-04-15 — Claude 建立初版 FBP-009 acceptance packet（pre-execution framing；parent task 尚為 `todo`）。
- 2026-04-15 — Claude 修訂 §5 依賴表：將 WB-002/WB-003/FBP-008 由「上游依賴（必須為 done）」改為「上游脈絡基線（informative，非 depends_on）」，以對齊 `ai-status.json` 中 `FBP-009.depends_on=[]` 的機器真相。同步更新 §7 E-2 的 sidecar 機器狀態說明。
- 2026-04-15 — Codex review_approved：「FBP-009 acceptance packet ready; AC-1~AC-3 framing aligns with PRD breadth and current codebase state; gap analysis accurate; support-only scope confirmed」。Claude（owner）執行 NO_COMMIT_REQUIRED closeout，task 轉為 done。
