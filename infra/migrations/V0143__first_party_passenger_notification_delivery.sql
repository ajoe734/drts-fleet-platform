-- Direct bookings keep their frozen passenger and app identity in route_snapshot.
-- Match the nullable route tenant introduced by V0116.
ALTER TABLE mobility.phase1_first_party_notification_delivery_contexts
  ALTER COLUMN tenant_id DROP NOT NULL;

-- V0104's per-order event counter only admits partner routes (FK), so a
-- direct booking's ETA/reassignment events never received the eventSequence
-- the first-party transport requires. First-party routes get their own
-- counter with the same allocation contract; the row is created on the
-- first allocation for an order that has a first-party route.
CREATE TABLE IF NOT EXISTS mobility.phase1_first_party_notification_sequences (
  order_id varchar(255) PRIMARY KEY
    REFERENCES mobility.phase1_order_first_party_notification_routes(order_id),
  next_sequence bigint NOT NULL DEFAULT 1
    CHECK (next_sequence >= 1)
);
