# SR-BANK-002 — 銀行角色金額／PII／匯出一致隔離

## 狀態與版本

2026-09-06，Owner Codex2，Reviewer Claude2。**部分修復已推送；任務 blocked，未 handoff，不能結案。**

- Base / 查核時 `origin/dev`：`69c519702047862212bc0e4890350e6b58917062`。`git fetch origin`、`git rebase origin/dev` 成功；另用 `git ls-remote origin refs/heads/dev` 確認遠端仍是同一 SHA。
- 已驗證的程式與測試 checkpoint：`51357a15ffab969aeb25eb833f506841646b4b72`，branch `codex2/sr-bank-002`，已普通 non-force push。
- Candidate SHA：**尚未建立**。此 SHA 是可恢復的 WIP checkpoint，不是完成候選；本文件後續提交亦不代表鎖定 candidate。尚無同 candidate review／CI／merge／live 驗收證據。
- 前置任務查核：SR-BANK-001、SR-IAM-001 的 task slice 均為 `done`，分別記錄 PR #1654 與 #1683；沒有將歷史 audit SHA 當成目前程式。

## 追溯與既有政策

- Execution：`docs/03-runbooks/system-remediation-execution-tasks-20260906.md` 與 `system-remediation-20260906/SR-BANK-002.md`。
- Finding R15、capability C005：OPS_VIEWER 在人員頁被告知無結算金額，對帳頁仍可讀到金額。
- `docs/02-architecture/credit-card-airport-transfer-sa-20260610.md` UC-2／UC-3：OPS 作業唯讀，finance 對帳與遮罩參照。
- 目前 `home-data.ts:roleView`、`session.ts:resolveServerSessionRole` 及既有下載 handlers：program admin／finance 可讀金額及下載；OPS 不可。沿用此政策，未擴大任何角色 scopes。
- 已讀 `packages/ui-tokens/src/realms.ts`、`bank-screens-2.jsx` 的對帳清單／明細、`bank-screens-3.jsx` 的人員角色卡。延用既有 page shell、CalloutPanel、realm／issuer tokens 與角色文案，沒有新增 palette 或重設畫面。

## 已修正的範圍

1. `session.ts` 新增保護頁面共用 resolver：必須有已驗章 cookie；URL 只能與 cookie 的 role／bank 一致，不能授權。省略 bank 時使用 cookie 中的租戶，不回退 CTBC。
2. 對帳清單、明細在讀資料前驗證 session／tenant。OPS 只收到既有角色限制提示，完全不呼叫對帳 loader，HTML 無總额、逐趟金額或 artifact 資源參照。
3. 人員頁不再信任 query role。無 session、偽造 cookie、跨 tenant 或角色竄改均在讀取 directory PII 前 `notFound()`；管理按鈕依已驗證角色判斷。
4. 人員 email 保留權威 API 值，不再依 URL 租戶改寫網域，把另一筆資料偽装成本租戶人員。

以上只改 dispatch 列出的 source scopes。沒有修改共用 loader、canonical IAM、CSV handlers、artifact handlers、中央測試 config、lockfile 或全域樣式。

## 重現與檢查結果

初次執行 Vitest 因 supervisor 提供的 node_modules symlink 指向失效的其他 worktree，報 `MODULE_NOT_FOUND`（exit 1）。只移除本 isolated worktree 的 dependency symlinks，執行 `pnpm install --offline --frozen-lockfile --ignore-scripts`（exit 0；下載 0；lockfile 未改），建立獨立依賴後重跑。

Root Vitest 的 `@` 屬於 tenant console，無法直接載入 bank SSR。task 專屬 `boundary.test.ts` 執行 task 專屬 Vitest config，以 bank alias 跑 `.spec.mts`；runner 傳回真實 exit code。沒有 `passWithNoTests`、skip 或 expected-failure 標記，沒有修改 root config。`.mts` 將 Next SSR 的 TSX compilation 保留在 bank 測試環境。

| 指令                                                                                                                                                                                                                                                               | 結果／exit code                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest run tests/unit/system-remediation/sr-bank-002/`，頁面修正前、base 程式                                                                                                                                                                           | 頁面 20 tests：4 passed、16 failed；exit 1。失敗包括 OPS 金額、跨 tenant、無 session／偽造 cookie／query 升權。                            |
| 同指令，頁面修正後、補下載矩陣前                                                                                                                                                                                                                                   | 頁面 20/20 passed；root wrapper 1/1 passed；exit 0。                                                                                       |
| `pnpm exec vitest run tests/unit/system-remediation/sr-bank-002/`，checkpoint `51357a15f`                                                                                                                                                                          | 3 inner suites、54 assertions：**49 passed、5 failed**；root wrapper 失敗；**exit 1**。五個失敗是下節未修正的 scope 阻礙，不能報整體通過。 |
| `pnpm --filter @drts/bank-console-web typecheck`                                                                                                                                                                                                                   | `next typegen` 成功、`tsc --noEmit` 成功；exit 0。                                                                                         |
| `pnpm exec eslint apps/bank-console-web/lib/session.ts apps/bank-console-web/app/statements/page.tsx 'apps/bank-console-web/app/statements/[period]/page.tsx' apps/bank-console-web/app/users/page.tsx tests/unit/system-remediation/sr-bank-002 --max-warnings=0` | exit 0。                                                                                                                                   |
| `git diff --check`                                                                                                                                                                                                                                                 | exit 0。                                                                                                                                   |

49 個通過案例包括 20 個頁面測試，以及 29 個下載／序列化測試：三角色 × 同 tenant／跨 tenant × 全期 CSV／單期 CSV／statement artifact／trip artifact，加上偽造 cookie／升權與 mapper PII 測試。下載 handlers 與 mapper 均為實際程式；其上游 fetch 使用明列 synthetic inputs。OPS 的下載請求在 fetch 前得到 403；admin／finance 的同租戶回應保留金額而沒有原始乘客姓名、電話、卡號與未遮罩參照；三角色跨租戶皆 403。

## 五個未通過案例與 supervisor 必須處理的 scope

`out-of-scope-blockers.spec.mts` 保留普通失敗測試，令 root task command 維持失敗：

1. `GET /api/tenant/settlement-statements` 的 canonical policy 只有 `tenant:read`，没有財務權限要求。
2. `GET /api/tenant/settlement-statements/2026-03` 同上。實際 assertion：`expected ['tenant:read'] to include 'tenant:billing:read'`。
3. CTBC OPS 遇上游 403 時，`loadBankStatementsData` 回傳四份 seed statements，而非拒絕／空資料。
4. Cathay finance 遇上游 403 時亦回傳 CTBC seed statements。
5. Cathay finance 的全期 CSV 遇上游 503 時仍回傳 200，內容包含 `STM-CTBC-202606` 等 CTBC seed rows。這是重現出的錯誤行為，不是成功跨租戶資料驗收。

需要 supervisor：

- **擴本 task write scope 加入 `apps/bank-console-web/lib/bank-dev-read-models.ts`，並依所有重疊 writer 加入必要相依。** 修正角色禁用 endpoint 的載入與故障策略，禁止對帳在 forbidden、空資料、其他 tenant 或故障時回退 seed。現有檔案不在本 task scope，owner 未改。
- **由 SR-IAM-001（重新排程或建立有相依的後續 task）整合銀行角色、財務讀 scope 與 settlement API policy。** `server-bank-api.ts` 現況將三角色均轉成 tenant_admin，沒有 `x-scopes`；既有 IAM catalog 也沒有 bank role preset。須待權威 policy 整合後，才能在本 task scope 內將 bridge 串到該 mapping；不能自行擴大 tenant_viewer 或所有角色 scopes 解決。

未授權前不能以只藏 HTML 的修復宣稱 HTML／JSON／CSV 一致隔離，也不能 handoff 完成候選。

## 資源與驗證界線

- Tenant IDs：`tenant-demo-001`（CTBC）、`tenant-cathay-001`（Cathay）。
- Synthetic disclosure sentinels：`sr-bank-002-statement`、`sr-bank-002-trip`、period `2026-03`、amount `987654`。上游測試資料刻意包含未遮罩 PII sentinel，以確認 mapper／CSV／artifact 不洩漏；不是正式銀行帳務資料。
- 既有程式 seed 重現：`STM-CTBC-202606`、`STM-CTBC-202605`、`STM-CTBC-202604` 及 `settlement-statement-tenant-demo-001-2026-03`。
- 未執行 live Cloud Run、真實 IAP 登入、正式銀行帳務、瀏覽器畫面／真機、部署、CI 或 merge 驗收。SSR 用實際 React server rendering，cookie 用實際簽章／驗章函式，HTTP context 與上游 API 使用測試替身。沒有宣稱 live 成功、正式資料外洩或真正送達。
