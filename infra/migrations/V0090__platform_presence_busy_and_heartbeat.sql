-- V0090__platform_presence_busy_and_heartbeat.sql
--
-- SR-DISPATCH-SCHEDULER-001: platform-presence gains a "busy" status
-- (actively engaged on another platform) and a per-platform heartbeat
-- timestamp, so owned-fleet dispatch eligibility can exclude a driver who is
-- busy elsewhere, offline, or has a stale (disconnected) heartbeat.
--
-- online_status stays varchar(10) -- "busy" (4 chars) already fits the
-- existing column width, so no column-width change is needed.

ALTER TABLE ops.phase1_platform_presence
  ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz;
