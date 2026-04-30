# OPX-CM-005 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `OPX-CM-005` — retention, archival, and evidentiary-access policy enforcement  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Codex` / `Codex2`  
**Last Revised:** `2026-04-30T04:16Z (UTC)`  
**Status:** finalized support artifact — parent `OPX-CM-005` is now `review_approved` under owner=`Codex` / reviewer=`Codex2`, and this sidecar helper task is already `done` after the review-approved acceptance packet closeout. The only formal upstream dependency, `OPX-ID-003`, is already `done` with commit `07235c7b8168118ff935ab29035684f096604715` (`feat(OPX-ID-003): enforce sensitive data governance`).

---

## 1) Scope Boundary

本 sidecar 只整理 `OPX-CM-005` 的 acceptance checklist、dependency map、repo evidence anchors、以及 reviewer / owner handoff 指引；不修改 L1 canonical truth，也不代替 parent 任務直接落地 retention runtime。

- In scope: support packet、evidence-family inventory、acceptance framing、dependency map、repo baseline gap summary、reviewer commands。
- Out of scope: 修改 `apps/api` 主線 runtime、改寫 `phase1_*` canonical truth、替 parent 任務先落地 archival tables / retention scheduler / legal-hold state machine、或重開 `OPX-ID-003` / `OPX-CM-001` 已定義的 masking / gate semantics。

---

## 2) Current State Baseline (Shared Truth + Canonical Anchors)

### Machine Truth Snapshot

- 父任務 `OPX-CM-005` 在 `ai-status.json` 中目前為 `review_approved`，Owner=`Codex`、Reviewer=`Codex2`、`depends_on=["OPX-ID-003"]`，acceptance 只有三條：
  - `each evidence family has retention and archival policy`
  - `legal hold and deletion exceptions are documented`
  - `access to evidence is controlled and auditable`
- 本 sidecar `OPX-CM-005-SIDECAR-ACCEPTANCE` 在 `ai-status.json` 中目前為 `done`，Owner=`Codex`、Reviewer=`Codex2`、`mutates_canonical=false`、helper kind=`acceptance_packet`。
- 依賴 `OPX-ID-003` 已在 machine truth 中 `done`；其 closeout commit 與 accepted document 已把 masking、secret governance、以及 controlled-download baseline 固定下來，`OPX-CM-005` 不需要重新定義那一層。

### Canonical / Accepted Design Anchors

- [`docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md`](../../../docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md) 對 `OPX-CM-005` 的正式 objective 是「materialize retention schedules and access controls for evidence-bearing records」，write scope 只覆蓋 `audit-notification`、`reporting-filing`、`callcenter`、`tenant-partner` 與 `docs/03-runbooks/`。
- [`docs/02-architecture/phase1-sensitive-data-governance-matrix-20260429.md`](../../../docs/02-architecture/phase1-sensitive-data-governance-matrix-20260429.md) 明確寫出：`OPX-ID-003` 已固定 masking / secret / signed-download baseline，而 `OPX-CM-005` 是 full archival、legal-hold、evidentiary-retention 的 follow-on slice。
- [`docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`](../../../docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md) §4.23 把目標狀態定成「錄音、audit、proof、eligibility、delivery log 等可依法留存與調閱」，並明說 Phase 1 目前只有 access logging、欄位遮罩與 signed-download gate，完整 retention / legal-hold 由 `OPX-CM-005` 收尾。
- [`docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md`](../../../docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md) §4.27 / §5.2 已把 retention / archival / evidentiary access / legal hold 列為待補的 P1 缺口，而不是已完成事項。
- [`phase1_service_contracts_v1.md`](../../../phase1_service_contracts_v1.md) 已固定三個直接相關 authority：
  - Callcenter owns `call_session` / `call_recording_index`
  - Reporting & Filing owns `report_artifact` / `filing_package`
  - Audit & Notification owns immutable `audit_log` plus `webhook delivery log`
- [`phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`](../../../phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md) `SC-040` 已把「sensitive artifact download must be permissioned and audited」固定成 acceptance baseline。

---

## 3) Repo Baseline By Evidence Family

下表只描述目前 repo 已存在的 enforcement baseline 與仍待 parent materialize 的缺口；不新增產品語意。

| Evidence Family                   | Existing Baseline In Repo                                                                                                                                                          | Missing `OPX-CM-005` Materialization                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Call recordings / recording index | `callcenter.service.ts` 會 attach `recordingId` / `recordingUrl` / `providerRecordingRef`，寫 `recording_pending` / `recording_missing` / `recording_bound` flags，並 append audit | 沒有 retention duration、archive tier、legal-hold flag、或誰可調閱 raw recording evidence 的正式 policy                                                 |
| Report / filing artifacts         | `reporting-filing.service.ts` 會為 report job / filing package 產生 time-limited controlled-download metadata，且每次 issuance 都寫 audit                                          | 沒有 artifact-family retention schedule、archive cutover、hold/deletion exception、或 explicit deny-path / role matrix evidence                         |
| Audit log                         | `audit-notification.service.ts` 維持 append-only audit log；`audit-log.repository.ts` 會寫入 `admin.audit_logs` 並只載入 recent rows                                               | 沒有 retention / archival / export-hold rule；目前只有 `MAX_IN_MEMORY_AUDIT_LOGS = 1000` 的 runtime cap，不等於 formal retention policy                 |
| Webhook delivery log              | `tenant-partner.service.ts` 保留 `secretVersion`、`signatureVersion`、status / attempt metadata，response 僅回傳 signature preview 而非 raw secret                                 | 沒有 delivery raw body / status history 的 retention window、archive destination、legal hold、或 evidence-access rule                                   |
| Eligibility verification evidence | `tenant-partner` 已將 `referenceToken` 改成 hash-only、masked export、issuer contract snapshot 與 audit follow-up                                                                  | 沒有 verification evidence 保存多久、何時封存、誰可 export / hold 的 formal policy                                                                      |
| Proof-bearing evidence            | Blueprint 已把 proof 視為 evidence family，`OPX-CM-001` 已固定 proof gate semantics                                                                                                | `OPX-CM-005` write scope 不擁有 proof capture runtime；parent 應補的是 retrieval / archive / evidentiary access policy，而不是重寫 proof business rules |

### Repo Scan Highlights

- [`apps/api/src/common/controlled-download.ts`](../../../apps/api/src/common/controlled-download.ts) 與 [`apps/api/src/common/sensitive-data-policy.ts`](../../../apps/api/src/common/sensitive-data-policy.ts) 已固定 controlled-download TTL、key metadata、HMAC signing 與環境變數來源；這是 access baseline，不是 retention policy。
- [`apps/api/src/modules/reporting-filing/reporting-filing.service.ts`](../../../apps/api/src/modules/reporting-filing/reporting-filing.service.ts) 目前在 `getReportJob()` / `getFilingPackage()` 直接 issue artifact download metadata 並寫 audit，但 service method 不接 identity / role context，controller 也尚未把 artifact-family evidentiary access rule 顯性化。
- [`apps/api/src/modules/callcenter/callcenter.service.ts`](../../../apps/api/src/modules/callcenter/callcenter.service.ts) 目前會保存 `recordingUrl` metadata 並寫 `attach_recording_callback` audit，但 repo 內沒有任何 retention / archival / legal hold 文字或欄位。
- [`apps/api/src/modules/audit-notification/audit-notification.service.ts`](../../../apps/api/src/modules/audit-notification/audit-notification.service.ts) 與 [`apps/api/src/modules/audit-notification/audit-log.repository.ts`](../../../apps/api/src/modules/audit-notification/audit-log.repository.ts) 代表 Phase 1 已有 append-only audit write path，但目前只保 recent-load 與 persistence，沒有 policy-backed retention lifecycle。
- `rg` 掃描 `apps/api/src/modules/{audit-notification,reporting-filing,callcenter,tenant-partner}` 與 `docs/03-runbooks/` 幾乎找不到 `legal hold`、`retention schedule`、`archival`、`deletion exception` 的 materialized implementation 或 runbook，表示 parent 任務的核心缺口仍然存在。

---

## 4) Parent Acceptance Criteria Evaluation

以下三條直接對齊 `ai-status.json -> OPX-CM-005.acceptance`，不自增、不改寫。

| Parent AC                                                                   | Current Baseline                                                                                                                                                            | Reviewer Should Require From Parent Closeout                                                                                                                        |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Each evidence family has retention and archival policy                      | `OPX-ID-003` 已固定 masking / controlled-download / secret baseline，但 evidence-family retention 仍只有 blueprint / SA gap 描述                                            | 至少要有 family-by-family policy mapping：recording、proof、eligibility、audit export、webhook delivery；每類都要說清 hot vs archive、retention window、delete rule |
| Legal hold / deletion exception paths are documented                        | write scope 內目前沒有 `legal hold` / `deletion exception` materialization                                                                                                  | 至少要有 runbook / policy doc 明示 hold trigger、who can place/release hold、delete suppression rule、例外 audit trail                                              |
| Access to recordings, proofs, and audit exports is controlled and auditable | report / filing downloads 已有 signed URL + issuance audit；delivery views 也有 masked metadata；但 recording/proof/audit-export 的 access rule 尚未按 evidence family 統一 | reviewer 應要求 parent 明確定義哪些 actor / realm / surface 可調閱何種 evidence，deny path 如何處理，且每次 evidentiary access 都要有 audit anchor                  |

### Reviewer Guardrails

- 不要把 `OPX-ID-003` 的 masking / secret baseline 誤當成 `OPX-CM-005` 已完成；它只是 prerequisite。
- 不要讓 parent 任務偷偷重開 `OPX-CM-001` 的 proof / eligibility gate semantics；`OPX-CM-005` 的焦點是 retention / archive / access governance。
- 不要接受只有「目前已會簽章下載」但沒有 retention / legal hold / evidence-family matrix 的 closeout。

---

## 5) Dependency Map

### Formal Upstream Dependency

| Dep          | Status | Why It Matters                                                                                                                                   |
| ------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OPX-ID-003` | `done` | 先固定 masking、download signing、hash-only secret governance，`OPX-CM-005` 才能在同一 baseline 上補 retention / legal hold / evidentiary access |

### Practical Review Dependencies

| Dep                                                             | Type                             | Why It Matters                                                                                |
| --------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------- |
| `phase1-sensitive-data-governance-matrix-20260429.md`           | accepted implementation baseline | 明確切分 `OPX-ID-003` 已做完什麼，避免 parent 重複或漂移                                      |
| `phase1-operational-system-design-blueprint-20260429.md` §4.23  | accepted design blueprint        | 給出 retention / archival / evidentiary access / legal hold 的正式目標狀態                    |
| `phase1-operational-sa-gap-supplement-20260429.md` §4.27 / §5.2 | accepted gap statement           | 明確說這仍是 P1 gap，不能假裝已在 runtime materialize                                         |
| `phase1_service_contracts_v1.md` §§3.9, 3.12, 3.13              | service ownership truth          | 鎖定 recording index、report artifacts、audit / delivery log 的 authority，不可跨模組亂補真值 |
| `SC-040` in gherkin                                             | acceptance baseline              | 要求 sensitive artifact download 必須 permissioned and audited                                |

### Formal Downstream Dependencies

- 目前 `ai-status.json` 內沒有其他 task 以 `depends_on=["OPX-CM-005"]` 明示此 parent 為 formal blocker。
- 這不代表它沒有實務影響；它只是表示 retention / legal-hold policy 目前仍是 parent 自身的 completeness gate，而不是已被 machine-truth 串成後續 backlog 的 formal prerequisite。

### Practical Downstream Consumers

| Consumer                                  | Why It Matters                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `docs/03-runbooks` operational procedures | parent 很可能要把 hold / deletion exception / evidentiary access 變成 operator-usable runbook          |
| `OPX-GV-002` acceptance matrix work       | 後續 release gate 若要判定 compliance-ready，需要引用 family-by-family evidence policy                 |
| Ops / platform / tenant audit surfaces    | 一旦 evidence download / review 被要求 traceable，access matrix 與 audit anchors 會成為跨 surface gate |

---

## 6) Evidence Inventory

| ID   | Evidence                                                            | Anchor                                                                                                                          |
| ---- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| E-1  | Parent / sidecar / dependency machine truth                         | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                                                                    |
| E-2  | Parent objective + acceptance                                       | `docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md` `OPX-CM-005` section                               |
| E-3  | Accepted prerequisite baseline                                      | `docs/02-architecture/phase1-sensitive-data-governance-matrix-20260429.md`                                                      |
| E-4  | Accepted retention target state                                     | `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md` §4.23                                             |
| E-5  | Accepted gap statement                                              | `docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md` §4.27 / §5.2                                            |
| E-6  | Call recording authority                                            | `phase1_service_contracts_v1.md` §3.9 and `apps/api/src/modules/callcenter/*`                                                   |
| E-7  | Audit / delivery-log authority                                      | `phase1_service_contracts_v1.md` §3.13 and `apps/api/src/modules/audit-notification/*`, `apps/api/src/modules/tenant-partner/*` |
| E-8  | Report / filing artifact authority                                  | `phase1_service_contracts_v1.md` §3.12 and `apps/api/src/modules/reporting-filing/*`                                            |
| E-9  | Permissioned + audited sensitive download baseline                  | `SC-040` in gherkin plus `controlled-download.ts` / `reporting-filing.service.ts`                                               |
| E-10 | Absence of materialized retention / legal-hold logic in write scope | repo `rg` scan over `audit-notification`, `reporting-filing`, `callcenter`, `tenant-partner`, and `docs/03-runbooks`            |

---

## 7) Reviewer Focus (`Codex2`)

`Codex2` 審此 packet 時，應優先確認：

1. 這份 sidecar 是否維持 support-only，不碰 canonical truth 或 runtime implementation。
2. formal dependency 是否仍然只有 `OPX-ID-003`，沒有把 sibling compliance slices 腦補成 machine-truth blockers。
3. packet 是否清楚區分：
   - `OPX-ID-003` 已完成的 masking / secret / signed-download baseline
   - `OPX-CM-005` 尚未 materialize 的 retention / archive / legal hold / evidentiary-access gap
4. reviewer checklist 是否真的覆蓋 evidence families，而不是只談抽象政策文字。
5. packet 是否避免把 proof business semantics、driver runtime、或 unrelated governance drift 混進本 task。

**建議核准用語：**

> `OPX-CM-005 acceptance packet ready: it keeps OPX-ID-003 as the sole formal prerequisite, separates the already-landed masking/signed-download baseline from the still-missing retention and legal-hold work, and packages a reviewer-facing evidence-family checklist for recordings, report artifacts, audit logs, eligibility evidence, and webhook delivery history without mutating canonical truth.`

**建議退回用語：**

> `packet needs revision: [specify dependency drift / evidence-family gap / canonical-baseline mismatch / scope violation]`

---

## 8) Handoff Command (Owner -> Reviewer)

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff OPX-CM-005-SIDECAR-ACCEPTANCE Codex2 "OPX-CM-005 acceptance packet is ready at support/sidecars/OPX-CM-005/OPX-CM-005-SIDECAR-ACCEPTANCE.md. It keeps OPX-ID-003 as the sole formal prerequisite, separates the landed masking and signed-download baseline from the still-missing retention/legal-hold work, and packages a reviewer-facing evidence-family checklist for recordings, report artifacts, audit logs, eligibility evidence, and webhook delivery history. Support artifact only; no canonical truth or runtime changes."
```

---

## 9) Reviewer Actions (Executable)

**Reviewer (`Codex2`) -> `review_approved`**

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve OPX-CM-005-SIDECAR-ACCEPTANCE "OPX-CM-005 acceptance packet ready: it keeps OPX-ID-003 as the sole formal prerequisite, cleanly separates the already-landed masking and signed-download baseline from the missing retention/legal-hold materialization, and packages the evidence-family checklist without changing canonical truth."
```

**Reviewer (`Codex2`) -> `reopen`**

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen OPX-CM-005-SIDECAR-ACCEPTANCE "packet needs revision: [specify dependency drift / evidence-family gap / canonical-baseline mismatch / scope violation]"
```

---

## 10) Owner Closeout Command

若 reviewer 已核准，此 sidecar 可由 owner 正式收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done OPX-CM-005-SIDECAR-ACCEPTANCE "Owner finalized the approved OPX-CM-005 support-only acceptance packet. The packet preserves OPX-ID-003 as prerequisite, packages the evidence-family baseline and gap checklist for retention/legal-hold/evidentiary-access work, and leaves canonical truth and runtime implementation to the parent task."
```

---

## 11) Notes For Parent Owner

- `OPX-CM-005` 的最低可接受交付，不應只是「有 audit / signed URL」；那已經是 `OPX-ID-003` baseline。
- parent closeout 應至少交付 family-by-family retention policy、hold/deletion exception runbook、以及 access / audit matrix。
- 若 parent 要新增 retention enum、archive state machine、或 evidence ownership 重分配，按 collaboration guide 與 consensus packet，這類 retention-policy change 需要留意是否應回到 `discussion_planning`。
- `proof` evidence 的 retrieval / archive policy 可以被納入 parent，但 proof business rule 真值仍以既有 compliance / owned-mobility baseline 為準，不應在本 slice 中偷偷重寫。

---

## 12) Change Log

- `2026-04-30T04:16Z` — Refreshed the support packet header and machine-truth snapshot so the committed artifact matches the current `review_approved` parent state and the already-finalized helper-task closeout.
- `2026-04-29T21:39Z` — Updated the sidecar packet to match the current machine-truth owner/reviewer assignments and review-state snapshot after availability-first reassignment to `Codex2`.
- `2026-04-29T20:27Z` — Codex 建立初版 `OPX-CM-005` support-only acceptance packet，對齊 parent machine truth、`OPX-ID-003` done baseline、accepted blueprint / SA gap anchors、以及 write-scope repo scan，供 `Claude2` review 使用。
