# SR-QA-TENANT-001 — 驗收進度（未完成）

Owner Codex2 / Reviewer Codex。2026-09-08。

Base / tested product SHA：`fa0fd8257950764526a522d091be9d97effa82b9`，本次 fetch 後 rebase 至 origin/dev。
HTTP test anchor：`b6f1f523ef510bfb9ee16d378b6b6eac25b0ceb4`，已普通 push 至 `origin/codex2/sr-qa-tenant-001`。
Candidate SHA：尚未 handoff；anchor 不是審查 candidate。完成後才由 machine truth 鎖定 candidate。

## 來源與界線

- [執行規則](../../03-runbooks/system-remediation-execution-tasks-20260906.md)、[task spec](../../03-runbooks/system-remediation-20260906/SR-QA-TENANT-001.md)。
- [能力來源](source/capabilities.json)：C006 邀請、C027 乘客／地址／成本中心、C028 額度／規則／SLA、C102 租戶治理、C109 功能旗標；C109 與 governance QA 有交集。
- `phase1_service_contracts_v1.md` §3.2：Tenant/Partner Service 擁有乘客、地址、租戶使用者及 SLA 主資料。
- [Readiness](current-state.md) 明列 persona 不是已 provision 帳號，隔離 tenant 與正式身分仍需提供。本次環境亦無 DRTS*UAT*\* 設定。
- 9/6 audit 僅為歷史來源；本次沒有發現新的產品失敗回歸，因此未建立產品修復 child，也未修改业务碼。

## 正常／負向覆蓋及剩餘工作

| 能力              | 正常案例                                    | 關鍵負向案例                                                     | 本次狀態                                                                 |
| ----------------- | ------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 乘客              | 新建、GET 回讀、停用回讀                    | 空白姓名、外租戶修改及清單隔離、拒絕後原值不變                   | 已寫 HTTP spec；缺環境未執行請求                                         |
| 地址              | 新建並引用乘客、GET 關聯回讀、停用回讀      | 外租戶 address ID 修改、外租戶 passenger ID 引用、拒絕後原值不變 | 已寫 HTTP spec；缺環境未執行請求                                         |
| users / invites   | 建立使用者、邀請啟用後身份及角色回讀        | 過期、撤銷、重用與 delivery unavailable                          | 既有 service 回歸已跑；HTTP／DB／真收件未驗                              |
| cost centres      | 新增、更新、訂單引用及停用                  | 外租戶引用、停用後使用                                           | 既有 foundation/governance 回歸已跑；HTTP／DB spec 待補                  |
| quota             | 保留、取消返還、月結與使用量回讀            | 額度不足、跨月／時區、並發超額                                   | 既有 governance 回歸非完整配額驗收；HTTP／Postgres 並發待補              |
| rules / approvals | 規則評估、核准／拒絕後訂單狀態與 audit 回讀 | 非核准者、無權限、重複決策                                       | 既有 governance/mail service 回歸已跑；HTTP／DB spec 待補                |
| SLA               | 修改設定、違約摘要與手動升級回讀            | 未授權修改、無效設定                                             | 既有 governance service 回歸非完整 SLA 驗收；HTTP／DB spec 待補          |
| feature flags     | 指定租戶啟停及實際能力回讀                  | 其他租戶不受影響、無權限                                         | 尚未實作本 task 的驗收                                                   |
| tenant lifecycle  | 合法新增／停用與治理記錄回讀                | 被停用租戶寫入、未授權管理                                       | 既有 governance rollback_hold 回歸非完整生命週期驗收；HTTP／DB spec 待補 |

## 實際指令與結果

以下均在本 task isolated worktree 執行；無 skip 代替成功。

```sh
git fetch origin && git rebase origin/dev
# exit 0

pnpm exec vitest run tests/unit/tenant-partner-foundation.test.ts tests/integ/tenant-governance-negative.test.ts tests/unit/system-remediation/sr-mail-001 tests/unit/system-remediation/sr-mail-002
# exit 0；7 files / 74 tests passed；3.44s
# 郵件 unavailable 與 controlled receiver 為既有負向／測試 transport，不是實際送達證據。

pnpm --filter @drts/api typecheck
# exit 0

pnpm exec eslint tests/e2e/system-remediation/sr-qa-tenant-001 --max-warnings=0
# exit 0

pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001
# exit 1；4 shared harness tests passed，1 tenant HTTP test failed
# Missing required DRTS_UAT_ENV; HTTP acceptance did not run
# worktree 絕對路徑包含 task ID，所以 CLI filter 同時命中 shared tests。

pnpm exec playwright test -c playwright.system-remediation.config.ts 'sr-qa-tenant-001/.*spec.ts$'
# exit 1；同樣 4 passed / 1 failed，同一缺環境原因。

git diff --check
# exit 0
```

失敗時仍產出 `test-results/sr-qa-tenant-001-passenger-49847-adback-and-tenant-isolation/tenant-evidence.json` 與 Playwright attachment。
本次實際 HTTP calls：0；實際資源 IDs：`[]`。沒有生成或冒充 live ID。

## 可重跑環境契約

由環境／IAM 管理員與 harness owner 提供已授權可保留測試資料的 local/sandbox API，以及兩個隔離 tenant 的 tenant_admin bearer sessions：

- `DRTS_UAT_ENV=local` 或 `sandbox`
- `DRTS_UAT_API_URL`：API origin（測試路由為 `/api/tenant/*`）
- `DRTS_UAT_TENANT_A`、`DRTS_UAT_TENANT_B`
- `DRTS_UAT_TOKEN_A`、`DRTS_UAT_TOKEN_B`：分別綁定各 tenant 的真 session；勿提交 token
- `BASE_SHA` 與測試程式的 `CANDIDATE_SHA`；另需環境 owner 讀回被測 API 部署 SHA，不能以測試 HEAD 代替 server SHA

重跑原驗收命令；若只需此案例可加入 `--grep 'C027 passenger/address'`。
正常結束會用權威 upsert API 停用本次建立的乘客與地址並回讀；失敗時保留資源，以 evidence IDs 在隔離環境追查與清理。清單 response 不寫進證據，避免收集無關租戶資料。

HTTP spec 即使通過，也只證明該案例 API 回讀；仍需 DB／重啟耐久性、其餘能力 HTTP spec、角色 UI、真寄信與必要外部 acceptance。尚未完成，未 handoff、未 done。下一步是提供隔離環境並擴充上表未寫案例，不能把這份進度報告當整體验收通過。
