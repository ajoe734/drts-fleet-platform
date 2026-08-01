import { describe, expect, it } from "vitest";

import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { DriverDeviceSessionService } from "../../apps/api/src/modules/auth/driver-device-session.service";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import {
  hashIdentitySecret,
  IdentityRepository,
} from "../../apps/api/src/modules/identity/identity.repository";

describe("Identity session and refresh family repository (in-memory mode)", () => {
  it("creates, retrieves, and revokes sessions and associated refresh families", async () => {
    const repository = new IdentityRepository();

    const session = await repository.createSession({
      sessionId: "session_001",
      sourceRef: "session_source_001",
      principalId: "principal_001",
      membershipId: "membership_001",
      realm: "tenant",
      status: "active",
      authTime: "2026-08-01T12:00:00.000Z",
      authMethods: ["oidc_pkce"],
      tokenVersion: 1,
      idleExpiresAt: "2099-01-01T00:00:00.000Z",
      absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: { ipPrefix: "192.168.1" },
      riskSummary: { riskLevel: "low" },
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });

    expect(session.sessionId).toBe("session_001");

    const fetchedSession = await repository.getSession("session_001");
    expect(fetchedSession).not.toBeNull();
    expect(fetchedSession?.status).toBe("active");

    const family = await repository.createRefreshFamily({
      familyId: "family_001",
      sourceRef: "family_source_001",
      sessionId: "session_001",
      currentTokenHash: hashIdentitySecret("token_raw_1"),
      counter: 0,
      status: "active",
      expiresAt: "2026-08-31T12:00:00.000Z",
      compromisedAt: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });

    expect(family.familyId).toBe("family_001");

    const revokedSession = await repository.revokeSession(
      "session_001",
      "USER_LOGOUT",
      "principal_001",
    );
    expect(revokedSession?.status).toBe("revoked");
    expect(revokedSession?.revokeReason).toBe("USER_LOGOUT");

    const fetchedFamily = await repository.getRefreshFamily("family_001");
    expect(fetchedFamily?.status).toBe("revoked");
  });

  it("consumes and rotates refresh tokens with hash-only persistence and detects token reuse", async () => {
    const repository = new IdentityRepository();

    const session = await repository.createSession({
      sessionId: "session_002",
      sourceRef: "session_source_002",
      principalId: "principal_002",
      membershipId: null,
      realm: "driver",
      status: "active",
      authTime: "2026-08-01T12:00:00.000Z",
      authMethods: ["device_binding"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });

    const initialToken = "raw_refresh_token_v1";
    const initialHash = hashIdentitySecret(initialToken);

    await repository.createRefreshFamily({
      familyId: "family_002",
      sourceRef: "family_source_002",
      sessionId: session.sessionId,
      currentTokenHash: initialHash,
      counter: 0,
      status: "active",
      expiresAt: "2099-01-01T00:00:00.000Z",
      compromisedAt: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      updatedAt: "2026-08-01T12:00:00.000Z",
    });

    const newToken = "raw_refresh_token_v2";
    const rotateResult = await repository.consumeAndRotateRefreshToken({
      familyId: "family_002",
      oldTokenRaw: initialToken,
      newTokenRaw: newToken,
      newExpiresAt: "2099-01-02T00:00:00.000Z",
    });

    expect(rotateResult.success).toBe(true);
    expect(rotateResult.family?.counter).toBe(1);
    expect(rotateResult.family?.currentTokenHash).toBe(hashIdentitySecret(newToken));

    // Verify token reuse attempt (re-presenting initialToken)
    const reuseResult = await repository.consumeAndRotateRefreshToken({
      oldTokenRaw: initialToken,
      newTokenRaw: "raw_refresh_token_v3",
      newExpiresAt: "2099-01-03T00:00:00.000Z",
    });

    expect(reuseResult.success).toBe(false);
    expect(reuseResult.reason).toBe("REUSE_DETECTED");
    expect(reuseResult.family?.status).toBe("compromised");
    expect(reuseResult.session?.status).toBe("compromised");
  });

  it("exercises DriverDeviceSessionService runtime auth path using IdentityRepository", async () => {
    process.env.JWT_SECRET = "test-secret";

    const repository = new IdentityRepository();
    const jwtAuthService = new JwtAuthService();
    const driverProfileService = new DriverProfileService(
      new AuditNotificationService(),
    );
    const service = new DriverDeviceSessionService(
      jwtAuthService,
      driverProfileService,
      undefined,
      undefined,
      repository,
    );

    // 1. Register device
    const registered = await service.register({
      registrationCode: "demo-driver",
      deviceId: "device-runtime-001",
      deviceLabel: "Driver Phone",
    });

    expect(registered.driverId).toBe("drv-demo-001");
    expect(registered.deviceId).toBe("device-runtime-001");
    expect(registered.refreshToken).toMatch(/^drvrefresh_/);

    // Verify session persisted in repository with hashed refresh secret
    const persistedSession = await repository.getSession(registered.bindingId);
    expect(persistedSession).not.toBeNull();
    expect(persistedSession?.status).toBe("active");

    const persistedFamily = await repository.getRefreshFamilyByTokenHash(
      hashIdentitySecret(registered.refreshToken),
    );
    expect(persistedFamily).not.toBeNull();
    expect(persistedFamily?.sessionId).toBe(registered.bindingId);

    // 2. Validate active session access
    await expect(
      service.assertSessionAccessAllowed(
        registered.bindingId,
        "device-runtime-001",
        "drv-demo-001",
        "/api/driver/trips",
      ),
    ).resolves.toBeUndefined();

    // 2.5 Test refreshing with mismatched deviceId before rotation (must fail without consuming token)
    await expect(
      service.refresh({
        deviceId: "wrong-device-id",
        refreshToken: registered.refreshToken,
      }),
    ).rejects.toThrowError(ApiRequestError);

    const activeSessionAfterMismatch = await repository.getSession(registered.bindingId);
    expect(activeSessionAfterMismatch?.status).toBe("active");

    // 3. Refresh session with valid deviceId
    const refreshed = await service.refresh({
      deviceId: "device-runtime-001",
      refreshToken: registered.refreshToken,
    });

    expect(refreshed.bindingId).toBe(registered.bindingId);
    expect(refreshed.refreshToken).not.toBe(registered.refreshToken);

    // 4. Test token reuse via service refresh (presenting original refreshToken)
    await expect(
      service.refresh({
        deviceId: "device-runtime-001",
        refreshToken: registered.refreshToken,
      }),
    ).rejects.toThrowError(ApiRequestError);

    // Family and session should now be compromised
    const compromisedSession = await repository.getSession(registered.bindingId);
    expect(compromisedSession?.status).toBe("compromised");

    delete process.env.JWT_SECRET;
  });

  it("prevents refresh token rotation/consumption when driver eligibility check fails", async () => {
    process.env.JWT_SECRET = "test-secret";
    const repository = new IdentityRepository();
    const jwtAuthService = new JwtAuthService();
    const driverProfileService = new DriverProfileService(
      new AuditNotificationService(),
    );
    let isSuspended = false;
    const mockRegulatoryService = {
      assertDriverAuthEligible: (_driverId: string) => {
        if (isSuspended) {
          throw new ApiRequestError(
            403,
            "DRIVER_SUSPENDED",
            "Driver account is currently suspended.",
          );
        }
      },
    };

    const service = new DriverDeviceSessionService(
      jwtAuthService,
      driverProfileService,
      mockRegulatoryService as any,
      undefined,
      repository,
    );

    const registered = await service.register({
      registrationCode: "demo-driver",
      deviceId: "device-suspended-001",
    });

    const initialTokenHash = hashIdentitySecret(registered.refreshToken);

    // Driver gets suspended after registration
    isSuspended = true;

    await expect(
      service.refresh({
        deviceId: "device-suspended-001",
        refreshToken: registered.refreshToken,
      }),
    ).rejects.toThrowError(ApiRequestError);

    const family = await repository.getRefreshFamilyByTokenHash(initialTokenHash);
    expect(family).not.toBeNull();
    expect(family?.counter).toBe(0);

    delete process.env.JWT_SECRET;
  });

  it("ensures concurrent refresh token requests have one winner without compromising session", async () => {
    const repository = new IdentityRepository();

    const session = await repository.createSession({
      sessionId: "session_conc_winner",
      sourceRef: "session_source_conc",
      principalId: "principal_conc",
      membershipId: null,
      realm: "driver",
      status: "active",
      authTime: new Date().toISOString(),
      authMethods: ["device_binding"],
      tokenVersion: 1,
      idleExpiresAt: null,
      absoluteExpiresAt: "2099-01-01T00:00:00.000Z",
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: { deviceId: "device-conc-001" },
      riskSummary: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const initialToken = "raw_refresh_token_conc_v1";
    const family = await repository.createRefreshFamily({
      familyId: "family_conc_winner",
      sourceRef: "family_source_conc",
      sessionId: session.sessionId,
      currentTokenHash: hashIdentitySecret(initialToken),
      counter: 0,
      status: "active",
      expiresAt: "2099-01-01T00:00:00.000Z",
      compromisedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const winnerResult = await repository.consumeAndRotateRefreshToken({
      familyId: family.familyId,
      oldTokenRaw: initialToken,
      newTokenRaw: "raw_refresh_token_conc_v2",
      newExpiresAt: "2099-01-02T00:00:00.000Z",
    });

    expect(winnerResult.success).toBe(true);

    const loserResult = await repository.consumeAndRotateRefreshToken({
      familyId: family.familyId,
      oldTokenRaw: initialToken,
      newTokenRaw: "raw_refresh_token_conc_v3",
      newExpiresAt: "2099-01-02T00:00:00.000Z",
    });

    expect(loserResult.success).toBe(false);
    expect(loserResult.reason).toBe("CONCURRENCY_CONFLICT");

    const activeSession = await repository.getSession(session.sessionId);
    const activeFamily = await repository.getRefreshFamily(family.familyId);

    expect(activeSession?.status).toBe("active");
    expect(activeFamily?.status).toBe("active");
    expect(activeFamily?.currentTokenHash).toBe(hashIdentitySecret("raw_refresh_token_conc_v2"));
  });
});
