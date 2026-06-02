import type { AddressInfo } from "node:net";

import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { beforeEach, describe, expect, it } from "vitest";

import { BootstrapAuthGuard, FeatureGateGuard } from "../../src/common/auth";
import { OPS_ASSISTANT_FLAG_KEY } from "../../src/modules/assistant/assistant.constants";
import { AssistantController } from "../../src/modules/assistant/assistant.controller";
import { AssistantService } from "../../src/modules/assistant/assistant.service";
import { FeatureFlagsService } from "../../src/modules/feature-flags/feature-flags.service";

// Bootstrap-header identities used to exercise BootstrapAuthGuard. An ops_user
// resolves to the "ops" realm (allowed); a driver_user resolves to "driver"
// (denied for the assistant session route).
const OPS_HEADERS = {
  "x-actor-type": "ops_user",
  "x-actor-id": "ops-tester",
  "x-realm": "ops",
} as const;

const DRIVER_HEADERS = {
  "x-actor-type": "driver_user",
  "x-actor-id": "driver-tester",
  "x-realm": "driver",
} as const;

describe("AssistantService", () => {
  let featureFlags: FeatureFlagsService;
  let service: AssistantService;

  beforeEach(() => {
    // No repository → in-memory fallback with seeded defaults.
    featureFlags = new FeatureFlagsService();
    service = new AssistantService(featureFlags);
  });

  it("defaults the ops assistant flag to off", async () => {
    const availability = await service.getAvailability();

    expect(availability).toEqual({
      flagKey: OPS_ASSISTANT_FLAG_KEY,
      enabled: false,
      tenantId: null,
    });
    await expect(service.isEnabled()).resolves.toBe(false);
  });

  it("reports the assistant as available once the flag is enabled", async () => {
    await featureFlags.updateFlag(OPS_ASSISTANT_FLAG_KEY, true);

    const availability = await service.getAvailability();

    expect(availability.enabled).toBe(true);
    await expect(service.isEnabled()).resolves.toBe(true);
  });

  it("resolves availability per realm via tenant overrides", async () => {
    await featureFlags.upsertTenantOverride(
      OPS_ASSISTANT_FLAG_KEY,
      "tenant-a",
      true,
    );

    // Global default stays off; only the overridden tenant is enabled.
    await expect(service.isEnabled()).resolves.toBe(false);
    await expect(service.isEnabled("tenant-a")).resolves.toBe(true);
    await expect(service.isEnabled("tenant-b")).resolves.toBe(false);

    const tenantAvailability = await service.getAvailability("tenant-a");
    expect(tenantAvailability).toEqual({
      flagKey: OPS_ASSISTANT_FLAG_KEY,
      enabled: true,
      tenantId: "tenant-a",
    });
  });
});

async function createAssistantTestApp(featureFlags: FeatureFlagsService) {
  @Module({
    controllers: [AssistantController],
    providers: [
      AssistantService,
      {
        provide: FeatureFlagsService,
        useValue: featureFlags,
      },
      // Mirror the real app guard order (app.module.ts): bootstrap auth runs
      // before the feature gate, so 401 AUTH_REQUIRED / 403 AUTH_REALM_DENIED
      // take precedence over the feature-flag 403.
      {
        provide: APP_GUARD,
        useClass: BootstrapAuthGuard,
      },
      {
        provide: APP_GUARD,
        useClass: FeatureGateGuard,
      },
    ],
  })
  class AssistantTestModule {}

  const app = await NestFactory.create(AssistantTestModule, { logger: false });
  await app.listen(0, "127.0.0.1");

  const address = app.getHttpServer().address() as AddressInfo | null;
  if (!address) {
    throw new Error("expected test server address");
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

describe("AssistantController (http pipeline)", () => {
  it("exposes availability=false when the flag is off (widget hidden, no 403)", async () => {
    const featureFlags = new FeatureFlagsService();
    const { app, baseUrl } = await createAssistantTestApp(featureFlags);

    try {
      const response = await fetch(`${baseUrl}/assistant/availability`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: { flagKey: string; enabled: boolean };
      };
      expect(body.data.flagKey).toBe(OPS_ASSISTANT_FLAG_KEY);
      expect(body.data.enabled).toBe(false);
    } finally {
      await app.close();
    }
  });

  it("rejects an anonymous session with 401 even when the flag is on", async () => {
    // The flag is NOT an auth bypass: an ungated /assistant/session would let
    // anonymous callers in once the flag flips on. BootstrapAuthGuard must run
    // first and demand a bootstrap identity.
    const featureFlags = new FeatureFlagsService();
    await featureFlags.updateFlag(OPS_ASSISTANT_FLAG_KEY, true);
    const { app, baseUrl } = await createAssistantTestApp(featureFlags);

    try {
      const response = await fetch(`${baseUrl}/assistant/session`);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "AUTH_REQUIRED" },
      });
    } finally {
      await app.close();
    }
  });

  it("rejects a non-ops realm with 403 AUTH_REALM_DENIED when the flag is on", async () => {
    const featureFlags = new FeatureFlagsService();
    await featureFlags.updateFlag(OPS_ASSISTANT_FLAG_KEY, true);
    const { app, baseUrl } = await createAssistantTestApp(featureFlags);

    try {
      const response = await fetch(`${baseUrl}/assistant/session`, {
        headers: DRIVER_HEADERS,
      });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "AUTH_REALM_DENIED" },
      });
    } finally {
      await app.close();
    }
  });

  it("blocks an authed ops session with 403 FEATURE_FLAG_DISABLED when the flag is off", async () => {
    const featureFlags = new FeatureFlagsService();
    const { app, baseUrl } = await createAssistantTestApp(featureFlags);

    try {
      const response = await fetch(`${baseUrl}/assistant/session`, {
        headers: OPS_HEADERS,
      });
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "FEATURE_FLAG_DISABLED",
          details: { flagKey: OPS_ASSISTANT_FLAG_KEY },
        },
      });
    } finally {
      await app.close();
    }
  });

  it("serves availability=true and the gated session to an authed ops caller once the flag is on", async () => {
    const featureFlags = new FeatureFlagsService();
    await featureFlags.updateFlag(OPS_ASSISTANT_FLAG_KEY, true);
    const { app, baseUrl } = await createAssistantTestApp(featureFlags);

    try {
      // Availability stays ungated so the widget can probe it anonymously.
      const availability = await fetch(`${baseUrl}/assistant/availability`);
      expect(availability.status).toBe(200);
      const availabilityBody = (await availability.json()) as {
        data: { enabled: boolean };
      };
      expect(availabilityBody.data.enabled).toBe(true);

      const session = await fetch(`${baseUrl}/assistant/session`, {
        headers: OPS_HEADERS,
      });
      expect(session.status).toBe(200);
      const sessionBody = (await session.json()) as {
        data: { flagKey: string; status: string };
      };
      expect(sessionBody.data.flagKey).toBe(OPS_ASSISTANT_FLAG_KEY);
      expect(sessionBody.data.status).toBe("ready");
    } finally {
      await app.close();
    }
  });
});
