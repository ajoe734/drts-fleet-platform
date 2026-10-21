import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CanonicalIdentitySessionRecord,
  PlatformAdminUserRecord,
} from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { PlatformAdminService } from "../../../apps/api/src/modules/platform-admin/platform-admin.service";

const ADMIN = "principal_platform_admin_default";
const EMAIL = "ops@platform.drts";

async function personnel() {
  // Real service and repository; the repository's existing socket-free store
  // is used here. These tests do not claim PostgreSQL durability.
  const repository = new IdentityRepository();
  await repository.onModuleInit();
  const audit = new AuditNotificationService();
  const auditBeforeInitialization = audit.getAuditLogsSnapshot();
  const service = new PlatformAdminService(audit, undefined, repository);
  await service.onModuleInit();
  const users = await service.listPlatformAdminUsers();
  const user = users.find((entry) => entry.email === EMAIL);
  if (!user) throw new Error("Normal legacy operator seed required");
  return { repository, audit, auditBeforeInitialization, service, user };
}

async function activate(f: Awaited<ReturnType<typeof personnel>>) {
  return f.service.updatePlatformAdminUserRole(
    f.user.userId,
    { roleCode: "operator", status: "active", reason: "explicit dev setup" },
    "enable-existing-ops",
    ADMIN,
  );
}

function session(
  user: PlatformAdminUserRecord,
  id: string,
  realm: "ops" | "platform",
): CanonicalIdentitySessionRecord {
  if (!user.canonicalPrincipalId)
    throw new Error("Persisted canonical principal ACK required");
  const now = new Date().toISOString();
  return {
    sessionId: id,
    sourceRef: `unit:${id}`,
    principalId: user.canonicalPrincipalId,
    membershipId: user.userId,
    realm,
    status: "active",
    authTime: now,
    authMethods: ["dev_mfa_waived"],
    tokenVersion: 1,
    idleExpiresAt: null,
    absoluteExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    revokedAt: null,
    revokedByPrincipalId: null,
    revokeReason: null,
    deviceSummary: {},
    riskSummary: {},
    createdAt: now,
    updatedAt: now,
  };
}

beforeEach(() => {
  vi.stubEnv("DRTS_E2E_PROVISIONING", "false");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("normal personnel canonical Ops enablement", () => {
  it("reads the persisted canonical principal without activating or upgrading the legacy seed", async () => {
    const f = await personnel();
    const membership = await f.repository.findMembershipById(f.user.userId);
    expect(membership).toBeTruthy();
    expect(f.user.canonicalPrincipalId).toBe(membership!.principalId);
    expect(f.user.canonicalRealm).toBe(membership!.realm);
    expect(f.user.canonicalRealm).toBe("ops");
    expect(f.user.userId).toBe(membership!.membershipId);
    expect(f.user.canonicalPrincipalId).not.toBe(f.user.userId);
    expect(f.user.canonicalPrincipalId).not.toBe("pa-operator-001");
    expect(membership!.status).toBe("migration_pending");
    expect(f.user.status).toBe("invited");
    expect(f.user.roleCode).toBe("operator");
    expect(
      await f.repository.findRoleBindingsByMembershipId(f.user.userId),
    ).toEqual([expect.objectContaining({ roleCode: "operator" })]);
    await f.service.onModuleInit();
    expect(await f.repository.findMembershipById(f.user.userId)).toEqual(
      membership,
    );
    expect(f.audit.getAuditLogsSnapshot()).toEqual(f.auditBeforeInitialization);
  });

  it("explicitly activates the existing membership with ops_user, preserves its IDs, and audits the actor/reason", async () => {
    const f = await personnel();
    const before = await f.repository.findMembershipById(f.user.userId);
    const updated = await activate(f);
    expect(updated).toMatchObject({
      userId: f.user.userId,
      canonicalPrincipalId: before!.principalId,
      roleCode: "operator",
      status: "active",
    });
    expect(
      await f.repository.findRoleBindingsByMembershipId(updated.userId),
    ).toEqual([expect.objectContaining({ roleCode: "ops_user" })]);
    expect(
      await f.repository.findPrincipalById(updated.canonicalPrincipalId!),
    ).toMatchObject({ status: "active" });
    expect(await f.repository.findPrincipalsByEmail(EMAIL)).toHaveLength(1);
    expect(await f.repository.findPrincipalById("pa-operator-001")).toBeNull();
    const reloaded = new PlatformAdminService(
      new AuditNotificationService(),
      undefined,
      f.repository,
    );
    await reloaded.onModuleInit();
    expect(await reloaded.listPlatformAdminUsers()).toContainEqual(updated);
    const audit = f.audit
      .listAuditLogs()
      .find((entry) => entry.actionName === "update_platform_admin_user_role");
    expect(audit).toMatchObject({ actorId: ADMIN, resourceId: f.user.userId });
    expect(audit?.oldValuesSummary).toMatchObject({ status: "invited" });
    expect(audit?.newValuesSummary).toMatchObject({
      reason: "explicit dev setup",
      roleCode: "operator",
      status: "active",
    });
  });

  it("normal create maps operator to canonical ops_user but leaves the new account invited", async () => {
    const f = await personnel();
    const created = await f.service.createPlatformAdminUser(
      {
        email: "another-operator@example.test",
        displayName: "Invited operator",
        roleCode: "operator",
        reason: "normal invitation",
      },
      "invite-operator",
      ADMIN,
    );
    const membership = await f.repository.findMembershipById(created.userId);
    expect(created).toMatchObject({
      canonicalPrincipalId: membership!.principalId,
      roleCode: "operator",
      status: "invited",
    });
    expect(membership).toMatchObject({ realm: "ops", status: "invited" });
    expect(
      await f.repository.findRoleBindingsByMembershipId(created.userId),
    ).toEqual([expect.objectContaining({ roleCode: "ops_user" })]);
    expect(f.audit.listAuditLogs()[0]).toMatchObject({
      actorId: ADMIN,
      actionName: "create_platform_admin_user",
      resourceId: created.userId,
    });
  });

  it.each(["admin", "viewer"] as const)(
    "preserves the existing non-operator %s role mapping",
    async (roleCode) => {
      const f = await personnel();
      const created = await f.service.createPlatformAdminUser(
        {
          email: `${roleCode}@example.test`,
          displayName: roleCode,
          roleCode,
          reason: "existing non-operator behavior",
        },
        `invite-${roleCode}`,
        ADMIN,
      );
      expect(
        await f.repository.findMembershipById(created.userId),
      ).toMatchObject({
        realm: "platform",
        principalId: created.canonicalPrincipalId,
      });
      expect(
        await f.repository.findRoleBindingsByMembershipId(created.userId),
      ).toEqual([expect.objectContaining({ roleCode })]);
    },
  );

  it("revokes the targeted Ops membership sessions without revoking another active membership of that principal", async () => {
    const f = await personnel();
    const active = await activate(f);
    const platform = await f.service.createPlatformAdminUser(
      {
        email: EMAIL,
        displayName: "Same principal",
        roleCode: "admin",
        reason: "other realm",
      },
      "invite-other-membership",
      ADMIN,
    );
    await f.service.updatePlatformAdminUserRole(
      platform.userId,
      { roleCode: "admin", status: "active", reason: "activate other realm" },
      "activate-other-membership",
      ADMIN,
    );
    expect(platform.canonicalPrincipalId).toBe(active.canonicalPrincipalId);
    const own = await f.repository.createSession(
      session(active, "own-ops-session", "ops"),
    );
    const other = await f.repository.createSession(
      session(platform, "other-platform-session", "platform"),
    );
    await f.service.updatePlatformAdminUserRole(
      active.userId,
      {
        roleCode: "operator",
        status: "active",
        reason: "explicit activation readback",
      },
      "repeat-normal-role-update",
      ADMIN,
    );
    expect(await f.repository.getSession(own.sessionId)).toMatchObject({
      status: "revoked",
      revokeReason: "explicit activation readback",
    });
    expect(await f.repository.getSession(other.sessionId)).toMatchObject({
      status: "active",
    });
  });

  it("does not ACK or audit a role change whose repository write fails", async () => {
    const f = await personnel();
    const before = await f.service.listPlatformAdminUsers();
    const auditBefore = f.audit.getAuditLogsSnapshot();
    vi.spyOn(f.repository, "upsertWorkforceIdentity").mockRejectedValueOnce(
      new Error("controlled canonical storage failure"),
    );
    await expect(activate(f)).rejects.toThrow(
      "controlled canonical storage failure",
    );
    expect(await f.service.listPlatformAdminUsers()).toEqual(before);
    expect(f.audit.getAuditLogsSnapshot()).toEqual(auditBefore);
  });

  it("rejects missing verified actor and a foreign-scope membership without changing personnel", async () => {
    const f = await personnel();
    const before = await f.service.listPlatformAdminUsers();
    const auditBefore = f.audit.getAuditLogsSnapshot();
    await expect(
      f.service.updatePlatformAdminUserRole(f.user.userId, {
        roleCode: "operator",
        status: "active",
        reason: "not authorized",
      }),
    ).rejects.toThrow();
    expect(f.audit.getAuditLogsSnapshot()).toEqual(auditBefore);
    await expect(
      f.service.updatePlatformAdminUserRole(
        "membership_platform_admin_default",
        { roleCode: "operator", status: "active", reason: "foreign scope" },
        "wrong-membership",
        ADMIN,
      ),
    ).rejects.toThrow();
    expect(await f.service.listPlatformAdminUsers()).toEqual(before);
    expect(f.audit.getAuditLogsSnapshot()).toEqual(auditBefore);
  });
});
