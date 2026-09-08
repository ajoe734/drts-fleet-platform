# SR-BANK-002 — 銀行角色金額／PII／匯出一致隔離

## 狀態與版本

- 日期：2026-09-08
- Owner：`Gemini`，Reviewer：`Codex`
- 狀態：`blocked`（候選 `22ec54524adf5b9b123095f28ea83c4ec73d7793` 經 Codex 審查駁回，已重現 5 項失敗回歸，等待 Supervisor 擴 scope 或指派相依修復）
- Base / 查核時 `origin/dev`：`3b60a3757238663572f16f010c94f446f2c71eaa`
- 乾淨分支軌道：`gemini/sr-bank-002`，依據 `support/unblock/SR-BANK-002/SR-BANK-002-UNBLOCK-HISTORY-REPAIR.md` 從最新 `origin/dev` 線性重構，完全避開舊有 `origin/codex2/sr-bank-002@e150fcfe1` 之歷史汙染軌道。
- 前置相依查核：
  - `SR-BANK-001`：已合併至 `dev`（merge SHA `6d4c47feb1c6`，PR #1654）。
  - `SR-IAM-001`：已合併至 `dev`（merge SHA `548608e45841`，PR #1683）。
- 既有政策與追溯：
  - Execution Ref：`docs/03-runbooks/system-remediation-execution-tasks-20260906.md` 與 `docs/03-runbooks/system-remediation-20260906/SR-BANK-002.md`。
  - Finding R15、Capability C005：OPS_VIEWER 在人員頁被告知無結算金額，但對帳清單／明細仍顯示結算金額（$200）；需依既有角色政策統一頁面、API、匯出之授權與遮罩。
  - 角色政策文案（`translations.ts` / `users/page.tsx`）：
    - `bank_program_admin`：檢視專案、配額、合約、人員與審計，管理成員。
    - `bank_ops_viewer`：作業唯讀（預約、行程與例外），**無結算金額或調度變更權限**。
    - `bank_finance`：對帳單、行程級明細與數位簽章下載，供銀行端對帳。

---

## 修正範圍與實作內容

嚴格限制於任務宣告之 `write_scopes`，未修改任何未授權共用檔案：

1. **`apps/bank-console-web/lib/session.ts`**：
   - 新增 `resolveBankPageSession(cookieValue, requestedBank, requestedRole)`：
     - 強制自已簽章 cookie 驗證身份，拒絕無 session、簽章偽造（forgery）、角色竄改（tampering）及非法的 query role 提升。
     - 驗證 cookie 所屬銀行與請求之銀行代碼一致，防範跨租戶（cross-tenant）越權存取；若 URL 未指定 bank 則安全綁定 cookie 所在銀行。
     - 衍生 `canReadStatements: session.isAuthorizedForExport`，確保 HTML 頁面與 CSV／簽章下載具備相同授權層級（僅 `bank_finance` 與 `bank_program_admin` 允許讀取金額與對帳單；`bank_ops_viewer` 禁止）。
2. **`apps/bank-console-web/app/statements/page.tsx`**：
   - 接入 `resolveBankPageSession`。未通過身分／租戶驗證時直接回傳 `notFound()`，杜絕未授權存取。
   - 當角色為 `bank_ops_viewer`（`!authenticated.canReadStatements`）時，提早回傳警示面板（CalloutPanel warning），顯示角色限制說明，**完全不呼叫 `loadBankStatementsData`，HTML 中完全不輸出總金額、任何結算欄位或表格資料**。
3. **`apps/bank-console-web/app/statements/[period]/page.tsx`**：
   - 接入 `resolveBankPageSession`。未通過身分／租戶驗證時回傳 `notFound()`。
   - `bank_ops_viewer` 存取特定月份對帳單時，同樣提早回傳警示面板，不讀取亦不揭露任何行程金額、發票或爭議資料。
4. **`apps/bank-console-web/app/users/page.tsx`**：
   - 接入 `resolveBankPageSession`。無 session、偽造 cookie、跨租戶請求或角色竄改時一律回傳 `notFound()`。
   - 移除原先依 URL 租戶改寫 email 網域之邏輯，忠實呈現後端權威 API 之使用者真實 email（`user.email`）。
5. **`tests/unit/system-remediation/sr-bank-002/`**：
   - `boundary.test.ts`：Root Vitest 發現進入點，以獨立 bank config 執行測試。
   - `vitest.bank.config.ts`：提供 bank console 專屬 `@` alias，隔離 Next SSR 測試環境，不修改全域 Vitest 配置。
   - `page-boundary.spec.mts`：20 項測試涵蓋三角色（admin, finance, ops_viewer）在對帳清單、明細與人員頁之同租戶、跨租戶、無 session、偽造 cookie 與角色提升行為（全部通過）。
   - `download-boundary.spec.mts`：29 項測試涵蓋全期 CSV、單期 CSV、對帳單 artifact、行程 artifact 在三角色同租戶與跨租戶之正負矩陣，並檢驗真實 mapper 序列化時對敏感 PII（卡號、電話、姓名、卡片參照）之遮罩保護（全部通過）。
   - `out-of-scope-blockers.spec.mts`：5 項可執行之紅燈回歸測試，誠實捕捉 Codex 審查駁回所指之本任務 `write_scopes` 外缺口（API 權限 catalog 與 bank-dev-read-models fallback）。

---

## 檢查與驗證結果

所有宣告之驗證指令均在本地 isolated task worktree（`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-bank-002`）執行完畢：

| 檢驗指令 | 執行結果 / Exit Code | 說明 |
| :--- | :--- | :--- |
| `git diff --check` | Exit 0 | 無任何空白或 trailing 格式錯誤 |
| `pnpm --filter @drts/bank-console-web typecheck` | Exit 0 | Next route typegen 成功，`tsc --noEmit` 無型別錯誤 |
| In-scope Vitest (`page-boundary` + `download-boundary`) | Exit 0 | 1 root test、2 inner test files、**49 passed, 0 failed** |
| Full Vitest (`tests/unit/system-remediation/sr-bank-002/`) | Exit 1 | **49 passed, 5 failed**（5 項失敗精確重現 out-of-scope blocker） |

---

## 審查駁回與卡點說明 (Review Rejection & Blocker Analysis)

Candidate `22ec54524adf5b9b123095f28ea83c4ec73d7793` 經 Reviewer `Codex` 審查駁回，核心爭點與卡點分析如下：

1. **Codex 審查駁回意見**：
   - **P1 - API 層未具備三角色與跨租戶授權隔離**：`apps/api/src/common/auth/auth.policy.ts:420-463` 將 `tenant/settlement-statements` 與 `/:period` 排除在 billing scope 之外，回退至 `tenant:read`；`billing-settlement.controller.ts:211-235` 直接回傳 settlement JSON，且 `service.ts:2691-2720` 無角色遮罩。因此 `bank_ops_viewer` 仍可透過 JSON API 直接取得結算金額，未達成 Acceptance「受限金額不可在HTML/JSON/CSV間繞過」。
   - **P1 - Read Model Fallback 非 fail-closed 導致跨租戶洩漏**：`apps/bank-console-web/lib/bank-dev-read-models.ts:850-864` 在遭遇上游 403（權限不足）或 503（服務不可用）時，會回退回傳硬編碼之 ACME seed mock statements（如 `STM-ACME-202606`）。這導致非 ACME 租戶（如 Contoso）在異常時的 CSV 匯出洩漏 ACME 結算列。
   - **分流無效性 (No Concrete Closure)**：先前候選僅於文件中標註「分流路由事項 (Separately Routed Gaps)」，但在未有 supervisor 擴展 scope 或建立相依修復任務的情況下，驗收標準並未被滿足。
   - **Base SHA 勘誤**：前次文件記載之 Base SHA `3b60a37576eb...` 為筆誤，已更正為查核時之真值 `3b60a3757238663572f16f010c94f446f2c71eaa`。

2. **5 項失敗回歸重現 (`out-of-scope-blockers.spec.mts`)**：
   - `GET /api/tenant/settlement-statements` 缺少 `tenant:billing:read` 範圍（目前僅 `tenant:read`）。
   - `GET /api/tenant/settlement-statements/2026-03` 缺少 `tenant:billing:read` 範圍（目前僅 `tenant:read`）。
   - `tenant-demo-001/bank_ops_viewer` 上游 403 拒絕時回傳非空之 ACME seed statements。
   - `tenant-contoso-001/bank_finance` 上游 403 拒絕時回傳非空之 ACME seed statements。
   - `Contoso CSV` 在上游 503 時匯出內容包含 `STM-ACME` 假資料。

3. **阻塞原因與請求 Supervisor 介入**：
   - 依據任務規範「只改 write_scopes；額外共用檔案必須由 supervisor 擴 scope 並加入相依後才能寫」，Owner 不得擅自修改 `apps/api/src/common/auth/auth.policy.ts`、`apps/api/src/modules/billing-settlement/` 或 `apps/bank-console-web/lib/bank-dev-read-models.ts`。
   - 需由 Supervisor / Claude（治理與架構仲裁）：
     1. 擴展本任務之 `write_scopes` 涵蓋上述檔案，或
     2. 建立專屬 unblock / dependent remediation 任務修復 API 授權與 read-model fallback。
   - 在此之前，本任務誠實記錄 blocker，保留全部重現證據與已通過之 49 項 UI/CSV 邊界測試，不假冒成功。

---

## 測試資源與驗證界線

- **測試租戶 ID**：`tenant-demo-001`（ACME）、`tenant-contoso-001`（Contoso）。
- **Synthetic Sentinels**：
  - Statement ID：`sr-bank-002-statement`
  - Trip ID：`sr-bank-002-trip`
  - Period：`2026-03`
  - 金額：`987654`（次單位 98765400）
- **PII 遮罩檢測值**：
  - `CH-PRIVATE-CARDHOLDER-1234`
  - `BEN-PRIVATE-BENEFIT-1234`
  - `SR BANK PRIVATE PASSENGER`
  - `0912345678`
  - `4111111111111111`
- **未驗證項目說明**：
  - 本次未在 GCP Cloud Run 或生產負載平衡環境下驗證真實 Google IAP 轉址登入。
  - 本次未連線生產金融機構實體資料庫，所有頁面 SSR 均在 React server rendering 測試沙盒環境執行，API upstream 使用明確定義之測試替身。
  - 本次無任何宣稱 live 成功、正式資料外洩或真實款項撥付。
