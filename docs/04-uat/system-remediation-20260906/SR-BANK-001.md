# SR-BANK-001 — 銀行首頁／合約崩潰與日期統計修復：完成證據

- Task: `SR-BANK-001`
- Owner: `Gemini`
- Reviewer: `Claude`
- Base SHA (`origin/dev`): `bb265b286f9f38bc4fb60309ef6ca291df13db38`
- Worktree: `/home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-bank-001`
- Branch: `gemini/sr-bank-001`

---

## 1. 問題根因盤點（Fix 前）

本次修復針對 2026-09-06 UAT 觀察與歷史 Audit 所發現的三大核心問題（R06、R16、R28）：

1. **R06: SSR Digest Crash 與無優雅降級**
   - 首頁 `apps/bank-console-web/app/page.tsx` 中，對 `currentStatement.dueAt`、`currentStatement.issuedAt` 直接使用未經防護的 `.slice(...)`；當 statements 為空或載入失敗時，引發 `TypeError: Cannot read properties of undefined (reading 'slice')`，導致整個頁面 SSR digest crash。
   - 合約頁面 `apps/bank-console-web/app/contracts/page.tsx` 與詳細頁 `[contractId]/page.tsx` 中，對 `record.term.startsAt.slice(0, 10)`、`countOpenExceptions(record.exceptions)`、`record.slaTargets` 未作空值防護。
   - `loadCoreBankData` 過去使用 `Promise.all` 併發呼叫多個後端 endpoint，任一端點逾時或失敗即造成整體頁面資料中斷。

2. **R16: 配額與 SLA 統計混淆（NaN% 與假 0% SLA 違約）**
   - `quotaPct(row)` 當 `total <= 0` 時計算 `(0 / 0) * 100` 返回 `NaN`，UI 顯示 `NaN%`。
   - `buildSlaSummary` 當期完成趟次為 0 時，將準點率回傳為 `0`，UI 渲染成 `0%` 且標示為紅色 SLA 違約，而未與「無當期趟次（N/A）」嚴格區分。

3. **R28: 對帳單開立日期晚於到期日、日期跨日跨月漂移**
   - `loadBankStatementsData` 過去將 API 即時產生的動態回應時間 `statement.generated_at`（例如 `2026-09-06`）直接指派給 `issuedAt`，但對帳單為 2026 年 3 月份對帳單（`dueAt` 為 `2026-03-31`），造成開立日晚於到期日（2026-09-06 > 2026-03-31）的業務邏輯荒謬。
   - 本地時間解析未統一綁定 `Asia/Taipei`（UTC+8），在 UTC 邊界時引發跨日跨月漂移。

---

## 2. 核心修復說明

### 2.1 API 韌性與優雅降級（`server-bank-api.ts` & `bank-dev-read-models.ts`）
- `server-bank-api.ts`:
  - 增加可配置逾時防護（`BANK_API_TIMEOUT_MS`，預設 5000ms），防止網路掛起阻塞 SSR。
  - 安全 JSON 解析，針對非 2xx 回應或格式不符情況返回詳細降級訊息。
  - `bankApiGetList` 能彈性解包 `{ items: T[] }` 或直接陣列，保證空陣列回傳不拋錯。
- `bank-dev-read-models.ts`:
  - `loadCoreBankData` 改採 `Promise.allSettled` 平行載入 7 個核心端點（orders、usage、statements、contracts、users、audit、status），任何單一端點失敗均記錄於 `degradedMessage` 並回退該部分之降級資料，零連鎖崩潰。
  - 支援 camelCase 與 snake_case 兩種後端 API 欄位格式相容。

### 2.2 配額與 SLA 嚴格分離空值與真 0（`home-data.ts` & `contracts-data.ts` & `page.tsx`）
- `quotaPct`: 當 `row.total <= 0` 時返回 `null`；首頁與合約頁面判斷為 `null` 時顯示 `—`（或「無配額資料」），消除 `NaN%`。
- `buildSlaSummary`: 當 `completedTrips === 0` 時，`onTimeValue` 嚴格返回 `null`；KPI 顯示 `—` 與「無當期趟次」，而非 `0%` 假違約。
- `metricValue` & `metricDelta`: 針對未知指標或缺少資料時安全回傳 `null`，StatusChip 與 SlaRow 渲染中立 `N/A` 狀態。

### 2.3 不可變對帳單日期與時區防漂移（`statements.ts` & `bank-dev-read-models.ts`）
- `statements.ts`: 種子對帳單補充 `2026-03` 期別（`settlement-statement-tenant-demo-001-2026-03`），固定 `issuedAt: "2026-03-01T09:00:00+08:00"`，`dueAt: "2026-03-31T23:59:00+08:00"`。
- `deriveStatementDates`:
  - 嚴格保證 `issuedAt <= dueAt`。
  - 當 API 提供 `generated_at` 為今天（非當期月份）時，不將 `issuedAt` 替換為今天，而是取用當期月份不可變起始日（`formatPeriodDate(period, false)`）。
  - 所有日期格式化（`getTaipeiDateString`、`formatDateTime`、`zhDateTime`）明確指定 `timeZone: "Asia/Taipei"`，消除跨日跨月漂移。

### 2.4 UI 容錯與三種角色邊界完整走訪（`app/page.tsx` & `app/contracts/`）
- 首頁三種角色視角權限完全符合權威模型：
  - `bank_program_admin`: 可看訂單、配額、SLA、例外與財務。
  - `bank_ops_viewer`: 唯讀作業視角（訂單、配額、SLA、例外），不可看財務對帳。
  - `bank_finance`: 財務視角（SLA、對帳單、僅限 SLA breach 例外），不碰乘客行程細節。
- 首頁與合約頁面針對缺少對帳單或缺少合約均渲染優雅空狀態卡片，零未處理之 SSR digest 錯誤。
- 合約查詢支援多鍵檢索（`contractId`、`programId`、`programCode`，支援大小寫不敏感與短代碼）。

---

## 3. Write Scopes 遵循檢查

嚴格僅碰觸指定之 9 處 write scope 範圍：
1. `apps/bank-console-web/app/page.tsx`
2. `apps/bank-console-web/app/contracts/page.tsx`
3. `apps/bank-console-web/app/contracts/[contractId]/page.tsx`
4. `apps/bank-console-web/lib/home-data.ts`
5. `apps/bank-console-web/lib/contracts-data.ts`
6. `apps/bank-console-web/lib/statements.ts`
7. `apps/bank-console-web/lib/server-bank-api.ts`
8. `apps/bank-console-web/lib/bank-dev-read-models.ts`
9. `tests/unit/system-remediation/sr-bank-001/sr-bank-001.test.ts`
10. `docs/04-uat/system-remediation-20260906/SR-BANK-001.md`

未碰觸其他模組或專案共用套件檔案。

---

## 4. 驗證指令與執行日誌（附 Exit Code）

### 4.1 Git Diff 格式檢查
```text
$ git diff --check
exit code: 0
```

### 4.2 本次專屬迴歸測試（18/18 通過）
```text
$ pnpm exec vitest run tests/unit/system-remediation/sr-bank-001/sr-bank-001.test.ts
 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-bank-001

 Test Files  1 passed (1)
      Tests  18 passed (18)
   Start at  07:10:35
   Duration  690ms (transform 234ms, setup 0ms, import 321ms, tests 138ms, environment 0ms)
exit code: 0
```

### 4.3 系統整補全套測試（82/82 通過，零回歸損壞）
```text
$ pnpm exec vitest run tests/unit/system-remediation/
 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-bank-001

 Test Files  7 passed (7)
      Tests  82 passed (82)
   Start at  07:10:39
   Duration  13.72s (transform 5.22s, setup 0ms, import 10.61s, tests 16.79s, environment 5ms)
exit code: 0
```

### 4.4 銀行主控台全套單元測試（62/62 通過）
```text
$ pnpm --filter @drts/bank-console-web test
> vitest run --passWithNoTests

 RUN  v4.1.4 /home/lupin/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-bank-001/apps/bank-console-web

 Test Files  4 passed (4)
      Tests  62 passed (62)
   Start at  07:10:58
   Duration  1.17s (transform 1.52s, setup 0ms, import 2.39s, tests 368ms, environment 1ms)
exit code: 0
```

### 4.5 銀行主控台 TypeScript 型別檢查
```text
$ pnpm --filter @drts/bank-console-web typecheck
> next typegen && tsc --noEmit

Generating route types...
✓ Types generated successfully
exit code: 0
```

### 4.6 國際化保護檢查（i18n:guard 通過）
```text
$ pnpm run i18n:guard
> drts-fleet-platform@0.1.0 i18n:guard
> node tools/ci/i18n-guard.mjs

i18n-guard: OK (517 files scanned across 10 apps, 52 exemption(s) from i18n-guard-baseline.json)
exit code: 0
```

---

## 5. 驗收標準逐項對照

| 驗收標準 | 驗證結果 | 證明依據 |
| --- | --- | --- |
| 1. 三種角色走訪不崩潰、零 SSR digest crash | ✅ 達成 | `tests/unit/system-remediation/sr-bank-001/sr-bank-001.test.ts` 第一與第二組測試全部通過；`app/page.tsx` 與 `contracts/` 全面增加 null-safe 防護與降級卡片。 |
| 2. 日期不因時區漂移跨日／跨月 | ✅ 達成 | `getTaipeiDateString`、`formatDateTime`、`zhDateTime` 均固定 `Asia/Taipei`（+08:00），第四組測試針對 UTC 邊界案例通過驗證。 |
| 3. 失敗、無資料與真正為 0 嚴格分離，未知統計不顯示 NaN% 或假 0% SLA 違約 | ✅ 達成 | `quotaPct` 在 total <= 0 時返回 `null` 渲染 `—`；`buildSlaSummary` 當無趟次時回傳 `null` 渲染 `—`（無當期趟次），第三組測試 100% 驗證通過。 |
| 4. 對帳單日期取用後端不可變日期，issuedAt 不晚於 dueAt，未知日期不回退今天 | ✅ 達成 | `deriveStatementDates` 保證 `issuedAt <= dueAt` 且非當月不預設為今天；`statements.ts` 已內建 2026-03 不可變種子邊界。 |
| 5. 附完整修復證據並提交 non-force push | ✅ 達成 | 本證據文件詳細載明 Base SHA、變更細節、測試指令與完整日誌。 |

---

## 6. 資源 ID 清單與環境邊界聲明

### 6.1 測試與驗證之核心資源 ID
- **Tenant ID**: `tenant-demo-001`
- **合約 (Contracts)**:
  - `ctr_ctbc_world_elite_2026`（Program: `prog-ctbc-world-elite` / Code: `CTBC_WORLD_ELITE`）
  - `ctr_ctbc_infinite_2026`（Program: `prog-ctbc-infinite` / Code: `CTBC_INFINITE`）
- **對帳單 (Statements)**:
  - `settlement-statement-tenant-demo-001-2026-03` (Period: `2026-03`, issued: `2026-03-01T09:00:00+08:00`, due: `2026-03-31T23:59:00+08:00`)
  - `settlement-statement-tenant-demo-001-2026-02` (Period: `2026-02`, issued: `2026-02-01T09:00:00+08:00`, due: `2026-02-28T23:59:00+08:00`)
  - `settlement-statement-tenant-demo-001-2026-01` (Period: `2026-01`, issued: `2026-01-01T09:00:00+08:00`, due: `2026-01-31T23:59:00+08:00`)
- **角色 (Personas)**:
  - `bank_program_admin`: 周敬文（具備 orders / quota / sla / finance 完整權限）
  - `bank_ops_viewer`: 黃怡安（唯讀作業視角，無財務對帳）
  - `bank_finance`: 湯立群（財務視角，無個別行程細節）

### 6.2 Live／真機未做部分明列（誠實申報）
- **未實施真機 live 項目**：
  - 本次整補未連線實體銀行 Core Banking API 專線與硬體 HSM 實體簽署晶片。
  - 所有驗證皆基於 Next.js App Router SSR Server Component 降級路徑、TypeScript 靜態型別約束、以及讀取模型（Dev Read Models）與 Vitest 單元／整合規格。未偽造對外 live 金流結算連線。
