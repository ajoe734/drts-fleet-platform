import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type {
  CanonicalIdentitySessionRecord,
  CanonicalRefreshFamilyRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../src/common/db";
import {
  hashIdentitySecret,
  IdentityRepository,
} from "../../src/modules/identity/identity.repository";

const DATABASE_URL = process.env.DATABASE_URL;

async function deleteSessionTestData(
  database: DatabaseService,
  sessionIds: string[],
  principalIds: string[],
) {
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
  if (principalIds.length > 0) {
    await database.query(
      `DELETE FROM iam.identity_principals WHERE principal_id = ANY($1::text[])`,
      [principalIds],
    );
  }
}

describe("Identity Session and Refresh Family Postgres Integration", () => {
  const databases: DatabaseService[] = [];
  const createdSessionIds = new Set<string>();
  const createdPrincipalIds = new Set<string>();

  afterEach(async () => {
    if (
      DATABASE_URL &&
      (createdSessionIds.size > 0 || createdPrincipalIds.size > 0)
    ) {
      const cleanupDb = new DatabaseService();
      try {
        await deleteSessionTestData(
          cleanupDb,
          Array.from(createdSessionIds),
          Array.from(createdPrincipalIds),
        );
      } finally {
        createdSessionIds.clear();
        createdPrincipalIds.clear();
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
});
