# SR-PARTNER-NOTIFY-FIX-HISTORY-20260927 UAT Evidence

## Finding: R12 / C222: history BFF fabricates HTTP 200 success for unknown orders

### Source Code Changed
- `apps/referral-embed-web/app/api/referral/history/[orderId]/route.ts`: Removed fallback to `status: "CONFIRMED"` and added check for missing items, returning actual denial/not-found contract (404) if `item` is not found.
- `tests/unit/system-remediation/sr-partner-notify-fix-history-20260927/history-route.test.ts`: Added unit tests verifying correct 404 for unknown orders, cross-tenant, wrong subject, and 400 for no session.

### QA Execution Evidence

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| own_history_read_preserved | `apps/referral-embed-web/app/api/referral/history/[orderId]/route.ts` BFF route | Parent `585087a2fd8114eaac0eb8a470dfca58e13dfbe4`: own cancelled item preserved exactly at 200.<br>Candidate `25e401c8a1d891877398b90a9dbf083e7162f55f`: own cancelled item preserved exactly at 200. | read-only in-memory node probe loaded production GET directly from immutable Git blobs, real NextResponse, only session/fetch mocked; Node v22.23.2, TypeScript 5.9.3, exit 0, 14 scenario groups. | This validates BFF behavior, not actual backend authorization, PG or browser integration. |
| foreign_unknown_and_unauthenticated_history_denied | `apps/referral-embed-web/app/api/referral/history/[orderId]/route.ts` BFF route | Parent `585087a2fd8114eaac0eb8a470dfca58e13dfbe4`: unknown/wrong subject/same-tenant other-entry/cross-tenant all 200 fake CONFIRMED. Absent and inactive session 400/ok=false.<br>Candidate `25e401c8a1d891877398b90a9dbf083e7162f55f`: all four 404/ok=false. Absent and inactive session 400/ok=false. | read-only in-memory node probe loaded production GET directly from immutable Git blobs, real NextResponse, only session/fetch mocked; Node v22.23.2, TypeScript 5.9.3, exit 0, 14 scenario groups. | This validates BFF behavior, not actual backend authorization, PG or browser integration. |
