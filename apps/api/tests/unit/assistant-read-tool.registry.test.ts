import { describe, expect, it, vi } from "vitest";

import { ApiRequestError } from "../../src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { AssistantReadToolRegistry } from "../../src/modules/assistant/tools/assistant-read-tool.registry";

function createIdentity(
  overrides: Partial<BootstrapRequestIdentity>,
): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "ops_user",
    actorId: "ops-001",
    realm: "ops",
    tenantId: null,
    partnerId: null,
    partnerProgramId: null,
    partnerEntrySlug: null,
    roleFamilies: ["ops"],
    roles: ["ops_user"],
    scopes: ["*"],
    requestId: "req-assistant-tool-test",
    ...overrides,
  };
}

function createRegistry() {
  const orders = [
    {
      orderId: "order-tenant-001",
      orderNo: "ORD-001",
      orderSource: "app",
      orderDomain: "owned",
      tenantId: "tenant-001",
      partnerId: null,
      partnerProgramId: null,
      partnerEntrySlug: null,
      eligibilityVerificationId: null,
      issuerAuthorizationRef: "issuer-authz-12345678",
      serviceBucket: "business_dispatch",
      dispatchSemantics: "reservation",
      businessDispatchSubtype: "enterprise_dispatch",
      status: "ready_for_dispatch",
      pickup: {
        address: "台北市信義區市府路 1 號",
        addressName: "HQ",
        lat: 25.03,
        lng: 121.56,
      },
      dropoff: {
        address: "台北市南港區經貿二路 66 號",
        addressName: "Office",
        lat: 25.05,
        lng: 121.61,
      },
      passenger: {
        passengerId: "passenger-001",
        name: "王小美",
        phone: "0911222333",
        roles: ["employee"],
      },
      bookingId: "booking-001",
      bookingType: "tenant_portal",
      etaSnapshot: null,
      callId: "call-1234567890",
      recordingId: "rec-1234567890",
      reservationWindowStart: null,
      reservationWindowEnd: null,
      recurrenceRule: null,
      modifiableUntil: null,
      cancelableUntil: null,
      bookedBy: {
        name: "林管理員",
        email: "tenant-admin@example.com",
      },
      onsiteContact: {
        name: "陳聯絡人",
        phone: "0922000111",
      },
      costCenter: "CC-100",
      vehiclePreference: null,
      benefitReference: "benefit-12345678",
      direction: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
      notes: "Passenger called from 0911222333",
      fixedPrice: false,
      quotedFare: null,
      quotedFareSource: null,
      quotedFareRuleVersion: null,
      manualFareOverride: null,
      exceptionHold: null,
      proofRequirements: {
        minPhotoCount: 0,
        signoffRequired: false,
        expenseProofRequired: false,
      },
      approvalState: "not_required",
      approvalRequestIds: [],
      complianceFlags: [],
      cancelledAt: null,
      cancelReason: null,
      reservationHoldStatus: "none",
      reservationHoldId: null,
      reservationHoldExpiresAt: null,
      dispatchAttemptCount: 0,
      lastDispatchFailureReason: null,
      noSupplyEscalation: null,
      dispatchTimeout: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
    {
      orderId: "order-tenant-002",
      orderNo: "ORD-002",
      orderSource: "app",
      orderDomain: "owned",
      tenantId: "tenant-002",
      partnerId: null,
      partnerProgramId: null,
      partnerEntrySlug: null,
      eligibilityVerificationId: null,
      issuerAuthorizationRef: null,
      serviceBucket: "standard_taxi",
      dispatchSemantics: "realtime",
      businessDispatchSubtype: null,
      status: "ready_for_dispatch",
      pickup: {
        address: "新北市板橋區縣民大道 1 段 1 號",
      },
      dropoff: {
        address: "台北市中山區南京東路 1 段 1 號",
      },
      passenger: {
        name: "其他乘客",
        phone: "0933444555",
      },
      bookingId: null,
      bookingType: null,
      etaSnapshot: null,
      callId: null,
      recordingId: null,
      reservationWindowStart: null,
      reservationWindowEnd: null,
      recurrenceRule: null,
      modifiableUntil: null,
      cancelableUntil: null,
      bookedBy: null,
      onsiteContact: null,
      costCenter: null,
      vehiclePreference: null,
      benefitReference: null,
      direction: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
      notes: null,
      fixedPrice: false,
      quotedFare: null,
      quotedFareSource: null,
      quotedFareRuleVersion: null,
      manualFareOverride: null,
      exceptionHold: null,
      proofRequirements: {
        minPhotoCount: 0,
        signoffRequired: false,
        expenseProofRequired: false,
      },
      approvalState: "not_required",
      approvalRequestIds: [],
      complianceFlags: [],
      cancelledAt: null,
      cancelReason: null,
      reservationHoldStatus: "none",
      reservationHoldId: null,
      reservationHoldExpiresAt: null,
      dispatchAttemptCount: 0,
      lastDispatchFailureReason: null,
      noSupplyEscalation: null,
      dispatchTimeout: null,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  ];
  const dispatchJobs = [
    {
      dispatchJobId: "job-001",
      orderId: "order-tenant-001",
      status: "pending",
      mode: "auto",
      latestEtaMinutes: 4,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
    {
      dispatchJobId: "job-002",
      orderId: "order-tenant-002",
      status: "pending",
      mode: "auto",
      latestEtaMinutes: 7,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z",
    },
  ];
  const complaintCase = {
    caseNo: "CMP-001",
    caseSource: "ops",
    relatedOrderId: "order-tenant-001",
    relatedCallId: "call-1234567890",
    relatedIncidentId: null,
    category: "late_arrival",
    severity: "high",
    description: "Passenger 王小美 called 0911222333 about a delay.",
    assigneeId: "ops-agent-001",
    status: "under_investigation",
    slaDueAt: "2026-06-02T00:00:00.000Z",
    slaBreach: false,
    reopenCount: 0,
    resolutionCode: null,
    closingNote: "Contacted passenger directly.",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
  };
  const complaintTimeline = [
    {
      entryId: "timeline-001",
      caseNo: "CMP-001",
      action: "case_created",
      note: "Passenger 王小美 called 0911222333 about a delay.",
      createdAt: "2026-06-01T00:00:00.000Z",
    },
  ];
  const complaintExportView = {
    complaintCase,
    timeline: complaintTimeline,
    exportGeneratedAt: "2026-06-01T00:00:00.000Z",
    readyForAudit: false,
  };

  const ownedMobilityService = {
    listOrders: vi.fn(() => orders.map((order) => ({ ...order }))),
    listDispatchJobs: vi.fn(() => dispatchJobs.map((job) => ({ ...job }))),
    getOrder: vi.fn((orderId: string) => {
      const order = orders.find((candidate) => candidate.orderId === orderId);
      if (!order) {
        throw new ApiRequestError(404, "ORDER_NOT_FOUND", "Order not found.");
      }
      return { ...order };
    }),
  };
  const complaintService = {
    getComplaintCase: vi.fn((caseNo: string) => {
      if (caseNo !== complaintCase.caseNo) {
        throw new ApiRequestError(
          404,
          "COMPLAINT_CASE_NOT_FOUND",
          "Complaint case not found.",
        );
      }
      return { ...complaintCase };
    }),
    getComplaintTimeline: vi.fn((caseNo: string) => {
      if (caseNo !== complaintCase.caseNo) {
        throw new ApiRequestError(
          404,
          "COMPLAINT_CASE_NOT_FOUND",
          "Complaint case not found.",
        );
      }
      return complaintTimeline.map((entry) => ({ ...entry }));
    }),
    getComplaintExportView: vi.fn((caseNo: string) => {
      if (caseNo !== complaintCase.caseNo) {
        throw new ApiRequestError(
          404,
          "COMPLAINT_CASE_NOT_FOUND",
          "Complaint case not found.",
        );
      }
      return {
        complaintCase: { ...complaintExportView.complaintCase },
        timeline: complaintExportView.timeline.map((entry) => ({ ...entry })),
        exportGeneratedAt: complaintExportView.exportGeneratedAt,
        readyForAudit: complaintExportView.readyForAudit,
      };
    }),
  };

  return {
    registry: new AssistantReadToolRegistry(
      ownedMobilityService as never,
      complaintService as never,
    ),
  };
}

describe("AssistantReadToolRegistry", () => {
  it("registers Tier 1 read tools for the conversation loop", () => {
    const { registry } = createRegistry();

    expect(registry.listDefinitions().map((tool) => tool.name)).toEqual([
      "list_dispatch_jobs",
      "get_order",
      "get_complaint_case",
      "get_complaint_timeline",
      "get_complaint_export_view",
    ]);
  });

  it("filters dispatch jobs by caller scope", () => {
    const { registry } = createRegistry();

    const result = registry.execute({
      toolName: "list_dispatch_jobs",
      identity: createIdentity({
        actorType: "tenant_admin",
        actorId: "tenant-admin-001",
        realm: "tenant",
        tenantId: "tenant-001",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
      }),
    });

    expect(result.output).toEqual([
      expect.objectContaining({
        dispatchJobId: "job-001",
        orderId: "order-tenant-001",
      }),
    ]);
  });

  it("masks PII when reading an order", () => {
    const { registry } = createRegistry();

    const result = registry.execute({
      toolName: "get_order",
      input: { orderId: "order-tenant-001" },
      identity: createIdentity({
        actorType: "tenant_admin",
        actorId: "tenant-admin-001",
        realm: "tenant",
        tenantId: "tenant-001",
        roleFamilies: ["tenant"],
        roles: ["tenant_admin"],
      }),
    });

    expect(result.output).toMatchObject({
      orderId: "order-tenant-001",
      passenger: {
        name: "王*美",
        phone: "******2333",
      },
      pickup: {
        address: "台北市信義區...",
        lat: null,
        lng: null,
      },
      dropoff: {
        address: "台北市南港區...",
        lat: null,
        lng: null,
      },
      bookedBy: {
        name: "林**員",
        email: "t***@example.com",
      },
      onsiteContact: {
        name: "陳**人",
        phone: "******0111",
      },
      callId: "c***0",
      recordingId: "r***0",
      benefitReference: "benefit-...5678",
      notes: "[redacted]",
    });
  });

  it("does not broaden order access beyond tenant scope", () => {
    const { registry } = createRegistry();

    expect(() =>
      registry.execute({
        toolName: "get_order",
        input: { orderId: "order-tenant-002" },
        identity: createIdentity({
          actorType: "tenant_admin",
          actorId: "tenant-admin-001",
          realm: "tenant",
          tenantId: "tenant-001",
          roleFamilies: ["tenant"],
          roles: ["tenant_admin"],
        }),
      }),
    ).toThrowError(ApiRequestError);
  });

  it("masks complaint exports for an ops caller holding complaints:read", () => {
    const { registry } = createRegistry();

    const result = registry.execute({
      toolName: "get_complaint_export_view",
      input: { caseNo: "CMP-001" },
      identity: createIdentity({
        scopes: ["complaints:read"],
      }),
    });

    expect(result.output).toMatchObject({
      complaintCase: {
        caseNo: "CMP-001",
        description: "[redacted]",
        closingNote: "[redacted]",
        relatedCallId: "c***0",
      },
      timeline: [
        expect.objectContaining({
          note: "[redacted]",
        }),
      ],
    });
  });

  it("denies complaint access for a tenant_admin even for a same-tenant linked order", () => {
    const { registry } = createRegistry();

    const identity = createIdentity({
      actorType: "tenant_admin",
      actorId: "tenant-admin-001",
      realm: "tenant",
      tenantId: "tenant-001",
      roleFamilies: ["tenant"],
      roles: ["tenant_admin"],
      scopes: ["assistant:write"],
    });

    for (const toolName of [
      "get_complaint_case",
      "get_complaint_timeline",
      "get_complaint_export_view",
    ] as const) {
      expect(() =>
        registry.execute({
          toolName,
          input: { caseNo: "CMP-001" },
          identity,
        }),
      ).toThrowError(ApiRequestError);
    }
  });

  it("denies complaint access for an ops realm caller lacking complaints:read", () => {
    const { registry } = createRegistry();

    expect(() =>
      registry.execute({
        toolName: "get_complaint_case",
        input: { caseNo: "CMP-001" },
        identity: createIdentity({ scopes: ["assistant:write"] }),
      }),
    ).toThrowError(ApiRequestError);
  });

  it("denies complaint access for a platform realm caller even with complaints:read", () => {
    const { registry } = createRegistry();

    expect(() =>
      registry.execute({
        toolName: "get_complaint_case",
        input: { caseNo: "CMP-001" },
        identity: createIdentity({
          actorType: "platform_admin",
          actorId: "platform-admin-001",
          realm: "platform",
          roleFamilies: ["platform"],
          roles: ["platform_admin"],
          scopes: ["complaints:read"],
        }),
      }),
    ).toThrowError(ApiRequestError);
  });
});
