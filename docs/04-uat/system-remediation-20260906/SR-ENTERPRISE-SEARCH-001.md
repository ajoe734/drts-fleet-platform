# SR-ENTERPRISE-SEARCH-001 — 企業歷史查詢條件與結果一致

## 2026-09-09 02:03 UTC dispatch 核實（本次最新）

- Owner Codex；Reviewer Codex2；branch `codex/sr-enterprise-search-001`。Fetched base `origin/dev`: `7d04833053b63558c10fb678a422dff3522e0150`；受測工作 HEAD: `681bc2fd025837ab1531feb1ec32c04866a1e2da`。尚無 candidate SHA；本次為 blocker evidence anchor，不能作 handoff candidate。
- 已讀 collaboration guide、execution ref、task spec、R24／C013／C069 與 dispatch report。Scope 仍只有 page、專屬 tests、本文。
- `git fetch origin` exit 0；`git rebase origin/dev` exit 1，歷史 `903969279` 在 page、test、evidence 衝突；`git rebase --abort` exit 0。沒有保留衝突或改寫已發布歷史。分支尚未完成整合最新 dev，後續候選仍須解決 rebase。
- 使用 `git show origin/dev:<path>` 核對最新 API（各次讀取 exit 0）：`apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:461` 只接 tenant/request headers；service 同目錄 `owned-mobility.service.ts:2118` 只按 tenant 過濾，固定 page 1、pageSize/totalItems 為 items.length；`packages/api-client/src/index.ts:1192` 的 `listTenantBookings()` 沒有 query 參數；enterprise `lib/api-client.ts:59` wrapper 亦無參數。後端日期／乘客／狀態 query 與分頁能力仍缺。
- `AI_NAME=Codex /home/lupin/workspace/drts-fleet-platform/tools/development-orchestrator/bin/ai-status.sh show SR-BOOKING-VERIFY` exit 1：`Task not found: SR-BOOKING-VERIFY`。
- `pnpm --filter @drts/enterprise-dispatch-web typecheck` exit 0。
- `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/` exit 0：1 file、50 tests passed，02:02:38 UTC，2.93s。這是上述工作 HEAD 的 synthetic unit regression，非最新 dev 或 live API 驗收；本次依賴錯誤未再出現。
- `git diff --check` exit 0。此次只更新本文，沒有 UI 修改。
- 未啟動產品／瀏覽器伺服器或 Docker；未做 live API／真機／部署，沒有實際 query、response total 或資源 ID。既有 synthetic IDs 不冒充實際資源。

解除阻擋需要 supervisor 指定或登錄後端 filter producer（task spec 的 SR-BOOKING-VERIFY 目前不存在），加入依賴並擴充必要 API／contract／client／wrapper scope。此前不能以本地陣列篩選代替要求的 API query／total。本次 commit、普通 push 後記錄 blocker，不 handoff、不 done。

## 2026-09-08 21:19 UTC dispatch 核實（最新，取代先前成功驗證推論）

- Owner Codex；Reviewer Codex2。Fetched origin/dev：`e97653b7ffb962a6c4d688e8706711d860fa3604`；工作分支受測 HEAD：`7e2edeeccb9eaeddc2f2bed9b6435955835eebee`。無 handoff candidate。
- `git fetch origin` exit 0；`git rebase origin/dev` exit 1，重播歷史 `903969279` 時 page、test、evidence 衝突；`git rebase --abort` exit 0，保留原有已發布分支，未強推或回退 trunk。
- 直接 `git show origin/dev:apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` 核對 GET tenant/bookings 仍只接 headers，沒有 query。相同方式讀 service：`listTenantBookings(tenantId)` 只按 tenant 過濾，pagination 固定 page 1、pageSize/totalItems 為 items.length。讀 `packages/api-client/src/index.ts`：`listTenantBookings()` 仍無參數；enterprise wrapper 亦無參數。上述讀取命令 exit 0。
- `ai-status.sh show SR-BOOKING-VERIFY` exit 1：Task not found。此 task spec 指定的後端 producer 尚未能解析；需 supervisor 登錄／指定 producer、補依賴及 contract/client/wrapper scope 才能接線。
- `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/` exit 1：Cannot find package react，1 failed suite、0 tests；另有 vitest/config unresolved warning。
- `pnpm --filter @drts/enterprise-dispatch-web typecheck` exit 2：TS2688 Cannot find type definition file vitest/globals。這次 worker 的依賴環境不能重現前次通過結果。
- `git diff --check` exit 0。此次僅更新證據，不改 UI。未執行 live API／瀏覽器／真機／部署；沒有實際 query、response total 或資源 ID。現有 synthetic unit data 不作 live 成功證據。

阻擋：後端 filter 能力仍缺、指定 producer 不存在，且目前 scope 不允許修改 API/client。歷史 rebase 衝突與本機依賴缺失也需在候選驗證前解決。本次 anchor 普通 push 後以 blocker 落盤，不 handoff、不 done。

## 2026-09-08 17:16 UTC 再派工核實（最新）

- 本次 fetched base：`e2df37f821ce76d8a3639ceaac6d253299c0a31c`。
- `git rebase origin/dev` exit 0；受測 SHA：`169cac6b0c68ddd9067ac481301ea1f3e15606de`。
- 為保留已發布 ancestry 並允許普通 push，執行 `git merge --no-edit origin/codex/sr-enterprise-search-001`，exit 0；merge 前後 tree 無差異。
- `pnpm --filter @drts/enterprise-dispatch-web typecheck`：exit 0。
- `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/`：exit 0；1 file、50 tests passed，17:16:13 UTC，791ms。
- `git diff --check`：exit 0。

PR #1792 的 `c52f580ff0aec310324639de7134a7ffa9421c0c` 只新增
`support/unblock/SR-ENTERPRISE-SEARCH-001/SR-ENTERPRISE-SEARCH-001-UNBLOCK-HISTORY-REPAIR.md`。
該報告明定 parent remains blocked on backend capability planning；它沒有修改 API，也沒有授權共用 scope。
本次核實 controller 第 459 行、service 第 2048 行及 enterprise API wrapper 第 59 行，仍與下方缺口相同：不接收 query、固定 page 1，全量陣列只在前端篩選。

因此本次只有證據更新，沒有修改 UI 或新增視覺設計，沒有 handoff candidate。
精確保存進度的 commit SHA 由 task board 記錄。未執行 live API、瀏覽器、真機或部署；沒有實際 query／response total／資源 ID，synthetic unit IDs 不算實際資源。
請 supervisor 指定或登錄真正的後端 filter producer，補入 parent depends_on，並授權所需 contract/client/wrapper scope；歷史修復完成不能解除此能力阻擋。

## 2026-09-08 Codex 接手核實

- Owner: Codex；Reviewer: Gemini。
- Branch: `codex/sr-enterprise-search-001`。
- 本次 `git fetch origin && git rebase origin/dev` exit 0。
- Base SHA: `c171ea5126c1a7c19fa090429b2965bbac106768`。
- 接手並 rebase 後受測 SHA: `c7ce7c6cdec75e55502970938ce865124397cfc7`。
- 本次提交為保存進度的 anchor，尚無 handoff candidate；精確 anchor SHA 記入 task board。
- 舊分支五筆提交已保留。歷史 audit SHA 不作目前程式真值。

## 來源與實際缺口

Task spec: `docs/03-runbooks/system-remediation-20260906/SR-ENTERPRISE-SEARCH-001.md`；execution ref: `docs/03-runbooks/system-remediation-execution-tasks-20260906.md`。
追溯 `source/findings.json` R24（企業歷史缺日期／乘客／狀態搜尋），以及 `source/capabilities.json` C013、C069。

`git show origin/dev:apps/enterprise-dispatch-web/app/bookings/page.tsx` 顯示 base 仍只渲染 `EnterpriseBookingHistory`。接手分支則有客戶端組合篩選、清除、日期及分頁函式。

本次直接檢查目前程式：

- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts:459` 的 GET tenant/bookings 僅讀 tenant/request headers，沒有 query DTO，也沒有傳遞篩選或分頁參數。
- `owned-mobility.service.ts:2048` 的 `listTenantBookings(tenantId)` 篩選 in-memory orders 的 tenantId，回傳全部 items；pagination 固定 page 1，totalItems 為 items.length。
- `apps/enterprise-dispatch-web/lib/api-client.ts:59` 的 `listBookings()` 沒有 query 參數，回傳 BookingRecord[]。
- 任務頁面呼叫一次 listBookings，再本地篩選與切頁。這是本地全量陣列篩選，尚非 API 同條件 query／total／pagination。
- 頁面 currentUser 預設仍來自 enterpriseUser.name fixture；提供 prop 的函式測試不代表真實登入身分已接線。

任務明定「若 API 缺 filter 必須在 SR-BOOKING-VERIFY 取得後端能力後才結案」。現有 write_scopes 不包含 API、client 或身分接線共用檔案；不能自行擴寫或將後端能力降為可選優化。請 supervisor 明確指定後端 producer，補入依賴及必要 scope；不能自行把 SR-BOOKING-VERIFY 等同 SR-QA-BOOKING-001。

## 證據更正

取代舊版將 Section 12 稱為權威 API 整合驗收的說法。該測試以 createMockBooking 建立五筆 synthetic BookingRecord；`booking-authoritative-001` 至 `005`、`ord-auth-*` 均是測試字串，並非真實資源 ID。測試只呼叫前端 filter/paginate 函式，沒有 HTTP query 或 API response。

本次已將測試段落名稱、變數及註解改為 synthetic unit coverage，保留既有回歸案例。沒有修改 UI、設計或新增視覺方案。

## 本次實際指令結果

工作目錄：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/codex-sr-enterprise-search-001`。

| 指令 | 結果 |
| --- | --- |
| `git fetch origin && git rebase origin/dev` | exit 0，五筆提交成功 rebase |
| `pnpm --filter @drts/enterprise-dispatch-web typecheck` | exit 0，tsc --noEmit |
| `pnpm exec vitest run tests/unit/system-remediation/sr-enterprise-search-001/` | exit 0，1 file / 50 tests passed；16:58:09 UTC，1.20s |

上述測試證明本地函式回歸，不能證明 API 篩選能力或 live 總數。

## 未完成與解除阻擋條件

尚未執行 live API／瀏覽器／真機驗證；沒有真實 query、response total 或資源 ID 證據。新接手也未驗證 Next production build 或 UI canvas 一致性。不得將既有 UI 實作視為已核准候選。

待 supervisor 補齊後端 producer 依賴及可寫範圍後，以正式 API 篩選契約接線，取得同 query 的總數、頁次與資源 ID，再驗證清除、組合篩選、空狀態與翻頁。完成後才提交候選 SHA、普通 push 並 handoff Gemini；本次只保存進度並記錄 blocker，不呼叫 done。
