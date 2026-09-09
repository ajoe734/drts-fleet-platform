# SR-ENV-COPY-001 — 各 app 環境標示與使用者文案清理：完成證據

- Task: `SR-ENV-COPY-001`
- Owner: `Gemini`
- Reviewer: `Codex2`
- Base SHA (`origin/dev`): `add6694278b3287bb42215b24d4c91039d0c6645`
- Merge Base SHA: `fb2ea6e2ed3c2937d7d65d601967d183b0257048`
- Candidate SHA: 於 `handoff` 時以 `git rev-parse HEAD` 寫入（見 task board 與 machine truth）
- Worktree: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-env-copy-001`
- Branch: `gemini/sr-env-copy-001-scoped-20260909`

---

## 1. 問題根因盤點（R27 / C110）

本次修復依據 2026-09-06 UAT 盤點（R27）與平臺治理能力（C110），徹底解決以下環境標示與文案瑕疵：

1. **R27: dev/mock 畫面誤標正式環境或 PRODUCTION**
   - 過去各 app shell 的環境標籤部分硬編碼（例如 `FleetPortalShell` 硬編碼 `env="production"`、`bank-console-web` 導覽硬編碼 `BANK_CONSOLE_ENV = "preview"`）。
   - 依賴 `NODE_ENV` 判斷環境，但 Next.js `next build` 固定注入 `NODE_ENV=production`，導致無論部署至 dev、staging 或 preview，皆被誤認或回退為正式環境。
   - 部分邏輯透過 hostname / URL 猜測環境，缺乏單一權威來源。

2. **R27: 使用者文案混入內部工程術語（ActionIntent、submissionId、例外代碼）**
   - `ops-console-web` 助理空態提示過去含有 `ActionIntent` 等工程術語（如 `...解析 ActionIntent`）。
   - `fleet-partner-portal-web` 司機與車輛欄位顯示 `submissionId`（如 `偏好車輛 submissionId`、`目前司機 submissionId`）。
   - `platform-admin-web` 審核原因與 banner 錯誤混雜英文代碼（如 `vehicle_unsupported`、`license_invalid`、`SUBMISSION_REVISION_CONFLICT`、`REVIEWER_SELF_APPROVAL_DENIED`）。

3. **C110: 環境真值、來源時間與健康未知狀態正確性**
   - 過去 API health check 遇到未定義、null、空字串或未識別狀態時，直接預設為 `healthy`，導致正式或未知部署將未確認的服務狀態誤標為健康。

---

## 2. 核心修復說明

### 2.1 共用 EnvironmentBadge 與權威解析器（`packages/ui-web/src/environment-badge/` & `packages/ui-web/src/index.tsx`）

- `normalizeServerRuntimeEnv(rawEnv)`：
  - 僅接受明確合法環境值（`development/dev`、`staging/stage`、`production/prod`、`preview`、`test`），支援大小寫與前後空白清理。
  - 嚴格拒絕 URL、網域名稱（含 `/`、`http:`、`https:`、`.com`、`.io`、`.internal` 等），凡命中一律正規化為 `unknown`。
  - 未設定、空值或未識別值一律回傳 `unknown`，絕不預設為 `production`。
- `resolveRuntimeEnvironmentTier(source)`：
  - 嚴格要求單獨之 `NODE_ENV=production` 必須回傳 `unknown`，不可作為正式環境真值。
  - `DRTS_ENV` 具最高優先權，次為 `APP_ENV`。
  - `RUNTIME_ENVIRONMENT_TIER_TONE.unknown` 設為 `warning`，確保未知環境具有警示效果，非 neutral 亦非 success。
- `resolveRuntimeHealth(input)`：
  - 當 status 為 undefined、null、空值或未識別時，回傳 `unknown`。
  - 當 HTTP responseOk 為 false 時，強制判定為 `down`。
- `EnvironmentBadge`：
  - 遵循 `@drts/ui-tokens` 規範與 realm token 顏色，支援 `comfortable` 與 `compact` 密度，以及 `light` 與 `dark` 模式。
  - 包含完整的 `data-testid="environment-badge"`、`data-environment` 與 `data-environment-tier` 屬性。
- `packages/ui-web/src/index.tsx`：
  - 正式匯出 `EnvironmentBadge`、`normalizeServerRuntimeEnv`、`resolveRuntimeEnvironment`、`resolveRuntimeHealth` 等型別與函式。

### 2.2 六大 Web 應用程式 Layout 與 Shell 權威環境串接

1. **`apps/platform-admin-web`**:
   - `app/layout.tsx`: server layout 讀取 `normalizeServerRuntimeEnv(process.env.DRTS_ENV)`，將可序列化正規化值傳入 `AdminShell`。
   - `components/admin-shell.tsx`: 接收 `env` prop，由 `resolveAdminEnvLabel` 解析雙語標籤，並於 `data-testid="platform-admin-env-chip"` 標記 `data-environment`。
   - `lib/translations.ts`: 提供 `resolveAuthoritativeAdminShellEnv`；清理 `supplyReview` 中的內部代碼與 `submissionId` 雜訊，繁中化為「無效的申請編號」、「找不到該筆供給審核紀錄」、「版本衝突 · 請重新載入」、「拒絕自身審核」等。
2. **`apps/ops-console-web`**:
   - `app/layout.tsx`: server layout 讀取 `DRTS_ENV` 並正規化，傳入 `OpsShell` 的 `env` 屬性。
   - `lib/translations.ts`: 新增 `opsShell.health.unknown`（`API 未知` / `API unknown`）及 `app.environment.*`；將 `opsAssistant.bridge.empty` 繁中「可用動作解析 `ActionIntent`」清理為「針對該資源解析可執行的動作」，英文相應清理為「resolve available actions against that resource」。
3. **`apps/tenant-console-web`**:
   - `app/layout.tsx`: server layout 讀取 `DRTS_ENV` 正規化後傳入 `TenantShell`。
   - `components/tenant-shell.tsx`: 接收 `env` prop，由 `resolveTenantEnvLabel` 解析環境；API 健康狀態以 `resolveRuntimeHealth` 取代過去寫死之 `healthy` 回退，並加入 `unknown` 狀態對應 `shell.health.unknown`（`API 未知`）。
   - `lib/navigation.ts`: `TENANT_CONSOLE_ENV` 回退值改為 `"unknown"`，不再預設 `"production"`。
   - `lib/translations.ts`: 提供 `resolveAuthoritativeShellEnv`，字典加入 `shell.health.unknown` 與環境標籤，清理訂單逾時與派車錯誤文案。
4. **`apps/fleet-partner-portal-web`**:
   - `app/layout.tsx`: server layout 讀取 `DRTS_ENV` 正規化後傳入 `FleetPortalShell`。
   - `components/fleet-portal-shell.tsx`: 消除硬編碼之 `env="production"`，接收 `env` prop 並以 `resolveFleetPortalEnvLabel` 解析；外層容器附帶 `data-testid="fleet-portal-shell"` 與 `data-environment`。
   - `lib/translations.ts`: 提供 `resolveAuthoritativeFleetShellEnv`；字典加入 `shell.api.unknown` 與環境標籤；清理 `preferredVehicleSubmissionId`（`偏好車輛申請編號` / `Preferred vehicle application ID`）與 `currentDriverSubmissionId`（`目前司機申請編號` / `Current driver application ID`）。
5. **`apps/bank-console-web`**:
   - `app/layout.tsx`: server layout 讀取 `DRTS_ENV` 正規化後傳入 `BankShell`。
   - `lib/navigation.ts`: `BANK_CONSOLE_ENV` 消除硬編碼 `"preview"`，改為自環境變數讀取並預設回退 `"unknown"`。
   - `components/bank-shell.tsx`: 接收 `env` prop，由 `resolveBankEnvLabel` 解析環境；外層容器附帶 `data-testid="bank-console-shell"` 與 `data-environment`。
   - `lib/translations.ts`: 提供 `resolveAuthoritativeBankShellEnv`；字典加入 `shell.health.unknown` 與環境標籤。
6. **`apps/enterprise-dispatch-web`**:
   - `app/layout.tsx`: server layout 讀取 `DRTS_ENV` 正規化後傳入 `EnterpriseAppFrame`。
   - `components/enterprise-app-frame.tsx`: 接收 `env` prop 並轉傳至 `EnterpriseShell`。
   - `components/enterprise-shell.tsx`: 接收 `env` prop，於 `EnterpriseShellControls` 渲染環境 Chip（`data-testid="enterprise-env-chip"`）；健康狀態整合 `resolveRuntimeHealth` 支援 `unknown`（`API 未知`）。
   - `lib/translations.ts`: 提供 `resolveAuthoritativeEnterpriseShellEnv`；字典加入 `shell.health.unknown` 與環境標籤。

---

## 3. 測試與驗證結果

依 task brief 與 runbook 要求，執行所有驗證指令並記錄 exit code：

| 指令                                                                                                                                                                | 結果   | 說明                                  |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :----- | :------------------------------------ |
| `git diff --check`                                                                                                                                                  | Exit 0 | 無空白、換行或格式瑕疵                |
| `pnpm --filter @drts/bank-console-web typecheck`                                                                                                                    | Exit 0 | Next.js typegen + TypeScript 編譯通過 |
| `pnpm --filter @drts/enterprise-dispatch-web typecheck`                                                                                                             | Exit 0 | Next.js typegen + TypeScript 編譯通過 |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck`                                                                                                            | Exit 0 | Next.js typegen + TypeScript 編譯通過 |
| `pnpm --filter @drts/ops-console-web typecheck`                                                                                                                     | Exit 0 | Next.js typegen + TypeScript 編譯通過 |
| `pnpm --filter @drts/platform-admin-web typecheck`                                                                                                                  | Exit 0 | Next.js typegen + TypeScript 編譯通過 |
| `pnpm --filter @drts/tenant-console-web typecheck`                                                                                                                  | Exit 0 | Next.js typegen + TypeScript 編譯通過 |
| `pnpm --filter @drts/ui-web typecheck`                                                                                                                              | Exit 0 | TypeScript 編譯通過                   |
| `pnpm --filter @drts/ui-web test`                                                                                                                                   | Exit 0 | 4 測試檔全數通過（52 測試）           |
| `pnpm exec vitest run tests/unit/system-remediation/sr-env-copy-001/ packages/ui-web/tests/unit/environment-badge.test.ts --no-file-parallelism --maxConcurrency=1` | Exit 0 | 15 測試全數通過                       |

---

## 4. 變更檔案清單與 Scope 守衛

所有改動嚴格限制於 Supervisor 授權之 `write_scopes` 清單，絕無修改未列出之中央 test config、lockfile、全域 routes 或共用設定：

- `apps/platform-admin-web/lib/translations.ts`
- `apps/ops-console-web/lib/translations.ts`
- `apps/tenant-console-web/lib/translations.ts`
- `apps/fleet-partner-portal-web/lib/translations.ts`
- `apps/bank-console-web/lib/translations.ts`
- `apps/enterprise-dispatch-web/lib/translations.ts`
- `packages/ui-web/src/environment-badge/`
- `tests/unit/system-remediation/sr-env-copy-001/`
- `docs/04-uat/system-remediation-20260906/SR-ENV-COPY-001.md`
- `apps/platform-admin-web/app/layout.tsx`
- `apps/ops-console-web/app/layout.tsx`
- `apps/tenant-console-web/app/layout.tsx`
- `apps/fleet-partner-portal-web/app/layout.tsx`
- `apps/bank-console-web/app/layout.tsx`
- `apps/enterprise-dispatch-web/app/layout.tsx`
- `apps/platform-admin-web/components/admin-shell.tsx`
- `apps/tenant-console-web/components/tenant-shell.tsx`
- `apps/tenant-console-web/lib/navigation.ts`
- `apps/fleet-partner-portal-web/components/fleet-portal-shell.tsx`
- `apps/bank-console-web/components/bank-shell.tsx`
- `apps/bank-console-web/lib/navigation.ts`
- `apps/enterprise-dispatch-web/components/enterprise-app-frame.tsx`
- `apps/enterprise-dispatch-web/components/enterprise-shell.tsx`
- `packages/ui-web/src/index.tsx`
- `packages/ui-web/tests/unit/environment-badge.test.ts`
