-- Operational query leaf, not a migration. The caller holds a transaction-local
-- table lock before selecting, exporting, verifying and deleting this fixed set.
CREATE TEMP TABLE audit_retention_candidates ON COMMIT DROP AS
WITH latest_governance AS (
  SELECT g.*
  FROM admin.audit_logs g
  WHERE g.resource_type IN ('evidence_legal_hold', 'evidence_deletion_exception')
    AND NOT EXISTS (
      SELECT 1 FROM admin.audit_logs newer
      WHERE newer.resource_type = g.resource_type
        AND newer.resource_id = g.resource_id
        AND (
          newer.created_at > g.created_at
          OR (newer.created_at = g.created_at
            AND newer.new_value->>'status' IN ('released', 'resolved')
            AND g.new_value->>'status' = 'active')
          OR (newer.created_at = g.created_at
            AND newer.new_value->>'status' = g.new_value->>'status'
            AND newer.audit_id::text > g.audit_id::text)
        )
    )
), active_protections AS (
  SELECT g.* FROM latest_governance g
  WHERE g.new_value->>'status' = 'active'
    AND (g.resource_type = 'evidence_legal_hold'
      OR (g.new_value->>'expiresAt')::timestamptz > CURRENT_TIMESTAMP)
), age_eligible AS (
  SELECT a.* FROM admin.audit_logs a
  WHERE a.created_at < (CURRENT_TIMESTAMP - (:'retention_days'::integer * INTERVAL '1 day'))
    AND NOT EXISTS (
      SELECT 1 FROM active_protections p
      WHERE
        -- Preserve the persisted authority for every active protection.
        (a.resource_type = p.resource_type AND a.resource_id = p.resource_id)
        OR (
          -- Payload tenant is retained even when a non-UUID application tenant
          -- was normalized to NULL in the physical audit tenant column.
          (NULLIF(p.new_value->>'tenantId', '') IS NULL
            OR COALESCE(NULLIF(a.new_value->>'tenantId', ''), a.tenant_id::text) IS NULL
            OR p.new_value->>'tenantId' = COALESCE(
              NULLIF(a.new_value->>'tenantId', ''), a.tenant_id::text))
          AND (
            (p.new_value->>'family' = 'audit_log'
              AND p.new_value->>'subjectId' = a.audit_id::text)
            OR (p.new_value->>'family' = a.resource_type
              AND p.new_value->>'subjectId' = a.resource_id)
            OR (p.new_value->>'family' = a.new_value->>'family'
              AND p.new_value->>'subjectId' = a.new_value->>'subjectId')
            OR (NULLIF(p.new_value->>'manifestHash', '') IS NOT NULL
              AND p.new_value->>'manifestHash' = a.new_value->>'manifestHash')
            OR (p.resource_type = 'evidence_deletion_exception'
              AND p.new_value->>'sourceResourceType' = a.resource_type
              AND p.new_value->>'sourceResourceId' = a.resource_id)
          )
        )
    )
)
SELECT eligible.* FROM age_eligible eligible
WHERE eligible.resource_type NOT IN ('evidence_legal_hold', 'evidence_deletion_exception')
   OR NOT EXISTS (
     -- Never prune only the terminal event and resurrect an older active event
     -- on restart. A closed/expired entity's history can leave together once all
     -- its rows have reached the existing cutoff and are otherwise unprotected.
     SELECT 1 FROM admin.audit_logs history
     WHERE history.resource_type = eligible.resource_type
       AND history.resource_id = eligible.resource_id
       AND NOT EXISTS (
         SELECT 1 FROM age_eligible ready WHERE ready.audit_id = history.audit_id
       )
   );
