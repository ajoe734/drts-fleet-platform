# Driver App — Visual Design Hand-off Packet

**Date:** 2026-05-25
**App:** `apps/driver-app` (Expo / React Native — mobile)
**Recipient team:** 視覺設計團隊 (含 UX)
**Status:** Hand-off input. **No visual decisions in this document.**
**Author lane:** Claude (`DRV-DH-PKT-002`)
**Predecessors:**

- [`system-design-questions-all-apps-20260524.md`](./system-design-questions-all-apps-20260524.md)
- [`system-design-answers-all-apps-20260524.md`](./system-design-answers-all-apps-20260524.md) — **authority**
- [`ops-console-design-handoff-packet-20260525.md`](./ops-console-design-handoff-packet-20260525.md), [`platform-admin-design-handoff-packet-20260525.md`](./platform-admin-design-handoff-packet-20260525.md), [`tenant-console-design-handoff-packet-20260525.md`](./tenant-console-design-handoff-packet-20260525.md) — companion packets

---

## 0. How to read this document

Same shape as the three web packets, with mobile-native adaptations. Captures every Driver App screen at the level a visual designer needs to begin producing wireframes / IA / component system / design tokens. **No visual decisions.**

**Mobile context differences from web packets:**

- Native iOS + Android (React Native via Expo). Two device class targets per spec §9: **Android narrow ~360×800**, **Large Android phone ~412×915**.
- No header search bar (Q-X07 explicitly excludes driver app).
- Native push notifications are first-class for urgent events (Q-X05).
- Sticky bottom action bar pattern (per spec §5.1) instead of desktop top action bar.
- Cannot import `@drts/ui-web` (per answers §1 Q-X04); driver design system is independent.
- Offline-tolerant per Q-DRV10 (partial offline model).
- Operator persona is a **professional driver during a shift**, not a tester or admin. Spec §5.1 explicitly mandates "no route names as visible UI" and "no debug menu feel."

What it does contain: §2 persona + role codes, §3 operating context (mobile-adapted), §4 sitemap (Expo Router file routes), §5 per-screen functional briefs, §6 API mapping, §7 purely visual open questions.

What it does NOT contain: wireframes, comps, layout, grid, spacing, color, typography, iconography, density, component system, design tokens. Also out of scope: native splash screens, app icon set, store assets.

If the visual team hits product / system / contract ambiguity: flag back to system design team. Never invent.

---

## 1. Source documents

| Document                                                                                                                                  | Role                                                                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [system-design-answers-all-apps-20260524.md](./system-design-answers-all-apps-20260524.md)                                                | **Authority.** Every decision binding.                                                                             |
| [01-product/driver-app-multi-platform-product-spec-20260507.md §5](../01-product/driver-app-multi-platform-product-spec-20260507.md)      | Per-screen functional spec §5.1 – §5.10 (10 sections)                                                              |
| [01-product/driver-app-multi-platform-product-spec-20260507.md §3 + §4](../01-product/driver-app-multi-platform-product-spec-20260507.md) | Multi-platform domain model + current gaps                                                                         |
| [01-product/driver-app-multi-platform-product-spec-20260507.md §8](../01-product/driver-app-multi-platform-product-spec-20260507.md)      | Data requirements / view models                                                                                    |
| `apps/driver-app/app/**`                                                                                                                  | Current route surface (Expo Router; index/onboarding/jobs/trip/platform-presence/settings/shift/incident/earnings) |

When this packet and a source document disagree, the source document wins.

---

## 2. Persona

Single primary persona: **Driver**. Sub-states matter more than sub-personas.

| Persona / sub-state                     | Primary concerns                                               | Role code | Primary screens                         |
| --------------------------------------- | -------------------------------------------------------------- | --------- | --------------------------------------- |
| Driver — unprovisioned                  | get this device activated and logged in                        | `driver`  | `/onboarding` (unprovisioned state)     |
| Driver — provisioned, off-shift         | check earnings, settings, prepare for next shift               | `driver`  | `/`, `/earnings`, `/settings`, `/shift` |
| Driver — provisioned, on-shift, no trip | watch task inbox, manage platform presence, decide next action | `driver`  | `/jobs`, `/platform-presence`, `/`      |
| Driver — provisioned, on-shift, in trip | execute one trip safely with one primary action at a time      | `driver`  | `/trip`                                 |
| Driver — emergency                      | trigger SOS                                                    | `driver`  | `/incident`                             |

The same human cycles through these states many times in a shift. The design must make the **state** dominant and the **app chrome** secondary. The primary action at the current state is always more important than navigation.

There is no role-based authority differentiation within the driver app (a driver is a driver). However, **`availableActions` per resource still applies** for capability-flag-driven affordances (Q-DRV01 — e.g. whether forwarded task accept/reject is enabled for the current platform).

---

## 3. Operating context (binding on every screen)

Adapted from the cross-cutting answers, with mobile-specific differences.

### 3.1 Locale (Q-X17)

zh-TW primary, en secondary. Driver app uses translation maps for every state code. Mobile context: text density is even more constrained than web — long Chinese labels need a fallback (truncation? line wrap? mini-icon?). Design team's call within the no-raw-codes constraint.

Driver-specific state codes needing translation: task states (`offered`, `accept_pending`, `confirmed_by_platform`, `lost_race`, `cancelled_by_platform`, `sync_failed`), platform presence states (`online`, `offline`, `reauth_required`, `token_expired`, `eligibility_blocked`, `adapter_degraded`), trip states, shift states.

### 3.2 Refresh model (Q-X01, Q-X02)

Driver-app is the only realm with **native push + polling fallback**. Per Q-X02:

| Tier          | Cadence                          | Where it applies in driver-app                                                                                                                                                      |
| ------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **T0 Urgent** | push immediately + poll 5s       | Task offer (`driver.task.offered`), SOS ack (`driver.sos.acknowledged`), platform reauth required (`driver.platform.reauth_required`), sync failure (`driver.platform.sync_failed`) |
| **T1 Fast**   | 3s                               | `/trip` active state                                                                                                                                                                |
| **T3 Medium** | 15s (approximated to driver-app) | `/jobs` task inbox, `/platform-presence`                                                                                                                                            |
| Manual        | manual                           | `/earnings`, `/settings` (refresh on focus or pull-to-refresh)                                                                                                                      |

If offline, surfaces switch to a clear **offline mode** treatment (Q-DRV10). Live surfaces (`/trip`) must convey "this data is from N seconds ago when you were last online."

`UiRefreshMetadata` envelope applies. Native pull-to-refresh affordance expected where appropriate.

### 3.3 Identity / health context

Mobile chrome differs from desktop. Per Q-X11/X12 adapted:

- **Compact header** (per spec §5.1): can include optional status chip (e.g. "ON-SHIFT", "OFF-SHIFT", "SOS ACTIVE")
- **No sidebar** — health goes into `/settings` or workspace cockpit, not in chrome
- **Page-level degraded banner** when sync issues affect the current screen (e.g. trip data stale, platform binding degraded)

Spec §5.1 explicitly says optional SOS icon where appropriate (not on every screen — e.g. unprovisioned state should not show SOS).

### 3.4 Confirmation pattern (Q-X09, Q-X10)

Risk-classified, mobile-adapted (no desktop modals; native-style sheets / dialogs):

| Risk       | Pattern (mobile)                                                                     | Examples                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| **Low**    | direct action + toast or in-app banner receipt                                       | refresh, dismiss notification, view detail                                                                                        |
| **Medium** | native confirmation dialog + toast/banner receipt                                    | clock in / clock out, accept task (where allowed), reject task, take platform offline, request re-auth, end trip step transitions |
| **High**   | dedicated sheet with required confirmation (e.g. press-and-hold for SOS per Q-DRV11) | SOS submit (press-and-hold 2s per Q-DRV11), unbind a platform account, force-offline another platform from /platform-presence     |

Action receipts include `auditId`. Mobile typically does NOT surface audit deep links to the driver (they don't have audit read scope); the receipt simply confirms "action succeeded" with an in-app banner that auto-dismisses.

### 3.5 Authority boundaries (Q-X13, Q-DRV01)

CTA visibility comes from `availableActions` per resource. Mobile-specific application:

- Per Q-DRV01, **capability flags** drive accept/reject CTA visibility per platform: `canRelayAccept`, `canRelayReject`, `relayUnavailableReasonCode`. If unsupported, disable CTA with reason (never hide the task — driver must still see it).
- Per Q-DRV06, **bind/unbind** CTA visibility depends on platform config `driverSelfServiceBinding`. If false, no bind/unbind CTA — show platform binding status only.
- Per Q-DRV13, **auto-accept** CTA only visible for platforms where platform config allows it (disabled by default globally).

### 3.6 Empty / not-ready states (Q-X15)

```ts
type EmptyReason =
  | "no_data"
  | "not_provisioned"
  | "fetch_failed"
  | "permission_denied"
  | "external_unavailable"
  | "driver_not_eligible" // driver-specific from spec
  | "filtered_empty";
```

Driver-specific examples:

- `/jobs` empty `no_data` (no work right now) vs `driver_not_eligible` (driver not eligible for any platform) vs `external_unavailable` (adapter down) — three distinct visual treatments
- `/platform-presence` `not_provisioned` (no platform accounts bound) vs `external_unavailable` (adapter degraded across all)
- `/earnings` `no_data` (no earnings yet) vs `permission_denied`

### 3.7 Audit

Driver-side actions are still audit-logged backend (e.g. accept, reject, SOS submit, clock in/out, force-offline). Driver does NOT see audit detail in app; the receipt is just confirmation. Backend audit is consumed by ops/admin/tenant.

### 3.8 No header search (Q-X07)

Driver app has **no header search** per Q-X07. Lookups happen via per-page filters (e.g. `/jobs` filter tabs).

### 3.9 Notifications (Q-X05, Q-X06) — native push + in-app

Per Q-X05, driver app uses **backend inbox + native push**. Push events delivered via native push:

```text
driver.task.offered              T0 urgent
driver.task.accept_timeout_warning   T0 urgent
driver.platform.reauth_required  T0 urgent
driver.platform.sync_failed      T0 urgent
driver.shift.end_reminder        T3 medium-priority push or in-app
driver.sos.acknowledged          T0 urgent — both push AND persistent in-app banner per Q-DRV12
```

Plus cross-app notices from platform-admin Q-ADM15 (critical / maintenance severity targets driver audience).

Inbox screen (TBD — see §7 whether to include an inbox view or surface notifications inline in `/` cockpit).

### 3.10 Cross-app navigation

Driver app does not cross-link to web apps (per Q-X03 source table: `driver-app → none for now`).

### 3.11 Offline mode (Q-DRV10) — partial offline model

```text
Action                                       Offline behavior
---------------------------------            -------------------------------------------------
accept / reject forwarded task               blocked unless provider explicitly supports offline relay
owned task non-critical note                 local queue allowed
trip completion proof upload                 queued and replayed
status change affecting external platform    online required
SOS                                          attempts native emergency flow + queues backend event when network returns
```

Visual must convey offline state clearly: page-level banner, action button disabled with reason, queued action indicators.

### 3.12 Trip primary-action rule (spec §5.5)

Per spec §5.5: "Show one primary action at a time" — only ONE primary CTA per trip state (accept / depart / arrived / start / complete). This is a functional rule for the trip page, not a visual preference.

### 3.13 SOS protected access (spec §5.9 + Q-DRV11)

SOS is accessible during trip but **protected from accidental tap** per Q-DRV11:

1. Tap SOS icon (visible during trip and on workspace cockpit)
2. SOS sheet opens with incident context
3. **Press-and-hold 2 seconds** to submit

This is the contract. Visual design picks styling and animation but cannot reduce friction (e.g. cannot make it a single-tap submit).

### 3.14 Platform health authority per platform (Q-DRV05 / Q-DRV07)

Re-auth mechanism is **platform-configured** per Q-DRV05. Supported mechanisms:

```text
external_browser_oauth     (default preferred per Q-DRV05; AppAuth-style)
native_app_deeplink
manual_credential
ops_managed                (driver cannot reauth themselves; ops handles)
```

UI must NOT default to in-app webview (security concern per Q-DRV05). The mechanism per platform is delivered as a capability flag; visual must handle all four mechanisms gracefully — e.g. "Re-authenticate" CTA opens external browser for OAuth, or deep-links to the platform's native app, or opens a manual credential form, or shows "Contact ops" for `ops_managed`.

Eligibility per Q-DRV07: driver UI receives `eligibleServiceBuckets` + `ineligibleReasons`. UI must **show reason**, not just hide unavailable work.

---

## 4. Sitemap

Driver app uses Expo Router (file-based routing). Routes are the file names without `.tsx`.

### 4.1 Tab structure (primary nav per spec §5.1)

```
Tab bar (visible when provisioned + workspace-ready)
├── 工作台 / `index` (workspace cockpit / ready state)
├── 任務 / `jobs`
├── 行程 / `trip`
├── 平台 / `platform-presence`
└── 設定 / `settings`
```

### 4.2 Contextual routes (not in tab bar)

```
├── `onboarding` (unprovisioned state — replaces tab bar entirely)
├── `incident` (SOS — accessible from trip / cockpit; opens as sheet/modal, not destination)
├── `earnings` (from cockpit or settings)
└── `shift` (from cockpit)
```

Per spec §5.1 contextual route table:

| Route       | Entry                   |
| ----------- | ----------------------- |
| `/incident` | From trip/SOS action    |
| `/earnings` | From workspace/settings |
| `/shift`    | From workspace          |

### 4.3 State-based navigation rules

- **Unprovisioned** → `onboarding` only; tab bar hidden; cannot access work pages (per spec §5.2)
- **Provisioned + off-shift** → tab bar visible; cockpit (`/`) shows "Start shift" as primary CTA; `/trip` likely empty or read-only
- **Provisioned + on-shift + no trip** → tab bar visible; cockpit shows "Review tasks" as primary CTA; `/jobs` populated
- **Provisioned + on-shift + in trip** → tab bar visible; cockpit shows "Return to active trip" as primary CTA; `/trip` is the workspace
- **SOS active** → cockpit + trip pages show persistent SOS ack banner (per Q-DRV12) until dismissed or incident closes

### 4.4 Inter-screen navigation flows

- `/onboarding` registration success → tab bar appears, lands on `/`
- `/` next-best-action CTA → context-dependent target (`shift` to start, `platform-presence` to go online, `jobs` to triage, `trip` to return, `settings` for re-auth)
- `/jobs` owned task tap → `/trip`
- `/jobs` forwarded task tap → `/trip` (with forwarded mode)
- `/jobs` filter chips: 全部 / 待處理 / 進行中 / 平台結案 / 需同步異常 (per spec §5.4)
- `/trip` SOS icon → `/incident` (sheet)
- `/platform-presence` re-auth → external browser / native app / manual form / ops contact (per Q-DRV05 mechanism)
- `/settings` platform binding section → links to `/platform-presence` for current state
- `/incident` submit → returns to `/trip` (per spec §5.9)
- Driver SOS push notification arrives → app foreground deep-link to `/incident`
- Driver task offer push → app foreground deep-link to `/jobs` with new task highlighted

---

## 5. Per-screen functional briefs

Schema per screen (same as web packets, mobile-adapted): spec ref / refresh tier / primary persona-state / primary task / must-show data / must-support actions / decision points / state variants / entry-exit.

---

### 5.1 `/onboarding` — Device Provisioning + Workspace Cockpit (two states)

**Per spec §5.2 + §5.3**, this route has **two states** — unprovisioned and ready (workspace cockpit). They're functionally different screens behind the same route.

#### 5.1.A `/onboarding` (unprovisioned state) — Device Provisioning

- **Spec ref:** §5.2
- **Refresh tier:** N/A (form page)
- **Primary persona-state:** Driver — unprovisioned
- **Primary task:** Activate this device and authenticate.
- **Must-show data:**
  - Activation step state
  - Registration code field
  - Device name field
  - Status strip: device, identity, platform (per spec §5.2)
- **Must-support actions:**
  - Submit device registration (medium)
- **Decision points:** None (single-purpose form)
- **State variants:**
  - initializing
  - unprovisioned (empty form)
  - submitting
  - registration error (inline error)
  - registered and loading workspace (brief transition to ready state)
- **Functional design requirements (from spec §5.2):**
  - Activation flow, not generic form
  - Primary CTA: `註冊此裝置`
  - Secondary safety copy explaining why unconfigured devices are blocked
  - **Prevent access to work pages when unprovisioned** (tab bar hidden)
- **Entry:** Initial app launch on a new device
- **Exit:** On success → workspace cockpit (`/onboarding` ready state, then to `/`)

#### 5.1.B `/` (workspace cockpit / ready state per spec §5.3)

This is technically `/onboarding` ready state per spec but functionally maps to the `index.tsx` tab landing.

- **Spec ref:** §5.3
- **Refresh tier:** T3 medium (15s)
- **Primary persona-state:** Driver — provisioned (any sub-state)
- **Primary task:** See readiness, current shift, urgent tasks, active trip; act on next-best-action.
- **Must-show data:**
  - Device / identity / platform readiness summary
  - Current shift state
  - Platform online count (e.g. "online on 2 of 3 platforms")
  - Urgent task count (needs-action tasks)
  - Active trip summary (if one exists)
  - **Next best action** (per spec §5.3 — visually dominant per spec design requirement)
  - Multi-platform health summary (which platforms are online / offline, reauth required count, forwarded pending count) per spec §5.3 multi-platform requirements
- **Must-support actions:**
  - Next-best-action CTA (context-dependent per §4.3)
  - Navigate to task inbox, trip, platform presence, earnings, shift, settings
- **Decision points:**
  - What's the most important thing for me to do right now?
- **State variants:**
  - Off-shift, no active trip → "Start shift" dominant
  - On-shift, no platform online → "Go online" dominant
  - On-shift, online, no task → "Review tasks" or peaceful "Standing by" state
  - On-shift, with urgent task → "Review urgent task" dominant
  - On-shift, in active trip → "Return to active trip" dominant
  - Any state with platform reauth required → "Resolve [platform] re-auth" dominant
  - With SOS active → persistent SOS ack banner (per Q-DRV12)
- **Functional design requirements (from spec §5.3):**
  - "This is a cockpit, not a list of links."
  - "The next action is visually dominant."
  - "Platform health and task urgency are visible above secondary cards."
- **Entry:** After onboarding success, after switching tabs back
- **Exit:** Any next-best-action target

---

### 5.2 `/jobs` — Unified Task Inbox

- **Spec ref:** §5.4
- **Refresh tier:** T3 (15s) + push interrupt on `driver.task.offered`
- **Primary persona-state:** Driver — on-shift
- **Primary task:** See all tasks across owned + external platforms; act on the next one.
- **Must-show data:**
  - Filter tabs (per spec §5.4): 全部 / 待處理 / 進行中 / 平台結案 / 需同步異常
  - Summary header (per spec §5.4): total tasks, needs-action, external platform tasks, sync/reauth issues
  - Per task card (per spec §5.4):
    - task ID
    - order ID
    - source platform (with **clear platform branding/chip** per spec §5.4 design requirement)
    - **owned vs forwarded domain** (visually distinguishable per spec design requirement: "Do not make forwarded tasks look identical to DRTS-owned tasks")
    - task status
    - external native status if available (forwarded)
    - route lock (locked / unlocked)
    - fixed fare
    - service type
    - required action (per task)
    - deadline / age when available (relevant for forwarded `accept_pending` per Q-DRV02 30s default countdown)
- **Must-support actions:** per `availableActions` + Q-DRV01 capability flags:
  - Owned task tap → `/trip`
  - Forwarded task tap → `/trip` with forwarded mode
  - Accept (medium; only if `canRelayAccept=true` per Q-DRV01)
  - Reject (medium; only if `canRelayReject=true` per Q-DRV01)
  - If accept/reject not supported by platform: show task as mirror-only with disabled CTA + reason (per Q-DRV01)
- **Decision points:**
  - Which task to take next (needs-action sort per spec §5.4: "Needs-action tasks should sort or visually rank above passive tasks")
  - Whether to accept or reject a forwarded offer (when both are supported)
- **State variants (per spec §5.4):**
  - loading
  - empty all (`no_data`)
  - empty filter (`filtered_empty`)
  - error (`fetch_failed`)
  - disabled by feature flag (`not_provisioned`)
  - **driver not eligible** (`driver_not_eligible` — Q-X15 explicitly distinguishes)
  - refreshing
  - source platform terminal
  - source platform sync issue (`external_unavailable` — show "需派車台處理" with no tech stack trace per spec §5.4)
- **Entry:** Tab bar, push notification deep-link to a specific new task
- **Exit:** `/trip`

---

### 5.3 `/trip` — Trip Operation

- **Spec ref:** §5.5
- **Refresh tier:** T1 (3s) + push interrupt
- **Primary persona-state:** Driver — in trip
- **Primary task:** Execute the current trip safely with one primary action at a time.

Per spec §5.5, **owned** vs **forwarded** trips share layout but differ in authority and action model.

#### 5.3.A Owned task display

- **Must-show data:**
  - Active task summary
  - Route
  - Status
  - Live metrics: distance, duration, tracking status
  - Compliance gates
- **Must-support actions** — **one primary at a time** per spec §5.5:
  - accept / depart / arrived / start / complete (state-driven; only one visible)
  - Completion proof flow:
    - camera + photo library (max 5 photos, thumbnails, remove)
    - min photo count enforced
    - signoff reference
    - expense proof
    - blocker summary
  - Block completion if tracking/proof requirements not met
  - Preserve pending completion replay (per Q-DRV10 offline replay)
- **State variants (per spec §5.5):**
  - no active trip
  - loading
  - route unavailable
  - order unavailable
  - tracking active / denied / error
  - proof missing
  - completing

#### 5.3.B Forwarded task display

- **Must-show data:**
  - **Platform authority banner** (per spec §5.5: shared layout but different authority banner)
  - Native platform status (from external platform)
  - Local mirror status (DRTS-side)
  - Whether local actions are allowed (capability flag-driven per Q-DRV01)
- **Must-support actions:**
  - If action allowed:
    - accept relay (per Q-DRV01 capability)
    - reject relay if supported (per Q-DRV01)
    - pending confirmation state after accept (Q-DRV02 — 30s default countdown, copy "平台未確認此單，請勿再回應" if timeout per Q-DRV02)
  - If action not allowed:
    - explain that source platform controls operation
  - **Driver-safe manual fallback display** per Q-DRV04:
    - Receives `DriverOpsInstruction` record (instructionId, taskId, message, issuedBy, issuedAt, expiresAt?)
    - Displays as in-app banner + optional push
    - NOT a static label — it's an actual instruction from ops
- **State variants (per spec §5.5):**
  - forwarded offered
  - forwarded accept pending (with Q-DRV02 countdown)
  - forwarded confirmed
  - forwarded lost race (terminal, Q-DRV03: acknowledge only)
  - forwarded cancelled by platform (terminal, Q-DRV03: acknowledge only; may show compensation note)
  - forwarded sync failed / manual fallback (Q-DRV04 instruction banner)

#### 5.3.C Cross-mode functional design requirements (from spec §5.5)

- Only one primary action
- Sticky bottom action bar
- SOS accessible but protected (per Q-DRV11 press-and-hold 2s)

#### 5.3.D Entry / exit

- **Entry:** `/jobs` tap on task, return-to-active-trip from cockpit
- **Exit:** `/incident` (SOS), back to `/jobs` on terminal state

---

### 5.4 `/platform-presence` — Platform Presence

- **Spec ref:** §5.6 + driver-spec §6.3 driver-side perspective + Q-DRV05 / Q-DRV07
- **Refresh tier:** T3 (15s) + push interrupt on reauth/sync events
- **Primary persona-state:** Driver — provisioned
- **Primary task:** See platform health center; go online/offline; resolve re-auth.
- **Must-show data (per spec §5.6):**
  - Per platform account: platform name/code, online/offline status, re-auth required flag, token expiration, last sync time, whether platform can receive orders, whether driver is eligible for that platform
  - **Why a platform cannot send work** (per spec §5.6 multi-platform): offline / token expired / re-auth required / account not bound / **eligibility blocked with reason from Q-DRV07** / adapter degraded
  - Eligibility breakdown per service bucket (from Q-DRV07): `eligibleServiceBuckets[]` + `ineligibleReasons[]`
- **Must-support actions** per `availableActions` + Q-DRV05 mechanism:
  - Go online (medium)
  - Go offline (medium)
  - **Re-authenticate** (medium) — opens platform-configured mechanism per Q-DRV05:
    - `external_browser_oauth` (default; AppAuth-style; not in-app webview)
    - `native_app_deeplink`
    - `manual_credential` (in-app credential form)
    - `ops_managed` (shows "Contact ops" — driver cannot self-resolve)
  - View account/binding details
  - Refresh
- **Decision points:**
  - Which platform to focus on resolving first
  - Whether to go offline while addressing an issue
- **State variants:**
  - Per-platform busy state (action in flight)
  - Per-platform reauth required (visually prominent per spec design requirement)
  - Per-platform adapter degraded (prominent)
  - Per-platform ineligible (with reason)
  - Empty `not_provisioned` (no platforms bound yet) — directs to `/settings` for binding
- **Functional design requirements (from spec §5.6):**
  - Present as a platform health center
  - Re-auth and adapter degraded states must be prominent
  - Online/offline controls must be safe and unambiguous
- **Entry:** Tab bar, push notification on reauth required, link from `/` cockpit "Resolve [platform] re-auth"
- **Exit:** External browser / native app / manual form (per re-auth); `/settings` for binding management

---

### 5.5 `/earnings` — Earnings

- **Spec ref:** §5.7
- **Refresh tier:** Manual (refresh on focus or pull-to-refresh)
- **Primary persona-state:** Driver — any (typically off-shift for review)
- **Primary task:** See earnings summary by period; verify per-platform breakdown; track payouts.
- **Must-show data (per spec §5.7):**
  - Period switcher: today / week / month
  - Summary: net, gross, platform count, pending payout
  - Platform breakdown: platform code/name, gross, service fee, subsidy, net
  - Statements: receipt number, period month, trip count, fee plan version, payout status, net amount
- **Must-support actions:**
  - Switch period (low)
  - Refresh (low)
  - View statement detail (drawer or sheet — §7)
- **Decision points:**
  - Which platform is most profitable
  - Is payout pending vs paid clear
- **State variants:**
  - Empty `no_data` (no earnings yet)
  - Per-period populated
  - With pending payout (visible distinction from paid per spec design requirement)
  - With shadow ledger entries (per spec §5.7 multi-platform: shadow ledger marked reference-only if not payable by DRTS)
  - With reconciliation issue link (per spec §5.7: link to manager review, not claim final payout)
- **Functional design requirements (from spec §5.7):**
  - Money hierarchy: net first
  - Platform authority must be clear
  - Pending payout vs paid visually distinct
  - **Owned trips and forwarded shadow trips must not be mixed without labels** (multi-platform rule)
- **Entry:** Cockpit, settings link
- **Exit:** Back to source

---

### 5.6 `/shift` — Shift and Attendance

- **Spec ref:** §5.8 + Q-DRV08 (shift state affects platform availability) + Q-DRV09 (odometer)
- **Refresh tier:** Manual (form-style page)
- **Primary persona-state:** Driver — start/end of shift
- **Primary task:** Clock in to start shift; clock out to end shift.
- **Must-show data:**
  - Clock-in form (when not on shift): vehicle ID (optional), location (optional), odometer (optional but if entered must be integer per Q-DRV09)
  - Active shift summary (when on shift): vehicle, start time, start location, start odometer
  - Clock-out form (when on shift): current location (optional), current odometer (optional, integer, end >= start per Q-DRV09)
  - Per spec §5.8 multi-platform notes (functional):
    - Shift state affects driver availability for all platforms (Q-DRV08: clock-out disables internal availability; external platforms respect platform config `autoOfflineOnShiftEnd`)
    - Workspace shows if driver is online on platforms but not on shift (per spec — this is a §5.3 cockpit responsibility but shift page should hint at it)
- **Must-support actions:**
  - Clock in (medium)
  - Clock out (medium; may trigger auto-offline per Q-DRV08)
  - Odometer over-threshold confirmation (high — default max delta per shift = 800 km per Q-DRV09; over threshold requires confirmation and ops review flag)
- **Decision points:**
  - Ready to start shift?
  - Ready to end shift?
  - Odometer reading correct?
- **State variants:**
  - Off-shift (clock-in form)
  - On-shift (active shift display + clock-out form)
  - Submitting clock-in/out
  - Odometer validation error (integer only; end >= start)
  - Odometer over-threshold confirmation modal
- **Functional design requirements (from spec §5.8):**
  - Punch-clock style
  - On/off duty is the visual anchor
  - Bottom CTA for clock in/out
- **Entry:** Cockpit "Start shift" / "End shift" CTA, settings link
- **Exit:** Back to cockpit

---

### 5.7 `/incident` — SOS Incident

- **Spec ref:** §5.9 + Q-DRV11 (two-step confirmation) + Q-DRV12 (ACK back)
- **Refresh tier:** N/A (event page)
- **Primary persona-state:** Driver — emergency
- **Primary task:** Submit a critical safety incident with appropriate context.
- **Must-show data (per spec §5.9):**
  - Safety context
  - Optional details field (free text for circumstances)
  - **Multi-platform incident metadata** (per spec §5.9 + Q-X06): if incident is tied to an external-platform order, payload preserves: platform code, external order ID, local mirror order ID, current native status (driver doesn't manually enter; backend captures from active trip context)
- **Must-support actions:**
  - **Submit** — per Q-DRV11 two-step: tap opens this sheet → **press-and-hold 2 seconds** → submit. Visual styling is design's choice but the press-and-hold contract is binding (cannot reduce to single tap).
  - Cancel (low)
- **Decision points:**
  - Is this actually an emergency? (the friction is intentional per Q-DRV11)
- **State variants:**
  - Sheet opened
  - Press-and-hold in progress (visual progress indicator)
  - Submitting
  - Submitted (returns to `/trip` per spec §5.9 + SOS ack arrives per Q-DRV12 as native push AND persistent in-app banner; banner remains until driver dismisses or incident closes)
  - Submit failed (queued for replay per Q-DRV10 offline behavior)
- **Functional design requirements (from spec §5.9):**
  - High-risk but controlled
  - Two-step confirmation (Q-DRV11)
  - Never a single accidental tap
- **Entry:** SOS icon on `/trip` or `/` cockpit, native emergency flow integration (out of scope of this packet but spec implies)
- **Exit:** Returns to `/trip` after submit

---

### 5.8 `/settings` — Settings and Platform Binding

- **Spec ref:** §5.10 + Q-DRV05 / Q-DRV06 / Q-DRV13 / Q-DRV14
- **Refresh tier:** Manual (refresh on focus)
- **Primary persona-state:** Driver — any
- **Primary task:** Manage profile, preferences, and platform account bindings.
- **Must-show data (per spec §5.10):**
  - Driver profile: name, phone, email
  - Emergency contact: name, phone, relationship
  - Preferences:
    - language (zh-TW / en per Q-X17)
    - **max accept radius** (km unit per Q-DRV14; default 5 km for internal standard taxi / business dispatch; platform-specific override for external; per-platform values may be read-only if platform owns matching)
    - notifications (push permission status; per-event-type opt-in if supported by Q-X05/X06)
    - **auto-accept** (per Q-DRV13: per-platform, disabled by default; global auto-accept is NOT allowed in Phase 1; only platforms with platform config `autoAcceptAllowed=true` show the toggle)
  - Platform account binding:
    - list bound platform accounts
    - per platform: auth status, re-auth requirement, account identifier (safely displayed — masked if sensitive)
    - bind / unbind affordance only if platform config `driverSelfServiceBinding=true` per Q-DRV06
- **Must-support actions** per `availableActions`:
  - Update profile (medium)
  - Update emergency contact (medium)
  - Update preferences (medium)
  - Bind platform account (medium; per Q-DRV06 + Q-DRV05 auth mechanism)
  - Unbind platform account (high — requires reason; only if `driverSelfServiceBinding=true` per Q-DRV06)
  - Re-authenticate per platform (medium; same mechanism as `/platform-presence` per Q-DRV05)
  - Save save-state flow per spec §5.10: unchanged / dirty / saving / saved / error
- **Decision points:**
  - Update profile or wait
  - Which platforms to bind
  - Whether auto-accept makes sense for me (per platform)
- **State variants (per spec §5.10):**
  - Save state: unchanged / dirty / saving / saved / error
  - Partial load/save error
  - With unbound platforms vs all bound
  - With expired tokens (re-auth required, visually prominent)
- **Functional design requirements (from spec §5.10):**
  - Split into clear sections
  - Platform binding should align with platform-presence styling
- **Entry:** Tab bar
- **Exit:** External browser for re-auth, `/platform-presence` for binding status, back to cockpit

---

## 6. API mapping

| Screen               | Read methods                                                                                                                          | Write methods                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/onboarding`        | device state                                                                                                                          | `createDriverClient` / `createDriverBearerClient`, register device                                         |
| `/` (cockpit)        | driver identity, shift state, platform presence summary, task summary, active trip summary, multi-platform health, notifications      | (none direct; CTAs link out)                                                                               |
| `/jobs`              | unified driver task view model (per driver-spec §8.1 — TBD endpoint)                                                                  | accept relay (per Q-DRV01 capability), reject relay (per Q-DRV01)                                          |
| `/trip`              | owned task detail + forwarded task detail (TBD), live metrics, compliance gates, `DriverOpsInstruction` for manual fallback (Q-DRV04) | `completeTask`, status transitions (accept/depart/arrive/start/complete), proof upload                     |
| `/platform-presence` | platform presence view model (per driver-spec §8.2 — TBD), per-platform capability flags                                              | go online, go offline, re-authenticate (mechanism per Q-DRV05), refresh                                    |
| `/earnings`          | `listDriverStatements` (or driver-side equivalent), per-period summary, per-platform breakdown                                        | (none direct)                                                                                              |
| `/shift`             | active shift state                                                                                                                    | clock in, clock out (with odometer validation per Q-DRV09; auto-offline integration per Q-DRV08)           |
| `/incident`          | active trip context (for multi-platform metadata enrichment)                                                                          | submit incident (with multi-platform payload per Q-X06; offline replay per Q-DRV10)                        |
| `/settings`          | driver profile, preferences, platform binding state                                                                                   | update profile, update emergency contact, update preferences, bind/unbind per Q-DRV06, re-auth per Q-DRV05 |

Methods marked TBD need to be added to a driver-side API client (note: driver app cannot import `@drts/ui-web` or web-side client per Q-X04; needs its own client module). The unified task view model and platform presence view model are in driver-spec §8 and need contract definitions per answers §7.

---

## 7. Purely visual open questions

§3 covers cross-cutting; most decisions baked in. Remaining are mobile-specific visual / interaction choices.

### 7.1 Cross-cutting (mobile-adapted from web packets)

1. **Density target** — phone screen density. Per spec §9, target two device classes (360×800 narrow Android, 412×915 large). Visual choice.
2. **Stale-data visual treatment on mobile** — banner? Subtle tint? Pull-to-refresh prompt?
3. **Compact header chip shape** — what goes in (shift state? identity? push permission?). Spec §5.1 says compact + optional status chip; design decides exact content.
4. **Health placement** — no sidebar; where does API health go (settings? cockpit? not surfaced unless degraded?).
5. **Degraded banner pattern** — sticky? Dismissible? Per-screen vs global?
6. **Empty-state set per `EmptyReason`** — six visual treatments needed (including driver-specific `driver_not_eligible`).
7. **Native confirmation patterns** — per risk tier; iOS-style action sheets vs Android-style dialogs; cross-platform consistency.
8. **State pill / chip color system** — task states, platform presence states, trip states, shift states, etc.
9. **Loading skeleton vs spinner** — mobile patience differs from desktop.
10. **Notification surface** — in-app inbox view? Banner-only? Toast-style? Persistent for SOS ack per Q-DRV12.
11. **Offline mode visual treatment** — page banner? Tab bar tint? Action button states?

### 7.2 Per-screen

12. **`/onboarding` unprovisioned** — activation flow form layout; safety copy treatment; error inline vs sheet
13. **`/` cockpit** — next-best-action visual dominance (per spec §5.3); platform health summary card density; multi-state messaging
14. **`/jobs`** — task card design for owned vs forwarded (must be visually distinguishable per spec §5.4); needs-action sort/rank visual; filter chip layout for 5 tabs
15. **`/jobs` driver-safe sync-failure copy** — per spec §5.4 "需派車台處理" with no tech stack trace; visual treatment for this state
16. **`/jobs` `driver_not_eligible` state** — distinct visual from `no_data` (per Q-X15)
17. **`/trip`** — shared layout for owned vs forwarded but different authority banners; sticky bottom action bar; SOS protection (Q-DRV11 visual treatment for press-and-hold)
18. **`/trip` accept-pending countdown** — Q-DRV02 — how to visually convey 30s deadline (radial timer? countdown chip? bottom progress bar?)
19. **`/trip` manual fallback banner** — Q-DRV04 `DriverOpsInstruction` banner; static or auto-dismiss after expiresAt?
20. **`/trip` completion proof flow** — photo grid; min photo count enforcement; remove affordance; signoff / expense entry
21. **`/platform-presence`** — platform health center layout; per-platform card; re-auth mechanism affordance variation (4 different mechanisms per Q-DRV05); ineligibility reason display
22. **`/earnings`** — period switcher shape (segmented? tabs? swipe?); platform breakdown layout; shadow ledger / reconciliation visual indicator
23. **`/shift`** — punch-clock visual (per spec §5.8); odometer input UX; over-threshold confirmation modal
24. **`/incident`** — sheet styling; **press-and-hold 2s visual** (Q-DRV11) — animation, haptic feedback, progress indicator design (cannot reduce to single tap)
25. **`/incident` SOS ack persistent banner** — Q-DRV12 — design until-dismissed banner that survives navigation
26. **`/settings`** — section grouping; save-state visual (unchanged/dirty/saving/saved/error per spec §5.10); platform binding section alignment with `/platform-presence`
27. **`/settings` re-auth mechanism per platform** — 4 different mechanisms per Q-DRV05 (external browser, deep link, manual form, ops-managed) — how to visualize which mechanism this platform uses
28. **`/settings` auto-accept per platform** — Q-DRV13 — visual when platform doesn't support it (hidden? disabled with explanation?)
29. **Push notification surface in foreground** — when app is foreground, how do push events appear (banner? inline at top of current screen?)
30. **App tab bar treatment when in trip** — hide? Persist with reduced prominence?
31. **SOS icon placement** — spec §5.1 says "optional SOS icon where appropriate"; design decides when to show (cockpit always? trip always? settings never? incident-active state?)

### 7.3 Native / device

32. **Splash screen** — per native app conventions
33. **App icon** — visual identity
34. **Push notification visual treatment** — both iOS and Android
35. **Native back gesture handling** (Android) — what's destructive vs benign
36. **Permission request flows** — push permission, location permission, camera permission; first-time vs re-request
37. **Light vs dark mode** — system preference following?
38. **Localized formatting** — date, time, currency (TWD), distance (km per Q-DRV14)

---

## 8. Out of scope for this packet

- Visual design choices
- Native splash, app icon, store assets
- Web apps (already covered: ops-console, platform-admin, tenant-console)
- API contract additions (engineering follow-up per answers §7)
- Implementation backlog
- Migration plan from current driver-app state to designed state
- Map / route rendering choices (likely third-party integration; out of scope)
- Background location tracking implementation (out of scope; functional spec exists in driver-spec §5.5)

---

## 9. Hand-off process

Same shape as previous packets. Visual team reads this + answers doc + driver-spec §5 + §6. Flags any §7 questions; system-level questions go back to system design team (especially around native re-auth mechanisms in Q-DRV05, since OAuth handoff in a native app is a system architecture detail).

Visual team produces:

- IA sitemap (confirming or amending §4 file-based routes)
- Per-screen wireframes covering all state variants listed in §5 — including the two device classes (360×800 narrow Android, 412×915 large)
- Component system for native React Native (independent of web `@drts/ui-web`)
- Design tokens (colors, type, spacing, radius, elevation, density)
- Native-specific patterns: tab bar, sticky bottom action bar, sheet/modal conventions, press-and-hold gesture treatment, push notification visuals

Engineering picks up wireframes + tokens + §6 API mapping + new contracts (when they exist) and produces implementation backlog for the driver app.

This packet is input to step 1. Not a design.
