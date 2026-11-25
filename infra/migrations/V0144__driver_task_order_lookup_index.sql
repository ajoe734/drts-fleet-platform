-- V0144__driver_task_order_lookup_index.sql
--
-- PAX-RATING-CANONICAL-TRIP-LOOKUP-20261123
--
-- Rating search, detail and passenger readback resolve the completed driver
-- task of an order. ops.phase1_driver_tasks had no index on order_id, so each
-- lookup scanned every task row, once per rating in the admin list.

CREATE INDEX IF NOT EXISTS idx_phase1_driver_tasks_order
  ON ops.phase1_driver_tasks (order_id, status);
