# Driver App Multi-Platform Product Specification

**Date:** 2026-05-07
**Archived under:** `docs/01-product`
**Primary app:** `apps/driver-app`
**Related management apps:** `apps/ops-console-web`, `apps/platform-admin-web`, `apps/tenant-portal-web`
**Primary backend modules:** `owned-mobility`, `forwarder`, `platform-presence`, `platform-earnings`, `driver-profile`, `shift-attendance`
**Status:** Detailed product and UI specification for Claude Design and materialize execution

## 1. Executive Summary

This app must be a real driver operations app, not a prototype screen collection.
The core product requirement is:

> A driver can use one app to receive, understand, and operate work from the
> DRTS owned dispatch flow and multiple external ride-hailing / taxi platforms,
> while managers can control platform integrations, driver eligibility,
> task state, exception handling, reconciliation, and operational health.

The current implementation only partially satisfies this.

Current state:

| Capability                                 | Current status                                     | Evidence / gap                                                                                                                            |
| ------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Driver device provisioning                 | Partially implemented                              | `/onboarding` can register a device and enter workspace                                                                                   |
| Driver task inbox                          | Partially implemented                              | `/jobs` lists `DriverTaskRecord` and shows `sourcePlatform` badges                                                                        |
| Multi-platform source display              | Partially implemented                              | Tasks can carry `sourcePlatform`; UI distinguishes forwarded tasks                                                                        |
| External platform order intake             | Backend partially implemented                      | `forwarder` module supports inbound orders, broadcast, accept relay, sync status, reconciliation records                                  |
| Real platform adapter coverage             | Not production complete                            | Grab Taiwan adapter is stub; tests mention Uber / LINE Taxi scenarios, but production adapter auth/webhook contracts are not complete     |
| Driver accept for external platform orders | Backend foundation exists, driver app not complete | `ForwarderService.relayDriverAccept` exists, but driver app currently uses owned task actions and treats forwarded tasks mostly read-only |
| Platform online/offline presence           | Partially implemented                              | `/platform-presence` lists/toggles platform status                                                                                        |
| Platform earnings                          | Partially implemented                              | `/earnings` displays platform breakdown from API                                                                                          |
| Ops management for forwarded orders        | Backend exists, UI incomplete                      | API exposes forwarder order, adapter health, sync error, reconciliation issue lists; management screens need complete workflows           |
| Platform admin configuration               | Incomplete for external platform operations        | Platform admin exists generally, but external platform adapter setup, credentials, rollout, policy, and risk controls need explicit UI    |
| Tenant/partner management alignment        | Partially related, incomplete                      | Tenant portal supports bookings/webhooks/billing; external platform order authority and management are not fully surfaced                 |

Product conclusion:

The app is not yet a complete multi-platform ride-order aggregator. It has
important backend primitives and partial driver-facing presentation, but it
needs product, UI, driver workflow, and management-surface work before we can
claim the function is fully satisfied.

## 2. Product Scope

### 2.1 Driver Product Goal

The driver opens one mobile app and can answer:

- Am I allowed to work?
- Am I currently on shift?
- Which platforms am I online on?
- Do I have any urgent orders?
- Which platform owns this order?
- Can I accept/reject/operate this order locally, or is the external platform authoritative?
- What is my next trip action?
- What proof or compliance item blocks completion?
- What needs manager intervention?
- What did I earn by platform?

### 2.2 Management Product Goal

Operations and platform admins need enough control to make multi-platform work
safe:

- Configure external platform adapters.
- Monitor adapter health.
- See inbound external orders and their local mirror state.
- Broadcast external orders to eligible local drivers.
- Resolve race outcomes: confirmed, lost race, cancelled by platform.
- Trigger manual fallback and reconciliation.
- See sync failures and assign owners.
- Control driver platform eligibility.
- Audit driver/platform actions.
- Review external-platform settlement authority and shadow ledger state.
- Disable problematic platform intake without taking down owned dispatch.

## 3. Multi-Platform Domain Model

### 3.1 Order Domains

| Domain      | Meaning                                               | Authority                                                                                                  |
| ----------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `owned`     | DRTS creates and operates the order                   | DRTS dispatch and driver lifecycle                                                                         |
| `forwarded` | External platform sends or mirrors an order into DRTS | External platform remains authoritative for fare, settlement, and final status unless explicitly delegated |

### 3.2 Supported Platform Concepts

Existing code references platform concepts such as:

- `platformCode`
- `sourcePlatform`
- platform presence
- platform earnings
- adapter health
- forwarded order status
- reconciliation issue
- sync failure

Target platform examples:

| Platform                 | Product label         | Current implementation expectation                                                        |
| ------------------------ | --------------------- | ----------------------------------------------------------------------------------------- |
| DRTS owned dispatch      | 自營派單              | Full local task lifecycle                                                                 |
| Uber-like adapter        | Uber                  | External order source / forwarder adapter required                                        |
| LINE Taxi-like adapter   | LINE Taxi             | External order source / forwarder adapter required                                        |
| Grab Taiwan-like adapter | Grab Taiwan           | Stub adapter currently exists and must become production-capable if used                  |
| Future platforms         | Configurable platform | Must be added through adapter registry, platform admin config, and driver account binding |

### 3.3 Forwarded Order Lifecycle

Target lifecycle:

| Status                  | Meaning                                                    | Driver UI behavior                                                         | Management UI behavior                             |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| `received`              | External order received                                    | Not shown unless broadcast to driver                                       | Show inbound order and payload summary             |
| `broadcasted`           | Offered to local eligible drivers                          | Show as available external-platform task if driver is candidate            | Show candidate driver set and broadcast time       |
| `accept_pending`        | Driver accepted locally; waiting for platform confirmation | Show pending confirmation, block normal owned-trip actions until confirmed | Monitor adapter acknowledgement and timeout        |
| `confirmed_by_platform` | Platform confirmed driver/order                            | Show as active platform order with authoritative platform badge            | Mark race won and reconcile mirror                 |
| `lost_race`             | Platform gave order to someone else                        | Show terminal / no action needed                                           | Close local offers and audit outcome               |
| `cancelled_by_platform` | Platform cancelled                                         | Show terminal / cancelled by platform                                      | Close local offers and audit outcome               |
| `sync_failed`           | Adapter/status sync failed                                 | Show driver-safe warning only if relevant                                  | Create reconciliation job and manual fallback path |

## 4. Current Functional Gap Assessment

### 4.1 Driver App Gap

Current driver app supports:

- Device registration.
- Task list.
- Displaying source platform badge.
- Forwarded task read-only notice.
- Platform online/offline status page.
- Platform earnings summary.

Current driver app does not fully support:

- Accepting external-platform orders through forwarder relay.
- Rejecting external-platform orders.
- Showing accept-pending race state as a first-class flow.
- Showing native platform confirmation details.
- Showing external-platform cancellation/lost-race with clear driver instructions.
- Showing per-platform account health inside workspace.
- Showing cross-platform availability as part of task matching.
- Showing manager intervention/manual fallback state in a driver-safe way.
- Presenting one coherent multi-platform cockpit.

### 4.2 Management Gap

Current backend supports several forwarder endpoints:

- inbound external order ingestion
- Grab Taiwan webhook stub ingestion
- list forwarded orders
- broadcast forwarded order
- relay driver accept
- report sync failure
- manual fallback
- reconciliation completion
- native status sync
- adapter health
- sync errors
- reconciliation jobs
- reconciliation issues

Management UI still needs full product surfaces for:

- adapter registry
- credentials/config status
- platform enable/disable
- platform webhook status
- forwarded order board
- candidate driver broadcast controls
- race outcome monitor
- manual fallback workflow
- reconciliation queue
- finance/settlement review for forwarded shadow ledger
- audit trail viewer scoped to forwarded orders
- driver platform eligibility controls

## 5. Driver App Detailed Page Specifications

### 5.1 App Shell and Navigation

Primary navigation should be:

| Tab    | Route                     | Purpose                                                |
| ------ | ------------------------- | ------------------------------------------------------ |
| 工作台 | `/onboarding` ready state | Readiness and next action cockpit                      |
| 任務   | `/jobs`                   | Unified task inbox across owned and external platforms |
| 行程   | `/trip`                   | Current trip/order operation                           |
| 平台   | `/platform-presence`      | Platform account and online/offline state              |
| 設定   | `/settings`               | Profile, preferences, account binding                  |

Contextual routes:

| Route       | Entry                   |
| ----------- | ----------------------- |
| `/incident` | From trip/SOS action    |
| `/earnings` | From workspace/settings |
| `/shift`    | From workspace          |

Shell requirements:

- Compact header.
- Optional status chip in header.
- Optional SOS icon where appropriate.
- Sticky bottom action bar for trip, shift, settings, and SOS.
- No route names as visible UI.
- No debug menu feel.

### 5.2 Device Provisioning

Route: `/onboarding` unprovisioned state.

Functional requirements:

- Show activation step state.
- Registration code field.
- Device name field.
- Test/default prefill until final testing:
  - `driver-demo-001`
  - `Driver Pixel 01`
- Submit device registration.
- On success, store session and enter workspace.
- On failure, show inline error.
- Prevent access to work pages when unprovisioned.

Design requirements:

- Activation flow, not generic form.
- Clear status strip: device, identity, platform.
- Primary CTA: `註冊此裝置`.
- Secondary safety copy explaining why unconfigured devices are blocked.

States:

- initializing
- unprovisioned
- submitting
- registration error
- registered and loading workspace

### 5.3 Workspace Cockpit

Route: `/onboarding` ready state.

Functional requirements:

- Show device/identity/platform readiness.
- Show current shift state.
- Show platform online count.
- Show urgent task count.
- Show active trip summary when one exists.
- Show next best action:
  - register device
  - start shift
  - go online on platforms
  - review tasks
  - return to active trip
  - resolve degraded identity/platform issue
- Link to:
  - task inbox
  - trip
  - platform presence
  - earnings
  - shift
  - settings

Multi-platform requirements:

- Workspace must show which platforms are online/offline.
- Workspace must distinguish DRTS owned availability from external platform availability.
- If any platform requires re-auth, show it as an urgent issue.
- If any forwarded order is pending confirmation/reconciliation, show a driver-safe notice.

Design requirements:

- This is a cockpit, not a list of links.
- The next action is visually dominant.
- Platform health and task urgency are visible above secondary cards.

### 5.4 Unified Task Inbox

Route: `/jobs`.

Functional requirements:

- List both owned tasks and external-platform/forwarded tasks.
- Show filter tabs:
  - 全部
  - 待處理
  - 進行中
  - 平台結案
  - 需同步/異常
- Show summary:
  - total tasks
  - needs action
  - external platform tasks
  - sync/reauth issues
- Per task card:
  - task ID
  - order ID
  - source platform
  - owned vs forwarded domain
  - task status
  - external native status if available
  - route lock
  - fixed fare
  - service type
  - required action
  - deadline/age when available
- Tap owned task -> trip.
- Tap forwarded task -> external-platform task detail/trip state.

Owned task behavior:

- Driver can operate local lifecycle if assigned and eligible.

Forwarded task behavior:

- If status is offered/broadcasted and local accept relay is supported, driver can accept or decline.
- If status is accept pending, show pending platform confirmation.
- If confirmed by platform, show active external-platform trip instructions.
- If lost race/cancelled by platform, show terminal state and no mutation CTA.
- If sync failed, show "需派車台處理" and avoid exposing technical stack traces.

Design requirements:

- External platform tasks must have clear platform branding/chip.
- Do not make forwarded tasks look identical to DRTS-owned tasks.
- Needs-action tasks should sort or visually rank above passive tasks.

States:

- loading
- empty all
- empty filter
- error
- disabled by feature flag
- refreshing
- source platform terminal
- source platform sync issue

### 5.5 Trip / Order Operation

Route: `/trip`.

Functional requirements for owned tasks:

- Show active task summary.
- Show route.
- Show status.
- Show live metrics:
  - distance
  - duration
  - tracking status
- Show compliance gates.
- Show one primary action at a time:
  - accept
  - depart
  - arrived
  - start
  - complete
- Completion proof:
  - camera
  - photo library
  - max 5 photos
  - thumbnails
  - remove photo
  - min photo count
  - signoff reference
  - expense proof
  - blocker summary
- Block completion if tracking/proof requirements are not met.
- Preserve pending completion replay.

Functional requirements for external-platform tasks:

- Show platform authority banner.
- Show native platform status.
- Show local mirror status.
- Show whether local actions are allowed.
- If action allowed:
  - accept relay
  - reject relay if supported
  - pending confirmation state after accept
- If action not allowed:
  - explain that source platform controls operation.
- Show terminal state for:
  - lost race
  - cancelled by platform
  - confirmed by platform but awaiting local mirror update
- Show manual fallback indicator only as driver-safe copy:
  - "派車台正在處理平台同步，請依派車台指示操作。"

Design requirements:

- Owned and external-platform trips should share layout but differ in authority banners and action model.
- Only one primary action.
- Sticky bottom action.
- SOS accessible but protected.

States:

- no active trip
- loading
- route unavailable
- order unavailable
- tracking active/denied/error
- proof missing
- completing
- forwarded offered
- forwarded accept pending
- forwarded confirmed
- forwarded lost race
- forwarded cancelled
- forwarded sync failed/manual fallback

### 5.6 Platform Presence

Route: `/platform-presence`.

Functional requirements:

- List every configured platform account for the driver.
- Show:
  - platform name/code
  - online/offline status
  - re-auth required
  - token expiration
  - last sync time
  - whether platform can receive orders
  - whether driver is eligible for that platform
- Actions:
  - go online
  - go offline
  - re-authenticate
  - view account/binding details
- Busy state per platform.
- Refresh.

Multi-platform requirements:

- Platform presence is a prerequisite signal for multi-platform matching.
- Driver must see why a platform cannot send work:
  - offline
  - token expired
  - re-auth required
  - account not bound
  - eligibility blocked
  - adapter degraded

Design requirements:

- Present as a platform health center.
- Re-auth and adapter degraded states must be prominent.
- Online/offline controls must be safe and unambiguous.

### 5.7 Earnings

Route: `/earnings`.

Functional requirements:

- Period switcher:
  - today
  - week
  - month
- Summary:
  - net
  - gross
  - platform count
  - pending payout
- Platform breakdown:
  - platform code/name
  - gross
  - service fee
  - subsidy
  - net
- Statements:
  - receipt number
  - period month
  - trip count
  - fee plan version
  - payout status
  - net amount

Multi-platform finance requirements:

- Owned trips and forwarded shadow trips must not be mixed without labels.
- Forwarded external-platform finance authority must show as external-platform controlled when applicable.
- Shadow ledger data must be marked as reference-only if not payable by DRTS.
- Any reconciliation issue should link to manager review, not claim final payout.

Design requirements:

- Money hierarchy: net first.
- Platform authority must be clear.
- Pending payout vs paid must be visually distinct.

### 5.8 Shift and Attendance

Route: `/shift`.

Functional requirements:

- Clock in with optional:
  - vehicle ID
  - location
  - odometer
- Show active shift:
  - vehicle
  - start time
  - start location
  - start odometer
- Clock out with optional:
  - current location
  - current odometer
- Validate odometer as integer only.

Multi-platform requirements:

- Shift state should influence driver availability for all platforms.
- Workspace should show if driver is online on platforms but not on shift.
- Managers should be able to see platform-online drivers who are not properly clocked in.

Design requirements:

- Punch-clock style.
- On/off duty is the visual anchor.
- Bottom CTA for clock in/out.

### 5.9 SOS Incident

Route: `/incident`.

Functional requirements:

- Safety context.
- Optional details.
- Confirm before submit.
- Create critical safety incident.
- Escalate to safety officer.
- Return to trip after submit.

Multi-platform requirements:

- If incident is tied to an external-platform order, payload should preserve:
  - platform code
  - external order ID
  - local mirror order ID
  - current native status
- Management incident view must show source platform.

Design requirements:

- High-risk but controlled.
- Two-step confirmation.
- Never a single accidental tap.

### 5.10 Settings and Platform Binding

Route: `/settings`.

Functional requirements:

- Driver profile:
  - name
  - phone
  - email
- Emergency contact:
  - name
  - phone
  - relationship
- Preferences:
  - language
  - max accept radius
  - notifications
  - auto accept
- Platform account binding:
  - list bound platform accounts
  - show auth status
  - show re-auth requirement
  - bind/unbind where allowed
  - show account identifier safely
- Save state:
  - unchanged
  - dirty
  - saving
  - saved
  - error
- Partial load/save error.

Multi-platform requirements:

- Driver can tell which platform accounts are connected.
- Driver can tell whether each account can receive work.
- Driver can re-auth from settings or platform presence.
- Auto-accept settings should clarify whether they apply globally or per platform.

Design requirements:

- Split into clear sections.
- Platform binding should align with platform presence styling.

## 6. Management Surface Specifications

Multi-platform接單不是只有司機 app，管理端也必須完整支援。

### 6.1 Ops Console: Forwarded Order Board

Related app: `apps/ops-console-web`.

Required functions:

- List forwarded orders.
- Filter by:
  - platform
  - status
  - sync error
  - manual fallback required
  - reconciliation status
  - accepted driver
  - created/updated time
- Show order detail:
  - mirror order ID
  - platform code
  - external order ID
  - authoritative snapshot
  - local mirror status
  - native platform status
  - candidate drivers
  - accepted driver
  - last sync error
  - manual fallback state
  - reconciliation job
  - audit trail
- Actions:
  - broadcast to eligible drivers
  - force refresh/sync status when adapter supports it
  - report sync failure
  - engage manual fallback
  - complete reconciliation
  - close/cancel local driver tasks when terminal

Acceptance:

- Ops can resolve a forwarded order without reading logs.
- Ops can tell if platform is authoritative for fare/settlement/status.
- Ops can see driver impact before forcing a terminal state.

### 6.2 Ops Console: Adapter Health and Incident Operations

Required functions:

- Adapter health dashboard.
- Platform status:
  - healthy
  - degraded
  - down
  - auth expired
  - rate limited
  - webhook failing
- Sync error list.
- Reconciliation issue queue.
- Operational alerts:
  - adapter failure burst
  - forwarded order stuck in accept pending
  - manual fallback backlog
  - driver/platform presence mismatch
- Incident linkage:
  - incidents tied to external platform order
  - platform-specific escalation metadata

Acceptance:

- Ops can see platform degradation before drivers report it.
- Ops can distinguish tenant/owned dispatch lag from external-platform adapter failure.

### 6.3 Ops Console: Driver Eligibility and Availability

Required functions:

- Driver list includes:
  - shift state
  - platform online status
  - platform account binding
  - eligibility per service bucket
  - current active order by platform
  - stale location status
- Driver detail includes:
  - platform accounts
  - re-auth status
  - active forwarded/owned tasks
  - recent failed relay attempts
  - manual override notes
- Actions:
  - take driver offline for a platform
  - request re-auth
  - suppress matching during incident
  - mark driver unavailable for forwarded orders

Acceptance:

- Managers can answer why a driver did or did not receive a platform order.

### 6.4 Platform Admin: Adapter Registry and Configuration

Related app: `apps/platform-admin-web`.

Required functions:

- Platform adapter registry:
  - platform code
  - display name
  - environment
  - enabled/disabled
  - adapter type
  - webhook URL status
  - credential status
  - last health check
  - supported actions
- Credentials / secrets status:
  - configured
  - missing
  - expiring
  - rotated at
  - rotation owner
- Platform rollout:
  - sandbox
  - pilot
  - production
  - rollback hold
- Policy configuration:
  - allowed service buckets
  - driver eligibility rules
  - max candidates
  - accept timeout
  - manual fallback threshold
  - finance authority mode
- Feature flags:
  - driver external order accept enabled
  - driver external order reject enabled
  - platform earnings enabled
  - platform presence enabled

Acceptance:

- Admin can safely enable a platform without code changes.
- Admin can disable a degraded platform without taking down owned dispatch.
- Admin can verify credential/webhook readiness before production rollout.

### 6.5 Platform Admin: Finance and Reconciliation

Required functions:

- View forwarded shadow ledger channel.
- Show finance authority:
  - external platform fare authority
  - external platform settlement authority
  - external platform payout authority
  - DRTS shadow-only mode
- Reconciliation queue:
  - issue ID
  - platform
  - mirror order
  - external order
  - reason
  - owner
  - status
  - resolution notes
- Payout display rules:
  - do not show shadow-only values as payable by DRTS
  - mark external-platform payout authority clearly

Acceptance:

- Finance users cannot mistake shadow reference data for payable DRTS settlement.

### 6.6 Tenant / Partner Management Alignment

Related app: `apps/tenant-portal-web`.

Required functions when tenant/partner bookings interact with external platforms:

- Tenant booking detail shows whether dispatch is owned or externally forwarded.
- Tenant-facing status should not expose internal adapter errors.
- Tenant SLA view should distinguish:
  - DRTS dispatch delay
  - external platform adapter delay
  - driver availability delay
- Webhook payloads should include source domain/platform when relevant.
- Billing/invoice views should mark external-platform finance authority.

Acceptance:

- Tenant admins understand fulfillment source without seeing low-level adapter internals.

## 7. Backend/API Requirements to Fully Satisfy Multi-Platform接單

Existing backend foundations should be preserved, but final product requires:

- Production adapter contracts for each platform.
- Secure credential storage and rotation.
- Webhook verification per platform.
- Idempotent inbound order ingestion.
- Driver candidate broadcast with eligibility/radius/shift/presence checks.
- Accept/reject relay endpoints exposed safely to driver app.
- Confirm/lost-race/cancelled native status reconciliation.
- Adapter health and rate-limit monitoring.
- Manual fallback escalation.
- Audit trail for every platform state mutation.
- Finance authority separation for owned vs forwarded orders.
- Driver-safe API payload for external platform task cards.

## 8. Data Requirements for UI

Driver app should receive normalized fields instead of parsing raw payloads.

### 8.1 Unified Driver Task View Model

Required fields:

- `taskId`
- `orderId`
- `orderDomain`: `owned` or `forwarded`
- `sourcePlatform`
- `platformDisplayName`
- `externalOrderId`
- `nativeStatus`
- `localStatus`
- `driverActionState`
- `allowedActions`
- `routeLocked`
- `fareAuthority`
- `settlementAuthority`
- `driverPayoutAuthority`
- `requiresManualFallback`
- `requiresReauth`
- `syncIssueSummary`
- `pickupSummary`
- `dropoffSummary`
- `deadlineAt`
- `updatedAt`

### 8.2 Platform Presence View Model

Required fields:

- `platformCode`
- `platformDisplayName`
- `driverId`
- `status`
- `canReceiveOrders`
- `reauthRequired`
- `tokenExpiresAt`
- `adapterStatus`
- `eligibilityStatus`
- `lastSyncAt`
- `blockingReason`

### 8.3 Management Forwarded Order View Model

Required fields:

- `mirrorOrderId`
- `platformCode`
- `platformDisplayName`
- `externalOrderId`
- `status`
- `nativeStatus`
- `candidateDriverIds`
- `acceptedDriverId`
- `lastSyncError`
- `manualFallback`
- `reconciliationJob`
- `financeContext`
- `authoritativeSnapshot`
- `createdAt`
- `updatedAt`
- `auditSummary`

## 9. Claude Design Deliverables

Claude Design must deliver more than visual comps:

- Full mobile IA sitemap.
- Driver app high-fidelity designs for all routes.
- State designs for every page listed in this spec.
- Unified external-platform task card design.
- Owned vs forwarded trip authority design.
- Platform health center design.
- Management UI wireframes for:
  - forwarded order board
  - adapter health
  - reconciliation queue
  - driver platform eligibility
  - platform adapter registry
  - finance authority review
- Component system:
  - status chips
  - platform badges
  - authority banners
  - task cards
  - trip action card
  - bottom action bar
  - proof checklist
  - platform health card
  - reconciliation issue row
  - management data table
- Design tokens:
  - colors
  - typography
  - spacing
  - radius
  - elevation
  - state variants
- Android narrow screen around 360 x 800.
- Large Android phone around 412 x 915.
- Desktop management layouts for ops/platform admin.

## 10. Materialize Execution Tasks

| Task ID    | Scope                                                  | Output                                                                  |
| ---------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| DRV-MP-001 | Driver app shell, navigation, shared tokens/components | Production mobile foundation                                            |
| DRV-MP-002 | Driver workspace with multi-platform readiness         | Cockpit showing shift, task, platform, reauth, next action              |
| DRV-MP-003 | Unified task inbox                                     | Owned and forwarded task cards, filters, action states                  |
| DRV-MP-004 | Forwarded task accept/reject UX and API wiring         | Driver can operate supported external platform offers                   |
| DRV-MP-005 | Trip workflow authority redesign                       | Owned vs forwarded trip states, one primary action, proof checklist     |
| DRV-MP-006 | Platform presence health center                        | Driver platform online/offline, reauth, eligibility blockers            |
| DRV-MP-007 | Earnings authority redesign                            | Owned vs external payout authority and platform breakdown               |
| DRV-MP-008 | Shift integration with multi-platform availability     | Shift status affects workspace and availability warnings                |
| DRV-MP-009 | Settings platform binding redesign                     | Account binding, reauth, per-platform settings                          |
| DRV-MP-010 | SOS source-platform context                            | Incidents include external platform metadata                            |
| OPS-MP-001 | Forwarded order board                                  | Ops UI for inbound/broadcast/accept-pending/terminal/sync-failed states |
| OPS-MP-002 | Adapter health and sync error dashboard                | Ops can monitor platform degradation and reconciliation backlog         |
| OPS-MP-003 | Driver platform eligibility management                 | Ops can inspect and control driver-platform availability                |
| ADM-MP-001 | Platform adapter registry                              | Admin can configure enablement, rollout, credential status, policy      |
| ADM-MP-002 | Finance/reconciliation management                      | Admin/finance can review shadow ledger and external payout authority    |
| TEN-MP-001 | Tenant/partner source-domain visibility                | Tenant views distinguish owned vs externally fulfilled work             |
| API-MP-001 | Unified driver task view model                         | Driver app stops parsing raw forwarded/owned differences                |
| API-MP-002 | Driver-safe forwarded order action endpoints           | Accept/reject/status payloads safe for mobile                           |
| API-MP-003 | Production adapter hardening                           | Real platform auth/webhook/idempotency/health contracts                 |

## 11. Verification Requirements

Driver app verification:

- Device provisioning succeeds with current test code.
- Workspace shows platform readiness.
- Driver can see owned task and external platform task differently.
- External platform offer can be accepted only when backend reports action allowed.
- Accept-pending state blocks incorrect local trip mutation.
- Lost-race and cancelled-by-platform states are terminal and clear.
- Platform presence can show reauth/adapter/eligibility blockers.
- Earnings labels external-platform payout authority correctly.
- SOS carries platform/order context when launched from external platform task.

Management verification:

- Ops can ingest/list a forwarded order.
- Ops can broadcast to eligible drivers.
- Ops can observe accept pending.
- Ops can resolve confirmed/lost-race/cancelled status.
- Ops can engage and complete manual fallback.
- Admin can see adapter health and disable a platform.
- Finance can identify forwarded shadow-only records.

Minimum commands after implementation:

- `pnpm --filter @drts/driver-app typecheck`
- `pnpm --filter @drts/api test -- --run tests/unit/forwarder.service.test.ts`
- `pnpm --filter @drts/api test -- --run tests/unit/forwarder.controller.test.ts`
- Relevant ops/platform-admin typechecks after management UI work.

## 12. Explicit Answer: Is Multi-Platform接單 Satisfied Today?

No, not fully.

What is satisfied today:

- The codebase has a backend forwarder foundation.
- Forwarded orders can be represented separately from owned orders.
- Driver tasks can carry `sourcePlatform`.
- The driver app can visually distinguish platform tasks in the task inbox.
- Platform presence and platform earnings have partial driver-facing pages.
- Backend has adapter health, sync error, and reconciliation concepts.

What is not yet satisfied:

- The driver app does not yet provide a complete external platform offer accept/reject workflow.
- The driver app does not yet model accept-pending, confirmed-by-platform, lost-race, cancelled-by-platform, and sync-failed as first-class driver experiences.
- Platform adapters are not production-complete for real ride-hailing platforms.
- Management UI does not yet provide the full control plane required to operate multi-platform intake safely.
- Platform admin configuration and credential/rollout controls are incomplete.
- Finance and tenant-facing surfaces do not yet fully explain owned vs forwarded authority.

Therefore, the correct product status is:

> Multi-platform support is architecturally started and partially visible, but it
> is not complete enough to claim the app can reliably receive and manage orders
> from multiple ride-hailing platforms in production.

This specification defines the work required to close that gap.
