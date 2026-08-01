import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import type {
  CanonicalRefreshFamilyRecord,
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
});
