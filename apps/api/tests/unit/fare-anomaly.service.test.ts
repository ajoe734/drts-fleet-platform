import { describe, expect, it, vi } from "vitest";

import {
  FARE_QUOTE_ANOMALIES,
  type AuditLogRecord,
  type RouteFareDisclosureSnapshot,
} from "@drts/contracts";

import { ApiRequestError } from "../../src/common/api-envelope";
import { FareAnomalyController } from "../../src/modules/product-rule/fare-anomaly.controller";
import { FareAnomalyRepository } from "../../src/modules/product-rule/fare-anomaly.repository";
import { FareAnomalyService } from "../../src/modules/product-rule/fare-anomaly.service";
import type { FareQuoteRecoveryPort } from "../../src/modules/product-rule/fare-quote-recovery.port";
import {
  AUTH_ALLOWED_REALMS_KEY,
  AUTH_REQUIRED_SCOPES_KEY,
} from "../../src/common/auth";

const RETRYABLE_REASONS = [
  "quote_provider_unavailable",
  "route_unresolved",
  "calculation_mismatch",
] as const;

function buildSnapshot(
  quoteSnapshotId: string,
  passengerConfirmedAt: string | null = null,
): RouteFareDisclosureSnapshot {
  return {
    routeSnapshotId: `route-${quoteSnapshotId}`,
    quoteSnapshotId,
    orderId: `order-${quoteSnapshotId}`,
    pickup: {
      address: "台北市信義區松仁路",
      lat: 25.033,
      lng: 121.568,
      coordinateSource: "provider_geocode",
      geocodeConfidence: "rooftop",
      resolvedAt: "2026-07-24T08:00:00.000Z",
    },
    dropoff: {
      address: "台北市南港區經貿二路",
      lat: 25.056,
      lng: 121.618,
      coordinateSource: "provider_geocode",
      geocodeConfidence: "rooftop",
      resolvedAt: "2026-07-24T08:01:00.000Z",
    },
    estimatedDistanceMeters: 8200,
    estimatedDurationSeconds: 1400,
    encodedPolyline: null,
    chargingMode: "fixed_quote",
    estimatedFareMinor: 31000,
    payableFareMinor: 35500,
    currency: "NTD",
    farePolicyId: "fare-policy-001",
    farePolicyVersion: "FARE-MTX-2026-07",
    fareChangeRuleId: "fare-change-001",
    fareChangeRuleVersion: "1",
    fareChangeRuleDisplayText: "Fare changes require passenger confirmation.",
    passengerConfirmedAt,
    generatedAt: "2026-07-24T08:02:00.000Z",
  };
}

function buildAudit(requestId?: string): AuditLogRecord {
  return {
    auditId: "11111111-1111-4111-8111-111111111111",
    actorId: "platform-admin-001",
    actorType: "platform_admin",
    tenantId: null,
    moduleName: "product-rule",
    actionName: "retry_fare_quote",
    resourceType: "fare_quote_anomaly",
    resourceId: "quote-001",
    requestId: requestId ?? "request-001",
    createdAt: "2026-07-24T09:00:00.000Z",
  };
}

async function createService(options?: {
  recoveryAvailable?: boolean;
  recoveryStatus?: "accepted" | "completed";
}) {
  const repository = new FareAnomalyRepository(undefined);
  const auditNotificationService = {
    recordAuditLog: vi.fn(
      (input: { requestId?: string; resourceId?: string | null }) => ({
        ...buildAudit(input.requestId),
        resourceId: input.resourceId ?? null,
      }),
    ),
  };
  const recoveryPort: FareQuoteRecoveryPort = {
    isAvailable: vi.fn(() => options?.recoveryAvailable ?? false),
    recover: vi.fn(async () => ({
      status: options?.recoveryStatus ?? "accepted",
      message: "Fare quote recovery accepted.",
    })),
  };
  const service = new FareAnomalyService(
    repository,
    auditNotificationService as never,
    recoveryPort,
  );
  await service.onModuleInit();
  return { service, repository, auditNotificationService, recoveryPort };
}

describe("FareAnomalyService", () => {
  it("exposes all five canonical reasons without enabling an unavailable provider", async () => {
    const { service } = await createService();

    await Promise.all(
      FARE_QUOTE_ANOMALIES.map((reason, index) =>
        service.recordQuoteAnomaly({
          reason,
          snapshot: buildSnapshot(`quote-${index + 1}`),
        }),
      ),
    );

    const items = service.list();
    expect(new Set(items.map((item) => item.reason))).toEqual(
      new Set(FARE_QUOTE_ANOMALIES),
    );

    for (const item of items) {
      const retry = item.availableActions.find(
        (action) => action.action === "retry_quote",
      );
      if (RETRYABLE_REASONS.some((reason) => reason === item.reason)) {
        expect(retry).toMatchObject({
          enabled: false,
          disabledReasonCode: "FARE_QUOTE_PROVIDER_NOT_PROVISIONED",
        });
      } else {
        expect(retry).toBeUndefined();
      }
    }
  });

  it("filters by canonical reason and rejects unknown reasons", async () => {
    const { service } = await createService();
    await service.recordQuoteAnomaly({
      reason: "route_unresolved",
      snapshot: buildSnapshot("quote-route"),
    });

    expect(service.list("route_unresolved")).toHaveLength(1);
    expect(() => service.list("manual_fare_override")).toThrowError(
      ApiRequestError,
    );
  });

  it("rejects anomaly records that were already passenger-confirmed", async () => {
    const { service } = await createService();

    await expect(
      service.recordQuoteAnomaly({
        reason: "calculation_mismatch",
        snapshot: buildSnapshot("quote-confirmed", "2026-07-24T08:03:00.000Z"),
      }),
    ).rejects.toThrowError(ApiRequestError);
    expect(service.list()).toHaveLength(0);
  });

  it("fails closed when retry is not in enabled server authority", async () => {
    const { service, auditNotificationService, recoveryPort } =
      await createService();
    await service.recordQuoteAnomaly({
      reason: "quote_provider_unavailable",
      snapshot: buildSnapshot("quote-disabled"),
    });

    await expect(
      service.retryQuote("quote-disabled", {
        actorId: "platform-admin-001",
        idempotencyKey: "idem-disabled",
      }),
    ).rejects.toThrowError(ApiRequestError);
    expect(recoveryPort.recover).not.toHaveBeenCalled();
    expect(auditNotificationService.recordAuditLog).not.toHaveBeenCalled();
  });

  it("requires an idempotency key and reuses an accepted recovery receipt", async () => {
    const { service, recoveryPort, auditNotificationService } =
      await createService({ recoveryAvailable: true });
    await service.recordQuoteAnomaly({
      reason: "route_unresolved",
      snapshot: buildSnapshot("quote-retry"),
    });

    await expect(
      service.retryQuote("quote-retry", {
        actorId: "platform-admin-001",
      }),
    ).rejects.toThrowError(ApiRequestError);

    const first = await service.retryQuote("quote-retry", {
      actorId: "platform-admin-001",
      idempotencyKey: "idem-retry",
      requestId: "request-retry",
    });
    const second = await service.retryQuote("quote-retry", {
      actorId: "platform-admin-001",
      idempotencyKey: "idem-retry",
      requestId: "request-retry-duplicate",
    });

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      actionId: "idem-retry",
      status: "accepted",
      resourceType: "fare_quote_anomaly",
      resourceId: "quote-retry",
    });
    expect(recoveryPort.recover).toHaveBeenCalledTimes(1);
    expect(auditNotificationService.recordAuditLog).toHaveBeenCalledTimes(1);
    expect(service.get("quote-retry")).toMatchObject({
      recoveryPending: true,
      availableActions: [
        {
          action: "retry_quote",
          enabled: false,
          disabledReasonCode: "FARE_QUOTE_RECOVERY_PENDING",
        },
      ],
    });
  });

  it("removes a synchronously recovered anomaly from the unresolved queue", async () => {
    const { service } = await createService({
      recoveryAvailable: true,
      recoveryStatus: "completed",
    });
    await service.recordQuoteAnomaly({
      reason: "calculation_mismatch",
      snapshot: buildSnapshot("quote-completed"),
    });

    const receipt = await service.retryQuote("quote-completed", {
      actorId: "platform-admin-001",
      idempotencyKey: "idem-completed",
    });

    expect(receipt.status).toBe("completed");
    expect(service.list()).toHaveLength(0);
  });
});

describe("FareAnomalyController authorization contract", () => {
  it("requires the platform realm and read/write scopes", () => {
    expect(
      Reflect.getMetadata(AUTH_ALLOWED_REALMS_KEY, FareAnomalyController),
    ).toEqual(["platform"]);
    expect(
      Reflect.getMetadata(
        AUTH_REQUIRED_SCOPES_KEY,
        FareAnomalyController.prototype.list,
      ),
    ).toEqual(["foundation:read"]);
    expect(
      Reflect.getMetadata(
        AUTH_REQUIRED_SCOPES_KEY,
        FareAnomalyController.prototype.get,
      ),
    ).toEqual(["foundation:read"]);
    expect(
      Reflect.getMetadata(
        AUTH_REQUIRED_SCOPES_KEY,
        FareAnomalyController.prototype.retryQuote,
      ),
    ).toEqual(["foundation:write"]);
  });
});
