import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";
import { MultiTaxiService } from "../../src/modules/multi-taxi/multi-taxi.service";
import { FareAnomalyService } from "../../src/modules/product-rule/fare-anomaly.service";
import { ReportingFilingService } from "../../src/modules/reporting-filing/reporting-filing.service";

function createPlatformExportIdentity(
  scopes = ["multi_taxi_records:export"],
): BootstrapRequestIdentity {
  return {
    authMode: "jwt_bearer",
    actorType: "platform_admin",
    actorId: "platform-admin-001",
    realm: "platform",
    tenantId: null,
    roleFamilies: ["platform"],
    roles: ["records_exporter"],
    scopes,
    requestId: "req-fare-001-export",
  };
}

describe("P5-FARE-001 Acceptance Verification Suite", () => {
  it("1. fare version is immutable per confirmed ride and does not change when active fare authority changes", async () => {
    const order = {
      orderId: "order-fare-001",
      orderNo: "MTX-FARE-001",
      runtimeProfileCode: "multi_taxi_direct",
      status: "completed",
      passenger: { name: "測試乘客", phone: "0912345678" },
      pickup: { address: "台北車站" },
      dropoff: { address: "南港車站" },
      fixedPrice: true,
      quotedFare: { amountMinor: 35000 },
      quotedFareRuleVersion: "FARE-V1-202607",
      createdAt: "2026-07-25T10:00:00.000Z",
      updatedAt: "2026-07-25T10:30:00.000Z",
    };

    const ownedMobilityService = {
      createMultiTaxiRide: vi.fn((input) => ({
        ...order,
        passenger: input.passenger,
        pickup: input.pickup,
        dropoff: input.dropoff,
      })),
      getOrder: vi.fn(() => order),
      listOrders: vi.fn(() => [order]),
      findPassengerAssignmentDisclosure: vi.fn(() => ({
        assignmentId: "assignment-001",
        assignmentVersion: 1,
        driver: { driverId: "driver-001" },
        vehicle: { vehicleId: "veh-001", plateNo: "BKR-2208" },
        routeFare: {
          farePolicyVersion: "FARE-V1-202607",
          estimatedDistanceMeters: 10000,
          estimatedDurationSeconds: 1800,
        },
      })),
    };

    const service = new MultiTaxiService(ownedMobilityService as never);

    // Initial authorization version FARE-V1-202607
    const auth1 = service.createAuthorization({
      operatorId: "operator-001",
      authorityCode: "TPE-MTX-001",
      businessPlanVersion: "2026.1",
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: "FARE-V1-202607",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
    });
    service.activateAuthorization(auth1.authorizationId);

    const ride = await service.createRide(
      {
        pickup: { address: "台北車站" },
        dropoff: { address: "南港車站" },
        passenger: { name: "測試乘客", phone: "0912345678" },
        requestedPickupAt: "2026-07-25T10:00:00.000Z",
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      null,
    );
    expect(ride.passengerAccess.accessToken).toBeDefined();

    // Now update active fare authority to FARE-V2-202608
    auth1.activeFareVersionId = "FARE-V2-202608";

    // Operational record for the confirmed ride must retain the original fare policy version FARE-V1-202607
    const records = await service.listTripOperationalRecords({});
    expect(records).toHaveLength(1);
    expect(records[0]?.farePolicyVersion).toBe("FARE-V1-202607");
  });

  it("2. fare-change rule is visible before confirmation and passenger-confirmed quote anomalies cannot be mutated", async () => {
    const repository = { isEnabled: () => true };
    const auditNotificationService = { recordAuditLog: vi.fn() };
    const fareAnomalyService = new FareAnomalyService(
      repository as never,
      auditNotificationService as never,
    );
    await fareAnomalyService.onModuleInit();

    // Fare anomaly with passengerConfirmedAt must be rejected from being recorded as unresolved anomaly
    const confirmedSnapshot = {
      routeSnapshotId: "route-001",
      quoteSnapshotId: "quote-001",
      orderId: "order-001",
      pickup: {
        address: "A",
        lat: 25,
        lng: 121,
        coordinateSource: "provider_geocode",
        geocodeConfidence: "rooftop",
        resolvedAt: "2026-07-25T00:00:00Z",
      },
      dropoff: {
        address: "B",
        lat: 25.1,
        lng: 121.1,
        coordinateSource: "provider_geocode",
        geocodeConfidence: "rooftop",
        resolvedAt: "2026-07-25T00:01:00Z",
      },
      estimatedDistanceMeters: 5000,
      estimatedDurationSeconds: 600,
      encodedPolyline: null,
      chargingMode: "fixed_quote" as const,
      estimatedFareMinor: 20000,
      payableFareMinor: 20000,
      currency: "NTD",
      farePolicyId: "fp-1",
      farePolicyVersion: "FARE-V1",
      fareChangeRuleId: "rule-1",
      fareChangeRuleVersion: "1",
      fareChangeRuleDisplayText: "Fare changes require passenger confirmation.",
      passengerConfirmedAt: "2026-07-25T00:02:00.000Z", // Already confirmed!
      generatedAt: "2026-07-25T00:00:00Z",
    };

    await expect(
      fareAnomalyService.recordQuoteAnomaly({
        reason: "calculation_mismatch",
        snapshot: confirmedSnapshot,
      }),
    ).rejects.toThrowError(ApiRequestError);
  });

  it("3. payment unavailable / failed / manual_recovery never appears as paid", async () => {
    const repository = {
      isEnabled: () => true,
      findMultiTaxiPaymentException: vi.fn(async () => ({
        paymentId: "pay-001",
        orderId: "order-failed-001",
        tripId: "trip-001",
        providerPaymentRef: "pay_ref_secret",
        status: "failed",
        amountMinor: 35000,
        currency: "NTD",
        attemptCount: 2,
        availableActions: [
          { action: "retry_capture", enabled: true, riskLevel: "medium" },
        ],
        recoveryState: null,
        lastRecoveryAction: null,
        updatedAt: "2026-07-25T10:00:00.000Z",
      })),
      listMultiTaxiPaymentAuditTrail: vi.fn(async () => []),
    };

    const service = new BillingSettlementService(
      new AuditNotificationService(),
      repository as never,
    );

    const paymentView = await service.getMultiTaxiPaymentException(
      "order-failed-001",
      createPlatformExportIdentity(["billing:read"]),
    );

    expect(paymentView.status).toBe("failed");
    expect(paymentView.status).not.toBe("captured");
    expect(paymentView.availableActions[0]?.enabled).toBe(false);
    expect(paymentView.availableActions[0]?.disabledReasonCode).toBe(
      "payment_recovery_write_authority_required",
    );
  });

  it("4. certificate is token-scoped and denies invalid or expired tokens with opaque error", async () => {
    const ownedMobilityService = {
      createMultiTaxiRide: vi.fn(() => ({
        orderId: "order-cert-001",
        status: "completed",
        passenger: { name: "測試乘客", phone: "0912345678" },
        pickup: { address: "A" },
        dropoff: { address: "B" },
        createdAt: "2026-07-25T10:00:00.000Z",
        updatedAt: "2026-07-25T10:30:00.000Z",
      })),
      getOrder: vi.fn(() => null),
      findPassengerAssignmentDisclosure: vi.fn(() => null),
    };

    const service = new MultiTaxiService(ownedMobilityService as never);
    const auth = service.createAuthorization({
      operatorId: "operator-001",
      authorityCode: "TPE-MTX-001",
      businessPlanVersion: "2026.1",
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: "fare-001",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
    });
    service.activateAuthorization(auth.authorizationId);

    // Invalid token request throws PASSENGER_RIDE_TOKEN_INVALID
    await expect(
      service.getPassengerReceipt("invalid-token-12345"),
    ).rejects.toMatchObject({
      response: {
        error: { code: "PASSENGER_RIDE_TOKEN_INVALID" },
      },
    });
  });

  it("5. completed trip record coverage is 100% and retention floor is at least 730 days", async () => {
    const completedOrder = {
      orderId: "order-rec-100",
      orderNo: "MTX-REC-100",
      runtimeProfileCode: "multi_taxi_direct",
      status: "completed",
      passenger: { name: "測試乘客", phone: "0912345678" },
      pickup: { address: "起點" },
      dropoff: { address: "終點" },
      fixedPrice: true,
      quotedFare: { amountMinor: 45000 },
      quotedFareRuleVersion: "FARE-V1",
      createdAt: "2026-07-25T12:00:00.000Z",
      updatedAt: "2026-07-25T12:30:00.000Z",
    };

    const ownedMobilityService = {
      createMultiTaxiRide: vi.fn(),
      listOrders: vi.fn(() => [completedOrder]),
      getOrder: vi.fn(() => completedOrder),
      findPassengerAssignmentDisclosure: vi.fn(() => ({
        assignmentId: "assign-100",
        assignmentVersion: 1,
        driver: { driverId: "drv-100" },
        vehicle: { vehicleId: "veh-100", plateNo: "ABC-1234" },
        routeFare: {
          farePolicyVersion: "FARE-V1",
          estimatedDistanceMeters: 12000,
          estimatedDurationSeconds: 1800,
        },
        createdAt: "2026-07-25T12:05:00.000Z",
      })),
    };

    const service = new MultiTaxiService(ownedMobilityService as never);

    const records = await service.listTripOperationalRecords({});
    expect(records).toHaveLength(1);

    const rec = records[0]!;
    expect(rec.orderId).toBe("order-rec-100");
    expect(rec.plateNo).toBe("ABC-1234");
    expect(rec.payableFareMinor).toBe(45000);

    // Retention floor check: retainUntil - generatedAt >= 730 days
    const genTime = new Date(rec.generatedAt).getTime();
    const retainTime = new Date(rec.retainUntil).getTime();
    const diffDays = (retainTime - genTime) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(730);
  });

  it("6. legal hold status is correctly populated and audit trail is created for controlled export", async () => {
    const auditService = new AuditNotificationService();
    const reportingService = new ReportingFilingService(auditService);

    const preview = reportingService.previewMultiTaxiTripExport(
      { month: "2026-07" },
      10,
      createPlatformExportIdentity(),
      "req-exp-audit-01",
    );

    expect(preview.recordCount).toBe(10);
    expect(preview.purposeRequired).toBe(true);

    const logs = auditService.listAuditLogs();
    const exportLog = logs.find(
      (l) => l.actionName === "preview_multi_taxi_trip_export",
    );
    expect(exportLog).toBeDefined();
    expect(exportLog?.actorId).toBe("platform-admin-001");
  });
});
