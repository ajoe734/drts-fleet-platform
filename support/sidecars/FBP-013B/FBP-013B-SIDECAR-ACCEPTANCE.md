# FBP-013B Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `FBP-013B` — smoke evidence pack  
**Current Owner:** Codex2  
**Assigned Reviewer:** Codex  
**Parent Reviewer At Snapshot:** Qwen  
**Last Revised:** 2026-04-16 (UTC)  
**Status:** ACTIVE SUPPORT ARTIFACT — sidecar `FBP-013B-SIDECAR-ACCEPTANCE` is `review_approved`; parent `FBP-013B` is `done`.

---

## 1) Scope Boundary (Non-Negotiable)

本 sidecar 僅建立與維護支援性材料。不得修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不得改寫主線契約。

- **In scope:** acceptance checklist、dependency map、evidence inventory、review / closeout 指引。
- **Out of scope:** 產品語意調整、核心契約變更、runtime 程式碼修改、或任何 canonical 層直接變更。

---

## 2) Current State Baseline (Machine Truth)

以目前共享狀態與 repo 現況為準（2026-04-16 UTC）：

- 父任務 `FBP-013B` 在 `ai-status.json` / `current-work.md` 的最新共同狀態為 `done`，Owner=`Codex`。
  - 共享真相目前已由 **Reviewer=`Claude`** 審核通過。
  - `ai-activity-log.jsonl` 顯示 parent 已於 2026-04-16T06:14:29Z 正式收尾。
  - `acceptance` 欄位三條 machine truth 已全數達成：
    1. `smoke suite 的 critical-path coverage 與執行方式有可審查 evidence`
    2. `環境前置條件、fixtures 與 failure triage guide 被整理成操作文件`
    3. `staging-ready smoke evidence 可獨立 handoff 給最終 closeout`
- 本 sidecar `FBP-013B-SIDECAR-ACCEPTANCE` 在最新 shared truth 中為 `review_approved`，Owner=`Codex2`，Reviewer=`Codex`。
  - 此 helper 僅為 support artifact；owner closeout 必須使用 `NO_COMMIT_REQUIRED=1`，不產生新的 canonical / runtime commit。
  - `ai-activity-log.jsonl` 顯示 2026-04-16T14:12:16Z 已由 `Codex2` review approve，且 2026-04-16T14:12:29Z ownership availability-first 改派給 `Codex2`；目前最新 shared truth 應以此組 owner / reviewer 為準。

### Current Review Surface vs Committed Baseline

`FBP-013B` 目前沒有 machine-recorded closeout commit；reviewer 正在看的其實是 **當前工作樹中的 smoke evidence surface**。這份 packet 要刻意區分：

| Evidence Layer                      | Anchor                                                                                                                                                                       | Status                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Smoke harness baseline              | WE-004 commit `9a233d1`                                                                                                                                                      | 已凍結、已完成                                                  |
| First smoke evidence pack commit    | `4dd3b0a` (`fix(FBP-013B): reconcile smoke evidence pack to repo runtime truth`)                                                                                             | 已存在於 git history                                            |
| Current under-review worktree delta | `support/sidecars/FBP-013B/FBP-013B-SMOKE-EVIDENCE-PACK.md`, `tests/smoke/README.md`, `tests/smoke/lib/helpers.sh`, `tests/smoke/01-health.sh`, `scripts/run-smoke-tests.sh` | 尚未 machine-closeout；屬 parent reviewer 應審查的 live surface |

目前工作樹中的 live delta（相對於已提交基線）集中在三類修正：

1. smoke suite 預設 actor 由 `platform_admin` 更正為 `system`
2. `01-health.sh` / transcript / inventory 對齊 `GET /api/health`
3. deploy workflow 關係說明更正為「`.github/workflows/deploy-staging.yml` 目前 **沒有** 自動 smoke step；live staging smoke artifact 仍是 `FBP-013A` 範圍」

因此，parent reviewer 對 `FBP-013B` 的判定必須以：

- `ai-status.json` 的 parent task state
- `ai-activity-log.jsonl` 的 reopen / reassignment / handoff history
- 以及上述 5 個目前工作樹中的 live review files

共同組成目前 shared truth，而不能只看 `4dd3b0a` 或 WE-004 baseline。

### Pre-existing Context Baseline

`FBP-013B` 不是重新發明 smoke harness，而是在既有 rollout baseline 上，把 smoke suite 轉成可審查 evidence pack：

| 既有元件                          | 路徑                                                                 | Baseline           | 狀態                  |
| --------------------------------- | -------------------------------------------------------------------- | ------------------ | --------------------- |
| Smoke harness                     | `tests/smoke/`                                                       | `9a233d1` (WE-004) | `done`                |
| Smoke runner                      | `scripts/run-smoke-tests.sh`                                         | `9a233d1` (WE-004) | `done`                |
| Rollout runbook                   | `docs/03-runbooks/phase1-rollout.md`                                 | shared truth       | active                |
| Staging deploy evidence companion | `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` | `FBP-013A`         | blocked               |
| UAT evidence companion            | `support/sidecars/FBP-013C/FBP-013C-UAT-EVIDENCE-PACK.md`            | `FBP-013C`         | review / review churn |

這代表 `FBP-013B` 的責任是：

- 凍結 smoke coverage / env config / triage / scope decision 的**靜態證據**
- 並把 live staging smoke run artifact 明確分派給 `FBP-013A`

---

## 3) Parent Acceptance Criteria Evaluation Framework

以下三條 acceptance criteria 直接引自 `ai-status.json` -> `FBP-013B.acceptance`。本 packet 把每條展開成 reviewer 可執行的 evidence anchor。

### AC-1: smoke suite 的 critical-path coverage 與執行方式有可審查 evidence

**What PASS looks like:**

| Required Evidence                      | Current Anchor                                                      | Reviewer Focus                                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 6 個 smoke cases 的 coverage inventory | `support/sidecars/FBP-013B/FBP-013B-SMOKE-EVIDENCE-PACK.md` §2      | 01 health、02 booking、03 dispatch、04 driver accept、05 billing invoice、06 report export 都有明確路徑與責任說明 |
| Canonical green-run transcript         | smoke pack §4                                                       | transcript 必須與當前 auth / path truth 對齊，不可殘留 `/api/auth/login` 或 token-only 敘述                       |
| Runner CLI / execution surface         | `scripts/run-smoke-tests.sh`, `./scripts/run-smoke-tests.sh --help` | help text、banner、default env vars 與 evidence pack / README 一致                                                |
| Health path truth                      | `tests/smoke/01-health.sh`, smoke pack §2 / §4                      | 必須對齊 `GET /api/health`，不可再寫成 `GET /health`                                                              |

**Acceptance Gate:** parent reviewer 確認 smoke pack 不是抽象描述，而是能指到具體腳本、具體 transcript、具體 CLI surface 的可審查 evidence artifact。

### AC-2: 環境前置條件、fixtures 與 failure triage guide 被整理成操作文件

**What PASS looks like:**

| Required Evidence                 | Current Anchor                                                                                                              | Reviewer Focus                                                                                 |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Env vars + bootstrap auth model   | smoke pack §3, `tests/smoke/README.md`, `tests/smoke/lib/helpers.sh`                                                        | 必須明確說明 bootstrap headers；不得回退到不存在的 `/api/auth/login` / `SMOKE_AUTH_TOKEN` 模型 |
| Seed / fixture requirements       | smoke pack §3.4, `tests/smoke/fixtures/`, `infra/seeds/S0002__demo_operational_seed.sql`                                    | TEN_ACME / 張司機 / ABC-1234 的 S0002 UUID 需一致                                              |
| Per-test failure triage           | smoke pack §5                                                                                                               | 六個 test case 都要有 failure cause / remediation，而不是只列 happy path                       |
| `/api/admin/flags` scope decision | smoke pack §6.3, `docs/04-uat/phase1-uat-scenarios.md` (`PA-010`)                                                           | 必須承認 endpoint 已實作；只是正確排除在 smoke gate 外，交由 UAT 覆蓋                          |
| Deploy-workflow relationship      | smoke pack §7, `.github/workflows/deploy-staging.yml`, `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` | 不得虛構「staging deploy workflow 已自動跑 smoke」；live artifact today 仍歸 `FBP-013A`        |

**Acceptance Gate:** parent reviewer 確認 smoke suite 的執行前置、fixture IDs、triage、以及 FBP-013A live-run boundary 都被正確寫成 operator document。

### AC-3: staging-ready smoke evidence 可獨立 handoff 給最終 closeout

**What PASS looks like:**

| Required Evidence                          | Current Anchor                                                                                 | Reviewer Focus                                                               |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Static smoke evidence can stand alone      | smoke pack §1 / §8 / §9                                                                        | 即使沒有 live staging access，reviewer 也能審完整個 smoke evidence artifact  |
| Live staging artifact boundary is explicit | smoke pack §7 / §8, FBP-013A pack §1                                                           | `FBP-013B` 不應假裝擁有 live deploy artifact；要明確交棒給 `FBP-013A`        |
| Final closeout consumer path is defined    | `FBP-013` umbrella acceptance packet, `FBP-013D.depends_on=["FBP-013A","FBP-013B","FBP-013C"]` | `FBP-013D` 必須知道要消費哪份 static smoke pack + 哪份 live staging artifact |

**Acceptance Gate:** parent reviewer 確認 `FBP-013B` 交出的 smoke evidence 是一個可被 `FBP-013D` 直接引用的獨立 packet，而不是只能靠口頭解釋的半成品。

---

## 4) Dependency Map (Normative Truth Sources)

### 正式上游依賴（Machine-Enforced）

> **唯一共同真相是 `ai-status.json`。**  
> `FBP-013B.depends_on = ["FBP-008","FBP-009","FBP-011","FBP-012"]`

| Dep ID | Task                                                           | Commit    | Status | Notes                                                                |
| ------ | -------------------------------------------------------------- | --------- | ------ | -------------------------------------------------------------------- |
| D-UP-1 | `FBP-008` Platform Admin blueprint completion                  | `61547cc` | `done` | platform-admin breadth + authority baseline                          |
| D-UP-2 | `FBP-009` Ops / Host / ROC Phase 1 completion                  | `71d9fa8` | `done` | dispatch / incident / maintenance / reports operator baseline        |
| D-UP-3 | `FBP-011` Finance / billing / filing completion                | `b00b01b` | `done` | billing / statement / report-job / filing-package authority baseline |
| D-UP-4 | `FBP-012` Public Info / Placard / Regulatory report completion | `7f02fe1` | `done` | signed-download and regulatory-report coverage baseline              |

**所有正式上游依賴均已關閉。`FBP-013B` 沒有 machine-enforced blocker。**

### Informative Context Baseline（非正式依賴，僅供 reviewer / downstream 理解）

| Context                           | Anchor                                                               | Why It Matters                                                         |
| --------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| WE-004 smoke suite baseline       | commit `9a233d1`, `tests/smoke/`, `scripts/run-smoke-tests.sh`       | 提供 smoke harness 的 code baseline；`FBP-013B` 在其上補 evidence pack |
| Staging deploy evidence companion | `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` | live staging smoke run artifact today 由 FBP-013A 持有                 |
| Rollout runbook                   | `docs/03-runbooks/phase1-rollout.md`                                 | 明確記錄 manual rollout matrix 與 `/api/admin/flags` 真相              |
| Umbrella acceptance framing       | `support/sidecars/FBP-013/FBP-013-SIDECAR-ACCEPTANCE.md`             | 定義 smoke evidence 在最終 FBP-013 closeout 裡的角色                   |
| UAT companion                     | `support/sidecars/FBP-013C/FBP-013C-UAT-EVIDENCE-PACK.md`            | smoke 與 UAT 是互補 evidence，不應混寫                                 |

### 下游 machine dependencies

| Dep    | Task                                                        | Status | Notes                                                                |
| ------ | ----------------------------------------------------------- | ------ | -------------------------------------------------------------------- |
| D-DN-1 | `FBP-013D` final evidence synthesis and closeout packet     | `todo` | 直接依賴 `FBP-013B`，負責彙總 smoke / staging / UAT 三條 evidence 鏈 |
| D-DN-2 | `FBP-014` integrated cross-surface and cross-repo E2E suite | `todo` | 間接依賴 `FBP-013` closeout 完成                                     |

### Reviewer / Consumer Guardrail

- 不要把 `WE-004` baseline 誤寫成 `FBP-013B` 的 closeout evidence；`FBP-013B` 的任務是把 baseline 轉成 auditable packet。
- 不要再把 `platform_admin` 描述成 full-suite smoke 預設 actor；目前 repo truth 應是 `system`。
- 不要再聲稱 `.github/workflows/deploy-staging.yml` 已自動跑 smoke；今天它沒有這個 step。
- 不要把 `/api/admin/flags` 寫成缺失或 out-of-repo；它已實作，只是正確排除在 smoke gate 外。

---

## 5) Artifact Map & Evidence Inventory

### Parent Task Artifact Map

| Surface                           | Path                                                                                | Evidence Role                                                    |
| --------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Smoke evidence pack               | `support/sidecars/FBP-013B/FBP-013B-SMOKE-EVIDENCE-PACK.md`                         | 主體 artifact；承載 coverage、env config、triage、scope decision |
| Smoke runner                      | `scripts/run-smoke-tests.sh`                                                        | CLI entrypoint / banner / env default truth                      |
| Shared smoke helpers              | `tests/smoke/lib/helpers.sh`                                                        | bootstrap auth header model、path prefix、poll helpers           |
| Smoke README                      | `tests/smoke/README.md`                                                             | operator-facing quickstart / env-var reference                   |
| Health test                       | `tests/smoke/01-health.sh`                                                          | `/api/health` truth anchor                                       |
| Remaining smoke tests + fixtures  | `tests/smoke/02-booking-create.sh` … `06-report-export.sh`, `tests/smoke/fixtures/` | critical-path API coverage                                       |
| Rollout runbook                   | `docs/03-runbooks/phase1-rollout.md`                                                | manual rollout matrix + `/api/admin/flags` truth                 |
| Staging deploy evidence companion | `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md`                | live deploy / migration / health / post-deploy evidence boundary |

### Evidence Inventory

| #    | Evidence Item                         | Anchor                                                                              | Status                                                                    |
| ---- | ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| E-1  | Parent task machine state             | `ai-status.json` -> `FBP-013B`                                                      | `review`; owner `Codex`; latest shared reviewer truth converges to `Qwen` |
| E-2  | Parent reviewer churn                 | `ai-activity-log.jsonl` (2026-04-16 reviewer reassignments)                         | recorded                                                                  |
| E-3  | Sidecar task machine state            | `ai-status.json` -> `FBP-013B-SIDECAR-ACCEPTANCE`                                   | `review_approved`; owner `Codex2`; reviewer `Codex`                       |
| E-4  | Smoke harness baseline                | WE-004 commit `9a233d1`                                                             | done baseline                                                             |
| E-5  | First smoke evidence pack commit      | git history for `FBP-013B-SMOKE-EVIDENCE-PACK.md` -> `4dd3b0a`                      | exists                                                                    |
| E-6  | Current live review surface           | current worktree diff across 5 files                                                | under review                                                              |
| E-7  | Coverage / transcript / triage packet | smoke pack §§2, 4, 5, 9                                                             | present                                                                   |
| E-8  | Bootstrap auth + env model            | smoke pack §3, `tests/smoke/README.md`, `tests/smoke/lib/helpers.sh`                | present                                                                   |
| E-9  | `/api/admin/flags` scope decision     | smoke pack §6.3, `docs/04-uat/phase1-uat-scenarios.md` (`PA-010`)                   | present                                                                   |
| E-10 | Deploy-workflow boundary              | smoke pack §7, `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md` | present                                                                   |
| E-11 | Live staging smoke artifact           | `FBP-013A` evidence pack / future manual run log                                    | pending outside FBP-013B                                                  |

### Current Under-Review Delta (Reviewer Hotspots)

下列變更不是本 sidecar 實作，而是 parent `FBP-013B` 目前正在 review 的 live surface，建議 reviewer 專看：

| File                                                        | Live delta summary                                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `support/sidecars/FBP-013B/FBP-013B-SMOKE-EVIDENCE-PACK.md` | owner/reviewer metadata、`system` actor、`/api/health` wording、deploy-workflow relationship |
| `tests/smoke/README.md`                                     | staging example 與 env-var defaults 改為 `system` actor                                      |
| `tests/smoke/lib/helpers.sh`                                | auth-model commentary 與 default actor/id 改為 `system` / `smoke-system-001`                 |
| `tests/smoke/01-health.sh`                                  | health path wording對齊 `/api/health`                                                        |
| `scripts/run-smoke-tests.sh`                                | help text / defaults / auth commentary 改為 `system` actor與 bootstrap-header model          |

---

## 6) Sidecar Acceptance Criteria

### AC-S1 — 僅建立 / 更新 support artifact，未改 canonical truth

- [x] 本 helper 的輸出限於 `support/sidecars/FBP-013B/FBP-013B-SIDECAR-ACCEPTANCE.md`
- [x] 未修改任何 L1 canonical truth、核心 runtime / contract / registry / governance 檔案
- [x] 未改寫 parent task 的 machine truth，只引用現有 `ai-status.json` / `current-work.md` / `ai-activity-log.jsonl`

### AC-S2 — Packet 對齊目前 machine truth 與 review surface

- [x] 直接採用 `FBP-013B.acceptance` 的三條 parent acceptance，未擅自增刪
- [x] formal dependency map 嚴格對齊 `FBP-013B.depends_on=["FBP-008","FBP-009","FBP-011","FBP-012"]`
- [x] 明確區分已凍結 baseline（WE-004 / `4dd3b0a`）與當前 reviewer 正在看的 live worktree delta
- [x] 明確保留 parent reviewer churn，而不把暫時的 availability retry 誤寫成 scope 結論
- [x] 明確標示 live staging smoke artifact today 仍屬 `FBP-013A` 範圍

### AC-S3 — Packet 包含可執行 handoff / review / closeout 指令

- [x] §8 保留 owner -> reviewer handoff 指令
- [x] §9 保留 reviewer approve / reopen 指令
- [x] §10 提供 owner no-commit closeout 指令

---

## 7) Reviewer / Downstream Focus

### 7.1 Sidecar Reviewer Focus (Codex)

Codex 審查本 sidecar 時，應優先確認：

1. 這份 packet 仍是 support-only，沒有改寫 canonical / runtime truth。
2. dependency map 是否嚴格遵守 `FBP-013B.depends_on=["FBP-008","FBP-009","FBP-011","FBP-012"]`。
3. packet 是否清楚區分：
   - smoke harness baseline (`9a233d1`)
   - first smoke pack commit (`4dd3b0a`)
   - current live worktree review surface（5 個修改檔）
4. live staging smoke artifact boundary 是否寫清楚：今天仍由 `FBP-013A` 提供，不在 `FBP-013B` 內虛構。
5. packet 是否把 parent reviewer 真正該看的熱點鎖定為 auth model、health path、deploy-workflow relationship、`/api/admin/flags` scope decision。

### 7.2 Parent Reviewer Hotspots (Qwen)

`FBP-013B` 的 parent reviewer 目前收斂為 `Qwen`。本 packet 建議 Qwen 直接核查：

1. smoke pack §3 / README / helpers / runner 是否全數一致採用 `system` 作 full-suite default actor。
2. `01-health.sh`、coverage inventory、canonical transcript 是否一致寫成 `GET /api/health`。
3. smoke pack §7 是否已正確移除「deploy-staging workflow 自動 smoke」的錯誤宣稱。
4. smoke pack 是否正確把 live staging smoke log 交由 `FBP-013A`，而不是自稱已完成 live artifact。

### 7.3 Downstream Consumer Focus (`FBP-013D`)

`FBP-013D` 在最終 closeout 合成時，應把 `FBP-013B` 視為：

- **static smoke evidence companion**：由 `FBP-013B-SMOKE-EVIDENCE-PACK.md` 提供
- **live staging run evidence**：由 `FBP-013A` 提供

不要把兩者混為同一 artifact。

---

## 8) Handoff Commands

**Owner（Codex2）-> Reviewer（Codex）**

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py handoff FBP-013B-SIDECAR-ACCEPTANCE Codex "FBP-013B acceptance packet ready in support/sidecars/FBP-013B/FBP-013B-SIDECAR-ACCEPTANCE.md. It preserves the current machine truth for the smoke evidence pack, keeps the formal dependency map aligned with FBP-013B.depends_on=[FBP-008,FBP-009,FBP-011,FBP-012], distinguishes the committed WE-004/4dd3b0a baseline from the live under-review worktree delta (system bootstrap actor, /api/health wording, and deploy-workflow relationship), and frames the three parent acceptance checks plus the FBP-013A live-artifact boundary. Support artifact only; no canonical truth changes."
```

---

## 9) Reviewer Actions

**Reviewer（Codex）-> review_approved**

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve FBP-013B-SIDECAR-ACCEPTANCE "FBP-013B acceptance packet ready: dependency map stays aligned with FBP-013B.depends_on=[FBP-008,FBP-009,FBP-011,FBP-012], support-only scope is preserved, the current parent review surface vs committed baseline is clearly distinguished, and the packet correctly keeps the live staging smoke artifact in FBP-013A rather than fabricating CI truth in FBP-013B."
```

**Reviewer（Codex）-> reopen**

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen FBP-013B-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / dependency-map drift / review-surface error / scope violation]"
```

---

## 10) Owner Closeout Steps

審查通過（`review_approved`）後，由 Owner（Codex2）正式收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex2 python3 scripts/ai_status.py done FBP-013B-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; FBP-013B acceptance packet and dependency map are ready in support/sidecars/FBP-013B/ for the parent reviewer and FBP-013D closeout consumers."
```

---

## 11) Notes for Parent Owner / Downstream Consumers

1. 這份 packet 不是 parent reviewer verdict；它只是把 `FBP-013B` 的 acceptance framing、dependency map、review hotspots、以及 live-artifact boundary 壓縮成 support artifact。
2. 若 `FBP-013B` 後續再發生 reviewer churn，本 packet 不需要改 scope，只需保持「latest shared reviewer truth」與 evidence boundary 一致。
3. 若未來 live staging smoke 被真正接入 `.github/workflows/deploy-staging.yml`，應由 parent smoke pack或 staging pack更新該事實；不要用這份 sidecar 覆蓋既有歷史。
