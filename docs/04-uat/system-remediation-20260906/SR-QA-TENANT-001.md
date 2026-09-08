# SR-QA-TENANT-001 — 驗收進度（未完成）

Owner Codex2 / Reviewer Codex。2026-09-08。

Base / tested product SHA：`408679a7041bce027209222a68fc95b1f5f93141`，本次 fetch 後 rebase 至 origin/dev。
Tested anchor：`c5d3d51aa85918247bab5c9f97abb0c789776d78`，已普通 push 至 `origin/codex2/sr-qa-tenant-001`。
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
| users / invites   | 建立使用者、邀請啟用後身份及角色回讀        | 過期、撤銷、重用與 delivery unavailable                          | 新增 users HTTP 建立／角色修改／停用回讀、重複 email／跨租戶修改／空白角色拒絕；缺環境未發請求，邀請啟用／DB／真收件未驗                              |
| cost centres      | 新增、更新、訂單引用及停用                  | 外租戶引用、停用後使用                                           | 已補 HTTP 新增／更新／停用回讀、跨租戶讀取／停用拒絕、空白名稱拒絕及 activeOnly 排除；訂單／owner 關聯與 DB 待補                  |
| quota             | 保留、取消返還、月結與使用量回讀            | 額度不足、跨月／時區、並發超額                                   | 既有 governance 回歸非完整配額驗收；HTTP／Postgres 並發待補              |
| rules / approvals | 規則評估、核准／拒絕後訂單狀態與 audit 回讀 | 非核准者、無權限、重複決策                                       | 既有 governance/mail service 回歸已跑；HTTP／DB spec 待補                |
| SLA               | 修改設定、違約摘要與手動升級回讀            | 未授權修改、無效設定                                             | 既有 governance service 回歸非完整 SLA 驗收；HTTP／DB spec 待補          |
| feature flags     | 指定租戶啟停及實際能力回讀                  | 其他租戶不受影響、無權限                                         | 尚未實作本 task 的驗收                                                   |
| tenant lifecycle  | 合法新增／停用與治理記錄回讀                | 被停用租戶寫入、未授權管理                                       | 既有 governance rollback_hold 回歸非完整生命週期驗收；HTTP／DB spec 待補 |

## 18:12 UTC dispatch 實際結果

最新 base 與 tested anchor 如頁首。新增 `users.spec.ts` 依 `CreateTenantUserCommand`、`UpdateTenantRoleCommand` 及 `/api/tenant/users` controller/service，建立 invited user 後獨立 GET 清單回讀；覆蓋重複 email 409、外租戶角色修改 404、空白角色 400、拒絕後原值不變、另一租戶清單隔離及角色更新。成功路徑撤銷邀請、停用使用者後再回讀。失敗時保留 evidence ID 供清理；若 create 在送信階段失敗且尚未回傳 ID，需由測試 mailbox 查找已持久化使用者。

建立使用者會呼叫真實 invitation delivery，因此另要求 `DRTS_UAT_USER_EMAIL` 是隔離測試收件器的全新地址；每次重跑使用新地址。測試本身不證明信件送達、邀請啟用、session 撤銷或 audit／DB 耐久性。

```sh
pnpm exec eslint tests/e2e/system-remediation/sr-qa-tenant-001 --max-warnings=0
# exit 0
git diff --check
# exit 0
BASE_SHA=408679a7041bce027209222a68fc95b1f5f93141 pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001
# exit 1；4 shared harness passed / 3 tenant HTTP failed；1.3s
# 全部 HTTP 案例：Missing required DRTS_UAT_ENV; HTTP acceptance did not run
pnpm exec vitest run tests/unit/tenant-partner-foundation.test.ts tests/integ/tenant-governance-negative.test.ts tests/unit/system-remediation/sr-mail-001 tests/unit/system-remediation/sr-mail-002
# exit 0；7 files / 74 tests passed；3.79s
pnpm --filter @drts/api typecheck
# exit 0（API package，不代表 Playwright spec 的完整 TS typecheck）
```

三份 `test-results/sr-qa-tenant-001-*/tenant-evidence.json` 已讀回驗證：base=`408679a7041bce027209222a68fc95b1f5f93141`、head=`c5d3d51aa85918247bab5c9f97abb0c789776d78`、status=failed、exitCode=1、各 0 HTTP、`trackedResources=[]`。新增 users 證據路徑為 `test-results/sr-qa-tenant-001-users-Ten-d3318-update-and-tenant-isolation/tenant-evidence.json`。無 live 資源 ID，無產品失敗重現可據以建立修復 child。

`git fetch origin && git rebase origin/dev` exit 0。為保留已發布 anchors 的 ancestry，再 merge 遠端 task branch；merge 的 `git diff HEAD^ HEAD --stat` 為空。普通 push exit 0，未 force push。尚未 handoff；仍需隔離 API、兩租戶合法 sessions、專用收件地址與實際部署 SHA，以及上表其餘能力驗收。

## 18:06 UTC dispatch 實際結果（歷史 base a44ea852）

在歷史 tested anchor `0600ad941919d8584c88c8b2aa863cf5b3586d31` 執行：

```sh
pnpm exec vitest run tests/unit/tenant-partner-foundation.test.ts tests/integ/tenant-governance-negative.test.ts tests/unit/system-remediation/sr-mail-001 tests/unit/system-remediation/sr-mail-002
# exit 0；7 files / 74 passed；10.38s
pnpm --filter @drts/api typecheck
# exit 0
pnpm exec eslint tests/e2e/system-remediation/sr-qa-tenant-001 --max-warnings=0
# exit 0
git diff --check
# exit 0
BASE_SHA=a44ea852eabe0c88e54d8124802eccf86ebc1dc6 pnpm exec playwright test -c playwright.system-remediation.config.ts sr-qa-tenant-001
# exit 1；4 shared harness passed / 2 tenant HTTP failed；6.1s
# 兩例均 Missing required DRTS_UAT_ENV; HTTP acceptance did not run
```

兩份 `tenant-evidence.json` 回讀均為上述 base/head SHA、`status=failed`、`exitCode=1`、HTTP calls 0、`trackedResources=[]`：

- `test-results/sr-qa-tenant-001-cost-cent-17a69-isable-and-tenant-isolation/tenant-evidence.json`
- `test-results/sr-qa-tenant-001-passenger-49847-adback-and-tenant-isolation/tenant-evidence.json`

新增 `cost-center.spec.ts` 沿用權威 controller / contracts；代碼依 tenant 分區，跨租戶驗證採 GET 與 disable 拒絕，不能把另一租戶使用相同 code 的合法 upsert 誤當越權。測試成功會停用本次成本中心並回讀停用原因與 activeOnly 排除；失敗時依 evidence ID 清理。未驗證成本中心與訂單、owner、quota 關聯及持久化耐久性。

rebase 後首次普通 push exit 1（non-fast-forward）。以 merge 接回 `origin/codex2/sr-qa-tenant-001` 已發布 anchors，`git diff HEAD^ HEAD --stat` 為空，無產品檔案回退；新增測試 anchor 後普通 push exit 0。未 force push。

## 前次實際指令與結果（歷史 base fa0fd825）

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
