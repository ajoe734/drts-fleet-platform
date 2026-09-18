import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  isCanonicalAccountActive,
  type TenantUserRoleRecord,
} from "../../packages/contracts/src";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const TENANT_USER_BASE: TenantUserRoleRecord = {
  userId: "tenant_user_demo_001",
  tenantId: "tenant_demo",
  email: "ops-admin@example.com",
  displayName: "Ops Admin",
  roleCode: "tenant_ops_admin",
  status: "invited",
  approvalNotificationOptOut: false,
  invitedAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

describe("canonical identity repository", () => {
  it("persists invited tenant users as non-active principals, memberships, and invitations", async () => {
    const repository = new IdentityRepository();

    const snapshot = await repository.syncLegacyTenantUserRole({
      ...TENANT_USER_BASE,
    });

    expect(snapshot.principal.issuer).toBe("legacy_tenant_email");
    expect(snapshot.principal.subject).toBe(
      "tenant:tenant_demo:email:ops-admin@example.com",
    );
    expect(snapshot.principal.status).toBe("invited");
    expect(isCanonicalAccountActive(snapshot.principal.status)).toBe(false);
    expect(snapshot.membership.scopeRef).toBe("tenant:tenant_demo");
    expect(snapshot.membership.status).toBe("invited");
    expect(snapshot.roleBinding.roleCode).toBe("tenant_ops_admin");
    expect(snapshot.invitation).not.toBeNull();
    expect(snapshot.invitation?.revokedAt).toBeNull();
    expect(repository.listPrincipals()).toHaveLength(2);
    expect(repository.listMemberships()).toHaveLength(2);
    expect(repository.listRoleBindings()).toHaveLength(2);
    expect(repository.listInvitations()).toHaveLength(1);
  });

  it("backfills legacy active users into migration-pending authority without duplication", async () => {
    const repository = new IdentityRepository();

    const first = await repository.syncLegacyTenantUserRole({
      ...TENANT_USER_BASE,
      status: "active",
      updatedAt: "2026-08-01T11:00:00.000Z",
    });
    const second = await repository.syncLegacyTenantUserRole({
      ...TENANT_USER_BASE,
      status: "active",
      updatedAt: "2026-08-01T11:30:00.000Z",
    });

    expect(first.principal.status).toBe("migration_pending");
    expect(first.membership.status).toBe("migration_pending");
    expect(isCanonicalAccountActive(first.membership.status)).toBe(false);
    expect(second.principal.principalId).toBe(first.principal.principalId);
    expect(second.membership.membershipId).toBe(first.membership.membershipId);
    expect(second.roleBinding.roleBindingId).toBe(
      first.roleBinding.roleBindingId,
    );
    expect(second.invitation?.invitationId).toBe(
      first.invitation?.invitationId,
    );
    expect(second.invitation?.revokedAt).toBe("2026-08-01T11:30:00.000Z");
    expect(repository.listPrincipals()).toHaveLength(2);
    expect(repository.listMemberships()).toHaveLength(2);
    expect(repository.listRoleBindings()).toHaveLength(2);
    expect(repository.listInvitations()).toHaveLength(1);
  });
});

describe("tenant partner dual-write to canonical identity", () => {
  it("syncs legacy tenant user mutations into migration-pending canonical authority", async () => {
    const auditService = new AuditNotificationService();
    const identityRepository = new IdentityRepository();
    const tenantPartnerService = new TenantPartnerService(
      auditService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      identityRepository,
    );

    const created = await tenantPartnerService.createTenantUser("tenant_demo", {
      email: "viewer@example.com",
      displayName: "Viewer",
      roleCode: "tenant_viewer",
    });
    await tenantPartnerService.updateTenantUserRole(
      "tenant_demo",
      created.userId,
      {
        roleCode: "tenant_finance_admin",
        status: "active",
      },
    );

    await Promise.resolve();
    await Promise.resolve();

    const [principal] = identityRepository
      .listPrincipals()
      .filter((entry) => entry.email === "viewer@example.com");
    const [membership] = identityRepository
      .listMemberships()
      .filter((entry) => entry.tenantId === "tenant_demo");
    const [roleBinding] = identityRepository
      .listRoleBindings()
      .filter((entry) => entry.membershipId === membership?.membershipId);
    const [invitation] = identityRepository
      .listInvitations()
      .filter((entry) => entry.membershipId === membership?.membershipId);

    expect(principal?.status).toBe("migration_pending");
    expect(membership?.status).toBe("migration_pending");
    expect(roleBinding?.roleCode).toBe("tenant_finance_admin");
    expect(invitation?.revokedAt).not.toBeNull();
  });

  it("rejects demotion when the only replacement tenant admin is still invited", async () => {
    const auditService = new AuditNotificationService();
    const identityRepository = new IdentityRepository();
    const tenantPartnerService = new TenantPartnerService(
      auditService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      identityRepository,
    );

    const primaryAdmin = await tenantPartnerService.createTenantUser(
      "tenant_demo",
      {
        email: "primary-admin@example.com",
        displayName: "Primary Admin",
        roleCode: "tenant_admin",
      },
    );
    await tenantPartnerService.updateTenantUserRole(
      "tenant_demo",
      primaryAdmin.userId,
      { roleCode: "tenant_admin", status: "active" },
    );
    await tenantPartnerService.createTenantUser("tenant_demo", {
      email: "replacement-admin@example.com",
      displayName: "Replacement Admin",
      roleCode: "tenant_admin",
    });

    expect(() =>
      tenantPartnerService.updateTenantUserRole(
        "tenant_demo",
        primaryAdmin.userId,
        { roleCode: "tenant_viewer", status: "active" },
      ),
    ).toThrowError(ApiRequestError);
    try {
      tenantPartnerService.updateTenantUserRole(
        "tenant_demo",
        primaryAdmin.userId,
        { roleCode: "tenant_viewer", status: "active" },
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: expect.objectContaining({ code: "CANNOT_REMOVE_LAST_ADMIN" }),
      });
    }
  });

  it("rejects a tenant user's own role escalation", async () => {
    const tenantPartnerService = new TenantPartnerService(
      new AuditNotificationService(),
    );
    const user = await tenantPartnerService.createTenantUser("tenant_demo", {
      email: "self-escalation@example.com",
      displayName: "Self Escalation",
      roleCode: "tenant_viewer",
    });

    expect(() =>
      tenantPartnerService.updateTenantUserRole(
        "tenant_demo",
        user.userId,
        { roleCode: "tenant_admin", status: "active" },
        undefined,
        {
          actorType: "tenant_admin",
          actorId: user.userId,
          realm: "tenant",
          authMode: "jwt_bearer",
          roleFamilies: ["tenant"],
          roles: ["tenant_viewer"],
          scopes: [],
          tenantId: "tenant_demo",
          supportedExecutionModes: [],
        },
      ),
    ).toThrowError(ApiRequestError);
    try {
      tenantPartnerService.updateTenantUserRole(
        "tenant_demo",
        user.userId,
        { roleCode: "tenant_admin", status: "active" },
        undefined,
        {
          actorType: "tenant_admin",
          actorId: user.userId,
          realm: "tenant",
          authMode: "jwt_bearer",
          roleFamilies: ["tenant"],
          roles: ["tenant_viewer"],
          scopes: [],
          tenantId: "tenant_demo",
          supportedExecutionModes: [],
        },
      );
    } catch (error) {
      expect((error as ApiRequestError).getResponse()).toMatchObject({
        error: expect.objectContaining({
          code: "SELF_ELEVATION_FORBIDDEN",
        }),
      });
    }
  });

  it("awaits role-change session revocation and revokes its refresh family", async () => {
    const auditService = new AuditNotificationService();
    const identityRepository = new IdentityRepository();
    const tenantPartnerService = new TenantPartnerService(
      auditService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      identityRepository,
    );
    const user = await tenantPartnerService.createTenantUser("tenant_demo", {
      email: "session-user@example.com",
      displayName: "Session User",
      roleCode: "tenant_viewer",
    });
    await tenantPartnerService.updateTenantUserRole(
      "tenant_demo",
      user.userId,
      {
        roleCode: "tenant_viewer",
        status: "active",
      },
    );

    const now = new Date().toISOString();
    await identityRepository.createSession({
      sessionId: "tenant-account-session-001",
      sourceRef: "tenant-account-session-001",
      principalId: user.userId,
      membershipId: null,
      realm: "tenant",
      status: "active",
      authTime: now,
      authMethods: ["oidc_pkce"],
      tokenVersion: Date.parse(now),
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: now,
      updatedAt: now,
    });
    await identityRepository.createRefreshFamily({
      familyId: "tenant-account-family-001",
      sourceRef: "tenant-account-family-001",
      sessionId: "tenant-account-session-001",
      currentTokenHash: "hash-only-refresh-token",
      counter: 0,
      status: "active",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      compromisedAt: null,
      createdAt: now,
      updatedAt: now,
    });

    await tenantPartnerService.updateTenantUserRole(
      "tenant_demo",
      user.userId,
      {
        roleCode: "tenant_finance_admin",
        status: "active",
      },
    );

    expect(
      await identityRepository.getSession("tenant-account-session-001"),
    ).toMatchObject({ status: "revoked", revokeReason: "TENANT_ROLE_CHANGED" });
    expect(
      await identityRepository.getRefreshFamily("tenant-account-family-001"),
    ).toMatchObject({ status: "revoked" });
  });
});

describe("canonical identity migration", () => {
  it("enforces issuer-subject uniqueness and idempotent least-privilege backfill", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../infra/migrations/V0068__canonical_identity_authority.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("UNIQUE (issuer, subject)");
    expect(migration).toContain("'migration_pending'");
    expect(migration).toContain("ON CONFLICT (source_ref) DO UPDATE");
    expect(migration).toContain("legacy_tenant_email");
    expect(migration).not.toContain(
      "DROP TABLE admin.phase1_tenant_user_roles",
    );
  });
});
