# UAT: SR-PARTNER-NOTIFY-NAV-20260917

## 夥伴通知點擊返回正確行程與安全 fresh handoff

**Candidate SHA:** 63bbada8cac131749ae3b9179163f3cf0dbc8766
**Branch:** gemini2/sr-partner-notify-nav-20260917
**Base:** dev

### 最新退修修復與驗收 (針對 Codex review 2305a144)

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| 1. [P1] 無 cookie 的 grant-consent 仍可用過期 handoffId 建立/重播登入 | `apps/referral-embed-web/app/api/referral/session/route.ts:152-180`<br>`tenant-partner.service.ts:5835-5842`<br>`referral-embed-handoff.repository.ts:266-369` | 舊版對 missing existingSession 仍呼叫同意 API 並寫 cookie，且缺少 consumedAt 與 owner/link 檢查。修正版已加入 session presence 要求、過期時間與消耗狀態檢查，並補齊 validateFn 拒絕 revoke/owner changed。 | Node probe 邏輯確認；靜態源碼審查。修正版正確拒絕 unconsumed/expired/revoked。 | 完整 PG / browser 待 hosted CI 執行 |
| 2. [P2] returnTo 前綴檢查仍可 open redirect | `apps/referral-embed-web/app/api/referral/session/route.ts:45-59` | 舊版僅檢查前綴 `//` 及 `/\`，可被 TAB bypass (如 `/\t/`)。修正版加入 `targetUrl.origin !== requestUrl.origin` 比較，確保跳轉目的地嚴格限制為同源。 | Node URL 解析靜態驗證；TAB/CR/LF 均會觸發 origin 變化而被捕獲並導向 `/`。 | 完整端對端 HTTP Request 測試待 hosted CI |
| 3. [P2] 合法 null-tenant multi-taxi 完成通知仍不能取得收據 | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts:13774-13775` 等 `assertPartnerOrderIdentityAsync` | 舊版中 `tenantId=null` 直接與 identity tenant 判 mismatch。修正版沿用 `frozen route` 做窄授權，當 `order.tenantId === null` 時核對 route 的 tenant 與 partner，正確放行合法查詢。 | 源碼已改為非同步呼叫 `assertPartnerOrderIdentityAsync`；靜態依賴及邏輯確認正負向皆正確覆蓋。 | PG fixture 及實際 DB 查詢結果待 hosted CI 驗證 |
| 4. [P2] PR base/evidence 與 trailing whitespace | `tests/unit/owned-mobility.test.ts` / git branch | 舊版 PR base 錯誤且有 trailing whitespace。修正版已將 base 正確定為 `dev`，清理了程式碼中的 trailing whitespace，並使用全新 candidate SHA 推送以觸發正確 CI 流程。 | `git diff --check origin/dev..HEAD` exit 0 (無 trailing whitespace) | hosted CI/PG 證據待 push 後由 GitHub bus 取得 |
| Acceptance: entry_scoped_navigation_denies_cross_subject_tenant_entry | `owned-mobility.service.ts` 的 async receipt 及 `tenant-partner.service.ts` | 修正版完成 frozen-route receipt 授權，並補齊了同意重播漏洞中的 tenant/partner owner/link 檢查。 | 靜態依據核對 (pass) | 完整 PG / 正式 authority 矩陣待 CI |
| Acceptance: fresh_single_use_handoff_and_http_only_session_reuse | `route.ts` 及 `referral-embed-handoff.repository.ts` | 補充了 `existingSession` 檢查與 `consumedAt` 過期拒絕。防止強制清 cookie 後接管。 | 靜態依據核對 (pass) | 完整 POST/GET / cookie suite 待 CI |
| Acceptance: navigation_reads_current_trip_without_creating_orders | `owned-mobility.service.ts` | 靜態確認 `getReferralPassengerReceipt` 等查詢不會產生訂單，並正確利用 frozen route 放行 null-tenant 收據。 | 靜態依據核對 (pass) | browser/native/live flow 待驗證 |
