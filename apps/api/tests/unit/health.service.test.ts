import { describe, expect, it } from "vitest";
import type { AdapterHealthRecord } from "@drts/contracts";

import { HealthService } from "../../src/health/health.service";

describe("HealthService", () => {
  it("returns a healthy UiHealthEnvelope when all dependencies are healthy", () => {
    const service = new HealthService({
      listAdapterHealth: () => [
        buildAdapterHealthRecord({
          platformCode: "sandbox",
          status: "healthy",
          reason: "none",
          lastCheckedAt: "2026-05-26T08:00:00.000Z",
        }),
      ],
    } as never);

    expect(service.getHealthEnvelope()).toEqual({
      status: "healthy",
      degradedServices: [],
      lastCheckedAt: "2026-05-26T08:00:00.000Z",
    });
  });

  it("returns degraded with warning services when a dependency is degraded", () => {
    const service = new HealthService({
      listAdapterHealth: () => [
        buildAdapterHealthRecord({
          platformCode: "sandbox",
          status: "degraded",
          reason: "webhook",
          lastCheckedAt: "2026-05-26T08:05:00.000Z",
        }),
      ],
    } as never);

    expect(service.getHealthEnvelope()).toEqual({
      status: "degraded",
      degradedServices: [
        {
          service: "sandbox",
          impact: "Forwarded webhook delivery",
          severity: "warning",
        },
      ],
      lastCheckedAt: "2026-05-26T08:05:00.000Z",
    });
  });

  it("returns down with critical services when a dependency is down", () => {
    const service = new HealthService({
      listAdapterHealth: () => [
        buildAdapterHealthRecord({
          platformCode: "sandbox",
          status: "down",
          reason: "credential",
          lastCheckedAt: "2026-05-26T08:10:00.000Z",
        }),
      ],
    } as never);

    expect(service.getHealthEnvelope()).toEqual({
      status: "down",
      degradedServices: [
        {
          service: "sandbox",
          impact: "Forwarder credentials",
          severity: "critical",
        },
      ],
      lastCheckedAt: "2026-05-26T08:10:00.000Z",
    });
  });

  it("returns per-dependency degraded services in a stable order", () => {
    const service = new HealthService({
      listAdapterHealth: () => [
        buildAdapterHealthRecord({
          platformCode: "gocab-v1",
          status: "degraded",
          reason: "rate_limit",
          lastCheckedAt: "2026-05-26T08:12:00.000Z",
        }),
        buildAdapterHealthRecord({
          platformCode: "sandbox",
          status: "down",
          reason: "platform",
          lastCheckedAt: "2026-05-26T08:15:00.000Z",
        }),
        buildAdapterHealthRecord({
          platformCode: "grab-tw",
          status: "healthy",
          reason: "none",
          lastCheckedAt: "2026-05-26T08:14:00.000Z",
        }),
      ],
    } as never);

    expect(service.getHealthEnvelope()).toEqual({
      status: "down",
      degradedServices: [
        {
          service: "gocab-v1",
          impact: "Forwarder API rate limits",
          severity: "warning",
        },
        {
          service: "sandbox",
          impact: "Forwarded order sync",
          severity: "critical",
        },
      ],
      lastCheckedAt: "2026-05-26T08:15:00.000Z",
    });
  });
});

function buildAdapterHealthRecord(
  overrides: Partial<AdapterHealthRecord> &
    Pick<
      AdapterHealthRecord,
      "platformCode" | "status" | "reason" | "lastCheckedAt"
    >,
): AdapterHealthRecord {
  return {
    platformCode: overrides.platformCode,
    status: overrides.status,
    reason: overrides.reason,
    capabilitySummary: {
      mode: "api",
      productionStatus: "live",
      supportsInboundWebhook: true,
      supportsOutboundActions: true,
      supportedWebhookEvents: [],
      notes: [],
    },
    credentialStatus: "valid",
    authStatus: "healthy",
    webhookStatus: "healthy",
    rateLimitStatus: "healthy",
    lastCheckedAt: overrides.lastCheckedAt,
    lastError: null,
    lastWebhookReceivedAt: null,
    lastRateLimitAt: null,
    lastAuthFailureAt: null,
    ...overrides,
  };
}
