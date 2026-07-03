# Tenant Map Picker — Screen Requirements

**Date:** 2026-07-03
**Task:** `MAP-FE-TEN-001`
**Surfaces:** `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx` · `apps/tenant-portal-web/app/addresses/page.tsx`
**Status:** app-specific screen-requirements artifact only; not a final canvas response
**Author lane:** Codex
**Visual authority:** `docs/05-ui/drts-design-canvas/Tenant Console.html` · `docs/05-ui/drts-design-canvas/tenant-screens-1.jsx` · `docs/05-ui/drts-design-canvas/tenant-screens.jsx` · `docs/05-ui/drts-design-canvas/address-map-picker-screen-requirements-20260630.md` · `packages/ui-tokens`
**Behaviour / data authority:** `docs/02-architecture/map-geofence-gap-inventory-and-remediation-plan-20260701.md` · `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md` · `packages/contracts/src/index.ts`

> This note is the tenant-lane response required by
> `address-map-picker-screen-requirements-20260630.md`.
> `MAP-FE-TEN-001` may claim functional implementation plus screen-requirements
> coverage, but not final visual parity, until tenant-specific artboards are
> updated.

## 1. Canvas gap confirmed

- `docs/05-ui/drts-design-canvas/Tenant Console.html` still points booking
  create (`newbooking`) and addresses (`addresses`) to artboards that show text
  entry fields rather than an integrated map picker.
- `docs/05-ui/drts-design-canvas/tenant-screens-1.jsx` and
  `docs/05-ui/drts-design-canvas/tenant-screens.jsx` still render `pickup` /
  `drop` text inputs in the booking-create lane.
- There is no `Tenant Portal.html` or tenant-portal-specific artboard in
  `docs/05-ui/drts-design-canvas/` for the address-book form.

Implication:

- The current branch may ship the shared picker behavior on tenant surfaces.
- This task can only close against a screen-requirements artifact, not against
  a claim that the final tenant visuals are fully signed off by canvas art.

## 2. Tenant Console booking-create integration

The booking create surface must stay inside the existing tenant canvas layout:

- Keep the page header, two-column split, left-side journey card, and right-side
  approval / policy card from the existing Tenant Console artboard.
- Keep saved-address shortcut selects above the picker. They remain surface-level
  shortcuts, not a replacement for the picker itself.
- Replace the primary pickup / drop text-entry flow with one shared
  `AddressMapPairPicker` block in the journey card. The picker owns search,
  pin confirmation, manual-coordinate fallback, and service-area summary.
- Keep pickup / drop validation messages directly under the picker block, not in
  a separate sidebar or modal.
- Show the `not_serviceable` state as an inline blocking banner in the same card
  as the picker. Submit remains disabled / blocked while that state is active.
- Do not invent branded map chrome. The preview stays the neutral utility plane
  defined by the shared primitive note.

## 3. Tenant Portal address-book integration

No tenant-portal-specific artboard exists, so this surface is constrained to a
utility-form integration only:

- Keep the existing address form row order for `New Address` and `Edit Address`.
- Replace hand-entered lat / lng as the primary flow with a single `Location
  (map)` form row that hosts the shared `AddressMapPicker`.
- Edit mode must seed the saved coordinate into the picker so the operator can
  confirm or move the pin without retyping coordinates.
- If the address is not dispatch-ready, show the warning banner directly beneath
  the picker field. The operator must see either a confirmed coordinate or an
  explicit warning before save.
- Hidden coordinate inputs are implementation plumbing only. The visible primary
  flow must not reintroduce free-typed lat / lng fields.

This note does not invent a new Tenant Portal visual shell. A future tenant
portal canvas response is still required for final artboard parity.

## 4. Required state coverage

`MAP-FE-TEN-001` must keep these tenant-surface states visible:

- Tenant Console booking: empty/manual start, saved-address seeded pin, selected
  pin, manual fallback with reason, provider unavailable, manual review,
  serviceable, and `not_serviceable` blocked.
- Tenant Portal address book: empty picker, selected pin, saved-pin confirmation
  on edit, manual fallback with reason, provider unavailable, and no-coordinate
  warning before save.

Each state must preserve an operator-readable next action. No degraded or
blocked state may visually resemble a normal dispatch-ready state.

## 5. Evidence mapping

- Functional implementation:
  `apps/tenant-console-web/app/bookings/new/tenant-booking-create-form.tsx`
  and `apps/tenant-portal-web/app/addresses/page.tsx`
- Review / verification narrative:
  `support/sidecars/MAP-FE-TEN-001/MAP-FE-TEN-001-REVIEW-EVIDENCE-20260701.md`
- Tenant booking picker e2e coverage:
  `tests/e2e/tenant-map-booking-ui.spec.ts`
- Prior QA artifacts:
  `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-tenant-ui-20260701T1028Z.json`
  and
  `support/sidecars/MAP-QA-002/artifacts/playwright-map-geofence-tenant-ui-20260701T1050Z.json`

## 6. Closeout boundary

This artifact satisfies the downstream adoption rule from
`address-map-picker-screen-requirements-20260630.md` for
`MAP-FE-TEN-001` closeout on 2026-07-03.

Future visual-signoff work still needs:

- an updated Tenant Console booking-create artboard with the integrated pair
  picker; and
- a tenant-portal-specific artboard or explicit design response for the address
  book surface.
