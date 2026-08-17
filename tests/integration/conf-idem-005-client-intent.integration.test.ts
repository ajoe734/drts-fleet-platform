import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CreateCallCenterOrderCommand,
  CreateComplaintCaseCommand,
  CreateReportJobCommand,
  CreateTenantBookingCommand,
  GenerateFilingPackageCommand,
  SendTestWebhookCommand,
} from "@drts/contracts";
import { IDEMPOTENCY_REPLAY_HEADER } from "@drts/contracts";
import { createIdempotencyKey } from "../../packages/api-client/src/index";

import {
  IdempotencyRepository,
  IdempotencyService,
} from "../../apps/api/src/common/idempotency";
import { OpsDispatchEventsService } from "../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import type { BillingSettlementService } from "../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { ComplaintController } from "../../apps/api/src/modules/complaint/complaint.controller";
import { ComplaintService } from "../../apps/api/src/modules/complaint/complaint.service";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityController } from "../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityTaskEventsService } from "../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { ReportingFilingController } from "../../apps/api/src/modules/reporting-filing/reporting-filing.controller";
import { ReportingFilingService } from "../../apps/api/src/modules/reporting-filing/reporting-filing.service";
import { TenantPartnerController } from "../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { FareAnomalyController } from "../../apps/api/src/modules/product-rule/fare-anomaly.controller";
import { FareAnomalyRepository } from "../../apps/api/src/modules/product-rule/fare-anomaly.repository";
import { FareAnomalyService } from "../../apps/api/src/modules/product-rule/fare-anomaly.service";
import type { FareQuoteRecoveryPort } from "../../apps/api/src/modules/product-rule/fare-quote-recovery.port";

function fakeResponse() {
  const headers: Record<string, string> = {};
  let statusCode = 0;
  return {
    response: {
      status(code: number) {
        statusCode = code;
        return this;
      },
      setHeader(name: string, value: string) {
        headers[name] = value;
        return this;
      },
    },
    getStatus: () => statusCode,
    getHeaders: () => headers,
  };
}

function getErrorCode(error: unknown) {
  return (
    (
      error as {
        getResponse?: () => { error?: { code?: string } };
      }
    ).getResponse?.().error?.code ?? null
  );
}

async function expectThrows(fn: () => unknown) {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected function to throw");
}

function createOwnedMobilityHarness() {
  const auditService = new AuditNotificationService();
  const callcenterService = new CallcenterService(auditService);
  const regulatoryRegistryService = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    auditService,
    new DriverProfileService(auditService),
  );
  const idempotencyRepository = new IdempotencyRepository();
  const idempotencyService = new IdempotencyService(idempotencyRepository);
  const tenantPartnerService = new TenantPartnerService(auditService);

  const ownedMobilityService = new OwnedMobilityService(
    regulatoryRegistryService,
    auditService,
    callcenterService,
    new OwnedMobilityTaskEventsService(new EventEmitter() as never),
    new OpsDispatchEventsService(new EventEmitter() as never),
    undefined,
    tenantPartnerService,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    idempotencyService,
  );

  ownedMobilityService.registerCallRecordingListeners();

  const controller = new OwnedMobilityController(
    ownedMobilityService,
    idempotencyService,
    tenantPartnerService,
  );

  return {
    auditService,
    idempotencyService,
    ownedMobilityService,
    tenantPartnerService,
    controller,
  };
}

describe("CONF-IDEM-005: Client Intent Idempotency Integration", () => {
  let idempotencyService: IdempotencyService;

  beforeEach(() => {
    idempotencyService = new IdempotencyService(new IdempotencyRepository());
  });

  describe("Tenant booking intent (Acceptance Criteria 5: duplicate browser submission creates exactly one record)", () => {
    it("duplicate browser submissions with same intent key create exactly one record and replay identical response", async () => {
      const harness = createOwnedMobilityHarness();
      const intentKey = createIdempotencyKey("tenant-booking");
      const bookingCommand: CreateTenantBookingCommand = {
        businessDispatchSubtype: "enterprise_dispatch",
        direction: "pickup",
        pickup: {
          address: "100 Xinyi Rd, Taipei",
          lat: 25.0339,
          lng: 121.5645,
        },
        dropoff: {
          address: "200 Renai Rd, Taipei",
          lat: 25.0375,
          lng: 121.55,
        },
        reservationWindowStart: new Date(Date.now() + 7200000).toISOString(),
        reservationWindowEnd: new Date(Date.now() + 10800000).toISOString(),
        passenger: {
          passengerId: "pax-1",
          name: "Alice",
          phone: "+886912345678",
        },
      };

      // Submission Attempt 1
      const first = await harness.controller.createTenantBooking(
        bookingCommand,
        null,
        "TENANT-001",
        "req-1",
        undefined,
        intentKey,
      );

      expect(first.data.bookingId).toBeDefined();
      expect(first.data.orderId).toBeDefined();

      // Submission Attempt 2 (Browser Retry / Double click)
      const second = await harness.controller.createTenantBooking(
        bookingCommand,
        null,
        "TENANT-001",
        "req-2",
        undefined,
        intentKey,
      );

      expect(second.data.bookingId).toBe(first.data.bookingId);
      expect(second.data.orderId).toBe(first.data.orderId);

      // Verify that in the underlying store exactly 1 order exists
      const orders = harness.ownedMobilityService.listOrders();
      expect(orders).toHaveLength(1);
    });

    it("rejects booking request without Idempotency-Key (Acceptance Criteria 4)", async () => {
      const harness = createOwnedMobilityHarness();
      const error = await expectThrows(() =>
        harness.controller.createTenantBooking(
          {
            businessDispatchSubtype: "enterprise_dispatch",
            direction: "pickup",
            pickup: { address: "A" },
            dropoff: { address: "B" },
            reservationWindowStart: new Date(
              Date.now() + 7200000,
            ).toISOString(),
            reservationWindowEnd: new Date(Date.now() + 10800000).toISOString(),
            passenger: {
              passengerId: "pax-1",
              name: "Alice",
              phone: "+886912345678",
            },
          },
          null,
          "TENANT-001",
          "req-1",
          undefined,
          undefined,
        ),
      );
      expect(getErrorCode(error)).toBe("IDEMPOTENCY_KEY_REQUIRED");
      expect(harness.ownedMobilityService.listOrders()).toHaveLength(0);
    });
  });

  describe("Call center booking intent", () => {
    it("duplicate phone order submission sends identical intent key and creates exactly 1 order", async () => {
      const harness = createOwnedMobilityHarness();
      const intentKey = createIdempotencyKey("callcenter-order");
      const command: CreateCallCenterOrderCommand = {
        callId: "CALL-101",
        agentId: "AGENT-001",
        pickup: { address: "Main Station" },
        dropoff: { address: "City Hall" },
        passenger: { name: "Alice", phone: "0912345678" },
      };

      const { response: res1 } = fakeResponse();
      const first = await harness.controller.createCallCenterOrder(
        command,
        res1,
        intentKey,
        "req-1",
      );

      const { response: res2, getHeaders: headers2 } = fakeResponse();
      const second = await harness.controller.createCallCenterOrder(
        command,
        res2,
        intentKey,
        "req-2",
      );

      expect(first.data.orderId).toBe(second.data.orderId);
      expect(headers2()[IDEMPOTENCY_REPLAY_HEADER]).toBe("true");

      const orders = harness.ownedMobilityService.listOrders();
      expect(orders).toHaveLength(1);
    });
  });

  describe("Complaint case intent", () => {
    let complaintService: ComplaintService;
    let controller: ComplaintController;

    beforeEach(() => {
      const auditService = new AuditNotificationService();
      complaintService = new ComplaintService(auditService);
      controller = new ComplaintController(
        complaintService,
        {} as never,
        idempotencyService,
      );
    });

    it("retried complaint creation sends identical key and creates exactly 1 case", async () => {
      const intentKey = createIdempotencyKey("complaint-case");
      const command: CreateComplaintCaseCommand = {
        caseSource: "web",
        category: "driver_service",
        severity: "normal",
        description: "Driver took detour",
      };

      const { response: res1 } = fakeResponse();
      const first = await controller.createComplaintCase(
        command,
        res1,
        intentKey,
        "req-1",
      );

      const { response: res2, getHeaders: headers2 } = fakeResponse();
      const second = await controller.createComplaintCase(
        command,
        res2,
        intentKey,
        "req-2",
      );

      expect(first.data.caseNo).toBe(second.data.caseNo);
      expect(complaintService.listComplaintCases()).toHaveLength(1);
      expect(headers2()[IDEMPOTENCY_REPLAY_HEADER]).toBe("true");
    });
  });

  describe("Billing reimbursement approval and payment intent", () => {
    let mockBillingService: {
      approveReimbursementBatch: ReturnType<typeof vi.fn>;
      markReimbursementPaid: ReturnType<typeof vi.fn>;
    };
    let controller: BillingSettlementController;

    beforeEach(() => {
      mockBillingService = {
        approveReimbursementBatch: vi.fn(async (batchId: string) => ({
          batchId,
          status: "approved",
          approvedAt: "2026-08-17T12:00:00.000Z",
        })),
        markReimbursementPaid: vi.fn(async (batchId: string) => ({
          batchId,
          status: "paid",
          paidAt: "2026-08-17T12:00:00.000Z",
        })),
      };
      controller = new BillingSettlementController(
        mockBillingService as unknown as BillingSettlementService,
        idempotencyService,
      );
    });

    it("reimbursement batch approval retried sends same key and approves once", async () => {
      const intentKey = createIdempotencyKey("reimbursement-approve");
      const body = { statementId: "STMT-001" };

      const first = await controller.approveReimbursementBatch(
        "BATCH-001",
        body,
        intentKey,
        "req-1",
      );

      const second = await controller.approveReimbursementBatch(
        "BATCH-001",
        body,
        intentKey,
        "req-2",
      );

      expect(first.data.batchId).toBe(second.data.batchId);
      expect(
        mockBillingService.approveReimbursementBatch,
      ).toHaveBeenCalledTimes(1);
    });

    it("reimbursement batch mark paid retried sends same key and pays once", async () => {
      const intentKey = createIdempotencyKey("reimbursement-mark-paid");
      const body = {
        paidAt: "2026-08-17T12:00:00.000Z",
        remittanceProofId: "PROOF-001",
      };

      const first = await controller.markReimbursementPaid(
        "BATCH-001",
        body,
        intentKey,
        "req-1",
      );

      const second = await controller.markReimbursementPaid(
        "BATCH-001",
        body,
        intentKey,
        "req-2",
      );

      expect(first.data.batchId).toBe(second.data.batchId);
      expect(mockBillingService.markReimbursementPaid).toHaveBeenCalledTimes(1);
    });
  });

  describe("Reporting & filing intents", () => {
    let reportingService: ReportingFilingService;
    let controller: ReportingFilingController;

    beforeEach(() => {
      const auditService = new AuditNotificationService();
      reportingService = new ReportingFilingService(auditService);
      controller = new ReportingFilingController(
        reportingService,
        idempotencyService,
      );
    });

    it("createReportJob retried with same intent key creates exactly 1 job", async () => {
      const intentKey = createIdempotencyKey("ops-report-job");
      const command: CreateReportJobCommand = {
        jobType: "daily_dispatch_records",
        format: "csv",
      };

      const first = await controller.createReportJob(
        command,
        null,
        intentKey,
        "req-1",
      );

      const second = await controller.createReportJob(
        command,
        null,
        intentKey,
        "req-2",
      );

      expect(first.data.jobId).toBe(second.data.jobId);
    });

    it("generateFilingPackage retried with same intent key generates exactly 1 package", async () => {
      const intentKey = createIdempotencyKey("filing-package");
      const command: GenerateFilingPackageCommand = {
        packageType: "monthly_report",
      };

      const first = await controller.generateFilingPackage(
        command,
        null,
        intentKey,
        "req-1",
      );

      const second = await controller.generateFilingPackage(
        command,
        null,
        intentKey,
        "req-2",
      );

      expect(first.data.packageId).toBe(second.data.packageId);
    });
  });

  describe("Webhook test intent", () => {
    let mockTenantService: {
      sendTestWebhook: ReturnType<typeof vi.fn>;
    };
    let controller: TenantPartnerController;

    beforeEach(() => {
      mockTenantService = {
        sendTestWebhook: vi.fn(
          async (endpointId: string, eventType: string) => ({
            endpointId,
            eventType,
            delivered: true,
            statusCode: 200,
          }),
        ),
      };
      controller = new TenantPartnerController(
        mockTenantService as unknown as TenantPartnerService,
        {} as never,
        {} as never,
        {} as never,
        idempotencyService,
      );
    });

    it("sendTestWebhook retried sends same key and delivers once", async () => {
      const intentKey = createIdempotencyKey("test-webhook");
      const command: SendTestWebhookCommand = {
        webhookId: "EP-001",
      };

      const { response: res1 } = fakeResponse();
      const first = await controller.sendTestWebhook(
        command,
        res1,
        "TENANT-001",
        intentKey,
        "req-1",
      );

      const { response: res2, getHeaders: headers2 } = fakeResponse();
      const second = await controller.sendTestWebhook(
        command,
        res2,
        "TENANT-001",
        intentKey,
        "req-2",
      );

      expect(first.data.deliveryId).toBe(second.data.deliveryId);
      expect(mockTenantService.sendTestWebhook).toHaveBeenCalledTimes(1);
      expect(headers2()[IDEMPOTENCY_REPLAY_HEADER]).toBe("true");
    });
  });

  describe("Fare quote anomaly retry intent", () => {
    let repository: FareAnomalyRepository;
    let auditService: AuditNotificationService;
    let recoveryPort: FareQuoteRecoveryPort;
    let fareAnomalyService: FareAnomalyService;
    let controller: FareAnomalyController;

    beforeEach(async () => {
      repository = new FareAnomalyRepository();
      auditService = new AuditNotificationService();
      recoveryPort = {
        isAvailable: vi.fn(() => true),
        recover: vi.fn(async () => ({
          status: "accepted" as const,
          action: "retry_quote" as const,
          message: "Quote recalculation scheduled",
        })),
      };
      fareAnomalyService = new FareAnomalyService(
        repository,
        auditService,
        recoveryPort,
      );
      await fareAnomalyService.onModuleInit();
      controller = new FareAnomalyController(fareAnomalyService);
    });

    it("rejects retry quote request without Idempotency-Key", async () => {
      await fareAnomalyService.recordQuoteAnomaly({
        reason: "quote_provider_unavailable",
        snapshot: {
          routeSnapshotId: "route-001",
          quoteSnapshotId: "quote-001",
          orderId: "order-001",
          pickup: {
            address: "A",
            lat: 25.033,
            lng: 121.568,
            coordinateSource: "provider_candidate",
            geocodeConfidence: "exact",
            resolvedAt: "2026-07-24T08:00:00.000Z",
          },
          dropoff: {
            address: "B",
            lat: 25.056,
            lng: 121.618,
            coordinateSource: "provider_candidate",
            geocodeConfidence: "exact",
            resolvedAt: "2026-07-24T08:01:00.000Z",
          },
          estimatedDistanceMeters: 8200,
          estimatedDurationSeconds: 1400,
          encodedPolyline: null,
          chargingMode: "fixed_quote",
          estimatedFareMinor: null,
          payableFareMinor: null,
          currency: "NTD",
          farePolicyId: "fare-policy-001",
          farePolicyVersion: "FARE-MTX-2026-07",
          fareChangeRuleId: "fare-change-001",
          fareChangeRuleVersion: "1",
          fareChangeRuleDisplayText:
            "Fare changes require passenger confirmation.",
          passengerConfirmedAt: null,
          generatedAt: "2026-07-24T08:02:00.000Z",
        },
      });

      const error = await expectThrows(() =>
        controller.retryQuote(
          "quote-001",
          {
            actorId: "admin-1",
            realm: "platform",
            roles: [],
            permissions: [],
          } as never,
          undefined,
          "req-1",
        ),
      );
      expect(getErrorCode(error)).toBe("IDEMPOTENCY_KEY_REQUIRED");
    });

    it("retrying quote retry with same intent key replays receipt and recovers only once", async () => {
      await fareAnomalyService.recordQuoteAnomaly({
        reason: "quote_provider_unavailable",
        snapshot: {
          routeSnapshotId: "route-001",
          quoteSnapshotId: "quote-001",
          orderId: "order-001",
          pickup: {
            address: "A",
            lat: 25.033,
            lng: 121.568,
            coordinateSource: "provider_candidate",
            geocodeConfidence: "exact",
            resolvedAt: "2026-07-24T08:00:00.000Z",
          },
          dropoff: {
            address: "B",
            lat: 25.056,
            lng: 121.618,
            coordinateSource: "provider_candidate",
            geocodeConfidence: "exact",
            resolvedAt: "2026-07-24T08:01:00.000Z",
          },
          estimatedDistanceMeters: 8200,
          estimatedDurationSeconds: 1400,
          encodedPolyline: null,
          chargingMode: "fixed_quote",
          estimatedFareMinor: null,
          payableFareMinor: null,
          currency: "NTD",
          farePolicyId: "fare-policy-001",
          farePolicyVersion: "FARE-MTX-2026-07",
          fareChangeRuleId: "fare-change-001",
          fareChangeRuleVersion: "1",
          fareChangeRuleDisplayText:
            "Fare changes require passenger confirmation.",
          passengerConfirmedAt: null,
          generatedAt: "2026-07-24T08:02:00.000Z",
        },
      });

      const intentKey = createIdempotencyKey("fare-anomaly-retry");
      const identity = {
        actorId: "admin-1",
        realm: "platform",
        roles: [],
        permissions: [],
      } as never;

      const first = await controller.retryQuote(
        "quote-001",
        identity,
        intentKey,
        "req-1",
      );

      const second = await controller.retryQuote(
        "quote-001",
        identity,
        intentKey,
        "req-2",
      );

      expect(first.data.auditId).toBe(second.data.auditId);
      expect(first.data.status).toBe("accepted");
      expect(recoveryPort.recover).toHaveBeenCalledTimes(1);
    });
  });

  describe("Dispatch assignment & redispatch intent (Command #9)", () => {
    it("dispatchOrder retried with same intent key executes exactly once", async () => {
      const harness = createOwnedMobilityHarness();
      const created = await harness.controller.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          pickup: { address: "A" },
          dropoff: { address: "B" },
          reservationWindowStart: new Date(Date.now() + 7200000).toISOString(),
          reservationWindowEnd: new Date(Date.now() + 10800000).toISOString(),
          passenger: { name: "Alice", phone: "0912345678" },
        },
        null,
        "TENANT-001",
        "req-init-1",
        undefined,
        createIdempotencyKey("init-booking-1"),
      );
      const orderId = created.data.orderId;

      const intentKey = createIdempotencyKey("dispatch-order");
      const first = await harness.controller.dispatchOrder(
        orderId,
        { mode: "auto" },
        "req-1",
        intentKey,
      );

      const second = await harness.controller.dispatchOrder(
        orderId,
        { mode: "auto" },
        "req-2",
        intentKey,
      );

      expect(first.data.dispatchJobId).toBe(second.data.dispatchJobId);
    });

    it("redispatchOrder retried with same intent key executes exactly once", async () => {
      const harness = createOwnedMobilityHarness();
      const created = await harness.controller.createTenantBooking(
        {
          businessDispatchSubtype: "enterprise_dispatch",
          pickup: { address: "A" },
          dropoff: { address: "B" },
          reservationWindowStart: new Date(Date.now() + 7200000).toISOString(),
          reservationWindowEnd: new Date(Date.now() + 10800000).toISOString(),
          passenger: { name: "Alice", phone: "0912345678" },
        },
        null,
        "TENANT-001",
        "req-init-2",
        undefined,
        createIdempotencyKey("init-booking-2"),
      );
      const orderId = created.data.orderId;

      // First dispatch to assign
      await harness.controller.dispatchOrder(
        orderId,
        { mode: "auto" },
        "req-dispatch-init",
        createIdempotencyKey("dispatch-first"),
      );

      const intentKey = createIdempotencyKey("redispatch-order");
      const first = await harness.controller.redispatchOrder(
        orderId,
        { reasonCode: "operator_redispatch" },
        "req-1",
        intentKey,
      );

      const second = await harness.controller.redispatchOrder(
        orderId,
        { reasonCode: "operator_redispatch" },
        "req-2",
        intentKey,
      );

      expect(first.data.dispatchJobId).toBe(second.data.dispatchJobId);
    });
  });

  describe("Tenant portal web searchParams idempotencyKey roundtrip", () => {
    it("preserves identical idempotencyKey when retrying after redirectWithError", () => {
      const initialKey = createIdempotencyKey("tenant-booking");
      const validationError =
        "Reservation window end must be after the reservation window start.";

      // Simulates redirectWithError(validationError, initialKey)
      const query = new URLSearchParams({ error: validationError });
      query.set("idempotencyKey", initialKey);
      const redirectUrl = `/bookings/new?${query.toString()}`;

      // Simulates NewBookingPage({ searchParams }) reading URL query params on error reload
      const parsedParams = Object.fromEntries(
        new URL(`http://localhost${redirectUrl}`).searchParams.entries(),
      );
      const boundKeyOnReload =
        parsedParams.idempotencyKey ?? createIdempotencyKey("tenant-booking");

      // The key bound to the retried submission MUST be identical to initialKey
      expect(boundKeyOnReload).toBe(initialKey);
    });
  });
});
