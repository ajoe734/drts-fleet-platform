# HOST-OWNED-VIEW-AUTH-AND-AUTHORITY-FLOW-20261015 — 原Host合法受管身份、自車完整查詢與權威隱私讀回閉環

- **任務識別碼 (Task ID)**：`HOST-OWNED-VIEW-AUTH-AND-AUTHORITY-FLOW-20261015`
- **負責角色**：Owner: `Claude`；Reviewer: `Claude2`
- **基準分支與 SHA (Base)**：`dev` @ `431966bdf`（fast-forward 自初始探索基底 `409bad360`，僅拉入無關之 `SERVICE-AREA-PREVIEW-OPTIONAL-DESTINATION-20261015` 變更，未衝突）
- **工作樹路徑 (Worker Cwd)**：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/claude-host-owned-view-auth-and-authority-flow-20261015`
- **不可變規格與稽核來源**：
  - Task Spec：`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1531-original-booking-mail-host-root/HOST-OWNED-VIEW-AUTH-AND-AUTHORITY-FLOW-20261015-R1.task-spec.json`
  - 唯讀稽核報告：`/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1531-original-booking-mail-host-root/C012-current-accepted-Host-owned-view-auth-authority-readonly-audit.json`
- **受控寫入範圍 (Write Scopes)**：
  - `apps/fleet-partner-portal-web/app/host/`
  - `apps/fleet-partner-portal-web/app/api/auth/[...auth]/route.ts`（未修改 — 既有 `drts_session` HttpOnly cookie 發行邏輯已正確，缺口在消費端）
  - `apps/api/src/modules/host-view/host-view.repository.ts`
  - `apps/api/src/modules/host-view/host-view.types.ts`
  - `tests/unit/host-owned-view-auth-and-authority-flow-20261015/`
  - `tests/unit/system-remediation/sr-host-fe-001/`
  - `tests/unit/system-remediation/sr-host-be-001/`
  - `docs/04-uat/system-remediation-20260906/HOST-OWNED-VIEW-AUTH-AND-AUTHORITY-FLOW-20261015.md`
- **必備驗收鍵 (Required Acceptance Keys)**：
  - `host_original_managed_credential_and_scoped_consumer`
  - `host_complete_owned_pagination_drilldown`
  - `host_authoritative_unavailable_empty_zero_and_ownership`
  - `host_actual_case_projection_privacy_and_original_regressions`
  - `host_exact_candidate_review_CI_merge`

---

## 1. 四項 C012 Finding 定位與修前重現 (Findings & Before-Fix Reproduction)

### F1 — `C012-F1-HOST-MANAGED-CREDENTIAL-CONSUMER`

`apps/fleet-partner-portal-web/app/host/lib/host-auth.server.ts`（修前）之 `getServerHostClient()` 從未讀取既有 `/api/api/auth/[...auth]/route.ts` 之 `callback` 動作已簽發之 `drts_session` HttpOnly Cookie（真實簽章 JWT）；而是無條件以可被請求端偽造之 `x-host-partner-id` 標頭或 `DRTS_HOST_PARTNER_ID` 環境變數，合成完整 bootstrap 身份（`x-actor-type: partner_user`、`x-partner-id`、`x-realm: partner` 等）送往後端。真實 `BootstrapAuthGuard`（`apps/api/src/common/auth/bootstrap-auth.guard.ts:217`）在 strict（production/staging）環境下對任何 bootstrap 標頭一律回 `401 AUTH_BOOTSTRAP_HEADERS_FORBIDDEN`；非 strict 環境下則讓任何送出 `x-host-partner-id` 之請求者冒充任一車主身份。

修前重現（`tests/unit/system-remediation/sr-host-fe-001/host-auth.server.test.ts` 舊版）明確將「`x-host-partner-id` 標頭覆蓋 env」判定為預期行為，即把偽造選擇器視為合法輸入。

### F2 — `C012-F2-LONG-LIST-DETAIL-FALSE404`

`host-data.server.ts`（修前）之 `loadHostVehicleDetail` 固定呼叫 `listHostVehicles({ page: 1, pageSize: 200 })` 並在回傳項目中 `.find()`；而真實 `HostViewService.paginate`（`apps/api/src/modules/host-view/host-view.service.ts:210`）將 `pageSize` 強制 `Math.min(100, pageSize)`。擁有 101 輛以上車輛的車主，其第 101 輛車輛必定被忽略，detail 頁對該合法擁有車輛回傳 `vehicle_not_found`。

### F3 — `C012-F3-CONFIGURED-AUTHORITY-FAILURE-AS-EMPTY`

`host-view.repository.ts`（修前）五個查詢方法（`listVehiclesByOwner`、`getVehicleByIdAndOwner`、`listMaintenanceByVehicle`、`listTripsByVehicle`、`listCasesByVehicle`）在 `isEnabled()===true`（已配置 DB）時，若查詢本身拋出例外，皆以 `logger.warn` 記錄後靜默回退至記憶體儲存（通常為空）。真實資料庫失敗因此偽裝為合法空清單 `200`、`getVehicleByIdAndOwner` 的擁有權查詢失敗偽裝為 `404 HOST_VEHICLE_NOT_FOUND`、`getEarningsSummary` 依賴之 `listTripsByVehicle` 失敗偽裝為合法零收益 `settlementStatus: "pending_policy"`。

### F4 — `C012-F4-PRIVATE-CLOSING-NOTE-AS-REDACTED-CONCLUSION`

`host-view.types.ts`（修前）之 `extractResolutionSummary({closingNote, resolutionCode})` 在 `closingNote` 非空白時直接原樣回傳該自由格式文字。真實 `ComplaintService.resolveComplaintCase`/`closeComplaintCase`（`apps/api/src/modules/complaint/complaint.service.ts:756-830`）僅驗證 `closingNote` 非空白，從未禁止內含申訴人姓名／電話等個資。`host-view.repository.ts` 之 `listCasesByVehicle` 將 DB 列之 `rec.closingNote` 原樣傳入該函式，經 Controller 包裝後直達 Host `cases` API 回應與既有 `HostCasesTable` React 元件逐字呈現。

---

## 2. 修正設計與既有合法路徑保留 (Fix Design & Preserved Positive-Credit Boundaries)

### 2.1 F1 — 真實受管憑證消費者（`host-auth.server.ts`）

採用與既有已驗收 `apps/fleet-partner-portal-web/lib/academy-api.server.ts`（`FLEET-TRAINING-AUTHORIZED-CALLER-20261015`）相同之已審查慣例：

| 優先順序 | 來源 | 行為 |
| :--- | :--- | :--- |
| 1 | `x-drts-authorization`（control-plane inner bearer）、`authorization` 標頭、或 `drts_session` Cookie（依序嘗試） | 原樣轉發為 `Authorization: Bearer <token>` 或 `x-drts-authorization: Bearer <token>`，交由後端 `JwtAuthService.verifyAccessToken` 完整驗章；`partnerId` 僅作未驗證之顯示用途提示（`decodeJwtPartnerIdHint`），真正授權一律由後端 `HostViewService.resolvePartnerId` 自驗證後身份推導 |
| 2 | 既有合法非 strict／offline harness：請求本身已帶完整 bootstrap 標頭（`x-actor-type` 等） | 原樣轉發，絕不合成或升級；strict 環境下 `BootstrapAuthGuard` 仍會攔截，此為第二層防線 |
| 3 | `DRTS_HOST_PARTNER_ID`（維運者設定之環境變數，非請求可控） | 既有單租戶／本機離線模式合成 bootstrap 身份 fallback |
| 4 | 以上皆無 | 拋出新增 `HostAuthenticationRequiredError`（`HOST_UNAUTHORIZED` / 401），不再發送任何網路請求 |

`x-host-partner-id` 選擇器標頭與其對應解析函式已完全移除；Cloud Run 外層憑證（metadata identity token）固定僅寫入 `x-serverless-authorization`，與上述 App 層憑證（`authorization` / `x-drts-authorization`）隔離，避免兩者互相覆寫。

### 2.2 F2 — 完整權威分頁下鑽（`host-data.server.ts`）

`loadHostVehicleDetail` 改為依伺服器真實回傳之 `pageInfo.totalPages` 逐頁走訪（每頁 100 筆，對齊後端真實上限），直到找到目標車輛或窮盡所有頁面，而非猜測單頁 `pageSize`。

### 2.3 F3 — 誠實配置權威失敗傳播（`host-view.repository.ts` + `host-view.types.ts`）

新增 `HostAuthorityUnavailableError extends ApiRequestError`（`503 HOST_AUTHORITY_UNAVAILABLE`，`retryable: true`）。五個查詢方法於 `isEnabled()===true` 時查詢失敗，一律 `logger.error` 後 `throw` 此錯誤，不再回退記憶體。`isEnabled()===false`（資料庫已停用之既有離線 harness 語義）維持完全不變。前端 `classifyHostAccessError`（未修改）將未對應之狀態碼歸為既有 `fetch_failed`，`app/host/vehicles/page.tsx` 之過期文案（宣稱 `SR-HOST-BE-001` 尚未合併，該依賴已完成）已替換為準確之「服務暫時不可用，請稍後重試」。

### 2.4 F4 — 伺服器端去識別化投影（`host-view.types.ts` + `host-view.repository.ts`）

`extractResolutionSummary` 改為僅接受 `resolutionCode?: string | null`（移除 `closingNote` 參數），對應 `COMPLAINT_RESOLUTION_CODES`（`packages/contracts`）之封閉列舉，映射為去識別化中英文結論標籤；未知代碼有安全的自動人性化 fallback（僅基於代碼字串，非自由格式文字）。`listCasesByVehicle` 不再讀取 `rec.closingNote`。既有 `案件類別/狀態/時間戳`、`HostCasesTable`、CRM 正式 `closingNote` 本身皆未更動。

---

## 3. Finding 與必備驗收項對照表 (`AI_COLLABORATION_GUIDE.md` §0.7)

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| :--- | :--- | :--- | :--- | :--- |
| `C012-F1` / `host_original_managed_credential_and_scoped_consumer` | `apps/fleet-partner-portal-web/app/host/lib/host-auth.server.ts` | 舊版：合成可偽造 `x-host-partner-id` bootstrap 身份 → 修正版：轉發真實 `drts_session` Bearer，`BootstrapAuthGuard` 完整驗章；缺失/偽造簽章/過期/錯誤領域（`tenant`）之 token 皆遭正確拒絕；兩位合法車主各自僅見自己車輛；strict 環境下 bootstrap 標頭路徑仍遭後端獨立攔截（縱使 BFF 於非 strict harness 分支原樣轉發） | `npx vitest run tests/unit/host-owned-view-auth-and-authority-flow-20261015/ tests/unit/system-remediation/sr-host-fe-001/` (exit `0`, 48 passed：含 1.1–1.8 與 2.1) | Shared dev 之真實 Google IAP／OIDC 瀏覽器登入與 Cloud Run IAM 邊界留待託管環境驗收 |
| `C012-F2` / `host_complete_owned_pagination_drilldown` | `apps/fleet-partner-portal-web/app/host/lib/host-data.server.ts` (`loadHostVehicleDetail`) | 舊版：單頁 `pageSize:200` 被伺服器上限 100 截斷，第 101 輛車輛誤判 `vehicle_not_found` → 修正版：依 `pageInfo.totalPages` 逐頁窮盡；101 輛車輛情境下第 2 頁才找到目標車輛，驗證發出 >1 次清單請求 | `npx vitest run tests/unit/host-owned-view-auth-and-authority-flow-20261015/` (exit `0`, test 2.1)；`npx vitest run tests/unit/system-remediation/sr-host-fe-001/host-data.server.test.ts` (exit `0`, 多頁下鑽與窮盡後 `vehicle_not_found` 兩案例) | 無 |
| `C012-F3` / `host_authoritative_unavailable_empty_zero_and_ownership` | `apps/api/src/modules/host-view/host-view.repository.ts`、`host-view.types.ts` (`HostAuthorityUnavailableError`)；`apps/fleet-partner-portal-web/app/host/vehicles/page.tsx` | 舊版：DB 查詢失敗靜默回退記憶體，偽裝為合法空清單/零收益/404 → 修正版：五個查詢方法一律 `throw HostAuthorityUnavailableError`（`503`，`retryable`），`getEarningsSummary` 連動失敗；資料庫停用（`isEnabled()===false`）之既有離線語義不變；過期之「後端尚未合併」文案已替換為準確可操作文案 | `npx vitest run tests/unit/system-remediation/sr-host-be-001/` (exit `0`, Suite 8.5 共 5 案例 + 既有 Suite 1–7/9–13 共 42 passed) | 真實配置 PostgreSQL 連線中斷之託管環境驗收留待 shared dev |
| `C012-F4` / `host_actual_case_projection_privacy_and_original_regressions` | `apps/api/src/modules/host-view/host-view.types.ts` (`extractResolutionSummary`)、`host-view.repository.ts` (`listCasesByVehicle`) | 舊版：`closingNote` 含申訴人姓名/電話之自由格式文字原樣進入 Host API 回應 → 修正版：僅投影封閉列舉 `resolutionCode` 之去識別化標籤；以含真實個資之 `closingNote` + 有效 `resolutionCode` 之 DB 列驅動真實 repository→mapper 鏈路，證明回應絕不含該姓名/電話/原文 | `npx vitest run tests/unit/system-remediation/sr-host-be-001/` (exit `0`, Suite 8 含「never surfaces a private freeform closingNote」案例) | 無；CRM 正式 `closingNote` 本身未變更，僅切斷 Host 投影讀取路徑 |
| `host_exact_candidate_review_CI_merge` | 本次候選分支與 commit | Owner 本機完整驗證（單元測試/typecheck/lint/i18n/classification）全數 exit `0`；交由 Claude2 以同一 `CANDIDATE_SHA` 獨立審查，候選 CI 與 protected merge 由既有 candidate lifecycle 收錄 | 見下節「驗證指令與結果記錄」 | Hosted CI、GitHub protected-merge 門檻、record-acceptance 由既有 Supervisor/GitHub bus 流程於 handoff 後收錄，非本 owner 回合可逕行宣告 |

---

## 4. 驗證指令與結果記錄 (Verification Results)

| 驗證指令 | Exit Code | 實際結果摘要 |
| :--- | :---: | :--- |
| `npx vitest run tests/unit/system-remediation/sr-host-be-001/sr-host-be-001.test.ts` | `0` | 42 passed（含 Suite 8 新增 PII 隔離案例、Suite 8.5 新增 5 項 F3 權威失敗傳播案例；既有 Suite 1–7/9–13 無迴歸） |
| `npx vitest run tests/unit/system-remediation/sr-host-fe-001/` | `0` | 39 passed（3 test files：`host-auth.server.test.ts` 全面改寫為真實憑證轉發語義、`host-data.server.test.ts` 新增 F2 多頁下鑽案例、`host-format.test.ts` 無迴歸） |
| `npx vitest run tests/unit/host-owned-view-auth-and-authority-flow-20261015/` | `0` | 9 passed：F1 兩位合法車主全五讀取端點、缺憑證、過期、偽造簽章、錯誤領域、跨車主 404 防列舉、strict 模式 bootstrap 標頭獨立防線（1.1–1.8）；F2 101 輛車輛多頁下鑽（2.1） |
| `cd apps/api && npx tsc -p tsconfig.json --noEmit` | `0` | `@drts/api` TypeScript 型別檢查通過（0 errors；需先建置 `packages/control-plane-auth` 之既有 `dist/`，與本次修改無關） |
| `cd apps/fleet-partner-portal-web && npx next typegen && npx tsc --noEmit` | `0` | `@drts/fleet-partner-portal-web` TypeScript 型別檢查通過（0 errors） |
| `npx eslint apps/api/src/modules/host-view/host-view.repository.ts apps/api/src/modules/host-view/host-view.types.ts apps/fleet-partner-portal-web/app/host/lib/host-auth.server.ts apps/fleet-partner-portal-web/app/host/lib/host-data.server.ts apps/fleet-partner-portal-web/app/host/vehicles/page.tsx tests/unit/system-remediation/sr-host-be-001/sr-host-be-001.test.ts tests/unit/system-remediation/sr-host-fe-001/host-auth.server.test.ts tests/unit/system-remediation/sr-host-fe-001/host-data.server.test.ts tests/unit/host-owned-view-auth-and-authority-flow-20261015/host-owned-view-auth-and-authority-flow.test.ts` | `0` | 0 errors, 0 warnings |
| `node tools/ci/i18n-guard.mjs` | `0` | `i18n-guard: OK (650 files scanned across 11 apps, 81 exemption(s))` |
| `node tools/ci/check-repo-classification.mjs` | `0` | `[classification:ok] validated 6692 repository files` |

---

## 5. 未施作之環境限制與誠實揭露 (Unverified Hosted / Real-Account Limits)

1. **VM 運行時禁令遵守**：依本任務 dispatch 之 VM 限制，未在本開發 VM 啟動產品開發伺服器（`next dev` / NestJS HTTP server）、Docker Compose、PostgreSQL 或瀏覽器 E2E 測試伺服器。
2. **Socket-Free 真實邊界驗證範圍**：`tests/unit/host-owned-view-auth-and-authority-flow-20261015/host-owned-view-auth-and-authority-flow.test.ts` 攔截 `globalThis.fetch`，將 `getServerHostClient()`／`host-data.server.ts` 各 loader 發出之真實 HTTP 請求直接路由至真實 `BootstrapAuthGuard`（含 `Reflector`、`JwtAuthService`，使用 `jwtAuthService.issueSessionToken` 簽發之真實簽章 Session JWT）、真實 `HostViewController`、`HostViewService`、`HostViewRepository`，未將任何一層 mock 為假成功。F3/F4 另於 `sr-host-be-001.test.ts` 以 duck-typed `DatabaseService` 替身（`isEnabled`/`query`）驅動同一條真實 repository→mapper 鏈路，模擬範圍明確限於「配置資料庫本身的連線/查詢」，從未 mock 被驗證之授權或去識別化邏輯本身。
3. **外部託管環境與真實帳號邊界**：Shared dev 上之 Cloud Run 執行期、真實 Google IAP／Partner OIDC 企業帳號登入瀏覽器互動流程、真實 PostgreSQL（`ops.phase1_host_vehicle_projections` 等既有 view）讀寫與 `record-acceptance` 所需外部驗收證據，不屬於本次本地源碼修復回合已執行之驗證範圍，留待合併後之候選部署與既有 Supervisor/GitHub bus 驗收流程收錄。
4. 本文件之四項 Finding 修復皆為既有 `SR-HOST-BE-001`/`SR-HOST-FE-001`/`SR-WIRE-001` 已驗收基線之延續性窄範圍修補；未重新實作、未重新審查、未重新宣告上述三任務之 DONE 狀態。
