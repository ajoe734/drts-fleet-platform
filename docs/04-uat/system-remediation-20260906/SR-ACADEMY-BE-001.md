# SR-ACADEMY-BE-001 — 課程、測驗、完訓與重訓資料服務

Owner: Claude. Reviewer: Claude2. Date: 2026-09-10 UTC.

## State and provenance

- Reassignment: availability-first reassignment picked this task up from
  `codex2/sr-academy-be-001` (blocked checkpoint, see below) after the
  identity/persistence contract blocker was independently resolved and merged
  by `SR-ACADEMY-BE-001-IDENTITY-CONTRACT`
  (`f36e788cf46038ca2e58c0d211bb99444c7a3cb4`, PR #1888).
- Worktree: `.artifacts/worktrees/auto/claude-sr-academy-be-001`, branch
  `claude/sr-academy-be-001`.
- Base SHA (fresh `origin/dev` at start of this work): `f36e788cf46038ca2e58c0d211bb99444c7a3cb4`.
- Candidate SHA: recorded at handoff time via
  `git rev-parse HEAD` (see the `ai-status.sh handoff` call for this task).
- Reused, unmodified: `academy-domain.ts` pure functions ported verbatim from
  the prior checkpoint `d09cefae69816396c799c8e62fe78c0193e14e52`
  (`codex2/sr-academy-be-001`, PR #1877, "Partial checkpoint" — grading,
  training-record projection, fleet aggregation). That checkpoint's domain
  code required no changes for the identity-contract fix: it was already
  driver-id-type-agnostic (`driverId: string`).
- Dependencies confirmed `done` and merged into this branch's base:
  `SR-CONTRACT-001` (`e6415ede5aebc2fb280cf8f2871ee55e460a4b6e`),
  `UV-EXEC-006`, `UV-EXEC-023`, and
  `SR-ACADEMY-BE-001-IDENTITY-CONTRACT` (`f36e788cf46038ca2e58c0d211bb99444c7a3cb4`).

## Identity model used

Per `docs/04-uat/system-remediation-20260906/academy-identity-decision.md`:
the runtime driver identity is the **text id** (`drv_<uuid>`, `varchar(100)`)
minted by `regulatory-registry.service.ts` and persisted to
`reg.phase1_registry_drivers.driver_id`. No prefix stripping, uuid casting, or
synthetic `reg.drivers` row creation. All new academy tables and the two
corrected shared regulatory tables (`reg.driver_training_records`,
`reg.driver_reg_profiles`) key `driver_id` as `varchar(100)`, no FK.

## What was implemented this session

### Migration — `infra/migrations/V0095__sr_driver_academy.sql`

- Creates the four SR-ACADEMY-BE-001 primary tables from
  `schema-allocation.json`: `reg.phase1_driver_academy_courses`,
  `reg.phase1_driver_academy_modules`, `reg.phase1_driver_quiz_questions`,
  `reg.phase1_driver_quiz_attempts`. Course/module/question rows are
  versioned `(course_id, course_version)` snapshots — republishing a course
  inserts a new version row rather than mutating history, so a driver's past
  attempt stays gradeable/traceable against the exact content it was graded
  against (retest/course-revision traceability, per this task's acceptance
  line 1).
- Applies the exact `ALTER` pattern from
  `academy-identity-decision.md` §2.4 (the V0055 precedent) to
  `reg.driver_training_records` and `reg.driver_reg_profiles`: drop the uuid
  FK to `reg.drivers`, convert `driver_id` to `varchar(100)` via a lossless
  `USING driver_id::text` cast. No `DROP TABLE`/`TRUNCATE`; existing rows (if
  any) are preserved verbatim other than the column type.
- Idempotently seeds one published course (`crs_basics_001` /
  `platform_basics`, required, `validityDays: 365`, `passingScore: 80`) with
  two modules and two quiz questions, matching the example payloads in
  `feature-contracts.md` §3.5, so the read APIs return real (non-fixture)
  content without requiring a separate course-authoring flow. Course
  authoring/publishing is not in `feature-contracts.md` §3.5's API surface
  (only driver read/submit and fleet-admin read routes are contracted) and is
  intentionally not implemented here.

### Backend module — `apps/api/src/modules/driver-academy/`

- `academy-domain.ts`: pure grading/projection functions (unchanged from the
  checkpoint).
- `academy.repository.ts`: all DB access via the existing `DatabaseService`
  (`pg` pool) pattern, gated by `isEnabled()` like other SR-* repositories so
  it degrades to empty results when `DATABASE_URL` is unset (unit tests, this
  VM). Implements the exact active-fleet-cohort resolver from
  `academy-identity-decision.md` §2.2.1 (as-of instant, `effective_from <=`,
  `effective_until IS NULL OR effective_until >`, inner join on
  `reg.phase1_registry_drivers`, `DISTINCT driver_id`) as its own read port —
  it does **not** reuse `FleetPartnerService.listPortalDrivers()`, per
  `schema-allocation.json`'s explicit instruction that that method has
  different (undeduplicated, undated) semantics.
- `academy.service.ts`: orchestrates grading, persists the quiz attempt
  unconditionally (pass or fail, for evidence traceability), writes
  `reg.driver_training_records` only on a pass, and recomputes
  `reg.driver_reg_profiles.training_status` (`'passed'` once every required
  course is passed-and-unexpired, `'expired'` once any required course has
  lapsed) on every quiz submission and every records read.
- `academy.controller.ts`: two controllers,
  `DriverAcademyController` (`/api/driver-academy/*`) and
  `FleetPartnerTrainingController` (`/api/fleet-partner/training/*`),
  implementing all 8 routes from `feature-contracts.md` §3.5. Driver-scoped
  routes derive `driverId` solely from the authenticated identity
  (`identity.actorId`), never from client input, so a driver cannot read or
  submit as another driver. Fleet routes enforce the tenant boundary from
  §3.2 (`kind: "tenant"`): a `tenant`-realm caller may only query their own
  `fleetPartnerId` (`identity.tenantId`), returning
  `403 ACADEMY_FORBIDDEN_FLEET_ACCESS` on mismatch; `platform`/`ops`/`system`
  callers have the contracted 全域 (global) visibility.
- `driver-academy.module.ts`: **not registered in the root app module.**
  Root wiring is explicitly out of this task's scope
  (`schema-allocation.json` `downstream_tasks: ["SR-ACADEMY-FE-001",
  "SR-WIRE-001", ...]`; `academy-identity-decision.md` §2.2 ownership table
  assigns `trainingRequired` dispatch-eligibility wiring to `SR-WIRE-001`).

## Explicitly not implemented / known limitations (not claimed as done)

- **No live DB, HTTP, or migration execution.** The VM restriction forbids
  starting a database, the API server, or any browser/E2E harness in this
  environment. `V0095` has not been applied against a live Postgres instance
  in this session; its idempotency and the `ALTER`/cast correctness are
  verified by static review against the V0055 precedent, not by running it.
- **No proactive, traffic-independent expiry sweep.** `reg.driver_reg_profiles.training_status`
  is recomputed and persisted on every quiz submission and every
  `GET /api/driver-academy/records` read (verified by
  `academy.service.test.ts`'s "downgrades training_status to expired" case),
  but there is no background job that flips a driver's status to `'expired'`
  purely because time has passed with no academy API traffic for that
  driver. `@nestjs/schedule` (or any cron mechanism) is not used anywhere
  else in this codebase, so one was not introduced here as a new dependency
  for a single task. A driver who never touches the academy API again after
  passing will keep reading `'passed'` in the DB until their next touch, even
  after their course technically lapses. `runtime-eligibility-evaluator.service.ts`
  (owned by `SR-WIRE-001`) reads that column directly at dispatch time and
  would be affected by this gap unless it independently recomputes expiry.
- **No course-authoring/admin API.** Not in `feature-contracts.md` §3.5's
  contracted route list; course content is seeded by the migration instead.
- **Root module wiring, IAM route registration, and the
  `trainingRequired` dispatch-eligibility read remain `SR-WIRE-001`'s scope**,
  per `academy-identity-decision.md` §2.2. This backend is unreachable over
  HTTP until that wiring lands.
- **Existence check for `driver_id` is backend-level, not DB-level.**
  `academy-identity-decision.md` §3 requires this explicitly: the migration
  no longer has an FK to enforce it. `AcademyService.submitQuiz` checks
  `reg.phase1_registry_drivers` before grading and returns
  `404 DRIVER_NOT_FOUND` for an unknown id; this is covered by a unit test,
  not a live-DB negative test.

## Executed checks

| Command | Exit | Result |
| --- | --- | --- |
| `pnpm --filter @drts/contracts build` | 0 | Refreshed stale contract build output (pre-existing unrelated typecheck errors elsewhere in `apps/api` disappeared after this; not caused by this task) |
| `pnpm --filter @drts/api typecheck` | 0 | Clean, including the new module |
| `pnpm exec vitest run tests/unit/system-remediation/sr-academy-be-001/` | 0 | 3 files, 35 tests passed (`academy-domain.test.ts` — ported checkpoint domain tests, unchanged; `academy.service.test.ts` — new, fake-repository service tests; `academy.controller.test.ts` — new, IAM-boundary controller tests) |
| `pnpm exec prettier --write apps/api/src/modules/driver-academy/*.ts tests/unit/system-remediation/sr-academy-be-001/*.ts` | 0 | Formatted owned files |
| `git diff --check` | 0 | No whitespace errors |

No PostgreSQL migration/transaction/concurrency test, HTTP/IAM integration
test, browser, real-device, deployed qualification, or live academy
acceptance was run. Test resource IDs (`crs_basics_001`, `drv_1`,
`drv_other`, `fleet-a`, `fleet-b`, `att_1`, `att_old`, …) used in the unit
tests above are synthetic unit-test inputs only, not live resource IDs. No
CI/merge/deploy success is claimed by this document; those are recorded by
the candidate lifecycle after handoff/review.
