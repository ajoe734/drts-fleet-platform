# SR-QA-TENANT-001 — 租戶驗收進度證據

2026-09-08，owner Codex，reviewer Codex2。狀態：in_progress；尚未 handoff。

## 版本與來源

- fetch 後 base `origin/dev`: `3f182f7e314b5ddb4c37f1c3f5dc214a6d0edf0e`。
- 本次新增 API 測試實跑 SHA：`10c65c40d`（anchor，已普通 push 至 `codex/sr-qa-tenant-001`）。尚無鎖定 candidate，不能當成 review / CI / merge 完成。
- 執行範圍：[task spec](../../03-runbooks/system-remediation-20260906/SR-QA-TENANT-001.md) 與 [execution rules](../../03-runbooks/system-remediation-execution-tasks-20260906.md)。
- [capabilities](source/capabilities.json)：C006、C008、C009、C025、C027、C028、C102、C109、C111；邀請與通知來源 N06/N07 見 [new gaps](source/new-gaps.json)。歷史 R02 登入問題見 [findings](source/findings.json)，本次不由歷史觀察推定仍然失效。
- `ai-status.sh show` 確認 HARNESS、TENANT-LOGIN、MAIL-001、MAIL-002 均為 done。HARNESS / MAIL-002 記錄明示舊 host 遺失部分 candidate / review / CI 證據，不補造。

## 已執行指令

工作目錄為指定 isolated worktree。以下不是 live 通過證明。

| 指令                                                                                                                                                                                                           | exit | 結果                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run tests/integ/tenant-governance-negative.test.ts tests/unit/system-remediation/sr-mail-001/ tests/unit/system-remediation/sr-mail-002/ tests/unit/system-remediation/sr-tenant-login-001/` | 0    | 7 files / 55 tests passed；既有負向及服務測試，包含替代 transport / 記憶體狀態，不能代替 DB 或信件收件驗收 |
| `pnpm --filter @drts/api typecheck`                                                                                                                                                                            | 0    | API 型別檢查通過                                                                                           |
| `pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001`                                                                                                                        | 1    | 1 failed / 4 shared harness passed；缺少 `DRTS_TENANT_UAT_API_URL`，未發 HTTP 寫入                         |
| `pnpm exec eslint tests/e2e/system-remediation/sr-qa-tenant-001/directory.spec.ts --max-warnings=0`                                                                                                            | 0    | task spec lint 通過                                                                                        |
| `git diff --check`                                                                                                                                                                                             | 0    | 無空白錯誤                                                                                                 |

Playwright 的 CLI regex 在含 task ID 的 worktree 絕對路徑亦會匹配 shared harness，所以四個 shared pass 不列為本 task 能力通過。報告位於 ignored `test-results/system-remediation-report.json`；失敗原因是環境缺失，不是已重現產品缺陷。實際資源 ID：無，因為前置檢查在任何寫入前失敗。

## 新增可重跑案例與環境

`tests/e2e/system-remediation/sr-qa-tenant-001/directory.spec.ts` 使用現有 `/api/tenant/passengers`、`/api/tenant/addresses` 契約。正常案例新建乘客、地址指向同一乘客，POST 後 GET 核對值，更新同一 ID 再確認唯一性。負向案例檢查跨租戶 owner 引用、跨租戶乘客覆寫、唯讀寫入與空白必填欄位，並回讀確認資料沒有被失敗請求改寫。

執行前配置以下環境變數；不將 token 寫入此文件或命令記錄：

- `DRTS_TENANT_UAT_API_URL`：測試 API 根 URL，含 `/api`。
- `DRTS_TENANT_UAT_TENANT_A`、`DRTS_TENANT_UAT_TENANT_B`：兩個不同、已配置的可拋棄測試租戶。
- `DRTS_TENANT_UAT_TOKEN_A`、`DRTS_TENANT_UAT_TOKEN_B`：各租戶合法可寫身份 bearer token。
- `DRTS_TENANT_UAT_TOKEN_READONLY`：A 租戶合法唯讀身份 token。

使用上表 Playwright 指令重跑。每次建立 UUID namespace；測試不自動刪除租戶，收集 evidence 後由測試環境 provisioner 銷毀這兩個可拋棄租戶。不要指向日常業務租戶。HTTP evidence 僅記 method、path、status 及資源 ID，不保存 token 或完整個資。API 回讀不能證明重啟後 DB 持久性。

## 待完成能力矩陣

以下皆未完成閉環驗收，不因既有單元測試通過而勾選完成。

| 能力                                | 下一步正常＋負向驗收                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| users / invites（C006/C008）        | 建人、改角色、真正收信啟用後回讀；唯讀拒絕、撤銷/過期/重放 token，確保身份與邀請同 ID |
| passengers / addresses（C027/C009） | 執行新增 API spec；再加預約引用與停用中資源使用政策，DB 重啟回讀                      |
| cost centres（C027）                | 新增更新、與使用者/訂單引用回讀；跨租戶引用、停用中心拒絕                             |
| quota / rules（C028）               | 寫入政策、訂單保留/取消返還、ledger 與 snapshot 一致；不足額度、跨月/時區、重複命令   |
| SLA（C028）                         | 寫入與回讀 cutoff/服務政策；非法時窗與角色拒絕，影響訂單行為                          |
| approvals（C025）                   | 提交→核准/駁回/人工升級；非簽核人與重複決策拒絕，訂單/額度/audit/收信關聯             |
| feature flags（C109）               | 分租戶啟停與回讀/快取失效；越權、其他租戶不可見                                       |
| tenant lifecycle（C102）            | 新增、停用、恢復與 audit 回讀；非法轉移、停用租戶操作拒絕                             |
| integration settings（C111）        | API key 輪替/撤銷/遮罩與使用回讀；失效 key 與超出 scope 拒絕                          |

尚缺可用 URL、合法測試身份與可拋棄租戶配置；沒有使用假 header 或 fixture 代替驗收。瀏覽器登入、真收件、DB 持久性與上述未新增案例仍待執行。沒有已確認的新產品缺陷，因此本次未建立修復子任務；發現後須透過 canonical task command 建立並追溯。
