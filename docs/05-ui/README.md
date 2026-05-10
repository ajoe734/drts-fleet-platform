# DRTS UI — Design Source of Truth + Redesign Backlog

This directory holds the design artifacts that the UI redesign sweep
(`Wave 0` onward) is built against. It is the **source of truth** for what
all DRTS surfaces should look like.

## Index

### Design source of truth (immutable)

- [`drts-design-canvas/`](drts-design-canvas/) — extracted contents of
  `drts.zip` as first-class repo files. Open any `*.html` in a browser to
  navigate the interactive design canvas (pan / zoom / focus mode).
  Surface entry points:
  - [`drts-design-canvas/DRTS Index.html`](drts-design-canvas/DRTS%20Index.html) — top-level cover
  - [`drts-design-canvas/Platform Admin.html`](drts-design-canvas/Platform%20Admin.html)
  - [`drts-design-canvas/Ops Console.html`](drts-design-canvas/Ops%20Console.html)
  - [`drts-design-canvas/Tenant Console.html`](drts-design-canvas/Tenant%20Console.html)
  - [`drts-design-canvas/Partner Booking.html`](drts-design-canvas/Partner%20Booking.html)
  - [`drts-design-canvas/DRTS Driver App.html`](drts-design-canvas/DRTS%20Driver%20App.html)
- [`drts.zip`](drts.zip) — original archive (kept for provenance; do not
  edit; the extracted directory is the working copy)
- [`driver app.zip`](driver%20app.zip) — earlier driver-only archive
  (historical)
- [`driver-app-design-20260507/`](driver-app-design-20260507/) — partial
  earlier extract (historical; superseded by `drts-design-canvas/`)

### Analysis + planning

- [`drts-zip-vs-current-ui-diff-report-20260510.md`](drts-zip-vs-current-ui-diff-report-20260510.md)
  — surface-by-surface gap analysis comparing the design canvas against
  current repo implementation. Shipped before this redesign sweep started.
- [`drts-management-ui-review-execution-tasks-20260508.md`](drts-management-ui-review-execution-tasks-20260508.md)
  — earlier review pass, scoped to management consoles only. Partly
  superseded by the work breakdown below.
- [`drts-ui-redesign-workbreakdown-20260510.md`](drts-ui-redesign-workbreakdown-20260510.md)
  — **canonical work breakdown** for the redesign sweep. Lists ~56 tasks
  across Waves 0–5 with IDs, dependencies, artifacts, and acceptance.
  Supervisor seeds `ai-status.json` from this document.

## Working rules

- The extracted `drts-design-canvas/` is **frozen**. Do not edit. If the
  design changes, replace the source `drts.zip` and re-extract; record the
  change in a new diff report rather than editing the canvas in place.
- All UI redesign tasks (`OPS-UI-RD-*`, `ADM-UI-RD-*`, `TEN-UI-RD-*`,
  `DRV-UI-RD-*`, `PBK-UI-*`) reference specific functions inside
  `drts-design-canvas/*.jsx` as their visual target. Storybook stories
  embed the corresponding HTML page via `<iframe>` for side-by-side review.
- Backend behavior is **not** changed to fit the visuals. If a redesign
  task discovers a missing contract, the supervisor returns to
  `discussion_planning` per `SUPERVISOR_OPERATING_MODEL.md`.

## Pointers

- Sprint / execution truth: [`../../ai-status.json`](../../ai-status.json),
  [`../../current-work.md`](../../current-work.md)
- Supervisor mode: [`../../SUPERVISOR_OPERATING_MODEL.md`](../../SUPERVISOR_OPERATING_MODEL.md)
- Shared web UI package: [`../../packages/ui-web/`](../../packages/ui-web/)
- (Wave 1, planned) Shared cross-stack tokens: `packages/ui-tokens/`
