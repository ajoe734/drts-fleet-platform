# Deterministic control-plane route suite

`deterministic-route-suite.spec.ts` covers the 39 control-plane routes that
anchor the current Ops Console and Platform Admin smoke registries:

- 21 Ops routes, including the root redirect and list/detail workspaces.
- 18 Platform Admin governance routes used by the deployed runtime matrix.

Every route must return a successful response, render exactly one application
shell and one `main` landmark, and remain free of unexpected `pageerror` and
`console.error` events. Where a route exposes accessible tabs, safe buttons, or
an open-only modal trigger, the suite also exercises those controls without
submitting destructive mutations.

Run it against an isolated seeded database:

```bash
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/drts_route_suite
pnpm db:migrate
pnpm db:seed
pnpm --filter @drts/api build
pnpm exec playwright test -c playwright.deterministic-route-suite.config.ts
```

The `ci-integ` E2E job creates `drts_route_suite` separately from the hermetic
business-scenario database, applies the current migrations and seed data, and
runs this suite after the shell scenarios. This avoids stale tab state,
rate-limit residue, and missing-relation failures from the original historical
PR while preserving its interactive regression intent.
