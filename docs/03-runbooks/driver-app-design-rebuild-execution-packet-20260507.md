# Driver App Design Rebuild Execution Packet

Date: 2026-05-07
Source design archive: `docs/05-ui/driver app.zip`
Extracted source: `docs/05-ui/driver-app-design-20260507/`

## Purpose

Rebuild the driver app UI from the supplied high-fidelity design source instead of iterating on the current placeholder-style implementation.

This packet is intentionally execution-oriented. Workers must treat the design source as the visual source of truth for layout, copy, hierarchy, tokens, status semantics, and multi-platform behavior.

## Design Source Inventory

- `tokens.jsx`: canonical visual tokens, typography, color roles, spacing, radius, light/dark theme values.
- `components.jsx`: shared primitives: `Chip`, `PlatformBadge`, `AuthorityBanner`, `Card`, `Button`, `Section`, `BottomTabs`, `TopBar`, `Kpi`, `Switch`, `Row`, `MapPlaceholder`, `StatusDot`.
- `driver-screens-1.jsx`: provisioning, workspace cockpit A/B variants, platform connection overview, urgent items.
- `driver-screens-2.jsx`: unified task inbox A/B variants and trip operation states.
- `driver-screens-3.jsx`: platform presence, earnings, shift, SOS, settings.
- `mgmt-screens.jsx`: ops console forwarded-order board and platform admin adapter registry.
- `DRTS Driver App.html`: artboard index and required screen coverage.

## Visual Direction

- Product feel: modern fintech-ish operational cockpit, not default mobile demo UI.
- Surface system: cool neutral app background `#F6F8FB`, white raised cards, soft borders, restrained shadows.
- Brand: deep teal-blue `#0F4C75` for DRTS-owned authority.
- External platform accent: warm amber `#B45309` for forwarded/platform-authoritative orders.
- Status tones:
  - Success: `#0F7B5A`
  - Warning: `#A8590B`
  - Danger: `#B42318`
  - Info: `#1F5DB8`
  - Neutral: `#475569`
- Typography: Inter + Noto Sans TC intent in design; React Native implementation should preserve equivalent scale/weight/letter-spacing using the existing Expo font constraints if custom font loading is not already wired.
- Shape: cards `14-18px`, buttons/chips pill or 8-12px, not square Material defaults.

## Required Driver Screens

### 1. Provisioning / Device Activation

Source: `ScreenProvisioning` in `driver-screens-1.jsx`.

Must implement:

- Brand tile `D`.
- Title `裝置啟用`.
- Three activation steps:
  - `裝置註冊`
  - `駕駛身份驗證`
  - `平台帳號連線`
- Registration form prefilled for test mode:
  - registration code: `driver-demo-001`
  - device name: `Driver Pixel 01`
- Primary action `註冊此裝置`.
- Warning block explaining inactive devices cannot receive dispatch.

Acceptance:

- App does not show the current plain onboarding page.
- Test defaults remain overridable through existing envs.
- `pnpm --filter @drts/driver-app typecheck` passes.

### 2. Workspace Cockpit

Source: `ScreenWorkspace` and `ScreenWorkspaceB`.

Must implement:

- Greeting, shift status, notification button.
- Hero next-action card with trip continuation.
- KPI strip:
  - `待處理`
  - `已上線`
  - `今日淨收`
- Reauthorization alert for `Metro Hail`.
- Platform connection list with switches and forwarded chips.
- Quick links to task inbox, earnings, shift, SOS.
- Bottom tabs with active home state.
- Narrow-device support equivalent to source artboards.

Acceptance:

- Workspace is recognizably rebuilt from the design source.
- Platform connection summary includes owned and forwarded platforms.
- No placeholder card-only dashboard remains.

### 3. Unified Task Inbox

Source: `ScreenInbox`, `ScreenInboxB`, `TaskCard`, `DenseTaskRow`.

Must implement:

- Header `任務`, filter button, KPI strip.
- Filter pills:
  - `全部`
  - `待處理`
  - `進行中`
  - `平台結案`
  - `需同步`
- Task cards for owned and forwarded orders.
- Forwarded order cards use amber border/left rail.
- Status mappings:
  - `in_progress` -> `進行中`
  - `offered` -> `可接單`
  - `accept_pending` -> `等待平台確認`
  - `confirmed` -> `平台已確認`
  - `lost_race` -> `其他司機已接`
  - `cancelled` -> `平台取消`
  - `sync_failed` -> `同步異常`
- Sync-failed warning copy: `需派車台處理，請等待指示`.

Acceptance:

- Inbox supports at least card layout; dense layout may be implemented as reusable row components or deferred behind props, but the design vocabulary must be present.
- Task states must be data-driven, not hardcoded only in JSX branches.

### 4. Trip Operation / External Platform Race Flow

Source: `ScreenTrip`.

Must implement states:

- `owned_active`
- `forwarded_offered`
- `forwarded_pending`
- `forwarded_confirmed`
- `forwarded_lost`
- `forwarded_cancelled` if backend data exposes it; otherwise keep mapping-ready.
- `sync_failed`

Required UI:

- Top bar with SOS action.
- Authority banner:
  - owned: `自營派單`, full local operation authority.
  - forwarded: external platform controls acceptance/confirmation.
- Map placeholder or route display styled per design.
- Route stops, metrics, status row.
- Lock/blocked bodies for waiting, lost race, sync failed.
- Sticky bottom action bar:
  - forwarded offered: `拒絕` + `接受平台訂單`
  - primary local action for active/confirmed trips
  - disabled waiting state for blocked states

Acceptance:

- Driver cannot start forwarded trip while `accept_pending`.
- Lost-race/sync-failed states are safe and explicit.
- Existing completion-proof / trip workflow tests keep passing or are updated intentionally.

### 5. Platform Presence

Source: `ScreenPlatform`.

Must implement:

- Header `平台連線`, summary `3 個平台 · 2 上線 · 1 需處理`.
- KPI row for available platforms, completed today, required action.
- Platform cards for:
  - DRTS owned dispatch
  - SmartRides X
  - Metro Hail
- Token expiry, last sync, today count, online/offline/reauth state.
- Reauthorization CTA for expired platforms.
- Info note explaining online status affects order receiving.

Acceptance:

- Uses shared `PlatformHealthCard` / platform status primitives where practical.
- Separates owned vs forwarded authority visually.

### 6. Earnings

Source: `ScreenEarnings`.

Must implement:

- Net income card with gross, platform fee, pending settlement.
- Per-platform breakdown:
  - DRTS: DRTS settlement authority
  - SmartRides X: platform settlement authority
  - Metro Hail: empty/degraded state
- Monthly statement rows.

Acceptance:

- External platform earnings are marked as reference/platform-authoritative.
- Existing money formatting helpers are reused.

### 7. Shift

Source: `ScreenShift`.

Must implement:

- Active shift card, timer, vehicle, odometer, start location, expected off time.
- Today summary KPIs.
- Multi-platform availability section.
- Sticky danger outline `下班打卡`.

Acceptance:

- Existing shift screen behavior stays intact.
- Visual hierarchy follows the design.

### 8. SOS / Incident

Source: `ScreenSOS`.

Must implement:

- Emergency header card.
- Situation category grid:
  - `乘客衝突`
  - `交通事故`
  - `車輛故障`
  - `醫療緊急`
  - `路線威脅`
  - `其他`
- Current order context card with platform badge and external order details.
- Bottom bar: `取消` + `長按確認求援`.

Acceptance:

- Existing incident creation tests remain meaningful.
- SOS screen includes platform/order context.

### 9. Settings

Source: `ScreenSettings`.

Must implement:

- Profile card for driver identity.
- Platform binding section:
  - DRTS bound
  - SmartRides X bound + expiry
  - Metro Hail reauth
- Preference rows:
  - language
  - max accept radius
  - auto accept
  - notifications
- Other rows:
  - emergency contact
  - device info
  - logout

Acceptance:

- Existing settings form logic is preserved.
- Platform bindings use the same visual language as platform presence.

## Required Management Screens

### 10. Ops Console Forwarded-Order Board

Source: `OpsForwardedBoard`.

Must implement or align existing ops console page with:

- KPI strip for active, waiting confirmation, sync failed, forwarded today, average accept time, manual fallback.
- Forwarded order table with mirror ID, platform, external ID, status, native status, candidate/accepted driver, error, age.
- Detail panel for selected order.
- Actions:
  - force sync native status
  - enable manual fallback
  - mark sync failed

Acceptance:

- Existing ops console routes remain working.
- Visual copy and status terms align with source design.

### 11. Platform Admin Adapter Registry

Source: `AdminAdapterRegistry`.

Must implement or align existing platform admin registry with:

- Adapter list with environment, enabled state, credential state, webhook state, health check, rollout.
- Adapters:
  - DRTS
  - SmartRides X
  - Metro Hail
  - Grab TW sandbox
- Policy card for SmartRides X.
- Feature flag card:
  - driver accepts external orders
  - driver rejects external orders
  - platform earnings page
  - platform presence page

Acceptance:

- Must preserve current `ADM-MP-001` platform adapter registry work if already in progress.
- Do not duplicate contracts; use existing `packages/contracts/src/platform-adapter-registry.ts` if present.

## Task Breakdown

### DRV-UI-001 — Design Token And Primitive Rebuild

Owner: Codex2
Reviewer: Claude2

Scope:

- `apps/driver-app/components/ui/tokens.ts`
- `apps/driver-app/components/ui/*`
- `apps/driver-app/components/platform-task-badge.tsx`
- `apps/driver-app/components/platform-status-card.tsx`

Work:

- Port design tokens from `tokens.jsx`.
- Add/align primitives matching `components.jsx`.
- Keep APIs stable enough for existing screens.

Acceptance:

- `pnpm --filter @drts/driver-app typecheck`

### DRV-UI-002 — Provisioning And Workspace Rebuild

Owner: Claude
Reviewer: Codex
Depends on: DRV-UI-001

Scope:

- `apps/driver-app/app/onboarding.tsx`
- `apps/driver-app/app/index.tsx`
- workspace-specific components if needed

Work:

- Rebuild provisioning and workspace cockpit from design.
- Preserve test registration defaults.

Acceptance:

- `pnpm --filter @drts/driver-app typecheck`
- `pnpm --filter @drts/driver-app test -- --run tests/unit/driver-identity-bootstrap.test.ts`

### DRV-UI-003 — Unified Task Inbox Rebuild

Owner: Claude2
Reviewer: Codex2
Depends on: DRV-UI-001

Scope:

- `apps/driver-app/app/jobs.tsx`
- `apps/driver-app/components/platform-task-badge.tsx`
- task inbox components

Work:

- Implement task cards, filter pills, KPIs, forwarded/owned authority styling.

Acceptance:

- `pnpm --filter @drts/driver-app typecheck`

### DRV-UI-004 — Trip Race Flow Rebuild

Owner: Codex
Reviewer: Claude2
Depends on: DRV-UI-001

Scope:

- `apps/driver-app/app/trip.tsx`
- `apps/driver-app/components/route-display.tsx`
- `apps/driver-app/lib/trip-workflow.ts`

Work:

- Implement trip operation UI states from design.
- Preserve workflow safety for forwarded `accept_pending`, `lost_race`, `sync_failed`.

Acceptance:

- `pnpm --filter @drts/driver-app typecheck`
- `pnpm --filter @drts/driver-app test -- --run tests/unit/route-display.test.ts tests/unit/completion-proof.test.ts`

### DRV-UI-005 — Platform Presence Rebuild

Owner: Gemini2
Reviewer: Codex
Depends on: DRV-UI-001

Scope:

- `apps/driver-app/app/platform-presence.tsx`
- `apps/driver-app/components/platform-status-card.tsx`

Work:

- Implement platform cards, token/reauth status, info note, KPI row.

Acceptance:

- `pnpm --filter @drts/driver-app typecheck`

### DRV-UI-006 — Earnings Rebuild

Owner: Claude2
Reviewer: Codex
Depends on: DRV-UI-001

Scope:

- `apps/driver-app/app/earnings.tsx`
- `apps/driver-app/components/earnings-by-platform.tsx`
- `apps/driver-app/lib/money.ts`

Work:

- Implement net-income card, per-platform authority breakdown, monthly statements.

Acceptance:

- `pnpm --filter @drts/driver-app typecheck`

### DRV-UI-007 — Shift Rebuild

Owner: Codex2
Reviewer: Claude
Depends on: DRV-UI-001

Scope:

- `apps/driver-app/app/shift.tsx`

Work:

- Implement active shift card, summary KPIs, platform availability, sticky clock-out action.

Acceptance:

- `pnpm --filter @drts/driver-app typecheck`

### DRV-UI-008 — SOS / Incident Rebuild

Owner: Claude
Reviewer: Codex2
Depends on: DRV-UI-001

Scope:

- `apps/driver-app/app/incident.tsx`
- incident screen tests

Work:

- Implement emergency category grid, current platform order context, long-press confirmation affordance.

Acceptance:

- `pnpm --filter @drts/driver-app typecheck`
- `pnpm --filter @drts/driver-app test -- --run tests/unit/incident-screen.test.ts`

### DRV-UI-009 — Settings Rebuild

Owner: Gemini2
Reviewer: Claude2
Depends on: DRV-UI-001

Scope:

- `apps/driver-app/app/settings.tsx`
- `apps/driver-app/components/platform-binding.tsx`
- `apps/driver-app/lib/settings-form.ts`

Work:

- Implement profile, platform binding, preferences, emergency contact/device/logout sections.

Acceptance:

- `pnpm --filter @drts/driver-app typecheck`

### OPS-UI-001 — Ops Forwarded-Order Board Alignment

Owner: Codex
Reviewer: Claude2

Scope:

- `apps/ops-console-web`
- shared client/contracts only if needed

Work:

- Align forwarded-order board with `OpsForwardedBoard` design.

Acceptance:

- `pnpm --filter @drts/ops-console-web typecheck`

### ADM-UI-001 — Platform Admin Registry Visual Alignment

Owner: Gemini
Reviewer: Codex

Scope:

- `apps/platform-admin-web`
- `packages/contracts/src/platform-adapter-registry.ts` only if compatible with ADM-MP-001

Work:

- Align adapter registry visuals with `AdminAdapterRegistry` design.
- Coordinate with `ADM-MP-001`; do not overwrite its in-progress registry model.

Acceptance:

- `pnpm --filter @drts/platform-admin-web typecheck`

### DRV-UI-010 — Design QA And Android Verification Packet

Owner: Claude2
Reviewer: Codex
Depends on: DRV-UI-002, DRV-UI-003, DRV-UI-004, DRV-UI-005, DRV-UI-006, DRV-UI-007, DRV-UI-008, DRV-UI-009

Scope:

- `support/sidecars/DRV-UI-010/`
- no runtime changes unless trivial screenshot/test harness fixes are needed

Work:

- Compare implemented screens against design source.
- Record missing deltas, typecheck/test results, Android/emulator visual verification status.

Acceptance:

- `pnpm --filter @drts/driver-app typecheck`
- `pnpm --filter @drts/driver-app test`
- Visual verification packet filed.

## Execution Guardrails

- Do not edit unrelated active work outside assigned scope.
- Do not revert current multi-platform API/admin worker changes.
- If a worker cannot run shell, it must still edit files and record verification blocker honestly.
- Machine truth must be updated through `scripts/ai-status.sh` or `scripts/ai_status.py`.
- Design source files under `docs/05-ui/driver-app-design-20260507/` are reference artifacts; do not rewrite them during implementation.
- The existing Expo/React Native app is the target; do not replace it with web-only preview output.
