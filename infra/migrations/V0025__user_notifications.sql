-- V0025__user_notifications.sql
--
-- Cross-app per-user inbox persistence for Q-X05 / Q-X06 notifications.

CREATE TABLE IF NOT EXISTS core.phase1_user_notifications (
  notification_id varchar(100) PRIMARY KEY,
  recipient_actor_id varchar(100) NOT NULL,
  recipient_realm varchar(50) NOT NULL,
  tenant_id varchar(100) NULL,
  severity varchar(50) NOT NULL,
  event_type varchar(100) NOT NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_phase1_user_notifications_recipient
  ON core.phase1_user_notifications(
    recipient_realm,
    recipient_actor_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_phase1_user_notifications_tenant
  ON core.phase1_user_notifications(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_user_notifications_unread
  ON core.phase1_user_notifications(recipient_realm, read_at, created_at DESC);
