# MAP-FE-CON-001 SIDECAR ACCEPTANCE

Snapshot Type: owner support packet from machine-truth and branch-local inspection anchors
Snapshot Captured At: 2026-07-03T18:37:12Z
Snapshot Status At Capture: review_approved
Owner: Codex
Reviewer: Codex2
Parent Task: MAP-FE-CON-001
Parent Title: Concierge and partner map alignment
Task Branch: `codex/map-fe-con-001-sidecar-acceptance`
Parent Owner / Reviewer Snapshot: `Claude2` / `Codex`

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
- Sidecar task `MAP-FE-CON-001-SIDECAR-ACCEPTANCE` is `review_approved` at
  `2026-07-03T18:36:06Z` with reviewer note
  `Reviewed: support packet stays sidecar-only, uses machine-truth plus branch-local inspection-anchor language, accurately maps concierge and partner gaps to shared picker and backend dependencies, and clearly distinguishes current references from missing parent evidence artifacts.`
- Parent task `MAP-FE-CON-001` is `in_progress` at `2026-07-03T18:29:19Z`
  with owner / reviewer `Claude2` / `Codex` and next step
  `Investigation complete. Dev concierge/partner forms are still text-only (no picker/gate). codex2 branch built against stale unshipped ui-web API; d73cab191 is the REJECTED visible-lat/lng design; accepted picker-based fix was never committed. Plan: build fresh against shipped dev @drts/ui-web AddressMapPicker API, mirroring shipped callcenter (MAP-FE-CALL-001) pattern. Backend anti-bypass (legacy_text->manual_review_queue+audit) already shipped. Implementing concierge lib+page+picker+outage gate, then partner funnel, tests, package checks.`
- Parent machine-truth references currently point at:
  - `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`
  - `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`
- Those `20260701` files are focused addenda for `MAP-FE-ADM-001` and
  explicitly complement, not replace,
  `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md` and
  `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`.
  This packet therefore uses the `20260630` baseline docs for
  `MAP-FE-CON-001` dependency semantics and the `20260701` refs only as the
  current machine-truth parent pointers.
- Parent acceptance recorded in machine truth:
  - `concierge booking submits coordinates when dispatchable`
  - `partner assisted entry reason codes consistent`
  - `provider outage cannot create silent normal order`
  - `package checks pass`
- Branch-local inspection anchors spot-checked in this owner worktree:
  - `apps/tenant-console-web/lib/geo-map-provider.ts`
  - `apps/tenant-console-web/lib/tenant-address-map.ts`
  - `apps/ops-console-web/app/callcenter/map-booking.ts`
  - `tests/e2e/tenant-map-booking-ui.spec.ts`
  - `packages/ui-web/src/address-map-picker-core.ts`
  - `packages/ui-web/src/address-map-picker.tsx`
- Reviewer rejection context resolved: the prior draft used wording that
  overstated what this sidecar can prove across other worktrees. The approved
  revision keeps these files as branch-local inspection anchors only and
  separates them from still-missing parent evidence.
- Parent artifact paths currently declared in machine truth but still missing in
  this worktree snapshot:
  - `tests/e2e/concierge-map-booking-ui.spec.ts`
  - `tests/e2e/partner-map-booking-ui.spec.ts`
  - `support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-REVIEW-EVIDENCE-20260701.md`
  - `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-concierge-ui-20260701T1028Z.json`
  - `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-partner-ui-20260701T1028Z.json`
  - `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-concierge-ui-20260702T0301Z.json`
  - `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-partner-ui-20260702T0301Z.json`
  - `support/sidecars/MAP-QA-002/artifacts/vitest-owned-mobility-entry-provider-unavailable-20260701T0941Z.json`
- Current adjacent support artifacts in-tree are limited to:
  - `support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-SIDECAR-ACCEPTANCE.md`
  - `support/sidecars/MAP-QA-001/artifacts/playwright-map-geofence-harness-20260701T1020Z.json`

## Parent Verification Expected

From the `2026-06-30` baseline execution packet, parent-task verification
should include:

- `pnpm --filter @drts/concierge-portal-web typecheck`
- `pnpm --filter @drts/partner-booking-web typecheck`
- relevant test and lint commands for touched packages

## Evidence Model

- `ai-status.json` and `scripts/ai-status.sh show ...` remain the source of
  truth for task ownership, dependency declarations, and parent artifact
  expectations.
- This markdown packet contributes only branch-local inspection anchors from
  the current owner worktree; it does not claim repo-wide or reviewer-worktree
  validation.
- Missing parent evidence stays listed as missing until the parent owner either
  creates those artifacts or updates machine truth to point at the actual
  delivered paths.

## Acceptance Checklist

- [x] Packet stays scoped to `MAP-FE-CON-001` support only.
- [x] The packet distinguishes branch-local inspection anchors from machine-
      truth artifact expectations.
- [x] Dependency map covers shared picker primitives, contract payloads,
      frontend submit seams, backend gate expectations, and degraded/manual
      behavior.
- [x] Current concierge and partner gaps are described from cited branch-local
      files, not speculative implementation intent.
- [x] Missing parent evidence artifacts are called out explicitly instead of
      being assumed present.
- [x] No canonical truth or runtime files are modified by this sidecar slice.

## Branch-Local Inventory Summary

- Present branch-local inspection anchors used by the dependency map:
  - `apps/tenant-console-web/lib/geo-map-provider.ts`
  - `apps/tenant-console-web/lib/tenant-address-map.ts`
  - `apps/ops-console-web/app/callcenter/map-booking.ts`
  - `tests/e2e/tenant-map-booking-ui.spec.ts`
  - `packages/ui-web/src/address-map-picker-core.ts`
  - `packages/ui-web/src/address-map-picker.tsx`
- Still missing parent evidence paths from machine truth:
  - `tests/e2e/concierge-map-booking-ui.spec.ts`
  - `tests/e2e/partner-map-booking-ui.spec.ts`
  - `support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-REVIEW-EVIDENCE-20260701.md`
  - `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-concierge-ui-20260701T1028Z.json`
  - `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-partner-ui-20260701T1028Z.json`
  - `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-concierge-ui-20260702T0301Z.json`
  - `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-partner-ui-20260702T0301Z.json`
  - `support/sidecars/MAP-QA-002/artifacts/vitest-owned-mobility-entry-provider-unavailable-20260701T0941Z.json`

## Dependency Map

### Shared picker and contract foundation (`MAP-UI-001` baseline)

- `packages/ui-web/src/address-map-picker-core.ts:260-417`
  Provider outage is explicit via `AddressProviderUnavailableError`, and both
  provider-candidate and manual-pin flows already emit provenance-bearing
  `AddressPayload`s.
- `packages/ui-web/src/address-map-picker.tsx:551-893`
  `AddressMapPicker` already covers provider health, search, candidate
  selection, manual coordinate fallback with required reason, draggable pin
  adjustment, and single-stop serviceability preview.
- `packages/ui-web/src/address-map-picker.tsx:1402-1544`
  `AddressMapPairPicker` already composes pickup/dropoff state and shared
  preview banners once the required points are pinned.
- `packages/contracts/src/index.ts:2555-2577`
  `AddressPayload` already supports lat/lng plus provenance fields such as
  `geocodeProvider`, `geocodeConfidence`, `coordinateSource`,
  `selectedByActorId`, `pinnedByActorId`, `manualOverrideReason`, `surface`,
  and `coordinateProvenance`.
- `packages/contracts/src/index.ts:2713-2758`
  Both `CreateCallCenterOrderCommand` and `CreateTenantBookingCommand`
  already accept full `AddressPayload` pickup and dropoff objects.
- `packages/api-client/src/index.ts:691-750`
  Shared geo and service-area client methods already exist for provider health,
  search, resolve, reverse, definitions, and `/api/service-area/evaluate`.
- `packages/api-client/src/index.ts:1096-1110`
  Frontend create seams already exist for `/api/call-center/orders` and
  `/api/tenant/bookings`.

### Known-good wiring references

- `apps/tenant-console-web/lib/geo-map-provider.ts:1-122`
  Reference browser provider wiring proxies the shared picker into same-origin
  `/api/geo/*` routes and converts transport failures into
  `AddressProviderUnavailableError`, so degraded and manual fallback are
  explicit.
- `apps/tenant-console-web/lib/tenant-address-map.ts:1-63`
  Reference mapping helpers show how saved addresses become picker payloads
  and how coordinate presence is tested before submit.
- `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx:1627-1661`
  Reference booking surface already embeds `AddressMapPairPicker` and shows a
  visible blocking banner when serviceability is `not_serviceable`.
- `tests/e2e/tenant-map-booking-ui.spec.ts:1-153`
  Reference Playwright seam already proves mock-provider search -> pin ->
  serviceability success and block behavior without a live geo backend.
- `apps/ops-console-web/app/callcenter/page.tsx:2557-2607`
  Adjacent callcenter implementation already mounts shared map pickers in the
  live UI and renders a booking-gate banner.
- `apps/ops-console-web/app/callcenter/map-booking.ts:1-147`
  Adjacent callcenter helper already encodes the submit gate expected by
  `MAP-BE-004`: coordinates required, provenance required, preview required,
  preview unavailable blocked, and `not_serviceable` blocked before
  `CreateCallCenterOrderCommand` is built.

### Concierge parent surface (`MAP-FE-CON-001` live gap)

- `apps/concierge-portal-web/app/bookings/new/page.tsx:293-526`
  Current concierge booking is still a text-first form with one `onSubmit`
  block and no shared map picker or provider seam.
- `apps/concierge-portal-web/app/bookings/new/page.tsx:348-356`
  Current `createCallCenterOrder` submission sends `{ address }` only for both
  pickup and dropoff. No coordinates or provenance are attached even though the
  contract already supports them.
- `apps/concierge-portal-web/app/bookings/new/page.tsx:465-485`
  Pickup and dropoff remain plain `<textarea>` inputs, so dispatch-ready
  coordinates cannot be captured client-side.
- `apps/concierge-portal-web/app/bookings/new/page.tsx:270-287`
  Guardrail routes for denied, ineligible, and recording-unavailable already
  exist, so the parent task should preserve explicit degraded routing instead of
  silently falling back when geo or service-area checks fail.

### Partner parent surface (`MAP-FE-CON-001` live gap)

- `apps/partner-booking-web/components/partner-booking-form.tsx:513-535`
  Trip details remain plain text fields for pickup, dropoff, and time window;
  no shared picker or serviceability preview is mounted.
- `apps/partner-booking-web/components/partner-booking-form.tsx:672-699`
  Review and submit still stop at local readiness plus a success banner; the
  form does not yet render backend gate outcomes or persist a booking through
  the live transport seam.
- `apps/partner-booking-web/lib/partner-booking-form.ts:9-35`
  The draft model stores pickup and dropoff as strings only.
- `apps/partner-booking-web/lib/partner-booking-form.ts:219-277`
  Current validation checks text presence and window ordering, but not
  coordinates, provenance, or service-area outcome.
- `apps/partner-booking-web/lib/api-client.ts:572-589`
  `createPartnerBooking()` already exists and accepts
  `CreateTenantBookingCommand`; the parent task needs to wire the current form
  into this existing command seam with coordinate-bearing `AddressPayload`s.
- `apps/partner-booking-web/lib/translations.ts:44-70`
  Current copy still frames submit as local form validation
  (`Validate booking form` / `Form validation passed`), which matches the live
  implementation gap above.
- `apps/partner-booking-web/lib/translations.ts:285-287`
  Existing manual-review copy is already user-safe; parent work should preserve
  that tone instead of leaking internal policy jargon.

### Backend dependency status notes

- `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md:1-14`
  The current parent `planning_ref` is an addendum and explicitly complements
  the `20260630` baseline rather than replacing it.
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:151-160`
  Baseline dependency routing still places `MAP-FE-CON-001` on
  `MAP-UI-001`, `MAP-BE-004`, and `MAP-BE-005`.
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:312-364`
  `MAP-BE-004` is the backend booking-creation service-area gate:
  coordinate-bearing bookings must evaluate serviceability,
  `not_serviceable` and no-pickup cases hard-block, and
  `manual_review` or coordinate-missing legacy paths must not silently
  dispatch.
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:365-420`
  `MAP-BE-005` is the immutable spatial-audit snapshot layer: created orders
  should retain coordinate provenance, actor/surface, service-area decision,
  area/policy/version refs, and audit evidence.
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:516-554`
  `MAP-UI-001` is the accepted shared `AddressMapPicker` /
  `AddressMapPairPicker` baseline that parent work should compose with rather
  than replace.
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md:651-672`
  Parent goal, acceptance, and verification still match the current machine
  truth: coordinate-bearing concierge submit, consistent partner reason
  rendering, outage-safe degraded/manual-review behavior, and package checks.
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md:36-49`
  Baseline inventory also records `MAP-UI-001` as landed and `MAP-BE-004` /
  `MAP-BE-005` as the authoritative backend gate plus spatial-audit seams.

## What The Reviewer Should Confirm

- The packet now treats cited code/doc files as branch-local inspection
  anchors, not as repo-wide or reviewer-worktree validation claims.
- The earlier rejection is addressed by removing the stale
  validation framing; the remaining explicit path mismatch is the
  parent evidence set above.
- The packet points the parent owner to existing shared primitives and live
  create seams, not speculative new APIs.
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
- `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md`
- `docs/03-runbooks/map-geofence-production-execution-packet-20260630.md`
- `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260630.md`
- `packages/ui-web/src/address-map-picker-core.ts`
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
`AI_NAME=Codex scripts/ai-status.sh handoff MAP-FE-CON-001-SIDECAR-ACCEPTANCE Codex2 "Updated support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-SIDECAR-ACCEPTANCE.md to replace the stale validation wording with a machine-truth snapshot plus branch-local inspection-anchor model. Confirmed the packet remains sidecar-only and that the only unresolved paths are the parent machine-truth evidence artifacts still missing from this worktree. Verified formatting with git diff --check; package checks were not run because this slice changes support material only."`

Reviewer approval command:
`AI_NAME=Codex2 scripts/ai-status.sh approve MAP-FE-CON-001-SIDECAR-ACCEPTANCE "Reviewed: support packet stays sidecar-only, uses machine-truth plus branch-local inspection-anchor language, accurately maps concierge and partner gaps to shared picker and backend dependencies, and clearly distinguishes current references from missing parent evidence artifacts."`

## Local Verification For This Sidecar Slice

- Confirm only
  `support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-SIDECAR-ACCEPTANCE.md`
  changed for this task.
- Run
  `git diff --check -- support/sidecars/MAP-FE-CON-001/MAP-FE-CON-001-SIDECAR-ACCEPTANCE.md`.
- Spot-check the missing parent artifact paths above before the parent task
  claims review evidence exists.
- Package checks were not run here because this slice does not modify runtime
  code; the expected parent verification commands are recorded above.
