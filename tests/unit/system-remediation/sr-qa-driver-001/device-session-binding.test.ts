// SR-QA-DRIVER-001 -- C050 (換機／遺失裝置司機: bind/unbind/recover).
//
// `tests/unit/driver-device-session.test.ts` (IAM-DRV-001) covers
// register+restart survival, single-use registration codes, refresh
// rotation, refresh-reuse detection, and suspend-then-rebind. This file (a)
// runs one more full register->isBindingActive->revoke->isBindingActive
// cycle directly against the real service for independent regression
// confirmation with read-back through `isBindingActive` (a live read, not
// the write call's own return value), and (b) verifies the "跨裝置"
// (multi-device replacement) half of C050: registering a second, distinct
// device for the same driver revokes the prior device's binding, refresh
// token family, and canonical JWT session while leaving the replacement
// device active and usable.
//
// Real-device single-device enforcement, revocation push delivery, and
// offline-resume on a physical handset are out of scope for this VM (see
// SR-LIVE-DRIVER-001).

import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { JwtAuthService } from "../../../../apps/api/src/common/auth/jwt-auth.service";
import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverDeviceSessionRepository } from "../../../../apps/api/src/modules/auth/driver-device-session.repository";
import { DriverDeviceSessionService } from "../../../../apps/api/src/modules/auth/driver-device-session.service";
import { DriverProfileService } from "../../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { IdentityRepository } from "../../../../apps/api/src/modules/identity/identity.repository";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryRepository } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { SecurityEventsRepository } from "../../../../apps/api/src/modules/security-events/security-events.repository";
import { SecurityEventsService } from "../../../../apps/api/src/modules/security-events/security-events.service";

process.env.JWT_SECRET =
  "sr_qa_driver_001_test_jwt_secret_key_32chars_minimum_len!";

function setupServices() {
  const auditService = new AuditNotificationService();
  const driverProfileService = new DriverProfileService(auditService);
  const identityRepository = new IdentityRepository();
  const opsDispatchEventsService = new OpsDispatchEventsService({
    emit: () => {},
  } as never);
  const securityEventsService = new SecurityEventsService(
    new SecurityEventsRepository(),
  );
  const driverRows = new Map<string, unknown>();
  const regulatoryRepository = new RegulatoryRegistryRepository({
    isEnabled: () => true,
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("INSERT INTO reg.phase1_registry_drivers"))
        driverRows.set(values[0] as string, JSON.parse(values[5] as string));
      const driver = driverRows.get(values[0] as string);
      return {
        rows:
          sql.includes("SELECT record FROM reg.phase1_registry_drivers") &&
          driver
            ? [{ record: structuredClone(driver) }]
            : [],
      };
    },
  } as never);
  const regulatoryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditService,
    driverProfileService,
    regulatoryRepository,
  );
  for (const driver of regulatoryService.listDrivers())
    driverRows.set(driver.driverId, structuredClone(driver));
  const jwtAuthService = new JwtAuthService(
    identityRepository,
    undefined,
    regulatoryService,
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
    sessionService,
    sessionRepository,
    jwtAuthService,
    identityRepository,
    driverProfileService,
    regulatoryService,
  };
}

function driverIdentityFor(driverId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: driverId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver"],
    scopes: ["driver:write"],
    requestId: null,
  };
}

describe("SR-QA-DRIVER-001 C050: device binding lifecycle", () => {
  it("registers a device, the binding is readable back as active, then a manual revoke is readable back as inactive", async () => {
    const { sessionService } = setupServices();
    await sessionService.onModuleInit();

    const issued = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const session = await sessionService.register({
      registrationCode: issued.registrationCode,
      deviceId: "qa-device-001",
      deviceLabel: "QA Phone",
    });

    expect(
      await sessionService.isBindingActive(
        session.bindingId,
        session.deviceId,
        session.driverId,
      ),
    ).toBe(true);

    await sessionService.revoke(
      { bindingId: session.bindingId, deviceId: session.deviceId },
      driverIdentityFor(session.driverId),
    );

    expect(
      await sessionService.isBindingActive(
        session.bindingId,
        session.deviceId,
        session.driverId,
      ),
    ).toBe(false);
  });

  it("rejects a revoke request with no caller identity (DRIVER_DEVICE_BINDING_FORBIDDEN) and leaves the binding active", async () => {
    const { sessionService } = setupServices();
    await sessionService.onModuleInit();

    const issued = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const session = await sessionService.register({
      registrationCode: issued.registrationCode,
      deviceId: "qa-device-005",
    });

    await expect(
      sessionService.revoke({
        bindingId: session.bindingId,
        deviceId: session.deviceId,
      }),
    ).rejects.toMatchObject({ code: "DRIVER_DEVICE_BINDING_FORBIDDEN" });

    expect(
      await sessionService.isBindingActive(
        session.bindingId,
        session.deviceId,
        session.driverId,
      ),
    ).toBe(true);
  });

  it("rejects a revoke request from a different driver's identity (DRIVER_DEVICE_BINDING_FORBIDDEN) and leaves the binding active", async () => {
    const { sessionService } = setupServices();
    await sessionService.onModuleInit();

    const issued = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const session = await sessionService.register({
      registrationCode: issued.registrationCode,
      deviceId: "qa-device-006",
    });

    await expect(
      sessionService.revoke(
        { bindingId: session.bindingId, deviceId: session.deviceId },
        driverIdentityFor("drv-someone-else"),
      ),
    ).rejects.toMatchObject({ code: "DRIVER_DEVICE_BINDING_FORBIDDEN" });

    expect(
      await sessionService.isBindingActive(
        session.bindingId,
        session.deviceId,
        session.driverId,
      ),
    ).toBe(true);
  });

  it("rejects registration with an invalid/already-used registration code (DRIVER_REGISTRATION_INVALID)", async () => {
    const { sessionService } = setupServices();
    await sessionService.onModuleInit();

    await expect(
      sessionService.register({
        registrationCode: "definitely-not-a-real-code",
        deviceId: "qa-device-002",
      }),
    ).rejects.toMatchObject({ code: "DRIVER_REGISTRATION_INVALID" });
  });

  it("re-registering the SAME device id rebinds and revokes the prior binding for that device", async () => {
    const { sessionService } = setupServices();
    await sessionService.onModuleInit();

    const firstInvite = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const firstSession = await sessionService.register({
      registrationCode: firstInvite.registrationCode,
      deviceId: "qa-device-003",
    });

    const secondInvite = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const secondSession = await sessionService.register({
      registrationCode: secondInvite.registrationCode,
      deviceId: "qa-device-003", // same physical device re-registering
    });

    expect(
      await sessionService.isBindingActive(
        firstSession.bindingId,
        firstSession.deviceId,
        firstSession.driverId,
      ),
    ).toBe(false);
    expect(
      await sessionService.isBindingActive(
        secondSession.bindingId,
        secondSession.deviceId,
        secondSession.driverId,
      ),
    ).toBe(true);
  });

  it("registering a second, DIFFERENT device for the same driver revokes the first device's binding, refresh family, and canonical JWT session while the replacement device stays usable", async () => {
    const {
      sessionService,
      sessionRepository,
      jwtAuthService,
      identityRepository,
      driverProfileService,
    } = setupServices();
    await sessionService.onModuleInit();

    const otherDriverInvite = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-002",
    });
    const otherDriverDevice = await sessionService.register({
      registrationCode: otherDriverInvite.registrationCode,
      deviceId: "qa-device-other-driver",
    });

    const inviteA = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const deviceA = await sessionService.register({
      registrationCode: inviteA.registrationCode,
      deviceId: "qa-device-phone-a",
      deviceLabel: "Old Handset A",
    });

    expect(
      await jwtAuthService.verifyAccessToken(deviceA.accessToken),
    ).toMatchObject({
      sub: "drv-demo-001",
      sid: deviceA.bindingId,
      driverBindingId: deviceA.bindingId,
      driverDeviceId: "qa-device-phone-a",
    });

    const inviteB = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const deviceB = await sessionService.register({
      registrationCode: inviteB.registrationCode,
      deviceId: "qa-device-phone-b",
      deviceLabel: "Replacement Handset B",
    });

    const deviceAStillActive = await sessionService.isBindingActive(
      deviceA.bindingId,
      deviceA.deviceId,
      deviceA.driverId,
    );
    const deviceBActive = await sessionService.isBindingActive(
      deviceB.bindingId,
      deviceB.deviceId,
      deviceB.driverId,
    );

    expect(deviceAStillActive).toBe(false);
    expect(deviceBActive).toBe(true);

    // Persisted binding and refresh family for device A are revoked
    const persistedBindingA = await sessionRepository.findBindingById(
      deviceA.bindingId,
    );
    const persistedBindingB = await sessionRepository.findBindingById(
      deviceB.bindingId,
    );
    expect(persistedBindingA?.status).toBe("revoked");
    expect(persistedBindingA?.revokedAt).toBeTruthy();
    expect(persistedBindingB?.status).toBe("active");
    expect(persistedBindingB?.reboundFromBindingId).toBe(deviceA.bindingId);

    expect(
      await sessionRepository.findActiveRefreshFamilyByBindingId(
        deviceA.bindingId,
      ),
    ).toBeNull();
    expect(
      await sessionRepository.findActiveRefreshFamilyByBindingId(
        deviceB.bindingId,
      ),
    ).toMatchObject({
      bindingId: deviceB.bindingId,
      status: "active",
    });

    // Device A cannot refresh or pass session access guard
    await expect(
      sessionService.refresh({
        deviceId: deviceA.deviceId,
        refreshToken: deviceA.refreshToken,
      }),
    ).rejects.toMatchObject({ code: "DRIVER_DEVICE_REFRESH_INVALID" });

    await expect(
      sessionService.assertSessionAccessAllowed(
        deviceA.bindingId,
        deviceA.deviceId,
        deviceA.driverId,
        "/driver/jobs",
      ),
    ).rejects.toMatchObject({ code: "DRIVER_DEVICE_SESSION_INVALID" });

    // Canonical JWT session for device A is revoked with DEVICE_REBOUND
    const canonicalSessionA = await identityRepository.getSession(
      deviceA.bindingId,
    );
    expect(canonicalSessionA?.status).toBe("revoked");
    expect(canonicalSessionA?.revokeReason).toBe("DEVICE_REBOUND");
    expect(
      await jwtAuthService.verifyAccessToken(deviceA.accessToken),
    ).toBeNull();

    // Replacement device B remains active, verifiable, and refreshable
    await expect(
      sessionService.assertSessionAccessAllowed(
        deviceB.bindingId,
        deviceB.deviceId,
        deviceB.driverId,
        "/driver/jobs",
      ),
    ).resolves.toBeUndefined();
    expect(
      await jwtAuthService.verifyAccessToken(deviceB.accessToken),
    ).toMatchObject({
      sub: "drv-demo-001",
      sid: deviceB.bindingId,
      driverBindingId: deviceB.bindingId,
      driverDeviceId: "qa-device-phone-b",
    });

    const refreshedB = await sessionService.refresh({
      deviceId: deviceB.deviceId,
      refreshToken: deviceB.refreshToken,
    });
    expect(refreshedB.bindingId).toBe(deviceB.bindingId);
    expect(refreshedB.refreshToken).not.toBe(deviceB.refreshToken);

    // Embedded driver profile binding summary stays synchronized
    const profile = driverProfileService.getProfile("drv-demo-001");
    expect(
      profile.deviceBindings.find((b) => b.bindingId === deviceA.bindingId)
        ?.status,
    ).toBe("revoked");
    expect(
      profile.deviceBindings.find((b) => b.bindingId === deviceB.bindingId)
        ?.status,
    ).toBe("active");

    // Unrelated driver's device binding remains untouched
    expect(
      await sessionService.isBindingActive(
        otherDriverDevice.bindingId,
        otherDriverDevice.deviceId,
        otherDriverDevice.driverId,
      ),
    ).toBe(true);
  });

  it("blocks a driver who is ALREADY suspended from ever registering a device (DRIVER_AUTH_SUSPENDED) -- distinct from the existing IAM-DRV-001 case, which suspends *after* an initial successful registration", async () => {
    const { sessionService, regulatoryService } = setupServices();
    await sessionService.onModuleInit();

    await regulatoryService.updateDriverLifecycle("drv-demo-002", {
      lifecycleStatus: "suspended",
    });

    const invite = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-002",
    });

    await expect(
      sessionService.register({
        registrationCode: invite.registrationCode,
        deviceId: "qa-device-004",
      }),
    ).rejects.toMatchObject({ code: "DRIVER_AUTH_SUSPENDED" });
  });
});
