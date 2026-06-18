# Enterprise Dispatch Web

Standalone Next.js app for the enterprise dispatch employee self-service surface.

## Product Boundary

- This app is a dedicated enterprise dispatch employee / delegate self-service surface.
- Do not reuse or extend `tenant-portal-web`, `tenant-console-web`, or `partner-booking-web` as the product baseline for this app.
- Shared packages such as `@drts/ui-web` and `@drts/ui-tokens` are allowed. Product flows, route structure, copy, and information architecture must remain dispatch-specific.

## Implemented Scope

- S1 website routes for home, booking create/review/submitted, booking history/detail, trip, receipt, and help.
- Gate-state routes for auth, suspension, approval, quota, no-supply, and degraded postures.
- S2 embed identity routes for handoff, re-auth, unsupported host, consent, and fallback.
- Canonical design references landed under `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html` and `ent-*.jsx`.

## Local Commands

- `pnpm --filter @drts/enterprise-dispatch-web dev` on port `3010`
- `pnpm --filter @drts/enterprise-dispatch-web typecheck`
- `pnpm --filter @drts/enterprise-dispatch-web lint`
- `pnpm --filter @drts/enterprise-dispatch-web test`
- `pnpm --filter @drts/enterprise-dispatch-web test:e2e`
- `pnpm --filter @drts/enterprise-dispatch-web build`

## Validation Boundary

- Website and app-embedded flows are validated by `tests/e2e/enterprise-dispatch-flow.spec.ts`.
- Lovable prototypes are historical references only; this workspace app is the canonical implementation for enterprise dispatch self-service.
