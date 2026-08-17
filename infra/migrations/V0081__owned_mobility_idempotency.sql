-- V0081__owned_mobility_idempotency.sql
-- Phase 1 Owned Mobility Idempotency Constraints (CONF-IDEM-002)
-- Enforces uniqueness constraints and indexes for order creation, tenant booking, and dispatch assignment.

-- 1. Extend ops.phase1_owned_orders with idempotency key tracking
ALTER TABLE ops.phase1_owned_orders
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(255) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_phase1_owned_orders_idempotency
  ON ops.phase1_owned_orders (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Extend ops.orders with idempotency key tracking
ALTER TABLE ops.orders
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(255) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_tenant_idempotency
  ON ops.orders (tenant_id, idempotency_key)
  WHERE tenant_id IS NOT NULL AND idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_passenger_idempotency
  ON ops.orders (idempotency_key)
  WHERE tenant_id IS NULL AND idempotency_key IS NOT NULL;

-- 3. Extend ops.phase1_dispatch_assignments with idempotency tracking
ALTER TABLE ops.phase1_dispatch_assignments
  ADD COLUMN IF NOT EXISTS idempotency_key varchar(255) NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_phase1_dispatch_assignments_idempotency
  ON ops.phase1_dispatch_assignments (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 4. Scope index optimization for ops.idempotency_records on owned mobility scopes:
--    'orders:passenger_create', 'tenant:<tenant_id>:booking_create', 'dispatch:order:<order_id>:assign'
CREATE INDEX IF NOT EXISTS idx_idempotency_records_scope_status
  ON ops.idempotency_records (scope, status, created_at DESC);
