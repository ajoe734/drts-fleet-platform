-- PAX-PUSH-DEVICE-API-20261009: forward-only tenantless stored routes.
-- Delivery remains default-off; V0107/V0108 are preserved.
ALTER TABLE mobility.phase1_order_first_party_notification_routes
  ALTER COLUMN tenant_id DROP NOT NULL;
