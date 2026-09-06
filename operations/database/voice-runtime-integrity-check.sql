-- voice-runtime-integrity-check.sql
-- UV-EXEC-002 read-only health check for the voice-booking runtime tables
-- (SD §7.5). Safe to run at any time against a live database: every query
-- here is a SELECT, nothing is written or locked beyond a normal read.
--
-- This does not replace the guard checks embedded in
-- infra/migrations/V0088__voice_runtime_identity_linkage.sql (those run once,
-- at migration time, and block the migration on violation). This script is
-- for ongoing drift detection *after* that migration has already succeeded --
-- e.g. a hand-run data fix, an out-of-band import, or a bug in a writer that
-- bypasses the generated-column invariant some other way.
--
-- Remediation runbook for any row this script reports:
--   1. Never delete or truncate the reported row to make the report go away.
--      It is a real order or call session and is itself evidence.
--   2. Duplicate call_id / voice_intent_id / linked_order_id: identify the
--      authoritative row (earliest created_at unless a documented manual
--      correction says otherwise) and null the conflicting field on the
--      JSON `record` of the other row(s) via an audited, one-off data-fix
--      migration.
--   3. Dangling call_id / linked_order_id: confirm which side is wrong
--      against admin.audit_logs, then correct or null the wrong side's
--      `record` JSON. Do not fabricate a placeholder row on the other side.
--   4. JSON vs. real-column drift (status only, today): the typed `status`
--      column is what indexes/FKs and most reads rely on; treat it as
--      authoritative and correct `record->>'status'` to match, unless the
--      audit log shows the column write itself was the bug.

\echo '--- duplicate call_id across ops.phase1_owned_orders ---'
SELECT NULLIF(record ->> 'callId', '') AS call_id, count(*) AS order_count,
       string_agg(order_id, ', ') AS order_ids
FROM ops.phase1_owned_orders
WHERE NULLIF(record ->> 'callId', '') IS NOT NULL
GROUP BY 1
HAVING count(*) > 1;

\echo '--- duplicate voice_intent_id across ops.phase1_owned_orders ---'
SELECT NULLIF(record ->> 'voiceIntentId', '') AS voice_intent_id, count(*) AS order_count,
       string_agg(order_id, ', ') AS order_ids
FROM ops.phase1_owned_orders
WHERE NULLIF(record ->> 'voiceIntentId', '') IS NOT NULL
GROUP BY 1
HAVING count(*) > 1;

\echo '--- dangling callId on ops.phase1_owned_orders (no matching call session) ---'
SELECT o.order_id, o.record ->> 'callId' AS call_id
FROM ops.phase1_owned_orders o
LEFT JOIN crm.phase1_call_sessions cs ON cs.call_id = NULLIF(o.record ->> 'callId', '')
WHERE NULLIF(o.record ->> 'callId', '') IS NOT NULL
  AND cs.call_id IS NULL;

\echo '--- duplicate linkedOrderId across crm.phase1_call_sessions ---'
SELECT NULLIF(record ->> 'linkedOrderId', '') AS linked_order_id, count(*) AS call_count,
       string_agg(call_id, ', ') AS call_ids
FROM crm.phase1_call_sessions
WHERE NULLIF(record ->> 'linkedOrderId', '') IS NOT NULL
GROUP BY 1
HAVING count(*) > 1;

\echo '--- dangling linkedOrderId on crm.phase1_call_sessions (no matching order) ---'
SELECT cs.call_id, cs.record ->> 'linkedOrderId' AS linked_order_id
FROM crm.phase1_call_sessions cs
LEFT JOIN ops.phase1_owned_orders o ON o.order_id = NULLIF(cs.record ->> 'linkedOrderId', '')
WHERE NULLIF(cs.record ->> 'linkedOrderId', '') IS NOT NULL
  AND o.order_id IS NULL;

\echo '--- JSON record vs. real column drift: ops.phase1_owned_orders.status ---'
SELECT order_id, status AS column_status, record ->> 'status' AS json_status
FROM ops.phase1_owned_orders
WHERE record ->> 'status' IS DISTINCT FROM status
LIMIT 100;

\echo '--- JSON record vs. real column drift: crm.phase1_call_sessions.status ---'
SELECT call_id, status AS column_status, record ->> 'status' AS json_status
FROM crm.phase1_call_sessions
WHERE record ->> 'status' IS DISTINCT FROM status
LIMIT 100;

\echo '--- voice.command_receipt stuck pending (older than 1 hour, needs reconciliation) ---'
SELECT command_id, intent_id, action, created_at
FROM voice.command_receipt
WHERE status = 'pending'
  AND updated_at < now() - interval '1 hour'
ORDER BY updated_at ASC
LIMIT 100;

\echo 'voice-runtime-integrity-check: read-only checks complete'
