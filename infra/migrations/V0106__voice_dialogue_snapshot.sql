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

-- AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-persist (Codex reopen,
-- canonical 2026-10-03T23:31:57Z, "three successful null reads are no more
-- a fence against late acceptance than one"): a worker that lost a
-- `persistDialogueSnapshot` acknowledgement can never learn, from
-- bounded client-side polling alone, whether that write will still land at
-- some later moment -- an authoritative "this exact version will NEVER be
-- accepted" verdict can only come from the server durably fencing it before
-- conceding. This watermark is that fence: any `voice.dialogue_snapshot`
-- insert attempt for a `session_version` at or below it is rejected (see
-- `VoiceSessionRepository.insertDialogueSnapshot`'s own doc and
-- `VoiceSessionService.resolveDialogueSnapshotOutcome`, which is the only
-- writer of this column), closing the race where a delayed write lands
-- in the narrow window before any successor turn has advanced
-- `session_version` far enough for the pre-existing CAS check in
-- `assertWriteAuthorized` to catch it on its own.
ALTER TABLE voice.session
  ADD COLUMN IF NOT EXISTS dialogue_snapshot_fence_version integer NOT NULL DEFAULT 0;

-- AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-resolve governed purge loses
-- accepted-history distinction (Codex reopen, canonical
-- 2026-10-04T01:25:05Z): `VoiceSessionService.purgeExpiredDialogueSnapshots`
-- physically deletes an aged `voice.dialogue_snapshot` row once no legal
-- hold applies (see `VoiceSessionRepository.deleteDialogueSnapshot`'s own
-- doc) -- after that, `resolveDialogueSnapshotOutcome`'s exact-version
-- lookup returns nothing, which the previous code could not distinguish
-- from "this write never landed," and so falsely durably voided an
-- adjudication for a request that WAS historically accepted.
--
-- This table is bounded, non-content acceptance metadata ONLY --
-- identity, the row's own original `retention_expires_at`, and when it
-- was purged -- never the dialogue content itself (purging that content is
-- the whole point of the sweep this receipt records). One row per
-- (voice_session_id, session_version), written in the SAME transaction as
-- the `DELETE` it accompanies (see `deleteDialogueSnapshot`), so the two
-- can never diverge. Append-only, like the table it survives.
CREATE TABLE IF NOT EXISTS voice.dialogue_snapshot_purge_receipt (
  voice_session_id uuid NOT NULL REFERENCES voice.session (voice_session_id),
  session_version integer NOT NULL,
  input_epoch integer NOT NULL,
  media_epoch integer NOT NULL,
  turn_id varchar(100) NOT NULL,
  retention_expires_at timestamptz NOT NULL,
  purged_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (voice_session_id, session_version)
);

SELECT voice._make_append_only('voice.dialogue_snapshot_purge_receipt');

-- AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention purge-receipt
-- lifecycle (Codex reopen, canonical 2026-10-04T02:13:45Z, "new purge
-- receipts have no governed lifetime"): the receipt row above has no
-- policy-registered retention of its own -- its `retention_expires_at` is
-- the ALREADY-expired CONTENT row's past expiry, never a lifetime for
-- this metadata row itself -- so it would otherwise accumulate one row per
-- purged turn/session forever. phase1-unattended-voice-booking-sd-20260906
-- .md §9.2 forbids default-indefinite retention for a new metadata family.
-- `VoiceSessionService.purgeExpiredDialogueSnapshotPurgeReceipts` instead
-- ages these out under the EXISTING approved `voice_booking_evidence`
-- family (confirmation/command/manifest metadata, already 730-day bounded
-- and legal-hold-aware) rather than registering a brand new one.
--
-- Deleting a receipt must never reopen its own
-- `(voice_session_id, session_version)` key for write reuse (see
-- `VoiceSessionRepository.insertDialogueSnapshot`'s own `WHERE NOT EXISTS`
-- guard against this exact table), nor let a later
-- `resolveDialogueSnapshotOutcome` call mistake "the metadata proof itself
-- aged out" for "this write definitively never landed." This monotonic
-- per-session floor is raised (`GREATEST`, same convention as
-- `dialogue_snapshot_fence_version` above) in the SAME transaction as the
-- receipt delete (see `retireDialogueSnapshotPurgeReceipt`) -- a crash
-- between the two leaves either both committed or neither. Deliberately a
-- SEPARATE column from `dialogue_snapshot_fence_version`: that one means
-- "already known non-acceptance" (write genuinely never landed);
-- this one means "was accepted, proof now governed-expired" --
-- `resolveDialogueSnapshotOutcome` answers `accepted: "unknown"` for the
-- latter, never a false confirmed rejection.
ALTER TABLE voice.session
  ADD COLUMN IF NOT EXISTS dialogue_snapshot_history_unavailable_floor integer NOT NULL DEFAULT 0;

-- AUDIT-VOICE-APPLICATION-WIRING-20261003 R4-retention held-page
-- starvation (Codex reopen, canonical 2026-10-04T03:06:22Z, reopened again
-- canonical 2026-10-04T03:36:06Z, "the 50-page cap merely moves the
-- held-prefix starvation point"): `VoiceSessionService
-- .purgeExpiredDialogueSnapshotPurgeReceipts` bounds each invocation to
-- `MAX_PURGE_RECEIPT_SCAN_PAGES` pages for safety, but a backlog of legally
-- held receipts deeper than that bound would otherwise starve every unheld
-- receipt behind it forever -- each invocation restarting its scan from the
-- oldest row re-examines the exact same held prefix every time. This
-- singleton row persists the keyset position (see
-- `DialogueSnapshotPurgeReceiptCursor`) the scan stopped at when it hit the
-- page bound mid-backlog, so the NEXT invocation resumes past the held run
-- instead of restarting at its front; it is cleared (all columns NULL)
-- once a scan reaches the actual end of the eligible backlog, so the
-- following invocation legitimately restarts from the oldest row to
-- re-check any holds that may have since been released.
CREATE TABLE IF NOT EXISTS voice.dialogue_snapshot_purge_receipt_scan_cursor (
  id boolean PRIMARY KEY DEFAULT true,
  purged_at_text text NULL,
  voice_session_id uuid NULL,
  session_version integer NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dialogue_snapshot_purge_receipt_scan_cursor_singleton CHECK (id)
);

INSERT INTO voice.dialogue_snapshot_purge_receipt_scan_cursor (id)
  VALUES (true)
  ON CONFLICT (id) DO NOTHING;
