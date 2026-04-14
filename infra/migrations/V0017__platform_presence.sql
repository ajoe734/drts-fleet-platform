-- V0017__platform_presence.sql
--
-- WA-001: Platform presence domain
-- Per-platform online/offline, token expiry, re-auth, and eligibility tracking
-- for Driver App multi-platform presence center.

CREATE TABLE IF NOT EXISTS ops.phase1_platform_presence (
  driver_id         varchar(100) NOT NULL,
  platform_code     varchar(50)  NOT NULL,
  account_id        varchar(100),
  online_status     varchar(10)  NOT NULL,          -- online | offline
  eligibility       varchar(20)  NOT NULL DEFAULT 'pending', -- eligible | ineligible | pending
  token_expires_at  timestamptz,
  reauth_required   boolean       NOT NULL DEFAULT false,
  last_online_at    timestamptz,
  last_offline_at   timestamptz,
  created_at        timestamptz   NOT NULL DEFAULT NOW(),
  updated_at        timestamptz   NOT NULL DEFAULT NOW(),
  record            jsonb         NOT NULL,
  PRIMARY KEY (driver_id, platform_code)
);

CREATE INDEX IF NOT EXISTS idx_platform_presence_driver
  ON ops.phase1_platform_presence(driver_id);

CREATE INDEX IF NOT EXISTS idx_platform_presence_platform
  ON ops.phase1_platform_presence(platform_code);
