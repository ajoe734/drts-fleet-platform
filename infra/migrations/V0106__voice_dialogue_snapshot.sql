-- V0106__voice_dialogue_snapshot.sql
-- AUDIT-VOICE-APPLICATION-WIRING-20261003 R4: a versioned, encrypted,
-- retention-bounded durable record of a voice session's actual dialogue
-- state (slots/address history/handoff reason), fenced by the same
-- session/scope/lease/input/media/revision identifiers every other trusted
-- write in this domain already CAS-fences against.
--
-- This is deliberately a NEW table, not a reuse of voice.draft_revision
-- (booking-intent drafts, keyed by intent_id/draft_version -- a different
-- domain object with its own qualification/confirmation lifecycle) or
-- voice.turn (per-ASR-segment transcript evidence, no session/scope/lease/
-- revision CAS fields at all). Coordinator-reserved scope, see
-- .local/project-fixes-20261002/EXECUTION.md's "Voice schema coordination,
-- 2026-10-03 after checkpoint 1994a76ec".
--
-- One row per (voice_session_id, session_version): a snapshot is only ever
-- written immediately after a trusted `VoiceSessionService.resolveInput` CAS
-- advances the session's revision for the turn whose content this row
-- records, so `session_version` is both the dedup key (a retried write for
-- the same already-advanced revision is a safe no-op, same convention as
-- `voice.session_event`'s `insertControlEvent`) and the FK a restore read
-- correlates against. Append-only, like every other evidence table in this
-- schema (`voice._make_append_only`, defined in
-- V0086__voice_persistence_domain_schema.sql) -- a dialogue snapshot is
-- call evidence, never retroactively edited.

CREATE TABLE IF NOT EXISTS voice.dialogue_snapshot (
  snapshot_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id uuid NOT NULL REFERENCES voice.session (voice_session_id),
  session_version integer NOT NULL,
  resource_scope_id uuid NOT NULL,
  route_profile_version integer NOT NULL,
  lease_epoch integer NOT NULL,
  input_epoch integer NOT NULL,
  media_epoch integer NOT NULL,
  turn_id varchar(100) NOT NULL,
  -- AES-256-GCM, server-side at apps/api (the key never reaches
  -- voice-media-worker or crosses the wire): see
  -- apps/api/src/modules/voice-booking/voice-dialogue-snapshot-crypto.ts.
  -- `content_key_version` lets a future key rotation decrypt old rows
  -- without rewriting them (an append-only table cannot be rewritten).
  content_key_version varchar(50) NOT NULL,
  content_nonce bytea NOT NULL,
  content_ciphertext bytea NOT NULL,
  content_auth_tag bytea NOT NULL,
  -- SD §9.2 "未定義保存期限不能默認永久": always computed from
  -- VoiceRetentionService.evaluateRecordRetention's "voice_transcript"
  -- policy at write time, never left to default/NULL.
  retention_expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_voice_dialogue_snapshot_session_version
  ON voice.dialogue_snapshot (voice_session_id, session_version);
CREATE INDEX IF NOT EXISTS idx_voice_dialogue_snapshot_latest
  ON voice.dialogue_snapshot (voice_session_id, session_version DESC);
CREATE INDEX IF NOT EXISTS idx_voice_dialogue_snapshot_retention
  ON voice.dialogue_snapshot (retention_expires_at);

SELECT voice._make_append_only('voice.dialogue_snapshot');
