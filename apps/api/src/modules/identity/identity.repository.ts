import { createHash, randomUUID } from "node:crypto";

import { Injectable, Logger, Optional } from "@nestjs/common";
import type { PoolClient } from "pg";

import type {
  AdminSessionInventoryQuery,
  CanonicalAccountStatus,
  CanonicalIdentityInvitationRecord,
  CanonicalIdentityMembershipRecord,
  CanonicalIdentityPrincipalRecord,
  CanonicalIdentityRoleBindingRecord,
  CanonicalIdentitySessionRecord,
  CanonicalRefreshFamilyRecord,
  CanonicalTenantUserIdentitySnapshot,
  ConsumeAndRotateRefreshTokenCommand,
  ConsumeAndRotateRefreshTokenResult,
  TenantUserRoleRecord,
} from "@drts/contracts";

import { ApiRequestError } from "../../common/api-envelope";
import { DatabaseService } from "../../common/db";

type JsonRecordRow = {
  record: unknown;
};

type PersistedSessionRow = {
  session_id: string;
  source_ref: string | null;
  principal_id: string;
  membership_id: string | null;
  realm: string;
  status: string;
  auth_time: string;
  auth_methods: string[];
  token_version: number | string;
  idle_expires_at: string | null;
  absolute_expires_at: string;
  revoked_at: string | null;
  revoked_by_principal_id: string | null;
  revoke_reason: string | null;
  device_summary: unknown;
  risk_summary: unknown;
  created_at: string;
  updated_at: string;
  record: unknown;
};

type PersistedRefreshFamilyRow = {
  family_id: string;
  source_ref: string | null;
  session_id: string;
  current_token_hash: string;
  counter: number;
  status: string;
  expires_at: string;
  compromised_at: string | null;
  created_at: string;
  updated_at: string;
  record: unknown;
};

export interface ConsumeWorkloadIdentityAssertionInput {
  assertionHash: string;
  issuer: string;
  subject: string;
  exchangeAudience: string;
  tokenAudience: string;
  exchangeNonceHash?: string | null;
  principalId?: string | null;
  expiresAt: string;
}

const LEGACY_TENANT_USER_ISSUER = "legacy_tenant_email";

export function hashIdentitySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

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

  private readonly fallbackSessions = new Map<
    string,
    CanonicalIdentitySessionRecord
  >();

  private readonly fallbackRefreshFamilies = new Map<
    string,
    CanonicalRefreshFamilyRecord
  >();

  private readonly fallbackPreviousTokenHashes = new Map<string, string>();
  private readonly fallbackConsumedWorkloadAssertions = new Map<
    string,
    ConsumeWorkloadIdentityAssertionInput & { consumedAt: string }
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

  async ensurePrincipalRecord(
    principal: CanonicalIdentityPrincipalRecord,
  ): Promise<CanonicalIdentityPrincipalRecord> {
    if (!this.isEnabled()) {
      return this.upsertFallbackPrincipal(principal);
    }

    const client = await this.databaseService!.connect();
    try {
      return await this.upsertPrincipal(client, principal);
    } finally {
      client.release();
    }
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

  async findPrincipalById(
    principalId: string,
  ): Promise<CanonicalIdentityPrincipalRecord | null> {
    if (!this.isEnabled()) {
      const principal = this.fallbackPrincipals.get(principalId);
      return principal ? { ...principal } : null;
    }

    const client = await this.databaseService!.connect();
    try {
      const result = await client.query<JsonRecordRow>(
        `
          SELECT record FROM iam.identity_principals
          WHERE principal_id = $1
          LIMIT 1
        `,
        [principalId],
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

  async createSession(
    session: CanonicalIdentitySessionRecord,
  ): Promise<CanonicalIdentitySessionRecord> {
    if (!this.isEnabled()) {
      this.fallbackSessions.set(session.sessionId, { ...session });
      return { ...session };
    }

    const client = await this.databaseService!.connect();
    try {
      const result = await client.query<PersistedSessionRow>(
        `
          INSERT INTO iam.identity_sessions (
            session_id,
            source_ref,
            principal_id,
            membership_id,
            realm,
            status,
            auth_time,
            auth_methods,
            token_version,
            idle_expires_at,
            absolute_expires_at,
            revoked_at,
            revoked_by_principal_id,
            revoke_reason,
            device_summary,
            risk_summary,
            created_at,
            updated_at,
            record
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17, $18, $19::jsonb
          )
          ON CONFLICT (session_id) DO UPDATE SET
            status = EXCLUDED.status,
            auth_methods = EXCLUDED.auth_methods,
            token_version = EXCLUDED.token_version,
            idle_expires_at = EXCLUDED.idle_expires_at,
            absolute_expires_at = EXCLUDED.absolute_expires_at,
            revoked_at = EXCLUDED.revoked_at,
            revoked_by_principal_id = EXCLUDED.revoked_by_principal_id,
            revoke_reason = EXCLUDED.revoke_reason,
            device_summary = EXCLUDED.device_summary,
            risk_summary = EXCLUDED.risk_summary,
            updated_at = EXCLUDED.updated_at,
            record = EXCLUDED.record
          RETURNING *
        `,
        [
          session.sessionId,
          session.sourceRef,
          session.principalId,
          session.membershipId,
          session.realm,
          session.status,
          session.authTime,
          session.authMethods,
          session.tokenVersion,
          session.idleExpiresAt,
          session.absoluteExpiresAt,
          session.revokedAt,
          session.revokedByPrincipalId,
          session.revokeReason,
          JSON.stringify(session.deviceSummary || {}),
          JSON.stringify(session.riskSummary || {}),
          session.createdAt,
          session.updatedAt,
          JSON.stringify(session),
        ],
      );

      return this.hydrateSessionRecord(result.rows[0], "iam.identity_sessions");
    } finally {
      client.release();
    }
  }

  async getSession(
    sessionId: string,
  ): Promise<CanonicalIdentitySessionRecord | null> {
    if (!this.isEnabled()) {
      const found = this.fallbackSessions.get(sessionId);
      return found ? { ...found } : null;
    }

    const result = await this.databaseService!.query<PersistedSessionRow>(
      `SELECT * FROM iam.identity_sessions WHERE session_id = $1`,
      [sessionId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return this.hydrateSessionRecord(row, "iam.identity_sessions");
  }

  async revokeSession(
    sessionId: string,
    reason: string,
    revokedByPrincipalId?: string,
    expectedVersion?: number,
  ): Promise<CanonicalIdentitySessionRecord | null> {
    const revokedAt = new Date().toISOString();

    if (!this.isEnabled()) {
      const session = this.fallbackSessions.get(sessionId);
      if (!session) {
        return null;
      }
      if (session.status !== "active") {
        throw new ApiRequestError(
          409,
          "IAM_CONCURRENCY_CONFLICT",
          "Session is not active or has already been revoked",
        );
      }
      if (
        typeof expectedVersion === "number" &&
        session.tokenVersion !== expectedVersion
      ) {
        throw new ApiRequestError(
          409,
          "IAM_CONCURRENCY_CONFLICT",
          `Expected version ${expectedVersion} does not match current version ${session.tokenVersion}`,
        );
      }

      const updated: CanonicalIdentitySessionRecord = {
        ...session,
        status: "revoked",
        revokedAt,
        revokedByPrincipalId: revokedByPrincipalId || null,
        revokeReason: reason,
        updatedAt: revokedAt,
      };
      this.fallbackSessions.set(sessionId, updated);

      for (const [familyId, family] of this.fallbackRefreshFamilies.entries()) {
        if (family.sessionId === sessionId && family.status === "active") {
          this.fallbackRefreshFamilies.set(familyId, {
            ...family,
            status: "revoked",
            updatedAt: revokedAt,
          });
        }
      }
      return updated;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const hasExpectedVersion = typeof expectedVersion === "number";
      const params: unknown[] = [
        sessionId,
        revokedAt,
        revokedByPrincipalId || null,
        reason,
      ];
      let versionClause = "";
      if (hasExpectedVersion) {
        params.push(expectedVersion);
        versionClause = ` AND token_version = $${params.length}::bigint`;
      }

      const sessionResult = await client.query<PersistedSessionRow>(
        `
          UPDATE iam.identity_sessions
          SET status = 'revoked',
              revoked_at = $2::timestamptz,
              revoked_by_principal_id = $3::text,
              revoke_reason = $4::text,
              updated_at = $2::timestamptz,
              record = jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(record, '{status}', '"revoked"'::jsonb),
                        '{revokedAt}', to_jsonb($2::text)
                      ),
                      '{revokedByPrincipalId}', to_jsonb($3::text)
                    ),
                    '{revokeReason}', to_jsonb($4::text)
                  ),
                  '{updatedAt}', to_jsonb($2::text)
                ),
                '{status}', '"revoked"'::jsonb
              )
          WHERE session_id = $1::text AND status = 'active'${versionClause}
          RETURNING *
        `,
        params,
      );

      if (sessionResult.rows.length === 0) {
        await client.query("ROLLBACK");
        const existing = await this.getSession(sessionId);
        if (!existing) {
          return null;
        }
        if (existing.status !== "active") {
          throw new ApiRequestError(
            409,
            "IAM_CONCURRENCY_CONFLICT",
            "Session is not active or has already been revoked",
          );
        }
        if (
          hasExpectedVersion &&
          existing.tokenVersion !== expectedVersion
        ) {
          throw new ApiRequestError(
            409,
            "IAM_CONCURRENCY_CONFLICT",
            `Expected version ${expectedVersion} does not match current version ${existing.tokenVersion}`,
          );
        }
        throw new ApiRequestError(
          409,
          "IAM_CONCURRENCY_CONFLICT",
          "Concurrent session update detected",
        );
      }

      await client.query(
        `
          UPDATE iam.identity_refresh_families
          SET status = 'revoked',
              updated_at = $2::timestamptz,
              record = jsonb_set(
                jsonb_set(record, '{status}', '"revoked"'::jsonb),
                '{updatedAt}', to_jsonb($2::text)
              )
          WHERE session_id = $1::text AND status = 'active'
        `,
        [sessionId, revokedAt],
      );

      await client.query("COMMIT");
      const row = sessionResult.rows[0];
      if (!row) {
        return null;
      }
      return this.hydrateSessionRecord(row, "iam.identity_sessions");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async listSessionsByPrincipal(
    principalId: string,
  ): Promise<CanonicalIdentitySessionRecord[]> {
    if (!this.isEnabled()) {
      return Array.from(this.fallbackSessions.values())
        .filter((session) => session.principalId === principalId)
        .map((session) => ({ ...session }));
    }

    const result = await this.databaseService!.query<PersistedSessionRow>(
      `SELECT * FROM iam.identity_sessions WHERE principal_id = $1 ORDER BY updated_at DESC`,
      [principalId],
    );

    return result.rows.map((row) =>
      this.hydrateSessionRecord(row, "iam.identity_sessions"),
    );
  }

  async listSessionsForAdmin(
    query: AdminSessionInventoryQuery = {},
  ): Promise<CanonicalIdentitySessionRecord[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 500);

    if (!this.isEnabled()) {
      return Array.from(this.fallbackSessions.values())
        .filter((s) => {
          if (query.tenantId && s.tenantId !== query.tenantId) return false;
          if (query.principalId && s.principalId !== query.principalId)
            return false;
          if (query.status && s.status !== query.status) return false;
          return true;
        })
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        )
        .slice(0, limit);
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.tenantId) {
      params.push(query.tenantId);
      conditions.push(`tenant_id = $${params.length}`);
    }
    if (query.principalId) {
      params.push(query.principalId);
      conditions.push(`principal_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`status = $${params.length}`);
    }

    params.push(limit);
    const limitParamIndex = params.length;

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT * FROM iam.identity_sessions ${whereClause} ORDER BY updated_at DESC LIMIT $${limitParamIndex}`;

    const result = await this.databaseService!.query<PersistedSessionRow>(
      sql,
      params,
    );
    return result.rows.map((row) =>
      this.hydrateSessionRecord(row, "iam.identity_sessions"),
    );
  }

  async revokeAllSessionsForPrincipal(
    principalId: string,
    reason: string,
    revokedByPrincipalId?: string,
    keepSessionId?: string,
  ): Promise<number> {
    const revokedAt = new Date().toISOString();

    if (!this.isEnabled()) {
      let count = 0;
      for (const [sid, session] of this.fallbackSessions.entries()) {
        if (
          session.principalId === principalId &&
          session.status === "active" &&
          sid !== keepSessionId
        ) {
          this.fallbackSessions.set(sid, {
            ...session,
            status: "revoked",
            revokedAt,
            revokedByPrincipalId: revokedByPrincipalId || null,
            revokeReason: reason,
            updatedAt: revokedAt,
          });
          count++;

          for (const [
            familyId,
            family,
          ] of this.fallbackRefreshFamilies.entries()) {
            if (family.sessionId === sid && family.status === "active") {
              this.fallbackRefreshFamilies.set(familyId, {
                ...family,
                status: "revoked",
                updatedAt: revokedAt,
              });
            }
          }
        }
      }
      return count;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const params: unknown[] = [
        principalId,
        revokedAt,
        revokedByPrincipalId || null,
        reason,
      ];
      let excludeCondition = "";
      if (keepSessionId) {
        params.push(keepSessionId);
        excludeCondition = ` AND session_id != $5::text`;
      }

      const sessionResult = await client.query<PersistedSessionRow>(
        `
          UPDATE iam.identity_sessions
          SET status = 'revoked',
              revoked_at = $2::timestamptz,
              revoked_by_principal_id = $3::text,
              revoke_reason = $4::text,
              updated_at = $2::timestamptz,
              record = jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(record, '{status}', '"revoked"'::jsonb),
                        '{revokedAt}', to_jsonb($2::text)
                      ),
                      '{revokedByPrincipalId}', to_jsonb($3::text)
                    ),
                    '{revokeReason}', to_jsonb($4::text)
                  ),
                  '{updatedAt}', to_jsonb($2::text)
                ),
                '{status}', '"revoked"'::jsonb
              )
          WHERE principal_id = $1::text AND status = 'active'${excludeCondition}
          RETURNING session_id
        `,
        params,
      );

      const revokedSessionIds = sessionResult.rows.map(
        (row) => row.session_id,
      );
      if (revokedSessionIds.length > 0) {
        await client.query(
          `
            UPDATE iam.identity_refresh_families
            SET status = 'revoked',
                updated_at = $2::timestamptz,
                record = jsonb_set(
                  jsonb_set(record, '{status}', '"revoked"'::jsonb),
                  '{updatedAt}', to_jsonb($2::text)
                )
            WHERE session_id = ANY($1::text[]) AND status = 'active'
          `,
          [revokedSessionIds, revokedAt],
        );
      }

      await client.query("COMMIT");
      return revokedSessionIds.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findActiveSessionByDevice(
    deviceId: string,
  ): Promise<CanonicalIdentitySessionRecord | null> {
    if (!deviceId.trim()) {
      return null;
    }

    if (!this.isEnabled()) {
      for (const session of this.fallbackSessions.values()) {
        const sessionDeviceId =
          (session.deviceSummary as { deviceId?: string | null } | undefined)
            ?.deviceId ?? null;
        if (session.status === "active" && sessionDeviceId === deviceId) {
          return { ...session };
        }
      }
      return null;
    }

    const result = await this.databaseService!.query<PersistedSessionRow>(
      `
        SELECT *
        FROM iam.identity_sessions
        WHERE status = 'active'
          AND device_summary->>'deviceId' = $1
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [deviceId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return this.hydrateSessionRecord(row, "iam.identity_sessions");
  }

  async createRefreshFamily(
    family: CanonicalRefreshFamilyRecord,
  ): Promise<CanonicalRefreshFamilyRecord> {
    if (!this.isEnabled()) {
      this.fallbackRefreshFamilies.set(family.familyId, { ...family });
      return { ...family };
    }

    const client = await this.databaseService!.connect();
    try {
      const result = await client.query<PersistedRefreshFamilyRow>(
        `
          INSERT INTO iam.identity_refresh_families (
            family_id,
            source_ref,
            session_id,
            current_token_hash,
            counter,
            status,
            expires_at,
            compromised_at,
            created_at,
            updated_at,
            record
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb
          )
          ON CONFLICT (family_id) DO UPDATE SET
            current_token_hash = EXCLUDED.current_token_hash,
            counter = EXCLUDED.counter,
            status = EXCLUDED.status,
            expires_at = EXCLUDED.expires_at,
            compromised_at = EXCLUDED.compromised_at,
            updated_at = EXCLUDED.updated_at,
            record = EXCLUDED.record
          RETURNING *
        `,
        [
          family.familyId,
          family.sourceRef,
          family.sessionId,
          family.currentTokenHash,
          family.counter,
          family.status,
          family.expiresAt,
          family.compromisedAt,
          family.createdAt,
          family.updatedAt,
          JSON.stringify(family),
        ],
      );

      return this.hydrateRefreshFamilyRecord(
        result.rows[0],
        "iam.identity_refresh_families",
      );
    } finally {
      client.release();
    }
  }

  async getRefreshFamily(
    familyId: string,
  ): Promise<CanonicalRefreshFamilyRecord | null> {
    if (!this.isEnabled()) {
      const found = this.fallbackRefreshFamilies.get(familyId);
      return found ? { ...found } : null;
    }

    const result = await this.databaseService!.query<PersistedRefreshFamilyRow>(
      `SELECT * FROM iam.identity_refresh_families WHERE family_id = $1`,
      [familyId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return this.hydrateRefreshFamilyRecord(
      row,
      "iam.identity_refresh_families",
    );
  }

  async getRefreshFamilyByTokenHash(
    tokenHash: string,
  ): Promise<CanonicalRefreshFamilyRecord | null> {
    if (!this.isEnabled()) {
      for (const family of this.fallbackRefreshFamilies.values()) {
        if (family.currentTokenHash === tokenHash) {
          return { ...family };
        }
      }
      return null;
    }

    const result = await this.databaseService!.query<PersistedRefreshFamilyRow>(
      `SELECT * FROM iam.identity_refresh_families WHERE current_token_hash = $1`,
      [tokenHash],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return this.hydrateRefreshFamilyRecord(
      row,
      "iam.identity_refresh_families",
    );
  }

  async consumeWorkloadIdentityAssertion(
    input: ConsumeWorkloadIdentityAssertionInput,
  ): Promise<boolean> {
    const consumedAt = new Date().toISOString();

    if (!this.isEnabled()) {
      const now = Date.now();
      for (const [hash, record] of this.fallbackConsumedWorkloadAssertions) {
        if (Date.parse(record.expiresAt) < now) {
          this.fallbackConsumedWorkloadAssertions.delete(hash);
        }
      }

      if (this.fallbackConsumedWorkloadAssertions.has(input.assertionHash)) {
        return false;
      }

      this.fallbackConsumedWorkloadAssertions.set(input.assertionHash, {
        ...input,
        consumedAt,
      });
      return true;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query(
        `
          DELETE FROM iam.workload_identity_assertions
          WHERE expires_at < NOW()
        `,
      );

      const result = await client.query<{ assertion_hash: string }>(
        `
          INSERT INTO iam.workload_identity_assertions (
            assertion_hash,
            issuer,
            subject,
            exchange_audience,
            token_audience,
            principal_id,
            expires_at,
            consumed_at,
            record
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb
          )
          ON CONFLICT (assertion_hash) DO NOTHING
          RETURNING assertion_hash
        `,
        [
          input.assertionHash,
          input.issuer,
          input.subject,
          input.exchangeAudience,
          input.tokenAudience,
          input.principalId ?? null,
          input.expiresAt,
          consumedAt,
          JSON.stringify({
            ...input,
            principalId: input.principalId ?? null,
            consumedAt,
          }),
        ],
      );

      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  async consumeAndRotateRefreshToken(
    command: ConsumeAndRotateRefreshTokenCommand,
  ): Promise<ConsumeAndRotateRefreshTokenResult> {
    const oldHash =
      command.oldTokenHash ||
      (command.oldTokenRaw ? hashIdentitySecret(command.oldTokenRaw) : "");
    const newHash =
      command.newTokenHash ||
      (command.newTokenRaw ? hashIdentitySecret(command.newTokenRaw) : "");

    if (!oldHash || !newHash) {
      return {
        success: false,
        session: null,
        family: null,
        reason: "INVALID_TOKEN",
      };
    }

    if (!this.isEnabled()) {
      let targetFamily: CanonicalRefreshFamilyRecord | null = null;
      for (const family of this.fallbackRefreshFamilies.values()) {
        if (
          family.currentTokenHash === oldHash ||
          (command.familyId &&
            family.familyId === command.familyId &&
            family.currentTokenHash === oldHash)
        ) {
          targetFamily = family;
          break;
        }
      }

      if (!targetFamily) {
        const compromisedFamilyId =
          this.fallbackPreviousTokenHashes.get(oldHash);
        if (compromisedFamilyId) {
          const family =
            this.fallbackRefreshFamilies.get(compromisedFamilyId) || null;
          const session = family
            ? this.fallbackSessions.get(family.sessionId) || null
            : null;
          const now = new Date().toISOString();

          if (family) {
            family.status = "compromised";
            family.compromisedAt = now;
            family.updatedAt = now;
          }
          if (session) {
            session.status = "compromised";
            session.revokedAt = now;
            session.revokeReason = "REFRESH_TOKEN_REUSE_DETECTED";
            session.updatedAt = now;
          }

          return {
            success: false,
            session,
            family,
            reason: "REUSE_DETECTED",
          };
        }

        return {
          success: false,
          session: null,
          family: null,
          reason: "INVALID_TOKEN",
        };
      }

      const session = this.fallbackSessions.get(targetFamily.sessionId) || null;

      if (
        targetFamily.status === "compromised" ||
        session?.status === "compromised"
      ) {
        return {
          success: false,
          session,
          family: targetFamily,
          reason: "COMPROMISED",
        };
      }
      if (targetFamily.status === "revoked" || session?.status === "revoked") {
        return {
          success: false,
          session,
          family: targetFamily,
          reason: "REVOKED",
        };
      }

      const nowTime = Date.now();
      if (
        new Date(targetFamily.expiresAt).getTime() <= nowTime ||
        (session && new Date(session.absoluteExpiresAt).getTime() <= nowTime)
      ) {
        const now = new Date().toISOString();
        targetFamily.status = "expired";
        targetFamily.updatedAt = now;
        if (session) {
          session.status = "expired";
          session.updatedAt = now;
        }

        return {
          success: false,
          session,
          family: targetFamily,
          reason: "EXPIRED",
        };
      }

      this.fallbackPreviousTokenHashes.set(oldHash, targetFamily.familyId);
      const now = command.updatedAt || new Date().toISOString();
      targetFamily.currentTokenHash = newHash;
      targetFamily.counter += 1;
      targetFamily.expiresAt = command.newExpiresAt;
      targetFamily.updatedAt = now;
      if (session) {
        session.currentTokenId = command.newSessionTokenId;
        session.tokenVersion = command.newSessionTokenVersion;
        session.updatedAt = now;
      }

      return {
        success: true,
        session,
        family: { ...targetFamily },
      };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");

      const familyResult = await client.query<{
        family_id: string;
        session_id: string;
        current_token_hash: string;
        counter: number;
        family_status: string;
        expires_at: string;
        compromised_at: string | null;
        family_record: unknown;
        session_status: string;
        absolute_expires_at: string;
        session_record: unknown;
      }>(
        `
          SELECT
            f.family_id,
            f.session_id,
            f.current_token_hash,
            f.counter,
            f.status AS family_status,
            f.expires_at,
            f.compromised_at,
            f.record AS family_record,
            s.status AS session_status,
            s.absolute_expires_at,
            s.record AS session_record
          FROM iam.identity_refresh_families f
          JOIN iam.identity_sessions s ON s.session_id = f.session_id
          WHERE f.current_token_hash = $1
          FOR UPDATE OF f, s
        `,
        [oldHash],
      );

      if (familyResult.rows.length === 0) {
        const historicalResult = await client.query<{
          family_id: string;
          session_id: string;
          family_record: unknown;
          session_record: unknown;
        }>(
          `
            SELECT f.family_id, f.session_id, f.record AS family_record, s.record AS session_record
            FROM iam.identity_refresh_families f
            JOIN iam.identity_sessions s ON s.session_id = f.session_id
            WHERE f.record->'previousHashes' ? $1::text
            FOR UPDATE OF f, s
          `,
          [oldHash],
        );

        if (historicalResult.rows.length > 0) {
          const row = historicalResult.rows[0];
          if (!row) {
            await client.query("ROLLBACK");
            return {
              success: false,
              session: null,
              family: null,
              reason: "INVALID_TOKEN",
            };
          }
          const now = new Date().toISOString();

          await client.query(
            `
              UPDATE iam.identity_refresh_families
              SET status = 'compromised',
                  compromised_at = $1::timestamptz,
                  updated_at = $1::timestamptz,
                  record = jsonb_set(
                    jsonb_set(
                      jsonb_set(record, '{status}', '"compromised"'::jsonb),
                      '{compromisedAt}', to_jsonb($1::text)
                    ),
                    '{updatedAt}', to_jsonb($1::text)
                  )
              WHERE family_id = $2::text
            `,
            [now, row.family_id],
          );

          await client.query(
            `
              UPDATE iam.identity_sessions
              SET status = 'compromised',
                  revoked_at = $1::timestamptz,
                  revoke_reason = 'REFRESH_TOKEN_REUSE_DETECTED',
                  updated_at = $1::timestamptz,
                  record = jsonb_set(
                    jsonb_set(
                      jsonb_set(
                        jsonb_set(record, '{status}', '"compromised"'::jsonb),
                        '{revokedAt}', to_jsonb($1::text)
                      ),
                      '{revokeReason}', '"REFRESH_TOKEN_REUSE_DETECTED"'::jsonb
                    ),
                    '{updatedAt}', to_jsonb($1::text)
                  )
              WHERE session_id = $2::text
            `,
            [now, row.session_id],
          );

          await client.query("COMMIT");
          const updatedFamily = await this.getRefreshFamily(row.family_id);
          const updatedSession = await this.getSession(row.session_id);

          return {
            success: false,
            session: updatedSession,
            family: updatedFamily,
            reason: "REUSE_DETECTED",
          };
        }

        await client.query("ROLLBACK");
        return {
          success: false,
          session: null,
          family: null,
          reason: "INVALID_TOKEN",
        };
      }

      const row = familyResult.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return {
          success: false,
          session: null,
          family: null,
          reason: "INVALID_TOKEN",
        };
      }
      const family = this.parseRecord<CanonicalRefreshFamilyRecord>(
        row.family_record,
        "iam.identity_refresh_families",
      );
      const session = this.parseRecord<CanonicalIdentitySessionRecord>(
        row.session_record,
        "iam.identity_sessions",
      );

      if (
        row.family_status === "compromised" ||
        row.session_status === "compromised"
      ) {
        await client.query("ROLLBACK");
        return { success: false, session, family, reason: "COMPROMISED" };
      }

      if (row.family_status === "revoked" || row.session_status === "revoked") {
        await client.query("ROLLBACK");
        return { success: false, session, family, reason: "REVOKED" };
      }

      const nowTime = Date.now();
      if (
        new Date(row.expires_at).getTime() <= nowTime ||
        new Date(row.absolute_expires_at).getTime() <= nowTime
      ) {
        const now = new Date().toISOString();
        await client.query(
          `
            UPDATE iam.identity_refresh_families
            SET status = 'expired',
                updated_at = $1::timestamptz,
                record = jsonb_set(
                  jsonb_set(record, '{status}', '"expired"'::jsonb),
                  '{updatedAt}', to_jsonb($1::text)
                )
            WHERE family_id = $2::text
          `,
          [now, row.family_id],
        );
        await client.query(
          `
            UPDATE iam.identity_sessions
            SET status = 'expired',
                updated_at = $1::timestamptz,
                record = jsonb_set(
                  jsonb_set(record, '{status}', '"expired"'::jsonb),
                  '{updatedAt}', to_jsonb($1::text)
                )
            WHERE session_id = $2::text
          `,
          [now, row.session_id],
        );
        await client.query("COMMIT");
        const expiredFamily = await this.getRefreshFamily(row.family_id);
        const expiredSession = await this.getSession(row.session_id);

        return {
          success: false,
          session: expiredSession,
          family: expiredFamily,
          reason: "EXPIRED",
        };
      }

      const now = command.updatedAt || new Date().toISOString();
      const updateFamilyResult = await client.query<PersistedRefreshFamilyRow>(
        `
          UPDATE iam.identity_refresh_families
          SET current_token_hash = $1::text,
              counter = counter + 1,
              expires_at = $2::timestamptz,
              updated_at = $3::timestamptz,
              record = jsonb_set(
                jsonb_set(
                  jsonb_set(
                    jsonb_set(
                      jsonb_set(record, '{currentTokenHash}', to_jsonb($1::text)),
                      '{counter}', to_jsonb(counter + 1)
                    ),
                    '{previousHashes}',
                    coalesce(record->'previousHashes', '[]'::jsonb) || to_jsonb($4::text)
                  ),
                  '{expiresAt}', to_jsonb($2::text)
                ),
                '{updatedAt}', to_jsonb($3::text)
              )
          WHERE family_id = $5::text AND current_token_hash = $4::text AND status = 'active'
          RETURNING *
        `,
        [newHash, command.newExpiresAt, now, oldHash, row.family_id],
      );

      if (updateFamilyResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return {
          success: false,
          session: null,
          family: null,
          reason: "CONCURRENCY_CONFLICT",
        };
      }

      const updateSessionResult = await client.query<PersistedSessionRow>(
        `
          UPDATE iam.identity_sessions
          SET token_version = $1::bigint,
              updated_at = $2::timestamptz,
              record = jsonb_set(
                jsonb_set(
                  jsonb_set(record, '{currentTokenId}', to_jsonb($3::text)),
                  '{tokenVersion}', to_jsonb($1::bigint)
                ),
                '{updatedAt}', to_jsonb($2::text)
              )
          WHERE session_id = $4::text
          RETURNING *
        `,
        [
          command.newSessionTokenVersion,
          now,
          command.newSessionTokenId,
          row.session_id,
        ],
      );

      await client.query("COMMIT");
      const updatedFamilyRow = updateFamilyResult.rows[0];
      const updatedSessionRow = updateSessionResult.rows[0];
      if (!updatedFamilyRow || !updatedSessionRow) {
        return {
          success: false,
          session: null,
          family: null,
          reason: "CONCURRENCY_CONFLICT",
        };
      }
      const updatedFamily = this.hydrateRefreshFamilyRecord(
        updatedFamilyRow,
        "iam.identity_refresh_families",
      );
      const updatedSession = this.hydrateSessionRecord(
        updatedSessionRow,
        "iam.identity_sessions",
      );

      return {
        success: true,
        session: updatedSession,
        family: updatedFamily,
      };
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
        ON CONFLICT (principal_id) DO UPDATE SET
          source_ref = EXCLUDED.source_ref,
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

  private hydrateSessionRecord(
    row: PersistedSessionRow | undefined,
    source: string,
  ): CanonicalIdentitySessionRecord {
    if (!row) {
      throw new Error(`Missing persisted session row from ${source}`);
    }

    const record = this.parseRecord<Partial<CanonicalIdentitySessionRecord>>(
      row.record,
      source,
    );

    return {
      ...record,
      sessionId: row.session_id,
      sourceRef: row.source_ref,
      principalId: row.principal_id,
      membershipId: row.membership_id,
      realm: row.realm,
      status: row.status as CanonicalIdentitySessionRecord["status"],
      authTime: row.auth_time,
      authMethods: [...row.auth_methods],
      tokenVersion: this.parseTokenVersion(row.token_version, source),
      idleExpiresAt: row.idle_expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
      revokedAt: row.revoked_at,
      revokedByPrincipalId: row.revoked_by_principal_id,
      revokeReason: row.revoke_reason,
      deviceSummary: this.parseJsonObject(row.device_summary, source),
      riskSummary: this.parseJsonObject(row.risk_summary, source),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private hydrateRefreshFamilyRecord(
    row: PersistedRefreshFamilyRow | undefined,
    source: string,
  ): CanonicalRefreshFamilyRecord {
    if (!row) {
      throw new Error(`Missing persisted refresh family row from ${source}`);
    }

    const record = this.parseRecord<Partial<CanonicalRefreshFamilyRecord>>(
      row.record,
      source,
    );

    return {
      ...record,
      familyId: row.family_id,
      sourceRef: row.source_ref,
      sessionId: row.session_id,
      currentTokenHash: row.current_token_hash,
      counter: row.counter,
      status: row.status as CanonicalRefreshFamilyRecord["status"],
      expiresAt: row.expires_at,
      compromisedAt: row.compromised_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private parseJsonObject(
    value: unknown,
    source: string,
  ): Record<string, unknown> {
    if (!value) {
      return {};
    }

    if (typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`Invalid JSON object loaded from ${source}`);
    }

    return value as Record<string, unknown>;
  }

  private parseTokenVersion(value: number | string, source: string): number {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid token_version loaded from ${source}`);
    }

    return parsed;
  }
}
