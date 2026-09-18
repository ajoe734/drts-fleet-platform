# Fleet Partner Portal — Missing Scope & Error State Screen Requirements

**Date:** 2026-08-08
**Task:** `S1F-FLT-001`
**Surface:** `apps/fleet-partner-portal-web/app/error.tsx`
**Status:** app-specific screen-requirements artifact only; missing-scope / error state not yet in canvas
**Author lane:** Gemini2
**Visual authority:** `docs/05-ui/drts-design-canvas/Fleet Partner Portal.html` · `docs/05-ui/drts-design-canvas/fleet-screens.jsx` · `@drts/ui-tokens` · `@drts/ui-web`

## 1. Canvas gap confirmed

- `docs/05-ui/drts-design-canvas/Fleet Partner Portal.html` and `docs/05-ui/drts-design-canvas/fleet-screens.jsx` define 10 core workspace/supply/revenue/quality routes for the Fleet Partner Portal shell and cards.
- However, an explicit error boundary screen for unhandled page errors or missing fleet scope configuration (`x-fleet-partner-id` missing / invalid) is absent from `fleet-screens.jsx`.

Implication:

- The Fleet Partner Portal app requires a fallback Next.js `error.tsx` boundary to catch runtime exceptions and missing fleet scope configuration errors gracefully.
- This task provides a `@drts/ui-web` canvas-primitives and `@drts/ui-tokens` theme-backed UI for `error.tsx`, coupled with this screen-requirements artifact until the canvas is updated.

## 2. Error surface requirements & tokens compliance

- The error screen must NOT introduce custom hex colors, font-family strings, or ad-hoc Tailwind classes.
- It must derive its colors, typography, density, and layout strictly from `buildFleetTheme()` (`@drts/ui-web`), using `surface: "partner"`, dark mode, and compact density.
- Structure must use canonical canvas primitives: `CanvasCard`, `CanvasPill`, `CanvasBtn`, and `CanvasShell` token variables.
- States to handle:
  1. **Missing Fleet Scope (`isScopeError`)**: Rendered when `x-fleet-partner-id` header or fleet identity config is missing. Displays `danger` tone badge, warning title, and actionable message.
  2. **Generic Page Error**: Rendered for unhandled page errors with `warn` tone badge and retry action.
