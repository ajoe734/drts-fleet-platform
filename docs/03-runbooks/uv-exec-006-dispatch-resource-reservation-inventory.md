# UV-EXEC-006: Shared driver+vehicle reservation -- writer inventory (SD §7.6/§9.1)

Status: evidence artifact for `required_acceptance: all_dispatch_writers_inventory`.
Scope: every writer that can create, replace, or close a
`ops.phase1_dispatch_assignments` row -- the only place a driver or vehicle
actually gets assigned to an order, and therefore the only place SD §7.6's
shared `ops.dispatch_resource_reservations` ledger needs to be wired in.

## The dispatch assignment writer is a single choke point

```
grep -rln "phase1_dispatch_assignments" apps/api/src --include=*.ts
  apps/api/src/modules/owned-mobility/owned-mobility.repository.ts   (writer)
  apps/api/src/modules/reporting/reporting.repository.ts             (read-only SELECT)

grep -rln "assignDispatch\|reassignDispatch\b" apps/api/src --include=*.ts
  apps/api/src/modules/owned-mobility/owned-mobility.controller.ts   (API surface)
  apps/api/src/modules/owned-mobility/owned-mobility.service.ts      (implementation)
```

`OwnedMobilityRepository` is the only module in the codebase that inserts or
updates `ops.phase1_dispatch_assignments`; `OwnedMobilityService.createDispatchAssignment`
is the only method that calls it. Every entry point that can put a driver or
vehicle into an active assignment goes through this one method:

- **owned-mobility direct dispatch** -- `POST /owned-mobility/dispatch/assign`
  and `.../reassign` (`OwnedMobilityController.assignDispatch` /
  `.reassignDispatch`) call `service.assignDispatch` /
  `service.reassignDispatch`, both of which resolve to
  `createDispatchAssignment`.
- **multi-taxi** (`apps/api/src/modules/multi-taxi/`) -- has no separate
  assignment writer. A multi-taxi ride is an owned order with
  `runtimeProfileCode: "multi_taxi_direct"` (see
  `OwnedMobilityService.createMultiTaxiRide`); it is dispatched through the
  exact same `/dispatch/assign` and `/dispatch/reassign` endpoints as any
  other owned order, and `createDispatchAssignment` already special-cases
  `multi_taxi_direct` (authorized-vehicle check, driver rating summary) in
  the same transaction the reservation now goes through.
- **tenant/enterprise bookings** -- also owned orders (`bookingId` set),
  dispatched through the same assign/reassign endpoints; no separate writer.
- **voice (UV-EXEC-004/005)** -- voice-originated orders are owned orders
  too; dispatch after creation goes through the same assign/reassign path.
  Voice-specific mutation guards (UV-EXEC-004's UoW/CAS, UV-EXEC-005's
  intent/scope fence) sit at order-creation and order-mutation time, not at
  assignment time, so they compose with the reservation change here rather
  than needing their own copy of it.
- **scheduled/reservation activation** -- `dispatchSemantics: "reservation"`
  orders (`reservationHoldStatus` state machine) still go through
  `dispatchOrder` -> `assignDispatch` when the reservation window activates;
  they hit the same `createDispatchAssignment` transaction and therefore the
  same reservation ledger. There is no separate "activate a scheduled job
  and hand it a driver" writer outside this path.

Because there is exactly one writer, SD §7.6's requirement that "所有會競爭
同一即時供給的...都需遵守共同 DB 保留" is satisfied by wiring
`ops.dispatch_resource_reservations` into that one writer, rather than
needing a per-entry-point retrofit.

## What UV-EXEC-006 added

- `infra/migrations/V0087__dispatch_resource_reservations.sql` (already
  landed by UV-EXEC-002): the ledger table and its
  `UNIQUE (resource_type, resource_id) WHERE status IN ('held','occupied')`
  active-occupation constraint.
- `V0090__dispatch_assignment_reservation_fence.sql` rejects active
  assignments without reservations at transaction commit, including writes
  from older application revisions, and backfills historical assignments.
- `V0091__dispatch_reservation_commit_invariant.sql` checks the reverse
  write direction too: releasing or deleting a reservation cannot leave an
  active assignment without its driver/vehicle pair. Both resources must
  match the assignment, order and reservation group. Migration takes table
  locks and checks historical active assignments; ambiguous or conflicting
  occupancy aborts rollout for reconciliation rather than freeing capacity.
- `OwnedMobilityRepository`:
  - `reserveDispatchResources(executor, params)` -- inserts a `held` row for
    driver then vehicle (fixed order, independent of resource IDs) inside
    the caller's transaction; a losing insert against the unique constraint
    raises `DispatchResourceReservationConflictError`.
  - `releaseDispatchResourceReservations(assignmentId, executor?)` -- CAS by
    `assignment_id`: only ever touches the rows created for that specific
    assignment, so a stale release (e.g. a late timer for an assignment a
    reassign already superseded) is a safe no-op instead of releasing a
    different, newer assignment's occupation of the same driver/vehicle.
  - `occupyDispatchResourceReservations(assignmentId, executor?)` --
    `held` -> `occupied` on driver acceptance.
- `OwnedMobilityService.createDispatchAssignment`: reserves driver+vehicle
  in the same `withTransaction` block as the assignment insert (SD §7.6:
  "driver／vehicle 兩筆在同交易取得"). When called for a reassign
  (`options.previousAssignmentId` set), it releases the superseded
  assignment's reservation in the same transaction before reserving the new
  one, so the two never overlap and the resource is never observably
  unreserved between them.
- Release wired into every valid terminal transition of an assignment:
  `rejectDriverTask`, `cancelOwnedOrder`, the driver-task completion
  transaction (`finalizeDriverTaskCompletionInTransaction`, same tx as the
  completion write), `handleDispatchTimeout` (now accepts an optional
  `targetAssignmentId` so a timer fenced to one offer becomes a no-op
  `superseded` result instead of cancelling whichever assignment happens to
  be latest -- see SD §7.6's own critique of the old
  `handleDispatchTimeout(orderId)` pattern), and `_executeRedispatchOrder`
  (already version-fenced via `expectedAssignmentVersion`).
- `occupyDispatchResourceReservations` wired into `acceptDriverTask`.

## What this task did not change

- The non-DB in-memory fallback path (`OwnedMobilityRepository.isEnabled()`
  false, used when `DATABASE_URL` is not configured, e.g. plain unit tests)
  has no shared reservation table. This fallback is not evidence of a
  production supply isolation boundary; shared-supply deployments require
  PostgreSQL and the reservation migrations.
- `_executeDispatchOrder` (`request_dispatch` / matching-job creation) does
  not reserve anything -- SD §7.6 step 1 vs step 2: the matching job only
  lists candidates, the reservation happens at the actual assign step.

## Verified entry paths and local evidence (2026-09-08)

Passenger `createPassengerOrder` and telephone `createCallCenterOrder`
produce orders in `OwnedMobilityService`; each uses `dispatchOrder` then
`assignDispatch`. The integration race invokes these actual creation paths
on separate service instances and separate PostgreSQL pools. Multi-taxi
`MultiTaxiService` calls `createMultiTaxiRide`, including scheduled rides;
enterprise and scheduled orders use the same assignment writer when they
are dispatched. Queue retry (`resolveNoSupplyOrder` / `redispatchOrder`) creates
a matching job via `dispatchOrder`, without assigning capacity itself.
The inventory describes current writers, not delivery of the separate
unattended executor.

Repository-wide search of `phase1_dispatch_assignments` and
`reserveDispatchResources` confirms the repository writer and service
transaction above; reporting only reads assignment state. Repository bulk
workflow/state persistence also writes assignments and is subject to the
same database commit constraints.

Run the task suite from `apps/api` (root Vitest excludes `apps/api/tests`):

```sh
DATABASE_URL=<isolated-postgres-url> pnpm exec vitest run tests/integration/uv-exec-006.integration.test.ts --no-file-parallelism --maxConcurrency=1
```

The 21 checks cover transaction rollback, two competing resource claims,
passenger/telephone contention, old-writer rejection, reverse reservation
release/deletion rejection, stale accept/reject/reassign/timeout fences,
valid reject/cancel/target timeout, and held-to-occupied transitions.
The test uses an isolated `uv_exec_006_codex` database with migrations
through V0091. API typecheck is run with `pnpm --filter @drts/api typecheck`.
Review, CI, merge and external acceptance remain candidate lifecycle gates.

Local results on 2026-09-08: PostgreSQL suite **21/21 passed** at 15:19 UTC;
API typecheck passed. Related API unit suites (`owned-mobility.service`,
`owned-mobility.repository`, `owned-mobility.controller`,
`owned-mobility-durable-sinks`, `multi-taxi.service`) **177/177 passed**.
The targeted timeout assertion was corrected to the persisted `cancelled`
terminal status; timeout is not a driver rejection. The earlier attempt
from repository root selected no tests; the successful run used `apps/api`.
These are local implementation checks, not external acceptance results.

## P1 cancellation follow-up (2026-09-08)

Supervisor fallback assigned implementation to Codex; reviewer remains Codex2.
Cancellation now discovers durable assignment/task/job rows under locks in
assignment → task → job → order order, rechecks active assignment discovery
after acquiring the order lock, and validates cancellation against that
authoritative order/task state. Order, jobs, assignment, task, trace and both
resource releases commit in one transaction. Cache updates and cancellation
notifications occur only after commit. Completion uses the same lock order.
Tenant and passenger controllers await cancellation before wrapping responses;
multi-taxi token-creation compensation awaits cancellation and preserves the
original token persistence error if cancellation fails.

At 15:31 UTC the PostgreSQL task suite passed **23/23**, including a stale
service attempting cancellation after a different service starts the trip,
and an injected failure after cancellation writes and both resource releases.
Both regressions verify unchanged durable order/job/task/assignment/reservations
and traces, plus unchanged cached task state. The five related unit suites
passed **177/177** before the final caller corrections. After those corrections,
the controller and multi-taxi suites passed **35/35** at 15:32 UTC, including
API transaction failure propagation and failed compensating cancellation.
API typecheck passed again. These checks used the same isolated database and
commands described above; candidate review/CI/merge/acceptance remain pending.

## Lock order and deadline follow-up (2026-09-08)

Codex continued ownership by supervisor fallback; Codex2 remains reviewer.
Assignment and reassignment now acquire the existing assignment, task, job
and order locks before any workflow upsert, using the same acquisition path
as cancellation/completion. They recheck the current assignment under those
locks. Legacy creation/matching writes already pending on the service are
awaited before acquiring locks, preventing an immediate assignment from racing
its own order/job persistence.

New offers persist `acceptanceDeadline` in their assignment record. The
acceptance timeout checks the durable deadline and pending task while holding
the assignment/task locks. Early timers, missing/invalid deadlines and tasks
outside pending acceptance retain capacity. `DISPATCH_ACCEPTANCE_TIMEOUT_MS`
configures new deadlines (positive integer milliseconds, default 60000);
legacy records without a deadline require reconciliation.

At 15:49 UTC the PostgreSQL suite passed **26/26**, including an explicit
blocking transaction proving reassignment waits for its old assignment before
locking the order, an early-versus-expired deadline check, and missing/invalid
durable deadline checks. The five related unit suites passed **179/179**.
The new lock reader initially exposed an intermittent order-write race in
three PostgreSQL cases; the pending-write boundary fixed that failure. Three
unit mocks were updated to supply the new locked workflow reader. API
checking requires `pnpm --filter @drts/contracts build` first because the API
tsconfig consumes generated contract declarations.

The required plain rebase onto advancing dev was attempted and aborted on
replayed duplicate task-history conflicts. A non-destructive merge of
`origin/dev` preserved the already-pushed ancestry and incorporated its two
new support documents; all subsequent pushes used normal non-force push.
These are local candidate checks; review, CI, merge and external acceptance
remain separate lifecycle gates.

Final API typecheck passed after rebuilding contracts. At 15:50 UTC the
owned-mobility service unit suite passed **112/112** after strengthening its
assignment recheck test with a deferred persistence promise: no transaction
starts until the prior creation/matching writes finish. `git diff --check`
also passed.

### Cancellation persistence boundary follow-up (2026-09-08 15:57 UTC)

Supervisor fallback retained Codex as implementation owner and Codex2 as
reviewer. The P1 finding on candidate `b898ea9368ef` is addressed by draining
preceding workflow writes before cancellation starts its authoritative locked
transaction. This lets immediate cancellation see an uncommitted creation and
prevents a preceding workflow upsert from overwriting committed cancellation.
The transaction's durable validation and assignment-scoped release remain intact.

Three deterministic PostgreSQL regressions hold workflow persistence behind a
promise gate: immediate create/cancel, existing-order matching upsert/cancel,
and real MultiTaxiService token-write failure compensation. Each checks that
the cancellation lock reader has not started before the gate opens, then
checks durable cancelled status and reason after all held writes settle.

Validation: PostgreSQL integration **29/29**, owned-mobility and multi-taxi
service unit tests **138/138**, and API typecheck passed after rebuilding
contracts. The first integration run exposed a missing `persistAuthorization`
method in the new token repository test double; adding its resolved stub made
the real compensation path test pass. `git diff --check` passed.

Plain rebase onto the latest dev again encountered duplicate-history replay
conflicts and was aborted. A clean merge of `origin/dev` preserved pushed
ancestry; this follow-up uses normal non-force pushes. Review/CI/merge and
external acceptance remain candidate lifecycle gates.

### Dispatch resumption verification (2026-09-08 16:32 UTC)

Supervisor fallback dispatched Codex as owner, with Codex2 remaining reviewer.
The existing cancellation persistence fix was retained. Both dependencies
UV-EXEC-004 and UV-EXEC-005 are recorded as done in canonical task slices.
The prescribed plain rebase again conflicted while replaying previously
integrated task history and was aborted; merging origin/dev at `5cff9b360`
cleanly integrated five support/planning documents without rewriting pushed
ancestry. Source search reconfirmed that assignment writes remain in
OwnedMobilityRepository and reporting only reads those rows.

After integration, the isolated PostgreSQL task suite passed **29/29**, the
five related API unit suites passed **179/179**, and API typecheck passed
after rebuilding contracts. `git diff --check` passed. This verification is
local evidence for candidate handoff; same-SHA review, CI, merge and external
acceptance are still pending.

### Reviewer workspace prerequisite retry (2026-09-08 16:38 UTC)

Codex resumed as supervisor-assigned owner after Codex2 reported that its
workspace HEAD `dc0662558cf5069f878f3785c2072b965bde25c6` did not match locked
candidate `079c37315b2d9a70c18ba9003c0936d83a30ad37`. That return was a review
prerequisite failure, not a code defect finding. Supervisor must provision
the reviewer workspace at the newly locked candidate before redispatch;
the owner did not alter any reviewer workspace.

The prescribed rebase again hit duplicate task-history conflicts and was
aborted. A clean merge integrated origin/dev at `1cdaaa5b5`, changing only
support/planning documents. PostgreSQL integration passed **29/29** and the
five related API unit suites passed **179/179**. API typecheck passed after
rebuilding contracts, and `git diff --check` passed. Assignment writer inventory
was reconfirmed (the service table-name match is a comment). Review, CI,
merge and external acceptance remain pending.

### Unreconciled redispatch task guard (2026-09-08 16:46 UTC)

Supervisor fallback assigned Codex as owner and Codex2 as reviewer. The P1
finding against candidate `86364a15a7a03355dc6997abca704cabad434c18` is fixed:
`closeSupersededDispatchAssignment` now requires an authoritative locked task,
matching task/assignment/order/job/driver/vehicle links, a legal cancellation
transition from `DRIVER_TASK_TRANSITIONS`, and compatible assignment/task
statuses before any persistence or reservation release. Missing, terminal,
unknown, or inconsistent task state returns a conflict and retains capacity
for reconciliation, including the ordinary redispatch path without a timeout.

Added 26 PostgreSQL regressions through `redispatchOrder`, covering both held
and occupied reservations across missing task IDs/rows, terminal and unknown
states, incompatible statuses, and each inconsistent task link. Every case
checks both reservation rows remain byte-for-byte equivalent (including
versions) and the assignment remains active. Existing valid reassign and
timeout tests continue to pass. Isolated PostgreSQL suite: **55/55 passed**;
API typecheck passed after rebuilding contracts.

The required rebase encountered duplicate-history conflicts; both attempts
were aborted without retaining partial changes. A clean merge of origin/dev
at `890548b4f` preserved published ancestry and integrated its support document.
Anchor `fe47bf59d` was pushed normally. Same-SHA review, CI, merge and external
acceptance remain pending.

Related unit validation: owned-mobility service/repository/controller and
multi-taxi service/controller suites passed **164/164**. `git diff --check`
passed. These are owner-run checks, not independent reviewer evidence.

## P1 timeout workflow follow-up (2026-09-08 16:56 UTC)

Codex resumed the supervisor fallback owner assignment after Codex2 rejected
candidate `8db7753260e754240cd87e712df1b7b8e8ec7663`. Both targeted and
untargeted timeouts now use the durable cancellation workflow loader with
assignment → task → job → order locks and its post-lock assignment discovery
fence. The order must still be dispatchable with an active matching/assigned
job. Closing the expired pending offer, releasing both resources, and writing
order/job/attempt/trace now share one transaction. Cache updates and events run
only after successful commit.

The PostgreSQL suite passed **58/58** using `uv_exec_006_codex`, including:

- A second instance hydrated before assignment cannot use targetless matching
  timeout to overwrite either a new pending offer or a subsequently accepted
  offer; persisted order/job and reservations remain unchanged.
- An injected exception immediately after resource release rolls back the
  entire timeout workflow and leaves the service task cache unchanged.
- A barrier after target release demonstrates that another connection still
  observes the pre-timeout workflow, then starts cancellation on that other
  instance before allowing timeout to commit. Cancellation remains final;
  a discovery conflict is retried through the existing cancellation command.

The five related unit suites passed **179/179**. API typecheck passed after
rebuilding the local contracts output (the initial check found stale generated
contract types lacking the existing `acceptanceDeadline` field). Commands are
unchanged from the earlier evidence, executed from `apps/api` for Vitest.

`git rebase origin/dev` encountered duplicate historical implementation
conflicts while replaying 47 commits. It was aborted, then `origin/dev` was
merged cleanly to preserve the published task history and permit a normal
non-force push. Review, CI, merge and external acceptance remain pending.

## Resumed dispatch and CI repair (2026-09-08 18:16 UTC)

Supervisor fallback again assigned Codex owner and Codex2 reviewer; dependencies
UV-EXEC-004 and UV-EXEC-005 are done. PR #1799 delivered history-repair guidance,
not the parent implementation. This dispatch explicitly provisioned the original
`codex/uv-exec-006` branch. The prescribed rebase was attempted, hit duplicate
implementation replay conflicts, and was aborted. A clean merge of current dev
`74ffe8912` preserved the published parent ancestry and allowed a normal push
on the assigned branch. No reset, force push, or stash was used.

The writer search still finds OwnedMobilityRepository as the assignment writer
and reporting as a reader. Existing transactional reservation implementation
and V0090/V0091 guards were preserved. Review of prior failed CI runs
34254156596 and 34254156593 identified two actionable regressions:

- Root tenant isolation and webhook tests did not await the now asynchronous
  cancellation method. Both now await it; the reporting integration cancellation
  caller also awaits completion before rebuilding its projection.
- Task cancellation records closure in `completedAt`. Reporting must only use
  this timestamp as a trip completion fallback when the task is `completed`.
  The existing same-millisecond redispatch/cancellation regression retains its
  expectation that a cancelled unstarted trip has no trip completion time.
  This requires the precise additional source scope
  `apps/api/src/modules/reporting/reporting.service.ts`, plus its existing
  integration test and `tests/unit/owned-mobility.test.ts`.

Fresh local checks:

- Isolated PostgreSQL `uv_exec_006_codex`: required reservation suite **58/58**.
- Five owned-mobility/multi-taxi API unit suites: **164/164**.
- Root `tests/unit/owned-mobility.test.ts`: **37/37**, no unhandled rejection.
- API reporting service unit and daily dispatch integration suites: **9/9**.
- API typecheck after contracts build, and `git diff --check`: passed.

The required reservation command is run from `apps/api`, with DATABASE_URL
pointing to the isolated migrated database. The other targeted checks use the
same Vitest commands and paths described above. These are owner verification
results; fresh same-candidate review, CI, merge and acceptance are still required.

## 2026-09-08 redispatch cancellation review follow-up

Owner: Codex, assigned by supervisor fallback; reviewer: Codex2. This retains
rather than changes the stated agy/Claude owner preference.

Review of candidate `9c400939c393d65147aa211401298bed146b73a9` found a commit gap:
redispatch released the old offer, then separately persisted a cached order and
created the next job. A different instance could cancel in that gap and have
its durable cancellation overwritten.

The durable redispatch path now shares cancellation's ordered assignment,
task, open-job, and order locks. It revalidates authoritative order state and
assignment version, closes the old assignment/task and releases their capacity,
closes old jobs, and writes the next job, attempt, order and trace in the same
transaction. The workflow loader also fences open-job discovery under the order
lock. Dispatch preparation is separate from cache updates, audit and events;
redispatch applies those effects only after commit and performs no subsequent
workflow upsert. Timeout drains its own preceding asynchronous writes before
using the shared discovery fence, as cancellation and redispatch already do.

PostgreSQL regression barriers cover both a concurrent cancellation during the
uncommitted release and cancellation after commit but before service
continuation. In the latter case cancellation completes before redispatch is
allowed to resume: the durable order remains cancelled, all jobs are closed,
and another redispatch from the stale instance is rejected. Fault injection
after resource release verifies rollback of order, assignment/task, jobs,
attempts, traces and both reservations, with unchanged cached order/task.

Branch synchronization: rebasing onto updated dev attempted to replay already
integrated historical commits and conflicted. The rebase was aborted, then dev
was merged without conflicts, preserving the existing published branch and
normal non-force pushes.

Final owner checks for this follow-up:

- Isolated PostgreSQL `uv_exec_006_codex`: reservation integration suite **61/61**,
  including both redispatch/cancel barriers and release-fault rollback.
- API owned-mobility service, repository, controller, compliance-gates and
  multi-taxi service unit suites: **161/161**.
- Root owned-mobility unit suite: **37/37**.
- API typecheck (after contracts build), ESLint on both changed API source
  files, and `git diff --check`: passed.

Commands use the same isolated database and API working-directory convention
above. This is owner verification only; candidate review, CI, merge and external
acceptance remain governed by the candidate lifecycle.
