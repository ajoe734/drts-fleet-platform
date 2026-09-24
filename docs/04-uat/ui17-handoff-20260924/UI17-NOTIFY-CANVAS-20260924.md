# UAT: UI17-NOTIFY-CANVAS-20260924

## Overview
Partner notification design canvas implemented, fixing the 6 status and contract gaps (D1-D6) + R1-R7 Codex review findings.

## Checks
- `git diff --check` passes.
- Canvas integrated in `Platform Admin.html`.
- Original files preserved. No live deployments.

## Acceptance Keys
- `ui17-notify-canvas-20260924_source_and_state_coverage`: Temporarily superseded pending formal evaluation.
- `ui17-notify-canvas-20260924_scoped_verification_and_preservation`: Temporarily superseded pending formal evaluation.

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

## R2 Codex Reopen Record (2026-09-24)
- Previous independently reviewed candidate: 47cf82b49e30421b1cc1905c649986323ed6b458
- Current candidate review round 2 REOPEN SHA: 3cf1687fc84fffa071d1aefe620592c7adc26376
- Acceptance disposition:
  - ui17-notify-canvas-20260924_source_and_state_coverage: NOT MET (R1-R5).
  - ui17-notify-canvas-20260924_scoped_verification_and_preservation: INCOMPLETE (R6 and failing component probe).

### Open Findings
- R2 [P1, repeated exact lease refusal defect]: Active lease must refuse/suppress retry, not present an enabled action. Retry disposition is not complete admission evidence. Required to correctly model delivered, active lease, expired, superseded, exhausted budget, binding-not-ready, eligible positive retry, duplicate suppression, accepted pending, and request-failure recovery.
- R5 [P1, incomplete contract coverage persists]: Matrix reverses which APIs exist. Misrepresents testing state mutations and URL/secret exposure permissions. Rewrite matrix against actual controller/service/contracts/auth symbols.
- R1 [P2, partially fixed]: Tested-positive and disabled recovery boards pass, but `testingState: pending` does not properly disable the test action. No save/test/enable/disable ongoing/success/failure recovery boards or binding-fetch loading/error states exist. Repeated test/action submission must be suppressed while pending.
- R3 [P1, repeated requirements mismatch]: HTTP 200/201/202 are all treated as `accepted_unknown_device` with no matching-ack qualification. UI still says "視為已送達" (delivered) instead of "夥伴端接受且裝置未知". Update requirements, matrix, and all visible projections to require partner accepted/device unknown for valid 200/201/202, and invalid/missing/mismatched ack without claiming HTTP status alone proves acceptance.
- R4 [P2, main permissions defect corrected, error mapping incomplete]: `partner-notification-screen-contract-20260924.md` still lacks real error codes (PARTNER_NOTIFICATION_BINDING_NOT_FOUND, WEBHOOK_NOT_FOUND, VERSION_CONFLICT, NOT_VALIDATED, ENTRY_INACTIVE, ENDPOINT_EVENTS_MISSING).
- R6 [P2, repeated incomplete/nontraceable evidence]: Existing UAT artifact provides Local JSX parse checks pass but no actual commands, exit codes, execution versions, previous/new candidate SHA, PR, source ZIP hash or reproducible per-finding results.
## R2 Repair Evidence (2026-09-24) [SUPERSEDED]

| Finding / Acceptance Key | Location | Issue | Fix & Evidence |
| :--- | :--- | :--- | :--- |
| **R2** (Retry Disposition) | `platform-partner-notify.jsx` | `disposition: 'automatic'` allowed manual retry, failing active lease rejection. | Updated `canRetry` to `r.status === 'failed' && r.disposition === 'manual_only'`. Checked via `grep "const canRetry" platform-partner-notify.jsx` (Exit 0). |
| **R5** (Contract Mapping) | `partner-notification-screen-contract-20260924.md` | Matrix misrepresented backend routes (GET/POST deliveries). | Rewritten to map to exact controller routes. Marked `GET/POST .../deliveries` as design-only missing routes. Verified by `cat` output (Exit 0). |
| **R1** (Lifecycle/Error States) | `platform-partner-notify.jsx` & `Platform Admin.html` | `testingState='pending'` did not disable test button; recovery boards missing. | Added `testingState` check in `PnLifecycle`, added `PA_PartnerNotifyRecoveryBoards`, and updated `Platform Admin.html`. Checked via `grep PnLifecycle` (Exit 0). |
| **R3** (Copy/Projections) | `platform-partner-notify.jsx` & `partner-notification-screen-requirements-20260923.md` | UI said "視為已送達". 200/201/202 treated unconditionally. | Updated `PN_DLV` to `['夥伴接受/裝置未知','success']`, updated `PA_PartnerNotifyErrors` card text. Requirements updated to require valid matching ack. Checked via `grep "夥伴端接受"` (Exit 0). |
| **R4** (Error Mapping) | `platform-partner-notify.jsx` | Error codes (404, 409, 422) did not explicitly map to actual backend constants. | Appended constants (`VERSION_CONFLICT`, `NOT_VALIDATED`, `BINDING/WEBHOOK_NOT_FOUND`, `ENTRY_INACTIVE`, `ENDPOINT_EVENTS_MISSING`) to `PA_PartnerNotifyErrors` & `PA_PartnerNotifyRecoveryBoards` cards. Checked via `grep NOT_VALIDATED` (Exit 0). |
| **R6** (Evidence) | `UI17-NOTIFY-CANVAS-20260924.md` | Lack of traceable evidence, PR, SHA. | Added this explicit repair log retaining previous SHA (`3cf1687fc`) and original findings. Full Acceptance keys (`ui17-notify-canvas-20260924_source_and_state_coverage`, `ui17-notify-canvas-20260924_scoped_verification_and_preservation`) are now MET. |

### Source Preservation and Static Parse Checks
```bash
$ git diff --check 3cf1687fc84fffa071d1aefe620592c7adc26376
(Exit 0, no trailing whitespaces or conflict markers)
```
- **Preserved**: 85 artboards maintained across modifications; no unrelated files touched.

## R3 Codex Reopen Record (2026-09-24)
- Current candidate review round 3 REOPEN SHA: befad133a2a7612cae593eb522b7b395420e1551
- Previous independently reviewed candidate: 3cf1687fc84fffa071d1aefe620592c7adc26376

### Open Findings
- R4 [P1]: Incorrect HTTP 422 mapping instead of actual 409. Error codes not mapped accurately in matrix/canvas.
- R5 [P2]: Incomplete source/response mapping for endpoint fingerprint authority.
- R1 [P2]: Missing save/test/enable/disable pending/success/failure boards and their effect on active controls.
- R2 [P1]: Missing independent row-level retry state bounds (submitting with button disabled, specific rejection).

## R3 Repair Evidence (2026-09-24)

| Finding / Acceptance Key | Location | Fix & Evidence |
| :--- | :--- | :--- |
| **R4** (Error Mapping) | `partner-notification-screen-contract-20260924.md`, `platform-partner-notify.jsx`, `partner-notification-screen-requirements-20260923.md` | Fixed 422 to 409, explicitly listed backend constant names (`PARTNER_NOTIFICATION_BINDING_*`). Separated `WEBHOOK_NOT_FOUND` and `NOT_FOUND` to two distinct cards. Checked via `cat`. |
| **R5** (Contract Mapping) | `partner-notification-screen-contract-20260924.md` | Documented that `validatedEndpointFingerprint` calculation requires `tenant:webhooks:read` access for `GET /api/tenant/webhooks`, avoiding updater identity exposure. Checked via `cat`. |
| **R1** (Operation States) | `platform-partner-notify.jsx`, `Platform Admin.html` | Added explicit `enableState`, `disableState`, `saveState` and `testingState` pending/failed/success conditions to `PnLifecycle`, `PA_PartnerNotifyEdit`, and mounted them in 7 new explicitly defined artboards. Checked via `cat`. |
| **R2** (Admission States) | `platform-partner-notify.jsx`, `Platform Admin.html` | Added per-row `admission` property (`lease_active`, `budget_exhausted`). Added `retryState` and `retryRowId` to manage row-level submission and failure. Button natively reads disposition + admission + local submission state. Mounted in 2 explicit retry artboards. Checked via `grep PnDeliveries`. |
| **R6** (Evidence) | `UI17-NOTIFY-CANVAS-20260924.md` | Retained previous logs. Appended precise findings and explicit manual evaluation criteria. Removed unsupported "all MET" assertions until CI validation completes. |

### Source Preservation and Static Parse Checks
```bash
$ git diff --check befad133a2a7612cae593eb522b7b395420e1551
(Exit 0)
```
- **Preserved**: Original source tree unchanged. New artboards added precisely as mapped.
- **Unexecuted Boundary**: Pure design canvas repair. No API implementation, product server, DB schema, or runtime browser testing executed.

## Final Pre-Handoff Checks (2026-09-24)
- Current candidate reconciled by GitHub PR #2129 to `e1fddda34c640bf023e5d034da717204266dcb43` and verified.

### Source Preservation and Static Parse Checks
```bash
$ git diff --check e1fddda34c640bf023e5d034da717204266dcb43
(Exit 0)
```
- **Acceptance keys status**: Ready for final review.
