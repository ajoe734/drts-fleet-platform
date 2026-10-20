import type { Pool, PoolClient, QueryResult } from "pg";
import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../apps/api/src/common/api-envelope";
import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { DatabaseService } from "../../apps/api/src/common/db/database.service";
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

  it("executes SQL transactional advisory, FOR UPDATE, and nested IdentityRepository savepoints on one pooled client via DatabaseService.withTransaction when DATABASE_POOL_MAX=1", async () => {
    const previousPoolMax = process.env.DATABASE_POOL_MAX;
    process.env.DATABASE_POOL_MAX = "1";
    try {
      const executedStatements: string[] = [];
      let tracking = false;
      let activeCheckouts = 0;
      let totalCheckouts = 0;
      let released = false;

      const fakePool: Pick<Pool, "query" | "connect" | "end"> = {
        query: async () => {
          if (tracking) {
            throw new Error(
              "pool.query must not bypass ambient transaction client",
            );
          }
          return { rows: [] } as unknown as QueryResult;
        },
        connect: async () => {
          if (tracking) {
            if (activeCheckouts >= 1) {
              throw new Error(
                "Second connection checkout violates DATABASE_POOL_MAX=1 single-client transaction authority",
              );
            }
            activeCheckouts += 1;
            totalCheckouts += 1;
          }
          return {
            query: async (sql: string) => {
              const trimmed = sql.trim();
              if (tracking) {
                executedStatements.push(trimmed);
              }
              if (trimmed.startsWith("UPDATE iam.identity_sessions")) {
                return {
                  command: "UPDATE",
                  rowCount: 1,
                  oid: 0,
                  fields: [],
                  rows: [
                    {
                      session_id: "drvbind-old-a",
                      source_ref: "driver_device:drvbind-old-a",
                      principal_id: "drv-demo-001",
                      membership_id: "drv_mem_drv-demo-001",
                      realm: "driver",
                      status: "revoked",
                      auth_time: "2026-10-20T00:00:00.000Z",
                      auth_methods: ["driver_device_registration"],
                      token_version: 1,
                      idle_expires_at: "2026-10-21T00:00:00.000Z",
                      absolute_expires_at: "2026-11-20T00:00:00.000Z",
                      revoked_at: "2026-10-20T01:00:00.000Z",
                      revoked_by_principal_id: null,
                      revoke_reason: "DEVICE_REBOUND",
                      device_summary: {},
                      risk_summary: {},
                      created_at: "2026-10-20T00:00:00.000Z",
                      updated_at: "2026-10-20T01:00:00.000Z",
                      record: {
                        sessionId: "drvbind-old-a",
                        sourceRef: "driver_device:drvbind-old-a",
                        principalId: "drv-demo-001",
                        membershipId: "drv_mem_drv-demo-001",
                        realm: "driver",
                        status: "revoked",
                        authTime: "2026-10-20T00:00:00.000Z",
                        authMethods: ["driver_device_registration"],
                        tokenVersion: 1,
                        idleExpiresAt: "2026-10-21T00:00:00.000Z",
                        absoluteExpiresAt: "2026-11-20T00:00:00.000Z",
                        revokedAt: "2026-10-20T01:00:00.000Z",
                        revokedByPrincipalId: null,
                        revokeReason: "DEVICE_REBOUND",
                        createdAt: "2026-10-20T00:00:00.000Z",
                        updatedAt: "2026-10-20T01:00:00.000Z",
                      },
                    },
                  ],
                } as unknown as QueryResult;
              }
              return {
                command: "SELECT",
                rowCount: 0,
                oid: 0,
                fields: [],
                rows: [],
              } as unknown as QueryResult;
            },
            release: () => {
              if (tracking) {
                activeCheckouts -= 1;
                released = true;
              }
            },
          } as unknown as PoolClient;
        },
        end: async () => undefined,
      };

      const db = new DatabaseService(fakePool as Pool);
      const repository = new DriverDeviceSessionRepository(db);
      const identityRepo = new IdentityRepository(db);
      await new Promise((resolve) => setTimeout(resolve, 10));
      tracking = true;

      await repository.withRegistrationLock(
        { regCodeHash: "hash-pool1", deviceId: "device-pool1" },
        async () => {
          await repository.lockDriverRegistrationScope("drv-demo-001");
          await repository.findActiveBindingsByDriverId("drv-demo-001");
          await identityRepo.revokeSession("drvbind-old-a", "DEVICE_REBOUND");
        },
      );

      expect(totalCheckouts).toBe(1);
      expect(activeCheckouts).toBe(0);
      expect(released).toBe(true);
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
      expect(executedStatements).toContain("SAVEPOINT sp_1");
      expect(executedStatements).toContain("RELEASE SAVEPOINT sp_1");
      expect(executedStatements.at(-1)).toBe("COMMIT");
    } finally {
      if (previousPoolMax === undefined) {
        delete process.env.DATABASE_POOL_MAX;
      } else {
        process.env.DATABASE_POOL_MAX = previousPoolMax;
      }
    }
  });

  it("rolls back both SQL transaction (including nested IdentityRepository.revokeSession savepoint) and in-memory state if registration fails after revoking prior device", async () => {
    const {
      sessionService,
      sessionRepository,
      jwtAuthService,
      identityRepository,
    } = setupServices();
    await sessionService.onModuleInit();

    const inviteA = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });
    const sessionA = await sessionService.register({
      registrationCode: inviteA.registrationCode,
      deviceId: "device-rollback-old-a",
      deviceLabel: "Old Phone A",
    });

    const inviteB = await sessionService.issueRegistrationInvitation({
      driverId: "drv-demo-001",
    });

    const originalSaveRefreshFamily =
      sessionRepository.saveRefreshFamily.bind(sessionRepository);
    let failNextNewFamily = false;
    sessionRepository.saveRefreshFamily = async (record) => {
      if (failNextNewFamily && record.bindingId !== sessionA.bindingId) {
        throw new Error("simulated refresh family persistence failure");
      }
      return originalSaveRefreshFamily(record);
    };
    failNextNewFamily = true;

    await expect(
      sessionService.register({
        registrationCode: inviteB.registrationCode,
        deviceId: "device-rollback-new-b",
        deviceLabel: "New Phone B",
      }),
    ).rejects.toThrow("simulated refresh family persistence failure");

    failNextNewFamily = false;
    sessionRepository.saveRefreshFamily = originalSaveRefreshFamily;

    // In-memory state for device A is restored on rollback
    expect(
      await sessionService.isBindingActive(
        sessionA.bindingId,
        sessionA.deviceId,
        sessionA.driverId,
      ),
    ).toBe(true);
    expect(
      (
        await sessionRepository.findActiveBindingsByDriverId("drv-demo-001")
      ).map((b) => b.bindingId),
    ).toContain(sessionA.bindingId);

    // Also verify SQL-level rollback on a single pooled connection when nested revokeSession savepoint already ran
    const executedStatements: string[] = [];
    const fakePool: Pick<Pool, "query" | "connect" | "end"> = {
      query: async () => ({ rows: [] }) as unknown as QueryResult,
      connect: async () =>
        ({
          query: async (sql: string) => {
            const trimmed = sql.trim();
            executedStatements.push(trimmed);
            if (trimmed.startsWith("UPDATE iam.identity_sessions")) {
              return {
                rows: [
                  {
                    session_id: sessionA.bindingId,
                    source_ref: `driver_device:${sessionA.bindingId}`,
                    principal_id: "drv-demo-001",
                    membership_id: "drv_mem_drv-demo-001",
                    realm: "driver",
                    status: "revoked",
                    auth_time: "2026-10-20T00:00:00.000Z",
                    auth_methods: ["driver_device_registration"],
                    token_version: 1,
                    idle_expires_at: "2026-10-21T00:00:00.000Z",
                    absolute_expires_at: "2026-11-20T00:00:00.000Z",
                    revoked_at: "2026-10-20T01:00:00.000Z",
                    revoked_by_principal_id: null,
                    revoke_reason: "DEVICE_REBOUND",
                    device_summary: {},
                    risk_summary: {},
                    created_at: "2026-10-20T00:00:00.000Z",
                    updated_at: "2026-10-20T01:00:00.000Z",
                    record: {
                      sessionId: sessionA.bindingId,
                      sourceRef: `driver_device:${sessionA.bindingId}`,
                      principalId: "drv-demo-001",
                      membershipId: "drv_mem_drv-demo-001",
                      realm: "driver",
                      status: "revoked",
                      authTime: "2026-10-20T00:00:00.000Z",
                      authMethods: ["driver_device_registration"],
                      tokenVersion: 1,
                      idleExpiresAt: "2026-10-21T00:00:00.000Z",
                      absoluteExpiresAt: "2026-11-20T00:00:00.000Z",
                      revokedAt: "2026-10-20T01:00:00.000Z",
                      revokedByPrincipalId: null,
                      revokeReason: "DEVICE_REBOUND",
                      createdAt: "2026-10-20T00:00:00.000Z",
                      updatedAt: "2026-10-20T01:00:00.000Z",
                    },
                  },
                ],
              } as unknown as QueryResult;
            }
            return { rows: [] } as unknown as QueryResult;
          },
          release: () => undefined,
        }) as unknown as PoolClient,
      end: async () => undefined,
    };

    const db = new DatabaseService(fakePool as Pool);
    const sqlAuthRepo = new DriverDeviceSessionRepository(db);
    const sqlIdentityRepo = new IdentityRepository(db);
    await new Promise((resolve) => setTimeout(resolve, 10));
    executedStatements.length = 0;

    await expect(
      sqlAuthRepo.withRegistrationLock(
        { regCodeHash: "hash-rollback", deviceId: "device-rollback-new-b" },
        async () => {
          await sqlIdentityRepo.revokeSession(
            sessionA.bindingId,
            "DEVICE_REBOUND",
          );
          throw new Error("downstream registration failure");
        },
      ),
    ).rejects.toThrow("downstream registration failure");

    expect(executedStatements[0]).toBe("BEGIN");
    expect(executedStatements).toContain("SAVEPOINT sp_1");
    expect(executedStatements).toContain("RELEASE SAVEPOINT sp_1");
    expect(executedStatements.at(-1)).toBe("ROLLBACK");
    expect(jwtAuthService).toBeDefined();
    expect(identityRepository).toBeDefined();
  });
});
