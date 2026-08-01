import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type {
  CanonicalRefreshFamilyRecord,
  CanonicalRefreshTokenRecord,
  CanonicalSessionRecord,
} from "@drts/contracts";

import { DatabaseService } from "../../src/common/db";
import { DriverDeviceSessionRepository } from "../../src/modules/auth/driver-device-session.repository";

const DATABASE_URL = process.env.DATABASE_URL;

type RecordRow<T> = {
  record: T;
};

async function deleteSessionRows(database: DatabaseService, deviceId: string) {
  await database.query("DELETE FROM iam.sessions WHERE device_id = $1", [deviceId]);
}

describe("driver device session postgres integration", () => {
  const databases: DatabaseService[] = [];
  const deviceIds = new Set<string>();

  afterEach(async () => {
    if (DATABASE_URL) {
      const cleanupDatabase = new DatabaseService();
      try {
        for (const deviceId of deviceIds) {
          await deleteSessionRows(cleanupDatabase, deviceId);
        }
      } finally {
        deviceIds.clear();
        await cleanupDatabase.onModuleDestroy();
      }
    }

    for (const database of databases.splice(0)) {
      await database.onModuleDestroy();
    }
  });

  it("requires DATABASE_URL", () => {
    expect(DATABASE_URL).toBeTruthy();
  });

  it("persists first issuance without FK violations and keeps absolute expiry fixed on rotation", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const database = new DatabaseService();
    databases.push(database);

    const repository = new DriverDeviceSessionRepository(database);
    const deviceId = `device-pg-${randomUUID()}`;
    deviceIds.add(deviceId);

    const issuedAt = "2026-08-01T00:00:00.000Z";
    const absoluteExpiresAt = "2026-08-31T00:00:00.000Z";
    const refreshToken = `drvrefresh_${randomUUID().replace(/-/g, "")}`;
    const issued = await repository.issueDriverDeviceSession({
      driverId: `drv-pg-${randomUUID()}`,
      deviceId,
      deviceLabel: "PG integration device",
      riskSummary: {
        riskLevel: "low",
        signals: ["device_registration"],
      },
      issuedAt,
      idleExpiresAt: absoluteExpiresAt,
      absoluteExpiresAt,
      refreshToken,
    });

    const familyRows = await database.query<RecordRow<CanonicalRefreshFamilyRecord>>(
      `
        SELECT record
        FROM iam.refresh_families
        WHERE family_id = $1
      `,
      [issued.family.familyId],
    );
    expect(familyRows.rows[0]?.record.currentTokenId).toBe(
      issued.currentRefreshToken.refreshTokenId,
    );

    const nextRefreshToken = `drvrefresh_${randomUUID().replace(/-/g, "")}`;
    const rotated = await repository.rotateDriverRefreshToken({
      deviceId,
      refreshToken,
      nextRefreshToken,
      rotatedAt: "2026-08-02T00:00:00.000Z",
      idleExpiresAt: "2026-09-01T00:00:00.000Z",
      riskSummary: {
        riskLevel: "low",
        signals: ["refresh_rotation"],
      },
    });

    expect(rotated.outcome).toBe("rotated");
    if (rotated.outcome !== "rotated") {
      return;
    }

    const sessionRows = await database.query<RecordRow<CanonicalSessionRecord>>(
      `
        SELECT record
        FROM iam.sessions
        WHERE session_id = $1
      `,
      [issued.session.sessionId],
    );
    const rotatedFamilyRows = await database.query<
      RecordRow<CanonicalRefreshFamilyRecord>
    >(
      `
        SELECT record
        FROM iam.refresh_families
        WHERE family_id = $1
      `,
      [issued.family.familyId],
    );

    expect(rotated.family.absoluteExpiresAt).toBe(absoluteExpiresAt);
    expect(rotated.session.expiresAt).toBe(absoluteExpiresAt);
    expect(rotated.currentRefreshToken.expiresAt).toBe(absoluteExpiresAt);
    expect(rotated.family.previousTokenId).toBe(
      issued.currentRefreshToken.refreshTokenId,
    );
    expect(rotated.family.currentTokenId).toBe(
      rotated.currentRefreshToken.refreshTokenId,
    );
    expect(sessionRows.rows[0]?.record.expiresAt).toBe(absoluteExpiresAt);
    expect(rotatedFamilyRows.rows[0]?.record.absoluteExpiresAt).toBe(
      absoluteExpiresAt,
    );
  });

  it("serializes concurrent refresh reuse across repository instances and revokes the family once", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const writerDatabase = new DatabaseService();
    const contenderDatabase = new DatabaseService();
    const verificationDatabase = new DatabaseService();
    databases.push(writerDatabase, contenderDatabase, verificationDatabase);

    const writerRepository = new DriverDeviceSessionRepository(writerDatabase);
    const contenderRepository = new DriverDeviceSessionRepository(contenderDatabase);
    const verificationRepository = new DriverDeviceSessionRepository(
      verificationDatabase,
    );
    const deviceId = `device-pg-race-${randomUUID()}`;
    const driverId = `drv-pg-race-${randomUUID()}`;
    deviceIds.add(deviceId);

    const issuedAt = "2026-08-01T00:00:00.000Z";
    const rotatedAt = "2026-08-02T00:00:00.000Z";
    const absoluteExpiresAt = "2026-08-31T00:00:00.000Z";
    const refreshToken = `drvrefresh_${randomUUID().replace(/-/g, "")}`;
    const issued = await writerRepository.issueDriverDeviceSession({
      driverId,
      deviceId,
      deviceLabel: "PG concurrent device",
      riskSummary: {
        riskLevel: "low",
        signals: ["device_registration"],
      },
      issuedAt,
      idleExpiresAt: absoluteExpiresAt,
      absoluteExpiresAt,
      refreshToken,
    });

    const [writerResult, contenderResult] = await Promise.all([
      writerRepository.rotateDriverRefreshToken({
        deviceId,
        refreshToken,
        nextRefreshToken: `drvrefresh_${randomUUID().replace(/-/g, "")}`,
        rotatedAt,
        idleExpiresAt: "2026-09-01T00:00:00.000Z",
        riskSummary: {
          riskLevel: "low",
          signals: ["refresh_rotation_primary"],
        },
      }),
      contenderRepository.rotateDriverRefreshToken({
        deviceId,
        refreshToken,
        nextRefreshToken: `drvrefresh_${randomUUID().replace(/-/g, "")}`,
        rotatedAt,
        idleExpiresAt: "2026-09-01T00:00:00.000Z",
        riskSummary: {
          riskLevel: "medium",
          signals: ["refresh_rotation_race"],
        },
      }),
    ]);

    const rotatedResults = [writerResult, contenderResult].filter(
      (result): result is Extract<typeof result, { outcome: "rotated" }> =>
        result.outcome === "rotated",
    );
    const invalidResults = [writerResult, contenderResult].filter(
      (result) => result.outcome === "invalid",
    );

    expect(rotatedResults).toHaveLength(1);
    expect(invalidResults).toHaveLength(1);

    const persistedSession = await verificationRepository.loadSession(
      issued.session.sessionId,
    );
    expect(persistedSession).toMatchObject({
      sessionId: issued.session.sessionId,
      status: "revoked",
      revokeReason: "refresh_token_reuse_detected",
      revokedAt: rotatedAt,
    });
    expect(
      await verificationRepository.isDriverSessionActive(
        issued.session.sessionId,
        deviceId,
        driverId,
        "2026-08-02T00:00:01.000Z",
      ),
    ).toBe(false);

    const familyRows = await verificationDatabase.query<
      RecordRow<CanonicalRefreshFamilyRecord>
    >(
      `
        SELECT record
        FROM iam.refresh_families
        WHERE family_id = $1
      `,
      [issued.family.familyId],
    );
    expect(familyRows.rows[0]?.record).toMatchObject({
      familyId: issued.family.familyId,
      status: "revoked",
      revokeReason: "refresh_token_reuse_detected",
      revokedAt: rotatedAt,
    });

    const tokenRows = await verificationDatabase.query<
      RecordRow<CanonicalRefreshTokenRecord>
    >(
      `
        SELECT record
        FROM iam.refresh_tokens
        WHERE family_id = $1
        ORDER BY issued_at ASC
      `,
      [issued.family.familyId],
    );
    expect(tokenRows.rows).toHaveLength(2);
    expect(tokenRows.rows[0]?.record.tokenHash).not.toBe(refreshToken);
    expect(JSON.stringify(tokenRows.rows[0]?.record)).not.toContain(refreshToken);
    expect(
      tokenRows.rows.every((row) => row.record.revokedAt === rotatedAt),
    ).toBe(true);
  });

  it("keeps revoked session state across repository restart and rejects reused refresh secrets", async () => {
    expect(DATABASE_URL).toBeTruthy();

    const initialDatabase = new DatabaseService();
    databases.push(initialDatabase);

    const initialRepository = new DriverDeviceSessionRepository(initialDatabase);
    const deviceId = `device-pg-restart-${randomUUID()}`;
    const driverId = `drv-pg-restart-${randomUUID()}`;
    deviceIds.add(deviceId);

    const refreshToken = `drvrefresh_${randomUUID().replace(/-/g, "")}`;
    const issued = await initialRepository.issueDriverDeviceSession({
      driverId,
      deviceId,
      deviceLabel: "PG restart device",
      riskSummary: {
        riskLevel: "low",
        signals: ["device_registration"],
      },
      issuedAt: "2026-08-01T00:00:00.000Z",
      idleExpiresAt: "2026-08-31T00:00:00.000Z",
      absoluteExpiresAt: "2026-08-31T00:00:00.000Z",
      refreshToken,
    });

    const revokedAt = "2026-08-03T00:00:00.000Z";
    const revoked = await initialRepository.revokeDriverSession(
      { bindingId: issued.session.sessionId },
      revokedAt,
      "binding_revoked",
    );
    expect(revoked).toMatchObject({
      sessionId: issued.session.sessionId,
      status: "revoked",
      revokedAt,
      revokeReason: "binding_revoked",
    });

    await initialDatabase.onModuleDestroy();
    databases.splice(databases.indexOf(initialDatabase), 1);

    const restartedDatabase = new DatabaseService();
    databases.push(restartedDatabase);
    const restartedRepository = new DriverDeviceSessionRepository(restartedDatabase);

    const persistedSession = await restartedRepository.loadSession(
      issued.session.sessionId,
    );
    expect(persistedSession).toMatchObject({
      sessionId: issued.session.sessionId,
      status: "revoked",
      revokedAt,
      revokeReason: "binding_revoked",
    });
    expect(
      await restartedRepository.isDriverSessionActive(
        issued.session.sessionId,
        deviceId,
        driverId,
        "2026-08-03T00:00:01.000Z",
      ),
    ).toBe(false);

    const rotated = await restartedRepository.rotateDriverRefreshToken({
      deviceId,
      refreshToken,
      nextRefreshToken: `drvrefresh_${randomUUID().replace(/-/g, "")}`,
      rotatedAt: "2026-08-03T00:05:00.000Z",
      idleExpiresAt: "2026-09-01T00:00:00.000Z",
      riskSummary: {
        riskLevel: "medium",
        signals: ["post_restart_reuse"],
      },
    });
    expect(rotated).toEqual({ outcome: "invalid" });
  });
});
