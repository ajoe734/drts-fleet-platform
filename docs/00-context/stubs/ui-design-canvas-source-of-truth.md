# UI Design Canvas — source of truth

Status: directive-required thin stub
Canonical artifact: `docs/05-ui/drts-design-canvas/`

This file does not redefine product semantics. It points reviewers to the current source of truth.

## Do not restate

Do not copy or reinterpret the canonical artifact here. The shared cross-surface design canvas — token scale, layout primitives, component stencils, partner-booking screens, partner brand variants — is owned by the JSX/HTML files under `docs/05-ui/drts-design-canvas/`. Driver-specific canvas lives separately under `docs/05-ui/driver-app-design-20260507/` (see `driver-app-design-canvas-source-of-truth.md`). Runtime app surfaces (`apps/*-web/`, `apps/driver-app/`) consume these tokens via `@drts/ui-tokens`; canvas changes propagate via that token package and the per-surface page closeouts, not via duplicate stub content here.

## Current source of truth

- `docs/05-ui/drts-design-canvas/design-canvas.jsx`
- `docs/05-ui/drts-design-canvas/partner-screens.jsx`
- `docs/05-ui/drts-design-canvas/Partner Booking.html`
- `packages/ui-tokens/` (token consumption surface)
