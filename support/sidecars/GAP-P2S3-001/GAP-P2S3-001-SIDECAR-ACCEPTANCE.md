# GAP-P2S3-001 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`  
**Parent Task:** `GAP-P2S3-001` — auth: Cloud IAP / OIDC JWT production — replace bootstrap header trust  
**Current Sidecar Owner:** `Codex`  
**Assigned Reviewer:** `Codex2`  
**Parent Owner / Reviewer:** `Gemini` / `(unset in machine truth)`  
**Last Revised:** `2026-04-17T20:15Z (UTC)`  
**Status:** `review_approved` — shared L0 keeps sidecar `GAP-P2S3-001-SIDECAR-ACCEPTANCE` at `review_approved` under owner=`Codex`, reviewer=`Codex2`, `last_update=2026-04-17T20:13:52Z`; Codex2 approval landed at `2026-04-17T20:13:52Z`, and orchestrator routed `owned_finalize_dispatch` back to owner `Codex` at `2026-04-17T20:14:00Z`; the parent `GAP-P2S3-001` itself remains `blocked` under owner=`Gemini` with explicit `NEEDS_HUMAN_GCP_CONSOLE`

---

## 1) Scope Boundary

本 sidecar 只整理 `GAP-P2S3-001` 的 acceptance checklist、dependency map、shared-truth snapshot、repo/test evidence anchors 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務實作 Cloud IAP / OIDC。

- In scope: support-only acceptance framing, dependency mapping, deploy/auth/test baseline capture, reviewer checklist, and handoff / closeout commands.
- Out of scope: NestJS 主線 auth runtime 變更、GCP Console / Cloud IAP 實際設定、workflow secrets / vars provisioning、本體 deploy policy 變更、或任何未經 `scripts/ai_status.py` 的 machine-truth 編修。
- Companion runbook: `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md` breaks the blocker into a manual `D-0` lane and a repo `D-1` lane so the parent can be unblocked without relying on planning prose alone.

---

## 2) Current State Baseline (Shared Truth + Repo Scan)

以 `ai-status.json`、`current-work.md`、`ai-activity-log.jsonl`、`docs-site/index.html` 與目前 repo 掃描為準：

- 父任務 `GAP-P2S3-001` 在 machine truth 中目前是 `blocked`，Owner=`Gemini`，Reviewer unset，且 task note 直接標記：
  - `NEEDS_HUMAN_GCP_CONSOLE: Cloud IAP setup requires manual GCP Console operations (OAuth consent screen, IAP app config). Estimated 1-2h human work before AI can proceed with code changes.`
- 本 sidecar `GAP-P2S3-001-SIDECAR-ACCEPTANCE` 在 machine truth 中目前是 `review_approved`，Owner=`Codex`、Reviewer=`Codex2`、artifact path=`support/sidecars/GAP-P2S3-001/GAP-P2S3-001-SIDECAR-ACCEPTANCE.md`、`last_update=2026-04-17T20:13:52Z`。
- `ai-activity-log.jsonl` / `current-work.md` 顯示此 sidecar 在 `2026-04-17T20:02Z` 到 `20:13Z` 間曾多次於 `Qwen` 與 `Codex2` reviewer routing 之間擺動，主因是 repeated `401 invalid access token or token expired`；但 shared L0 最新穩定狀態已由 `Codex2` 在 `2026-04-17T20:13:52Z` 給出 `review_approved`，且 orchestrator 已在 `2026-04-17T20:14:00Z` 將 `owned_finalize_dispatch` 交回 owner `Codex`。正式 reviewer gate 因此已滿足，當前只剩 owner closeout。
- accepted consensus packet 也把 parent 固定為「`Gemini + 人工`、`XL`、`使用者確認後才能開始`」，不是純 repo 內 code slice。
- planning anchors 已把 Cloud IAP / OIDC 任務的終局和前置講得很清楚：
  - `starter-draft.md` 將 Sprint 1 的 `x-drts-internal-key` middleware 定位成過渡方案，最終目標是移除 `--allow-unauthenticated`、設定 Cloud IAP、NestJS 改驗 `Authorization: Bearer <JWT>`，且明確說明這不是純程式碼任務。
  - `review-round-3.md` 進一步指出：Cloud IAP 需要人工 GCP Console 操作，AI 只能處理程式碼部分，並建議在 Sprint 3 開始前先讓使用者確認配合意願。
- repo auth baseline 仍完全停在 bootstrap-header / internal-key 路線，沒有任何 IAP / OIDC verifier 落地：
  - [`apps/api/src/common/auth/auth.types.ts:30-41`](/home/edna/workspace/drts-fleet-platform/apps/api/src/common/auth/auth.types.ts:30) 把 `AUTH_MODE` 固定為 `bootstrap_headers`，identity shape 只描述 `x-actor-*` / realm / scopes。
  - [`apps/api/src/common/auth/bootstrap-auth.guard.ts:35-114`](/home/edna/workspace/drts-fleet-platform/apps/api/src/common/auth/bootstrap-auth.guard.ts:35) 只會從 bootstrap headers 萃取 identity 並檢查 scopes / realms，沒有 Bearer token parse、JWT verify、JWKS、或 IAP assertion 驗證邏輯。
  - [`apps/api/src/common/auth/internal-key.middleware.ts:84-141`](/home/edna/workspace/drts-fleet-platform/apps/api/src/common/auth/internal-key.middleware.ts:84) 仍以 `x-drts-internal-key` 作為 system / uncovered route 的 environment gate；validated non-system bootstrap identities 還能直接跳過 internal key。
  - [`apps/api/src/app.module.ts:64-91`](/home/edna/workspace/drts-fleet-platform/apps/api/src/app.module.ts:64) 將 `BootstrapAuthGuard` 與 `InternalKeyMiddleware` 掛成全域 auth path，表示 production baseline 仍是 bootstrap flow。
  - [`apps/api/package.json:14-28`](/home/edna/workspace/drts-fleet-platform/apps/api/package.json:14) 沒有 `@nestjs/jwt`、`jose`、`jsonwebtoken`、`passport-jwt` 之類 OIDC/JWT verifier 依賴；repo search 也找不到 `JwtModule` / `verifyIdToken` / `jwks` 相關實作。
- 測試與工具鏈同樣仍以 bootstrap auth 為準：
  - [`apps/api/tests/unit/auth-bootstrap.test.ts:31-419`](/home/edna/workspace/drts-fleet-platform/apps/api/tests/unit/auth-bootstrap.test.ts:31) 鎖住的是 bootstrap headers、internal-key allow/deny、與 route policy 行為，沒有任何 JWT / IAP 測試。
  - [`tests/smoke/README.md:60-77`](/home/edna/workspace/drts-fleet-platform/tests/smoke/README.md:60) 明寫「API uses bootstrap-header authentication — there is no `/api/auth/login` endpoint」，並把 `x-drts-internal-key` 當 staging 可能需要的 gate。
  - [`tests/e2e/lib/helpers.sh:17-19,110-116,118-126`](/home/edna/workspace/drts-fleet-platform/tests/e2e/lib/helpers.sh:17) 雖然已預留 `E2E_AUTH_BEARER_TOKEN`，但實際 helper 仍預設發送 bootstrap actor headers，並在有值時繼續附上 `x-drts-internal-key`。
- deploy baseline 尚未關閉 public ingress：
  - [`deploy-staging.yml:304-359`](/home/edna/workspace/drts-fleet-platform/.github/workflows/deploy-staging.yml:304) 目前 `drts-api`、`drts-platform-admin-web`、`drts-ops-console-web` 三個 Cloud Run deploy steps 全都保留 `--allow-unauthenticated`。
  - 同一個 API deploy step 仍注入 `DRTS_INTERNAL_KEY` secret（[`deploy-staging.yml:313-317`](/home/edna/workspace/drts-fleet-platform/.github/workflows/deploy-staging.yml:313)），說明 staging protection 目前仍依賴 internal-key model，而不是 IAP/OIDC。
  - health-check job 只做 GCP auth + Cloud Run ready polling（[`deploy-staging.yml:364-401`](/home/edna/workspace/drts-fleet-platform/.github/workflows/deploy-staging.yml:364)）；它不會向 API 送 IAP/OIDC request，也不會驗證 auth surface 已切換。

### Gap Summary

| 問題                                                  | 影響                                                                     | 根本原因                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| Parent task machine truth 仍是 `blocked`              | parent 不能被當成純 repo implementation slice 直接驗收                   | GCP Console / IAP app / OAuth consent screen 需要人工完成             |
| API runtime 仍只信任 bootstrap headers + internal key | 任務標題要求的「replace bootstrap header trust」尚未開始                 | 沒有 JWT verifier、JWKS/IAP assertion 驗證、或 Bearer-token auth path |
| staging deploy 仍是 public Cloud Run                  | 就算 repo 內 auth guard 改了，deployment exposure 也可能與任務宣稱不一致 | deploy workflow 仍保留 `--allow-unauthenticated`                      |
| smoke / E2E baseline 仍描述 bootstrap auth            | parent 若切換 auth model，驗證與運維文件會一起漂移                       | 測試工具與 README 尚未轉成 IAP/OIDC production baseline               |
| API package 沒有 JWT / OIDC 依賴                      | reviewer 不能接受只改文件或 workflow 卻沒有 server verifier 的 closeout  | repo 尚未引入任何 JWT 驗證 library 或 module                          |

---

## 3) Parent Acceptance Framing

`GAP-P2S3-001` 在 machine truth 中沒有獨立 `acceptance[]` 欄位；以下 checklist 只把 accepted planning、shared truth 與 repo baseline 展開成 reviewer-facing checklist，不新增產品語意。

### AC-1 — Human GCP / IAP gate must be satisfied before repo closeout counts

- [ ] reviewer 不接受「只有 repo 內 code diff」就把 parent `GAP-P2S3-001` 視為完成；machine truth 已明寫 `NEEDS_HUMAN_GCP_CONSOLE`。
- [ ] parent closeout 必須明確記錄人工前置是否已完成，至少涵蓋 Cloud IAP enablement、OAuth consent / IAP app config，或等效的人工作業證據。
- [ ] 若人工 gate 尚未完成，parent 最多只能停在 blocked / partial implementation state，不得被 sidecar packet 過度宣稱為 ready-to-done。

### AC-2 — Protected API auth must stop trusting free-form bootstrap headers as the production mechanism

- [ ] protected route auth 不再把 `AUTH_MODE=bootstrap_headers` 視為 production/staging 主路徑。
- [ ] reviewer 應要求 server-side 存在明確的 OIDC / IAP token 驗證入口，而不是只有 `x-actor-*` header extraction。
- [ ] `x-drts-internal-key` 若仍保留，必須被明確降級為 local/dev fallback、break-glass path、或已文檔化的有限例外；不得繼續作為 production primary gate。
- [ ] `BootstrapAuthGuard` / `InternalKeyMiddleware` 的保留或替換策略必須在 closeout 中說清楚，不能留下「JWT 路徑新增了，但舊 bootstrap trust 還默默是主路徑」的雙軌模糊狀態。

### AC-3 — Deployment exposure must align with the claimed auth upgrade

- [ ] 若 parent closeout宣稱 Cloud IAP 已保護 API，reviewer 應看到對應 Cloud Run deploy / access policy 已不再讓 `drts-api` 維持 `--allow-unauthenticated`。
- [ ] 如果 `platform-admin-web` / `ops-console-web` 是否一起納入 IAP 保護仍有界線，closeout 必須精確說明，不得含糊帶過。
- [ ] health-check / deploy verification 若仍只檢查 Ready 狀態，closeout 需要補充 auth-surface 驗證證據，避免把 deploy success 誤當成 auth migration success。

### AC-4 — CI / smoke / E2E verification must move off the bootstrap-auth default

- [ ] staging / CI 驗證路徑應明確說明如何取得或注入 Bearer token，不接受只保留 `E2E_AUTH_BEARER_TOKEN` 這種可選 env 而沒有實際取得流程。
- [ ] reviewer 應檢查 `tests/smoke/README.md`、`tests/smoke/lib/helpers.sh`、`tests/e2e/lib/helpers.sh` 是否仍把 bootstrap headers / internal key 描述成 production staging 預設。
- [ ] 若 smoke / E2E 還需要暫時保留 bootstrap fallback，parent closeout 應把它列為明確 follow-up，不得宣稱驗證基線已 fully migrated。

### AC-5 — Verification evidence must cover both positive and negative JWT/IAP cases

- [ ] 至少一條 server-side 單元或整合驗證，證明有效 Bearer token / IAP assertion 可以被接受。
- [ ] 至少一條負面驗證，證明缺 token、錯 audience / issuer、或無效 assertion 會被拒絕，而不是回到 bootstrap fallback。
- [ ] 健康檢查與 public route 例外若要保留，必須有相應測試或文件證據，避免 auth migration 不小心鎖死 `/health`。

### AC-6 — Scope must stay on auth transport / trust replacement, not product-scope redesign

- [ ] 本 task 可以更換 transport-level auth mechanism，但不應順手重寫 product scopes、route auth policy semantics、或 tenant / driver domain contract。
- [ ] 本 task 不新增新的業務 API surface，也不藉機改寫 core governance / registry / state semantics。
- [ ] sidecar packet 只接受與 auth upgrade 直接相關的 deploy/runtime/test/documentation delta，不吸收無關的 infra cleanup。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`GAP-P2S3-001.depends_on=[]`，但 parent status 是 `blocked` 且有明確人工前置說明。

| Dep    | Source      | Status | Notes                                                                        |
| ------ | ----------- | ------ | ---------------------------------------------------------------------------- |
| D-UP-1 | none formal | `n/a`  | machine truth 沒有顯式 `depends_on`，但 parent note 本身就是硬性 manual gate |

### Practical Review Dependencies

| Dep   | Type                                                 | Why It Matters                                                                                                                              |
| ----- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| D-P-1 | `ai-status.json` parent note                         | parent 明寫 `NEEDS_HUMAN_GCP_CONSOLE`，這是 reviewer 不能忽略的 acceptance gate                                                             |
| D-P-2 | accepted consensus packet                            | `GAP-P2S3-001` 被固定為 `Gemini + 人工`、`使用者確認後才能開始`                                                                             |
| D-P-3 | planning anchors (`starter-draft`, `review-round-3`) | 已把終局定義成「remove public ingress + verify Bearer JWT」，不是只加一層 internal key                                                      |
| D-P-4 | API auth runtime baseline                            | 目前 `BootstrapAuthGuard` + `InternalKeyMiddleware` 是全域 auth path，必須被替換或明確降級                                                  |
| D-P-5 | deploy workflow baseline                             | `deploy-staging.yml` 仍 public deploy，且 API secret 仍注入 `DRTS_INTERNAL_KEY`                                                             |
| D-P-6 | smoke / E2E helpers + README                         | 驗證與運維文件仍預設 bootstrap auth；parent 若切換 auth 這些一定會受影響                                                                    |
| D-P-7 | JWT / OIDC library absence                           | reviewer 不能接受「宣稱有 OIDC verify」但 repo 根本沒有 verifier 依賴                                                                       |
| D-P-8 | shared infra blocker context                         | current-work block table 已指出 staging deploy 缺少 GCP vars / secrets 且直接 Cloud Run 檢視權限不足；parent 完成度不能脫離這個環境事實評估 |

### Truth Sources

- L0 Collaboration:
  - `ai-status.json`
  - `current-work.md`
  - `ai-activity-log.jsonl`
- Operational unblock checklist:
  - `docs/03-runbooks/gap-p2s3-001-cloud-iap-checklist.md`
- Accepted planning anchors:
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/starter-draft.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/review-round-3.md`
  - `docs/02-architecture/consensus/gap-phase2-planning-20260417/consensus-packet.md`
- Repo anchors:
  - `apps/api/src/common/auth/auth.types.ts`
  - `apps/api/src/common/auth/bootstrap-auth.guard.ts`
  - `apps/api/src/common/auth/internal-key.middleware.ts`
  - `apps/api/src/app.module.ts`
  - `apps/api/package.json`
  - `.github/workflows/deploy-staging.yml`
  - `apps/api/tests/unit/auth-bootstrap.test.ts`
  - `tests/smoke/README.md`
  - `tests/e2e/lib/helpers.sh`

---

## 5) Evidence Inventory

| ID   | Evidence                                                                       | Expected Anchor                                                                                 |
| ---- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| E-1  | Parent / sidecar machine state                                                 | `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`                                    |
| E-2  | Parent blocked note requiring manual GCP Console work                          | `ai-status.json` task row for `GAP-P2S3-001`                                                    |
| E-3  | Accepted consensus gate: `Gemini + 人工`, user confirmation required           | `consensus-packet.md:63,112-113`                                                                |
| E-4  | Planning target: remove public ingress + move to Bearer JWT                    | `starter-draft.md:193-209`, `review-round-3.md:105-117`                                         |
| E-5  | Current auth mode still `bootstrap_headers`                                    | `auth.types.ts:30-41`                                                                           |
| E-6  | Current guard only parses bootstrap headers                                    | `bootstrap-auth.guard.ts:35-114`                                                                |
| E-7  | Current internal-key middleware still gates protected traffic                  | `internal-key.middleware.ts:84-141`                                                             |
| E-8  | Current global auth stack wiring                                               | `app.module.ts:64-91`                                                                           |
| E-9  | No JWT / OIDC verifier dependencies in API package                             | `apps/api/package.json:14-28` plus repo search showing no `JwtModule` / `jose` / `jsonwebtoken` |
| E-10 | Current public Cloud Run deploy baseline                                       | `deploy-staging.yml:304-359`                                                                    |
| E-11 | Current health-check does not validate auth migration                          | `deploy-staging.yml:364-401`                                                                    |
| E-12 | Existing unit tests only cover bootstrap auth and internal key                 | `auth-bootstrap.test.ts:31-419`                                                                 |
| E-13 | Smoke docs still describe bootstrap-header auth as staging model               | `tests/smoke/README.md:60-77`                                                                   |
| E-14 | E2E helper still defaults to bootstrap actor headers and optional internal key | `tests/e2e/lib/helpers.sh:17-19,110-126`                                                        |

---

## 6) Reviewer Hotspots (`Codex2`)

Reviewer 應優先確認：

1. packet 是否忠實保留 machine truth：parent `GAP-P2S3-001` 仍是 `blocked`，且 manual GCP Console gate 是 task row 明文，不是 sidecar 推論。
2. acceptance framing 是否正確把 repo baseline 凍結成「bootstrap headers + internal key 仍是主路徑」，而不是誤以為目前已有部分 JWT 驗證基礎。
3. packet 是否同時要求 deploy exposure 與 server auth path 一起對齊，而不是只改 NestJS 或只改 workflow 其一。
4. packet 是否提醒 smoke / E2E / ops docs 仍預設 bootstrap auth，避免 parent closeout 過度宣稱 verification 已 fully migrated。
5. packet 是否清楚保留 scope 邊界：這是 auth trust replacement，不是 route policy / product domain redesign。
6. support artifact 是否完全沒有修改 canonical truth 或主線 runtime。

**建議核准用語：**

> `GAP-P2S3-001 acceptance packet ready: it preserves the parent blocked snapshot and explicit human GCP/IAP gate, freezes the current bootstrap-header plus x-drts-internal-key runtime as the pre-migration baseline, captures the public Cloud Run deploy and smoke/E2E bootstrap assumptions that must move with the auth upgrade, and gives reviewer-facing acceptance criteria without mutating canonical truth or overclaiming implementation readiness.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / auth-baseline drift / deploy-vs-runtime mismatch / smoke-e2e migration gap / support-scope violation]`

---

## 7) Historical Handoff Command

Owner（`Codex`）完成 packet 後，曾交給 reviewer（`Codex2`）；此命令已完成，保留供 audit / replay：

```bash
AI_NAME=Codex python3 scripts/ai_status.py handoff GAP-P2S3-001-SIDECAR-ACCEPTANCE Codex2 "GAP-P2S3-001 acceptance packet refreshed at support/sidecars/GAP-P2S3-001/GAP-P2S3-001-SIDECAR-ACCEPTANCE.md. It preserves the parent blocked snapshot and explicit manual GCP/IAP gate, aligns the sidecar header/current-state section with the latest shared L0 review status (owner=Codex, reviewer=Codex2, last_update=2026-04-17T20:10:52Z) plus the repeated Qwen->Codex2 routing history through 2026-04-17T20:11:01Z, freezes the current bootstrap-header plus x-drts-internal-key auth stack and public Cloud Run deploy as the pre-migration baseline, captures the missing JWT verifier/runtime gaps together with smoke/E2E bootstrap assumptions, and stays within support-only sidecar boundaries for Codex2 review and Gemini parent closeout."
```

---

## 8) Reviewer Actions

Reviewer（`Codex2`）核准：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py approve GAP-P2S3-001-SIDECAR-ACCEPTANCE "GAP-P2S3-001 acceptance packet ready: it preserves the parent blocked snapshot and explicit human GCP/IAP gate, aligns the sidecar review routing to the latest Codex2 reviewer assignment in shared L0, correctly freezes the current bootstrap-header/internal-key runtime plus public Cloud Run deploy baseline, captures the missing JWT verifier and smoke/E2E migration work that must accompany the auth upgrade, and stays within support-only sidecar boundaries."
```

Reviewer（`Codex2`）退回：

```bash
AI_NAME=Codex2 python3 scripts/ai_status.py reopen GAP-P2S3-001-SIDECAR-ACCEPTANCE "packet needs revision: [specify machine-truth mismatch / reviewer-routing drift / auth-baseline drift / deploy-vs-runtime mismatch / smoke-e2e migration gap / support-scope violation]"
```

---

## 9) Owner Closeout

此 sidecar 已經在 shared L0 進入 `review_approved`，現在由 owner（`Codex`）收尾：

```bash
export NO_COMMIT_REQUIRED=1
AI_NAME=Codex python3 scripts/ai_status.py done GAP-P2S3-001-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for GAP-P2S3-001 at support/sidecars/GAP-P2S3-001/GAP-P2S3-001-SIDECAR-ACCEPTANCE.md. The packet preserves the parent blocked/manual-gate snapshot, bootstrap-header/internal-key pre-migration baseline, deploy and verification dependencies, and reviewer handoff path without changing canonical truth."
```

Parent absorption / 主線採納仍由 parent owner `Gemini` 視需要決定，不由此 sidecar 自動推進。

---

## 10) Change Log

- 2026-04-17T20:15Z — metadata refresh for finalization：將 sidecar header/current-state section 對齊 shared L0 最新 machine truth（`owner=Codex`、`reviewer=Codex2`、`status=review_approved`、`last_update=2026-04-17T20:13:52Z`），補記 `Codex2` 已核准與 `owned_finalize_dispatch` 已在 `2026-04-17T20:14:00Z` 交回 owner `Codex`，並把 handoff 區段改標為 historical command，供 owner closeout 前審計使用。
- 2026-04-17T20:12Z — metadata refresh：將 sidecar reviewer / status / handoff path 對齊 shared L0 最新 machine truth（`owner=Codex`、`reviewer=Codex2`、`status=review`、`last_update=2026-04-17T20:10:52Z`），補記 `20:09:52Z` 至 `20:11:01Z` 間 Qwen/Codex2 reviewer routing 往返後最終仍回到 `Qwen -> Codex2` pending handoff，並同步更新 handoff command 的 reviewer / timestamp 基準。
- 2026-04-17T20:07Z — metadata refresh：將 sidecar reviewer / status / handoff path 對齊 shared L0 最新 machine truth（`owner=Codex`、`reviewer=Codex2`、`status=review`、`last_update=2026-04-17T20:06:13Z`），補記 `20:04:47Z` 至 `20:06:19Z` 間 Qwen/Codex2 reviewer routing 往返後最終仍回到 `Qwen -> Codex2` pending handoff，並同步更新 handoff command 的 reviewer / timestamp 基準。
- 2026-04-17T20:27Z — metadata refresh：將 sidecar reviewer / status / handoff path 對齊 shared L0 最新 machine truth（`owner=Codex`、`reviewer=Codex2`、`status=review`、`last_update=2026-04-17T20:02:39Z`），補記 `20:01:50Z` 至 `20:02:48Z` 間 Qwen/Codex2 reviewer routing 往返後最終仍回到 `Qwen -> Codex2` pending handoff，並同步更新 handoff command 的 reviewer / timestamp 基準。
- 2026-04-17T20:17Z — metadata refresh：將 sidecar reviewer / status / handoff path 對齊 shared L0 最新 machine truth（`owner=Codex`、`reviewer=Codex2`、`status=review`、`last_update=2026-04-17T19:59:42Z`），補記 `19:58:50Z` 至 `19:59:51Z` 間 Qwen/Codex2 reviewer routing 往返後最終仍回到 `Qwen -> Codex2` pending handoff，並同步更新 handoff command 的 reviewer / timestamp 基準。
- 2026-04-17T20:04Z — metadata refresh：將 sidecar reviewer / status / handoff path 對齊 shared L0 最新 machine truth（`owner=Codex`、`reviewer=Codex2`、`status=review`、`last_update=2026-04-17T19:55:12Z`），補記 `19:53:33Z` 至 `19:55:18Z` 間 Qwen/Codex2 reviewer routing 往返後最終回到 `Qwen -> Codex2` pending handoff，並把 reviewer actions / handoff command 從舊版 `Gemini` 路徑修正為目前指派的 `Codex2`。
- 2026-04-17T15:42Z — 初版建立：依 shared L0 truth、accepted `gap-phase2-planning-20260417` planning anchors、deploy/auth/test repo 掃描，整理 `GAP-P2S3-001` 的 acceptance checklist、manual GCP/IAP gate、bootstrap-header pre-migration baseline、deploy / smoke / E2E reviewer hotspots 與 handoff / closeout 指引。
