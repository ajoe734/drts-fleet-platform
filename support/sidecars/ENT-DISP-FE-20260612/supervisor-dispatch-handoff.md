# Supervisor Dispatch Handoff: ENT-DISP-FE-20260612

**Created:** 2026-06-12
**Prepared by:** Codex
**Mode:** `supervisor_managed_execution`
**Runtime:** repo supervisor heartbeat confirmed active at 2026-06-12T14:54:26Z

## What was handed to supervisor

The Enterprise Dispatch frontend rebuild is now represented in machine truth as:

- `ENT-DISP-FE-20260612` — umbrella
- `ENT-DISP-FE-20260612-A` — app scaffold and architecture
- `ENT-DISP-FE-20260612-B` — design system and shell
- `ENT-DISP-FE-20260612-C` — website booking flow
- `ENT-DISP-FE-20260612-D` — website query/status/outcome pages
- `ENT-DISP-FE-20260612-E` — gate and embed identity states
- `ENT-DISP-FE-20260612-F` — API contract wiring, tests, rollout

Canonical work package:

- `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`

Topology and freeze decision:

- `docs/01-decisions/SD-DP-20260612-007-enterprise-dispatch-frontend-and-lovable-freeze.md`
- External `tenant-commute-hub` / Lovable project is frozen as historical reference only.

Canonical design and functional references:

- `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`
- `docs/05-ui/drts-design-canvas/ent-kit.jsx`
- `docs/05-ui/drts-design-canvas/ent-shell.jsx`
- `docs/05-ui/drts-design-canvas/ent-data.jsx`
- `docs/05-ui/drts-design-canvas/ent-screens-1.jsx`
- `docs/05-ui/drts-design-canvas/ent-screens-2.jsx`
- `docs/05-ui/drts-design-canvas/ent-states.jsx`
- `docs/05-ui/enterprise-dispatch-booking-screen-requirements-20260612.md`

## Current dispatch state

`ENT-DISP-FE-20260612-A` has been moved to `in_progress` with owner `Claude2` and reviewer `Claude`.

The other slices remain backlog until A creates the app target. After A lands, recommended dispatch is:

1. Dispatch B: shell/primitives.
2. Dispatch C and D in parallel only after B defines reusable primitives.
3. Dispatch E after B; it can run beside C/D because gate/embed routes should be isolated.
4. Start F's API gap mapping early, but finish F only after UI routes exist.

## Product-boundary instruction

Every worker must preserve this boundary:

- `enterprise_dispatch` = enterprise employee/delegate self-service booking.
- `credit_card_airport_transfer` = cardholder benefit flow under partner/card surfaces.

The Enterprise Dispatch design may show airport pickup fields, but those are conditional enterprise-dispatch context. They do not make this app a cardholder airport-transfer app.

## Design-token instruction

Generic task briefs may include older tenant-console examples that mention tenant teal. Those examples are not authoritative here.

For this app, visual authority is:

- `Enterprise Dispatch.html`
- `ent-kit.jsx`
- default accent `#2457D6`

The app is tenant-branded employee self-service, not tenant-console admin.

## Active worker handoff

A multi-agent worker was launched for `ENT-DISP-FE-20260612-A` with this write scope:

- allowed: `apps/enterprise-dispatch-web/**`
- allowed if needed: root `package.json`
- avoid: `apps/partner-booking-web/**`
- avoid: `apps/tenant-console-web/**`
- avoid: `apps/tenant-portal-web/**`
- avoid: design/spec docs after handoff

Required verification for A:

- `pnpm --filter @drts/enterprise-dispatch-web typecheck`
- `pnpm --filter @drts/enterprise-dispatch-web lint` if baseline supports it
- dev port must be `3010`; do not use `3008` (`bank-console-web`) or `3009` (currently referenced by tenant-console bank fallback links)

## Supervisor next actions

- Watch `ENT-DISP-FE-20260612-A` for owner handoff.
- Review scaffold before opening B.
- If A cannot create a clean new app because of repo constraints, route back to planning instead of placing the feature into `tenant-portal-web`, `tenant-console-web`, or `partner-booking-web`.
- If any worker proposes to continue implementation in Lovable / `tenant-commute-hub`, reject that route and redirect to `apps/enterprise-dispatch-web`.
