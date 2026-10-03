-- Aggregate-only observations of production migration tables. No business writes.
-- This is a comparison at a cutoff, not an as-of reconstruction of the live source.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '3s';
WITH observations AS (
  SELECT 'ops.phase1_owned_orders' AS table_name, count(*) AS row_count,
    max(created_at) AS max_created_at, max(updated_at) AS max_updated_at,
    count(*) FILTER (WHERE greatest(created_at, updated_at) <= :'point'::timestamptz) AS cutoff_count,
    max(greatest(created_at, updated_at)) FILTER (WHERE greatest(created_at, updated_at) <= :'point'::timestamptz) AS cutoff_last_write
  FROM ops.phase1_owned_orders
  UNION ALL
  SELECT 'core.phase1_tenant_passengers', count(*), max(created_at), max(updated_at),
    count(*) FILTER (WHERE greatest(created_at, updated_at) <= :'point'::timestamptz),
    max(greatest(created_at, updated_at)) FILTER (WHERE greatest(created_at, updated_at) <= :'point'::timestamptz)
  FROM core.phase1_tenant_passengers
  UNION ALL
  SELECT 'reg.phase1_registry_contracts', count(*), max(created_at), max(updated_at),
    count(*) FILTER (WHERE greatest(created_at, updated_at) <= :'point'::timestamptz),
    max(greatest(created_at, updated_at)) FILTER (WHERE greatest(created_at, updated_at) <= :'point'::timestamptz)
  FROM reg.phase1_registry_contracts
  UNION ALL
  SELECT 'ops.phase1_notification_mail_deliveries', count(*), max(created_at), max(updated_at),
    count(*) FILTER (WHERE greatest(created_at, updated_at) <= :'point'::timestamptz),
    max(greatest(created_at, updated_at)) FILTER (WHERE greatest(created_at, updated_at) <= :'point'::timestamptz)
  FROM ops.phase1_notification_mail_deliveries
)
SELECT json_build_object('observed_at', clock_timestamp(),
  'database_bytes', pg_database_size(current_database()),
  'tables', json_agg(observations ORDER BY table_name)) FROM observations;
COMMIT;
