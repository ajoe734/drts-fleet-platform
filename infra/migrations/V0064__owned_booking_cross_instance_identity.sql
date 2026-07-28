ALTER TABLE ops.phase1_owned_orders
  ADD COLUMN IF NOT EXISTS tenant_id varchar(100)
    GENERATED ALWAYS AS (NULLIF(record ->> 'tenantId', '')) STORED,
  ADD COLUMN IF NOT EXISTS booking_id varchar(100)
    GENERATED ALWAYS AS (NULLIF(record ->> 'bookingId', '')) STORED;

CREATE INDEX IF NOT EXISTS idx_phase1_owned_orders_tenant_booking
  ON ops.phase1_owned_orders (tenant_id, booking_id, updated_at DESC)
  WHERE booking_id IS NOT NULL;
