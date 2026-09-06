# SR-ENV-COPY-001 — 各app環境標示與使用者文案清理

| 欄位          | 內容                                                                             |
| ------------- | -------------------------------------------------------------------------------- |
| Task spec     | `docs/03-runbooks/system-remediation-20260906/SR-ENV-COPY-001.md`               |
| Owner         | Gemini                                                                           |
| Reviewer      | Claude                                                                           |
| Base SHA      | `bb265b286d718e61d2c50479deb0ddcd031a4597` (= `origin/dev` tip at task start)  |
| Candidate SHA | recorded at `handoff` via `git rev-parse HEAD` (see task board)                  |

## 1. 重現與基準

- **追溯來源**：
  - 問題來源：`findings.json` 之 **R27**（「環境標示與使用者文案混入工程資訊：dev/mock畫面顯示正式環境或PRODUCTION；多頁顯示ActionIntent、submissionId、dispatch_timeout等」）。
  - 能力來源：`capabilities.json` 之 **C110**（「環境、資料來源與文案可信度：用環境真值與來源時間；清除無用戶意義的內部提示」）。
- **Base SHA**：`bb265b286d718e61d2c50479deb0ddcd031a4597`（當前 `origin/dev`）。
- **重現狀況**：
  - 在 Base SHA 下，`apps/ops-console-web/lib/translations.ts` 中的審核與理由代碼說明文字包含內部工程代碼 `ActionIntent`（繁中：`（例：ActionIntent, reasonCode）`；英文：`(e.g., ActionIntent, reasonCode)`）。
  - `apps/platform-admin-web/lib/translations.ts` 與 `apps/fleet-partner-portal-web/lib/translations.ts` 中存在多處未在地化、未插補之內部變數名稱 `submissionId`（如 `無效的 submissionId`、`偏好車輛 submissionId`、`目前司機 submissionId`）。
  - `apps/tenant-console-web/lib/translations.ts` 的繁體中文字典中，環境標籤 `shell.env` 被硬編碼為英文 `"production"`，且各 app 缺少統一結構化的環境真值解析。
  - 缺乏統一路徑防範「從網域或主機名稱字串猜測環境」以及「未經驗證的健康檢查資料被預設為 healthy」，導致 mock/fixture 模式可能被錯誤標示為 production。

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
- **UI 元件實作（`environment-badge.tsx`）**：
  - 遵循 UI Design Contract 與 Design Canvas 規範。
  - 採用 Canvas Mono 語彙（`SHELL_MONO`，字級 `11px`，字重 `700`，`uppercase`，`letter-spacing: 0.05em`）。
  - 嚴格採用 `@drts/ui-tokens` 狀態階調（`STATUS_TONES.info` 等背景、邊框與文字色彩），零私自發明 hex 色碼。
  - 支援健康指示點（dot indicator）與提示標籤（tooltip/title）。

### B. 全面清理 6 大應用之使用者文案與字典（`apps/*/lib/translations.ts`）

- **`apps/platform-admin-web/lib/translations.ts`**：
  - 替換 `submissionId` 為繁體中文業務語意：「無效的申請編號」（英文："Invalid submission ID"）。
  - 替換原因代碼規格為繁體中文「理由代碼」（英文："Reason code"），移除 `（例：ActionIntent, reasonCode）` 與內部參數後綴 `Diff parameter`。
  - 擴充 `adminShell.environment.*`（`production`、`staging`、`preview`、`sandbox`、`dev`、`mock`、`unknown`）之中英文對照。
- **`apps/ops-console-web/lib/translations.ts`**：
  - 移除審核說明文字中混入之工程代碼 `ActionIntent`（繁中修正為「（例：操作意圖, 理由代碼）」；英文修正為 `(e.g., action intent, reason code)`）。
  - 補齊動態環境標籤 `app.environment.*` 與未知狀態 `opsShell.health.unknown`。
- **`apps/tenant-console-web/lib/translations.ts`**：
  - 修復繁體中文下硬編碼之英文 `"production"` 為「正式環境」。
  - 擴充 `shell.env.*`、`app.environment.*`、`shell.health.unknown`。
  - 補齊派車逾時等狀態文案（`status.order.dispatch_timeout` 等）。
- **`apps/fleet-partner-portal-web/lib/translations.ts`**：
  - 清理 `submissionId`：繁中改為「偏好車輛申請編號」與「目前司機申請編號」；英文改為 "Preferred vehicle submission ID" 與 "Current driver submission ID"。
  - 擴充 `shell.env.*`、`app.environment.*`、`shell.api.unknown`。
- **`apps/bank-console-web/lib/translations.ts`**：
  - 補齊動態環境字典 `shell.env.*` 與 `app.environment.*`。
- **`apps/enterprise-dispatch-web/lib/translations.ts`**：
  - 補齊動態環境字典 `shell.env.*`、`app.environment.*` 與 `shell.health.unknown`。

### C. 新增專屬單元與回歸測試套件（`tests/unit/system-remediation/sr-env-copy-001/`）

- 新增 `tests/unit/system-remediation/sr-env-copy-001/sr-env-copy-001.test.ts`，包含 13 個全面測試：
  1. `rejects guessing environment from domain or host string alone`
  2. `resolves environment from authoritative runtime environment variable`
  3. `strictly suppresses production labeling when fixture mode or mock flag is active`
  4. `falls back to unknown environment when no authoritative configuration exists`
  5. `rejects labeling unverified or missing health data as healthy`
  6. `resolves healthy status when explicitly verified and successful`
  7. `maps environments and health states to valid @drts/ui-tokens STATUS_TONES`
  8. `verifies zero occurrences of ActionIntent in any translations across all 6 applications`
  9. `verifies zero un-interpolated raw submissionId occurrences in Chinese user copy across all 6 applications`
  10. `verifies complete environment key coverage in platform-admin-web`
  11. `verifies complete environment key coverage in ops-console-web`
  12. `verifies complete environment key coverage in tenant-console-web`
  13. `verifies complete environment key coverage in fleet-partner, bank, and enterprise web applications`

## 3. 驗收條件對應

| 驗收條件                                                   | 對應實作與證據                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **中文/英文與正常/錯誤/空態無無意義ActionIntent等文字**    | 全庫 6 大 Web 應用繁中與英文字典已清除所有 `ActionIntent`，並替換未插補之 `submissionId` 為正式在地化業務詞彙（「申請編號」）。回歸測試驗證 `ActionIntent` 匹配數恆為 0，繁中 `submissionId` 匹配數恆為 0。              |
| **env從runtime權威值，不靠domain字串猜；prod也不把未知資料標健康** | `resolveRuntimeEnvironment` 阻斷單純 domain/URL 推斷，以明確 runtime 變數為真值；若含 fixture/mock 旗標強制降級，絕不呈現 production；`resolveRuntimeHealth` 將未驗證、連線遺失或空資料安全解析為 `unknown`，絕不冒充 healthy。 |
| **證據包含 base/candidate SHA、實際指令結果與資源 ID**     | 記載 Base SHA（`bb265b286d718e61d2c50479deb0ddcd031a4597`），Candidate SHA 於 handoff 產生；第 4 節完整記錄所有執行指令、exit code 0 與測試結果。                                                                           |
| **先 commit＋普通 push，再 handoff；owner 不直接 done**    | 建立標準規範之 git commit（附 `LLM-Agent: Gemini`, `Task-ID: SR-ENV-COPY-001`, `Reviewer: Claude` trailers），推送至 `origin/gemini/sr-env-copy-001`，透過 `ai-status.sh handoff` 交接 Reviewer（Claude）。                |

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

$ pnpm exec vitest run tests/unit/system-remediation/sr-env-copy-001/
 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-env-copy-001

 Test Files  1 passed (1)
      Tests  13 passed (13)
   Duration  593ms
(exit 0，13 項回歸測試全數通過)

$ pnpm --filter @drts/platform-admin-web test
 Test Files  9 passed (9)
      Tests  73 passed (73)
(exit 0，既有測試無回歸)

$ pnpm --filter @drts/ops-console-web test
 Test Files  7 passed (7)
      Tests  29 passed (29)
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
```

## 5. 未做的部分（明列，不冒充成功）

- **正式 Cloud Run 線上環境變數注入驗證**：真實雲端容器環境中的 `DRTS_ENV=production` 等注入需待 PR 合併後之 CD pipeline（`Deploy - Dev`）部署驗證。本任務在本地端以確定性測試嚴格驗證「無權威變數安全回退 unknown」、「domain string 不得推導環境」、「mock 標籤強制降級不標 production」。
- **全域 Shell 版面置換**：本任務依據 `write_scopes` 限制，僅修改 6 個應用的 `lib/translations.ts` 並建立共用 `packages/ui-web/src/environment-badge/` 模組。各應用 root layout / header 元件（如 `admin-shell.tsx`, `ops-shell.tsx` 等）之實體引入留待後續 UI Shell 整合任務進行，避免跨 scope 修改共用佈局檔案。

## 6. Write scope 遵守情況

本任務嚴格限制在 task spec 所載之 `write_scopes` 範圍內進行修改與新增：

1. `apps/platform-admin-web/lib/translations.ts`（修改：清理 ActionIntent、submissionId，增補環境字典）
2. `apps/ops-console-web/lib/translations.ts`（修改：清理 ActionIntent，增補環境字典）
3. `apps/tenant-console-web/lib/translations.ts`（修改：清理 production 硬編碼，增補環境與狀態字典）
4. `apps/fleet-partner-portal-web/lib/translations.ts`（修改：清理 submissionId，增補環境字典）
5. `apps/bank-console-web/lib/translations.ts`（修改：增補環境字典）
6. `apps/enterprise-dispatch-web/lib/translations.ts`（修改：增補環境與狀態字典）
7. `packages/ui-web/src/environment-badge/`（新增：`types.ts`, `environment-resolver.ts`, `environment-badge.tsx`, `index.ts`）
8. `tests/unit/system-remediation/sr-env-copy-001/`（新增：`sr-env-copy-001.test.ts`）
9. `docs/04-uat/system-remediation-20260906/SR-ENV-COPY-001.md`（新增：本交付驗證報告）

未修改任何 package root config、lockfile、shared exports 或未授權的應用檔案。
