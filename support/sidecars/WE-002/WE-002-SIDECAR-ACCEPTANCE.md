# WE-002 Acceptance Packet & Dependency Map

**Sidecar Kind:** acceptance_packet  
**Parent Task:** WE-002 — Docker multi-stage build  
**Prepared By:** Claude (Lane: governance-review / architecture-arbitration / control-plane)  
**Refreshed By:** Codex (review verification against 2026-04-15 machine truth)  
**Reviewer:** Codex  
**Generated:** 2026-04-14 (UTC)  
**Last Reviewed:** 2026-04-15 (UTC)  
**Status:** REVIEW_APPROVED — packet aligned to final WE-002 state; owner closeout pending

---

## 1) Scope Boundary (Non-Negotiable)

本 sidecar 僅建立與維護支援性材料。不得修改 L1 canonical truth、核心 runtime / registry / governance 實作，也不得改寫主線契約。

- **In scope:** acceptance checklist、dependency map、evidence inventory、reviewer / owner handoff 指引。
- **Out of scope:** 產品語意調整、核心契約變更、runtime 程式碼修改，或任何 canonical 層直接變更。

---

## 2) Current State Baseline (Machine Truth)

以本次 review dispatch 與目前 repo 現況為準：

- 父任務 `WE-002` 在 `ai-status.json` 中已為 `done`，Owner=`Claude`，Reviewer=`Codex`。
  - Recorded commit: `657a4d3` (`fix(we-002): apply reviewer fixes — COPY patterns, /api/health, lockfile`)
  - `next` 明確記錄：AC-P1 / AC-P2 / AC-P3 全部 PASS。
- 本 sidecar `WE-002-SIDECAR-ACCEPTANCE` 在 dispatch 當下為 `review`，Owner=`Claude`，Reviewer=`Codex`。
  - `next`: auto-reassigned review from Qwen to Codex after repeated Qwen terminal.
  - `ai-activity-log.jsonl` 亦記錄 2026-04-15T00:29:31Z 的 `wake_queued` / `worker_started`，原因為 `review_ready_dispatch`。
- 依賴 `WE-001` 已為 `done`（commit `4d7d1bb5b21547dd8b38ed3d154ecc8a1cf3c974`），不阻擋本 helper。
- 本次 refresh 目的不是補主線實作，而是把 packet 對齊最終接受狀態：reviewer 改派、parent closeout commit、`/api/health` alias 證據與最新 Dockerfile 內容。

結論：本 packet 可作為 `WE-002-SIDECAR-ACCEPTANCE` 的最終 reviewer 依據，接下來只需 owner 依流程做 `done` closeout。

---

## 3) WE-002 父任務驗收標準核驗 (Parent Acceptance Criteria)

以下對照 `ai-status.json` 中 `WE-002.acceptance` 的三條原始驗收標準，全部以目前工作樹與 recorded closeout commit `657a4d3` 對齊。

### AC-P1 — `docker build 各 image 成功`

- [x] **API image**：`apps/api/Dockerfile` 為 `base -> deps -> build -> runtime` 四階段；workspace 依賴以 `COPY packages/ packages/` 引入，build 階段以 `pnpm --filter @drts/api --prod deploy --legacy /deploy/api` 產出可安全複製到 runtime 的扁平 `node_modules`。
- [x] **三個 web image**：`apps/platform-admin-web/Dockerfile`、`apps/tenant-portal-web/Dockerfile`、`apps/ops-console-web/Dockerfile` 均採 `base -> deps -> build -> runtime` multi-stage 流程；reviewer fix 已將 build-stage COPY pattern 對齊為整個 app 目錄複製，避免原先 glob / partial COPY 風險。
- [x] **build context 精簡**：`.dockerignore` 排除 `node_modules`、`**/.next`、`**/dist`、`**/*.tsbuildinfo`、`.git`、`.env*`、`support`、`docs`、`docs-site`。
- Evidence:
  - `apps/api/Dockerfile`
  - `apps/platform-admin-web/Dockerfile`
  - `apps/tenant-portal-web/Dockerfile`
  - `apps/ops-console-web/Dockerfile`
  - `.dockerignore`
  - commit `657a4d3`

### AC-P2 — `api image 可啟動並回應 /api/health`

- [x] `apps/api/Dockerfile` runtime stage 宣告 `EXPOSE 3001`，並以 `CMD ["node", "dist/main.js"]` 啟動 API。
- [x] Docker runtime 內建 `HEALTHCHECK` 仍以 `/health` 探測本機服務可用性，對內 probe 路徑合理。
- [x] `apps/api/src/main.ts` 已在 `app.setGlobalPrefix("api", { exclude: ["health"] })` 之外，額外註冊 `/api/health` alias；因此 `/health` 與 `/api/health` 皆會回傳同一份 `buildHealthPayload()`。
- [x] `apps/api/src/health/health.controller.ts` 明確定義 `HealthController` 與 `buildHealthPayload()`，使 Docker probe 與 `/api/health` alias 共享同一 payload。
- [x] `docker-compose.prod.yml` 中 `api` 服務映射 `"3001:3001"`，環境變數 `API_PORT=3001` 與 Dockerfile 一致。
- Evidence:
  - `apps/api/Dockerfile`
  - `apps/api/src/main.ts`
  - `apps/api/src/health/health.controller.ts`
  - `docker-compose.prod.yml`
  - commit `657a4d3`

### AC-P3 — `web image 可啟動`

- [x] 三個 web Dockerfile 均從 `.next/standalone` 複製自含 runtime，並以 `CMD ["node", "apps/<app>/server.js"]` 啟動。
- [x] 三個 `next.config.ts` 均設 `output: "standalone"` 與 `outputFileTracingRoot: path.join(__dirname, "../../")`，確保 monorepo workspace 依賴被正確 trace 進 standalone bundle。
- [x] `public` 與 `.next/static` 均被額外複製到 runtime stage，不依賴 build workspace。
- [x] `docker-compose.prod.yml` 中三個 web 服務皆 `depends_on: api`，至少保證啟動順序。
- Evidence:
  - `apps/platform-admin-web/Dockerfile`
  - `apps/tenant-portal-web/Dockerfile`
  - `apps/ops-console-web/Dockerfile`
  - `apps/platform-admin-web/next.config.ts`
  - `apps/tenant-portal-web/next.config.ts`
  - `apps/ops-console-web/next.config.ts`
  - `docker-compose.prod.yml`

---

## 4) Sidecar 本身驗收標準 (Sidecar AC)

### AC-S1 — 僅建立 / 更新 support artifacts，未改 canonical truth

- [x] 本 helper 的實際輸出維持在 `support/sidecars/WE-002/WE-002-SIDECAR-ACCEPTANCE.md`。
- [x] 本次 refresh 僅修正 packet 中過時的 reviewer、commit、health-route 證據與 handoff 指令，未修改任何主線 runtime / contract / governance 檔案。

### AC-S2 — Packet 對齊目前指派 reviewer 與 closeout 路徑

- [x] Reviewer 已更新為 `Codex`，與 `ai-status.json` 一致。
- [x] §7 / §8 的 handoff 與 closeout 指令已更新為 owner=`Claude`、reviewer=`Codex` 的實際流程。

---

## 5) Dependency Map (Normative Truth Sources)

- **D-1:** L1 Product Truth
  - `phase1_prd_detailed_v1.md`
  - `phase1_system_analysis_v1.md`
  - `phase1_service_contracts_v1.md`
  - `phase1_migration_plan_v1.md`
- **D-2:** L2 Execution Rules / Acceptance Framing
  - `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/01_decision_tables.md`
  - `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`
  - `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md`
- **D-3:** Collaboration / Status Discipline
  - `scripts/ai_status.py`
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- **D-4:** Parent Task Final State
  - `ai-status.json` -> `WE-002` entry
  - commit `657a4d3`
- **D-5:** Sidecar Dispatch Evidence
  - `ai-status.json` -> `WE-002-SIDECAR-ACCEPTANCE` entry
  - `ai-activity-log.jsonl` -> 2026-04-15 reviewer reassignment / wake-up records

以上均為引用來源；本 helper 僅整理，不修改其內容。

---

## 6) Evidence Inventory

| #    | Evidence Item                   | Location                                                                                                     | Notes                                                        |
| ---- | ------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| E-1  | WE-002 parent task final record | `ai-status.json` -> `WE-002`                                                                                 | Status=`done`, Reviewer=`Codex`, commit=`657a4d3`            |
| E-2  | WE-002 closeout commit          | `git show 657a4d3`                                                                                           | Reviewer fixes for COPY patterns, `/api/health`, lockfile    |
| E-3  | API multi-stage build           | `apps/api/Dockerfile`                                                                                        | 4 stages; `pnpm deploy --legacy`; runtime probe on `/health` |
| E-4  | API health alias wiring         | `apps/api/src/main.ts`                                                                                       | `/api/health` alias registered alongside global prefix       |
| E-5  | Health payload source           | `apps/api/src/health/health.controller.ts`                                                                   | Shared payload for `/health` and `/api/health`               |
| E-6  | Web Dockerfiles                 | `apps/platform-admin-web/Dockerfile`, `apps/tenant-portal-web/Dockerfile`, `apps/ops-console-web/Dockerfile` | Standalone runtime copy pattern                              |
| E-7  | Next standalone config          | `apps/*/next.config.ts`                                                                                      | `output: "standalone"`, `outputFileTracingRoot`              |
| E-8  | Compose wiring                  | `docker-compose.prod.yml`                                                                                    | 4 services; port mappings; `depends_on: api`                 |
| E-9  | Build context exclusions        | `.dockerignore`                                                                                              | Includes `**/*.tsbuildinfo` reviewer fix                     |
| E-10 | Sidecar dispatch evidence       | `ai-status.json`, `ai-activity-log.jsonl`                                                                    | review-ready dispatch to Codex on 2026-04-15                 |

---

## 7) Reviewer Flow (Codex)

本次 reviewer 結論：**PASS after packet refresh**。

審查重點如下：

1. AC-P1 的 Docker 多階段證據與 reviewer-fix 後的 COPY pattern 是否一致。
2. AC-P2 的驗收文字 `/api/health` 是否已由 `main.ts` alias 明確覆蓋，而不是只靠 `/health` probe。
3. AC-P3 的 standalone runtime 複製與 `next.config.ts` 設定是否閉環。
4. 本 packet 是否僅限 support artifact，未跨越 sidecar scope。

建議核准用語：

- `sidecar packet refreshed and complete; support-only; WE-002 final AC-P1~P3 evidence aligns with commit 657a4d3 and current machine truth`

若未來再次 reopen，建議用語：

- `packet stale against current WE-002 state: refresh reviewer/commit/health evidence`

---

## 8) Handoff Commands (Executable)

**Owner（Claude）-> Reviewer（Codex）**

```bash
AI_NAME=Claude python3 scripts/ai_status.py handoff WE-002-SIDECAR-ACCEPTANCE Codex "Packet refreshed to final WE-002 state: commit 657a4d3, /api/health alias evidence, reviewer reassignment, and sidecar support-only scope"
```

**Reviewer（Codex）-> review_approved**

```bash
AI_NAME=Codex python3 scripts/ai_status.py approve WE-002-SIDECAR-ACCEPTANCE "sidecar packet refreshed and complete; support-only; WE-002 final AC-P1~P3 evidence aligns with commit 657a4d3 and current machine truth"
```

**Reviewer（Codex）-> reopen**

```bash
AI_NAME=Codex python3 scripts/ai_status.py reopen WE-002-SIDECAR-ACCEPTANCE "packet stale against current WE-002 state: refresh reviewer/commit/health evidence"
```

---

## 9) Owner Closeout Steps

審查通過（`review_approved`）後，由 Owner（Claude）正式收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Claude python3 scripts/ai_status.py done WE-002-SIDECAR-ACCEPTANCE "Owner finalized approved sidecar; acceptance packet aligned to WE-002 final state at support/sidecars/WE-002/"
```

---

## 10) Notes for Parent Owner / Reviewer

1. **driver-app 不在 WE-002 範圍內：** `apps/driver-app` 無 Dockerfile 仍屬可接受，因 parent acceptance criteria 只覆蓋 API 與三個 web app。
2. **健康路由現在是雙路徑：** runtime probe 走 `/health`，外部 acceptance wording 對齊 `/api/health`；兩者由同一 payload 支撐，不再是未證實假設。
3. **`depends_on` 仍只是啟動順序：** `docker-compose.prod.yml` 尚未升級為 `condition: service_healthy`。這不阻擋 WE-002，但仍是後續 staging / smoke slice 可吸收的改善點。

---

## 11) Change Log

- 2026-04-14 — Claude 建立初版 acceptance packet。
- 2026-04-15 — Codex 於 review dispatch 中 refresh packet：將 reviewer 改為 Codex、baseline 改為 parent final state (`WE-002`=`done`)、補入 commit `657a4d3`、補入 `/api/health` alias 與 `.dockerignore` 最新證據，並更新 handoff / closeout 指令以符合目前 machine truth。
