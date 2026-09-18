-- V0086__voice_persistence_domain_schema.sql
-- UV-EXEC-002: new logical tables for unattended voice booking (SD §9.1).
--
-- These are brand-new tables with no legacy data or existing writers, so they
-- are created directly with typed columns (not the `record jsonb` snapshot
-- pattern used by the phase1_* runtime tables). FKs from these tables back to
-- the *real* runtime tables point at `ops.phase1_owned_orders` and
-- `crm.phase1_call_sessions` -- the tables the application actually writes --
-- not the mostly-empty canonical `ops.orders` / `crm.call_sessions` (SD §7.5).
--
-- Per SD §15.2 point 1, this migration only adds tables and does not touch
-- any existing writer path; nothing in the application reads or writes these
-- tables yet. Reader-side repository access is added in the same wave
-- (apps/api/src/modules/voice-booking/voice-booking.repository.ts) ahead of
-- any command/writer implementation, which lands in later UV-EXEC-* tasks.
--
-- Enum-shaped CHECK constraints mirror packages/contracts/src/unattended-voice.ts
-- so the DB rejects values the contracts would already reject, instead of
-- drifting from them silently.

CREATE SCHEMA IF NOT EXISTS voice;

-- Shared "this row is evidence/history, do not touch it after the fact"
-- guard. Applied to voice_session_event, voice_draft_revision,
-- voice_route_profile, voice_rate_card and voice_recording_checkpoint below.
CREATE OR REPLACE FUNCTION voice.raise_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % is not permitted', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE OR REPLACE FUNCTION voice._make_append_only(target_table text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE format(
    'DROP TRIGGER IF EXISTS trg_%s_append_only ON %s',
    replace(target_table, '.', '_'), target_table
  );
  EXECUTE format(
    'CREATE TRIGGER trg_%s_append_only BEFORE UPDATE OR DELETE ON %s
       FOR EACH ROW EXECUTE FUNCTION voice.raise_append_only()',
    replace(target_table, '.', '_'), target_table
  );
  EXECUTE format(
    'DROP TRIGGER IF EXISTS trg_%s_prevent_truncate ON %s',
    replace(target_table, '.', '_'), target_table
  );
  EXECUTE format(
    'CREATE TRIGGER trg_%s_prevent_truncate BEFORE TRUNCATE ON %s
       FOR EACH STATEMENT EXECUTE FUNCTION voice.raise_append_only()',
    replace(target_table, '.', '_'), target_table
  );
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON %s FROM PUBLIC', target_table);
END;
$$;

-- 1. voice_line_binding -------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.line_binding (
  line_binding_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id varchar(100) NOT NULL,
  dnis varchar(64) NOT NULL,
  brand_id varchar(100) NOT NULL,
  operating_profile_id varchar(100) NOT NULL,
  queue_id varchar(100),
  enabled boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_line_binding_active
  ON voice.line_binding (provider_account_id, dnis)
  WHERE enabled;

DROP TRIGGER IF EXISTS trg_touch_voice_line_binding ON voice.line_binding;
CREATE TRIGGER trg_touch_voice_line_binding
BEFORE UPDATE ON voice.line_binding
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

-- 2. voice_route_profile (immutable published version) -------------------
CREATE TABLE IF NOT EXISTS voice.route_profile (
  profile_id uuid NOT NULL,
  version integer NOT NULL,
  models jsonb NOT NULL,
  languages jsonb NOT NULL,
  retry_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  recording_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  human_fallback jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, version)
);

SELECT voice._make_append_only('voice.route_profile');

-- 3. voice_resource_scope -------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.resource_scope (
  scope_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar(100) NOT NULL,
  operating_unit_id varchar(100),
  runtime_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_by varchar(100) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Scope isolation must be explicit (brand_id + operating_unit_id); never
-- inferred from a null tenant. COALESCE lets operating_unit_id stay optional
-- while still keying the uniqueness on its actual value.
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_resource_scope_active
  ON voice.resource_scope (brand_id, COALESCE(operating_unit_id, ''))
  WHERE status = 'active';

DROP TRIGGER IF EXISTS trg_touch_voice_resource_scope ON voice.resource_scope;
CREATE TRIGGER trg_touch_voice_resource_scope
BEFORE UPDATE ON voice.resource_scope
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

-- 4. voice_session ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.session (
  voice_session_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id varchar(100) NOT NULL REFERENCES crm.phase1_call_sessions (call_id),
  provider_account_id varchar(100) NOT NULL,
  provider_call_id varchar(100) NOT NULL,
  resource_scope_id uuid NOT NULL REFERENCES voice.resource_scope (scope_id),
  line_binding_id uuid NOT NULL REFERENCES voice.line_binding (line_binding_id),
  route_profile_id uuid NOT NULL,
  route_profile_version integer NOT NULL,
  dialog_state varchar(30) NOT NULL DEFAULT 'admitted' CHECK (
    dialog_state IN (
      'admitted', 'greeting', 'collecting', 'resolving', 'confirming',
      'committing', 'reconciling', 'awaiting_dispatch', 'reporting',
      'handoff_pending', 'human_controlled', 'callback_pending', 'closed'
    )
  ),
  media_state varchar(20) NOT NULL DEFAULT 'connecting' CHECK (
    media_state IN ('connecting', 'active', 'reconnecting', 'ended')
  ),
  control_owner varchar(20) NOT NULL DEFAULT 'ai' CHECK (
    control_owner IN ('ai', 'handoff', 'human', 'none')
  ),
  lease_epoch integer NOT NULL DEFAULT 0,
  session_version integer NOT NULL DEFAULT 1,
  commit_status varchar(20) NOT NULL DEFAULT 'none' CHECK (
    commit_status IN ('none', 'pending', 'succeeded', 'rejected')
  ),
  recording_state varchar(20) NOT NULL DEFAULT 'starting' CHECK (
    recording_state IN (
      'starting', 'capturing', 'checkpoint_ready', 'finalizing',
      'finalized', 'failed', 'expired'
    )
  ),
  confirmation_state varchar(20) NOT NULL DEFAULT 'absent' CHECK (
    confirmation_state IN (
      'absent', 'readback_playing', 'awaiting_answer', 'accepted',
      'invalidated', 'consumed'
    )
  ),
  outcome varchar(30) CHECK (
    outcome IS NULL OR outcome IN (
      'auto_booking_created', 'auto_no_service', 'auto_query_completed',
      'human_handoff', 'callback_scheduled', 'abandoned', 'technical_failure'
    )
  ),
  input_epoch integer NOT NULL DEFAULT 0,
  pending_input boolean NOT NULL DEFAULT false,
  last_resolved_input_epoch integer NOT NULL DEFAULT 0,
  last_applied_control_sequence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (route_profile_id, route_profile_version)
    REFERENCES voice.route_profile (profile_id, version)
);

-- Provider account/call is the admission-time identity; one voice_session
-- authority row per real-world call (SD §9.1).
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_session_provider_call
  ON voice.session (provider_account_id, provider_call_id);
CREATE INDEX IF NOT EXISTS idx_voice_session_active
  ON voice.session (dialog_state, updated_at DESC)
  WHERE dialog_state <> 'closed';
CREATE INDEX IF NOT EXISTS idx_voice_session_lease
  ON voice.session (lease_epoch, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_session_call
  ON voice.session (call_id);

DROP TRIGGER IF EXISTS trg_touch_voice_session ON voice.session;
CREATE TRIGGER trg_touch_voice_session
BEFORE UPDATE ON voice.session
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

-- 5. voice_call_leg -----------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.call_leg (
  leg_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id uuid NOT NULL REFERENCES voice.session (voice_session_id),
  provider_account_id varchar(100) NOT NULL,
  provider_leg_id varchar(100) NOT NULL,
  leg_role varchar(30) NOT NULL,
  media_epoch integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  transfer_correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_call_leg_provider
  ON voice.call_leg (provider_account_id, provider_leg_id);
CREATE INDEX IF NOT EXISTS idx_voice_call_leg_session
  ON voice.call_leg (voice_session_id, started_at);

-- 6. voice_call_admission ------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.call_admission (
  admission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id varchar(100) NOT NULL,
  provider_call_id varchar(100) NOT NULL,
  received_at timestamptz NOT NULL,
  line_binding_id uuid REFERENCES voice.line_binding (line_binding_id),
  brand_id varchar(100),
  outcome varchar(20) NOT NULL CHECK (outcome IN ('admitted', 'overflow', 'failed')),
  reason text,
  voice_session_id uuid REFERENCES voice.session (voice_session_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_call_admission_provider
  ON voice.call_admission (provider_account_id, provider_call_id);
CREATE INDEX IF NOT EXISTS idx_voice_call_admission_received
  ON voice.call_admission (received_at DESC);

-- 7. voice_session_event (append-only evidence) --------------------------
CREATE TABLE IF NOT EXISTS voice.session_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id uuid NOT NULL REFERENCES voice.session (voice_session_id),
  leg_id uuid REFERENCES voice.call_leg (leg_id),
  source varchar(30) NOT NULL,
  provider_account_id varchar(100),
  source_event_id varchar(150),
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  sequence bigint NOT NULL,
  media_epoch integer NOT NULL DEFAULT 0,
  input_epoch integer NOT NULL DEFAULT 0,
  lease_epoch integer NOT NULL DEFAULT 0,
  event_type varchar(60) NOT NULL,
  payload jsonb,
  payload_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_session_event_source_dedup
  ON voice.session_event (source, provider_account_id, source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_session_event_sequence
  ON voice.session_event (voice_session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_voice_session_event_session
  ON voice.session_event (voice_session_id, received_at);

SELECT voice._make_append_only('voice.session_event');

-- 8. voice_turn -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.turn (
  turn_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id uuid NOT NULL REFERENCES voice.session (voice_session_id),
  event_id uuid REFERENCES voice.session_event (event_id),
  provider_account_id varchar(100),
  provider_session_id varchar(100),
  speaker_role varchar(20) NOT NULL,
  media_epoch integer NOT NULL DEFAULT 0,
  segment_id varchar(100) NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  is_final boolean NOT NULL DEFAULT false,
  language varchar(20),
  text_encrypted text,
  audio_offsets jsonb,
  model_version varchar(100),
  sequence bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_turn_segment_revision
  ON voice.turn (provider_account_id, voice_session_id, provider_session_id, segment_id, revision);
CREATE INDEX IF NOT EXISTS idx_voice_turn_session_sequence
  ON voice.turn (voice_session_id, sequence);

-- 9. voice_recording_checkpoint (append-only evidence) --------------------
CREATE TABLE IF NOT EXISTS voice.recording_checkpoint (
  checkpoint_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id varchar(100) NOT NULL REFERENCES crm.phase1_call_sessions (call_id),
  recording_id varchar(100),
  manifest_version integer NOT NULL,
  manifest jsonb NOT NULL,
  manifest_hash varchar(128) NOT NULL,
  coverage jsonb NOT NULL,
  policy_version varchar(60) NOT NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_recording_checkpoint_manifest
  ON voice.recording_checkpoint (call_id, COALESCE(recording_id, ''), manifest_version);

SELECT voice._make_append_only('voice.recording_checkpoint');

-- 10. voice_intent ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.intent (
  intent_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id uuid NOT NULL REFERENCES voice.session (voice_session_id),
  action varchar(60) NOT NULL DEFAULT 'create_owned_order',
  current_draft_version integer NOT NULL DEFAULT 0,
  bound_order_id varchar(100) REFERENCES ops.phase1_owned_orders (order_id),
  status varchar(30) NOT NULL DEFAULT 'collecting',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- SD §7.2: "第一版一通電話一個新建叫車意圖" (v1 caps create intents at one per session).
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_intent_session_create
  ON voice.intent (voice_session_id)
  WHERE action = 'create_owned_order';
CREATE INDEX IF NOT EXISTS idx_voice_intent_bound_order
  ON voice.intent (bound_order_id) WHERE bound_order_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_touch_voice_intent ON voice.intent;
CREATE TRIGGER trg_touch_voice_intent
BEFORE UPDATE ON voice.intent
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

-- 11. voice_draft_revision (append-only versions) --------------------------
CREATE TABLE IF NOT EXISTS voice.draft_revision (
  intent_id uuid NOT NULL REFERENCES voice.intent (intent_id),
  draft_version integer NOT NULL,
  slots jsonb NOT NULL,
  validation_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  canonical_snapshot jsonb,
  snapshot_hash varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (intent_id, draft_version)
);

SELECT voice._make_append_only('voice.draft_revision');

-- 12. voice_confirmation ----------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.confirmation (
  confirmation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id uuid NOT NULL REFERENCES voice.session (voice_session_id),
  intent_id uuid NOT NULL REFERENCES voice.intent (intent_id),
  draft_version integer NOT NULL,
  action varchar(60) NOT NULL,
  confirmation_method varchar(10) NOT NULL CHECK (confirmation_method IN ('speech', 'dtmf')),
  snapshot_hash varchar(128) NOT NULL,
  readback_playback_id uuid NOT NULL,
  readback_completed_event_id uuid,
  input_epoch integer NOT NULL,
  media_epoch integer NOT NULL,
  control_sequence integer NOT NULL,
  lease_epoch integer NOT NULL,
  recording_checkpoint_id uuid REFERENCES voice.recording_checkpoint (checkpoint_id),
  evidence jsonb NOT NULL,
  state varchar(20) NOT NULL DEFAULT 'awaiting_answer' CHECK (
    state IN (
      'absent', 'readback_playing', 'awaiting_answer', 'accepted',
      'invalidated', 'consumed'
    )
  ),
  consumed_command_id uuid,
  confirmed_at timestamptz,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (intent_id, draft_version)
    REFERENCES voice.draft_revision (intent_id, draft_version)
);

-- Only one active (not yet invalidated/consumed) confirmation ticket per
-- intent/draft/action -- SD §9.1 "action/intent/draft 的 active 票據唯一".
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_confirmation_active
  ON voice.confirmation (intent_id, draft_version, action)
  WHERE state IN ('readback_playing', 'awaiting_answer', 'accepted');
CREATE INDEX IF NOT EXISTS idx_voice_confirmation_session
  ON voice.confirmation (voice_session_id, created_at DESC);

-- 13. voice_command_receipt -------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.command_receipt (
  command_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL REFERENCES voice.intent (intent_id),
  brand_id varchar(100) NOT NULL,
  call_id varchar(100) NOT NULL,
  action varchar(60) NOT NULL,
  payload_hash varchar(128) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'rejected')),
  order_id varchar(100) REFERENCES ops.phase1_owned_orders (order_id),
  result_version integer NOT NULL DEFAULT 1,
  error_code varchar(60),
  error_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'succeeded' OR order_id IS NOT NULL)
);

-- SD §7.2 action key: brandId + callId + intentId + action is the durable
-- dedup key ("最終防線"); this is the literal DB enforcement of it.
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_command_receipt_action_key
  ON voice.command_receipt (brand_id, call_id, intent_id, action);
CREATE INDEX IF NOT EXISTS idx_voice_command_receipt_pending
  ON voice.command_receipt (status, updated_at DESC) WHERE status = 'pending';

DROP TRIGGER IF EXISTS trg_touch_voice_command_receipt ON voice.command_receipt;
CREATE TRIGGER trg_touch_voice_command_receipt
BEFORE UPDATE ON voice.command_receipt
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

-- 14. voice_work_item ---------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.work_item (
  work_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  command_id uuid REFERENCES voice.command_receipt (command_id),
  voice_session_id uuid REFERENCES voice.session (voice_session_id),
  work_type varchar(60) NOT NULL,
  dedupe_key varchar(300) NOT NULL,
  payload_ref text,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'leased', 'completed', 'failed', 'dead_letter')
  ),
  attempt integer NOT NULL DEFAULT 0,
  run_after timestamptz NOT NULL DEFAULT now(),
  lease_epoch integer NOT NULL DEFAULT 0,
  leased_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_work_item_dedupe
  ON voice.work_item (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_voice_work_item_claimable
  ON voice.work_item (status, run_after) WHERE status IN ('pending', 'leased');

DROP TRIGGER IF EXISTS trg_touch_voice_work_item ON voice.work_item;
CREATE TRIGGER trg_touch_voice_work_item
BEFORE UPDATE ON voice.work_item
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

-- 15. voice_rate_card (append-only published versions) ---------------------
CREATE TABLE IF NOT EXISTS voice.rate_card (
  rate_card_id uuid NOT NULL,
  version integer NOT NULL,
  provider varchar(60) NOT NULL,
  currency varchar(3) NOT NULL,
  tax_inclusive boolean NOT NULL DEFAULT false,
  unit_price numeric(18, 6) NOT NULL,
  billing_unit varchar(30) NOT NULL,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  rounding_rule varchar(30),
  minimum_charge numeric(18, 6),
  conditions jsonb,
  reconciliation_status varchar(20) NOT NULL DEFAULT 'draft' CHECK (
    reconciliation_status IN ('draft', 'published', 'reconciled')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rate_card_id, version)
);

SELECT voice._make_append_only('voice.rate_card');

-- 16. voice_usage_record --------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.usage_record (
  usage_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_account_id varchar(100) NOT NULL,
  provider_usage_ref varchar(150),
  admission_id uuid REFERENCES voice.call_admission (admission_id),
  voice_session_id uuid REFERENCES voice.session (voice_session_id),
  provider varchar(60) NOT NULL,
  model varchar(100),
  model_version varchar(60),
  billing_unit varchar(30) NOT NULL,
  quantity numeric(18, 6) NOT NULL,
  currency varchar(3) NOT NULL,
  rate_card_id uuid,
  rate_card_version integer,
  estimated_cost numeric(18, 6),
  actual_cost numeric(18, 6),
  invoice_ref varchar(150),
  brand_id varchar(100),
  usage_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (rate_card_id, rate_card_version)
    REFERENCES voice.rate_card (rate_card_id, version)
);

-- Dedup against the provider's own usage/invoice line reference, distinct
-- from our own usage_id PK, so retried usage callbacks don't double-count.
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_usage_record_provider_ref
  ON voice.usage_record (provider_account_id, provider_usage_ref)
  WHERE provider_usage_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_voice_usage_record_date_brand
  ON voice.usage_record (usage_date, brand_id);

-- 17. voice_callback_task / voice_callback_attempt --------------------------
CREATE TABLE IF NOT EXISTS voice.callback_task (
  task_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id uuid NOT NULL REFERENCES voice.session (voice_session_id),
  contact_phone_encrypted text NOT NULL,
  contact_phone_lookup_token text NOT NULL,
  consent_snapshot_hash varchar(128) NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'claimed', 'in_progress', 'completed', 'cancelled', 'unreachable')
  ),
  scheduled_at timestamptz,
  due_at timestamptz,
  priority varchar(20),
  reason text,
  resource_scope_id uuid REFERENCES voice.resource_scope (scope_id),
  owner_claim_lease varchar(150),
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- SD §9.1 "task/attempt 去重、終態不復活": at most one non-terminal callback
-- task per session; once a task reaches a terminal status it is never
-- reopened -- a new contact attempt gets a new task row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_callback_task_active_session
  ON voice.callback_task (voice_session_id)
  WHERE status NOT IN ('completed', 'cancelled', 'unreachable');
CREATE INDEX IF NOT EXISTS idx_voice_callback_task_lookup
  ON voice.callback_task (contact_phone_lookup_token);
CREATE INDEX IF NOT EXISTS idx_voice_callback_task_due
  ON voice.callback_task (status, due_at) WHERE status IN ('pending', 'claimed', 'in_progress');

DROP TRIGGER IF EXISTS trg_touch_voice_callback_task ON voice.callback_task;
CREATE TRIGGER trg_touch_voice_callback_task
BEFORE UPDATE ON voice.callback_task
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

CREATE TABLE IF NOT EXISTS voice.callback_attempt (
  attempt_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES voice.callback_task (task_id),
  attempt_number integer NOT NULL,
  operator_id varchar(100),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  outcome varchar(20) NOT NULL CHECK (
    outcome IN ('answered', 'no_answer', 'busy', 'failed', 'succeeded')
  ),
  next_action varchar(60),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_callback_attempt_number
  ON voice.callback_attempt (task_id, attempt_number);

-- 18. voice_handoff -------------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.handoff (
  handoff_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id uuid NOT NULL REFERENCES voice.session (voice_session_id),
  reason varchar(60) NOT NULL,
  queue_id varchar(100),
  state varchar(20) NOT NULL DEFAULT 'queued' CHECK (
    state IN ('queued', 'claimed', 'active', 'completed', 'abandoned')
  ),
  agent_id varchar(100),
  owner_epoch integer NOT NULL DEFAULT 0,
  summary_ref text,
  callback_id uuid REFERENCES voice.callback_task (task_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- SD §9.1 "每 session 最多一個 active handoff".
CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_handoff_active_session
  ON voice.handoff (voice_session_id)
  WHERE state IN ('queued', 'claimed', 'active');
CREATE INDEX IF NOT EXISTS idx_voice_handoff_queue
  ON voice.handoff (queue_id, state, created_at);

DROP TRIGGER IF EXISTS trg_touch_voice_handoff ON voice.handoff;
CREATE TRIGGER trg_touch_voice_handoff
BEFORE UPDATE ON voice.handoff
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

-- 19. voice_passenger_proof ------------------------------------------------
CREATE TABLE IF NOT EXISTS voice.passenger_proof (
  proof_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id uuid NOT NULL REFERENCES voice.session (voice_session_id),
  order_id varchar(100) REFERENCES ops.phase1_owned_orders (order_id),
  method varchar(30) NOT NULL,
  verified_contact_ref text NOT NULL,
  allowed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  order_scope varchar(30),
  attempt_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voice_passenger_proof_session
  ON voice.passenger_proof (voice_session_id, expires_at DESC);
