# SR-OPS-SHELL-001 — 營運助理遮擋與跨app導航：完成證據

- Task: `SR-OPS-SHELL-001`
- Owner: `Gemini`
- Reviewer: `Claude`
- Planning Ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- Base SHA (`origin/dev` at start): `f759582305ca7ff1b17a0225d3dd54db22ee9a18` (歷史 audit SHA: `6bbeaaa45`)
- Prior Candidate SHA (Reopened): `4e0e8b82e5e6c1b47b85d90b368e3e0bb48fa1da`
- Worktree: `.artifacts/worktrees/auto/gemini-sr-ops-shell-001`
- Branch: `gemini/sr-ops-shell-001`

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
- **本次修復重點**：
  1. 於 `assistant-widget.tsx` 發射器按鈕 inline style 明確加入 `pointerEvents: "auto"`。
  2. 模組化抽取 `apps/ops-console-web/components/ops-assistant/assistant-layout.ts`，由元件與測試共用純函式（`buildPortalRootStyle`, `buildLauncherButtonStyle`, `buildShellPanelStyle`, `resolveEffectivePointerEvents`, `buildDefaultState`, `readStoredState`, `writeStoredState` 等）。
  3. 新增 DOM 事件層級測試，模擬 CSS 繼承特性，重現無設定時繼承 none 導致點擊無效的缺陷，並驗證加上 `auto` 後點擊觸發開關循環與 `localStorage` 持久化狀態。
  4. 在 `cross-app-url.ts` 增加防護，避免對 Cloud Run 隨機 hash 網域（`*.run.app`）執行字串替換。

### 1.2 Candidate af617b4388df CI Failure 根因與型別修復

- **CI Failure 現象**：在 GitHub Actions run `34021153566`（PR #1648）中，`pnpm run typecheck` (`pnpm typecheck:root` -> `tsc -p tsconfig.json --noEmit`) 報錯：
  `tests/unit/system-remediation/sr-ops-shell-001/assistant-widget-layout.test.ts(473,46): error TS2353: Object literal may only specify known properties, and 'key' does not exist in type '{ type: string; defaultPrevented?: boolean; }'.`
- **根因**：單元測試檔中的 `MockElement.dispatchEvent` 參數定義為 `{ type: string; defaultPrevented?: boolean }`，未定義 index signature；而在 line 473 測試鍵盤事件時傳入了 `{ type: "keydown", key: "Escape" }`，觸發 TypeScript strict excess property check。
- **修復**：將 `MockElement.dispatchEvent` 的事件參數擴充為 `{ type: string; defaultPrevented?: boolean; [key: string]: any }`，允許自訂事件屬性（如 `key`），使 `pnpm typecheck:root` 與 `vitest` 全面順利通過。

## 2. 解決方案與架構設計

### 2.1 跨應用 URL 權威解析器 (`cross-app-url.ts`)

1. **Origin 解析 (`resolvePlatformAdminOrigin`)**：
   - 優先讀取環境變數 `NEXT_PUBLIC_PLATFORM_ADMIN_URL`、`NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN`、`NEXT_PUBLIC_PLATFORM_ADMIN_WEB_URL` 等。
   - 支援微前端或容器環境注入的 `window.__DRTS_RUNTIME_CONFIG__`。
   - 支援本機開發與測試環境自動 port 對應：當前 host 為 `localhost` 或 `127.0.0.1` 且埠號為 `3100` 時，自動對映至 `3102`；其餘 fallback 至標準 platform-admin 埠號 `http://localhost:3002`。
   - 排除 Cloud Run 產生的 `*.run.app` 隨機後綴網域，避免錯誤主機名解析。
2. **Audit 與 Payments 連結建構 (`buildPlatformAdminAuditUrl`, `resolveCrossAppHref`, `sanitizeAuditHref`)**：
   - 產出具有完整審計上下文的 URL：`/audit?auditId=...&resourceType=...&resourceId=...&module=...&actorId=...`。
   - 自動過濾多餘的 `/platform-admin/` 或 `/_apps/platform-admin/` 路徑前綴，確保在 platform-admin 上命中正確的頂層路由 `/audit` 與 `/payments`。
   - 保證新分頁開拓模式 (`target="_blank"`, `rel="noopener noreferrer"`)，避免中斷使用者的 ops-console 操作流程。

### 2.2 營運助理佈局、穿透隔離與無障礙優化 (`assistant-layout.ts`, `assistant-widget.tsx`, `ops-shell.tsx`)

1. **預設縮小化 (`minimized: true`)**：
   - 初始狀態預設為收合，以右下角輕量圓形按鈕（`data-testid="ops-assistant-launcher"`）呈現，預設絕不遮擋工作區主要控制項與資料表格分頁。
2. **雙向點擊穿透保護**：
   - 外層全螢幕 Portal 容器節點強制設定 `pointerEvents: "none"`，底層工作區與 1440px / 390px 控制項全面可點擊。
   - 發射器按鈕（`ops-assistant-launcher`）與展開面板（`ops-assistant-panel`）本體均明確設定 `pointerEvents: "auto"`，確保滑鼠與觸控點擊均可正常交互並在二者間自由開關切換。
3. **工作區底層安全內距 (`ops-shell.tsx`)**：
   - 於內容包裹層增加 `data-testid="ops-shell-content-container"`，並設定 `paddingBottom: 72px`，確保在頁面滾動到底部時，底部的主要控制項與提交按鈕不被右下角浮動發射器遮擋。
4. **鍵盤導航與焦點管理**：
   - 點擊關閉按鈕或按下 `Escape` 鍵收合助理時，焦點自動回到 `ops-assistant-launcher` 按鈕。
   - 點擊發射器展開助理時，焦點自動移至拖曳把手 `ops-assistant-drag-handle`，支援鍵盤無障礙操作與立即拖曳。
   - 面板內部全面監聽 `Escape` 鍵事件快速關閉。
5. **響應式尺寸與螢幕邊界限制**：
   - 針對 1440px 桌面視窗與 390px 行動裝置視窗，自適應動態限制卡片寬度（行動裝置下限制為 `Math.min(350, windowWidth - 32)`）與高度。
   - 保持 `localStorage` 位置記憶，並在重新整理或視窗縮放時自動 clamp 於可視區域內。

## 3. 實際變更檔案（符合嚴格 write_scopes）

- `apps/ops-console-web/components/ops-assistant/assistant-layout.ts` (新增):
  佈局數學、視窗邊界計算、localStorage 讀寫、樣式建構與 pointer-events 繼承解析純函式。
- `apps/ops-console-web/components/ops-assistant/cross-app-url.ts` (新增):
  跨 app origin 與審計/支付 URL 解析函式，附帶 Cloud Run 網域防護。
- `apps/ops-console-web/components/ops-assistant/assistant-actions.ts` (修改):
  以 `resolveCrossAppHref` 改寫 quick actions 導航，並新增 `/incidents` 審計連結。
- `apps/ops-console-web/components/ops-assistant/assistant-widget.tsx` (修改):
  引用 `assistant-layout`，發射器與面板均啟用 `pointerEvents: "auto"`，焦點管理與無障礙優化。
- `apps/ops-console-web/components/ops-assistant/context-envelope.ts` (修改):
  修正相對路徑引用。
- `apps/ops-console-web/components/ops-assistant/index.ts` (修改):
  導出跨 app 導航與佈局輔助函式。
- `apps/ops-console-web/components/ops-shell.tsx` (修改):
  加入底層內容容器安全內距防護（72px）。
- `tests/unit/system-remediation/sr-ops-shell-001/audit-and-cross-app-links.test.ts` (新增):
  15 個針對 cross-app audit/payments 連結、參數傳遞與 URL sanitization 的單元測試。
- `tests/unit/system-remediation/sr-ops-shell-001/assistant-widget-layout.test.ts` (新增):
  20 個針對預設縮小化、桌面與行動佈局適應、localStorage clamp、pointer-events 繼承重現與修復、DOM 點擊開關循環、焦點管理與底層 CTA 點擊穿透的單元測試。
- `docs/04-uat/system-remediation-20260906/SR-OPS-SHELL-001.md` (修改):
  本完成證據文件（更新 reopen 根因與修復驗證）。

## 4. 驗證指令與結果

### 4.1 Git Diff 格式檢查

```text
$ git diff --check
exit code: 0
```

### 4.2 TypeScript 型別檢查

```text
$ pnpm run typecheck:root
> drts-fleet-platform@0.1.0 typecheck:root /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-ops-shell-001
> tsc -p tsconfig.json --noEmit
exit code: 0

$ pnpm --filter @drts/ops-console-web typecheck
> @drts/ops-console-web@0.1.0 typecheck /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-ops-shell-001/apps/ops-console-web
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
exit code: 0
```

### 4.3 單元測試驗證

```text
$ pnpm exec vitest run tests/unit/system-remediation/sr-ops-shell-001/
 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-ops-shell-001

 ✓ tests/unit/system-remediation/sr-ops-shell-001/audit-and-cross-app-links.test.ts (15 tests) 52ms
 ✓ tests/unit/system-remediation/sr-ops-shell-001/assistant-widget-layout.test.ts (20 tests) 11ms

 Test Files  2 passed (2)
      Tests  35 passed (35)
   Start at  08:09:18
   Duration  913ms
exit code: 0
```

### 4.4 ESLint 靜態檢查

```text
$ pnpm --filter @drts/ops-console-web lint
> @drts/ops-console-web@0.1.0 lint /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-ops-shell-001/apps/ops-console-web
> eslint . --max-warnings=0
exit code: 0

$ pnpm lint:root
> drts-fleet-platform@0.1.0 lint:root /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-ops-shell-001
> eslint eslint.config.mjs playwright*.config.ts vitest.config.ts tests --max-warnings=0
exit code: 0
```

## 5. 未做 / 明列排除

- 未修改其他 apps（如 `apps/platform-admin-web` 或 `apps/tenant-console-web`）的路由或元件，嚴格遵循單一應用程式關注點與 write_scopes 邊界。
- 未修改中央 shared exports、中央 test config、中央 routes、`package.json` 或 `pnpm-lock.yaml`。
- 本 task 不以假 fixture 或固定 mock 取代真邏輯，所有 URL 解析均可於真實環境變數或執行階段無縫接軌。
