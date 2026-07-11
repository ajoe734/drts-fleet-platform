import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { EventEmitter2 } from "@nestjs/event-emitter";
import { expect, it } from "vitest";

import type {
  AuditLogRecord,
  DispatchJobRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { ApiRequestError } from "../../src/common/api-envelope";
import { OpsDispatchEventsService } from "../../src/common/ops-dispatch-events.service";
import { OwnedMobilityTaskEventsService } from "../../src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { ServiceAreaService } from "../../src/modules/service-area/service-area.service";
import { ServiceProductService } from "../../src/modules/service-product/service-product.service";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../src/modules/tenant-partner/tenant-partner.service";

const ARTIFACT_RELATIVE_PATH =
  "support/sidecars/MAP-REL-001/artifacts/map-fleets-closeout-cross-surface-proof-20260711T023829Z.json";

type PersistPayload = {
  orders?: OwnedOrderRecord[];
  dispatchJobs?: DispatchJobRecord[];
  dispatchTraceLogs?: Array<Record<string, unknown>>;
};

type PersistEntry = {
  context: string;
  payload: PersistPayload;
};

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createOwnedMobilityService(
  tenantPartnerService?: TenantPartnerService,
) {
  const regulatoryRegistryService = {
    getEligibleCandidates: () => [],
    getVehicleDispatchability: () => true,
    getDriverAvailability: () => true,
  };
  const auditLogs: AuditLogRecord[] = [];
  const auditNotificationService = {
    recordNotification: () => undefined,
    recordAuditLog: (
      input: Omit<AuditLogRecord, "auditId" | "createdAt" | "requestId"> & {
        requestId?: string;
      },
    ) => {
      const auditLog: AuditLogRecord = {
        auditId: `audit-${String(auditLogs.length + 1).padStart(3, "0")}`,
        createdAt: `2026-07-11T02:38:${String(auditLogs.length).padStart(
          2,
          "0",
        )}.000Z`,
        requestId: input.requestId ?? null,
        actorId: input.actorId,
        actorType: input.actorType,
        tenantId: input.tenantId ?? null,
        moduleName: input.moduleName,
        actionName: input.actionName,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        oldValuesSummary: input.oldValuesSummary ?? null,
        newValuesSummary: input.newValuesSummary ?? null,
        metadata: input.metadata ?? null,
      };
      auditLogs.unshift(auditLog);
      return auditLog;
    },
  };
  const serviceProductService = new ServiceProductService(
    auditNotificationService as never,
    undefined,
  );
  const persistedWrites: PersistEntry[] = [];
  const repository = {
    isEnabled: () => true,
    persistChanges: async (payload: PersistPayload) => {
      persistedWrites.push({
        context: "persistChanges",
        payload: cloneJson(payload),
      });
      return payload;
    },
    persistOrderWorkflow: async (_tx: unknown, payload: PersistPayload) => {
      persistedWrites.push({
        context: "persistOrderWorkflow",
        payload: cloneJson(payload),
      });
      return payload;
    },
    withTransaction: async <T>(work: (tx: unknown) => Promise<T>) => work({}),
    reportPersistenceFailure: () => undefined,
  };
  const callcenterService = {
    registerRecordingAttachmentListener: () => undefined,
    registerRecordingStateChangeListener: () => undefined,
    linkOrderToCallSession: ({
      callId,
      callType,
      callerPhone,
      agentId,
      linkedOrderId,
      recordingId,
    }: {
      callId: string;
      callType: string;
      callerPhone?: string | null;
      agentId?: string | null;
      linkedOrderId: string;
      recordingId?: string | null;
    }) => ({
      callId,
      callType,
      callerPhone: callerPhone ?? null,
      agentId: agentId ?? null,
      linkedOrderId,
      recordingId: recordingId ?? null,
    }),
  };

  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    new OwnedMobilityTaskEventsService(new EventEmitter2()),
    new OpsDispatchEventsService(new EventEmitter2()),
    repository as never,
    tenantPartnerService as never,
    undefined,
    serviceProductService,
    undefined,
    undefined,
    undefined,
    undefined,
    new ServiceAreaService(),
  );

  return {
    service,
    auditLogs,
    persistedWrites,
  };
}

function findPersistedWrite(entries: PersistEntry[], orderId: string) {
  return (
    entries.find((entry) =>
      entry.payload.orders?.some((order) => order.orderId === orderId),
    ) ?? null
  );
}

function findAuditEvents(auditLogs: AuditLogRecord[], orderId: string) {
  return auditLogs.filter((auditLog) => auditLog.resourceId === orderId);
}

function captureDispatchRefusal(
  service: OwnedMobilityService,
  orderId: string,
) {
  let errorResponse: ReturnType<ApiRequestError["getResponse"]> | null = null;

  try {
    service.dispatchOrder(orderId, { mode: "auto" });
  } catch (error) {
    expect(error).toBeInstanceOf(ApiRequestError);
    errorResponse = (error as ApiRequestError).getResponse();
  }

  return {
    errorResponse,
    dispatchJobsForOrder: service
      .listDispatchJobs()
      .filter((job) => job.orderId === orderId),
  };
}

it("writes cross-surface persisted anti-bypass proof for fleets closeout", async () => {
  const tenantPartnerService = new TenantPartnerService(
    new AuditNotificationService(),
  );
  const partnerVerification =
    await tenantPartnerService.verifyPartnerEligibility(
      {
        entrySlug: "ctbc",
        cardLast4: "2468",
        cardholderName: "Closeout Partner Rider",
      },
      "req-map-closeout-partner-eligibility-001",
    );
  expect(partnerVerification.verificationStatus).toBe("eligible");

  const { service, auditLogs, persistedWrites } =
    createOwnedMobilityService(tenantPartnerService);

  const tenantServiceable = await service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: "2026-07-11T10:00:00.000Z",
      reservationWindowEnd: "2026-07-11T11:00:00.000Z",
      pickup: {
        address: "No. 1, City Hall Road, Xinyi District, Taipei",
        lat: 25.037519,
        lng: 121.56368,
        coordinateProvenance: {
          coordinateSource: "provider_candidate",
          geocodeProvider: "mock-geo",
          geocodeConfidence: "exact",
          providerCandidateId: "place-city-hall",
          selectedByActorId: "tenant-admin-001",
          selectedAt: "2026-07-11T02:38:00.000Z",
          surface: "tenant_console",
        },
      },
      dropoff: {
        address: "No. 100, Songren Road, Xinyi District, Taipei",
        lat: 25.033879,
        lng: 121.568743,
        coordinateProvenance: {
          coordinateSource: "provider_candidate",
          geocodeProvider: "mock-geo",
          geocodeConfidence: "interpolated",
          providerCandidateId: "place-xinyi-office",
          selectedByActorId: "tenant-admin-001",
          selectedAt: "2026-07-11T02:38:30.000Z",
          surface: "tenant_console",
        },
      },
      passenger: {
        name: "Tenant Closeout Rider",
        phone: "0912-000-401",
      },
    },
    "tenant-demo-001",
    {
      actorType: "tenant_admin",
      actorId: "tenant-admin-001",
    } as never,
    "req-map-closeout-tenant-serviceable-001",
  );
  const tenantServiceableDetail = service.getOrder(tenantServiceable.orderId);

  const conciergeServiceableOrder = service.createCallCenterOrder(
    {
      callId: "CALL-CONCIERGE-001",
      agentId: "concierge-ops-001",
      recordingId: "REC-CONCIERGE-001",
      pickup: {
        address: "No. 1, City Hall Road, Xinyi District, Taipei",
        lat: 25.037519,
        lng: 121.56368,
        coordinateProvenance: {
          coordinateSource: "provider_candidate",
          geocodeProvider: "mock-geo",
          geocodeConfidence: "exact",
          providerCandidateId: "place-city-hall",
          selectedByActorId: "concierge-ops-001",
          selectedAt: "2026-07-11T02:39:00.000Z",
          surface: "concierge_portal",
        },
      },
      dropoff: {
        address: "No. 2, Civic Boulevard, Datong District, Taipei",
        lat: 25.047762,
        lng: 121.517017,
        coordinateProvenance: {
          coordinateSource: "provider_candidate",
          geocodeProvider: "mock-geo",
          geocodeConfidence: "exact",
          providerCandidateId: "place-taipei-main",
          selectedByActorId: "concierge-ops-001",
          selectedAt: "2026-07-11T02:39:30.000Z",
          surface: "concierge_portal",
        },
      },
      passenger: {
        name: "Concierge Closeout Rider",
        phone: "0912-000-402",
      },
      notes: "Desk-created concierge-assisted booking.",
    },
    "req-map-closeout-concierge-serviceable-001",
  );
  const conciergeServiceableDetail = service.getOrder(
    conciergeServiceableOrder.orderId,
  );

  const partnerServiceable = await service.createTenantBooking(
    {
      businessDispatchSubtype: "credit_card_airport_transfer",
      reservationWindowStart: "2026-07-11T12:00:00.000Z",
      reservationWindowEnd: "2026-07-11T13:00:00.000Z",
      partnerEntrySlug: "ctbc",
      eligibilityVerificationId: partnerVerification.eligibilityVerificationId,
      pickup: {
        address: "Taoyuan Airport Terminal 1",
        lat: 25.0797,
        lng: 121.2342,
        coordinateProvenance: {
          coordinateSource: "provider_candidate",
          geocodeProvider: "mock-geo",
          geocodeConfidence: "exact",
          providerCandidateId: "place-taoyuan-airport",
          selectedByActorId: "partner-api-001",
          selectedAt: "2026-07-11T02:40:00.000Z",
          surface: "partner_booking",
        },
      },
      dropoff: {
        address: "Taoyuan Airport Terminal 2",
        lat: 25.0777,
        lng: 121.2328,
        coordinateProvenance: {
          coordinateSource: "provider_candidate",
          geocodeProvider: "mock-geo",
          geocodeConfidence: "exact",
          providerCandidateId: "place-taoyuan-airport-terminal-2",
          selectedByActorId: "partner-api-001",
          selectedAt: "2026-07-11T02:40:30.000Z",
          surface: "partner_booking",
        },
      },
      passenger: {
        name: "Partner Closeout Rider",
        phone: "0912-000-403",
      },
    },
    "tenant-demo-001",
    {
      actorType: "partner_api_key",
      actorId: "partner-api-001",
    } as never,
    "req-map-closeout-partner-serviceable-001",
  );
  const partnerServiceableDetail = service.getOrder(partnerServiceable.orderId);

  const callcenterProviderOutageOrder = service.createCallCenterOrder(
    {
      callId: "CALL-OUTAGE-001",
      agentId: "ops-agent-001",
      recordingId: "REC-OUTAGE-001",
      pickup: {
        address: "Taipei City Hall curb",
        lat: 25.037519,
        lng: 121.56368,
        manualOverrideReason: "caller confirmed city hall curb",
        coordinateProvenance: {
          coordinateSource: "manual_pin",
          geocodeProvider: null,
          geocodeConfidence: null,
          providerCandidateId: null,
          selectedByActorId: "ops-agent-001",
          selectedAt: "2026-07-11T02:41:00.000Z",
          pinnedByActorId: "ops-agent-001",
          pinnedAt: "2026-07-11T02:41:00.000Z",
          manualOverrideReason: "caller confirmed city hall curb",
          surface: "callcenter",
        },
      },
      dropoff: {
        address: "Songren Road office entrance",
        lat: 25.033879,
        lng: 121.568743,
        manualOverrideReason: "caller confirmed office entrance",
        coordinateProvenance: {
          coordinateSource: "manual_pin",
          geocodeProvider: null,
          geocodeConfidence: null,
          providerCandidateId: null,
          selectedByActorId: "ops-agent-001",
          selectedAt: "2026-07-11T02:41:30.000Z",
          pinnedByActorId: "ops-agent-001",
          pinnedAt: "2026-07-11T02:41:30.000Z",
          manualOverrideReason: "caller confirmed office entrance",
          surface: "callcenter",
        },
      },
      passenger: {
        name: "Provider Outage Caller",
        phone: "0912-000-404",
      },
      mapFallbackReview: {
        reasonCode: "map_provider_unavailable",
        providerAvailable: false,
        providerDegraded: true,
        providerReasonCode: "request_failed",
      },
    },
    "req-map-closeout-callcenter-outage-001",
  );
  const callcenterProviderOutageDetail = service.getOrder(
    callcenterProviderOutageOrder.orderId,
  );

  const conciergeProviderOutageOrder = service.createCallCenterOrder(
    {
      callId: "CALL-CONCIERGE-OUTAGE-001",
      agentId: "concierge-ops-002",
      recordingId: "REC-CONCIERGE-OUTAGE-001",
      pickup: {
        address: "Hotel driveway",
        lat: 25.034,
        lng: 121.568,
        manualOverrideReason: "desk confirmed hotel driveway",
        coordinateProvenance: {
          coordinateSource: "manual_pin",
          geocodeProvider: null,
          geocodeConfidence: null,
          providerCandidateId: null,
          selectedByActorId: "concierge-ops-002",
          selectedAt: "2026-07-11T02:42:00.000Z",
          pinnedByActorId: "concierge-ops-002",
          pinnedAt: "2026-07-11T02:42:00.000Z",
          manualOverrideReason: "desk confirmed hotel driveway",
          surface: "concierge_portal",
        },
      },
      dropoff: {
        address: "Hospital entrance",
        lat: 25.041,
        lng: 121.55,
        manualOverrideReason: "desk confirmed hospital entrance",
        coordinateProvenance: {
          coordinateSource: "manual_pin",
          geocodeProvider: null,
          geocodeConfidence: null,
          providerCandidateId: null,
          selectedByActorId: "concierge-ops-002",
          selectedAt: "2026-07-11T02:42:30.000Z",
          pinnedByActorId: "concierge-ops-002",
          pinnedAt: "2026-07-11T02:42:30.000Z",
          manualOverrideReason: "desk confirmed hospital entrance",
          surface: "concierge_portal",
        },
      },
      passenger: {
        name: "Concierge Outage Rider",
        phone: "0912-000-405",
      },
      mapFallbackReview: {
        reasonCode: "map_provider_unavailable",
        providerAvailable: false,
        providerDegraded: true,
        providerReasonCode: "request_failed",
      },
    },
    "req-map-closeout-concierge-outage-001",
  );
  const conciergeProviderOutageDetail = service.getOrder(
    conciergeProviderOutageOrder.orderId,
  );

  const tenantCoordinateLess = await service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: "2026-07-11T14:00:00.000Z",
      reservationWindowEnd: "2026-07-11T15:00:00.000Z",
      pickup: {
        address: "Landmark-only tenant pickup",
      },
      dropoff: {
        address: "Landmark-only tenant dropoff",
      },
      passenger: {
        name: "Tenant Coordinate-less Rider",
        phone: "0912-000-406",
      },
    },
    "tenant-demo-001",
    {
      actorType: "tenant_admin",
      actorId: "tenant-admin-001",
    } as never,
    "req-map-closeout-tenant-coordinate-less-001",
  );
  const tenantCoordinateLessDetail = service.getOrder(
    tenantCoordinateLess.orderId,
  );

  const partnerCoordinateLess = await service.createTenantBooking(
    {
      businessDispatchSubtype: "credit_card_airport_transfer",
      reservationWindowStart: "2026-07-11T16:00:00.000Z",
      reservationWindowEnd: "2026-07-11T17:00:00.000Z",
      partnerEntrySlug: "ctbc",
      eligibilityVerificationId: partnerVerification.eligibilityVerificationId,
      pickup: {
        address: "Partner text-only pickup",
      },
      dropoff: {
        address: "Partner text-only dropoff",
      },
      passenger: {
        name: "Partner Coordinate-less Rider",
        phone: "0912-000-407",
      },
    },
    "tenant-demo-001",
    {
      actorType: "partner_api_key",
      actorId: "partner-api-001",
    } as never,
    "req-map-closeout-partner-coordinate-less-001",
  );
  const partnerCoordinateLessDetail = service.getOrder(
    partnerCoordinateLess.orderId,
  );

  const callcenterCoordinateLessOrder = service.createCallCenterOrder(
    {
      callId: "CALL-COORDLESS-001",
      agentId: "ops-agent-001",
      recordingId: "REC-COORDLESS-001",
      pickup: {
        address: "Caller only gave a landmark pickup",
        surface: "callcenter",
      },
      dropoff: {
        address: "Caller only gave a landmark dropoff",
        surface: "callcenter",
      },
      passenger: {
        name: "Callcenter Coordinate-less Rider",
        phone: "0912-000-408",
      },
    },
    "req-map-closeout-callcenter-coordinate-less-001",
  );
  const callcenterCoordinateLessDetail = service.getOrder(
    callcenterCoordinateLessOrder.orderId,
  );

  const conciergeCoordinateLessOrder = service.createCallCenterOrder(
    {
      callId: "CALL-CONCIERGE-COORDLESS-001",
      agentId: "concierge-ops-003",
      recordingId: "REC-CONCIERGE-COORDLESS-001",
      pickup: {
        address: "Desk only has lobby name",
        surface: "concierge_portal",
      },
      dropoff: {
        address: "Desk only has destination nickname",
        surface: "concierge_portal",
      },
      passenger: {
        name: "Concierge Coordinate-less Rider",
        phone: "0912-000-409",
      },
    },
    "req-map-closeout-concierge-coordinate-less-001",
  );
  const conciergeCoordinateLessDetail = service.getOrder(
    conciergeCoordinateLessOrder.orderId,
  );

  const callcenterProviderOutageDispatchAttempt = captureDispatchRefusal(
    service,
    callcenterProviderOutageOrder.orderId,
  );
  const conciergeProviderOutageDispatchAttempt = captureDispatchRefusal(
    service,
    conciergeProviderOutageOrder.orderId,
  );
  const tenantCoordinateLessDispatchAttempt = captureDispatchRefusal(
    service,
    tenantCoordinateLess.orderId,
  );
  const partnerCoordinateLessDispatchAttempt = captureDispatchRefusal(
    service,
    partnerCoordinateLess.orderId,
  );
  const callcenterCoordinateLessDispatchAttempt = captureDispatchRefusal(
    service,
    callcenterCoordinateLessOrder.orderId,
  );
  const conciergeCoordinateLessDispatchAttempt = captureDispatchRefusal(
    service,
    conciergeCoordinateLessOrder.orderId,
  );

  expect(tenantServiceableDetail.spatialAudit?.surface).toBe("tenant_console");
  expect(
    tenantServiceableDetail.complianceFlags.includes(
      "service_area_serviceable",
    ),
  ).toBe(true);
  expect(conciergeServiceableDetail.pickup.coordinateProvenance?.surface).toBe(
    "concierge_portal",
  );
  expect(partnerServiceableDetail.spatialAudit?.surface).toBe(
    "partner_booking",
  );
  expect(callcenterProviderOutageDetail.queueFamily).toBe(
    "manual_review_queue",
  );
  expect(conciergeProviderOutageDetail.queueFamily).toBe("manual_review_queue");
  expect(tenantCoordinateLessDetail.queueFamily).toBe("manual_review_queue");
  expect(partnerCoordinateLessDetail.queueFamily).toBe("manual_review_queue");
  expect(callcenterCoordinateLessDetail.queueFamily).toBe(
    "manual_review_queue",
  );
  expect(conciergeCoordinateLessDetail.queueFamily).toBe("manual_review_queue");
  expect(callcenterProviderOutageDispatchAttempt.dispatchJobsForOrder).toEqual(
    [],
  );
  expect(conciergeProviderOutageDispatchAttempt.dispatchJobsForOrder).toEqual(
    [],
  );
  expect(tenantCoordinateLessDispatchAttempt.dispatchJobsForOrder).toEqual([]);
  expect(partnerCoordinateLessDispatchAttempt.dispatchJobsForOrder).toEqual([]);
  expect(callcenterCoordinateLessDispatchAttempt.dispatchJobsForOrder).toEqual(
    [],
  );
  expect(conciergeCoordinateLessDispatchAttempt.dispatchJobsForOrder).toEqual(
    [],
  );

  const artifactPath = resolve(
    process.cwd(),
    "..",
    "..",
    ARTIFACT_RELATIVE_PATH,
  );
  mkdirSync(
    resolve(
      process.cwd(),
      "..",
      "..",
      "support/sidecars/MAP-REL-001/artifacts",
    ),
    {
      recursive: true,
    },
  );
  writeFileSync(
    artifactPath,
    JSON.stringify(
      {
        tenantServiceableBooking: {
          booking: tenantServiceable,
          apiOrder: tenantServiceableDetail,
          persistedWrite: findPersistedWrite(
            persistedWrites,
            tenantServiceable.orderId,
          ),
          auditEvents: findAuditEvents(auditLogs, tenantServiceable.orderId),
        },
        conciergeServiceableOrder: {
          orderId: conciergeServiceableOrder.orderId,
          apiOrder: conciergeServiceableDetail,
          persistedWrite: findPersistedWrite(
            persistedWrites,
            conciergeServiceableOrder.orderId,
          ),
          auditEvents: findAuditEvents(
            auditLogs,
            conciergeServiceableOrder.orderId,
          ),
        },
        partnerServiceableBooking: {
          booking: partnerServiceable,
          eligibilityVerification: {
            eligibilityVerificationId:
              partnerVerification.eligibilityVerificationId,
            verificationStatus: partnerVerification.verificationStatus,
            partnerEntrySlug: partnerVerification.partnerEntrySlug,
          },
          apiOrder: partnerServiceableDetail,
          persistedWrite: findPersistedWrite(
            persistedWrites,
            partnerServiceable.orderId,
          ),
          auditEvents: findAuditEvents(auditLogs, partnerServiceable.orderId),
        },
        providerOutageManualReview: {
          callcenter: {
            orderId: callcenterProviderOutageOrder.orderId,
            apiOrder: callcenterProviderOutageDetail,
            persistedWrite: findPersistedWrite(
              persistedWrites,
              callcenterProviderOutageOrder.orderId,
            ),
            auditEvents: findAuditEvents(
              auditLogs,
              callcenterProviderOutageOrder.orderId,
            ),
            dispatchAttempt: callcenterProviderOutageDispatchAttempt,
          },
          concierge: {
            orderId: conciergeProviderOutageOrder.orderId,
            apiOrder: conciergeProviderOutageDetail,
            persistedWrite: findPersistedWrite(
              persistedWrites,
              conciergeProviderOutageOrder.orderId,
            ),
            auditEvents: findAuditEvents(
              auditLogs,
              conciergeProviderOutageOrder.orderId,
            ),
            dispatchAttempt: conciergeProviderOutageDispatchAttempt,
          },
        },
        coordinateLessAntiBypass: {
          tenant: {
            booking: tenantCoordinateLess,
            apiOrder: tenantCoordinateLessDetail,
            persistedWrite: findPersistedWrite(
              persistedWrites,
              tenantCoordinateLess.orderId,
            ),
            auditEvents: findAuditEvents(
              auditLogs,
              tenantCoordinateLess.orderId,
            ),
            dispatchAttempt: tenantCoordinateLessDispatchAttempt,
          },
          partner: {
            booking: partnerCoordinateLess,
            apiOrder: partnerCoordinateLessDetail,
            persistedWrite: findPersistedWrite(
              persistedWrites,
              partnerCoordinateLess.orderId,
            ),
            auditEvents: findAuditEvents(
              auditLogs,
              partnerCoordinateLess.orderId,
            ),
            dispatchAttempt: partnerCoordinateLessDispatchAttempt,
          },
          callcenter: {
            orderId: callcenterCoordinateLessOrder.orderId,
            apiOrder: callcenterCoordinateLessDetail,
            persistedWrite: findPersistedWrite(
              persistedWrites,
              callcenterCoordinateLessOrder.orderId,
            ),
            auditEvents: findAuditEvents(
              auditLogs,
              callcenterCoordinateLessOrder.orderId,
            ),
            dispatchAttempt: callcenterCoordinateLessDispatchAttempt,
          },
          concierge: {
            orderId: conciergeCoordinateLessOrder.orderId,
            apiOrder: conciergeCoordinateLessDetail,
            persistedWrite: findPersistedWrite(
              persistedWrites,
              conciergeCoordinateLessOrder.orderId,
            ),
            auditEvents: findAuditEvents(
              auditLogs,
              conciergeCoordinateLessOrder.orderId,
            ),
            dispatchAttempt: conciergeCoordinateLessDispatchAttempt,
          },
        },
      },
      null,
      2,
    ),
  );
});
