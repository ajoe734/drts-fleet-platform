CREATE SCHEMA IF NOT EXISTS iam;

CREATE TABLE IF NOT EXISTS iam.identity_principals (
  principal_id varchar(100) PRIMARY KEY,
  source_ref varchar(255) UNIQUE,
  issuer varchar(255) NOT NULL,
  subject varchar(255) NOT NULL,
  principal_type varchar(50) NOT NULL,
  email_normalized varchar(320),
  email_verified boolean NOT NULL DEFAULT false,
  display_name varchar(255),
  account_status varchar(50) NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT uq_identity_principals_issuer_subject UNIQUE (issuer, subject),
  CONSTRAINT chk_identity_principals_type CHECK (
    principal_type IN ('human', 'service', 'device', 'partner_machine')
  ),
  CONSTRAINT chk_identity_principals_status CHECK (
    account_status IN (
      'invited',
      'pending_verification',
      'active',
      'locked',
      'suspended',
      'disabled',
      'deletion_pending',
      'deleted',
      'migration_pending'
    )
  )
);

CREATE TABLE IF NOT EXISTS iam.identity_memberships (
  membership_id varchar(100) PRIMARY KEY,
  source_ref varchar(255) UNIQUE,
  principal_id varchar(100) NOT NULL REFERENCES iam.identity_principals(principal_id),
  realm varchar(50) NOT NULL,
  scope_ref varchar(255) NOT NULL,
  tenant_id varchar(100),
  partner_id varchar(100),
  membership_status varchar(50) NOT NULL,
  invited_by_principal_id varchar(100) REFERENCES iam.identity_principals(principal_id),
  invitation_id varchar(100),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT uq_identity_memberships_context UNIQUE (principal_id, realm, scope_ref),
  CONSTRAINT chk_identity_memberships_status CHECK (
    membership_status IN (
      'invited',
      'pending_verification',
      'active',
      'locked',
      'suspended',
      'disabled',
      'deletion_pending',
      'deleted',
      'migration_pending'
    )
  )
);

CREATE TABLE IF NOT EXISTS iam.identity_role_bindings (
  role_binding_id varchar(100) PRIMARY KEY,
  source_ref varchar(255) UNIQUE,
  membership_id varchar(100) NOT NULL REFERENCES iam.identity_memberships(membership_id) ON DELETE CASCADE,
  role_code varchar(100) NOT NULL,
  granted_by_principal_id varchar(100) REFERENCES iam.identity_principals(principal_id),
  approval_id varchar(100),
  valid_from timestamptz NOT NULL,
  valid_to timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS iam.identity_invitations (
  invitation_id varchar(100) PRIMARY KEY,
  source_ref varchar(255) UNIQUE,
  membership_id varchar(100) NOT NULL REFERENCES iam.identity_memberships(membership_id) ON DELETE CASCADE,
  issuer_principal_id varchar(100) REFERENCES iam.identity_principals(principal_id),
  realm varchar(50) NOT NULL,
  scope_ref varchar(255) NOT NULL,
  tenant_id varchar(100),
  partner_id varchar(100),
  target_email varchar(320) NOT NULL,
  role_code varchar(100) NOT NULL,
  token_hash varchar(128) NOT NULL UNIQUE,
  delivery_status varchar(50) NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  record jsonb NOT NULL,
  CONSTRAINT chk_identity_invitations_delivery_status CHECK (
    delivery_status IN (
      'pending_delivery',
      'delivered',
      'legacy_backfill',
      'delivery_failed'
    )
  )
);

ALTER TABLE iam.identity_memberships
  DROP CONSTRAINT IF EXISTS fk_identity_memberships_invitation;

ALTER TABLE iam.identity_memberships
  ADD CONSTRAINT fk_identity_memberships_invitation
  FOREIGN KEY (invitation_id) REFERENCES iam.identity_invitations(invitation_id);

CREATE INDEX IF NOT EXISTS idx_identity_principals_status
  ON iam.identity_principals(account_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_principals_email
  ON iam.identity_principals(email_normalized, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_memberships_scope
  ON iam.identity_memberships(realm, scope_ref, membership_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_memberships_tenant
  ON iam.identity_memberships(tenant_id, membership_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_role_bindings_membership
  ON iam.identity_role_bindings(membership_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_invitations_membership
  ON iam.identity_invitations(membership_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_identity_invitations_scope
  ON iam.identity_invitations(realm, scope_ref, expires_at DESC);

WITH legacy_tenant_users AS (
  SELECT
    user_id,
    tenant_id,
    role_code,
    status,
    invited_at,
    updated_at,
    lower(trim(coalesce(record->>'email', ''))) AS email_normalized,
    nullif(trim(coalesce(record->>'displayName', '')), '') AS display_name,
    'tenant_user_role:' || user_id AS source_prefix,
    'tenant:' || tenant_id AS scope_ref,
    'tenant:' || tenant_id || ':email:' || lower(trim(coalesce(record->>'email', ''))) AS legacy_subject
  FROM admin.phase1_tenant_user_roles
  WHERE trim(coalesce(record->>'email', '')) <> ''
), inserted_principals AS (
  INSERT INTO iam.identity_principals (
    principal_id,
    source_ref,
    issuer,
    subject,
    principal_type,
    email_normalized,
    email_verified,
    display_name,
    account_status,
    created_at,
    updated_at,
    record
  )
  SELECT
    'principal_' || user_id,
    source_prefix || ':principal',
    'legacy_tenant_email',
    legacy_subject,
    'human',
    email_normalized,
    false,
    display_name,
    CASE
      WHEN status = 'invited' THEN 'invited'
      WHEN status = 'suspended' THEN 'suspended'
      ELSE 'migration_pending'
    END,
    invited_at,
    updated_at,
    jsonb_build_object(
      'principalId', 'principal_' || user_id,
      'sourceRef', source_prefix || ':principal',
      'issuer', 'legacy_tenant_email',
      'subject', legacy_subject,
      'principalType', 'human',
      'email', email_normalized,
      'emailVerified', false,
      'displayName', display_name,
      'status', CASE
        WHEN status = 'invited' THEN 'invited'
        WHEN status = 'suspended' THEN 'suspended'
        ELSE 'migration_pending'
      END,
      'createdAt', invited_at,
      'updatedAt', updated_at
    )
  FROM legacy_tenant_users
  ON CONFLICT (source_ref) DO UPDATE SET
    issuer = EXCLUDED.issuer,
    subject = EXCLUDED.subject,
    principal_type = EXCLUDED.principal_type,
    email_normalized = EXCLUDED.email_normalized,
    email_verified = EXCLUDED.email_verified,
    display_name = EXCLUDED.display_name,
    account_status = EXCLUDED.account_status,
    updated_at = EXCLUDED.updated_at,
    record = EXCLUDED.record
  RETURNING principal_id, source_ref
), inserted_memberships AS (
  INSERT INTO iam.identity_memberships (
    membership_id,
    source_ref,
    principal_id,
    realm,
    scope_ref,
    tenant_id,
    partner_id,
    membership_status,
    invited_by_principal_id,
    invitation_id,
    created_at,
    updated_at,
    record
  )
  SELECT
    'membership_' || legacy.user_id,
    legacy.source_prefix || ':membership',
    principal.principal_id,
    'tenant',
    legacy.scope_ref,
    legacy.tenant_id,
    NULL,
    CASE
      WHEN legacy.status = 'invited' THEN 'invited'
      WHEN legacy.status = 'suspended' THEN 'suspended'
      ELSE 'migration_pending'
    END,
    NULL,
    NULL,
    legacy.invited_at,
    legacy.updated_at,
    jsonb_build_object(
      'membershipId', 'membership_' || legacy.user_id,
      'sourceRef', legacy.source_prefix || ':membership',
      'principalId', principal.principal_id,
      'realm', 'tenant',
      'scopeRef', legacy.scope_ref,
      'tenantId', legacy.tenant_id,
      'partnerId', NULL,
      'status', CASE
        WHEN legacy.status = 'invited' THEN 'invited'
        WHEN legacy.status = 'suspended' THEN 'suspended'
        ELSE 'migration_pending'
      END,
      'invitedByPrincipalId', NULL,
      'invitationId', NULL,
      'createdAt', legacy.invited_at,
      'updatedAt', legacy.updated_at
    )
  FROM legacy_tenant_users legacy
  JOIN iam.identity_principals principal
    ON principal.source_ref = legacy.source_prefix || ':principal'
  ON CONFLICT (source_ref) DO UPDATE SET
    principal_id = EXCLUDED.principal_id,
    realm = EXCLUDED.realm,
    scope_ref = EXCLUDED.scope_ref,
    tenant_id = EXCLUDED.tenant_id,
    partner_id = EXCLUDED.partner_id,
    membership_status = EXCLUDED.membership_status,
    updated_at = EXCLUDED.updated_at,
    record = EXCLUDED.record
  RETURNING membership_id, source_ref
), inserted_role_bindings AS (
  INSERT INTO iam.identity_role_bindings (
    role_binding_id,
    source_ref,
    membership_id,
    role_code,
    granted_by_principal_id,
    approval_id,
    valid_from,
    valid_to,
    created_at,
    updated_at,
    record
  )
  SELECT
    'role_binding_' || legacy.user_id,
    legacy.source_prefix || ':role_binding',
    membership.membership_id,
    legacy.role_code,
    NULL,
    NULL,
    legacy.invited_at,
    NULL,
    legacy.invited_at,
    legacy.updated_at,
    jsonb_build_object(
      'roleBindingId', 'role_binding_' || legacy.user_id,
      'sourceRef', legacy.source_prefix || ':role_binding',
      'membershipId', membership.membership_id,
      'roleCode', legacy.role_code,
      'grantedByPrincipalId', NULL,
      'approvalId', NULL,
      'validFrom', legacy.invited_at,
      'validTo', NULL,
      'createdAt', legacy.invited_at,
      'updatedAt', legacy.updated_at
    )
  FROM legacy_tenant_users legacy
  JOIN iam.identity_memberships membership
    ON membership.source_ref = legacy.source_prefix || ':membership'
  ON CONFLICT (source_ref) DO UPDATE SET
    membership_id = EXCLUDED.membership_id,
    role_code = EXCLUDED.role_code,
    updated_at = EXCLUDED.updated_at,
    record = EXCLUDED.record
  RETURNING role_binding_id, source_ref
), inserted_invitations AS (
  INSERT INTO iam.identity_invitations (
    invitation_id,
    source_ref,
    membership_id,
    issuer_principal_id,
    realm,
    scope_ref,
    tenant_id,
    partner_id,
    target_email,
    role_code,
    token_hash,
    delivery_status,
    expires_at,
    accepted_at,
    revoked_at,
    created_at,
    updated_at,
    record
  )
  SELECT
    'invitation_' || legacy.user_id,
    legacy.source_prefix || ':invitation',
    membership.membership_id,
    NULL,
    'tenant',
    legacy.scope_ref,
    legacy.tenant_id,
    NULL,
    legacy.email_normalized,
    legacy.role_code,
    encode(digest('legacy-tenant-invitation:' || legacy.user_id, 'sha256'), 'hex'),
    'legacy_backfill',
    legacy.invited_at + interval '24 hours',
    NULL,
    CASE
      WHEN legacy.status = 'invited' THEN NULL
      ELSE legacy.updated_at
    END,
    legacy.invited_at,
    legacy.updated_at,
    jsonb_build_object(
      'invitationId', 'invitation_' || legacy.user_id,
      'sourceRef', legacy.source_prefix || ':invitation',
      'membershipId', membership.membership_id,
      'issuerPrincipalId', NULL,
      'realm', 'tenant',
      'scopeRef', legacy.scope_ref,
      'tenantId', legacy.tenant_id,
      'partnerId', NULL,
      'email', legacy.email_normalized,
      'roleCode', legacy.role_code,
      'tokenHash', encode(digest('legacy-tenant-invitation:' || legacy.user_id, 'sha256'), 'hex'),
      'deliveryStatus', 'legacy_backfill',
      'expiresAt', legacy.invited_at + interval '24 hours',
      'acceptedAt', NULL,
      'revokedAt', CASE
        WHEN legacy.status = 'invited' THEN NULL
        ELSE legacy.updated_at
      END,
      'createdAt', legacy.invited_at,
      'updatedAt', legacy.updated_at
    )
  FROM legacy_tenant_users legacy
  JOIN iam.identity_memberships membership
    ON membership.source_ref = legacy.source_prefix || ':membership'
  ON CONFLICT (source_ref) DO UPDATE SET
    membership_id = EXCLUDED.membership_id,
    realm = EXCLUDED.realm,
    scope_ref = EXCLUDED.scope_ref,
    tenant_id = EXCLUDED.tenant_id,
    target_email = EXCLUDED.target_email,
    role_code = EXCLUDED.role_code,
    token_hash = EXCLUDED.token_hash,
    delivery_status = EXCLUDED.delivery_status,
    expires_at = EXCLUDED.expires_at,
    accepted_at = EXCLUDED.accepted_at,
    revoked_at = EXCLUDED.revoked_at,
    updated_at = EXCLUDED.updated_at,
    record = EXCLUDED.record
  RETURNING invitation_id, source_ref
)
UPDATE iam.identity_memberships membership
SET invitation_id = invitation.invitation_id,
    updated_at = GREATEST(membership.updated_at, invitation.updated_at),
    record = jsonb_set(
      membership.record,
      '{invitationId}',
      to_jsonb(invitation.invitation_id),
      true
    )
FROM iam.identity_invitations invitation
WHERE membership.source_ref = replace(invitation.source_ref, ':invitation', ':membership')
  AND membership.invitation_id IS DISTINCT FROM invitation.invitation_id;
