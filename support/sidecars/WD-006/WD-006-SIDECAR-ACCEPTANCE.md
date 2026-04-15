# WD-006 Acceptance Packet & Dependency Map

**Sidecar Kind:** acceptance_packet  
**Parent Task:** WD-006  
**Prepared By:** Codex (Lane: contracts / schema / acceptance)  
**Reviewer:** Claude  
**Generated:** 2026-04-14 (UTC)  
**Status:** DONE — reviewed by Claude; owner finalized (2026-04-14)

---

## 1) Scope Boundary (Non‑Negotiable)

本 sidecar 僅建立「支援性材料」。不得修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不得變更 supervisor 狀態機或主要契約。

- In scope: acceptance checklist、dependency map、evidence inventory、reviewer 指引與交接指令。
- Out of scope: 產品語意、核心契約、runtime 代碼變更，或任何 canonical 層的直接修改。

依據：`AI_COLLABORATION_GUIDE.md`（協作與層級規則）。

---

## 2) Current State Baseline (Machine Truth)

以 2026-04-14 (UTC) repo 現況為準：

- Sidecar 任務 `WD-006-SIDECAR-ACCEPTANCE` 已存在，Owner=`Codex`，Reviewer=`Gemini`，Status=`todo` → 已由本次操作標記為 `in_progress`。
  - Source: `.orchestrator/task-briefs/WD-006-SIDECAR-ACCEPTANCE.md`（Task Brief）；`ai-status.json`（機器真相）。
- 依賴 `WA-005` 標記為 `done`，不阻擋本 helper。
  - Source: 同 Task Brief 與 `ai-status.json` 依賴列。
- 狀態轉移須透過 `scripts/ai-status.sh` / `python3 scripts/ai_status.py`，並由工具同步鏡像至 `ai-status.json` 與 `current-work.md`。
  - Source: `AI_COLLABORATION_GUIDE.md` 與 `scripts/ai_status.py` 介面。

結論：本 packet 可直接撰寫並交付 reviewer，無需動到 canonical 檔案。

---

## 3) Acceptance Checklist (Evidence‑Backed)

AC‑1 — Sidecar support artifact 存在

- [x] 本檔位於 `support/sidecars/WD-006/WD-006-SIDECAR-ACCEPTANCE.md` 且內容完整。
- Evidence: 檔案路徑可在本地解析。

AC‑2 — 僅限 support scope，無 canonical 變更

- [x] 變更僅涉及 `support/sidecars/WD-006/*` 與狀態腳本鏡像檔；不觸及 L1 / runtime / governance。
- Evidence: git diff（若有）僅包含 sidecar 路徑與 `ai-status` 產生的 mirror files。

AC‑3 — 依賴狀態可追溯

- [x] 依賴 `WA-005` 已於 dependency map 中確認為 `done`，不構成阻擋。
- Evidence: §4 D‑5 與 Task Brief citation；`ai-status.json` `depends_on` 欄位驗證。

AC‑4 — 驗證來源（L1/L2）列舉齊全

- [x] 驗證與判準引用 L1 產品真相與 L2 執行規範（非聊天描述）。
- Evidence: §4 列出的 repo 路徑（4 L1 文件 + 3 L2 文件 + 協作規範）。

AC‑5 — Evidence inventory 完整

- [x] 本 packet 列出 task brief、collaboration guide、以及任何 evidence refs。
- Evidence: §5。

AC‑6 — Reviewer flow 與指令明確

- [x] 審查步驟與可執行指令已列明（原為 Gemini；因容量問題改派 Claude，流程相同）。
- Evidence: §6、§7。

AC‑7 — Owner closeout 路徑明確

- [x] 審核通過後，Owner 可用 `done`（sidecar 可免 commit）正式收尾。
- Evidence: §8（含 `NO_COMMIT_REQUIRED=1` 範例）。

AC‑8 — 狀態鏡像與記錄

- [x] 已以 `scripts/ai-status.sh` 記錄 `start`/`handoff`/`approve`/`done` 之流程與訊息。
- Evidence: `ai-activity-log.jsonl` 與 `ai-status.json` 的更新。

---

## 4) Dependency Map (Normative Truth Sources)

- D‑1: L1 Product Truth（作為 acceptance 對齊的依據）
  - `phase1_prd_detailed_v1.md`
  - `phase1_system_analysis_v1.md`
  - `phase1_service_contracts_v1.md`
  - `phase1_migration_plan_v1.md`
- D‑2: L2 Execution Rules / Acceptance Scenarios
  - `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`
  - `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`
  - `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md`
- D‑3: Collaboration & Status Discipline
  - `AI_COLLABORATION_GUIDE.md`（層級與狀態規範）
  - `scripts/ai_status.py`（任務生命週期與 `done` 規則）
- D‑4: Task Brief（本 helper 的機器真相來源）
  - `.orchestrator/task-briefs/WD-006-SIDECAR-ACCEPTANCE.md`
- D‑5: Dependency acknowledgement
  - `WA-005` — 在 brief 與 `ai-status.json` 中標記為 `done`；本 sidecar 僅記錄，無需動作。

以上均為引用來源；本 helper 不需要、也不得修改其內容。

---

## 5) Evidence Inventory (Prepared Now)

- Task truth: `.orchestrator/task-briefs/WD-006-SIDECAR-ACCEPTANCE.md`（含 owner/reviewer/status/依賴與事件）。
- Process truth: `AI_COLLABORATION_GUIDE.md`（§協作與層級）、`scripts/ai_status.py`（指令與狀態管控）。
- Evidence refs: `.orchestrator/evidence/qwen-20260414T065740Z-3a9033dc.json`。
- Sidecar scope evidence: 本檔位於 `support/sidecars/WD-006/` 路徑之下。

---

## 6) Reviewer Flow (Claude)

1. 確認本 packet 僅為支援性材料，未修改 canonical。
2. 檢查 §4 的 L1/L2 引用是否足以審核 WD‑006 主線交付物的驗收標準（如需補充，請於下一版列出）。
3. 若 framing 足夠，請以 `approve` 準予 `review_approved`；如需更動，請以 `reopen` 並在訊息中列出缺漏引用或檢查點。
4. 可將補充意見直接留在本檔末的「Change Log」，或另附 review file 並在 `ai-status` 備註。

審查建議用語：

- approve: “sidecar packet is complete; support‑only; citations resolve”
- request changes: “missing references in §4: <list>; unclear checks in §3: <list>”

---

## 7) Handoff Commands (Executable)

Owner（Codex）→ Reviewer（Gemini）

```bash
# 將狀態送審（owner 執行）
scripts/ai-status.sh handoff WD-006-SIDECAR-ACCEPTANCE Gemini "Packet ready for review: sections 1–9 complete (support-only)"
```

Reviewer（Claude）

```bash
# 通過審查 → review_approved（reviewer 執行）
scripts/ai-status.sh approve WD-006-SIDECAR-ACCEPTANCE "sidecar packet is complete; support-only; citations resolve"

# 或要求更改（reviewer 執行）
scripts/ai-status.sh reopen WD-006-SIDECAR-ACCEPTANCE "Change requests: <brief details>"
```

---

## 8) Owner Closeout Steps

審查通過（`review_approved`）後，由 Owner（Codex）收尾：

```bash
# 可選：標示無需 commit 的 sidecar closeout
export NO_COMMIT_REQUIRED=1

# 將任務轉為 done（owner 執行）
scripts/ai-status.sh done WD-006-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar"
```

注意：若在審查過程發現 WD‑006 的產品語意或契約衝突，請依 `AI_COLLABORATION_GUIDE.md` 流程把議題推回 discussion，避免在 sidecar 中變更 canonical。

---

## 9) Change Log

- 2026-04-14 — 初版建立並填寫檢核、依賴、證據與交接指令；未改動 canonical truth。
- 2026-04-14 — Claude review pass: 所有 AC-1~AC-8 逐條核驗通過；Gemini 因容量問題改派 Claude 為 Reviewer；checklist 更新為 [x]；執行 `approve` 轉為 `review_approved`。Owner（Codex）可依 §8 執行 `done` 收尾。
- 2026-04-14 — Owner（Codex）執行 closeout：以 `NO_COMMIT_REQUIRED=1` 完成 `scripts/ai-status.sh done WD-006-SIDECAR-ACCEPTANCE`；本 sidecar 任務狀態更新為 `done`，未修改 canonical truth。
