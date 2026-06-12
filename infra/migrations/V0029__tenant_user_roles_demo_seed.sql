WITH tenant_user_seed (
  user_id,
  tenant_id,
  email,
  display_name,
  role_code,
  status,
  approval_notification_opt_out,
  invited_at,
  updated_at
) AS (
  VALUES
    (
      '10000000-0000-0000-0000-000000000901',
      '10000000-0000-0000-0000-000000000201',
      'admin@acme.example',
      'Acme Tenant Admin',
      'tenant_admin',
      'active',
      false,
      '2026-04-10T00:00:00Z'::timestamptz,
      now()
    ),
    (
      '10000000-0000-0000-0000-000000000902',
      '10000000-0000-0000-0000-000000000201',
      'ops@acme.example',
      'Acme Tenant Ops',
      'tenant_ops_admin',
      'active',
      false,
      '2026-04-10T00:10:00Z'::timestamptz,
      now()
    ),
    (
      '10000000-0000-0000-0000-000000000903',
      '10000000-0000-0000-0000-000000000201',
      'finance@acme.example',
      'Acme Tenant Finance',
      'tenant_finance_admin',
      'active',
      false,
      '2026-04-10T00:20:00Z'::timestamptz,
      now()
    ),
    (
      '10000000-0000-0000-0000-000000000904',
      '10000000-0000-0000-0000-000000000201',
      'viewer@acme.example',
      'Acme Tenant Viewer',
      'tenant_viewer',
      'active',
      false,
      '2026-04-10T00:30:00Z'::timestamptz,
      now()
    )
),
prepared_tenant_user_seed AS (
  SELECT
    user_id,
    tenant_id,
    role_code,
    status,
    invited_at,
    updated_at,
    jsonb_build_object(
      'userId', user_id,
      'tenantId', tenant_id,
      'email', email,
      'displayName', display_name,
      'roleCode', role_code,
      'status', status,
      'approvalNotificationOptOut', approval_notification_opt_out,
      'invitedAt', invited_at,
      'updatedAt', updated_at
    ) AS record,
    email
  FROM tenant_user_seed
)
INSERT INTO admin.phase1_tenant_user_roles (
  user_id,
  tenant_id,
  role_code,
  status,
  invited_at,
  updated_at,
  record
)
SELECT
  seed.user_id,
  seed.tenant_id,
  seed.role_code,
  seed.status,
  seed.invited_at,
  seed.updated_at,
  seed.record
FROM prepared_tenant_user_seed seed
WHERE NOT EXISTS (
  SELECT 1
  FROM admin.phase1_tenant_user_roles existing
  WHERE existing.tenant_id = seed.tenant_id
    AND lower(existing.record ->> 'email') = lower(seed.email)
)
ON CONFLICT (user_id) DO UPDATE SET
  tenant_id = EXCLUDED.tenant_id,
  role_code = EXCLUDED.role_code,
  status = EXCLUDED.status,
  invited_at = EXCLUDED.invited_at,
  updated_at = EXCLUDED.updated_at,
  record = EXCLUDED.record;
