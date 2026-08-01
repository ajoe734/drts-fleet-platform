import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { JwtAuthService } from "../../apps/api/src/common/auth/jwt-auth.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { DriverDeviceSessionRepository } from "../../apps/api/src/modules/auth/driver-device-session.repository";
import { DriverDeviceSessionService } from "../../apps/api/src/modules/auth/driver-device-session.service";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";

describe("driver device session service", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "test-driver-device-secret";
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  it("stores only refresh token hashes and rotates with single winner semantics", async () => {
    const repository = new DriverDeviceSessionRepository();
    const service = new DriverDeviceSessionService(
      new JwtAuthService(),
      new DriverProfileService(new AuditNotificationService()),
      repository,
    );

    const initial = await service.register({
      registrationCode: "driver-demo-001",
      deviceId: "device-001",
      deviceLabel: "Driver phone",
    });

    const [storedToken] = repository.listFallbackRefreshTokens();
    expect(storedToken.tokenHash).not.toBe(initial.refreshToken);
    expect(storedToken.tokenHash).toHaveLength(64);

    const rotated = await service.refresh({
      deviceId: "device-001",
      refreshToken: initial.refreshToken,
    });

    expect(rotated.bindingId).toBe(initial.bindingId);
    expect(rotated.refreshToken).not.toBe(initial.refreshToken);

    await expect(
      service.refresh({
        deviceId: "device-001",
        refreshToken: initial.refreshToken,
      }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "DRIVER_DEVICE_REFRESH_INVALID",
        },
      },
    });

    await expect(
      service.assertSessionAccessAllowed(
        initial.bindingId,
        "device-001",
        "drv-demo-001",
        "/driver/profile",
      ),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: "DRIVER_DEVICE_SESSION_INVALID",
        },
      },
    });
  });

  it("keeps family absolute expiry fixed across refresh rotation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));

    const repository = new DriverDeviceSessionRepository();
    const service = new DriverDeviceSessionService(
      new JwtAuthService(),
      new DriverProfileService(new AuditNotificationService()),
      repository,
    );

    const initial = await service.register({
      registrationCode: "driver-demo-001",
      deviceId: "device-absolute-001",
    });
    const [initialSession] = repository.listFallbackSessions();
    const [initialFamily] = repository.listFallbackFamilies();

    vi.setSystemTime(new Date("2026-08-02T00:00:00.000Z"));
    await service.refresh({
      deviceId: "device-absolute-001",
      refreshToken: initial.refreshToken,
    });

    const [rotatedSession] = repository.listFallbackSessions();
    const [rotatedFamily] = repository.listFallbackFamilies();

    expect(rotatedFamily.absoluteExpiresAt).toBe(initialFamily.absoluteExpiresAt);
    expect(rotatedSession.expiresAt).toBe(initialSession.expiresAt);
    expect(rotatedSession.lastRefreshedAt).not.toBe(initialSession.lastRefreshedAt);

    vi.useRealTimers();
  });

  it("persists revoked binding state in the durable repository view", async () => {
    const repository = new DriverDeviceSessionRepository();
    const service = new DriverDeviceSessionService(
      new JwtAuthService(),
      new DriverProfileService(new AuditNotificationService()),
      repository,
    );

    const session = await service.register({
      registrationCode: "driver-demo-001",
      deviceId: "device-002",
    });

    const revoked = await service.revoke(
      {
        bindingId: session.bindingId,
        deviceId: "device-002",
      },
      {
        authMode: "jwt_bearer",
        actorType: "system",
        actorId: "ops-revoke-bot",
        realm: "system",
        tenantId: null,
        partnerId: null,
        partnerProgramId: null,
        partnerEntrySlug: null,
        roleFamilies: ["platform"],
        roles: ["ops_user"],
        scopes: ["driver:write"],
        requestId: null,
      },
    );

    expect(revoked.bindingId).toBe(session.bindingId);
    expect(await service.isBindingActive(session.bindingId, "device-002", "drv-demo-001")).toBe(false);

    const persisted = await repository.loadSession(session.bindingId);
    expect(persisted?.status).toBe("revoked");
    expect(persisted?.revokedAt).not.toBeNull();
  });
});

describe("durable session migration", () => {
  it("creates session, refresh family, and token tables with hash-only storage", () => {
    const migration = readFileSync(
      resolve(
        __dirname,
        "../../infra/migrations/V0070__durable_session_refresh_families.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("CREATE TABLE IF NOT EXISTS iam.sessions");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS iam.refresh_families");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS iam.refresh_tokens");
    expect(migration).toContain("token_hash varchar(128) NOT NULL UNIQUE");
    expect(migration).not.toContain("refresh_token varchar");
    expect(migration).toContain("idx_refresh_tokens_family_active");
  });
});

describe("driver device session repository", () => {
  it("inserts family before token and backfills current token id after token insert", async () => {
    const calls: Array<{ text: string; values: readonly unknown[] | undefined }> = [];
    const client = {
      query: vi.fn(async (text: string, values?: readonly unknown[]) => {
        calls.push({ text, values });
        return { rowCount: 1, rows: [] };
      }),
      release: vi.fn(),
    };
    const databaseService = {
      isEnabled: () => true,
      connect: async () => client,
    };
    const repository = new DriverDeviceSessionRepository(
      databaseService as never,
    );

    const result = await repository.issueDriverDeviceSession({
      driverId: "drv-demo-001",
      deviceId: "device-db-001",
      deviceLabel: "Driver phone",
      riskSummary: {
        riskLevel: "low",
        signals: ["device_registration"],
      },
      issuedAt: "2026-08-01T00:00:00.000Z",
      idleExpiresAt: "2026-08-31T00:00:00.000Z",
      absoluteExpiresAt: "2026-08-31T00:00:00.000Z",
      refreshToken: "drvrefresh_seed",
    });

    const familyInsert = calls.find((entry) =>
      entry.text.includes("INSERT INTO iam.refresh_families"),
    );
    const tokenInsert = calls.find((entry) =>
      entry.text.includes("INSERT INTO iam.refresh_tokens"),
    );
    const familyUpdate = calls.find(
      (entry) =>
        entry.text.includes("UPDATE iam.refresh_families") &&
        entry.text.includes("current_token_id = $2"),
    );

    expect(familyInsert?.values?.[4]).toBeNull();
    expect(tokenInsert?.values?.[0]).toBe(result.currentRefreshToken.refreshTokenId);
    expect(familyUpdate?.values?.[1]).toBe(result.currentRefreshToken.refreshTokenId);
    expect(result.family.currentTokenId).toBe(result.currentRefreshToken.refreshTokenId);
  });
});
