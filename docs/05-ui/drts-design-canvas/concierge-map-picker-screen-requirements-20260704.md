# Concierge Map Picker — Screen Requirements

**Date:** 2026-07-04
**Task:** `MAP-FE-CON-001`
**Surface:** `apps/concierge-portal-web/app/bookings/new/page.tsx`
**Status:** app-specific screen-requirements artifact only; not a final canvas response
**Author lane:** Codex2
**Visual authority:** `docs/05-ui/drts-design-canvas/Ops Console.html` · `docs/05-ui/drts-design-canvas/ops-screens-1.jsx` · `docs/05-ui/drts-design-canvas/address-map-picker-screen-requirements-20260630.md` · `packages/ui-tokens`
**Behaviour / data authority:** `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md` · `packages/contracts/src/index.ts`

> This note is the concierge-lane response required by
> `address-map-picker-screen-requirements-20260630.md`.
> `MAP-FE-CON-001` may claim functional implementation plus screen-requirements
> coverage for concierge booking, but not final visual parity, until the
> concierge lane gets its own updated canvas response.

## 1. Canvas gap confirmed

- `docs/05-ui/drts-design-canvas/Ops Console.html` and
  `docs/05-ui/drts-design-canvas/ops-screens-1.jsx` still represent the
  call-center phone-booking intake with plain `pickup` / `drop` text fields.
- There is no dedicated `Concierge Portal.html` or concierge-specific booking
  artboard under `docs/05-ui/drts-design-canvas/`.

Implication:

- The concierge app may ship the shared picker behavior on the booking-create
  surface.
- This task can only close against a screen-requirements artifact, not against
  a claim that the final concierge visuals are fully signed off by canvas art.

## 2. Concierge booking integration

The booking-create surface must stay inside the existing concierge form shell:

- Keep the hero, desk posture card, guardrail card, and booking form structure
  already used by `apps/concierge-portal-web`.
- Replace the primary pickup / drop free-text route row with one
  `AddressMapPairPicker` block inside the booking form.
- Keep the picker in the same grid position as the existing route field group;
  do not move route capture into a modal, drawer, or side panel.
- Preserve concise helper copy directly beneath the picker for route capture,
  manual-review, and coordinate-required states.
- Serviceability and manual-review signals must read as operator guidance, not
  as internal policy jargon.

## 3. Required state coverage

`MAP-FE-CON-001` must keep these concierge states visible on the booking form:

- empty/manual start;
- selected dispatch-ready pickup + dropoff;
- service-area blocked / ineligible;
- provider unavailable with explicit no-silent-dispatch behavior;
- dispatch-manual-review-required fallback;
- backend gate error rendered back into the page when dispatch is refused.

Each state must preserve the next operator action. Provider outage or missing
coordinates must never appear equivalent to a normal dispatch-ready booking.

## 4. Submission and degraded-path constraints

- When both stops are dispatch-ready, submit the selected coordinates to the
  concierge booking seam.
- When the shared gate returns `dispatch_manual_review_required` because the
  provider is unavailable or degraded, the UI may continue only through the
  explicit manual-review fallback path and must include `mapFallbackReview`.
- If the backend returns a map/serviceability denial, render a user-facing
  booking error or guardrail route; do not silently treat the order as normal.

## 5. Evidence mapping

- Functional implementation:
  `apps/concierge-portal-web/app/bookings/new/page.tsx`
- Concierge map booking e2e coverage:
  `tests/e2e/concierge-map-booking-ui.spec.ts`
- Shared gate formatting helpers:
  `apps/concierge-portal-web/lib/map-booking.ts`

## 6. Closeout boundary

This artifact satisfies the downstream adoption rule from
`address-map-picker-screen-requirements-20260630.md` for the concierge surface
inside `MAP-FE-CON-001` closeout on 2026-07-04.

Future visual-signoff work still needs a concierge-specific booking artboard or
an explicit design response that shows the integrated pair picker inside the
concierge shell.
