-- V0136__callcenter_ai_assist.sql
-- CALLCENTER-AI-ASSIST-20261111:
-- 1. Make the human handoff queue durable. voice.handoff (V0086) already
--    models one handoff per voice session; it gains the queue fields the
--    callcenter queue service kept only in process memory (priority, detailed
--    queue status, transfer target, handoff summary, retry counters). The
--    coarse `state` column keeps its V0086 meaning and its "one active
--    handoff per session" index.
-- 2. crm.callcenter_assist_drafts: one AI-prefilled booking draft per call.
--    Seeded from the voice dialogue snapshot when the AI hands a call to a
--    human, or built from the live transcript when a human answers and the AI
--    listens (agent assist). Holds caller personal data, so every row carries
--    a mandatory expiry and readers ignore expired rows.
-- 3. crm.callcenter_assist_field_outcomes: per submitted order, whether each
--    AI-filled field was kept, corrected by the agent, or missed by the AI.
--    Stores no field values, only the outcome, for the AI accuracy metric.
-- 4. Expression indexes for looking up a phone number's past pickups
--    (frequent-pickup suggestions for the agent and address ranking for
--    the AI); the existing active-order-by-phone lookup benefits as well.

ALTER TABLE voice.handoff
  ADD COLUMN IF NOT EXISTS call_id varchar(100),
  ADD COLUMN IF NOT EXISTS resource_scope_id uuid,
  ADD COLUMN IF NOT EXISTS priority varchar(20) NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS queue_status varchar(30) NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS target_kind varchar(40) NOT NULL DEFAULT 'human_queue',
  ADD COLUMN IF NOT EXISTS target varchar(200) NOT NULL DEFAULT 'ops-default-queue',
  ADD COLUMN IF NOT EXISTS summary jsonb,
  ADD COLUMN IF NOT EXISTS redispatch_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bridge_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS enqueued_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_voice_handoff_priority'
      AND conrelid = 'voice.handoff'::regclass
  ) THEN
    ALTER TABLE voice.handoff
      ADD CONSTRAINT ck_voice_handoff_priority
      CHECK (priority IN ('normal', 'urgent', 'emergency'));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_voice_handoff_queue_status'
      AND conrelid = 'voice.handoff'::regclass
  ) THEN
    ALTER TABLE voice.handoff
      ADD CONSTRAINT ck_voice_handoff_queue_status
      CHECK (queue_status IN (
        'queued', 'assigned', 'bridging', 'connected', 'unanswered',
        'caller_dropped', 'agent_dropped', 'failed', 'completed'
      ));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_voice_handoff_counters'
      AND conrelid = 'voice.handoff'::regclass
  ) THEN
    ALTER TABLE voice.handoff
      ADD CONSTRAINT ck_voice_handoff_counters
      CHECK (redispatch_count >= 0 AND bridge_attempts >= 0);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_voice_handoff_call
  ON voice.handoff (call_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_voice_handoff_open_queue
  ON voice.handoff (queue_status, enqueued_at)
  WHERE state IN ('queued', 'claimed', 'active');

CREATE TABLE IF NOT EXISTS crm.callcenter_assist_drafts (
  call_id varchar(100) PRIMARY KEY,
  source varchar(20) NOT NULL CHECK (source IN ('voice_handoff', 'agent_assist')),
  handoff_id uuid,
  voice_session_id uuid,
  fields jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(fields) = 'object'),
  transcript jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(transcript) = 'array'),
  draft_version integer NOT NULL DEFAULT 1 CHECK (draft_version >= 1),
  extractor varchar(20) NOT NULL DEFAULT 'rules'
    CHECK (extractor IN ('voice_dialogue', 'rules', 'llm')),
  submitted_order_id varchar(100),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > created_at),
  CHECK ((submitted_order_id IS NULL) = (submitted_at IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_callcenter_assist_drafts_expiry
  ON crm.callcenter_assist_drafts (expires_at);

DROP TRIGGER IF EXISTS trg_touch_callcenter_assist_drafts
  ON crm.callcenter_assist_drafts;
CREATE TRIGGER trg_touch_callcenter_assist_drafts
BEFORE UPDATE ON crm.callcenter_assist_drafts
FOR EACH ROW EXECUTE FUNCTION admin.touch_updated_at();

CREATE TABLE IF NOT EXISTS crm.callcenter_assist_field_outcomes (
  outcome_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id varchar(100) NOT NULL,
  order_id varchar(100) NOT NULL,
  field varchar(40) NOT NULL CHECK (field IN (
    'pickup', 'dropoff', 'passengerName', 'passengerPhone', 'pickupTime',
    'passengerCount', 'luggage', 'requiredCapabilities', 'notes'
  )),
  source varchar(20) NOT NULL CHECK (source IN ('voice_handoff', 'agent_assist')),
  outcome varchar(20) NOT NULL CHECK (outcome IN ('accepted', 'corrected', 'ai_missing')),
  ai_status varchar(20) CHECK (ai_status IS NULL OR ai_status IN ('filled', 'uncertain')),
  ai_confidence numeric(4, 3) CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  agent_id varchar(100),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_callcenter_assist_field_outcome UNIQUE (call_id, order_id, field),
  CHECK ((outcome = 'ai_missing') = (ai_status IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_callcenter_assist_field_outcomes_recorded
  ON crm.callcenter_assist_field_outcomes (recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase1_owned_orders_passenger_phone
  ON ops.phase1_owned_orders ((record->'passenger'->>'phone'), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_phase1_owned_orders_passenger_contact_phone
  ON ops.phase1_owned_orders (
    (record->'bookingRequirements'->'passengerContact'->>'phone'),
    created_at DESC
  );
