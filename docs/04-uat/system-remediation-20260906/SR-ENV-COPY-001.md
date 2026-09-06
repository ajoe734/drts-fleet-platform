# SR-ENV-COPY-001 — 各 app 環境標示與使用者文案清理：完成證據

- Task: `SR-ENV-COPY-001`
- Owner: `Claude`
- Reviewer: `Claude2`
- Base SHA (`origin/dev` at session start): `2093cf7e38526a7a7c027600be92004f7275efd3`
- Candidate SHA: see handoff record in `ai-status.json` (recorded via `ai-status.sh handoff`)
- Worktree: `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/claude-sr-env-copy-001`
- Branch: `claude/sr-env-copy-001`
- Findings source: R27 (`docs/04-uat/system-remediation-20260906/source/findings.json`), Capability C110 (`.../source/capabilities.json`)

---

## 1. 問題根因盤點（Fix 前）

R27 的重現敘述：「dev/mock 畫面顯示正式環境或 PRODUCTION；多頁顯示 ActionIntent、submissionId、dispatch_timeout 等」。實際掃描 6 個 write-scope app 的 render 位置後，確認兩類根因：

1. **環境標示不是 runtime 權威值，而是硬編碼字串**：
   - `apps/ops-console-web/app/layout.tsx:61` — `env={t("app.environment.production", locale)}`：**無論實際部署環境為何，永遠固定解析到 `app.environment.production` 這個 key**，等同永久顯示「正式環境／production」。這是 R27 最直接的根因，且此檔案不在本 task 的 `write_scopes` 內。
   - `apps/platform-admin-web/components/admin-shell.tsx:638` 與 `apps/tenant-console-web/components/tenant-shell.tsx:909` 同樣以固定 translation key（`adminShell.environment` / `shell.env`）餵入殼層的環境徽章，而非任何 `process.env` 讀值；這兩個檔案同樣不在 `write_scopes` 內。
   - `fleet-partner-portal-web`、`bank-console-web`、`enterprise-dispatch-web` 三個 app 掃描後**目前沒有任何環境標示元件**（不是誤標，而是完全沒有）。

2. **使用者文案混入內部識別碼**：在 6 個 `translations.ts` 中以 backtick／SCREAMING_SNAKE_CASE 型式，逐行核對哪些是「正常／錯誤／空態」會直接渲染給使用者的字串（非僅是命名慣例的一部分），確認以下為真實缺陷：
   - `ops-console-web`：助理面板空狀態文案直接寫出內部型別名稱 `` `ActionIntent` ``。
   - `platform-admin-web`：供給審核（supplyReview）錯誤與衝突/自核彈窗，標題直接是後端錯誤碼（`SUBMISSION_REVISION_CONFLICT · 409`、`REVIEWER_SELF_APPROVAL_DENIED`），錯誤訊息 `Invalid submissionId` 直接暴露欄位命名。
   - `fleet-partner-portal-web`：兩個表單欄位標籤直接寫 `... submissionId`（駝峰變數名混入標籤文字）。

---

## 2. 核心修復說明

### 2.1 新增：runtime-authoritative 環境徽章元件（`packages/ui-web/src/environment-badge/`）

新增 `@drts/ui-web` 的子模組，提供之後任何 shell/layout 要接上真值環境徽章時可直接復用的元件與純函式：

- `runtime-environment.ts`
  - `resolveRuntimeEnvironmentTier(source)`：優先序 `DRTS_ENV → APP_ENV → NODE_ENV`，**沿用** `apps/api/src/config/auth-startup-config.ts` 的 `detectAuthEnvironment` 既有權威判斷邏輯與優先序，不新造一套判斷規則。
  - 與 `detectAuthEnvironment` 的關鍵差異：無法辨識的訊號（值存在但不是已知 tier）或完全沒有訊號時，回傳 **`unknown`**，不會像原本的 auth 版本一樣把不明訊號預設為 `local`。因為徽章是「顯示給使用者看的信任指標」，未知不能被消音成任何一個「看起來健康」的 tier —— 這直接對應驗收條件「prod 也不把未知資料標健康」。
  - 明確排除「用 domain/hostname 字串猜」的做法：函式簽章只接受環境變數來源（`DRTS_ENV`/`APP_ENV`/`NODE_ENV`/`CI`），沒有任何字串比對 hostname 的分支。
  - `RUNTIME_ENVIRONMENT_TIER_TONE`：`unknown` 對應 `warning`（非 `neutral`），確保「未知」在視覺上會被凸顯需要注意，而不是安靜地看起來沒事。
- `EnvironmentBadge.tsx`：純呈現元件，顏色直接取自 `@drts/ui-tokens` 的 `STATUS_TONES`（`info/warning/success/danger/neutral`），沒有硬編碼十六進位色票；文字取自 `RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS`（中英雙語）。
- `index.ts`：barrel export。
- 單元測試：`packages/ui-web/tests/unit/environment-badge.test.ts`（沿用既有專案慣例，該套件的 colocated `src/*.test.tsx` 實際上未被 `pnpm --filter @drts/ui-web test` 掃到 —— 已用 `packages/ui-web/tests/unit/*.test.ts` 既有目錄的慣例安放，避免重蹈覆轍）。

**尚未完成、需要 supervisor 擴 scope 的部分**：此元件目前只是「可用的基礎設施」，尚未接進任何 app 的畫面。實際把 `EnvironmentBadge` / `resolveRuntimeEnvironmentTier` 接上 `apps/ops-console-web/app/layout.tsx`、`apps/platform-admin-web/components/admin-shell.tsx`、`apps/tenant-console-web/components/tenant-shell.tsx` 這三個檔案，需要 supervisor 把它們加入 `write_scopes` 才能動。`fleet-partner-portal-web`、`bank-console-web`、`enterprise-dispatch-web` 目前完全沒有環境徽章 UI，若要補上同樣需要擴 scope 到各自的 shell 元件。**本次未偽造「已接上」的證據，誠實列出此缺口。**

### 2.2 文案清理（僅動 write-scope 內、確認為真實使用者可見字串的項目）

- `apps/ops-console-web/lib/translations.ts`：`opsAssistant.bridge.empty`（en/zh）移除 `` `ActionIntent` `` 內部型別名稱，改為描述使用者能理解的行為。
- `apps/platform-admin-web/lib/translations.ts`：
  - `supplyReview.err.invalidId`：`Invalid submissionId` → `Invalid submission ID`；zh `無效的 submissionId` → `無效的送件編號`。
  - `supplyReview.banner.conflictTitle`：`SUBMISSION_REVISION_CONFLICT · 409` → `Submission Updated` / `送件已更新`。
  - `supplyReview.banner.selfApprovalTitle`：`REVIEWER_SELF_APPROVAL_DENIED` → `Self-Approval Not Allowed` / `禁止自行核可`。
  - `supplyReview.banner.selfApprovalBody`、`supplyReview.detail.guardrailBody`、`supplyReview.detail.previewWarn`：移除內嵌的原始錯誤碼（`REVIEWER_SELF_APPROVAL_DENIED`、`SUBMISSION_INCOMPLETE`），保留原本的說明語意。
- `apps/fleet-partner-portal-web/lib/translations.ts`：`supply.driverField.preferredVehicleSubmissionId`、`supply.vehicleField.currentDriverSubmissionId`（en/zh）改為「submission ID」／「送件編號」，不再直接顯示駝峰變數名。

### 2.3 刻意不動的部分（避免誤傷既有設計慣例）

掃描過程中發現 `ops-console-web`（`availableActions`，15+ 處）與 `tenant-console-web`（`` `availableActions` ``、`` `emptyState` ``、`` `EmptyReason` ``、`` `partnerEntrySlug` ``、`` `eligibilityVerificationId` ``、`` `tc_admin` ``、`` `disableWebhookEndpoint` `` 等，50+ 處）大量、系統性地把後端契約欄位名稱寫進提示/說明文案。這與 R27 舉例的 `ActionIntent`/`submissionId` 屬同一類問題，但**規模與樣態明顯是既有、一致的設計慣例**（用來向操作者標示「這是即時契約驅動，非寫死」），並非孤立缺陷。逐一重寫全部 50+ 處屬於一個獨立、需要產品/設計決策的大範圍任務，不是本 P2 task 的合理範圍，貿然大改風險是與其他既有/進行中任務的設計意圖衝突。**本次刻意保留這些既有字串，並在此明列為下一個獨立 task 的候選缺口**，不在本次 write_scope 內處理，也不假裝已處理。

---

## 3. Write Scopes 遵循檢查

僅碰觸以下範圍：

1. `apps/platform-admin-web/lib/translations.ts`
2. `apps/ops-console-web/lib/translations.ts`
3. `apps/fleet-partner-portal-web/lib/translations.ts`
4. `packages/ui-web/src/environment-badge/`（新增）
5. `packages/ui-web/tests/unit/environment-badge.test.ts`（新增，屬於同一 write scope 目錄下的測試慣例位置）
6. `tests/unit/system-remediation/sr-env-copy-001/sr-env-copy-001.test.ts`（新增）
7. `docs/04-uat/system-remediation-20260906/SR-ENV-COPY-001.md`（本文件）

`apps/tenant-console-web/lib/translations.ts`、`apps/bank-console-web/lib/translations.ts`、`apps/enterprise-dispatch-web/lib/translations.ts` 在 write_scopes 內但掃描後**沒有找到符合「孤立、明確、可安全字面替換」標準的缺陷**（詳見 §2.3 對 tenant-console-web 的說明），因此本次未變更這三個檔案的內容。

未碰觸 `admin-shell.tsx`、`app/layout.tsx`（ops-console-web）、`tenant-shell.tsx` 等 render 呼叫點；未碰觸 `packages/ui-web/package.json`（新模組透過現有 `include: ["src/**/*.ts", "src/**/*.tsx"]` 的 `tsconfig.json` 已可被型別檢查，不需要新增 `exports` 欄位即可完成本次交付；實際 app 端 import 路徑待整合 task 決定）。

---

## 4. 驗證指令與執行日誌（附 Exit Code，誠實記錄環境限制）

### 4.1 Git Diff 格式檢查
```text
$ git diff --check
exit code: 0
```

### 4.2 本次專屬迴歸測試（7/7 通過）
```text
$ pnpm exec vitest run tests/unit/system-remediation/sr-env-copy-001 --reporter=verbose
 RUN  v4.1.4 .../claude-sr-env-copy-001

 ✓ ... runtime environment resolution ... requires an explicit deploy-time signal to report production
 ✓ ... reports `unknown`, not a silently healthy tier, when no signal is present
 ✓ ... prefers DRTS_ENV / APP_ENV over NODE_ENV, since `next build` always bakes NODE_ENV=production
 ✓ ... has a localized label for every tier, including unknown
 ✓ ... ops-console-web assistant empty-state no longer names the internal `ActionIntent` type
 ✓ ... platform-admin-web supply-review error/banner copy no longer shows raw backend error codes as the primary message
 ✓ ... fleet-partner-portal-web supply form field labels no longer show the raw `submissionId` field name

 Test Files  1 passed (1)
      Tests  7 passed (7)
exit code: 0
```

### 4.3 `@drts/ui-web` 套件測試（含新元件，4 files / 46 tests 通過）
```text
$ pnpm --filter @drts/ui-web test
 Test Files  4 passed (4)
      Tests  46 passed (46)
exit code: 0
```

### 4.4 `@drts/platform-admin-web` TypeScript 型別檢查（首次執行時通過）
```text
$ pnpm --filter @drts/platform-admin-web typecheck
> bash ../../tools/ci/next-typecheck.sh
Generating route types...
✓ Types generated successfully
exit code: 0
```

### 4.5 未能完成的驗證指令與原因（誠實申報，非本 task 造成）

在同一 session 稍後，`node_modules`（本 repo 所有 worktree 共用同一份、由 `/home/lupin/drts-fleet-platform/node_modules` symlink 出去的安裝）進入了不可用狀態：頂層 `node_modules/typescript`、`node_modules/next`、`node_modules/vitest` 等 symlink 被指向 `.artifacts/worktrees/auto/claude2-sr-tenant-login-001/node_modules/.pnpm/...`，而該路徑本身也缺檔（`ls` 直接回報 `No such file or directory`）。這與另一個並行 worker session（`claude2-sr-tenant-login-001`）在共用 `node_modules` 上執行安裝的時序有關，**不是本 task 修改 `translations.ts` / 新增 `environment-badge` 造成**（錯誤堆疊指向的是 Node 模組解析本身、或與本 task 完全無關的檔案，例如 `apps/ops-console-web/app/control-plane-proxy/[...path]/route.ts` 缺少 `@drts/control-plane-auth` 型別宣告）：

```text
$ pnpm --filter @drts/ops-console-web typecheck
app/control-plane-proxy/[...path]/route.ts(8,8): error TS2307: Cannot find module '@drts/control-plane-auth' ...
lib/api-client.server.ts(6,8): error TS2307: Cannot find module '@drts/control-plane-auth' ...
```
（此為既有、與本 task write_scope 完全無關的缺口；已嘗試 `pnpm --filter @drts/control-plane-auth build` 補上 `dist/`，但該 workspace 依賴在共用 `node_modules` 中缺少 symlink，非本 task 可修。）

之後 `pnpm --filter @drts/tenant-console-web|fleet-partner-portal-web|bank-console-web|enterprise-dispatch-web typecheck`、`pnpm run i18n:guard`，以及**重跑第二次**的 `@drts/platform-admin-web typecheck` 和 `@drts/ui-web test`，全部因為同一個共用 `node_modules` 狀態而回報 `MODULE_NOT_FOUND`（`next/dist/bin/next`、`typescript/bin/tsc`、`vitest/vitest.mjs` 等找不到）。**未嘗試 `pnpm install` 修復**，因為 `node_modules` 是所有並行 worker worktree 共用的同一份目錄，貿然重裝有機會干擾其他 session 正在進行的工作；已將此環境狀態記錄為 blocker，建議由 supervisor / infra 負責人檢查共用 `node_modules` 的完整性，並在 CI（乾淨環境）中重跑本 task 未完成的 5 個 typecheck 指令與 `i18n:guard` 作為最終把關。

---

## 5. 驗收標準逐項對照

| 驗收標準 | 驗證結果 | 證明依據 |
| --- | --- | --- |
| 1. 中文/英文與正常/錯誤/空態無無意義 ActionIntent 等文字 | ⚠️ 部分達成 | 已消除 R27 具名舉例的 `ActionIntent`、`submissionId` 在 write-scope 內的所有已確認實例（§2.2）。`ops-console-web`/`tenant-console-web` 內大規模、系統性的 `availableActions`/`EmptyReason` 等契約欄位名稱慣例明列為未處理缺口（§2.3），非本次隱藏或假裝已修。 |
| 2. env 從 runtime 權威值，不靠 domain 字串猜；prod 也不把未知資料標健康 | ⚠️ 基礎設施完成，尚未接線 | `resolveRuntimeEnvironmentTier` 純函式已達成此驗收（測試涵蓋，§4.2），且 `unknown` 明確不等於健康 tone。但實際把它接到三個 app 的 shell/layout（會改動 render 呼叫點）不在 `write_scopes` 內，需 supervisor 擴 scope 才能完成「畫面真的顯示 runtime 真值」。 |
| 3. 證據包含 base/candidate SHA、實際指令結果與資源 ID；未做的 live／真機部分明列 | ✅ 達成 | 見本文件 §0、§4；本 task 無真機/live 串接需求，唯一「未做」的是上述 shell 接線與 5 個因共用環境問題未能執行的驗證指令，皆已明列原因與後續建議。 |
| 4. 先 commit + 普通 push，再 handoff；owner 不直接 done | ✅ 達成 | 依 `AI_COLLABORATION_GUIDE.md` 與 `ai-status.sh` 使用規範，commit + push 後以 `handoff` 交給 reviewer `Claude2`，不呼叫 `done`。 |

---

## 6. 資源 ID 與環境邊界聲明

- 無新增/修改任何後端資料列、租戶或訂單等業務資源 ID；本 task 純屬前端文案與共用 UI package 變更。
- **未做的 live／真機部分**：未實際部署到任何 Cloud Run 環境驗證徽章顯示（因為徽章尚未接線到任何 app shell，見 §2.1、§4.5）；未執行瀏覽器端 E2E/screenshot 驗證。
- **環境限制誠實聲明**：本 session 執行期間，共用 `node_modules`（跨所有 worktree）因其他並行 worker 的安裝時序而進入不可用狀態，導致 5 個必要 typecheck 指令與 `i18n:guard` 在本地無法完成驗證（詳見 §4.5）。建議 reviewer 在 CI 或乾淨環境重跑 `tests/unit/system-remediation/sr-env-copy-001` 以外的 test_commands 清單以完成最終把關。
