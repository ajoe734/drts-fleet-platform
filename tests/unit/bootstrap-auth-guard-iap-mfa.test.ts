import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signTestIapJwtAssertion } from "@drts/control-plane-auth";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import {
  BootstrapAuthGuard,
  StepUpProofService,
} from "../../apps/api/src/common/auth";
import { IAPSubjectAdapter } from "../../apps/api/src/modules/auth/iap-subject.adapter";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";

const TEST_SECRET = "iap_test_secret_key_32chars_long_min!";
const EXPECTED_AUDIENCE = "/projects/9876543210/apps/drts-fleet-prod";

function signTestIapToken(payload: Record<string, any>): string {
  return signTestIapJwtAssertion(
    {
      iss: "https://cloud.google.com/iap",
      exp: Math.floor(Date.now() / 1000) + 3600,
      aud: EXPECTED_AUDIENCE,
      ...payload,
    },
    TEST_SECRET,
  );
}

function getErrorCode(error: unknown): string | null {
  if (error instanceof ApiRequestError) {
    const res = error.getResponse() as { error?: { code?: string } };
    return res?.error?.code ?? error.code ?? null;
  }
  return null;
}

describe("BootstrapAuthGuard IAP workforce MFA and step-up enforcement", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.IAP_EXPECTED_AUDIENCE = EXPECTED_AUDIENCE;
    process.env.IAP_JWT_SECRET_OR_PUBLIC_KEY = TEST_SECRET;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T12:00:00.000Z"));
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("enforces step-up proof for IAP callers on privileged routes and blocks missing step-up proof", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const iapAdapter = new IAPSubjectAdapter(
      identityRepo,
      securityEventsService,
    );
    const stepUpProofService = new StepUpProofService(securityEventsService);

    const auditNotificationService = {
      recordAuditLog: vi.fn(),
    } as any;

    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === "AUTH_OPEN_ROUTE") return false;
        return undefined;
      },
    } as any;

    const guard = new BootstrapAuthGuard(
      reflector,
      undefined,
      undefined,
      auditNotificationService,
      iapAdapter,
      stepUpProofService,
    );

    const iapToken = signTestIapToken({
      sub: "accounts.google.com:1001",
      email: "admin@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
      auth_time: Math.floor(Date.now() / 1000),
    });

    const request: any = {
      headers: {
        "x-goog-iap-jwt-assertion": iapToken,
      },
      method: "POST",
      url: "/api/platform-admin/users",
    };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    };

    let caughtError: unknown = null;
    try {
      await guard.canActivate(context);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ApiRequestError);
    expect(getErrorCode(caughtError)).toBe("STEP_UP_REQUIRED");
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalled();
  });

  it("rejects client MFA booleans on privileged IAP routes", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const iapAdapter = new IAPSubjectAdapter(
      identityRepo,
      securityEventsService,
    );
    const stepUpProofService = new StepUpProofService(securityEventsService);

    const reflector = {
      getAllAndOverride: () => undefined,
    } as any;

    const guard = new BootstrapAuthGuard(
      reflector,
      undefined,
      undefined,
      undefined,
      iapAdapter,
      stepUpProofService,
    );

    const iapToken = signTestIapToken({
      sub: "accounts.google.com:1001",
      email: "admin@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
      auth_time: Math.floor(Date.now() / 1000),
    });

    const request: any = {
      headers: {
        "x-goog-iap-jwt-assertion": iapToken,
      },
      body: { mfaVerified: true },
      method: "POST",
      url: "/api/platform-admin/users",
    };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    };

    let caughtError: unknown = null;
    try {
      await guard.canActivate(context);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ApiRequestError);
    expect(getErrorCode(caughtError)).toBe("STEP_UP_REQUIRED");
  });

  it("rejects stale auth_time for privileged IAP actions", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const iapAdapter = new IAPSubjectAdapter(
      identityRepo,
      securityEventsService,
    );
    const stepUpProofService = new StepUpProofService(securityEventsService);

    const reflector = {
      getAllAndOverride: () => undefined,
    } as any;

    const guard = new BootstrapAuthGuard(
      reflector,
      undefined,
      undefined,
      undefined,
      iapAdapter,
      stepUpProofService,
    );

    // auth_time is 20 minutes ago (1200 seconds), maxAge for platform-admin route is 10 mins (600s)
    const staleAuthTime = Math.floor(Date.now() / 1000) - 1200;
    const iapToken = signTestIapToken({
      sub: "accounts.google.com:1001",
      email: "admin@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
      auth_time: staleAuthTime,
    });

    const request: any = {
      headers: {
        "x-goog-iap-jwt-assertion": iapToken,
      },
      method: "POST",
      url: "/api/platform-admin/tenants/tenant-001/activate",
    };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    };

    let caughtError: unknown = null;
    try {
      await guard.canActivate(context);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(ApiRequestError);
    expect(["STEP_UP_REQUIRED", "AUTH_STEP_UP_REQUIRED"]).toContain(
      getErrorCode(caughtError),
    );
  });

  it("succeeds when a fresh valid step-up proof is provided for an IAP privileged action", async () => {
    const identityRepo = new IdentityRepository();
    const securityEventsService = new SecurityEventsService();
    const iapAdapter = new IAPSubjectAdapter(
      identityRepo,
      securityEventsService,
    );
    const stepUpProofService = new StepUpProofService(securityEventsService);

    const reflector = {
      getAllAndOverride: () => undefined,
    } as any;

    const guard = new BootstrapAuthGuard(
      reflector,
      undefined,
      undefined,
      undefined,
      iapAdapter,
      stepUpProofService,
    );

    const nowSeconds = Math.floor(Date.now() / 1000);
    const iapToken = signTestIapToken({
      sub: "accounts.google.com:1001",
      email: "admin@platform.drts",
      gcp_ia_groups: ["platform-admins@platform.drts"],
      auth_time: nowSeconds,
    });

    // Resolve subject first to generate matching principalId and session
    const resolvedSubject = await iapAdapter.resolveSubject(
      { "x-goog-iap-jwt-assertion": iapToken },
      {
        expectedAudience: EXPECTED_AUDIENCE,
        jwtSecretOrPublicKey: TEST_SECRET,
        autoProvision: true,
      },
    );

    const identityForProof = {
      authMode: "jwt_bearer" as const,
      actorType: "platform_admin" as const,
      actorId: resolvedSubject.principal.principalId,
      principalId: resolvedSubject.principal.principalId,
      membershipId: resolvedSubject.membership.membershipId,
      subject: resolvedSubject.principal.subject,
      realm: "platform" as const,
      tenantId: null,
      roleFamilies: ["platform" as const],
      roles: resolvedSubject.effectiveRoles,
      scopes: resolvedSubject.effectiveScopes,
      requestId: "req-001",
      sessionId: `session_iap_${resolvedSubject.principal.principalId}`,
      authTime: nowSeconds,
      amr: ["verified_iap_workforce"],
    };

    // Issue step-up proof for platform:users:create
    const proof = stepUpProofService.createProof(
      identityForProof,
      { method: "POST", path: "/api/platform-admin/users" },
      "req-issue-001",
    );

    const request: any = {
      headers: {
        "x-goog-iap-jwt-assertion": iapToken,
        "x-drts-step-up-reference": proof.stepUpReference!,
      },
      method: "POST",
      url: "/api/platform-admin/users",
    };
    const context: any = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    };

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(request.identity).toBeDefined();
    expect(request.identity.actorId).toBe(
      resolvedSubject.principal.principalId,
    );
    expect(request.identity.amr).toContain("verified_iap_workforce");
  });
});
