# Partner Map Picker — Screen Requirements

**Date:** 2026-07-04
**Task:** `MAP-FE-CON-001`
**Surface:** `apps/partner-booking-web/components/partner-booking-form.tsx`
**Status:** app-specific screen-requirements artifact only; not a final canvas response
**Author lane:** Codex2
**Visual authority:** `docs/05-ui/drts-design-canvas/Partner Booking Web.html` · `docs/05-ui/drts-design-canvas/pb-screens.jsx` · `docs/05-ui/partner-booking-program-forms-handoff-20260618.md` · `docs/05-ui/drts-design-canvas/address-map-picker-screen-requirements-20260630.md` · `packages/ui-tokens`
**Behaviour / data authority:** `docs/03-runbooks/map-geofence-fleets-execution-tasks-20260701.md` · `packages/contracts/src/index.ts`

> This note is the partner-lane response required by
> `address-map-picker-screen-requirements-20260630.md`.
> `MAP-FE-CON-001` may claim functional implementation plus screen-requirements
> coverage for partner booking, but not final visual parity, until the partner
> booking canvas is refreshed to show the integrated picker composition.

## 1. Canvas gap confirmed

- `docs/05-ui/drts-design-canvas/Partner Booking Web.html` and
  `docs/05-ui/drts-design-canvas/pb-screens.jsx` define the funnel shell and
  program-specific booking cards, but the book screens still show plain place
  rows for `pickup` / `dropoff`.
- The existing hand-off packet
  `docs/05-ui/partner-booking-program-forms-handoff-20260618.md` specifies the
  required fields, yet does not contain a map-picker composition for the book
  card body.

Implication:

- The partner app may ship the shared picker behavior inside the booking form.
- This task closes against a screen-requirements artifact, not against a claim
  that the refreshed partner booking visuals are fully represented in canvas.

## 2. Partner booking integration

The partner booking surface must stay inside the existing funnel composition:

- Keep the page header, program pills, eligibility banner, and program-specific
  field cards already defined by the partner shell.
- Replace the booking form's primary route-entry block with one
  `AddressMapPairPicker` inside the same booking card region.
- Keep pickup / dropoff labels, helper copy, and submit CTA in the book screen;
  do not push map capture into a separate step.
- Preserve partner-program branding through realm tokens and the existing brand
  theme; do not add custom map chrome or a separate visual system.

## 3. Required state coverage

`MAP-FE-CON-001` must keep these partner states visible:

- empty/manual start;
- selected serviceable pickup + dropoff;
- manual-review routing when a stop is not dispatchable;
- provider outage / degraded fallback with explicit text-only continuation;
- service-area blocked state that does not look submit-ready.

Each state must preserve the next operator action. A degraded or blocked route
may not visually resemble a clean dispatch-ready booking.

## 4. Partner-specific submit gating rules

- When both stops are dispatch-ready, the form may validate as ready.
- When map-provider outage leaves only text addresses, the UI may continue only
  through the explicit `dispatch_manual_review_required` path and must surface
  partner-safe wording rather than internal policy terms.
- Provider outage must not create a silent normal order state.
- Assisted-entry/manual-review reasoning must remain consistent with the shared
  gate and backend error contract.

## 5. Evidence mapping

- Functional implementation:
  `apps/partner-booking-web/components/partner-booking-form.tsx`
- Partner submit-gate helper:
  `apps/partner-booking-web/lib/partner-booking-form.ts`
- Partner map booking e2e coverage:
  `tests/e2e/partner-map-booking-ui.spec.ts`

## 6. Closeout boundary

This artifact satisfies the downstream adoption rule from
`address-map-picker-screen-requirements-20260630.md` for the partner surface
inside `MAP-FE-CON-001` closeout on 2026-07-04.

Future visual-signoff work still needs updated `Partner Booking Web` artboards
showing the integrated picker inside the booking-form cards for the in-scope
program variants.
