# SR-ENV-COPY-001 — 各 app 環境標示與使用者文案清理 驗證與修復報告

- Task ID: `SR-ENV-COPY-001`
- Owner: `Gemini2`
- Reviewer: `Claude`
- Worktree: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-sr-env-copy-001`
- Branch: `gemini2/sr-env-copy-001-v2`
- Base SHA: `6a2b7dabf` (`origin/dev`)
- Planning Ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json` (C110)
- Audit Ref: `docs/04-uat/system-remediation-20260906/source/findings.json` (R27)

---

## 1. 問題背景與重現

依據 R27 / C110 及 Supervisor 2026-09-10 指派指示：

1. **環境變數真值 (Authority)**：原多個前端應用存在以 domain/URL 字串推測環境、將 `NODE_ENV=production` 或 build-time 常數誤當作正式環境、或在缺值時預設標為 `production` 的問題。應由 server dynamic layout 讀取 runtime `DRTS_ENV`，並使用 `normalizeServerRuntimeEnv` 進行嚴格正規化後傳遞給 Client Shell；缺值或未識別值必須顯示 `unknown`（繁中為「未知環境」），fixture/dev 絕不標為 production。
2. **健康狀態判定 (Health Status)**：
   - 原 `apps/platform-admin-web/components/admin-shell.tsx`、`apps/ops-console-web/components/ops-health-footer.tsx` 及 `apps/fleet-partner-portal-web/components/fleet-portal-health-footer.tsx` 在收到 HTTP 200 但 payload 缺值或為不識別字串時，皆存在 `String(value ?? "healthy")` 回退預設為 `healthy` 的缺陷。
   - 本輪經 Supervisor 明確授權加入 `ops-health-footer.tsx` 與 `fleet-portal-health-footer.tsx` 兩檔，統一使用 `@drts/ui-web` 的 `resolveRuntimeHealth`，將未驗證或未知 payload 正確解析為 `unknown`（繁中為「API 未知」），並以中性 neutral theme token 呈現，保留 checking/healthy/degraded/down 現有狀態與 HTTP 失敗優先權。
3. **使用者可見文案清理 (User Copy Cleanup)**：
   - 清理各 app 翻譯字典中的內部工程術語，包括 `ActionIntent`、`submissionId`、`REVIEWER_SELF_APPROVAL_DENIED`、雙語 diff 混雜標籤等。
4. **獨立依賴隔離**：
   - 本工作區依 Supervisor 指示採用完全隔離的 worktree-local 依賴樹（`pnpm install --frozen-lockfile`），不使用跨 worktree 或 canonical root 的 symlink。

---

## 2. 異動範圍與實作摘要 (Write Scopes)

### A. 環境標示與權威解析模組 (`packages/ui-web`)

- `packages/ui-web/src/environment-badge/types.ts`: 定義 `RuntimeEnvironment`、`AuthoritativeRuntimeEnv`、`RuntimeHealthStatus` 等類型。
- `packages/ui-web/src/environment-badge/runtime-environment.ts`: 提供 `resolveRuntimeEnvironmentTier`，嚴格判定 tier，拒絕由 URL/domain 推斷，拒絕將 `NODE_ENV=production` 視為正式部署。
- `packages/ui-web/src/environment-badge/environment-resolver.ts`:
  - `normalizeServerRuntimeEnv`: 伺服端 `DRTS_ENV` 正規化（合法值：development, staging, production, preview, test；其他/URL/空值一律 unknown）。
  - `resolveRuntimeEnvironment`: 判定權威環境，fixture/mock 絕不標示為 production。
  - `resolveRuntimeHealth`: 解析 API 健康狀態，缺值/未識別狀態回傳 `unknown`，HTTP 失敗優先回傳 `down`。
  - `getEnvironmentDisplay` / `getHealthDisplay`: 提供 realm/status tokens 對應樣式與雙語標籤。
- `packages/ui-web/src/environment-badge/environment-badge.tsx` / `EnvironmentBadge.tsx` / `index.ts`: UI 元件與相容匯出。
- `packages/ui-web/src/index.tsx`: 統一匯出上述 badge 及 resolver API。

### B. 六大應用伺服端 Layout 與 Client Shell 接線

- 六個 dynamic server layouts 統一自 `process.env.DRTS_ENV` 讀取並透過 `normalizeServerRuntimeEnv` 傳入 shell：
  - `apps/platform-admin-web/app/layout.tsx` -> `AdminShell`
  - `apps/ops-console-web/app/layout.tsx` -> `OpsShell`
  - `apps/tenant-console-web/app/layout.tsx` -> `TenantShell`
  - `apps/fleet-partner-portal-web/app/layout.tsx` -> `FleetPortalShell`
  - `apps/bank-console-web/app/layout.tsx` -> `BankShell`
  - `apps/enterprise-dispatch-web/app/layout.tsx` -> `EnterpriseAppFrame` / `EnterpriseShell`
- Client Shells 及 Navigation 常數停止讀取 build-time / ambient env 變數，支援 `data-environment` 屬性與 `unknown` 狀態本地化顯示：
  - `apps/platform-admin-web/components/admin-shell.tsx`
  - `apps/tenant-console-web/components/tenant-shell.tsx`
  - `apps/tenant-console-web/lib/navigation.ts`
  - `apps/fleet-partner-portal-web/components/fleet-portal-shell.tsx`
  - `apps/bank-console-web/components/bank-shell.tsx`
  - `apps/bank-console-web/lib/navigation.ts`
  - `apps/enterprise-dispatch-web/components/enterprise-app-frame.tsx`
  - `apps/enterprise-dispatch-web/components/enterprise-shell.tsx`

### C. 健康狀態 Footer 修正 (Supervisor 授權擴增)

- `apps/ops-console-web/components/ops-health-footer.tsx`:
  - 引入 `resolveRuntimeHealth`，修正原未識別 payload 誤標為 healthy 的缺陷。
  - 新增 `unknown` 狀態顯示（`opsShell.health.unknown`，使用中性 theme 標示）。
- `apps/fleet-partner-portal-web/components/fleet-portal-health-footer.tsx`:
  - 引入 `resolveRuntimeHealth`，修正原未識別 payload 誤標為 healthy 的缺陷。
  - 新增 `unknown` 狀態顯示（`shell.api.unknown`，使用中性 theme 標示）。

### D. 翻譯模組文案清理

- `apps/platform-admin-web/lib/translations.ts`
- `apps/ops-console-web/lib/translations.ts`
- `apps/tenant-console-web/lib/translations.ts`
- `apps/fleet-partner-portal-web/lib/translations.ts`
- `apps/bank-console-web/lib/translations.ts`
- `apps/enterprise-dispatch-web/lib/translations.ts`
- 清理 `ActionIntent`、`submissionId`、`REVIEWER_SELF_APPROVAL_DENIED`，補齊 `app.environment.*` 與 `*.health.unknown` 雙語字串。

### E. 單元測試與回歸套件

- `tests/unit/system-remediation/sr-env-copy-001/sr-env-copy-001.test.ts`:
  - 驗證 `normalizeServerRuntimeEnv`、`resolveRuntimeEnvironmentTier`、`resolveRuntimeHealth`。
  - 驗證六個 app layout 與 shell 的串接、testid 與 `data-environment`。
  - 驗證各翻譯字典無 `ActionIntent` 等工程術語。
- `tests/unit/system-remediation/sr-env-copy-001/admin-health.test.ts`:
  - 以 TypeScript AST 實際讀取並測試 `admin-shell.tsx`、`ops-health-footer.tsx`、`fleet-portal-health-footer.tsx` 的 `normalizeHealthStatus` 實作。
  - 驗證 undefined, null, "", "future-status", {}, [] 皆回傳 `unknown`，不回傳 `healthy`。
  - 驗證雙語 `unknown` 文案在三個 console 均正確對應。
- `packages/ui-web/tests/unit/environment-badge.test.ts`: 驗證 Badge 元件與解析器。

---

## 3. 本地執行驗證指令與結果

| 指令                                                                                                                                                                | 說明                           | Exit Code | 結果                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | --------- | ----------------------- |
| `git diff --check`                                                                                                                                                  | 檢查 git diff 空白與語法       | 0         | 通過                    |
| `pnpm --filter @drts/bank-console-web typecheck`                                                                                                                    | Bank Console 類型檢查          | 0         | 通過                    |
| `pnpm --filter @drts/enterprise-dispatch-web typecheck`                                                                                                             | Enterprise Dispatch 類型檢查   | 0         | 通過                    |
| `pnpm --filter @drts/fleet-partner-portal-web typecheck`                                                                                                            | Fleet Partner Portal 類型檢查  | 0         | 通過                    |
| `pnpm --filter @drts/ops-console-web typecheck`                                                                                                                     | Ops Console 類型檢查           | 0         | 通過                    |
| `pnpm --filter @drts/platform-admin-web typecheck`                                                                                                                  | Platform Admin 類型檢查        | 0         | 通過                    |
| `pnpm --filter @drts/tenant-console-web typecheck`                                                                                                                  | Tenant Console 類型檢查        | 0         | 通過                    |
| `pnpm --filter @drts/ui-web typecheck`                                                                                                                              | UI Web package 類型檢查        | 0         | 通過                    |
| `pnpm --filter @drts/ui-web test`                                                                                                                                   | UI Web 單元測試                | 0         | 4 files / 52 tests 通過 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-env-copy-001/ packages/ui-web/tests/unit/environment-badge.test.ts --no-file-parallelism --maxConcurrency=1` | 專屬系統修復測試套件           | 0         | 2 files / 40 tests 通過 |
| `pnpm run i18n:guard`                                                                                                                                               | 全庫 i18n 守門檢查 (526 files) | 0         | 通過                    |

---

## 4. 驗收核對 (Acceptance Checklist)

- [x] **中文/英文與正常/錯誤/空態無無意義 ActionIntent 等文字**：
  - `opsAssistant.bridge.empty` 等文案已清理內部 ActionIntent，各 app 翻譯模組完成 submissionId 繁中化與錯誤訊息優化。
- [x] **env 從 runtime 權威值，不靠 domain 字串猜；prod 也不把未知資料標健康**：
  - 6 個 Server Layouts 依據 `DRTS_ENV` 傳入 normalized env；URL/domain 猜測一律回退 `unknown`。
  - admin、ops、fleet 三大主控制台健康狀態 footer 統一使用 `resolveRuntimeHealth`，未知/空 payload 回傳 `unknown`，不誤標 healthy。
- [x] **未修改未授權範圍**：
  - 所有異動檔案嚴格符合 write_scopes（含 supervisor 授權之 `ops-health-footer.tsx` 與 `fleet-portal-health-footer.tsx`）。
  - 未啟動任何產品 server、Docker、Playwright 預覽服務。
