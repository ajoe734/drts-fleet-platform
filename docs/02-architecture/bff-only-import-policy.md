# BFF-only Import Policy

Last updated: 2026-05-19
Status: active CI guardrail for production UI surfaces

## Scope

This policy currently applies to production source code under:

- `apps/tenant-console-web/{app,components,lib,src}`
- `apps/partner-booking-web/{app,components,lib,src}`
- `apps/platform-admin-web/{app,components,lib,src}`

Tests, config files, and non-production support files are out of scope for this guard.

## Rule

Tenant Console, Partner Booking, and Platform Admin must not import direct database clients, Supabase clients, or API runtime implementation modules.

Production reads and writes must flow through BFF-facing clients built on `@drts/api-client`.

Allowed patterns include:

- app-local wrappers such as `@/lib/api-client`
- app-local wrappers such as `@/lib/admin-client`
- direct imports from `@drts/api-client` when defining those wrappers or BFF route handlers

Disallowed import targets include:

- `@supabase/*`
- `pg`
- any import path that reaches `apps/api/*`
- any import path that reaches `common/db/*`
- local helper paths that expose direct `supabase`, `database`, or `db` access inside these UI apps

## CI Enforcement

CI enforces this policy with:

- `scripts/ci/check-bff-only-imports.sh`
- `.github/workflows/ci.yml` job `bff-only-imports`

The check is intentionally narrow and string-based:

- it scans only the three protected production UI surfaces
- it fails on forbidden import path fragments
- it does not attempt full semantic dependency tracing

If a new BFF-safe wrapper is introduced, keep the wrapper on `@drts/api-client` and avoid naming it like a direct DB client.
