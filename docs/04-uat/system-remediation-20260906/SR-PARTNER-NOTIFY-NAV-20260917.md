# UAT: SR-PARTNER-NOTIFY-NAV-20260917

## 夥伴通知點擊返回正確行程與安全 fresh handoff

**Candidate SHA:** 66de694283bc3a018c2db1215c224115ea8e6b1a
**Branch:** gemini2/sr-partner-notify-nav-20260917
**Base:** dev

### 最新退修修復與驗收 (針對 Codex review 2305a144)

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| 1. [P1] 無 cookie 的 grant-consent 仍可用過期 handoffId 建立/重播登入，繞過撤銷 link 與 entry owner 變更 | `apps/referral-embed-web/app/api/referral/session/route.ts` 驗證 `existingSession`; `tenant-partner.service.ts` 實作 `validateFn` 檢查 entry/owner/link guard; `referral-embed-handoff.repository.ts` 檢查 `consumedAt` / 8hr TTL / missing。 | 舊版 2305a144 在無 cookie 且過期 handoffId 下 POST /api/referral/session 返回 200 寫入 cookie。修正版 66de694 對此等情況返回 403 Missing session 或 403 expired/not_consumed/mismatch 錯誤，拒絕登入與重播。 | 本機 node stdout exit 0，已包含最小重現; CI/PG 證據 pending PR check | 完整 PG consent/正式 authority/BFF 待 hosted CI 執行，本 VM 限制不啟動 PG |
| 2. [P2] returnTo 前綴檢查仍可 open redirect (TAB evasion) | `apps/referral-embed-web/app/api/referral/session/route.ts:45-66` `redirectResponse` 中對 `rawUrl.pathname` 與 `decodedPath` 新增 `[\t\r\n\\]` 檢查。 | 舊版 2305a144 對 `%2F%09%2Freview-redirect.invalid` 會被 WHATWG URL 解析掉 tab 變成 // 繞過。修正版 66de694 對含 `\t` 或反斜線者防禦並回退到 `/`。 | 本機 node probe exit 0; CI 證據 pending | 完整 browser/redirect 測試待 CI 執行 |
| 3. [P2] 合法 null-tenant multi-taxi 完成通知收據讀取失敗 | `apps/api/src/modules/owned-mobility/owned-mobility.service.ts` 中 `getReferralPassengerReceipt` 等處採用新的 `assertPartnerOrderIdentityAsync` (新增 route tenant 驗證) 及 await。 | 舊版 2305a144 `getReferralPassengerReceipt` 查詢 null-tenant 訂單返回 403。修正版 66de694 在 history 查詢合法 route 後放行，保留原 tenant 正向與跨 tenant 負向限制。 | `npm run test:unit -- tests/unit/owned-mobility.test.ts` (vitest exit 0, 40 tests passed) | 完整 receipt API 與導頁、browser 整合待 CI 驗證 |
| 4. PR Base 為 main，trailing whitespace 等問題 | `tests/unit/owned-mobility.test.ts` 移除結尾空白; GH CLI 修改 PR Base | 舊版 PR #2112 Base 為 main，`git diff --check` 有 trailing whitespace (exit 2)。修正版 PR #2123 Base 為 dev，無 trailing whitespace。 | `git diff --check 8c61b575..HEAD` exit 0; `gh pr view 2123 --json baseRefName` -> dev | 無 |
| Acceptance: entry_scoped_navigation_denies_cross_subject_tenant_entry | `tenant-partner.service.ts` 增強 `validateFn` 檢查 tenant/partner; `owned-mobility.service.ts` frozen route 查詢 | 舊版對 null-tenant 直接阻擋。修正版支援正確驗證 route 的 tenant/partner/passenger，並拒絕 cross-tenant。 | `npm run test:unit -- tests/unit/owned-mobility.test.ts` exit 0 (pass); PG tests pending | 完整 PG / 正式 DB 環境待 hosted CI (VM 限制) |
| Acceptance: fresh_single_use_handoff_and_http_only_session_reuse | `route.ts` 與 `referral-embed-handoff.repository.ts` 的 `consumedAt` / expired / `existingSession` 檢查。 | 舊版重播過期 handoff 會給過。修正版對 HTTP Only/Secure session reuse 及 single-use 重播給予 403 拒絕。 | 本機 node probe exit 0 (pass); PG tests pending | 完整 POST/GET / cookie suite 待 hosted CI |
| Acceptance: navigation_reads_current_trip_without_creating_orders | `owned-mobility.service.ts` 中的 `getReferralPassengerReceipt` | 原有 controller/status/consent 限制保留，加入 frozen route async receipt 查詢。無新增 order creation 呼叫。 | `npm run test:unit -- tests/unit/owned-mobility.test.ts` exit 0 (pass) | 完整 receipt / outcome status flow 待 LIVE 整合驗證 |
