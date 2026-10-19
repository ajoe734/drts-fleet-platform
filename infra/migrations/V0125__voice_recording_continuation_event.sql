-- Original Voice B continuation; Root allocation 2026-10-19. This journal
-- never consumes ordered session control sequence numbers or watermarks.
CREATE TABLE IF NOT EXISTS voice.recording_continuation_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id uuid NOT NULL REFERENCES voice.session (voice_session_id),
  recording_id text NOT NULL,
  leg_id text NOT NULL,
  event_key text NOT NULL,
  event_kind text NOT NULL CHECK (event_kind IN ('segment','checkpoint','closure','finalized')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voice_session_id, recording_id, event_key),
  CHECK (length(recording_id) > 0 AND length(leg_id) > 0 AND length(event_key) > 0),
  CHECK (payload->>'kind' IS NOT DISTINCT FROM event_kind AND payload->>'eventKey' IS NOT DISTINCT FROM event_key),
  CHECK (payload->'scope'->>'recordingId' IS NOT DISTINCT FROM recording_id AND payload->'scope'->>'legId' IS NOT DISTINCT FROM leg_id)
);
CREATE INDEX IF NOT EXISTS idx_voice_recording_continuation_scope
  ON voice.recording_continuation_event (voice_session_id, recording_id, created_at, event_id);
SELECT voice._make_append_only('voice.recording_continuation_event');
