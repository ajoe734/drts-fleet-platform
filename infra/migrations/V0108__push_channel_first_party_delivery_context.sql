CREATE TABLE mobility.phase1_first_party_notification_delivery_contexts (
  outbox_id varchar(255) PRIMARY KEY REFERENCES ops.consumer_notification_outbox(outbox_id),
  order_id varchar(255) NOT NULL REFERENCES mobility.phase1_order_first_party_notification_routes(order_id),
  tenant_id varchar(100) NOT NULL,
  target_devices jsonb NOT NULL,
  wire_message jsonb NOT NULL,
  wire_message_hash text NOT NULL,
  event_sequence bigint NOT NULL,
  expires_at timestamptz NOT NULL,
  delivery_target varchar(30) NOT NULL DEFAULT 'first_party_device' CHECK (delivery_target = 'first_party_device'),
  delivery_stage varchar(20) NULL CHECK (delivery_stage IN ('outbox_persisted','provider_accepted','device_received','opened')),
  retry_disposition varchar(30) NULL CHECK (retry_disposition IN ('automatic','configuration_blocked','manual_only','terminal','none')),
  failure_reason varchar(50) NULL CHECK (failure_reason IN ('no_notification_channel','no_active_device','credential_rejected','configuration_blocked','provider_transient_error')),
  receipt_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NULL
);
