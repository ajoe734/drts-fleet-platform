import type { AddressInfo } from "node:net";

import { Module } from "@nestjs/common";
import { APP_GUARD, NestFactory } from "@nestjs/core";
import { beforeEach, describe, expect, it } from "vitest";

import { FeatureGateGuard } from "../../src/common/auth";
import { OPS_ASSISTANT_FLAG_KEY } from "../../src/modules/assistant/assistant.constants";
import { AssistantController } from "../../src/modules/assistant/assistant.controller";
import { AssistantService } from "../../src/modules/assistant/assistant.service";
import { FeatureFlagsService } from "../../src/modules/feature-flags/feature-flags.service";

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

  it("blocks the gated assistant session with 403 when the flag is off", async () => {
    const featureFlags = new FeatureFlagsService();
    const { app, baseUrl } = await createAssistantTestApp(featureFlags);

    try {
      const response = await fetch(`${baseUrl}/assistant/session`);
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

  it("serves availability=true and the gated session once the flag is on", async () => {
    const featureFlags = new FeatureFlagsService();
    await featureFlags.updateFlag(OPS_ASSISTANT_FLAG_KEY, true);
    const { app, baseUrl } = await createAssistantTestApp(featureFlags);

    try {
      const availability = await fetch(`${baseUrl}/assistant/availability`);
      expect(availability.status).toBe(200);
      const availabilityBody = (await availability.json()) as {
        data: { enabled: boolean };
      };
      expect(availabilityBody.data.enabled).toBe(true);

      const session = await fetch(`${baseUrl}/assistant/session`);
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
