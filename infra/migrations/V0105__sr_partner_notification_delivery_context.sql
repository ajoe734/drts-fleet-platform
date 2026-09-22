-- SR-PARTNER-NOTIFY-TRANSPORT-20260918; allocation: SR-PARTNER-NOTIFY-CON-20260917 V0105.
-- No new outbox states. Context identity/content never changes after first preparation.
CREATE TABLE IF NOT EXISTS mobility.phase1_partner_notification_delivery_contexts (
  outbox_id varchar(255) PRIMARY KEY REFERENCES ops.consumer_notification_outbox(outbox_id),
  delivery_id uuid NOT NULL UNIQUE,
  order_id varchar(255) NOT NULL REFERENCES mobility.phase1_order_partner_notification_routes(order_id),
  entry_slug varchar(150) NOT NULL,
  tenant_id varchar(100) NOT NULL,
  partner_id varchar(100) NOT NULL,
  binding_id uuid NOT NULL REFERENCES admin.phase1_partner_notification_bindings(binding_id),
  binding_version integer NOT NULL,
  webhook_id varchar(100) NOT NULL REFERENCES admin.phase1_tenant_webhook_endpoints(webhook_id),
  endpoint_fingerprint text NOT NULL,
  wire_payload jsonb NOT NULL,
  wire_payload_hash text NOT NULL,
  event_sequence bigint NOT NULL CHECK (event_sequence > 0),
  expires_at timestamptz NOT NULL,
  -- Required by design §8: retries keep the approved first-attempt policy.
  retry_policy_snapshot jsonb NOT NULL,
  delivery_target varchar(20) NOT NULL DEFAULT 'partner_endpoint' CHECK (delivery_target = 'partner_endpoint'),
  delivery_stage varchar(20) NULL CHECK (delivery_stage IN ('outbox_persisted','partner_accepted','provider_accepted','device_received','opened')),
  retry_disposition varchar(30) NULL CHECK (retry_disposition IN ('automatic','configuration_blocked','manual_only','terminal','none')),
  failure_reason varchar(50) NULL CHECK (failure_reason IN ('configuration_blocked','endpoint_disabled','route_missing','route_ambiguous','owner_changed','recipient_revoked','provider_transient_error','credential_rejected','endpoint_unavailable','partner_ack_invalid','notification_expired','notification_obsolete','notification_superseded')),
  receipt_id text NULL,
  downstream_status varchar(20) NOT NULL DEFAULT 'unknown' CHECK (downstream_status = 'unknown'),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz NULL
);

CREATE FUNCTION mobility.guard_partner_notification_context_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - ARRAY['delivery_stage','retry_disposition','failure_reason','receipt_id','delivered_at'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['delivery_stage','retry_disposition','failure_reason','receipt_id','delivered_at']) THEN
    RAISE EXCEPTION 'partner notification context identity is immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER partner_notification_context_identity
  BEFORE UPDATE ON mobility.phase1_partner_notification_delivery_contexts
  FOR EACH ROW EXECUTE FUNCTION mobility.guard_partner_notification_context_identity();
