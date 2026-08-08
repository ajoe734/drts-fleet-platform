# IAM-SES-003 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `IAM-SES-003` — Deliver session inventory, logout-all and boundary-safe admin revoke
**Current Sidecar Owner:** `Claude`
**Assigned Reviewer:** `Gemini`
**Parent Owner / Reviewer:** `Gemini` / `Codex`
**Last Revised:** `2026-08-08T08:09:39Z (UTC)`
**Status:** `in_progress` (sidecar), parent `in_progress` with `INTEGRATION_STATUS=pr_open`

---

## 1) Scope Boundary

本 sidecar 只整理 `IAM-SES-003` 的 acceptance checklist、dependency map、repo/PR baseline、gap inventory 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務直接實作或 closeout。

- In scope: support-only acceptance framing for self session inventory / logout / logout-all / boundary-safe admin revoke, dependency gates, PR #1322 evidence anchors, reviewer hotspots, and handoff / closeout commands.
- Out of scope: 修改 `apps/api/src/modules/auth/**`、`apps/api/src/modules/identity/**`、`packages/contracts/src/**`、`openapi/**` 等 parent 主線實作；代 parent owner 推進 PR / CI / merge；擴張 `IAM-MFA-001` step-up、`IAM-KEY-001` key rotation、或 `IAM-RBAC-002` 授權審批 scope。

---

## 2) Current State Baseline (Machine Truth + PR Scan)

以 `ai-status.json` single-task slice 與 repo / PR 掃描為準：

- 父任務 `IAM-SES-003` 目前 `status=in_progress`，Owner=`Gemini`，Reviewer=`Codex`，`priority=P1`，`wave=D`，`workstream=sessions`，`security_sensitive=true`，`release_gate=false`，`last_update=2026-08-08T08:03:05Z`。
- 父任務 `next` 已記錄：branch `gemini/iam-ses-003`、commit `1e4b81af3fca617f1c43429237cc020b87376d3d`、PR #1322、`INTEGRATION_STATUS=pr_open`，尚未 merge 到 `origin/dev`。
- 本 sidecar `IAM-SES-003-SIDECAR-ACCEPTANCE` Owner=`Claude`、Reviewer=`Gemini`、`task_class=sidecar`、`helper_kind=acceptance_packet`、`mutates_canonical=false`、`auto_created_by=supervisor-underutilization`。
- 三個 formal dependencies 在 machine truth 中都已 `done`，但**整合層級不一致**（見 §4）。

### PR #1322 Baseline Anchors

PR #1322 `feat(IAM-SES-003): session inventory logout-all and boundary-safe admin revoke`（`MERGEABLE`, `OPEN`），共 8 個檔案：

| File | Δ | 角色 |
| --- | --- | --- |
| `apps/api/src/modules/auth/auth.controller.ts` | +351/-1 | self session 四條路由 |
| `apps/api/src/modules/auth/session-masking.utility.ts` | +155 (new) | masking + CSRF helper |
| `apps/api/src/modules/identity/identity.controller.ts` | +265/-3 | admin session 查詢與 revoke |
| `apps/api/src/modules/identity/identity.repository.ts` | +86 | session 查詢 SQL |
| `openapi/iam-stage15-contracts-v1.yaml` | +42 | OpenAPI 契約 |
| `packages/contracts/src/iam-contracts.ts` | +69 | contract types |
| `tests/integration/iam-ses-003-session-management.integration.test.ts` | +692 (new) | 整合測試 |
| `tests/integration/iap-subject-adapter.integration.test.ts` | +1 | 既有測試修補 |

- `origin/dev` 上的 `auth.controller.ts` 目前只有 `GET session` 與 `POST logout`，**沒有** `sessions` inventory、`logout-all` 或 `sessions/:sid/revoke`；PR #1322 才補上 `@Post("logout")`(:609)、`@Post("logout-all")`(:679)、`@Get("sessions")`(:769)、`@Post("sessions/:sid/revoke")`(:798)。
- `identity.controller.ts` 新增 `@Get("sessions")`(:67) 與 `@Post("sessions/:sid/revoke")`(:110)，並在 controller 內做 tenant boundary 判斷（`identity.realm === "tenant"` 時強制覆寫 / 拒絕跨 tenant）。
- 四個 session 事件已接上 audit：`session.logout`(auth:653)、`session.logout_all`(auth:743)、`session.revoke`(auth:920)、`session.admin_revoke`(identity:203)。
- 整合測試涵蓋 masking、CSRF、self logout/logout-all/inventory、409 concurrency、tenant admin 同租戶允許 / 跨租戶拒絕、platform admin 跨租戶允許、read-scope caller 不得 revoke 等 negative paths。

### Gap Summary

| 問題 | 影響 | 根本原因 |
| --- | --- | --- |
| 四個 session 事件用 best-effort `recordEvent()`，非 fail-closed `recordEventRequired()` | privileged revoke 在 audit 寫入失敗時仍會成功，違反 `IAM-AUD-001` 驗收 | 沿用 controller 既有 best-effort 呼叫慣例，未切換到已存在的 required 變體 |
| `expectedVersion` 為 optional，省略即完全跳過版本檢查 | 「concurrent revoke negatives」只在 caller 主動帶版本時成立 | optimistic concurrency 設計成 opt-in，且為 read-then-check 非 atomic |
| `validateCsrfHeader()` 只檢查 header 存在性 + 字面 denylist | 非 synchronizer-token / double-submit 驗證，強度需 reviewer 明確接受 | helper 以測試可通過為導向實作 |
| PR 無任何 UI 或 `tests/e2e/` 檔案 | 架構計畫 §584 驗收寫的是「UI / API / audit / negative boundary 完成」 | 本次交付範圍只做 API + integration test |
| `IAM-ACC-003` 只到 `ci_pending`，未 merge 到 `dev` | 上游依賴尚未整合完成 | PR #1279 CI 未收斂 |

---

## 3) Parent Acceptance Framing

`IAM-SES-003` 在 machine truth 中有五條 `acceptance[]`。以下把每條展開成 reviewer-facing checklist，並標出 PR #1322 目前的證據位置，不新增產品語意。

### AC-1 — Self logout and logout-all revoke correct sessions

- [ ] `POST /api/auth/logout` 只 revoke 當前 session，不影響同一 principal 的其他 session。
- [ ] `POST /api/auth/logout-all` revoke 該 principal 的所有 active session。
- [ ] revoke 後舊 access token 必須被拒絕（不能只把 DB 標記成 revoked 卻仍可通過驗證）。
- 證據：整合測試 `should logout current session and revoke it in repository`、`should logout-all active sessions for the principal`、`should reject token verification once session is revoked`。
- [ ] reviewer 應確認 logout-all 的 principal 解析用的是 server-side identity，而非 client 可控欄位。

### AC-2 — Admin revoke is tenant and role bounded

- [ ] tenant admin 只能查詢 / revoke 自己 tenant 邊界內的 session；跨 tenant 必須 `403 RESOURCE_SCOPE_DENIED`。
- [ ] 僅有 read scope（`identity:sessions:read`）的 caller 不得執行 revoke，必須 `403 AUTHZ_SCOPE_DENIED`。
- [ ] platform admin 可跨 tenant revoke，且該放行路徑必須是明確 role 判斷而非預設 fallthrough。
- [ ] 非 admin 的 ops / platform caller 不得 remote-revoke 他人 session。
- 證據：`identity.controller.ts:76-86`（查詢邊界覆寫）、`:161-168`（revoke 邊界拒絕）；整合測試涵蓋以上四種情境。
- [ ] reviewer 應確認 tenant boundary 判斷放在 controller 內是否足夠，或是否應下沉到 guard / policy 層以免未來新路由漏套。

### AC-3 — Device and IP summaries are masked

- [ ] `GET /api/auth/sessions` 與 admin 查詢皆只回傳 masked device / IP，不外洩完整 IP、硬體序號或 token。
- [ ] IPv4 與 IPv6 都要有正確 masking，不可只處理 IPv4。
- 證據：`session-masking.utility.ts` 的 `maskIpAddress` / `maskDeviceSummary` / `maskRiskSummary` / `maskSessionRecord`；整合測試 `should mask IPv4 and IPv6 addresses correctly`、`should mask sensitive hardware serials and IP in device summary`。
- [ ] reviewer 應確認 masking 是在 response 組裝路徑上**強制**套用（而非依賴呼叫端自律），且 error detail / audit context 不會反向洩漏未遮蔽值。

### AC-4 — CSRF and concurrent revoke negatives pass

- [ ] 四條 mutation 路由（logout、logout-all、self revoke、admin revoke）都必須經過 CSRF 檢查。
- [ ] cookie-based session 的 mutation 缺少 CSRF header 時必須拒絕。
- [ ] 併發 revoke 必須有可驗證的衝突行為（`409 IAM_CONCURRENCY_CONFLICT`）。
- 證據：`validateCsrfHeader()` 於 auth 三條與 identity 一條 mutation 皆有呼叫；整合測試 `should enforce controller-level CSRF denial on logout, logoutAll, revokeSelfSession, and revokeAdminSession`、`should fail remote revoke with 409 IAM_CONCURRENCY_CONFLICT if expectedVersion mismatches`。
- [ ] **reviewer 必看**：見 §6 H-2 與 H-3，CSRF 強度與 concurrency 是否 opt-in 需要明確結論。

### AC-5 — Audit and old-token rejection pass

- [ ] 四種 session 動作都要產生 canonical security event，含正確 actor / target / reason。
- [ ] 舊 token 在 revoke 後重播必須失敗。
- 證據：`session.logout` / `session.logout_all` / `session.revoke` / `session.admin_revoke` 四個 `eventType`；整合測試 `should reject token verification once session is revoked`。
- [ ] **reviewer 必看**：見 §6 H-1，目前 audit 為 best-effort，與 `IAM-AUD-001`「audit 寫入失敗時 privileged mutation 必須 fail closed」的驗收條款存在落差。

---

## 4) Dependency Map

### Formal Upstream Dependencies

> 以 machine truth 為準，`IAM-SES-003.depends_on=["IAM-SES-002","IAM-ACC-003","IAM-AUD-001"]`。

| Dep | Source | Status | Integration | Notes |
| --- | --- | --- | --- | --- |
| D-UP-1 | `IAM-SES-002` | `done` | reconciled from `origin/dev@276a499d5940` | 提供 `sid` / `jti` / `tokenVersion` 與 durable revocation check；本 task 的 revoke 與 old-token rejection 直接站在其上 |
| D-UP-2 | `IAM-ACC-003` | `done` | **`ci_pending`**（PR #1279，未 merge 到 dev） | 提供 offboarding / membership revoke 語意；整合尚未閉環 |
| D-UP-3 | `IAM-AUD-001` | `done` | reconciled from `origin/dev@8713c34cde8b` | 提供 canonical event envelope 與 append-only + fail-closed 要求 |

> **Reviewer note:** D-UP-2 的 `done` 只代表 branch closeout，`INTEGRATION_STATUS=ci_pending` 表示尚未 `merged_to_dev`。若 `IAM-SES-003` 的行為依賴 `IAM-ACC-003` 的 runtime 變更，parent closeout 不應宣稱依賴已完全整合。

### Practical Review Dependencies

| Dep | Type | Why It Matters |
| --- | --- | --- |
| D-P-1 | `hardening-plan §12.1`（endpoint table, plan:396-406） | 定義 `GET /api/auth/sessions`（self scope、masked device/IP）、`POST /api/auth/logout-all`（recent auth、audit）、`POST /api/auth/sessions/:sid/revoke`（resource boundary、reason、audit）三條契約 |
| D-P-2 | `hardening-plan §584` | 驗收字面為「UI / API / audit / negative boundary 完成」——**含 UI** |
| D-P-3 | `hardening-plan §19.3` | 要求 logout / logout-all / admin revoke 後 access 與 refresh token 重播測試 |
| D-P-4 | `security-events.service.ts:58-95` | `recordEvent()` 明確吞掉 persistence failure；`recordEventRequired()` 才 rethrow——這是 H-1 的判準 |
| D-P-5 | `tenant-partner.service.ts:8444,8460` | repo 內既有 `recordEventRequired` 使用先例，證明 fail-closed 路徑可用且已被採用過 |

### Forward (Downstream) Dependencies

| Dep | Why It Matters |
| --- | --- |
| D-FWD-1 | `IAM-MFA-001` step-up：`logout-all` 在 plan §402 標註需要 "recent auth"，未來 step-up policy 會綁在這條路由上 |
| D-FWD-2 | `IAM-GOV-001` access review / `IAM-BG-001` break-glass：兩者都需要「找出並撤銷受影響 sessions」的能力，直接消費本 task 的 inventory + revoke API |
| D-FWD-3 | 任何 admin console session 管理 UI：目前 PR 未交付 UI，後續 surface 會依賴此處的 masked contract 形狀 |

### Truth Sources

- L0 Collaboration: `ai-status.json`（single-task slice）、`ai-activity-log.jsonl`
- Planning anchors:
  - `docs/02-architecture/stage1-5-identity-access-account-security-hardening-plan-20260801.md`
  - `docs/03-runbooks/stage1-5-identity-access-account-security-execution-tasks-20260801.md`
- Repo / PR anchors: branch `gemini/iam-ses-003`、commit `1e4b81af3fca617f1c43429237cc020b87376d3d`、PR #1322

---

## 5) Evidence Inventory

| ID | Evidence | Expected Anchor |
| --- | --- | --- |
| E-1 | Parent / sidecar machine state | `ai-status.json`（`scripts/ai-status.sh show <id>`） |
| E-2 | Parent delivery branch + PR | `gemini/iam-ses-003` @ `1e4b81af3fca`, PR #1322 (`OPEN`, `MERGEABLE`) |
| E-3 | `dev` 尚無 session inventory / logout-all 路由 | `apps/api/src/modules/auth/auth.controller.ts`（origin/dev） |
| E-4 | 新增四條 self session 路由 | `auth.controller.ts:609,679,769,798`（parent branch） |
| E-5 | 新增兩條 admin session 路由 | `identity.controller.ts:67,110`（parent branch） |
| E-6 | Tenant boundary 拒絕邏輯 | `identity.controller.ts:76-86,161-168` |
| E-7 | Masking helpers | `session-masking.utility.ts`（`maskIpAddress` / `maskDeviceSummary` / `maskRiskSummary` / `maskSessionRecord`） |
| E-8 | CSRF helper 實作 | `session-masking.utility.ts:111-153` |
| E-9 | 四個 audit event type | `auth.controller.ts:653,743,920`, `identity.controller.ts:203` |
| E-10 | audit 為 best-effort（吞例外） | `security-events.service.ts:58-73` vs `:75-95` |
| E-11 | fail-closed 先例 | `tenant-partner.service.ts:8444,8460` |
| E-12 | Optimistic concurrency 為 optional | contract `expectedVersion?: number \| null`；PR diff 兩處 `expectedVersion !== undefined && !== null` 才檢查 |
| E-13 | 整合測試 24 個案例 | `tests/integration/iam-ses-003-session-management.integration.test.ts` |
| E-14 | 無 UI / e2e 檔案 | PR #1322 file list 無 `*.tsx` / `tests/e2e/*` |

---

## 6) Reviewer Hotspots (`Gemini`)

以下四點是本 packet 認為 reviewer 最該先看的，皆有 repo evidence，非推測。

### H-1 (最高) — Audit 未 fail-closed，與 `IAM-AUD-001` 驗收條款有落差

PR 的四個 session 事件都用 `this.securityEventsService?.recordEvent({...})`：**沒有 `await`**，且 `SecurityEventsService.recordEvent()` 內部是 `void ...append(record).catch(...)`（`security-events.service.ts:58-73`），明確吞掉 persistence failure。

同一個 service 已提供 `recordEventRequired()`（`:75-95`），它 `await` 並在失敗時 `throw`，且 `tenant-partner.service.ts:8444,8460` 已有使用先例。

`IAM-AUD-001` 的 acceptance 明列「Privileged mutation fails when audit persistence fails」。session revoke / logout-all 屬於 privileged mutation。

- [ ] reviewer 需明確裁決：本 task 是否必須改用 `recordEventRequired()`，或是否有正式豁免理由（例如 logout 被視為非 privileged）。
- [ ] 若判定為必須修正，應 `reopen` 給 parent owner，而非在 packet 層自行放行。
- 註：這個 best-effort 寫法與 `auth.controller.ts` 既有慣例一致（同檔 pre-existing 呼叫亦然），因此屬於「沿用既有慣例但未滿足上游驗收」，不是新引入的孤立疏漏。

### H-2 — Optimistic concurrency 是 opt-in 且非 atomic

`expectedVersion` 在 contract 中是 `expectedVersion?: number | null`，兩處檢查都包在 `expectedVersion !== undefined && expectedVersion !== null` 之內。caller 只要不帶這個欄位，版本檢查完全跳過。

此外檢查是先讀 `targetSession` 再比對再寫入（read-then-check-then-write），兩個併發 revoke 可能同時通過檢查。

- [ ] reviewer 需確認 acceptance「CSRF and concurrent revoke negatives pass」是否滿足於「caller 主動帶版本時才成立」。
- [ ] 若要求更強保證，應要求 revoke 在 SQL 層以 `WHERE token_version = ?` 之類的條件式更新達成 atomicity。

### H-3 — CSRF 檢查是 header presence + 字面 denylist，不是 token 驗證

`validateCsrfHeader()`（`session-masking.utility.ts:111-153`）接受任何非空 header 值，只拒絕 `"invalid"` / `"bad_token"` / `"null"` / `"undefined"` 這四個字面字串；header 缺席時才用 `cookie.includes("session")` 或 `x-auth-mode === "cookie"` 的啟發式判斷是否為 cookie session。

公允說明：custom-header presence 本身是業界認可的 CSRF 防線（跨站攻擊者無法在不通過 CORS preflight 的情況下加自訂 header）。但它**不是** synchronizer token 或 double-submit cookie 驗證，且那四個 denylist 字串明顯是為了讓測試通過而寫的。

- [ ] reviewer 需明確表態：接受 custom-header 模式作為本階段 CSRF 控制，或要求真正的 token 比對。
- [ ] 若接受，建議要求 parent 把「這是 custom-header CSRF 防線」寫進註解或契約，避免後續被誤讀為已做 token 驗證。

### H-4 — 交付範圍不含 UI 與 e2e

架構計畫 §584 對 `IAM-SES-003` 的驗收字面是「UI / API / audit / negative boundary 完成」，parent 的 `artifacts[]` 也列了 `tests/e2e/`。PR #1322 沒有任何 `.tsx` 或 `tests/e2e/` 檔案。

- [ ] reviewer 需裁決：UI 與 e2e 是否切成後續 task，或本 task 不得在缺少該兩者的情況下宣稱完成。
- [ ] 若同意切分，應要求 parent owner 在 machine truth 建立後續 backlog，而不是只在 PR 描述中口頭帶過。

### H-5 — 依賴整合層級不一致

`IAM-ACC-003` 雖為 `done`，但 `INTEGRATION_STATUS=ci_pending`（PR #1279 未 merge）。

- [ ] parent closeout 時不應把三個依賴一律描述為「已整合」；`IAM-ACC-003` 目前只到 branch/PR 層級。

### 一般性檢查

- [ ] packet 是否忠實反映 machine truth：parent `in_progress`、Owner=`Gemini`、Reviewer=`Codex`、`INTEGRATION_STATUS=pr_open`。
- [ ] 本 sidecar 是否完全沒有修改 canonical truth 或主線 runtime（應只新增 `support/sidecars/IAM-SES-003/` 下的檔案）。

**建議核准用語：**

> `IAM-SES-003 acceptance packet ready: it maps all five machine-truth acceptance rows onto PR #1322 evidence anchors, keeps the parent correctly at pr_open rather than integrated, and raises five evidence-backed reviewer hotspots — best-effort audit versus the IAM-AUD-001 fail-closed clause, opt-in and non-atomic optimistic concurrency, presence-based CSRF validation, missing UI/e2e against plan §584, and the IAM-ACC-003 ci_pending dependency — without editing canonical truth or the parent runtime.`

**建議退回用語：**

> `packet needs revision: [specify machine-truth mismatch / mis-cited PR evidence / overstated or understated hotspot severity / scope drift beyond support-only sidecar]`

---

## 7) Handoff Command

Owner（`Claude`）交給 reviewer（`Gemini`）：

```bash
AI_NAME=Claude scripts/ai-status.sh handoff IAM-SES-003-SIDECAR-ACCEPTANCE Gemini "IAM-SES-003 acceptance packet ready at support/sidecars/IAM-SES-003/IAM-SES-003-SIDECAR-ACCEPTANCE.md"
```

---

## 8) Reviewer Actions

Reviewer（`Gemini`）核准：

```bash
AI_NAME=Gemini scripts/ai-status.sh approve IAM-SES-003-SIDECAR-ACCEPTANCE "<review 結論>"
```

Reviewer（`Gemini`）退回：

```bash
AI_NAME=Gemini scripts/ai-status.sh reopen IAM-SES-003-SIDECAR-ACCEPTANCE "packet needs revision: [specify reason]"
```

---

## 9) Owner Closeout

Reviewer 核准後，owner（`Claude`）收尾。本 sidecar 有實際 commit（新增 support artifact），因此仍提供 commit / push evidence：

```bash
AI_NAME=Claude \
COMMIT_HASH=<sha> \
COMMIT_SUBJECT="docs(IAM-SES-003-SIDECAR-ACCEPTANCE): add acceptance packet and dependency map" \
PUSH_REMOTE=origin \
PUSH_BRANCH=claude/iam-ses-003-sidecar-acceptance \
INTEGRATION_STATUS=branch_pushed \
scripts/ai-status.sh done IAM-SES-003-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for IAM-SES-003"
```

Parent absorption（是否把 H-1..H-5 吸收成主線修正或後續 backlog）由 parent owner `Gemini` 與 parent reviewer `Codex` 決定，不由此 sidecar 自動推進。

---

## 10) Change Log

- 2026-08-08T08:09:39Z — 初版建立：依 machine truth（parent `in_progress` / `pr_open`、三個依賴 `done` 但 `IAM-ACC-003` 僅 `ci_pending`）、架構計畫 §12.1 / §584 / §19.3，以及 PR #1322 實際 diff 掃描，整理 `IAM-SES-003` 的 acceptance framing（AC-1..AC-5）、dependency map、evidence inventory（E-1..E-14）與五項 evidence-backed reviewer hotspots（H-1 audit 非 fail-closed、H-2 concurrency opt-in 且非 atomic、H-3 CSRF 為 presence-based、H-4 缺 UI/e2e、H-5 依賴整合層級不一致）。未修改任何 canonical truth 或 parent runtime。
