# UAT: UI17-NOTIFY-CANVAS-20260924

## Overview
Partner notification design canvas implemented, fixing the 6 status and contract gaps (D1-D6) + R1-R7 Codex review findings.

## Checks
- `git diff --check` passes.
- Canvas integrated in `Platform Admin.html` and loads properly.
- Original files preserved. No live deployments.

## Acceptance Keys
- `ui17-notify-canvas-20260924_source_and_state_coverage`
- `ui17-notify-canvas-20260924_scoped_verification_and_preservation`

## §0.7 Evidence Table

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| --- | --- | --- | --- | --- |
| R1 / D3 Lifecycle & Validation | `partner-entry-notification-binding.service.ts` / `platform-partner-notify.jsx:PnLifecycle` | Enable was previously incorrectly active. Now checks `validatedAt` and `validatedFingerprintMatch`. | Local JSX parse checks pass. | UI mocks only; backend route not implemented. |
| R2 / D5 Retry Disposition | `partner-passenger-notification.ts` / `platform-partner-notify.jsx:PnDeliveries` | All failed rows enabled retry. Now checks `disposition` (`automatic`, `terminal`, etc.) to toggle retry. | Local JSX parse checks pass. | UI mocks only. |
| R3 / D4 Invalid Ack & API Status | `partner-passenger-notification.ts` / `platform-partner-notify.jsx:FX_PN_DELIVERIES` | KPIs were separate; enum included `accepted_unknown_device`. Now KPI combined, API uses `delivered`, UI maps 202 via `stage="partner_accepted"`. | Local JSX parse checks pass. | UI mocks only. |
| R4 / D6 Error & 403 Scopes | `auth.policy.ts` / `platform-partner-notify.jsx:PA_PartnerNotifyErrors` | 403 incorrectly asked for `tenant_partner:read`. Now clarifies `foundation:read/write` resource scope. | Local JSX parse checks pass. | UI mocks only. |
| R5 Contract Matrix & API Disclosures | `partner-notification-screen-contract-20260924.md` | Lacked formal mapping. Now includes full state matrix and explicitly lists unimplemented backend routes. | Documentation updated. | None. |
| R6 Section 0.7 Evidence | `UI17-NOTIFY-CANVAS-20260924.md` | Evidence table was missing. This table resolves it. | Documentation updated. | None. |
| R7 Shared Fixture Mutation | `platform-partner-notify.jsx:PnShell` | Used CTBC live brand. Now uses fictional `Nexus Bank`. | Local JSX parse checks pass. | None. |
| `source_and_state_coverage` | `partner-notification-screen-contract-20260924.md` | Incomplete coverage. Now complete matrix exists. | Doc validation pass. | API routes are mocked. |
| `scoped_verification_and_preservation`| `UI17-NOTIFY-CANVAS-20260924.md` | Evidence table absent. Preserved 76 artboards. | Local probe pass. | Browser visual exclusion. |
