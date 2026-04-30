import { describe, expect, it, vi } from "vitest";

import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../src/modules/callcenter/callcenter.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";

function createService(options?: {
  callSessionRecordingId?: string | null;
  tenantPartnerService?: Record<string, unknown>;
}) {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => [
      {
        vehicleId: "vehicle-001",
        driverId: "driver-001",
        operatingArea: "taipei",
        serviceBuckets: ["business_dispatch"],
        etaMinutes: 6,
      },
    ]),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    linkOrderToCallSession: vi.fn(() => ({
      recordingId: options?.callSessionRecordingId ?? null,
    })),
  };
  const taskEventsService = {
    publishTaskAssigned: vi.fn(),
    publishTaskUpdated: vi.fn(),
    publishTaskCancelled: vi.fn(),
  };

  return new OwnedMobilityService(
    regulatoryRegistryService as never,
    new AuditNotificationService(),
    callcenterService as never,
    taskEventsService as never,
    undefined,
    undefined,
    options?.tenantPartnerService as never,
  );
}

describe("OwnedMobilityService compliance gates", () => {
  it("marks phone orders without recording linkage as dispatch-blocked", () => {
    const service = createService({ callSessionRecordingId: null });

    const order = service.createCallCenterOrder({
      callId: "call-001",
      agentId: "ops-agent-001",
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Songshan Airport" },
      passenger: { name: "Rider", phone: "0912000000" },
    });

    const detail = service.getOrder(order.orderId);
    const recordingGate = detail.complianceGates?.find(
      (gate) => gate.gateType === "recording",
    );

    expect(recordingGate).toMatchObject({
      state: "blocked",
      blocking: true,
      evidenceState: "missing",
    });
    expect(recordingGate?.impacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "dispatch",
          effect: "blocked",
        }),
      ]),
    );
  });

  it("releases phone orders once recording callback binding arrives", () => {
    const regulatoryRegistryService = {
      getEligibleCandidates: vi.fn(() => []),
      getVehicleDispatchability: vi.fn(() => true),
      getDriverAvailability: vi.fn(() => true),
    };
    const auditNotificationService = new AuditNotificationService();
    const callcenterService = new CallcenterService(auditNotificationService);
    const taskEventsService = {
      publishTaskAssigned: vi.fn(),
      publishTaskUpdated: vi.fn(),
      publishTaskCancelled: vi.fn(),
    };
    const service = new OwnedMobilityService(
      regulatoryRegistryService as never,
      auditNotificationService,
      callcenterService,
      taskEventsService as never,
    );

    const order = service.createCallCenterOrder({
      callId: "call-ops-001",
      agentId: "ops-agent-001",
      pickup: { address: "Taipei Main Station" },
      dropoff: { address: "Songshan Airport" },
      passenger: { name: "Rider", phone: "0912000000" },
    });

    expect(service.getOrder(order.orderId)).toMatchObject({
      status: "recording_pending",
      recordingId: null,
      complianceFlags: expect.arrayContaining(["recording_pending"]),
    });

    callcenterService.attachRecordingCallback("call-ops-001", {
      recordingId: "recording-demo-002",
      providerRecordingRef: "cti-ref-002",
      recordingUrl: "https://cti.example/recordings/recording-demo-002",
      agentId: "ops-agent-001",
    });

    expect(service.getOrder(order.orderId)).toMatchObject({
      status: "ready_for_dispatch",
      recordingId: "recording-demo-002",
      complianceFlags: expect.arrayContaining(["recording_bound"]),
    });
  });

  it("surfaces approved partner eligibility as a clear gate", () => {
    const tenantPartnerService = {
      getPartnerEntry: vi.fn(() => ({
        tenantId: "tenant-demo-001",
        partnerId: "partner-bank-001",
        programId: "program-airport-001",
        entrySlug: "bank-airport-alpha",
        businessDispatchSubtype: "credit_card_airport_transfer",
        eligibilityMode: "bank_card_inline",
      })),
      getPartnerEligibilityVerification: vi.fn(() => ({
        eligibilityVerificationId: "elig-001",
        tenantId: "tenant-demo-001",
        partnerId: "partner-bank-001",
        partnerProgramId: "program-airport-001",
        partnerProgramCode: "AIRPORT",
        partnerEntrySlug: "bank-airport-alpha",
        bankCode: "812",
        cardProgramCode: "PLAT",
        businessDispatchSubtype: "credit_card_airport_transfer",
        verificationStatus: "eligible",
        decisionSource: "issuer_realtime",
        verificationReasonCode: "APPROVED",
        adapterCode: "issuer-inline",
        adapterVersion: "v1",
        contractSnapshot: null,
        attempts: [],
        manualFallback: {
          required: false,
          reasonCode: null,
          requestedAt: null,
          requestedBy: null,
          notes: null,
        },
        referenceTokenHash: "hash",
        benefitReference: "benefit-001",
        issuerAuthorizationRef: "issuer-auth-001",
        requestMetadata: {
          cardLast4: "1234",
          cardholderName: "Rider",
          flightNo: null,
          requestId: null,
        },
        verifiedAt: "2026-05-29T00:00:00.000Z",
        expiresAt: "2026-05-30T00:00:00.000Z",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:00.000Z",
        auditMetadata: {
          source: "test",
          requestId: null,
          createdBy: "test",
          updatedBy: "test",
        },
      })),
      publishWebhookEvent: vi.fn(() => Promise.resolve()),
    };
    const service = createService({ tenantPartnerService });

    service.createTenantBooking(
      {
        businessDispatchSubtype: "credit_card_airport_transfer",
        partnerEntrySlug: "bank-airport-alpha",
        eligibilityVerificationId: "elig-001",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        reservationWindowStart: "2026-04-29T10:00:00.000Z",
        reservationWindowEnd: "2026-04-29T11:00:00.000Z",
        passenger: { name: "Rider", phone: "0912000000" },
      },
      "tenant-demo-001",
    );

    const order = service.listOrders()[0];
    const eligibilityGate = order.complianceGates?.find(
      (gate) => gate.gateType === "eligibility",
    );

    expect(eligibilityGate).toMatchObject({
      state: "clear",
      evidenceState: "verified",
      overrideAllowed: true,
    });
  });

  it("shows proof-required trips as pending until driver submits evidence", () => {
    const service = createService();

    service.createTenantBooking(
      {
        businessDispatchSubtype: "enterprise_dispatch",
        pickup: { address: "Pickup" },
        dropoff: { address: "Dropoff" },
        reservationWindowStart: "2026-04-29T10:00:00.000Z",
        reservationWindowEnd: "2026-04-29T11:00:00.000Z",
        passenger: { name: "Rider", phone: "0912000000" },
        minPhotoCount: 2,
      },
      "tenant-demo-001",
    );

    const order = service.listOrders()[0];
    service.dispatchOrder(order.orderId, { mode: "auto" });
    const dispatchJob = service.listDispatchJobs()[0];
    service.assignDispatch({
      dispatchJobId: dispatchJob.dispatchJobId,
      vehicleId: "vehicle-001",
      driverId: "driver-001",
    });

    const task = service.listDriverTasks()[0];
    const proofGate = task.complianceGates?.find(
      (gate) => gate.gateType === "proof",
    );

    expect(proofGate).toMatchObject({
      state: "pending",
      evidenceState: "missing",
    });
    expect(proofGate?.impacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "completion",
          effect: "blocked",
        }),
      ]),
    );
  });
});
