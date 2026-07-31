# STAGE1-RELEASE-CANDIDATE-20260731 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `STAGE1-RELEASE-CANDIDATE-20260731` — Prepare Stage 1 Release Candidate baseline  
**Current Sidecar Owner:** `Codex2`
**Assigned Reviewer:** `Gemini`  
**Last Revised:** `2026-07-31T20:02:00Z (UTC)`
**Status:** `review_approved` (support packet prepared and approved for parent task assembly)

---

## 1) Scope Boundary

本 sidecar 只整理 `STAGE1-RELEASE-CANDIDATE-20260731` 的 acceptance checklist、dependency map 與 support packet，不改動 canonical truth，亦不代替 parent 任務進行代碼層面的主線合併。

- **In scope:** Support-only acceptance framing, predecessor evidence map, integration verification checklist, external gate exclusion list, reviewer hotspots.
- **Out of scope:** 修改 L1 canonical truth（PRD / System Analysis / Service Contracts / Migration Plan）、核心 contract 真相、主要 runtime / registry / governance 實作。

---

## 2) Current State Baseline & Parent Task Context

### Parent Task: `STAGE1-RELEASE-CANDIDATE-20260731`
- **Goal:** 從前置完成任務（`STAGE1-UAT-CLOSURE-20260731`、`STAGE1-PILOT-RAILS-20260731`、`STAGE1-UAT-PG-GATE-20260731`）取得精確 commit 證據，整合至 release candidate 分支，完成完整驗證矩陣並開立 PR。
- **Status:** `in_progress` (Machine truth)

### Acceptance Criteria Checklist for Parent Task
1. **Predecessor Evidence Gathering:** 從前置任務之 machine truth 取得精確 commit SHA。
2. **Conflict Resolution:** 解衝突時保留 current `dev` 真相與已驗證修正，不帶入無關工作樹殘留。
3. **Full Repo Verification:** 執行完整 `lint`、`typecheck`、`unit`、`integration`、`build` 及 Stage 1 smoke。
4. **Single Release Branch & PR:** 推送至單一 release branch 並開立 PR 到 `dev`，確保 CI 全綠。
5. **External Gate Exclusions:** PR 說明中必須明確排除外部四類 gate，且不得將其列為未完成阻斷。

---

## 3) Predecessor Evidence & Dependency Map

| Dependency Task ID | Status | Owner | Reviewer | Commit / Branch Reference | Machine Truth Summary & Evidence |
| ------------------ | ------ | ----- | -------- | ------------------------- | -------------------------------- |
| `STAGE1-UAT-CLOSURE-20260731` | `done` | `Codex2` | `Gemini` | `e6c216c8adde2415b48e8fc5d98388557860406e` (`origin/dev`) | 收斂 controllable Stage 1 UAT & code gaps，修復 quota consume 跨程序 race condition。已合併至 `dev`。 |
| `STAGE1-PILOT-RAILS-20260731` | `done` | `Gemini` | `Codex` | `9d92287bb719346331971363ef8af0ac6b388b99` (`origin/gemini/stage1-pilot-rails-20260731`) | 修正 controllable staging/prod rails，Concierge retired，Referral partner-scoped entry。 |
| `STAGE1-UAT-PG-GATE-20260731` | `done` | `Codex` | `Codex2` | `a60a5915a2ac2468607dc0947b1ce338b5d4a698` (`origin/codex/stage1-uat-pg-gate-5fa88a`) | 證明真實 PostgreSQL 條件下之 replay, rollback, worker crash retry 及 serial CI。 |

---

## 4) Integration & Release Verification Checklist

在組裝 `STAGE1-RELEASE-CANDIDATE-20260731` 時，應按序執行以下驗證：

1. **Cherry-Pick / Merge Predecessors:**
   - 包含 `e6c216c8adde2415b48e8fc5d98388557860406e` (base in `dev`)
   - 包含 `9d92287bb719346331971363ef8af0ac6b388b99` (from `origin/gemini/stage1-pilot-rails-20260731`)
   - 包含 `a60a5915a2ac2468607dc0947b1ce338b5d4a698` (from `origin/codex/stage1-uat-pg-gate-5fa88a`)
2. **Quality Commands Execution:**
   - `npm run lint` / `pnpm lint`
   - `npm run typecheck` / `pnpm typecheck`
   - `npm run test` / `pnpm test`
   - `npm run test:integration`
   - `npm run build`
3. **Excluded External Gates (Must Not Block Release):**
   - 外部支付 / Billing APIs (External Payment Gateway)
   - 外部電信 / SMS Services
   - 外部 Vendor CTI Integration
   - 外部第三方 Mobile Store Distribution

---

## 5) Reviewer Hotspots & Verification Anchors

1. **Dependency SHA Precision:** 確認所有前置 commit SHA 均完全對齊 machine truth 中的 `commit_hash` / `push_commit`。
2. **Support-Only Compliance:** 本任務僅建立 `support/sidecars/STAGE1-RELEASE-CANDIDATE-20260731/STAGE1-RELEASE-CANDIDATE-20260731-SIDECAR-ACCEPTANCE.md`，無任何 L1/canonical 檔案修改。
3. **Handoff Alignment:** 完成準備後，配合 supervisor status 進行手續與審查記錄。

---

## 6) Change Log

- `2026-07-31T19:44:00Z` — 初版建立：彙整 parent task `STAGE1-RELEASE-CANDIDATE-20260731` 前置依賴與驗收清單，建立 support sidecar acceptance packet。
- `2026-07-31T20:02:00Z` — owner closeout refresh：補充 support-only closeout evidence，確認本 sidecar 仍僅含 support artifact，供 `review_approved -> done` 正式收尾使用。

---

## 7) Owner Closeout Evidence

- **Closeout Owner:** `Codex2`
- **Approval Source:** `scripts/ai-status.sh show STAGE1-RELEASE-CANDIDATE-20260731-SIDECAR-ACCEPTANCE` 顯示 `status: review_approved`、`reviewer: Gemini`
- **Artifact Scope Check:** 僅確認並更新 `support/sidecars/STAGE1-RELEASE-CANDIDATE-20260731/STAGE1-RELEASE-CANDIDATE-20260731-SIDECAR-ACCEPTANCE.md`
- **Focused Verification:**
  - `git diff --check -- support/sidecars/STAGE1-RELEASE-CANDIDATE-20260731/STAGE1-RELEASE-CANDIDATE-20260731-SIDECAR-ACCEPTANCE.md`
  - `git status --short support/sidecars/STAGE1-RELEASE-CANDIDATE-20260731/STAGE1-RELEASE-CANDIDATE-20260731-SIDECAR-ACCEPTANCE.md`
  - `sed -n '1,260p' support/sidecars/STAGE1-RELEASE-CANDIDATE-20260731/STAGE1-RELEASE-CANDIDATE-20260731-SIDECAR-ACCEPTANCE.md`
- **Integration Status Intent:** `not_applicable`，因本任務為 sidecar/support-only artifact，無 deploy target，亦未修改 canonical runtime truth。
