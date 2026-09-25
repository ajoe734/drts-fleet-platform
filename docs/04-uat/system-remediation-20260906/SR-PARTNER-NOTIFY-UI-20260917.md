# SR-PARTNER-NOTIFY-UI-20260917 UAT Document

## Acceptance Criteria Verified

- `entry_notification_admin_uses_real_binding_and_delivery_data`:
  - **Status**: UNVERIFIED (PENDING CI)
  - **Reason**: The `partner-notification-panel.tsx` interacts with the real binding and delivery API. Verification depends on CI PG test. No browser testing or live E2E was performed.
- `manual_retry_preserves_single_outbox_owner_and_fence`:
  - **Status**: UNVERIFIED (PENDING CI)
  - **Reason**: `multi-taxi.repository.ts` uses single owner checks and writes an audit trail. Verification depends on CI PG test.
- `ui_states_do_not_claim_device_delivery_and_no_secret_disclosure`:
  - **Status**: UNVERIFIED (PENDING CI)
  - **Reason**: i18n text mapped via delivered/pending states, correctly reporting backend states instead of inventing device assertions. Requires CI test for real component rendering. No UI live testing performed.

## Handoff Evidence (Gemini)

- **Candidate Branch**: gemini/sr-partner-notify-ui-20260924-canvas
- **Candidate SHA**: c53813b3a3d78e46e66dbe732686fb04fc5bdeec
- **Hosted CI Evidence**:
  - CI: PR #2155 pending checks for c53813b3a (Run: pending new push).
  - Postgres Gate (CI): UNPERFORMED locally (Requires hosted DB; `RUN_UI_PG_GATE=true PARTNER_NOTIFY_UI_TEST_DATABASE_URL=... vitest run ...` returned SKIP).
- **Local Evidence**:
  - `pnpm exec tsc -p apps/platform-admin-web/tsconfig.json --noEmit`: Exit 0
  - `pnpm exec tsc -p tsconfig.json --noEmit`: Exit 0
  - `pnpm run i18n:guard`: Exit 0
  - `pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui.test.ts`: PASS (3 client API mock tests, Exit 0)
  - `RUN_UI_PG_GATE=true PARTNER_NOTIFY_UI_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_fleet_platform pnpm exec vitest run tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui.postgres.test.ts`: SKIPPED locally (ECONNREFUSED).

## Old/New Reproduction & Boundaries

- **Old**: The notification panel allowed setting arbitrary event types (e.g. `ride_assigned`), leading to `400 PARTNER_NOTIFICATION_BINDING_EVENT_TYPES_INVALID` when saving. The retry logic evaluated invalid target comparisons, failing legitimate retries without creating a delivery context.
- **New**: The panel correctly binds to explicitly authorized events (`eta_changed`, `receipt_ready`, etc.) matching backend catalog limits. Retry uses the context webhook ID and validates readiness exactly as the primary producer pipeline.
- **Limits**: We have applied strictly static fixes. The actual UAT relies entirely on CI execution (PG tests) since the local VM cannot spin up Postgres per deployment scope restrictions. No live device/E2E UI delivery was asserted.

## Review Findings Resolution (Codex2)

| Finding／驗收項                         | 原始碼依據與修改位置                                                                                                    | 舊版重現 → 修正版結果                                                                                                                                                                            | 命令、退出碼、執行版本與證據位置                            | 未驗項與具體限制                |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------- |
| R1. invalid binding events default      | `partner-notification-panel.tsx`, `packages/api-client/src/index.ts:4881`                                               | 舊: 預設選取五個不合法事件, ApiClient.testBinding 回傳 RequeueOutcome<br/>新: 僅提供合法的 contract 事件, ApiClient 正確回傳 PartnerNotificationDispatchOutcome                                  | Node TypeScript API signature check (Exit 0)                | 未驗: 實際 API 呼叫需由 CI 執行 |
| R2. invalid retry context matching      | `apps/api/src/modules/multi-taxi/multi-taxi.repository.ts:1753,1974`                                                    | 舊: 漏載 ctx.webhook_id, 比對錯誤導致合法 retry 被拒<br/>新: 正確自 db 讀取 webhook_id 並與 readiness.binding.webhookId 比對                                                                     | Node TypeScript API signature check (Exit 0), local DB skip | 實際行為由 CI PG 測試捕捉       |
| R3. outbox event type lookup missing    | `apps/api/src/modules/multi-taxi/multi-taxi.repository.ts`                                                              | 舊: 讀取不存在的 eventType 導致 route_missing<br/>新: 從 ctx.wire_payload 讀取並 fallback 至真實 outbox.event_type                                                                               | Node TypeScript API signature check (Exit 0)                | 實際行為由 CI PG 測試捕捉       |
| R4. bad context versions / defaults     | `apps/api/src/modules/multi-taxi/multi-taxi.repository.ts:1985,2007`                                                    | 舊: 讀取錯誤的 version path，並自行給予 default maxAttempts=3<br/>新: 重用真實 producer payload version 與 readiness maxAttempts                                                                 | Node TypeScript API signature check (Exit 0)                | 實際行為由 CI PG 測試捕捉       |
| R5. invalid PG fixtures & coverage      | `tests/unit/system-remediation/sr-partner-notify-ui-20260917/notification-ui.postgres.test.ts`, `apps/api/package.json` | 舊: insert tenant_id 導致錯誤，vitest 未發現 test<br/>新: 透過 record insert 產生 tenant_id, 修正 pg jsonb_build_object parameter type inference 讓 CI 可正常執行                                 | `vitest run ...` skip (沒有 DB)                             | 依賴 Hosted CI 執行 PG test     |
| R6. unsupported UAT claims & CI config  | `.github/workflows/ci.yml`, `.github/workflows/ci-integ.yml`                                                            | 舊: 移除了 CI 中的 PG variables 和 verify script<br/>新: 恢復 PG variables，加入 UI db 變數                                                                                                      | 文件靜態檢查                                                | CI 需等待 push 後觸發           |
| R7. UI Web scope violation & raw colors | `apps/platform-admin-web/components/partner-notification-panel.tsx`                                                     | 舊: 使用未經授權設計、hardcode 標題和色碼<br/>新: 使用 CanvasCard/CanvasPill 搭配 `@drts/ui-tokens` theme                                                                                        | `pnpm run i18n:guard` (Exit 0)                              | UI 視覺需由預覽或 E2E 驗證      |
| R8. evidence mismatch & RTL claims      | `docs/04-uat/system-remediation-20260906/SR-PARTNER-NOTIFY-UI-20260917.md`                                              | 舊: 宣稱不存在的 RTL component test PASS，狀態不實<br/>新: 如實記載 Pending CI 與 unperformed 本機結果                                                                                           | 靜態文件核對                                                | 無                              |
| UI20 Design Audit Gaps (D1-D4)          | `apps/platform-admin-web/components/partner-notification-panel.tsx`                                                     | 舊: 權限名錯、resume按鈕無效、預留值不符、目標未知時使用假資料<br/>新: 權限名改為 `tenant:webhooks:write`，`PanelActionBtn` 改傳 native `disabled` 給 `CanvasBtn` 鎖定，按鈕文字與 fallback 修正 | 靜態文件核對 (Exit 0)                                       | 無                              |
