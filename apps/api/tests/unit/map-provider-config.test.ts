import { describe, expect, it } from "vitest";

import { buildHealthPayload } from "../../src/health/health.controller";
import { GeoProviderConfigService } from "../../src/modules/geo/geo-provider-config.service";

describe("GeoProviderConfigService", () => {
  it("defaults to deterministic mock mode outside production-like tiers", () => {
    const service = new GeoProviderConfigService({
      NODE_ENV: "development",
    });

    expect(service.getHealth()).toMatchObject({
      provider: "mock",
      mode: "mock",
      status: "healthy",
      failClosed: false,
      mockAllowed: true,
    });
  });

  it("fails closed in production-like tiers when mock mode is not explicitly allowed", () => {
    const service = new GeoProviderConfigService({
      DRTS_ENV: "production",
      MAP_PROVIDER_MODE: "mock",
    });

    expect(service.getHealth()).toMatchObject({
      mode: "mock",
      status: "unhealthy",
      failClosed: true,
      checks: expect.arrayContaining([
        expect.objectContaining({
          name: "mock_provider_production_guard",
          status: "fail",
        }),
      ]),
    });
  });

  it("reports external mode as healthy when the server key is configured", () => {
    const service = new GeoProviderConfigService({
      DRTS_ENV: "staging",
      MAP_PROVIDER_MODE: "external",
      MAP_PROVIDER_NAME: "google_maps",
      MAP_PROVIDER_SERVER_KEY: "server-key",
      MAP_PROVIDER_ALLOWED_ORIGINS:
        "https://ops.example.com,https://admin.example.com",
      MAP_PROVIDER_DAILY_QUOTA: "1000",
      MAP_PROVIDER_DAILY_QUOTA_USED: "810",
      MAP_PROVIDER_QUOTA_WARNING_PERCENT: "80",
      MAP_PROVIDER_QUOTA_CRITICAL_PERCENT: "95",
    });

    expect(service.getHealth()).toMatchObject({
      provider: "google_maps",
      mode: "external",
      status: "healthy",
      failClosed: false,
      missingSecretNames: [],
      keyRestrictions: {
        browserAllowedOrigins: [
          "https://ops.example.com",
          "https://admin.example.com",
        ],
        serverKeyConfigured: true,
      },
      quota: {
        dailyLimit: 1000,
        dailyUsed: 810,
        usagePercent: 81,
        status: "warning",
      },
      checks: expect.arrayContaining([
        expect.objectContaining({
          name: "external_adapter",
          status: "pass",
        }),
      ]),
    });
  });

  it("fails closed in external mode when the server key is absent", () => {
    const service = new GeoProviderConfigService({
      DRTS_ENV: "staging",
      MAP_PROVIDER_MODE: "external",
      MAP_PROVIDER_ALLOWED_ORIGINS: "https://ops.example.com",
    });

    expect(service.getHealth()).toMatchObject({
      mode: "external",
      status: "unhealthy",
      failClosed: true,
      missingSecretNames: ["MAP_PROVIDER_SERVER_KEY"],
    });
  });
});

describe("buildHealthPayload", () => {
  it("embeds the geo provider health report in the public health route", () => {
    expect(
      buildHealthPayload({
        DRTS_ENV: "staging",
        MAP_PROVIDER_MODE: "external",
        MAP_PROVIDER_SERVER_KEY: "server-key",
        MAP_PROVIDER_ALLOWED_ORIGINS: "https://ops.example.com",
      }).mapProvider,
    ).toMatchObject({
      mode: "external",
      status: "healthy",
      failClosed: false,
    });
  });
});
