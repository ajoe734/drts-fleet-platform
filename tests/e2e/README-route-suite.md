Deterministic route suite coverage lives in `deterministic-route-suite.spec.ts`.

The suite asserts, per route (all 39: 21 ops + 18 admin):

- single shell / single `main`
- no `pageerror`
- no unexpected `console.error`
- tab strip round-trip where the page exposes tabs
- at least one enabled non-destructive button does not crash the page
- primary modal flows open and close on key form pages

## Regression intent

The suite is a guard for the dev-runtime functional gap report
(`docs/05-ui/dev-runtime-functional-gap-report-20260603.md`). It is designed to
fail on the known bugs before their separate fixes land and pass after:

- OPS `/revenue` `/drivers` `/vehicles` `/contracts` 500 → `gotoRoute` response
  is not `ok()`
- PA `/fleet` double-shell → two `<main>` landmarks fail `toHaveCount(1)`
- PA `/pricing` broken tab switch → tab round-trip assertion fails

## Data / database bootstrap

The ops console and platform admin pages are repository-backed: each web server
calls `apps/api` over HTTP (`DRTS_API_URL`, default `http://localhost:3001`),
and `apps/api` reads `DATABASE_URL`
(`apps/api/src/common/db/database.service.ts`). The suite runs in one of two
deterministic modes:

1. **Seeded-DB mode (CI, recommended).** `DATABASE_URL` points at a live
   Postgres that has the canonical schema + demo data applied:

   ```bash
   export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_fleet_platform
   pnpm run db:migrate   # infra/migrations (scripts/db-apply.sh)
   pnpm run db:seed      # infra/seeds reference + demo (scripts/db-seed.sh)
   pnpm run test:e2e -- tests/e2e/deterministic-route-suite.spec.ts
   ```

   `apps/api` is started by `playwright.config.ts` and inherits `DATABASE_URL`
   from the environment, so its Postgres pool is live and repository-backed
   routes return real demo data. `.github/workflows/ci.yml` (`smoke-acceptance`)
   provisions a `postgres:16-alpine` service, applies migrations + seeds, then
   runs the suite this way.

2. **Mock-fallback mode (local, no DB).** With `DATABASE_URL` unset, the API
   repositories report `isEnabled() === false` and return empty state instead of
   throwing, and the web pages fall back to their built-in demo fixtures (e.g.
   the hard-coded `OPS-SMOKE-DISPATCH` / `OPS-SMOKE-INCIDENT` workspaces and the
   in-memory `tenant-demo-001`). Pages still render (HTTP 200 + single shell), so
   the shell / pageerror / tab assertions hold without any infrastructure.

Either mode is deterministic. Seeded-DB mode is preferred for CI because it
exercises the real query paths and keeps the suite faithful to the runtime the
fixes target.
