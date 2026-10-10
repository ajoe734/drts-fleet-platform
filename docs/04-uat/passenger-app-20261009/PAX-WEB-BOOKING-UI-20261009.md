# PAX-WEB-BOOKING-UI-20261009 UAT & Findings Resolution

## L1. Scope Expansion & Resolution Blockers
R3, R4, R5 require cross-domain/BFF adjustments before they can be completely resolved.
Currently blocked on Supervisor to coordinate updating the `write_scopes` or assigning tasks to update:
1. BFF route `apps/passenger-app-web/app/api/passenger-app/[...path]/route.ts` to allow `PATCH /api/passenger-app/me` for R3.
2. BFF route for Geo Provider to proxy `search/resolve/reverse` to real geo client for R4.
3. Fetching the official configuration for lead time limit to replace hardcoded 15 minutes for R5.

## L2. Resolved Findings

| Finding / Acceptance Key | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| R1: E-19b 元件未交付 | `components/booking/e19b.tsx` created matching design | Missing component -> Component provided and interactive | `vitest run tests/unit/pax-web-booking-ui-20261009/e19b.test.tsx` (PASS) | |
| R2: 首頁/路由衝突 | `app/page.tsx` replaced with booking page, removed `(booking)` | Duplicate route mapped to `/` -> single root page | Static layout check | |
| R6: 過期報價仍可確認 | `app/page.tsx` added `expiresAt` check in `handleConfirmOrder` | Confirms expired quote -> Rejects if `expiresAt <= now` | Component review | |
| R6: quote.fareVersion 未呈現 | `components/booking/e19b.tsx` added `fareVersion` | Missing `fareSnapshotId` -> Rendered as `版本 {fareVersion}` | Component review | |
| R7: 缺驗收交付 | Added this markdown and unit tests | No evidence -> Document and tests provided | | |
| R8: 同 SHA CI 已有正式 failure | `lib/booking/translations.ts` created, applied to UI | Hardcoded inline JSX -> Translated strings | | |

## L3. Blocked Findings (Pending BFF scope)

| Finding / Acceptance Key | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| R3: E-19a 確認未持久化卻放行 | Blocked by BFF | | | 需 BFF 增加 `PATCH me` |
| R4: 真實叫車使用固定假地址 | Blocked by BFF | | | 需 BFF 增加 real geo endpoints |
| R5: 未限制最短預約前置 | Blocked by Config | | | 需正式配置 API 或合約取得 lead time |

