# Driver App Productization Design Plan

**Date:** 2026-05-04  
**Scope:** `apps/driver-app` Expo Router + React Native driver surface  
**Goal:** Turn every driver app page from a functional Phase 1 surface into a coherent, production-grade mobile workflow with a shared design contract and explicit materialize execution tasks.

## 1. Current Page Inventory

| Route / Surface      | File                                                  | Current Role                                                         | Current Design / Productization Gaps                                                                                                                                                     | Target Priority      |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `/`                  | `apps/driver-app/app/index.tsx`                       | Redirect to onboarding                                               | No user-facing design; acceptable as redirect-only route.                                                                                                                                | P2                   |
| App shell            | `apps/driver-app/app/_layout.tsx`                     | Stack shell, heartbeat/session bootstrap                             | Header titles were recently localized, but there is no app-level navigation model, no bottom navigation, and no shared page frame.                                                       | P0                   |
| `/onboarding`        | `apps/driver-app/app/onboarding.tsx`                  | Device provisioning, degraded recovery, workstation entry            | Recently improved from prototype, but still uses page-local styling and card-heavy visual rules. Needs to become the canonical home/workstation under shared design tokens.              | P0                   |
| `/jobs`              | `apps/driver-app/app/jobs.tsx`                        | Task inbox                                                           | Basic list, many local colors, text link footer, emoji lock indicator, no filtering, no primary task affordance, no consistent empty/error/loading states.                               | P0                   |
| `/trip`              | `apps/driver-app/app/trip.tsx`                        | Active trip workflow, route, metrics, proof, task actions, SOS entry | Functionally dense but visually unstructured. All task actions render at once, proof/route/metrics are stacked, button hierarchy is weak, and this page has the highest regression risk. | P0                   |
| `/incident`          | `apps/driver-app/app/incident.tsx`                    | SOS / safety incident creation                                       | Stronger visual direction than other pages, but uses text-as-button, no two-step critical confirmation, no live context preview, and no shared danger-state components.                  | P0                   |
| `/platform-presence` | `apps/driver-app/app/platform-presence.tsx`           | Platform online/offline and re-auth                                  | Duplicates logic with `PlatformStatusCard`, uses emoji re-auth action, local card styles, English-like raw platform status values, weak token urgency scan.                              | P1                   |
| `/earnings`          | `apps/driver-app/app/earnings.tsx`                    | Earnings by period and statements                                    | Functional but plain. Period toggle is text-only, platform cards are isolated from page design, no KPI summary, no payout risk state, weak empty/error handling.                         | P1                   |
| `/shift`             | `apps/driver-app/app/shift.tsx`                       | Clock in/out and active shift                                        | Contains hard-coded `driver-demo-001`, text buttons, emoji active indicator, local form styles, no clear clock-in review state. This is both UX and correctness debt.                    | P0                   |
| `/settings`          | `apps/driver-app/app/settings.tsx`                    | Profile, preferences, platform binding                               | Long undifferentiated form, text save button, platform binding embedded with English copy, no section-level save/error state, weak validation display.                                   | P1                   |
| `RouteDisplay`       | `apps/driver-app/components/route-display.tsx`        | Route and waypoints inside trip                                      | English copy, optional fields via `any`, edit link that only shows unavailable alert, local styling.                                                                                     | P0 through trip task |
| `PlatformBinding`    | `apps/driver-app/components/platform-binding.tsx`     | Platform account bind/unbind in settings                             | Mostly English copy, local button styles, no shared validation UI, duplicates platform status concepts.                                                                                  | P1                   |
| `PlatformStatusCard` | `apps/driver-app/components/platform-status-card.tsx` | Platform presence card                                               | Not currently used by `/platform-presence`; English copy and duplicated behavior. Needs merge or deletion.                                                                               | P1                   |
| `EarningsByPlatform` | `apps/driver-app/components/earnings-by-platform.tsx` | Expandable earnings card                                             | Uses text chevrons, local palette, card styling separate from page.                                                                                                                      | P1                   |
| `PlatformTaskBadge`  | `apps/driver-app/components/platform-task-badge.tsx`  | Platform badge                                                       | Direct label is English, colors are local, no shared badge contract.                                                                                                                     | P0                   |
| `PlaceholderScreen`  | `apps/driver-app/components/placeholder-screen.tsx`   | Historical bootstrap placeholder                                     | Should not remain in user-facing runtime routes after productization. Keep only if tests or future dev-only surfaces need it.                                                            | P2                   |

## 2. Product Design Direction

This is a driver operations app, not a landing page. The interface must be quiet, fast to scan, and optimized for one-hand mobile use during operational work.

Design principles:

| Principle                   | Requirement                                                                                                                                            |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Task first                  | The first screen must answer: "Am I ready to work?", "What needs action?", and "Where do I go next?"                                                   |
| Operational density         | Use compact headers, status rows, data tiles, and list rows. Avoid marketing hero layouts, decorative cards, and oversized copy.                       |
| Clear state                 | Every route must have loading, disabled, empty, degraded/error, and ready states.                                                                      |
| Shared controls             | Buttons, icon buttons, chips, alerts, empty states, text inputs, toggles, segmented controls, and bottom action bars must come from shared components. |
| Traditional Chinese runtime | User-facing runtime copy should be Traditional Chinese unless it is a platform brand or technical identifier.                                          |
| No raw prototype signals    | No raw route names, no English placeholders, no emoji as primary UI, no text-only buttons for primary actions, no hard-coded demo driver IDs.          |
| Stable mobile layout        | Buttons and chips must have stable dimensions. Text must wrap cleanly on narrow screens without overlapping badges or controls.                        |

## 3. Shared Design Contract

### 3.1 App Shell

Target shell:

```text
[Status-aware app header]
[Page content]
[Sticky bottom action bar when a page has one primary operation]
[Bottom navigation: 工作台 / 任務 / 行程 / 平台 / 設定]
```

Rules:

| Item              | Spec                                                                                                                                                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header            | Compact, 48-56px visual height, localized title, optional status chip. On `/onboarding` ready state, title should be "工作台"; unprovisioned state should be "裝置配置".                                                           |
| Bottom navigation | Five destinations: `/onboarding`, `/jobs`, `/trip`, `/platform-presence`, `/settings`. Use Ionicons from `@expo/vector-icons`. Do not expose `/incident`, `/earnings`, or `/shift` as primary bottom tabs; link them contextually. |
| Critical actions  | SOS remains reachable from `/trip` and optionally via a small danger icon in the app header after P0 shell work.                                                                                                                   |
| Navigation labels | Use Chinese labels in navigation: 工作台, 任務, 行程, 平台, 設定.                                                                                                                                                                  |

### 3.2 Tokens

These tokens should live in a shared file such as `apps/driver-app/components/ui/tokens.ts`.

| Token Group | Values                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------- |
| Surface     | `appBg #F5F7FA`, `surface #FFFFFF`, `surfaceMuted #EEF2F6`, `surfaceWarning #FFF7E6`, `surfaceDanger #FFF1F2` |
| Text        | `textStrong #17202A`, `textBody #344054`, `textMuted #667085`, `textInverse #FFFFFF`                          |
| Action      | `primary #0B63CE`, `primaryPressed #0956B3`, `danger #C81E1E`, `success #18864B`, `warning #B7791F`           |
| Border      | `border #D8DEE7`, `borderStrong #B8C0CC`                                                                      |
| Radius      | `xs 4`, `sm 6`, `md 8`; avoid radius above 8 except native circular icon buttons or avatars.                  |
| Spacing     | `4, 8, 12, 16, 20, 24`; page horizontal padding 16.                                                           |
| Type        | Screen title 24/30, section title 18/24, body 15/22, label 13/18, micro 12/16. Letter spacing 0.              |

### 3.3 Shared Components

Create or normalize these before page materialization:

| Component          | Purpose                                                            | Notes                                                       |
| ------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| `AppScreen`        | Shared safe-area page frame, loading/error/empty wrapper support   | Avoid repeated `center/container` styles.                   |
| `PageHeader`       | Compact page title, subtitle, optional right action/status         | Replaces page-local title blocks.                           |
| `ActionButton`     | Primary, secondary, danger, ghost button with optional Ionicon     | Replaces text-as-button.                                    |
| `IconButton`       | Compact icon action with accessibility label                       | Replaces emoji action controls.                             |
| `StatusChip`       | Small status/tone chip                                             | Used for task, platform, route-lock, payout, feature gate.  |
| `InfoTile`         | Compact metric tile                                                | Used for earnings totals, trip distance/time, active shift. |
| `ListCard`         | Repeated list item with title, meta, status area, press affordance | Used for jobs, statements, platform accounts.               |
| `SegmentedControl` | Period/filter controls                                             | Replaces text tabs.                                         |
| `FormField`        | Label + input + help/error text                                    | Settings, shift, proof fields, provisioning.                |
| `EmptyState`       | Shared empty/disabled/degraded copy and optional action            | All pages.                                                  |
| `ErrorBanner`      | Inline API/validation error                                        | Replaces raw red text.                                      |
| `BottomActionBar`  | Sticky mobile action group                                         | Trip and shift primary workflows.                           |

## 4. Page Design Specs

### 4.1 `/onboarding` 工作台 / 裝置配置

Target layouts:

```text
Ready:
[Header: 工作台][API 已連線][功能已啟用]
[Readiness strip: 裝置 / 身份 / 平台]
[Action list: 任務收件匣, 行程作業, 平台上線, 收益, 班次]
[Latest issue or next action]

Unprovisioned:
[Header: 裝置配置][待配置]
[Registration code field]
[Device label field]
[Primary: 註冊此裝置]
[安全說明 + dev override visibility]

Degraded:
[Header: 工作台暫時降級]
[Identity / feature flag checks]
[Primary: 重新檢查]
[Secondary: 重新初始化身份 or limited task access when identity is valid]
```

Required states: initializing, unprovisioned, registering, ready, degraded identity failure, degraded feature flag failure.

Acceptance:

| Requirement         | Check                                                                              |
| ------------------- | ---------------------------------------------------------------------------------- |
| No prototype header | `/onboarding` route header remains hidden or replaced by localized app shell.      |
| Workstation entry   | Ready state exposes the main workflow destinations without blue text links.        |
| Safe provisioning   | Unprovisioned state never links to `/jobs` directly.                               |
| Shared UI           | Uses shared `AppScreen`, `ActionButton`, `StatusChip`, `FormField`, `ErrorBanner`. |

### 4.2 `/jobs` 任務收件匣

Target layout:

```text
[Header: 任務收件匣][refresh icon]
[Filter segmented control: 全部 / 待處理 / 進行中 / 平台結案]
[Summary strip: assigned count, forwarded count]
[Task list cards]
[Optional bottom action: 開啟目前行程]
```

Task card fields: task id, status chip, platform chip, route-lock icon, service type chip, order id, short operational note, primary press target to `/trip`.

Required states: loading, feature disabled, empty, error with retry, list refreshing, forwarded terminal task.

Acceptance:

| Requirement         | Check                                                       |
| ------------------- | ----------------------------------------------------------- |
| No emoji lock       | Route lock uses icon/chip.                                  |
| No footer text link | Navigation uses icon button or shared action button.        |
| Task filtering      | At least client-side status filters over fetched task list. |
| Touch target        | Task cards have clear press affordance and stable height.   |

### 4.3 `/trip` 行程作業

Target layout:

```text
[Header: 行程作業][SOS icon]
[Task status panel: task id, status, platform, route lock]
[Route panel]
[Live metrics row: distance, duration, tracking status]
[Compliance panel if present]
[Proof panel only when completion is relevant]
[Sticky bottom action: next allowed action only]
```

Action model:

| Current Task Status   | Primary Action                                            |
| --------------------- | --------------------------------------------------------- |
| assigned / pending    | 接受任務                                                  |
| accepted              | 前往接送點                                                |
| enroute_pickup        | 抵達上車點                                                |
| arrived_pickup        | 開始行程                                                  |
| on_trip               | 完成行程                                                  |
| completed / cancelled | No primary trip mutation action                           |
| forwarded task        | No local mutation; show source-platform management notice |

Required states: loading, no active trip, order detail unavailable, route unavailable, tracking requesting, tracking active, tracking blocked, proof missing, completion replay pending, stale session reroute.

Acceptance:

| Requirement                        | Check                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| One primary action                 | Do not render all task action buttons at once.                                |
| Sticky action bar                  | Primary workflow action is reachable without scrolling through proof content. |
| Proof ergonomics                   | Photo, signoff, and expense proof are grouped with clear requirement status.  |
| Route copy localized               | `RouteDisplay` has Traditional Chinese runtime copy.                          |
| Existing replay behavior preserved | Pending completion replay tests remain green.                                 |

### 4.4 `/incident` SOS 緊急通報

Target layout:

```text
[Header: SOS 緊急通報][danger tone]
[Safety context panel]
[Optional detail input]
[Primary danger button: 送出 SOS]
[Confirm sheet/alert: confirm critical escalation]
[Secondary: 返回行程]
```

Required states: feature disabled, submitting, submitted, API error, empty details, confirmed critical submit.

Acceptance:

| Requirement              | Check                                             |
| ------------------------ | ------------------------------------------------- |
| Two-step critical action | SOS submit requires confirmation before API call. |
| Shared danger controls   | Uses shared `ActionButton` danger variant.        |
| Context preservation     | Returns to `/trip` after success as today.        |

### 4.5 `/platform-presence` 平台上線狀態

Target layout:

```text
[Header: 平台上線狀態][refresh]
[Summary: online / offline / reauth required]
[Platform list cards]
  [platform code/name][online switch][reauth icon]
  [eligibility chip][token expiry][last online]
```

Required states: unprovisioned, loading, empty, error, reauth required, token expired, toggle submitting.

Acceptance:

| Requirement                      | Check                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| No duplicate card implementation | Merge `PlatformStatusCard` behavior into one shared component or delete unused duplicate. |
| No emoji action                  | Reauth uses icon button with accessible label.                                            |
| Localized labels                 | Online/offline, eligibility, token copy shown in Chinese.                                 |

### 4.6 `/earnings` 收益儀表板

Target layout:

```text
[Header: 收益儀表板]
[Period segmented control: 今日 / 本週 / 本月]
[KPI tiles: 實拿, 總收入, 平台數, 待撥款]
[Platform earnings list]
[Statement list]
```

Required states: loading, feature disabled, empty period, API error, refreshing.

Acceptance:

| Requirement       | Check                                                 |
| ----------------- | ----------------------------------------------------- |
| KPI summary       | Totals derived from platform earnings and statements. |
| Segmented control | Uses shared segmented control, not text tabs.         |
| Expand affordance | Uses icon chevron and stable card layout.             |

### 4.7 `/shift` 班次與出勤

Target layout:

```text
[Header: 班次與出勤]
[Active shift status tile]
[Clock-in form when offline]
[Clock-out form when active]
[Sticky bottom primary: 上線打卡 / 下線打卡]
```

Required states: loading, feature disabled, no active shift, active shift, submitting, API error.

Acceptance:

| Requirement        | Check                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| No demo driver ID  | Replace `driver-demo-001` with provisioned `getDriverId()` or guarded unprovisioned state. |
| No text button     | Clock in/out uses shared button.                                                           |
| Active state icon  | Uses icon/status chip, not emoji.                                                          |
| Numeric validation | Odometer accepts only valid numeric value before submit.                                   |

### 4.8 `/settings` 設定

Target layout:

```text
[Header: 設定]
[Profile section]
[Emergency contact section]
[Preferences section]
[Platform accounts section]
[Sticky/save action when dirty]
```

Required states: unprovisioned, loading, partial load failure, dirty form, saving, partial save failure, validation error.

Acceptance:

| Requirement                | Check                                                         |
| -------------------------- | ------------------------------------------------------------- |
| Section clarity            | Long form broken into clear sections with shared `FormField`. |
| Save state                 | Save action reflects dirty/saving/saved/error.                |
| Platform binding localized | No English runtime copy inside `PlatformBinding`.             |

## 5. Materialize Execution Tasks

These tasks are intentionally split by write ownership so multiple workers can materialize the design without overwriting each other.

| Task ID       | Priority | Owner Role           | Dependencies                 | Write Scope                                                                 | Deliverable                                                                                                                                                            | Acceptance / Verification                                                                                                                                                  |
| ------------- | -------- | -------------------- | ---------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DRV-MAT-000` | P0       | Lead / reviewer      | none                         | Docs only                                                                   | Freeze this design plan and confirm route inventory.                                                                                                                   | Reviewer confirms all app routes and shared components are represented.                                                                                                    |
| `DRV-MAT-001` | P0       | UI foundation worker | `DRV-MAT-000`                | `apps/driver-app/components/ui/*`, optional `_layout.tsx`                   | Shared tokens, `AppScreen`, `PageHeader`, `ActionButton`, `IconButton`, `StatusChip`, `EmptyState`, `ErrorBanner`, `FormField`, `SegmentedControl`, `BottomActionBar`. | `pnpm --filter @drts/driver-app typecheck`; component props documented in source; no runtime page behavior changes beyond shell if included.                               |
| `DRV-MAT-002` | P0       | Shell/home worker    | `DRV-MAT-001`                | `_layout.tsx`, `onboarding.tsx`, `index.tsx`                                | App shell navigation and workstation/provisioning/degraded home refactor to shared components.                                                                         | Ready, unprovisioned, degraded states render without raw route names or text links; existing identity bootstrap tests remain green.                                        |
| `DRV-MAT-003` | P0       | Task inbox worker    | `DRV-MAT-001`                | `jobs.tsx`, `platform-task-badge.tsx`                                       | Productized task inbox with filters, summary, shared task cards, localized badges.                                                                                     | No emoji/text-link controls; filter behavior works client-side; typecheck passes.                                                                                          |
| `DRV-MAT-004` | P0       | Trip workflow worker | `DRV-MAT-001`, `DRV-MAT-003` | `trip.tsx`, `route-display.tsx`                                             | Trip command center with one primary action, route/metrics/proof sections, localized route display.                                                                    | Existing trip, completion proof, pending replay, heartbeat tests pass; no local mutation controls for forwarded tasks.                                                     |
| `DRV-MAT-005` | P0       | Safety worker        | `DRV-MAT-001`, `DRV-MAT-004` | `incident.tsx`, optional shared confirm helper                              | SOS screen with confirmation step and shared danger controls.                                                                                                          | Feature disabled, submit success, submit error, and cancel confirmation states are manually verified.                                                                      |
| `DRV-MAT-006` | P0       | Shift worker         | `DRV-MAT-001`                | `shift.tsx`                                                                 | Shift page refactor with provisioned driver ID, active/offline states, validated odometer, shared bottom action.                                                       | No `driver-demo-001`; typecheck passes; add focused unit or component-level coverage for driver ID guard if test harness allows.                                           |
| `DRV-MAT-007` | P1       | Platform worker      | `DRV-MAT-001`                | `platform-presence.tsx`, `platform-status-card.tsx`, `platform-binding.tsx` | Unified platform account/status components with localized copy and icon controls.                                                                                      | Duplicate platform status implementation removed or routed through one component; no English runtime copy except platform codes.                                           |
| `DRV-MAT-008` | P1       | Earnings worker      | `DRV-MAT-001`                | `earnings.tsx`, `earnings-by-platform.tsx`, `money.ts` only if needed       | Earnings dashboard with KPI tiles, period segmented control, productized platform/statement rows.                                                                      | Empty, error, disabled, and period switch states verified; typecheck passes.                                                                                               |
| `DRV-MAT-009` | P1       | Settings worker      | `DRV-MAT-001`, `DRV-MAT-007` | `settings.tsx`, platform binding integration                                | Settings page with sectioned form, shared fields, dirty/save states, localized platform binding.                                                                       | Partial load/save states remain behaviorally equivalent; no English runtime copy in touched settings surface.                                                              |
| `DRV-MAT-010` | P0/P1    | QA worker            | All page tasks               | Tests/docs only unless fixing defects                                       | Productization verification pack: screenshots or emulator notes, route-by-route checklist, targeted tests.                                                             | `pnpm --filter @drts/driver-app typecheck`; `pnpm --filter @drts/driver-app test`; route smoke on Android emulator or Expo dev client when credentials/environment permit. |

## 6. Execution Waves

| Wave                                 | Tasks                                                      | Why                                                                        |
| ------------------------------------ | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| Wave 0: Design freeze                | `DRV-MAT-000`                                              | Locks scope before implementation starts.                                  |
| Wave 1: UI foundation and shell      | `DRV-MAT-001`, `DRV-MAT-002`                               | Prevents each page from inventing another style system.                    |
| Wave 2: Critical driver workflow     | `DRV-MAT-003`, `DRV-MAT-004`, `DRV-MAT-005`, `DRV-MAT-006` | Covers the screens drivers need during live work: tasks, trip, SOS, shift. |
| Wave 3: Operational support surfaces | `DRV-MAT-007`, `DRV-MAT-008`, `DRV-MAT-009`                | Covers platform account management, earnings, and settings.                |
| Wave 4: Verification                 | `DRV-MAT-010`                                              | Confirms all pages are consistent and regressions are caught.              |

Parallelization guidance:

| Worker               | Safe Parallel Scope                                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| UI foundation worker | Owns shared UI components and tokens. Other workers should wait for `DRV-MAT-001` before replacing page UI.                        |
| Workflow worker      | Owns `jobs.tsx`, `trip.tsx`, and `route-display.tsx` after foundation lands.                                                       |
| Operations worker    | Owns `platform-presence.tsx`, `earnings.tsx`, `shift.tsx`, `settings.tsx`, and account/earnings components after foundation lands. |
| QA worker            | Starts after each wave to verify changed routes and keep a running checklist.                                                      |

## 7. Definition of Done

Each materialize task must satisfy:

| Area               | Required Evidence                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Build health       | `pnpm --filter @drts/driver-app typecheck` passes.                                                                  |
| Regression health  | `pnpm --filter @drts/driver-app test` passes for tasks touching trip, identity, proof, heartbeat, or replay logic.  |
| Runtime copy       | Touched runtime copy is Traditional Chinese, except platform brand names and technical IDs.                         |
| UX states          | Loading, disabled, empty, error/degraded, and ready states are explicitly handled.                                  |
| Controls           | Primary actions use shared buttons, icon actions use icons with accessibility labels, binary settings use switches. |
| Visual consistency | Shared tokens are used; page-local arbitrary colors and radii are removed from touched files.                       |
| Safety             | No `driver-demo-001` or silent demo identity remains in touched runtime surfaces.                                   |
| Mobile fit         | Long task IDs, platform codes, error messages, and button labels wrap without overlap on narrow screens.            |

## 8. Known Risks and Review Hotspots

| Risk                                            | Mitigation                                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trip.tsx` has high behavior density            | Refactor visual structure without changing task action APIs first; keep completion replay and proof tests green.                                                  |
| Shared component rollout can create churn       | Land `DRV-MAT-001` first and migrate page by page. Avoid broad style rewrites outside the touched route.                                                          |
| Platform presence has duplicate implementations | Pick one canonical component during `DRV-MAT-007`; delete or deprecate the duplicate only after integration is verified.                                          |
| Shift currently uses demo driver id             | Treat `DRV-MAT-006` as both UX and correctness P0. Use provisioned identity APIs and preserve unprovisioned guard.                                                |
| Screenshots may require environment setup       | `DRV-MAT-010` should record whether Android emulator / Expo dev client evidence was available. CLI typecheck/test is not enough to approve visual productization. |

## 9. Immediate Next Step

Start with `DRV-MAT-001`. No page should do a large visual rewrite until the shared UI primitives and token contract exist, because that would recreate the current problem page by page.
