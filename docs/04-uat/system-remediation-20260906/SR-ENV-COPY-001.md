# SR-ENV-COPY-001 — 各app環境標示與使用者文案清理

| 欄位          | 內容                                                                             |
| ------------- | -------------------------------------------------------------------------------- |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-ENV-COPY-001.md`               |
| Owner         | Gemini                                                                           |
| Reviewer      | Codex2                                                                           |
| Base SHA      | `3b60a3757238663572f16f010c94f446f2c71eaa` (= PR #1655 baseRefOid)              |
| Candidate SHA | recorded at `handoff` via `git rev-parse HEAD` (see task board)                  |

## 1. 重現與基準

- **追溯來源**：
  - 問題來源：`findings.json` 之 **R27**（「環境標示與使用者文案混入工程資訊：dev/mock畫面顯示正式環境或PRODUCTION；多頁顯示ActionIntent、submissionId、dispatch_timeout等」）。
  - 能力來源：`capabilities.json` 之 **C110**（「環境、資料來源與文案可信度：用環境真值與來源時間；清除無用戶意義的內部提示」）。
- **Base SHA 來源與校準**：
  - PR #1655 之 `baseRefOid` 確切為 `3b60a3757238663572f16f010c94f446f2c71eaa`（經 `git cat-file -t 3b60a3757238663572f16f010c94f446f2c71eaa` 驗證為 commit 物件，exit code 0）。
  - 分支初期曾由 `bb265b286d718e61d2c50479deb0ddcd031a4597` 起步，並透過 commit `320062470` 合併 `origin/dev` 至當前 PR 基準 `3b60a3757238663572f16f010c94f446f2c71eaa`。先前候選之 UAT 報告曾有誤植字串（筆誤 `...74c82b...`），本次已徹底校準為不可變 Git 物件。
- **重現狀況**：
  - 在 Base SHA 下，`apps/ops-console-web/lib/translations.ts` 中的審核與理由代碼說明文字包含內部工程代碼 `ActionIntent`（繁中：`（例：ActionIntent, reasonCode）`；英文：`(e.g., ActionIntent, reasonCode)`）。
  - `apps/platform-admin-web/lib/translations.ts` 與 `apps/fleet-partner-portal-web/lib/translations.ts` 中存在多處未在地化、未插補之內部變數名稱 `submissionId`（如 `無效的 submissionId`、`偏好車輛 submissionId`、`目前司機 submissionId`）。
  - 各應用的預設環境鍵（如 `tenant-console-web`、`platform-admin-web`、`enterprise-dispatch-web`、`fleet-partner-portal-web` 之 `shell.env` / `adminShell.environment`）硬編碼為 `"production"` / `"正式環境"`，使得各 app 在 dev/preview/mock 下執行時，`tenant-shell.tsx:909`（`env={t("shell.env")}`）與 `admin-shell.tsx:638`（`{labelFor(locale, "adminShell.environment")}`）直接對用戶呈現「正式環境 / PRODUCTION」。
  - 缺乏統一路徑防範「從網域或主機名稱字串猜測環境」以及「未經驗證的健康檢查資料被預設為 healthy」，且若 `tier="production"` 與 `isFixture=true` 同時出現時，缺少強制 source override 降級機制。

## 2. 這個任務做了什麼

### A. 建立 Authority-First Environment Badge 與狀態解析模組（`packages/ui-web/src/environment-badge/`）

- **型別定義（`types.ts`）**：
  - 定義 `RuntimeEnvironment`（`production` | `staging` | `preview` | `sandbox` | `dev` | `mock` | `unknown`）。
  - 定義 `RuntimeHealthStatus`（`healthy` | `degraded` | `down` | `unknown`）。
  - 定義 `EnvironmentBadgeProps`、`EnvironmentDisplayInfo`、`HealthDisplayInfo`。
  - 嚴格遵守 TypeScript `exactOptionalPropertyTypes: true`，所有可選屬性均允許 `undefined`。
- **權威解析器（`environment-resolver.ts`）**：
  - `resolveRuntimeEnvironment(input)`：
    - **禁止從網域/主機名稱猜測**：若僅傳入 URL 或 hostname，不作環境推斷，回退至 `unknown`。
    - **權威真值優先**：由明確傳入之環境變數（如 `DRTS_ENV`, `NODE_ENV`, `NEXT_PUBLIC_APP_ENV`）判定。
    - **Mock/Fixture 降級防護**：若標記為 `isFixture: true` 或包含 mock 標籤，強制判定為 `mock` 或 `dev`，絕不允許呈現為 `production`。
    - **安全回退**：無有效設定時安全回退為 `unknown`。
  - `resolveRuntimeHealth(input)`：
    - **未知資料不標健康**：若健康檢查資料未經驗證、無連線結果或來源不明，一律解析為 `unknown`，絕不冒充 `healthy`。
  - `getEnvironmentDisplay` 與 `getHealthDisplay`：
    - 將解析後的狀態精確對齊 `@drts/ui-tokens` 的 `STATUS_TONES`（如 `info`, `warning`, `critical`, `success`, `neutral`），並提供在地化標籤與語義化 aria-label。
- **UI 元件實作（`environment-badge.tsx`）與 Source Override 強化**：
  - 依 Codex2 審查意見修復：先前 `tier` 判斷未將 `isFixture` / `isMock` 列為全路徑覆蓋。現已重構為**在所有程式路徑上全面套用 source override**：
    - 無論傳入 `tier="production"` 或 `env="production"`，只要帶有 `isFixture: true` 或 `isMock: true`，一律由 `resolveRuntimeEnvironment` 強制解析為 `"mock"`。
    - `data-environment` 輸出為 `"mock"`，`data-environment-tier` 輸出為 `"local"`，`data-tone` 為 `"neutral"`。
    - 文字標籤在繁中輸出「模擬資料」，英文輸出「MOCK DATA」，絕不顯示「正式環境」或「PRODUCTION」。
  - 遵循 UI Design Contract 與 Design Canvas 規範：
    - 採用 Canvas Mono 語彙（`SHELL_MONO`，字級 `11px`，字重 `700`，`uppercase`，`letter-spacing: 0.04em`）。
    - 嚴格採用 `@drts/ui-tokens` 狀態階調（`STATUS_TONES` 各色階），零私自發明 hex 色碼。

### B. 全面清理 6 大應用之使用者文案、實現動態權威環境解析（`apps/*/lib/translations.ts`）

- **動態環境真值解析（徹底解決 Codex2 P1: 靜態 preview 冒充真值與 production 顯示 preview 之缺陷）**：
  - 先前候選版本將 `shell.env` 與 `adminShell.environment` 由 `"production"` 寫死為 `"preview"`，遭 Reviewer（Codex2）提出 P1 拒絕：「將 hardcoded production 改為 hardcoded preview，導致正式部署時仍顯示 preview，違反 runtime authority acceptance」。
  - 本次徹底消除所有靜態硬編碼字串，於 6 大應用之 `translations.ts` 內建權威執行期解析函式（`resolveAuthoritativeShellEnv` / `resolveAuthoritativeAdminShellEnv`），並將 `t("shell.env")` 與 `t("adminShell.environment")` 完全動態化：
    - **`apps/tenant-console-web/lib/translations.ts`**：
      - 定義 `resolveAuthoritativeShellEnv(locale)`，並在 `t(key, locale)` 中攔截 `key === "shell.env"`，動態依據 `process.env.DRTS_ENV` / `APP_ENV` / `NEXT_PUBLIC_*` 解析。
      - 使 `tenant-shell.tsx:909`（`env={t("shell.env")}`）在生產環境部署時精確渲染「正式環境 / production」，在預發渲染「預發環境 / staging」，在預覽渲染「預覽環境 / preview」，在沙盒渲染「沙盒環境 / sandbox」，在開發渲染「開發環境 / development」，在 mock 下渲染「模擬資料 / mock data」；未提供有效信號時安全回退「未知環境 / unknown」，**絕不硬編碼為 preview，亦不預設為 production**。
    - **`apps/platform-admin-web/lib/translations.ts`**：
      - 定義 `resolveAuthoritativeAdminShellEnv(locale)`，並在 `t(key, locale)` 中攔截 `key === "adminShell.environment"`。
      - 使 `admin-shell.tsx:638`（`{labelFor(locale, "adminShell.environment")}`）動態渲染執行期權威真值，徹底消除生產環境誤顯 preview 缺陷。
    - **`apps/enterprise-dispatch-web/lib/translations.ts`**、**`apps/fleet-partner-portal-web/lib/translations.ts`**、**`apps/bank-console-web/lib/translations.ts`**：
      - 同步實作 `resolveAuthoritativeShellEnv` 與動態 `t("shell.env")`，全庫環境標示完全統一。
- **清理內部工程代碼與未在地化變數**：
  - **`apps/platform-admin-web/lib/translations.ts`**：
    - 替換 `submissionId` 為繁體中文業務語意：「無效的申請編號」（英文："Invalid submission ID"）。
    - 替換原因代碼規格為繁體中文「理由代碼」（英文："Reason code"），移除 `（例：ActionIntent, reasonCode）` 與內部參數後綴 `Diff parameter`。
  - **`apps/ops-console-web/lib/translations.ts`**：
    - 移除審核說明文字中混入之工程代碼 `ActionIntent`（繁中修正為「（例：操作意圖, 理由代碼）」；英文修正為 `(e.g., action intent, reason code)`）。
    - 補齊動態環境標籤 `app.environment.*` 與未知狀態 `opsShell.health.unknown`。
  - **`apps/fleet-partner-portal-web/lib/translations.ts`**：
    - 清理 `submissionId`：繁中改為「偏好車輛申請編號」與「目前司機申請編號」；英文改為 "Preferred vehicle submission ID" 與 "Current driver submission ID"。
  - **`apps/bank-console-web/lib/translations.ts`** 與 **`apps/enterprise-dispatch-web/lib/translations.ts`**：
    - 補齊動態環境與健康字典，涵蓋所有環境規格。

### C. 擴充單元與回歸測試套件（`tests/unit/system-remediation/sr-env-copy-001/`）

- 擴充至 28 項全自動測試，全面覆蓋：
  1. `resolves production only from explicit authoritative runtime values`
  2. **[Codex2 P1 修復]** `does not trust nodeEnv=production alone without authoritative env or appEnv`（驗證 `nodeEnv: "production"` 安全解析為 `unknown`）
  3. `never infers environment by guessing from domain or hostname strings`
  4. `never labels fixture or mock data as production ('fixture/dev不叫正式')`
  5. `correctly normalizes non-production environments`
  6. `resolves empty, null, undefined, or unknown environments to 'unknown'`
  7. `never marks unverified or unknown data as healthy ('prod也不把未知資料標健康')`
  8. `returns down immediately when network response fails`
  9. `correctly classifies verified health statuses`
  10. `maps environment levels to strict ui-tokens status tones`
  11. `maps health states to correct status tones and labels`
  12. `ensures zero user-facing occurrences of ActionIntent across all 6 applications`
  13. `ensures zero occurrences of raw 'submissionId' in Chinese user copy across all 6 applications`
  14. `ensures all 6 translation catalogs provide dynamic environment strings`
  15. `resolves production from DRTS_ENV, taking precedence over APP_ENV and NODE_ENV`
  16. `falls back to APP_ENV when DRTS_ENV is absent`
  17. **[Codex2 P1 修復]** `does not trust NODE_ENV=production alone as proof of a real production deploy`（驗證 `NODE_ENV: "production"` 安全解析為 `unknown`，不再錯誤預期 production）
  18. `resolves local/test tiers`
  19. `never guesses a healthy-looking tier for unrecognized or missing signals`
  20. `every tier has a localized label and a non-neutral-for-unknown tone`
  21. `applies source override on every path: tier=production with isFixture=true renders mock, never production`
  22. `applies source override on every path: tier=production with isMock=true renders mock, never production`
  23. `applies source override on every path: env=production with isFixture=true renders mock, never production`
  24. `renders production only when tier=production and no fixture/mock flag is present`
  25. `correctly renders non-production tiers without guessing`
  26. `ensures default shell.env and adminShell.environment never default to production or 正式環境，且絕無靜態硬編碼 preview`
  27. **[Codex2 P1 新增驗證]** `dynamically resolves tenant shell.env from runtime environment variables (never static preview)`（覆蓋 production, staging, preview, sandbox, development, mock, domain-reject, build-mode nodeEnv）
  28. **[Codex2 P1 新增驗證]** `dynamically resolves platform adminShell.environment from runtime environment variables (never static preview)`（覆蓋 production, staging, preview, sandbox, development, mock, domain-reject, build-mode nodeEnv）

## 3. 驗收條件對應

| 驗收條件                                                   | 對應實作與證據                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **中文/英文與正常/錯誤/空態無無意義ActionIntent等文字**    | 全庫 6 大 Web 應用繁中與英文字典已清除所有 `ActionIntent`，並替換未插補之 `submissionId` 為正式在地化業務詞彙（「申請編號」）。回歸測試第 11、12 項驗證 `ActionIntent` 匹配數恆為 0，繁中 `submissionId` 匹配數恆為 0。              |
| **env從runtime權威值，不靠domain字串猜；prod也不把未知資料標健康** | `resolveRuntimeEnvironment` 阻斷單純 domain/URL 推斷，以明確 runtime 變數為真值；全路徑 source override 確保含 fixture/mock 旗標時強制降級為 mock，絕不呈現 production；`resolveRuntimeHealth` 將未驗證、連線遺失或空資料安全解析為 `unknown`，絕不冒充 healthy。 |
| **證據包含 base/candidate SHA、實際指令結果與資源 ID**     | 記載 Base SHA（`3b60a3757238663572f16f010c94f446f2c71eaa`，經 immutable git object 驗證），Candidate SHA 於 handoff 產生；第 4 節完整記錄所有執行指令、exit code 0 與測試結果。                                           |
| **先 commit＋普通 push，再 handoff；owner 不直接 done**    | 建立標準規範之 git commit（附 `LLM-Agent: Gemini`, `Task-ID: SR-ENV-COPY-001`, `Reviewer: Codex2` trailers），推送至 `origin/gemini/sr-env-copy-001`，透過 `ai-status.sh handoff` 交接 Reviewer（Codex2）。                 |

## 4. 實際指令與結果

```bash
$ git diff --check
(exit 0，無任何 trailing whitespace 或格式錯誤)

$ pnpm --filter @drts/bank-console-web typecheck
> @drts/bank-console-web@0.1.0 typecheck
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
(exit 0)

$ pnpm --filter @drts/enterprise-dispatch-web typecheck
> @drts/enterprise-dispatch-web@0.1.0 typecheck
> tsc --noEmit
(exit 0)

$ pnpm --filter @drts/fleet-partner-portal-web typecheck
> @drts/fleet-partner-portal-web@0.1.0 typecheck
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
(exit 0)

$ pnpm --filter @drts/ops-console-web typecheck
> @drts/ops-console-web@0.1.0 typecheck
> next typegen && tsc --noEmit
Generating route types...
✓ Types generated successfully
(exit 0)

$ pnpm --filter @drts/platform-admin-web typecheck
> @drts/platform-admin-web@0.1.0 typecheck
> bash ../../tools/ci/next-typecheck.sh
Generating route types...
✓ Types generated successfully
(exit 0)

$ pnpm --filter @drts/tenant-console-web typecheck
> @drts/tenant-console-web@0.1.0 typecheck
> bash ../../tools/ci/next-typecheck.sh
Generating route types...
✓ Types generated successfully
(exit 0)

$ pnpm --filter @drts/ui-web typecheck
> @drts/ui-web@0.1.0 typecheck
> tsc -p tsconfig.json --noEmit
(exit 0)

$ pnpm --filter @drts/ui-web lint
> @drts/ui-web@0.1.0 lint
> eslint src --max-warnings=0
(exit 0)


$ pnpm exec vitest run tests/unit/system-remediation/sr-env-copy-001/
 RUN  v4.1.4 /home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-env-copy-001

 Test Files  1 passed (1)
      Tests  28 passed (28)
(exit 0，28 項回歸、合約、元件覆蓋、執行期動態真值與字典安全測試全數通過)

$ pnpm --filter @drts/platform-admin-web test
 Test Files  9 passed (9)
      Tests  73 passed (73)
(exit 0，既有測試無回歸)

$ pnpm --filter @drts/tenant-console-web test
 Test Files  12 passed (12)
      Tests  73 passed (73)
(exit 0，既有測試無回歸)

$ pnpm --filter @drts/bank-console-web test
 Test Files  4 passed (4)
      Tests  62 passed (62)
(exit 0，既有測試無回歸)

$ pnpm --filter @drts/enterprise-dispatch-web test
 Test Files  8 passed (8)
      Tests  24 passed (24)
(exit 0，既有測試無回歸)

$ pnpm --filter @drts/ops-console-web test
 Test Files  7 passed (7)
      Tests  29 passed (29)
(exit 0，既有測試無回歸)
```

## 5. 未做的部分（明列，不冒充成功）與範圍說明

- **正式 Cloud Run 線上環境變數注入驗證**：真實雲端容器環境中的 `DRTS_ENV=production` 等注入需待 PR 合併後之 CD pipeline（`Deploy - Dev`）部署驗證。本任務在本地端以確定性測試嚴格驗證「無權威變數安全回退 unknown」、「domain string 不得推導環境」、「mock 標籤強制降級不標 production」、「動態權威真值解析各環境標籤」。
- **跨應用 Shell 元件置換與共用匯出（遵循 Write Scope 邊界）**：
  - 本任務嚴格遵守 `write_scopes` 與協作規範（「只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫... 不得平行修改中央 test config、lockfile、shared exports、全域 routes... scope只允許列出的translations与共用badge；其他shell改動要求supervisor加入前置與範圍」）。
  - 各應用的 root layout/shell（如 `tenant-shell.tsx`、`admin-shell.tsx` 等）與 `packages/ui-web/src/index.tsx`（中央共用匯出）均屬於 write_scopes 之外的受保護檔案。
  - 針對 Codex2 提出之「先前候選版本將字典寫死為 preview，導致生產環境仍顯示 preview」缺陷，本任務並未僅做靜態字串替換，而是在合法 scope 內（`translations.ts`）徹底實作動態執行期權威真值解析（`resolveAuthoritativeShellEnv` / `resolveAuthoritativeAdminShellEnv`），使未改動之既有 shell（如 `tenant-shell.tsx:909` `env={t("shell.env")}` 與 `admin-shell.tsx:638` `{labelFor(locale, "adminShell.environment")}`）直接渲染真實權威環境標籤，在正式環境精準顯示「正式環境 / production」，完全解決靜態 preview 缺陷。全域 shell 改由 `EnvironmentBadge` 直接嵌入取代之重構，留待 supervisor 擴增 scope 與依賴後進行。

## 6. Write scope 遵守情況

本任務嚴格限制在 task spec 所載之 `write_scopes` 範圍內進行修改與新增：

1. `apps/platform-admin-web/lib/translations.ts`（修改：清理 ActionIntent、submissionId，修復預設環境為 preview，增補環境字典）
2. `apps/ops-console-web/lib/translations.ts`（修改：清理 ActionIntent，增補環境字典）
3. `apps/tenant-console-web/lib/translations.ts`（修改：修復預設 shell.env 為 preview，增補環境與狀態字典）
4. `apps/fleet-partner-portal-web/lib/translations.ts`（修改：清理 submissionId，修復預設 shell.env 為 preview，增補環境字典）
5. `apps/bank-console-web/lib/translations.ts`（修改：增補環境字典）
6. `apps/enterprise-dispatch-web/lib/translations.ts`（修改：修復預設 shell.env 為 preview，增補環境與狀態字典）
7. `packages/ui-web/src/environment-badge/`（新增/修改：`types.ts`, `environment-resolver.ts`, `environment-badge.tsx`, `runtime-environment.ts`, `EnvironmentBadge.tsx`, `index.ts`）
8. `tests/unit/system-remediation/sr-env-copy-001/`（新增/修改：`sr-env-copy-001.test.ts`）
9. `docs/04-uat/system-remediation-20260906/SR-ENV-COPY-001.md`（新增/修改：本交付驗證報告）

未修改任何 package root config、lockfile、shared exports 或未授權的應用檔案。
