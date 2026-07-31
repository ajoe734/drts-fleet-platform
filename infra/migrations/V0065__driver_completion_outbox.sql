-- V0065__driver_completion_outbox.sql
-- Phase 1 · close durable side effects for owned-mobility driver completion.
--
-- Completion writes must survive cross-process retries and only fan out their
-- side effects after the booking/task/quota transaction commits. The outbox
-- owns exactly-once intent per (task_id, effect_type), while delivery uses a
-- lease token so concurrent workers can safely claim pending work with
-- SKIP LOCKED semantics.

CREATE TABLE IF NOT EXISTS ops.driver_completion_outbox (
  outbox_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL
    REFERENCES ops.phase1_driver_tasks(task_id) ON DELETE NO ACTION,
  order_id text NOT NULL
    REFERENCES ops.phase1_owned_orders(order_id) ON DELETE NO ACTION,
  effect_type text NOT NULL,
  request_id text NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid NULL,
  leased_until timestamptz NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NULL,
  CONSTRAINT driver_completion_outbox_effect_unique UNIQUE (task_id, effect_type),
  CONSTRAINT driver_completion_outbox_effect_type_chk CHECK (effect_type IN (
    'tenant_order_completed_webhook',
    'owned_mobility_trip_completed',
    'multi_taxi_certificate'
  )),
  CONSTRAINT driver_completion_outbox_status_chk CHECK (status IN (
    'pending',
    'processing',
    'delivered',
    'dead_letter'
  ))
);

CREATE INDEX IF NOT EXISTS driver_completion_outbox_pending_idx
  ON ops.driver_completion_outbox (task_id, status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'processing') AND delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS driver_completion_outbox_order_idx
  ON ops.driver_completion_outbox (order_id, created_at DESC);
