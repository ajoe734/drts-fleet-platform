-- V0029 is immutable and may already be recorded in long-lived environments.
-- Reconcile both the indexed columns and the JSON source rehydrated by the API.
WITH expected_roles (user_id, tenant_id, role_code) AS (
  VALUES
    (
      '10000000-0000-0000-0000-000000000901',
      '10000000-0000-0000-0000-000000000201',
      'tenant_admin'
    ),
    (
      '10000000-0000-0000-0000-000000000902',
      '10000000-0000-0000-0000-000000000201',
      'tenant_ops_admin'
    ),
    (
      '10000000-0000-0000-0000-000000000903',
      '10000000-0000-0000-0000-000000000201',
      'tenant_finance_admin'
    ),
    (
      '10000000-0000-0000-0000-000000000904',
      '10000000-0000-0000-0000-000000000201',
      'tenant_viewer'
    )
), reconciled AS (
  SELECT
    users.user_id,
    expected.tenant_id,
    expected.role_code,
    now() AS reconciled_at,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            users.record,
            '{tenantId}',
            to_jsonb(expected.tenant_id),
            true
          ),
          '{roleCode}',
          to_jsonb(expected.role_code),
          true
        ),
        '{status}',
        '"active"'::jsonb,
        true
      ),
      '{updatedAt}',
      to_jsonb(now()),
      true
    ) AS record
  FROM admin.phase1_tenant_user_roles users
  JOIN expected_roles expected ON expected.user_id = users.user_id
)
UPDATE admin.phase1_tenant_user_roles users
SET tenant_id = reconciled.tenant_id,
    role_code = reconciled.role_code,
    status = 'active',
    updated_at = reconciled.reconciled_at,
    record = reconciled.record
FROM reconciled
WHERE users.user_id = reconciled.user_id;
