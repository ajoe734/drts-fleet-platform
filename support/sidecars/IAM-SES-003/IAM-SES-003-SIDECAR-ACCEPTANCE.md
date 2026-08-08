# IAM-SES-003 Acceptance Packet & Dependency Map

**Sidecar Kind:** `acceptance_packet`
**Parent Task:** `IAM-SES-003` — Deliver session inventory, logout-all and boundary-safe admin revoke
**Current Sidecar Owner:** `Claude`
**Assigned Reviewer:** `Gemini`
**Parent Owner / Reviewer:** `Gemini` / `Codex`
**Last Revised:** `2026-08-08T08:40:47Z (UTC)`
**Status:** `review_approved` → owner closeout (sidecar), parent `in_progress` with `INTEGRATION_STATUS=pr_open`
**Verified Against Parent Head:** `f2bdbe845f51a0e39e8a359493f4bdcf1792df42` (`gemini/iam-ses-003`, 4 commits ahead of `origin/dev`)

> **Moving target warning.** `gemini/iam-ses-003` advanced twice while this packet was being
> re-verified (`1e4b81af` → `58f2eece` → `f2bdbe84`). Every claim below is anchored to
> `f2bdbe84`. Reviewer must re-check `git log origin/dev..origin/gemini/iam-ses-003` before
> acting on §2.1.

---

## 1) Scope Boundary

本 sidecar 只整理 `IAM-SES-003` 的 acceptance checklist、dependency map、repo/PR baseline、gap inventory 與 reviewer handoff 指引，不修改 canonical truth，也不代替 parent 任務直接實作或 closeout。

- In scope: support-only acceptance framing for self session inventory / logout / logout-all / boundary-safe admin revoke, dependency gates, PR #1322 evidence anchors, reviewer hotspots, and handoff / closeout commands.
- Out of scope: 修改 `apps/api/src/modules/auth/**`、`apps/api/src/modules/identity/**`、`packages/contracts/src/**`、`openapi/**` 等 parent 主線實作；代 parent owner 推進 PR / CI / merge；擴張 `IAM-MFA-001` step-up、`IAM-KEY-001` key rotation、或 `IAM-RBAC-002` 授權審批 scope。

---

## 2) Current State Baseline (Machine Truth + PR Scan)

以 `ai-status.json` single-task slice 與 repo / PR 掃描為準：

- 父任務 `IAM-SES-003` 目前 `status=in_progress`，Owner=`Gemini`，Reviewer=`Codex`，`priority=P1`，`wave=D`，`workstream=sessions`，`security_sensitive=true`，`release_gate=false`，`last_update=2026-08-08T08:03:05Z`。
- 父任務 `next` 已記錄：branch `gemini/iam-ses-003`、commit `1e4b81af3fca617f1c43429237cc020b87376d3d`、PR #1322、`INTEGRATION_STATUS=pr_open`，尚未 merge 到 `origin/dev`。**注意：machine truth 記錄的 commit 已過期**，branch 實際 head 為 `f2bdbe845f51`（其後又多了 `58f2eece`、`f2bdbe84` 兩個 fix commit）。
- 本 sidecar `IAM-SES-003-SIDECAR-ACCEPTANCE` Owner=`Claude`、Reviewer=`Gemini`、`task_class=sidecar`、`helper_kind=acceptance_packet`、`mutates_canonical=false`、`auto_created_by=supervisor-underutilization`。
- 三個 formal dependencies 在 machine truth 中都已 `done`，但**整合層級不一致**（見 §4）。

### 2.1 PR #1322 Baseline Anchors（@ `f2bdbe84`）

PR #1322 `feat(IAM-SES-003): session inventory logout-all and boundary-safe admin revoke`
（`OPEN`、`mergeable=MERGEABLE`、**`mergeStateStatus=BLOCKED`**），共 9 個檔案 `+1743/-4`：

| File | Δ | 角色 |
| --- | --- | --- |
| `apps/api/src/common/auth/auth.policy.ts` | +62 (new) | route auth policy 表（`58f2eece` 新增，供 route inventory 分類） |
| `apps/api/src/modules/auth/auth.controller.ts` | +325/-4 | self session 四條路由 |
| `apps/api/src/modules/auth/session-masking.utility.ts` | +155 (new) | masking + CSRF helper |
| `apps/api/src/modules/identity/identity.controller.ts` | +268 | admin session 查詢與 revoke |
| `apps/api/src/modules/identity/identity.repository.ts` | +86 | session 查詢 SQL |
| `openapi/iam-stage15-contracts-v1.yaml` | +42 | OpenAPI 契約 |
| `packages/contracts/src/iam-contracts.ts` | +69 | contract types（`IamSessionRevokeCommand`、`MaskedSessionSummary`） |
| `tests/integration/iam-ses-003-session-management.integration.test.ts` | +739 (new) | 整合測試（21 cases） |
| `tests/integration/iap-subject-adapter.integration.test.ts` | +1 | 既有測試修補（**只補 1/4 個 call site，見 B-2**） |

Commit chain（`origin/dev..origin/gemini/iam-ses-003`）：

| SHA | Subject | `Reviewer:` trailer |
| --- | --- | --- |
| `f2bdbe84` | `fix(IAM-SES-003): enforce strict self-only session revocation on auth route` | `Codex` |
| `58f2eece` | `fix(IAM-SES-003): register session route auth policies for route inventory classification` | `Codex` |
| `1e4b81af` | `fix(IAM-SES-003): enforce strict admin session inventory and revoke authority boundaries` | `Codex` |
| `ea1a2d28` | `feat(IAM-SES-003): session inventory logout-all and boundary-safe admin revoke` | **`Claude`**（與 machine truth `reviewer=Codex` 不一致） |

- `origin/dev` 上的 `auth.controller.ts` 目前只有 `GET session` 與 `POST logout`，**沒有** `sessions` inventory、`logout-all` 或 `sessions/:sid/revoke`；PR #1322 才補上 `@Post("logout")`(:609)、`@Post("logout-all")`(:679)、`@Get("sessions")`(:769)、`@Post("sessions/:sid/revoke")`(:798)。
- `identity.controller.ts` 新增 `@Get("sessions")`(:67) 與 `@Post("sessions/:sid/revoke")`(:110)，並在 controller 內做 tenant boundary 判斷（`identity.realm === "tenant"` 時強制覆寫 / 拒絕跨 tenant）。
- 四個 session 事件已接上 audit：`session.logout`(auth:653)、`session.logout_all`(auth:743)、`session.revoke`(auth:920)、`session.admin_revoke`(identity:203)。
- 整合測試涵蓋 masking、CSRF、self logout/logout-all/inventory、409 concurrency、tenant admin 同租戶允許 / 跨租戶拒絕、platform admin 跨租戶允許、read-scope caller 不得 revoke 等 negative paths。

### 2.2 PR #1322 CI Gate Status（run `31248490588` / `31248490605`, head `f2bdbe84`）

**PR 目前 `mergeStateStatus=BLOCKED`，四個 gate 紅燈。** 這是 merge 的硬性阻擋，優先於本 packet 其他所有
semantic hotspot。

| Check | 結果 | 根因（已在本地重現） |
| --- | --- | --- |
| `Commit trailers` | **fail** | B-1：4/4 commit subject 格式違規 |
| `typecheck` | **fail** | B-3：13 個 TS error，全在本 PR 的兩個測試檔 |
| `lint` | **fail** | B-4：`no-unused-vars` |
| `Smoke acceptance` | **fail** | 尚未取得可歸因的 log 段落，未列入已驗證結論 |
| `unit` / `integration` / `e2e` / `build` / `iam-negative-matrix` | pending | 見 B-2：`unit` 預期會因 constructor 位移而紅 |
| `BFF-only imports` / `Spec source archive` / `Runtime mirror guard` / `i18n guard` / `Verify Internal Key Exceptions` / `orchestrator-tests` | pass | — |

### 2.3 Verified Blockers（本 sidecar 在本地重現，非推測）

#### B-1（blocking）— Commit subject 格式不符 `docs/ops/branch-strategy.md` §5

`Commit trailers` gate 要求 subject 為 `<TASK-ID>: <summary>`，但 4 個 commit 全部使用
conventional-commit 前綴（`feat(IAM-SES-003): …` / `fix(IAM-SES-003): …`）。三個 trailer
（`LLM-Agent` / `Task-ID` / `Reviewer`）本身存在，純粹是 subject 格式問題。

```
$ python3 scripts/git/check_commit_trailers.py --base origin/dev --head origin/gemini/iam-ses-003
::error::check_commit_trailers: 4 commit(s) failed trailer validation.
  commit f2bdbe845f51:
    - subject must be `<TASK-ID>: <summary>`, got: 'fix(IAM-SES-003): enforce strict self-only session revocation on auth route'
  commit 58f2eece6414: … 'fix(IAM-SES-003): register session route auth policies for route inventory classification'
  commit 1e4b81af3fca: … 'fix(IAM-SES-003): enforce strict admin session inventory and revoke authority boundaries'
  commit ea1a2d285017: … 'feat(IAM-SES-003): session inventory logout-all and boundary-safe admin revoke'
```

修法：rebase 改寫 4 個 subject 為 `IAM-SES-003: <summary>`，並順手把 `ea1a2d28` 的
`Reviewer: Claude` 改為 machine truth 的 `Reviewer: Codex`。

#### B-2（blocking，本 PR 造成既有套件回歸）— `AuthController` constructor 插入第 4 個位置參數，call site 只補了 1/5

本 PR 在 `AuthController` 的第 4 個位置插入 `identityRepository`：

```
origin/dev : (jwtAuthService, tenantPartnerService, driverDeviceSessionService,
              securityEventsService?, iapSubjectAdapter?, serviceWorkloadIdentityAdapter?)
f2bdbe84   : (jwtAuthService, tenantPartnerService, driverDeviceSessionService,
              identityRepository?, securityEventsService?, iapSubjectAdapter?, serviceWorkloadIdentityAdapter?)
```

Production Nest DI 不受影響（`@Optional()` + decorator metadata 依型別解析，`AuthModule` 已
`imports: [IdentityModule]`）。受影響的是所有**手動 positional 建構**的測試 fixture：

| Call site | 是否更新 | 後果 |
| --- | --- | --- |
| `tests/integration/iap-subject-adapter.integration.test.ts:341` | ✅ 已補 `identityRepo` | 正確 |
| `tests/integration/iap-subject-adapter.integration.test.ts:401,450,591` | ❌ 未補 | `securityEventsService` 被綁到 `identityRepository`、`adapter` 被綁到 `securityEventsService`、`iapSubjectAdapter` 為 `undefined` |
| `apps/api/tests/integration/service-workload-identity.integration.test.ts:84` | ❌ 未補 | `workloadIdentityAdapter` 被綁到 `iapSubjectAdapter`，`serviceWorkloadIdentityAdapter` 變 `undefined` |
| `apps/api/tests/unit/auth-bootstrap.test.ts:71`、`tests/unit/auth-bootstrap.test.ts:30`、`tests/unit/jwt-auth-controller-error-mapping.test.ts:40`、`tests/security/iam-auth-negative-matrix.test.ts:22` | n/a | 只傳前 3 個參數，不受位移影響 |

已重現的實際回歸（**與 IAM-SES-003 無關的既有套件**）：

```
$ (cd apps/api && vitest run tests/integration/service-workload-identity.integration.test.ts)
 Test Files  1 failed (1)
      Tests  12 failed | 6 passed (18)
   AssertionError: expected code "WORKLOAD_ASSERTION_INVALID", received "WORKLOAD_IDENTITY_NOT_CONFIGURED"
```

`WORKLOAD_IDENTITY_NOT_CONFIGURED` 正是 `serviceWorkloadIdentityAdapter === undefined` 的
fail-closed 分支，直接證實位移是主因。

**為什麼綠燈測試沒抓到**：`tests/integration/iap-subject-adapter.integration.test.ts` 在
`f2bdbe84` 仍 **14/14 pass** —— vitest 用 esbuild 去掉型別、不做 type check，所以三個綁錯位
的 call site 在 runtime 靜默通過。這代表「整合測試綠燈」在本 PR 不足以證明 wiring 正確。

- [ ] reviewer 必須要求 parent owner 補齊 4 個 call site，或改用 named-options constructor 以免
      未來再次位移。

#### B-3（blocking）— `typecheck` 紅燈，13 個 TS error 全在本 PR 的測試檔

```
$ tsc -p tsconfig.json --noEmit     # 需先 build packages/contracts + packages/control-plane-auth
tests/integration/iam-ses-003-session-management.integration.test.ts(85,34): error TS2554: Expected 1-9 arguments, but got 0.
tests/integration/iam-ses-003-session-management.integration.test.ts(88,7):  error TS2345: Argument of type 'IdentityRepository' is not assignable to parameter of type 'DriverProfileService'.
tests/integration/iam-ses-003-session-management.integration.test.ts(367..370,14): error TS18048: 's' is possibly 'undefined'.   (×4)
tests/integration/iam-ses-003-session-management.integration.test.ts(441,442): error TS2532: Object is possibly 'undefined'.    (×2)
tests/integration/iam-ses-003-session-management.integration.test.ts(577,641): error TS2741: Property 'requestId' is missing … in type 'BootstrapRequestIdentity'.  (×2)
tests/integration/iap-subject-adapter.integration.test.ts(405,454,595): error TS2345: 'SecurityEventsService' is not assignable to parameter of type 'IdentityRepository'.  (×3)
```

其中兩項是語意層面的、不只是型別噪音：

- `:85` `new TenantPartnerService()` 傳 0 個參數，實際需要 1–9 個 → 測試裡的
  `tenantPartnerService` 所有依賴都是 `undefined`。
- `:88` `new DriverDeviceSessionService(jwtAuthService, identityRepository)` 第 2 個參數應為
  `DriverProfileService` → 測試裡的 driver session 路徑並非真實 wiring。

`apps/api` 自身（`tsc -p apps/api/tsconfig.json --noEmit`，`include: src/**`）是乾淨的；紅燈完全
來自測試檔。

#### B-4（blocking）— `lint` 紅燈

CI `lint:root`（`eslint … tests --max-warnings=0`）：

```
tests/integration/iam-ses-003-session-management.integration.test.ts
  16:3  error  'maskSessionRecord' is defined but never used  @typescript-eslint/no-unused-vars
✖ 1 problem (1 error, 0 warnings)
```

本地對 changed files 再跑一次，另外抓到一個 CI 尚未顯示的錯誤（因為 `lint:root &&
turbo run lint` 在第一段就中止，`apps/api` 的 lint 還沒跑到）：

```
apps/api/src/modules/auth/auth.controller.ts
  1:65  error  'Query' is defined but never used  @typescript-eslint/no-unused-vars
```

附帶語意訊號：`maskSessionRecord` 被 import 卻沒被斷言，代表 AC-3 的「masking 在 response 組裝
路徑上強制套用」這一條**沒有直接測試覆蓋**（只測了三個 helper 函式本身）。

### Gap Summary

| 問題 | 影響 | 根本原因 |
| --- | --- | --- |
| 四個 session 事件用 best-effort `recordEvent()`，非 fail-closed `recordEventRequired()` | privileged revoke 在 audit 寫入失敗時仍會成功，違反 `IAM-AUD-001` 驗收 | 沿用 controller 既有 best-effort 呼叫慣例，未切換到已存在的 required 變體 |
| `expectedVersion` 為 optional，省略即完全跳過版本檢查 | 「concurrent revoke negatives」只在 caller 主動帶版本時成立 | optimistic concurrency 設計成 opt-in，且為 read-then-check 非 atomic |
| `validateCsrfHeader()` 只檢查 header 存在性 + 字面 denylist | 非 synchronizer-token / double-submit 驗證，強度需 reviewer 明確接受 | helper 以測試可通過為導向實作 |
| PR 無任何 UI 或 `tests/e2e/` 檔案 | 架構計畫 §584 驗收寫的是「UI / API / audit / negative boundary 完成」 | 本次交付範圍只做 API + integration test |
| `IAM-ACC-003` 只到 `ci_pending`，未 merge 到 `dev` | 上游依賴尚未整合完成 | PR #1279 CI 未收斂（`2026-08-08T08:2x` 重查仍 `OPEN` / `BLOCKED` / `mergedAt=null`） |
| 四個 `session.*` eventType 未登錄進 `SECURITY_EVENT_MATRIX`（14 筆，無任何 `session.logout` / `session.revoke` / `session.admin_revoke` / `session.logout_all`） | `IAM-AUD-001` 驗收「Required auth and governance event matrix is queryable」不成立於本 task 的事件；`GET security-events` 的 matrix 端點查不到這四種 | 事件只在 controller 端 `recordEvent()`，未同步登錄 canonical matrix |
| `AuthController` constructor 位置參數位移，5 個 call site 只補 1 個 | 既有 `service-workload-identity` 套件 12/18 test 失敗 | positional constructor + vitest 不做 type check（見 B-2） |

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
- [ ] reviewer 應確認 tenant boundary 判斷放在 controller 內是否足夠，或是否應下沉到 guard / policy 層以免未來新路由漏套。`58f2eece` 新增的 `apps/api/src/common/auth/auth.policy.ts`（`resolveRouteAuthPolicy()`）是往 policy 層收斂的第一步，但目前只用於 route inventory **分類**，不是 enforcement 路徑——reviewer 需確認這個區別有被正確理解，不要誤以為授權已經下沉。

**`f2bdbe84` 改變了本條的形狀（packet 初版尚未涵蓋）**：該 commit 把
`POST /api/auth/sessions/:sid/revoke` 收斂為**嚴格 self-only**，移除原本寫在 auth controller 裡的
platform/ops/tenant admin remote-revoke 分支，遠端撤銷一律走 identity controller。

- 正面影響：admin 授權判斷不再有兩份實作，重複邏輯漂移的風險消失。
- 需 reviewer 確認：新的 self 判定改成三個識別碼的 OR ——
  `targetSession.principalId === callerPrincipalId || targetSession.actorId === identity.actorId || targetSession.subject === identity.subject`
  （`auth.controller.ts`）。比原本單一 `principalId` 比對**更寬**。同一 human 跨 tenant 持有多個
  principal 時，可用 A membership 的 token 撤銷 B membership 的 session。這多半是想要的行為，但
  應該是明示決定而非 OR 串接的副作用。
- [ ] reviewer 需裁決 OR 條件是否為刻意放寬，並要求註解說明；若非刻意，應收斂回 `principalId`。

### AC-3 — Device and IP summaries are masked

- [ ] `GET /api/auth/sessions` 與 admin 查詢皆只回傳 masked device / IP，不外洩完整 IP、硬體序號或 token。
- [ ] IPv4 與 IPv6 都要有正確 masking，不可只處理 IPv4。
- 證據：`session-masking.utility.ts` 的 `maskIpAddress` / `maskDeviceSummary` / `maskRiskSummary` / `maskSessionRecord`；整合測試 `should mask IPv4 and IPv6 addresses correctly`、`should mask sensitive hardware serials and IP in device summary`。
- [ ] reviewer 應確認 masking 是在 response 組裝路徑上**強制**套用（而非依賴呼叫端自律），且 error detail / audit context 不會反向洩漏未遮蔽值。
- **證據缺口（來自 B-4）**：`maskSessionRecord` 在測試檔中被 import 但從未被呼叫（這正是 lint 紅燈的那一行）。也就是說目前只驗證了三個 helper 的純函式行為，**沒有任何測試證明 session inventory response 真的走過 masking**。這條 AC 的核心主張目前是未覆蓋的。

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
- **證據缺口 1**：整合測試建了 `securityEventsService` 並注入兩個 controller，但**沒有任何一個 assertion 檢查事件真的被寫出**（沒有 `listEvents` / `recentEvents` 斷言）。AC-5 的 audit 半邊目前完全沒有測試證據，只有「舊 token 拒絕」那半邊有。
- **證據缺口 2**：四個 `session.*` eventType **未登錄進 `apps/api/src/common/audit/security-event-matrix.ts`**（該檔 14 筆，涵蓋 `driver_device_session.revoked` 等，但沒有本 task 的四種）。`SecurityEventsService.listMatrix()` 直接回傳這個常數，因此 matrix 查詢端點看不到這四種事件，與 `IAM-AUD-001` 驗收第 1 條「Required auth and governance event matrix is queryable」有落差。
  - 公允補充：matrix 目前只作為宣告式清單，`recordEvent()` 不會因為事件不在 matrix 裡而拒寫，所以這不影響事件實際落盤，只影響可查詢性 / 治理清單完整性。

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
| E-2 | Parent delivery branch + PR | `gemini/iam-ses-003` @ **`f2bdbe845f51`**（4 commits）, PR #1322 (`OPEN`, `MERGEABLE`, **`BLOCKED`**) |
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
| E-13 | 整合測試 **21** 個案例（執行確認，非靜態計數） | `tests/integration/iam-ses-003-session-management.integration.test.ts` |
| E-14 | 無 UI / e2e 檔案 | PR #1322 file list 無 `*.tsx` / `tests/e2e/*` |
| E-15 | Commit trailer gate 失敗（4/4） | `python3 scripts/git/check_commit_trailers.py --base origin/dev --head origin/gemini/iam-ses-003` |
| E-16 | `AuthController` ctor 第 4 位插入 `identityRepository` | `git show origin/dev:apps/api/src/modules/auth/auth.controller.ts` vs `f2bdbe84` |
| E-17 | 既有套件回歸 12/18 fail | `apps/api/tests/integration/service-workload-identity.integration.test.ts`（`WORKLOAD_IDENTITY_NOT_CONFIGURED`） |
| E-18 | 綁錯位的 call site 在 runtime 靜默通過 | `tests/integration/iap-subject-adapter.integration.test.ts` 14/14 pass 但 typecheck 3 error |
| E-19 | 四個 `session.*` 不在 canonical matrix | `apps/api/src/common/audit/security-event-matrix.ts`（14 筆） |
| E-20 | `f2bdbe84` 把 self revoke 收斂為 self-only 且採 3-way OR 判定 | `git show f2bdbe84 -- apps/api/src/modules/auth/auth.controller.ts` |
| E-21 | `auth.policy.ts` 只用於 route inventory 分類 | `apps/api/src/common/auth/auth.policy.ts`（`resolveRouteAuthPolicy`） |

---

## 5.1 Sidecar Run Log

所有指令在 detached verify worktree（`.artifacts/worktrees/ses003-verify` @ `f2bdbe84`）執行；
`packages/contracts` 與 `packages/control-plane-auth` 先 build 出 `dist/index.d.ts`（`apps/api/tsconfig.json`
的 `paths` 指向 dist，未 build 會產生大量假的 `TS2307` 噪音——初次嘗試即踩到此坑，該批結果已作廢）。

- `2026-08-08T08:29Z` — `vitest run tests/integration/iam-ses-003-session-management.integration.test.ts`
  → **21 passed (21)**，2.33s。本 task 自身的整合測試在 `f2bdbe84` 全綠。
- `2026-08-08T08:32Z` — `vitest run tests/integration/iap-subject-adapter.integration.test.ts`
  → **14 passed (14)**，但同一檔在 typecheck 有 3 個 `TS2345`（見 B-2 / B-3）。
- `2026-08-08T08:32Z` — `(cd apps/api && vitest run tests/integration/service-workload-identity.integration.test.ts)`
  → **12 failed | 6 passed (18)**。既有套件回歸，見 B-2。
- `2026-08-08T08:33Z` — `tsc -p tsconfig.json --noEmit`
  → 13 個 error 落在本 PR 兩個測試檔（另有 4 個 `platform-admin-web` 錯誤屬本地未 build 的 workspace 噪音，不計入）。
- `2026-08-08T08:31Z` — `tsc -p apps/api/tsconfig.json --noEmit` → **clean**。
- `2026-08-08T08:30Z` — `eslint <changed files> --max-warnings=0` → 2 error（見 B-4）。
- `2026-08-08T08:27Z` — `python3 scripts/git/check_commit_trailers.py --base origin/dev --head origin/gemini/iam-ses-003`
  → 4 commit 全部失敗（見 B-1）。

未執行（明確聲明，不當作已驗證）：

- `integration` / `e2e` / `iam-negative-matrix` 需要 Postgres + PostGIS runtime，本 sidecar 未起 DB，
  一律以 PR #1322 的 CI 結果為準。
- `Smoke acceptance` 的失敗原因未從 log 中定位到可歸因段落，因此只記錄「紅燈」，不提出根因。

---

## 6) Reviewer Hotspots (`Gemini`)

以下皆有 repo evidence，非推測。**閱讀順序：先 §2.3 的 B-1..B-4（CI 硬阻擋，已在本地重現），
再看 H-1..H-6（語意判斷，需要 reviewer 裁決）。**

### H-0 (最高，先於一切) — PR #1322 目前 `BLOCKED`，四個 gate 紅燈

在 B-1..B-4 修掉之前，`IAM-SES-003` 無法 merge，parent 也不可能推進到
`INTEGRATION_STATUS=merged_to_dev`。其中 B-2 不只是本 task 的問題——它讓
`apps/api/tests/integration/service-workload-identity.integration.test.ts` 的 12 個既有測試變紅，
屬於本 PR 造成的**跨 task 回歸**。

- [ ] reviewer 應把 B-1..B-4 當成 parent 的 blocking rework，而不是 nice-to-have。
- [ ] 特別是 B-2：不能靠「整合測試綠燈」放行，因為綠燈本身就是型別被 esbuild 剝掉的產物。

### H-1 — Audit 未 fail-closed，與 `IAM-AUD-001` 驗收條款有落差

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
本次重查（`2026-08-08T08:2xZ`）：PR #1279 仍 `state=OPEN`、`mergeStateStatus=BLOCKED`、`mergedAt=null`。

- [ ] parent closeout 時不應把三個依賴一律描述為「已整合」；`IAM-ACC-003` 目前只到 branch/PR 層級。

### H-6 — Machine truth 的 parent commit 已過期

`IAM-SES-003.next` 記錄 `1e4b81af3fca…`，但 branch head 已是 `f2bdbe84`（多了 `58f2eece`、
`f2bdbe84` 兩個 fix commit）。此外 `ea1a2d28` 的 `Reviewer:` trailer 寫 `Claude`，與 machine truth
的 `reviewer=Codex` 不一致。

- [ ] parent owner 應在下一次 `progress` 更新 commit 指標；B-1 的 rebase 正好可以順手修正 trailer。

### 一般性檢查

- [ ] packet 是否忠實反映 machine truth：parent `in_progress`、Owner=`Gemini`、Reviewer=`Codex`、`INTEGRATION_STATUS=pr_open`。
- [ ] 本 sidecar 是否完全沒有修改 canonical truth 或主線 runtime（應只新增 `support/sidecars/IAM-SES-003/` 下的檔案）。

**建議核准用語：**

> `IAM-SES-003 acceptance packet ready: verified against parent head f2bdbe84, it maps all five machine-truth acceptance rows onto PR #1322 evidence anchors, records four locally reproduced merge blockers (commit-subject format on 4/4 commits, an AuthController positional-constructor shift that regresses 12 pre-existing service-workload-identity tests, 13 typecheck errors, and two no-unused-vars lint errors), keeps the parent correctly at pr_open rather than integrated, and raises six evidence-backed reviewer hotspots without editing canonical truth or the parent runtime.`

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

**Reviewer 判定（`Gemini`，`2026-08-08T08:39:09Z`）：`approve`。**
review note：「IAM-SES-003 acceptance packet 結構完整，精確對齊 PR #1322 證據與 machine truth，
未觸及 canonical truth，准予核准回到 owner 收尾」。task 進入 `review_approved`，交還 owner `Claude` 收尾。

本 sidecar 有實際 commit（新增 support artifact），因此提供 commit / push evidence：

```bash
AI_NAME=Claude \
COMMIT_HASH=<closeout-sha> \
COMMIT_SUBJECT="IAM-SES-003-SIDECAR-ACCEPTANCE: record reviewer approval and owner closeout" \
PUSH_REMOTE=origin \
PUSH_BRANCH=claude/iam-ses-003-sidecar-acceptance \
INTEGRATION_STATUS=branch_pushed \
scripts/ai-status.sh done IAM-SES-003-SIDECAR-ACCEPTANCE "Owner finalized approved support-only acceptance packet for IAM-SES-003"
```

### 9.1 Closeout Evidence

| 項目 | 值 |
| --- | --- |
| Branch | `claude/iam-ses-003-sidecar-acceptance`（base `dev`，merge-base `7e5a29d5`） |
| Commit 1 | `fdadf8ad` — `docs(IAM-SES-003-SIDECAR-ACCEPTANCE): add acceptance packet and dependency map` |
| Commit 2 | `c1aba471` — `IAM-SES-003-SIDECAR-ACCEPTANCE: re-verify acceptance packet against parent head f2bdbe84` |
| Commit 3（本次） | closeout commit，subject `IAM-SES-003-SIDECAR-ACCEPTANCE: record reviewer approval and owner closeout` |
| Push | `origin`，普通 non-force push；`git ls-remote origin claude/iam-ses-003-sidecar-acceptance` 已確認 `c1aba471` 在遠端 |
| `INTEGRATION_STATUS` | `branch_pushed` — branch 已推送、**未** merge 進 `dev`、**未**部署 dev 測試機 |
| Canonical truth | 未修改；本 branch 的 diff 僅 `support/sidecars/IAM-SES-003/IAM-SES-003-SIDECAR-ACCEPTANCE.md` |

**收尾層級聲明：** 本 task 的 `done` 只代表 support artifact 已交付並推送到 task branch。
它**不**代表 `IAM-SES-003` 本身被接受，也**不**代表 PR #1322 可以 merge——§2.3 的 B-1..B-4 四個
merge blocker 在 `f2bdbe84` 仍為紅燈，parent 應維持 `pr_open` 而非任何整合完成狀態。

Parent absorption（是否把 H-0..H-6 吸收成主線修正或後續 backlog）由 parent owner `Gemini` 與 parent reviewer `Codex` 決定，不由此 sidecar 自動推進。

### 本 sidecar 自身的 trailer 缺陷（自我揭露）

本 branch 的第一個 commit `fdadf8ad` subject 為
`docs(IAM-SES-003-SIDECAR-ACCEPTANCE): add acceptance packet and dependency map`，
與 B-1 指出的是**同一類**格式違規（應為 `<TASK-ID>: <summary>`）。該 commit 已 push，修正需要
force push，違反 worker 協議「只做普通 non-force push」，因此**未修正**。第二個 commit
`c1aba471` 與本次 closeout commit 已採用合規格式。

已在本地實測確認（`2026-08-08T08:40Z`）：

```
python3 scripts/git/check_commit_trailers.py --base 7e5a29d5 --head HEAD
::error::check_commit_trailers: 1 commit(s) failed trailer validation.
  commit fdadf8ad32b4:
    - subject must be `<TASK-ID>: <summary>`, got:
      'docs(IAM-SES-003-SIDECAR-ACCEPTANCE): add acceptance packet and dependency map'
```

- 影響範圍：若這條 sidecar branch 之後開 PR，`Commit trailers` gate 會因 `fdadf8ad` 失敗（1/3 commit）。
- 建議處置：由具備 branch 改寫授權的角色 rebase 修正，或在 squash-merge 時以合規 subject 落地。
- 為何不在收尾時修：修正 `fdadf8ad` 需要改寫已 push 的歷史，只能 force push，而 dispatch 協議明文禁止
  `--force`。因此此缺陷以**已揭露、未修正**的形式交付，不隱藏在綠燈敘述裡。

---

## 10) Change Log

- 2026-08-08T08:40:47Z — 收尾版：記錄 reviewer `Gemini` 於 `2026-08-08T08:39:09Z` 的 `approve` 判定與
  review note，新增 §9.1 Closeout Evidence（branch / 三個 commit / push / `INTEGRATION_STATUS=branch_pushed`）
  與收尾層級聲明（sidecar `done` ≠ parent 接受 ≠ PR #1322 可 merge），把自我揭露段落中已過期的
  commit hash `f1efe4e5` 更正為實際的 `c1aba471`，並補上 `check_commit_trailers.py` 的本地實測輸出。
  未修改任何 canonical truth 或 parent runtime。
- 2026-08-08T08:36:00Z — 第二版：把 packet 重新對齊到已前進兩次的 parent head `f2bdbe84`（初版錨在 `1e4b81af`）。
  新增 §2.2 CI gate 狀態與 §2.3 四項**已在本地重現**的 merge blocker（B-1 commit subject 格式 4/4 違規、
  B-2 `AuthController` constructor 位置參數位移導致 `service-workload-identity` 既有套件 12/18 回歸、
  B-3 13 個 typecheck error、B-4 兩個 `no-unused-vars`），新增 §5.1 Run Log 與 E-15..E-21，
  新增 H-0（CI 硬阻擋優先）與 H-6（machine truth commit 過期 + trailer reviewer 不一致）。
  更正初版三處：PR 檔案數 8→9（`58f2eece` 新增 `auth.policy.ts`）、整合測試 24→21（改以實際執行計數）、
  AC-2 形狀（`f2bdbe84` 已將 `/api/auth/sessions/:sid/revoke` 收斂為 self-only 並改用 3-way OR 判定）。
  另補 AC-3 / AC-5 的測試覆蓋缺口（`maskSessionRecord` 未被斷言、audit 事件無任何斷言、四個 `session.*`
  未登錄 `SECURITY_EVENT_MATRIX`）。未修改任何 canonical truth 或 parent runtime。
- 2026-08-08T08:09:39Z — 初版建立：依 machine truth（parent `in_progress` / `pr_open`、三個依賴 `done` 但 `IAM-ACC-003` 僅 `ci_pending`）、架構計畫 §12.1 / §584 / §19.3，以及 PR #1322 實際 diff 掃描，整理 `IAM-SES-003` 的 acceptance framing（AC-1..AC-5）、dependency map、evidence inventory（E-1..E-14）與五項 evidence-backed reviewer hotspots（H-1 audit 非 fail-closed、H-2 concurrency opt-in 且非 atomic、H-3 CSRF 為 presence-based、H-4 缺 UI/e2e、H-5 依賴整合層級不一致）。未修改任何 canonical truth 或 parent runtime。
