# SR-ENTERPRISE-SEARCH-001 — 企業歷史查詢條件與結果一致

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
