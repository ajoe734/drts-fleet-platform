# Enterprise Dispatch Frontend Development Work Package

**Date:** 2026-06-12
**Umbrella task:** `ENT-DISP-FE-20260612`
**Product:** 企業用戶叫車前台 (`enterprise_dispatch`)
**Design source:** `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`
**Functional source:** `docs/05-ui/enterprise-dispatch-booking-screen-requirements-20260612.md`
**Topology/freeze decision:** `docs/01-decisions/SD-DP-20260612-007-enterprise-dispatch-frontend-and-lovable-freeze.md`
**Target:** fresh in-repo frontend rebuild; do not extend `tenant-portal-web`, `tenant-console-web`, or `partner-booking-web`.

## 1. Product boundary

Build a dedicated enterprise booking frontend for employees, delegates, and riders:

- S1 enterprise internal website version
- S2 enterprise internal app embedded webview version

This is not credit-card airport transfer. Airport fields appear only as conditional enterprise-dispatch context, while identity, cost center, approval, quota, and billing semantics stay under `enterprise_dispatch`.

## 2. Proposed app target

Create a new Next.js app:

- `apps/enterprise-dispatch-web`
- package name: `@drts/enterprise-dispatch-web`
- default dev port: `3010`

Rationale:

- `apps/tenant-portal-web` is explicitly sunset and must not receive production feature work.
- `apps/tenant-console-web` is the tenant admin console, not employee self-service.
- `apps/partner-booking-web` owns partner / cardholder style program flows, not enterprise employee booking.

## 3. Routes to implement

S1 website:

- `/`
- `/bookings/new`
- `/bookings/review`
- `/bookings/submitted`
- `/bookings/[bookingId]`
- `/bookings`
- `/trip`
- `/receipts/[bookingId]`
- `/help`

Gate states:

- `/auth-required`
- `/suspended`
- `/approval-pending`
- `/approval-rejected`
- `/quota-blocked`
- `/no-supply`
- `/degraded`

S2 embed:

- `/embed`
- `/embed/reauth-required`
- `/embed/unsupported-host`
- `/embed/consent-required`
- `/embed/fallback-to-web`

## 4. Development slices

### ENT-DISP-FE-20260612-A — App scaffold and architecture

Owner lane: supervisor should assign to an implementation owner.

Scope:

- Add `apps/enterprise-dispatch-web`.
- Wire package scripts: `dev`, `build`, `typecheck`, `lint`, `test`.
- Add Next config, tsconfig, app layout, global CSS.
- Add root package scripts if project convention requires it.
- Add Docker/deploy stubs only if required by existing app patterns.
- Add README documenting product boundary and explicit non-reuse of card airport transfer.

Acceptance:

- `pnpm --filter @drts/enterprise-dispatch-web typecheck` passes.
- `pnpm --filter @drts/enterprise-dispatch-web lint` passes or app has matching repo lint baseline.
- App renders a basic shell at `/`.

### ENT-DISP-FE-20260612-B — Design system and shell

Scope:

- Recreate the `ent-kit.jsx` tokens as production React/CSS primitives.
- Implement tenant-branded web shell with top nav: home, bookings, trip, help.
- Implement compact embed shell with host app chrome and identity status strip.
- Implement shared primitives: button, pill, banner, card, row, field, input, segmented control, avatar, KPI, stepper, timeline/progress rail.

Acceptance:

- Web shell matches design intent in `Enterprise Dispatch.html`.
- Embed shell has compact app chrome and no admin navigation.
- Components support zh-TW-first copy and raw-code labels where shown in design.

### ENT-DISP-FE-20260612-C — Website booking flow

Scope:

- Implement `/`, `/bookings/new`, `/bookings/review`, `/bookings/submitted`.
- Model self-booking and delegate booking.
- Make `passenger` vs `bookedBy` separation visible.
- Cost center, quota preview, approval preview are first-class.
- Airport fields are conditional enterprise dispatch context, not the central IA.
- Submitted page supports confirming, approval, and degraded postures.

Acceptance:

- User can move through home -> new booking -> review -> submitted using fixture data.
- Review page prioritizes cost ownership and approval posture.
- Submitted page does not falsely claim synchronous completion.

### ENT-DISP-FE-20260612-D — Website query, status, and outcome pages

Scope:

- Implement `/bookings`, `/bookings/[bookingId]`, `/trip`, `/receipts/[bookingId]`, `/help`.
- Booking detail uses backend-shaped `availableActions` rather than deriving action authority from status text.
- Active trip uses progress rail.
- Receipt page supports ready and unsupported states.
- Help page includes support, quota, approval, cancellation, and degraded FAQ.

Acceptance:

- Booking history supports filters for all, mine, booked by me, date/search placeholders.
- Detail page shows timeline, cost center, approval, assigned driver/vehicle/ETA when available.
- Trip page labels ETA as estimate and does not expose dispatch mutations.

### ENT-DISP-FE-20260612-E — Gate and embed identity states

Scope:

- Implement all web gate states using one support-safe template.
- Implement embed identity states:
  - handoff ok
  - re-auth required
  - unsupported host
  - consent required
  - fallback to internal website
- Ensure embed never asks for management credentials and never shows admin nav.

Acceptance:

- Each gate state has reason, status/posture, key/value details, next action, and enterprise support.
- Embed states clearly communicate host token/session status.
- Unsupported host and fallback states are security-forward without exposing raw internal errors.

### ENT-DISP-FE-20260612-F — API contract wiring, tests, and rollout

Scope:

- Add fixture-backed data layer first, then prepare API client wiring to `/api/tenant/*`.
- Map route needs to existing `@drts/api-client` helpers or document gaps.
- Add unit tests for booking form state, action availability, gate state config, embed state config.
- Add Playwright smoke covering web flow and embed states.
- Add runbook/deploy note for the new app.

Acceptance:

- Tests run through app-local script.
- Gaps in backend/client helpers are documented with exact endpoints.
- Dev URL, smoke command, and rollback note are recorded.

## 5. API mapping

Expected backend authority remains `/api/tenant/*`:

- `GET /api/tenant/passengers`
- `GET /api/tenant/addresses`
- `GET /api/tenant/cost-centers`
- `GET /api/tenant/quota-summary` or existing quota equivalent
- `POST /api/tenant/bookings/policy-preview` or existing quota/approval preview equivalent
- `POST /api/tenant/bookings/commands/create` or existing create command equivalent
- `GET /api/tenant/bookings`
- `GET /api/tenant/bookings/:bookingId`
- `POST /api/tenant/bookings/:bookingId/commands/update`
- `POST /api/tenant/bookings/:bookingId/commands/cancel`

If the canonical backend currently exposes older non-command endpoints, workers must document the adapter decision instead of silently inventing endpoints.

## 6. Hard guardrails

- Do not reuse `apps/partner-booking-web` for enterprise employee booking.
- Do not extend sunset `apps/tenant-portal-web` for production work.
- Do not put employee self-service inside `tenant-console-web` admin shell.
- Do not collapse `credit_card_airport_transfer` and `enterprise_dispatch`.
- Do not use Lovable / `tenant-commute-hub` as a production implementation source. It is frozen by `SD-DP-20260612-007` and may only be used as a historical behavior reference.
- Do not derive permissions from status labels; use backend-shaped `availableActions`.
- Do not mark command submit as complete when the state is accepted+pending.

## 7. Supervisor dispatch recommendation

Recommended first wave:

1. `ENT-DISP-FE-20260612-A` establishes the new app shell.
2. `ENT-DISP-FE-20260612-B` can run after or partly beside A if app scaffold exists.
3. `ENT-DISP-FE-20260612-C` and `ENT-DISP-FE-20260612-D` should be split after B to reduce conflicts.
4. `ENT-DISP-FE-20260612-E` can run in parallel with C/D once shell primitives exist.
5. `ENT-DISP-FE-20260612-F` should start with API gap mapping immediately, then finish after UI routes exist.

Recommended owners:

- Supervisor / reviewer: `Claude`
- App scaffold and frontend implementation: `Claude2` or `Codex`
- Runtime/deploy follow-up: `Gemini` or `Gemini2`
- Spec critique / boundary review: `Copilot`
