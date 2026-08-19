# SD-DP-20260612-007 — Enterprise Dispatch Frontend App And Lovable Freeze

**Date:** 2026-06-12
**Status:** Accepted
**Applies to:** `enterprise_dispatch`, `apps/enterprise-dispatch-web`, external `tenant-commute-hub`
**Supersedes for new enterprise frontend work:** Lovable-driven `tenant-commute-hub` continuation

## Decision

Create a dedicated repo-local frontend app for the Enterprise Dispatch employee booking surface:

- `apps/enterprise-dispatch-web`
- package: `@drts/enterprise-dispatch-web`
- local dev port: `3010`

Freeze the external Lovable-managed `tenant-commute-hub` project as a historical behaviour/reference surface only. It must not be used as the active implementation source for:

- Enterprise Dispatch employee booking frontend
- enterprise internal website booking
- enterprise internal app embedded booking
- tenant admin / management console productization
- credit-card airport transfer or partner booking replacement work

## Rationale

The Lovable-managed `tenant-commute-hub` has useful behaviour history, but its shell mixes employee booking, tenant admin/governance, and partner-like routes. Continuing that surface would keep confusing the product boundaries between:

- `enterprise_dispatch`
- tenant admin console
- `credit_card_airport_transfer`
- partner/cardholder booking

The Enterprise Dispatch design response now defines a distinct frontstage product: tenant-branded employee self-service with S1 internal web and S2 app-embedded hand-off states. It should be rebuilt in the canonical repo and wired to `/api/tenant/*`, not evolved through Lovable.

## Canonical Targets

| Product surface                       | Canonical target                      |
| ------------------------------------- | ------------------------------------- |
| Enterprise Dispatch employee frontend | `apps/enterprise-dispatch-web`        |
| Tenant admin / governance console     | `apps/tenant-console-web`             |
| Partner / cardholder booking          | `apps/partner-booking-web`            |
| Bank issuer console                   | `apps/bank-console-web`               |
| Historical Lovable reference          | external `tenant-commute-hub`, frozen |

## Allowed Use Of Lovable / `tenant-commute-hub`

Allowed:

- inspect old route behaviour
- inspect field names and fixtures
- compare edge cases
- confirm historical cutover assumptions

Forbidden:

- prompt Lovable to continue implementing the management system
- build new Enterprise Dispatch frontend pages in `tenant-commute-hub`
- use `tenant-commute-hub` as the source of truth for active UI IA
- copy its mixed admin/booking shell into the new app
- treat airport-related fixtures in it as `credit_card_airport_transfer`

## Implementation Notes

The external `tenant-commute-hub/README.md` has been updated with a freeze banner on 2026-06-12.

The development work package for this decision is:

- `support/sidecars/ENT-DISP-FE-20260612/development-work-package.md`
- `support/sidecars/ENT-DISP-FE-20260612/supervisor-dispatch-handoff.md`

The visual source is:

- `docs/05-ui/drts-design-canvas/Enterprise Dispatch.html`
- `docs/05-ui/drts-design-canvas/ent-*.jsx`

## Guardrail For Future LLMs

If an LLM or auto-worker proposes to modify Lovable / `tenant-commute-hub` for this product, stop that slice and reroute it to `apps/enterprise-dispatch-web`.
