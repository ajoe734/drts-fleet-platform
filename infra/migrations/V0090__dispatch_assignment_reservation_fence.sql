-- V0090__dispatch_assignment_reservation_fence.sql
-- UV-EXEC-006 (Codex2 review of candidate 6a0eda994, P1): V0087's reservation
-- ledger only constrains itself -- the partial unique index on
-- (resource_type, resource_id) arbitrates two *reservation* rows racing for
-- the same driver/vehicle, but nothing stops a writer that never calls
-- `reserveDispatchResources` at all from inserting or updating
-- `ops.phase1_dispatch_assignments` straight into an active status. An
-- old-revision binary mid-rollout (or any future writer that forgets to
-- reserve) can still double-book a driver/vehicle the ledger has no idea
-- about, because the ledger is only ever consulted by the one upgraded
-- writer, never enforced against the assignments table itself.
--
-- This closes that gap at the database, independent of which application
-- revision performs the write: an assignment left in an active status
-- ("assigned"/"accepted") must have a held/occupied reservation for both its
-- driver and its vehicle scoped to that exact assignment_id, checked once at
-- COMMIT (DEFERRABLE INITIALLY DEFERRED), not immediately on the INSERT
-- itself. Immediate checking is not an option here: V0087's assignment_id FK
-- is immediate/non-deferrable, so `createDispatchAssignment` must insert the
-- assignment row before it can reserve against it in the same transaction
-- (see the ded972044 FK-ordering fix) -- a same-statement check would always
-- fail on the very first (legitimate) write. Deferring to COMMIT lets both
-- writes land in either order within one transaction while still rejecting
-- any transaction that commits an active assignment with no matching
-- reservation at all.

CREATE OR REPLACE FUNCTION ops.enforce_dispatch_assignment_reservation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_driver_id text;
  v_vehicle_id text;
  v_driver_reserved boolean;
  v_vehicle_reserved boolean;
BEGIN
  IF NEW.status NOT IN ('assigned', 'accepted') THEN
    RETURN NEW;
  END IF;

  v_driver_id := NEW.record ->> 'driverId';
  v_vehicle_id := NEW.record ->> 'vehicleId';

  IF v_driver_id IS NULL OR v_vehicle_id IS NULL THEN
    RAISE EXCEPTION
      'dispatch assignment % is % but its record is missing driverId/vehicleId -- every writer must carry both (SD section 7.6)',
      NEW.assignment_id, NEW.status;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM ops.dispatch_resource_reservations
    WHERE assignment_id = NEW.assignment_id
      AND resource_type = 'driver'
      AND resource_id = v_driver_id
      AND status IN ('held', 'occupied')
  ) INTO v_driver_reserved;

  SELECT EXISTS (
    SELECT 1 FROM ops.dispatch_resource_reservations
    WHERE assignment_id = NEW.assignment_id
      AND resource_type = 'vehicle'
      AND resource_id = v_vehicle_id
      AND status IN ('held', 'occupied')
  ) INTO v_vehicle_reserved;

  IF NOT v_driver_reserved OR NOT v_vehicle_reserved THEN
    RAISE EXCEPTION
      'dispatch assignment % is % without a held/occupied ops.dispatch_resource_reservations row for both driver % and vehicle % -- every dispatch-assignment writer must reserve through that ledger before committing (SD section 7.6)',
      NEW.assignment_id, NEW.status, v_driver_id, v_vehicle_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_dispatch_assignment_reservation
  ON ops.phase1_dispatch_assignments;

CREATE CONSTRAINT TRIGGER trg_enforce_dispatch_assignment_reservation
AFTER INSERT OR UPDATE ON ops.phase1_dispatch_assignments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION ops.enforce_dispatch_assignment_reservation();

-- Reconciliation: this fence is being added after the assignments table and
-- its writers already exist. Any assignment that was already active before
-- this migration ran (including ones created before V0087 existed at all)
-- has never gone through `reserveDispatchResources` and would otherwise
-- retroactively fail the very next UPDATE the new fence sees for that row
-- (e.g. a driver simply progressing their existing trip). Backfill a
-- reservation for exactly those rows, one per resource, marked 'occupied'
-- for an already-accepted assignment (the driver already holds it) and
-- 'held' otherwise, so pre-existing state satisfies the invariant the fence
-- now enforces going forward.
INSERT INTO ops.dispatch_resource_reservations (
  resource_type, resource_id, order_id, assignment_id, reservation_group_id, status
)
SELECT
  'driver',
  a.record ->> 'driverId',
  a.order_id,
  a.assignment_id,
  gen_random_uuid(),
  CASE WHEN a.status = 'accepted' THEN 'occupied' ELSE 'held' END
FROM ops.phase1_dispatch_assignments a
WHERE a.status IN ('assigned', 'accepted')
  AND a.record ->> 'driverId' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ops.dispatch_resource_reservations r
    WHERE r.assignment_id = a.assignment_id
      AND r.resource_type = 'driver'
      AND r.status IN ('held', 'occupied')
  )
ON CONFLICT (resource_type, resource_id) WHERE status IN ('held', 'occupied') DO NOTHING;

INSERT INTO ops.dispatch_resource_reservations (
  resource_type, resource_id, order_id, assignment_id, reservation_group_id, status
)
SELECT
  'vehicle',
  a.record ->> 'vehicleId',
  a.order_id,
  a.assignment_id,
  gen_random_uuid(),
  CASE WHEN a.status = 'accepted' THEN 'occupied' ELSE 'held' END
FROM ops.phase1_dispatch_assignments a
WHERE a.status IN ('assigned', 'accepted')
  AND a.record ->> 'vehicleId' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ops.dispatch_resource_reservations r
    WHERE r.assignment_id = a.assignment_id
      AND r.resource_type = 'vehicle'
      AND r.status IN ('held', 'occupied')
  )
ON CONFLICT (resource_type, resource_id) WHERE status IN ('held', 'occupied') DO NOTHING;

-- Fail closed instead of silently completing: the two backfill INSERTs
-- above use ON CONFLICT ... DO NOTHING against the same partial unique
-- index the fence itself relies on, so if two or more pre-existing active
-- assignments already double-booked the same driver or vehicle before this
-- migration ran (a bug the old, unfenced code never prevented), only the
-- first backfilled row wins the reservation and the rest are left active
-- with no reservation at all. That is worse than the pre-migration state:
-- once the "winning" assignment later completes and its reservation is
-- released, the ledger reports the driver/vehicle free even though another
-- still-active assignment silently continues to hold it, so a brand-new
-- order can double-book it for real. There is no automatic, safe way to
-- pick which of the conflicting legacy assignments should keep the
-- resource -- that is an operational decision. Abort the whole migration so
-- it is never marked applied while any active assignment is missing either
-- reservation, forcing that decision (cancel/reassign the loser(s), or
-- otherwise correct the data) before the fence can be trusted.
DO $$
DECLARE
  v_offending_count integer;
  v_offending_ids text;
BEGIN
  SELECT count(*), string_agg(a.assignment_id, ', ' ORDER BY a.assignment_id)
    INTO v_offending_count, v_offending_ids
  FROM ops.phase1_dispatch_assignments a
  WHERE a.status IN ('assigned', 'accepted')
    AND (
      NOT EXISTS (
        SELECT 1 FROM ops.dispatch_resource_reservations r
        WHERE r.assignment_id = a.assignment_id
          AND r.resource_type = 'driver'
          AND r.status IN ('held', 'occupied')
      )
      OR NOT EXISTS (
        SELECT 1 FROM ops.dispatch_resource_reservations r
        WHERE r.assignment_id = a.assignment_id
          AND r.resource_type = 'vehicle'
          AND r.status IN ('held', 'occupied')
      )
    );

  IF v_offending_count > 0 THEN
    RAISE EXCEPTION
      'V0090 backfill left % active dispatch_assignments row(s) without a full driver+vehicle reservation after backfill (assignment_id(s): %) -- two or more pre-existing active assignments already double-booked the same driver/vehicle before this fence existed, so ON CONFLICT DO NOTHING could only reserve one of them. Reconcile by hand (cancel/reassign the loser(s), or otherwise correct the conflicting rows) and re-run this migration before the fence can be trusted (SD section 7.6).',
      v_offending_count, v_offending_ids;
  END IF;
END;
$$;
