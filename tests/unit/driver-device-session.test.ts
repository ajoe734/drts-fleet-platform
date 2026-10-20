import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { IdentityRepository } from "../../apps/api/src/modules/identity/identity.repository";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { RegulatoryRegistryRepository } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.repository";
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
  const identityRepository = new IdentityRepository();
  const opsDispatchEventsService = new OpsDispatchEventsService({
    emit: () => {},
  } as any);
  const securityEventsRepository = new SecurityEventsRepository();
  const securityEventsService = new SecurityEventsService(
    securityEventsRepository,
  );
  // Control only the database wire. Read the original initialized fixture rows
  // and actual production master INSERT payloads after lifecycle changes.
  const driverRows = new Map<string, unknown>();
  const regulatoryRepository = new RegulatoryRegistryRepository({
    isEnabled: () => true,
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes("INSERT INTO reg.phase1_registry_drivers"))
        driverRows.set(values[0] as string, JSON.parse(values[5] as string));
      const record = driverRows.get(values[0] as string);
      return {
        rows:
          sql.includes("SELECT record FROM reg.phase1_registry_drivers") &&
          record
            ? [{ record: structuredClone(record) }]
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
    jwtAuthService,
    identityRepository,
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
    await regulatoryService.updateDriverLifecycle("drv-demo-001", {
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

  it("revokes prior active device binding, refresh family, and canonical JWT session when replacing with a different device for the same driver", async () => {
    const {
      sessionService,
      sessionRepository,
      jwtAuthService,
      identityRepository,
      driverProfileService,
      regulatoryService,
      securityEventsService,
    } = setupServices();
    await sessionService.onModuleInit();

    const inviteA = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const sessionA = await sessionService.register({
      registrationCode: inviteA.registrationCode,
      deviceId: "device-replace-old-a",
      deviceLabel: "Old Phone A",
    });

    const inviteB = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const sessionB = await sessionService.register({
      registrationCode: inviteB.registrationCode,
      deviceId: "device-replace-new-b",
      deviceLabel: "New Phone B",
    });

    expect(
      await sessionService.isBindingActive(
        sessionA.bindingId,
        sessionA.deviceId,
        sessionA.driverId,
      ),
    ).toBe(false);
    expect(
      await sessionService.isBindingActive(
        sessionB.bindingId,
        sessionB.deviceId,
        sessionB.driverId,
      ),
    ).toBe(true);

    // Prior refresh token and access token for device A must be rejected
    await expect(
      sessionService.refresh({
        deviceId: sessionA.deviceId,
        refreshToken: sessionA.refreshToken,
      }),
    ).rejects.toMatchObject({ code: "DRIVER_DEVICE_REFRESH_INVALID" });

    expect(
      await jwtAuthService.verifyAccessToken(sessionA.accessToken),
    ).toBeNull();
    expect(
      (await identityRepository.getSession(sessionA.bindingId))?.status,
    ).toBe("revoked");

    // Replacement device B remains active across simulated restart
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
        sessionA.bindingId,
        sessionA.deviceId,
        sessionA.driverId,
      ),
    ).toBe(false);
    expect(
      await restartedService.isBindingActive(
        sessionB.bindingId,
        sessionB.deviceId,
        sessionB.driverId,
      ),
    ).toBe(true);

    const refreshedB = await restartedService.refresh({
      deviceId: sessionB.deviceId,
      refreshToken: sessionB.refreshToken,
    });
    expect(refreshedB.bindingId).toBe(sessionB.bindingId);
    expect(
      await jwtAuthService.verifyAccessToken(refreshedB.accessToken),
    ).toMatchObject({
      sub: "drv-demo-001",
      sid: sessionB.bindingId,
      driverDeviceId: "device-replace-new-b",
    });
  });

  it("serializes concurrent replacement device registrations for the same driver so only one binding, refresh family, and canonical session remain active", async () => {
    const {
      sessionService,
      sessionRepository,
      jwtAuthService,
      identityRepository,
    } = setupServices();
    await sessionService.onModuleInit();

    const [invite1, invite2] = await Promise.all([
      sessionService.issueRegistrationInvitation({ driverId: "drv-demo-001" }),
      sessionService.issueRegistrationInvitation({ driverId: "drv-demo-001" }),
    ]);

    const [reg1, reg2] = await Promise.all([
      sessionService.register({
        registrationCode: invite1.registrationCode,
        deviceId: "device-concurrent-a",
      }),
      sessionService.register({
        registrationCode: invite2.registrationCode,
        deviceId: "device-concurrent-b",
      }),
    ]);

    const activeBindings =
      await sessionRepository.findActiveBindingsByDriverId("drv-demo-001");
    expect(activeBindings).toHaveLength(1);

    const winner =
      activeBindings[0]?.bindingId === reg1.bindingId ? reg1 : reg2;
    const superseded = winner.bindingId === reg1.bindingId ? reg2 : reg1;

    expect(
      await sessionService.isBindingActive(
        winner.bindingId,
        winner.deviceId,
        winner.driverId,
      ),
    ).toBe(true);
    expect(
      await sessionService.isBindingActive(
        superseded.bindingId,
        superseded.deviceId,
        superseded.driverId,
      ),
    ).toBe(false);

    await expect(
      sessionService.refresh({
        deviceId: superseded.deviceId,
        refreshToken: superseded.refreshToken,
      }),
    ).rejects.toMatchObject({ code: "DRIVER_DEVICE_REFRESH_INVALID" });

    expect(
      await jwtAuthService.verifyAccessToken(superseded.accessToken),
    ).toBeNull();
    expect(
      (await identityRepository.getSession(superseded.bindingId))?.status,
    ).toBe("revoked");

    expect(
      await jwtAuthService.verifyAccessToken(winner.accessToken),
    ).toMatchObject({
      sub: "drv-demo-001",
      sid: winner.bindingId,
    });
  });

  it("executes SQL transactional advisory and FOR UPDATE locks even when DATABASE_POOL_MAX=1", async () => {
    const previousPoolMax = process.env.DATABASE_POOL_MAX;
    process.env.DATABASE_POOL_MAX = "1";
    try {
      const executedStatements: string[] = [];
      let released = false;
      const repository = new DriverDeviceSessionRepository({
        isEnabled: () => true,
        connect: async () => ({
          query: async (sql: string) => {
            executedStatements.push(sql.trim());
            return { rows: [] };
          },
          release: () => {
            released = true;
          },
        }),
      } as never);

      await repository.withRegistrationLock(
        { regCodeHash: "hash-pool1", deviceId: "device-pool1" },
        async () => {
          await repository.lockDriverRegistrationScope("drv-demo-001");
          await repository.findActiveBindingsByDriverId("drv-demo-001");
        },
      );

      expect(executedStatements[0]).toBe("BEGIN");
      expect(
        executedStatements.some((sql) =>
          sql.includes("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))"),
        ),
      ).toBe(true);
      expect(
        executedStatements.some(
          (sql) =>
            sql.includes("FROM iam.driver_device_bindings") &&
            sql.includes("FOR UPDATE"),
        ),
      ).toBe(true);
      expect(executedStatements.at(-1)).toBe("COMMIT");
      expect(released).toBe(true);
    } finally {
      if (previousPoolMax === undefined) {
        delete process.env.DATABASE_POOL_MAX;
      } else {
        process.env.DATABASE_POOL_MAX = previousPoolMax;
      }
    }
  });
});
