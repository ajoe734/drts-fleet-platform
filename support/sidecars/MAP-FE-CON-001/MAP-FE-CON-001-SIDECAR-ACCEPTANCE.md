# MAP-FE-CON-001 SIDECAR ACCEPTANCE

Snapshot Type: owner support packet from machine-truth and repo-live anchors
Snapshot Captured At: 2026-07-03T18:17:14Z
Snapshot Status At Capture: in_progress
Owner: Codex
Reviewer: Codex2
Parent Task: MAP-FE-CON-001
Parent Title: Concierge and partner map alignment

## Purpose

This packet is a sidecar-only support artifact for `MAP-FE-CON-001`. It does
not change canonical truth or runtime code. It packages a task-scoped
acceptance checklist, dependency map, and reviewer spot-check list for the
concierge and partner entry map-alignment slice.

## Scope Boundary

- Allowed: reviewer-facing support material for
  `apps/concierge-portal-web`, `apps/partner-booking-web`, their shared
  map/contract seams, and expected evidence paths.
- Not allowed: edits to frontend runtime code, `packages/contracts`,
  `packages/api-client`, execution docs, or parent-task closeout metadata
  beyond normal task-status commands.

## Machine-Truth Snapshot

- `ai-status.json` remains authoritative; this markdown file is only a
  snapshot captured via `scripts/ai-status.sh`.
- Sidecar task `MAP-FE-CON-001-SIDECAR-ACCEPTANCE` is `in_progress` at
  `2026-07-03T18:14:20Z` with next step
  `Preparing acceptance packet and dependency map support artifact`.
- Parent task `MAP-FE-CON-001` is `todo` at `2026-07-03T18:11:30Z`; owner
  and reviewer are `Gemini2` / `Codex`.
- Parent acceptance recorded in machine truth:
  - `concierge booking submits coordinates when dispatchable`
  - `partner assisted entry reason codes consistent`
  - `provider outage cannot create silent normal order`
  - `package checks pass`
- Parent dependency IDs are still recorded as `MAP-UI-001`, `MAP-BE-004`,
  and `MAP-BE-005`, but `scripts/ai-status.sh show` does not currently
  resolve those IDs in the active task index. Dependency status notes below
  therefore come from:
  - `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
  - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- Parent artifact paths currently declared in machine truth but missing in
  this worktree snapshot:
  - `tests/e2e/concierge-map-booking-ui.spec.ts`
  - `tests/e2e/partner-map-booking-ui.spec.ts`
  - `support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-REVIEW-EVIDENCE-20260701.md`
  - `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-concierge-ui-20260701T1028Z.json`
  - `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-partner-ui-20260701T1028Z.json`
  - `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-concierge-ui-20260702T0301Z.json`
  - `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-partner-ui-20260702T0301Z.json`
  - `support/sidecars/MAP-QA-002/artifacts/vitest-owned-mobility-entry-provider-unavailable-20260701T0941Z.json`

## Parent Verification Expected

From the 2026-06-30 execution packet, parent-task verification should include:

- `pnpm --filter @drts/concierge-portal-web typecheck`
- `pnpm --filter @drts/partner-booking-web typecheck`
- relevant test and lint commands for touched packages

## Acceptance Checklist

- [x] Packet stays scoped to `MAP-FE-CON-001` support only.
- [x] Dependency map covers shared picker primitive, contract payloads,
      frontend submit seams, backend gate expectations, and
      degraded/manual-review behavior.
- [x] Repo-live gaps are called out explicitly instead of assuming the parent
      implementation is already present.
- [x] Existing reference implementations are separated from still-missing
      parent evidence artifacts.
- [x] No canonical truth or runtime files are modified by this sidecar slice.

## Dependency Map

### Shared picker and contract foundation (`MAP-UI-001` baseline)

- `packages/ui-web/src/address-map-picker.tsx:518-1545`
  `AddressMapPicker` and `AddressMapPairPicker` already cover provider health,
  search results, manual coordinate fallback with override reason, draggable
  pin adjustment, and service-area preview banners for `serviceable`,
  `manual_review`, and `not_serviceable`.
- `packages/contracts/src/index.ts:2555-2577`
  `AddressPayload` already supports lat/lng plus provenance
  (`geocodeProvider`, `geocodeConfidence`, `coordinateSource`,
  `selectedByActorId`, `pinnedByActorId`, `manualOverrideReason`, `surface`,
  `coordinateProvenance`).
- `packages/contracts/src/index.ts:2713-2758`
  Both `CreateCallCenterOrderCommand` and `CreateTenantBookingCommand`
  already accept full `AddressPayload` pickup and dropoff objects rather
  than text-only strings.
- `packages/api-client/src/index.ts:691-750`
  Shared geo and service-area client methods already exist for provider
  health, search, resolve, reverse, definitions, and
  `/api/service-area/evaluate`.
- `packages/api-client/src/index.ts:1096-1110`
  Frontend create seams already exist for `/api/call-center/orders` and
  `/api/tenant/bookings`.

### Known-good wiring references

- `apps/tenant-console-web/lib/geo-map-provider.ts:1-122`
  Reference browser provider wiring proxies the shared picker into same-origin
  `/api/geo/*` routes and converts transport failures into
  `AddressProviderUnavailableError` so degraded and manual fallback are
  explicit.
- `apps/tenant-console-web/lib/tenant-address-map.ts:1-63`
  Reference mapping helpers show how saved addresses become picker payloads
  and how coordinate presence is tested before submit.
- `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx:1627-1661`
  Reference booking surface embeds `AddressMapPairPicker` and blocks submit
  with a visible banner when serviceability is `not_serviceable`.
- `tests/e2e/tenant-map-booking-ui.spec.ts:1-153`
  Reference Playwright seam already proves mock-provider search -> pin ->
  serviceability success and block behavior.
- `apps/ops-console-web/app/callcenter/page.tsx:2557-2607`
  Adjacent callcenter implementation already mounts two `AddressMapPicker`
  instances and surfaces a booking gate banner in the live UI.
- `apps/ops-console-web/app/callcenter/map-booking.ts:13-147`
  Adjacent callcenter helper already encodes the submit gate expected by
  `MAP-BE-004`: coordinates required, provenance required, preview required,
  preview unavailable blocked, and `not_serviceable` blocked before
  `CreateCallCenterOrderCommand` is built.

### Concierge parent surface (`MAP-FE-CON-001` live gap)

- `apps/concierge-portal-web/app/bookings/new/page.tsx:293-526`
  Current concierge booking form is still text-first and submits through a
  single `onSubmit` block without any shared map picker or provider seam.
- `apps/concierge-portal-web/app/bookings/new/page.tsx:348-356`
  Current `createCallCenterOrder` command sends `{ address }` only for both
  pickup and dropoff. No coordinates or provenance are attached even though
  the contract allows them.
- `apps/concierge-portal-web/app/bookings/new/page.tsx:465-485`
  Pickup and dropoff are still plain `<textarea>` inputs, so dispatch-ready
  coordinates cannot be captured client-side.
- `apps/concierge-portal-web/app/bookings/new/page.tsx:270-287`
  Guardrail routes for denied, ineligible, and recording-unavailable already
  exist, so the parent task should preserve explicit degraded routing instead
  of silently falling back when geo or service-area checks fail.

### Partner parent surface (`MAP-FE-CON-001` live gap)

- `apps/partner-booking-web/components/partner-booking-form.tsx:513-535`
  Trip details remain plain text fields for pickup, dropoff, and time
  window; no shared picker or serviceability preview is mounted.
- `apps/partner-booking-web/components/partner-booking-form.tsx:672-699`
  Review and submit currently end in a local success banner only. The form
  does not yet wire backend booking creation, backend gate rendering, or
  degraded and manual-review states.
- `apps/partner-booking-web/lib/partner-booking-form.ts:9-35`
  The draft model stores pickup and dropoff as strings only.
- `apps/partner-booking-web/lib/partner-booking-form.ts:219-277`
  Current field validation checks text presence and window ordering, but not
  coordinates, provenance, or service-area outcome.
- `apps/partner-booking-web/lib/api-client.ts:572-589`
  `createPartnerBooking()` already exists and accepts
  `CreateTenantBookingCommand`; the parent task needs to wire the current
  form into this existing command seam with coordinate-bearing
  `AddressPayload`s.
- `apps/partner-booking-web/lib/translations.ts:19-29`
  Funnel copy already distinguishes separate partner surfaces.
- `apps/partner-booking-web/lib/translations.ts:285-287`
  Existing manual-review copy is generic user-facing language; parent work
  should keep reason rendering user-safe and avoid leaking internal policy
  jargon.

### Backend dependency status notes

- `MAP-BE-004`
  The 2026-06-30 execution packet and 2026-06-30 gap inventory both describe
  this dependency as the backend booking-creation service-area gate:
  coordinate-bearing bookings must evaluate serviceability,
  `not_serviceable` and no-pickup cases must hard-block, and
  `manual_review` or coordinate-missing legacy paths must not silently
  dispatch.
- `MAP-BE-005`
  The same packet and gap inventory describe this dependency as the immutable
  spatial-audit snapshot layer: created orders should retain coordinate
  provenance, decision, area and policy and version refs, actor and surface,
  and audit evidence. Parent frontend evidence should therefore demonstrate
  not only UI banners but that booking commands carry the data needed for this
  backend audit seam.
- `MAP-UI-001`
  The same packet and gap inventory describe this dependency as already
  landed shared `AddressMapPicker` and `AddressMapPairPicker` foundation.
  Parent work should compose with it rather than invent a concierge-only or
  partner-only map primitive.

## What The Reviewer Should Confirm

- The packet points the parent owner to shared primitives and live contract
  seams, not to speculative new APIs.
- The concierge gap is accurately captured as text-only pickup and dropoff
  submission today, with no coordinate-bearing `CreateCallCenterOrderCommand`
  payload yet.
- The partner gap is accurately captured as local draft and review UI today,
  with no serviceability preview or backend booking submission yet.
- The packet distinguishes current reference implementations
  (`tenant-console`, `ops-console callcenter`) from still-missing parent
  evidence files.
- The parent closeout should either create the machine-truth-listed evidence
  paths or update machine truth to the actual delivered paths before claiming
  `done`.

## Evidence Index

- `scripts/ai-status.sh show MAP-FE-CON-001`
- `scripts/ai-status.sh show MAP-FE-CON-001-SIDECAR-ACCEPTANCE`
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- `packages/ui-web/src/address-map-picker.tsx`
- `packages/contracts/src/index.ts`
- `packages/api-client/src/index.ts`
- `apps/tenant-console-web/lib/geo-map-provider.ts`
- `apps/tenant-console-web/lib/tenant-address-map.ts`
- `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx`
- `apps/ops-console-web/app/callcenter/page.tsx`
- `apps/ops-console-web/app/callcenter/map-booking.ts`
- `apps/concierge-portal-web/app/bookings/new/page.tsx`
- `apps/partner-booking-web/components/partner-booking-form.tsx`
- `apps/partner-booking-web/lib/partner-booking-form.ts`
- `apps/partner-booking-web/lib/api-client.ts`
- `apps/partner-booking-web/lib/translations.ts`
- `tests/e2e/tenant-map-booking-ui.spec.ts`

## Reviewer Handoff

Owner handoff command:
`AI_NAME=Codex scripts/ai-status.sh handoff MAP-FE-CON-001-SIDECAR-ACCEPTANCE Codex2 "Prepared MAP-FE-CON-001 support packet at support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-SIDECAR-ACCEPTANCE.md. Packet captures machine-truth snapshot, dependency map, live concierge and partner gaps, and reference map-picker seams without changing canonical or runtime files. Verified sidecar-only diff with git diff --check; parent machine-truth artifact paths still missing in this worktree are called out explicitly for reviewer follow-up."`

Reviewer approval command:
`AI_NAME=Codex2 scripts/ai-status.sh approve MAP-FE-CON-001-SIDECAR-ACCEPTANCE "Reviewed: support packet stays sidecar-only, accurately maps concierge and partner gaps to shared picker and backend dependencies, and clearly distinguishes existing references from missing parent evidence paths."`

## Local Verification For This Sidecar Slice

- Confirm only
  `support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-SIDECAR-ACCEPTANCE.md`
  changed for this task.
- Run
  `git diff --check -- support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-SIDECAR-ACCEPTANCE.md`.
- Spot-check missing parent artifact paths before the parent task claims
  review evidence exists.
- Package checks were not run here because this slice does not modify runtime
  code; the expected parent verification commands are recorded above.
