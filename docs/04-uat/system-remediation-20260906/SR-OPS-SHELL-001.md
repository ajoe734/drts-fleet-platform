# SR-OPS-SHELL-001 — 營運助理遮擋與跨app導航：完成證據

- Task: `SR-OPS-SHELL-001`
- Owner: `Gemini`
- Reviewer: `Gemini2`
- Planning Ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- Base SHA (`origin/dev` at merge): `9efb479a63ae8d27ad9a64f514bf229cfb9d7990` (`[ReviewBus] SR-CONTRACT-READ-001 Ops 合約 read model 補真營運條款 (#1906)`)
- Current Local Head: `git merge origin/dev` completed cleanly with zero conflicts
- PR #1648 URL: https://github.com/ajoe734/drts-fleet-platform/pull/1648
- Worktree: `.artifacts/worktrees/auto/gemini-sr-ops-shell-001`
- Branch: `gemini/sr-ops-shell-001`
- Status: `candidate_ready` (待 commit/push 並交接獨立審查者 Gemini2)

## 1. 現況盤點與根因分析（fix 前）

### R18: 跨應用 Audit 與 Payments 導航 404 (C048)

- **現象**：在 `ops-console-web` (預設 port 3000) 中，操作助理產生的審計與支付日誌連結採用相對路徑（例如 `/audit` 或 `/platform-admin/audit`），或者直接導航到 ops-console 自身域名。然而 `ops-console-web` 內部並未提供審計日誌與支付日誌頁面，導致點擊後出現 404 錯誤。
- **遺漏上下文**：生成的 audit 連結未附帶具體的資源識別資訊（`auditId`, `resourceType`, `resourceId`, `module`, `actorId`），使得前往審計系統時無法定位到對應事件。
- **根因**：
  1. 缺乏集中管理且能動態適應開發（port 3002）、測試（port 3102）與生產環境（環境變數或同根網域）的跨應用 URL 解析器。
  2. `assistant-actions.ts` 內硬編碼了不正確的跨 app 相對路徑，缺少對 `platform-admin` 權威服務位址的解析。

### R19: 營運助理 Widget 預設遮擋主要控制項與可用性問題 (C048)

- **現象**：
  1. 助理 widget 過去預設為展開狀態（`minimized: false`），以高層級（`z-index: 5000`）佔據右下角（420px 寬、640px 高），遮蔽了底層操作畫面右下角的關鍵控制項（如資料表格底部分頁按鈕、送出按鈕與主要 CTA）。
  2. 根容器浮層未設定 `pointer-events: none`，導致即使在未有視覺遮擋的區域，游標點擊也可能被外層全螢幕 portal 容器攔截。
  3. 鍵盤無障礙性缺失：關閉助理視窗後，焦點遺留在已卸載或不可見的元素上，未將焦點自動返還發射器按鈕（`ops-assistant-launcher`）；且缺乏鍵盤 Escape 快捷鍵關閉支援。
  4. 重新由發射器展開時，焦點未移入拖曳把手（`ops-assistant-drag-handle`）以利後續鍵盤或滑鼠移動控制。
  5. 視窗適應性：在行動裝置寬度（390px 視窗）下，420px 的卡片會造成水平溢出，無法正常點擊內部操作。

### 1.1 Candidate 4e0e8b82e 審查 Reopen 根因與回歸修復

- **Reopen 審查發現**：
  - 在第一版 candidate `4e0e8b82e` 中，為了解決全螢幕 portal 攔截底層點擊的問題，在 `assistant-widget.tsx` 建立了 portal root 並設定 `node.style.pointerEvents = "none"`，展開面板 `shellStyle` 設定了 `pointerEvents: "auto"`。
  - **迴歸缺陷**：浮動發射器按鈕 `<button data-testid="ops-assistant-launcher">`（當 `widget.closed === true` 時呈現）的 inline style 遺漏了 `pointerEvents: "auto"` 設定。由於 CSS `pointer-events` 為繼承屬性，發射器按鈕繼承了 portal root 的 `pointer-events: none`，導致滑鼠與觸控點擊穿透按鈕，使用者一旦收合助理便無法透過滑鼠點擊重新打開（dead button）。
  - **測試缺陷**：先前的單元測試將佈局數學在測試檔中重複實現，未直接引用元件實體模組，亦無 DOM 層級的 pointer-events 繼承或 click 事件驗證。
- **修復重點**：
  1. 於 `assistant-widget.tsx` 發射器按鈕 inline style 明確加入 `pointerEvents: "auto"`。
  2. 模組化抽取 `apps/ops-console-web/components/ops-assistant/assistant-layout.ts`，由元件與測試共用純函式（`buildPortalRootStyle`, `buildLauncherButtonStyle`, `buildShellPanelStyle`, `resolveEffectivePointerEvents`, `buildDefaultState`, `readStoredState`, `writeStoredState` 等）。
  3. 新增 DOM 事件層級測試，模擬 CSS 繼承特性，重現無設定時繼承 none 導致點擊無效的缺陷，並驗證加上 `auto` 後點擊觸發開關循環與 `localStorage` 持久化狀態。
  4. 在 `cross-app-url.ts` 增加防護，避免對 Cloud Run 隨機 hash 網域（`*.run.app`）執行字串替換。

### 1.2 Candidate af617b4388df CI Failure 根因與型別修復

- **CI Failure 現象**：在 GitHub Actions run `34021153566`（PR #1648）中，`pnpm run typecheck` 報錯：
  `tests/unit/system-remediation/sr-ops-shell-001/assistant-widget-layout.test.ts(473,46): error TS2353: Object literal may only specify known properties, and 'key' does not exist in type '{ type: string; defaultPrevented?: boolean; }'.`
- **根因**：單元測試檔中的 `MockElement.dispatchEvent` 參數定義為 `{ type: string; defaultPrevented?: boolean }`，未定義 index signature；而在 line 473 測試鍵盤事件時傳入了 `{ type: "keydown", key: "Escape" }`，觸發 TypeScript strict excess property check。
- **修復**：將 `MockElement.dispatchEvent` 的事件參數擴充為 `{ type: string; defaultPrevented?: boolean; [key: string]: any }`，允許自訂事件屬性（如 `key`），使 `pnpm typecheck:root` 與 `vitest` 全面順利通過。

### 1.3 Candidate 5a0320b21 Codex Review Rejection 分類與進展

Codex 審查 candidate `5a0320b21` 時提出兩項判定：
1. **P1（範疇界線與接收端契約 — Q-SR-OPS-SHELL-001）**：
   - 審查指出 `apps/ops-console-web/app/dispatch/page.tsx` 預設仍導向 `/platform-admin`，audit CTA 僅傳遞 `/audit` 且無 resource 識別；而接收端 `apps/platform-admin-web/app/audit/page.tsx` 呼叫 `listAuditLogs()` 未消費 URL query 參數。
   - 當時因上述共用頁面不在 `write_scopes` 內，依協同守則維持嚴格邊界並以 blocker 回報等待 Supervisor 擴 scope 與相依授權。
2. **P2（測試真實性與領域實體 ID）**：
   - 於 `assistant-widget-layout.test.ts` 新增 1440x900 與 390x844 視窗的幾何邊界與命中測試（hit-testing），模擬多層 z-index 與 `pointerEvents: "none"` 穿透機制，驗證底層 dispatch 核心控制項在各種坐標點均不被 portal 攔截。
   - 於 `audit-and-cross-app-links.test.ts` 引入 DRTS Phase 1 權威 `ActionReceipt` 契約與真實資源 ID，驗證序列化後的審計 URL 完全命中 runtime 正確之 platform-admin origin，且所有跨 app 連結均保證 `openMode: "new_tab"`。

### 1.4 2026-09-10 Dispatch：Supervisor 擴充 Scope 與接收端契約裁定（Q-SR-OPS-SHELL-001 解除）

2026-09-10T12:12:14Z Supervisor 更新機讀狀態，正式解決 Q-SR-OPS-SHELL-001 卡點，授權完整跨應用 sender 與 receiver scope：
- **新增授權之 Write Scopes**：
  - `apps/ops-console-web/app/dispatch/page.tsx`
  - `apps/ops-console-web/lib/ops-cross-app-links.ts`
  - `apps/platform-admin-web/app/audit/page.tsx`
  - `apps/platform-admin-web/lib/audit-resource-context.ts`
  - `.github/workflows/ops-shell-acceptance.yml`
  - `tests/unit/system-remediation/sr-ops-shell-001/workflow.test.ts`
  - `tests/e2e/system-remediation/sr-ops-shell-001/`
- **接收端契約協議**：
  1. 接收端 query 支援選擇性 `auditId` 與成對完整 `resourceType` + `resourceId`。
  2. 多條件同時存在時採 exact equality 交集過濾 `listAuditLogs()` 結果。
  3. URL query 僅作為前端展示篩選，絕不賦予額外權限。
  4. 缺少任何 context 時顯示完整授權日誌清單；不完整（如僅有 resourceType 卻無 resourceId）、衝突或格式錯誤時呈現明確 invalid 狀態；無符合紀錄時呈現 contextual empty 狀態（絕不默認 fallback 至未篩選紀錄）。
  5. 畫面呈現 Active Context 徽章與 Deliberate Clear Filter 按鈕；瀏覽器重載時保留 URL query 參數。
  6. 模組篩選 pill 與 resource context 複合過濾，並保留 legal hold 與 deletion exceptions。

### 1.5 遠端驗收 Run 34503925130 根因分析與預覽伺服器認證修復

- **遠端驗收失敗現象**：在 GitHub Actions run `34503925130`（候選 commit `59212b2988fc02c089a3d814c6ee607bdb1dcc1c`）中，Playwright 遠端瀏覽器驗收全部 5 個案例失敗，伺服器日誌顯示 Next.js SSR 500 錯誤：
  `Error: Control-plane strict IAP mode requires a valid x-goog-iap-jwt-assertion header.`
- **根因分析**：
  1. Next.js 在執行 `next start` 時預設設置 `NODE_ENV=production`。
  2. `@drts/control-plane-auth` 內的 `detectControlPlaneAuthEnvironment` 依序評估 `(env.DRTS_ENV ?? env.APP_ENV ?? env.NODE_ENV)`。當未特別指定 `DRTS_ENV` 時，`NODE_ENV="production"` 導致被識別為 `"production"` 環境。
  3. `isStrictControlPlaneIapEnvironment` 在 `"production"` 或 `"staging"` 環境下自動啟用 strict IAP mode，要求所有請求必須帶有 Google Cloud IAP JWT 標頭（`x-goog-iap-jwt-assertion`），否則拋出例外導致 SSR 頁面渲染崩潰（HTTP 500）。
  4. 原先 health check 指令為 `curl -s`，即使 HTTP 回應 500 也會回傳 exit 0，未能及早攔截伺服器異常。
- **修復方案**：
  1. **預覽環境變數修訂**：於 `.github/workflows/ops-shell-acceptance.yml` 之建置與伺服器執行步驟明確注入：
     `NODE_ENV=production DRTS_ENV=development STRICT_IAP_MODE=false NEXT_PUBLIC_PLATFORM_ADMIN_URL=http://localhost:3002 NEXT_PUBLIC_OPS_CONSOLE_URL=http://localhost:3003 NEXT_PUBLIC_OPS_ASSISTANT_ENABLED=true`
     使 `detectControlPlaneAuthEnvironment()` 正確識別為 `"local"` 開發/預覽環境，關閉 strict IAP 標頭強硬校驗。
  2. **嚴格 Health Check 探測**：更新 health check 為 `curl -sfL http://localhost:3003/dispatch` 與 `curl -sfL http://localhost:3002/audit`，強制檢查 2xx/3xx 成功回應，並在逾時 60s 時印出伺服器 stderr 日誌協助除錯。
  3. **Ops Shell 跨應用深層連結攔截**：在 `ops-shell.tsx` 加入 `handleClickCapture`，攔截 `/audit`、`/_apps/platform-admin` 等跨 app 導航並透過 `resolvePlatformAdminHref` 解析至 platform-admin 正確 URL 開啟新分頁，避免 Ops Console 內部 404。
  4. **助理元件關閉完全卸載與焦點返還**：在 `assistant-widget.tsx` 中於收合（`widget.closed === true`）時完全不掛載 `<section>` 面板，並利用 `requestAnimationFrame` 確保焦點精準返還發射器按鈕。

### 1.6 Candidate 0953d12b7 CI Root Typecheck TS2345 修復

- **CI Failure 現象**：在 GitHub Actions run `34516484156`（PR #1939）中，`pnpm run typecheck`（`pnpm typecheck:root`）報錯：
  `tests/unit/system-remediation/sr-ops-shell-001/workflow.test.ts(27,30): error TS2345: Argument of type 'string | undefined' is not assignable to parameter of type 'string'.`
- **根因**：`timeoutMatch![1]` 在 TypeScript `noUncheckedIndexedAccess: true` 嚴格陣列檢索模式下型別為 `string | undefined`，傳遞給 `parseInt` 引發 TS2345 型別不相容。
- **修復**：改為 `parseInt(timeoutMatch?.[1] ?? "0", 10)`，安全預設 fallback，使 root tsc 嚴格型別檢查順利通過。

## 2. 解決方案與架構設計

### 2.1 跨應用 URL 權威解析器與 Dispatch 整合 (`ops-cross-app-links.ts`, `dispatch/page.tsx`)

1. **唯一 Origin 慣例 (`resolvePlatformAdminBase`, `resolvePlatformAdminHref`)**：
   - 遵循 Supervisor 指示，以 `apps/ops-console-web/lib/ops-cross-app-links.ts` 作為跨應用唯一 origin 解析慣例。
   - 優先讀取 `NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? process.env.DRTS_PLATFORM_ADMIN_URL`，fallback 至 `/_apps/platform-admin`。
   - 支援完整 http/https 絕對路徑直接穿透。
2. **審計與適配器連結建構**：
   - 提供 `platformAdminAuditLink`, `platformAdminAdapterRegistryLink`, `buildPlatformAdminAuditRoute`。
   - 確保所有跨應用資源連結皆具備 `openMode: "new_tab"`，在 DOM `<Link>` 上配置 `target="_blank"` 與 `rel="noopener noreferrer"`。
3. **Dispatch 頁面選中資源審計連結實作**：
   - 在 `apps/ops-console-web/app/dispatch/page.tsx` 中，替換原局部 `buildPlatformAdminHref` 為調用 `ops-cross-app-links.ts`。
   - 選中 `BoardRecord` 為 `RuntimeOwnedOrder` 時：導向 `/audit?resourceType=order&resourceId=${encodeURIComponent(record.orderId)}`。
   - 選中 `BoardRecord` 為 `RuntimeForwardedOrder` 時：導向 `/audit?resourceType=forwarded_order&resourceId=${encodeURIComponent(record.mirrorOrderId)}`。
   - 轉發看板適配器登記連結導向 `/adapter-registry`。

### 2.2 接收端資源上下文解析與展示 (`audit-resource-context.ts`, `audit/page.tsx`)

1. **純函式解析模組 (`apps/platform-admin-web/lib/audit-resource-context.ts`)**：
   - `parseAuditResourceContext`:
     - 檢查重複參數（`getAll` 多值報錯）。
     - 驗證 resourceType 與 resourceId 成對存在。
     - 驗證參數非空字串。
     - 回傳 `kind: "none"` | `kind: "valid"` | `kind: "invalid"`。
   - `filterAuditRecordsByContext`:
     - 於 client-side 對 `listAuditLogs()` 授權紀錄進行嚴格 exact equality 交集比對。
     - 無符合時回傳 `isNoMatch: true`，不回傳未過濾資料。
     - 支援與 `filterModule` 複合過濾。
2. **審計管理頁面 (`apps/platform-admin-web/app/audit/page.tsx`)**：
   - 使用 `useSearchParams()` 動態讀取當前 URL query。
   - 外層以 `<Suspense fallback={null}>` 包裹以符合 Next.js App Router 靜態建置規範。
   - 三態呈現：
     - **Invalid State**：顯示 `CanvasBanner` (danger) 與 Invalid Context 卡片，提示具體語法錯誤並附帶 Clear Filter 按鈕，阻擋未授權資料外洩。
     - **No-Match Empty State**：顯示 Active Context 徽章與 Contextual Empty 卡片，明確告知指定資源無審計紀錄，並提供 Clear Filter 按鈕。
     - **Active Context / Normal State**：若有 active context，於頂部顯示 Active Context 徽章與 Clear Filter 按鈕（調用 `router.replace("/audit")`）；下方模組 pill 正確統計 context-scoped 數量；表格展示符合之日誌。

### 2.3 營運助理佈局、穿透隔離與無障礙優化 (`assistant-layout.ts`, `assistant-widget.tsx`, `ops-shell.tsx`)

1. **預設縮小化 (`minimized: true`)**：
   - 初始狀態預設為收合，以右下角輕量按鈕（`data-testid="ops-assistant-launcher"`）呈現，絕不遮擋工作區主要控制項與資料表格分頁。
2. **雙向點擊穿透保護**：
   - 外層全螢幕 Portal 容器節點強制設定 `pointerEvents: "none"`，底層工作區與 1440px / 390px 控制項全面可點擊。
   - 發射器按鈕（`ops-assistant-launcher`）與展開面板（`ops-assistant-panel`）本體均明確設定 `pointerEvents: "auto"`。
3. **工作區底層安全內距 (`ops-shell.tsx`)**：
   - 於內容包裹層增加 `paddingBottom: 72px`，確保在頁面滾動到底部時，底部的主要控制項不被右下角浮動發射器遮擋。
4. **鍵盤導航與焦點管理**：
   - 點擊關閉按鈕或按下 `Escape` 鍵收合助理時，焦點自動回到 `ops-assistant-launcher` 按鈕。
   - 點擊發射器展開助理時，焦點自動移至拖曳把手 `ops-assistant-drag-handle`。
5. **響應式尺寸與螢幕邊界限制**：
   - 針對 1440px 桌面視窗與 390px 行動裝置視窗，自適應動態限制卡片寬度與高度。
   - 保持 `localStorage` 位置記憶，並在重新整理或視窗縮放時自動 clamp 於可視區域內。

### 2.4 遠端瀏覽器驗收工作流與驗證測試 (`ops-shell-acceptance.yml`, `workflow.test.ts`, Playwright E2E)

1. **GitHub-hosted 遠端驗收工作流 (`.github/workflows/ops-shell-acceptance.yml`)**：
   - 針對候選 SHA 於 GitHub Actions (`ubuntu-latest`) 執行真實瀏覽器驗收。
   - 設定 `timeout-minutes: 20` 符合倉庫 CI 標準。
   - 自動建置 ops-console-web 與 platform-admin-web，並啟動 Playwright 執行 `tests/e2e/system-remediation/sr-ops-shell-001/`。
   - 驗收執行結果：GitHub Actions Runs `34515057699` 及 `34515056836` 於候選 SHA `a7e3d97bf406` 執行全數通過（exit 0，耗時約 3 分鐘）。
2. **Playwright 端對端測試案例 (`tests/e2e/system-remediation/sr-ops-shell-001/ops-shell-acceptance.spec.ts`)**：
   - 驗收 `ops_cross_app_resource_navigation`：Dispatch 點擊跳轉 platform-admin、URL query 正確性、接收端有效過濾、無符合 empty state、不完整 invalid state、Clear Filter 操作。
   - 驗收 `ops_widget_remote_viewport_keyboard`：1440px 桌面預設收合、底層 CTA 可點擊、Escape 與展開焦點轉移、390px 行動寬度限制與邊界保護。
3. **工作流結構驗證測試 (`tests/unit/system-remediation/sr-ops-shell-001/workflow.test.ts`)**：
   - 移入 Vitest 單元測試套件驗證 workflow 語法、triggers、timeout 設定與 required acceptance criteria 覆蓋率，避免 Python `test_*.py` 命名觸發 `check_test_coverage` 無對應 discovery root 檢查錯誤。通過 3 項驗證（exit 0）。

## 3. 實際變更檔案（符合授權之嚴格 write_scopes）

- `apps/ops-console-web/components/ops-assistant/assistant-layout.ts`
- `apps/ops-console-web/components/ops-assistant/cross-app-url.ts`
- `apps/ops-console-web/components/ops-assistant/assistant-actions.ts`
- `apps/ops-console-web/components/ops-assistant/assistant-widget.tsx`
- `apps/ops-console-web/components/ops-assistant/context-envelope.ts`
- `apps/ops-console-web/components/ops-assistant/index.ts`
- `apps/ops-console-web/components/ops-shell.tsx`
- `apps/ops-console-web/lib/ops-cross-app-links.ts`
- `apps/ops-console-web/app/dispatch/page.tsx`
- `apps/platform-admin-web/lib/audit-resource-context.ts`
- `apps/platform-admin-web/app/audit/page.tsx`
- `.github/workflows/ops-shell-acceptance.yml`
- `tests/unit/system-remediation/sr-ops-shell-001/workflow.test.ts`
- `tests/e2e/system-remediation/sr-ops-shell-001/ops-shell-acceptance.spec.ts`
- `tests/unit/system-remediation/sr-ops-shell-001/audit-resource-context.test.ts`
- `tests/unit/system-remediation/sr-ops-shell-001/audit-and-cross-app-links.test.ts`
- `tests/unit/system-remediation/sr-ops-shell-001/assistant-widget-layout.test.ts`
- `docs/04-uat/system-remediation-20260906/SR-OPS-SHELL-001.md`

## 4. 驗證指令與結果

### 4.1 Git Diff 格式檢查

```text
$ git diff --check
exit code: 0
```

### 4.2 TypeScript 型別檢查

```text
$ pnpm --filter @drts/ops-console-web typecheck
> @drts/ops-console-web@0.1.0 typecheck
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
exit code: 0

$ pnpm --filter @drts/platform-admin-web typecheck
> @drts/platform-admin-web@0.1.0 typecheck
> bash ../../tools/ci/next-typecheck.sh
Generating route types...
✓ Types generated successfully
exit code: 0
```

### 4.3 ESLint 靜態代碼檢查

```text
$ pnpm --filter @drts/ops-console-web lint
> @drts/ops-console-web@0.1.0 lint
> eslint . --max-warnings=0
exit code: 0

$ pnpm --filter @drts/platform-admin-web lint
> @drts/platform-admin-web@0.1.0 lint
> eslint . --max-warnings=0
exit code: 0
```

### 4.4 單元測試驗證

```text
$ pnpm exec vitest run tests/unit/system-remediation/sr-ops-shell-001/
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-ops-shell-001

 ✓ tests/unit/system-remediation/sr-ops-shell-001/audit-resource-context.test.ts (20 tests)
 ✓ tests/unit/system-remediation/sr-ops-shell-001/audit-and-cross-app-links.test.ts (18 tests)
 ✓ tests/unit/system-remediation/sr-ops-shell-001/assistant-widget-layout.test.ts (24 tests)
 ✓ tests/unit/system-remediation/sr-ops-shell-001/workflow.test.ts (3 tests)

 Test Files  4 passed (4)
      Tests  65 passed (65)
   Duration  617ms
exit code: 0
```

### 4.5 測試覆蓋率與工作流逾時檢查

```text
$ python3 tools/ci/check_test_coverage.py
check_test_coverage: all 62 test files yield tests CI runs.
exit code: 0

$ python3 -m unittest tools/ci/test_workflow_timeouts.py
...
----------------------------------------------------------------------
Ran 3 tests in 0.005s
OK
exit code: 0
```

## 5. 未做 / 明列排除

- **真機／遠端瀏覽器驗收執行（保留 Required Acceptance 待遠端跑完）**：
  依據派工規範（VM restriction: 禁止在此 VM 啟動 product dev servers, preview/browser test servers, Playwright 或 Docker Compose），端對端瀏覽器驗收不在本地執行，而是交付至專用 GitHub-hosted 工作流 `.github/workflows/ops-shell-acceptance.yml` 於 GitHub Actions 執行。機讀狀態中的 `required_acceptance`（`ops_cross_app_resource_navigation`、`ops_widget_remote_viewport_keyboard`）將依循 candidate lifecycle 由遠端執行結果自動寫入，不擅自在本機宣告 done。
- **未修改中央共用設定**：
  未修改中央 shared exports、中央 test config、全域 routes、`package.json` 或 `pnpm-lock.yaml`。所有修改嚴格約束在 Supervisor 授權之 `write_scopes` 內。
