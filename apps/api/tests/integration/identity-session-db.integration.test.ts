import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type {
  CanonicalIdentitySessionRecord,
  CanonicalRefreshFamilyRecord,
} from "@drts/contracts";

import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import { DatabaseService } from "../../src/common/db";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { DriverDeviceSessionRepository } from "../../src/modules/auth/driver-device-session.repository";
import { DriverDeviceSessionService } from "../../src/modules/auth/driver-device-session.service";
import { DriverProfileRepository } from "../../src/modules/driver-profile/driver-profile.repository";
import { DriverProfileService } from "../../src/modules/driver-profile/driver-profile.service";
import {
  hashIdentitySecret,
  IdentityRepository,
} from "../../src/modules/identity/identity.repository";

const DATABASE_URL = process.env.DATABASE_URL;
process.env.JWT_SECRET ??= "pg_integration_jwt_secret_key_32chars_minimum_len!";

async function deleteSessionTestData(
  database: DatabaseService,
  sessionIds: string[],
  principalIds: string[],
  driverIds: string[],
) {
  if (driverIds.length > 0) {
    await database.query(
      `DELETE FROM iam.driver_refresh_families WHERE driver_id = ANY($1::text[])`,
      [driverIds],
    );
    await database.query(
      `DELETE FROM iam.driver_device_bindings WHERE driver_id = ANY($1::text[])`,
      [driverIds],
    );
    await database.query(
      `DELETE FROM iam.driver_device_invitations WHERE driver_id = ANY($1::text[])`,
      [driverIds],
    );
    await database.query(
      `DELETE FROM ops.phase1_driver_profiles WHERE driver_id = ANY($1::text[])`,
      [driverIds],
    );
  }
  if (sessionIds.length > 0) {
    await database.query(
      `DELETE FROM iam.identity_refresh_families WHERE session_id = ANY($1::text[])`,
      [sessionIds],
    );
    await database.query(
      `DELETE FROM iam.identity_sessions WHERE session_id = ANY($1::text[])`,
      [sessionIds],
    );
  }
  const allPrincipalIds = Array.from(new Set([...principalIds, ...driverIds]));
  if (allPrincipalIds.length > 0) {
    await database.query(
      `
        DELETE FROM iam.identity_refresh_families
        WHERE session_id IN (
          SELECT session_id FROM iam.identity_sessions WHERE principal_id = ANY($1::text[])
        )
      `,
      [allPrincipalIds],
    );
    await database.query(
      `DELETE FROM iam.identity_sessions WHERE principal_id = ANY($1::text[])`,
      [allPrincipalIds],
    );
    await database.query(
      `DELETE FROM iam.identity_principals WHERE principal_id = ANY($1::text[])`,
      [allPrincipalIds],
    );
  }
}

describe("Identity Session and Refresh Family Postgres Integration", () => {
  const databases: DatabaseService[] = [];
  const createdSessionIds = new Set<string>();
  const createdPrincipalIds = new Set<string>();
  const createdDriverIds = new Set<string>();

  afterEach(async () => {
    if (
      DATABASE_URL &&
      (createdSessionIds.size > 0 ||
        createdPrincipalIds.size > 0 ||
        createdDriverIds.size > 0)
    ) {
      const cleanupDb = new DatabaseService();
      try {
        await deleteSessionTestData(
          cleanupDb,
          Array.from(createdSessionIds),
          Array.from(createdPrincipalIds),
          Array.from(createdDriverIds),
        );
      } finally {
        createdSessionIds.clear();
        createdPrincipalIds.clear();
        createdDriverIds.clear();
        await cleanupDb.onModuleDestroy();
      }
    }

    for (const db of databases.splice(0)) {
      await db.onModuleDestroy();
    }
  });

  it("requires DATABASE_URL for Postgres integration tests", () => {
    expect(DATABASE_URL).toBeTruthy();
  });

  it("verifies iam.identity_sessions and iam.identity_refresh_families migration tables exist", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const db = new DatabaseService();
    databases.push(db);

    const result = await db.query<{
      sessions_table: string | null;
      families_table: string | null;
    }>(
      `
        SELECT
          to_regclass('iam.identity_sessions')::text AS sessions_table,
          to_regclass('iam.identity_refresh_families')::text AS families_table
      `,
    );

    expect(result.rows[0]?.sessions_table).toBe("iam.identity_sessions");
    expect(result.rows[0]?.families_table).toBe(
      "iam.identity_refresh_families",
    );
  });

  it("stores iam.identity_sessions.token_version as bigint for millisecond session versions", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const db = new DatabaseService();
    databases.push(db);

    const result = await db.query<{ data_type: string; udt_name: string }>(
      `
        SELECT data_type, udt_name
        FROM information_schema.columns
        WHERE table_schema = 'iam'
          AND table_name = 'identity_sessions'
          AND column_name = 'token_version'
      `,
    );

    expect(result.rows[0]?.data_type).toBe("bigint");
    expect(result.rows[0]?.udt_name).toBe("int8");
  });

  it("persists sessions and hash-only refresh families to PostgreSQL, surviving restart", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const db = new DatabaseService();
    databases.push(db);

    const repo = new IdentityRepository(db);

    const principalId = `principal_db_${randomUUID()}`;
    const sessionId = `session_db_${randomUUID()}`;
    const familyId = `family_db_${randomUUID()}`;
    createdPrincipalIds.add(principalId);
    createdSessionIds.add(sessionId);

    // Create principal first for FK constraint
    await db.query(
      `
        INSERT INTO iam.identity_principals (
          principal_id, source_ref, issuer, subject, principal_type, email_normalized, email_verified, display_name, account_status, created_at, updated_at, record
        ) VALUES (
          $1, $2, 'test_issuer', $3, 'human', 'test@example.com', true, 'Test User', 'active', NOW(), NOW(), '{}'::jsonb
        )
      `,
      [principalId, `source_${principalId}`, `sub_${principalId}`],
    );

    const rawRefreshSecret = `raw_secret_${randomUUID()}`;
    const tokenHash = hashIdentitySecret(rawRefreshSecret);
    const issuedAt = new Date().toISOString();

    const session: CanonicalIdentitySessionRecord = {
      sessionId,
      sourceRef: `session_ref_${sessionId}`,
      principalId,
      membershipId: null,
      realm: "tenant",
      status: "active",
      authTime: issuedAt,
      authMethods: ["oidc_pkce"],
      tokenVersion: Date.parse(issuedAt),
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: { userAgentHash: "hash123" },
      riskSummary: { score: 0 },
      createdAt: issuedAt,
      updatedAt: issuedAt,
    };

    await repo.createSession(session);

    const family: CanonicalRefreshFamilyRecord = {
      familyId,
      sourceRef: `family_ref_${familyId}`,
      sessionId,
      currentTokenHash: tokenHash,
      counter: 0,
      status: "active",
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      compromisedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await repo.createRefreshFamily(family);

    // Verify raw secret is NOT stored in DB projection or record
    const dbRow = await db.query<{
      current_token_hash: string;
      record: unknown;
    }>(
      `SELECT current_token_hash, record FROM iam.identity_refresh_families WHERE family_id = $1`,
      [familyId],
    );

    expect(dbRow.rows[0]?.current_token_hash).toBe(tokenHash);
    expect(JSON.stringify(dbRow.rows[0]?.record)).not.toContain(
      rawRefreshSecret,
    );

    // Revoke session
    await repo.revokeSession(sessionId, "SECURITY_AUDIT_REVOKE", principalId);

    // Simulate process restart by creating a new DatabaseService & IdentityRepository instance
    const dbRestart = new DatabaseService();
    databases.push(dbRestart);
    const repoRestart = new IdentityRepository(dbRestart);

    const restartedSession = await repoRestart.getSession(sessionId);
    expect(restartedSession?.status).toBe("revoked");
    expect(restartedSession?.revokeReason).toBe("SECURITY_AUDIT_REVOKE");

    const restartedFamily = await repoRestart.getRefreshFamily(familyId);
    expect(restartedFamily?.status).toBe("revoked");
  });

  it("persists expired session and refresh family state across restart", async () => {
    expect(DATABASE_URL).toBeTruthy();
    const db = new DatabaseService();
    databases.push(db);

    const repo = new IdentityRepository(db);

    const principalId = `principal_expired_${randomUUID()}`;
    const sessionId = `session_expired_${randomUUID()}`;
    const familyId = `family_expired_${randomUUID()}`;
    createdPrincipalIds.add(principalId);
    createdSessionIds.add(sessionId);

    await db.query(
      `
        INSERT INTO iam.identity_principals (
          principal_id, source_ref, issuer, subject, principal_type, email_normalized, email_verified, display_name, account_status, created_at, updated_at, record
        ) VALUES (
          $1, $2, 'test_issuer', $3, 'human', 'expired@example.com', true, 'Expired User', 'active', NOW(), NOW(), '{}'::jsonb
        )
      `,
      [principalId, `source_${principalId}`, `sub_${principalId}`],
    );

    const issuedAt = new Date(Date.now() - 3_600_000).toISOString();
    const refreshToken = `expired_refresh_token_${randomUUID()}`;
    const absoluteExpiresAt = new Date(Date.now() - 60_000).toISOString();
    const refreshExpiresAt = new Date(Date.now() - 60_000).toISOString();

    await repo.createSession({
      sessionId,
      sourceRef: `session_ref_${sessionId}`,
      principalId,
      membershipId: null,
      realm: "driver",
      status: "active",
      authTime: issuedAt,
      authMethods: ["device_binding"],
      tokenVersion: Date.parse(issuedAt),
      idleExpiresAt: null,
      absoluteExpiresAt,
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: { deviceId: "expired-device" },
      riskSummary: {},
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });

    await repo.createRefreshFamily({
      familyId,
      sourceRef: `family_ref_${familyId}`,
      sessionId,
      currentTokenHash: hashIdentitySecret(refreshToken),
      counter: 0,
      status: "active",
      expiresAt: refreshExpiresAt,
      compromisedAt: null,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });

    const result = await repo.consumeAndRotateRefreshToken({
      familyId,
      oldTokenRaw: refreshToken,
      newTokenRaw: `rotated_refresh_token_${randomUUID()}`,
      newSessionTokenId: `jti_expired_${randomUUID()}`,
      newSessionTokenVersion: Date.now(),
      newExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(result.success).toBe(false);
    expect(result.reason).toBe("EXPIRED");

    const dbRestart = new DatabaseService();
    databases.push(dbRestart);
    const repoRestart = new IdentityRepository(dbRestart);

    const restartedSession = await repoRestart.getSession(sessionId);
    const restartedFamily = await repoRestart.getRefreshFamily(familyId);

    expect(restartedSession?.status).toBe("expired");
    expect(restartedFamily?.status).toBe("expired");
  });

  it("handles concurrent refresh token consumption with optimistic concurrency lock and reuse detection", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const dbA = new DatabaseService();
    const dbB = new DatabaseService();
    databases.push(dbA, dbB);

    const repoA = new IdentityRepository(dbA);
    const repoB = new IdentityRepository(dbB);

    const principalId = `principal_conc_${randomUUID()}`;
    const sessionId = `session_conc_${randomUUID()}`;
    const familyId = `family_conc_${randomUUID()}`;
    createdPrincipalIds.add(principalId);
    createdSessionIds.add(sessionId);

    await dbA.query(
      `
        INSERT INTO iam.identity_principals (
          principal_id, source_ref, issuer, subject, principal_type, email_normalized, email_verified, display_name, account_status, created_at, updated_at, record
        ) VALUES (
          $1, $2, 'test_issuer', $3, 'human', 'conc@example.com', true, 'Concurrent User', 'active', NOW(), NOW(), '{}'::jsonb
        )
      `,
      [principalId, `source_${principalId}`, `sub_${principalId}`],
    );

    const initialTokenRaw = `initial_refresh_token_${randomUUID()}`;
    const initialHash = hashIdentitySecret(initialTokenRaw);
    const newTokenRawA = `new_refresh_token_A_${randomUUID()}`;
    const newTokenRawB = `new_refresh_token_B_${randomUUID()}`;

    await repoA.createSession({
      sessionId,
      sourceRef: `session_ref_${sessionId}`,
      principalId,
      membershipId: null,
      realm: "driver",
      status: "active",
      authTime: new Date().toISOString(),
      authMethods: ["device_binding"],
      tokenVersion: Date.now(),
      idleExpiresAt: null,
      absoluteExpiresAt: new Date(Date.now() + 86400000).toISOString(),
      revokedAt: null,
      revokedByPrincipalId: null,
      revokeReason: null,
      deviceSummary: {},
      riskSummary: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await repoA.createRefreshFamily({
      familyId,
      sourceRef: `family_ref_${familyId}`,
      sessionId,
      currentTokenHash: initialHash,
      counter: 0,
      status: "active",
      expiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      compromisedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Execute concurrent refresh token rotation requests
    const results = await Promise.allSettled([
      repoA.consumeAndRotateRefreshToken({
        familyId,
        oldTokenRaw: initialTokenRaw,
        newTokenRaw: newTokenRawA,
        newSessionTokenId: `jti_conc_a_${randomUUID()}`,
        newSessionTokenVersion: Date.now() + 1,
        newExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      }),
      repoB.consumeAndRotateRefreshToken({
        familyId,
        oldTokenRaw: initialTokenRaw,
        newTokenRaw: newTokenRawB,
        newSessionTokenId: `jti_conc_b_${randomUUID()}`,
        newSessionTokenVersion: Date.now() + 2,
        newExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
      }),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<any> => r.status === "fulfilled",
    );
    expect(fulfilled).toHaveLength(2);

    const winner = fulfilled.find((r) => r.value.success === true);
    const loser = fulfilled.find((r) => r.value.success === false);

    expect(winner).toBeDefined();
    expect(loser).toBeDefined();
    expect(loser?.value.reason).toMatch(/REUSE_DETECTED|CONCURRENCY_CONFLICT/);

    // Re-presenting the initial token MUST trigger token reuse detection and compromise session
    const reuseAttempt = await repoA.consumeAndRotateRefreshToken({
      oldTokenRaw: initialTokenRaw,
      newTokenRaw: `new_token_reuse_${randomUUID()}`,
      newSessionTokenId: `jti_reuse_${randomUUID()}`,
      newSessionTokenVersion: Date.now() + 3,
      newExpiresAt: new Date(Date.now() + 86400000 * 30).toISOString(),
    });

    expect(reuseAttempt.success).toBe(false);
    expect(reuseAttempt.reason).toBe("REUSE_DETECTED");

    // Verify DB session and family state are now compromised
    const updatedSession = await repoA.getSession(sessionId);
    const updatedFamily = await repoA.getRefreshFamily(familyId);

    expect(updatedSession?.status).toBe("compromised");
    expect(updatedSession?.revokeReason).toBe("REFRESH_TOKEN_REUSE_DETECTED");
    expect(updatedFamily?.status).toBe("compromised");
  });

  it("revokes prior driver device binding, refresh family, and canonical JWT session in PostgreSQL when replacing with a new handset, surviving restart", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const db = new DatabaseService();
    databases.push(db);

    const driverId = `drv_pg_replace_${randomUUID()}`;
    createdDriverIds.add(driverId);

    const auditService = new AuditNotificationService();
    const profileService = new DriverProfileService(
      auditService,
      new DriverProfileRepository(db),
    );
    await profileService.onModuleInit();
    await profileService.createProfile(driverId, {
      name: "Postgres Replacement Driver",
      phone: "+886-912-555-001",
    });

    const identityRepo = new IdentityRepository(db);
    const jwtAuth = new JwtAuthService(identityRepo);
    const deviceRepo = new DriverDeviceSessionRepository(db);
    const deviceService = new DriverDeviceSessionService(
      jwtAuth,
      profileService,
      deviceRepo,
    );
    await deviceService.onModuleInit();

    const inviteA = await deviceService.issueRegistrationInvitation({
      driverId,
    });
    const sessionA = await deviceService.register({
      registrationCode: inviteA.registrationCode,
      deviceId: `pg-device-a-${randomUUID()}`,
      deviceLabel: "Primary Handset A",
    });
    createdSessionIds.add(sessionA.bindingId);

    expect(
      await deviceService.isBindingActive(
        sessionA.bindingId,
        sessionA.deviceId,
        driverId,
      ),
    ).toBe(true);
    expect(await jwtAuth.verifyAccessToken(sessionA.accessToken)).toMatchObject(
      {
        sub: driverId,
        sid: sessionA.bindingId,
        driverBindingId: sessionA.bindingId,
        driverDeviceId: sessionA.deviceId,
      },
    );

    const inviteB = await deviceService.issueRegistrationInvitation({
      driverId,
    });
    const sessionB = await deviceService.register({
      registrationCode: inviteB.registrationCode,
      deviceId: `pg-device-b-${randomUUID()}`,
      deviceLabel: "Replacement Handset B",
    });
    createdSessionIds.add(sessionB.bindingId);

    // Verify PostgreSQL tables directly for binding, refresh family, and canonical session
    const bindingRows = await db.query<{
      binding_id: string;
      status: string;
      rebound_from_binding_id: string | null;
    }>(
      `
        SELECT binding_id, status, rebound_from_binding_id
        FROM iam.driver_device_bindings
        WHERE driver_id = $1
      `,
      [driverId],
    );
    const rowA = bindingRows.rows.find(
      (r) => r.binding_id === sessionA.bindingId,
    );
    const rowB = bindingRows.rows.find(
      (r) => r.binding_id === sessionB.bindingId,
    );
    expect(rowA?.status).toBe("revoked");
    expect(rowB?.status).toBe("active");
    expect(rowB?.rebound_from_binding_id).toBe(sessionA.bindingId);

    const familyRows = await db.query<{
      binding_id: string;
      status: string;
    }>(
      `
        SELECT binding_id, status
        FROM iam.driver_refresh_families
        WHERE driver_id = $1
      `,
      [driverId],
    );
    expect(
      familyRows.rows.find((r) => r.binding_id === sessionA.bindingId)?.status,
    ).toBe("revoked");
    expect(
      familyRows.rows.find((r) => r.binding_id === sessionB.bindingId)?.status,
    ).toBe("active");

    const canonicalSessionA = await identityRepo.getSession(sessionA.bindingId);
    const canonicalSessionB = await identityRepo.getSession(sessionB.bindingId);
    expect(canonicalSessionA?.status).toBe("revoked");
    expect(canonicalSessionA?.revokeReason).toBe("DEVICE_REBOUND");
    expect(canonicalSessionB?.status).toBe("active");

    await profileService.prepareProfileAuthority(driverId);

    // Simulate process restart on a fresh DatabaseService connection pool
    const dbRestart = new DatabaseService();
    databases.push(dbRestart);
    const identityRepoRestart = new IdentityRepository(dbRestart);
    const jwtRestart = new JwtAuthService(identityRepoRestart);
    const profileRestart = new DriverProfileService(
      new AuditNotificationService(),
      new DriverProfileRepository(dbRestart),
    );
    await profileRestart.onModuleInit();
    const deviceRepoRestart = new DriverDeviceSessionRepository(dbRestart);
    const deviceServiceRestart = new DriverDeviceSessionService(
      jwtRestart,
      profileRestart,
      deviceRepoRestart,
    );
    await deviceServiceRestart.onModuleInit();

    expect(
      await deviceServiceRestart.isBindingActive(
        sessionA.bindingId,
        sessionA.deviceId,
        driverId,
      ),
    ).toBe(false);
    expect(
      await deviceServiceRestart.isBindingActive(
        sessionB.bindingId,
        sessionB.deviceId,
        driverId,
      ),
    ).toBe(true);

    await expect(
      deviceServiceRestart.refresh({
        deviceId: sessionA.deviceId,
        refreshToken: sessionA.refreshToken,
      }),
    ).rejects.toMatchObject({ code: "DRIVER_DEVICE_REFRESH_INVALID" });
    expect(await jwtRestart.verifyAccessToken(sessionA.accessToken)).toBeNull();

    const refreshedB = await deviceServiceRestart.refresh({
      deviceId: sessionB.deviceId,
      refreshToken: sessionB.refreshToken,
    });
    expect(refreshedB.bindingId).toBe(sessionB.bindingId);
    expect(
      await jwtRestart.verifyAccessToken(refreshedB.accessToken),
    ).toMatchObject({
      sub: driverId,
      sid: sessionB.bindingId,
      driverDeviceId: sessionB.deviceId,
    });
    await profileRestart.prepareProfileAuthority(driverId);
  });

  it("enforces single-active-device-per-driver across concurrent multi-instance PostgreSQL registrations", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const dbA = new DatabaseService();
    const dbB = new DatabaseService();
    databases.push(dbA, dbB);

    const driverId = `drv_pg_conc_${randomUUID()}`;
    createdDriverIds.add(driverId);

    const profileA = new DriverProfileService(
      new AuditNotificationService(),
      new DriverProfileRepository(dbA),
    );
    await profileA.onModuleInit();
    await profileA.createProfile(driverId, {
      name: "Concurrent Replacement Driver",
    });

    const profileB = new DriverProfileService(
      new AuditNotificationService(),
      new DriverProfileRepository(dbB),
    );
    await profileB.onModuleInit();

    const serviceA = new DriverDeviceSessionService(
      new JwtAuthService(new IdentityRepository(dbA)),
      profileA,
      new DriverDeviceSessionRepository(dbA),
    );
    const serviceB = new DriverDeviceSessionService(
      new JwtAuthService(new IdentityRepository(dbB)),
      profileB,
      new DriverDeviceSessionRepository(dbB),
    );
    await Promise.all([serviceA.onModuleInit(), serviceB.onModuleInit()]);

    const [inviteA, inviteB] = await Promise.all([
      serviceA.issueRegistrationInvitation({ driverId }),
      serviceB.issueRegistrationInvitation({ driverId }),
    ]);

    const [regA, regB] = await Promise.all([
      serviceA.register({
        registrationCode: inviteA.registrationCode,
        deviceId: `pg-conc-device-a-${randomUUID()}`,
      }),
      serviceB.register({
        registrationCode: inviteB.registrationCode,
        deviceId: `pg-conc-device-b-${randomUUID()}`,
      }),
    ]);
    createdSessionIds.add(regA.bindingId);
    createdSessionIds.add(regB.bindingId);
    await Promise.all([
      profileA.prepareProfileAuthority(driverId),
      profileB.prepareProfileAuthority(driverId),
    ]);

    const activeBindingRows = await dbA.query<{ binding_id: string }>(
      `
        SELECT binding_id
        FROM iam.driver_device_bindings
        WHERE driver_id = $1 AND status = 'active'
      `,
      [driverId],
    );
    expect(activeBindingRows.rows).toHaveLength(1);

    const winner =
      activeBindingRows.rows[0]?.binding_id === regA.bindingId ? regA : regB;
    const superseded = winner.bindingId === regA.bindingId ? regB : regA;

    const activeFamilyRows = await dbA.query<{ binding_id: string }>(
      `
        SELECT binding_id
        FROM iam.driver_refresh_families
        WHERE driver_id = $1 AND status = 'active'
      `,
      [driverId],
    );
    expect(activeFamilyRows.rows).toHaveLength(1);
    expect(activeFamilyRows.rows[0]?.binding_id).toBe(winner.bindingId);

    const activeCanonicalSessionRows = await dbA.query<{ session_id: string }>(
      `
        SELECT session_id
        FROM iam.identity_sessions
        WHERE principal_id = $1 AND status = 'active'
      `,
      [driverId],
    );
    expect(activeCanonicalSessionRows.rows).toHaveLength(1);
    expect(activeCanonicalSessionRows.rows[0]?.session_id).toBe(
      winner.bindingId,
    );

    const dbVerify = new DatabaseService();
    databases.push(dbVerify);
    const jwtVerify = new JwtAuthService(new IdentityRepository(dbVerify));
    const serviceVerify = new DriverDeviceSessionService(
      jwtVerify,
      new DriverProfileService(
        new AuditNotificationService(),
        new DriverProfileRepository(dbVerify),
      ),
      new DriverDeviceSessionRepository(dbVerify),
    );
    await serviceVerify.onModuleInit();

    expect(
      await serviceVerify.isBindingActive(
        superseded.bindingId,
        superseded.deviceId,
        driverId,
      ),
    ).toBe(false);
    expect(
      await serviceVerify.isBindingActive(
        winner.bindingId,
        winner.deviceId,
        driverId,
      ),
    ).toBe(true);
    expect(
      await jwtVerify.verifyAccessToken(superseded.accessToken),
    ).toBeNull();
    expect(await jwtVerify.verifyAccessToken(winner.accessToken)).toMatchObject(
      {
        sub: driverId,
        sid: winner.bindingId,
      },
    );
  });

  it("enforces cross-instance SQL advisory and FOR UPDATE locking without self-deadlock when DATABASE_POOL_MAX=1", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const previousPoolMax = process.env.DATABASE_POOL_MAX;
    process.env.DATABASE_POOL_MAX = "1";
    try {
      const dbA = new DatabaseService();
      const dbB = new DatabaseService();
      databases.push(dbA, dbB);

      const driverId = `drv_pg_pool1_${randomUUID()}`;
      createdDriverIds.add(driverId);

      const profileA = new DriverProfileService(
        new AuditNotificationService(),
        new DriverProfileRepository(dbA),
      );
      await profileA.onModuleInit();
      await profileA.createProfile(driverId, {
        name: "Pool1 Replacement Driver",
      });

      const profileB = new DriverProfileService(
        new AuditNotificationService(),
        new DriverProfileRepository(dbB),
      );
      await profileB.onModuleInit();

      const repoA = new DriverDeviceSessionRepository(dbA);
      const serviceA = new DriverDeviceSessionService(
        new JwtAuthService(new IdentityRepository(dbA)),
        profileA,
        repoA,
      );
      const serviceB = new DriverDeviceSessionService(
        new JwtAuthService(new IdentityRepository(dbB)),
        profileB,
        new DriverDeviceSessionRepository(dbB),
      );
      await Promise.all([serviceA.onModuleInit(), serviceB.onModuleInit()]);

      const [inviteA, inviteB] = await Promise.all([
        serviceA.issueRegistrationInvitation({ driverId }),
        serviceB.issueRegistrationInvitation({ driverId }),
      ]);

      const [regA, regB] = await Promise.all([
        serviceA.register({
          registrationCode: inviteA.registrationCode,
          deviceId: `pg-pool1-device-a-${randomUUID()}`,
        }),
        serviceB.register({
          registrationCode: inviteB.registrationCode,
          deviceId: `pg-pool1-device-b-${randomUUID()}`,
        }),
      ]);
      createdSessionIds.add(regA.bindingId);
      createdSessionIds.add(regB.bindingId);
      await Promise.all([
        profileA.prepareProfileAuthority(driverId),
        profileB.prepareProfileAuthority(driverId),
      ]);

      const activeBindingRows = await dbA.query<{ binding_id: string }>(
        `
          SELECT binding_id
          FROM iam.driver_device_bindings
          WHERE driver_id = $1 AND status = 'active'
        `,
        [driverId],
      );
      expect(activeBindingRows.rows).toHaveLength(1);

      const winner =
        activeBindingRows.rows[0]?.binding_id === regA.bindingId ? regA : regB;
      const superseded = winner.bindingId === regA.bindingId ? regB : regA;

      const activeFamilyRows = await dbA.query<{ binding_id: string }>(
        `
          SELECT binding_id
          FROM iam.driver_refresh_families
          WHERE driver_id = $1 AND status = 'active'
        `,
        [driverId],
      );
      expect(activeFamilyRows.rows).toHaveLength(1);
      expect(activeFamilyRows.rows[0]?.binding_id).toBe(winner.bindingId);

      const activeCanonicalSessionRows = await dbA.query<{
        session_id: string;
      }>(
        `
          SELECT session_id
          FROM iam.identity_sessions
          WHERE principal_id = $1 AND status = 'active'
        `,
        [driverId],
      );
      expect(activeCanonicalSessionRows.rows).toHaveLength(1);
      expect(activeCanonicalSessionRows.rows[0]?.session_id).toBe(
        winner.bindingId,
      );

      expect(
        await serviceA.isBindingActive(
          superseded.bindingId,
          superseded.deviceId,
          driverId,
        ),
      ).toBe(false);

      // Verify single-client atomic rollback when replacement registration fails after nested revokeSession
      const inviteRollback = await serviceA.issueRegistrationInvitation({
        driverId,
      });
      const originalSaveRefreshFamily = repoA.saveRefreshFamily.bind(repoA);
      repoA.saveRefreshFamily = async (record) => {
        if (record.bindingId !== winner.bindingId) {
          throw new Error("simulated pool1 refresh family failure");
        }
        return originalSaveRefreshFamily(record);
      };

      await expect(
        serviceA.register({
          registrationCode: inviteRollback.registrationCode,
          deviceId: `pg-pool1-device-rollback-${randomUUID()}`,
        }),
      ).rejects.toThrow("simulated pool1 refresh family failure");
      repoA.saveRefreshFamily = originalSaveRefreshFamily;

      const postRollbackSessionRows = await dbA.query<{
        session_id: string;
      }>(
        `
          SELECT session_id
          FROM iam.identity_sessions
          WHERE principal_id = $1 AND status = 'active'
        `,
        [driverId],
      );
      expect(postRollbackSessionRows.rows).toHaveLength(1);
      expect(postRollbackSessionRows.rows[0]?.session_id).toBe(
        winner.bindingId,
      );
      expect(
        await serviceA.isBindingActive(
          winner.bindingId,
          winner.deviceId,
          driverId,
        ),
      ).toBe(true);
    } finally {
      if (previousPoolMax === undefined) {
        delete process.env.DATABASE_POOL_MAX;
      } else {
        process.env.DATABASE_POOL_MAX = previousPoolMax;
      }
    }
  });
});
