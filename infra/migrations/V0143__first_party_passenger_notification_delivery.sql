-- Direct bookings keep their frozen passenger and app identity in route_snapshot.
-- Match the nullable route tenant introduced by V0116.
ALTER TABLE mobility.phase1_first_party_notification_delivery_contexts
  ALTER COLUMN tenant_id DROP NOT NULL;
