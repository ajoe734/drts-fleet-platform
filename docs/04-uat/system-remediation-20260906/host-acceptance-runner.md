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

**§3.3 and §3.4 below are two independent bootstrap-blocking defects that
prevented both jobs from producing positive evidence across the first three
real GitHub Actions runs of this harness. Both were repaired upstream by
`SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910` (merged to `dev` as
`714ccccd4c302a90c398fcfef050d07dd0d39427`, PR #1951). A fourth real run,
[`34544324681`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34544324681)
(candidate `a3ebf570748fee3372aab1cfce116e487d89bdc5`), is the first to boot
past both crashes: `api-sql-acceptance` passed 18/18, `browser-acceptance`
passed 9/9, zero skipped in either — see §5 for the full run table and
evidence artifacts.**

This task does not edit `apps/api/src/`. §3.1 and §3.2 are defects the suite
is written to prove with real HTTP + real SQL, in
`host-api-sql-acceptance.test.ts`'s "Known real-schema defect" suite (and
cross-confirmed from the browser in `host-browser-acceptance.spec.ts`). As of
run `34544324681` this is no longer static/pre-bootstrap analysis: every
assertion below, including the `[DEFECT]` tests, ran for real against a real,
migrated PostgreSQL and a real, listening `HostViewModule` instance, and
passed. §3.2 specifically was corrected by that real run — see below; the
originally-assumed "200-row" frontend-only framing understated the defect.
All four defects (§3.1–§3.4) are reported to the `SR-HOST-BE-001` owners as
follow-up work, not silently absorbed into "expected" test output.

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

### 3.2 Combined backend 100-row pageSize clamp + frontend 200-row assumption: the real cutoff is vehicle #101, not #201

`host-data.server.ts`'s `loadHostVehicleDetail` always requests
`{ page: 1, pageSize: VEHICLE_LOOKUP_PAGE_SIZE }` (200) and searches only
within that page for the requested `vehicleId`, because the typed API client
has no single-vehicle-by-id endpoint. This was originally assumed to be a
**frontend-only** limitation, on the theory that the backend list endpoint
paginates correctly past 200 rows. Run `34544324681`'s real HTTP/SQL evidence
(`host-api-sql-acceptance.test.ts`, "reveals the backend's own 100-row
pageSize clamp") corrects that assumption:
`HostViewService.paginate` silently clamps any requested `pageSize` to a hard
max of 100 — `GET /api/host/vehicles?page=1&pageSize=200` returns HTTP 200
with exactly 100 rows and `page_info.page_size: 100`, not an error and not
200 rows. The list endpoint itself still paginates correctly across as many
100-row pages as needed (verified for pages 2 and 3 of a real 205-vehicle
fixture), so the backend's own paging is not broken — but because the
frontend's single lookup only ever sees the first 100 rows the backend will
give it in one response, **the real cutoff for the detail page is a host's
vehicle #101, not #201** as `host-data.server.ts`'s own comment assumes. A
host who owns 101+ vehicles cannot open the detail page for vehicle #101
onward: it renders the anti-enumeration `vehicle_not_found` state even though
the vehicle is genuinely owned and active. Reproduced against a real
205-vehicle fixture (`HOST_BULK_PARTNER_ID`) at both the HTTP layer and,
separately, by real Chromium navigation to vehicle #201 (beyond both the
frontend's assumed 200-row boundary and the backend's real 100-row clamp, so
it is not found under either accounting) in
`host-browser-acceptance.spec.ts`, per this task's explicit instruction not
to shrink the fixture to hide this.

### 3.3 [BLOCKING] `vehicles*` bare-wildcard routes crash `HostViewModule` bootstrap entirely under the installed `path-to-regexp@8.4.2`

`apps/api/src/modules/host-view/host-view.controller.ts` declares its
mutation-rejection routes (AC-HOST-NEG-2) with a bare Express-style wildcard:

```
@Post("vehicles*")
@Put("vehicles*")
@Patch("vehicles*")
@Delete("vehicles*")
```

The installed `path-to-regexp@8.4.2` (pulled in by
`@nestjs/platform-express@^11.1.18`, confirmed in `pnpm-lock.yaml`) dropped
support for bare `*` wildcards; a trailing `*` now must be a named wildcard
segment (e.g. `vehicles*splat`). When Nest binds this controller's routes
under the module's `api` global prefix, this throws synchronously:

```
TypeError: Missing parameter name at index 19: /api/host/vehicles*; visit https://git.new/pathToRegexpError for info
```

**Effect:** this is not a single-endpoint failure — it throws while Nest is
still compiling the HTTP adapter's route table, so the entire isolated
`HostViewModule` composition (see `host-acceptance-app.ts`) fails to boot.
No `GET`, and no owner-isolation or read-only check, for any Host endpoint
can run until this is fixed; the mutation-rejection intent of AC-HOST-NEG-2
itself is also currently unverifiable, since the process that would reject
those methods never starts. Proven on the real, GitHub-hosted
`api-sql-acceptance` job — see §5 for the run/job URL and candidate SHA; the
full stack trace is in that job's uploaded `execution-log.txt` artifact
(`host-acceptance-api-<sha>`).

The `browser-acceptance` job's own failure in the same run is a direct
cascade of this: the isolated API server process crashes at startup for the
same reason, so `host-browser-acceptance.spec.ts` renders real empty/failed
states against a dead backend rather than the intended data-backed states.
This runner's own readiness-wait script (`.github/workflows/host-acceptance.yml`)
had two, independent bugs of its own that had to be fixed across two commits
to get an honest failure signal instead of a misleading one:

1. `curl -s -o /dev/null -w '%{http_code}' "$URL" || echo "000"` concatenates
   curl's own `000` output (printed on connection refusal) with the
   `|| echo "000"` fallback into `000000`, which is `!= "000"`, so the wait
   loop falsely reported the API "responding" after 1 second instead of
   failing loudly at the 60s timeout — proven by run `34496021674`, where
   `browser-acceptance` ran all 9 Playwright specs against a dead backend
   and failed with confusing `toBeVisible`/`element(s) not found` errors
   instead of a clear "API did not start" message.
2. The first fix (`code="$(curl ... 2>/dev/null)"; code="${code:-000}"`)
   removed the concatenation but introduced a second problem: this script
   runs under `bash -e`, and `code=$(curl ...)` — a plain command
   substitution assignment — propagates curl's own non-zero exit status
   (e.g. `7`, connection refused) to `set -e`, aborting the whole step on
   the very first loop iteration instead of retrying for up to 60s. Proven
   by run `34497057638`, whose `browser-acceptance` job's "Start isolated
   Host acceptance API server" step failed in ~0.3s with a bare
   "Process completed with exit code 7" instead of the intended 60-iteration
   wait and diagnostic message.

Both are fixed in this task's commits by neutralizing curl's exit status
inside the substitution before applying the empty-string fallback:
`code="$(curl -s -o /dev/null -w '%{http_code}' "$URL" 2>/dev/null || true)"; code="${code:-000}"`,
applied to both the API and portal readiness waits. This was verified locally
against a closed port under `bash -e` (correctly resolves to `code=000` and
reaches the end of the script) before being pushed for a real re-run — see
§5 for that run's result. The bootstrap crash was a product defect in
`apps/api/src/modules/host-view/host-view.controller.ts`, out of this task's
write scope (owned by `SR-HOST-BE-001`) — not fixed by this task.

**Resolution (`SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910`, merged to
`dev` as `714ccccd4c302a90c398fcfef050d07dd0d39427`, PR #1951):** repaired in
`apps/api/src/modules/host-view/host-view.controller.ts` by replacing the bare
wildcard routes with framework-compatible routes
`["vehicles", "vehicles/*splat"]` on `@Post`, `@Put`, `@Patch`, and `@Delete`.
This eliminates the `path-to-regexp@8.4.2` `Missing parameter name` exception
during route table compilation, matches both the exact `/api/host/vehicles`
endpoint and all nested subpaths (`/api/host/vehicles/*`), and preserves the
405 Method Not Allowed mutation rejection contract under partner realm
authentication. Verified by that task via focused Vitest regression tests
(`sr-host-be-001.test.ts` Suite 12) and NestJS application bootstrap; this
runner independently re-verifies it with real remote HTTP acceptance — see
§5.

### 3.4 [BLOCKING, second independent crash] `apps/api/dist/modules/tenant-partner/tenant-approval-rule-evaluator.js` throws `TENANT_APPROVAL_RULE_CONDITION_FIELDS is not iterable` on the standalone-server bootstrap path

Once the readiness-check bugs in §3.3 were fixed, run `34497686598` gave the
first honest, full-timeout failure for `browser-acceptance` — and it
surfaced a **second, independent** bootstrap crash, distinct from §3.3's
`vehicles*` route error:

```
[host-acceptance-server] failed to start TypeError: contracts_1.TENANT_APPROVAL_RULE_CONDITION_FIELDS is not iterable
    at Object.<anonymous> (apps/api/dist/modules/tenant-partner/tenant-approval-rule-evaluator.js:22:20)
    ...
    at Object.<anonymous> (apps/api/dist/modules/tenant-partner/tenant-partner.service.js:68:42)
```

`TENANT_APPROVAL_RULE_CONDITION_FIELDS` is a real, singly-declared array
export (`packages/contracts/src/index.ts:2020`), spread into another array
at `apps/api/src/modules/tenant-partner/tenant-approval-rule-evaluator.ts:70`.
Both `@drts/contracts` and `apps/api` build as CommonJS (no ESM/CJS interop
mismatch found), and the export itself is not duplicated or shadowed
anywhere in `packages/contracts/src/index.ts`, so this task does not have a
confirmed root cause for *why* the exported value is non-iterable at this
specific point — only that it reproducibly is, in this real GitHub Actions
run, in real compiled production code.

One relevant, unconfirmed structural fact: `host-acceptance-app.ts`'s
`buildHostAcceptanceCandidate()` runs `pnpm --filter @drts/api... build`
(deliberately, so this harness tests the exact emitted JS a real server
would run — see that file's own header comment), which rebuilds
`@drts/contracts` a second time via `apps/api`'s own `prebuild` script, in
the same job that already built `@drts/contracts` once in the workflow's
"Build workspace packages" step. Whether that redundant rebuild is related
to this crash is not established here; it is reported as a fact this task's
owners should check, not as the confirmed cause.

**Why this is reported as an independent finding, not a duplicate of §3.3:**
the two Host acceptance jobs boot the same `HostViewModule` composition via
two different code paths — `api-sql-acceptance` in-process via Vitest hits
the `vehicles*` route-binding crash; `browser-acceptance` via the standalone
`host-acceptance-server.ts` process hits this tenant-partner crash instead,
before ever reaching route binding. Fixing only §3.3 does not by itself
prove `browser-acceptance` would then pass — this crash would very likely
still block it by itself; both were reported to `SR-HOST-BE-001`'s owners as
follow-up work.

**Resolution (`SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910`, merged to
`dev` as `714ccccd4c302a90c398fcfef050d07dd0d39427`, PR #1951):** repaired in
`apps/api/src/modules/tenant-partner/tenant-approval-rule-evaluator.ts`. Root
cause: during standalone server bootstrap under `tsx`, TypeScript resolution
and module loader interop in `apps/api` caused the runtime value of
`contracts_1.TENANT_APPROVAL_RULE_CONDITION_FIELDS` to evaluate to `undefined`
at the time `tenant-approval-rule-evaluator.ts` executed top-level
`const KNOWN_CONDITION_FIELDS = new Set([...TENANT_APPROVAL_RULE_CONDITION_FIELDS]);`.
Spreading `undefined` threw `TypeError: contracts_1.TENANT_APPROVAL_RULE_CONDITION_FIELDS is not iterable`.
Repaired by:
1. Providing `CANONICAL_TENANT_APPROVAL_RULE_CONDITION_FIELDS` as an immutable fallback whitelist containing all 13 canonical condition fields.
2. Resolving condition fields safely via `RESOLVED_TENANT_APPROVAL_RULE_CONDITION_FIELDS` so `KNOWN_CONDITION_FIELDS` is always populated with an iterable array.
3. Exporting `RESOLVED_TENANT_APPROVAL_RULE_CONDITION_FIELDS` as `TENANT_APPROVAL_RULE_CONDITION_FIELDS` to provide an explicit, guaranteed-iterable module export contract.
Verified by that task via `pnpm exec vitest run tests/unit/system-remediation/sr-host-be-001/`
Suite 13 and standalone `createHostAcceptanceApp()` bootstrap under `tsx`; this
runner independently re-verifies it with a real remote browser-acceptance
bootstrap — see §5.

## 4. Real acceptance coverage summary

**As of run `34544324681` (see §5), every item below has been demonstrated
remotely: `api-sql-acceptance` passed 18/18 tests and `browser-acceptance`
passed 9/9, both with zero pending/skipped, against the real, migrated
PostgreSQL and the real, listening `HostViewModule`/`fleet-partner-portal-web`
build described in §2. This is no longer the suite's designed-but-unproven
scope; it is what the suite actually exercised and passed.**

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
- §3.1 and §3.2, designed to be proven with real data present.
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

Fourteen real GitHub Actions runs so far, all on
`claude2/sr-host-fe-001-acceptance-runner`, enumerated directly from the
GitHub Actions API (`gh run list --workflow=host-acceptance.yml`), not
reconstructed from memory. Each run's candidate SHA is that commit's tip at
push/dispatch time; the actual product code under test on each run is
whatever `dev` looked like when that commit's tree was checked out,
unchanged by this task (this task never edits `apps/api/src/` or
`apps/fleet-partner-portal-web/`).

| Run | Commit | `api-sql-acceptance` | `browser-acceptance` |
| --- | --- | --- | --- |
| [`34495165342`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34495165342) | `4a2857540` (initial harness) | failed | failed — ESM `require` crash under Playwright |
| [`34496021674`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34496021674) | `5a8947e80` | failed — §3.3 (`vehicles*`) | failed — readiness-check false positive (§3.3 history) then real defects cascade |
| [`34497057638`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34497057638) | `4fc7dd879` | failed — §3.3 (`vehicles*`) | failed — readiness-check `set -e` abort (§3.3 history), no useful signal |
| [`34497686598`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34497686598) | `d06c66dd5` | failed — §3.3 (`vehicles*`) | failed — clean 60s timeout, real §3.4 crash captured |
| [`34498758985`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34498758985) | `7d553fd39` (docs only) | failed — §3.3 still unresolved on this tree | failed — same §3.4 cascade |
| [`34535868241`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34535868241) | `1c52cef26` (merged `origin/dev`, pulling in the upstream `SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910` fix for §3.3/§3.4) | failed | failed |
| [`34536879852`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34536879852) | `e11dbf2c0` | **passed** | failed — harness/browser-side issue, not §3.3/§3.4 |
| [`34537557009`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34537557009) | `c8afbe9ce` | **passed** | failed — standalone server was silencing real exceptions |
| [`34540100185`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34540100185) | `a51913b37` | **passed** | failed — `SnakeCaseExceptionFilter` swallowing real request errors |
| [`34541189923`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34541189923) | `afe7a48b9` | **passed** | failed — guard-thrown exceptions the interceptor structurally couldn't see |
| [`34542116939`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34542116939) | `1603d04df` | **passed** | failed — acceptance build not self-sufficient for `@drts/control-plane-auth` |
| [`34543041571`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34543041571) | `4bf050a38` | **passed** | failed — 6/9 passed; `tsx`'s bare-specifier resolution still broken for `@drts/control-plane-auth` |
| [`34543449378`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34543449378) | `5101d047b` | **passed 18/18, 0 skipped** | **passed 9/9, 0 skipped, 0 flaky** |
| [`34544324681`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34544324681) | `a3ebf570748fee3372aab1cfce116e487d89bdc5` (workflow_dispatch re-run of the final branch-tip commit, CI-wiring only, no test-file changes) | **passed 18/18, 0 skipped** | **passed 9/9, 0 skipped, 0 flaky** |

Runs 1–5 (through `34498758985`) predate the upstream bootstrap fix and fail
on §3.3/§3.4 as documented in §3. Run 6 (`34535868241`) is the merge commit
that pulled `SR-HOST-BE-001-POST-ACCEPTANCE-REPAIR-20260910` into this
branch; from run 7 onward `api-sql-acceptance` passes consistently (the
bootstrap crashes are gone), while `browser-acceptance` fails through a
series of independent, real harness/product-boundary bugs (standalone-server
exception handling, `tsx` module resolution, then three Playwright
selector/timing bugs) — each fixed in its own commit per the log above, with
full technical detail in that commit's message, not repeated here. Run 13
(`34543449378`) is the first real GitHub Actions run to produce
`status: passed` on both jobs, on a push trigger. Run 14 (`34544324681`) is a
workflow_dispatch re-run of the exact final branch-tip commit — the commit
only wires a CI test-file invocation and does not touch any test under
`tests/e2e/system-remediation/sr-host-fe-001/`, so this is a confirmatory
re-run of the same evidence on the SHA that is actually pushed to the branch
tip, not new coverage.

The rest of this section verifies run `34544324681`'s evidence directly from
its downloaded artifacts, not just the green workflow check. Run
`34543449378`'s artifacts were downloaded and checked the same way and show
identical counts: `numTotalTests: 18, numPassedTests: 18, numFailedTests: 0,
numPendingTests: 0` and `stats: {expected: 9, skipped: 0, unexpected: 0,
flaky: 0}`.

- `host-acceptance-api-a3ebf570748fee3372aab1cfce116e487d89bdc5/test-report.json`:
  `numTotalTests: 18`, `numPassedTests: 18`, `numFailedTests: 0`,
  `numPendingTests: 0` — includes the anonymous/wrong-realm 401/403 checks,
  both-direction owner isolation, cross-owner 404 anti-enumeration, the
  405 read-only/SQL-unchanged check, the real maintenance round trip, all
  three §3.1 `[DEFECT]` assertions (trips/cases empty, earnings zero), the
  corrected §3.2 100-row-clamp pagination test, and the fictional-data
  guardrail.
- `host-acceptance-browser-a3ebf570748fee3372aab1cfce116e487d89bdc5/test-results/system-remediation-report.json`:
  `stats.expected: 9`, `stats.skipped: 0`, `stats.unexpected: 0`,
  `stats.flaky: 0` — includes owner isolation and identity-switch rendering,
  tab navigation with real maintenance data and honest empty trips tab,
  keyboard focus/Enter tab activation, mobile (390×844) and desktop
  (1440×960) viewport rendering, the legitimate empty-owner state, the
  missing-identity `fetch_failed` state, and the real-browser §3.2
  reproduction at vehicle #201.
- The two uploaded screenshots
  (`host-acceptance-mobile-vehicle-list.png`,
  `host-acceptance-desktop-vehicle-detail.png`) were opened directly: both
  are real, populated FLP Host UI at the exact requested viewport
  dimensions (confirmed via `file` on the PNGs), not blank or placeholder
  pages.

- Evidence artifacts (uploaded by every run, `if: always()`):
  `host-acceptance-api-<sha>`, `host-acceptance-browser-<sha>` — contain
  `execution-log.txt`, `test-report.json` / Playwright's `test-results/`,
  `run-status.json`, and the HTTP/browser evidence JSON from
  `UatEvidenceRecorder`. For run `34497686598`: `run-status.json` records
  `START_API_OUTCOME: failure`, `HARNESS_OUTCOME: skipped`,
  `GATE_OUTCOME: failure`, `status: not_run` for `browser-acceptance`, and
  the equivalent real-vitest-failure fields for `api-sql-acceptance`. For run
  `34544324681`, both jobs' `run-status.json` record `status: passed` with
  every prior-stage outcome (`install`, `migrate`, `build`, `start`,
  `harness`, `gate`) at `success`.

## 6. CI / merge status

- Branch: `claude2/sr-host-fe-001-acceptance-runner`; PR
  [#1956](https://github.com/ajoe734/drts-fleet-platform/pull/1956) into
  `dev` (open, mergeable).
- Candidate SHA: the branch tip after this doc commit lands on top of fix
  commit `804c9787c2c18287689d9dffb0357ff8f8d5af37` (see
  `git log -1 origin/claude2/sr-host-fe-001-acceptance-runner` or PR #1956
  for the exact pushed HEAD — a commit cannot cite its own final hash).
  This supersedes `38960a090210691bcee4c542668847d186f06562`, which PR
  #1956's own repo-wide `CI` workflow run
  [`34545025667`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34545025667)
  failed on — not this task's dedicated `host-acceptance.yml`, but the
  monorepo `pnpm lint:root` step in its `Product smoke acceptance` job,
  which runs with `--max-warnings=0`. The failure was two
  `// eslint-disable-next-line no-console` comments in
  `host-acceptance-app.ts` (lines 227 and 257) flagged as
  "Unused eslint-disable directive (no problems were reported from
  'no-console')" — `eslint.config.mjs` does not enable `no-console`
  anywhere in this repo, so the directives never suppressed anything. Fixed
  by deleting both comments; the underlying `console.error` diagnostic
  calls are unchanged. Re-verified locally: `npx eslint` on the full
  `tests/e2e/system-remediation/sr-host-fe-001/` directory is clean, and
  `python3 tools/ci/test_host_acceptance_workflow.py` still passes 27/27.
- `INTEGRATION_STATUS`: `branch_pushed` — pushed, not merged, CI re-run
  pending on the new SHA. This task's own workflow, tests, and doc were
  already complete and passing on the prior SHA: real run
  [`34544324681`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34544324681)
  (candidate `a3ebf5707`) produced `status: passed` on both
  `api-sql-acceptance` (18/18) and `browser-acceptance` (9/9), zero skips in
  either, with the product-defect boundary the same run's evidence
  demonstrates recorded honestly in §3.1/§3.2. This lint fix does not touch
  any file under `tests/e2e/system-remediation/sr-host-fe-001/` test
  content beyond removing the two dead comments, so it does not invalidate
  that evidence, but `host-acceptance.yml` must still be re-run on the new
  SHA to confirm before merge — do not merge on the strength of the prior
  SHA's green run alone. All three `required_acceptance` gates
  (`host_actual_http_sql_owner_scope`, `host_actual_browser_switching_states`,
  `host_runtime_harness_and_integration_boundary`) have real, verified
  evidence as of run `34544324681`. What remains open before merge: a clean
  `host-acceptance.yml` run and a clean repo-wide `CI` run on the new SHA,
  and independent review (§7). The module-level boundary in §2.1 (no root
  `AppModule` registration of `HostViewModule`, no `SR-WIRE-001` navigation
  shell, no physical-device verification) is unchanged and remains
  explicitly out of this task's scope.
- This is a non-canonical support/verification task
  (`task_class: implementation`, `mutates_canonical: true` per its own
  record, but it does not touch `apps/api/src/` or
  `apps/fleet-partner-portal-web/` — only the four write-scoped paths this
  task owns). It does not itself flip `SR-HOST-FE-001`'s status; per the
  independent-review audit, that requires the recorded owner/reviewer path
  for that task specifically.
- **Narrow out-of-write-scope exception (`b44047aad`):** the PR-level `CI`
  and `CI (integration trunk)` runs on candidate `afbfa1934` both failed
  (repo-wide `CI` run
  [`34545640352`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34545640352)
  and `CI (integration trunk)` run
  [`34545640266`](https://github.com/ajoe734/drts-fleet-platform/actions/runs/34545640266)
  — see also the earlier failing pair `34545025667` /
  `34545025633`). Root cause: `vitest.config.ts`'s `include` glob
  (`tests/e2e/**/*.test.ts`) makes root `pnpm test:unit` — which trunk CI's
  `unit` job runs — pick up
  `tests/e2e/system-remediation/sr-host-fe-001/host-api-sql-acceptance.test.ts`
  even though that test's own file-header comment states it must run only
  in the dedicated `host-acceptance.yml` workflow against its migrated
  GitHub-hosted Postgres. Trunk CI's unit job DB has no `core.*` schema
  applied, so the test failed on seed with `relation "core.partners" does
  not exist` (`tests/e2e/system-remediation/sr-host-fe-001/host-acceptance-seed.ts:71`).
  This is not a skipped or weakened acceptance gate: `host-acceptance.yml`
  is unaffected — it invokes the file directly via `pnpm exec vitest run
  tests/e2e/.../host-api-sql-acceptance.test.ts` (line 136-137), not
  through `test:unit` — and `tools/ci/test_host_acceptance_workflow.py`
  continues to validate that workflow in CI. Fix, scoped to a single line
  of `package.json`'s `test:unit` script: added
  `--exclude tests/e2e/system-remediation/sr-host-fe-001/host-api-sql-acceptance.test.ts`
  alongside the two existing `--exclude` flags for other DB-dependent
  tests that already don't run under trunk `test:unit`
  (`tests/integration/unattended-voice-postgres.integration.test.ts` and
  `tests/integration/system-remediation/sr-leave-be-001/**`). `package.json`
  is not one of this task's four declared `write_scopes`; this single-line,
  single-file exception was explicitly authorized in the task's recorded
  `next` guidance as the minimal correct fix for a genuine contract
  contradiction (an un-migrated unit-test DB was calling a test that
  documents it must never run there), not a scope expansion into product
  code. Verified locally: `python3 tools/ci/test_host_acceptance_workflow.py`
  passes 27/27 and `git diff --check` is clean on `b44047aad`. Still
  required before merge: a green re-run of PR #1956's `CI` and
  `CI (integration trunk)` on the new candidate SHA, plus `host-acceptance.yml`
  on the same SHA, and independent review (§7).

## 7. Independent review

`<filled in by the reviewer — do not self-approve>`
