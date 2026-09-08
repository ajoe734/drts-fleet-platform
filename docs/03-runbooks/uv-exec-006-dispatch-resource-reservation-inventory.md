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
are dispatched. Queue retry (`resolveNoSupply` / `redispatchOrder`) creates
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
