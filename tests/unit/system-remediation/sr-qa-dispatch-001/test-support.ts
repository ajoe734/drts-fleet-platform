// SR-QA-DISPATCH-001 shared test support.
//
// Builds a real `OwnedMobilityService` instance (the same production class
// used by the API controller) wired with lightweight in-memory collaborator
// stubs, mirroring the proven harness pattern already used by
// `apps/api/tests/unit/owned-mobility.service.test.ts`. This intentionally
// reuses the existing constructor/positional-arg contract instead of
// building a second matcher: SR-QA-DISPATCH-001's brief requires reusing the
// UV-EXEC-006/UV-EXEC-016 preserved implementation, not re-implementing it.
import { vi } from "vitest";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { ServiceProductService } from "../../../../apps/api/src/modules/service-product/service-product.service";

export type CandidateFixture = {
  driverId: string;
  vehicleId: string;
  etaMinutes: number;
  operatingArea: string;
  serviceBuckets: string[];
};

export function buildOwnedMobilityServiceForTest(options?: {
  candidates?: CandidateFixture[];
  getEligibleCandidates?: (
    serviceBucket: string,
    destination?: { lat: number; lng: number } | null,
  ) => CandidateFixture[];
  vehicleDispatchable?: boolean;
}) {
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(
      (
        serviceBucket: string,
        destination?: { lat: number; lng: number } | null,
      ) =>
        options?.getEligibleCandidates?.(serviceBucket, destination) ??
        options?.candidates ??
        [],
    ),
    getVehicleDispatchability: vi.fn(
      () => options?.vehicleDispatchable ?? true,
    ),
    getDriverAvailability: vi.fn(() => true),
    getVehicleLicenseType: vi.fn(() => "taxi"),
    getVehiclePassengerDisclosureProfile: vi.fn(() => null),
    getDriverPublicRegistrationCredential: vi.fn(() => null),
    listVehicles: vi.fn(() => []),
    listDrivers: vi.fn(() => []),
    listSupplyPairs: vi.fn(() => []),
  };

  const auditNotificationService = {
    recordNotification: vi.fn(),
    recordAuditLog: vi.fn(),
  };

  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };

  const serviceProductService = new ServiceProductService(
    auditNotificationService as never,
    undefined,
  );

  const fakeEventEmitter = { emit: vi.fn(), on: vi.fn(), once: vi.fn() };
  const taskEventsService = new OwnedMobilityTaskEventsService(
    fakeEventEmitter as never,
  );
  const opsDispatchEventsService = new OpsDispatchEventsService(
    fakeEventEmitter as never,
  );

  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    opsDispatchEventsService,
    undefined, // ownedMobilityRepository: memory mode for behavior-layer regression
    undefined, // tenantPartnerService
    undefined, // vehicleEligibilityService
    serviceProductService,
    undefined, // eventEmitter
    undefined, // runtimeEligibilityEvaluator
    undefined, // sandboxFallbackCostPolicyResolver
    undefined, // sandboxDispatchGateService
    undefined, // serviceAreaService
    undefined, // fareAnomalyService
  );

  return { service, auditNotificationService, regulatoryRegistryService };
}

export function createTestPassengerOrder(
  service: OwnedMobilityService,
  overrides?: Record<string, unknown>,
) {
  return service.createPassengerOrder({
    pickup: { address: "Taipei Main Station" },
    dropoff: { address: "Taipei 101" },
    passenger: { name: "SR-QA-DISPATCH-001", phone: "0912345678" },
    ...overrides,
  } as never);
}
