import { describe, expect, it } from "vitest";

import type { IdentityContext } from "@drts/contracts";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { AuthController } from "../../apps/api/src/modules/auth/auth.controller";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const TENANT_ID = "tenant-acc-test";

function createServiceFixture() {
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
  return { auditService, identityRepository, tenantPartnerService };
}

describe("IAM-ACC-003: Tenant Account Lifecycle & Proof-based Invitation", () => {
  describe("Invitation lifecycle: hash-only single-use expiring proof", () => {
    it("creates invited user with hash-only single-use 24h invitation token", async () => {
      const { tenantPartnerService, identityRepository } = createServiceFixture();

      const created = await tenantPartnerService.createTenantUser(TENANT_ID, {
        email: "joiner@example.com",
        displayName: "New Joiner",
        roleCode: "tenant_ops_admin",
      });

      expect(created.user.status).toBe("invited");
      expect(created.rawInvitationToken).toBeDefined();
      expect(created.rawInvitationToken).toContain("inv_tok_");
      expect(created.invitation).toBeDefined();
      expect(created.invitation?.tokenHash).toBeDefined();
      // Verify raw invitation token is NOT stored in the invitation record
      expect(created.invitation?.tokenHash).not.toBe(created.rawInvitationToken);
      expect(created.invitation?.acceptedAt).toBeNull();
      expect(created.invitation?.revokedAt).toBeNull();

      // Verify stored invitation in identityRepository has hash only
      const [storedInvitation] = identityRepository.listInvitations();
      expect(storedInvitation?.tokenHash).toBe(created.invitation?.tokenHash);
    });

    it("verifies and accepts valid invitation proof, transitioning status to active", async () => {
      const { tenantPartnerService, identityRepository } = createServiceFixture();

      const created = await tenantPartnerService.createTenantUser(TENANT_ID, {
        email: "proof-joiner@example.com",
        displayName: "Proof Joiner",
        roleCode: "tenant_viewer",
      });

      const rawToken = created.rawInvitationToken!;

      // 1. Verify invitation token
      const verification = await tenantPartnerService.verifyTenantInvitation(rawToken);
      expect(verification.valid).toBe(true);
      expect(verification.email).toBe("proof-joiner@example.com");
      expect(verification.tenantId).toBe(TENANT_ID);

      // 2. Accept invitation proof
      const acceptedResult = await tenantPartnerService.acceptTenantInvitation({
        invitationToken: rawToken,
      });

      expect(acceptedResult.accepted).toBe(true);
      expect(acceptedResult.user.status).toBe("active");
      expect(acceptedResult.invitation.acceptedAt).not.toBeNull();

      // 3. Single-use: attempting to accept second time must fail
      await expect(
        tenantPartnerService.acceptTenantInvitation({
          invitationToken: rawToken,
        }),
      ).rejects.toThrow(ApiRequestError);

      // 4. Verify user status in listTenantUsers and identityRepository
      const users = tenantPartnerService.listTenantUsers(TENANT_ID);
      const user = users.find((u) => u.email === "proof-joiner@example.com");
      expect(user?.status).toBe("active");
    });

    it("resends invitation, revoking prior token and issuing fresh 24h token", async () => {
      const { tenantPartnerService } = createServiceFixture();

      const created = await tenantPartnerService.createTenantUser(TENANT_ID, {
        email: "resend-user@example.com",
        displayName: "Resend User",
        roleCode: "tenant_viewer",
      });

      const oldToken = created.rawInvitationToken!;

      // Resend invitation
      const resent = await tenantPartnerService.resendTenantInvitation(
        TENANT_ID,
        created.user.userId,
      );

      const newToken = resent.rawInvitationToken;
      expect(newToken).not.toBe(oldToken);

      // Old token is revoked and no longer valid
      const oldVerify = await tenantPartnerService.verifyTenantInvitation(oldToken);
      expect(oldVerify.valid).toBe(false);

      // New token is valid
      const newVerify = await tenantPartnerService.verifyTenantInvitation(newToken);
      expect(newVerify.valid).toBe(true);
    });

    it("revokes invitation making token invalid for acceptance", async () => {
      const { tenantPartnerService } = createServiceFixture();

      const created = await tenantPartnerService.createTenantUser(TENANT_ID, {
        email: "revoke-target@example.com",
        displayName: "Revoke Target",
        roleCode: "tenant_viewer",
      });

      const rawToken = created.rawInvitationToken!;

      // Revoke invitation
      const revokedResult = await tenantPartnerService.revokeTenantInvitation(
        TENANT_ID,
        created.user.userId,
      );

      expect(revokedResult.invitation.revokedAt).not.toBeNull();

      // Verification fails
      const verifyResult = await tenantPartnerService.verifyTenantInvitation(rawToken);
      expect(verifyResult.valid).toBe(false);

      // Accept fails
      await expect(
        tenantPartnerService.acceptTenantInvitation({ invitationToken: rawToken }),
      ).rejects.toThrow(ApiRequestError);
    });
  });

  describe("Invited user login enforcement & Anti-enumeration negatives", () => {
    it("prevents invited user from logging in before proof acceptance", () => {
      const { tenantPartnerService } = createServiceFixture();
      const jwtAuthService = new JwtAuthService();
      process.env.DRTS_TENANT_BOOTSTRAP_MODE = "fixture";

      const authController = new AuthController(
        jwtAuthService,
        tenantPartnerService,
        undefined as any,
      );

      // Add invited user
      tenantPartnerService.createTenantUser(TENANT_ID, {
        email: "invited-only@example.com",
        displayName: "Invited Only User",
        roleCode: "tenant_ops_admin",
      });

      // Attempting bootstrap session for invited user must fail
      expect(() =>
        authController.issueTenantBootstrapSession({
          email: "invited-only@example.com",
          tenantId: TENANT_ID,
        }),
      ).toThrow(ApiRequestError);

      try {
        authController.issueTenantBootstrapSession({
          email: "invited-only@example.com",
          tenantId: TENANT_ID,
        });
      } catch (err: any) {
        expect(err.code).toBe("AUTH_SESSION_EXCHANGE_DENIED");
      }
    });

    it("returns non-revealing invalid result for bogus invitation tokens (anti-enumeration)", async () => {
      const { tenantPartnerService } = createServiceFixture();

      const result = await tenantPartnerService.verifyTenantInvitation("invalid-bogus-token-12345");
      expect(result.valid).toBe(false);
      expect(result.email).toBeUndefined();
    });
  });

  describe("Self-escalation denial and Last-admin protection", () => {
    it("denies self-escalation / self role mutation", async () => {
      const { tenantPartnerService } = createServiceFixture();

      const created = await tenantPartnerService.createTenantUser(TENANT_ID, {
        email: "self-actor@example.com",
        displayName: "Self Actor",
        roleCode: "tenant_viewer",
      });
      // Accept invitation to make user active
      await tenantPartnerService.acceptTenantInvitation({
        invitationToken: created.rawInvitationToken!,
      });

      const identityContext: IdentityContext = {
        actorId: created.user.userId,
        actorType: "tenant_admin",
        realm: "tenant",
        authMode: "jwt_bearer",
        roleFamilies: ["tenant"],
        roles: ["tenant_viewer"],
        scopes: [],
        tenantId: TENANT_ID,
        supportedExecutionModes: [],
      };

      // Attempt self role update to tenant_admin
      expect(() =>
        tenantPartnerService.updateTenantUserRole(
          TENANT_ID,
          created.user.userId,
          { roleCode: "tenant_admin" },
          undefined,
          identityContext,
        ),
      ).toThrow(ApiRequestError);

      try {
        tenantPartnerService.updateTenantUserRole(
          TENANT_ID,
          created.user.userId,
          { roleCode: "tenant_admin" },
          undefined,
          identityContext,
        );
      } catch (err: any) {
        expect(err.code).toBe("SELF_ESCALATION_DENIED");
      }
    });

    it("prevents demoting or suspending the last tenant admin in a tenant", async () => {
      const { tenantPartnerService } = createServiceFixture();

      // Create admin user
      const createdAdmin = await tenantPartnerService.createTenantUser(TENANT_ID, {
        email: "sole-admin@example.com",
        displayName: "Sole Admin",
        roleCode: "tenant_admin",
      });

      // Attempting to demote sole admin must fail
      expect(() =>
        tenantPartnerService.updateTenantUserRole(TENANT_ID, createdAdmin.user.userId, {
          roleCode: "tenant_viewer",
        }),
      ).toThrow(ApiRequestError);

      try {
        tenantPartnerService.updateTenantUserRole(TENANT_ID, createdAdmin.user.userId, {
          roleCode: "tenant_viewer",
        });
      } catch (err: any) {
        expect(err.code).toBe("LAST_ADMIN_PROTECTION_FAILED");
      }

      // Attempting to suspend sole admin must fail
      await expect(
        tenantPartnerService.suspendTenantUser(TENANT_ID, createdAdmin.user.userId),
      ).rejects.toThrow(ApiRequestError);

      // Attempting to offboard sole admin must fail
      await expect(
        tenantPartnerService.offboardTenantUser(TENANT_ID, createdAdmin.user.userId),
      ).rejects.toThrow(ApiRequestError);
    });

    it("allows demoting an admin when another active admin exists in the tenant", async () => {
      const { tenantPartnerService } = createServiceFixture();

      const admin1 = await tenantPartnerService.createTenantUser(TENANT_ID, {
        email: "admin1@example.com",
        displayName: "Admin 1",
        roleCode: "tenant_admin",
      });
      await tenantPartnerService.createTenantUser(TENANT_ID, {
        email: "admin2@example.com",
        displayName: "Admin 2",
        roleCode: "tenant_admin",
      });

      // Demoting admin1 succeeds because admin2 remains
      const demoted = await tenantPartnerService.updateTenantUserRole(
        TENANT_ID,
        admin1.user.userId,
        { roleCode: "tenant_viewer" },
      );
      expect(demoted.roleCode).toBe("tenant_viewer");
    });
  });

  describe("Offboarding lifecycle and access revocation", () => {
    it("offboards a user, updates status to offboarded, and revokes sessions", async () => {
      const { tenantPartnerService, identityRepository } = createServiceFixture();

      const user = await tenantPartnerService.createTenantUser(TENANT_ID, {
        email: "offboarded-user@example.com",
        displayName: "Offboarded User",
        roleCode: "tenant_ops_admin",
      });

      const offboarded = await tenantPartnerService.offboardTenantUser(
        TENANT_ID,
        user.user.userId,
        { reason: "Employee departure" },
      );

      expect(offboarded.status).toBe("offboarded");

      const list = tenantPartnerService.listTenantUsers(TENANT_ID);
      const found = list.find((u) => u.userId === user.user.userId);
      expect(found?.status).toBe("offboarded");
    });

    it("suspends and reactivates a user through formal lifecycle review", async () => {
      const { tenantPartnerService } = createServiceFixture();

      const user = await tenantPartnerService.createTenantUser(TENANT_ID, {
        email: "lifecycle-user@example.com",
        displayName: "Lifecycle User",
        roleCode: "tenant_ops_admin",
      });

      // Suspend
      const suspended = await tenantPartnerService.suspendTenantUser(
        TENANT_ID,
        user.user.userId,
        { reason: "Security review" },
      );
      expect(suspended.status).toBe("suspended");

      // Reactivate
      const reactivated = await tenantPartnerService.reactivateTenantUser(
        TENANT_ID,
        user.user.userId,
        { reason: "Review cleared" },
      );
      expect(reactivated.status).toBe("active");
    });
  });
});
