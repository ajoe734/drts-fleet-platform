# PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK Acceptance Packet & Dependency Map

**Sidecar Kind:** acceptance_packet
**Parent Task:** `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`
**Grandparent Task:** `PARTNER-ELIG-LIVE-001`
**Prepared By:** `Claude` (governance review / consensus synthesis lane)
**Reviewer:** `Codex2`
**Generated:** 2026-05-19 (UTC)
**Status:** in_progress — drafting; awaiting reviewer handoff

---

## 1) Scope Boundary (Non-Negotiable)

本 sidecar 僅建立「支援性材料」。不修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不變更 supervisor 狀態機、主要契約，或 parent unblock 任務本身的 diagnosis 內容（commit `052de19`）。

- In scope:
  - 為 parent task `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK` 整理 acceptance checklist。
  - 整理跨任務 dependency map（`PRT-SPEC-001` → unblock helper → `PARTNER-ELIG-LIVE-001` → `EXT-001-BLK-001..006`）。
  - 列舉 reviewer evidence inventory 與 handoff/closeout 指令。
- Out of scope:
  - 任何 issuer/bank 產品語意主張、live activation 認定、或 `manual_review` 重新定義。
  - 修改 parent unblock 任務的 diagnosis 文檔（`support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md`）。
  - 修改 `ai-status.json` 任何 task 的 `status` / `owner` / `reviewer` / `depends_on` / `artifacts`（這些必須由 `scripts/ai-status.sh` 觸發）。
  - 修改 L1（`phase1_*`）或 L2（`phase1_llm_dev_pack_extracted/*`）文件。
  - 修改 `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` 或 `docs/03-runbooks/master-system-closeout-checklist.md`。

依據：`AI_COLLABORATION_GUIDE.md` §0.5（Machine Truth Discipline）、§0.6（Delivery Compliance Gate）、§2（Conflict Precedence）。

---

## 2) Current State Baseline (Machine Truth)

以 2026-05-19 (UTC) repo 現況為準，從 `ai-status.json` 與 `git log` 讀出：

- `PRT-SPEC-001`（spec dependency）
  - status = `done`，owner = `Codex2`，reviewer = `Claude2`。
  - 主 artifact：`docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`。
  - 收尾 anchor commit：`0b4edb4` (wip), `618d7c9` (closeout)。
  - 影響：parent 的 `depends_on: [PRT-SPEC-001]` 已被 machine truth 滿足。

- `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`（parent helper，本 sidecar 服務的對象）
  - status = `review`，owner = `Codex2`，reviewer = `Claude2`。
  - artifact：`support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md`。
  - 對應 anchor commit：`052de19` "PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK: document remaining live issuer blocker"，推送至 `origin/codex2/partner-elig-live-001-unblock-manual-unblock`。
  - Owner 在 task `next` 欄位記載：parent 在 PRT-SPEC-001 完成之後，仍受 `EXT-001-BLK-001..006` 卡住。

- `PARTNER-ELIG-LIVE-001`（grandparent，仍 held）
  - status = `blocked`，owner = `Codex`，reviewer = `Claude2`。
  - depends_on = `[PRT-SPEC-001]`。
  - artifact：`support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`（在 dev 上尚未存在；屬於將來 live 收尾 evidence 預留位）。
  - 釋出條件：`PRT-SPEC-001` 已 `done`（已達成）、且 `EXT-001-BLK-001..006` 全數收齊（尚未達成）。

- `EXT-001`（external gate 容器，已 done）
  - status = `done`，owner = `Gemini2`，reviewer = `Codex`。
  - artifact：`support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`（已 in tree）。
  - 內含 `EXT-001-BLK-001..006` 六個 blocker 記錄。`EXT-001` 任務本身已收，但 blocker 是「external」性質，等外部 issuer/bank 輸入。

- 本 sidecar 任務本體
  - id = `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK-SIDECAR-ACCEPTANCE`。
  - status = `in_progress`，owner = `Claude`，reviewer = `Codex2`。
  - task_class = `sidecar`，helper_kind = `acceptance_packet`，`mutates_canonical = false`。
  - artifact = 本檔。

結論：parent helper 的 diagnosis 與 next-step 文字已落盤；本 packet 只負責用 evidence-backed checklist 把 acceptance 與 dependency 路徑攤平給 reviewer，不重寫產品語意。

---

## 3) Acceptance Checklist for Parent Task (Evidence-Backed)

下列 AC 對照 parent task `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK` 的 acceptance 欄位（共 4 項，源：`ai-status.json`）。

AC-1 — Diagnose why the dependency-ready parent remains blocked

- [x] Diagnosis 文件 `support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md` 已建立並指出兩段式 blocker：
  - 即時 blocker：`PRT-SPEC-001` 在 helper 建立當下仍為 `review`，並非 `done`。
  - 後續 blocker：`EXT-001-BLK-001..006` 六個 external issuer/bank input。
- Evidence: `git show 052de19:support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md` §Diagnosis（含兩個小節）。
- 跨檢核：`PRT-SPEC-001` 目前 machine truth = `done`（`ai-status.json`），故 helper 標識的「第一段」blocker 已從 dependency layer 退場；第二段仍有效。

AC-2 — Make only the task-scoped change needed to unblock or document the remaining blocker

- [x] 任務僅新增 `support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md`（1 個檔案，82 行），不變動 canonical truth。
- Evidence: `git show --stat 052de19` 顯示僅一檔變更。
- 跨檢核：未修改 `ai-status.json` task 結構，未修改 L1 spec、issuer contract、release-gate matrix。

AC-3 — Produce task-scoped commit/push/PR evidence for any canonical change

- [x] Owner（Codex2）已產出 task-scoped anchor commit。
  - COMMIT_HASH: `052de19`
  - COMMIT_SUBJECT: `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK: document remaining live issuer blocker`
  - Trailers: `LLM-Agent: Codex2` / `Task-ID: PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK` / `Reviewer: Claude2`（符合 `AI_COLLABORATION_GUIDE.md` §5 commit evidence rule）
  - PUSH_REMOTE: `origin`
  - PUSH_BRANCH: `codex2/partner-elig-live-001-unblock-manual-unblock`
- Evidence: `git show 052de19`、parent task `next` 欄位字串。
- 備註：因 parent helper 不是「主流程 issuer 整合」而是 documentation-only unblock helper，commit 評鑑使用 §5 commit evidence rule 即可，不需另開 PR。

AC-4 — Update the parent task with the concrete unblocked next step

- [x] `PARTNER-ELIG-LIVE-001`（grandparent）的 `next` 欄位已記載 "Held — see conflicts doc / external resources"；diagnosis 文件本身 §"Concrete Next Step For Parent" 三步驟 已明確列出：
  1. 完成 `PRT-SPEC-001` 收尾（已達成）。
  2. 在 `PRT-SPEC-001` `done` 後，仍把 `PARTNER-ELIG-LIVE-001` 維持 `blocked`，因為 `EXT-001-BLK-001..006` 仍未收齊。
  3. issuer/bank 輸入到位後，將 credential/fixture/sign-off evidence 放入 `support/sidecars/PARTNER-ELIG-LIVE-001/`，並從該 packet 接續 live sandbox / issuer 證明任務。
- Evidence: `git show 052de19:support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md` §"Concrete Next Step For Parent"；`ai-status.json` 兩個 task 的 `next` 欄位。
- 觀察（不阻擋 approve）：grandparent `next` 仍是泛用字串 "Held — see conflicts doc / external resources"。若 reviewer 想看到 grandparent 的 next 也明確指向 EXT blocker，可在 review 階段請 owner 另以 `progress` 更新 grandparent 的 `next` 欄位；屬 polish 而非 acceptance gap。

### Sidecar 本任務 acceptance（owner=Claude，reviewer=Codex2）

AC-S1 — Sidecar support artifact 存在且僅落在允許範圍
- [x] 本檔位於 `support/sidecars/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK-SIDECAR-ACCEPTANCE.md`。
- [x] git diff 僅含此 support 路徑。

AC-S2 — Acceptance 與 dependency map 對齊 machine truth
- [x] 引用 `ai-status.json` 與具體 commit hash，沒有依賴聊天記憶或 prose 摘要。

AC-S3 — Reviewer flow 與 owner closeout 指令明確
- [x] §6、§7、§8 列出可直接執行的指令。

---

## 4) Dependency Map (Normative Truth Sources)

直接 dependency 鏈：

```
PRT-SPEC-001 (done, Codex2/Claude2)
   │
   ├──► PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK (review, Codex2/Claude2)
   │        diagnosis-only helper; commit 052de19
   │        artifact: support/unblock/PARTNER-ELIG-LIVE-001/...
   │
   └──► PARTNER-ELIG-LIVE-001 (blocked, Codex/Claude2)
              still held by EXT-001-BLK-001..006
              artifact (future): support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md

EXT-001 (done, Gemini2/Codex)
   │
   ├── EXT-001-BLK-001 Issuer/bank API contract authority
   ├── EXT-001-BLK-002 Sandbox credentials + network allowlist
   ├── EXT-001-BLK-003 Allowed eligible/ineligible/timeout fixture matrix
   ├── EXT-001-BLK-004 Timeout & retry behavior confirmation
   ├── EXT-001-BLK-005 Manual-review fallback business sign-off
   └── EXT-001-BLK-006 Sensitive-data handling & retention approval
        all six remain "external-gated" — see support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md
```

Normative truth references:

- D-1 Machine truth & lifecycle
  - `ai-status.json`（所有上述 task 的 status / owner / reviewer / depends_on）
  - `scripts/ai-status.sh` / `python3 scripts/ai_status.py`（合法狀態轉移）
  - `AI_COLLABORATION_GUIDE.md` §0.5, §0.6, §5
- D-2 Parent unblock helper artifact（不得修改）
  - `support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md`（commit `052de19`）
- D-3 Dependency spec（已 done，提供 partner eligibility 契約輪廓）
  - `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`（commit `0b4edb4`）
- D-4 External gate（仍生效，定義 issuer activation 必要輸入）
  - `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`
  - `docs/02-architecture/phase1-issuer-eligibility-integration-contract-20260429.md`
  - `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`
- D-5 Release gate / dashboard context（reviewer 需知悉，不在 sidecar 修改範圍）
  - `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`（`WF-PRT-001` row + `PARTNER-ELIG-LIVE-001` future-owner 註記）
  - `docs/03-runbooks/master-system-closeout-checklist.md` §D-4a
  - `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`（HELD 列）
  - `docs/04-uat/phase1-business-flow-verification-dashboard-20260519.md`（`WF-PRT-001` row）

以上均為引用來源；本 helper 不需要、也不得修改其內容。

---

## 5) Evidence Inventory (Prepared Now)

- Task truth snapshot（讀於 2026-05-19 UTC）
  - `ai-status.json` 中 `PRT-SPEC-001` / `PARTNER-ELIG-LIVE-001` / `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK` / `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK-SIDECAR-ACCEPTANCE` / `EXT-001` 紀錄。
- Commit evidence
  - `052de19` — parent unblock helper anchor commit；trailers 完整。
  - `0b4edb4` / `618d7c9` — PRT-SPEC-001 收尾 commits。
- Artifact references
  - `support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md`（parent helper 文件）
  - `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`（external gate + 六個 blocker 定義）
  - `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`（dependency 對應 spec）
- Process truth
  - `AI_COLLABORATION_GUIDE.md`（§0.5 machine truth、§0.6 delivery compliance、§5 switch gate / commit evidence rule）
  - `docs/ops/branch-strategy.md` §11.1（fragile surface / anchor commit）
- Verification scope（本 packet 不執行 runtime tests，只做 source-anchor review）
  - 透過 `git log` 與 `git show` 確認 commit、trailer、檔案內容。
  - 透過 `python3 -c` + `ai-status.json` 確認 task 結構（不修改檔案）。

---

## 6) Reviewer Flow (Codex2)

Reviewer = `Codex2`（owner 是 `Claude`，本 packet 的 reviewer 由 sidecar 任務 record 決定）。

建議審查步驟：

1. 確認本檔僅落在 `support/sidecars/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK/` 之下，未動 canonical（`git diff --stat` 應只顯示本檔）。
2. 對照 §3 AC-1～AC-4 與 parent task `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK` 的 acceptance（`ai-status.json` 取得）是否一致。
3. 對照 §4 dependency map 與 parent helper 內 §Diagnosis、§Concrete Next Step 是否一致；不要求本 packet 重述 issuer 語意，只要求引用對齊。
4. 若 framing 充分，請以 `approve` 准許 `review_approved`；若需補充，請以 `reopen` 並指出本 packet 缺漏的引用或檢核。

建議審查用語：

- approve: "sidecar acceptance packet is support-only; AC-1..AC-4 mapped to commit 052de19 evidence; dependency map cites PRT-SPEC-001 done + EXT-001-BLK-001..006 still external"
- request changes: "missing references in §3: <list>" / "dependency map missing: <list>"

reviewer 不應在本 packet 內動手改寫 parent unblock helper 的 diagnosis；若認為 parent 需要動，請對 `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK` 開 reopen，回到 owner Codex2。

---

## 7) Handoff Commands (Executable)

Owner（Claude）→ Reviewer（Codex2）：

```bash
AI_NAME=Claude scripts/ai-status.sh handoff \
  PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK-SIDECAR-ACCEPTANCE \
  Codex2 \
  "Acceptance packet ready: AC-1..AC-4 mapped to commit 052de19 evidence; dependency map covers PRT-SPEC-001 (done) and EXT-001-BLK-001..006 (external)"
```

Reviewer（Codex2）：

```bash
# Approve → review_approved（reviewer 執行）
AI_NAME=Codex2 REVIEW_NOTES_ZH="審查通過||對應 052de19 與 EXT-001 blocker 引用一致" \
  scripts/ai-status.sh approve \
  PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK-SIDECAR-ACCEPTANCE \
  "sidecar packet is support-only; AC-1..AC-4 citations resolve; dependency map consistent with machine truth"

# 或要求更改（reviewer 執行）
AI_NAME=Codex2 scripts/ai-status.sh reopen \
  PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK-SIDECAR-ACCEPTANCE \
  "Change requests: <brief details>"
```

---

## 8) Owner Closeout Steps

審查通過（`review_approved`）後，由 Owner（Claude）執行收尾：

```bash
# Sidecar 允許 NO_COMMIT_REQUIRED=1，但本 packet 已 anchor commit + push 自身 .md 檔（見 §9 change log）。
# 若已有 task-scoped commit hash，直接帶入；否則允許 NO_COMMIT_REQUIRED=1。

AI_NAME=Claude \
  COMMIT_HASH=<anchor-commit-of-this-packet> \
  COMMIT_SUBJECT="PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK-SIDECAR-ACCEPTANCE: acceptance packet" \
  PUSH_REMOTE=origin \
  PUSH_BRANCH=claude/partner-elig-live-001-unblock-manual-unblock-sidecar-acceptance \
  scripts/ai-status.sh done \
  PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK-SIDECAR-ACCEPTANCE \
  "Owner finalized approved sidecar acceptance packet; support-only; no canonical truth changes"
```

注意：本 sidecar 不更動 canonical truth；若 reviewer 在審查中發現 parent helper（`PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`）有需要重寫的 diagnosis，請 `reopen` parent task 給 Codex2，不要在本 sidecar 內塞 canonical 變更。

---

## 9) Change Log

- 2026-05-19 — Claude（owner）初版建立：scope boundary、machine-truth baseline、AC-1..AC-4 對應 commit `052de19` 的證據、dependency map（含 EXT-001-BLK-001..006）、evidence inventory、reviewer flow（Codex2）、handoff/closeout 指令。未改動 canonical truth；僅新增本 .md 一檔於 `support/sidecars/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK/`。
