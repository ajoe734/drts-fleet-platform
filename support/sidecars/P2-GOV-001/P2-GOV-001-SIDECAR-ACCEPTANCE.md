# P2-GOV-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `P2-GOV-001` — Sandbox experiment / jurisdiction / approval-document governance + snapshot
**Current Sidecar Owner:** `Claude`
**Assigned Reviewer:** `Codex2`
**Parent Owner / Reviewer:** `Codex2` / `Claude2`
**Last Revised:** `2026-06-26T01:28Z (UTC)`
**Status:** `in_progress` (sidecar owner `Claude` building the packet; will hand off to reviewer `Codex2`)

---

## 1) Scope Boundary

本 sidecar 只整理 `P2-GOV-001` 的 acceptance checklist、dependency map、repo baseline 與 reviewer handoff 指引。**不改 canonical truth、不替 parent 直接實作或 closeout、不修改 L1/L2 真相或主線 runtime/registry/governance code。**

- In scope: support-only acceptance framing for SandboxExperimentProgram / JurisdictionProfile / ApprovalDocumentVersion CRUD、版本化 + effective-dating、approval artifact upload + hash + supersedes、notification matrix 結構、SandboxComplianceSnapshot 組裝 API、policy-driven config 佔位（通報時限 / 保存年限不硬編）、dependency map 與 reviewer checklist。
- Out of scope: 直接修改 `packages/contracts` / `apps/api/src/modules/sandbox-governance/` 主線 code、改 V0037 / 新增 governance migration、定義新的 av_sandbox / av_evidence DDL 真相、替 parent 跑 build / vitest、或把 P2-WP0 / 其他 P2 wave 的實作吃進來。

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `scripts/ai-status.sh show` 的 single-task slice 與目前 repo 掃描為準（**未** 整檔讀 `ai-status.json`）：

### Parent `P2-GOV-001`

- machine truth：`status=review`，Owner=`Codex2`，Reviewer=`Claude2`，`depends_on=["P2-WP0"]`，`phase=phase2-tesla-fsd-sandbox-202606`，`artifacts=["apps/api/src/modules/sandbox-governance/"]`，`last_update=2026-06-26T01:26:23Z`。
- parent `next` 自報已實作：sandbox-governance contracts/controller/service + `V0038` governance migrations + unit/integration tests；並聲稱驗證過：
  - `pnpm --filter @drts/contracts build`
  - `pnpm --dir apps/api exec vitest run tests/unit/sandbox-governance.service.test.ts tests/integration/sandbox-governance.controller.test.ts`（pass）
  - full `tsc` 對 sandbox-governance 無錯，但 `apps/api` typecheck 仍因 **pre-existing repo baseline** 問題（task 範圍外）失敗。
- acceptance（machine truth 原文）：「Experiments CRUD+publish/suspend/resume-authorizations endpoints live; approval doc hash stored; versions rollbackable & effective-dated; compliance snapshot reproducible; unit+integration green」。
- **重要：parent 實作尚未落到 `dev`。** parent 仍是 `review` 狀態，code 在 owner `Codex2` 的 task branch 上。本 worktree（base `dev`）目前看不到 controller / `V0038` / tests，這是預期狀態，不是缺陷。

### Sidecar `P2-GOV-001-SIDECAR-ACCEPTANCE`

- machine truth：Owner=`Claude`，Reviewer=`Codex2`，`status=in_progress`（本輪由 backlog→start），`task_class=sidecar`，`mutates_canonical=false`，`helper_parent=P2-GOV-001`，`helper_kind=acceptance_packet`，`auto_created_by=supervisor-underutilization`。
- 依賴 `depends_on=["P2-WP0"]`，與 parent 一致。

### Dependency `P2-WP0`（foundation，已 merged）

- machine truth：`status=done`，`integration_status=merged_to_dev`，`commit_hash=a00a3bbd7…`，`push_branch=dev`，`merge_commit=a00a3bbd7…`。P2-WP0 已進 `origin/dev`，是 parent 與本 sidecar 的 upstream foundation，**已滿足**。

### Repo Baseline Anchors（在 `dev` 上，本 worktree 實掃）

- `infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql:25-26` 建立 `av_sandbox`、`av_evidence` 兩個 schema（P2-WP0 落地）。
- `infra/migrations/V0037…:30-41` 已有 `av_sandbox.provider_capability_requirements`（`sandbox_program_id`、`capability`、`required`、`min_schema_version`、`UNIQUE(sandbox_program_id, capability)`）。這是 P2-WP0 的 capability-gate 表，**不是** governance 的 experiment / jurisdiction / approval-document / compliance-snapshot 表。
- `infra/migrations/V0037…` 其餘表為 `command_receipts`、`sandbox_dispatch_decisions`、`tesla_*`、`safety_operator_assignments`、`roc_interventions`、`av_evidence.evidence_manifests*` / `accident_cases` / `regulatory_report_filings`。**`dev` 上沒有** `sandbox_experiment_programs` / `jurisdiction_profiles` / `approval_document_versions` / `sandbox_compliance_snapshots` 之類 governance 表 → 必須由 parent 的 `V0038` 新增。
- `packages/contracts/src/phase2-tesla-fsd-sandbox.ts:50-80` 已 export `ProviderCapabilityRequirement`（§3.1）與 provider capability advertisement DTO；`:133-172` 有 `SandboxDispatchDecision`（§3.3）。**`dev` contracts 內沒有** governance-specific DTO（experiment program / jurisdiction profile / approval-document version / compliance snapshot），這些由 parent 落地。
- `apps/api/src/modules/sandbox-governance/sandbox-governance.module.ts` + `sandbox-governance.service.ts`：**目前只是 P2-WP0 scaffold**（service 只持有 `requirements: ProviderCapabilityRequirement[] = []`，無 controller、無 persistence、無 CRUD）。service docstring 明說「Scaffold-only…Concrete policy evaluation and persistence…land in downstream waves」。P2-GOV-001 就是把這個 scaffold 擴成真正的 governance surface。

### Gap Summary

| 問題 | 影響 | 根本原因 |
| --- | --- | --- |
| `dev` 上 sandbox-governance 仍是 P2-WP0 scaffold（無 controller / CRUD / persistence） | 無 experiment / jurisdiction / approval-document governance runtime | parent 實作仍在 `review`，未 merge 到 `dev` |
| `V0037` 只有 capability-gate 表，無 governance 表 | experiment program / jurisdiction / approval-doc version / compliance snapshot 無 schema | governance DDL 預期由 parent `V0038` 新增（reviewer 應在 parent diff 驗證） |
| parent `next` 聲稱 `apps/api` typecheck 因 pre-existing baseline 失敗 | reviewer 容易把 pre-existing baseline 與 task-introduced 錯誤混為一談 | typecheck 結果需在 parent branch 用 path-scoped 證據區分 |
| acceptance 含「versions rollbackable & effective-dated」「compliance snapshot reproducible」 | 容易只做 CRUD 而漏掉版本回溯 / 可重現快照 | 這兩點需明確 evidence，非僅 endpoint 存在即可 |
| 通報時限 / 保存年限為 policy-driven | 容易硬編 magic number | summary 要求 config 佔位，不硬編 |

---

## 3) Parent Acceptance Framing

以下 checklist 只把 parent 的 machine-truth `acceptance[]`、`summary_zh`（spec 05 §2 / WBS P2-GOV-001 的轉述）與 repo baseline 展開成 reviewer-facing checklist，**不新增新的產品真相**。所有判定以 parent branch 的實際 diff 為準。

### AC-1 — Experiment program CRUD + lifecycle endpoints

- [ ] `SandboxExperimentProgram` 有 CRUD，且具備 `publish` / `suspend` / `resume-authorizations` lifecycle endpoints（acceptance 原文要求）。
- [ ] lifecycle 轉換有明確 state 語意（非自由文字 status），suspend/resume 不破壞既有授權記錄。
- [ ] endpoints 走 repo 既有 API error envelope 慣例，而非 raw Nest exception。

### AC-2 — Jurisdiction profile governance

- [ ] `JurisdictionProfile` 有 CRUD 與版本化；profile 變更可追溯。
- [ ] notification matrix 為**結構化**（可由 config / data 驅動），通報時限為 policy-driven 佔位，**不硬編**具體小時數 / 天數。
- [ ] reviewer 不應接受把法規時限 magic number 直接寫死在 service code。

### AC-3 — Approval document version: hash + supersedes + effective-dating

- [ ] `ApprovalDocumentVersion` 支援 artifact upload，並**儲存 hash**（acceptance：「approval doc hash stored」）。
- [ ] 版本之間有 `supersedes` 關係；版本可 rollback（acceptance：「versions rollbackable」）。
- [ ] 版本具 effective-dating（acceptance：「effective-dated」）；給定時間點可解析出當時 effective 版本。
- [ ] reviewer 不應接受只存最新版、無 supersede 鏈、或無 effective window 的實作。

### AC-4 — SandboxComplianceSnapshot assembly + reproducibility

- [ ] 有 SandboxComplianceSnapshot 組裝 API，蒐集 experiment / jurisdiction / route / schedule / enrollment / capability / policy 各版本（summary_zh）。
- [ ] snapshot **可重現**（acceptance：「compliance snapshot reproducible」）：相同輸入 / 時間點產生一致快照，並記錄所引用的各版本 id。
- [ ] reviewer 不應接受只回傳即時 live 拼裝、無版本鎖定、無法重建歷史快照的實作。

### AC-5 — Migration + persistence aligned with P2-WP0 foundation

- [ ] governance 表（experiment program / jurisdiction / approval-document version / compliance snapshot）由 parent `V0038` 新增，且命名 / ownership / schema 對齊 `av_sandbox`（比照 `V0037` 慣例），不重定義或破壞 `V0037` 既有表。
- [ ] 不修改已 merged 的 `V0037` 內容（foundation 不可回頭改寫）。
- [ ] persistence 與 P2-WP0 的 `provider_capability_requirements`（capability gate）邏輯邊界清楚，不混淆 capability-gate 與 governance domain。

### AC-6 — Contracts + tests evidence

- [ ] governance DTO 新增在 `packages/contracts`（與既有 `phase2-tesla-fsd-sandbox.ts` Phase2 contract 一致風格），且 `pnpm --filter @drts/contracts build` 綠。
- [ ] unit + integration green（acceptance：「unit+integration green」）；至少涵蓋 lifecycle、approval hash/supersede/effective-dating、snapshot reproducibility。
- [ ] parent 對 `apps/api` typecheck 的「pre-existing baseline 失敗」聲明，reviewer 應以 path-scoped / diff-scoped 證據確認 **不是** 本 task 引入的型別錯誤，再接受。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`P2-GOV-001.depends_on=["P2-WP0"]`。

| Dep | Source | Status | Notes |
| --- | --- | --- | --- |
| `P2-WP0` | machine truth | `done` / `merged_to_dev` (`a00a3bbd7`) | foundation 已進 `dev`；提供 phase2 contracts、`av_sandbox`/`av_evidence` schema、sandbox-governance scaffold。**已滿足**。 |

### What P2-WP0 Provides to P2-GOV-001

| Provided | Anchor | 用途 |
| --- | --- | --- |
| `av_sandbox` / `av_evidence` schema | `infra/migrations/V0037…:25-26` | governance `V0038` 表掛載的 schema 命名空間 |
| `provider_capability_requirements` 表 | `infra/migrations/V0037…:30-41` | capability gate baseline；governance 不可與此混淆 |
| Phase2 contract module | `packages/contracts/src/phase2-tesla-fsd-sandbox.ts` | governance DTO 的同檔 / 同風格落腳處 |
| `sandbox-governance` 模組 scaffold | `apps/api/src/modules/sandbox-governance/{module,service}.ts` | parent 要擴充的 module 入口（目前 scaffold-only） |

### Practical Review Dependencies

| Dep | Type | Why It Matters |
| --- | --- | --- |
| D-P-1 | `V0037…:30-41`（capability gate 表） | reviewer 需確認 governance 表是新增而非覆寫 capability-gate 語意 |
| D-P-2 | `phase2-tesla-fsd-sandbox.ts:50-80,133-172` | 既有 Phase2 contract 風格 baseline；governance DTO 應一致 |
| D-P-3 | `sandbox-governance.service.ts`（scaffold docstring） | 明確聲明 concrete persistence 屬 downstream wave，即 P2-GOV-001 |
| D-P-4 | parent `next`（build/vitest 已跑、typecheck baseline 失敗） | reviewer 需在 parent branch 區分 task-introduced vs pre-existing 錯誤 |

### Forward (Downstream) Dependencies

| Dep | Status | Why It Matters |
| --- | --- | --- |
| D-FWD-1 | sandbox dispatch gate（P2-WP0 `SandboxDispatchDecision`） | governance 的 experiment / approval 狀態最終會被 dispatch gate 消費；snapshot 提供合規佐證 |
| D-FWD-2 | evidence / regulatory-reporting（`av_evidence.*`） | compliance snapshot 與 regulatory 報送鏈相接 |

### Truth Sources

- L0 Collaboration:
  - `scripts/ai-status.sh show P2-GOV-001` / `… P2-GOV-001-SIDECAR-ACCEPTANCE` / `… P2-WP0`（single-task slices；**未** 整檔讀 `ai-status.json`）
- Repo anchors:
  - `infra/migrations/V0037__phase2_av_sandbox_evidence_skeleton.sql`
  - `packages/contracts/src/phase2-tesla-fsd-sandbox.ts`
  - `apps/api/src/modules/sandbox-governance/sandbox-governance.module.ts`
  - `apps/api/src/modules/sandbox-governance/sandbox-governance.service.ts`
- Spec / planning（parent summary 引用）：spec 05 §2、WBS `P2-GOV-001`（governance 產品語意上位來源，本 sidecar 不複製真相）

---

## 5) Evidence Inventory

| ID | Evidence | Expected Anchor |
| --- | --- | --- |
| E-1 | parent / sidecar / dependency machine state | `scripts/ai-status.sh show P2-GOV-001 \| P2-GOV-001-SIDECAR-ACCEPTANCE \| P2-WP0` |
| E-2 | P2-WP0 已 merged_to_dev | `P2-WP0.integration_status=merged_to_dev`, `merge_commit=a00a3bbd7…` |
| E-3 | av schemas 與 capability-gate 表存在於 dev | `V0037…:25-26,30-41` |
| E-4 | dev 上無 governance 表（需 parent `V0038`） | `V0037…` 全表列舉無 experiment/jurisdiction/approval/compliance |
| E-5 | Phase2 contract baseline，無 governance DTO 於 dev | `phase2-tesla-fsd-sandbox.ts:50-80,133-172` |
| E-6 | sandbox-governance 在 dev 仍 scaffold-only | `sandbox-governance.service.ts`（`requirements=[]`，無 controller） |
| E-7 | parent 自報的 build / vitest / typecheck 結果 | `P2-GOV-001.next`（reviewer 在 parent branch 複驗） |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `P2-GOV-001` 為 `review`、Owner=`Codex2`、Reviewer=`Claude2`、`depends_on=[P2-WP0]`；sidecar 為 `in_progress`、Owner=`Claude`、Reviewer=`Codex2`；P2-WP0 已 `merged_to_dev (a00a3bbd7)`。
2. packet 是否正確說明 **parent 實作尚未在 `dev`**（在 review，code 在 `Codex2` branch），而 `dev` 上只有 P2-WP0 scaffold —— 沒有把「dev 看不到 controller/V0038」誤報成缺陷。
3. AC-3 / AC-4 是否抓到 acceptance 的硬點：approval doc **hash stored**、**versions rollbackable & effective-dated**、**compliance snapshot reproducible**，而非只要 endpoint 存在。
4. AC-2 / AC-5 是否守住 policy-driven 佔位（通報時限 / 保存年限不硬編）與「不回頭改寫已 merged 的 `V0037`」邊界。
5. AC-6 是否要求 reviewer 在 parent branch 用 path-scoped 證據區分 task-introduced typecheck 錯誤 vs pre-existing baseline。
6. support artifact 是否完全沒有修改 canonical truth / 主線 runtime（本 sidecar 只新增此 `.md`）。

**建議核准用語：**

> `P2-GOV-001 acceptance packet ready: machine truth preserved (parent P2-GOV-001 in review under Codex2 with Claude2 as reviewer, depends_on P2-WP0 which is merged_to_dev at a00a3bbd7; sidecar in_progress under Claude with Codex2 reviewer). Packet correctly states the parent implementation is not yet on dev and that dev currently carries only the P2-WP0 sandbox-governance scaffold plus V0037 av_sandbox/av_evidence schemas. AC checklist binds the parent acceptance hardpoints — experiment lifecycle endpoints, approval-document hash/supersedes/effective-dating, reproducible compliance snapshot, policy-driven notification placeholders, and V0038 governance tables layered on the V0037 foundation without rewriting it — and requires path-scoped evidence to separate task-introduced typecheck errors from the pre-existing apps/api baseline. No canonical truth or main runtime changed.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / misreporting dev scaffold as a defect / weak hash-supersedes-effective-dating framing / missing snapshot-reproducibility requirement / hardcoded policy values tolerated / unverified typecheck-baseline split]`

---

## 7) Handoff Command

Owner（`Claude`）完成 packet 後，交給 reviewer（`Codex2`）：

```bash
AI_NAME=Claude scripts/ai-status.sh handoff P2-GOV-001-SIDECAR-ACCEPTANCE Codex2 "P2-GOV-001 acceptance packet ready at support/sidecars/P2-GOV-001/P2-GOV-001-SIDECAR-ACCEPTANCE.md. It preserves machine truth (parent in review under Codex2/Claude2, depends_on P2-WP0 merged_to_dev a00a3bbd7; sidecar in_progress under Claude/Codex2), records that parent code is not yet on dev and dev only carries the P2-WP0 sandbox-governance scaffold plus V0037 av_sandbox/av_evidence schemas, maps the experiment-lifecycle / approval-doc hash+supersedes+effective-dating / reproducible compliance-snapshot / policy-driven-placeholder / V0038-on-V0037 acceptance hardpoints, and requires path-scoped evidence to split task-introduced typecheck errors from the pre-existing apps/api baseline. Support-only; no canonical truth or main runtime changed."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 scripts/ai-status.sh approve P2-GOV-001-SIDECAR-ACCEPTANCE "<see 建議核准用語 in §6>"
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 scripts/ai-status.sh reopen P2-GOV-001-SIDECAR-ACCEPTANCE "<see 建議退回用語 in §6>"
```

---

## 9) Owner Closeout

此 sidecar 經 reviewer 核准後，由 owner（`Claude`）收尾。這是 support-only acceptance packet（single-file `.md`，`mutates_canonical=false`），可用 `NO_COMMIT_REQUIRED=1` + `INTEGRATION_STATUS=not_applicable`：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude INTEGRATION_STATUS=not_applicable scripts/ai-status.sh done P2-GOV-001-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for P2-GOV-001 at support/sidecars/P2-GOV-001/P2-GOV-001-SIDECAR-ACCEPTANCE.md. The packet preserves machine truth, frames the parent governance acceptance hardpoints (lifecycle endpoints, approval-doc hash/supersedes/effective-dating, reproducible compliance snapshot, policy-driven placeholders, V0038-on-V0037 migration boundary), and keeps all canonical truth and main runtime untouched. INTEGRATION_STATUS=not_applicable (support-only sidecar)."
```

> 若本 sidecar 被歸類為需要 commit evidence（task_class 變更 / classifier 拒絕 NO_COMMIT_REQUIRED），改為先 task-scoped commit 此 `.md`（`P2-GOV-001-SIDECAR-ACCEPTANCE:` subject + `LLM-Agent`/`Task-ID`/`Reviewer` trailers）、normal push，再 `done` 帶 `INTEGRATION_STATUS=branch_pushed`。

Parent absorption / 主線採納仍由 parent owner `Codex2` 視需要決定，不由此 sidecar 自動推進。

---

## 10) Change Log

- 2026-06-26T01:28Z — 初版建立：依 `scripts/ai-status.sh` single-task slices（parent `P2-GOV-001`=review/Codex2/Claude2、sidecar=in_progress/Claude/Codex2、dependency `P2-WP0`=done/merged_to_dev a00a3bbd7）與 `dev` repo scan（`V0037` av_sandbox/av_evidence + provider_capability_requirements、`phase2-tesla-fsd-sandbox.ts` Phase2 contract baseline、sandbox-governance scaffold-only）整理 `P2-GOV-001` acceptance checklist、dependency map、evidence inventory、reviewer hotspots 與 `Codex2` handoff / closeout 指引。Support-only，無 canonical truth 改動。
