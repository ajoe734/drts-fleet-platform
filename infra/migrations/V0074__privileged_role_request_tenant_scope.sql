ALTER TABLE iam.privileged_role_requests
  ADD COLUMN IF NOT EXISTS tenant_id varchar(100);

UPDATE iam.privileged_role_requests AS request
SET tenant_id = membership.tenant_id
FROM iam.identity_memberships AS membership
WHERE request.membership_id = membership.membership_id
  AND request.realm = 'tenant'
  AND request.tenant_id IS NULL;

ALTER TABLE iam.privileged_role_requests
  ADD CONSTRAINT chk_privileged_role_request_tenant_scope CHECK (
    (realm = 'tenant' AND tenant_id IS NOT NULL)
    OR (realm <> 'tenant' AND tenant_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_privileged_role_requests_tenant
  ON iam.privileged_role_requests(tenant_id, updated_at DESC)
  WHERE tenant_id IS NOT NULL;
