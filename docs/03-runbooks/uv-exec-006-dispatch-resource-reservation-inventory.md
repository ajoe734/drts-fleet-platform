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
  active-occupation constraint. This task did not need a new migration.
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
  false, used only when `DATABASE_URL` is not configured, e.g. plain unit
  tests) has no reservation table to share and is single-process by
  construction -- SD §7.6's "只有後端確實隔離才可保留未升級入口" allows
  leaving it as-is.
- `_executeDispatchOrder` (`request_dispatch` / matching-job creation) does
  not reserve anything -- SD §7.6 step 1 vs step 2: the matching job only
  lists candidates, the reservation happens at the actual assign step.
