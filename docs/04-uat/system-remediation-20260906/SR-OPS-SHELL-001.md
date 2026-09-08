# SR-OPS-SHELL-001 — 營運助理遮擋與跨app導航

| 欄位          | 內容                                                                  |
| ------------- | --------------------------------------------------------------------- |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-OPS-SHELL-001.md`     |
| Owner         | Codex2（從 Claude2 保存的遠端候選恢復）                                  |
| Reviewer      | Claude                                                                 |
| Base SHA      | `70355aba97c23dd1cd592b71f1d3dfe6315d91ff`（本次 recovery 時的 `origin/dev` tip） |
| Candidate SHA | 以 `ai-status.sh handoff` 鎖定的 exact `git rev-parse HEAD`（task board machine truth） |

## 1. 重現與基準

- **追溯來源**：
  - 問題來源：`findings.json` 之 **R18**（「跨系統稽核連結導至錯誤位置：關閉助理後點跨app audit，新視窗到ops域/platform-admin/audit，404」）與 **R19**（「預設助理遮擋工作控制項：助理開啟時audit連結點擊10秒皆被pointer事件攔截；正常關閉後可點」）。
  - 能力來源：`capabilities.json` 之 **C048**。
- **Base SHA**：`70355aba97c23dd1cd592b71f1d3dfe6315d91ff`（本次 recovery 時的 `origin/dev`）。此 SHA 下本任務所述缺陷仍可由原始碼靜態重現（非歷史觀察，見下）；未被其他任務修復。

### R19（預設遮擋）根因

`components/ops-assistant/assistant-widget.tsx` 的 `buildDefaultState()`（修復前）在**任何**頁面、對**任何**尚未有 localStorage 偏好紀錄的操作員，一律以 `closed: false`、`minimized: false`、寬 420px／高 360px、右下角靠邊（`docked: "right"`）渲染。此浮動面板以 `position: fixed` 疊在文件流之上、`zIndex: 5000`，會覆蓋任何恰好落在畫面右下角的控制項（例如稽核佇列調度頁的 `/audit ↗` 連結、或其他頁面右下角固定按鈕），且使用者必須先手動關閉才能點擊被壓住的內容——這正是 R19「10 秒皆被攔截，關閉後可點」的行為模式。此外 `buildDefaultState()` 未依視口寬度限制初始 `width`，390px 行動裝置版面在首次渲染會產生比視口更寬的面板。

### R18（audit 連結 404）根因

`ops-console-web` 沒有任何 `/audit` 路由（僅 `platform-admin-web/app/audit` 有此頁面；見 `packages/contracts/src/ui-runtime.ts` `ActionReceipt` 註解：稽核連結應是「a `CrossAppResourceLink` to the owning app's `/audit?auditId=…`」）。修復前 `assistant-widget.tsx` 的 `appendReceipt()` 於 `receipt.auditHref` 未提供時，回退為同源相對路徑 `` `/audit?auditId=${auditId}` ``，會在 ops-console 自己的網域下 404（`ops域/…/audit` 404，對應 R18 敘述）。本 repo 既有的跨 app 連結慣例（`apps/ops-console-web/lib/ops-cross-app-links.ts`、`apps/roc-console-web/lib/roc-cross-app-links.ts`）皆以 `_apps/platform-admin` 為預設 base（可由 `NEXT_PUBLIC_PLATFORM_ADMIN_URL` / `DRTS_PLATFORM_ADMIN_URL` 覆寫），但 widget 自己的 fallback 從未套用此慣例。

**範圍界線（誠實聲明）**：R18 的 UAT 重現步驟描述的是 `/dispatch` 頁面右下角常駐的 `/audit ↗` pill（`app/dispatch/page.tsx` 的 `buildPlatformAdminHref("/audit")`），以及 `app/complaints/page.tsx`、`app/incidents/[incidentId]/page.tsx` 各自本地建構的 `auditHref`——這三個檔案都各自重複實作了一份（有瑕疵的）platform-admin base URL 解析，且**都不在本任務 write_scopes 內**（`apps/ops-console-web/components/ops-assistant/` 與 `ops-shell.tsx` 之外）。本任務僅修復 write_scopes 內、assistant widget 自身唯一擁有的 audit 連結路徑（`appendReceipt()` 的 fallback，用於 §6.1 設計手冊定義的 `AssistantActionReceipt.auditHref` 未提供時的補位），這是一個真實、獨立可驗證的缺陷，但**不等於**已經修好 dispatch/complaints/incidents 三頁各自的重複實作。三頁的修復需要 supervisor 擴大 scope 或另立 task（例如集中到一份共用的 cross-app-link 解析模組）。

## 2. 這個任務做了什麼

所有變更僅落在 `apps/ops-console-web/components/ops-assistant/`：

### A. 抽出純函式幾何模組 `widget-geometry.ts`（新增）

將原本內嵌於 `assistant-widget.tsx` 的 `clamp` / `clampRect` / `resolveDockedPosition` / `buildDefaultState` / `readStoredState` / `writeStoredState` 抽成無 DOM 依賴、無 `@/` alias 匯入（僅相對匯入）的純函式模組，讓根目錄 vitest（其 `@` alias 僅指向 `apps/tenant-console-web`，見 `vitest.config.ts`）能直接匯入驗證，不需經由完整元件渲染。

**行為修復（R19）**：`buildDefaultState()` 的 `closed` 預設值由 `false` 改為 `true`——首次造訪、尚無 localStorage 偏好時，助理僅顯示右下角小型 launcher 按鈕，不會自動展開 420×360 面板蓋住任何頁面控制項。已有明確偏好的回訪使用者（`readStoredState()` 讀到完整紀錄）行為不變。同時修正 `buildDefaultState()`，使初始 `width` / `height` 直接依視口 clamp（不再固定 420×360 後才等 `useEffect` 補救），避免 390px 行動視口首次渲染出現比畫面更寬的面板。

### B. 抽出純函式稽核連結解析 `audit-link.ts`（新增）

`resolveAssistantAuditHref(explicitHref, auditId)`：若後端已提供 `auditHref` 原樣採用；否則改用既有的 `crossAppHref()`（`lib/ops-cross-app-links.ts`，唯讀匯入、未修改該檔）建構 `targetApp: "platform-admin"` 的 `/audit?auditId=…` 連結，套用與 `roc-cross-app-links.ts` 一致的 `_apps/platform-admin` 慣例與環境變數覆寫，取代原本會 404 的同源相對路徑 fallback。

### C. `assistant-widget.tsx`：改用上述純函式 + 鍵盤焦點返回

- `appendReceipt()` 的 `auditHref` 改呼叫 `resolveAssistantAuditHref()`。
- 新增「支援關閉/鍵盤焦點返回」（execution prompt 明文要求）：面板從開啟→關閉時，焦點移回 launcher 按鈕；從關閉→開啟時，焦點移入面板頂端可聚焦的拖曳把手（`ops-assistant-drag-handle`，本已有 `tabIndex={0}`）。僅在使用者主動切換狀態時觸發，**不會**在首次掛載或從 localStorage 還原既有狀態時搶奪焦點（以 `previousClosedRef` 只在偵測到真實 open↔close 轉換時才 `.focus()`）。

## 3. 驗收條件對應

| 驗收條件                                             | 對應實作與證據                                                                                                                                                                                     |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **audit新分頁到平台正確URL非ops404**                   | `resolveAssistantAuditHref()` fallback 由同源 `/audit?...`（ops 域 404）改為 `crossAppHref({targetApp:"platform-admin", route:"/audit?auditId=…"})` → 預設 `/_apps/platform-admin/audit?auditId=…`，並保留環境變數覆寫。回歸測試見 §4。範圍界線見 §1（dispatch/complaints/incidents 三頁各自重複實作不在本任務 write_scopes 內，未修改）。 |
| **1440/390px核心CTA可按，開關助理與重載保留合理版面** | `buildDefaultState()` 預設 `closed: true`，助理不再預設遮蔽任何頁面控制項；1440px 與 390px 視口下 `resolveDockedPosition` / `clampRect` 皆保證面板不超出可視範圍（回歸測試見 §4）。開/關/重載的既有拖曳、最小化、位置持久化（`readStoredState`/`writeStoredState`）邏輯未變動，僅預設值與初始 clamp 時序修正。 |
| **證據包含 base/candidate SHA、實際指令結果與資源 ID** | 見表頭與 §4；未做的 live／真機與 out-of-scope 部分見 §1 範圍界線與 §5。                                                                                                                          |
| **先 commit＋普通 push，再 handoff；owner 不直接 done** | 依 `AI_COLLABORATION_GUIDE.md` 流程執行：commit → push → `ai-status.sh handoff` 交給 Reviewer（Claude）。                                                                                        |

## 4. 實際指令與結果

```bash
$ git diff --check
(exit 0，無 trailing whitespace 或格式錯誤)

$ pnpm exec vitest run tests/unit/system-remediation/sr-ops-shell-001/
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex2-sr-ops-shell-001

 Test Files  1 passed (1)
      Tests  13 passed (13)
   Duration  344ms
(exit 0，13 個單元測試全數通過：R19 預設關閉與 390/1440px clamp 各 6 項、R18 audit href fallback 與 env override 各 5 項、localStorage round-trip 2 項)

$ pnpm --filter @drts/ops-console-web typecheck
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
(exit 0)
```

## 5. 未做的部分（明列，不冒充成功）

- **dispatch/complaints/incidents 三頁各自的 audit／platform-admin 連結重複實作**：`app/dispatch/page.tsx`（`buildPlatformAdminHref`，預設 base 為 `/platform-admin` 而非 `_apps/platform-admin`）、`app/complaints/page.tsx`、`app/incidents/[incidentId]/page.tsx`（`buildCrossAppHref`，無 base URL 環境變數時退回裸相對路徑）皆有與本任務修復的 widget fallback 相同類別的缺陷，但都不在本任務 `write_scopes` 內，未修改。建議另立 task 或由 supervisor 擴大 scope，集中到單一共用的 cross-app link 解析模組。
- **真機／瀏覽器手動驗證**（實際开启 1440px/390px 瀏覽器視窗、目視確認 launcher 與 audit 連結互不遮擋）：未執行，僅有純函式層級（geometry clamp、href 解析）之單元回歸測試佐證；无法在此環境啟動瀏覽器做視覺驗證。

## 6. Write scope 遵守情況

本任務僅在指定的 `write_scopes` 範圍內新增與修改檔案：

1. `apps/ops-console-web/components/ops-assistant/assistant-widget.tsx`（修改：改用抽出的純函式模組、修正 auditHref fallback、新增鍵盤焦點返回）
2. `apps/ops-console-web/components/ops-assistant/widget-geometry.ts`（新增：純函式面板幾何模組，預設 `closed: true`）
3. `apps/ops-console-web/components/ops-assistant/audit-link.ts`（新增：純函式 audit 連結解析，唯讀匯入既有 `lib/ops-cross-app-links.ts`）
4. `tests/unit/system-remediation/sr-ops-shell-001/sr-ops-shell-001.test.ts`（新增：13 項回歸測試）
5. `docs/04-uat/system-remediation-20260906/SR-OPS-SHELL-001.md`（新增：本驗收與交付報告）

未修改任何共用 config、lockfile、routes、`ops-cross-app-links.ts`（僅唯讀匯入其匯出的 `crossAppHref`）或未授權檔案（`ops-shell.tsx` 經檢視未發現本任務範圍內可獨立修復之缺陷，故未變動其內容）。
