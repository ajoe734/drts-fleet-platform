import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { OpsDispatchEventsService } from "../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryRepository } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { SecurityEventsRepository } from "../../apps/api/src/modules/security-events/security-events.repository";
import { SecurityEventsService } from "../../apps/api/src/modules/security-events/security-events.service";
import { DriverDeviceSessionRepository } from "../../apps/api/src/modules/auth/driver-device-session.repository";
import { DriverDeviceSessionService } from "../../apps/api/src/modules/auth/driver-device-session.service";

process.env.JWT_SECRET =
  "test_integration_jwt_secret_key_32chars_long_minimum!";

describe("Driver Device Session Integration (IAM-DRV-001)", () => {
  it("integrates driver registration, rotation, revocation and security audit logging", async () => {
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

    await sessionService.onModuleInit();

    // Issue invitation
    const invitation = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });

    // 1. Register
    const session = await sessionService.register({
      registrationCode: invitation.registrationCode,
      deviceId: "integ-device-001",
      deviceLabel: "Integration Test Device",
    });

    expect(session.driverId).toBe("drv-demo-001");
    expect(session.deviceId).toBe("integ-device-001");
    expect(session.tokenType).toBe("Bearer");

    // 2. Refresh rotation
    const refreshedSession = await sessionService.refresh({
      deviceId: session.deviceId,
      refreshToken: session.refreshToken,
    });

    expect(refreshedSession.refreshToken).not.toBe(session.refreshToken);

    // 3. Revoke
    const revoked = await sessionService.revoke(
      {
        bindingId: session.bindingId,
        deviceId: session.deviceId,
      },
      {
        authMode: "jwt_bearer",
        actorType: "driver_user",
        actorId: "drv-demo-001",
        realm: "driver",
        tenantId: null,
        roleFamilies: ["driver"],
        roles: ["driver_user"],
        scopes: ["driver:write"],
        requestId: null,
      },
    );

    expect(revoked.revokedAt).toBeTruthy();

    // 4. Confirm revoked access fails
    await expect(
      sessionService.assertSessionAccessAllowed(
        session.bindingId,
        session.deviceId,
        session.driverId,
        "/driver/profile",
      ),
    ).rejects.toThrowError(ApiRequestError);
  });
});
