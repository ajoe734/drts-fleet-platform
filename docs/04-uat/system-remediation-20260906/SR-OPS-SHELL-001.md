# SR-OPS-SHELL-001 — 營運助理遮擋與跨app導航：完成證據

- Task: `SR-OPS-SHELL-001`
- Owner: `Gemini`
- Reviewer: `Codex`
- Planning Ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- Base SHA (`origin/dev` at merge): `7d04833053b63558c10fb678a422dff3522e0150` (前次 base: `3062ea363769cc393e59384251f5aedc7e570ac5`, `6f4ac8c74ae3618b6109efd010014365a85d36d8`, 歷史 audit SHA: `6bbeaaa45`, 原始實作 base: `f759582305ca7ff1b17a0225d3dd54db22ee9a18`)
- Current Local Head: `git merge origin/dev` completed cleanly with zero conflicts (merge commit `6047adde7`)
- PR #1648 URL: https://github.com/ajoe734/drts-fleet-platform/pull/1648
- Worktree: `.artifacts/worktrees/auto/gemini-sr-ops-shell-001`
- Branch: `gemini/sr-ops-shell-001`
- Status: `blocked` (卡點已記錄於機讀狀態，保留完整驗收條件，不直接 done)

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

### 1.3 Candidate 5a0320b21 Codex Review Rejection 分類與進展

Codex 審查 candidate `5a0320b21` 時提出兩項 reopen 判定：
1. **P1（範疇界線與接收端契約 — Q-SR-OPS-SHELL-001）**：
   - 審查指出 `apps/ops-console-web/app/dispatch/page.tsx:1226-1230` 預設仍導向 `/platform-admin`，line 4520 audit CTA 僅傳遞 `/audit` 且無 resource 識別；而接收端 `apps/platform-admin-web/app/audit/page.tsx:164` 呼叫 `listAuditLogs()` 未消費 URL query 參數。
   - **分析與卡點依據**：
     - 本任務之 `write_scopes` 僅包含 `apps/ops-console-web/components/ops-assistant/`、`apps/ops-console-web/components/ops-shell.tsx`、`tests/unit/system-remediation/sr-ops-shell-001/` 及本證據文件，**不包含** `apps/ops-console-web/app/dispatch/page.tsx` 與 `apps/platform-admin-web/app/audit/page.tsx`。
     - 依據協同手冊與執行規範，「只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫」。
     - 此外，PR #1749（`support/unblock/SR-OPS-SHELL-001/SR-OPS-SHELL-001-UNBLOCK-PLANNING-DECISION.md`）已由 Codex 與 Gemini 確立決策：保留完整驗收，不擅自修改未授權之共用頁面；由 Supervisor 審查 scope 重疊並正式將 dispatch page 授權納入 scope、確認 audit receiver 契約後，owner 方能實作該頁面之跨 app 連結。
     - 因此 P1 屬於規格與 scope 授權之外部相依卡點（blocked），需由 Supervisor 擴充 machine-truth `write_scopes` 並確認契約。
2. **P2（測試真實性與領域實體 ID）**：
   - 審查指出前版測試依賴手寫 MockElement，未驗證 1440/390px 幾何碰撞與真實 DRTS 領域資源識別碼。
   - **本次修復（已完全落盤驗證）**：
     - 於 `assistant-widget-layout.test.ts` 新增 1440x900 與 390x844 視窗的幾何邊界與命中測試（hit-testing），模擬多層 z-index 與 `pointerEvents: "none"` 穿透機制，驗證底層 dispatch 核心控制項（`dispatch-pagination-cta`、`dispatch-order-assign-cta`、`mobile-action-bar-submit`）在各種坐標點均不被 portal 攔截。
     - 於 `audit-and-cross-app-links.test.ts` 引入 DRTS Phase 1 權威 `ActionReceipt` 契約與真實資源 ID（如 `ord-tpe-2026-8801`、`inc-tpe-2026-0042`、`aud-disp-log-20260908-991`、`act-disp-assign-20260908-01`、`usr-ops-lead-01`），驗證序列化後的審計 URL 完全命中 runtime 正確之 platform-admin origin（而非 ops-console 404 或嵌套 `/platform-admin/audit`），且所有跨 app 連結均保證 `openMode: "new_tab"`。
     - 測試總數擴充至 41 項，全面 exit 0 通過。

### 1.4 2026-09-09 Dispatch 診斷、Trunk Merge 與卡點分析

在 2026-09-09T01:41Z 與 02:01Z 收到 supervisor dispatch（`Chairman resumed after SR-OPS-SHELL-001-UNBLOCK-HISTORY-REPAIR`）後，進行深入核驗與診斷：

1. **Trunk 整合 (`origin/dev`)**：
   - 本地成功執行 `git merge --no-edit origin/dev`（base `7d04833053b63558c10fb678a422dff3522e0150`，前次 base `3062ea363769cc393e59384251f5aedc7e570ac5`），無任何衝突（exit 0，merge commit `6047adde7`）。
   - 驗證套件全部通過：
     - `git diff --check`: exit 0
     - `pnpm --filter @drts/ops-console-web typecheck`: exit 0 (`next typegen && tsc --noEmit` 通過)
     - `pnpm exec vitest run tests/unit/system-remediation/sr-ops-shell-001/`: exit 0（2 test files, 41/41 passed, 877ms）
     - `pnpm --filter @drts/ops-console-web lint`: exit 0 (`--max-warnings=0` 通過)

2. **卡點 1：CI Commit Trailers 格式失敗與遠端祖先非強制推送政策衝突**：
   - 經檢查 PR #1648 之 GitHub Actions checks，共 24 項通過、僅 1 項失敗：`CI/Commit trailers (pull_request)`（run ID `34300724683`）。
   - 本地重現指令：`python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` 報錯：
     `commit fe3d92cbaa12: subject must be '<TASK-ID>: <summary>', got: 'test(SR-OPS-SHELL-001): resolve review rejection P2 with realistic hit-testing and domain IDs'`
   - 根因：前一輪 commit `fe3d92cba` 之 commit subject 使用了 `test(...)` 前綴。而 `tools/ci/git/check_commit_trailers.py` 第 31 行正則表達式 `SUBJECT_RE` 僅允許 `(?:wip|fix|feat|refactor|docs|chore|style)` 或無 prefix 格式，不接受 `test`。
   - 依據 `docs/ops/branch-strategy.md` §11 及本次派工指令（「先 commit＋普通 push，再 handoff；若安全 commit 或普通 non-force push 做不到，必須明確回報 progress / blocker 與原因，不能把工作描述成已完成」），此處嚴禁使用 `git push --force`。
   - 由於 `fe3d92cba` 已經由前任推送至遠端 `origin/gemini/sr-ops-shell-001`，任何普通（fast-forward）push 皆必須保留 `fe3d92cba` 作為祖先節點。在 `check_commit_trailers.py` 檢查 `origin/dev..HEAD` 中所有 non-merge commits 的機制下，該歷史 commit 將持續導致 PR #1648 的 Commit trailers 檢查紅燈。
   - **建議處置**：比照 `UV-EXEC-006`（PR #1822）、`SR-FLEET-FORM-001`（PR #1752）與 `UV-EXEC-012`（PR #1821）之非破壞性歷史修復模式，由 Supervisor 授權建立 fresh replacement branch（例如 `gemini/sr-ops-shell-001-recovered-20260909`），將此處已驗證通過之 41 項測試與助理 layout 淨補丁推送至新分支建立 PR；或由 Supervisor 裁定採用已通過全部 24 項 CI 檢查之平行 PR #1728（`codex/sr-ops-shell-001`）。

3. **卡點 2：Q-SR-OPS-SHELL-001 跨 app dispatch/audit 頁面與接收端契約阻塞**：
   - 如 PR #1749、PR #1804 及本 runbook 記載，`/dispatch` 頁面（`apps/ops-console-web/app/dispatch/page.tsx:4520`）之 audit CTA 僅傳遞 `/audit` 且無 selected resource context，接收端 `apps/platform-admin-web/app/audit/page.tsx:164` 呼叫 `client.listAuditLogs()` 亦未消費 URL query 參數。
   - 兩者均在當前 `write_scopes` 之外。依據協同規範，owner 不得擅自越權修改共用頁面，必須等待 Supervisor 擴充 machine-truth write_scopes 與相依、並確認 receiver 契約後方得實作。
   - 本任務堅持誠實原則，維持嚴格 scope 界線與完整驗收條件，以 `ai-status.sh blocker` 落盤記錄阻塞，不以 branch-only 宣稱已完成。

### 1.5 Candidate f5ad0f119 Codex Review Rejection 分類與回歸修復

Codex 於 2026-09-09T02:08:51Z 審查 Candidate `f5ad0f1193c88fe2c4a940cfbeff3a5a0e842ec3`，提出兩項阻擋判定：
1. **P1（跨 app 導航與接收端契約 — Q-SR-OPS-SHELL-001）**：
   - 審查指出 `apps/ops-console-web/app/dispatch/page.tsx:1226-1231` 預設仍 fallback 至 `/platform-admin`，line 4520 audit CTA 僅呼叫 `buildPlatformAdminHref("/audit")` 且無 selected resource context，造成在缺乏公共設定時出現 ops 404；且接收端 `apps/platform-admin-web/app/audit/page.tsx:164` 呼叫 `listAuditLogs()` 未消費 URL query context。
   - **處置**：本任務嚴格遵守 `write_scopes` 與架構紀律，`dispatch/page.tsx` 與 `platform-admin-web` 均在 scope 之外。必須由 Supervisor 裁定 `Q-SR-OPS-SHELL-001`、正式授權 write_scopes 與相依後，方能進行跨 app 共用頁面變更。維持本項為外部卡點（blocker）。
2. **P2（命中測試與真實元件樣式幾何）**：
   - 審查指出 `assistant-widget-layout.test.ts:551` 以捏造之 48x48 靜態方塊模擬 launcher，忽略了實際 `buildDefaultState()` 預設為 `closed: false, minimized: true`（為 420x64 之縮小化標頭面板），且發射器按鈕具備標籤文字、為自適應寬度之膠囊狀按鈕。純 mock hit-testing 無法驗證實際掛載元件與真機行為，要求保留瀏覽器驗收為 unverified 並提供與元件實體連結之回歸測試。
   - **本次回歸修復**：
     - 重構 `assistant-widget-layout.test.ts` 測試案例，直接呼叫元件之樣式建構純函式：
       1. 預設狀態測試改採 `buildShellPanelStyle(buildDefaultState(desktop))`，驗證掛載為 `closed: false, minimized: true`，幾何為 `x: 1000, y: 816, width: 420, height: 64`，與左側/中央之 dispatch 底部分頁（`left: 24`）及訂單指派按鈕（`left: 600`）完全不碰撞，且全螢幕 portal root 之 `pointerEvents: "none"` 確保底層點擊完全穿透。
       2. 關閉狀態測試改採 `buildLauncherButtonStyle()`，驗證按鈕為 `pointerEvents: "auto"`、定位於 `right: 20, bottom: 20, height: 48, padding: 0 16px`，以真實 label 寬度估算（~140px）驗證幾何隔離與點擊命中。
       3. 行動視窗 390x844 測試驗證面板自動 clamp 為 350px 寬，並配合 `ops-shell.tsx` 之 `paddingBottom: 72px` 預留滾動安全邊界。
     - 測試總數擴增至 42 項，全面通過。

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
  18 個針對 cross-app audit/payments 連結、真實 DRTS ActionReceipt 序列化、參數傳遞與 URL sanitization 的單元測試。
- `tests/unit/system-remediation/sr-ops-shell-001/assistant-widget-layout.test.ts` (新增):
  24 個針對預設縮小化、1440x900 桌面與 390x844 行動視窗幾何邊界與命中測試（hit-testing）、localStorage clamp、pointer-events 繼承與穿透、DOM 點擊開關循環、焦點管理與底層 CTA 點擊穿透的單元測試。
- `docs/04-uat/system-remediation-20260906/SR-OPS-SHELL-001.md` (修改):
  本完成證據文件（更新 reopen 根因、P1 scope 阻擋說明與 P2 測試真實性修復驗證）。

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
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-ops-shell-001

 ✓ tests/unit/system-remediation/sr-ops-shell-001/audit-and-cross-app-links.test.ts (18 tests) 42ms
 ✓ tests/unit/system-remediation/sr-ops-shell-001/assistant-widget-layout.test.ts (24 tests) 40ms

 Test Files  2 passed (2)
      Tests  42 passed (42)
   Start at  02:12:08
   Duration  782ms
exit code: 0
```

### 4.4 ESLint 靜態檢查

```text
$ pnpm --filter @drts/ops-console-web lint
> @drts/ops-console-web@0.1.0 lint /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-ops-shell-001/apps/ops-console-web
> eslint . --max-warnings=0
exit code: 0
```

## 5. 未做 / 明列排除

- **跨應用審計與資源上下文範疇界線（`Q-SR-OPS-SHELL-001`）**：
  如 `support/unblock/SR-OPS-SHELL-001/SR-OPS-SHELL-001-UNBLOCK-PLANNING-DECISION.md`（PR #1749）記錄，`/dispatch` 頁面（`apps/ops-console-web/app/dispatch/page.tsx`）的 audit CTA 與接收端 `apps/platform-admin-web/app/audit/page.tsx` 目前不在本任務的 `write_scopes` 內。依據執行規則與合意決策，在 supervisor 正式擴充 write_scopes 與相依、且確認 audit receiver 的 resource-context 契約前，本任務不擅自跨 scope 修改未授權之 page 檔案，保留父任務嚴格邊界。
- **真機／瀏覽器手動視覺驗證（保留 Unverified）**：
  因虛擬機執行環境受限（VM restriction: 禁止啟動 product dev servers, preview/browser test servers, Playwright 或 Docker Compose），未在實體裝置或圖形介面瀏覽器進行手動點擊與端對端視覺驗證；保留瀏覽器驗收為 unverified。本報告以純函式幾何 clamp、實際樣式建構（`buildShellPanelStyle`, `buildLauncherButtonStyle`, `buildPortalRootStyle`）、DOM pointer-events 繼承模擬、全域 click 事件循環與焦點切換之自動化單元測試（42 項測試通過）作為驗證依據，不冒充真機通過。
- **未修改中央共用設定**：
  未修改中央 shared exports、中央 test config、中央 routes、`package.json` 或 `pnpm-lock.yaml`。
- **分支歷史與普通 Push 狀態及卡點記錄**：
  遠端分支 `origin/gemini/sr-ops-shell-001` 原有 head `cdf5488d7`，後續整合時包含帶有非白名單 prefix 之歷史 commit `fe3d92cba`，導致 PR #1648 `CI/Commit trailers` 失敗。本地已合併最新 `origin/dev`（`7d0483305`），通過全部本地測試與型別檢查。依據「若安全 commit 或普通 non-force push 做不到，必須明確回報 progress / blocker 與原因，不能把工作描述成已完成」與禁止 force push 之規定，本輪以普通 commit 及 push 儲存進度，並以 `ai-status.sh blocker` 誠實記錄卡點，等待 Supervisor 裁定 fresh recovery branch 或 PR 整合路徑。
