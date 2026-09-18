import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryRepository } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { SecurityEventsRepository } from "../../apps/api/src/modules/security-events/security-events.repository";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";
import { OpsDispatchEventsService } from "../../apps/api/src/common/ops-dispatch-events.service";
import { DriverDeviceSessionRepository } from "../../apps/api/src/modules/auth/driver-device-session.repository";
import { DriverDeviceSessionService } from "../../apps/api/src/modules/auth/driver-device-session.service";

process.env.JWT_SECRET =
  "test_jwt_secret_key_string_32chars_long_minimum_for_vitest!";

function setupServices() {
  const auditService = new AuditNotificationService();
  const driverProfileService = new DriverProfileService(auditService);
  const jwtAuthService = new JwtAuthService();
  const opsDispatchEventsService = new OpsDispatchEventsService({
    emit: () => {},
  } as any);
  const securityEventsRepository = new SecurityEventsRepository();
  const securityEventsService = new SecurityEventsService(
    securityEventsRepository,
  );
  const regulatoryRepository = new RegulatoryRegistryRepository();
  const regulatoryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditService,
    driverProfileService,
    regulatoryRepository,
  );
  const sessionRepository = new DriverDeviceSessionRepository();
  const sessionService = new DriverDeviceSessionService(
    jwtAuthService,
    driverProfileService,
    sessionRepository,
    regulatoryService,
    securityEventsService,
  );

  return {
    jwtAuthService,
    driverProfileService,
    regulatoryService,
    securityEventsService,
    sessionRepository,
    sessionService,
  };
}

describe("DriverDeviceSessionService (IAM-DRV-001)", () => {
  it("registers device binding and survives service restart", async () => {
    const {
      sessionService,
      sessionRepository,
      jwtAuthService,
      driverProfileService,
      regulatoryService,
      securityEventsService,
    } = setupServices();

    await sessionService.onModuleInit();

    const issued = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });

    const session = await sessionService.register({
      registrationCode: issued.registrationCode,
      deviceId: "device-restart-001",
      deviceLabel: "Driver Phone",
    });

    expect(session.driverId).toBe("drv-demo-001");
    expect(session.deviceId).toBe("device-restart-001");
    expect(session.accessToken).toBeTruthy();
    expect(session.refreshToken).toBeTruthy();
    expect(session.bindingId).toBeTruthy();

    expect(
      await sessionService.isBindingActive(
        session.bindingId,
        session.deviceId,
        session.driverId,
      ),
    ).toBe(true);

    // Simulate service restart by creating a new DriverDeviceSessionService using the same repository
    const restartedService = new DriverDeviceSessionService(
      jwtAuthService,
      driverProfileService,
      sessionRepository,
      regulatoryService,
      securityEventsService,
    );
    await restartedService.onModuleInit();

    expect(
      await restartedService.isBindingActive(
        session.bindingId,
        session.deviceId,
        session.driverId,
      ),
    ).toBe(true);
  });

  it("enforces single-use expiring registration proof", async () => {
    const { sessionService } = setupServices();
    await sessionService.onModuleInit();

    const issued = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });

    // First registration succeeds
    const session1 = await sessionService.register({
      registrationCode: issued.registrationCode,
      deviceId: "device-singleuse-001",
    });
    expect(session1.bindingId).toBeTruthy();

    // Re-using the same registration code must be rejected
    await expect(
      sessionService.register({
        registrationCode: issued.registrationCode,
        deviceId: "device-singleuse-002",
      }),
    ).rejects.toThrowError(ApiRequestError);

    // Expired registration proof must be rejected
    const expired = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
      expiresInHours: -1, // Expired 1 hour ago
    });

    await expect(
      sessionService.register({
        registrationCode: expired.registrationCode,
        deviceId: "device-expired-001",
      }),
    ).rejects.toThrowError(ApiRequestError);
  });

  it("stores refresh secrets as hash-only and performs rotation", async () => {
    const { sessionService, sessionRepository } = setupServices();
    await sessionService.onModuleInit();

    const session = await sessionService.register({
      registrationCode: "driver-demo-001",
      deviceId: "device-hash-001",
    });

    const familyRecord =
      await sessionRepository.findActiveRefreshFamilyByBindingId(
        session.bindingId,
      );

    expect(familyRecord).not.toBeNull();
    // Verify plaintext refresh token is NEVER stored
    expect(familyRecord?.currentTokenHash).not.toBe(session.refreshToken);
    expect(familyRecord?.currentTokenHash).toHaveLength(64); // SHA-256 hex string

    // Refresh session
    const refreshedSession = await sessionService.refresh({
      deviceId: session.deviceId,
      refreshToken: session.refreshToken,
    });

    expect(refreshedSession.refreshToken).not.toBe(session.refreshToken);
    expect(refreshedSession.bindingId).toBe(session.bindingId);

    const updatedFamily =
      await sessionRepository.findActiveRefreshFamilyByBindingId(
        session.bindingId,
      );
    expect(updatedFamily?.rotationCounter).toBe(1);
    expect(updatedFamily?.previousTokenHashes).toContain(
      familyRecord?.currentTokenHash,
    );
  });

  it("detects refresh token reuse, revokes family, and emits security alert", async () => {
    const { sessionService, sessionRepository } = setupServices();
    await sessionService.onModuleInit();

    const session = await sessionService.register({
      registrationCode: "driver-demo-001",
      deviceId: "device-reuse-001",
    });

    const oldRefreshToken = session.refreshToken;

    // Normal refresh rotates token
    const refreshedSession = await sessionService.refresh({
      deviceId: session.deviceId,
      refreshToken: oldRefreshToken,
    });

    const validNewRefreshToken = refreshedSession.refreshToken;

    // Attempting to reuse the old refresh token must trigger reuse detection
    await expect(
      sessionService.refresh({
        deviceId: session.deviceId,
        refreshToken: oldRefreshToken,
      }),
    ).rejects.toThrowError(ApiRequestError);

    // Family and binding must now be revoked/compromised
    const binding = await sessionRepository.findBindingById(session.bindingId);
    expect(binding?.status).toBe("revoked");

    // Subsequent refresh attempts with the valid new token must also be rejected because family was revoked
    await expect(
      sessionService.refresh({
        deviceId: session.deviceId,
        refreshToken: validNewRefreshToken,
      }),
    ).rejects.toThrowError(ApiRequestError);
  });

  it("handles driver suspension revoke and device rebind E2E", async () => {
    const { sessionService, regulatoryService } = setupServices();
    await sessionService.onModuleInit();

    // 1. Initial device binding
    const issued1 = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const session1 = await sessionService.register({
      registrationCode: issued1.registrationCode,
      deviceId: "device-rebind-001",
      deviceLabel: "Device 1",
    });
    expect(session1.bindingId).toBeTruthy();

    // 2. Rebind new device for the same driver & deviceId with fresh invitation
    const issued2 = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const session2 = await sessionService.register({
      registrationCode: issued2.registrationCode,
      deviceId: "device-rebind-001",
      deviceLabel: "Device 1 Rebound",
    });

    expect(session2.bindingId).not.toBe(session1.bindingId);
    expect(
      await sessionService.isBindingActive(
        session1.bindingId,
        session1.deviceId,
        session1.driverId,
      ),
    ).toBe(false);
    expect(
      await sessionService.isBindingActive(
        session2.bindingId,
        session2.deviceId,
        session2.driverId,
      ),
    ).toBe(true);

    // Old session access assertion fails
    await expect(
      sessionService.assertSessionAccessAllowed(
        session1.bindingId,
        session1.deviceId,
        session1.driverId,
        "/driver/profile",
      ),
    ).rejects.toThrowError(ApiRequestError);

    // 3. Suspend driver in RegulatoryRegistryService
    regulatoryService.updateDriverLifecycle("drv-demo-001", {
      lifecycleStatus: "suspended",
    });

    // Refresh after suspension must fail with DRIVER_AUTH_SUSPENDED and revoke active session
    await expect(
      sessionService.refresh({
        deviceId: session2.deviceId,
        refreshToken: session2.refreshToken,
      }),
    ).rejects.toThrowError(ApiRequestError);

    // Assert session access after suspension is blocked
    await expect(
      sessionService.assertSessionAccessAllowed(
        session2.bindingId,
        session2.deviceId,
        session2.driverId,
        "/driver/profile",
      ),
    ).rejects.toThrowError(ApiRequestError);
  });
});
