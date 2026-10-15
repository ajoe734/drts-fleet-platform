# FLEET-TRAINING-AUTHORIZED-CALLER-20261015 — 車行訓練頁接既有合法身份與車行範圍讀回

- **任務識別碼 (Task ID)**：`FLEET-TRAINING-AUTHORIZED-CALLER-20261015`
- **負責角色**：Owner: `Gemini2`；Reviewer: `Gemini`
- **基準分支與 SHA (Base)**：`dev` @ `ed70d73a03dd224e109867c99b7d04128484a3fe`（初始探索基底 `386eaa45213cd0c67e9b9e5b3bcd9b01a3195b09`）
- **候選分支與實作 SHA (Candidate Branch & Implementation Commit)**：`gemini2/fleet-training-authorized-caller-20261015-clean`（實作與測試 commit：`6cf10e0acb40239da4e270032dbdda4f421d24df`；保留前次已發布分支 `gemini2/fleet-training-authorized-caller-20261015` @ `8a6671b9540bbc2a09f7359f67d8d6307ca0d47d` 不進行 rebase/amend/force-push；因 `tools/ci/git/check_commit_trailers.py` 檢核 `origin/dev..HEAD` 內每一筆非 merge commit 之 `<TASK-ID>: <summary>` 主旨格式，故自 `origin/dev` 切出乾淨候選分支並補齊主旨格式）
- **工作樹路徑 (Worker Cwd)**：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-fleet-training-authorized-caller-20261015`
- **不可變規格與稽核來源**：
  - Task Spec：`/home/lupin/workspace/drts-fleet-platform/.local/remaining-original-functional-fixes-20261015/FLEET-TRAINING-AUTHORIZED-CALLER-20261015.json`
  - 唯讀稽核報告：`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T0851-bank-authority-root/C071-current-accepted-training-dataflow-readonly-audit.json`
  - 既有已驗收 Academy 身份契約：`docs/04-uat/system-remediation-20260906/academy-identity-decision.md` (`SR-ACADEMY-BE-001-IDENTITY-CONTRACT`)
- **受控寫入範圍 (Write Scopes)**：
  - `apps/fleet-partner-portal-web/lib/academy-api.server.ts`
  - `apps/fleet-partner-portal-web/lib/academy-data.server.ts`
  - `apps/fleet-partner-portal-web/app/training/`
  - `tests/unit/system-remediation/sr-academy-fe-001/sr-academy-fe-001.test.ts`
  - `tests/unit/fleet-training-authorized-caller-20261015/`
  - `docs/04-uat/system-remediation-20260906/FLEET-TRAINING-AUTHORIZED-CALLER-20261015.md`
- **必備驗收鍵 (Required Acceptance Keys)**：
  - `fleet-training_existing-verified-principal-and-fleet-binding`
  - `fleet-training_actual-summary-overdue-and-drilldown-caller`
  - `fleet-training_original-scope-denials-and-empty-errors`
  - `fleet-training_exact-candidate-validation`

---

## 1. 問題定位與修前最小重現 (Finding F1 Reproduction & Root Cause)

依據唯讀稽核報告 `C071-current-accepted-training-dataflow-readonly-audit.json` 之 Finding `F1` (`fleet_portal_training_caller_auth_scope_and_fleet_selector_mismatch`)，原 C071 車行訓練看板 (`apps/fleet-partner-portal-web/app/training/page.tsx` → `apps/fleet-partner-portal-web/lib/academy-data.server.ts`) 在實際呼叫後端 `/api/fleet-partner/training/*` 時存在兩項具體斷裂：

1. **Billing-only 客戶端權限不符 (`403 AUTH_SCOPE_DENIED`)**：
   - 原 `academy-data.server.ts` 呼叫 `getServerFleetPartnerClient()` (`apps/fleet-partner-portal-web/lib/api-client.server.ts:87-129`)。
   - `getServerFleetPartnerClient()` 固定以 `partner_api_key` (`realm: "partner"`, `scopes: ["billing:read"]`) 簽發或附加認證標頭。
   - 然而後端 `FleetPartnerTrainingController` (`apps/api/src/modules/driver-academy/academy.controller.ts:110-115`) 與 `ROUTE_AUTH_POLICIES` (`apps/api/src/common/auth/route-policies.ts:288-297`) 明定 `/api/fleet-partner/training/*` 必須同時具備 `requiredScopes: ["billing:read", "reports:read"]`（且 `allowedRealms: ["tenant", "ops", "platform", "system"]`）。
   - 因此 `BootstrapAuthGuard` 直接以 `403 AUTH_SCOPE_DENIED` 拒絕，導致 `loadFleetTraining()` 永遠落入 `catch` 分支並回傳 `source: "fallback"`（KPI 全為 `"—"`、課表與名單全空），`loadFleetDriverQuizAttempt()` 永遠回傳 `null`。
2. **非 Tenant 領域呼叫漏傳 Canonical `?fleetPartnerId` Query Selector (`400 FLEET_PARTNER_ID_REQUIRED`)**：
   - 共享 SDK `packages/api-client/src/index.ts:956-975` 之 `getFleetTrainingSummary()`、`listFleetDriverRoster()`、`getFleetDriverQuizAttempt(driverId, attemptId)` 僅發送無 query 參數之 `/api/fleet-partner/training/summary`、`/api/fleet-partner/training/roster`、`/api/fleet-partner/training/drivers/:driverId/attempts/:attemptId`，忽略 `RequestOptions.tenantId`。
   - 後端 `FleetPartnerTrainingController.resolveFleetPartnerId` (`apps/api/src/modules/driver-academy/academy.controller.ts:171-199`) 僅在 `identity.realm === "tenant"` 時自 `identity.tenantId` 推導車行識別碼；對於合法的非 tenant 呼叫者（如 `ops`、`platform`、`system` 領域管理員），必須透過 `@Query("fleetPartnerId")` 傳遞明確車行範圍，否則拋出 `400 FLEET_PARTNER_ID_REQUIRED`。

### 修前重現證據 (Before-Fix Reproduction)

在保留未修改之 `apps/fleet-partner-portal-web/lib/academy-data.server.ts`（仍呼叫 `getServerFleetPartnerClient()`）下執行 `pnpm exec vitest run tests/unit/fleet-training-authorized-caller-20261015/fleet-training-authorized-caller.test.ts`：

- 當傳入合法簽章之 `tenant_admin` Bearer JWT（含 `tenantId: "fleet_alpha_001"`, `scopes: ["reports:read", "billing:read"]`）時，舊 `getServerFleetPartnerClient()` 因忽略 JWT 內之 `tenantId` 而直接拋出 `Error: Missing fleet scope configuration: DRTS_FLEET_PARTNER_ID environment variable or x-fleet-partner-id header is required.`。
- 當同時設定 `DRTS_FLEET_PARTNER_ID=fleet_alpha_001` 時，舊 `getServerFleetPartnerClient()` 以 `partner_api_key` (`granted_scopes: ["billing:read"]`) 覆蓋認證，遭真實 `BootstrapAuthGuard` 攔截並回傳：
  ```json
  {
    "error": {
      "code": "AUTH_SCOPE_DENIED",
      "message": "Bootstrap identity is missing one or more required scopes.",
      "details": {
        "route": "/api/fleet-partner/training/summary",
        "method": "GET",
        "required_scopes": ["billing:read", "reports:read"],
        "granted_scopes": ["billing:read"]
      }
    }
  }
  ```
- 當合法 `ops_user` 呼叫未帶 `?fleetPartnerId` 之原 SDK 方法時，`FleetPartnerTrainingController.resolveFleetPartnerId` 回傳 `400 FLEET_PARTNER_ID_REQUIRED`。

---

## 2. 既有合法身份與車行範圍綁定契約 (Existing Principal & Canonical Fleet Binding)

遵照 `docs/04-uat/system-remediation-20260906/academy-identity-decision.md` (`SR-ACADEMY-BE-001-IDENTITY-CONTRACT`)，我們新增 C071 專屬服務端適配器 [`apps/fleet-partner-portal-web/lib/academy-api.server.ts`](file:///home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-fleet-training-authorized-caller-20261015/apps/fleet-partner-portal-web/lib/academy-api.server.ts) 並由 [`apps/fleet-partner-portal-web/lib/academy-data.server.ts`](file:///home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-fleet-training-authorized-caller-20261015/apps/fleet-partner-portal-web/lib/academy-data.server.ts) 採用，不修改共享 `@drts/api-client`、不修改後端 `BootstrapAuthGuard` / `route-policies.ts`、亦不影響一般車行帳務／C063／C069 既有呼叫者。

### 2.1 既有認證主體與車行範圍來源對照表 (Session / Principal-to-Fleet Source Mapping)

| 認證主體來源 (`principalSource`) | 讀取位置 (Inbound Context) | 驗證與傳遞方式 (Backend Verification) | Canonical `fleetPartnerId` 來源 (`fleetSelectorSource`) | Query Selector 行為 (`?fleetPartnerId=`) |
| :--- | :--- | :--- | :--- | :--- |
| `jwt_bearer_header` | `x-drts-authorization` 或 `authorization` (`Bearer <jwt>`) | 原樣轉發 `authorization` / `x-drts-authorization` 交由後端 `JwtAuthService.verifyAccessToken` 驗章（不附加任何 bootstrap 標頭以免觸發 strict mode `AUTH_BOOTSTRAP_DISABLED`） | 若 `realm === "tenant"`：取自 token 之 `tenant_id` / `tenantId` (`tenant_id_claim`)；若為非 tenant 領域 (`ops` / `platform` / `system`)：取自 `x-fleet-partner-id` (`explicit_header`) 或 `DRTS_FLEET_PARTNER_ID` (`env_default`) | Tenant 領域預設不加 query（由後端自 `identity.tenantId` 推導；若請求明確帶跨車行 `x-fleet-partner-id` 則原樣附上 query 讓後端攔截並回 `403 ACADEMY_FORBIDDEN_FLEET_ACCESS`）；非 tenant 領域必傳 `?fleetPartnerId=<canonical>` |
| `jwt_bearer_cookie` | `drts_tenant_session` 或 `drts_session` Cookie | 轉為 `authorization: Bearer <cookie_jwt>` 交由後端 `JwtAuthService.verifyAccessToken` 驗章 | 同上（Tenant 取自 `tenant_id` claim；非 tenant 取自 `x-fleet-partner-id` 或 `DRTS_FLEET_PARTNER_ID`） | 同上 |
| `iap_jwt_assertion` | `x-goog-iap-jwt-assertion` (Verified Google IAP Workforce Assertion) | 原樣轉發 `x-goog-iap-jwt-assertion`（若有已簽章 `x-drts-request-auth` 亦一併轉發）交由後端 `IapAuthService` + 持久角色綁定或 control-plane token 驗證 | 若 assertion 帶 `tenant_id`：取自 `tenant_id_claim`；否則取自 `x-fleet-partner-id` (`explicit_header`) 或 `DRTS_FLEET_PARTNER_ID` (`env_default`) | 非 tenant 領域必傳 `?fleetPartnerId=<canonical>` |
| `bootstrap_headers` | 非 strict 環境下之既有 `x-actor-type` / `x-realm` / `x-actor-id` / `x-scopes` | 僅原樣轉發請求既有之 bootstrap 標頭（絕不自行合成或補齊 `reports:read`） | 若 `x-realm === "tenant"` 且有 `x-tenant-id`：取自 `tenant_id_claim`；否則取自 `x-fleet-partner-id` 或 `DRTS_FLEET_PARTNER_ID` | Tenant 領域無衝突時不加 query；非 tenant 領域必傳 `?fleetPartnerId=<canonical>` |
| `none` | 無任何上述已驗證主體，僅有 `x-fleet-partner-id` 或 `DRTS_FLEET_PARTNER_ID` | **絕不偽造身份**：即使環境設定 `DRTS_CONTROL_PLANE_AUTH_SECRET` 或傳入顯示用 `x-goog-authenticated-user-email` / Cloud Run `x-serverless-authorization`，亦不合成 `ops_user` 或 `reports:read` 權限；後端 `BootstrapAuthGuard` 依規回傳 `401 AUTH_REQUIRED` | `explicit_header` 或 `env_default`（若連 fleet scope 亦缺席則直接拋出 `Missing fleet scope configuration`） | 附上 `?fleetPartnerId=<canonical>`，由後端 `BootstrapAuthGuard` 執行 `401 AUTH_REQUIRED` 拒絕 |

### 2.2 C071 本地適配器端點組裝 (`academy-api.server.ts` & `academy-data.server.ts`)

- `getServerFleetTrainingClient()` 透過既有 `new ApiClient(apiUrl, defaultOptions)` 並使用 `pathTransform` 將 `/fleet-partner/...` 映射為 `/api/fleet-partner/...`。
- 在 C071 專屬客戶端上覆寫 `getFleetTrainingSummary()`、`listFleetDriverRoster()` 與 `getFleetDriverQuizAttempt(driverId, attemptId)`，透過 `appendFleetPartnerQuery(path, queryFleetPartnerId)` 將合法解析之 `queryFleetPartnerId` 附加至 `/fleet-partner/training/summary?fleetPartnerId=...`、`/fleet-partner/training/roster?fleetPartnerId=...` 與 `/fleet-partner/training/drivers/:driverId/attempts/:attemptId?fleetPartnerId=...`，底層仍完全走 `ApiClient.get(...)` 與真實 HTTP 回應解析。
- 同步將 [`apps/fleet-partner-portal-web/app/training/page.tsx`](file:///home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-fleet-training-authorized-caller-20261015/apps/fleet-partner-portal-web/app/training/page.tsx) 與 [`apps/fleet-partner-portal-web/app/training/translations.ts`](file:///home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-fleet-training-authorized-caller-20261015/apps/fleet-partner-portal-web/app/training/translations.ts) 內對 `lib/*` 的匯入改為相對路徑 `../../lib/*`，使 Next.js App Router 與根目錄 Vitest（其 `@/` 別名指向 `apps/tenant-console-web`）皆能直接載入真實生產環境 `FleetTrainingPage` Server Component 進行端到端渲染驗證。

---

## 3. Finding 與必備驗收項對照表 (`AI_COLLABORATION_GUIDE.md` §0.7)

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| :--- | :--- | :--- | :--- | :--- |
| Finding `F1` (`fleet_portal_training_caller_auth_scope_and_fleet_selector_mismatch`) | `apps/fleet-partner-portal-web/lib/academy-api.server.ts` (`resolveServerFleetTrainingContext`, `getServerFleetTrainingClient`)；`apps/fleet-partner-portal-web/lib/academy-data.server.ts` (`loadFleetTraining`, `loadFleetDriverQuizAttempt`)；對接 `apps/api/src/common/auth/route-policies.ts:288-297` 與 `apps/api/src/modules/driver-academy/academy.controller.ts:110-199` | 舊版 (`386eaa45213c` / `getServerFleetPartnerClient`)：以 `partner_api_key` (`billing:read` only) 覆蓋認證遭 `BootstrapAuthGuard` 拒以 `403 AUTH_SCOPE_DENIED`，且非 tenant 呼叫漏 `?fleetPartnerId` 遭 `400 FLEET_PARTNER_ID_REQUIRED` → 修正版：原樣轉發已驗證 tenant/ops 主體並綁定 canonical `fleetPartnerId`，三條訓練端點皆 `200 OK` | `pnpm exec vitest run tests/unit/fleet-training-authorized-caller-20261015/fleet-training-authorized-caller.test.ts` (exit `0`, 15 passed, tests 1.1–1.2 & 2.1–2.4) | 本地 VM 禁啟 runtime server；跨服務 Cloud Run 與真實 Google IAP 瀏覽器登入留待託管環境驗收 |
| `fleet-training_existing-verified-principal-and-fleet-binding` | `apps/fleet-partner-portal-web/lib/academy-api.server.ts:273-432` (`resolveServerFleetTrainingContext`)；`docs/04-uat/system-remediation-20260906/academy-identity-decision.md` | 舊版：忽略 tenant Bearer JWT 之 `tenantId` 並強制改簽 `partner_api_key` → 修正版：Tenant 主體自 `tenantId` 推導 canonical fleet (`fleetSelectorSource: "tenant_id_claim"`)，合法非 tenant (`ops`/`platform`/`system` JWT、IAP assertion、bootstrap) 帶入 `?fleetPartnerId=<canonical>`；絕不從顯示 email、role 或 Cloud Run header 偽造權限 | `pnpm exec vitest run tests/unit/fleet-training-authorized-caller-20261015/fleet-training-authorized-caller.test.ts` (exit `0`, tests 2.1–2.3, 3.1–3.3) | 真實 `@smarttransport.tw` IAP 瀏覽器互動於 shared dev Cloud Run 驗證 |
| `fleet-training_actual-summary-overdue-and-drilldown-caller` | `apps/fleet-partner-portal-web/lib/academy-api.server.ts:434-482` (`getServerFleetTrainingClient`)；`apps/fleet-partner-portal-web/lib/academy-data.server.ts:183-241` (`loadFleetTraining`, `loadFleetDriverQuizAttempt`)；`apps/fleet-partner-portal-web/app/training/page.tsx:59-277` (`FleetTrainingPage`) | 舊版：`loadFleetTraining()` 永遠落入 `catch` 回傳 `source: "fallback"`，`loadFleetDriverQuizAttempt()` 永遠回傳 `null` → 修正版：真實達陣 `/api/fleet-partner/training/summary`、`/roster`、`/drivers/:driverId/attempts/:attemptId`，回傳 `source: "live"` 課程完訓率、逾期名單、測驗逐題 drilldown 並由 `FleetTrainingPage` 完整渲染 | `pnpm exec vitest run tests/unit/fleet-training-authorized-caller-20261015/fleet-training-authorized-caller.test.ts` (exit `0`, tests 2.1–2.4) & `pnpm exec vitest run tests/unit/system-remediation/sr-academy-fe-001/sr-academy-fe-001.test.ts` (exit `0`, 11 passed) | 遠端 PostgreSQL 託管資料庫連線留待 hosted CI / shared dev 驗證 |
| `fleet-training_original-scope-denials-and-empty-errors` | `apps/fleet-partner-portal-web/lib/academy-api.server.ts`；`apps/fleet-partner-portal-web/lib/academy-data.server.ts`；對接 `BootstrapAuthGuard` 與 `FleetPartnerTrainingController.resolveFleetPartnerId` | 舊版：所有呼叫皆因 client 端 `partner_api_key` 被 `403 AUTH_SCOPE_DENIED` 擋下 → 修正版：完整保留無身份 `401 AUTH_REQUIRED`、偽造簽章 `401 JWT_INVALID`、缺 `reports:read` `403 AUTH_SCOPE_DENIED`、錯誤領域 `403 AUTH_REALM_DENIED`、跨車行 `403 ACADEMY_FORBIDDEN_FLEET_ACCESS`、非該司機測驗 `404 ATTEMPT_NOT_FOUND`，且明確區分合法零資料 (`source: "live"`, `0%`) 與錯誤降級 (`source: "fallback"`, `"—"`) | `pnpm exec vitest run tests/unit/fleet-training-authorized-caller-20261015/fleet-training-authorized-caller.test.ts` (exit `0`, tests 3.1–3.9) | 無 |
| `fleet-training_exact-candidate-validation` & CI `Commit trailers` finding | Commit message of `8a6671b9540bbc2a09f7359f67d8d6307ca0d47d` on PR #2651 vs `tools/ci/git/check_commit_trailers.py` (`SUBJECT_RE`) | 舊候選 `8a6671b9540b`：PR #2651 上 `lint`/`typecheck`/`build`/`integration`/`iam-negative-matrix`/`cross-surface-e2e`/`ui-route-e2e`/`e2e` 均通過，但 `Commit trailers` 因主旨 `fix(fleet-training): ...` 非 `<TASK-ID>: <summary>` 而失敗 → 修正版：於乾淨分支 `gemini2/fleet-training-authorized-caller-20261015-clean` 使用 `FLEET-TRAINING-AUTHORIZED-CALLER-20261015: ...` 主旨與完整 trailers，`check_commit_trailers.py --base origin/dev --head HEAD` 退出碼 `0` | `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` (exit `0`)；本地 unit/typecheck/lint/i18n/classification 全數 exit `0` | Handoff 後觸發之新候選 PR hosted CI 待 GitHub Actions 跑完並由 Gemini 獨立審查 |

---

## 4. 驗證指令與結果記錄 (Verification Results)

| 驗證指令 | Exit Code | 實際結果摘要 |
| :--- | :---: | :--- |
| `pnpm exec vitest run tests/unit/fleet-training-authorized-caller-20261015/fleet-training-authorized-caller.test.ts` | `0` | 15 passed (15)：涵蓋 F1 修前重現 (1.1–1.2)、Tenant/Ops 合法身份與車行範圍綁定及 `FleetTrainingPage` SSR 渲染 (2.1–2.4)、偽造身份／缺權限／跨車行拒絕與合法零資料 vs 錯誤降級區分 (3.1–3.9) |
| `pnpm exec vitest run tests/unit/system-remediation/sr-academy-fe-001/sr-academy-fe-001.test.ts` | `0` | 11 passed (11)：既有 C059/C071 單元測試全數通過 |
| `pnpm --filter @drts/fleet-partner-portal-web test` | `0` | 5 test files passed, 21 tests passed（確認一般 `api-client.server.test.ts`、帳務與車隊資料測試無迴歸） |
| `pnpm exec tsc -p apps/fleet-partner-portal-web/tsconfig.json --noEmit` | `0` | `@drts/fleet-partner-portal-web` TypeScript 型別檢查通過（0 errors） |
| `pnpm exec eslint apps/fleet-partner-portal-web/lib/academy-api.server.ts apps/fleet-partner-portal-web/lib/academy-data.server.ts apps/fleet-partner-portal-web/app/training/page.tsx apps/fleet-partner-portal-web/app/training/translations.ts tests/unit/system-remediation/sr-academy-fe-001/sr-academy-fe-001.test.ts tests/unit/fleet-training-authorized-caller-20261015/fleet-training-authorized-caller.test.ts --max-warnings=0` | `0` | 本次變更與新增檔案 ESLint 檢查通過（0 warnings, 0 errors） |
| `pnpm run i18n:guard` | `0` | `i18n-guard: OK (639 files scanned across 11 apps, 81 exemption(s) from i18n-guard-baseline.json)` |
| `pnpm run classification:check` | `0` | `[classification:ok] validated 6630 repository files` |
| `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` | `0` | `check_commit_trailers: 1 commit(s) OK.` |
| `git diff --check` | `0` | 無任何空白、縮排或衝突標記錯誤 |

---

## 5. 未施作之環境限制與誠實揭露 (Unverified Hosted / Real-Account Limits)

1. **VM 運行時禁令遵守**：依 `AGENTS.md` 之 VM 限制，本任務不在本開發 VM 啟動產品開發伺服器 (`next dev` / NestJS HTTP server)、Docker Compose、PostgreSQL 或瀏覽器 E2E 測試伺服器。
2. **Socket-Free 真實邊界驗證範圍**：本次單元測試透過攔截 `globalThis.fetch`，將 `getServerFleetTrainingClient()`、`loadFleetTraining()`、`loadFleetDriverQuizAttempt()` 與 `FleetTrainingPage` 發出之真實 HTTP 請求直接路由至真實 `BootstrapAuthGuard`（含 `Reflector`、`JwtAuthService`、`resolveRouteAuthPolicy`）、真實 `FleetPartnerTrainingController` (`summary`、`roster`、`driverAttempt`)、真實 `AcademyService` 與 `deepToSnakeCase` 序列化器，未將 Fleet client mock 為假成功。
3. **外部託管環境與真實帳號邊界**：Shared Dev (`drts-dev-devcc-20260825`) 上之跨服務 Cloud Run 執行期、真實 Google IAP 企業帳號 (`@smarttransport.tw`) 登入瀏覽器互動流程及遠端 PostgreSQL 資料庫讀寫，不屬於本本地源碼修復回合已執行之驗證範圍，留待合併後之外部候選部署與真實驗收環境檢核。
