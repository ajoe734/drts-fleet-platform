-- admin.audit_logs.actor_id is uuid (V0009), but every real principal ID is
-- `principal_<uuid>`. Writers stored normalizeUuidOrNull(actorId), so durable
-- audit rows lost their actor: GET /api/audit?auditId= read it back as null.
-- actor_ref keeps the actor identifier verbatim. Additive only; existing rows
-- are unchanged (the table is append-only, V0080).
ALTER TABLE admin.audit_logs
  ADD COLUMN IF NOT EXISTS actor_ref varchar(255);
