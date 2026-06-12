# ENT-DISP-FE-20260612-A Sidecar Acceptance Packet

**Parent task:** `ENT-DISP-FE-20260612-A`
**Sidecar task:** `ENT-DISP-FE-20260612-A-SIDECAR-ACCEPTANCE`
**Prepared by:** Codex
**Date:** 2026-06-12
**Scope:** support artifact only; no canonical truth changes.

## Parent Summary

`ENT-DISP-FE-20260612-A` creates the dedicated Enterprise Dispatch frontend app scaffold:

- app path: `apps/enterprise-dispatch-web`
- package: `@drts/enterprise-dispatch-web`
- dev/start port: `3010`
- product boundary: enterprise employee self-service booking, S1 web + S2 embedded app

The parent is intentionally only the scaffold slice. Full design kit, routes, fixture data, API wiring, tests, and rollout evidence belong to later slices B-F.

## Acceptance Checklist

| Acceptance item | Evidence | Status |
|---|---|---|
| Add `@drts/enterprise-dispatch-web` package | `apps/enterprise-dispatch-web/package.json` | PASS |
| Use dev/start port `3010` | `apps/enterprise-dispatch-web/package.json` | PASS |
| Render a basic `/` shell | `apps/enterprise-dispatch-web/app/page.tsx` | PASS |
| Add layout and global CSS | `apps/enterprise-dispatch-web/app/layout.tsx`, `apps/enterprise-dispatch-web/app/globals.css` | PASS |
| Add Next/TS/ESLint config | `next.config.ts`, `tsconfig.json`, `eslint.config.mjs` | PASS |
| Add public placeholder | `apps/enterprise-dispatch-web/public/.gitkeep` | PASS |
| Add README with product boundary | `apps/enterprise-dispatch-web/README.md` | PASS |
| Root dev script exists | root `package.json` `dev:enterprise-dispatch` | PASS |
| Avoid `3008` / `3009` in new app | `rg -- "3008|3009" apps/enterprise-dispatch-web package.json` | PASS |

## Verification Commands

Commands re-run locally from `drts-fleet-platform`:

```sh
pnpm --filter @drts/enterprise-dispatch-web typecheck
pnpm --filter @drts/enterprise-dispatch-web lint
pnpm --filter @drts/enterprise-dispatch-web test
```

Results:

- typecheck: PASS
- lint: PASS
- test: PASS, no test files found as expected for scaffold-only slice

## Dependency Map

Parent dependencies:

- none

Downstream dependencies:

- `ENT-DISP-FE-20260612-B` should wait for A review approval before building shell/primitives.
- `ENT-DISP-FE-20260612-C`, `D`, and `E` should wait for B.
- `ENT-DISP-FE-20260612-F` may continue API gap mapping now, but API wiring/tests/rollout should wait for route implementation.

## Product Boundary Checks

The scaffold README explicitly states this app is not:

- credit-card airport transfer
- `apps/partner-booking-web`
- sunset `apps/tenant-portal-web`
- `apps/tenant-console-web` admin

The dedicated freeze decision for Lovable confusion is now recorded:

- `docs/01-decisions/SD-DP-20260612-007-enterprise-dispatch-frontend-and-lovable-freeze.md`

External `tenant-commute-hub/README.md` also has a freeze banner. Future workers should not route new Enterprise Dispatch frontend work to Lovable.

## Reviewer Notes

The `/` page is a scaffold placeholder, not final visual implementation. It uses the Enterprise Dispatch blue accent to preserve the design direction, but B must replace this with production primitives from:

- `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`
- `docs/05-ui/drts-design-canvas/ent-kit.jsx`
- `docs/05-ui/drts-design-canvas/ent-shell.jsx`

Do not require A to implement route completeness or API wiring; that would pull B-F scope into the scaffold slice.

## Residual Risks

- No app-level tests yet beyond pass-with-no-tests scaffold baseline.
- No route structure beyond `/`.
- No API adapter yet.
- No production Docker/deploy config yet; add in rollout slice if deployment target is accepted.
