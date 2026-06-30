import { describe, expect, it } from "vitest";

import {
  buildMapProviderHealthReport,
  resolveMapProviderRuntimeConfig,
} from "../../src/common/map-provider";
import { buildHealthPayload } from "../../src/health/health.controller";

describe("map provider runtime config", () => {
  it("defaults to the deterministic mock provider with documented quota thresholds", () => {
    expect(buildMapProviderHealthReport({})).toEqual({
      environment: "local",
      requestedBackend: "mock",
      effectiveBackend: "mock",
      status: "healthy",
      failClosed: false,
      reason: "Mock provider active.",
      invalidRequestedBackend: null,
      serverKeys: {
        geocoding: "missing",
        routes: "missing",
      },
      publicClient: {
        browserKey: "missing",
        allowedOrigins: [],
      },
      mobile: {
        androidKey: "missing",
        androidPackage: "missing",
        androidSha1Certs: "missing",
        iosKey: "missing",
        iosBundleId: "missing",
      },
      quota: {
        monthlyBudgetUsd: null,
        alertThresholds: [50, 80, 95],
      },
      warnings: [],
      criticalIssues: [],
    });
  });

  it("falls back to mock in local and CI when google live keys are missing", () => {
    expect(
      buildMapProviderHealthReport({
        MAP_PROVIDER_BACKEND: "google",
        NODE_ENV: "development",
      }),
    ).toMatchObject({
      environment: "local",
      requestedBackend: "google",
      effectiveBackend: "mock",
      status: "healthy",
      failClosed: false,
    });

    expect(
      buildMapProviderHealthReport({
        MAP_PROVIDER_BACKEND: "google",
        NODE_ENV: "production",
        CI: "true",
      }),
    ).toMatchObject({
      environment: "ci",
      requestedBackend: "google",
      effectiveBackend: "mock",
      status: "healthy",
      failClosed: false,
    });
  });

  it("keeps the live backend in staging and production when both server keys are present", () => {
    expect(
      resolveMapProviderRuntimeConfig({
        APP_ENV: "staging",
        MAP_PROVIDER_BACKEND: "google",
        GOOGLE_MAPS_GEOCODING_API_KEY: "geo-key",
        GOOGLE_MAPS_ROUTES_API_KEY: "route-key",
        MAP_PROVIDER_ALLOWED_ORIGINS:
          "https://ops.example, https://admin.example",
        MAP_PROVIDER_MONTHLY_BUDGET_USD: "2500",
        MAP_PROVIDER_BUDGET_ALERT_PCT: "50,80,95",
      }),
    ).toMatchObject({
      environment: "staging",
      requestedBackend: "google",
      effectiveBackend: "google",
      serverKeys: {
        geocodingConfigured: true,
        routesConfigured: true,
      },
      publicClient: {
        browserKeyConfigured: false,
        allowedOrigins: ["https://ops.example", "https://admin.example"],
      },
      quota: {
        monthlyBudgetUsd: 2500,
        alertThresholds: [50, 80, 95],
      },
    });
  });

  it("fails closed in staging and production when a google backend lacks server keys", () => {
    expect(
      buildMapProviderHealthReport({
        APP_ENV: "production",
        MAP_PROVIDER_BACKEND: "google",
        GOOGLE_MAPS_GEOCODING_API_KEY: "geo-key",
      }),
    ).toMatchObject({
      environment: "production",
      requestedBackend: "google",
      effectiveBackend: "google",
      status: "down",
      failClosed: true,
    });

    expect(() =>
      resolveMapProviderRuntimeConfig({
        APP_ENV: "production",
        MAP_PROVIDER_BACKEND: "google",
      }),
    ).toThrow(
      "GOOGLE_MAPS_GEOCODING_API_KEY and GOOGLE_MAPS_ROUTES_API_KEY are required when MAP_PROVIDER_BACKEND=google in staging/production.",
    );
  });

  it("rejects unsupported backend slugs", () => {
    expect(
      buildMapProviderHealthReport({
        MAP_PROVIDER_BACKEND: "mapbox",
      }),
    ).toMatchObject({
      requestedBackend: "mock",
      effectiveBackend: "mock",
      status: "degraded",
      invalidRequestedBackend: "mapbox",
    });

    expect(() =>
      resolveMapProviderRuntimeConfig({
        MAP_PROVIDER_BACKEND: "mapbox",
      }),
    ).toThrow('MAP_PROVIDER_BACKEND must be one of: mock, google');
  });
});

describe("buildHealthPayload", () => {
  it("embeds map provider health details in the public health route", () => {
    expect(
      buildHealthPayload({
        MAP_PROVIDER_BACKEND: "google",
        CI: "true",
      }).mapProvider,
    ).toMatchObject({
      requestedBackend: "google",
      effectiveBackend: "mock",
      status: "healthy",
    });
  });
});
