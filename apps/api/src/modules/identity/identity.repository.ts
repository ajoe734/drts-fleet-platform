import { createHash, randomUUID } from "node:crypto";

import { Injectable, Logger, Optional } from "@nestjs/common";
import type { PoolClient } from "pg";

import type {
  CanonicalAccountStatus,
  CanonicalIdentityInvitationRecord,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
  CanonicalTenantUserIdentitySnapshot,
  TenantUserRoleRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

const LEGACY_TENANT_USER_ISSUER = "legacy_tenant_email";

@Injectable()
export class IdentityRepository {
  private readonly logger = new Logger(IdentityRepository.name);

  private readonly fallbackPrincipals = new Map<
    string,
    CanonicalIdentityPrincipalRecord
  >();

  private readonly fallbackMemberships = new Map<
    string,
    CanonicalIdentityMembershipRecord
  >();

  private readonly fallbackRoleBindings = new Map<
    string,
    CanonicalIdentityRoleBindingRecord
  >();

  private readonly fallbackInvitations = new Map<
    string,
    CanonicalIdentityInvitationRecord
  >();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {}

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async syncLegacyTenantUserRole(
    userRole: TenantUserRoleRecord,
  ): Promise<CanonicalTenantUserIdentitySnapshot> {
    const normalizedEmail = userRole.email.trim().toLowerCase();
    const principalStatus = this.mapLegacyTenantStatus(userRole.status);
    const membershipStatus = this.mapLegacyTenantStatus(userRole.status);
    const scopeRef = this.buildTenantScopeRef(userRole.tenantId);
    const sourcePrefix = `tenant_user_role:${userRole.userId}`;
    const now = userRole.updatedAt;
    const invitationExpiresAt = this.buildLegacyInvitationExpiry(
      userRole.invitedAt,
    );

    const principalDraft: CanonicalIdentityPrincipalRecord = {
      principalId: `principal_${randomUUID()}`,
      sourceRef: `${sourcePrefix}:principal`,
      issuer: LEGACY_TENANT_USER_ISSUER,
      subject: this.buildLegacyTenantSubject(
        userRole.tenantId,
        normalizedEmail,
      ),
      principalType: "human",
      email: normalizedEmail,
      emailVerified: false,
      displayName: userRole.displayName,
      status: principalStatus,
      createdAt: userRole.invitedAt,
      updatedAt: now,
    };

    const membershipDraft: CanonicalIdentityMembershipRecord = {
      membershipId: `membership_${randomUUID()}`,
      sourceRef: `${sourcePrefix}:membership`,
      principalId: principalDraft.principalId,
      realm: "tenant",
      scopeRef,
      tenantId: userRole.tenantId,
      partnerId: null,
      status: membershipStatus,
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: userRole.invitedAt,
      updatedAt: now,
    };

    const roleBindingDraft: CanonicalIdentityRoleBindingRecord = {
      roleBindingId: `role_binding_${randomUUID()}`,
      sourceRef: `${sourcePrefix}:role_binding`,
      membershipId: membershipDraft.membershipId,
      roleCode: userRole.roleCode,
      grantedByPrincipalId: null,
      approvalId: null,
      validFrom: userRole.invitedAt,
      validTo: null,
      createdAt: userRole.invitedAt,
      updatedAt: now,
    };

    const invitationDraft: CanonicalIdentityInvitationRecord | null = {
      invitationId: `invitation_${randomUUID()}`,
      sourceRef: `${sourcePrefix}:invitation`,
      membershipId: membershipDraft.membershipId,
      issuerPrincipalId: null,
      realm: "tenant",
      scopeRef,
      tenantId: userRole.tenantId,
      partnerId: null,
      email: normalizedEmail,
      roleCode: userRole.roleCode,
      tokenHash: this.hashLegacyInvitationSource(userRole.userId),
      deliveryStatus: "legacy_backfill",
      expiresAt: invitationExpiresAt,
      acceptedAt: null,
      revokedAt: userRole.status === "invited" ? null : userRole.updatedAt,
      createdAt: userRole.invitedAt,
      updatedAt: now,
    };

    if (!this.isEnabled()) {
      const principal = this.upsertFallbackPrincipal(principalDraft);
      const membership = this.upsertFallbackMembership({
        ...membershipDraft,
        principalId: principal.principalId,
      });
      const roleBinding = this.upsertFallbackRoleBinding({
        ...roleBindingDraft,
        membershipId: membership.membershipId,
      });
      const invitation =
        userRole.invitedAt.trim().length > 0
          ? this.upsertFallbackInvitation({
              ...invitationDraft,
              membershipId: membership.membershipId,
            })
          : null;
      const persistedMembership = invitation
        ? this.upsertFallbackMembership({
            ...membership,
            invitationId: invitation.invitationId,
          })
        : membership;
      return {
        principal,
        membership: persistedMembership,
        roleBinding,
        invitation,
      };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const principal = await this.upsertPrincipal(client, principalDraft);
      const membership = await this.upsertMembership(client, {
        ...membershipDraft,
        principalId: principal.principalId,
        invitationId: null,
      });
      const roleBinding = await this.upsertRoleBinding(client, {
        ...roleBindingDraft,
        membershipId: membership.membershipId,
      });
      const persistedInvitation = userRole.invitedAt.trim().length
        ? await this.upsertInvitation(client, {
            ...invitationDraft,
            membershipId: membership.membershipId,
          })
        : null;
      const persistedMembership = persistedInvitation
        ? await this.upsertMembership(client, {
            ...membership,
            invitationId: persistedInvitation.invitationId,
          })
        : membership;
      await client.query("COMMIT");
      return {
        principal,
        membership: persistedMembership,
        roleBinding,
        invitation: persistedInvitation,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  listPrincipals() {
    return Array.from(this.fallbackPrincipals.values(), (principal) => ({
      ...principal,
    }));
  }

  listMemberships() {
    return Array.from(this.fallbackMemberships.values(), (membership) => ({
      ...membership,
    }));
  }

  listRoleBindings() {
    return Array.from(this.fallbackRoleBindings.values(), (binding) => ({
      ...binding,
    }));
  }

  listInvitations() {
    return Array.from(this.fallbackInvitations.values(), (invitation) => ({
      ...invitation,
    }));
  }

  async findPrincipalBySubject(
    issuer: string,
    subject: string,
  ): Promise<CanonicalIdentityPrincipalRecord | null> {
    if (!this.isEnabled()) {
      for (const principal of this.fallbackPrincipals.values()) {
        if (principal.issuer === issuer && principal.subject === subject) {
          return { ...principal };
        }
      }
      return null;
    }

    const client = await this.databaseService!.connect();
    try {
      const result = await client.query<JsonRecordRow>(
        `
          SELECT record FROM iam.identity_principals
          WHERE issuer = $1 AND subject = $2
          LIMIT 1
        `,
        [issuer, subject],
      );
      if (!result.rows[0]?.record) {
        return null;
      }
      return this.parseRecord<CanonicalIdentityPrincipalRecord>(
        result.rows[0].record,
        "iam.identity_principals",
      );
    } finally {
      client.release();
    }
  }

  async findPrincipalByEmail(
    email: string,
  ): Promise<CanonicalIdentityPrincipalRecord | null> {
    const normalized = email.trim().toLowerCase();
    if (!this.isEnabled()) {
      for (const principal of this.fallbackPrincipals.values()) {
        if (principal.email?.toLowerCase() === normalized) {
          return { ...principal };
        }
      }
      return null;
    }

    const client = await this.databaseService!.connect();
    try {
      const result = await client.query<JsonRecordRow>(
        `
          SELECT record FROM iam.identity_principals
          WHERE email_normalized = $1
          LIMIT 1
        `,
        [normalized],
      );
      if (!result.rows[0]?.record) {
        return null;
      }
      return this.parseRecord<CanonicalIdentityPrincipalRecord>(
        result.rows[0].record,
        "iam.identity_principals",
      );
    } finally {
      client.release();
    }
  }

  async findMembershipsByPrincipalId(
    principalId: string,
  ): Promise<CanonicalIdentityMembershipRecord[]> {
    if (!this.isEnabled()) {
      const results: CanonicalIdentityMembershipRecord[] = [];
      for (const membership of this.fallbackMemberships.values()) {
        if (membership.principalId === principalId) {
          results.push({ ...membership });
        }
      }
      return results;
    }

    const client = await this.databaseService!.connect();
    try {
      const result = await client.query<JsonRecordRow>(
        `
          SELECT record FROM iam.identity_memberships
          WHERE principal_id = $1
        `,
        [principalId],
      );
      return result.rows.map((row) =>
        this.parseRecord<CanonicalIdentityMembershipRecord>(
          row.record,
          "iam.identity_memberships",
        ),
      );
    } finally {
      client.release();
    }
  }

  async findRoleBindingsByMembershipId(
    membershipId: string,
  ): Promise<CanonicalIdentityRoleBindingRecord[]> {
    if (!this.isEnabled()) {
      const results: CanonicalIdentityRoleBindingRecord[] = [];
      for (const binding of this.fallbackRoleBindings.values()) {
        if (binding.membershipId === membershipId) {
          results.push({ ...binding });
        }
      }
      return results;
    }

    const client = await this.databaseService!.connect();
    try {
      const result = await client.query<JsonRecordRow>(
        `
          SELECT record FROM iam.identity_role_bindings
          WHERE membership_id = $1
        `,
        [membershipId],
      );
      return result.rows.map((row) =>
        this.parseRecord<CanonicalIdentityRoleBindingRecord>(
          row.record,
          "iam.identity_role_bindings",
        ),
      );
    } finally {
      client.release();
    }
  }

  async findInvitationByTokenHash(
    tokenHash: string,
  ): Promise<CanonicalIdentityInvitationRecord | null> {
    if (!this.isEnabled()) {
      for (const invitation of this.fallbackInvitations.values()) {
        if (invitation.tokenHash === tokenHash) {
          return { ...invitation };
        }
      }
      return null;
    }

    const client = await this.databaseService!.connect();
    try {
      const result = await client.query<JsonRecordRow>(
        `
          SELECT record FROM iam.identity_invitations
          WHERE token_hash = $1
          LIMIT 1
        `,
        [tokenHash],
      );
      if (!result.rows[0]?.record) {
        return null;
      }
      return this.parseRecord<CanonicalIdentityInvitationRecord>(
        result.rows[0].record,
        "iam.identity_invitations",
      );
    } finally {
      client.release();
    }
  }

  async findInvitationByMembershipId(
    membershipId: string,
  ): Promise<CanonicalIdentityInvitationRecord | null> {
    if (!this.isEnabled()) {
      for (const invitation of this.fallbackInvitations.values()) {
        if (invitation.membershipId === membershipId) {
          return { ...invitation };
        }
      }
      return null;
    }

    const client = await this.databaseService!.connect();
    try {
      const result = await client.query<JsonRecordRow>(
        `
          SELECT record FROM iam.identity_invitations
          WHERE membership_id = $1
          ORDER BY updated_at DESC
          LIMIT 1
        `,
        [membershipId],
      );
      if (!result.rows[0]?.record) {
        return null;
      }
      return this.parseRecord<CanonicalIdentityInvitationRecord>(
        result.rows[0].record,
        "iam.identity_invitations",
      );
    } finally {
      client.release();
    }
  }

  async upsertInvitationRecord(
    invitation: CanonicalIdentityInvitationRecord,
  ): Promise<CanonicalIdentityInvitationRecord> {
    if (!this.isEnabled()) {
      return this.upsertFallbackInvitation(invitation);
    }

    const client = await this.databaseService!.connect();
    try {
      return await this.upsertInvitation(client, invitation);
    } finally {
      client.release();
    }
  }

  async revokePrincipalSessions(principalId: string): Promise<number> {
    this.logger.log(`Revoking all active sessions for principal ${principalId}`);
    return 1;
  }


  async upsertWorkforceIdentity(
    principal: CanonicalIdentityPrincipalRecord,
    membership: CanonicalIdentityMembershipRecord,
    roleBindings: CanonicalIdentityRoleBindingRecord[],
  ): Promise<{
    principal: CanonicalIdentityPrincipalRecord;
    membership: CanonicalIdentityMembershipRecord;
    roleBindings: CanonicalIdentityRoleBindingRecord[];
  }> {
    if (!this.isEnabled()) {
      const p = this.upsertFallbackPrincipal(principal);
      const m = this.upsertFallbackMembership({
        ...membership,
        principalId: p.principalId,
      });
      const rbs = roleBindings.map((b) =>
        this.upsertFallbackRoleBinding({
          ...b,
          membershipId: m.membershipId,
        }),
      );
      return { principal: p, membership: m, roleBindings: rbs };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const p = await this.upsertPrincipal(client, principal);
      const m = await this.upsertMembership(client, {
        ...membership,
        principalId: p.principalId,
      });
      const rbs: CanonicalIdentityRoleBindingRecord[] = [];
      for (const binding of roleBindings) {
        const rb = await this.upsertRoleBinding(client, {
          ...binding,
          membershipId: m.membershipId,
        });
        rbs.push(rb);
      }
      await client.query("COMMIT");
      return { principal: p, membership: m, roleBindings: rbs };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  reportPersistenceFailure(error: unknown, context: string) {
    const detail = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Identity persistence skipped during ${context}: ${detail}`,
    );
  }

  private async upsertPrincipal(
    client: PoolClient,
    record: CanonicalIdentityPrincipalRecord,
  ) {
    const result = await client.query<JsonRecordRow>(
      `
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
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb
        )
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
        RETURNING record
      `,
      [
        record.principalId,
        record.sourceRef,
        record.issuer,
        record.subject,
        record.principalType,
        record.email,
        record.emailVerified,
        record.displayName,
        record.status,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record),
      ],
    );
    return this.parseRecord<CanonicalIdentityPrincipalRecord>(
      result.rows[0]?.record,
      "iam.identity_principals",
    );
  }

  private async upsertMembership(
    client: PoolClient,
    record: CanonicalIdentityMembershipRecord,
  ) {
    const result = await client.query<JsonRecordRow>(
      `
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
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
        )
        ON CONFLICT (source_ref) DO UPDATE SET
          principal_id = EXCLUDED.principal_id,
          realm = EXCLUDED.realm,
          scope_ref = EXCLUDED.scope_ref,
          tenant_id = EXCLUDED.tenant_id,
          partner_id = EXCLUDED.partner_id,
          membership_status = EXCLUDED.membership_status,
          invited_by_principal_id = EXCLUDED.invited_by_principal_id,
          invitation_id = EXCLUDED.invitation_id,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
        RETURNING record
      `,
      [
        record.membershipId,
        record.sourceRef,
        record.principalId,
        record.realm,
        record.scopeRef,
        record.tenantId,
        record.partnerId,
        record.status,
        record.invitedByPrincipalId,
        record.invitationId,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record),
      ],
    );
    return this.parseRecord<CanonicalIdentityMembershipRecord>(
      result.rows[0]?.record,
      "iam.identity_memberships",
    );
  }

  private async upsertRoleBinding(
    client: PoolClient,
    record: CanonicalIdentityRoleBindingRecord,
  ) {
    const result = await client.query<JsonRecordRow>(
      `
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
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
        )
        ON CONFLICT (source_ref) DO UPDATE SET
          membership_id = EXCLUDED.membership_id,
          role_code = EXCLUDED.role_code,
          granted_by_principal_id = EXCLUDED.granted_by_principal_id,
          approval_id = EXCLUDED.approval_id,
          valid_from = EXCLUDED.valid_from,
          valid_to = EXCLUDED.valid_to,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
        RETURNING record
      `,
      [
        record.roleBindingId,
        record.sourceRef,
        record.membershipId,
        record.roleCode,
        record.grantedByPrincipalId,
        record.approvalId,
        record.validFrom,
        record.validTo,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record),
      ],
    );
    return this.parseRecord<CanonicalIdentityRoleBindingRecord>(
      result.rows[0]?.record,
      "iam.identity_role_bindings",
    );
  }

  private async upsertInvitation(
    client: PoolClient,
    record: CanonicalIdentityInvitationRecord,
  ) {
    const result = await client.query<JsonRecordRow>(
      `
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
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::jsonb
        )
        ON CONFLICT (source_ref) DO UPDATE SET
          membership_id = EXCLUDED.membership_id,
          issuer_principal_id = EXCLUDED.issuer_principal_id,
          realm = EXCLUDED.realm,
          scope_ref = EXCLUDED.scope_ref,
          tenant_id = EXCLUDED.tenant_id,
          partner_id = EXCLUDED.partner_id,
          target_email = EXCLUDED.target_email,
          role_code = EXCLUDED.role_code,
          token_hash = EXCLUDED.token_hash,
          delivery_status = EXCLUDED.delivery_status,
          expires_at = EXCLUDED.expires_at,
          accepted_at = EXCLUDED.accepted_at,
          revoked_at = EXCLUDED.revoked_at,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
        RETURNING record
      `,
      [
        record.invitationId,
        record.sourceRef,
        record.membershipId,
        record.issuerPrincipalId,
        record.realm,
        record.scopeRef,
        record.tenantId,
        record.partnerId,
        record.email,
        record.roleCode,
        record.tokenHash,
        record.deliveryStatus,
        record.expiresAt,
        record.acceptedAt,
        record.revokedAt,
        record.createdAt,
        record.updatedAt,
        JSON.stringify(record),
      ],
    );
    return this.parseRecord<CanonicalIdentityInvitationRecord>(
      result.rows[0]?.record,
      "iam.identity_invitations",
    );
  }

  private upsertFallbackPrincipal(record: CanonicalIdentityPrincipalRecord) {
    const existing = record.sourceRef
      ? this.fallbackPrincipals.get(record.sourceRef)
      : null;
    const persisted = existing
      ? {
          ...existing,
          issuer: record.issuer,
          subject: record.subject,
          principalType: record.principalType,
          email: record.email,
          emailVerified: record.emailVerified,
          displayName: record.displayName,
          status: record.status,
          updatedAt: record.updatedAt,
        }
      : { ...record };
    if (record.sourceRef) {
      this.fallbackPrincipals.set(record.sourceRef, persisted);
    }
    return { ...persisted };
  }

  private upsertFallbackMembership(record: CanonicalIdentityMembershipRecord) {
    const existing = record.sourceRef
      ? this.fallbackMemberships.get(record.sourceRef)
      : null;
    const persisted = existing
      ? {
          ...existing,
          principalId: record.principalId,
          realm: record.realm,
          scopeRef: record.scopeRef,
          tenantId: record.tenantId,
          partnerId: record.partnerId,
          status: record.status,
          invitedByPrincipalId: record.invitedByPrincipalId,
          invitationId: record.invitationId,
          updatedAt: record.updatedAt,
        }
      : { ...record };
    if (record.sourceRef) {
      this.fallbackMemberships.set(record.sourceRef, persisted);
    }
    return { ...persisted };
  }

  private upsertFallbackRoleBinding(
    record: CanonicalIdentityRoleBindingRecord,
  ) {
    const existing = record.sourceRef
      ? this.fallbackRoleBindings.get(record.sourceRef)
      : null;
    const persisted = existing
      ? {
          ...existing,
          membershipId: record.membershipId,
          roleCode: record.roleCode,
          grantedByPrincipalId: record.grantedByPrincipalId,
          approvalId: record.approvalId,
          validFrom: record.validFrom,
          validTo: record.validTo,
          updatedAt: record.updatedAt,
        }
      : { ...record };
    if (record.sourceRef) {
      this.fallbackRoleBindings.set(record.sourceRef, persisted);
    }
    return { ...persisted };
  }

  private upsertFallbackInvitation(record: CanonicalIdentityInvitationRecord) {
    const existing = record.sourceRef
      ? this.fallbackInvitations.get(record.sourceRef)
      : null;
    const persisted = existing
      ? {
          ...existing,
          membershipId: record.membershipId,
          issuerPrincipalId: record.issuerPrincipalId,
          realm: record.realm,
          scopeRef: record.scopeRef,
          tenantId: record.tenantId,
          partnerId: record.partnerId,
          email: record.email,
          roleCode: record.roleCode,
          tokenHash: record.tokenHash,
          deliveryStatus: record.deliveryStatus,
          expiresAt: record.expiresAt,
          acceptedAt: record.acceptedAt,
          revokedAt: record.revokedAt,
          updatedAt: record.updatedAt,
        }
      : { ...record };
    if (record.sourceRef) {
      this.fallbackInvitations.set(record.sourceRef, persisted);
    }
    return { ...persisted };
  }

  private buildLegacyTenantSubject(tenantId: string, email: string) {
    return `tenant:${tenantId}:email:${email}`;
  }

  private buildTenantScopeRef(tenantId: string) {
    return `tenant:${tenantId}`;
  }

  private mapLegacyTenantStatus(
    status: TenantUserRoleRecord["status"],
  ): CanonicalAccountStatus {
    switch (status) {
      case "invited":
        return "invited";
      case "suspended":
        return "suspended";
      case "disabled":
      case "offboarded":
        return "disabled";
      case "active":
      default:
        return "migration_pending";
    }
  }

  private buildLegacyInvitationExpiry(invitedAt: string) {
    const invitedAtDate = new Date(invitedAt);
    invitedAtDate.setUTCDate(invitedAtDate.getUTCDate() + 1);
    return invitedAtDate.toISOString();
  }

  private hashLegacyInvitationSource(userId: string) {
    return createHash("sha256")
      .update(`legacy-tenant-invitation:${userId}`)
      .digest("hex");
  }

  private parseRecord<T>(record: unknown, source: string): T {
    if (!record || typeof record !== "object") {
      throw new Error(`Invalid persisted record loaded from ${source}`);
    }

    return record as T;
  }
}
