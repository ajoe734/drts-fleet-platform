import { afterEach, describe, expect, it, vi } from "vitest";

import type { IamStepUpProof } from "@drts/contracts";

import {
  evaluateMfaStepUpPolicy,
  isPrivilegedAction,
  lookupStepUpPolicyRule,
} from "../../apps/api/src/common/auth/mfa-step-up.policy";
import { BootstrapAuthGuard } from "../../apps/api/src/common/auth/bootstrap-auth.guard";
import type {
  AuthenticatedRequestLike,
  BootstrapRequestIdentity,
} from "../../apps/api/src/common/auth";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("IAM-MFA-001: MFA and Step-Up Policy Enforcement", () => {
  const baseIdentity: BootstrapRequestIdentity = {
    authMode: "jwt_bearer",
    actorType: "tenant_admin",
    actorId: "actor-123",
    subject: "actor-123",
    realm: "tenant",
    tenantId: "tenant-alpha",
    roleFamilies: ["tenant"],
    roles: ["tenant_admin"],
    scopes: ["tenant:write", "foundation:write"],
    requestId: "req-001",
    sid: "session-abc-123",
  };

  const dummyRequest: AuthenticatedRequestLike = {
    headers: {},
    method: "POST",
    url: "/api/tenant/users/user-456/role",
    originalUrl: "/api/tenant/users/user-456/role",
  };

  describe("Rule Inventory Coverage", () => {
    it("declares step-up rules for all named high-risk platform, ops, tenant, partner and driver actions", () => {
      const requiredHighRiskActions = [
        "createBreakGlassRequest",
        "approveBreakGlassRequest",
        "decideAccessReview",
        "issuePartnerIngressCredential",
        "revokePartnerIngressCredential",
        "exportMultiTaxiRecords",
        "updateTenantUserRole",
        "createTenantUser",
        "issueTenantApiKey",
        "revokeTenantApiKey",
        "rotateTenantApiKey",
        "approveTenantApprovalRequest",
        "rejectTenantApprovalRequest",
        "escalateTenantApprovalRequest",
        "resolvePartnerEligibilityReview",
        "partner:eligibility:verify",
        "auth:driver-device:revoke",
        "driver:sos-events:create",
      ];

      for (const actionId of requiredHighRiskActions) {
        const rule = lookupStepUpPolicyRule(actionId);
        expect(rule).toBeDefined();
        expect(rule?.requiresMfa).toBe(true);
        expect(rule?.maxAgeSeconds).toBeGreaterThan(0);
      }
    });

    it("correctly identifies privileged mutation routes as requiring step-up", () => {
      expect(isPrivilegedAction("POST", "/api/platform-admin/tenants")).toBe(
        true,
      );
      expect(isPrivilegedAction("POST", "/api/tenant/users/u1/role")).toBe(
        true,
      );
      expect(isPrivilegedAction("POST", "/api/tenant/api-keys")).toBe(true);
      expect(isPrivilegedAction("POST", "/api/driver/sos-events")).toBe(true);
      expect(isPrivilegedAction("GET", "/api/identity/context")).toBe(false);
    });
  });

  describe("Client MFA Booleans Rejection", () => {
    it("rejects client-supplied MFA booleans when trusted server AMR and proof are missing", () => {
      const identity: BootstrapRequestIdentity = {
        ...baseIdentity,
        amr: undefined,
        authTime: undefined,
      };

      const reqWithClientBooleans: AuthenticatedRequestLike = {
        ...dummyRequest,
        body: {
          isMfa: true,
          mfaVerified: true,
          clientMfaPassed: true,
        },
        headers: {
          "x-mfa-passed": "true",
        },
      };

      const result = evaluateMfaStepUpPolicy(
        identity,
        "updateTenantUserRole",
        reqWithClientBooleans,
      );
      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe("AUTH_STEP_UP_REQUIRED");
      expect(result.reason).toBe("CLIENT_BOOLEAN_DISALLOWED");
    });
  });

  describe("Stale Wrong-Session and Wrong-Action Proof Handling", () => {
    it("fails step-up proof bound to a different session (stale wrong-session proof)", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const wrongSessionProof: IamStepUpProof = {
        proofId: "proof-001",
        actorId: "actor-123",
        sessionId: "session-OTHER-456", // Different session!
        actionId: "updateTenantUserRole",
        amr: ["mfa", "totp"],
        authTime: nowSeconds - 30,
        issuedAt: nowSeconds - 30,
        expiresAt: nowSeconds + 270,
      };

      const identity: BootstrapRequestIdentity = {
        ...baseIdentity,
        sid: "session-abc-123",
        stepUpProof: wrongSessionProof,
      };

      const result = evaluateMfaStepUpPolicy(
        identity,
        "updateTenantUserRole",
        dummyRequest,
        nowSeconds,
      );
      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe("AUTH_STEP_UP_REQUIRED");
      expect(result.reason).toBe("STALE_WRONG_SESSION");
    });

    it("fails step-up proof bound to a different action (stale wrong-action proof)", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const wrongActionProof: IamStepUpProof = {
        proofId: "proof-002",
        actorId: "actor-123",
        sessionId: "session-abc-123",
        actionId: "issueTenantApiKey", // Different action!
        amr: ["mfa", "hwk"],
        authTime: nowSeconds - 20,
        issuedAt: nowSeconds - 20,
        expiresAt: nowSeconds + 280,
      };

      const identity: BootstrapRequestIdentity = {
        ...baseIdentity,
        sid: "session-abc-123",
        stepUpProof: wrongActionProof,
      };

      const result = evaluateMfaStepUpPolicy(
        identity,
        "updateTenantUserRole",
        dummyRequest,
        nowSeconds,
      );
      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe("AUTH_STEP_UP_REQUIRED");
      expect(result.reason).toBe("STALE_WRONG_ACTION");
    });

    it("fails step-up proof bound to a different principal", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const wrongPrincipalProof: IamStepUpProof = {
        proofId: "proof-003",
        actorId: "other-actor-999", // Different principal!
        sessionId: "session-abc-123",
        actionId: "updateTenantUserRole",
        amr: ["mfa", "totp"],
        authTime: nowSeconds - 10,
        issuedAt: nowSeconds - 10,
        expiresAt: nowSeconds + 290,
      };

      const identity: BootstrapRequestIdentity = {
        ...baseIdentity,
        stepUpProof: wrongPrincipalProof,
      };

      const result = evaluateMfaStepUpPolicy(
        identity,
        "updateTenantUserRole",
        dummyRequest,
        nowSeconds,
      );
      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe("AUTH_STEP_UP_REQUIRED");
      expect(result.reason).toBe("STALE_WRONG_PRINCIPAL");
    });
  });

  describe("Freshness Window Evaluation", () => {
    it("fails proof when auth_time is outside the policy freshness window", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const expiredProof: IamStepUpProof = {
        proofId: "proof-expired",
        actorId: "actor-123",
        sessionId: "session-abc-123",
        actionId: "updateTenantUserRole",
        amr: ["mfa", "fido2"],
        authTime: nowSeconds - 301, // 301 seconds ago (max is 300)
        issuedAt: nowSeconds - 301,
        expiresAt: nowSeconds - 1,
      };

      const identity: BootstrapRequestIdentity = {
        ...baseIdentity,
        stepUpProof: expiredProof,
      };

      const result = evaluateMfaStepUpPolicy(
        identity,
        "updateTenantUserRole",
        dummyRequest,
        nowSeconds,
      );
      expect(result.allowed).toBe(false);
      expect(result.errorCode).toBe("AUTH_STEP_UP_REQUIRED");
      expect(result.reason).toBe("EXPIRED_FRESHNESS_WINDOW");
    });

    it("succeeds when fresh trusted proof is inside policy freshness window", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const freshProof: IamStepUpProof = {
        proofId: "proof-fresh",
        actorId: "actor-123",
        sessionId: "session-abc-123",
        actionId: "updateTenantUserRole",
        amr: ["mfa", "totp"],
        authTime: nowSeconds - 60, // 60 seconds ago (inside 300s window)
        issuedAt: nowSeconds - 60,
        expiresAt: nowSeconds + 240,
      };

      const identity: BootstrapRequestIdentity = {
        ...baseIdentity,
        sid: "session-abc-123",
        stepUpProof: freshProof,
      };

      const result = evaluateMfaStepUpPolicy(
        identity,
        "updateTenantUserRole",
        dummyRequest,
        nowSeconds,
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe("PASSED");
    });

    it("succeeds when session identity has fresh trusted MFA AMR and auth_time within window", () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const identity: BootstrapRequestIdentity = {
        ...baseIdentity,
        amr: ["mfa", "webauthn"],
        authTime: nowSeconds - 120, // 2 minutes ago
      };

      const result = evaluateMfaStepUpPolicy(
        identity,
        "updateTenantUserRole",
        dummyRequest,
        nowSeconds,
      );
      expect(result.allowed).toBe(true);
      expect(result.reason).toBe("PASSED");
    });
  });

  describe("Guard Integration & Audit Events", () => {
    it("emits audit event when privileged action step-up check fails in BootstrapAuthGuard", () => {
      const mockAuditService = {
        recordAuditLog: vi.fn(),
      };

      const reflector = {
        getAllAndOverride: vi.fn((key: string) => {
          if (key === "AUTH_OPEN_ROUTE") return false;
          return undefined;
        }),
      } as any;

      const guard = new BootstrapAuthGuard(
        reflector,
        undefined,
        undefined,
        mockAuditService as any,
      );

      const request: AuthenticatedRequestLike = {
        headers: {
          "x-actor-type": "tenant_admin",
          "x-actor-id": "actor-123",
          "x-realm": "tenant",
          "x-roles": "tenant_admin",
          "x-scopes": "tenant:write",
        },
        method: "POST",
        url: "/api/tenant/users/user-1/role",
        originalUrl: "/api/tenant/users/user-1/role",
      };

      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      expect(() => guard.canActivate(context)).toThrow(ApiRequestError);

      expect(mockAuditService.recordAuditLog).toHaveBeenCalledTimes(1);
      expect(mockAuditService.recordAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: "actor-123",
          moduleName: "auth",
          newValuesSummary: expect.objectContaining({
            errorCode: "AUTH_STEP_UP_REQUIRED",
          }),
        }),
      );
    });

    it("denies raw IAP-authenticated platform request on privileged route without step-up proof and calls StepUpProofService.assertRequestSatisfied", async () => {
      const mockAuditService = {
        recordAuditLog: vi.fn(),
      };
      const mockIapSubjectAdapter = {
        resolveSubject: vi.fn().mockResolvedValue({
          principal: { principalId: "iap-user-001", subject: "iap-sub-1" },
          membership: { membershipId: "mem-1", realm: "platform" },
          effectiveRoles: ["platform_admin"],
          effectiveScopes: ["foundation:write", "platform:write"],
          payload: { amr: ["pwd"] },
        }),
      };
      const mockStepUpProofService = {
        assertRequestSatisfied: vi.fn().mockImplementation(() => {
          throw new ApiRequestError(
            403,
            "AUTH_STEP_UP_REQUIRED",
            "Step-up proof reference is required",
          );
        }),
      };

      const reflector = {
        getAllAndOverride: vi.fn((key: string) => {
          if (key === "AUTH_OPEN_ROUTE") return false;
          return undefined;
        }),
      } as any;

      const guard = new BootstrapAuthGuard(
        reflector,
        undefined,
        undefined,
        mockAuditService as any,
        mockIapSubjectAdapter as any,
        mockStepUpProofService as any,
      );

      const request: AuthenticatedRequestLike = {
        headers: {
          "x-goog-iap-jwt-assertion": "mock-iap-token",
        },
        method: "POST",
        url: "/api/platform-admin/tenants",
        originalUrl: "/api/platform-admin/tenants",
      };

      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      await expect(guard.canActivate(context)).rejects.toThrow(ApiRequestError);
      expect(
        mockStepUpProofService.assertRequestSatisfied,
      ).toHaveBeenCalledTimes(1);
      expect(mockAuditService.recordAuditLog).toHaveBeenCalledTimes(1);
    });

    it("allows IAP-authenticated request when step-up proof and fresh MFA are satisfied", async () => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const mockIapSubjectAdapter = {
        resolveSubject: vi.fn().mockResolvedValue({
          principal: { principalId: "iap-user-002", subject: "iap-sub-2" },
          membership: { membershipId: "mem-2", realm: "platform" },
          effectiveRoles: ["platform_admin"],
          effectiveScopes: ["foundation:write", "platform:write"],
          payload: { amr: ["mfa", "totp"], auth_time: nowSeconds - 10 },
        }),
      };
      const mockStepUpProofService = {
        assertRequestSatisfied: vi.fn(),
      };

      const reflector = {
        getAllAndOverride: vi.fn((key: string) => {
          if (key === "AUTH_OPEN_ROUTE") return false;
          return undefined;
        }),
      } as any;

      const guard = new BootstrapAuthGuard(
        reflector,
        undefined,
        undefined,
        undefined,
        mockIapSubjectAdapter as any,
        mockStepUpProofService as any,
      );

      const request: AuthenticatedRequestLike = {
        headers: {
          "x-goog-iap-jwt-assertion": "mock-iap-token",
        },
        method: "POST",
        url: "/api/platform-admin/tenants",
        originalUrl: "/api/platform-admin/tenants",
      };

      const context = {
        switchToHttp: () => ({ getRequest: () => request }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as any;

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(
        mockStepUpProofService.assertRequestSatisfied,
      ).toHaveBeenCalledTimes(1);
    });
  });
});
