# ENT-DISP-FE-20260612 Development Work Package

## Implemented In This Task

- Created `apps/enterprise-dispatch-web` as a standalone Next.js workspace app.
- Added a renderable `/` shell that uses the shared ops realm token surface.
- Documented product-boundary rules that forbid inheriting `tenant-portal-web`, `tenant-console-web`, or `partner-booking-web` as this app's baseline.
- Added app-local `/api/tenant/*` fixture wiring, gap map, and vitest coverage for booking, gate, and embed fallback behavior.
- Recorded rollout evidence in `tenant-api-gap-map.md` and `rollout-evidence.md`.

## Screen Requirements Note

- A dedicated `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html` canvas artifact is not present.
- Per the UI design contract, this task stops at a minimal shell and does not invent production screen layouts.
- Required next design inputs:
  - Enterprise Dispatch navigation model
  - Dispatcher dashboard / queue composition
  - Reassignment workflow states
  - Driver and supply-detail panel layouts
