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
  - the 900-second burst + readback), gates on zero skips and success, and
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

| Workflow family  | 15-minute burst                      | Route                                | Required scope (auth.policy.ts) |
| ---------------- | ------------------------------------ | ------------------------------------ | ------------------------------- |
| Booking / intake | 60 requests/minute → 900 total       | `POST /api/tenant/bookings`          | `tenant:write`                  |
| Dispatch         | 300 transitions/minute → 4,500 total | `POST /api/orders/:orderId/dispatch` | `owned:write`                   |
| Reporting        | 30 jobs/minute → 450 total           | `POST /api/reports/jobs`             | `reports:write`                 |

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

## Remediation: SR-API-THROTTLE-BASELINE-20260911

The initial 900s execution under run 34581509135 revealed:

1. HTTP 429 rate limit lockouts due to missing route-level `@Throttle` decorators, which inherited the global 60/min limit and 5-minute blockDuration.
2. HTTP 409 conflict during order dispatch due to missing coordinates on seeded orders (`service_area` compliance gate `review_required`).

Both issues were resolved in `SR-API-THROTTLE-BASELINE-20260911`:

- Explicit `@Throttle` decorators applied to `POST tenant/bookings` (60/min), `POST orders/:orderId/dispatch` (300/min), and `POST reports/jobs` (30/min) with `blockDuration: seconds(1)`.
- Pre-provisioned seed orders updated to include valid Taipei Core coordinates.
- Full details documented in `docs/04-uat/system-remediation-20260906/SR-API-THROTTLE-BASELINE-20260911.md`.

### Run 34743828491 Execution Evidence

- **Workflow**: `Ops Capacity Acceptance` (Workflow ID `355541058`)
- **Run URL**: https://github.com/ajoe734/drts-fleet-platform/actions/runs/34743828491
- **Candidate SHA**: `ba3fa0e2438d79936ec80e30235bbb320b5dfd81`
- **Historical workflow result**: terminal green (`status: passed`) despite the nonzero workload errors below. This is false-green evidence, not successful baseline acceptance.
  - Booking: 879/900 successful (2.3% error rate, p95 70.2ms ≤ 2,000ms SLA, p99 75.4ms ≤ 5,000ms SLA, 879/879 durable readback match)
  - Dispatch: 4,425/4,500 successful (1.6% error rate, p95 10.9ms ≤ 10,000ms SLA, 0 HTTP 409 conflicts, 4,425/4,425 durable readback match)
  - Report: 436/450 successful (3.1% error rate, p95 66.7ms ≤ 5,000ms SLA, 436/436 durable readback match)

## SR-OPS-CAPACITY-FAILCLOSED-20261012 Remediation

A regression was identified where the capacity gate incorrectly accepted workloads with missing or failed measurements. The `durable-readback.mjs` `assertAcceptancePassed` validation lacked strict enforcement of the measured payloads, leading to false-green validation when measurements were absent or returned numerous HTTP 429 errors. This was repaired in the owned gate to enforce exactly 900s duration, exact required counts, zero errors, and p95/p99 bounds checks.

### 429 Throttle Analysis (Unconfirmed Hypothesis)

The 112 observed HTTP 429 errors during testing remain unresolved and their exact root cause is currently **unconfirmed**. The actual route decorators (e.g., `owned-mobility.controller.ts`, `reporting-filing.controller.ts`) use the limits defined in `common/throttling/rate-limit.constants.ts` with a 1-minute window (`ttl=minutes(1)`) and limits of 60/300/30 per minute, not a 1-second measurement window. The `blockDuration: seconds(1)` acts as a blocking penalty, rather than the measurement window itself.

While timer jitter in Node.js `setTimeout` exists, it is insufficient to establish causality for all 112 errors over 1-minute tracking windows without a controlled, formal-path probe that includes the real limiter storage and guard contract (such as `BootstrapThrottlerGuard` / `ThrottlerGuard`).

**Next Steps**:

- A controlled formal-path causal probe is required to definitively prove why the 1-minute limits (60/300/30) are being exhausted.
- Runtime proof must only be gathered in the authorized existing isolated hosted workflow, and never by spinning up VM servers/PG/Docker instances here.
- The 112 HTTP 429 errors and the missing acceptance gate checks remain genuine regressions. The original acceptance gate thresholds must not be relaxed.
- Any product limiter changes or producer fixes require proper Supervisor registered scope/dependencies. Uncertainty is recorded until proven.

## SR-OPS-CAPACITY-FAILCLOSED-20261012 Finding and Evidence Table

Original source lineage remains Claude (owner) / Claude2 (reviewer), archived
`SR-OPS-CAPACITY-RUNNER-20260911`. Gemini's published implementation history is
preserved. Supervisor transferred implementation to Codex2 on 2026-10-12;
Codex remains independent reviewer. The adjacent complete rejected candidates
are `6e0361cf3b762e599b24f2d05a56f71a4091feb7` and
`335505c1c5e7d7f0c385ddd2d55bbdb1e02a3873`, following
`209b7dd0ef285a4c0b6126961462a4c5d3a54a18`. Earlier claims that the
`48c651d26bb2fa83ed2c898bab1eac82e9032d51` whitespace checkpoint fixed
F3/F4/F5 or passed root typecheck were inaccurate and are superseded here.

Codex2 checkpoint A is an implementation unit, **not a review candidate**.
Machine-specific evidence is under `.local/c123-codex2-20261012/` in the assigned
worktree. Node `22.23.2`, Vitest `4.1.4`; all fixture/probe inputs are synthetic.
Only SQL results are mocked for mapper checks; the actual exported functions
run. No VM product, PostgreSQL, Docker, preview or browser service was started.

| Finding / acceptance                                                                    | Source and repair boundary                                                                                                                          | Adjacent old result → checkpoint A                                                                                                                                                                                                                                                                                                                                                                           | Command / exit / evidence                                                                                                                                        | Remaining work and limits                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1: empty/duplicate/unrelated lawful remainder; status threshold masquerading as safety | `durable-readback.mjs`: `readBackOwnedOrders`, `lawfulReasonForOrder`, `summarizeDispatchEvidence`, `assertAcceptancePassed`; integration collector | 6e036 / 335505 independently accepted empty 4499 reasons. Replayed 335505 ACCEPT → current REJECT. Gate now correlates all 4500 scheduled IDs with durable records, actual attempts, ready authority and production reason/trace; lag absence is separate from attempt absence. Legal recorded phone-gate remainder and attempted no-supply degradation pass; unsafe assignment/missing trace/attempt fails. | `node .local/c123-codex2-20261012/adjacent-replay.mjs` exit 0, `adjacent-replay.json`; scoped 2-file Vitest exit 0, 31 tests, `unit-a-final.log`                 | Full migrated PostgreSQL readback and actual safety/degradation scenario remain unverified. No aggregate literal establishes acceptance.                                                                       |
| F2: invalid status/count/lag/concurrency                                                | same formal gate                                                                                                                                    | 335505 fixed the original 25 synthetic decisions; checkpoint A retains them, 25/25 exit 0                                                                                                                                                                                                                                                                                                                    | `node /home/lupin/workspace/drts-fleet-platform/.local/continue-full-completion-20261012T0528/operator-gate-contract-replay.mjs .`, `unit-a-final-contract.json` | Contract-only evidence, not genuine collection or full workload acceptance.                                                                                                                                    |
| F3: direct-ready phone, voice authority, legacy absence, SQL failure and cleanup        | formal owned-mobility creation/phone/callback and `voice-order-preparation.ts` / `voice-command-runner.service.ts`; owned SQL mapper                | Actual same phone fixture 335505 lag=null → current lag=1000ms. Creation-ready phone trace, gated recording transition, unknown legacy ready with real attempt, missing attempt, unversioned voice callback and query failures covered.                                                                                                                                                                      | Same adjacent replay exit 0; `durable-readback.test.ts` 7 tests pass in checkpoint A                                                                             | Reporting repository/service rehydration, voice creation positive, controlled polling failure/finally regressions still to complete. PG syntax/behavior awaits original hosted workflow.                       |
| F4: incomplete pacing boundaries                                                        | `ops-proof/capacity.mjs`: `runPlan`, `measure`; scheduler unit tests                                                                                | 335505 only asserted booking/dispatch spacing with 1ms tolerances; no second report or controlled early/late/deadline coverage                                                                                                                                                                                                                                                                               | Original review 335505 four files / 32 tests exit 0 did not cover these boundaries                                                                               | OPEN: add all-family formal-function controlled regressions, preserving raw overload/429 errors and deadlines.                                                                                                 |
| F5: task TS2339, lint, whitespace, publication metadata                                 | fixture, declarations, harness; historical commit metadata                                                                                          | 335505 actual hosted typecheck exit 2 at test line 285; lint exit 1 at harness line 373. Fixture distribution now explicitly maps canonical status counts; removed unused catch binding and declaration `any`. Checkpoint A scoped eslint exit 0.                                                                                                                                                            | `335505-hosted-typecheck.log`, `335505-hosted-lint.log`; `unit-a-eslint.log`                                                                                     | Root/affected checks still required. Historical missing trailers/malformed subjects remain a real CI blocker; append cannot cure ancestors. Supervisor coordination required; no rewrite or bypass authorized. |
| F6: incapable uniform concurrency/backlog/readiness profile                             | real planner/producer/harness; accepted workload baseline; Supervisor allocation `C123-ACTUAL-PLAN-CONSTRAINT-COORDINATION.md`                      | 335505 uniform 1/s + 30s deadline cannot 50 intake overlap; 1 report/2s cannot create genuine 50 queued/running scenario; 4500 pre-ready seeds imply p95 >=854800ms                                                                                                                                                                                                                                          | Exact static bounds in independent 335505 review and original allocation                                                                                         | OPEN: legitimate typed/validated burst/staged scenario within original limits, or precise missing production contract and registered source allocation. No blind full900s dispatch.                            |
| `capacity_failed_summary_rejected`                                                      | actual formal gate and immutable original artifact11729270836 / run38208300314 at73ba9d0084bd04a0c83f618554fecef1bc170230                           | Reviewer imported 335505 gate and observed uncaught failure with original 24/74/14 errors; checkpoint retains red-payload unit rejection                                                                                                                                                                                                                                                                     | ZIP SHA256 `6e00c860e840ed0fd988a9a639e739b96fba2f4949ed68b3e028a57c4c109236`; original independent review                                                       | Key remains OPEN pending exact candidate independent lifecycle/evidence. All 112 raw429 rows preserved; server-arrival causal resolution is not claimed.                                                       |
| `capacity_same_candidate_full_900s_valid_baseline`                                      | ORIGINAL immutable hosted workflow / real AppModule / migrated PG                                                                                   | Latest original full run38208300314 belongs to73ba and payload FAILED; no new positive candidate run                                                                                                                                                                                                                                                                                                         | Original reviewer `gh run list` exit 0; no hosted dispatch by this owner                                                                                         | OPEN. Requires genuine 900s, 900/4500/450, all latency/error/concurrency/backlog/degradation/safety/SQL facts for same candidate.                                                                              |

No checkpoint waives original counts, error/rate/auth/security/SLO policies,
archived source credit, live/full-system/provider/native/legal/manual gates,
HOLD/F2 or cleanup ZEROremoved. No partial all-fixed handoff is authorized.

Checkpoint B/C (after `ddcd6a463`): `ReportingFilingRepository.loadState` and
`ReportingFilingService.onModuleInit` now have actual recovery-path tests,
including queued jobs retaining first start, completed legacy jobs retaining
absence, and legacy running jobs observing a start only when the real worker
runs. `observations.mjs` extracts the existing exact-ID SQL polling/producer
join so real query errors, in-flight poll cleanup after a producer throw, and
combined producer/SQL failures are tested through the function used by the
harness. No query error is swallowed; only initial JSONL ENOENT is expected.
`unit-b.log`: 2 files / 7 tests passed, exit 0. Production SQL, HTTP and PG
behavior still require hosted verification.

F4 regression coverage now controls external HTTP/clock/timer boundaries and
runs the actual `runPlan` and `measure`; it starts no server. Each ordinary
family has at least three launches with exact >=1000/200/2000ms intervals,
early wakeups and oversleep, all-family 30000ms deadlines, overload preserving
all unsent records, and raw429 retention without retry. The scheduler rounds
positive waits up and rechecks its clock after wakeup, replacing a busy loop.
No product quota or request deadline was changed. An initial unit fixture
failure was due to accumulated mock call history, then corrected by resetting
the HTTP boundary between cases; it is not product acceptance evidence.

Checkpoint D (after `5163a40c0`): planner/producer now declare and validate an
explicit `uniform` / `concurrent` profile and full per-family schedule. The
concurrent profile launches 50 intake requests together plus the remaining ten
later in each minute, within the original 60/min rolling budget. Reporting uses
cohorts of 30 within the original 30/min budget; it does **not** claim those
cohorts prove a 50 queued/running backlog. The producer enforces actual launch
budgets and retains all raw errors and original 30s request deadlines. Ordinary
uniform spacing tests remain intact. `unit-d-plan.log`: 17 tests, exit 0.

The harness now creates an initial backlog of exactly 500 real API orders and
stages the remaining 4000 through the same canonical `POST /api/orders` fixture
creation path before each dispatch's due time. `prepareDispatchItem` uses the
actual measured HTTP response's order ID, records each seed separately, refuses
failed/missing seeds without retries, and never writes a readiness timestamp.
The original isolated fixture actor convention is preserved; booking/dispatch/
report authentication and product quotas are unchanged. All 5850 measured
requests remain; deferred paths resolve only from real created IDs. Polling
includes this run's initial and actually created staged IDs. `unit-d-stage.log`:
19 tests exit 0; these mock only external HTTP and timers and do not establish
actual migrated-PG readiness or capacity.

The existing workflow's final gate additionally loads exactly one actual
acceptance JSON and calls the actual exported gate independently of Vitest's
terminal result. Candidate/workflow provenance must match the run. No new
workflow or alternative acceptance route was introduced.

### Codex2 current disposition after checkpoints A–D

Source checkpoints `ddcd6a4635c57be6e44d7d4b8f9d50b9fc34affa`,
`5163a40c0` and `0a7d2656b` were ordinary-pushed on the original branch, preserving
all published ancestors. Further guards recheck readiness from the same raw
creation/transition evidence used by the SQL mapper, compare every individual
lag with actual timestamps, and reject unrelated readiness traces or unknown
sources. Creation traces confirm creation-ready paths; their later append time
does not replace the actual order creation time. Qualified voice creation is
accepted only with correlated committed command/audit evidence; generic phone
flags/callbacks remain insufficient. `exceptionHold.resolution`, not a
nonexistent `resolvedAt`, is the production hold-resolution field.

| Finding / key                                      | Current source behavior / result                                                                                                                                                                                                                             | Verification (Node22.23.2, Vitest4.1.4)                                                                                                                                                                                                                                                                                                                      | Still required                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1 / F2                                            | Complete and legally degraded positives pass; missing/empty/duplicate/unrelated reasons, unknown ready authority, fake lag, unsafe assignment and inconsistent counts fail. Original adjacent335505 empty-reason ACCEPT → current REJECT remains reproduced. | 6 C123 files / 61 tests in affected regression; formal 25-case replay exit0, `contract-final.json`; adjacent actual-function replay exit0, `adjacent-final.json`                                                                                                                                                                                             | Independent review of exact future candidate; actual migrated PG and safety/degradation collection.                                                                                                                                                                                                                                                                                                                                                                                   |
| F3                                                 | Direct-ready app/phone and qualified voice creation, recording-gated transition, missing legacy readiness, actual attempts independent of missing lag, report first-start/rehydration/legacy absence, SQL poll errors and finally join covered.              | Actual collector/repository/service functions; storage/microtask/clock boundaries only mocked. `affected-regression-final.log` exit0                                                                                                                                                                                                                         | Real hosted SQL/HTTP verification. No PG/VM runtime pass claimed.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| F4                                                 | Ordinary exact1000/200/2000ms boundaries, early/oversleep, each family's actual30s deadline, overload and all raw429 retained. Concurrent/staged scheduling also runs through actual `runPlan`.                                                              | 10 producer tests. Controlled full schedule produced5850 measured +4000 distinct staged-seed records; final dispatch launch899805ms includes the measured5ms fixture preparation at the first staged boundary. Earlier test expected899800 exactly; corrected the expected controlled observation, keeping exact minimum intervals and all counts/deadlines. | Actual server-arrival/network429 causal resolution and hosted workload. No deadline/quota/count/SLO relaxation.                                                                                                                                                                                                                                                                                                                                                                       |
| F5                                                 | Original TS2339 and scoped lint/whitespace repaired. New local fixture `never[]` and multiline import directive defects found by root typecheck were repaired before disposition. Scoped eslint exit0. Root typecheck exit2 remains.                         | `eslint-final.log`; `typecheck-final.log` has no task-owned diagnostics, but shared canonical node_modules links produce missing nodemailer/AWS/tenant-auth/passenger-client and duplicate ApiClient identity diagnostics outside task scope. The complete failed result is retained, not relabeled pass. `git diff --check 73ba..HEAD` exit0                | Exact-hosted dependency/typecheck/CI remains required. Historical malformed subjects/missing trailers still fail every-ancestor metadata validation; append cannot repair them. No rewrite, bypass, source transplant or recovery helper authorized.                                                                                                                                                                                                                                  |
| F6                                                 | Typed/validated per-family concurrent profile and actual500-initial/4000-staged HTTP creation are implemented, replacing the static uniform intake/readiness constraints. Actual50 running/queued reports is unresolved.                                     | Public `createReportJob` → `scheduleReportJobCompletion` → `runReportJob` → `trip_summary` synchronous `buildTripSummaryRows` → `completeReportJob` regression: two budgeted cohorts of30 each drain to completed, peak30; real worker logic runs with only SQL/microtask boundary mocked.                                                                   | Need Supervisor's precise original report-worker/actual workload contract allocation. Current report-file grant is additive first-start observation only and explicitly excludes scheduling/business behavior changes. A configured genuine asynchronous workload/queue scenario is missing from this isolated fixture. Counting50, delaying clocks, holding a mocked worker, extending deadlines, or exceeding30/min is not a repair. Do not dispatch this known-incomplete profile. |
| `capacity_failed_summary_rejected`                 | Exact original failed payload still throws uncaught `Workload failed: failed`, preserving24/74/14 errors                                                                                                                                                     | `exact-failed-payload.log` exit1 (expected); ZIP11729270836 hash reverified `6e00c860e840ed0fd988a9a639e739b96fba2f4949ed68b3e028a57c4c109236`                                                                                                                                                                                                               | Key OPEN pending exact independent candidate lifecycle/evidence. This is negative guard evidence only.                                                                                                                                                                                                                                                                                                                                                                                |
| `capacity_same_candidate_full_900s_valid_baseline` | No new real hosted900s result; current source is not declared a complete candidate                                                                                                                                                                           | Local affected regression: 8files/101tests exit0 (61C123 +31reporting-filing +9artifact regressions); mocked full scheduler is not a hosted900s run                                                                                                                                                                                                          | Key OPEN. Supervisor alone dispatches ORIGINAL immutable hosted workflow after profile/source readiness, review and mandatory CI.                                                                                                                                                                                                                                                                                                                                                     |

Workflow YAML, Python gate syntax and extracted Node payload gate syntax checked,
exit0. The existing final workflow step separately imports the formal gate and
validates candidate/workflow provenance and actual payload; terminal Vitest
green alone cannot establish workload acceptance. Local evidence is under
`.local/c123-codex2-20261012`; final check manifest records execution SHA, source
hashes, commands and distinct pass/fail/not-run outcomes. No runtime, deploy,
provider operation, original-held-task resumption, acceptance waiver or partial
all-fixed handoff was performed. Both required keys remain OPEN.

### Exact report-worker continuation (Codex2, 2026-10-12)

Supervisor's `REPORT-WORKER-TECHNICAL-CONTINUATION.md` expands the original
service/repository grant to the durable worker and the two report-create
controller callers. This supersedes the F6 allocation limitation above only;
all historical findings, source credit, 112 raw HTTP429 errors and required
900s/900/4500/450/SLO/security/SQL evidence remain. Four malformed published
ancestors still impose publication/provenance HOLD. These are unpublished
local checkpoints; neither acceptance key is closed and no push, handoff or
hosted dispatch is authorized yet.

| Finding / key                        | Formal source / adjacent result                                                                                                                                                                                                                                                 | Check and evidence                                                                                                                                                                                                                                                                                                                                                                              | Remaining                                                                                                                    |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Durable acknowledgement              | Original266b controller + `createReportJob` returned201 before the repository INSERT finished. Actual controller/service/repository test with only SQL write boundary blocked reproduced expected-false/actual-true. New two callers await `createReportJobDurably` and COMMIT. | `pnpm exec vitest run tests/unit/system-remediation/sr-ops-capacity-20260911/reporting-queue.test.ts`; old266b exit1, new working-source exit0. Logs in canonical `.local/c123-report-worker-20261012/old-266b-durable-ack.log` and `durable-ack-new.log`. First attempt lacked restored worktree dependency links, exit254, and is not reproduction evidence; links restored before exit1 run. | Full recovery/failure/shutdown/cross-worker regressions and migrated-PG verification still pending.                          |
| F6 report executor / initial backlog | Bounded single FIFO worker uses existing JSON rows and a dedicated session advisory lock; state writes are awaited before publication. Yielding between jobs follows the accepted lower-priority async report model; no artificial service delay or quota/SLO change.           | Implementation checkpoint, not throughput evidence.                                                                                                                                                                                                                                                                                                                                             | Genuine run-owned50 persisted backlog, actual processing, SQL start/completion/error evidence still to implement and verify. |
| Both required acceptance keys        | Remain OPEN. Prior negative-payload evidence is retained.                                                                                                                                                                                                                       | No new candidate/CI/merge/900s result.                                                                                                                                                                                                                                                                                                                                                          | Publication HOLD, independent exact-candidate review/CI and original immutable hosted workflow remain required.              |

Second local checkpoint after `1ec983935`: durable queue regressions7/7 pass,
including transaction failure + original idempotency retry/replay, committed
state publication, cross-session duplicate claim rejection, real builder
failure, queued recovery and shutdown draining only the active claim. The50-job
unit backlog uses the actual `trip_summary` builder without worker/clock mocks;
only external SQL/session behavior is modeled. It is not PostgreSQL capacity
evidence. Rehydration regressions now use actual claim/bootstrap/shutdown hooks,
retaining prior first-start and legacy unknown cases.

`runPlan` now admits the initial50-job producer backlog inside its original
timed window, without resetting the clock or replacing any of5850 measured
requests. Real independent SQL snapshots and final raw JSON job records remain
separate from the450 HTTP reports. A drained initial snapshot, foreign or
duplicate IDs, missing/failed processing, absent first-start, starts beyond5min,
completion beyond30min or inconsistent per-row/summary lag fails the formal
gate. No delay is introduced to force a snapshot; an insufficient genuine
SQL snapshot leaves acceptance red. All existing HTTP errors and extra staged
operations remain raw evidence. Preparation failures are recorded and throw.

The fixed25-case operator contract replay is still executed unchanged. A
first attempt to split a helper module failed because that diagnostic imports
the formal gate through a data URL; the implementation was kept self-contained
and the corrected replay completed25/25, exit0. Initial C123 regression68tests
completed exit0 before adding the new negative snapshot/SLO scenarios.
Affected regressions, root typecheck and scoped lint for this new checkpoint
are running; no passing result is claimed before their terminal output.

Third checkpoint: completion collection now continues after the900s arrival
window only as needed to observe the existing per-job5min start /30min
completion SLOs. The arrival clock/counts, HTTP30s deadlines and latency/rate
targets are unchanged. This avoids falsely rejecting a lawful async job that
starts/completes after arrivals end. The existing workflow's test timeout is
52min and job timeout65min solely to accommodate setup,900s arrivals and this
bounded observation drain; no deployment or new runner is introduced.
Raw failed/expired/missing samples remain failing, and SQL errors propagate.

The changed worker reloads committed state after a failed conditional update,
so a real external expiry remains expired in storage and the local
view. Start-write failures leave no invented first-start; terminal-write
failures retain the last committed running state and first-start for recovery.
Uncertain SQL sessions are discarded rather than returned to the pool.

Caller audit limitation: the pre-existing synchronous
`createMultiTaxiTripExportJob` producer still has a fire-and-forget enqueue,
called by `apps/api/src/modules/multi-taxi/multi-taxi.controller.ts`:
`createTripOperationalExportJob`. That controller is outside the exact
two-generic-report-caller allocation and remains untouched; this checkpoint
does not claim its acknowledgement is durable. Its exact path/symbol and
needed allocation were recorded through owner `progress` for Supervisor.
All generic C123 report jobs and the initial workload use the new awaited
producer. Publication HOLD and both acceptance keys remain OPEN.

Checks at `f7d877d93`: affected24files/257tests exit0; scoped ESLint exit0;
unchanged25-case exported-gate replay exit0; original digest-verified failed
payload produces uncaught `Workload failed: failed`, exit1 (expected negative)
with24/74/14 errors retained. Root typecheck exit2 also identified NEW fixture
TS2412 optional-hook assignment and an invalid `cancelled` report status.
Both were repaired: explicit optional-hook undefined typing and the formal
`expired` terminal status. The report contract has no cancelled enum; no enum
or public contract was changed. Final affected/type/lint results after this
repair are pending and must be read before disposition.

`check_commit_trailers.py --base73ba.. --head HEAD` exit1 remains a full history
failure, including the four published task ancestors and inherited merged
history. No range narrowing, checker bypass, rewrite or new publication is
used to label that result green. `git diff --check73ba..HEAD` exit0 and YAML/
Node syntax checks exit0 do not satisfy that publication gate.

Pre-closeout review at `b31a41fce` found a worker-resource defect: the claim
borrowed a `DatabaseService` pooled connection through the build, while
`daily_dispatch_record` calls `ReportingService.listDailyDispatchRecords` ->
`ReportingRepository.listDailyDispatchRecords` -> the same pool's `query`.
With the existing lawful `DATABASE_POOL_MAX=1`, ownership would occupy the only
connection needed by the builder. The worker now uses one dedicated PG session
per active claim against the existing database URI and closes it on every
path; no new hosting/configuration flag or shared database source is changed.
The existing executor bounds active sessions to one per service. The new
regression runs the actual report builder and `ReportingRepository` with an
external single-slot SQL pool boundary, rather than copying its SQL or mocking
the queue logic. Real PG behavior still requires the original hosted workflow.

Independent-session check at `0a391e8b7` initially failed11worker cases because
the unit PG module mock missed the API's installed transport class. A diagnostic
probe recorded `SASL ... client password must be a string`: the missed boundary
attempted the driver's default connection and authentication failed. No service
was started and no successful PG query or PG acceptance is claimed. The fixture
now resolves the API's actual installed driver and intercepts its connect/query/
end transport methods, with a non-routable unit URI and environment restoration.
The production worker also rejects missing existing `DATABASE_URL` rather than
falling back to an implicit database. Corrected size1 test passes, exit0 with
11non-selected cases skipped; this narrow probe is not the full regression.
Failure/probe logs remain under canonical `.local/c123-report-worker-20261012`.

Corrected boundary regression at `879118f15`: affected24files/259tests exit0,
scoped lint exit0, root typecheck exit2 with no task-owned diagnostics. A final
cross-worker observation repair also batch-loads this service's known pending
job IDs from committed SQL. A job completed by another actual worker becomes
completed in the admitting service's view instead of staying queued forever;
the regression requires exactly one running and completion write across the
two services. No get route, authorization or public enum/response is changed.

### Local verified disposition, publication still held

Execution source: `4cda4ccc0519b2c489c52d22760378a294f0cd10`, original task
branch. Node22.23.2 / pnpm10.33.0. Every check below finished and its output was
read. Subsequent evidence-only checkpoint preserves the tested code hashes in
canonical `.local/c123-report-worker-20261012/check-manifest.json`.

| Finding / acceptance                                 | Current formal source / result                                                                                                                                                                                                                                                                | Command, exit, evidence                                                                                                                                                      | Still required                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Premature201 / lost queue write                      | Two existing controller callbacks await `createReportJobDurably` -> validated producer -> repository enqueue transaction COMMIT. Queued publication follows commit. Original266b actual201-before-write regression failed; repaired path passes.                                              | Actual-function old/new logs retained; final affected regression24files/260tests, exit0, `affected-refresh-final.log`.                                                       | Real HTTP/PG validation and independent candidate review.                                                                           |
| Durable bounded execution / recovery                 | Repository session lock + conditional state writes; actual single worker, per-claim dedicated session closes on every path. Storage failure preserves last committed state/first-start; expiry is not overwritten. Cross-worker cache refresh and size1 builder-query path pass.              | Same260-test regression includes genuine production functions; only SQL/transport/timer boundaries modeled. `eslint-refresh-final.log` exit0.                                | Actual migrated PG ownership/recovery/lifecycle behavior remains unverified.                                                        |
| F6 initial50 +450 measured reports                   | Initial valid batch commits via the production producer inside the unchanged arrival clock. Separate raw SQL snapshot/IDs/final records must show50 queued/running and500 completed jobs with individual5min start /30min completion SLOs; after-arrival observation drain honors those SLOs. | Genuine worker unit backlog, actual scheduler and negative/positive exported gate tests pass; unchanged operator25-case replay at this SHA, exit0, `contract-verified.json`. | Same-candidate900s real HTTP/AppModule/PG run. No static/synthetic50 or throughput claim; observed insufficient snapshot stays red. |
| F1–F5 prior ownership/safety/readiness/pacing guards | Original correlated lawful-positive and refusal cases, direct-ready/voice/legacy authority, every-family cadence/deadlines, overload/raw429 evidence and tenant/idempotency behavior retained in affected regression.                                                                         | 260tests exit0; full `git diff --check73ba..HEAD` exit0; Node/YAML syntax exit0.                                                                                             | Genuine SQL/network observations, all112 original429 arrival causes, exact review/CI still OPEN.                                    |
| Root type / publication gate                         | Root typecheck exit2,68 diagnostics outside task-owned source; task-owned diagnostics0 after the documented fixture fixes. Full diagnostic history range73ba..tested SHA exits1 with307 inherited/task metadata failures.                                                                     | `typecheck-refresh-final.log`, `history-verified.log`; neither result is relabeled pass or narrowed.                                                                         | Dependency/worktree type conditions and the immutable four-task-ancestor publication/provenance HOLD require lawful disposition.    |
| `capacity_failed_summary_rejected`                   | Current gate rejects digest-verified original failed artifact with24/74/14 errors, uncaught exit1 expected; originalZIP SHA256 unchanged.                                                                                                                                                     | `exact-closeout.log`; actual exported gate hash matches `contract-verified.json`.                                                                                            | Key remains OPEN for independent exact-candidate lifecycle/evidence. Negative guard is not a positive capacity result.              |
| `capacity_same_candidate_full_900s_valid_baseline`   | No new hosted result, no source publication or candidate handoff.                                                                                                                                                                                                                             | NOT RUN: publication HOLD prohibits hosted dispatch. Original900s/900/4500/450/5850/auth/SLO/SQL requirements unchanged.                                                     | Supervisor-authorized original immutable workflow after lawful publication, same-SHA review and mandatory CI.                       |
| Additional producer caller                           | `createMultiTaxiTripExportJob` and `multi-taxi.controller.ts:createTripOperationalExportJob` retain the prior synchronous, unawaited acknowledgement.                                                                                                                                         | Exact call path audited, reported through owner progress; controller outside allocated two-caller scope remains untouched.                                                   | Precise Supervisor allocation if shared producer acknowledgement must be made durable; no blanket source expansion.                 |

These checkpoints establish local implementation and scoped checks only.
Review, CI/merge, hosted acceptance, production/human/operator approval and all
original held tasks are separate and remain outstanding. No push, handoff,
deployment, provider operation, source transplant or acceptance closure occurred.

### Exact multi-taxi durable caller continuation, still unpublished

Supervisor's `report-worker-exact-allocation/MULTI-TAXI-DURABLE-CALLER-EXACT-EXTENSION.md`
adds only `MultiTaxiController.createTripOperationalExportJob` to the shared
report producer allocation. The historical additional-caller blocker above is
superseded for this source method. Current owner/reviewer remain Codex2/Codex;
archived Claude/Claude2 and Gemini source credit, PAX's exact-method reservation
and all original held-task boundaries remain intact.

Tested source: `b7acd2e89ea7771f8219233bfec2f7c75a89d35a`, on the original task
branch. Production source was anchored at `6105e887ddce6f96b2da4a8e757a363861aa1d31`;
subsequent anchors correct/extend owned regression fixtures. Node22.23.2 /
pnpm10.33.0. Evidence and exact commands/hashes are in canonical
`.local/c123-report-worker-20261012/multi-taxi-extension/check-manifest.json`.
Every listed check ended and its result was read.

`createTripOperationalExportJob` now awaits the correctly typed
`createMultiTaxiTripExportJobDurably`. The existing synchronous method remains
available to in-memory callers and rejects enabled durable storage rather than
acknowledging an uncommitted job. The async method preserves the original
actor/scope/purpose/key validation and audit/envelope/CSV/download contracts.
Repository `enqueueMultiTaxiTripExportJob` uses the existing V0012
`admin.phase1_report_jobs` schema and a transaction-scoped actor/key lock to
resolve replay from committed JSON, including another worker's accepted job.
Whole rows and metadata commit before cache publication or worker scheduling.
Internal queued status still maps to the original public pending status.

| Finding / acceptance                               | Formal source and before → after                                                                                                                                                                                                                                                                                                                                                                    | Finished checks / evidence                                                                                                                                                                                                                                                                                                                                                                    | Remaining requirement                                                                                                                                                                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-taxi premature accepted response             | Original `328bf94839469ae9b5e17cfb534a80be09689331` controller/service/repository, identical to `4cda4ccc` for these three files, returns while INSERT is held. Actual corrected source waits for INSERT and COMMIT, then publishes the complete canonical payload.                                                                                                                                 | Read-only Git-blob Vitest overlay of those three actual original modules with the current formally typed regression: exit1, expected-false/actual-true; `old-replay-final.log` records module hashes. Current 12 export regressions pass within the final 26-file/277-test regression, exit0, `affected-bounded-final.log`. No active tree reset, replacement worktree or source publication. | Real migrated PG/HTTP independent validation; the SQL/transaction/transport boundary model is not PG acceptance.                                                                                                                          |
| Durable failure, replay and recovery               | Failed INSERT/COMMIT cannot acknowledge, publish or audit creation; retry remains possible. Actual producers serialize the same actor/key and retain canonical rows on replay; changed scope/purpose conflict, another actor has its own key space. Actual worker restart completes the stored rows/artifact, preserves first start and returns completed replay; shutdown drains admitted enqueue. | Same actual-function export regressions include actor/tenant/scope/purpose refusal, generic-route isolation, authenticated download and synchronous durable-bypass refusal. Only external record-query/storage/driver boundaries are mocked.                                                                                                                                                  | Real cross-instance SQL locks, idle/restart behavior and runtime report start/completion SLOs.                                                                                                                                            |
| Unchanged export/C099/report/auth regressions      | Root affected regression including C099, report formats, wire contracts and idempotency/security: 277 pass. Unchanged API controlled export and controller files: 15 pass, 1 fails. The failing controller test mocks/asserts only the old synchronous method at `apps/api/tests/unit/multi-taxi.controller.test.ts:294,345`, so its double lacks the new durable method.                           | `affected-bounded-final.log` exit0; `unchanged-api-regression.log` exit1. The old mock test is not relabeled passed or skipped. Actual controller/service/repository acknowledgement is covered by the owned export regression.                                                                                                                                                               | Supervisor allocation of exactly this existing controller test fixture is requested via owner progress; it remains outside write scopes and untouched. No production fallback or false async return type is introduced to satisfy a mock. |
| Scoped quality / full history                      | Expanded scoped ESLint including the newly allocated controller: exit0. Root typecheck: exit2, 68 outside-scope diagnostics, task-owned diagnostics0. Full original history check: exit1, 307 inherited failures. Whitespace checks pass.                                                                                                                                                           | `eslint-final.log`, `eslint-b7acd.log`, `typecheck-b7acd.log`, `history-final.log`; command/source hashes in the manifest. Initial new fixture currency/optional-metadata errors were fixed; their failing log is retained.                                                                                                                                                                   | Outside-scope dependency/type conditions and four immutable malformed published task ancestors remain unresolved; full history was not narrowed.                                                                                          |
| Local test resource contention                     | One default-concurrency repeat timed out at the existing 5000ms scheduler test while other checks ran. Same final source, assertions, complete 5850 measured/4000 staged operation checks and original thresholds pass with two Vitest workers.                                                                                                                                                     | `affected-b7acd.log` exit1 retained; `affected-bounded-final.log` exit0, 26 files/277 tests. Only test-process concurrency changed; no timeout, product deadline, count or capacity threshold changed.                                                                                                                                                                                        | This is repository unit execution, not hosted throughput evidence.                                                                                                                                                                        |
| `capacity_failed_summary_rejected`                 | Unchanged actual gate still rejects the original failed payload with booking24/dispatch74/report14 errors. Original artifact ZIP SHA256 remains `6e00c860e840ed0fd988a9a639e739b96fba2f4949ed68b3e028a57c4c109236`.                                                                                                                                                                                 | `exact-red-payload.log` uncaught exit1 expected. Actual operator contract at final source:25/25 decisions, exit0, `contract-final.json`.                                                                                                                                                                                                                                                      | Key remains OPEN pending independent exact-candidate lifecycle. All112 raw429 rows and unresolved server-arrival causality remain retained.                                                                                               |
| `capacity_same_candidate_full_900s_valid_baseline` | NOT RUN; no publication, candidate handoff, same-candidate CI/merge or new hosted900s result.                                                                                                                                                                                                                                                                                                       | Original900s/900/4500/450/5850/SLO/auth/concurrency/backlog/lawful-degradation/SQL requirements unchanged.                                                                                                                                                                                                                                                                                    | Publication HOLD must receive lawful disposition before Supervisor dispatches the original immutable hosted workflow.                                                                                                                     |

The publication/provenance HOLD still prohibits push, handoff, history rewrite,
source recovery/transplant or hosted capacity dispatch. The separately recorded
Cloud Run background-worker source contract is also unverified: effective CPU,
billing/minimum instances and genuine idle recovery need their original runtime
owner/evidence. No cloud setting, provider, schema, financial policy, production
approval or VM hosting authority was inferred. Both acceptance keys remain OPEN;
these local source repairs do not close review, CI/merge or external acceptance.
