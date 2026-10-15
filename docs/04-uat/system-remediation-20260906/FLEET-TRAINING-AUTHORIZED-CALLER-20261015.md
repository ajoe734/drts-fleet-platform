# FLEET-TRAINING-AUTHORIZED-CALLER-20261015 — 車行訓練頁接既有合法身份與車行範圍讀回

- **任務識別碼 (Task ID)**：`FLEET-TRAINING-AUTHORIZED-CALLER-20261015`
- **負責角色**：Owner: `Gemini2`；Reviewer: `Gemini`
- **基準分支與 SHA (Base)**：`dev` @ `386eaa45213cd0c67e9b9e5b3bcd9b01a3195b09`
- **候選分支 (Candidate Branch)**：`gemini2/fleet-training-authorized-caller-20261015`
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

## 3. 交付品質自我檢核表 (`AI_COLLABORATION_GUIDE.md` §0.7)

| 檢核面向 | 檢核項目 | 狀態 | 具體證據與說明 |
| :--- | :--- | :---: | :--- |
| **需求與範圍** | 每一條 acceptance 都有對應實作與驗證，沒有「做一半先交」 | PASS | 四項必備驗收鍵 (`fleet-training_existing-verified-principal-and-fleet-binding`、`fleet-training_actual-summary-overdue-and-drilldown-caller`、`fleet-training_original-scope-denials-and-empty-errors`、`fleet-training_exact-candidate-validation`) 皆已完成實作並由 15 項 socket-free 邊界測試與 11 項既有單元測試逐條覆蓋。 |
| **需求與範圍** | 不新增未授權的範圍、抽象層或順手重構 | PASS | 僅新增 C071 專屬 `academy-api.server.ts` 並更新 `academy-data.server.ts` 及 `app/training/` 相對匯入；未觸碰 `@drts/api-client`、未改動後端 auth policy、未影響其他車行帳務／C063／C069 頁面。 |
| **工程品質** | 無 hardcoded secrets、假資料充當真結果、吞錯、silent fallback、race condition | PASS | 無任何硬編碼密鑰或偽造權限；當後端回傳 401/403/500 時，`loadFleetTraining` 明確標記 `source: "fallback"` 並保留 `error` 訊息與 `"—"` 佔位符，絕不把錯誤偽裝成 `0%` 真實零資料或固定假數字。 |
| **工程品質** | 邊界條件已處理：null/empty、錯誤路徑、權限拒絕、重試或冪等 | PASS | 完整涵蓋合法零資料 (`source: "live"`, `0%`, `rows: []`, `roster: []`)、缺設定拋錯 (`Missing fleet scope configuration`)、無身份 `401 AUTH_REQUIRED`、偽造簽章 `401 JWT_INVALID`、缺 `reports:read` `403 AUTH_SCOPE_DENIED`、錯誤領域 `403 AUTH_REALM_DENIED`、跨車行 `403 ACADEMY_FORBIDDEN_FLEET_ACCESS`、非該司機測驗 `404 ATTEMPT_NOT_FOUND`。 |
| **工程品質** | 改動可讀、最小、與既有模組慣例一致 | PASS | `academy-api.server.ts` 遵循 `api-client.server.ts` 與 `BootstrapAuthGuard` 既有標頭慣例，並清楚分離 `principalSource` 與 `fleetSelectorSource`。 |
| **UI / 設計 / i18n** | 牽涉 UI 時，遵守設計規範、響應式、可及性與 i18n，不留未翻譯字串或壞掉版面 | PASS | `app/training/page.tsx` 維持既有 `@drts/ui-web` Canvas 設計系統與雙語翻譯 (`translations.ts`)，並通過 `pnpm run i18n:guard` (0 violations)。 |
| **驗證與邊界** | 已跑並通過本任務對應的 lint / typecheck / 單元或整合測試 | PASS | 見第 4 節驗證指令與 Exit Code 表。 |
| **驗證與邊界** | 記錄實際執行的指令與結果；未驗證項目誠實標示原因，不推測、不誇大 | PASS | 見第 4 節與第 5 節。 |
| **驗證與邊界** | 遵守 VM 限制、環境禁令與受保護資源規則 | PASS | 全程於靜態與 socket-free 記憶體邊界執行，未在 VM 啟動任何 dev server、HTTP listener、Docker Compose 或 Playwright 瀏覽器程序。 |

---

## 4. 驗證指令與結果記錄 (Verification Results)

| 驗證指令 | Exit Code | 實際結果摘要 |
| :--- | :---: | :--- |
| `pnpm exec vitest run tests/unit/fleet-training-authorized-caller-20261015/fleet-training-authorized-caller.test.ts` | `0` | 15 passed (15)：涵蓋 F1 修前重現 (1.1–1.2)、Tenant/Ops 合法身份與車行範圍綁定及 `FleetTrainingPage` SSR 渲染 (2.1–2.4)、偽造身份／缺權限／跨車行拒絕與合法零資料 vs 錯誤降級區分 (3.1–3.9) |
| `pnpm exec vitest run tests/unit/system-remediation/sr-academy-fe-001/sr-academy-fe-001.test.ts` | `0` | 11 passed (11)：既有 C059/C071 單元測試全數通過 |
| `pnpm --filter @drts/fleet-partner-portal-web test` | `0` | 5 test files passed, 21 tests passed（確認一般 `api-client.server.test.ts`、帳務與車隊資料測試無迴歸） |
| `pnpm exec tsc -p apps/fleet-partner-portal-web/tsconfig.json --noEmit` | `0` | `@drts/fleet-partner-portal-web` TypeScript 型別檢查通過（0 errors） |
| `pnpm typecheck:root`（過濾本任務範圍 `fleet-training-authorized-caller`、`sr-academy-fe-001`、`apps/fleet-partner-portal-web`） | `0` (範圍內 0 errors；全倉庫 `2`) | 本任務所有變更與新增測試檔案 0 TypeScript errors（全倉庫 `pnpm typecheck:root` 因其他並行 worker `codex2-pax-review-shared-order-demo-20261015` 共享 `node_modules` 跨 worktree symlink 導致無關測試出現雙份套件型別衝突） |
| `pnpm exec eslint apps/fleet-partner-portal-web/lib/academy-api.server.ts apps/fleet-partner-portal-web/lib/academy-data.server.ts apps/fleet-partner-portal-web/app/training/page.tsx apps/fleet-partner-portal-web/app/training/translations.ts tests/unit/system-remediation/sr-academy-fe-001/sr-academy-fe-001.test.ts tests/unit/fleet-training-authorized-caller-20261015/fleet-training-authorized-caller.test.ts --max-warnings=0` | `0` | 本次變更與新增檔案 ESLint 檢查通過（0 warnings, 0 errors） |
| `pnpm run i18n:guard` | `0` | `i18n-guard: OK (639 files scanned across 11 apps, 81 exemption(s) from i18n-guard-baseline.json)` |
| `pnpm run classification:check` | `0` | `[classification:ok] validated 6630 repository files` |
| `git diff --check` | `0` | 無任何空白、縮排或衝突標記錯誤 |

---

## 5. 未施作之環境限制與誠實揭露 (Unverified Hosted / Real-Account Limits)

1. **VM 運行時禁令遵守**：依 `AGENTS.md` 之 VM 限制，本任務不在本開發 VM 啟動產品開發伺服器 (`next dev` / NestJS HTTP server)、Docker Compose、PostgreSQL 或瀏覽器 E2E 測試伺服器。
2. **Socket-Free 真實邊界驗證範圍**：本次單元測試透過攔截 `globalThis.fetch`，將 `getServerFleetTrainingClient()`、`loadFleetTraining()`、`loadFleetDriverQuizAttempt()` 與 `FleetTrainingPage` 發出之真實 HTTP 請求直接路由至真實 `BootstrapAuthGuard`（含 `Reflector`、`JwtAuthService`、`resolveRouteAuthPolicy`）、真實 `FleetPartnerTrainingController` (`summary`、`roster`、`driverAttempt`)、真實 `AcademyService` 與 `deepToSnakeCase` 序列化器，未將 Fleet client mock 為假成功。
3. **外部託管環境與真實帳號邊界**：Shared Dev (`drts-dev-devcc-20260825`) 上之跨服務 Cloud Run 執行期、真實 Google IAP 企業帳號 (`@smarttransport.tw`) 登入瀏覽器互動流程及遠端 PostgreSQL 資料庫讀寫，不屬於本本地源碼修復回合已執行之驗證範圍，留待合併後之外部候選部署與真實驗收環境檢核。
