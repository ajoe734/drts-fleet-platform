# SR-OPS-SHELL-001 — 營運助理遮擋與跨app導航：完成證據

- Task: `SR-OPS-SHELL-001`
- Owner: `Gemini`
- Reviewer: `Gemini2`
- Planning Ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- Base SHA (`origin/dev` at start): `f759582305ca7ff1b17a0225d3dd54db22ee9a18` (歷史 audit SHA: `6bbeaaa45`)
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

## 2. 解決方案與架構設計

### 2.1 跨應用 URL 權威解析器 (`cross-app-url.ts`)
1. **Origin 解析 (`resolvePlatformAdminOrigin`)**：
   - 優先讀取環境變數 `NEXT_PUBLIC_PLATFORM_ADMIN_WEB_URL`。
   - 支援微前端或容器環境注入的 `window.__RUNTIME_CONFIG__.PLATFORM_ADMIN_WEB_URL`。
   - 支援本機開發與測試環境自動 port 對應：當前 host 為 `localhost` 或 `127.0.0.1` 且埠號為 `3000`（或 `3100`）時，自動對映至 `3002`（或 `3102`）。
   - 預設 fallback 為標準 platform-admin 埠號 `http://localhost:3002`。
2. **Audit 與 Payments 連結建構 (`buildPlatformAdminAuditUrl`, `resolveCrossAppHref`, `sanitizeAuditHref`)**：
   - 產出具有完整審計上下文的 URL：`/audit?auditId=...&resourceType=...&resourceId=...&module=...&actorId=...`。
   - 自動過濾多餘的 `/platform-admin/` 或 `/_apps/platform-admin/` 路徑前綴，確保在 platform-admin 上命中正確的頂層路由 `/audit` 與 `/payments`。
   - 保證新分頁開拓模式 (`target="_blank"`, `rel="noopener noreferrer"`)，避免中斷使用者的 ops-console 操作流程。

### 2.2 營運助理佈局與無障礙優化 (`assistant-widget.tsx`, `ops-shell.tsx`)
1. **預設縮小化 (`minimized: true`)**：
   - 初始狀態預設為收合，以右下角輕量圓形按鈕（`data-testid="ops-assistant-launcher"`）呈現，預設絕不遮擋工作區主要控制項與資料表格分頁。
2. **點擊穿透保護**：
   - 外層全螢幕 Portal 容器節點強制設定 `pointerEvents: "none"`，僅對發射器按鈕與展開面板本體啟用 `pointerEvents: "auto"`，確保底層工作區與表單控制項無阻礙交互。
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

- `apps/ops-console-web/components/ops-assistant/cross-app-url.ts` (新增):
  跨 app origin 與審計/支付 URL 解析函式。
- `apps/ops-console-web/components/ops-assistant/assistant-actions.ts` (修改):
  以 `resolveCrossAppHref` 改寫 quick actions 導航，並新增 `/incidents` 審計連結。
- `apps/ops-console-web/components/ops-assistant/assistant-widget.tsx` (修改):
  預設縮小化、焦點返回發射器、Escape 鍵支援、拖曳把手聚焦、全螢幕容器 pointer-events 防護、行動裝置寬高適應。
- `apps/ops-console-web/components/ops-assistant/context-envelope.ts` (修改):
  修正相對路徑引用，避免根目錄與 monorepo 跨層級型別檢查衝突。
- `apps/ops-console-web/components/ops-assistant/index.ts` (修改):
  導出跨 app 導航相關工具函式。
- `apps/ops-console-web/components/ops-shell.tsx` (修改):
  加入底層內容容器安全內距防護（72px）。
- `tests/unit/system-remediation/sr-ops-shell-001/audit-and-cross-app-links.test.ts` (新增):
  15 個針對 cross-app audit/payments 連結、參數傳遞與 URL sanitization 的單元測試。
- `tests/unit/system-remediation/sr-ops-shell-001/assistant-widget-layout.test.ts` (新增):
  7 個針對預設縮小化、桌面與行動佈局適應、localStorage clamp、焦點返回 launcher 與 Escape 鍵的單元測試。
- `docs/04-uat/system-remediation-20260906/SR-OPS-SHELL-001.md` (新增):
  本完成證據文件。

## 4. 驗證指令與結果

### 4.1 Git Diff 格式檢查
```text
$ git diff --check
exit code: 0
```

### 4.2 TypeScript 型別檢查
```text
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

 ✓ tests/unit/system-remediation/sr-ops-shell-001/audit-and-cross-app-links.test.ts (15 tests) 54ms
 ✓ tests/unit/system-remediation/sr-ops-shell-001/assistant-widget-layout.test.ts (7 tests) 8ms

 Test Files  2 passed (2)
      Tests  22 passed (22)
   Start at  07:33:55
   Duration  1.00s
exit code: 0
```

## 5. 未做 / 明列排除

- 未修改其他 apps（如 `apps/platform-admin-web` 或 `apps/tenant-console-web`）的路由或元件，嚴格遵循單一應用程式關注點與 write_scopes 邊界。
- 未修改共用套件的 `package.json` 或 `pnpm-lock.yaml`（本 task 僅使用現有 React 與 DOM 基礎功能，無須額外依賴）。
- 本 task 不以假 fixture 或固定 mock 取代真邏輯，所有 URL 解析均可於真實環境變數或執行階段無縫接軌。
