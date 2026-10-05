import { createHash, randomUUID } from "node:crypto";

import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";

import type {
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
  IamSessionInventoryQuery,
  PrivilegedRoleApprovalRequestRecord,
  PrivilegedRoleGrantRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../common/db";
import { detectAuthEnvironment } from "../../config/auth-startup-config";

type JsonRecordRow = {
  record: unknown;
};

/**
 * Controls whether an upsert may overwrite an existing role binding's
 * validFrom.
 *
 * Default (false): validFrom is set-once, like createdAt. This protects
 * idempotent authentication provisioning (Google workload identity re-auth,
 * IAP auto-provisioning) where two callers can race to create the same
 * previously-unseen role binding; the second writer must not stomp the
 * first writer's already-persisted validFrom/updatedAt and bump the
 * workforce token version, which would invalidate the first writer's
 * still-valid session (SR-AUTH-SESSION-SUPERSEDE-20261003 R3).
 *
 * true: the caller has read the current binding and is making an
 * intentional grant change (e.g. an administrator changing roleCode), and
 * the new validFrom it supplies must persist, even if validFrom is the
 * only field that changed (SR-AUTH-SESSION-SUPERSEDE-20261003 R4).
 */
export type RoleBindingMutationOptions = {
  allowValidFromMutation?: boolean;
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

export interface TenantOidcProof {
  issuer: string;
  subject: string;
  email: string;
  tenantId?: string | null;
}

export type OidcBoundTenantUser = TenantUserRoleRecord & {
  oidcIssuer?: string;
  subjectId?: string;
};

export function hashIdentitySecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

@Injectable()
export class IdentityRepository implements OnModuleInit {
  private readonly logger = new Logger(IdentityRepository.name);
  private readonly fallbackTenantUsers = new Map<string, OidcBoundTenantUser>();

  private readonly fallbackPrincipals = new Map<
    string,
    CanonicalIdentityPrincipalRecord
  >();
  private readonly fallbackPrincipalSourceRefs = new Map<string, string>();

  private readonly fallbackMemberships = new Map<
    string,
    CanonicalIdentityMembershipRecord
  >();
  private readonly fallbackMembershipSourceRefs = new Map<string, string>();

  private readonly fallbackRoleBindings = new Map<
    string,
    CanonicalIdentityRoleBindingRecord
  >();
  private readonly fallbackRoleBindingSourceRefs = new Map<string, string>();

  private readonly fallbackInvitations = new Map<
    string,
    CanonicalIdentityInvitationRecord
  >();
  private readonly fallbackInvitationSourceRefs = new Map<string, string>();

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

  private readonly fallbackConsumedStepUpNonces = new Map<
    string,
    { nonce: string; expiresAt: string; consumedAt: string }
  >();

  private readonly fallbackPrivilegedRoleRequests = new Map<
    string,
    PrivilegedRoleApprovalRequestRecord
  >();

  private readonly fallbackPrivilegedRoleGrants = new Map<
    string,
    PrivilegedRoleGrantRecord
  >();

  constructor(@Optional() private readonly databaseService?: DatabaseService) {
    this.ensureDefaultPlatformAccount().catch(() => {});
    this.ensureLiveMapObserverAccount().catch(() => {});
  }

  async onModuleInit() {
    await this.ensureDefaultPlatformAccount();
    await this.ensureLiveMapObserverAccount();
  }

  isEnabled() {
    return this.databaseService?.isEnabled() ?? false;
  }

  async ensureDefaultPlatformAccount(): Promise<{
    principal: CanonicalIdentityPrincipalRecord;
    membership: CanonicalIdentityMembershipRecord;
  }> {
    const existingPrincipal = await this.findPrincipalById(
      "principal_platform_admin_default",
    );
    const existingMemberships = existingPrincipal
      ? await this.findMembershipsByPrincipalId(
          "principal_platform_admin_default",
        )
      : [];
    const existingMembership = existingMemberships.find(
      (m) => m.membershipId === "membership_platform_admin_default",
    );
    const existingBindings = existingMembership
      ? await this.findRoleBindingsByMembershipId(
          "membership_platform_admin_default",
        )
      : [];
    const existingRoleBinding = existingBindings.find(
      (b) => b.roleBindingId === "role_binding_platform_admin_default",
    );

    const now = new Date().toISOString();
    const principalDraft: CanonicalIdentityPrincipalRecord = {
      principalId: "principal_platform_admin_default",
      sourceRef: "platform_admin_default:principal",
      issuer: "iap_workforce",
      subject: "platform-admins@platform.drts",
      principalType: "human",
      email: "platform-admin@platform.drts",
      emailVerified: true,
      displayName: "Platform Admin",
      status: "active",
      createdAt: existingPrincipal?.createdAt ?? now,
      updatedAt: existingPrincipal?.updatedAt ?? now,
    };

    const membershipDraft: CanonicalIdentityMembershipRecord = {
      membershipId: "membership_platform_admin_default",
      sourceRef: "platform_admin_default:membership",
      principalId: principalDraft.principalId,
      realm: "platform",
      scopeRef: "platform:root",
      tenantId: null,
      partnerId: null,
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: existingMembership?.createdAt ?? now,
      updatedAt: existingMembership?.updatedAt ?? now,
    };

    const roleBindingDraft: CanonicalIdentityRoleBindingRecord = {
      roleBindingId: "role_binding_platform_admin_default",
      sourceRef: "platform_admin_default:role_binding",
      membershipId: membershipDraft.membershipId,
      roleCode: "platform_admin",
      grantedByPrincipalId: null,
      approvalId: null,
      validFrom: existingRoleBinding?.validFrom ?? now,
      validTo: null,
      createdAt: existingRoleBinding?.createdAt ?? now,
      updatedAt: existingRoleBinding?.updatedAt ?? now,
    };

    if (!this.isEnabled()) {
      const principal = this.upsertFallbackPrincipal(principalDraft);
      const membership = this.upsertFallbackMembership(membershipDraft);
      this.upsertFallbackRoleBinding(roleBindingDraft);
      return { principal, membership };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const principal = await this.upsertPrincipal(
        client,
        principalDraft,
        true,
      );
      const membership = await this.upsertMembership(
        client,
        {
          ...membershipDraft,
          principalId: principal.principalId,
        },
        true,
      );
      await this.upsertRoleBinding(
        client,
        {
          ...roleBindingDraft,
          membershipId: membership.membershipId,
        },
        true,
      );
      await client.query("COMMIT");
      return { principal, membership };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async ensureLiveMapObserverAccount(): Promise<{
    principal: CanonicalIdentityPrincipalRecord;
    membership: CanonicalIdentityMembershipRecord;
  } | null> {
    const environment = detectAuthEnvironment(process.env);
    if (
      process.env.DRTS_E2E_PROVISIONING !== "true" ||
      environment === "production" ||
      environment === "staging"
    ) {
      return null;
    }
    const existingPrincipal = await this.findPrincipalById("live-map-observer");
    const existingMemberships = existingPrincipal
      ? await this.findMembershipsByPrincipalId("live-map-observer")
      : [];
    const existingMembership = existingMemberships.find(
      (m) => m.realm === "ops" && m.scopeRef === "ops",
    );

    const now = new Date().toISOString();
    const principalDraft: CanonicalIdentityPrincipalRecord = {
      principalId: "live-map-observer",
      sourceRef: "live_map_observer:principal",
      issuer: "system",
      subject: "live-map-observer",
      principalType: "human",
      email: null,
      emailVerified: false,
      displayName: "Live Map Observer (E2E)",
      status: "active",
      createdAt: existingPrincipal?.createdAt ?? now,
      updatedAt: existingPrincipal?.updatedAt ?? now,
    };

    const membershipDraft: CanonicalIdentityMembershipRecord = {
      membershipId:
        existingMembership?.membershipId ?? `membership_ops_${randomUUID()}`,
      sourceRef: "live_map_observer:membership:ops",
      principalId: principalDraft.principalId,
      realm: "ops",
      scopeRef: "ops",
      tenantId: null,
      partnerId: null,
      status: "active",
      invitedByPrincipalId: null,
      invitationId: null,
      createdAt: existingMembership?.createdAt ?? now,
      updatedAt: existingMembership?.updatedAt ?? now,
    };

    const roleBindingDraft: CanonicalIdentityRoleBindingRecord = {
      roleBindingId: `role_binding_ops_${randomUUID()}`,
      sourceRef: "live_map_observer:role_binding:ops_observer",
      membershipId: membershipDraft.membershipId,
      roleCode: "ops_observer",
      grantedByPrincipalId: null,
      approvalId: null,
      validFrom: now,
      validTo: null,
      createdAt: now,
      updatedAt: now,
    };

    if (!this.isEnabled()) {
      const principal = this.upsertFallbackPrincipal(principalDraft);
      const membership = this.upsertFallbackMembership(membershipDraft);
      this.upsertFallbackRoleBinding(roleBindingDraft);
      return { principal, membership };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const principal = await this.upsertPrincipal(
        client,
        principalDraft,
        true,
      );
      const membership = await this.upsertMembership(
        client,
        {
          ...membershipDraft,
          principalId: principal.principalId,
        },
        true,
      );
      await this.upsertRoleBinding(
        client,
        {
          ...roleBindingDraft,
          membershipId: membership.membershipId,
        },
        true,
      );
      await client.query("COMMIT");
      return { principal, membership };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async syncLegacyTenantUserRole(
    userRole: TenantUserRoleRecord,
  ): Promise<CanonicalTenantUserIdentitySnapshot> {
    const oidcUser = userRole as OidcBoundTenantUser;
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
      issuer: oidcUser.oidcIssuer || LEGACY_TENANT_USER_ISSUER,
      subject:
        oidcUser.oidcIssuer && oidcUser.subjectId
          ? oidcUser.subjectId
          : this.buildLegacyTenantSubject(userRole.tenantId, normalizedEmail),
      principalType: "human",
      email: normalizedEmail,
      emailVerified: Boolean(oidcUser.oidcIssuer && oidcUser.subjectId),
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
      deliveryId: null,
      expiresAt: invitationExpiresAt,
      acceptedAt: null,
      revokedAt: userRole.status === "invited" ? null : userRole.updatedAt,
      createdAt: userRole.invitedAt,
      updatedAt: now,
    };

    if (!this.isEnabled()) {
      this.fallbackTenantUsers.set(userRole.userId, { ...userRole });
      const principal = this.upsertFallbackPrincipal(principalDraft);
      const membership = this.upsertFallbackMembership({
        ...membershipDraft,
        principalId: principal.principalId,
      });
      const roleBinding = this.upsertFallbackRoleBinding({
        ...roleBindingDraft,
        membershipId: membership.membershipId,
      });
      const existingInvitation = Array.from(
        this.fallbackInvitations.values(),
      ).find((candidate) => candidate.membershipId === membership.membershipId);
      const invitation =
        existingInvitation &&
        existingInvitation.deliveryStatus !== "legacy_backfill"
          ? { ...existingInvitation }
          : userRole.invitedAt.trim().length > 0
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
      const principal = await this.upsertPrincipal(
        client,
        principalDraft,
        true,
      );
      const membership = await this.upsertMembership(
        client,
        {
          ...membershipDraft,
          principalId: principal.principalId,
          invitationId: null,
        },
        true,
      );
      const roleBinding = await this.upsertRoleBinding(
        client,
        {
          ...roleBindingDraft,
          membershipId: membership.membershipId,
        },
        true,
      );
      const existingInvitationResult = await client.query<JsonRecordRow>(
        `SELECT record FROM iam.identity_invitations WHERE membership_id = $1 ORDER BY updated_at DESC LIMIT 1`,
        [membership.membershipId],
      );
      const existingInvitation = existingInvitationResult.rows[0]?.record
        ? this.parseRecord<CanonicalIdentityInvitationRecord>(
            existingInvitationResult.rows[0].record,
            "iam.identity_invitations",
          )
        : null;
      const persistedInvitation =
        existingInvitation &&
        existingInvitation.deliveryStatus !== "legacy_backfill"
          ? existingInvitation
          : userRole.invitedAt.trim().length
            ? await this.upsertInvitation(client, {
                ...invitationDraft,
                membershipId: membership.membershipId,
              })
            : null;
      const persistedMembership = persistedInvitation
        ? await this.upsertMembership(
            client,
            {
              ...membership,
              invitationId: persistedInvitation.invitationId,
            },
            true,
          )
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

  async findInvitationByTokenHash(
    tokenHash: string,
  ): Promise<CanonicalIdentityInvitationRecord | null> {
    if (!this.isEnabled()) {
      for (const invitation of this.fallbackInvitations.values()) {
        if (invitation.tokenHash === tokenHash) return { ...invitation };
      }
      return null;
    }
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM iam.identity_invitations WHERE token_hash = $1 LIMIT 1`,
      [tokenHash],
    );
    return result.rows[0]?.record
      ? this.parseRecord<CanonicalIdentityInvitationRecord>(
          result.rows[0].record,
          "iam.identity_invitations",
        )
      : null;
  }

  async findInvitationByMembershipId(
    membershipId: string,
  ): Promise<CanonicalIdentityInvitationRecord | null> {
    if (!this.isEnabled()) {
      const invitation = Array.from(this.fallbackInvitations.values())
        .filter((candidate) => candidate.membershipId === membershipId)
        .sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        )[0];
      return invitation ? { ...invitation } : null;
    }
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM iam.identity_invitations WHERE membership_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [membershipId],
    );
    return result.rows[0]?.record
      ? this.parseRecord<CanonicalIdentityInvitationRecord>(
          result.rows[0].record,
          "iam.identity_invitations",
        )
      : null;
  }

  /**
   * Returns the pending proof for a membership without ever selecting a
   * superseded, accepted, or revoked invitation.  A membership can retain an
   * invitation history after resend, so callers that mutate the current proof
   * must not rely on a timestamp tie-break alone.
   */
  async findPendingInvitationByMembershipId(
    membershipId: string,
  ): Promise<CanonicalIdentityInvitationRecord | null> {
    if (!this.isEnabled()) {
      const invitation = Array.from(this.fallbackInvitations.values())
        .filter(
          (candidate) =>
            candidate.membershipId === membershipId &&
            !candidate.acceptedAt &&
            !candidate.revokedAt,
        )
        .sort((left, right) =>
          right.updatedAt.localeCompare(left.updatedAt),
        )[0];
      return invitation ? { ...invitation } : null;
    }
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record
         FROM iam.identity_invitations
        WHERE membership_id = $1
          AND (record->>'acceptedAt') IS NULL
          AND (record->>'revokedAt') IS NULL
        ORDER BY updated_at DESC
        LIMIT 1`,
      [membershipId],
    );
    return result.rows[0]?.record
      ? this.parseRecord<CanonicalIdentityInvitationRecord>(
          result.rows[0].record,
          "iam.identity_invitations",
        )
      : null;
  }

  async upsertInvitationRecord(
    invitation: CanonicalIdentityInvitationRecord,
  ): Promise<CanonicalIdentityInvitationRecord> {
    if (!this.isEnabled()) return this.upsertFallbackInvitation(invitation);
    const client = await this.databaseService!.connect();
    try {
      return await this.upsertInvitation(client, invitation);
    } finally {
      client.release();
    }
  }

  async findTenantUserForAuthentication(
    tenantId: string,
    userId: string,
  ): Promise<OidcBoundTenantUser | null> {
    if (!this.isEnabled()) {
      const user = this.fallbackTenantUsers.get(userId);
      return user?.tenantId === tenantId ? { ...user } : null;
    }
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM admin.phase1_tenant_user_roles WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, userId],
    );
    return result.rows[0]
      ? this.parseRecord<OidcBoundTenantUser>(
          result.rows[0].record,
          "admin.phase1_tenant_user_roles",
        )
      : null;
  }

  async findTenantUserByOidcSubject(
    proof: Pick<TenantOidcProof, "issuer" | "subject" | "tenantId">,
  ): Promise<OidcBoundTenantUser | null> {
    if (!this.isEnabled()) {
      const matches = [...this.fallbackTenantUsers.values()].filter(
        (user) =>
          user.oidcIssuer === proof.issuer &&
          user.subjectId === proof.subject &&
          (!proof.tenantId || user.tenantId === proof.tenantId),
      );
      return matches.length === 1 ? { ...matches[0]! } : null;
    }
    const result = await this.databaseService!.query<JsonRecordRow>(
      `SELECT record FROM admin.phase1_tenant_user_roles
        WHERE record->>'oidcIssuer' = $1 AND record->>'subjectId' = $2
          AND ($3::text IS NULL OR tenant_id = $3) LIMIT 2`,
      [proof.issuer, proof.subject, proof.tenantId || null],
    );
    return result.rows.length === 1
      ? this.parseRecord<OidcBoundTenantUser>(
          result.rows[0]!.record,
          "admin.phase1_tenant_user_roles",
        )
      : null;
  }

  /** One transaction owns invitation consumption, identity binding and activation.
   * A failed check never burns the proof. The (issuer, subject) principal unique
   * constraint also prevents two invitations from binding the same identity. */
  async acceptTenantOidcInvitation(
    tokenHash: string,
    proof: TenantOidcProof,
  ): Promise<{
    user: OidcBoundTenantUser;
    invitation: CanonicalIdentityInvitationRecord;
  } | null> {
    const now = new Date().toISOString();
    const validInvitation = (
      invitation: CanonicalIdentityInvitationRecord | undefined,
    ) =>
      invitation &&
      invitation.realm === "tenant" &&
      !invitation.acceptedAt &&
      !invitation.revokedAt &&
      Date.parse(invitation.expiresAt) > Date.parse(now) &&
      invitation.email.toLowerCase() === proof.email.toLowerCase() &&
      (!proof.tenantId || proof.tenantId === invitation.tenantId);
    const validUser = (
      user: OidcBoundTenantUser | undefined,
      invitation: CanonicalIdentityInvitationRecord,
    ) =>
      user &&
      user.status === "invited" &&
      !user.oidcIssuer &&
      !user.subjectId &&
      user.tenantId === invitation.tenantId &&
      user.email.toLowerCase() === proof.email.toLowerCase() &&
      user.roleCode === invitation.roleCode;
    const activateUser = (user: OidcBoundTenantUser): OidcBoundTenantUser => ({
      ...user,
      status: "active",
      oidcIssuer: proof.issuer,
      subjectId: proof.subject,
      updatedAt: now,
    });
    if (!proof.issuer || !proof.subject || !proof.email) return null;
    if (!this.isEnabled()) {
      // No await before all checks and writes: the offline repository preserves
      // the same one-shot semantics for concurrent unit-test consumers.
      const invitation = [...this.fallbackInvitations.values()].find(
        (entry) => entry.tokenHash === tokenHash,
      );
      if (!invitation || !validInvitation(invitation)) return null;
      const membership = this.fallbackMemberships.get(invitation.membershipId);
      const principal =
        membership && this.fallbackPrincipals.get(membership.principalId);
      const user = [...this.fallbackTenantUsers.values()].find(
        (entry) =>
          membership?.sourceRef ===
          `tenant_user_role:${entry.userId}:membership`,
      );
      if (
        !membership ||
        membership.status !== "invited" ||
        membership.realm !== "tenant" ||
        membership.scopeRef !== invitation.scopeRef ||
        membership.tenantId !== invitation.tenantId ||
        !principal ||
        principal.status !== "invited" ||
        principal.issuer !== LEGACY_TENANT_USER_ISSUER ||
        !user ||
        principal.sourceRef !== `tenant_user_role:${user.userId}:principal` ||
        !validUser(user, invitation) ||
        [...this.fallbackPrincipals.values()].some(
          (entry) =>
            entry.issuer === proof.issuer && entry.subject === proof.subject,
        )
      )
        return null;
      const activated = activateUser(user);
      this.upsertFallbackPrincipal({
        ...principal,
        issuer: proof.issuer,
        subject: proof.subject,
        status: "active",
        emailVerified: true,
        updatedAt: now,
      });
      this.upsertFallbackMembership({
        ...membership,
        status: "active",
        updatedAt: now,
      });
      const accepted = this.upsertFallbackInvitation({
        ...invitation,
        acceptedAt: now,
        updatedAt: now,
      });
      this.fallbackTenantUsers.set(user.userId, activated);
      return { user: { ...activated }, invitation: accepted };
    }
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const invitationRows = await client.query<JsonRecordRow>(
        `SELECT record FROM iam.identity_invitations WHERE token_hash = $1
          AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > $2::timestamptz FOR UPDATE`,
        [tokenHash, now],
      );
      const invitation =
        invitationRows.rows[0] &&
        this.parseRecord<CanonicalIdentityInvitationRecord>(
          invitationRows.rows[0].record,
          "iam.identity_invitations",
        );
      if (!invitation || !validInvitation(invitation)) {
        await client.query("ROLLBACK");
        return null;
      }
      const membershipRows = await client.query<JsonRecordRow>(
        `SELECT record FROM iam.identity_memberships WHERE membership_id = $1 FOR UPDATE`,
        [invitation.membershipId],
      );
      const membership =
        membershipRows.rows[0] &&
        this.parseRecord<CanonicalIdentityMembershipRecord>(
          membershipRows.rows[0].record,
          "iam.identity_memberships",
        );
      if (
        !membership ||
        membership.status !== "invited" ||
        membership.realm !== "tenant" ||
        membership.scopeRef !== invitation.scopeRef ||
        membership.tenantId !== invitation.tenantId
      ) {
        await client.query("ROLLBACK");
        return null;
      }
      const principalRows = await client.query<JsonRecordRow>(
        `SELECT record FROM iam.identity_principals WHERE principal_id = $1 FOR UPDATE`,
        [membership.principalId],
      );
      const principal =
        principalRows.rows[0] &&
        this.parseRecord<CanonicalIdentityPrincipalRecord>(
          principalRows.rows[0].record,
          "iam.identity_principals",
        );
      const userId = /^tenant_user_role:(.+):membership$/.exec(
        membership.sourceRef ?? "",
      )?.[1];
      if (
        !principal ||
        principal.status !== "invited" ||
        principal.issuer !== LEGACY_TENANT_USER_ISSUER ||
        !userId
      ) {
        await client.query("ROLLBACK");
        return null;
      }
      const userRows = await client.query<JsonRecordRow>(
        `SELECT record FROM admin.phase1_tenant_user_roles WHERE user_id = $1 FOR UPDATE`,
        [userId],
      );
      const user =
        userRows.rows[0] &&
        this.parseRecord<OidcBoundTenantUser>(
          userRows.rows[0].record,
          "admin.phase1_tenant_user_roles",
        );
      if (
        !user ||
        principal.sourceRef !== `tenant_user_role:${user.userId}:principal` ||
        !validUser(user, invitation)
      ) {
        await client.query("ROLLBACK");
        return null;
      }
      const activated = activateUser(user);
      await this.upsertPrincipal(
        client,
        {
          ...principal,
          issuer: proof.issuer,
          subject: proof.subject,
          status: "active",
          emailVerified: true,
          updatedAt: now,
        },
        true,
      );
      await this.upsertMembership(
        client,
        { ...membership, status: "active", updatedAt: now },
        true,
      );
      const accepted = await this.upsertInvitation(client, {
        ...invitation,
        acceptedAt: now,
        updatedAt: now,
      });
      await client.query(
        `UPDATE admin.phase1_tenant_user_roles SET status = 'active', updated_at = $2::timestamptz, record = $3::jsonb WHERE user_id = $1`,
        [user.userId, now, JSON.stringify(activated)],
      );
      await client.query("COMMIT");
      return { user: activated, invitation: accepted };
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") return null;
      throw error;
    } finally {
      client.release();
    }
  }

  /** Atomically consumes a valid proof so concurrent acceptance cannot activate twice. */
  async consumeInvitationToken(
    tokenHash: string,
    acceptedAt = new Date().toISOString(),
  ): Promise<CanonicalIdentityInvitationRecord | null> {
    if (!this.isEnabled()) {
      const invitation = await this.findInvitationByTokenHash(tokenHash);
      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        Date.parse(invitation.expiresAt) <= Date.parse(acceptedAt)
      )
        return null;
      return this.upsertFallbackInvitation({
        ...invitation,
        acceptedAt,
        updatedAt: acceptedAt,
      });
    }
    const result = await this.databaseService!.query<JsonRecordRow>(
      `UPDATE iam.identity_invitations SET accepted_at = $2::timestamptz, updated_at = $2::timestamptz, record = jsonb_set(jsonb_set(COALESCE(record, '{}'::jsonb), '{acceptedAt}', to_jsonb($2::text)), '{updatedAt}', to_jsonb($2::text)) WHERE token_hash = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > $2::timestamptz RETURNING record`,
      [tokenHash, acceptedAt],
    );
    return result.rows[0]?.record
      ? this.parseRecord<CanonicalIdentityInvitationRecord>(
          result.rows[0].record,
          "iam.identity_invitations",
        )
      : null;
  }

  /** Promotes the canonical principal and membership only after proof consumption. */
  async activateTenantInvitation(
    invitationId: string,
    activatedAt = new Date().toISOString(),
  ): Promise<CanonicalTenantUserIdentitySnapshot | null> {
    if (!this.isEnabled()) {
      const invitation = Array.from(this.fallbackInvitations.values()).find(
        (candidate) => candidate.invitationId === invitationId,
      );
      if (!invitation?.acceptedAt) return null;
      const membership = await this.findMembershipById(invitation.membershipId);
      if (!membership) return null;
      const principal = await this.findPrincipalById(membership.principalId);
      const roleBinding = (
        await this.findRoleBindingsByMembershipId(membership.membershipId)
      )[0];
      if (!principal || !roleBinding) return null;
      return {
        principal: this.upsertFallbackPrincipal({
          ...principal,
          status: "active",
          emailVerified: true,
          updatedAt: activatedAt,
        }),
        membership: this.upsertFallbackMembership({
          ...membership,
          status: "active",
          updatedAt: activatedAt,
        }),
        roleBinding,
        invitation,
      };
    }
    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const invitationRow = await client.query<JsonRecordRow>(
        `SELECT record FROM iam.identity_invitations WHERE invitation_id = $1 FOR UPDATE`,
        [invitationId],
      );
      if (!invitationRow.rows[0]?.record) {
        await client.query("ROLLBACK");
        return null;
      }
      const invitation = this.parseRecord<CanonicalIdentityInvitationRecord>(
        invitationRow.rows[0].record,
        "iam.identity_invitations",
      );
      if (!invitation.acceptedAt) {
        await client.query("ROLLBACK");
        return null;
      }
      const membershipRow = await client.query<JsonRecordRow>(
        `SELECT record FROM iam.identity_memberships WHERE membership_id = $1 FOR UPDATE`,
        [invitation.membershipId],
      );
      if (!membershipRow.rows[0]?.record) {
        await client.query("ROLLBACK");
        return null;
      }
      const membership = this.parseRecord<CanonicalIdentityMembershipRecord>(
        membershipRow.rows[0].record,
        "iam.identity_memberships",
      );
      const principalRow = await client.query<JsonRecordRow>(
        `SELECT record FROM iam.identity_principals WHERE principal_id = $1 FOR UPDATE`,
        [membership.principalId],
      );
      if (!principalRow.rows[0]?.record) {
        await client.query("ROLLBACK");
        return null;
      }
      const principal = this.parseRecord<CanonicalIdentityPrincipalRecord>(
        principalRow.rows[0].record,
        "iam.identity_principals",
      );
      const roleBindingRow = await client.query<JsonRecordRow>(
        `SELECT record FROM iam.identity_role_bindings WHERE membership_id = $1 LIMIT 1`,
        [membership.membershipId],
      );
      if (!roleBindingRow.rows[0]?.record) {
        await client.query("ROLLBACK");
        return null;
      }
      const activatedPrincipal = await this.upsertPrincipal(
        client,
        {
          ...principal,
          status: "active",
          emailVerified: true,
          updatedAt: activatedAt,
        },
        true,
      );
      const activatedMembership = await this.upsertMembership(
        client,
        {
          ...membership,
          status: "active",
          updatedAt: activatedAt,
        },
        true,
      );
      await client.query("COMMIT");
      return {
        principal: activatedPrincipal,
        membership: activatedMembership,
        roleBinding: this.parseRecord<CanonicalIdentityRoleBindingRecord>(
          roleBindingRow.rows[0].record,
          "iam.identity_role_bindings",
        ),
        invitation,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async findPrincipalsByEmail(
    email: string,
  ): Promise<CanonicalIdentityPrincipalRecord[]> {
    const normalized = email.trim().toLowerCase();
    if (!this.isEnabled()) {
      return Array.from(this.fallbackPrincipals.values())
        .filter((principal) => principal.email?.toLowerCase() === normalized)
        .map((principal) => ({ ...principal }));
    }

    const client = await this.databaseService!.connect();
    try {
      const result = await client.query<JsonRecordRow>(
        `
          SELECT record
          FROM iam.identity_principals
          WHERE email_normalized = $1
          ORDER BY updated_at DESC, created_at DESC
        `,
        [normalized],
      );
      return result.rows.map((row) =>
        this.parseRecord<CanonicalIdentityPrincipalRecord>(
          row.record,
          "iam.identity_principals",
        ),
      );
    } finally {
      client.release();
    }
  }

  async ensurePrincipalRecord(
    principal: CanonicalIdentityPrincipalRecord,
  ): Promise<CanonicalIdentityPrincipalRecord> {
    if (!this.isEnabled()) {
      return this.upsertFallbackPrincipal(principal);
    }

    const client = await this.databaseService!.connect();
    try {
      return await this.upsertPrincipal(client, principal, false);
    } finally {
      client.release();
    }
  }

  async ensureMembershipRecord(
    membership: CanonicalIdentityMembershipRecord,
  ): Promise<CanonicalIdentityMembershipRecord> {
    if (!this.isEnabled()) {
      return this.upsertFallbackMembership(membership);
    }

    const client = await this.databaseService!.connect();
    try {
      return await this.upsertMembership(client, membership, false);
    } finally {
      client.release();
    }
  }

  async ensureRoleBindingRecord(
    roleBinding: CanonicalIdentityRoleBindingRecord,
    options: RoleBindingMutationOptions = {},
  ): Promise<CanonicalIdentityRoleBindingRecord> {
    if (!this.isEnabled()) {
      return this.upsertFallbackRoleBinding(roleBinding, options);
    }

    const client = await this.databaseService!.connect();
    try {
      return await this.upsertRoleBinding(client, roleBinding, false, options);
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
      for (const principal of this.fallbackPrincipals.values()) {
        if (
          principal.principalId === principalId ||
          principal.sourceRef === principalId
        ) {
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
    const [principal] = await this.findPrincipalsByEmail(email);
    return principal ?? null;
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

  async findMembershipById(
    membershipId: string,
  ): Promise<CanonicalIdentityMembershipRecord | null> {
    if (!this.isEnabled()) {
      const membership = this.fallbackMemberships.get(membershipId);
      return membership ? { ...membership } : null;
    }

    const client = await this.databaseService!.connect();
    try {
      const result = await client.query<JsonRecordRow>(
        `
          SELECT record FROM iam.identity_memberships
          WHERE membership_id = $1
          LIMIT 1
        `,
        [membershipId],
      );
      if (!result.rows[0]?.record) {
        return null;
      }
      return this.parseRecord<CanonicalIdentityMembershipRecord>(
        result.rows[0].record,
        "iam.identity_memberships",
      );
    } finally {
      client.release();
    }
  }

  async listMembershipsByScope(
    scopeRef: string,
    realms?: readonly string[],
  ): Promise<CanonicalIdentityMembershipRecord[]> {
    if (!this.isEnabled()) {
      return Array.from(this.fallbackMemberships.values())
        .filter(
          (membership) =>
            membership.scopeRef === scopeRef &&
            (realms === undefined || realms.includes(membership.realm)),
        )
        .map((membership) => ({ ...membership }));
    }

    const client = await this.databaseService!.connect();
    try {
      const result =
        realms && realms.length > 0
          ? await client.query<JsonRecordRow>(
              `
                SELECT record
                FROM iam.identity_memberships
                WHERE scope_ref = $1
                  AND realm = ANY($2::text[])
                ORDER BY updated_at DESC, created_at DESC
              `,
              [scopeRef, realms],
            )
          : await client.query<JsonRecordRow>(
              `
                SELECT record
                FROM iam.identity_memberships
                WHERE scope_ref = $1
                ORDER BY updated_at DESC, created_at DESC
              `,
              [scopeRef],
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
    client?: PoolClient,
  ): Promise<CanonicalIdentityRoleBindingRecord[]> {
    let directBindings: CanonicalIdentityRoleBindingRecord[] = [];
    if (!this.isEnabled()) {
      for (const binding of this.fallbackRoleBindings.values()) {
        if (binding.membershipId === membershipId) {
          directBindings.push({ ...binding });
        }
      }
    } else {
      const dbClient = client ?? (await this.databaseService!.connect());
      try {
        const result = await dbClient.query<JsonRecordRow>(
          `
            SELECT record FROM iam.identity_role_bindings
            WHERE membership_id = $1
          `,
          [membershipId],
        );
        directBindings = result.rows.map((row) =>
          this.parseRecord<CanonicalIdentityRoleBindingRecord>(
            row.record,
            "iam.identity_role_bindings",
          ),
        );
      } finally {
        if (!client) {
          dbClient.release();
        }
      }
    }

    const activeGrants = await this.findActivePrivilegedGrantsForMembership(
      membershipId,
      Date.now(),
      client,
    );

    const projectedBindings: CanonicalIdentityRoleBindingRecord[] =
      activeGrants.map((grant) => ({
        roleBindingId: `grant_binding_${grant.grantId}`,
        sourceRef: grant.requestId
          ? `privileged_request:${grant.requestId}`
          : `privileged_grant:${grant.grantId}`,
        membershipId: grant.targetMembershipId || membershipId,
        roleCode: grant.roleCode,
        grantedByPrincipalId: grant.grantedByPrincipalId,
        approvalId: grant.approvalId,
        validFrom: grant.validFrom,
        validTo: grant.validTo ?? null,
        createdAt: grant.createdAt,
        updatedAt: grant.updatedAt,
      }));

    const existingRoles = new Set(directBindings.map((b) => b.roleCode));
    const merged = [...directBindings];
    for (const pb of projectedBindings) {
      if (!existingRoles.has(pb.roleCode)) {
        merged.push(pb);
        existingRoles.add(pb.roleCode);
      }
    }

    return merged;
  }

  async findActivePrivilegedGrantsForMembership(
    membershipId: string,
    currentTimeMs = Date.now(),
    client?: PoolClient,
  ): Promise<PrivilegedRoleGrantRecord[]> {
    let membership: CanonicalIdentityMembershipRecord | undefined;
    if (!this.isEnabled()) {
      membership = this.fallbackMemberships.get(membershipId);
    } else {
      const dbClient = client ?? (await this.databaseService!.connect());
      try {
        const result = await dbClient.query<JsonRecordRow>(
          `SELECT record FROM iam.identity_memberships WHERE membership_id = $1`,
          [membershipId],
        );
        if (result.rows[0]?.record) {
          membership = this.parseRecord<CanonicalIdentityMembershipRecord>(
            result.rows[0].record,
            "iam.identity_memberships",
          );
        }
      } finally {
        if (!client) {
          dbClient.release();
        }
      }
    }

    let allGrants: PrivilegedRoleGrantRecord[] = [];
    if (!this.isEnabled()) {
      allGrants = Array.from(this.fallbackPrivilegedRoleGrants.values());
    } else {
      allGrants = await this.listPrivilegedRoleGrants(
        membership?.tenantId ?? null,
        client,
      );
    }

    return allGrants.filter((grant) => {
      if (grant.status !== "active") return false;

      const validFromMs = new Date(grant.validFrom).getTime();
      if (isNaN(validFromMs) || validFromMs > currentTimeMs) return false;

      if (grant.validTo) {
        const validToMs = new Date(grant.validTo).getTime();
        if (isNaN(validToMs) || validToMs <= currentTimeMs) return false;
      }

      const matchesTarget =
        grant.targetMembershipId === membershipId ||
        (membership && grant.targetUserId === membership.principalId);

      if (!matchesTarget) return false;

      if (
        grant.tenantId &&
        membership?.tenantId &&
        grant.tenantId !== membership.tenantId
      ) {
        return false;
      }

      return true;
    });
  }

  async upsertWorkforceIdentity(
    principal: CanonicalIdentityPrincipalRecord,
    membership: CanonicalIdentityMembershipRecord,
    roleBindings: CanonicalIdentityRoleBindingRecord[],
    options: RoleBindingMutationOptions = {},
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
        this.upsertFallbackRoleBinding(
          {
            ...b,
            membershipId: m.membershipId,
          },
          options,
        ),
      );
      return { principal: p, membership: m, roleBindings: rbs };
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query("BEGIN");
      const p = await this.upsertPrincipal(client, principal, true);
      const m = await this.upsertMembership(
        client,
        {
          ...membership,
          principalId: p.principalId,
        },
        true,
      );
      const rbs: CanonicalIdentityRoleBindingRecord[] = [];
      for (const binding of roleBindings) {
        const rb = await this.upsertRoleBinding(
          client,
          {
            ...binding,
            membershipId: m.membershipId,
          },
          true,
          options,
        );
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
      const record: CanonicalIdentitySessionRecord = {
        ...session,
        status: session.status ?? "active",
        tokenVersion: session.tokenVersion ?? 1,
        createdAt: session.createdAt ?? new Date().toISOString(),
        updatedAt: session.updatedAt ?? new Date().toISOString(),
      };
      this.fallbackSessions.set(session.sessionId, record);
      return { ...record };
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
  ): Promise<CanonicalIdentitySessionRecord | null> {
    const revokedAt = new Date().toISOString();

    if (!this.isEnabled()) {
      const session = this.fallbackSessions.get(sessionId);
      if (!session) {
        return null;
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
                        jsonb_set(COALESCE(record, '{}'::jsonb), '{status}', '"revoked"'::jsonb),
                        '{revokedAt}', COALESCE(to_jsonb($2::text), 'null'::jsonb)
                      ),
                      '{revokedByPrincipalId}', COALESCE(to_jsonb($3::text), 'null'::jsonb)
                    ),
                    '{revokeReason}', COALESCE(to_jsonb($4::text), 'null'::jsonb)
                  ),
                  '{updatedAt}', COALESCE(to_jsonb($2::text), 'null'::jsonb)
                ),
                '{status}', '"revoked"'::jsonb
              )
          WHERE session_id = $1::text
          RETURNING *
        `,
        [sessionId, revokedAt, revokedByPrincipalId || null, reason],
      );

      if (sessionResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `
          UPDATE iam.identity_refresh_families
          SET status = 'revoked',
              updated_at = $2::timestamptz,
              record = jsonb_set(
                jsonb_set(COALESCE(record, '{}'::jsonb), '{status}', '"revoked"'::jsonb),
                '{updatedAt}', COALESCE(to_jsonb($2::text), 'null'::jsonb)
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

  async revokeAllSessionsForPrincipal(
    principalId: string,
    reason: string,
    revokedByPrincipalId?: string,
  ): Promise<number> {
    const revokedAt = new Date().toISOString();

    if (!this.isEnabled()) {
      let count = 0;
      for (const [sessionId, session] of this.fallbackSessions.entries()) {
        if (
          session.principalId === principalId &&
          session.status === "active"
        ) {
          this.fallbackSessions.set(sessionId, {
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
            if (family.sessionId === sessionId && family.status === "active") {
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
      const result = await client.query<{ session_id: string }>(
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
                    jsonb_set(COALESCE(record, '{}'::jsonb), '{status}', '"revoked"'::jsonb),
                    '{revokedAt}', COALESCE(to_jsonb($2::text), 'null'::jsonb)
                  ),
                  '{revokedByPrincipalId}', COALESCE(to_jsonb($3::text), 'null'::jsonb)
                ),
                '{revokeReason}', COALESCE(to_jsonb($4::text), 'null'::jsonb)
              )
          WHERE principal_id = $1::text AND status = 'active'
          RETURNING session_id
        `,
        [principalId, revokedAt, revokedByPrincipalId || null, reason],
      );

      const revokedSessionIds = result.rows.map((row) => row.session_id);
      if (revokedSessionIds.length > 0) {
        await client.query(
          `
            UPDATE iam.identity_refresh_families
            SET status = 'revoked',
                updated_at = $2::timestamptz,
                record = jsonb_set(
                  jsonb_set(COALESCE(record, '{}'::jsonb), '{status}', '"revoked"'::jsonb),
                  '{updatedAt}', COALESCE(to_jsonb($2::text), 'null'::jsonb)
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

  async revokeSessionsForPrincipal(
    principalId: string,
    reason: string,
    revokedByPrincipalId?: string,
  ): Promise<number> {
    return this.revokeAllSessionsForPrincipal(
      principalId,
      reason,
      revokedByPrincipalId,
    );
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

  async listSessionsByTenant(
    tenantId: string,
  ): Promise<CanonicalIdentitySessionRecord[]> {
    if (!this.isEnabled()) {
      return Array.from(this.fallbackSessions.values())
        .filter(
          (session) =>
            session.tenantId === tenantId && session.realm === "tenant",
        )
        .map((session) => ({ ...session }));
    }

    const result = await this.databaseService!.query<PersistedSessionRow>(
      `SELECT * FROM iam.identity_sessions
       WHERE record->>'tenantId' = $1 AND realm = 'tenant'
       ORDER BY updated_at DESC`,
      [tenantId],
    );

    return result.rows.map((row) =>
      this.hydrateSessionRecord(row, "iam.identity_sessions"),
    );
  }

  async listSessions(
    query?: IamSessionInventoryQuery,
  ): Promise<CanonicalIdentitySessionRecord[]> {
    const actorId = query?.actorId?.trim() || null;
    const principalId = query?.principalId?.trim() || null;
    const realm = query?.realm?.trim() || null;
    const tenantId = query?.tenantId?.trim() || null;
    const status = query?.status?.trim() || null;
    const includeRevoked = query?.includeRevoked === true;
    const limit =
      typeof query?.limit === "number" && query.limit > 0 ? query.limit : null;

    if (!this.isEnabled()) {
      let sessions = Array.from(this.fallbackSessions.values());
      if (principalId) {
        sessions = sessions.filter((s) => s.principalId === principalId);
      }
      if (actorId) {
        sessions = sessions.filter((s) => s.actorId === actorId);
      }
      if (realm) {
        sessions = sessions.filter((s) => s.realm === realm);
      }
      if (tenantId) {
        sessions = sessions.filter((s) => s.tenantId === tenantId);
      }
      if (status) {
        sessions = sessions.filter((s) => s.status === status);
      } else if (!includeRevoked) {
        sessions = sessions.filter((s) => s.status === "active");
      }
      sessions.sort(
        (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
      );
      if (limit) {
        sessions = sessions.slice(0, limit);
      }
      return sessions.map((session) => ({ ...session }));
    }

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (principalId) {
      params.push(principalId);
      conditions.push(`principal_id = $${params.length}`);
    }

    if (realm) {
      params.push(realm);
      conditions.push(`realm = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    } else if (!includeRevoked) {
      conditions.push(`status = 'active'`);
    }

    if (actorId) {
      params.push(actorId);
      conditions.push(`record->>'actorId' = $${params.length}`);
    }

    if (tenantId) {
      params.push(tenantId);
      conditions.push(`record->>'tenantId' = $${params.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    let sql = `SELECT * FROM iam.identity_sessions ${whereClause} ORDER BY updated_at DESC`;
    if (limit) {
      params.push(limit);
      sql += ` LIMIT $${params.length}`;
    }

    const result = await this.databaseService!.query<PersistedSessionRow>(
      sql,
      params,
    );
    return result.rows.map((row) =>
      this.hydrateSessionRecord(row, "iam.identity_sessions"),
    );
  }

  async revokeSessionsByPrincipal(
    principalId: string,
    reason: string,
    revokedByPrincipalId?: string,
    client?: PoolClient,
  ): Promise<number> {
    const revokedAt = new Date().toISOString();
    let count = 0;
    if (!this.isEnabled()) {
      for (const [id, session] of this.fallbackSessions.entries()) {
        if (
          (session.principalId === principalId ||
            session.actorId === principalId) &&
          session.status === "active"
        ) {
          const updated: CanonicalIdentitySessionRecord = {
            ...session,
            status: "revoked",
            revokedAt,
            revokedByPrincipalId: revokedByPrincipalId || null,
            revokeReason: reason,
            updatedAt: revokedAt,
          };
          this.fallbackSessions.set(id, updated);
          count++;

          for (const [
            familyId,
            family,
          ] of this.fallbackRefreshFamilies.entries()) {
            if (family.sessionId === id && family.status === "active") {
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

    const runner = client || (await this.databaseService!.connect());
    const isOwnClient = !client;
    try {
      if (isOwnClient) await runner.query("BEGIN");
      const result = await runner.query<{ session_id: string }>(
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
                      jsonb_set(COALESCE(record, '{}'::jsonb), '{status}', '"revoked"'::jsonb),
                      '{revokedAt}', COALESCE(to_jsonb($2::text), 'null'::jsonb)
                    ),
                    '{revokedByPrincipalId}', COALESCE(to_jsonb($3::text), 'null'::jsonb)
                  ),
                  '{revokeReason}', COALESCE(to_jsonb($4::text), 'null'::jsonb)
                ),
                '{updatedAt}', COALESCE(to_jsonb($2::text), 'null'::jsonb)
              )
          WHERE (principal_id = $1::text OR record->>'actorId' = $1::text)
            AND status = 'active'
          RETURNING session_id
        `,
        [principalId, revokedAt, revokedByPrincipalId || null, reason],
      );

      const sessionIds = result.rows.map((r) => r.session_id);
      if (sessionIds.length > 0) {
        await runner.query(
          `
            UPDATE iam.identity_refresh_families
            SET status = 'revoked',
                updated_at = $2::timestamptz,
                record = jsonb_set(
                  jsonb_set(COALESCE(record, '{}'::jsonb), '{status}', '"revoked"'::jsonb),
                  '{updatedAt}', COALESCE(to_jsonb($2::text), 'null'::jsonb)
                )
            WHERE session_id = ANY($1::text[]) AND status = 'active'
          `,
          [sessionIds, revokedAt],
        );
      }
      if (isOwnClient) await runner.query("COMMIT");
      return sessionIds.length;
    } catch (err) {
      if (isOwnClient) await runner.query("ROLLBACK");
      throw err;
    } finally {
      if (isOwnClient) runner.release();
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

  async consumeStepUpNonce(input: {
    nonce: string;
    expiresAt: string;
    actorId?: string;
    action?: string;
    targetId?: string;
  }): Promise<boolean> {
    const consumedAt = new Date().toISOString();

    if (!this.isEnabled()) {
      const now = Date.now();
      for (const [nonce, record] of this.fallbackConsumedStepUpNonces) {
        if (Date.parse(record.expiresAt) < now) {
          this.fallbackConsumedStepUpNonces.delete(nonce);
        }
      }

      if (this.fallbackConsumedStepUpNonces.has(input.nonce)) {
        return false;
      }

      this.fallbackConsumedStepUpNonces.set(input.nonce, {
        nonce: input.nonce,
        expiresAt: input.expiresAt,
        consumedAt,
      });
      return true;
    }

    const client = await this.databaseService!.connect();
    try {
      await client.query(
        `
          DELETE FROM iam.step_up_nonces
          WHERE expires_at < NOW()
        `,
      );

      const result = await client.query<{ nonce: string }>(
        `
          INSERT INTO iam.step_up_nonces (
            nonce,
            expires_at,
            consumed_at,
            actor_id,
            action,
            target_id
          ) VALUES (
            $1, $2, $3, $4, $5, $6
          )
          ON CONFLICT (nonce) DO NOTHING
          RETURNING nonce
        `,
        [
          input.nonce,
          input.expiresAt,
          consumedAt,
          input.actorId ?? null,
          input.action ?? null,
          input.targetId ?? null,
        ],
      );

      return (result.rows?.length ?? 0) > 0;
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
                      jsonb_set(COALESCE(record, '{}'::jsonb), '{status}', '"compromised"'::jsonb),
                      '{compromisedAt}', COALESCE(to_jsonb($1::text), 'null'::jsonb)
                    ),
                    '{updatedAt}', COALESCE(to_jsonb($1::text), 'null'::jsonb)
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
                        jsonb_set(COALESCE(record, '{}'::jsonb), '{status}', '"compromised"'::jsonb),
                        '{revokedAt}', COALESCE(to_jsonb($1::text), 'null'::jsonb)
                      ),
                      '{revokeReason}', '"REFRESH_TOKEN_REUSE_DETECTED"'::jsonb
                    ),
                    '{updatedAt}', COALESCE(to_jsonb($1::text), 'null'::jsonb)
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
                  jsonb_set(COALESCE(record, '{}'::jsonb), '{status}', '"expired"'::jsonb),
                  '{updatedAt}', COALESCE(to_jsonb($1::text), 'null'::jsonb)
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
                  jsonb_set(COALESCE(record, '{}'::jsonb), '{status}', '"expired"'::jsonb),
                  '{updatedAt}', COALESCE(to_jsonb($1::text), 'null'::jsonb)
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
                      jsonb_set(COALESCE(record, '{}'::jsonb), '{currentTokenHash}', COALESCE(to_jsonb($1::text), 'null'::jsonb)),
                      '{counter}', COALESCE(to_jsonb(counter + 1), '0'::jsonb)
                    ),
                    '{previousHashes}',
                    coalesce(record->'previousHashes', '[]'::jsonb) || COALESCE(to_jsonb($4::text), 'null'::jsonb)
                  ),
                  '{expiresAt}', COALESCE(to_jsonb($2::text), 'null'::jsonb)
                ),
                '{updatedAt}', COALESCE(to_jsonb($3::text), 'null'::jsonb)
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
                  jsonb_set(COALESCE(record, '{}'::jsonb), '{currentTokenId}', COALESCE(to_jsonb($3::text), 'null'::jsonb)),
                  '{tokenVersion}', COALESCE(to_jsonb($1::bigint), '1'::jsonb)
                ),
                '{updatedAt}', COALESCE(to_jsonb($2::text), 'null'::jsonb)
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

  // identity_principals/identity_memberships each carry more than one
  // UNIQUE constraint (the primary key plus source_ref, plus a composite
  // context key for memberships) on top of the ON CONFLICT arbiter
  // (source_ref). Postgres's speculative-insertion retry only covers the
  // named arbiter: two genuinely concurrent first-time inserts for the
  // SAME not-yet-existing row (identical principal_id/source_ref -- two
  // parallel automation runs authenticating for the first time) can both
  // pass the arbiter's conflict check and then have the LOSING insert
  // raise a hard, unhandled 23505 on the non-arbiter constraint instead of
  // being absorbed by DO UPDATE.
  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      (error as { code?: unknown }).code === "23505"
    );
  }

  // Shared recovery for the 23505 race described above, used by
  // upsertPrincipal/upsertMembership/upsertRoleBinding
  // (SR-AUTH-SESSION-SUPERSEDE-20261003 R9-TX/R10).
  //
  // R9-TX: every caller of these three helpers that already issued BEGIN
  // (ensureDefaultPlatformAccount, ensureLiveMapObserverAccount,
  // syncLegacyTenantUserRole, the invitation-activation path and
  // upsertWorkforceIdentity) leaves its *entire* transaction aborted
  // (25P02) once a statement raises 23505 -- a plain follow-up SELECT on
  // the same client fails too, so the bundle is lost instead of recovered.
  // A SAVEPOINT taken immediately before the attempt, rolled back on
  // catch, clears that aborted state before anything else runs on this
  // connection. The three standalone ensure*Record callers never issue
  // BEGIN (each statement is its own implicit autocommit transaction), so
  // SAVEPOINT would itself fail there with "no transaction is in
  // progress" -- insideTransaction lets each call site say which regime
  // it is in.
  //
  // R10: retrying the *exact same* statement, rather than falling back to
  // a bare `SELECT ... WHERE source_ref = $1`, is what tells a compatible
  // race apart from a genuine conflict. If the 23505 came from a
  // concurrent first-time insert for this same source_ref, the row now
  // exists after the retry's ON CONFLICT DO UPDATE runs, and the existing
  // changed/stale WHERE guard decides -- atomically -- whether this
  // caller's content should still apply. If the 23505 instead came from
  // this write's new values colliding with a *different*, already-
  // persisted row (e.g. reassigning a principal's subject to one another
  // principal already owns), the retry hits the identical conflict again
  // and throws uncaught here: that is a real, non-transient error and
  // must propagate so the caller's write is rejected, not silently
  // discarded in favor of stale data.
  private async runUpsertWithConflictRecovery<R>(
    client: PoolClient,
    savepointName: string,
    insideTransaction: boolean,
    attempt: () => Promise<{ rows: R[] }>,
  ): Promise<{ rows: R[] }> {
    if (insideTransaction) {
      await client.query(`SAVEPOINT ${savepointName}`);
    }
    try {
      return await attempt();
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
      if (insideTransaction) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepointName}`);
      }
      return await attempt();
    }
  }

  // The three upserts below decide "did a tracked field actually change"
  // via the ON CONFLICT ... WHERE clause instead of a separate SELECT +
  // JS comparison. A no-op "ensure" (session re-issuance) must leave
  // updated_at untouched -- it feeds JwtAuthService.validateDurableState's
  // workforce version fingerprint, and bumping it on every re-issuance
  // would silently revoke every other still-valid session for the same
  // principal. Doing the comparison in application code from a prior
  // SELECT is racy: a concurrent genuine mutation (e.g. principal
  // suspension) landing between that read and this write can be
  // overwritten by a stale "unchanged" decision, resurrecting a token that
  // should have been invalidated. The WHERE clause instead compares
  // EXCLUDED against the row Postgres has already locked for this same
  // INSERT ... ON CONFLICT statement, so the decision and the write happen
  // atomically with no gap for another transaction to land in between.
  // When nothing tracked changed, Postgres skips the DO UPDATE entirely
  // (RETURNING yields no row), so the row -- and its embedded JSON -- is
  // left byte-for-byte as it was; the caller falls back to a plain SELECT
  // purely to obtain a return value, not to decide anything.

  private async upsertPrincipal(
    client: PoolClient,
    record: CanonicalIdentityPrincipalRecord,
    insideTransaction: boolean,
  ) {
    const result = await this.runUpsertWithConflictRecovery<JsonRecordRow>(
      client,
      "upsert_principal_sp",
      insideTransaction,
      () =>
        client.query<JsonRecordRow>(
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
          record = jsonb_set(
            jsonb_set(
              EXCLUDED.record,
              '{principalId}',
              to_jsonb(iam.identity_principals.principal_id)
            ),
            '{createdAt}',
            to_jsonb(iam.identity_principals.created_at)
          )
        WHERE
          (
            iam.identity_principals.issuer IS DISTINCT FROM EXCLUDED.issuer
            OR iam.identity_principals.subject IS DISTINCT FROM EXCLUDED.subject
            OR iam.identity_principals.principal_type IS DISTINCT FROM EXCLUDED.principal_type
            OR iam.identity_principals.email_normalized IS DISTINCT FROM EXCLUDED.email_normalized
            OR iam.identity_principals.email_verified IS DISTINCT FROM EXCLUDED.email_verified
            OR iam.identity_principals.display_name IS DISTINCT FROM EXCLUDED.display_name
            OR iam.identity_principals.account_status IS DISTINCT FROM EXCLUDED.account_status
          )
          -- A content-differing but stale-timestamped ensure (e.g. a
          -- delayed reauth whose updated_at is derived from an assertion's
          -- iat, not arrival time) must never overwrite a state that a
          -- genuinely newer write already committed: that would both revert
          -- the newer change and roll the durable version backward,
          -- reviving tokens the newer change was meant to invalidate. See
          -- SR-AUTH-SESSION-SUPERSEDE-20261003 R2/R6.
          AND EXCLUDED.updated_at >= iam.identity_principals.updated_at
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
        ),
    );
    if (result.rows[0]?.record) {
      return this.parseRecord<CanonicalIdentityPrincipalRecord>(
        result.rows[0].record,
        "iam.identity_principals",
      );
    }
    const current = await client.query<JsonRecordRow>(
      `SELECT record FROM iam.identity_principals WHERE source_ref = $1 LIMIT 1`,
      [record.sourceRef],
    );
    return this.parseRecord<CanonicalIdentityPrincipalRecord>(
      current.rows[0]?.record,
      "iam.identity_principals",
    );
  }

  private async upsertMembership(
    client: PoolClient,
    record: CanonicalIdentityMembershipRecord,
    insideTransaction: boolean,
  ) {
    const result = await this.runUpsertWithConflictRecovery<JsonRecordRow>(
      client,
      "upsert_membership_sp",
      insideTransaction,
      () =>
        client.query<JsonRecordRow>(
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
          record = jsonb_set(
            jsonb_set(
              EXCLUDED.record,
              '{membershipId}',
              to_jsonb(iam.identity_memberships.membership_id)
            ),
            '{createdAt}',
            to_jsonb(iam.identity_memberships.created_at)
          )
        WHERE
          (
            iam.identity_memberships.principal_id IS DISTINCT FROM EXCLUDED.principal_id
            OR iam.identity_memberships.realm IS DISTINCT FROM EXCLUDED.realm
            OR iam.identity_memberships.scope_ref IS DISTINCT FROM EXCLUDED.scope_ref
            OR iam.identity_memberships.tenant_id IS DISTINCT FROM EXCLUDED.tenant_id
            OR iam.identity_memberships.partner_id IS DISTINCT FROM EXCLUDED.partner_id
            OR iam.identity_memberships.membership_status IS DISTINCT FROM EXCLUDED.membership_status
            OR iam.identity_memberships.invited_by_principal_id IS DISTINCT FROM EXCLUDED.invited_by_principal_id
            OR iam.identity_memberships.invitation_id IS DISTINCT FROM EXCLUDED.invitation_id
          )
          -- See upsertPrincipal: a stale-timestamped content-differing
          -- ensure must never regress a genuinely newer committed state or
          -- its updated_at. SR-AUTH-SESSION-SUPERSEDE-20261003 R2/R6.
          AND EXCLUDED.updated_at >= iam.identity_memberships.updated_at
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
        ),
    );
    if (result.rows[0]?.record) {
      return this.parseRecord<CanonicalIdentityMembershipRecord>(
        result.rows[0].record,
        "iam.identity_memberships",
      );
    }
    const current = await client.query<JsonRecordRow>(
      `SELECT record FROM iam.identity_memberships WHERE source_ref = $1 LIMIT 1`,
      [record.sourceRef],
    );
    return this.parseRecord<CanonicalIdentityMembershipRecord>(
      current.rows[0]?.record,
      "iam.identity_memberships",
    );
  }

  private async upsertRoleBinding(
    client: PoolClient,
    record: CanonicalIdentityRoleBindingRecord,
    insideTransaction: boolean,
    options: RoleBindingMutationOptions = {},
  ) {
    const allowValidFromMutation = options.allowValidFromMutation ?? false;
    // valid_from is set-once, like created_at, unless allowValidFromMutation
    // is set: see the RoleBindingMutationOptions doc comment and
    // SR-AUTH-SESSION-SUPERSEDE-20261003 R3/R4.
    const recordExpr = allowValidFromMutation
      ? "EXCLUDED.record"
      : `jsonb_set(
                EXCLUDED.record,
                '{validFrom}',
                to_jsonb(iam.identity_role_bindings.valid_from)
              )`;
    const result = await this.runUpsertWithConflictRecovery<JsonRecordRow>(
      client,
      "upsert_role_binding_sp",
      insideTransaction,
      () =>
        client.query<JsonRecordRow>(
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
          valid_to = EXCLUDED.valid_to,
          ${allowValidFromMutation ? "valid_from = EXCLUDED.valid_from," : ""}
          updated_at = EXCLUDED.updated_at,
          record = jsonb_set(
            jsonb_set(
              ${recordExpr},
              '{roleBindingId}',
              to_jsonb(iam.identity_role_bindings.role_binding_id)
            ),
            '{createdAt}',
            to_jsonb(iam.identity_role_bindings.created_at)
          )
        WHERE
          (
            iam.identity_role_bindings.membership_id IS DISTINCT FROM EXCLUDED.membership_id
            OR iam.identity_role_bindings.role_code IS DISTINCT FROM EXCLUDED.role_code
            OR iam.identity_role_bindings.granted_by_principal_id IS DISTINCT FROM EXCLUDED.granted_by_principal_id
            OR iam.identity_role_bindings.approval_id IS DISTINCT FROM EXCLUDED.approval_id
            OR iam.identity_role_bindings.valid_to IS DISTINCT FROM EXCLUDED.valid_to
            ${allowValidFromMutation ? "OR iam.identity_role_bindings.valid_from IS DISTINCT FROM EXCLUDED.valid_from" : ""}
          )
          -- See upsertPrincipal: a stale-timestamped content-differing
          -- ensure must never regress a genuinely newer committed state or
          -- its updated_at. SR-AUTH-SESSION-SUPERSEDE-20261003 R2/R6.
          AND EXCLUDED.updated_at >= iam.identity_role_bindings.updated_at
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
        ),
    );
    if (result.rows[0]?.record) {
      return this.parseRecord<CanonicalIdentityRoleBindingRecord>(
        result.rows[0].record,
        "iam.identity_role_bindings",
      );
    }
    const current = await client.query<JsonRecordRow>(
      `SELECT record FROM iam.identity_role_bindings WHERE source_ref = $1 LIMIT 1`,
      [record.sourceRef],
    );
    return this.parseRecord<CanonicalIdentityRoleBindingRecord>(
      current.rows[0]?.record,
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
          record = jsonb_set(
            EXCLUDED.record,
            '{invitationId}',
            to_jsonb(iam.identity_invitations.invitation_id)
          )
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
    const existingPrincipalId = record.sourceRef
      ? (this.fallbackPrincipalSourceRefs.get(record.sourceRef) ??
        record.principalId)
      : record.principalId;
    const existing = this.fallbackPrincipals.get(existingPrincipalId) ?? null;
    // Mirrors upsertPrincipal: a no-op "ensure" (e.g. re-issuing a session
    // for an already-known principal) must not advance updatedAt, or it
    // silently invalidates every other active session via
    // computeWorkforceTokenVersion.
    const unchanged =
      existing !== null &&
      existing.issuer === record.issuer &&
      existing.subject === record.subject &&
      existing.principalType === record.principalType &&
      existing.email === record.email &&
      existing.emailVerified === record.emailVerified &&
      existing.displayName === record.displayName &&
      existing.status === record.status;
    // A content-differing but stale-timestamped ensure (e.g. a delayed
    // reauth whose updatedAt is derived from an assertion's iat, not
    // arrival time) must never overwrite a state a genuinely newer write
    // already committed: mirrors upsertPrincipal's monotonic WHERE guard.
    // See SR-AUTH-SESSION-SUPERSEDE-20261003 R2/R6.
    const stale = existing !== null && record.updatedAt < existing.updatedAt;
    const applyIncoming = existing === null || (!unchanged && !stale);
    const persisted =
      existing === null
        ? { ...record }
        : applyIncoming
          ? {
              ...existing,
              sourceRef: record.sourceRef,
              issuer: record.issuer,
              subject: record.subject,
              principalType: record.principalType,
              email: record.email,
              emailVerified: record.emailVerified,
              displayName: record.displayName,
              status: record.status,
              updatedAt: record.updatedAt,
            }
          : { ...existing };
    this.fallbackPrincipals.set(persisted.principalId, persisted);
    if (record.sourceRef) {
      this.fallbackPrincipalSourceRefs.set(
        record.sourceRef,
        persisted.principalId,
      );
    }
    return { ...persisted };
  }

  private upsertFallbackMembership(record: CanonicalIdentityMembershipRecord) {
    const existingMembershipId = record.sourceRef
      ? (this.fallbackMembershipSourceRefs.get(record.sourceRef) ??
        record.membershipId)
      : record.membershipId;
    const existing = this.fallbackMemberships.get(existingMembershipId) ?? null;
    // Mirrors upsertFallbackPrincipal: see upsertPrincipal for why a no-op
    // "ensure" must not advance updatedAt.
    const unchanged =
      existing !== null &&
      existing.principalId === record.principalId &&
      existing.realm === record.realm &&
      existing.scopeRef === record.scopeRef &&
      existing.tenantId === record.tenantId &&
      existing.partnerId === record.partnerId &&
      existing.status === record.status &&
      existing.invitedByPrincipalId === record.invitedByPrincipalId &&
      existing.invitationId === record.invitationId;
    // See upsertFallbackPrincipal: a stale-timestamped content-differing
    // ensure must never regress a genuinely newer committed state.
    const stale = existing !== null && record.updatedAt < existing.updatedAt;
    const applyIncoming = existing === null || (!unchanged && !stale);
    const persisted =
      existing === null
        ? { ...record }
        : applyIncoming
          ? {
              ...existing,
              sourceRef: record.sourceRef,
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
          : { ...existing };
    this.fallbackMemberships.set(persisted.membershipId, persisted);
    if (record.sourceRef) {
      this.fallbackMembershipSourceRefs.set(
        record.sourceRef,
        persisted.membershipId,
      );
    }
    return { ...persisted };
  }

  private upsertFallbackRoleBinding(
    record: CanonicalIdentityRoleBindingRecord,
    options: RoleBindingMutationOptions = {},
  ) {
    const allowValidFromMutation = options.allowValidFromMutation ?? false;
    const existingRoleBindingId = record.sourceRef
      ? (this.fallbackRoleBindingSourceRefs.get(record.sourceRef) ??
        record.roleBindingId)
      : record.roleBindingId;
    const existing =
      this.fallbackRoleBindings.get(existingRoleBindingId) ?? null;
    // Mirrors upsertFallbackPrincipal: see upsertPrincipal for why a no-op
    // "ensure" must not advance updatedAt.
    //
    // validFrom is set-once, like createdAt, unless allowValidFromMutation
    // is set: see the RoleBindingMutationOptions doc comment and
    // SR-AUTH-SESSION-SUPERSEDE-20261003 R3/R4.
    const unchanged =
      existing !== null &&
      existing.membershipId === record.membershipId &&
      existing.roleCode === record.roleCode &&
      existing.grantedByPrincipalId === record.grantedByPrincipalId &&
      existing.approvalId === record.approvalId &&
      existing.validTo === record.validTo &&
      (!allowValidFromMutation || existing.validFrom === record.validFrom);
    // See upsertFallbackPrincipal: a stale-timestamped content-differing
    // ensure must never regress a genuinely newer committed state.
    const stale = existing !== null && record.updatedAt < existing.updatedAt;
    const applyIncoming = existing === null || (!unchanged && !stale);
    const persisted =
      existing === null
        ? { ...record }
        : applyIncoming
          ? {
              ...existing,
              sourceRef: record.sourceRef,
              membershipId: record.membershipId,
              roleCode: record.roleCode,
              grantedByPrincipalId: record.grantedByPrincipalId,
              approvalId: record.approvalId,
              validTo: record.validTo,
              validFrom: allowValidFromMutation
                ? record.validFrom
                : existing.validFrom,
              updatedAt: record.updatedAt,
            }
          : { ...existing };
    this.fallbackRoleBindings.set(persisted.roleBindingId, persisted);
    if (record.sourceRef) {
      this.fallbackRoleBindingSourceRefs.set(
        record.sourceRef,
        persisted.roleBindingId,
      );
    }
    return { ...persisted };
  }

  private upsertFallbackInvitation(record: CanonicalIdentityInvitationRecord) {
    const existingInvitationId = record.sourceRef
      ? (this.fallbackInvitationSourceRefs.get(record.sourceRef) ??
        record.invitationId)
      : record.invitationId;
    const existing = this.fallbackInvitations.get(existingInvitationId) ?? null;
    const persisted = existing
      ? {
          ...existing,
          sourceRef: record.sourceRef,
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
          deliveryId: record.deliveryId,
          expiresAt: record.expiresAt,
          acceptedAt: record.acceptedAt,
          revokedAt: record.revokedAt,
          updatedAt: record.updatedAt,
        }
      : { ...record };
    this.fallbackInvitations.set(persisted.invitationId, persisted);
    if (record.sourceRef) {
      this.fallbackInvitationSourceRefs.set(
        record.sourceRef,
        persisted.invitationId,
      );
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

  private async executeSql<R extends QueryResultRow = JsonRecordRow>(
    sql: string,
    params: unknown[],
    client?: PoolClient,
  ) {
    if (client) {
      return client.query<R>(sql, params as unknown[]);
    }
    return this.databaseService!.query<R>(sql, params);
  }

  deleteFallbackPrivilegedRoleRequest(requestId: string): void {
    this.fallbackPrivilegedRoleRequests.delete(requestId);
  }

  deleteFallbackPrivilegedRoleGrant(grantId: string): void {
    this.fallbackPrivilegedRoleGrants.delete(grantId);
  }

  async savePrivilegedRoleRequest(
    request: PrivilegedRoleApprovalRequestRecord,
    client?: PoolClient,
  ): Promise<PrivilegedRoleApprovalRequestRecord> {
    if (!this.isEnabled()) {
      this.fallbackPrivilegedRoleRequests.set(request.requestId, {
        ...request,
      });
      return { ...request };
    }

    const result = await this.executeSql(
      `
        INSERT INTO iam.privileged_role_approval_requests (
          request_id, tenant_id, realm, target_user_id, target_membership_id,
          target_email, requested_role_code, requester_principal_id, requester_actor_type,
          reason, status, approver_principal_id, approval_decision, decided_at,
          valid_from, valid_to, version, created_at, updated_at, record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20::jsonb
        )
        ON CONFLICT (request_id) DO UPDATE SET
          status = EXCLUDED.status,
          approver_principal_id = EXCLUDED.approver_principal_id,
          approval_decision = EXCLUDED.approval_decision,
          decided_at = EXCLUDED.decided_at,
          version = EXCLUDED.version,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
        RETURNING record
      `,
      [
        request.requestId,
        request.tenantId,
        request.realm,
        request.targetUserId,
        request.targetMembershipId || null,
        request.targetEmail || null,
        request.requestedRoleCode,
        request.requesterPrincipalId,
        request.requesterActorType,
        request.reason,
        request.status,
        request.approverPrincipalId || null,
        request.approvalDecision || null,
        request.decidedAt || null,
        request.validFrom,
        request.validTo || null,
        request.version,
        request.createdAt,
        request.updatedAt,
        JSON.stringify(request),
      ],
      client,
    );

    if (!result.rows[0]?.record) {
      throw new Error(
        "Failed to persist privileged role request: no row returned",
      );
    }

    return this.parseRecord<PrivilegedRoleApprovalRequestRecord>(
      result.rows[0].record,
      "iam.privileged_role_approval_requests",
    );
  }

  async getPrivilegedRoleRequest(
    requestId: string,
    client?: PoolClient,
  ): Promise<PrivilegedRoleApprovalRequestRecord | null> {
    if (!this.isEnabled()) {
      const found = this.fallbackPrivilegedRoleRequests.get(requestId);
      return found ? { ...found } : null;
    }

    const result = await this.executeSql(
      `SELECT record FROM iam.privileged_role_approval_requests WHERE request_id = $1 LIMIT 1`,
      [requestId],
      client,
    );

    if (!result.rows[0]?.record) {
      return null;
    }

    return this.parseRecord<PrivilegedRoleApprovalRequestRecord>(
      result.rows[0].record,
      "iam.privileged_role_approval_requests",
    );
  }

  async listPrivilegedRoleRequests(
    tenantId?: string | null,
    client?: PoolClient,
  ): Promise<PrivilegedRoleApprovalRequestRecord[]> {
    if (!this.isEnabled()) {
      return Array.from(this.fallbackPrivilegedRoleRequests.values())
        .filter((r) => !tenantId || r.tenantId === tenantId)
        .map((r) => ({ ...r }));
    }

    const result = await this.executeSql(
      `
        SELECT record FROM iam.privileged_role_approval_requests
        WHERE ($1::text IS NULL OR tenant_id = $1::text)
        ORDER BY updated_at DESC
      `,
      [tenantId || null],
      client,
    );

    return result.rows.map((row) =>
      this.parseRecord<PrivilegedRoleApprovalRequestRecord>(
        row.record,
        "iam.privileged_role_approval_requests",
      ),
    );
  }

  async savePrivilegedRoleGrant(
    grant: PrivilegedRoleGrantRecord,
    client?: PoolClient,
  ): Promise<PrivilegedRoleGrantRecord> {
    if (!this.isEnabled()) {
      this.fallbackPrivilegedRoleGrants.set(grant.grantId, { ...grant });
      return { ...grant };
    }

    const result = await this.executeSql(
      `
        INSERT INTO iam.privileged_role_grants (
          grant_id, request_id, tenant_id, realm, target_user_id, target_membership_id,
          role_code, granted_by_principal_id, approval_id, valid_from, valid_to, status,
          created_at, updated_at, record
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb
        )
        ON CONFLICT (grant_id) DO UPDATE SET
          status = EXCLUDED.status,
          updated_at = EXCLUDED.updated_at,
          record = EXCLUDED.record
        RETURNING record
      `,
      [
        grant.grantId,
        grant.requestId || null,
        grant.tenantId || null,
        grant.realm,
        grant.targetUserId,
        grant.targetMembershipId || null,
        grant.roleCode,
        grant.grantedByPrincipalId || null,
        grant.approvalId || null,
        grant.validFrom,
        grant.validTo || null,
        grant.status,
        grant.createdAt,
        grant.updatedAt,
        JSON.stringify(grant),
      ],
      client,
    );

    if (!result.rows[0]?.record) {
      throw new Error(
        "Failed to persist privileged role grant: no row returned",
      );
    }

    return this.parseRecord<PrivilegedRoleGrantRecord>(
      result.rows[0].record,
      "iam.privileged_role_grants",
    );
  }

  async listPrivilegedRoleGrants(
    tenantId?: string | null,
    client?: PoolClient,
  ): Promise<PrivilegedRoleGrantRecord[]> {
    if (!this.isEnabled()) {
      return Array.from(this.fallbackPrivilegedRoleGrants.values())
        .filter((g) => !tenantId || g.tenantId === tenantId)
        .map((g) => ({ ...g }));
    }

    const result = await this.executeSql(
      `
        SELECT record FROM iam.privileged_role_grants
        WHERE ($1::text IS NULL OR tenant_id = $1::text)
        ORDER BY updated_at DESC
      `,
      [tenantId || null],
      client,
    );

    return result.rows.map((row) =>
      this.parseRecord<PrivilegedRoleGrantRecord>(
        row.record,
        "iam.privileged_role_grants",
      ),
    );
  }
}
