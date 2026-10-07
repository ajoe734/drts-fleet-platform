-- PUSH-FIRST-PARTY-FCM-20261006; allocation: PUSH-CHANNEL-SD-20261006 V0108.
-- No new outbox states. Context identity/content never changes after first
-- preparation; only delivery_stage/retry_disposition/failure_reason/
-- receipt_id/delivered_at are ever updated, by one completed attempt.
CREATE TABLE IF NOT EXISTS mobility.phase1_first_party_notification_delivery_contexts (
  outbox_id varchar(255) PRIMARY KEY REFERENCES ops.consumer_notification_outbox(outbox_id),
  order_id varchar(255) NOT NULL REFERENCES mobility.phase1_order_first_party_notification_routes(order_id),
  tenant_id varchar(100) NOT NULL,
  target_devices jsonb NOT NULL,
  wire_message jsonb NOT NULL,
  wire_message_hash text NOT NULL,
  event_sequence bigint NOT NULL CHECK (event_sequence > 0),
  expires_at timestamptz NOT NULL,
  delivery_target varchar(30) NOT NULL DEFAULT 'first_party_device' CHECK (delivery_target = 'first_party_device'),
  delivery_stage varchar(20) NULL CHECK (delivery_stage IN ('outbox_persisted','provider_accepted','device_received','opened')),
  retry_disposition varchar(30) NULL CHECK (retry_disposition IN ('automatic','configuration_blocked','manual_only','terminal','none')),
  failure_reason varchar(50) NULL CHECK (failure_reason IN ('no_notification_channel','no_active_device','credential_rejected','configuration_blocked','provider_transient_error')),
  receipt_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NULL
);

CREATE FUNCTION mobility.guard_first_party_notification_context_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['delivery_stage','retry_disposition','failure_reason','receipt_id','delivered_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['delivery_stage','retry_disposition','failure_reason','receipt_id','delivered_at']) THEN
    RAISE EXCEPTION 'first-party notification context identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER first_party_notification_context_identity
  BEFORE UPDATE ON mobility.phase1_first_party_notification_delivery_contexts
  FOR EACH ROW EXECUTE FUNCTION mobility.guard_first_party_notification_context_identity();
