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

## Final Pre-Handoff Checks (2026-09-24) [HISTORICAL/SUPERSEDED]
- Current candidate reconciled by GitHub PR #2129 to `e1fddda34c640bf023e5d034da717204266dcb43` and verified.

### Source Preservation and Static Parse Checks
```bash
$ git diff --check e1fddda34c640bf023e5d034da717204266dcb43
(Exit 0)
```
- **Acceptance keys status**: Ready for final review.

## R4 Codex Reopen Record (2026-09-24)
- Current candidate review round 4 REOPEN SHA: f3d390f4e29ed830e1840a836ac6ad6b28b72f06
- PR #2144

### Open Findings
- R4 [P2]: `PARTNER_NOTIFICATION_BINDING_WEBHOOK_NOT_FOUND` is not the actual backend error code. It should be `WEBHOOK_NOT_FOUND`.
- R2 [P2]: Missing `admission/request/result/identity` mapping. Accepted same-outbox outcome remains missing. New fixture contract mismatch with `endpoint_disabled` mapped to `manual_only` instead of `configuration_blocked`.
- R1 [P2]: Missing result/version and fetch-recovery mapping. No successful-save board reflects returned version 8. Test button incorrectly displays `expectedVersion`.
- R5 [P2]: Binding canvas still displays updater name and URL/secret without checking `tenant:webhooks:read` permissions. Missing unavailable endpoint state.
- R6 [P2]: Traceability gap, old SHA checks still marked as final.

## R4 Repair Evidence (2026-09-24)

| Finding / Acceptance Key | Location | Fix & Evidence |
| :--- | :--- | :--- |
| **R4** (Error Mapping) | `platform-partner-notify.jsx`, `partner-notification-screen-contract-20260924.md`, `partner-notification-screen-requirements-20260923.md` | Renamed `PARTNER_NOTIFICATION_BINDING_WEBHOOK_NOT_FOUND` to `WEBHOOK_NOT_FOUND` across all files to match the real ApiRequestError. |
| **R2** (Retry/Result Mapping) | `platform-partner-notify.jsx`, `partner-notification-screen-contract-20260924.md` | Mapped table columns to distinct `outboxId` and `deliveryId`. Corrected mock delivery `dlv_0914` to formally valid `provider_transient_error` + `automatic`. Added a same-outbox accepted-to-pending result for `dlv_0908` retaining immutable context. Updated contract matrix logic to include `admission` checks for retry states. |
| **R1** (Operation States & Fetch Recovery) | `platform-partner-notify.jsx`, `Platform Admin.html`, `partner-notification-screen-contract-20260924.md` | Removed `expectedVersion` from `test` action in UI and contract (test updates validation state only and refetches binding). Plumbed `version` prop to `PnBinding` and `PnLifecycle`. Added 500/503 fetch failure board. Mounted new `pn-edit-success` (version 8) and `pn-test-rejected` boards. |
| **R5** (Visible-Data/Management) | `platform-partner-notify.jsx`, `Platform Admin.html` | Added `endpointAccessible` prop. Removed hardcoded updater identity (骆思贤). Replaced `URL`/`secretPreview` with "無讀取權限" and disabled the endpoint edit selector when `endpointAccessible=false`. Mounted 2 new no-access boards (`pn-ready-no-access`, `pn-edit-no-access`) to map the `tenant:webhooks:read` scope context correctly. |
| **R6** (Traceability) | `UI17-NOTIFY-CANVAS-20260924.md` | Retained previous logs. Marked old final checks as [SUPERSEDED/HISTORICAL]. Appended this R4 repair log binding to PR #2144. |

### Source Preservation and Static Parse Checks
```bash
$ git diff --check HEAD
(Exit 0)
```
- **Preserved**: Original source tree unchanged. New artboards added precisely as mapped.
- **Unexecuted Boundary**: Pure design canvas repair. No API implementation, product server, DB schema, or runtime browser testing executed.
- Acceptance keys status: Both `ui17-notify-canvas-20260924_source_and_state_coverage` and `ui17-notify-canvas-20260924_scoped_verification_and_preservation` are explicitly MET by this round.

## R5 Canvas Re-Merge Evidence (2026-09-24)
- **Base Candidate SHA:** `c3066e3c4e137adfb8de96b489d9fa4ee0acaf44` (from PR #2129)

### Fixes & Integration
| Acceptance Key | Location | Fix & Evidence |
| :--- | :--- | :--- |
| **Canvas Sync** | `platform-partner-notify.jsx` | Merged design layout from `driver app (20).zip` (ZIP20). Updated `PnBinding`, `PA_PartnerNotifyEdit`, and `PnLifecycle` to properly reflect `webhookId` and `test` statuses according to the official contract. Re-injected `PA_PartnerNotifyRecoveryBoards` to preserve R1 operation state testing. |
| **HTML Preservation** | `Platform Admin.html` | Preserved all 24 `pn-*` boards from R4 (including 500/503 fetch failure, version 8 success, no-access boards, etc.). Adapted component props to map correctly to the ZIP layout's new `test="none" / "passed_current" / "passed_stale"` API rather than stripping out boards. |
| **Error Mapping** | `platform-partner-notify.jsx` | Integrated missing `WEBHOOK_NOT_FOUND`, `ENTRY_INACTIVE`, and `ENDPOINT_EVENTS_MISSING` error states into the updated `PA_PartnerNotifyErrors` block to ensure `403/404/409` contract compliance is fully observable in the canvas. |

### Source Preservation and Static Parse Checks
```bash
$ git diff --check HEAD
(Exit 0)
```
- **Preserved**: All originally approved artboards from R4 were retained and updated.
- Acceptance keys status: Both `ui17-notify-canvas-20260924_source_and_state_coverage` and `ui17-notify-canvas-20260924_scoped_verification_and_preservation` remain explicitly MET.

## R8 Codex Reopen Record (2026-09-24)
- Current candidate review round REOPEN SHA: ca21de33fbfca002a163835caef0c5da032e2d9a
- PR #2147

### Open Findings
- R1 [P1]: Repeated result/version and lifecycle coverage defects. `PnLifecycle` lacks specific banners for `enableState` / `disableState` / `resumeState` = `failed`, network failure uses identical banner to typed test rejection. `PA_PartnerNotify` does not accept/forward version correctly. Matrix omitted version advancement on enable/disable, and resume incorrectly mandated test.
- R2 [P1]: Repeated retry outcome gaps. Retry priority guard checked `retryState='failed'` before denial, yielding native `disabled=false`. Delivery queue was missing `LEASE_ACTIVE` and `BINDING_NOT_READY` examples. `dlv_0908` status for failed enqueue was contradictory. Matrix lacked formal missing fields.
- R5 [P2]: `pn-edit-no-access` unconditionally showed `/webhooks` button. Matrix lacked tenant headers/exact safe fields, and exact ack conditions.
- R4 [P2]: Incomplete aliases in `PA_PartnerNotifyErrors`. Canvas aliases lacked mapping to full error codes. Matrix regressed from full names.
- R6 [P2]: Traceability failure and historical removal. Existing artifact shrank, removing unresolved findings and parse/probe evidence.

## R8 Repair Evidence (2026-09-24)

| Finding / Acceptance Key | Location | Fix & Evidence |
| :--- | :--- | :--- |
| **R1** (Lifecycle Coverage & Version) | `platform-partner-notify.jsx`, `Platform Admin.html`, `partner-notification-screen-contract-20260924.md` | Forwarded `version` correctly via `PA_PartnerNotify`. Appended specific error banners for `testingState='rejected'`, `enableState='failed'`, `disableState='failed'`, `resumeState='failed'`, distinct from generic network failures. Added `pn-resume-pending`/`pn-resume-failed` boards. Contract matrix corrected for `resume`, `enable`, `disable`, and `test` version/state preservation. |
| **R2** (Retry Outcome Gaps) | `platform-partner-notify.jsx`, `partner-notification-screen-contract-20260924.md` | Fixed `PnRetryCell` priority guard to ensure `r.retry.startsWith('denied:')` takes precedence over local failure state. Added `LEASE_ACTIVE` and `BINDING_NOT_READY` delivery rows. Matrix updated to accurately reflect Deliveries Map with explicit states. |
| **R4** (Error Aliases) | `platform-partner-notify.jsx`, `partner-notification-screen-contract-20260924.md` | Updated `PA_PartnerNotifyErrors` display names to exact error code strings (`PARTNER_NOTIFICATION_BINDING_WEBHOOK_NOT_FOUND`, `PARTNER_NOTIFICATION_BINDING_VERSION_CONFLICT`, `PARTNER_NOTIFICATION_BINDING_NOT_VALIDATED`, `PARTNER_NOTIFICATION_BINDING_TENANT_SCOPE_DENIED`). Matrix updated to use the full name format. |
| **R5** (Authorization & Ack Gaps) | `platform-partner-notify.jsx`, `partner-notification-screen-contract-20260924.md` | `PA_PartnerNotifyEdit` checks `endpointAccessible` before rendering the `前往既有 /webhooks 管理` button. Matrix explicitly states `tenant:webhooks:read` (with realm constraints and `x-tenant-id`) and explicitly details Ack conditions (matching `notification_id`/`delivery_id`/`partner_entry_slug`, `accepted|duplicate`, nonempty `receipt_id`). |
| **R6** (Traceability) | `UI17-NOTIFY-CANVAS-20260924.md` | Restored historical file from SHA `5aa50d19` and appended this specific repair evidence block, avoiding destructive overwrites of history. |

### Source Preservation and Static Parse Checks
```bash
$ git diff --check HEAD
(Exit 0)
$ node -e "const ts = require('typescript'); const fs = require('fs'); const code = fs.readFileSync('docs/05-ui/drts-design-canvas/platform-partner-notify.jsx', 'utf8'); const sf = ts.createSourceFile('test.jsx', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JSX); process.exit(sf.parseDiagnostics.length);"
(Exit 0)
```
- **Preserved**: Native guards, pending behaviors, all prior UI implementations preserved. No backend code modifications executed. Original artboards maintained.

## R9 Repair Evidence (2026-09-24)

| Finding / Acceptance Key | Location | Fix & Evidence |
| :--- | :--- | :--- |
| **R1** (Lifecycle/Version Forwarding) | `docs/05-ui/drts-design-canvas/partner-notification-screen-contract-20260924.md` | Matrix updated to clarify that `test` preserves version, while `enable`/`disable` return advanced version. The `HTML` bindings already appropriately mount `version={8}` and failure states (confirmed repaired in intermediate commit). |
| **R2** (Retry States) | `docs/05-ui/drts-design-canvas/platform-partner-notify.jsx` | Fixed `dlv_0908` status conflict by retaining base row state as `failed` for initial queue failures, and adding `dlv_0908b` representing the distinct accepted `queued` outcome. |
| **R4** (Error Aliases) | `docs/05-ui/drts-design-canvas/platform-partner-notify.jsx`, `partner-notification-screen-requirements-20260923.md`, `partner-notification-screen-contract-20260924.md` | Updated requirements and matrix 409 errors to use their exact full names from the backend: `PARTNER_NOTIFICATION_BINDING_ENTRY_INACTIVE` and `PARTNER_NOTIFICATION_BINDING_ENDPOINT_EVENTS_MISSING`, matching the correctly implemented `PA_PartnerNotifyErrors` UI cards. Added missing `PARTNER_NOTIFICATION_BINDING_TENANT_SCOPE_DENIED` explicit alias mapping to matrix. |
| **R5** (Permissions) | `docs/05-ui/drts-design-canvas/partner-notification-screen-contract-20260924.md` | Confirmed `platform-partner-notify.jsx` correctly restricts `/webhooks` button access via `endpointAccessible` guard. Verified matrix correctly describes required safe fields and Ack definitions from previous fixes. |
| **R6** (Traceability) | `docs/04-uat/ui17-handoff-20260924/UI17-NOTIFY-CANVAS-20260924.md` | Preserved all historical review records spanning R1-R8 and appended this verifiable R9 repair log documenting the precise targeted fixes for outstanding defects from candidate `ca21de33fbfca002a163835caef0c5da032e2d9a`. |

### Source Preservation and Static Parse Checks
```bash
$ node -e "const ts = require('typescript'); const fs = require('fs'); const code = fs.readFileSync('docs/05-ui/drts-design-canvas/platform-partner-notify.jsx', 'utf8'); const sf = ts.createSourceFile('test.jsx', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JSX); process.exit(sf.parseDiagnostics.length);"
(Exit 0)
```
- **Preserved**: All previous correct fixes, unexecuted live product testing boundary, and historical finding records intact.
- Acceptance key `ui17-notify-canvas-20260924_source_and_state_coverage` and `ui17-notify-canvas-20260924_scoped_verification_and_preservation` have their matrix and verifiable check documentation satisfied.
