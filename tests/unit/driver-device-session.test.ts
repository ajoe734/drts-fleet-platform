import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

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
        "../../infra/migrations/V0069__durable_session_refresh_families.sql",
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
