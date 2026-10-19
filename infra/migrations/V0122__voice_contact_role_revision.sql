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
--
-- `role_source` (review round 2, AUDIT-VOICE-APPLICATION-REGRESSION-20261018
-- F7): a TYPED discriminator for whether this `driverContact`/
-- `callbackRecipient` revision is an internal "defaults to booker/passenger"
-- POINTER (written only by `VoiceContactService.initializeContacts` itself,
-- reason literally `default_role:<role>`) versus an EXPLICIT human
-- correction (`updateContactRole`). Before this column, cold reconstruction
-- regex-matched the free-form `reason` TEXT itself
-- (`/^default_role:(booker|passenger)$/`) to tell the two apart -- a
-- genuine correction reason that happened to equal that exact string (e.g.
-- an operator typing "default_role:passenger" as their literal reason) was
-- silently reinterpreted as the internal pointer and lost its own value on
-- the next restart. `role_source` is set programmatically by the service,
-- never from caller-supplied text, so no `reason` string content can ever
-- change which branch cold reconstruction takes.
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
  role_source       text NOT NULL DEFAULT 'explicit' CHECK (
    role_source IN ('default_pointer', 'explicit')
  ),
  replaced_revision integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voice_session_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_voice_contact_role_revision_session_role
  ON voice.contact_role_revision (voice_session_id, role, revision_number DESC);

SELECT voice._make_append_only('voice.contact_role_revision');

-- One immutable creation snapshot per task. A recipient replacement creates
-- a new task after the original is cancelled through its existing CAS action;
-- the original task/receipt always keeps its original phone and consent.
CREATE TABLE IF NOT EXISTS voice.callback_task_contact_binding (
  binding_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id           uuid NOT NULL UNIQUE REFERENCES voice.callback_task (task_id),
  voice_session_id  uuid NOT NULL REFERENCES voice.session (voice_session_id),
  role              text NOT NULL CHECK (role = 'callbackRecipient'),
  revision_number   integer NOT NULL,
  bind_reason       text NOT NULL,
  replaces_task_id  uuid REFERENCES voice.callback_task (task_id),
  bound_at          timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (voice_session_id, revision_number)
    REFERENCES voice.contact_role_revision (voice_session_id, revision_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_voice_callback_contact_replacement
  ON voice.callback_task_contact_binding (replaces_task_id)
  WHERE replaces_task_id IS NOT NULL;
SELECT voice._make_append_only('voice.callback_task_contact_binding');
