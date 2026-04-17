# FBP-013A-INFRA Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `FBP-013A-INFRA` — staging deploy infra remediation and green rerun  
**Current Owner:** `Codex2`  
**Assigned Reviewer:** `Claude`  
**Parent Reviewer At Snapshot:** `Claude`  
**Last Revised:** `2026-04-16 (UTC)`  
**Status:** `REVIEW APPROVED / FINALIZE READY — support artifact is approved; only no-commit closeout remains while parent FBP-013A-INFRA stays blocked on credential provisioning and the live green-rerun evidence chain.`

---

## 1) Scope Boundary (Non-Negotiable)

本 sidecar 僅建立與維護支援性材料。不得修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不得改寫主線契約。

- **In scope:** acceptance checklist、dependency map、blocker framing、evidence inventory、review / closeout 指引。
- **Out of scope:** 產品語意調整、核心契約變更、runtime 程式碼修改、或任何 canonical 層直接變更。

---

## 2) Current State Baseline (Machine Truth)

以目前共享狀態與 repo 現況為準（2026-04-16 UTC）：

- 父任務 `FBP-013A-INFRA` 在 `ai-status.json` / `current-work.md` 中為 `blocked`，Owner=`Codex`，Reviewer=`Claude`，`depends_on=["FBP-008","FBP-009","FBP-011","FBP-012"]`。
  - `acceptance` 欄位只有以下三條 machine truth：
    1. `Cloud Run 失敗根因被定位並修復`
    2. `deploy-staging.yml rerun 轉綠且 migration log 留證`
    3. `health-check HTTP 200 與 rollout packet evidence 補齊`
  - `next` / blocker 的最新共同真相是：
    - GitHub Actions 缺少 `vars.GCP_PROJECT_ID`、`vars.GCP_REGION`、`vars.GCP_CLOUDSQL_INSTANCE`、`vars.GCP_RUNTIME_SERVICE_ACCOUNT`（或 secret fallback）
    - 也缺少 `secrets.WIF_PROVIDER`、`secrets.WIF_SERVICE_ACCOUNT`
    - 本機 `gcloud` 對 `drts-staging` scope 不足，無法直接檢查 Cloud Run execution
    - 因此目前無法完成 green rerun，也無法生成 upstream parent `FBP-013A` 所需的 `E-11` / `E-12` / `E-13`
- 上游父任務 `FBP-013A` 在 `ai-status.json` / `current-work.md` 中仍為 `blocked`，Owner=`Claude`，Reviewer=`Codex`，且 `depends_on` 明確包含 `FBP-013A-INFRA`。
  - upstream `next` 已明示：`AC-2` 與 `AC-3` static PASS；`AC-1` 因 `drts-migrate` 在 `2026-04-16T02:37:56Z` live deploy 失敗而被 child `FBP-013A-INFRA` 阻塞。
- 本 sidecar `FBP-013A-INFRA-SIDECAR-ACCEPTANCE` 在 `ai-status.json` / `current-work.md` 中目前為 `review_approved`，Owner=`Codex2`，Reviewer=`Claude`。
  - 此 helper 僅為 support artifact；owner closeout 必須使用 `NO_COMMIT_REQUIRED=1`，不產生新的 canonical / runtime commit。

### Shared-Truth Coordination Split That Must Be Preserved

這份 packet 要忠實保留目前協作面的多層 split，而不是自行正規化：

- upstream `FBP-013A` 仍保留「blocked on `Gemini`」的較早 blocker wording
- child `FBP-013A-INFRA` 的最新 blocker 已是「blocked on `Claude`」，原因是 repo / GCP credential provisioning 與 privileged rerun 需要更高權限操作者
- 本 sidecar reviewer 目前也是 `Claude`；但 packet 仍需保留此前 reviewer churn 與 auto-reassignment 的 shared-truth軌跡，不得自行抹平歷史

這三者是目前 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl` 呈現出的真實協作狀態；packet 必須如實描述。

### Repo-Side Remediation Baseline Already Recorded in Shared Truth

`FBP-013A-INFRA` 並不是完全空白；shared truth 已記錄兩輪 repo-side remediation，但 live closeout 仍未完成：

| Layer                                                                               | Anchor                                                                    | Status                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | --------------------- |
| Runtime-SA split / rerun guardrail narrative                                        | `ai-activity-log.jsonl` @ `2026-04-16T04:08:23Z`                          | recorded              |
| Repo-side remediation commit `818a6cb`                                              | `ai-activity-log.jsonl` @ `2026-04-16T04:14:59Z`                          | recorded              |
| Repo-side preflight validation + Dockerfile.migrate verification / commit `67461e7` | `ai-activity-log.jsonl` @ `2026-04-16T04:26:30Z`                          | recorded              |
| Latest visible failed CI run                                                        | `https://github.com/ajoe734/drts-fleet-platform/actions/runs/24457901779` | blocker evidence only |
| Current open blocker                                                                | `current-work.md` / `ai-status.json` -> `FBP-013A-INFRA.next`             | still blocked         |

The boundary is:

- repo-side workflow/runbook hardening is already present in shared truth
- live staging rerun evidence is still missing
- this sidecar freezes the acceptance framing so reviewer / upstream consumers do not misread the repo-side fixes as a completed green closeout

---

## 3) Parent Acceptance Criteria Evaluation Framework

以下三條 acceptance criteria 直接引自 `ai-status.json` -> `FBP-013A-INFRA.acceptance`。本 packet 不新增或刪減 parent AC，只把目前 PASS / BLOCKED 條件展開成 reviewer 可執行的 evidence map。

### AC-1: `Cloud Run 失敗根因被定位並修復`

**Current Verdict:** `PARTIAL / BLOCKED`

**PASS requires all of the following:**

| Required Evidence                                                                   | Current Anchor                                                                                   | Status  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| Failure mode has been narrowed to concrete deploy/runtime causes                    | `ai-activity-log.jsonl` @ `2026-04-16T04:08:23Z`, `2026-04-16T04:14:59Z`, `2026-04-16T04:26:30Z` | present |
| Repo-side guardrails and workflow hardening are recorded                            | same anchors; commits `818a6cb`, `67461e7`                                                       | present |
| Required repo vars / WIF secrets are provisioned                                    | none yet in shared truth                                                                         | blocked |
| Privileged Cloud Run / Actions rerun confirms the failure path is actually resolved | post-provision rerun                                                                             | blocked |

**Current blocker truth that must be preserved:**

- earlier live attempt failed at `2026-04-16T02:37:56Z` (`drts-migrate` failure recorded by upstream `FBP-013A`)
- latest visible run `24457901779` fails before successful GCP auth / migration because repo variables and WIF secrets are absent
- this machine also cannot inspect Cloud Run directly because `gcloud` authentication for `drts-staging` has insufficient scopes

**Reviewer gate:** AC-1 cannot move to PASS merely because repo-side fixes landed. It needs the credentialed rerun that proves the failure is not just diagnosed, but actually cleared.

### AC-2: `deploy-staging.yml rerun 轉綠且 migration log 留證`

**Current Verdict:** `BLOCKED`

**PASS requires all of the following:**

| Required Evidence                                                               | Current Anchor                                   | Status  |
| ------------------------------------------------------------------------------- | ------------------------------------------------ | ------- |
| Green `Deploy — Staging` CI run URL                                             | post-remediation rerun                           | pending |
| Successful `drts-migrate` execution log                                         | post-remediation rerun                           | pending |
| Proof the latest visible failure is understood but not misclassified as success | `ai-activity-log.jsonl` @ `2026-04-16T04:26:30Z` | present |

**Current reviewer guardrail:**

- `https://github.com/ajoe734/drts-fleet-platform/actions/runs/24457901779` is blocker evidence only
- it cannot be cited as the required green rerun artifact
- until a privileged operator reprovisions credentials and reruns the workflow, AC-2 remains blocked

### AC-3: `health-check HTTP 200 與 rollout packet evidence 補齊`

**Current Verdict:** `BLOCKED`

**PASS requires all of the following:**

| Required Evidence                                                                             | Current Anchor                                                                      | Status  |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------- |
| `health-check` job returns HTTP 200                                                           | post-remediation rerun                                                              | pending |
| `FBP-013A` staging evidence pack can be updated with live evidence (`E-11` / `E-12` / `E-13`) | upstream parent closeout after rerun                                                | pending |
| Static-vs-live evidence boundary remains explicit                                             | `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` + shared truth | present |

The key distinction:

- static staging evidence already exists in `FBP-013A`
- `FBP-013A-INFRA` owns the remaining live rerun evidence chain
- AC-3 is blocked until that live chain exists, even though the static narrative artifact is already present

---

## 4) Dependency Map

### 4.1 Parent Formal Dependencies (Machine-Enforced)

> **唯一共同真相是 `ai-status.json`。**  
> Parent `FBP-013A-INFRA.depends_on = ["FBP-008","FBP-009","FBP-011","FBP-012"]`

| Dep ID | Task      | Status | Notes                                              |
| ------ | --------- | ------ | -------------------------------------------------- |
| D-UP-1 | `FBP-008` | `done` | platform-admin breadth baseline                    |
| D-UP-2 | `FBP-009` | `done` | ops / dispatch / reporting baseline                |
| D-UP-3 | `FBP-011` | `done` | finance / filing / reporting baseline              |
| D-UP-4 | `FBP-012` | `done` | public-info / placard / regulatory-report baseline |

**所有正式上游依賴均已關閉。**  
目前阻塞不是來自 formal upstream tasks，而是來自 repo / GCP credential provisioning 與 privileged rerun能力。

### 4.2 This Sidecar's Formal Dependencies

> Sidecar task `FBP-013A-INFRA-SIDECAR-ACCEPTANCE.depends_on = ["FBP-008","FBP-009","FBP-011","FBP-012"]`

本 helper 並沒有 machine-enforced 依賴 `FBP-013A` 或 `FBP-013A-INFRA` 的 unblock，因為它的工作只是把 acceptance framing 凍結成 reviewer 可審的 support artifact。

### 4.3 Informative Context / Consumer Map

| Context                            | Anchor                                                                                             | Why It Matters                                                              |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Upstream staging evidence consumer | `FBP-013A` task state + `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md`       | child rerun evidence feeds parent AC-1 / E-11~E-13                          |
| Parent artifacts                   | `infra/gcp/staging/`, `.github/workflows/deploy-staging.yml`, `docs/03-runbooks/phase1-rollout.md` | normative artifact surfaces named in `ai-status.json`                       |
| Shared-truth blocker trail         | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                                       | records diagnosis, rerun blockers, and reviewer / blocker split             |
| Final synthesis consumer           | `FBP-013D`                                                                                         | downstream evidence closeout must know what is static vs still missing live |

### 4.4 Reviewer / Consumer Guardrail

- Do not claim `FBP-013A-INFRA` PASS because repo-side remediation commits exist.
- Do not overwrite the current blocker split between upstream `FBP-013A` and child `FBP-013A-INFRA`.
- Do not treat the latest visible failed Actions run as satisfying the green-rerun requirement.
- Do not collapse missing repo vars / WIF secrets and insufficient local `gcloud` scopes into a solved issue; both remain open in shared truth.

---

## 5) Artifact Map & Evidence Inventory

### Parent Task Artifact Map

| Surface                             | Path                                                                 | Evidence Role                                               |
| ----------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| Staging manifests / job specs       | `infra/gcp/staging/`                                                 | deploy topology and Cloud Run job/service baseline          |
| Deploy workflow                     | `.github/workflows/deploy-staging.yml`                               | rerun gate, repo-var / WIF preflight, migration flow        |
| Rollout runbook                     | `docs/03-runbooks/phase1-rollout.md`                                 | operator wording for staging / rollout evidence handoff     |
| Upstream staging evidence companion | `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` | static staging evidence that awaits this child's live chain |
| Shared-truth machine state          | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`         | authoritative blocker / handoff / progress log              |

### Evidence Inventory

| #    | Evidence Item                                                               | Anchor                                                        | Status                |
| ---- | --------------------------------------------------------------------------- | ------------------------------------------------------------- | --------------------- |
| E-1  | Parent child task machine state                                             | `ai-status.json` / `current-work.md` -> `FBP-013A-INFRA`      | blocked               |
| E-2  | Upstream parent machine state showing dependency on this child              | `ai-status.json` / `current-work.md` -> `FBP-013A`            | blocked               |
| E-3  | Earlier live failure timestamp                                              | upstream `FBP-013A.next` (`2026-04-16T02:37:56Z`)             | present               |
| E-4  | Repo-side runtime-SA / rerun-guardrail progress                             | `ai-activity-log.jsonl` @ `2026-04-16T04:08:23Z`              | present               |
| E-5  | Repo-side remediation commit `818a6cb` + local auth limitation              | `ai-activity-log.jsonl` @ `2026-04-16T04:14:59Z`              | present               |
| E-6  | Latest visible failed run URL `24457901779`                                 | `ai-activity-log.jsonl` @ `2026-04-16T04:26:30Z`              | blocker evidence only |
| E-7  | Missing repo vars / WIF secrets diagnosis + preflight hardening (`67461e7`) | `ai-activity-log.jsonl` @ `2026-04-16T04:26:30Z`              | present               |
| E-8  | Open blocker waiting for privileged operator                                | `current-work.md` / `ai-status.json` -> `FBP-013A-INFRA.next` | open                  |
| E-11 | Green `Deploy — Staging` run URL                                            | post-remediation rerun                                        | pending               |
| E-12 | Successful `drts-migrate` log                                               | post-remediation rerun                                        | pending               |
| E-13 | `health-check` HTTP 200 evidence                                            | post-remediation rerun                                        | pending               |

---

## 6) Sidecar Acceptance Criteria

以下三條直接來自 `FBP-013A-INFRA-SIDECAR-ACCEPTANCE.acceptance`：

### AC-S1 — `Create support artifacts only`

- [x] 本 helper 的輸出限於 `support/sidecars/FBP-013A-INFRA/FBP-013A-INFRA-SIDECAR-ACCEPTANCE.md`
- [x] 僅整理 acceptance framing、dependency map、blocker evidence、review / closeout 指引
- [x] 未試圖補寫 live rerun evidence 或變更 parent runtime / workflow truth

### AC-S2 — `Do not edit canonical truth`

- [x] 未修改任何 L1 canonical truth、核心 runtime / contract / registry / governance 檔案
- [x] 未改寫 `FBP-013A-INFRA` / `FBP-013A` 的 machine truth，只引用現有 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`
- [x] 明確保留 upstream parent / child blocker / sidecar reviewer 三層 split

### AC-S3 — `Hand off the packet to the assigned reviewer`

- [x] §8 提供 owner -> reviewer handoff 指令
- [x] §9 提供 reviewer approve / reopen 指令
- [x] §10 提供 owner `NO_COMMIT_REQUIRED=1` closeout 指令

---

## 7) Reviewer / Downstream Focus

### 7.1 Claude's Focus for This Sidecar

Claude 審查這份 sidecar 時，應優先確認：

1. packet 仍是 support-only，沒有改寫 canonical / runtime truth。
2. parent `FBP-013A-INFRA` 的三條 acceptance 被正確展開，且目前 verdict 如實反映：`AC-1 PARTIAL/BLOCKED`、`AC-2 BLOCKED`、`AC-3 BLOCKED`。
3. dependency map 對齊 `FBP-013A-INFRA.depends_on=[FBP-008,FBP-009,FBP-011,FBP-012]`。
4. packet 有清楚區分「repo-side remediation 已落地」與「live rerun evidence 尚未生成」。
5. upstream `FBP-013A` / child `FBP-013A-INFRA` / sidecar reviewer `Qwen` 的 blocker / reviewer split 被保留，而沒有被 packet 擅自重寫。

Recorded approval wording:

> `審查通過：FBP-013A-INFRA acceptance packet 已正確凍結目前 shared truth，清楚區分 repo-side remediation 已落地與 live rerun evidence 仍缺、dependency map 對齊 FBP-013A-INFRA.depends_on=[FBP-008,FBP-009,FBP-011,FBP-012]，並保留 upstream FBP-013A / child infra / sidecar reviewer 的 blocker 與 reviewer split 而未改 canonical truth。回到 owner（Codex2）以 NO_COMMIT_REQUIRED=1 做 done closeout。`

Suggested reopen wording:

> `packet needs revision: [specify blocker-state drift / dependency-map drift / evidence misclassification / scope violation]`

### 7.2 Parent / Downstream Consumer Focus

`FBP-013A` 與 `FBP-013D` 應把這個 child packet 讀成：

1. **repo-side remediation already documented**
   - runtime service-account split / rerun guardrails
   - missing repo vars / WIF secret preflight
   - latest failed Actions run diagnosis
2. **live closeout still missing**
   - green deploy run URL
   - successful migration log
   - health-check HTTP 200

也就是說，`FBP-013A-INFRA` 目前不是沒有進展，而是「靜態 remediation context 已齊，live completion evidence 仍被 privileged rerun 卡住」。

---

## 8) Handoff Command

**Historical owner handoff (Codex -> reviewer)**

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff FBP-013A-INFRA-SIDECAR-ACCEPTANCE Claude "FBP-013A-INFRA acceptance packet ready in support/sidecars/FBP-013A-INFRA/FBP-013A-INFRA-SIDECAR-ACCEPTANCE.md. It freezes the current machine truth for the staging infra remediation slice: repo-side remediation and blocker diagnosis are recorded, but the green rerun evidence chain (E-11/E-12/E-13) is still blocked on repo/GCP credential provisioning plus a privileged rerun. The packet keeps the formal dependency map aligned with FBP-013A-INFRA.depends_on=[FBP-008,FBP-009,FBP-011,FBP-012] and preserves the upstream-parent / child / reviewer split without changing canonical truth."
```

---

## 9) Reviewer Actions

**Historical reviewer approval command**

```bash
AI_NAME=Claude python3 scripts/ai_status.py approve FBP-013A-INFRA-SIDECAR-ACCEPTANCE "審查通過：FBP-013A-INFRA acceptance packet 已正確凍結目前 shared truth，清楚區分 repo-side remediation 已落地與 live rerun evidence 仍缺、dependency map 對齊 FBP-013A-INFRA.depends_on=[FBP-008,FBP-009,FBP-011,FBP-012]，並保留 upstream FBP-013A / child infra / sidecar reviewer 的 blocker 與 reviewer split 而未改 canonical truth。回到 owner（Codex2）以 NO_COMMIT_REQUIRED=1 做 done closeout。"
```

**Reviewer reopen command**

```bash
AI_NAME=Claude python3 scripts/ai_status.py reopen FBP-013A-INFRA-SIDECAR-ACCEPTANCE "packet needs revision: [specify blocker-state drift / dependency-map drift / evidence misclassification / scope violation]"
```

---

## 10) Owner Closeout Command

僅在 reviewer 已將此 sidecar 標成 `review_approved` 後執行：

```bash
AI_NAME=Codex2 NO_COMMIT_REQUIRED=1 python3 scripts/ai_status.py done FBP-013A-INFRA-SIDECAR-ACCEPTANCE "Sidecar acceptance packet finalized. Support-only staging infra acceptance framing is filed at support/sidecars/FBP-013A-INFRA/FBP-013A-INFRA-SIDECAR-ACCEPTANCE.md; parent FBP-013A-INFRA remains blocked until a privileged rerun produces the green deploy, migration, and health-check evidence chain."
```

---

## 11) Notes for Parent Owner / Downstream Consumers

1. 這份 packet 不是 parent `FBP-013A-INFRA` 的 unblock；它只是把 acceptance framing、evidence inventory、以及 blocker split 壓縮成可審查 support artifact。
2. 若 repo / GCP credentials 補齊並成功 rerun，應更新 parent task / parent evidence pack，不應用這份 sidecar 取代 live evidence。
3. 若 reviewer / blocker 再次 churn，本 packet 只需要維持 shared truth 一致，不需要自行推斷新的 canonical 結論。
