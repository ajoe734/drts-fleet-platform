# ENT-DISP-FE-20260612 Development Work Package

## Implemented In This Task

- Created `apps/enterprise-dispatch-web` as a standalone Next.js workspace app.
- Added a renderable `/` shell that uses the shared ops realm token surface.
- Documented product-boundary rules that forbid inheriting `tenant-portal-web`, `tenant-console-web`, or `partner-booking-web` as this app's baseline.

## Screen Requirements Note

- A dedicated `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html` canvas artifact is not present.
- Per the UI design contract, this task stops at a minimal shell and does not invent production screen layouts.
- Required next design inputs:
  - Enterprise Dispatch navigation model
  - Dispatcher dashboard / queue composition
  - Reassignment workflow states
  - Driver and supply-detail panel layouts

## Planning Decision Follow-Up

- `ENT-DISP-FE-20260612-F-UNBLOCK-PLANNING-DECISION` resolves the current blocker as a design-authority routing issue, not a new product or contract question.
- Remaining Enterprise Dispatch frontend tasks must treat the dedicated Enterprise Dispatch canvas set as the canonical UI baseline:
  - `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`
  - `docs/05-ui/drts-design-canvas/ent-kit.jsx`
  - `docs/05-ui/drts-design-canvas/ent-shell.jsx`
  - `docs/05-ui/drts-design-canvas/ent-screens-1.jsx`
  - `docs/05-ui/drts-design-canvas/ent-screens-2.jsx`
  - `docs/05-ui/drts-design-canvas/ent-states.jsx`
  - `docs/05-ui/drts-design-canvas/ent-data.jsx`
- Those artifacts already exist on the umbrella design branch `claude2/ent-disp-fe-20260612` but are not yet reachable from the current `dev` baseline used by this worktree.
- Until task `ENT-DISP-FE-20260612-B` lands that canvas and shell/primitives baseline into the shared branch history, downstream tasks must not extend the temporary ops-realm scaffold into production screens or create substitute information architecture from another app.
- Task `ENT-DISP-FE-20260612-F` is therefore blocked on the delivery of the dedicated Enterprise Dispatch shell/canvas baseline and the resulting route/data-adapter surfaces, not on any unresolved backend product semantics.
