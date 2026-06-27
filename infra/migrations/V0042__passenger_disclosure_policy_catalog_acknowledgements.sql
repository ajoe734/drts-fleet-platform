CREATE TABLE IF NOT EXISTS av_sandbox.passenger_disclosure_policies (
  policy_id TEXT PRIMARY KEY,
  tenant_id TEXT,
  business_dispatch_subtype TEXT,
  partner_entry_slug TEXT,
  policy_version TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_p2_passenger_disclosure_policy_scope
  ON av_sandbox.passenger_disclosure_policies(
    tenant_id,
    business_dispatch_subtype,
    partner_entry_slug,
    updated_at DESC
  );

CREATE TABLE IF NOT EXISTS av_sandbox.passenger_disclosure_message_catalog (
  entry_id TEXT PRIMARY KEY,
  catalog_version TEXT NOT NULL,
  message_code TEXT NOT NULL,
  locale TEXT NOT NULL,
  legal_approved BOOLEAN NOT NULL DEFAULT FALSE,
  body_text TEXT NOT NULL,
  entry_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_p2_passenger_disclosure_catalog_code_locale
  ON av_sandbox.passenger_disclosure_message_catalog(message_code, locale);

CREATE TABLE IF NOT EXISTS av_sandbox.passenger_acknowledgement_records (
  acknowledgement_id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  message_code TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('tenant_portal','partner_portal','call_center','ops_console')),
  acknowledgement_mode TEXT NOT NULL CHECK (
    acknowledgement_mode IN (
      'per_booking_checkbox',
      'program_level_contract',
      'verbal_recorded',
      'operator_confirmed_notice'
    )
  ),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('passenger','tenant_admin','ops_user','system')),
  actor_ref TEXT,
  acknowledged_at TIMESTAMPTZ NOT NULL,
  evidence_ref TEXT,
  acknowledgement_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_p2_passenger_ack_booking
  ON av_sandbox.passenger_acknowledgement_records(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_p2_passenger_ack_order
  ON av_sandbox.passenger_acknowledgement_records(order_id, created_at DESC);

INSERT INTO av_sandbox.passenger_disclosure_message_catalog (
  entry_id,
  catalog_version,
  message_code,
  locale,
  legal_approved,
  body_text,
  entry_snapshot,
  created_at,
  updated_at
) VALUES
  (
    'pdc-v1-av-en-us',
    'passenger_disclosure.v1',
    'sandbox_passenger_disclosure.av_program_notice',
    'en-US',
    TRUE,
    'This trip may be fulfilled by an autonomous vehicle operating under the sandbox program, with remote oversight and a human fallback process available if conditions change.',
    jsonb_build_object(
      'entryId', 'pdc-v1-av-en-us',
      'catalogVersion', 'passenger_disclosure.v1',
      'messageCode', 'sandbox_passenger_disclosure.av_program_notice',
      'locale', 'en-US',
      'bodyText', 'This trip may be fulfilled by an autonomous vehicle operating under the sandbox program, with remote oversight and a human fallback process available if conditions change.',
      'legalApproved', true,
      'createdAt', '2026-06-26T00:00:00.000Z',
      'updatedAt', '2026-06-26T00:00:00.000Z'
    ),
    '2026-06-26T00:00:00.000Z',
    '2026-06-26T00:00:00.000Z'
  ),
  (
    'pdc-v1-av-zh-tw',
    'passenger_disclosure.v1',
    'sandbox_passenger_disclosure.av_program_notice',
    'zh-TW',
    FALSE,
    '本趟行程可能由沙盒計畫中的自動駕駛車輛執行，並提供遠端監看與必要時切換真人駕駛的處理流程。',
    jsonb_build_object(
      'entryId', 'pdc-v1-av-zh-tw',
      'catalogVersion', 'passenger_disclosure.v1',
      'messageCode', 'sandbox_passenger_disclosure.av_program_notice',
      'locale', 'zh-TW',
      'bodyText', '本趟行程可能由沙盒計畫中的自動駕駛車輛執行，並提供遠端監看與必要時切換真人駕駛的處理流程。',
      'legalApproved', false,
      'createdAt', '2026-06-26T00:00:00.000Z',
      'updatedAt', '2026-06-26T00:00:00.000Z'
    ),
    '2026-06-26T00:00:00.000Z',
    '2026-06-26T00:00:00.000Z'
  )
ON CONFLICT (entry_id) DO NOTHING;
