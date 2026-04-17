# FBP-007 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `FBP-007` — retire `apps/tenant-portal-web` as a production target  
**Current Owner:** Codex  
**Assigned Reviewer:** Claude  
**Parent Owner / Reviewer:** Claude / Codex  
**Last Revised:** 2026-04-15 (UTC)  
**Status:** IN PROGRESS — pending handoff to Claude

---

## 1) Scope Boundary (Non-Negotiable)

本 sidecar 僅建立與維護支援性材料。不得修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不得改寫主線契約。

- **In scope:** acceptance checklist、dependency map、sunset / rollout evidence inventory、reviewer / owner handoff 指引。
- **Out of scope:** 產品語意調整、核心契約變更、runtime 程式碼修改、或直接改寫 parent task machine truth。

---

## 2) Current State Baseline (Machine Truth)

以目前共享狀態與 repo 現況為準（2026-04-15 UTC）：

- 父任務 `FBP-007` 在 `ai-status.json` 中為 `done`，Owner=`Claude`，Reviewer=`Codex`，`depends_on=["FBP-006"]`。
  - machine-truth closeout commit 為 `3ef9079b9d29616c67d9a52512a00a7a160bcabf`
  - `commit_subject`: `fix(FBP-007): retire tenant-portal-web from active deploy/runtime targets`
  - parent acceptance 僅有以下三條 machine truth：
    - `文件與 topology records 明確標示 internal tenant portal 不再是 production tenant portal`
    - `active rollout / master plan 不再把 apps/tenant-portal-web 當作生產 UI`
    - `hard-delete 或短期 reference shell 的 sunset 規則已被執行並留下紀錄`
- 本 sidecar `FBP-007-SIDECAR-ACCEPTANCE` 在 `ai-status.json` 中為 `in_progress`，Owner=`Codex`，Reviewer=`Claude`，formal artifact path 為 `support/sidecars/FBP-007/FBP-007-SIDECAR-ACCEPTANCE.md`。
- parent closeout review chain 由 `ai-status.json` handoffs 與 `ai-activity-log.jsonl` 共同保留：
  1. `2026-04-15T18:17:50Z` — Claude handoff：初版 commit `16de9df` 完成 README / topology / sunset record，主張三條 acceptance 已成立。
  2. `2026-04-15T18:19:53Z` — Codex review blocked：acceptance[2] 尚未成立，active deploy/runtime targets 仍殘留。
  3. `2026-04-15T18:22:14Z` — Claude handoff：commit `3ef9079` 已移除 `.github/workflows/deploy-staging.yml`、`docker-compose.prod.yml` 的 active target，並將 `infra/gcp/staging/tenant-portal-web-service.yaml` 轉為 frozen reference。
  4. `2026-04-15T18:24:33Z` — Codex 再次 block：`infra/gcp/staging/README.md` 與 `docs/04-uat/phase1-uat-scenarios.md` 仍保留 active rollout / UAT reference。
  5. `2026-04-15T18:27:03Z` — Claude handoff：上述 rollout / UAT references 已改為 `tenant-commute-hub` 或標示 RETIRED。
  6. `2026-04-15T18:29:22Z` — Codex review approved：三條 acceptance 全數成立。
  7. `2026-04-15T18:30:33Z` — Claude 正式收尾 parent task 為 `done`。

### Closeout Nuance

- `16de9df` 是 sunset scaffolding 的先行實作證據，但 **不是** 最終 machine-truth closeout commit。
- `FBP-007` 真正完成關門的關鍵是 `3ef9079` 加上後續補齊 `infra/gcp/staging/README.md` / `docs/04-uat/phase1-uat-scenarios.md` 的 review loop。
- 本 packet 會保留這條 review chain，但不改寫 parent task row 中的 `commit_hash=3ef9079...`。

---

## 3) Parent Acceptance Criteria Evaluation

以下三條 acceptance criteria 直接引自 `ai-status.json` -> `FBP-007.acceptance`。

| Parent AC                                                                                 | Verdict | Evidence Anchors                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `文件與 topology records 明確標示 internal tenant portal 不再是 production tenant portal` | PASS    | `TARGET_ARCHITECTURE.md`, `ROADMAP.md`, `apps/tenant-portal-web/README.md`, `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/consensus-packet.md`, `docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md` 一致把 `tenant-commute-hub` 定義為唯一 production tenant UI，並把 `apps/tenant-portal-web` 標示為 retired / frozen reference |
| `active rollout / master plan 不再把 apps/tenant-portal-web 當作生產 UI`                  | PASS    | `.github/workflows/deploy-staging.yml`, `docker-compose.prod.yml`, `infra/gcp/staging/tenant-portal-web-service.yaml`, `infra/gcp/staging/README.md`, `docs/04-uat/phase1-uat-scenarios.md` 均已移除 active production posture，並改成 RETIRED / do-NOT-deploy / tenant-commute-hub 指向                                                                                    |
| `hard-delete 或短期 reference shell 的 sunset 規則已被執行並留下紀錄`                     | PASS    | `apps/tenant-portal-web/README.md` 含 `SUNSET-001-tenant-portal-web` notice；`docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md` 記錄 sunset rationale、execution checklist、topology after sunset，且明確把 hard-delete 留為後續 cleanup task 而非本次 blocker                                                                                            |

### Acceptance Interpretation Guardrail

- acceptance[2] 是本 task 最關鍵且曾兩次被 reviewer 擋下的條件；因此任何 sidecar 摘要都不能只引用 README / sunset record，而必須把 rollout 與 UAT evidence 一起列入。
- acceptance[3] 並 **不** 要求立即 hard-delete；machine truth 允許保留 `frozen reference shell`，前提是 sunset rule 已執行並留下正式記錄。

---

## 4) Dependency Map (Normative Truth Sources)

### 正式上游依賴（Machine-Enforced）

> **唯一共同真相是 `ai-status.json`。**  
> `FBP-007.depends_on=["FBP-006"]`，因此本 parent task 的正式 upstream dependency 只有 `FBP-006`。

| Dep    | Source    | Status | Notes                                                                                                   |
| ------ | --------- | ------ | ------------------------------------------------------------------------------------------------------- |
| D-UP-1 | `FBP-006` | `done` | `tenant-commute-hub` cutover 必須先完成，internal `apps/tenant-portal-web` 才能安全退出 active topology |

### Sidecar Task Dependency

| Dep    | Source                                              | Status   | Notes                                                          |
| ------ | --------------------------------------------------- | -------- | -------------------------------------------------------------- |
| D-SC-1 | `FBP-007-SIDECAR-ACCEPTANCE.depends_on=["FBP-006"]` | mirrored | sidecar helper 與 parent 任務同樣以 `FBP-006` 作為正式前置條件 |

### Informative Context Baseline（非正式依賴，僅供 reviewer / owner 理解）

| Context                   | Anchor                                                                                            | Why It Matters                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Tenant topology decision  | `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/consensus-packet.md` §3.2 | 定義 `tenant-commute-hub` 為唯一 tenant UI、`apps/tenant-portal-web` 為 retire target |
| Tenant cutover completion | `FBP-006` closeout and `support/sidecars/FBP-006/FBP-006-SIDECAR-BFF-HANDOFF.md`                  | 說明 retire 行動是建立在 cutover 已完成之後，而非先砍 production tenant UI            |
| Formal sunset record      | `docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md`                              | 記錄 sunset rule、checklist、以及 hard-delete deferred posture                        |

### Reviewer Guardrail

- 不得把 `FBP-005`、`WD-*` 或其他 Wave D implementation slices 補寫成 `FBP-007` 的 formal upstream deps；machine truth 沒有這樣定義。
- 也不得把未來 hard-delete cleanup 腦補成 `FBP-007` 尚未完成的 blocker；sunset record 已明確將其標為 `deferred`。

---

## 5) Artifact Map & Evidence Inventory

### Parent Task Artifact Map

| Surface                       | Path                                                                 | Evidence Role                                                                       |
| ----------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Production-topology statement | `TARGET_ARCHITECTURE.md`                                             | 明示 `apps/tenant-portal-web` retired，production tenant UI 為 `tenant-commute-hub` |
| Master-plan statement         | `ROADMAP.md`                                                         | 將所有 active tenant portal references 固定到 `tenant-commute-hub`                  |
| Frozen reference shell notice | `apps/tenant-portal-web/README.md`                                   | app-level SUNSET / NOT PRODUCTION notice                                            |
| Formal sunset record          | `docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md` | 決策、rationale、execution checklist、post-sunset topology                          |
| Deploy workflow retirement    | `.github/workflows/deploy-staging.yml`                               | build / deploy step 移除，僅保留 retired comment                                    |
| Runtime topology retirement   | `docker-compose.prod.yml`                                            | active compose topology 中已移除 `tenant-portal-web` service                        |
| Frozen staging YAML           | `infra/gcp/staging/tenant-portal-web-service.yaml`                   | 標記 RETIRED / frozen reference only                                                |
| Staging ops documentation     | `infra/gcp/staging/README.md`                                        | service map / files section 不再把其當 live service                                 |
| UAT surface map               | `docs/04-uat/phase1-uat-scenarios.md`                                | Tenant Portal 改指 `tenant-commute-hub`，legacy app 僅保留 frozen-reference note    |

### Evidence Inventory

| #    | Evidence Item             | Anchor                                                                                               | Notes                                                                                                                    |
| ---- | ------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| E-1  | Parent task machine state | `ai-status.json` -> `FBP-007`                                                                        | `done`, owner `Claude`, reviewer `Codex`, `depends_on=["FBP-006"]`, `commit_hash=3ef9079...`                             |
| E-2  | Sidecar machine state     | `ai-status.json` -> `FBP-007-SIDECAR-ACCEPTANCE`                                                     | owner `Codex`, reviewer `Claude`, helper kind `acceptance_packet`, `mutates_canonical=false`                             |
| E-3  | Initial sunset handoff    | `ai-status.json` handoff at `2026-04-15T18:17:50Z`                                                   | `16de9df` delivered initial README / topology / sunset record updates                                                    |
| E-4  | First reviewer block      | `ai-status.json` handoff at `2026-04-15T18:19:53Z`                                                   | acceptance[2] failed because active deploy/runtime artifacts remained                                                    |
| E-5  | Rollout target removal    | `ai-status.json` handoff at `2026-04-15T18:22:14Z`                                                   | `3ef9079` removed workflow/compose active target posture and froze service YAML                                          |
| E-6  | Second reviewer block     | `ai-status.json` handoff at `2026-04-15T18:24:33Z`                                                   | rollout docs / UAT references still stale                                                                                |
| E-7  | Final re-handoff          | `ai-status.json` handoff at `2026-04-15T18:27:03Z`                                                   | `infra/gcp/staging/README.md` and `docs/04-uat/phase1-uat-scenarios.md` aligned to retired posture                       |
| E-8  | Final approval + closeout | `ai-status.json` handoff at `2026-04-15T18:29:22Z` and parent row `last_update=2026-04-15T18:30:33Z` | reviewer approved, owner finalized                                                                                       |
| E-9  | Sunset notice             | `apps/tenant-portal-web/README.md`                                                                   | app is retained only as frozen reference shell                                                                           |
| E-10 | Sunset checklist          | `docs/02-architecture/authority/fbp-007-tenant-portal-web-sunset.md`                                 | deploy pipeline / compose / staging YAML / active rollout checklist all marked `done`; hard-delete explicitly `deferred` |
| E-11 | UAT redirect              | `docs/04-uat/phase1-uat-scenarios.md`                                                                | Tenant Portal surface now mapped to `tenant-commute-hub`                                                                 |

---

## 6) Sidecar Acceptance Criteria

### AC-S1 — 僅建立 / 更新 support artifact，未改 canonical truth

- [x] 本 helper 的輸出限於 `support/sidecars/FBP-007/FBP-007-SIDECAR-ACCEPTANCE.md`
- [x] 未修改任何 L1 canonical truth、核心 runtime / contract / registry / governance 檔案
- [x] `ai-status.json` / `current-work.md` / `ai-activity-log.jsonl` 的狀態更新只透過 `scripts/ai_status.py` 執行

### AC-S2 — Packet 對齊 parent / sidecar machine truth

- [x] 直接採用 `FBP-007.acceptance` 三條 parent acceptance，未自增 / 自刪條件
- [x] formal dependency map 嚴格對齊 `FBP-007.depends_on=["FBP-006"]`
- [x] sidecar 自身 `depends_on=["FBP-006"]` 的 mirrored relation 有被保留
- [x] review chain 正確區分 `16de9df` 初版 handoff 與 `3ef9079...` 最終 closeout evidence

### AC-S3 — Packet 包含可執行 handoff / review / closeout 指令

- [x] §8 提供 owner -> reviewer handoff 指令
- [x] §9 提供 reviewer approve / reopen 指令
- [x] §10 提供 owner closeout 指令

---

## 7) Reviewer Focus (Claude)

Claude 審查此 sidecar 時，應優先確認：

1. 這份 packet 是否仍是 support-only，沒有改寫 canonical / runtime truth。
2. dependency map 是否嚴格遵守 `FBP-007.depends_on=["FBP-006"]`，沒有把其他 tenant slices 腦補成 formal blockers。
3. acceptance[2] 的 evidence 是否完整包含 workflow、compose、staging YAML、staging README 與 UAT surface，不是只看 sunset doc。
4. packet 是否正確保留 `16de9df` 為 superseded precursor、`3ef9079...` 為 machine-truth closeout commit 的差異。
5. hard-delete `deferred` 是否被正確描述成後續 cleanup，而非 parent 未完成事項。

**建議核准用語：**

> `FBP-007 acceptance packet ready: dependency map stays aligned with machine truth (FBP-006 only), sunset and rollout evidence are packaged accurately, and the 16de9df -> 3ef9079 closeout chain is preserved as support-only material.`

**建議退回用語：**

> `packet needs revision: [specify dependency-map drift / sunset-evidence mismatch / review-chain mismatch / scope violation]`

---

## 8) Handoff Commands (Executable)

**Owner（Codex）-> Reviewer（Claude）**

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff FBP-007-SIDECAR-ACCEPTANCE Claude "FBP-007 acceptance packet ready in support/sidecars/FBP-007/FBP-007-SIDECAR-ACCEPTANCE.md. It preserves the parent task's 3 retirement acceptance checks, keeps dependency mapping aligned with machine truth (FBP-007.depends_on=[\"FBP-006\"]), and packages the sunset plus rollout/UAT evidence chain from initial handoff 16de9df through final closeout commit 3ef9079. Support artifact only; no canonical truth changes."
```

---

## 9) Reviewer Actions (Executable)

**Reviewer（Claude）-> review_approved**

```bash
AI_NAME=Claude python3 scripts/ai_status.py approve FBP-007-SIDECAR-ACCEPTANCE "FBP-007 acceptance packet ready: dependency map stays aligned with machine truth (FBP-006 only), sunset and rollout evidence are packaged accurately, and the 16de9df -> 3ef9079 closeout chain is preserved as support-only material."
```

**Reviewer（Claude）-> reopen**

```bash
AI_NAME=Claude python3 scripts/ai_status.py reopen FBP-007-SIDECAR-ACCEPTANCE "packet needs revision: [specify dependency-map drift / sunset-evidence mismatch / review-chain mismatch / scope violation]"
```

---

## 10) Owner Closeout Steps

審查通過（`review_approved`）後，由 Owner（Codex）正式收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done FBP-007-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; FBP-007 acceptance packet and dependency map are ready in support/sidecars/FBP-007/ for sunset-audit and downstream blueprint evidence consumers."
```

---

## 11) Notes for Parent Owner / Downstream Consumers

1. 這份 packet 不是重新審 parent task；`FBP-007` 已在 machine truth 中為 `done`，本 sidecar 只整理 closeout evidence。
2. `apps/tenant-portal-web` 目前的正確 posture 是 `retired / frozen reference shell`，不是 production UI，也不是立即 hard-delete。
3. 若未來要真正刪除該 app，應新開 cleanup task；不要 retroactively 改寫 FBP-007 的 acceptance 定義。
4. 若需要理解 retire 之前的 tenant BFF / frontend handoff 邊界，可搭配 `support/sidecars/FBP-006/FBP-006-SIDECAR-BFF-HANDOFF.md` 一起閱讀。

---

## 12) Change Log

- 2026-04-15 — Codex 建立初版 `FBP-007` acceptance packet，對齊 parent done-state machine truth、`FBP-006` formal dependency、兩輪 review blockers、以及 sunset / rollout / UAT closeout evidence。
