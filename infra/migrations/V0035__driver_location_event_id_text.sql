-- MOB-BE-002 heartbeat replay compatibility.
-- eventId is a client-provided idempotency token, not a server UUID.

ALTER TABLE telemetry.driver_location_events
  ALTER COLUMN event_id TYPE text USING event_id::text;
