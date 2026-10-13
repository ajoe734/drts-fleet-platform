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

### Exact existing export fixture continuation, publication still held

Supervisor's `report-worker-exact-allocation/MULTI-TAXI-EXISTING-FIXTURE-EXACT-EXTENSION.md`
now grants only the existing controlled export case in
`apps/api/tests/unit/multi-taxi.controller.test.ts`. The prior fixture-scope
request above is superseded by this exact allocation. Current Codex2/Codex and
archived Claude/Claude2/Gemini credit and all other held-task reservations remain.

Old source `692f5e317529f2359654e6d7c172457e1857d413` was rerun unchanged:
the actual API regression again exits1 with15 pass/1 fail because the service
double lacks `createMultiTaxiTripExportJobDurably`. Tested corrected source is
local unpublished `010f52467df6c606740908032de83963e40693e2`. Exactly two lines
change: the external service-port mock uses that durable method with
`mockResolvedValue`, and the existing expected-call assertion names it. All10
controller cases, payloads, rows, actor, purpose, scope, key, request ID,
preview/status/download and envelope assertions remain. Production code and
the existing actual controller/service/repository durability tests are unchanged.
This service-port mock checks routing; it does not replace the actual producer
regressions or establish SQL commit/runtime behavior.

Evidence, exact commands, versions and source/log hashes are in canonical
`.local/c123-report-worker-20261012/multi-taxi-fixture-extension/check-manifest.json`.
Node22.23.2 / pnpm10.33.0 / Vitest4.1.4. All started checks ended and were read;
earlier manifests and failed logs remain intact.

| Finding / acceptance                               | Source / old → corrected result                                                                                                                                                                                                | Finished checks / evidence                                                                                                                                                                                                                                                   | Remaining requirement                                                                                             |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Existing export service-port fixture               | Actual controller awaits the durable producer. Old synchronous double fails; corrected promise-returning double preserves the original expected arguments and succeeds.                                                        | API regression:2 files/16 tests, exit0, `api-regression.log`; unchanged old run:15 pass/1 fail, exit1, `old-api-regression.log`. `scope-and-results-audit.json` confirms the exact two-line change and unchanged case count.                                                 | Real migrated PG/HTTP acceptance remains separate. No production fallback or synchronous async typing was added.  |
| Affected report/export/security regressions        | Same production source as prior277-test checkpoint; the granted fixture is the only test-source change. Original assertions, counts, deadlines and worker limits remain.                                                       | Root affected regression:26 files/277 tests, exit0, `affected-regression.log`, two Vitest workers. Scoped lint including the newly granted API fixture exits0, `scoped-lint.log`.                                                                                            | Repository checks do not prove hosted capacity, real cross-instance locks or idle/recovery processing.            |
| Root types / publication metadata                  | Root typecheck exits2 with68 diagnostics outside task-owned source and0 task-owned diagnostics. Full original history range73ba..010f524 exits1 with307 failed commits, including all four malformed published task ancestors. | `root-typecheck.log`, `history.log`, `scope-and-results-audit.json`; whitespace check exits0, `whitespace.log`. These failures are retained without checker narrowing. Root typecheck covers its existing configured sources, not a new standalone API-fixture type project. | Outside-scope dependencies/types and lawful publication/provenance disposition remain unresolved.                 |
| `capacity_failed_summary_rejected`                 | Current actual gate still rejects the original failed payload with booking24/dispatch74/report14 errors; all112 raw429 remain retained.                                                                                        | `exact-red-payload.log`:expected uncaught exit1. Actual formal gate contract:25/25 decisions, exit0, `contract.json`. Original ZIP SHA256 remains `6e00c860e840ed0fd988a9a639e739b96fba2f4949ed68b3e028a57c4c109236`.                                                        | Key remains OPEN pending independent same-candidate lifecycle; actual server-arrival causality remains unproved.  |
| `capacity_same_candidate_full_900s_valid_baseline` | NOT RUN; no publication/handoff, new candidate CI/merge or hosted900s result.                                                                                                                                                  | Original900s/900booking/4500dispatch/450report/5850 requests and all security/SLO/concurrency/backlog/degradation/SQL requirements remain.                                                                                                                                   | Publication HOLD must receive lawful disposition before Supervisor's original immutable hosted workflow dispatch. |
| Managed runtime report-worker contract             | NOT RUN; source/fixture checks cannot establish effective Cloud Run CPU/billing/minimum instances or actual idle/recovery SLOs.                                                                                                | Original separately recorded runtime contract gap remains, with no cloud or VM product runtime mutation.                                                                                                                                                                     | Original runtime-owner allocation and genuine hosted runtime evidence remain required.                            |

The fixture blocker alone is resolved by this local checkpoint. Publication HOLD
still forbids push, handoff, history rewrite/recovery/transplant/checker bypass
and hosted capacity dispatch. Both acceptance keys remain OPEN. No task is
declared done and no production, provider, financial, schema or hosting authority
was inferred.

### Dedicated report claim connection loss (Codex2 continuation)

Actual source `0a327db0f1395fc658a537b1a23fdd68f8d3db09` creates a dedicated
`pg.Client` in `ReportingFilingRepository.withReportJobClaim` without an error
listener. The installed driver's `_handleErrorEvent` emits a client error when
the socket dies, including between queries while the real report builder awaits
its external data provider. The actual worker regression injects that transport
event after a committed running state: the original source throws an unhandled
EventEmitter error instead of containing the lost claim. Production code was
unchanged for reproduction; only SQL/socket and external provider boundaries
were modeled, with no server or PostgreSQL process.

| Finding / acceptance            | Formal source / original result                                                                                                         | Command / evidence                                                                                                                                                                                                                                                                                               | Remaining                                                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Lost dedicated claim connection | Actual repository, worker and builder at `0a327db0` throw `claim socket lost during builder`; the second pre-start refusal case passes. | `pnpm exec vitest run tests/unit/system-remediation/sr-ops-capacity-20260911/reporting-claim-connection.test.ts --maxWorkers=2`: exit1, 1 pass/1 fail. Canonical `.local/c123-report-worker-20261012/claim-connection-loss/old-0a327-reproduction.log`; exact production/probe hashes and probe copies retained. | Contain the driver event, refuse all writes after lost ownership, close the dedicated session and verify actual worker recovery preserves first start. |
| Both required acceptance keys   | Remain OPEN; this is an additional actual lifecycle defect, not a capacity result.                                                      | No push/handoff, candidate CI/merge or hosted900s execution.                                                                                                                                                                                                                                                     | Immutable publication HOLD and original managed-runtime/PG/SLO evidence remain required.                                                               |

Verified local source `e2e0e25a83f9887f9b5c533ee045cd2539a29431` contains the
driver event and invalidates the claim before a builder or any subsequent
write can continue. A lost claim cannot publish a completed/failed artifact or
audit; the last committed running state remains available for actual recovery,
preserving its first start. The dedicated connection closes on both tested loss
paths. The event listener remains attached for that client's lifetime to contain
late transport errors. Public routes, formats, builders, tenant/actor authority,
rate limits and the original workload requirements are unchanged.

All started checks finished and were read. Exact commands, source/driver/log
hashes and versions are in canonical
`.local/c123-report-worker-20261012/claim-connection-loss/check-manifest.json`,
SHA256 `6e82634455f89491ed29f791ec94accb9ef2941c64bf79c4d5b7318ee2e4a38a`.
Earlier manifests, failed reproductions and source/probe copies remain intact.

| Finding / acceptance                                 | Original → verified local result                                                                                                                                                                | Finished checks / evidence                                                                                                                                                                                                        | Remaining requirement                                                                                                                              |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lost claim connection during builder / before start  | Old actual worker throws on idle socket error. Corrected actual repository contains the event, refuses stale writes and closes the session; the actual worker recovers and retains first start. | `old-0a327-reproduction.log`: exit1, 1 pass/1 fail. `claim-regression.log`: exit0, 4 files/32 tests, including both loss cases and prior durability/recovery/export regressions. SQL/socket/provider boundaries only are modeled. | Genuine PostgreSQL connection loss, cross-instance recovery and runtime SLO evidence are unverified.                                               |
| Affected report/export/idempotency/security behavior | Original assertions, counts, budgets, deadlines and bounded worker behavior retained.                                                                                                           | `affected-regression.log`: exit0, 27 files/279 tests with two workers. `api-regression.log`: exit0, 2 files/16 tests. Expanded scoped lint, formatting and full-range whitespace checks exit0.                                    | Repository regressions are not hosted capacity or PostgreSQL proof.                                                                                |
| Root type / publication history                      | Root typecheck exit2 with68 scope-external diagnostics and0 task-owned diagnostics. Full original history exits1 with307 failed commits, retaining the four malformed published task ancestors. | `root-typecheck.log`, `history.log`; no checker narrowing or failure relabeling.                                                                                                                                                  | Lawful publication/provenance disposition and exact hosted dependency/type/CI validation remain required.                                          |
| `capacity_failed_summary_rejected`                   | Actual formal gate still rejects the immutable original failed payload with24/74/14 errors. All112 raw429 and unresolved actual server-arrival causality remain preserved.                      | `exact-red-payload.log`: uncaught exit1 expected. `contract.json`:25/25 actual exported-gate decisions, exit0, synthetic inputs only.                                                                                             | Key OPEN pending independent exact-candidate lifecycle/evidence. Negative evidence does not establish a positive capacity baseline.                |
| `capacity_same_candidate_full_900s_valid_baseline`   | NOT RUN; no publication/handoff, candidate CI/merge or new hosted900s result.                                                                                                                   | Original900s/900booking/4500dispatch/450report/5850 measured requests, backlog/concurrency/degradation/auth/SLO/SQL requirements remain.                                                                                          | Publication HOLD and original managed-runtime owner evidence must be resolved before Supervisor's authorized original immutable workflow dispatch. |

Current Codex2/Codex and archived Claude/Claude2/Gemini source credit remain.
This is local unpublished WIP, not a review candidate. No push, handoff, history
rewrite/recovery/transplant, checker bypass, hosted dispatch, cloud mutation or
VM product hosting was performed. Both required keys stay OPEN; effective
Cloud Run CPU/billing/minimum instances and real idle/recovery/start/completion
behavior still require their original runtime owner and genuine evidence.

### Exact final source types and remaining delivery blockers

Supervisor's isolated frozen-dependency receipt validates `0a327db0f139`,
before the claim-connection-loss repair. This continuation validates the actual
later local checkpoint `20acb78c81f4dfb00118c66ee029ad94c31efbf7`: its repository
and two claim regression files differ from that earlier source. A separate
read-only Git archive, within canonical `.local/c123-report-worker-20261012/`,
contains all6,360 tracked blobs from that exact SHA. Every blob matches before
and after the checks. No branch/worktree, source adoption or product runtime was
created; the original task worktree and earlier evidence remain intact.

Node22.23.2 / pnpm10.33.0. The archive's own29-workspace dependency installation
uses `pnpm install --frozen-lockfile --offline --ignore-scripts`, exit0. Root
typecheck and API typecheck both finish exit0 with zero TypeScript diagnostics.
The API's actual `prebuild` prerequisites are only the existing contracts and
control-plane-auth TypeScript builds; these also finish exit0 within the archive.
The unchanged tracked lockfile and byte verification are recorded in canonical
`.local/c123-report-worker-20261012/exact-final-types-20acb78/check-manifest.json`,
with exact commands, source/archive/script/log hashes and completion times.

| Finding / acceptance                               | Exact source / finished evidence                                                                                                                                                                                               | Remaining requirement                                                                                                                                                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Final report claim source and root/API types       | `20acb78c`: `root-typecheck.log`, `api-prerequisites.log`, `api-typecheck.log`, all exit0/zero errors; all6,360 tracked blobs unchanged. Earlier shared-cache68-error logs and Supervisor's earlier0a327 receipt are retained. | Exact local types are verified. This supersedes the local dependency/type uncertainty for this source only; independent candidate review and matching mandatory CI remain required.             |
| Existing affected and gate evidence                | `prior-evidence-audit.json` verifies every prior source and log hash against the retained connection-loss manifest:279 affected tests,16 API tests,32 narrow tests and25 gate decisions remain unchanged passing evidence.     | These completed checks were not rerun. SQL/socket/provider boundaries remain modeled; real PostgreSQL connection loss and cross-instance/idle recovery are unverified.                          |
| Immutable publication/provenance HOLD              | Fresh fetch and PR2575 readback: remote/PR head remains `266b2d89f2352a97e015da8b2b3f23c567ed689b`; Commit trailers is FAILURE. Local20ac is19 append-only checkpoints ahead, with no divergence.                              | Supervisor must obtain lawful disposition for the four malformed published ancestors before push/handoff or original hosted dispatch. Append-only source/type success does not cure ancestors.  |
| `capacity_failed_summary_rejected`                 | Original24/74/14-error payload still has the retained uncaught exit1 gate rejection. All112 raw429 and original ZIP/hash are preserved; no new hosted run is claimed.                                                          | Key remains OPEN pending independent exact-candidate lifecycle and required evidence. Actual server-arrival/network429 causality remains unproved.                                              |
| `capacity_same_candidate_full_900s_valid_baseline` | NOT RUN; original900s/900booking/4500dispatch/450report/5850 measured requests, concurrency/backlog/degradation/auth/SLO/SQL requirements remain unchanged.                                                                    | Lawful publication disposition, exact review/CI and Supervisor's original immutable hosted workflow are still required. No synthetic or typecheck result fills this key.                        |
| Managed report-worker runtime                      | Existing `cloudrun-background-source-contract-gap.json` and the actual in-process bounded worker's immediate/recovery timers remain the recorded basis. No effective cloud configuration or idle/recovery proof was read.      | Original runtime owner must provide effective CPU/billing/minimum-instance or managed-trigger authority plus genuine idle/recovery/start/completion SLO evidence; no hosting mutation inferred. |

Only this evidence/documentation checkpoint follows the typed source; production
and test bytes remain unchanged. Current Codex2/Codex and historical
Claude/Claude2/Gemini credit, all source/history reservations and both OPEN keys
are preserved. Publication HOLD forbids push/handoff, history rewrite/recovery,
source transplant, checker bypass and hosted900s dispatch. No cloud mutation,
VM product/PG/browser/Compose hosting, candidate CI/merge or acceptance closure
occurred. The remaining delivery blockers require Supervisor disposition and
original runtime-owner evidence; this checkpoint is not a candidate handoff.

### Original source continuation after the four-message disposition

The explicit user exception was executed and consumed on 2026-10-12. The
canonical preservation packet is
`.local/production-continuation-20261012T2330/`: all29 source trees and non-parent
headers are identical; exactly four commit messages changed. The original
remote `266b2d89` became `47fa3c3520f9720a6d7fd981ac03b35deaadc926`, and the
original local `84a66055` became `4aae55b9399f96829192d476a50410ccc39914c5`.
Fresh fetch confirms local4aae is20 ordinary descendants of remote47fa with
no divergence, and PR2575 still points to47fa. The former publication HOLD
above is superseded solely by this verified disposition. Future commits and
pushes use ordinary history; no further rewrite exception exists. Historical
Claude/Claude2/Gemini credits and current Codex2/Codex roles remain intact.

An additional actual-function reproduction at4aae found that `runPlan` marks
`fullBurstSchedule` true solely from the configured900s duration. One second
of real preparation advances the last measured launch to900800ms, while all
5850 responses retain zero errors and valid latency targets; the producer
still returns `measurements_within_targets`. This fails the original900s
arrival requirement despite preserving nominal schedule/counts.

| Finding / acceptance                              | Source and reproduced result                                                                                                                                                                                     | Command / evidence                                                                                                                                                                                                                                                                                                                                                                     | Remaining                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actual arrivals outside the configured900s window | `ops-proof/capacity.mjs:runPlan`; actual production function, external HTTP/clock boundaries controlled. Expected failed, actual measurements_within_targets at4aae, last launch900800ms, all5850 rows retained. | `pnpm exec vitest run tests/unit/system-remediation/sr-ops-capacity-20260911/capacity-scheduler.test.ts --testNamePattern 'rejects actual arrivals beyond 900s' --maxWorkers=2`, exit1, one actual failing reproduction; twelve unrelated cases skipped by this narrow selector. Canonical `.local/c123-report-worker-20261012/arrival-window-continuation/old-4aae-reproduction.log`. | Compute actual per-family arrival observations and require them in producer/gate; retain ordinary response deadlines and every raw request.                                                                                                                          |
| capacity_failed_summary_rejected                  | Original112HTTP429 payload and its expected rejection remain preserved.                                                                                                                                          | Previous original-artifact checks remain separate.                                                                                                                                                                                                                                                                                                                                     | New exact-candidate independent review/evidence; no acceptance key recorded here.                                                                                                                                                                                    |
| capacity_same_candidate_full_900s_valid_baseline  | OPEN. No new hosted900s result.                                                                                                                                                                                  | NOT RUN on this VM.                                                                                                                                                                                                                                                                                                                                                                    | Original Supervisor-dispatched immutable workflow, actual HTTP/PG/counts/SLO/security/concurrency/backlog/degradation/readback. Managed CPU/billing/scaling/idle recovery and genuine PG connection-loss/recovery remain unverified and block acceptance/production. |

The producer now derives each family's arrival count, first/last launch and
early/late counts from the retained actual request records. Late or early
arrivals make the summary failed and prevent a full-burst claim. The existing
formal gate independently requires complete, finite, in-window measurements
even if a payload asserts a green result. This changes no count, schedule,
quota,30s request deadline or accepted latency/error/SLO requirement. All raw
5850 requests and extra preparation records remain retained.

Narrow verification completed: the two affected test files pass55/55, exit0,
`arrival-regression.log` in the same canonical evidence directory. The actual
1000ms-preparation counterexample now fails with one late booking and five late
dispatches. A legal positive retains5850 in-window arrivals with the last at
899800ms and final response at900050ms; completion after900s remains valid.
Each family's missing/nonfinite/inconsistent/early/late measurements is rejected
by the real gate. These are controlled-boundary regressions, not a hosted
capacity result. Required affected regression,25-case contract, exact source
types/lint/history and fresh candidate review/CI remain pending.

### Exact source verification for the next independent candidate

Tested source is `111b1b7c751a6bef0083ab22597850d5ddf49595`. Node22.23.2,
pnpm10.33.0, Vitest4.1.4. All started repository checks finished and their
results were read. The following documentation-only closeout preserves every
tested production/test byte. Canonical evidence is
`.local/c123-report-worker-20261012/arrival-window-continuation/`:
`guards-manifest.json`, `types-manifest.json`, `exact-regression-manifest.json`,
the retained failed `regression-manifest.json`, and
`types-source-preservation.json` contain exact commands, SHA, timestamps,
exit codes and log hashes. The independent archive's6360 tracked blobs match
the tested commit before and after types; frozen offline installation succeeds
without changing any source. Existing worker dependency links were preserved.

| Finding / acceptance                              | Formal source and before → after                                                                                                                                                                                                                                                                                                                                                                                                                                      | Completed checks / evidence                                                                                                                                                                                                    | Still required                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actual burst arrivals                             | `runPlan` derives `workflows.*.arrivals` from actual raw records. Old4aae + regression subsequently anchored at593d returns green for last launch900800ms. Current rejects that run, retains all5850 rows and reports booking late1/dispatch late5/report late0. `assertAcceptancePassed` also rejects missing, invalid or out-of-window observations regardless of claimed summary result. In-window arrivals with responses ending900050ms remain a valid positive. | Narrow2files55tests exit0; final affected27files284tests exit0. External HTTP/timer boundaries controlled; actual producer/gate invoked. `arrival-regression.log`, `exact-affected-regression.log`.                            | Real hosted arrival/network/HTTP429 observations; these regressions establish no actual capacity or network cause.                                                                                                                                                                              |
| F1–F4 / durable reports / shared export caller    | Correlated actual lawful-resource/readiness/safety/SQL/first-start/queue claim/recovery/acknowledgement checks and raw429/deadline/cadence guards remain intact.                                                                                                                                                                                                                                                                                                      | Same284-test regression; affected API export/controller2files16tests exit0, `exact-api-regression.log`; unchanged operator probe25/25 exit0, `contract-25.log`.                                                                | Independent review; real migrated PG, connection loss, cross-instance and idle/recovery facts. C122's separate HTTP-listener mechanics test was inspected but not run on this VM; hosted CI must cover it.                                                                                      |
| F5 / dependency conditions / publication metadata | Worktree regression initially exits1 because19 suites cannot resolve existing Nest/zod dependency links;92 tests pass, not a completed passing suite. Independent exact archive with frozen offline dependencies then passes284 +16 tests and root/API typechecks. No shared links or source are changed to conceal the failure. Original published history exception is consumed; actual current PR range now passes normally.                                       | `affected-regression.log` exit1 retained; `exact-affected-regression.log`, `exact-api-regression.log`, `root-typecheck.log`, `api-typecheck.log`, scoped lint, full73ba-range whitespace and actual42-commit PR history exit0. | Fresh exact-candidate mandatory CI; prior47fa CI/review results do not transfer. No checker waiver or further history repair.                                                                                                                                                                   |
| F6 / genuine scenario                             | Original500 initial dispatch orders,4000 distinct staged creations,50 genuine persisted initial report jobs and450 measured reports remain in the actual harness. No counts, budgets, duration, safety/degradation or SLOs changed. The stricter actual-arrival guard honestly keeps a run red if host/setup/pacing cannot deliver within900s.                                                                                                                        | Existing actual-function scenario/ownership/SLO positives and refusals are included in284 passing regressions.                                                                                                                 | Full original900s HTTP/AppModule/PG scenario,50 real concurrent intake,50 running/queued reports,500 dispatchable orders and independent SQL; no static/synthetic capacity claim.                                                                                                               |
| capacity_failed_summary_rejected                  | Current exported gate rejects the original digest-verified red payload, retaining booking24/dispatch74/report14 errors and all112 raw429.                                                                                                                                                                                                                                                                                                                             | `exact-red-payload.log`, uncaught exit1 as expected. Original ZIP SHA256 remains `6e00c860e840ed0fd988a9a639e739b96fba2f4949ed68b3e028a57c4c109236`.                                                                           | Key OPEN pending exact-candidate independent lifecycle/evidence.                                                                                                                                                                                                                                |
| capacity_same_candidate_full_900s_valid_baseline  | OPEN; no new hosted capacity run, merge or acceptance closure.                                                                                                                                                                                                                                                                                                                                                                                                        | NOT RUN here.                                                                                                                                                                                                                  | Supervisor must dispatch the original immutable workflow after source review/CI readiness. Effective CPU/billing/scaling/managed idle execution and actual recovery/start/completion SLO evidence must come from the original runtime owner; genuine PG and full900s evidence remain mandatory. |

Fresh origin/dev inspection shows9 newer commits touching other scopes; no
capacity/report/export source overlap requires a merge. No history-helper or
planning-helper source was adopted. This candidate requests source review only;
both required keys and all original parent/operator/restore/native/provider/
legal/manual/H3/F2/ZEROremoved requirements remain outstanding. No VM product,
PG, browser or Compose runtime, cloud/IAM/config/secret mutation, deployment,
fake approval or acceptance closure was performed.

### 2026-10-13 acceptance REOPEN: independent finalization unit

Original owner Codex2 / reviewer Codex; archived Claude/Claude2/Gemini source
credit and history remain intact. This is a checkpoint, not a review candidate.
Latest independent review is candidate `6d986764dc830dbb005caa4b8126d548ada23765`,
generation `b83c24ca0f484d92a8557327435d2b41`, genuine run38326823141 attempt1.
Full findings and raw ZIP identity remain in canonical
`.local/c123-report-worker-20261012/acceptance-6d986764-20261013/run-38326823141/reviewer-codex-20261013T0314/review.md`.
That run has5850 measured requests,375HTTP429 (100/65/210),4000 staged seeds,
26 late arrivals and no final acceptance payload. Original112HTTP429 and
all previous F1–F6/source/role/acceptance records remain retained.

| Finding / acceptance                                        | Formal source / repair                                                                                                                                                                                                                                                                                                       | Old → new verification                                                                                                                                                                                                                           | Evidence / limits                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Red/partial/absent producer or polling bypasses diagnostics | Original harness now invokes `finalizeCapacityRun`: workload joins first, owned readbacks are attempted before validation, all cleanup boundaries run, then the diagnostic payload is written. Returned producer summary survives observer failure; partial JSONL is parsed by independent lines without altering raw bytes. | Old actual callback9-case replay exit1 confirms missing payload and lost errors. New actual callback15-case replay exit0: one full-evidence synthetic positive and14 red/fault routes, including partial/absent records and setup/write failure. | Canonical `.local/c123-report-worker-20261012/finalization-continuation-20261013/old-harness.log`, `actual-harness-finalization.mjs`, `new-harness-positive.log`, `harness-finalization-result.json`; tested production/harness bytes at anchor `d128d1b1719b5c027b30f363e6fb49f3abb9d1fd`. External app/services/HTTP/producer output/SQL transport/files/clock/timers controlled; actual planner/poller/readbacks/SQL/gate/finalizer execute. No listener or PG. |
| First SQL failure suppresses independent readbacks          | Each booking, dispatch and report readback uses its own failure capture; failed SQL/evidence/derived fields stay null, never successful defaults.                                                                                                                                                                            | Injected first booking SQL failure still attempts dispatch and final report SQL and writes failed diagnostics. New actual-function finalizer unit5/5 exit0 covers independent production readback helpers and unchanged formal positive gate.    | `finalizer-unit.log`; no mocked SQL mapping or copied schema. The fixture's first cross-realm ENOENT error is retained in `new-harness-fixture-realm-failure.log`; the corrected fixture creates native VM errors and the rerun passes. This fixture correction is not an old-code reproduction.                                                                                                                                                                   |
| Cleanup masks failures or skips pool shutdown               | App creation/init/listen now belong to captured execution; app and pool cleanup are independent. Every producer/observer/SQL/gate/cleanup/write rejection retains its original error, including falsy thrown values. Saved payloads carry explicit diagnostic failure stages and cannot pass the exported gate.              | All-fault actual callback retains both producer/poller errors, readback error, app.close, pool.end and diagnostic-write failure. App/pool cleanup execute on all15 routes. Core gate/poller regression45/45 exit0.                               | `new-harness-positive.log`, `finalizer-unit.log`, `first-regression.log`. A failed disk write is reported as a failure; it is not claimed to create a payload.                                                                                                                                                                                                                                                                                                     |
| Cumulative launch drift / serial staged readiness           | Still OPEN in the actual producer. Strict uniform inter-arrival pacing plus positive lateness has a finite900s feasibility bound; concurrent scenario must reconcile actual rolling-minute budgets and bounded seed readiness.                                                                                               | Existing full-count10-case source replay shows4 failures; not relabeled as passed.                                                                                                                                                               | Existing independent `timing-boundary-result.json` retained. New timing repair/reconciliation and old/new actual-function regressions remain required.                                                                                                                                                                                                                                                                                                             |
| Original112/current375HTTP429 causality                     | Still OPEN. Reviewed upstream key-isolated storage merge `deb6a6cd22123f15ada5789e384d8b7f6a2b3555` is not yet in the checkpoint ancestry.                                                                                                                                                                                   | No server/key/hit/expiry/reset correlation from these actual archived responses.                                                                                                                                                                 | Normal reviewed upstream integration with Supervisor coordination and restored bounded hosted singleton instrumentation remain required. No product rate/auth/tenant policy change.                                                                                                                                                                                                                                                                                |
| capacity_failed_summary_rejected                            | Negative guard preserved; explicit diagnostic/cleanup failures also reject saved green summaries.                                                                                                                                                                                                                            | Scoped45+5 tests pass; fresh25-case operator contract remains required on the next final source.                                                                                                                                                 | Historical receipt remains at its original SHA; no automatic credit transfer or key closure.                                                                                                                                                                                                                                                                                                                                                                       |
| capacity_same_candidate_full_900s_valid_baseline            | OPEN. Genuine run38326823141 failed; this checkpoint has no real capacity result.                                                                                                                                                                                                                                            | NOT RUN here.                                                                                                                                                                                                                                    | Original immutable Supervisor-authorized hosted workflow, fresh same-SHA review/CI/merge and full900/4500/450 counts,50 actual intake,50 queued/running reports,500 owned dispatchable orders, latency/security/degradation/SQL remain mandatory.                                                                                                                                                                                                                  |

All checks above ended and were read. Root typecheck in this worker exits2
with shared dependency resolution and unrelated existing types failures;
`root-types.log` is retained and is not counted as a passing check. Exact frozen
source verification remains pending. Runtime CPU/billing/scaling/idle/recovery,
real PG loss/cross-instance evidence, full-system/native Android AND iOS,
provider/financial/legal/manual/public-entry/H3F2/HOLD/ZEROremoved gates remain
unchanged and unproved where previously open. No VM runtime, cloud mutation,
deployment, hosted retry, history rewrite or acceptance closure occurred.

### Bounded seed readiness checkpoint (same original task)

`runPlan` now prepares at most8 staged orders within a1600ms lookahead inside
the original run clock. Each real HTTP seed is attempted once; actual
`startedMs`, successful `readyMs` (null on failure), and planned dispatch time
are recorded. Dispatch waits for that order's real readiness and still obeys
all original minimum intervals, rolling budgets and30s request deadlines.
No clock reset, per-minute/count reduction, filtered error or policy change.
Preparation/request evidence failures are joined before returning; initial
500-order setup workers also all settle before diagnostic cleanup on error.

| Finding / acceptance                                    | Source and before → after                                                                                                                                                                                                                                            | Commands / completed results                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Remaining / limitations                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serial seed response stalls all following families      | Actual `capacity.mjs:runPlan/prepareDispatchItem`; old source at `3b6fbce85` is extracted read-only from git, never reset into the active tree. New production checkpoint `5761a8ff2`.                                                                               | Actual full-count10-case producer/clock/HTTP probe: old exit1 with4 red scenarios; new exit1 with2 red uniform scenarios. Concurrent staged200ms seed last dispatch900000ms →899800ms;201ms seed903950ms →899800ms. Each keeps5850 requests/4000 seed records and original rolling budgets/minimum intervals. Old/new raw JSONL and source hashes: canonical `finalization-continuation-20261013/{old,new}-timing/`; logs `old-timing.log`, `new-timing.log`.                         | Controlled HTTP/clock/timer boundaries only; no real network/PG/capacity or429 causal proof. The two uniform refusal scenarios are still OPEN, not relabeled as a passing matrix.                                                                                                                                       |
| Bounded preparation, genuine readiness and seed failure | Actual producer records timestamps; concurrent preparation/buffer bound8. Seed429 keeps the failed seed and refuses that uncreated order's dispatch; slow2001ms readiness keeps late requests/red summary and every raw row.                                         | Actual producer scoped regression23/23 exit0 (18 scheduler +5 finalizer cases), `current-scoped-regression.log`, tested checkpoint `1b59072b9e0b93a90d66cf1bf1ddb0a5a077b6c8`. Raw-count preservation, readiness authority, no retry, bound8, empty active seeds/timers verified. Initial legacy exact899805 expectation failed because the new legitimate final launch is899800; retained in `prefetch-initial-regression.log`, then corrected with the actual boundary regressions. | Real hosted seed throughput/ready authority and full valid baseline still required.                                                                                                                                                                                                                                     |
| Strict uniform timer drift                              | Original strict spacing retained for every family and concurrent dispatch; if every successive dispatch gap overshoots200ms by epsilon,4499 gaps consume the original200ms tail slack when epsilon>200/4499ms. Existing actual0.05/0.1ms callback probes remain red. | New last dispatch900073.8/900344.8ms; no guard changed, no late launch forged back into the window.                                                                                                                                                                                                                                                                                                                                                                                   | Supervisor/reviewer coordination is needed for the remaining explicit accepted profile reconciliation; an unchanged hosted retry is not requested.                                                                                                                                                                      |
| Exact dependency/type/check integrity                   | Shared dependency-link typecheck failure remains recorded. New independent `git archive` of exact checkpoint1b59072b9e0b installs frozen/offline with scripts disabled.                                                                                              | Offline install exit0; C12311files122tests exit0; scoped lint exit0. ROOT strict typecheck exit2 reveals two new test typing issues (seed record union and generic payload inference), not missing packages. Logs `frozen-install.log`, `exact-affected-regression.log`, `exact-lint.log`, `exact-root-types.log`.                                                                                                                                                                    | Fix these actual typing findings and verify the next frozen source before handoff. Do not count this failed typecheck as pass or cast through unknown.                                                                                                                                                                  |
| capacity_failed_summary_rejected                        | Original formal gate and actual owner fixture retained.                                                                                                                                                                                                              | Fresh actual25-case operator contract25/25, exit0 at1b59072b9e0b; `contract-25.json` / `.stderr`.                                                                                                                                                                                                                                                                                                                                                                                     | Negative receipt tied to its source; required lifecycle evidence remains OPEN.                                                                                                                                                                                                                                          |
| capacity_same_candidate_full_900s_valid_baseline        | OPEN. Source-only checkpoints do not establish the positive key.                                                                                                                                                                                                     | No new hosted run.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Remaining strict timing/profile finding, reviewed upstream storage integration with Supervisor conflict coordination, bounded actual singleton/inbound/key/hit/expiry/reset instrumentation, real hosted HTTP/SQL/security/concurrency/backlog/degradation and runtime/PG-loss/cross-instance evidence remain required. |

Checkpoints are ordinary append-only commits/pushes on the original branch.
There is no new candidate/handoff or inherited approval/CI/acceptance credit.
All original112/current375HTTP429 and prior finding/full-system/HOLD/F2/native/
provider/legal/manual/ZEROremoved requirements remain visible and unchanged.

### Exact checkpoint verification and next repair boundary

Tested source: `97114cd55f2ab6eacef6584387dd0ea7493896c9`. Node22.23.2,
pnpm10.33.0, TypeScript5.9.3, Vitest4.1.4. The two strict test typing findings
are repaired with a discriminated request/seed record union and a typed generic
payload; no cast through unknown or assertion weakening. Independent frozen
snapshot `exact-source-97114cd55f2a` matches all6363 tracked git blobs after
installation/checks (`snapshot-and-feasibility.json`). Every started local
check completed and was read. This following documentation-only checkpoint
preserves all tested production/test bytes.

| Finding / acceptance                                            | Exact result / command                                                                                                                                                                                                                                                  | Evidence / remaining                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diagnostic finalization, independent readbacks and full cleanup | Actual harness callback16-case replay exit0, including initial seed rejection with all setup requests joined before app.close. One complete synthetic full-evidence positive;15 red/fault controls preserve errors and failed outcomes.                                 | `harness-97114cd55f2a/actual-harness-finalization.mjs`, `harness-finalization-result.json`, `final-harness.log`. Only external boundaries are controlled; no real API/JWT/PG/load acceptance.                                                                                         |
| Bounded seed readiness and negative guards                      | `pnpm exec vitest run tests/unit/system-remediation/sr-ops-capacity-20260911 --maxWorkers=2`, exit0:11files122tests.                                                                                                                                                    | `final-affected-regression.log`; actual production producer, mapper, SQL helpers, polling/join, gate, finalizer and report-service/repository source tests. No listener/browser/PG infrastructure.                                                                                    |
| Strict types / lint / source integrity                          | Frozen/offline install exit0; `pnpm exec tsc -p tsconfig.json --noEmit --incremental false` exit0; scoped ESLint with max-warnings0 exit0.                                                                                                                              | `final-frozen-install.log`, `final-root-types.log`, `final-lint.log`, `snapshot-and-feasibility.json`. Earlier shared-link and new-test type failures remain retained separately.                                                                                                     |
| Remaining exact producer timing defect                          | Final actual producer12-case replay exits1:8 cases stay within900s; uniform0.05/0.1ms lateness and added uniform/concurrent1ms controls remain red. Both1ms controls end dispatch at904299ms with every count/error/deadline/minimum interval/rolling budget preserved. | `timing-97114cd55f2a/actual-timing-boundary.mjs`, `timing-boundary-result.json`, `final-timing.log`; complete raw requests/seeds retained per case. This is a failed required timing contract, not a passing matrix or capacity receipt.                                              |
| capacity_failed_summary_rejected                                | Actual exported gate/owner-fixture25-case contract exit0,25/25; original112/current375 red payloads and prior negative receipt remain unchanged.                                                                                                                        | `contract-25.json`, current source/tests preserve the checked gate/fixture bytes. No acceptance key is recorded by this checkpoint.                                                                                                                                                   |
| capacity_same_candidate_full_900s_valid_baseline                | OPEN; no new candidate, hosted workflow, merge or positive receipt.                                                                                                                                                                                                     | Remaining source timing/profile reconciliation, bounded actual singleton/inbound/key/hit/expiry/reset observation and normal reviewed upstream storage integration with Supervisor coordination precede a fresh full900s run. All original runtime/full-system gates remain required. |

Next owner unit must resolve the explicit accepted profile's timing strategy
while preserving the strict uniform controls and accepted per-minute budgets,
counts, deadlines, security and all raw failures. The original accepted
burst/concurrency allocation is the authority; there is no authority to silently
remove an existing spacing floor or turn these known-red traces into successes.
Supervisor/reviewer must coordinate this precise remaining boundary and ordinary
upstream integration. Source-only upstream repair/component parity cannot prove
original112/current375HTTP429 causality or a real full baseline. No unchanged
hosted retry or alternative workflow is requested. This checkpoint stays
`in_progress` and is not ready for candidate handoff.

### Actual singleton observation repair (continuation of the same findings)

Starting checkpoint `7eb5fb2f9afb65ff783c3b4e493ae4cd7efb5b20` retains
the original Claude/Claude2 source credit, F1–F6, original112/current375 HTTP429,
all5850 measured/4000 staged rows, full900s, security/SQL/runtime/full-system and
every existing OPEN/HOLD requirement. This unit adds diagnostic observation;
neither required acceptance key has new evidence or credit.

| Finding / acceptance                                              | Actual source and repair boundary                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Verification / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Remaining                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing actual singleton/inbound/key/hit/expiry/reset correlation | Harness resolves `getThrottlerStorageToken()` from its real `AppModule`; `throttle-observation.mjs:observeCapacityThrottle` observes the existing singleton's actual `increment` and entry hit-map mutations. Run-owned middleware links inbound/request/HTTP status; keys/identities are salted hashes, with no JWT or raw actor/tenant/order identity. Exact promises/rejections, arguments, timers and state writes remain owned by production storage. Measured/seed JSONL now carries the actual requestId to join these observations directly. | Initial actual installed6.5.0 storage7/7 exit0; expanded actual production `BootstrapThrottlerGuard`/storage/observer and scheduler29/29 exit0. `observer-initial-unit.log`, `observer-guard-unit.log`, `observer-scoped-unit.log`. Trace bound increased from60000 to100000 after checking10350 setup/measured/staged requests plus expiry callbacks;12000 entry-hook cap retained. Truncation, absent singleton calls/owned traffic, unmatched responses and recording/restoration/write faults stay red. | Actual hosted singleton and full-count HTTP correlation, original112/current375 causal explanation and real full baseline remain OPEN. Controlled probes cannot retroactively establish archived causes. |
| Strict pacing feasibility / upstream integration                  | Existing producer and every spacing/rolling/count/deadline guard unchanged. Fresh `origin/dev=2198f21f982e232abff150387f136224c12950c0` contains reviewed `deb6a6cd`; `git merge-tree --write-tree HEAD origin/dev` exits1 with conflicts in the original runner, harness, scheduler, gate, polling and producer.                                                                                                                                                                                                                                    | Read-only merge preview retained in canonical `.local/c123-report-worker-20261012/finalization-continuation-20261013/upstream-merge-preview.txt`; no worktree merge/reset/rewrite. Supervisor coordination requested through original task `progress`.                                                                                                                                                                                                                                                      | Explicit accepted-profile timing boundary and ordinary reviewed upstream integration require Supervisor/reviewer coordination. No unchanged hosted retry.                                                |
| Checks / both required keys                                       | Initial in-worktree offline install exited1 (`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`); worktree dependencies were shared symlinks, so their targets were preserved and only these isolated worktree links pointed at the prior verified frozen97114 snapshot for scoped checks. Initial mixed-worktree root types exited2 with missing workspace packages and foreign package exports; these failures are retained.                                                                                                                             | `observer-install.log`, `observer-initial-types.log` retained in the same original evidence appendix. Actual29-case scope finished/read; independent complete source snapshot root checks, affected regression and finalization probe still pending. No runtime result inferred.                                                                                                                                                                                                                            | Remaining checks must finish/read before further delivery. Both keys remain OPEN; this is an anchor, not a handoff.                                                                                      |

The checks that were pending in that anchor are now complete. Tested source is
`5ad2975e3ccdfd95b2d06bd8037bd75e0fb0b49a`; the preceding observation checkpoint
was `34fc5a0f5157fbca5b730a8135246813b3841dfe`. The last code change adds the
original monotonic `clockOriginMs` to measured/seed rows and the observer's
metadata, plus its wall-clock start; requestId and unaltered timestamps now
allow direct client/inbound correlation. It does not restart the workload clock.

All following evidence is in canonical
`.local/c123-report-worker-20261012/finalization-continuation-20261013/` (`E`).
Node22.23.2, TypeScript5.9.3, pnpm10.33.0, installed throttler6.5.0 and
Vitest4.1.4 were used. `observer-verification-manifest.json` retains all22
completed check results, including the failed install/mixed-link types,
initial probe fixture assertion, deliberate old-contract failure and still-red
producer matrices. `python3 E/verify-observer.py "$PWD"` exits0 and verifies
all6366 frozen-source blobs, current production/test bytes, old/new actual
harness source hashes, identical probe/input bytes and every timing count,
requestId, clock origin, original observation and raw digest.

| Finding / acceptance                                                            | Actual source and before → after                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Command / finished result / evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Remaining / limits                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actual singleton/inbound/key/hit/expiry/reset diagnostic boundary               | Real harness resolves the same storage token as the global guard. Observer calls the original method with its receiver/arguments, returns its exact promise/rejection, observes original hit-map writes and restores descriptors. Actual production guard tests preserve201/429 decisions, generated-key grouping and headers; expiry/reset, concurrent request correlation, secrecy, truncation, empty/missing responses and hook faults are covered. Original requestIds and monotonic origins are retained in raw rows. | `pnpm exec vitest run tests/unit/system-remediation/sr-ops-capacity-20260911 --maxWorkers=2` from independently installed `E/observer-source-5ad2975e3`: exit0,12files133tests; `observer-final-regression.log`. ROOT `pnpm exec tsc -p tsconfig.json --noEmit --incremental false` exit0 and scoped ESLint `--max-warnings=0` exit0: `observer-final-types.log`, `observer-final-lint.log`. Frozen offline install exit0: `observer-final-install.log`.                                                                                                                      | Clock/timers and guard HTTP context are controlled in unit cases; no listener, PG or real capacity observation. This source checkpoint still has default storage, pending coordinated ordinary upstream integration.                                                                                                       |
| Diagnostic failures must remain red and every independent finalization must run | Identical actual-callback19-case probe on read-only old7eb5 snapshot exits1: the three synthetic full-evidence empty-observer/write/restore controls return no error. Actual new5ad297 source exits0: all three controls are refused; failed/red/partial/absent producer/poll/SQL/write/app/pool cases retain errors and attempt independent final readbacks/cleanup. Original16-case lawful-positive and rejection behaviors remain.                                                                                      | `node --experimental-vm-modules E/observer-{old-harness-7eb5fb2f9,harness-5ad2975e3}/actual-harness-finalization.mjs <actual-source-root> [old-full-SHA]`; `observer-old-harness.log` exit1 → `observer-final-harness.log` exit0,19/19. Per-case outputs and `pre-assert-actual-results.json` retain old/new actual results. Earlier initial probe exit1 was a fixture assertion comparing synthetic positive bytes with archived failed bytes; its log is preserved, and the corrected identical probe still requires unchanged archived bytes for all applicable red cases. | External app/HTTP/producer-output/SQL/files/harness timers are fixtures; the probe's token resolves one actual installed storage, with controlled call/finish boundaries. No app listen socket or real PG/HTTP guard/archived429 causal claim. Synthetic positive controls carry no acceptance credit.                     |
| Strict producer pacing and full-count seed boundaries                           | Remain OPEN. Adding requestId/clock metadata preserves the exact previous actual timing observations:8 complete controls and4 known-red controls; both1ms uniform/concurrent controls still end dispatch904299ms. No spacing/budget/deadline/count or error guard was removed.                                                                                                                                                                                                                                             | `node --experimental-vm-modules E/observer-timing-5ad2975e3/actual-timing-boundary.mjs "$PWD"` exit1; `observer-final-timing.log`, all12 raw/summary files and `timing-boundary-result.json`. Every case keeps5850 requests; every staged case keeps4000 seed rows; no failures are filtered and every original minimum interval/rolling budget remains asserted.                                                                                                                                                                                                             | Supervisor/reviewer must coordinate the precise accepted-profile timing boundary.4499 gaps with200ms strict spacing leave only200ms tail slack; positive per-gap overhead above200/4499ms cannot fit. No unchanged hosted retry is requested.                                                                              |
| Original112/current375 HTTP429 causes and reviewed storage integration          | Still OPEN. Read-only fresh origin/dev contains reviewed `deb6a6cd`; the original lineage's merge preview reports6 conflicts (runner artifact, harness, scheduler, gate, polling and producer). Neither preview nor component parity proves archived server causes.                                                                                                                                                                                                                                                        | `upstream-merge-preview.txt`, exit1; original112/current375/late/SQL/security evidence and upstream review history preserved. No merge, history rewrite, product policy or cloud mutation.                                                                                                                                                                                                                                                                                                                                                                                    | Supervisor-coordinated ordinary integration and genuine hosted same-singleton/inbound/key/hit/expiry/reset observation remain required.                                                                                                                                                                                    |
| capacity_failed_summary_rejected                                                | Formal exported gate and original owner fixture remain unchanged and continue refusing the112-error payload and every missing/invalid/red field.                                                                                                                                                                                                                                                                                                                                                                           | `node /home/lupin/workspace/drts-fleet-platform/.local/continue-full-completion-20261012T0528/operator-gate-contract-replay.mjs .`: exit0,25/25; `observer-final-gate.json` / `.stderr`. Prior negative receipt preserved.                                                                                                                                                                                                                                                                                                                                                    | Required key remains OPEN for matching candidate lifecycle evidence; no historical receipt is transferred to an unreviewed checkpoint.                                                                                                                                                                                     |
| capacity_same_candidate_full_900s_valid_baseline                                | OPEN. Genuine run38326823141 remains failed; this observation checkpoint has no real full-baseline result.                                                                                                                                                                                                                                                                                                                                                                                                                 | NOT RUN. No candidate/handoff, matching CI, new hosted workflow or merge is claimed.52 published-history commits pass `check_commit_trailers.py --base origin/dev --head HEAD` at tested5ad297; `observer-final-history.log`.                                                                                                                                                                                                                                                                                                                                                 | Remaining pacing/profile boundary, coordinated ordinary upstream integration, new same-SHA review/CI/merge and Supervisor-authorized ORIGINAL full900s workflow with all900/4500/450 counts,50 intake/50 report/500 backlog, latency/security/degradation/SQL and all retained runtime/full-system floors remain required. |

All original source credit/history/F1–F6, raw112/current375 errors, original
negative receipt, both required keys and every runtime/PG-loss/cross-instance/
full-system/native Android AND iOS/provider/financial/legal/manual/public-entry/
H3F2/HOLD/F2/ZEROremoved floor remain intact. This work stays `in_progress`,
ordinary pushed anchors only; it is not ready for candidate handoff. DraftPR2601
at tested5ad297 has no reported checks; there is no CI pass inferred from that.

### Ordinary upstream integration boundary (2026-10-13)

Owner checkpoint `6e3852cdfd87d8c8f35dedd22f930adbbf5082c2` and draft
PR2601 head matched before integration, with no active candidate or reported CI
checks. Fresh `origin/dev` was `f9b1dd990762659e8b421d061cb26bcad42d7f27`,
containing the independently reviewed storage delivery
`deb6a6cd22123f15ada5789e384d8b7f6a2b3555`. The actual merge preview had six
conflicts, all within the registered C123 owner scopes: this runner artifact,
the integration harness, capacity scheduler tests, durable readback, polling
observations and the original capacity producer. Every upstream C123 scoped
file still matched frozen `6d986764dc830dbb005caa4b8126d548ada23765` exactly.

The owner therefore resolves those six conflicts with the current owned source,
retaining all32 scoped blobs before this documentation append. The ordinary
merge imports accepted upstream changes; AppModule and key-owned storage bytes
match that exact dev head, without owner edits to shared rate/auth policy.
`before-merge.json` and `merge-preview.log` under
`.local/c123-report-worker-20261012/integration-continuation-20261013/`
record the source/hash and conflict boundary. Post-merge verification remains
pending at this anchor; neither required acceptance key gains evidence.

The four strict timing controls remain red, including both1ms cases ending
dispatch at904299ms. Supervisor/reviewer coordination of the explicit accepted
profile pacing boundary remains necessary: no existing minimum interval,
rolling budget, count, original clock/deadline, raw failure, safety or SQL floor
is waived by this integration. Actual original112/current375 HTTP429 causality
and a fresh same-candidate full900s hosted baseline remain OPEN. No unchanged
hosted retry, VM product runtime, cloud mutation, history rewrite or candidate
handoff occurs. All prior findings/source credit and retained full-system/
runtime/native/provider/legal/manual/H3F2/HOLD/F2/ZEROremoved floors remain.

### Integrated singleton verification and retained pacing failure

Ordinary integration checkpoint `4b21d85635e1b67a14fb97a940538e49decaba45`
resolves the six owned conflicts above and includes reviewed upstream
`deb6a6cd22123f15ada5789e384d8b7f6a2b3555`. No shared limiter policy was
edited. The new source-definition/provider regression exposed an additional
formal harness defect: locked `@nestjs/throttler6.5.0` has **getStorageToken**,
while the harness and its earlier external fixture invented
**getThrottlerStorageToken**. The harness's handwritten assertion hid the
missing export from its earlier typecheck. This is a real package boundary
failure before the workload, not evidence of HTTP429 causation.

Evidence appendix `E` is the existing original task tree:
`.local/c123-report-worker-20261012/integration-continuation-20261013/`.
Frozen tested source is `f579b3808c497928b4974a5c56e4c30126e5e289`;
Node22.23.2, pnpm10.33.0, TypeScript5.9.3, Vitest4.1.4,
throttler6.5.0. All started checks ended and their results were read. The
subsequent `1ce90ff52` changes only the existing artifact upload list.

| Finding / acceptance                             | Actual source and repair                                                                                                                                                                                                                                                                                                           | Old reproduction → repaired result                                                                                                                                                                                                                                                                                                           | Commands / evidence                                                                                                                                                                                                                                                              | Remaining limits                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actual singleton integration                     | Actual AppModule metadata and the dependency's storage provider factory resolve the accepted KeyScopedThrottlerStorage. All original observer/BootstrapThrottlerGuard result, promise/error, expiry/reset, descriptor restoration and diagnostic refusal cases also run against this class, retaining the installed6.5.0 controls. | d0bc7a2e new actual singleton test fails with TypeError; ROOT types exit2 reports TS2339. getStorageToken correction at50ef64648 restores the actual boundary. Final observer23cases and upstream21cases pass as part of166/166.                                                                                                             | `pnpm exec vitest run tests/unit/system-remediation/sr-ops-capacity-20260911 tests/unit/sr-api-throttle-key-isolation-20261013 --maxWorkers=2`, exit0; E/verified-regression.log. Actual source definitions only; no Nest application lifecycle starts.                          | Real hosted inbound/key/hit/expiry/reset correlation remains required; no original112/current375 causal conclusion or inherited upstream acceptance credit.                                                                                                                                               |
| Formal harness package export                    | Original harness now calls actual getStorageToken with installed package types. The19-case external fixture returns the real dependency namespace and resolves actual imported storage; it no longer invents a token export.                                                                                                       | Identical corrected old/new19-case probes: d0bc7a2e58872da3a4fc3c3f7b0ceeefd9215ab3 fails all19 before workload with the missing export (contract exit1). Frozen50ef64648 and finalf579 pass19/19, exit0; the legitimate synthetic full-evidence positive passes and all red/fault cases remain rejected.                                    | `node --experimental-vm-modules E/{corrected-old-real-export-harness,final-harness-f579b3808}/actual-harness-finalization.mjs <frozen-root> <explicit-full-SHA>`; E/corrected-old-harness.log → E/verified-harness.log. Per-case actual results retain errors/readbacks/cleanup. | HTTP/app/JWT/SQL/producer-output boundaries are controlled. This proves harness flow, not actual PG or capacity. Earlier fixture-export evidence remains retained with its stated limit.                                                                                                                  |
| Hosted raw throttle trace retention              | The observer writes `${runTag}.throttle.json`; the existing workflow's artifact list omitted that file. `1ce90ff52` adds `*.throttle.json` beside every original log/report/raw/summary/readback output, under the existing always-upload step.                                                                                    | Source content verification confirms the sole workflow delta is the additional trace glob; Prettier and diff checks pass.                                                                                                                                                                                                                    | E/verification-manifest.json; `.github/workflows/ops-capacity-acceptance.yml`.                                                                                                                                                                                                   | No actual new hosted artifact/upload exists yet; no new workflow or dispatch.                                                                                                                                                                                                                             |
| Source/type/lint/history integrity               | Independent frozen/offline install with scripts disabled; source blobs checked against git after tests and workspace library builds. Source-definition evaluation moved to test setup, retaining the default5s behavioral timeout and all assertions.                                                                              | Final ROOT/API strict types, scoped ESLint, applicable formatting and ordinary history checks pass. Earlier50ef regression default-timeout failure and API missing unbuilt control-plane-auth declarations remain recorded. Building the actual contracts/auth libraries fixes the dependency precondition, without changing product source. | `pnpm exec tsc -p tsconfig.json --noEmit --incremental false`; API equivalent after `pnpm --filter @drts/contracts --filter @drts/control-plane-auth build`; ESLint max-warnings0; E/verified-{types,api-types,lint,history}.log and workspace-build.log.                        | First mislabeled harness/timing probe attempts remain excluded in E/probe-identity-correction.txt; corrected explicit-SHA attempts are retained separately. No acceptance/candidate identity is inferred from an enclosing checkout.                                                                      |
| Remaining strict timing/profile defect           | Actual runPlan/measure/prepareDispatchItem/planner retains original clock, every5850 measured/4000 staged row, errors, minimum intervals, rolling budgets and deadline floors.                                                                                                                                                     | Final12-case actual producer replay still exits1 with4 timing failures: uniform0.05/0.1ms ends dispatch900073.8/900344.8ms; uniform/concurrent1ms both end904299ms. Eight other controls pass. These failures remain failures.                                                                                                               | `node --experimental-vm-modules E/verified-timing-f579b3808/actual-timing-boundary.mjs <frozen-root> <explicit-full-SHA>`; E/corrected-verified-timing.log and complete per-case raw/summary files.                                                                              | At200ms strict spacing,4499 gaps have200ms total tail slack: sustained gap overshoot above200/4499ms cannot fit the original window. Supervisor/reviewer must reconcile the explicit accepted profile boundary; no existing floor is silently removed, trace forged, or unchanged hosted retry requested. |
| capacity_failed_summary_rejected                 | Actual exported gate and original complete positive/missing/invalid/red counterexamples retained.                                                                                                                                                                                                                                  | Fresh25-case contract passes25/25, exit0;19-case actual harness retains failed/partial/absent/SQL/write/restoration/cleanup refusals.                                                                                                                                                                                                        | E/verified-gate.log, verified-harness.log.                                                                                                                                                                                                                                       | Required key remains OPEN for the subsequent same-candidate lifecycle; no historical receipt is transferred.                                                                                                                                                                                              |
| capacity_same_candidate_full_900s_valid_baseline | OPEN. Source-only integration and singleton repairs do not establish a full baseline.                                                                                                                                                                                                                                              | No new candidate, review approval, matching CI, merge/acceptance receipt or hosted900s run.                                                                                                                                                                                                                                                  | E/verification-manifest.json; original immutable failed artifacts remain intact.                                                                                                                                                                                                 | Source pacing/profile coordination, actual429 causal observation, new exact review/CI/merge and Supervisor-authorized original900s HTTP/AppModule/migratedPG workflow remain required.                                                                                                                    |

All prior F1–F6, Claude/Claude2/Gemini source credit and published history,
original112/current375 raw failures, full900s/900booking/4500dispatch/450report,
50intake/50reports/500dispatchable, latency/degradation/security/SQL and both
required keys remain. All runtime CPU/billing/scaling/idle/recovery/PG-loss/
cross-instance and full-system/native Android AND iOS/provider/financial/legal/
manual/public-entry/H3F2/HOLD/F2/ZEROremoved floors retain their prior state.
This is an ordinary source checkpoint, stays `in_progress`, and is not ready
for candidate handoff. No product VM runtime, cloud mutation, history rewrite,
alternate acceptance route or unchanged hosted retry occurs.

### Absolute admission and measured timer wake repair (2026-10-13)

The durable Supervisor clarification in the original task specification records
its04:27 decision:900seconds is the measured arrival/admission window, with
real readiness before measured t0 and bounded response/report completion after
it under the original deadlines. This supersedes the pending proposal above;
at that checkpoint no additional dispatch-burst profile or spacing waiver was adopted. The original
uniform/concurrent schedules, hard floors and rolling budgets are retained.

This owner unit uses independent family admission lanes with one measured t0,
the existing shared measured-request in-flight bound and eight-slot real seed
preparation. A slow dispatch seed cannot serialize intake/report admission.
Each lane first waits for its absolute due time and then verifies its actual
spacing and rolling budget. Subsequent floor waits use the preceding actual
timer wake latency to wake ahead and re-check the boundary. The positive1us
sleep bias prevents arithmetic rounding down; it is an additional wait, never
an early-launch tolerance. Every wake re-checks actual time differences without
a spacing/budget tolerance, retains a minimum1ms sleep, and never busy-spins.

At/after900seconds, measured HTTP admission is refused. Its planned outcome is
still written with actual `attemptedMs`, null `launchedMs`/`finishedMs` and an
explicit error. Already admitted requests drain under the unchanged30second
HTTP deadline. All outcomes remain in the denominator. The actual harness
accepts these explicit unsent diagnostic rows, independently reads all successful
owned resources and still rejects the missing/error arrivals at the formal gate.
The run-owned initial50-report readiness has a separate real
`preparationStartedAt`; only initial job/snapshot evidence uses that bound.
All450 measured report creations retain the actual measured t0, and every
initial/measured job retains its genuine first-start/completion/5min/30min SLO,
marker, ownership and independent SQL requirements.

Evidence appendix `E` extends the original task tree:
`.local/c123-report-worker-20261012/absolute-start-continuation-20261013/`.
Published pre-change head was `425f2c24d289c48889dbdbaf0b1bee10f3a70674`.
Final code checkpoint is `b02e58da384440266d936731bee586a92c5f612d`;
the subsequent frozen source identity is retained in `E/final-source-sha.txt`
and its `final-*.log` files. The following continuation adds serialized final
verification/publication records. All intermediate
failures remain retained, including the incomplete harness input-identity copy,
canonical dependency-link typecheck failure, feasible0/2ms fixture initially
mislabeled as a refusal case, and strict fractional timing failures before wake
feedback. None is counted as a passing check.

| Finding / acceptance                             | Actual source and repair                                                                                                                                                   | Old reproduction → repaired result                                                                                                                                                                                                                                                                                | Commands / evidence                                                                                                                                                                           | Remaining limits                                                                                                                                                                                |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accumulated timer lateness / true seed readiness | Actual `runPlan`, `measure`, `prepareDispatchItem` and existing planner; absolute admission, independent lanes, measured wake feedback and exact actual difference checks. | Byte-identical original12-case probe:425f exits1 with4 red; b02e exits0,12/12. Uniform0.05/0.1ms end899805.596/899805.693ms; both1ms cases end899801ms instead of904299ms. All5850 measured/4000 staged rows, actual floors/budgets, latencies, raw results and cleared deadlines retained.                       | `node --experimental-vm-modules E/{old-timing,feedback-timing}/actual-timing-boundary.mjs <frozen-root> <explicit-full-SHA>`; original raw/summary files and hashes.                          | HTTP/clock/timer boundaries are controlled; this is actual producer regression, not real capacity or archived429 causality. Unachievable variable jitter must still refuse admission.           |
| Late admission / bounded drain                   | Producer writes every unsent outcome honestly; actual harness preserves it for final diagnostics. Existing response deadline and all admitted outcomes remain.             | Actual synchronous boundary-stall regression retains5850 outcomes, refuses five late dispatches, sends5845, drains every sent request and returns failed. Original response-after900s positive, all raw429, overload, slow/failed seed, early-wake and0/250ms variable-lateness refusals remain passing controls. | Owned scheduler21/21; `E/feedback-scheduler.log`. Complete affected checks and strict raw verification are recorded in the final manifest.                                                    | A refusal is not a successful measured request or positive baseline credit. No counts/error/late records are removed.                                                                           |
| Real report readiness before measured t0         | `assertReportWorkload` uses the separately recorded preparation origin only for initial50 jobs/snapshot; measured450 retain t0.                                            | Actual formal-gate positive and five invalid-origin/initial-before-readiness/snapshot-before-readiness/measured-before-t0 refusals pass. Initial50 and measured450 SQL/worker requirements remain.                                                                                                                | Frozen95b56 source affected suite175/175, ROOT/API strict types and scoped lint exit0; original25-case gate replay remains25/25. Final exact-source checks in `E/verification-manifest.json`. | Real PostgreSQL/worker lifecycle verification still requires the original authorized hosted workflow. Setup jobs never enter the5850 measured denominator.                                      |
| Failed/partial diagnostics and cleanup           | Existing actual finalizer, independent owned SQL reads, observer restoration, app/pool cleanup, throttle trace retention and all prior guards retained.                    | Actual19-case harness preserves red/partial/absent/SQL/write/restoration/cleanup faults and legal synthetic positive; corrected complete input fixture rerun exits0.                                                                                                                                              | `E/verified-harness-95b56.log` and final exact-source replay. Earlier missing `input-identity.json` attempt remains excluded.                                                                 | External app/HTTP/producer-output/SQL boundaries controlled; no application/server/database runs on this VM.                                                                                    |
| capacity_failed_summary_rejected                 | Formal original gate continues rejecting the exact24/74/14 error payload and every missing/invalid/red field.                                                              | Actual25/25 contract decisions and original hosted negative receipt remain preserved; no receipt is transferred to this new source.                                                                                                                                                                               | Original task evidence plus final manifest gate command/log/hash.                                                                                                                             | OPEN until matching new-candidate lifecycle evidence is recorded.                                                                                                                               |
| capacity_same_candidate_full_900s_valid_baseline | OPEN. Source timing controls now pass; actual112/current375429 causality and complete new same-candidate hosted baseline remain unverified.                                | No new real full900s capacity result or acceptance receipt is claimed by these controlled regressions.                                                                                                                                                                                                            | Exact final review/CI/merge and Supervisor-authorized ORIGINAL `ops-capacity-acceptance.yml` remain required.                                                                                 | Preserve actual singleton inbound/key/hit/expiry/reset correlation; full900/4500/450, real50intake/50reports/500owned backlog, all latency/error/security/degradation/SQL/cleanup requirements. |

Original Claude/Claude2/Gemini credit, published source history, F1–F6, original
112/current375 raw errors and all original source/acceptance floors remain.
All runtime CPU/billing/scaling/idle/recovery/PG-loss/cross-instance and
full-system/native Android AND iOS/provider/financial/legal/manual/public-entry/
H3F2/HOLD/F2/ZEROremoved requirements retain their prior state. This source
checkpoint adds no policy/profile waiver, provider/cloud/production operation,
VM runtime, history rewrite, alternative workflow or unchanged hosted retry.

### Explicit budgeted dispatch burst and independent arrival readback (2026-10-13)

Supervisor's subsequent05:34 decision in the original task specification permits
evaluation of the explicitly named `budgeted_dispatch_burst` profile within the
existing accepted burst/concurrency scenario. Its immutable qualification and
decision remain at
`.local/shared-dev-release-resumption-20261013-root/c123-supported-additional-burst-decision.json`
and the adjacent qualification/proposal files. This extends the prior arrival
clarification; it does not waive either legacy profile's intervals or adopt a
product throttle/auth change. Independent original Codex review is still required.

The additional full900s profile declares299 dispatch arrivals at each minute's
start and one at minute+59800ms. Repeated offsets satisfy the unchanged nominal
rolling300/min budget, with a genuinely scheduled last dispatch at899800ms.
Actual dispatch waits for real seed readiness and the existing rolling budget;
the original eight-slot preparation, maxInFlight refusal,30s HTTP deadline and
900s admission cutoff remain. Intake and report use the existing concurrent
schedule. The legacy uniform1000/200/2000ms intervals and concurrent200ms
dispatch interval remain separately declared and enforced. The new profile is
typed, validated against its own canonical schedule, and restricted to the
original full900s counts. It cannot be labeled a uniform interval pass.

`readBackBudgetedDispatchArrivals` independently checks the raw5850 measured
request rows: exact family/sequence/profile/scheduled time, actual launch time,
all errors, every rolling60000ms budget and the genuine final dispatch admission.
The harness attempts that readback before independently collecting all owned
SQL diagnostics; a refusal does not suppress later readbacks or cleanup. The
formal gate requires its final dispatch timestamp to match the actual summary,
remain within900s and reach899800ms. A later lawful intake arrival does not
change that dispatch observation, and response drain elapsed time cannot replace
it. All original count/latency/report/backlog/degradation/security/SQL gates remain.

Evidence appendix `E` is
`.local/c123-report-worker-20261012/budgeted-burst-continuation-20261013/`.
Pre-extension source is `93103c708c9575ad895ba4a3d993688fda9d33cf`;
verified code checkpoint is `1b4bab18934a2fa76bf8dc33d73a384db61ad901`.
The first full snapshot at4eabb5d1298810d11aea2119aabc57b9c260d087 is recorded
in `E/final-checks/verification-manifest.json`. It was never handed off: the
seed-readback correction below requires a new final candidate. Final publication
and CI records remain `E/publication.json` and `E/ci-result.json`; the subsequent
appendix records the final same-source checks. Earlier
results, raw controls and failures are retained separately, including the
missing-dependency worktree typecheck, no-TTY install abort, inherited formatting
warning and evidence-verifier quoted-Unicode path error. The formatting-only
change to the existing report-completion fixture preserves its behavior; the
verifier now reads NUL-delimited git paths. None of those failed attempts earns
acceptance credit.

| Finding / acceptance                             | Source / repair                                                                                                                      | Observed result                                                                                                                                                                                                                                                                       | Commands / evidence                                                                                                                                                               | Remaining limits                                                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explicit profile and legacy controls             | Actual planner/type declaration, `validatePlan`, `runPlan`, `minimumSpacingMs`; original rolling windows and refusal paths retained. | Checkpoint1b4 affected regression184/184, ROOT/API strict types and scoped lint exit0. Actual full-count15-case timing probe exits0; original12 legacy cases remain, with three separately labeled burst cases. Old425f four failures and every intermediate failure remain archived. | `E/verified-{regression,root-types,api-types,lint,timing}.json` records exact commands/exits/SHA/hashes; final same-source checks in `E/final-checks/verification-manifest.json`. | Pure HTTP/clock/timer boundaries controlled; successful timing is not actual capacity or archived429 causality.                                                                              |
| Variable timing and real seed boundary           | Actual `measure`, `prepareDispatchItem`, eight-slot preparation and new burst admission.                                             | Full5850/4000 regressions pass at0/2ms variable timer lateness and5/201ms seed responses; all actual rolling budgets independently checked. Raw429, seed failure, overload and250ms infeasible lateness remain rejected with every outcome retained.                                  | Scheduler suite and actual15-case producer probe; raw/summary paths and hashes in `E/verified-timing/timing-boundary-result.json` and final check logs.                           | Modeled response/seed timing; actual hosted HTTP/PG readiness, resource contention,50intake/50reports/500backlog and SLOs remain required.                                                   |
| Independent final admission                      | Actual raw-arrival readback, harness diagnostic attempt and formal gate.                                                             | Complete legal burst plus lawful later intake accepted; missing rows, wrong profile, compressed actual rolling boundary and missing/invalid/mismatched/late final arrival rejected. Response drain cannot fill the899800ms floor.                                                     | Actual planner/scheduler/gate tests; original25-case contract still25/25, exit0.                                                                                                  | Synthetic positive proves gate behavior only. Every real raw request/seed, summary and direct-SQL readback must belong to the final candidate.                                               |
| Final SQL, observer and cleanup retention        | Original diagnostic finalizer and actual harness callback retain all prior repairs.                                                  | Updated complete external input fixture: actual19-case harness exits0, preserving failed/partial/absent producer/poll/readback/write/restoration/app/pool faults and legal synthetic positive.                                                                                        | `E/verified-harness.json`, per-case actual SQL query/diagnostic logs and final exact-source replay.                                                                               | App/JWT/HTTP/SQL/producer-output boundaries controlled; no product server or database runs on this VM.                                                                                       |
| Original112/current375 HTTP429                   | Immutable failed archives and integrated actual key-scoped singleton plus bounded restored inbound/key/hit/expiry/reset observation. | Source instrumentation and raw throttle retention remain. No new real server causal result is asserted.                                                                                                                                                                               | Original run38208300314/artifact11729270836 and failed run38326823141; all earlier observer/upstream evidence preserved.                                                          | Supervisor-authorized ORIGINAL changed-source same-candidate hosted workflow must establish actual correlation. No unchanged retry or policy relaxation.                                     |
| capacity_failed_summary_rejected                 | Actual exported gate, exact24/74/14 payload and all original missing/invalid/red cases.                                              | Fresh25/25 control decisions exit0; negative source guard retained. Historical receipt remains separate.                                                                                                                                                                              | `E/verified-gate.json` and final gate log/manifest, original immutable negative evidence.                                                                                         | OPEN for matching new-candidate lifecycle evidence; no receipt transfer.                                                                                                                     |
| capacity_same_candidate_full_900s_valid_baseline | ORIGINAL full900s HTTP/AppModule/migratedPG route and all original requirements.                                                     | OPEN. No new real capacity result, independent approval, matching merge or positive acceptance receipt is supplied by these source checks.                                                                                                                                            | Final candidate/publication/CI records plus subsequent Supervisor-authorized original workflow evidence.                                                                          | Exact independent review/CI/merge followed by genuine same-candidate full900s baseline and complete actual SQL/security/concurrency/report/degradation/cleanup measurements remain required. |

All original Claude/Claude2/Gemini source credit, published history, F1–F6,
112/current375 raw errors, full900/4500/450 measured requests and4000 separate
staged creations remain. Runtime CPU/billing/scaling/idle/recovery/PG-loss/
cross-instance and full-system/native Android AND iOS/provider/financial/legal/
manual/public-entry/H3F2/HOLD/F2/ZEROremoved requirements retain their prior
state. Source handoff is not completion or a capacity receipt. No new workflow,
VM runtime, cloud/provider/production mutation, unchanged retry, history rewrite,
error filtering or silent legacy interval waiver occurs.

### Seed evidence completeness correction before handoff (2026-10-13)

The final raw-evidence audit found that the additional profile's first arrival
checker accepted5850 genuine measured rows after all4000 actual seed rows were
removed. No candidate handoff or acceptance receipt had occurred. The exact
old4eabb5d1298810d11aea2119aabc57b9c260d087 function reproduction and seven-case
old/new probe are retained in
`E/seed-readback-continuation/{old-reproduction.json,old-contract.log,new-contract.log}`.
The old contract exits1 with six seed-observation escapes; new
43b2a69d596e8ec64d5fa189686772876ea6aee4 exits0, seven decisions correct.
These are actual exported-function calls with unchanged actual controlled
producer output, not an HTTP/PG/capacity claim.

The same readback now requires4000 seed observations and correlates each
sequence501–4500 to its measured dispatch: distinct sequence, successful seed,
actual finite start/readiness, readiness preceding launch, matching scheduled
dispatch time and actual created resource ID/path. The gate additionally
requires exactly4000 independently observed staged creations. Missing,
duplicate, unready, inverted/late readiness and foreign-order evidence remain
rejections. Later lawful intake remains accepted with every original arrival
and rolling-budget rule intact. No failed/raw row is filtered or retried.

The actual harness's external positive input now contains its complete modeled
4000 seed observations; the preceding incomplete input remains archived and
does not establish this stronger guard. Five additional actual-callback controls
prove that seed refusal still attempts both order readbacks, report readback,
diagnostic write, observer restoration and app/pool cleanup. Source logic is
unmocked; app/HTTP/SQL/producer-output/clock/timer boundaries remain controlled.

| Finding / acceptance                                            | Actual source / repair                                                                                                                          | Old → new observed result                                                                                                                                                                                                     | Commands / evidence                                                                                                                                                 | Remaining limits                                                                                                                                                   |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Missing/corrupt staged evidence could pass new arrival readback | Actual `readBackBudgetedDispatchArrivals` and formal `stagedCreations` guard.                                                                   | Old4e seven-case contract exits1 (six escapes);43b seven/seven exits0. Real full-count control retains5850 requests/4000 seeds. Actual scheduler/gate76/76 narrow regressions and original25-case gate pass, exit0.           | `node E/seed-readback-continuation/actual-seed-readback.mjs <source-root> <explicit-full-SHA>`; old/new logs and per-version JSON/hashes, first-unit.log, gate.log. | Controlled producer HTTP/clock/timers; no seed, SQL or capacity receipt is invented.                                                                               |
| Refusal must not suppress final owned diagnostics               | Actual original harness/finalizer, with complete positive external input and five corrupt-seed controls.                                        | Actual43b harness24/24 exits0: legal synthetic positive, five seed refusals and all original18 failed-workload/cleanup controls. Every seed refusal retains2 final-order/1 final-report reads and failed diagnostics/cleanup. | `E/seed-readback-continuation/harness.log`, verified-harness/harness-finalization-result.json and per-case query/diagnostic output.                                 | Real original same-candidate HTTP/AppModule/migratedPG and every ownership/security/SLO observation still required.                                                |
| capacity_failed_summary_rejected                                | Actual exported formal gate retains exact24/74/14 and original missing/invalid/red cases.                                                       | 25/25 exits0; historical negative receipts remain separate.                                                                                                                                                                   | Original immutable evidence and subsequent final exact-source gate log/manifest.                                                                                    | OPEN for matching new-candidate lifecycle; no old receipt transfer.                                                                                                |
| capacity_same_candidate_full_900s_valid_baseline                | Original900s/5850/4000, real50intake/50reports/500backlog, all latency/error/report/degradation/security/SQL/readiness/cleanup floors retained. | OPEN; no new real hosted capacity result or acceptance receipt.                                                                                                                                                               | Final exact source checks in `E/seed-readback-continuation/final-checks/verification-manifest.json`; final publication/CI records in E.                             | Original Codex review/CI/merge then Supervisor-authorized ORIGINAL changed-source same-candidate full900s workflow, including actual112/current375429 correlation. |

All earlier successful, failed, canceled and skipped checks remain separately
recorded. Source revisions and PR-ready events cancel obsolete generic CI; a
cancellation is never a pass. The final SHA must have its own finished/read
checks before handoff. All original source credit/history/F1–F6, legacy floors,
native-both/runtime/provider/financial/legal/manual/H3F2/HOLD/F2/ZEROremoved and
both required acceptance keys retain their prior state. No product VM runtime,
policy/cloud/provider mutation, source/history rewrite, alternative workflow,
unchanged hosted capacity retry or acceptance waiver is introduced.

### Genuine guard admission feedback after d73 acceptance REOPEN (Codex2, 2026-10-13)

Codex independently reopened candidate
`d73ec2fd4f64177f7d232745e9834881180cac9a`, generation
`457a888c0e2043339da6aeb988c73b6e`. Original authorized run38362439099,
job115179579487, artifact11796112777 finished FAILURE. The immutable ZIP
SHA256 is `4cbefd83940fe806487c94ec07abc0c541e9475ee58c0d8366cf46af8bc1c3a0`.
All1647 HTTP429 correlate to the actual owned request, generated key and
blocked singleton result: booking246, dispatch1227, report174. Client rolling
peaks60/300/30 concealed guard peaks89/461/47. Booking61 had a client gap
60000.729901ms but guard gap59963.889454ms, with60 unexpired hits before its
increment. Report31 and dispatch308 show the same actual accounting boundary.
This establishes this run's failure, not historical112/prior375 causality.
The original negative gate, final SQL654/3273/276 and complete observer trace
remain valid red-run evidence; they do not establish positive capacity.

The next repair uses the existing hosted singleton observer as producer
feedback. `runPlan.runFamily` reserves each unsent measured request against
the unchanged60/300/30 budget. Until the genuine guard sees the request, its
reservation remains occupied. The observer binds the family to the actual
generated key and identity, checks actual counter state plus rolling guard
times, and releases occupied hits only through the original storage's expiry
callbacks. The producer wakes on real guard/hit mutations or the original
rolling/deadline boundary; it adds no guessed ingress buffer. Changed keys,
identities or policies, blocked/missing state and successful HTTP without
matching guard results fail closed. HTTP/transport errors remain unchanged.
An actual guard arrival outside the original admission window is also red,
even when its client launch was timely. All raw rows retain client times and
the separately observed absolute native increment start and counted-return
times, key hash and original result. Prior rolling admission uses the genuine
synchronous counted-return upper bound, including variable observation work
before increment; it cannot mistake the observer wrapper's earlier entry for
the actual guard count. The900s boundary also checks that counted return.

No shared storage, guard, rate policy, identity, seed policy or HTTP response
is changed. The existing preparation, both legacy profiles and floors,
additional burst profile, client rolling budgets, maxInFlight, eight-slot
seed readiness and every deadline remain. Seeds are never admission retries.
The original harness now supplies the observer's actual admission interface
to the original producer. SQL/finalizer/security/report behavior remains.

Evidence directory `G` is the canonical machine-specific
`.local/c123-guard-admission-20261013/`. Checkpoints21e09e437 andfb741c692 were
ordinary pushes on the original branch, not review candidates. The complete
d73 minimal-source snapshot is retained under `G/old-d73-source/`; its
production files are extracted directly from that immutable commit, with
the same regression test added externally. No active checkout was reset.

| Finding / acceptance                                                        | Actual source / repair                                                                                               | Old → new observed result                                                                                                                                                                                                                                              | Commands / evidence                                                                                                                                                                    | Remaining limits                                                                                                                                                                 |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client launch budget concealed compressed guard arrivals and delayed expiry | Actual `runPlan/measure`, observer admission reservations and genuine `KeyScopedThrottlerStorage.increment/countHit` | Old d73: each61s legacy case has7 actual429; full controlled burst has2421 (111/2100/210). New event-wake checkpoint: both legacy cases and5850/4000 positive pass with zero429; genuine final dispatch client launch899912ms.                                         | `guard-admission.test.ts`; `G/old-d73-{regression,snapshot-regression}.log`, `old-d73-raw/` and `new-event-wake/` raw/summary/actual singleton traces.                                 | Only external transport, clock and timer scheduling are controlled. Actual countHit/increment/expiry bodies and producer logic are unmocked. This is no hosted capacity receipt. |
| Missing feedback, raw errors, key change and impossible timing              | Same original producer and observer; exact request/key correlation                                                   | Missing genuine guard observation is red.2000ms delayed expiry preserves every5850 request and4000 seed outcome, with unsent requests recorded and no guard bypass. Raw429/deadline, key rotation and actual guard arrival after the window have explicit regressions. | `G/verified-serial/` and final check manifest/logs; old/new regression sources and complete raw artifacts retained.                                                                    | Repository checks only; original real HTTP/report/phase SLO,50intake/50reports/500backlog, SQL, security, degradation and cleanup still require hosted measurement.              |
| Original failed-summary guard and diagnostic retention                      | Unchanged formal gate, original raw-arrival readback and finalizer                                                   | Original25-case actual exported gate replay exits0. Old d73 red payload/negative receipt remains historical after reopen.                                                                                                                                              | `node /home/lupin/workspace/drts-fleet-platform/.local/continue-full-completion-20261012T0528/operator-gate-contract-replay.mjs .`; `G/gate25.log`; final exact-source harness replay. | Synthetic positive/negative controls prove gate behavior, not capacity.                                                                                                          |
| capacity_failed_summary_rejected                                            | Original same-candidate lifecycle and formal negative gate                                                           | OPEN for the new generation. No old acceptance receipt is transferred.                                                                                                                                                                                                 | Final candidate/publication/CI and subsequent original authorized acceptance evidence.                                                                                                 | Independent matching review/CI/merge and fresh negative evidence still required.                                                                                                 |
| capacity_same_candidate_full_900s_valid_baseline                            | Original full900s HTTP/AppModule/migratedPG workflow with actual singleton feedback and trace                        | OPEN. The unit positive is not real capacity.                                                                                                                                                                                                                          | Final exact candidate, then Supervisor-authorized ORIGINAL changed-source full900s run.                                                                                                | All900/4500/450 measured plus4000 separate seeds, actual guard admission,50intake/50reports/500owned backlog and every original SLO/security/SQL/cleanup observation must pass.  |

All intermediate failures remain separate: initial5s test timeout, the first
over-conservative wait calculation, the polling-version fake-clock timeout,
inherited missing nodemailer, root implicit callback parameter types and API
missing built workspace declarations. The first broad parallel regression
timed out three existing5s fake-clock cases and caused a subsequent fixture
counter failure; it is not recorded as pass. Dependencies were installed in
this isolated worktree with frozen lockfile/ignored scripts, then required
workspace declarations built. The inherited dependency symlink targets were
recorded before detaching only those worktree links. The final sequential
repository test command uses a30s **test-runner wall timeout**, without changing
the original900s admission,30s HTTP or report/phase deadlines.

Original Claude/Claude2/Gemini credit, every published source/history and F1–F6,
112/prior375 and this actual1647 red run remain preserved. Runtime CPU/billing/
scaling/idle/recovery/PG-loss/cross-instance, native Android AND iOS, provider/
financial/legal/manual/public-entry/H3F2/HOLD/F2/ZEROremoved and all full-system
gates keep their previous state. No VM product server, Docker, browser, cloud,
provider, production deployment, history rewrite, limiter reset/bypass,
count/error filtering, policy increase or unchanged hosted retry is performed.
