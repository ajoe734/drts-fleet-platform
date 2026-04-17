# FBP-012 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `FBP-012` — Public Info / Placard / Regulatory report completion
**Current Owner:** Claude
**Assigned Reviewer:** Codex
**Parent Reviewer At Closeout:** Claude
**Last Revised:** 2026-04-16 (UTC)
**Status:** ACTIVE SUPPORT ARTIFACT — parent `FBP-012` is `in_progress`; this packet tracks acceptance framing while the parent implementation remains active.

---

## 1) Scope Boundary (Non-Negotiable)

本 sidecar 僅建立與維護支援性材料。不得修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不得改寫主線契約。

- **In scope:** acceptance checklist、dependency map、evidence anchor inventory、review / owner closeout 指引。
- **Out of scope:** 產品語意調整、核心契約變更、runtime 程式碼修改、或任何 canonical 層直接變更。

---

## 2) Current State Baseline (Machine Truth)

以目前共享狀態與 repo 現況為準（2026-04-16 UTC）：

- 父任務 `FBP-012` 在 `ai-status.json` 中為 `in_progress`，Owner=`Qwen`，Reviewer=`Claude`，`depends_on=[]`。
  - task 尚未關閉；本 sidecar 在父任務執行期間平行建立 acceptance framing。
  - `acceptance` 欄位只有以下三條 machine truth：
    1. `public info、placard、regulatory report、filing package 流程對齊 blueprint operator needs`
    2. `相關版本化 / artifact / signed download 規則一致`
    3. `UI surface 與 backend authority 不再失衡`
- 本 sidecar `FBP-012-SIDECAR-ACCEPTANCE` 在 `ai-status.json` 中為 `review`，Owner=`Claude`，Reviewer=`Codex`。
  - 此 helper 僅為 support artifact；owner closeout 必須使用 `NO_COMMIT_REQUIRED=1`，不產生新的 canonical / runtime commit。

### Pre-existing Infrastructure Baseline

本 sidecar 建立時，以下實作已存在於 repo（非 FBP-012 新增，而是 FBP-008/FBP-011 的 prior work baseline）：

| 既有元件                         | 路徑                                                                   | 狀態                                                                                                                                                                              |
| -------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public-info controller endpoints | `apps/api/src/modules/platform-admin/platform-admin.controller.ts`     | `GET /platform-admin/public-info`、`POST /platform-admin/public-info`、`POST /platform-admin/public-info/:versionId/publish`                                                      |
| Placard controller endpoints     | 同上                                                                   | `GET /platform-admin/placards`、`POST /platform-admin/placards`                                                                                                                   |
| Platform-admin service           | `apps/api/src/modules/platform-admin/platform-admin.service.ts`        | 含 public-info CRUD、placard 生成、seed data                                                                                                                                      |
| Reporting-filing controller      | `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts` | report job create/list/get、filing-package generate/list/get、signed download                                                                                                     |
| Shared API client methods        | `packages/api-client/src/index.ts`                                     | `listPublicInfo`、`createPublicInfoVersion`、`publishPublicInfoVersion`、`listPlacards`、`generatePlacardVersion`                                                                 |
| Contracts types                  | `packages/contracts/src/index.ts`                                      | `PublicInfoVersionRecord`、`CreatePublicInfoVersionCommand`、`PublishPublicInfoVersionCommand`、`PlacardVersionRecord`、`GeneratePlacardVersionCommand`、`FilingPackageRecord` 等 |
| Switchboard UI page              | `apps/platform-admin-web/app/switchboard/page.tsx`                     | 已使用 public-info/placard types                                                                                                                                                  |

FBP-012 的任務是**補齊**上述 baseline 的 operator-complete 路線，確保 breadth 與 backend authority 完全對齊，並確保 regulatory report / filing package 流程端到端可運作。

---

## 3) Parent Acceptance Criteria Evaluation Framework

以下三條 acceptance criteria 直接引自 `ai-status.json` -> `FBP-012.acceptance`。
本 packet 把每條展開成可驗證的 evidence anchors，供 parent owner（目前為 `Qwen`）在執行與 reviewer handoff 時參考，以及供 Claude（parent reviewer）審查時使用。

### AC-1: public info、placard、regulatory report、filing package 流程對齊 blueprint operator needs

**What PASS looks like:**

| Surface                | Required Behavior                                                                                           | Evidence Location                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Public Info CMS        | 支援 create draft → publish → list（含 effectiveFrom/effectiveTo 管理）                                     | `apps/api/src/modules/platform-admin/platform-admin.controller.ts`, `platform-admin.service.ts`       |
| Placard Generator      | 支援 generate placard（綁定 publicInfoVersionId）→ list；artifact 版本化                                    | 同上                                                                                                  |
| Regulatory report jobs | 支援 create report job → list → get（含 jobType / period 管理）                                             | `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts`, `reporting-filing.service.ts` |
| Filing package         | 支援 generate → list → get；packageType 覆蓋 regulatory / annual / quarterly                                | 同上                                                                                                  |
| Operator UI surfaces   | switchboard 頁面支援完整 public-info / placard CRUD；reports 頁面支援完整 filing-package / report job flows | `apps/platform-admin-web/app/switchboard/page.tsx`, `apps/ops-console-web/app/reports/page.tsx`       |

**Acceptance Gate:** parent reviewer Claude 確認上述每個 surface 均有 create / list / status-transition 完整流程，且 UI 不重現 backend authority 已計算的欄位。

---

### AC-2: 相關版本化 / artifact / signed download 規則一致

**What PASS looks like:**

| Rule                    | Required Behavior                                                                                                          | Evidence Location                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Public-info versioning  | 每次 publish 產生不可變版本紀錄，status 轉移 `draft → published`，不允許覆寫已發布版本的核心欄位                           | `platform-admin.service.ts` -> `publishPublicInfoVersion`        |
| Placard versioning      | placard 版本綁定到確定的 `publicInfoVersionId`；不同 placard 版本獨立存在，不互相覆蓋                                      | `platform-admin.service.ts` -> `generatePlacardVersion`          |
| Filing-package artifact | `FilingPackageRecord` 的 `status` (`pending/generating/ready/failed`) 由 backend 控制；`manifest.entries` 一經生成不可修改 | `reporting-filing.service.ts`, `reporting-filing.repository.ts`  |
| Signed download         | filing package / report artifact 的 download URL 透過 `download-signing.util.ts` 產生；前端不自行構造 signed URL           | `apps/api/src/modules/reporting-filing/download-signing.util.ts` |
| API client parity       | `listFilingPackages`、`generateFilingPackage`、`listPublicInfo`、`generatePlacardVersion` 等方法回傳型別與 contracts 一致  | `packages/api-client/src/index.ts`                               |

**Acceptance Gate:** parent reviewer Claude 確認 versioning 不可變性、artifact lifecycle backend authority、signed download 不在前端自算。

---

### AC-3: UI surface 與 backend authority 不再失衡

**What PASS looks like:**

| UI Surface                 | Required Behavior                                                                                            | Evidence Location                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Switchboard page           | 所有 public-info / placard 的 status、dates、artifactFileId 均來自 API 呼叫，不在前端硬編碼                  | `apps/platform-admin-web/app/switchboard/page.tsx` |
| Ops reports page           | 所有 report job status、filing-package manifest/hash 均來自 API 呼叫                                         | `apps/ops-console-web/app/reports/page.tsx`        |
| 無前端自算 financial truth | UI 不本地計算 fare/fee/pricing；only displays backend values                                                 | 同上兩頁                                           |
| TypeScript type safety     | `pnpm --filter @drts/platform-admin-web typecheck` 與 `pnpm --filter @drts/ops-console-web typecheck` 零錯誤 | typecheck CI / local 驗證                          |

**Acceptance Gate:** parent reviewer Claude 確認 UI 頁面無 placeholder authority、無前端自算規則值、typecheck clean。

---

## 4) Dependency Map (Normative Truth Sources)

### 正式上游依賴（Machine-Enforced）

> **唯一共同真相是 `ai-status.json`。**
> `FBP-012.depends_on = []`，所以此任務 **沒有正式 upstream dependency**。

| Dep    | Source               | Status | Notes                                                                           |
| ------ | -------------------- | ------ | ------------------------------------------------------------------------------- |
| D-UP-0 | `FBP-012.depends_on` | `[]`   | 不得把 `FBP-008`、`FBP-011`、`FBP-009` 或 prior wave work 腦補成 formal blocker |

### Informative Context Baseline（非正式依賴，僅供 reviewer / downstream 理解）

下列內容是 execution context，但不是 machine-enforced blockers：

| Context                           | Anchor                                   | Why It Matters                                                                                                                                   |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platform-admin breadth baseline   | `FBP-008` commit `61547cc`               | FBP-008 建立了 platform-admin control-plane 的 prior breadth；FBP-012 延伸至 public-info/placard operator-complete                               |
| Finance/filing authority baseline | `FBP-011` commit `b00b01b`               | FBP-011 凍結了 billing-settlement 與 reporting-filing 的 authority 邊界；FBP-012 在此之上完成 regulatory report / filing-package operator routes |
| Reporting-filing module           | `apps/api/src/modules/reporting-filing/` | 共用 reporting-filing authority；FBP-012 的 regulatory report 路線直接使用此 module                                                              |
| Platform-admin module             | `apps/api/src/modules/platform-admin/`   | public-info / placard authority 所在；FBP-012 的 CMS 與 generator 路線在此 module                                                                |
| Contracts types                   | `packages/contracts/src/index.ts`        | `PublicInfoVersionRecord`, `PlacardVersionRecord`, `FilingPackageRecord` 等型別定義                                                              |

### 下游 machine dependencies

`FBP-012` 雖無上游依賴，但 machine truth 已明確記錄下游工作需要它：

| Dep    | Task      | Status | Notes                                                                                                                       |
| ------ | --------- | ------ | --------------------------------------------------------------------------------------------------------------------------- |
| D-DN-1 | `FBP-013` | `todo` | `FBP-013.depends_on` 包含 `FBP-012`；rollout evidence closeout 需要 public info / placard / regulatory-report family frozen |
| D-DN-2 | `FBP-014` | `todo` | `FBP-014.depends_on` 包含 `FBP-006` 與 `FBP-013`；cross-surface E2E 間接依賴 FBP-012 完成                                   |

### Reviewer / Consumer Guardrail

- 不要把 FBP-008 或 FBP-011 的 prior work 寫成 FBP-012 的 formal upstream deps。
- 不要因為 filing-package 功能已存在就跳過 AC-1 的 regulatory-report operator breadth 驗證。
- 不要把 signed download URL 的邏輯從 backend 移至前端來「簡化」。

---

## 5) Artifact Map & Evidence Inventory (Forward-Looking)

### Parent Task Expected Artifact Map

| Surface                     | Path                                                                   | Evidence Role                                                                                               |
| --------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Platform-admin controller   | `apps/api/src/modules/platform-admin/platform-admin.controller.ts`     | public-info list/create/publish、placard list/generate 端點                                                 |
| Platform-admin service      | `apps/api/src/modules/platform-admin/platform-admin.service.ts`        | public-info versioning logic、placard artifact binding、immutability guards                                 |
| Platform-admin repository   | `apps/api/src/modules/platform-admin/platform-admin.repository.ts`     | public-info / placard 持久化                                                                                |
| Reporting-filing controller | `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts` | regulatory report job create/list/get、filing-package generate/list/get                                     |
| Reporting-filing service    | `apps/api/src/modules/reporting-filing/reporting-filing.service.ts`    | report job / filing-package lifecycle、immutability、manifest                                               |
| Signed download util        | `apps/api/src/modules/reporting-filing/download-signing.util.ts`       | artifact signed download metadata generation                                                                |
| Shared API client           | `packages/api-client/src/index.ts`                                     | typed client methods for public-info/placard/filing-package                                                 |
| Contracts types             | `packages/contracts/src/index.ts`                                      | `PublicInfoVersionRecord`, `PlacardVersionRecord`, `FilingPackageRecord`, `GenerateFilingPackageCommand` 等 |
| Switchboard UI              | `apps/platform-admin-web/app/switchboard/page.tsx`                     | Public Info CMS + Placard Generator operator surface                                                        |
| Ops reports UI              | `apps/ops-console-web/app/reports/page.tsx`                            | Regulatory report job + filing-package operator surface                                                     |

### Evidence Inventory (To Be Populated at Parent Review-Ready)

以下為 evidence checklist，在父任務 `FBP-012` 進入 `review_ready` 前由 parent owner（目前為 `Qwen`）填充 commit hash / test output，供 Claude 做 parent review。

| #    | Evidence Item                                                 | Anchor (Placeholder)                                                   | Status                                    |
| ---- | ------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| E-1  | Parent task machine state                                     | `ai-status.json` -> `FBP-012`                                          | pending (in_progress)                     |
| E-2  | Parent review-ready handoff                                   | `ai-activity-log.jsonl` @ TBD                                          | pending                                   |
| E-3  | Parent reviewer approval                                      | `ai-activity-log.jsonl` @ TBD                                          | pending                                   |
| E-4  | Parent closeout commit hash                                   | TBD                                                                    | pending                                   |
| E-5  | Public-info controller endpoints                              | `apps/api/src/modules/platform-admin/platform-admin.controller.ts`     | baseline exists (pre-FBP-012)             |
| E-6  | Placard controller endpoints                                  | same                                                                   | baseline exists (pre-FBP-012)             |
| E-7  | Platform-admin service public-info / placard methods          | `apps/api/src/modules/platform-admin/platform-admin.service.ts`        | baseline exists; FBP-012 to extend        |
| E-8  | Reporting-filing controller report / filing-package endpoints | `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts` | baseline exists; FBP-012 to verify parity |
| E-9  | Signed download enforcement                                   | `apps/api/src/modules/reporting-filing/download-signing.util.ts`       | baseline exists                           |
| E-10 | Shared API client parity                                      | `packages/api-client/src/index.ts`                                     | baseline exists; FBP-012 to verify no gap |
| E-11 | Switchboard UI operator-complete                              | `apps/platform-admin-web/app/switchboard/page.tsx`                     | in_progress                               |
| E-12 | Ops reports UI operator-complete                              | `apps/ops-console-web/app/reports/page.tsx`                            | in_progress                               |
| E-13 | Platform-admin typecheck                                      | `pnpm --filter @drts/platform-admin-web typecheck`                     | pending evidence                          |
| E-14 | Ops-console typecheck                                         | `pnpm --filter @drts/ops-console-web typecheck`                        | pending evidence                          |
| E-15 | Unit / integration tests                                      | `tests/unit/` (FBP-012 focused test file TBD)                          | pending                                   |

---

## 6) Sidecar Acceptance Criteria

### AC-S1 — 僅建立 / 更新 support artifact，未改 canonical truth

- [x] 本 helper 的輸出限於 `support/sidecars/FBP-012/FBP-012-SIDECAR-ACCEPTANCE.md`
- [x] 未修改任何 L1 canonical truth、核心 runtime / contract / registry / governance 檔案
- [x] 未改寫 parent task 的 machine truth，只引用現有 `ai-status.json` / `current-work.md` 狀態

### AC-S2 — Packet 對齊目前 machine truth

- [x] 直接採用 `FBP-012.acceptance` 的三條 parent acceptance，未擅自增刪
- [x] 明確標示 parent task 目前為 `in_progress`
- [x] formal dependency map 嚴格對齊 `FBP-012.depends_on=[]`
- [x] pre-existing infrastructure baseline 正確標注，不混淆 FBP-012 的新增 scope

### AC-S3 — Packet 包含可執行 handoff / review / closeout 指令

- [x] §8 保留 owner -> reviewer handoff 指令
- [x] §9 保留 reviewer approve / reopen 指令
- [x] §10 提供 owner no-commit closeout 指令

---

## 7) Reviewer / Downstream Focus

**Codex（sidecar reviewer）**審查重點：

1. 這份 packet 仍是 support-only，確認沒有改寫 canonical / runtime truth。
2. dependency map 嚴格遵守 `FBP-012.depends_on=[]`。
3. 三條 parent acceptance 的 evidence anchor framework 是否足以支撐 Claude（parent reviewer）在 FBP-012 進入 `review_ready` 時做出正確的 PASS/FAIL 判定。
4. pre-existing baseline 與 FBP-012 新增 scope 的區分是否清晰，不會讓 parent reviewer 誤把 prior work 算成 FBP-012 的成果。
5. downstream consumer（FBP-013 rollout evidence、FBP-014 cross-surface E2E）能否直接引用本 packet 作為 public-info / placard / regulatory-report family 的 acceptance framing companion。

**Claude（parent reviewer at closeout）**審查重點（parent task review-ready 後）：

1. 三條 parent AC 均已 PASS（per §3 framework）。
2. operator surfaces（switchboard、ops reports）均無前端自算 authority。
3. typecheck clean（`@drts/platform-admin-web`、`@drts/ops-console-web`）。
4. versioning immutability 與 signed download 規則已在 backend 正確實施。

---

## 8) Handoff Commands

**Owner（Claude）-> Reviewer（Codex）**

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff FBP-012-SIDECAR-ACCEPTANCE Codex "FBP-012 acceptance packet ready in support/sidecars/FBP-012/FBP-012-SIDECAR-ACCEPTANCE.md. It preserves the parent task's 3 acceptance criteria (public-info/placard/regulatory-report blueprint parity, versioning/artifact/signed-download consistency, UI surface vs backend authority balance), aligns the dependency map with machine truth (FBP-012.depends_on=[]), and provides the evidence anchor framework for Claude's parent review when the parent owner marks FBP-012 review-ready. Support artifact only; no canonical truth changes."
```

---

## 9) Reviewer Actions

**Reviewer（Codex）-> review_approved**

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve FBP-012-SIDECAR-ACCEPTANCE "FBP-012 acceptance packet approved: dependency map aligned with FBP-012.depends_on=[], three parent acceptance criteria are correctly framed with evidence anchors for the public-info/placard/regulatory-report/filing-package operator surfaces, pre-existing baseline vs FBP-012 new scope is clearly distinguished, and downstream consumer (FBP-013/FBP-014) handoff guidance is correct. Support artifact only."
```

**Reviewer（Codex）-> reopen**

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen FBP-012-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency-map drift / evidence-anchor error / scope violation]"
```

---

## 10) Owner Closeout Steps

審查通過（`review_approved`）後，由 Owner（Claude）正式收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done FBP-012-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; FBP-012 acceptance packet and dependency map are ready in support/sidecars/FBP-012/ for the parent execution owner and downstream rollout-evidence consumers."
```

---

## 11) Notes for Parent Owner / Downstream Consumers

1. 這份 packet 是前向性 acceptance framing，不是 parent review verdict；它在 parent `in_progress` 期間預先建立 acceptance 框架，讓 parent owner、sidecar reviewer 與 Claude 有共同的驗收語言。
2. `FBP-013` 可直接把本 packet 當作 public-info / placard / regulatory-report family 的 upstream acceptance companion，特別是 versioning 與 signed-download authority 邊界的凍結描述。
3. 若 FBP-012 執行中發現既有 baseline 有缺口（例如 `platform-admin.service.ts` 缺少 retire/retract public-info 流程），應由 parent owner（目前為 `Qwen`）在父任務中補齊，並在本 packet §5 evidence inventory 中填充對應 anchor；不要透過改寫 packet 的 scope boundary 來擴充 sidecar 責任。
4. 若未來有人發現 public-info / placard / regulatory evidence 還有缺口，應 reopen 新的 execution 或 sidecar slice；不要透過改寫本 packet 來覆蓋既有 closeout framing。

---

## 12) Change Log

- 2026-04-16 — Claude 建立初版 `FBP-012` acceptance packet，對齊 parent `in_progress` machine truth、三條 acceptance criteria 的 evidence anchor framework、formal dependency graph（`depends_on=[]`）、pre-existing baseline 標注、以及 owner/reviewer/downstream handoff 指引。
- 2026-04-16 — Codex 於 sidecar review 階段修正 packet 的 machine-truth 漂移：父任務 owner 已是 `Qwen`、sidecar 狀態已是 `review`，並將 parent execution / review-ready 表述改為不再綁定舊 owner。
