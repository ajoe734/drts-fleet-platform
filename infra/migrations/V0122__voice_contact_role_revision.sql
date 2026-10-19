-- V0122__voice_contact_role_revision.sql
-- AUDIT-VOICE-APPLICATION-REGRESSION-20261018 Package C: a durable,
-- append-only revision ledger for `VoiceContactService` (SD §6.4), which
-- until this migration was a process-local, RAM-only `Map` with no
-- persistence and no mounted production caller -- a restart or a second
-- instance lost every asserted caller phone, role assignment and consent
-- reference. Root-reserved scope, see
-- .local/passenger-bureau-gap-correction-20261018/Voice-C-V0122-exact-root-allocation-20261018/result.json.
--
-- One row per revision, EVER (never updated, never deleted): `caller`,
-- `booker` and `passenger` are seeded at session start (revisions 1-3),
-- and `driverContact`/`callbackRecipient` custom overrides or role
-- corrections append further revisions. `revision_number` is a SINGLE
-- counter per voice_session_id shared across every role (matching
-- `VoiceContactService.updateContactRole`'s existing
-- `++state.latestRevisionNumber` contract: a passenger correction after
-- two prior revisions becomes revision 4, not "passenger revision 2"),
-- so the natural dedup/ordering key is (voice_session_id, revision_number)
-- -- the `role` column identifies WHICH role a given revision belongs to,
-- it does not re-scope the counter.
--
-- `phone_key_version`/`phone_nonce`/`phone_ciphertext`/`phone_auth_tag`
-- reuse the SAME AES-256-GCM envelope convention as
-- `voice.dialogue_snapshot.content_ciphertext`
-- (apps/api/src/modules/voice-booking/voice-dialogue-snapshot-crypto.ts) --
-- a bare `phone_ciphertext text` column could not carry that convention's
-- nonce/auth-tag, so it is not a sufficient column set for "the same
-- existing encrypted-at-rest convention" the task's own proposal required.
-- The key never leaves apps/api; `associatedData` binds each row to its
-- own (voice_session_id, role, revision_number), so a ciphertext/row
-- substitution fails the authenticated-tag check the same way a tamper
-- would (same rationale as the dialogue-snapshot crypto module's own doc).
--
-- `consent_ref` is nullable: the `caller` role's revision-1 seed and any
-- role whose contact was never re-consented legitimately has none; a
-- non-null value is an opaque reference into existing consent evidence
-- (SD §12.5 callback consent, VoiceConfirmationService proof), not a new
-- consent record of its own.
--
-- Append-only like every other evidence table in this schema
-- (`voice._make_append_only`, V0086__voice_persistence_domain_schema.sql):
-- a contact revision is immutable history, never retroactively edited.

CREATE TABLE IF NOT EXISTS voice.contact_role_revision (
  revision_id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voice_session_id  uuid NOT NULL REFERENCES voice.session (voice_session_id),
  role              text NOT NULL CHECK (
    role IN ('caller', 'booker', 'passenger', 'driverContact', 'callbackRecipient')
  ),
  revision_number   integer NOT NULL,
  name              text NOT NULL,
  phone_key_version varchar(50) NOT NULL,
  phone_nonce       bytea NOT NULL,
  phone_ciphertext  bytea NOT NULL,
  phone_auth_tag    bytea NOT NULL,
  consent_ref       text,
  reason            text NOT NULL,
  replaced_revision integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voice_session_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_voice_contact_role_revision_session_role
  ON voice.contact_role_revision (voice_session_id, role, revision_number DESC);

SELECT voice._make_append_only('voice.contact_role_revision');
