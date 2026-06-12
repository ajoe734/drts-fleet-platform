# Enterprise Dispatch Booking Screens — Requirements Note

**Date:** 2026-06-12
**Feature:** 企業派車前台重做 umbrella
**Status:** Design-gap note. **No visual decisions in this document.**
**Authority for visual design:** `packages/ui-tokens` + the dedicated Enterprise Dispatch canvas set
when those artifacts are landed into the shared branch history.

## 1. Why this note exists

This umbrella requires two Enterprise Dispatch surfaces:

1. an internal enterprise website surface
2. an enterprise App embedded surface

The dedicated Enterprise Dispatch canvas set is the intended canonical source for both surfaces,
but those files are not landed in the current shared branch history used by this worktree.

Under the UI design contract for `ENT-DISP-FE-20260612`, that means implementation must **not**
invent website or embedded layouts, chrome, route structure, or screen sequences beyond the
already-accepted minimal scaffold.

## 2. Current canonical coverage

### Intended canonical canvas set

- `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`
- `docs/05-ui/drts-design-canvas/ent-kit.jsx`
- `docs/05-ui/drts-design-canvas/ent-shell.jsx`
- `docs/05-ui/drts-design-canvas/ent-screens-1.jsx`
- `docs/05-ui/drts-design-canvas/ent-screens-2.jsx`
- `docs/05-ui/drts-design-canvas/ent-states.jsx`
- `docs/05-ui/drts-design-canvas/ent-data.jsx`

### Current landed state in this worktree

- `apps/enterprise-dispatch-web` exists as a standalone scaffold.
- The dedicated Enterprise Dispatch canvas files above are not present on this branch baseline.
- No landed canvas in `docs/05-ui/drts-design-canvas/` should be treated as a substitute visual
  source for Enterprise Dispatch production screens.

## 3. Implementation consequence

- `apps/enterprise-dispatch-web` may keep only the already-accepted minimal shell/scaffold state
  until the dedicated Enterprise Dispatch canvas set lands.
- No repo UI should claim production implementation of the Enterprise Dispatch website or embedded
  surface until those dedicated design artifacts are reachable from the shared branch history.
- The embedded lane remains blocked pending the dedicated design handoff/canvas artifacts.

## 4. Required future design inputs

The missing landed design baseline should define, at minimum:

- website navigation model and dispatcher queue composition
- host app chrome responsibilities vs embedded web chrome
- identity handoff and session state
- allowed navigation depth inside the embed
- blocked / expired / unsupported host states
- booking completion and return-to-host behavior

## 5. Boundary reminder

- Do not reuse `partner-booking-web` bank embed screens for enterprise dispatch.
- Do not reuse `tenant-console-web` booking screens as the Enterprise Dispatch visual baseline.
- Do not reuse credit-card airport-transfer fields or issuer identity states in enterprise dispatch.
