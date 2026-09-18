-- UV-EXEC-006: enforce the invariant in both write directions. Checking only
-- assignment writes lets an older writer release/delete a live reservation.
-- Deferred checks read the final row, so a valid assign-and-close transaction
-- does not fail on an intermediate NEW.status = 'assigned' event.
BEGIN;

LOCK TABLE ops.phase1_dispatch_assignments IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE ops.dispatch_resource_reservations IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION ops.assert_dispatch_assignment_reserved(p_assignment_id text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  a ops.phase1_dispatch_assignments%ROWTYPE;
BEGIN
  SELECT * INTO a FROM ops.phase1_dispatch_assignments
    WHERE assignment_id = p_assignment_id FOR UPDATE;
  IF NOT FOUND OR a.status NOT IN ('assigned', 'accepted') THEN
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM ops.dispatch_resource_reservations d
    JOIN ops.dispatch_resource_reservations v
      ON v.assignment_id = d.assignment_id
      AND v.reservation_group_id = d.reservation_group_id
    WHERE d.assignment_id = a.assignment_id
      AND d.order_id = a.order_id AND v.order_id = a.order_id
      AND d.resource_type = 'driver' AND d.resource_id = a.record ->> 'driverId'
      AND v.resource_type = 'vehicle' AND v.resource_id = a.record ->> 'vehicleId'
      AND d.status IN ('held', 'occupied')
      AND v.status IN ('held', 'occupied')
  ) THEN
    RAISE EXCEPTION 'dispatch assignment % lacks paired dispatch_resource_reservations; reconcile before releasing capacity', a.assignment_id
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION ops.enforce_dispatch_assignment_reservation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM ops.assert_dispatch_assignment_reserved(NEW.assignment_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ops.enforce_dispatch_reservation_assignment()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    PERFORM ops.assert_dispatch_assignment_reserved(OLD.assignment_id);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    PERFORM ops.assert_dispatch_assignment_reserved(NEW.assignment_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_enforce_dispatch_reservation_assignment
AFTER INSERT OR UPDATE OR DELETE ON ops.dispatch_resource_reservations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION ops.enforce_dispatch_reservation_assignment();

-- V0090 backfilled each resource with a separate group. Normalize only pairs
-- that already belong to the same assignment; never free disputed capacity.
UPDATE ops.dispatch_resource_reservations v
SET reservation_group_id = d.reservation_group_id
FROM ops.dispatch_resource_reservations d
WHERE v.assignment_id = d.assignment_id
  AND v.resource_type = 'vehicle' AND d.resource_type = 'driver'
  AND v.status IN ('held', 'occupied') AND d.status IN ('held', 'occupied')
  AND v.reservation_group_id <> d.reservation_group_id;

-- V0090's ON CONFLICT DO NOTHING could leave historical double bookings
-- unreserved. Fail the rollout for reconciliation instead of silently
-- declaring the supply safe or releasing an unknown assignment.
DO $$
DECLARE a record;
BEGIN
  FOR a IN SELECT assignment_id FROM ops.phase1_dispatch_assignments
    WHERE status IN ('assigned', 'accepted') ORDER BY assignment_id
  LOOP
    PERFORM ops.assert_dispatch_assignment_reserved(a.assignment_id);
  END LOOP;
END;
$$;

COMMIT;
