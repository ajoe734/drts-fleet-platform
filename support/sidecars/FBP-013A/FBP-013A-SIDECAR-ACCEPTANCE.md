# FBP-013A Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `FBP-013A` — staging deploy evidence pack  
**Current Owner:** `Codex2`  
**Assigned Reviewer:** `Codex`  
**Parent Reviewer At Snapshot:** `Codex`  
**Last Revised:** `2026-04-16 (UTC)`  
**Status:** `REVIEW APPROVED — support artifact is complete and awaiting owner closeout while parent FBP-013A remains blocked on AC-1 live staging evidence.`

---

## 1) Scope Boundary (Non-Negotiable)

本 sidecar 僅建立與維護支援性材料。不得修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不得改寫主線契約。

- **In scope:** acceptance checklist、dependency map、blocker framing、evidence inventory、review / closeout 指引。
- **Out of scope:** 產品語意調整、核心契約變更、runtime 程式碼修改、或任何 canonical 層直接變更。

---

## 2) Current State Baseline (Machine Truth)

以目前共享狀態與 repo 現況為準（2026-04-16 UTC）：

- 父任務 `FBP-013A` 在 `ai-status.json` / `current-work.md` 中為 `blocked`，Owner=`Claude`，Reviewer=`Codex`，`depends_on=["FBP-008","FBP-009","FBP-011","FBP-012","FBP-013A-INFRA"]`。
  - `acceptance` 欄位只有以下三條 machine truth：
    1. `staging deploy 流程與 evidence anchor 有實際輸出`
    2. `migration / secret wiring 與 health check evidence 被整理進 rollout packet`
    3. `manual rollout matrix 與 /api/admin/flags operational gap 有明確處置，不再只停留在備註`
  - `next` 明確記錄：workflow triage 已於 commit `e7afdd8` 落地；**AC-2 與 AC-3 fully PASS**；**AC-1 blocked**，因 `drts-migrate` 在 `2026-04-16T02:37:56Z` live deploy 失敗，`E-11` / `E-12` / `E-13` 仍待 child `FBP-013A-INFRA` 補齊。
- 子任務 `FBP-013A-INFRA` 在 `ai-status.json` / `current-work.md` 中為 `blocked`，Owner=`Codex`，Reviewer=`Claude`。
  - child `next` / blocker 共同真相目前是：
    - GitHub Actions 缺少 `vars.GCP_PROJECT_ID`、`vars.GCP_REGION`、`vars.GCP_CLOUDSQL_INSTANCE`、`vars.GCP_RUNTIME_SERVICE_ACCOUNT`（或 secret fallback）
    - 也缺少 `secrets.WIF_PROVIDER`、`secrets.WIF_SERVICE_ACCOUNT`
    - 本機 `gcloud` 對 `drts-staging` scope 不足，無法直接檢查 Cloud Run execution
    - 因此無法完成 green rerun，也無法生成 `E-11` / `E-12` / `E-13`
- 本 sidecar `FBP-013A-SIDECAR-ACCEPTANCE` 在 `ai-status.json` / `current-work.md` 中目前為 `review_approved`，Owner=`Codex2`，Reviewer=`Codex`。
  - `ai-activity-log.jsonl` 顯示此 task 已於 `2026-04-16T13:54:53Z` 由 `Codex2` 寫入 `review_approved`，之後在 `2026-04-16T13:55:05Z` 透過 availability-first rebalance 將 owner 改派為 `Codex2`、reviewer 改為 `Codex`，等待 `owned_finalize_dispatch` closeout。
  - 此 helper 僅為 support artifact；owner closeout 必須使用 `NO_COMMIT_REQUIRED=1`，不產生新的 canonical / runtime commit。

### Shared-Truth Split That Must Be Preserved

這份 packet 要刻意保留目前 shared truth 的 blocker split，而不是自行把它正規化：

- parent `FBP-013A` 仍保留「blocked on `Gemini`」的較早 blocker wording
- child `FBP-013A-INFRA` 的最新 blocker 已經是「blocked on `Claude`」，原因是 repo / GCP credential provisioning 需要更高權限的操作者完成
- sidecar reviewer 現在是 `Codex2`，不是 parent reviewer `Codex`

這是目前協作面板上的真實狀態；packet 必須忠實描述，而不是替系統重寫。

### Static Artifact Baseline

| Layer                             | Anchor                                                               | Status                                                |
| --------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------- |
| Wave E staging scaffold baseline  | `ff015a9` (`WE-003`)                                                 | done baseline                                         |
| Parent staging evidence artifact  | `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` | exists; current narrative artifact                    |
| Parent workflow-triage commit     | `e7afdd8`                                                            | committed; establishes current parent blocker framing |
| Child infra remediation progress  | `818a6cb`, `67461e7` (per `ai-activity-log.jsonl`)                   | committed context for rerun prep                      |
| Latest visible failed run context | GitHub Actions run `24457901779`                                     | failed before migration success evidence              |

The important boundary:

- `FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` already carries the **static** rollout evidence
- `FBP-013A-INFRA` owns the remaining **live** rerun evidence gap
- this sidecar packet exists to freeze that acceptance framing for reviewer consumption

---

## 3) Parent Acceptance Criteria Evaluation Framework

以下三條 acceptance criteria 直接引自 `ai-status.json` -> `FBP-013A.acceptance`。本 packet 不新增或刪減 parent AC，只把目前 PASS / BLOCKED 狀態展開成 reviewer 可執行的 evidence map。

### AC-1: `staging deploy 流程與 evidence anchor 有實際輸出`

**Current Verdict:** `BLOCKED`

**PASS requires all of the following:**

| Required Evidence                        | Current Anchor                                                                   | Status  |
| ---------------------------------------- | -------------------------------------------------------------------------------- | ------- |
| Successful `Deploy — Staging` CI run URL | green rerun after infra remediation                                              | blocked |
| Successful `drts-migrate` execution log  | Cloud Run Job / workflow execution output                                        | blocked |
| Health-check HTTP 200 output             | workflow `health-check` job                                                      | blocked |
| Proof the failure mode is understood     | `FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` §7.5 / §11.1; `ai-activity-log.jsonl` | present |

**Current blocker evidence already in shared truth:**

- `2026-04-16T02:37:56Z` live `drts-migrate` execution failed
- `2026-04-16T04:26:30Z` child infra progress records the latest visible run as:
  `https://github.com/ajoe734/drts-fleet-platform/actions/runs/24457901779`
- the child blocker states that repo variables / WIF secrets are currently missing, so remote runs fail before GCP auth or migration succeeds

**Reviewer gate:** parent `FBP-013A` cannot be marked `review_approved` until a green rerun populates `E-11` / `E-12` / `E-13`. Static documentation alone is not enough.

### AC-2: `migration / secret wiring 與 health check evidence 被整理進 rollout packet`

**Current Verdict:** `PASS (static evidence complete)`

| Sub-criterion                                           | Current Anchor                         | Status |
| ------------------------------------------------------- | -------------------------------------- | ------ |
| Migration inventory V0001–V0018                         | staging evidence pack §4               | pass   |
| Secret Manager / runtime env wiring                     | staging evidence pack §5               | pass   |
| Runtime service-account split (`deployer` vs `runtime`) | rollout runbook + child infra progress | pass   |
| Health-check semantics and canonical transcript         | staging evidence pack §3 / §7          | pass   |

This AC is already satisfied by the current support artifact set, even though the live rerun is still blocked.

### AC-3: `manual rollout matrix 與 /api/admin/flags operational gap 有明確處置，不再只停留在備註`

**Current Verdict:** `PASS (static decision complete)`

| Sub-criterion                                                | Current Anchor                                                          | Status |
| ------------------------------------------------------------ | ----------------------------------------------------------------------- | ------ |
| Infra deploy order is machine-enforced                       | staging evidence pack §3 / §6.1; `.github/workflows/deploy-staging.yml` | pass   |
| Business rollout matrix remains intentionally manual         | `docs/03-runbooks/phase1-rollout.md` Pack 3 / Pack 4                    | pass   |
| `/api/admin/flags` is implemented, not missing               | staging evidence pack §6.2; rollout runbook `Current Repo Truth`        | pass   |
| Runtime flag-evaluation client remains deferred post-Phase-1 | same anchors                                                            | pass   |

The shared truth is explicit here: the remaining blocker is not `/api/admin/flags` or rollout-order ambiguity; it is the missing live deploy evidence chain.

---

## 4) Dependency Map

### 4.1 Parent Formal Dependencies (Machine-Enforced)

> **唯一共同真相是 `ai-status.json`。**  
> Parent `FBP-013A.depends_on = ["FBP-008","FBP-009","FBP-011","FBP-012","FBP-013A-INFRA"]`

| Dep ID | Task             | Status    | Notes                                                                                              |
| ------ | ---------------- | --------- | -------------------------------------------------------------------------------------------------- |
| D-UP-1 | `FBP-008`        | `done`    | platform-admin breadth baseline                                                                    |
| D-UP-2 | `FBP-009`        | `done`    | ops / dispatch / reporting baseline                                                                |
| D-UP-3 | `FBP-011`        | `done`    | finance / filing / reporting baseline                                                              |
| D-UP-4 | `FBP-012`        | `done`    | public-info / placard / regulatory-report baseline                                                 |
| D-UP-5 | `FBP-013A-INFRA` | `blocked` | live rerun prerequisite; current blocker is repo/GCP credential provisioning plus privileged rerun |

### 4.2 This Sidecar's Formal Dependencies

> Sidecar task `FBP-013A-SIDECAR-ACCEPTANCE.depends_on = ["FBP-008","FBP-009","FBP-011","FBP-012"]`

The helper task itself is not machine-blocked by `FBP-013A-INFRA`; it can still produce acceptance framing while the parent remains blocked.

### 4.3 Informative Context Baseline

| Context                   | Anchor                                                               | Why It Matters                                                       |
| ------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Staging scaffold baseline | `infra/gcp/staging/`, commit `ff015a9`                               | defines the deploy topology FBP-013A is evidencing                   |
| Parent evidence artifact  | `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` | primary static staging evidence packet                               |
| Rollout runbook           | `docs/03-runbooks/phase1-rollout.md`                                 | canonical operator wording for rollout-matrix and feature-flag truth |
| Deploy workflow           | `.github/workflows/deploy-staging.yml`                               | source of machine-enforced deploy order and required config          |
| Child infra remediation   | `FBP-013A-INFRA` task state and activity log                         | carries the green-rerun blocker and remediation path                 |
| Final synthesis consumer  | `FBP-013D`                                                           | downstream consumer of the final staging evidence chain              |

### 4.4 Reviewer / Consumer Guardrail

- Do not claim AC-1 PASS merely because the static evidence pack exists.
- Do not erase the current parent-vs-child blocker split from the packet.
- Do not restate `/api/admin/flags` as a missing capability; repo truth says it is implemented.
- Do not treat the latest failed GitHub Actions run URL as satisfying the required green-run artifact.

---

## 5) Artifact Map & Evidence Inventory

### Parent Task Artifact Map

| Surface                          | Path                                                                 | Evidence Role                                      |
| -------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| Parent staging evidence artifact | `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` | static staging evidence narrative                  |
| Rollout runbook                  | `docs/03-runbooks/phase1-rollout.md`                                 | operator / rollout / flags truth                   |
| Deploy workflow                  | `.github/workflows/deploy-staging.yml`                               | deploy-order, config, migration gate truth         |
| Staging infra manifests          | `infra/gcp/staging/`                                                 | Cloud Run services + migrate job baseline          |
| Child infra blocker              | `FBP-013A-INFRA` task state in shared truth                          | live rerun prerequisite and missing-evidence owner |

### Evidence Inventory

| #    | Evidence Item                             | Anchor                                                                    | Status                |
| ---- | ----------------------------------------- | ------------------------------------------------------------------------- | --------------------- |
| E-1  | Parent task machine state                 | `ai-status.json` / `current-work.md` -> `FBP-013A`                        | blocked               |
| E-2  | Parent static evidence packet             | `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md`      | present               |
| E-3  | Parent workflow-triage commit             | `e7afdd8`                                                                 | present               |
| E-4  | Recorded failed live migration attempt    | `ai-activity-log.jsonl` / parent `next` (`2026-04-16T02:37:56Z`)          | present               |
| E-5  | Child infra task state                    | `ai-status.json` / `current-work.md` -> `FBP-013A-INFRA`                  | blocked               |
| E-6  | Runtime-SA / IAM remediation context      | `ai-activity-log.jsonl` @ `2026-04-16T04:14:59Z`                          | present               |
| E-7  | Missing repo vars / WIF secrets diagnosis | `ai-activity-log.jsonl` @ `2026-04-16T04:26:30Z`                          | present               |
| E-8  | Latest visible failed run URL             | `https://github.com/ajoe734/drts-fleet-platform/actions/runs/24457901779` | blocker evidence only |
| E-9  | AC-2 static evidence completeness         | parent staging evidence pack §4-§5-§7                                     | pass                  |
| E-10 | AC-3 gap-resolution completeness          | parent staging evidence pack §6 / rollout runbook                         | pass                  |
| E-11 | Green CI run URL                          | post-remediation rerun                                                    | pending               |
| E-12 | Successful migration execution log        | post-remediation rerun                                                    | pending               |
| E-13 | Health-check HTTP 200 proof               | post-remediation rerun                                                    | pending               |

---

## 6) Sidecar Acceptance Criteria

以下三條直接來自 `FBP-013A-SIDECAR-ACCEPTANCE.acceptance`：

### AC-S1 — `Create support artifacts only`

- [x] 本 helper 的輸出限於 `support/sidecars/FBP-013A/FBP-013A-SIDECAR-ACCEPTANCE.md`
- [x] 僅整理 acceptance framing、dependency map、blocker split、evidence inventory
- [x] 未試圖補寫 parent live evidence 或 child infra runtime result

### AC-S2 — `Do not edit canonical truth`

- [x] 未修改任何 L1 canonical truth、核心 runtime / contract / registry / governance 檔案
- [x] 未改寫 parent / child 任務 machine truth，只引用現有 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`
- [x] 明確保留目前共享真相中的 blocker split 與 reviewer split

### AC-S3 — `Hand off the packet to the assigned reviewer`

- [x] §8 提供 owner -> reviewer handoff 指令
- [x] §9 提供 reviewer approve / reopen 指令
- [x] §10 提供 owner `NO_COMMIT_REQUIRED=1` closeout 指令

---

## 7) Reviewer / Downstream Focus

### 7.1 Reviewer Focus Recorded For This Sidecar

已完成的 reviewer focus 如下，保留給 downstream 查閱：

1. packet 仍是 support-only，沒有改寫 canonical / runtime truth。
2. parent `FBP-013A` 的三條 acceptance 被正確展開，且目前 verdict 如實反映：`AC-1 BLOCKED`, `AC-2 PASS`, `AC-3 PASS`。
3. `FBP-013A` 與 `FBP-013A-INFRA` 的 blocker split 被正確保留，沒有被 sidecar 擅自正規化。
4. packet 已清楚指出最新 failed run URL 與缺少的 GitHub / GCP prerequisites，但沒有把它包裝成完成證據。
5. downstream `FBP-013D` 能直接讀出：目前 staging family 已有靜態 evidence，但 live closeout 仍受 `E-11` / `E-12` / `E-13` 阻塞。

Recorded approval wording:

> `審查通過：FBP-013A acceptance packet 已正確凍結 parent FBP-013A 的目前 shared truth，清楚區分 AC-1 live deploy blocker 與 AC-2/AC-3 static PASS，dependency map 對齊 FBP-013A.depends_on=[FBP-008,FBP-009,FBP-011,FBP-012,FBP-013A-INFRA]，且保留 parent/blocker/reviewer split 而未改 canonical truth。回到 owner（Codex）以 NO_COMMIT_REQUIRED=1 做 done closeout。`

Reopen wording (only if state is reopened later):

> `packet needs revision: [specify blocker-state drift / dependency-map drift / evidence misclassification / scope violation]`

### 7.2 Downstream Consumer Focus (`FBP-013D`)

`FBP-013D` 應把 staging family read 成兩段：

1. **Static staging evidence already available**
   - deploy topology
   - migration inventory
   - secret wiring
   - rollout-matrix and `/api/admin/flags` decisions
2. **Live closeout still missing**
   - green CI run URL
   - successful migration log
   - health-check HTTP 200

也就是說，`FBP-013A` 目前不是空白，而是「可供 closeout synthesis 先引用靜態部分，但不能冒充已綠燈」。

---

## 8) Handoff Command

**Historical handoff used before approval**

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff FBP-013A-SIDECAR-ACCEPTANCE Codex2 "FBP-013A acceptance packet ready in support/sidecars/FBP-013A/FBP-013A-SIDECAR-ACCEPTANCE.md. It freezes the parent staging-evidence acceptance framing without changing canonical truth: AC-1 remains blocked on live staging evidence (E-11/E-12/E-13), AC-2 and AC-3 are already static PASS via the staging deploy evidence pack and rollout runbook, and the packet preserves the current machine-truth split between parent FBP-013A, child FBP-013A-INFRA, and their blocker/reviewer states. Support artifact only; no runtime or canonical edits."
```

---

## 9) Reviewer Actions

**Historical reviewer approval command**

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve FBP-013A-SIDECAR-ACCEPTANCE "審查通過：FBP-013A acceptance packet 已正確凍結 parent FBP-013A 的目前 shared truth，清楚區分 AC-1 live deploy blocker 與 AC-2/AC-3 static PASS，dependency map 對齊 FBP-013A.depends_on=[FBP-008,FBP-009,FBP-011,FBP-012,FBP-013A-INFRA]，且保留 parent/blocker/reviewer split 而未改 canonical truth。回到 owner（Codex2）以 NO_COMMIT_REQUIRED=1 做 done closeout。"
```

**Historical reopen command**

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen FBP-013A-SIDECAR-ACCEPTANCE "packet needs revision: [specify blocker-state drift / dependency-map drift / evidence misclassification / scope violation]"
```

---

## 10) Owner Closeout Command

僅在 reviewer 已將此 sidecar 標成 `review_approved` 後執行：

```bash
AI_NAME=Codex2 NO_COMMIT_REQUIRED=1 python3 scripts/ai_status.py done FBP-013A-SIDECAR-ACCEPTANCE "Sidecar acceptance packet finalized. Support-only staging acceptance framing filed at support/sidecars/FBP-013A/FBP-013A-SIDECAR-ACCEPTANCE.md; parent FBP-013A remains blocked until FBP-013A-INFRA provides the green rerun evidence chain."
```
