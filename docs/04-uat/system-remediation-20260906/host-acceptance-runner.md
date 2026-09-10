# SR-HOST-FE-001-ACCEPTANCE-RUNNER: Host real HTTP/SQL and browser acceptance

- Task: `SR-HOST-FE-001-ACCEPTANCE-RUNNER`
- Owner: `Claude2`
- Reviewer: `Claude`
- Parent: `SR-HOST-FE-001` (done, but its own UAT doc §7 explicitly admits only
  mocked loader unit tests — no real HTTP, no real SQL round trip, no browser
  rendering; see the audit trail below)
- Status of this document: written by the runner's owner at implementation
  time; the "Real run evidence" section is filled in after the actual
  GitHub Actions run(s), not before — do not treat SHAs/URLs in that section
  as authoritative until they are.

## 1. Why this task exists

An independent audit (`.local/worker-recovery-20260910/host-acceptance-audit/`,
not tracked in this repo — root-preserved audit evidence) established:

- `SR-HOST-FE-001`'s merged candidate (`fcb5c4b8423f7d135cff134c23f731a0669f3a6d`,
  merge `529e3a5d37fb20d4d340b062cc64f6ac84fc53c1`, PR #1908) only ever ran
  `pnpm exec vitest run tests/unit/system-remediation/sr-host-fe-001/`
  (32 mocked-loader unit tests) plus `typecheck`/`eslint`/`git diff --check`.
- Its own UAT §7 states, in its own words: no live backend, no real HTTP
  round trip, no browser/device verification, no end-to-end contract test.
- `SR-HOST-BE-001` (merge `5ef25bb1ad766b5957d2bffe9087e3b804c731cf`) has
  since merged a real, SQL-backed `apps/api/src/modules/host-view/` module,
  removing the blocker the FE candidate originally cited — but the FE
  candidate's evidence was never re-verified against it.

This task supplies that missing real evidence and honestly reports what it
finds — including defects — rather than re-labeling the same mocked unit
tests as remote evidence. It does not edit any product file under
`apps/api/src/` or `apps/fleet-partner-portal-web/`, does not reopen or
re-approve `SR-HOST-FE-001`, and does not perform the global AppModule/portal
navigation wiring that belongs to `SR-WIRE-001`.

## 2. What was actually run, and where

Two independent jobs in `.github/workflows/host-acceptance.yml`, both
GitHub-hosted only (this project's VM does not permit starting product
dev/preview/HTTP/browser servers or Docker infrastructure, so neither job's
servers are ever started locally):

| Job | Required-acceptance gate | What it proves |
| --- | --- | --- |
| `api-sql-acceptance` | `host_actual_http_sql_owner_scope` | Real HTTP requests against a real, listening Nest server (isolated composition of the real `HostViewModule`) backed by a real, migrated PostgreSQL. |
| `browser-acceptance` | `host_actual_browser_switching_states` | Real Chromium against the real, production-built `fleet-partner-portal-web` Next.js server, pointed at the same isolated Host API. |

`host_runtime_harness_and_integration_boundary` is this document plus the
workflow's immutable-candidate-SHA verification step (checkout resolves the
exact requested commit, or the job fails loudly) and the per-run evidence
artifacts uploaded by both jobs (`if: always()`, so a failing run still
uploads its execution log, JSON report, and run-status.json).

### 2.1 Isolated composition boundary (read before treating this as end-to-end)

`apps/api/src/app.module.ts`'s `imports` array does not register
`HostViewModule` — confirmed by reading the file directly, not inferred.
That wiring gap is `SR-WIRE-001`'s scope. Per this task's mandate, real
acceptance evidence was still obtained by booting the real, unmodified
`HostViewModule` (compiled from `apps/api/src/modules/host-view/`, not
reimplemented) together with the real `BootstrapAuthGuard`,
`SnakeCaseInterceptor`, and `SnakeCaseExceptionFilter` in a dedicated Nest
composition — see `tests/e2e/system-remediation/sr-host-fe-001/
host-acceptance-app.ts`.

This is **module-level evidence**, not full-application wiring evidence.
Explicitly NOT exercised by either job:

- Root `AppModule` registration of `HostViewModule` (still absent on `dev`).
- The shared fleet-partner-portal outer layout/navigation shell that would
  route a real logged-in user into `/host/*` (`SR-WIRE-001`'s scope; this
  task does not edit or assert that shell is complete).
- Global rate limiting (`BootstrapThrottlerGuard`) and feature-gating
  (`FeatureGateGuard`) — identical cross-cutting guards for every module in
  `AppModule`, not host-specific, deliberately excluded from the isolated
  composition so the >200-vehicle fixture this runner requires cannot trip
  a shared, non-host-specific rate limit and produce a false negative.
- Physical mobile/tablet device verification. The browser job uses headless
  Chromium at fixed viewport sizes (390×844, 1440×960); this is browser
  emulation, not physical-device proof, and is not represented as such
  anywhere in this document or the harness evidence.

## 3. Real defects found and reported (not fixed here)

This task does not edit `apps/api/src/`. Both defects below are proven with
real HTTP + real SQL in `host-api-sql-acceptance.test.ts`'s "Known real-schema
defect" suite (and cross-confirmed from the browser in
`host-browser-acceptance.spec.ts`), and are reported to the `SR-HOST-BE-001`
owners as follow-up work, not silently absorbed into "expected" test output.

### 3.1 `listTripsByVehicle` / `listVehicleCases` reference columns that do not exist

`HostViewRepository.listTripsByVehicle` queries `ops.phase1_driver_tasks`
for `t.vehicle_id`, `t.started_at`, `t.completed_at`, `t.actual_distance_km`,
and `t.fare` as top-level columns. `listVehicleCases`'s subquery references
`ops.phase1_dispatch_assignments.vehicle_id`. On the real production schema
(`infra/migrations/V0011__phase1_runtime_snapshots.sql`), both tables only
have `task_id`/`assignment_id`, `order_id`, `dispatch_job_id`, `status`,
`created_at`, `updated_at`, and a `record jsonb` payload — none of those
referenced columns exist (confirmed independently by the `record->>'...'`
expression index in `infra/migrations/V0020__settlement_driver_index.sql`,
which shows the real access pattern for this table family is through
`record`, never top-level columns).

**Effect in production, if `HostViewModule` were wired into `AppModule`
today:** the real SQL statement fails with "column does not exist" on every
call. `HostViewRepository`'s own `try/catch` then silently falls back to its
in-memory `Map` (always empty outside a test process), so
`GET /api/host/vehicles/:id/trips`, `GET /api/host/vehicles/:id/cases`, and
(because `getEarningsSummary` derives from the same trips query)
`GET /api/host/vehicles/:id/earnings` all return **HTTP 200 with an empty
list / zero earnings**, not a 5xx — a silent data-loss defect, not a loud
one. `host-api-sql-acceptance.test.ts` seeds real, correctly-shaped trip and
case data for `VEHICLE_A1` first (proven present via direct SQL assertions)
specifically so this suite demonstrates the failure is the query, not
missing data.

### 3.2 Frontend's 200-row vehicle-detail lookup silently misses vehicle #201+

`host-data.server.ts`'s `loadHostVehicleDetail` always requests
`{ page: 1, pageSize: VEHICLE_LOOKUP_PAGE_SIZE }` (200) and searches only
within that page for the requested `vehicleId`, because the typed API client
has no single-vehicle-by-id endpoint. The backend list endpoint itself
paginates correctly past 200 rows (`HostViewService.paginate` fetches all
owned rows, then paginates in memory — proven in this suite's "long list"
test), so this is a **frontend-only** limitation, not a backend one. A host
who owns 201+ vehicles cannot open the detail page for vehicle #201 onward:
it renders the anti-enumeration `vehicle_not_found` state even though the
vehicle is genuinely owned and active. Reproduced against a real 205-vehicle
fixture (`HOST_BULK_PARTNER_ID`) at both the HTTP layer and, separately, by
real Chromium navigation in `host-browser-acceptance.spec.ts`, per this
task's explicit instruction not to shrink the fixture to hide this.

## 4. Real acceptance coverage summary

`tests/e2e/system-remediation/sr-host-fe-001/host-api-sql-acceptance.test.ts`
(real HTTP + real SQL, isolated composition):

- Anonymous request → 401; wrong-realm identity → 403.
- Owner isolation across Host A, Host B, and an unrelated real identity with
  zero vehicles (legitimate empty list, not an error).
- Cross-owner detail/maintenance access → 404 `HOST_VEHICLE_NOT_FOUND`
  (anti-enumeration; response body never contains the other owner's data).
- `POST`/`PUT`/`PATCH`/`DELETE` on vehicles → 405
  `HOST_MUTATION_NOT_SUPPORTED`, with real SQL state read back before/after
  to prove the denied mutation attempt changed nothing.
- Real maintenance HTTP + SQL round trip (two seeded rows, one completed
  with a real cost figure, one scheduled).
- The two known defects in §3, proven with real data present.
- Pagination: a real 205-vehicle owner across two pages (200 + 5), the
  frontend-only 200-row lookup limitation isolated from the backend's
  correct long-list pagination, and a legitimate 404 for a syntactically
  valid but nonexistent vehicle id.
- A guardrail test asserting every identifier used in the suite is
  fictional UAT data.

`tests/e2e/system-remediation/sr-host-fe-001/host-browser-acceptance.spec.ts`
(real Chromium against the real, built Next.js server):

- Host A's vehicle list renders real owned vehicles, never Host B's.
- Switching identity from Host A to Host B (fresh browser context) shows
  only the new host's vehicle, with no stale data from the previous one.
- Clicking into a vehicle and switching tabs (real link navigation) shows
  real maintenance data and the honest empty trips tab (§3.1, cross-surface
  confirmation).
- Keyboard focus + Enter activation reaches and switches the cases tab.
- Mobile (390×844) and desktop (1440×960) viewport rendering, with
  screenshots uploaded as evidence.
- Legitimate empty state (unrelated identity, zero vehicles) and
  `fetch_failed` state (missing host identity header) — never fabricated
  data in either case.
- The §3.2 defect, reproduced by real browser navigation to vehicle #201 of
  a genuinely-owned 205-vehicle fixture.

Both suites are written to fail loudly (via vitest/Playwright's normal
non-zero exit) rather than self-skip; the workflow's gate steps additionally
verify the machine-readable report shows zero pending/skipped tests and
every declared test passed before recording `status: passed`.

## 5. Real run evidence

Filled in after the workflow actually runs on GitHub Actions — do not treat
this section as complete until it names a real run URL.

- Runtime candidate SHA (product code under test):
  `<filled in after first real run>`
- Workflow/harness SHA (this task's own commit supplying the harness):
  `<filled in after first real run>`
- `api-sql-acceptance` run: `<run URL>` — status: `<pending>`
- `browser-acceptance` run: `<run URL>` — status: `<pending>`
- Evidence artifacts: `host-acceptance-api-<sha>`, `host-acceptance-browser-<sha>`
  (uploaded by the workflow; contain `execution-log.txt`, `test-report.json`
  / Playwright's `test-results/`, `run-status.json`, and the HTTP/browser
  evidence JSON from `UatEvidenceRecorder`).

## 6. CI / merge status

- Branch: `claude2/sr-host-fe-001-acceptance-runner`
- `INTEGRATION_STATUS`: `<filled in at handoff — branch_pushed until PR/CI/merge evidence exists>`
- This is a non-canonical support/verification task
  (`task_class: implementation`, `mutates_canonical: true` per its own
  record, but it does not touch `apps/api/src/` or
  `apps/fleet-partner-portal-web/` — only the four write-scoped paths this
  task owns). It does not itself flip `SR-HOST-FE-001`'s status; per the
  independent-review audit, that requires the recorded owner/reviewer path
  for that task specifically.

## 7. Independent review

`<filled in by the reviewer — do not self-approve>`
