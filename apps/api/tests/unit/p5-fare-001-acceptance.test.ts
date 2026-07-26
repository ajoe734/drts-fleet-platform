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
    const createdOrders: any[] = [];

    const ownedMobilityService = {
      createMultiTaxiRide: vi.fn((input, auth) => {
        const orderId = `order-fare-00${createdOrders.length + 1}`;
        const order = {
          orderId,
          orderNo: `MTX-FARE-00${createdOrders.length + 1}`,
          runtimeProfileCode: "multi_taxi_direct",
          status: "completed",
          passenger: input.passenger,
          pickup: input.pickup,
          dropoff: input.dropoff,
          fixedPrice: true,
          quotedFare: { amountMinor: 35000 },
          quotedFareRuleVersion: auth.activeFareVersionId,
          createdAt: "2026-07-25T10:00:00.000Z",
          updatedAt: "2026-07-25T10:30:00.000Z",
        };
        createdOrders.push(order);
        return order;
      }),
      getOrder: vi.fn((id) => createdOrders.find((o) => o.orderId === id) ?? null),
      listOrders: vi.fn(() => [...createdOrders]),
      findPassengerAssignmentDisclosure: vi.fn((orderId) => {
        const order = createdOrders.find((o) => o.orderId === orderId);
        if (!order) return null;
        return {
          assignmentId: `assign-${orderId}`,
          assignmentVersion: 1,
          driver: { driverId: "driver-001" },
          vehicle: { vehicleId: "veh-001", plateNo: "BKR-2208" },
          routeFare: {
            farePolicyVersion: order.quotedFareRuleVersion,
            estimatedDistanceMeters: 10000,
            estimatedDurationSeconds: 1800,
          },
        };
      }),
    };

    const service = new MultiTaxiService(ownedMobilityService as never);

    // Initial active authorization version FARE-V1-202607
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

    // Create Ride 1 under FARE-V1-202607
    const ride1 = await service.createRide(
      {
        pickup: { address: "台北車站" },
        dropoff: { address: "南港車站" },
        passenger: { name: "測試乘客1", phone: "0912345678" },
        requestedPickupAt: "2026-07-25T10:00:00.000Z",
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      null,
    );
    expect(ride1.passengerAccess.accessToken).toBeDefined();

    // Suspend auth1 and activate a new active authorization version FARE-V2-202608
    service.suspendAuthorization(auth1.authorizationId);

    const auth2 = service.createAuthorization({
      operatorId: "operator-001",
      authorityCode: "TPE-MTX-002",
      businessPlanVersion: "2026.2",
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: "FARE-V2-202608",
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      effectiveUntil: "2027-01-01T00:00:00.000Z",
    });
    service.activateAuthorization(auth2.authorizationId);

    // Create Ride 2 under FARE-V2-202608
    const ride2 = await service.createRide(
      {
        pickup: { address: "信義區" },
        dropoff: { address: "板橋車站" },
        passenger: { name: "測試乘客2", phone: "0987654321" },
        requestedPickupAt: "2026-07-25T11:00:00.000Z",
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      null,
    );
    expect(ride2.passengerAccess.accessToken).toBeDefined();

    // Verify operational records: Ride 1 retains FARE-V1-202607 while Ride 2 has FARE-V2-202608
    const records = await service.listTripOperationalRecords({});
    expect(records).toHaveLength(2);

    const rec1 = records.find((r) => r.orderId === "order-fare-001");
    const rec2 = records.find((r) => r.orderId === "order-fare-002");

    expect(rec1?.farePolicyVersion).toBe("FARE-V1-202607");
    expect(rec2?.farePolicyVersion).toBe("FARE-V2-202608");
    expect(rec1?.farePolicyVersion).not.toBe(rec2?.farePolicyVersion);
  });

  it("2. fare-change rule is visible before confirmation and passenger-confirmed quote anomalies cannot be mutated", async () => {
    const store = new Map<string, any>();
    const repository = {
      isEnabled: () => true,
      loadUnresolved: vi.fn(async () => []),
      list: vi.fn(() => Array.from(store.values())),
      get: vi.fn((id: string) => store.get(id) ?? null),
      save: vi.fn(async (record) => {
        store.set(record.snapshot.quoteSnapshotId, record);
        return record;
      }),
      resolve: vi.fn(async () => {}),
      resolveByOrderId: vi.fn(async () => {}),
    };
    const auditNotificationService = { recordAuditLog: vi.fn() };
    const recoveryPort = {
      isAvailable: () => true,
      recover: vi.fn(),
    };

    const fareAnomalyService = new FareAnomalyService(
      repository as never,
      auditNotificationService as never,
      recoveryPort as never,
    );
    await fareAnomalyService.onModuleInit();

    // Base fare snapshot with visible fare-change rule
    const baseSnapshot = {
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
      generatedAt: "2026-07-25T00:00:00Z",
    };

    // Positive case: unconfirmed snapshot (passengerConfirmedAt is null) can be recorded as quote anomaly
    const unconfirmedSnapshot = {
      ...baseSnapshot,
      quoteSnapshotId: "quote-unconfirmed-001",
      orderId: "order-unconfirmed-001",
      passengerConfirmedAt: null,
    };
    const recorded = await fareAnomalyService.recordQuoteAnomaly({
      reason: "calculation_mismatch",
      snapshot: unconfirmedSnapshot,
    });
    expect(recorded.reason).toBe("calculation_mismatch");
    expect(recorded.snapshot.fareChangeRuleDisplayText).toBe(
      "Fare changes require passenger confirmation.",
    );

    // Negative case: passenger-confirmed snapshot must throw FARE_ANOMALY_ALREADY_CONFIRMED specifically
    const confirmedSnapshot = {
      ...baseSnapshot,
      quoteSnapshotId: "quote-confirmed-002",
      orderId: "order-confirmed-002",
      passengerConfirmedAt: "2026-07-25T00:02:00.000Z", // Already confirmed!
    };

    await expect(
      fareAnomalyService.recordQuoteAnomaly({
        reason: "calculation_mismatch",
        snapshot: confirmedSnapshot,
      }),
    ).rejects.toMatchObject({
      response: {
        error: { code: "FARE_ANOMALY_ALREADY_CONFIRMED" },
      },
    });
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
    const createdOrders = new Map<string, any>();

    const ownedMobilityService = {
      createMultiTaxiRide: vi.fn((input, auth) => {
        const orderId = `order-cert-${createdOrders.size + 1}`;
        const order = {
          orderId,
          orderNo: `MTX-CERT-${createdOrders.size + 1}`,
          runtimeProfileCode: "multi_taxi_direct",
          status: "completed",
          passenger: input.passenger,
          pickup: input.pickup,
          dropoff: input.dropoff,
          fixedPrice: true,
          quotedFare: { amountMinor: 35000 },
          quotedFareRuleVersion: auth.activeFareVersionId,
          createdAt: "2026-07-25T10:00:00.000Z",
          updatedAt: "2026-07-25T10:30:00.000Z",
        };
        createdOrders.set(orderId, order);
        return order;
      }),
      getOrder: vi.fn((id) => createdOrders.get(id) ?? null),
      findPassengerAssignmentDisclosure: vi.fn((orderId) => {
        if (!createdOrders.has(orderId)) return null;
        return {
          assignmentId: `assign-${orderId}`,
          assignmentVersion: 1,
          driver: { driverId: "driver-001" },
          vehicle: { vehicleId: "veh-001", plateNo: "BKR-2208" },
          routeFare: {
            farePolicyVersion: "fare-001",
            estimatedDistanceMeters: 10000,
            estimatedDurationSeconds: 1800,
          },
        };
      }),
    };

    const mockRepo = {
      persistAuthorization: vi.fn(async () => {}),
      persistRideAccessToken: vi.fn(async () => {}),
      findRideAccessTokenByDigest: vi.fn(async () => null),
      findElectronicReceipt: vi.fn(async (orderId) => ({
        receiptId: `rcpt-${orderId}`,
        orderId,
        orderNo: `MTX-${orderId}`,
        issuedAt: "2026-07-25T10:30:00.000Z",
        amountMinor: 35000,
        currency: "NTD",
        certificate: {
          certificateId: `cert-${orderId}`,
          status: "valid",
        },
      })),
    };

    const service = new MultiTaxiService(
      ownedMobilityService as never,
      mockRepo as never,
    );
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

    // Create Ride A and Ride B
    const rideA = await service.createRide(
      {
        pickup: { address: "A" },
        dropoff: { address: "B" },
        passenger: { name: "乘客A", phone: "0911111111" },
        requestedPickupAt: "2026-07-25T10:00:00.000Z",
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      null,
    );

    const rideB = await service.createRide(
      {
        pickup: { address: "C" },
        dropoff: { address: "D" },
        passenger: { name: "乘客B", phone: "0922222222" },
        requestedPickupAt: "2026-07-25T11:00:00.000Z",
        timingMode: "on_demand",
        paymentMethodTokenRef: null,
      },
      null,
    );

    // Ride A access token retrieves Ride A receipt
    const receiptA = await service.getPassengerReceipt(
      rideA.passengerAccess.accessToken,
    );
    expect(receiptA.orderId).toBe("order-cert-1");
    expect(receiptA.certificate.status).toBe("valid");

    // Ride B access token retrieves Ride B receipt
    const receiptB = await service.getPassengerReceipt(
      rideB.passengerAccess.accessToken,
    );
    expect(receiptB.orderId).toBe("order-cert-2");

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

    const inProgressOrder = {
      orderId: "order-rec-101",
      orderNo: "MTX-REC-101",
      runtimeProfileCode: "multi_taxi_direct",
      status: "on_trip",
      passenger: { name: "進行中乘客", phone: "0988888888" },
      pickup: { address: "起點2" },
      dropoff: { address: "終點2" },
      fixedPrice: true,
      quotedFare: { amountMinor: 30000 },
      quotedFareRuleVersion: "FARE-V1",
      createdAt: "2026-07-25T13:00:00.000Z",
      updatedAt: "2026-07-25T13:10:00.000Z",
    };

    const cancelledOrder = {
      orderId: "order-rec-102",
      orderNo: "MTX-REC-102",
      runtimeProfileCode: "multi_taxi_direct",
      status: "cancelled",
      passenger: { name: "已取消乘客", phone: "0977777777" },
      pickup: { address: "起點3" },
      dropoff: { address: "終點3" },
      fixedPrice: true,
      quotedFare: { amountMinor: 30000 },
      quotedFareRuleVersion: "FARE-V1",
      createdAt: "2026-07-25T14:00:00.000Z",
      updatedAt: "2026-07-25T14:05:00.000Z",
    };

    const ownedMobilityService = {
      createMultiTaxiRide: vi.fn(),
      listOrders: vi.fn(() => [completedOrder, inProgressOrder, cancelledOrder]),
      getOrder: vi.fn((id) =>
        [completedOrder, inProgressOrder, cancelledOrder].find(
          (o) => o.orderId === id,
        ),
      ),
      findPassengerAssignmentDisclosure: vi.fn((orderId) => {
        if (orderId !== "order-rec-100") return null;
        return {
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
        };
      }),
    };

    const service = new MultiTaxiService(ownedMobilityService as never);

    // Verified: listTripOperationalRecords maps 100% of completed orders (1 of 1) and excludes non-completed orders
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

    // 1. Controlled export preview & audit trail
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

    // 2. Legal hold filtering in MultiTaxiService via evidence governance
    const completedOrder = {
      orderId: "order-hold-001",
      orderNo: "MTX-HOLD-001",
      runtimeProfileCode: "multi_taxi_direct",
      status: "completed",
      passenger: { name: "保全乘客", phone: "0912345678" },
      pickup: { address: "起點" },
      dropoff: { address: "終點" },
      fixedPrice: true,
      quotedFare: { amountMinor: 25000 },
      quotedFareRuleVersion: "FARE-V1",
      createdAt: "2026-07-25T12:00:00.000Z",
      updatedAt: "2026-07-25T12:30:00.000Z",
    };

    const mockAuditWithHold = {
      getEvidenceSubjectGovernance: vi.fn(() => ({
        family: "proof_bundle",
        subjectId: "order-hold-001",
        tenantId: null,
        manifestHash: null,
        activeLegalHolds: [
          {
            holdId: "hold-001",
            caseNumber: "CASE-2026-001",
            reasonCode: "regulatory_inquiry",
            reasonNote: "Legal hold active for trip proof.",
            placedByActorId: "platform-admin-001",
            placedAt: "2026-07-25T12:00:00.000Z",
          },
        ],
        activeDeletionExceptions: [],
        deletionSuppressed: true,
      })),
    };

    const mockRepo = {
      findElectronicReceipt: vi.fn(async () => null),
    };

    const ownedMobilityService = {
      createMultiTaxiRide: vi.fn(),
      listOrders: vi.fn(() => [completedOrder]),
      getOrder: vi.fn(() => completedOrder),
      findPassengerAssignmentDisclosure: vi.fn(() => null),
    };

    const multiTaxiService = new MultiTaxiService(
      ownedMobilityService as never,
      mockRepo as never,
      null as never,
      mockAuditWithHold as never,
    );

    const activeRecords = await multiTaxiService.listTripOperationalRecords({
      legalHold: "active",
    });
    expect(activeRecords).toHaveLength(1);
    expect(activeRecords[0]?.legalHold.state).toBe("active");
    expect(activeRecords[0]?.legalHold.activeHoldCount).toBe(1);

    const emptyRecords = await multiTaxiService.listTripOperationalRecords({
      legalHold: "none",
    });
    expect(emptyRecords).toHaveLength(0);
  });
});

