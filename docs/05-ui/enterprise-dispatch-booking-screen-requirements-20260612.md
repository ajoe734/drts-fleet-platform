# Enterprise Dispatch Booking Screens — Requirements Note

**Date:** 2026-06-12
**Feature:** 企業派車前台重做 umbrella
**Status:** Design-gap note. **No visual decisions in this document.**
**Authority for visual design:** `packages/ui-tokens` tenant realm + `docs/05-ui/drts-design-canvas/Tenant Console.html` / `tenant-screens*.jsx`

## 1. Why this note exists

This umbrella requires two enterprise-dispatch surfaces:

1. an internal enterprise website surface
2. an enterprise App embedded surface

The internal website already has a canonical visual source: the tenant-console booking flow in
`docs/05-ui/drts-design-canvas/Tenant Console.html` and `tenant-screens-1.jsx` (`/bookings/new`).

The enterprise App embedded surface does **not** currently have a dedicated canonical canvas in
`docs/05-ui/drts-design-canvas/`. Under the UI design contract for `ENT-DISP-FE-20260612`, that
means implementation must **not invent** an embedded layout, chrome, or screen sequence.

## 2. Current canonical coverage

### Covered by existing canvas

- Enterprise internal website booking create flow
  - Source: `docs/05-ui/drts-design-canvas/Tenant Console.html`
  - Source: `docs/05-ui/drts-design-canvas/tenant-screens-1.jsx`
  - Relevant artboard: `/bookings/new`

### Missing canonical canvas

- Enterprise App embedded booking entry
- Enterprise App embedded booking create flow
- Enterprise App embedded success / handoff / blocked states

## 3. Implementation consequence

- `apps/tenant-console-web` may align the internal enterprise website flow to the tenant-console
  canvas.
- No repo UI should claim to implement the enterprise App embedded surface until a dedicated design
  canvas exists.
- The enterprise embedded lane needs a follow-up design handoff packet or canvas artifact before UI
  implementation resumes.

## 4. Required future design inputs

The missing embedded design should define, at minimum:

- host app chrome responsibilities vs embedded web chrome
- identity handoff and session state
- allowed navigation depth inside the embed
- blocked / expired / unsupported host states
- booking completion and return-to-host behavior

## 5. Boundary reminder

- Do not reuse `partner-booking-web` bank embed screens for enterprise dispatch.
- Do not reuse credit-card airport-transfer fields or issuer identity states in enterprise dispatch.
