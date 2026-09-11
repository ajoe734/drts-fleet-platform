# SR-OPS-CAPACITY-RUNNER-20260911 — real capacity (C123) acceptance runner

Parent task: `SR-OPS-PROOF-001`. Prior continuations of that task built and
landed capability C122 (backup/restore + business readback, see
`docs/04-uat/system-remediation-20260906/SR-OPS-PROOF-001.md`) and the reused
load generator `tools/system-remediation/ops-proof/capacity.mjs`, but
explicitly left C123 (booking/dispatch/report capacity against a real,
running API) unbuilt: producing a genuine plan requires booting the full
`AppModule`, minting real signed JWTs, and pre-provisioning up to 4,500
distinct dispatchable orders for the full 900-second baseline burst. This
task builds that remaining C123 surface as its own scoped, independently
reviewable slice.

## What this adds

- `tools/system-remediation/ops-capacity/plan-builder.mjs` — pure ESM, no
  NestJS/Postgres dependency. Builds the exact `workloads.booking` /
  `.dispatch` / `.report` arrays the reused `ops-proof/capacity.mjs`
  `validatePlan`/`runPlan` require: real `CreateTenantBookingCommand`,
  `DispatchOrderCommand`, and `CreateReportJobCommand` payloads with real
  `Authorization: Bearer <jwt>` headers and unique idempotency keys, at
  exactly `ceil(durationSeconds * perMinute / 60)` requests per family
  (60/300/30 per minute, per the accepted baseline). It never emits
  `x-runtime-profile-code` on booking requests, since
  `owned-mobility.service.ts`'s `assertRuntimeProfileAllowances` forbids a
  public caller from supplying that header even though `capacity.mjs`'s own
  header allowlist would otherwise permit it.
- `tools/system-remediation/ops-capacity/durable-readback.mjs` — pure ESM
  helpers that independently query Postgres directly
  (`ops.phase1_owned_orders`, `admin.phase1_report_jobs`) for every resource
  ID an HTTP response claimed to have created, and compare that against what
  actually exists. This is what turns "the API returned 200 with an ID" into
  "the ID is a durable row."
- `tests/unit/system-remediation/sr-ops-capacity-20260911/plan-builder.test.ts`
  — runs with no DB/network. Validates the plan-builder's per-family counts
  for the full 900s burst (900/4500/450), validates the built plan against
  the reused `capacity.mjs` `validatePlan` for both a short window and the
  full 900s burst, and checks idempotency-key uniqueness, header allowlist
  compliance, and the `x-runtime-profile-code` omission on bookings.
- `tests/integration/system-remediation/sr-ops-capacity-20260911/ops-capacity-acceptance.test.ts`
  — gated on `DATABASE_URL`; unset on this VM (`it.skipIf`-skips locally).
  When set (only the dedicated workflow below sets it), this test:
  1. Boots the real, compiled `AppModule` (not a stripped test module) via
     `NestFactory.create`, with a real Postgres-backed `DatabaseService`.
  2. Pre-provisions the 4,500 real dispatchable orders the full burst needs
     over real HTTP `POST /api/orders`, using a legitimate `ops_user`
     bootstrap identity (bootstrap headers are accepted only in non-strict
     `test`/`local` auth environments; this is a setup step, not part of the
     measured burst, and is not subject to `capacity.mjs`'s header
     allowlist).
  3. Mints a real tenant JWT through the real HTTP
     `POST /api/auth/tenant/bootstrap-session` endpoint, for the seeded demo
     tenant user `ops@acme.example` (role `tenant_ops_admin`). That role, not
     `tenant_admin`, is required: the route-auth matrix
     (`apps/api/src/common/auth/auth.policy.ts`) requires scope
     `owned:write` for `orders/:orderId/dispatch`, and only
     `tenant_ops_admin` carries that scope in
     `packages/contracts/src/iam-policy-catalog.ts`'s
     `IAM_TENANT_ROLE_POLICY_DEFINITIONS`; `tenant_admin` does not. The same
     tenant JWT is reused for both booking (`tenant:write`) and dispatch
     (`owned:write`).
  4. Mints a real platform-realm JWT in-process, via the same running app's
     own `JwtAuthService.issueSessionToken`, signed against the
     automatically-provisioned default platform admin identity
     (`IdentityRepository.ensureDefaultPlatformAccount`, which runs at
     `onModuleInit` and writes real principal/membership/role-binding rows
     to Postgres on every boot). `POST /api/reports/jobs` requires realm
     `platform` or `ops` and scope `reports:write`; tenant-realm JWTs are
     not accepted realms for that route.
  5. Builds the full plan via `plan-builder.mjs` and executes it by calling
     the reused `ops-proof/capacity.mjs` `runPlan` directly (in-process, not
     spawned) against the real listening server, for the full, accepted
     900-second (15 minute) burst — never a short/mock/skipped stand-in.
  6. Independently reads back every resource ID the run's non-error
     responses claimed to have created, directly from Postgres via
     `durable-readback.mjs`, and asserts the readback is complete
     (`missing: []`) for booking, dispatch, and report families before the
     test can pass.
  7. Writes the full raw JSONL record stream, the `capacity.mjs` summary,
     and a combined acceptance JSON (readback match/missing, report queue
     lag, dispatch order status distribution) under
     `.artifacts/ops-capacity-acceptance/` as durable evidence.
- `.github/workflows/ops-capacity-acceptance.yml` — dedicated GitHub-hosted
  workflow. Provisions a disposable `drts_ops_capacity` Postgres service
  container, runs `pnpm db:migrate`, runs the unit suite, then runs the
  integration acceptance test above with a 22-minute per-test timeout (setup
  + the 900-second burst + readback), gates on zero skips and success, and
  uploads the execution log, both vitest JSON reports, the run-status
  receipt, and the capacity evidence files (raw JSONL, `capacity.mjs`
  summary, combined acceptance JSON) as workflow artifacts. It does not
  `apt-get install` anything (see `SR-OPS-PROOF-001.md`'s 2026-08-19 incident
  note); Postgres client tools are not needed by this workflow since it
  talks to Postgres only through `pg`, not `psql`/`pg_dump`/`pg_restore`.

## What this does not cover

- **C122** (backup/restore + business readback) is already landed; see
  `ops-proof-acceptance.yml` / `SR-OPS-PROOF-001.md`. This task does not
  rebuild or re-verify it.
- **C124** (deployment version/health/rollback, and any authorized live
  cloud load) remains separate `SR-LIVE-OPS-001` scope. This task adds no
  reverse dependency on it.
- This VM never hosts Postgres, a product server, or Docker infrastructure;
  every real execution described above happens only on the dedicated
  GitHub-hosted workflow's disposable, loopback-only service container.

## Baseline source of truth

| Workflow family | 15-minute burst | Route | Required scope (auth.policy.ts) |
| --- | --- | --- | --- |
| Booking / intake | 60 requests/minute → 900 total | `POST /api/tenant/bookings` | `tenant:write` |
| Dispatch | 300 transitions/minute → 4,500 total | `POST /api/orders/:orderId/dispatch` | `owned:write` |
| Reporting | 30 jobs/minute → 450 total | `POST /api/reports/jobs` | `reports:write` |

Source: `docs/02-architecture/phase1-operational-workload-sla-degradation-baseline-20260430.md`.
`plan.maxInFlight` is set to `500`, the largest documented concurrency/backlog
figure in that baseline (500 open dispatchable orders), so the single shared
load-generator concurrency cap does not artificially throttle the dispatch
family below its documented backlog target.

## Evidence provenance

This document records local, static verification only until the dedicated
`ops-capacity-acceptance.yml` workflow has actually executed the full burst
on GitHub-hosted infrastructure; that result, once obtained, must be appended
here with the run URL and outcome, following the same evidence-provenance
discipline as `SR-OPS-PROOF-001.md`. A branch push alone is not a substitute
for that recorded run.
