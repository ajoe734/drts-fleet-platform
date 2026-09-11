// SR-QA-DRIVER-001 -- C050 (換機／遺失裝置司機: bind/unbind/recover).
//
// `tests/unit/driver-device-session.test.ts` (IAM-DRV-001) already covers
// register+restart survival, single-use registration codes, refresh
// rotation, refresh-reuse detection, and suspend-then-rebind. This file (a)
// runs one more full register->isBindingActive->revoke->isBindingActive
// cycle directly against the real service for independent regression
// confirmation with read-back through `isBindingActive` (a live read, not
// the write call's own return value), and (b) tests the "跨裝置" (multi
// -device) half of C050's stated acceptance gap, which grep confirms is not
// exercised by the existing IAM-DRV-001 suite: does registering a *second*
// device for the same driver revoke the first? Reading
// apps/api/src/modules/auth/driver-device-session.service.ts confirms
// `activeBindingIdsByDeviceId` is keyed only by deviceId
// (driver-device-session.service.ts:49) and `revokeActiveBindingForDevice`
// is only invoked when re-registering the *same* deviceId
// (driver-device-session.service.ts:220-222) -- there is no
// driver-scoped index anywhere in the file, so a second distinct device can
// bind the same driver while the first stays "active". This is recorded
// here as a confirmed current-behaviour finding (not asserted as desired
// behaviour), and reported separately as a sourced follow-up task rather
// than silently patched in this verification-only task.
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
import { RegulatoryRegistryRepository } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { SecurityEventsRepository } from "../../../../apps/api/src/modules/security-events/security-events.repository";
import { SecurityEventsService } from "../../../../apps/api/src/modules/security-events/security-events.service";

process.env.JWT_SECRET =
  "sr_qa_driver_001_test_jwt_secret_key_32chars_minimum_len!";

function setupServices() {
  const auditService = new AuditNotificationService();
  const driverProfileService = new DriverProfileService(auditService);
  const jwtAuthService = new JwtAuthService();
  const opsDispatchEventsService = new OpsDispatchEventsService({
    emit: () => {},
  } as never);
  const securityEventsService = new SecurityEventsService(
    new SecurityEventsRepository(),
  );
  const regulatoryService = new RegulatoryRegistryService(
    opsDispatchEventsService,
    auditService,
    driverProfileService,
    new RegulatoryRegistryRepository(),
  );
  const sessionService = new DriverDeviceSessionService(
    jwtAuthService,
    driverProfileService,
    new DriverDeviceSessionRepository(),
    regulatoryService,
    securityEventsService,
  );

  return { sessionService, driverProfileService, regulatoryService };
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
      { bindingId: session.bindingId },
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
      sessionService.revoke({ bindingId: session.bindingId }),
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
        { bindingId: session.bindingId },
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

  it("CURRENT-BEHAVIOUR FINDING: registering a second, DIFFERENT device for the same driver leaves the first device's binding active too -- no single-device-per-driver enforcement exists in DriverDeviceSessionService today (see file-header note; reported as a follow-up task, not fixed here)", async () => {
    const { sessionService } = setupServices();
    await sessionService.onModuleInit();

    const inviteA = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const deviceA = await sessionService.register({
      registrationCode: inviteA.registrationCode,
      deviceId: "qa-device-phone-a",
    });

    const inviteB = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const deviceB = await sessionService.register({
      registrationCode: inviteB.registrationCode,
      deviceId: "qa-device-phone-b",
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

    // This documents the CURRENT gap: both remain true. If a future fix adds
    // single-device enforcement, this assertion should start failing and
    // must be updated to `.toBe(false)` for deviceAStillActive -- do not
    // silently keep this test green by loosening it further.
    expect(deviceBActive).toBe(true);
    expect(deviceAStillActive).toBe(true);
  });

  it("blocks a driver who is ALREADY suspended from ever registering a device (DRIVER_AUTH_SUSPENDED) -- distinct from the existing IAM-DRV-001 case, which suspends *after* an initial successful registration", async () => {
    const { sessionService, regulatoryService } = setupServices();
    await sessionService.onModuleInit();

    regulatoryService.updateDriverLifecycle("drv-demo-002", {
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
