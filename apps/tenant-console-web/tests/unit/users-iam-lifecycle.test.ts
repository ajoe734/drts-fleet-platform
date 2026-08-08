import { describe, expect, it, vi } from "vitest";
import {
  inviteTenantUserAction,
  reactivateTenantUserAction,
  revokeAllTenantUserSessionsAction,
  revokeTenantUserInviteAction,
  revokeTenantUserSessionAction,
  suspendTenantUserAction,
  updateTenantUserRoleAction,
} from "../../app/users/actions";

// Mock next/cache revalidatePath
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

// Mock api-client
vi.mock("@/lib/api-client", () => ({
  getTenantClient: vi.fn(() => ({
    createTenantUser: vi.fn(async () => ({ success: true })),
    updateTenantRole: vi.fn(async () => ({ success: true })),
    resendTenantUserInvite: vi.fn(async () => ({ success: true })),
  })),
}));

describe("IAM-UI-TEN-001 Users, Roles, Sessions & Step-up Lifecycle Actions", () => {
  describe("inviteTenantUserAction", () => {
    it("fails when email is missing", async () => {
      const formData = new FormData();
      formData.set("displayName", "Test User");
      formData.set("roleCode", "tc_operator");

      const result = await inviteTenantUserAction(formData);
      expect(result.success).toBe(false);
      expect(result.error).toBe("email_required");
    });

    it("fails when email is invalid", async () => {
      const formData = new FormData();
      formData.set("email", "not-an-email");
      formData.set("displayName", "Test User");
      formData.set("roleCode", "tc_operator");

      const result = await inviteTenantUserAction(formData);
      expect(result.success).toBe(false);
      expect(result.error).toBe("email_invalid");
    });

    it("succeeds with valid email, name, and role", async () => {
      const formData = new FormData();
      formData.set("email", "newuser@yamato.com");
      formData.set("displayName", "Yamato Operator");
      formData.set("roleCode", "tc_operator");

      const result = await inviteTenantUserAction(formData);
      expect(result.success).toBe(true);
      expect(result.userEmail).toBe("newuser@yamato.com");
    });
  });

  describe("updateTenantUserRoleAction (Self-Escalation & Last-Admin Safeguards)", () => {
    it("fails when stepUpConfirmed is not present", async () => {
      const formData = new FormData();
      formData.set("userId", "usr-001");
      formData.set("roleCode", "tc_operator");

      const result = await updateTenantUserRoleAction(formData);
      expect(result.success).toBe(false);
      expect(result.error).toBe("step_up_required");
    });

    it("blocks demoting the last active tenant_admin (last_admin_protected)", async () => {
      const formData = new FormData();
      formData.set("userId", "usr-admin-only");
      formData.set("roleCode", "tc_operator"); // Demoting to operator
      formData.set("targetCurrentRole", "tc_admin");
      formData.set("activeAdminCount", "1"); // Only 1 admin active
      formData.set("stepUpConfirmed", "true");

      const result = await updateTenantUserRoleAction(formData);
      expect(result.success).toBe(false);
      expect(result.error).toBe("last_admin_protected");
    });

    it("blocks self-escalation when user promotes self to tc_admin (self_escalation_denied)", async () => {
      const formData = new FormData();
      formData.set("userId", "usr-operator-self");
      formData.set("currentActorId", "usr-operator-self");
      formData.set("targetCurrentRole", "tc_operator");
      formData.set("roleCode", "tc_admin"); // Promoting self to admin
      formData.set("stepUpConfirmed", "true");

      const result = await updateTenantUserRoleAction(formData);
      expect(result.success).toBe(false);
      expect(result.error).toBe("self_escalation_denied");
    });

    it("succeeds when updating another user role with step-up verification", async () => {
      const formData = new FormData();
      formData.set("userId", "usr-002");
      formData.set("roleCode", "tc_finance");
      formData.set("stepUpConfirmed", "true");

      const result = await updateTenantUserRoleAction(formData);
      expect(result.success).toBe(true);
      expect(result.roleCode).toBe("tc_finance");
    });
  });

  describe("suspendTenantUserAction & reactivateTenantUserAction", () => {
    it("fails suspend when reason is missing", async () => {
      const formData = new FormData();
      formData.set("userId", "usr-002");
      formData.set("stepUpConfirmed", "true");

      const result = await suspendTenantUserAction(formData);
      expect(result.success).toBe(false);
      expect(result.error).toBe("reason_required");
    });

    it("blocks suspending the last active admin (last_admin_protected)", async () => {
      const formData = new FormData();
      formData.set("userId", "usr-admin-only");
      formData.set("reason", "Suspension test");
      formData.set("targetCurrentRole", "tc_admin");
      formData.set("activeAdminCount", "1");
      formData.set("stepUpConfirmed", "true");

      const result = await suspendTenantUserAction(formData);
      expect(result.success).toBe(false);
      expect(result.error).toBe("last_admin_protected");
    });

    it("succeeds suspending non-last-admin user with reason & step-up", async () => {
      const formData = new FormData();
      formData.set("userId", "usr-002");
      formData.set("reason", "Security compliance requirement");
      formData.set("stepUpConfirmed", "true");

      const result = await suspendTenantUserAction(formData);
      expect(result.success).toBe(true);
      expect(result.userId).toBe("usr-002");
    });

    it("succeeds reactivating a suspended user with step-up", async () => {
      const formData = new FormData();
      formData.set("userId", "usr-002");
      formData.set("stepUpConfirmed", "true");

      const result = await reactivateTenantUserAction(formData);
      expect(result.success).toBe(true);
    });
  });

  describe("Session Revocation Actions", () => {
    it("requires step-up before revoking single session", async () => {
      const formData = new FormData();
      formData.set("sessionId", "ses_live_12345");

      const result = await revokeTenantUserSessionAction(formData);
      expect(result.success).toBe(false);
      expect(result.error).toBe("step_up_required");
    });

    it("succeeds revoking session with step-up", async () => {
      const formData = new FormData();
      formData.set("sessionId", "ses_live_12345");
      formData.set("stepUpConfirmed", "true");

      const result = await revokeTenantUserSessionAction(formData);
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe("ses_live_12345");
    });

    it("succeeds revoking all sessions for user with step-up", async () => {
      const formData = new FormData();
      formData.set("userId", "usr-002");
      formData.set("reason", "Device lost");
      formData.set("stepUpConfirmed", "true");

      const result = await revokeAllTenantUserSessionsAction(formData);
      expect(result.success).toBe(true);
      expect(result.userId).toBe("usr-002");
    });
  });
});
