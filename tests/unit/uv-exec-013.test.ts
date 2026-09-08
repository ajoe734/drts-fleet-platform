import type { OwnedOrderRecord, ResolveAddressCommand } from "@drts/contracts";
import type { OwnedMobilityRepository } from "../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import type { RuntimeEligibilityEvaluator } from "../../apps/api/src/modules/vehicle-eligibility/runtime-eligibility-evaluator.service";
import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BookingRequirements,
  GeoSearchResponse,
  GeoResolveResponse,
} from "@drts/contracts";
import {
  bookingRequirementFailures,
  validateBookingRequirements,
} from "../../apps/api/src/modules/vehicle-eligibility/booking-requirements";
import { VoiceLocationService } from "../../apps/api/src/modules/geo/voice-location.service";
import type { GeoService } from "../../apps/api/src/modules/geo/geo.service";
import { VoiceBookingDraftService } from "../../apps/api/src/modules/voice-booking/voice-booking-draft.service";
import type { VoiceBookingRepository } from "../../apps/api/src/modules/voice-booking/voice-booking.repository";
import { ServiceAreaService } from "../../apps/api/src/modules/service-area/service-area.service";
import { ServiceProductService } from "../../apps/api/src/modules/service-product/service-product.service";
import { OwnedMobilityService } from "../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";
import { RegulatoryRegistryService } from "../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { OpsDispatchEventsService } from "../../apps/api/src/common/ops-dispatch-events.service";
import { DriverProfileService } from "../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityTaskEventsService } from "../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { VehicleEligibilityService } from "../../apps/api/src/modules/vehicle-eligibility/vehicle-eligibility.service";

afterEach(() => vi.useRealTimers());

const requirements = (
  patch: Partial<BookingRequirements> = {},
): BookingRequirements => ({
  passengerCount: 3,
  luggageCount: 2,
  luggageSize: "standard",
  requiredCapabilities: [],
  bookerContact: { name: "Booker", phone: "0911111111" },
  passengerContact: { name: "Passenger", phone: "0922222222" },
  driverContactRole: "passenger",
  policyVersion: "v1",
  validationReference: "validation-1",
  ...patch,
});

function locationHarness() {
  const now = new Date().toISOString();
  const search: GeoSearchResponse = {
    provider: "google",
    generatedAt: now,
    candidates: [
      {
        candidateId: "a",
        provider: "google",
        placeId: "place-a",
        displayName: "Hospital east entrance",
        address: "Taipei 1",
        confidence: "exact",
        metadata: { campusId: "east", entranceId: "gate-a" },
      },
      {
        candidateId: "b",
        provider: "google",
        placeId: "place-b",
        displayName: "Hospital west entrance",
        address: "Taipei 2",
        confidence: "exact",
      },
    ],
  };
  const resolved: GeoResolveResponse = {
    provider: "google",
    resolvedAt: now,
    address: {
      address: "Taipei 1",
      normalizedAddress: "Taipei 1",
      lat: 25.03,
      lng: 121.56,
      placeId: "place-a",
      coordinateSource: "provider_candidate",
      geocodeConfidence: "exact",
      resolvedAt: now,
    },
  };
  const geo = {
    health: vi.fn(() => ({
      mode: "external",
      status: "healthy",
      failClosed: false,
    })),
    search: vi.fn(async () => search),
    resolve: vi.fn<
      (command: ResolveAddressCommand) => Promise<GeoResolveResponse>
    >(async () => resolved),
  };
  return {
    geo,
    search,
    resolved,
    locations: new VoiceLocationService(geo as unknown as GeoService),
    selection: { rawText: "Hospital", candidateId: "a", entranceId: "gate-a" },
  };
}

describe("UV-EXEC-013 provider address and entrance truth", () => {
  it("requires the selected campus entrance and preserves provider provenance", async () => {
    const h = locationHarness();
    await expect(
      h.locations.resolve({
        rawText: h.selection.rawText,
        candidateId: h.selection.candidateId,
      }),
    ).rejects.toThrow();
    await expect(
      h.locations.resolve({ ...h.selection, candidateId: "unknown" }),
    ).rejects.toThrow();
    const selected = await h.locations.resolve(h.selection);
    expect(selected.entranceId).toBe("gate-a");
    expect(selected.address.placeId).toBe("place-a");
    expect(h.geo.resolve.mock.calls[0]?.[0]).not.toHaveProperty(
      "selectedPoint",
    );
  });
  it.each(["missing", "approximate", "mismatch", "expired", "mock"])(
    "rejects %s provider truth",
    async (reason) => {
      const h = locationHarness();
      if (reason === "missing") h.resolved.address.lat = NaN;
      if (reason === "approximate")
        h.resolved.address.geocodeConfidence = "approximate";
      if (reason === "mismatch") h.resolved.address.placeId = "foreign";
      if (reason === "expired") h.resolved.resolvedAt = "2000-01-01T00:00:00Z";
      if (reason === "mock")
        h.geo.health.mockReturnValue({
          mode: "mock",
          status: "healthy",
          failClosed: false,
        });
      await expect(h.locations.resolve(h.selection)).rejects.toThrow();
    },
  );
});

function draftHarness() {
  vi.useFakeTimers().setSystemTime(new Date("2026-09-08T08:00:00Z"));
  const h = locationHarness();
  const scope = {
    scopeId: "scope",
    status: "active",
    version: 1,
    runtimeMapping: {
      runtimeProfileCode: "ordinary_taxi",
      serviceProductCode: "taxi_realtime",
    },
  };
  const session = {
    resourceScopeId: "scope",
    sessionVersion: 1,
    inputEpoch: 1,
    controlOwner: "ai",
    dialogState: "collecting",
  };
  const repository = {
    findSessionById: vi.fn(async () => session),
    findResourceScopeById: vi.fn(async () => scope),
  };
  const areas = new ServiceAreaService();
  const products = new ServiceProductService();
  products.upsertRuntimeProfilePolicy({
    runtimeProfileCode: "ordinary_taxi",
    serviceProductCode: "taxi_realtime",
    active: true,
    effectiveFrom: "2026-01-01T00:00:00Z",
  });
  const service = new VoiceBookingDraftService(
    repository as unknown as VoiceBookingRepository,
    h.locations,
    areas,
    products,
  );
  const command = {
    pickup: h.selection,
    dropoff: h.selection,
    timingMode: "on_demand" as const,
    requestedAt: "2026-09-08T16:00:00+08:00",
    timeZone: "Asia/Taipei" as const,
    requirements: requirements(),
  };
  return {
    ...h,
    scope,
    session,
    repository,
    areas,
    products,
    service,
    command,
  };
}

describe("UV-EXEC-013 absolute time and product routing", () => {
  it("normalizes Taipei time to an absolute UTC snapshot with scoped policy refs", async () => {
    const h = draftHarness();
    const snapshot = await h.service.qualify("session", h.command);
    expect(snapshot.bookingQualification.requestedAt).toBe(
      "2026-09-08T08:00:00.000Z",
    );
    expect(snapshot.bookingRequirements.passengerContact.phone).toBe(
      "0922222222",
    );
    expect(snapshot.bookingRequirements.validationReference).not.toBe(
      "validation-1",
    );
  });
  it.each(["manual_review", "not_serviceable"] as const)(
    "does not auto-qualify %s",
    async (decision) => {
      const h = draftHarness();
      const evaluate = h.areas.evaluate.bind(h.areas);
      vi.spyOn(h.areas, "evaluate").mockImplementation((command) => ({
        ...evaluate(command),
        decision,
      }));
      await expect(h.service.qualify("session", h.command)).rejects.toThrow();
    },
  );
  it.each([
    "scheduled",
    "multi_taxi",
    "ambiguous_time",
    "future_time",
    "stale_session",
  ])("preserves and rejects %s requests", async (reason) => {
    const h = draftHarness();
    if (reason === "multi_taxi")
      h.scope.runtimeMapping.runtimeProfileCode = "multi_taxi_direct";
    if (reason === "ambiguous_time")
      h.command.requestedAt = "2026-09-08T16:00:00";
    if (reason === "future_time")
      h.command.requestedAt = "2026-09-09T16:00:00+08:00";
    if (reason === "stale_session")
      h.repository.findSessionById
        .mockResolvedValueOnce({ ...h.session })
        .mockResolvedValue({ ...h.session, inputEpoch: 2 });
    const command =
      reason === "scheduled"
        ? { ...h.command, timingMode: "scheduled" as const }
        : h.command;
    const before = structuredClone(command);
    await expect(h.service.qualify("session", command)).rejects.toThrow();
    expect(command).toEqual(before);
  });
});

function ownedHarness(
  deps: {
    repository?: OwnedMobilityRepository;
    areas?: ServiceAreaService;
    products?: ServiceProductService;
    runtime?: RuntimeEligibilityEvaluator;
  } = {},
) {
  const audit = new AuditNotificationService();
  const events = new OpsDispatchEventsService(new EventEmitter() as never);
  const registry = new RegulatoryRegistryService(
    events,
    audit,
    new DriverProfileService(audit),
  );
  const vehicles = new VehicleEligibilityService(registry);
  const owned = new OwnedMobilityService(
    registry,
    audit,
    new CallcenterService(audit),
    new OwnedMobilityTaskEventsService(new EventEmitter() as never),
    events,
    deps.repository,
    undefined,
    vehicles,
    deps.products,
    undefined,
    deps.runtime,
    undefined,
    undefined,
    deps.areas,
  );
  return { owned, vehicles, registry };
}

describe("UV-EXEC-013 requirements in owned dispatch", () => {
  it.each([
    { serviceProductCode: "taxi_reservation" },
    { timingMode: "scheduled" },
    { operatingAuthorizationId: "multi-auth" },
    { reservationWindowStart: "2026-09-09T00:00:00Z" },
  ])("rejects routing overrides on the ordinary command %j", (override) => {
    const { owned } = ownedHarness();
    expect(() =>
      owned.createCallCenterOrder({
        ...override,
        callId: "call",
        agentId: "agent",
        pickup: { address: "A" },
        dropoff: { address: "B" },
        passenger: requirements().passengerContact,
      }),
    ).toThrow();
    expect(owned.listOrders()).toEqual([]);
  });

  it("maps the qualified draft through the voice UoW and blocks changed service-area/runtime conditions before assignment", async () => {
    const draft = draftHarness();
    const snapshot = await draft.service.qualify("session", draft.command);
    let stored: OwnedOrderRecord | undefined;
    const repository = {
      isEnabled: vi.fn(() => false),
      persistChanges: vi.fn(async () => {}),
      withTransaction: async <T>(work: (client: never) => Promise<T>) =>
        work({} as never),
      insertVoiceOrder: vi.fn(
        async (_client: unknown, order: OwnedOrderRecord) => {
          stored = structuredClone(order);
          return 1;
        },
      ),
    };
    const runtime = {
      assessAutonomous: vi.fn(() => "eligible"),
      evaluate: vi.fn(async () => ({
        serviceProductId: "taxi",
        serviceProductCode: "taxi_realtime",
        policyVersion: "v1",
        evaluatedAt: new Date().toISOString(),
        decision: "eligible",
        hardReasonCodes: [],
        softReasonCodes: [],
        missingRequirements: [],
        locationState: "fresh",
      })),
    };
    const { owned, registry } = ownedHarness({
      repository: repository as unknown as OwnedMobilityRepository,
      products: draft.products,
      areas: draft.areas,
      runtime: runtime as unknown as RuntimeEligibilityEvaluator,
    });
    const supply = registry.getEligibleCandidates.bind(registry);
    vi.spyOn(registry, "getEligibleCandidates").mockImplementation((bucket) =>
      supply(bucket),
    ); // Deterministic ETA fixture; no live routing evidence.
    const base = await owned.createCallCenterOrder({
      callId: "qualified-call",
      agentId: "agent",
      recordingId: "recording",
      pickup: snapshot.bookingQualification.pickup.address,
      dropoff: snapshot.bookingQualification.dropoff.address,
      passenger: requirements().passengerContact,
    });
    const prepared = owned.prepareQualifiedVoiceOrder(
      { ...base, voiceIntentId: "intent" },
      snapshot,
    );
    repository.isEnabled.mockReturnValue(true);
    const order = await owned.createVoiceOrder(prepared, "uv013_unit_uow");
    expect(stored?.bookingQualification).toEqual(snapshot.bookingQualification);
    expect(stored?.bookingRequirements).toEqual(snapshot.bookingRequirements);
    repository.isEnabled.mockReturnValue(false);
    const job = await owned.dispatchOrder(order.orderId, { mode: "auto" });
    const candidate = (
      await owned.listDispatchCandidates(job.dispatchJobId)
    )[0]!;
    expect(candidate).toBeDefined();
    const assign = () =>
      Promise.resolve().then(() =>
        owned.assignDispatch({
          dispatchJobId: job.dispatchJobId,
          vehicleId: candidate.vehicleId,
          driverId: candidate.driverId,
        }),
      );
    runtime.assessAutonomous.mockReturnValue("conditionally_eligible");
    expect(await owned.listDispatchCandidates(job.dispatchJobId)).toEqual([]);
    await expect(assign()).rejects.toThrow();
    runtime.assessAutonomous.mockReturnValue("eligible");
    const evaluate = draft.areas.evaluate.bind(draft.areas);
    const area = vi
      .spyOn(draft.areas, "evaluate")
      .mockImplementation((command) => ({
        ...evaluate(command),
        decision: "manual_review",
      }));
    await expect(assign()).rejects.toThrow();
    area.mockRestore();
    const assignment = await assign();
    const task = owned.getDriverTask(assignment.taskId);
    expect(task.bookingQualification).toEqual(snapshot.bookingQualification);
    expect(task.bookingRequirements).toEqual(snapshot.bookingRequirements);
    expect(task.bookingQualification?.pickup.entranceId).toBe("gate-a");
  });
  it.each([
    { passengerCount: 5 },
    { luggageSize: "oversized" as const },
    { requiredCapabilities: ["wheelchair" as const] },
    { requiredCapabilities: ["child_seat" as const] },
    { passengerCount: 0 },
    { luggageCount: -1 },
  ])("rejects unsupported requirements %j", (patch) => {
    expect(() => validateBookingRequirements(requirements(patch))).toThrow();
  });
  it("fails closed without vehicle capability truth", () => {
    expect(bookingRequirementFailures(requirements(), null)).toEqual([
      "BOOKING_CAPABILITY_UNVERIFIED",
    ]);
  });
  it("carries separate contact roles through order, candidates, assignment and driver task; rechecks changed capacity", async () => {
    const { owned, vehicles } = ownedHarness();
    const input = requirements();
    const order = await owned.createCallCenterOrder({
      callId: "uv013-call",
      agentId: "agent",
      recordingId: "recording",
      pickup: { address: "Taipei 1" },
      dropoff: { address: "Taipei 2" },
      passenger: input.passengerContact,
      bookingRequirements: input,
    });
    input.passengerCount = 1;
    expect(order.bookingRequirements?.passengerCount).toBe(3);
    const job = await owned.dispatchOrder(order.orderId, { mode: "auto" });
    const candidates = await owned.listDispatchCandidates(job.dispatchJobId);
    expect(candidates.length).toBeGreaterThan(0);
    const candidate = candidates[0]!;
    expect(candidate.bookingRequirements).toEqual(order.bookingRequirements);
    const capability = vehicles.resolveRuntimeVehicleCapability(
      candidate.vehicleId,
    )!;
    const lookup = vi.spyOn(vehicles, "resolveRuntimeVehicleCapability");
    for (const patch of [
      { seatCount: 2 },
      { luggageCapacity: 1 },
      { conditionallyAllowed: true },
    ]) {
      lookup.mockReturnValue({ ...capability, ...patch });
      expect(await owned.listDispatchCandidates(job.dispatchJobId)).toEqual([]);
      await expect(
        Promise.resolve().then(() =>
          owned.assignDispatch({
            dispatchJobId: job.dispatchJobId,
            vehicleId: candidate.vehicleId,
            driverId: candidate.driverId,
          }),
        ),
      ).rejects.toThrow();
    }
    lookup.mockReturnValue(capability);
    const assignment = await owned.assignDispatch({
      dispatchJobId: job.dispatchJobId,
      vehicleId: candidate.vehicleId,
      driverId: candidate.driverId,
    });
    expect(
      owned
        .getReportingSnapshot()
        .dispatchAssignments.find(
          (row) => row.assignmentId === assignment.assignmentId,
        )?.bookingRequirements,
    ).toEqual(order.bookingRequirements);
    expect(owned.getDriverTask(assignment.taskId).bookingRequirements).toEqual(
      order.bookingRequirements,
    );
  });
});
