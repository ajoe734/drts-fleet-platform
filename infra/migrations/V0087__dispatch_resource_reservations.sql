-- V0087__dispatch_resource_reservations.sql
-- UV-EXEC-002: shared driver/vehicle capacity reservation ledger (SD §7.6).
--
-- This table is deliberately in the `ops` schema, not `voice`: SD §7.6 is
-- explicit that capacity reservation is a shared dispatch-domain concern, not
-- a voice-only writer. Every entry point that can assign the same driver or
-- vehicle (voice, callcenter, tenant/enterprise dispatch, queue release) must
-- eventually reserve through this table; this migration only adds the ledger
-- and its constraints; wiring every existing assign/reassign path through it
-- is the WP-09 executor task, not this migration.

CREATE TABLE IF NOT EXISTS ops.dispatch_resource_reservations (
  reservation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type varchar(20) NOT NULL CHECK (resource_type IN ('driver', 'vehicle')),
  resource_id varchar(100) NOT NULL,
  order_id varchar(100) NOT NULL REFERENCES ops.phase1_owned_orders (order_id),
  assignment_id varchar(100) REFERENCES ops.phase1_dispatch_assignments (assignment_id),
  reservation_group_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'held' CHECK (status IN ('held', 'occupied', 'released')),
  expires_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- SD §7.6: "對 held/occupied 建 resourceType/resourceID 的有效占用唯一約束" --
-- a driver or vehicle can have at most one non-released reservation at a
-- time, across every writer that competes for the same live supply.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dispatch_resource_reservations_active
  ON ops.dispatch_resource_reservations (resource_type, resource_id)
  WHERE status IN ('held', 'occupied');

CREATE INDEX IF NOT EXISTS idx_dispatch_resource_reservations_order
  ON ops.dispatch_resource_reservations (order_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_resource_reservations_assignment
  ON ops.dispatch_resource_reservations (assignment_id)
  WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dispatch_resource_reservations_group
  ON ops.dispatch_resource_reservations (reservation_group_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_resource_reservations_expiry
  ON ops.dispatch_resource_reservations (status, expires_at)
  WHERE status = 'held';

DROP TRIGGER IF EXISTS trg_touch_dispatch_resource_reservations
  ON ops.dispatch_resource_reservations;
CREATE TRIGGER trg_touch_dispatch_resource_reservations
BEFORE UPDATE ON ops.dispatch_resource_reservations
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();
