# SR-FLEET-FORM-001 — 供給表單可及性及未儲存草稿

Owner: Codex · Reviewer: Codex2 · 2026-09-08

## P2 review 修正（2026-09-08 本次 dispatch）

- Fresh `origin/dev` base：`e2df37f821ce76d8a3639ceaac6d253299c0a31c`；收到的 rejected candidate：`37f8e25fcacca26aa28c0c6457a6529a3d2f059b`。目前 dev 尚無 `useSupplyDraft`／sessionStorage 恢復邏輯；不把 9/6 audit 當成目前實作真值。
- `git fetch origin` exit 0。`git rebase origin/dev` exit 1：舊重複提交 a9afdcd94 造成 component 與 evidence 衝突。`git rebase --abort` exit 0，再 `git merge origin/dev --no-edit` exit 0，保留已公開分支歷史與普通 non-force push。無手動編輯 scope 外檔案。
- 實作 anchor：`4270b0bf392149958b8fd3cc67da76a337a20887`，已普通 push 至 `origin/codex/sr-fleet-form-001`（exit 0）。最終 candidate 包含此 evidence 更新，由 handoff 寫入 exact SHA；PR #1723 保持 OPEN、base dev。
- 恢復草稿優先採用本 document 最新 memory snapshot，只有不存在時才讀 sessionStorage。成功建立後保留空白 memory snapshot，避免 removeItem 失敗時舊草稿在同一 SPA session 再出現。無 UI、tokens、API 或模型變更。
- 新增 `draft-storage.test.ts`：從 production component 提取並 transpile 實際 hook，以 hook lifecycle／storage adapters 測試首次持久化恢復、已有舊值且 setItem 失敗後 SPA remount／BFCache return、driver/vehicle key 隔離、clear 後 removeItem 失敗。這是單元層模擬，非真 React DOM／瀏覽器測試。
- 修正前執行 `pnpm exec vitest run tests/unit/system-remediation/sr-fleet-form-001/draft-storage.test.ts` exit 1：3 tests 中 2 failed；latest 預期值實際為 old，清除預期空值實際為 submitted。
- 修正後 `pnpm exec vitest run tests/unit/system-remediation/sr-fleet-form-001/` exit 0：2 files、43 tests passed。
- `pnpm --filter @drts/fleet-partner-portal-web typecheck` exit 0（route typegen + tsc）；`pnpm --filter @drts/fleet-partner-portal-web lint` exit 0；`pnpm exec eslint tests/unit/system-remediation/sr-fleet-form-001/ --max-warnings=0` exit 0；`git diff --check` 與 `git diff --check origin/dev HEAD` exit 0。
- 本輪未重跑 production build、瀏覽器、live API、真機或讀屏；以下 browser/build 數據為上一輪 candidate 歷史證據，不冒充本輪結果。Live resource ID：無；測試使用 driver／vehicle storage keys，未建立供給資源。memory fallback 仍不能跨整頁 reload，在 storage 不可用時依既有 beforeunload 提醒。
- 等待 Codex2 exact-candidate 獨立 review 與同 SHA CI／merge；owner 不呼叫 done。

## 上一輪歷史證據

## 來源與版本

- Base: `d44bd28142f238ef9d40507685a9423ef5c814f7`，本輪 `git fetch origin` 後的 `origin/dev`；已執行 `git rebase origin/dev`（exit 0）。9/6 audit 僅作問題來源。
- 實作 SHA: `80729bd6462d360409cbd8555442c7bd93185b12`。最終 candidate 包含本 evidence 文件，exact SHA 由 `CANDIDATE_SHA=$(git rev-parse HEAD)` 寫入 task handoff；以 machine-truth task slice 的 candidate SHA 為準，避免文件自引用 SHA。
- Branch: `codex/sr-fleet-form-001`；PR: <https://github.com/ajoe734/drts-fleet-platform/pull/1723>。
- 已恢復遠端存活分支 `c9f16307f8b0ef9880ed638e41f5100d9628f0db` 的全欄位 dirty 偵測／側欄導航確認，正常 merge、commit 與 non-force push，未回退既有修復。
- Execution: `docs/03-runbooks/system-remediation-execution-tasks-20260906.md` 與 task spec。追溯 `source/findings.json` R23（暗色 label／欄位關聯）、R25（供給總覽再返回遺失輸入），`source/capabilities.json` C070、C120。
- 視覺來源：`Fleet Partner Portal.html` §5.2／§5.3、`fleet-supply.jsx` 的 `FLP_DriverDraft`／`FLP_VehicleDraft`。沿用 `buildFleetTheme()` → `buildCanvasTheme({surface: "partner", dark: true})` 及 `packages/ui-tokens`；無新增調色板或畫面設計。

## 交付行為

實際表單入口為 `app/supply/drivers/new/page.tsx`、`app/supply/vehicles/new/page.tsx`；既有 `fleet-supply-workspace.tsx` 共用欄位保留原 API／資料模型。

- Label 與 id 明確關聯，checkbox 使用包覆 label、產品群組有 accessible name；原必填標記同步到 native `required`，錯誤／提示以 `aria-describedby` 關聯，API 錯誤只有一個 assertive alert。
- 原生 form 支援 Enter、瀏覽器 required validation；hydration／草稿恢復前及提交期間停用欄位，避免使用者輸入被恢復流程蓋掉與重複送出。電話用 tel、數字用 numeric，焦點保留 native outline。
- 新增表單每次變更同步保存至 sessionStorage，包括日期、可選欄位與 checkbox。key 包含版本、由權威 fleet scope 與 IAP principal 雜湊而成的 namespace、driver／vehicle 類型。還原時檢查欄位型別、移除未知屬性；不是 fixture 或服務端草稿的替代 API。
- 重整／離頁返回自動恢復；BFCache pageshow 亦重新套用草稿。儲存不可用時同一 SPA session 以 memory fallback 保留，重整／關頁另有原生 beforeunload 警告。既有同站側欄連結／頁首返回確認保留。
- POST 被拒絕或網路失敗時保留草稿；只有 API 成功建立後清除對應草稿並重設表單，再導航至回傳 submissionId。driver 成功不清 vehicle 草稿。
- 不修改供給 API、文件簽章、上傳或送審語意。詳細頁未儲存編輯的持久化不在本輪新增表單草稿恢復範圍。

## 可重跑驗證

在本 worktree 執行，未使用 `passWithNoTests`。以下最終驗證的 exit code 均為 0：

| 指令 | 結果 |
| --- | --- |
| `git diff --check` | 無 whitespace 錯誤 |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck` | Next route typegen 與 tsc 通過 |
| `pnpm --filter @drts/fleet-partner-portal-web build` | Webpack production build 通過 |
| `pnpm --filter @drts/fleet-partner-portal-web lint` | 通過 |
| `pnpm exec eslint tests/unit/system-remediation/sr-fleet-form-001/ --max-warnings=0` | 通過 |
| `node tools/ci/i18n-guard.mjs` | OK，520 files、55 既有 exemptions |
| `pnpm exec vitest run tests/unit/system-remediation/sr-fleet-form-001/` | 1 file、40 tests passed |

瀏覽器驗證使用上述 production build，啟動指令：

```sh
DRTS_FLEET_PARTNER_ID=sr-fleet-form-browser-test DRTS_API_URL=http://127.0.0.1:9 pnpm --filter @drts/fleet-partner-portal-web exec next start --hostname 127.0.0.1 --port 3317
CHROMIUM_EXECUTABLE=/home/lupin/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome node tests/unit/system-remediation/sr-fleet-form-001/browser-regression.mjs
```

Browser script exit 0、`result: passed`。可使用本機 Playwright 預設 browser（省略 CHROMIUM_EXECUTABLE）或指定已安裝 Chromium。驗證姓名→電話 Tab、Enter 提交、native required、13 個 driver controls 的 label、電話／數字 inputmode、native outline、重整／上一頁恢復、API 422 保留與成功清除、車輛 optional-only 草稿保留、切换 fleet header 不還原其他車行資料。viewport 包含 1280×900 及 390×844。

實際 computed label color `rgb(229, 234, 243)`，input surface `rgb(20, 27, 43)`；以 sRGB 相對亮度公式計算對比 **14.24:1**，修正前輪 evidence 未實測的 15.6:1 數字。

Resource IDs：`sr-fleet-form-browser-test`／`sr-fleet-form-other-test` 為本機測試 scope；`test-only-submission` 僅為 Playwright intercepted response ID。**Live resource ID: 無**，沒有呼叫或宣稱成功建立真供給資料。

## 檢查中發現及限制

- 首次 Turbopack dev 啟動 exit 1：isolated worktree 的 node_modules symlink 指向 filesystem root 外；未改共用設定。Webpack dev 可啟動，但 full-history back 有 Next router initialization／未 hydration 行為。改以 production build 驗證上述路徑通過；不宣稱已修好共用 Next dev runtime。
- 中途 browser assertion 曾因重複 alert 與未等待 hydration 失敗，已修正單一 alert 及恢復前 disabled；測試並未跳過失敗步驟。測試腳本 eslint 的 browser globals 亦已修正。
- Production 啟動會提示 `output: standalone` 應使用 standalone server；本次 `next start` 確實供應 production build 並通過測試，未將其當成部署驗證。build 的 middleware deprecation 為既有警告。
- 未做 live API／Cloud Run、同 candidate CI／merge／deploy、真機鍵盤、VoiceOver／NVDA／TalkBack 或全頁 axe 掃描。手機僅 Chromium viewport 與 inputmode，沒有宣稱真機通過。
- 草稿限同分頁的 session，沒有跨裝置／永久 localStorage 保存。memory fallback 無法跨整頁 reload 保留，依 beforeunload 提醒；實際瀏覽器仍可自行限制原生離頁對話框。
- Owner 僅交付可審查 candidate，普通 push 後 handoff Codex2；不呼叫 done。獨立 review、同 candidate CI／merge 與 acceptance 由 lifecycle 決定。
