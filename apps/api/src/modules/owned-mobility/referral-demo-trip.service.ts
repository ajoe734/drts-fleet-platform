import { randomUUID } from "node:crypto";
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import type {
  ActualTripFareBreakdown,
  DispatchCandidate,
  DriverTaskRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { ApiRequestError } from "../../common/api-envelope";
import type { BootstrapRequestIdentity } from "../../common/auth";
import { DatabaseService } from "../../common/db/database.service";
import { GeoService } from "../geo/geo.service";
import { estimateFare } from "../passenger-app/fare/fare.engine";
import { PassengerFareRepository } from "../passenger-app/fare/passenger-fare.repository";
import { RegulatoryRegistryRepository } from "../regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../vehicle-eligibility/vehicle-eligibility.service";
import { OwnedMobilityService } from "./owned-mobility.service";
import { referralDemoTripEnabled } from "./referral-demo-trip.config";
import { REFERRAL_DEMO_PROOF_PHOTO } from "./referral-demo-trip.proof";

/** Business test pairs reserved for this demo. Never the pax-review-* supply,
 * which shared-dev acceptance suites assign, pause and restore. */
export const REFERRAL_DEMO_SUPPLY = [1, 2, 3].map((n) => ({
  driverId: `referral-demo-driver-${n}`,
  vehicleId: `referral-demo-vehicle-${n}`,
  plateNo: `TEST-B00${n}`,
  name: `商務測試司機 ${n}（虛構）`,
}));
const DEMO_DRIVER_IDS = new Set(REFERRAL_DEMO_SUPPLY.map((p) => p.driverId));
// Existing registry records the demo pairs are cloned from, in preference order.
const TEMPLATE_VEHICLE_IDS = ["pax-review-vehicle-a", "veh-demo-001"];
const DEMO_ACTOR = {
  actorId: "referral-demo-trip",
  actorType: "system" as const,
  tenantId: null,
};
const DISPATCHABLE_ORDER_STATUSES = [
  "created",
  "ready_for_dispatch",
  "redispatch_required",
];
const OPEN_TASK_STATUSES = [
  "pending_acceptance",
  "accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
];
// Codes `OwnedMobilityService` raises when a transition is rejected because
// the task is no longer in the expected `from` state -- always thrown before
// that command mutates anything. Any other error (including one raised after
// this command's own mutation, persistence, audit or outbox step) is a real
// failure, not a sign that a concurrent request already finished the step.
const DRIVER_TASK_TRANSITION_RACE_CODES = new Set([
  "DRIVER_TASK_TRANSITION_INVALID",
  "PICKUP_NOT_ARRIVED",
  "ASSIGNMENT_NOT_AWAITING_ACCEPTANCE",
]);
// Simulated drive: depart ~1.3 km north of the pickup and arrive in three
// minutes; once the passenger boards, drive to the destination in the quoted
// route's own duration, so the live ETA (from the same route provider) counts
// down in step with the map. Testers can complete the trip at any time.
const APPROACH_START_LAT_OFFSET = 0.012;
const APPROACH_MS = 3 * 60_000;
const DEFAULT_RIDE_MS = 3 * 60_000;
const MAX_RIDE_MS = 90 * 60_000;
const HEARTBEAT_WORK_STATE: Record<
  string,
  "assigned" | "enroute" | "arrived" | "on_trip"
> = {
  pending_acceptance: "assigned",
  accepted: "assigned",
  enroute_pickup: "enroute",
  arrived_pickup: "arrived",
  on_trip: "on_trip",
  proof_pending: "on_trip",
};
// An abandoned demo trip holds its test pair; release it after this long.
const STALE_DEMO_TRIP_MS = 20 * 60_000;

export interface ReferralDemoTripResult {
  orderId: string;
  status: OwnedOrderRecord["status"];
  driverId: string | null;
  simulated: true;
}

/**
 * Drives one referral order through the normal dispatch and driver services
 * with a synthetic business test pair, for the bureau inspection demo only.
 * Every state change goes through the existing service methods, so audit,
 * outbox, reservation, settlement, receipt and rating behave as in a real
 * trip; only the driver, GPS and completion facts are simulated.
 */
@Injectable()
export class ReferralDemoTripService {
  private readonly logger = new Logger(ReferralDemoTripService.name);

  constructor(
    private readonly orders: OwnedMobilityService,
    private readonly registry: RegulatoryRegistryService,
    private readonly registryRepository: RegulatoryRegistryRepository,
    private readonly eligibility: VehicleEligibilityService,
    private readonly fares: PassengerFareRepository,
    private readonly geo: GeoService,
    private readonly database: DatabaseService,
  ) {}

  async assign(
    orderId: string,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<ReferralDemoTripResult> {
    this.requireEnabled();
    const order = await this.orders.requireOwnedReferralPassengerOrder(
      orderId,
      identity,
    );
    this.requireReferralBusinessOrder(order);
    const open = await this.openDemoTask(orderId);
    if (open) return this.result(orderId, open.driverId);
    if (!DISPATCHABLE_ORDER_STATUSES.includes(order.status))
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REFERRAL_DEMO_TRIP_NOT_DISPATCHABLE",
        "This trip can no longer be assigned a test driver.",
        { status: order.status },
      );

    await this.prepareSupply();
    await this.releaseStaleDemoTrips(requestId);
    const pickup = this.point(order.pickup, "pickup");
    const busy = await this.busyDemoDrivers();
    const idle = REFERRAL_DEMO_SUPPLY.filter((p) => !busy.has(p.driverId));
    if (idle.length === 0)
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REFERRAL_DEMO_TRIP_SUPPLY_BUSY",
        "All test drivers are serving other demo trips. Try again shortly.",
      );
    // Only idle pairs go online, at the pickup, for the length of this call.
    for (const pair of idle) {
      await this.registry.updateDriverWorkStateFromPersistence(pair.driverId, {
        workState: "available",
      });
      await this.registry.recordDriverLocation({
        driverId: pair.driverId,
        ...pickup,
        accuracyM: 5,
        recordedAt: new Date().toISOString(),
      });
    }
    let assigned: (typeof REFERRAL_DEMO_SUPPLY)[number] | null = null;
    try {
      const eligible = idle.filter((pair) => this.isAssignable(order, pair));
      // Dispatching without an eligible pair would push the passenger's order
      // into the no-supply exception path, so refuse before dispatching.
      if (eligible.length === 0)
        throw new ApiRequestError(
          HttpStatus.SERVICE_UNAVAILABLE,
          "REFERRAL_DEMO_TRIP_SUPPLY_UNAVAILABLE",
          "The test drivers are not eligible for this trip.",
        );
      await this.orders.prepareOrderAction({ orderId });
      const job = await this.orders.dispatchOrder(
        orderId,
        { mode: "auto" },
        requestId,
        `referral-demo-dispatch:${orderId}:${randomUUID()}`,
        { required: true },
      );
      const dispatchJobId = String(job?.dispatchJobId ?? "");
      if (!dispatchJobId)
        throw new ApiRequestError(
          HttpStatus.BAD_GATEWAY,
          "REFERRAL_DEMO_TRIP_DISPATCH_FAILED",
          "Dispatch did not return a job.",
        );
      const candidates = await this.orders.listDispatchCandidates(
        dispatchJobId,
        true,
      );
      for (const pair of eligible) {
        if (!this.isCandidate(candidates, pair)) continue;
        try {
          await this.orders.prepareOrderAction({ dispatchJobId });
          await this.orders.assignDispatch(
            {
              dispatchJobId,
              driverId: pair.driverId,
              vehicleId: pair.vehicleId,
            },
            requestId,
            `referral-demo-assign:${orderId}:${randomUUID()}`,
            { required: true },
          );
          assigned = pair;
          break;
        } catch (error) {
          // Another demo trip took this pair between the check and the lock.
          if (
            this.errorCode(error) !== "DISPATCH_RESOURCE_RESERVATION_CONFLICT"
          )
            throw error;
        }
      }
      if (!assigned)
        throw new ApiRequestError(
          HttpStatus.CONFLICT,
          "REFERRAL_DEMO_TRIP_SUPPLY_BUSY",
          "No test driver could be assigned. Try again shortly.",
        );
      // Accept at once (an assignment left unaccepted times out after 60 s)
      // and set off for the pickup, as a driver would.
      const task = await this.requireOpenDemoTask(orderId);
      const enroute = await this.advanceTo(
        order,
        task,
        "enroute_pickup",
        requestId,
      );
      await this.recordSimulatedLocation(order, enroute);
      return this.result(orderId, assigned.driverId);
    } finally {
      for (const pair of idle)
        if (pair !== assigned)
          await this.registry
            .updateDriverWorkStateFromPersistence(pair.driverId, {
              workState: "offline",
            })
            .catch((error: unknown) =>
              this.logger.warn(
                `referral demo: could not take ${pair.driverId} offline: ${String(error)}`,
              ),
            );
    }
  }

  async complete(
    orderId: string,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<ReferralDemoTripResult> {
    this.requireEnabled();
    const order = await this.orders.requireOwnedReferralPassengerOrder(
      orderId,
      identity,
    );
    this.requireReferralBusinessOrder(order);
    if (order.status === "completed") return this.result(orderId, null);
    const task = await this.openDemoTask(orderId);
    if (!task)
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REFERRAL_DEMO_TRIP_NOT_ASSIGNED",
        "Only a trip served by a test driver can be completed here.",
      );
    await this.finishTask(order, task, requestId);
    return this.result(orderId, task.driverId);
  }

  /** Tester shortcut: the test driver reaches the pickup now. */
  async arrive(
    orderId: string,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<ReferralDemoTripResult> {
    return this.moveTo(orderId, identity, "arrived_pickup", requestId);
  }

  /** The passenger boards at the pickup and the trip starts. */
  async board(
    orderId: string,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<ReferralDemoTripResult> {
    return this.moveTo(orderId, identity, "on_trip", requestId);
  }

  /**
   * The simulated driver app's periodic location heartbeat, bound to the demo
   * task as the real app's is, so the passenger's live tracking and ETA have
   * a fresh position (freshness lapses after 90 s without one). The driver
   * also reports arrival once the approach has been driven, and ends the trip
   * once the ride has reached the destination; boarding waits for the tester.
   */
  async heartbeat(
    orderId: string,
    identity: BootstrapRequestIdentity | null,
    requestId?: string,
  ): Promise<ReferralDemoTripResult> {
    this.requireEnabled();
    const order = await this.orders.requireOwnedReferralPassengerOrder(
      orderId,
      identity,
    );
    this.requireReferralBusinessOrder(order);
    let task = await this.openDemoTask(orderId);
    if (!task)
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REFERRAL_DEMO_TRIP_NOT_ASSIGNED",
        "Only a trip served by a test driver reports a test location.",
      );
    if (["pending_acceptance", "accepted"].includes(task.status))
      task = await this.advanceTo(order, task, "enroute_pickup", requestId);
    if (task.status === "enroute_pickup" && this.approachDriven(task))
      task = await this.advanceTo(order, task, "arrived_pickup", requestId);
    if (
      ["on_trip", "proof_pending"].includes(task.status) &&
      this.rideDriven(order, task)
    ) {
      // At the destination the driver ends the trip, as a real one would.
      await this.finishTask(order, task, requestId);
      return this.result(orderId, task.driverId);
    }
    await this.recordSimulatedLocation(order, task);
    return this.result(orderId, task.driverId);
  }

  private async moveTo(
    orderId: string,
    identity: BootstrapRequestIdentity | null,
    until: "arrived_pickup" | "on_trip",
    requestId?: string,
  ): Promise<ReferralDemoTripResult> {
    this.requireEnabled();
    const order = await this.orders.requireOwnedReferralPassengerOrder(
      orderId,
      identity,
    );
    this.requireReferralBusinessOrder(order);
    const task = await this.openDemoTask(orderId);
    if (!task)
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REFERRAL_DEMO_TRIP_NOT_ASSIGNED",
        "Only a trip served by a test driver can be moved along here.",
      );
    const moved = await this.advanceTo(order, task, until, requestId);
    await this.recordSimulatedLocation(order, moved);
    return this.result(orderId, task.driverId);
  }

  /** The quoted route's driving time, or three minutes when unknown. */
  private rideMs(order: OwnedOrderRecord) {
    const seconds = Number(
      order.referralPassengerLifecycle?.quote?.route?.durationSeconds,
    );
    return Number.isFinite(seconds) && seconds > 0
      ? Math.min(seconds * 1000, MAX_RIDE_MS)
      : DEFAULT_RIDE_MS;
  }

  private rideDriven(
    order: OwnedOrderRecord,
    task: DriverTaskRecord,
    now = Date.now(),
  ) {
    const since = Date.parse(task.startedAt ?? "");
    return Number.isFinite(since) && now - since >= this.rideMs(order);
  }

  private approachDriven(task: DriverTaskRecord, now = Date.now()) {
    const since = Date.parse(task.departedAt ?? task.acceptedAt ?? "");
    return Number.isFinite(since) && now - since >= APPROACH_MS;
  }

  /**
   * About 1.3 km north of the pickup on departure, closing in over the
   * approach; at the pickup once arrived; then along the straight line to the
   * destination over the ride once the passenger is on board.
   */
  simulatedPosition(
    order: OwnedOrderRecord,
    task: DriverTaskRecord,
    now = Date.now(),
  ) {
    const pickup = this.point(order.pickup, "pickup");
    const progress = (since: string | null | undefined, span: number) =>
      Math.min(1, Math.max(0, (now - (Date.parse(since ?? "") || now)) / span));
    if (
      ["pending_acceptance", "accepted", "enroute_pickup"].includes(task.status)
    ) {
      const done = progress(task.departedAt ?? task.acceptedAt, APPROACH_MS);
      return {
        lat: pickup.lat + APPROACH_START_LAT_OFFSET * (1 - done),
        lng: pickup.lng,
      };
    }
    if (["on_trip", "proof_pending"].includes(task.status)) {
      const dropoff = this.point(order.dropoff, "dropoff");
      const done = progress(task.startedAt, this.rideMs(order));
      return {
        lat: pickup.lat + (dropoff.lat - pickup.lat) * done,
        lng: pickup.lng + (dropoff.lng - pickup.lng) * done,
      };
    }
    return pickup;
  }

  private async recordSimulatedLocation(
    order: OwnedOrderRecord,
    task: DriverTaskRecord,
  ) {
    const position = this.simulatedPosition(order, task);
    await this.registry.recordDriverLocationBatch({
      items: [
        {
          eventId: randomUUID(),
          deviceId: `referral-demo-device-${task.driverId}`,
          driverId: task.driverId,
          vehicleId: task.vehicleId,
          taskId: task.taskId,
          sequenceNo: Date.now(),
          recordedAt: new Date().toISOString(),
          ...position,
          accuracyM: 5,
          workState: HEARTBEAT_WORK_STATE[task.status] ?? "assigned",
          appState: "foreground",
          transportMode: "foreground",
          networkType: "wifi",
        },
      ],
    });
  }

  /**
   * Runs the normal driver steps (accept → depart → arrive → start) until the
   * task reaches `until`, skipping steps already done. A step that another
   * request (the heartbeat or a second tap) completed first is not an error.
   */
  private async advanceTo(
    order: OwnedOrderRecord,
    task: DriverTaskRecord,
    until: "enroute_pickup" | "arrived_pickup" | "on_trip",
    requestId?: string,
  ): Promise<DriverTaskRecord> {
    const steps: Array<[string, () => Promise<unknown>]> = [
      [
        "pending_acceptance",
        () =>
          this.orders.acceptDriverTask(
            task.taskId,
            { acceptedAt: new Date().toISOString() },
            requestId,
          ),
      ],
      [
        "accepted",
        () =>
          this.orders.departDriverTask(
            task.taskId,
            {
              departedAt: new Date().toISOString(),
              currentLocation: this.simulatedPosition(order, task),
            },
            requestId,
          ),
      ],
      [
        "enroute_pickup",
        () =>
          this.orders.arrivedPickup(
            task.taskId,
            { arrivedAt: new Date().toISOString() },
            requestId,
          ),
      ],
      [
        "arrived_pickup",
        () =>
          this.orders.startDriverTask(
            task.taskId,
            { startedAt: new Date().toISOString() },
            requestId,
          ),
      ],
    ];
    const sequence = [
      ...steps.map(([from]) => from),
      "on_trip",
      "proof_pending",
    ];
    let current = task;
    for (const [from, run] of steps) {
      if (current.status === until) break;
      if (current.status !== from) continue;
      await this.orders.prepareOrderAction({ taskId: task.taskId });
      try {
        await run();
      } catch (error) {
        // Only an identified transition-conflict error can mean another
        // request already finished this step -- the driver command raises
        // that error before it mutates anything, so it never hides our own
        // failed mutation, persistence, audit or outbox step. Any other
        // error (including one raised after this command advanced and
        // persisted local state) is a real failure and must reach the
        // caller, not be reported as a successful arrival/boarding/
        // completion.
        const code = this.errorCode(error);
        if (!code || !DRIVER_TASK_TRANSITION_RACE_CODES.has(code)) throw error;
        // Reload the authoritative task before trusting that race: the
        // in-memory copy can be stale, and only a reload-confirmed advance
        // proves the other request's step was actually completed.
        await this.orders.prepareOrderAction({ taskId: task.taskId });
        const latest = this.orders.getDriverTask(task.taskId);
        if (sequence.indexOf(latest.status) <= sequence.indexOf(from))
          throw error;
      }
      current = this.orders.getDriverTask(task.taskId);
    }
    return current;
  }

  /** Accept → depart → arrive → start → complete, skipping steps already done. */
  private async finishTask(
    order: OwnedOrderRecord,
    task: DriverTaskRecord,
    requestId?: string,
  ) {
    const status = (await this.advanceTo(order, task, "on_trip", requestId))
      .status;
    if (status !== "on_trip" && status !== "proof_pending")
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REFERRAL_DEMO_TRIP_NOT_COMPLETABLE",
        "The test trip is not in a state that can be completed.",
        { status },
      );
    const proof = order.proofRequirements;
    if (
      proof.minPhotoCount > 1 ||
      proof.signoffRequired ||
      proof.expenseProofRequired
    )
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REFERRAL_DEMO_TRIP_PROOF_UNSUPPORTED",
        "This trip needs completion proof the demo cannot provide.",
      );
    const actual = await this.simulatedActuals(order);
    await this.orders.prepareOrderAction({ taskId: task.taskId });
    try {
      await this.orders.completeDriverTask(
        task.taskId,
        {
          completedAt: new Date().toISOString(),
          actualDistanceKm: actual.distanceKm,
          actualDurationSec: actual.durationSec,
          ...(order.fixedPrice ? {} : { fare: actual.fare }),
          actualFareBreakdown: actual.breakdown,
          proof: { photos: [REFERRAL_DEMO_PROOF_PHOTO] },
        },
        requestId,
      );
    } catch (error) {
      // The heartbeat at the destination and a tap can both end the trip;
      // the first one to complete it wins.
      if (this.orders.getDriverTask(task.taskId).status !== "completed")
        throw error;
    }
    await this.registry
      .updateDriverWorkStateFromPersistence(task.driverId, {
        workState: "offline",
      })
      .catch((error: unknown) =>
        this.logger.warn(
          `referral demo: could not take ${task.driverId} offline: ${String(error)}`,
        ),
      );
  }

  /**
   * The simulated driver reports the quoted route at the quote's tariff: the
   * fare is the lower end of the estimate the passenger saw (no waiting time),
   * split into the tariff's start fare, its night fee when it applied, and the
   * remaining distance and fixed-fee part.
   */
  async simulatedActuals(order: OwnedOrderRecord): Promise<{
    fare: { currency: "TWD"; amountMinor: number };
    breakdown: ActualTripFareBreakdown;
    distanceKm: number;
    durationSec: number;
  }> {
    const quote = order.referralPassengerLifecycle?.quote;
    const pricingAt = quote?.pricingAt ?? new Date().toISOString();
    const origin = this.point(order.pickup, "pickup");
    const destination = this.point(order.dropoff, "dropoff");
    const [tariff, route] = await Promise.all([
      this.fares.publishedTariff(pricingAt),
      this.geo.route({
        origin,
        destination,
        travelMode: "drive",
        requestedByActorId: DEMO_ACTOR.actorId,
      }),
    ]);
    const distanceMeters = Number(route?.distanceMeters);
    const durationSeconds = Number(route?.durationSeconds);
    if (
      !tariff ||
      !Number.isFinite(distanceMeters) ||
      !Number.isFinite(durationSeconds)
    )
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "REFERRAL_DEMO_TRIP_FARE_UNAVAILABLE",
        "The tariff or route for this trip is unavailable.",
      );
    const estimate = estimateFare(tariff, {
      distanceMeters,
      durationSeconds,
      scheduledAt: pricingAt,
    });
    const amountMinor = order.fixedPrice
      ? (order.quotedFare?.amountMinor ?? estimate.estimatedMin * 100)
      : estimate.estimatedMin * 100;
    const startMinor = Math.min(amountMinor, tariff.baseFare * 100);
    const nightMinor = Math.min(
      amountMinor - startMinor,
      estimate.breakdown.nightApplies ? tariff.nightSurchargeAmount * 100 : 0,
    );
    return {
      fare: { currency: "TWD", amountMinor },
      breakdown: {
        startMinor,
        distanceMinor: amountMinor - startMinor - nightMinor,
        delayMinor: 0,
        nightMinor,
      },
      distanceKm: Math.round(distanceMeters / 100) / 10,
      durationSec: Math.round(durationSeconds),
    };
  }

  /** Idempotently create the demo business pairs from an existing vehicle. */
  async prepareSupply() {
    if (!this.database.isEnabled())
      throw new ApiRequestError(
        HttpStatus.SERVICE_UNAVAILABLE,
        "REFERRAL_DEMO_TRIP_SUPPLY_UNAVAILABLE",
        "Registry storage is unavailable.",
      );
    const state = await this.registryRepository.loadState();
    const missingVehicles = REFERRAL_DEMO_SUPPLY.filter(
      (pair) => !state.vehicles.some((v) => v.vehicleId === pair.vehicleId),
    );
    const now = new Date().toISOString();
    const start = "2026-01-01T00:00:00.000Z";
    const end = "2099-01-01T00:00:00.000Z";
    for (const pair of REFERRAL_DEMO_SUPPLY)
      if (!state.drivers.some((d) => d.driverId === pair.driverId))
        await this.registry.createDriver({
          driverId: pair.driverId,
          name: pair.name,
          lifecycleStatus: "active",
          licensesValid: true,
          licenseExpiry: end,
          professionalDriverLicenseExpiry: end,
          taxiDriverRegistrationExpiry: end,
          supportedServiceBuckets: ["business_dispatch"],
        });
    if (missingVehicles.length > 0) {
      const templateId = TEMPLATE_VEHICLE_IDS.find((id) =>
        this.registry.listVehicles().some((v) => v.vehicleId === id),
      );
      const template = this.registry
        .listVehicles()
        .find((v) => v.vehicleId === templateId);
      const contract = this.registry
        .listContracts()
        .find((c) => c.vehicleId === templateId);
      const policy = this.registry
        .listPolicies()
        .find((p) => p.vehicleId === templateId);
      const exclusivity = this.registry
        .listExclusivities()
        .find((e) => e.vehicleId === templateId);
      if (!template || !contract || !policy || !exclusivity)
        throw new ApiRequestError(
          HttpStatus.SERVICE_UNAVAILABLE,
          "REFERRAL_DEMO_TRIP_SUPPLY_UNAVAILABLE",
          "No existing vehicle can serve as the test vehicle template.",
        );
      await this.registryRepository.persistChanges({
        vehicles: missingVehicles.map((pair) => ({
          ...structuredClone(template),
          vehicleId: pair.vehicleId,
          plateNo: pair.plateNo,
          operatingArea: "taipei",
          supportedServiceBuckets: ["business_dispatch"],
          dispatchableFlag: true,
          insuranceStatus: "valid",
          exclusivityApproved: true,
          createdAt: now,
          updatedAt: now,
        })),
        contracts: missingVehicles.map((pair) => ({
          ...contract,
          contractId: `referral-demo-contract-${pair.vehicleId}`,
          vehicleId: pair.vehicleId,
          operatingAreaId: "taipei",
          startAt: start,
          endAt: end,
          createdAt: now,
          updatedAt: now,
        })),
        policies: missingVehicles.map((pair) => ({
          ...policy,
          policyId: `referral-demo-policy-${pair.vehicleId}`,
          vehicleId: pair.vehicleId,
          policyNo: `SIMULATED-${pair.vehicleId}`,
          insurerName: "虛構測試保險來源",
          startAt: start,
          endAt: end,
          createdAt: now,
          updatedAt: now,
        })),
        exclusivities: missingVehicles.map((pair) => ({
          ...exclusivity,
          vehicleId: pair.vehicleId,
          declarationFileId: "referral-demo-simulated-document",
          exclusiveProviderName: "虛構測試車隊",
          effectiveStart: start,
          effectiveEnd: end,
          updatedAt: now,
        })),
        supplyPairs: missingVehicles.map((pair) => ({
          vehicleId: pair.vehicleId,
          driverId: pair.driverId,
          etaMinutes: 1,
        })),
        disclosureProfiles: missingVehicles.map((pair) => ({
          vehicleId: pair.vehicleId,
          make: "測試車廠",
          model: "虛構展示車",
          modelYear: 2026,
          doorCount: 4,
          color: "白",
          status: "complete" as const,
          missingFieldCodes: [],
          verifiedByActorId: DEMO_ACTOR.actorId,
          verifiedAt: now,
          sourceSubmissionId: null,
          version: 1,
          updatedAt: now,
        })),
      });
    }
    await this.registryRepository.persistChanges({
      driverCredentials: REFERRAL_DEMO_SUPPLY.map((pair, index) => ({
        driverId: pair.driverId,
        registrationNo: `SIMULATED-NOT-REAL-B${index + 1}`,
        registrationArea: "測試・非真實證照",
        effectiveFrom: start,
        effectiveUntil: end,
        status: "verified_active" as const,
        maskedDisplay: `••••B00${index + 1}`,
        verifiedByActorId: DEMO_ACTOR.actorId,
        verifiedAt: now,
        sourceSubmissionId: null,
        version: 1,
        updatedAt: now,
      })),
    });
    await this.registry.prepareDispatchSupply("business_dispatch");
    await this.eligibility.enableServiceProductForSupply(
      "enterprise_dispatch",
      REFERRAL_DEMO_SUPPLY.map((pair) => pair.vehicleId),
      DEMO_ACTOR,
    );
  }

  /** Complete demo trips nobody finished, so their test pair can be reused. */
  private async releaseStaleDemoTrips(requestId?: string) {
    const rows = await this.database.query<{ record: DriverTaskRecord }>(
      `SELECT record FROM ops.phase1_driver_tasks
        WHERE record->>'driverId' = ANY($1::text[])
          AND status = ANY($2::text[])
          AND updated_at < now() - ($3::int * interval '1 millisecond')`,
      [[...DEMO_DRIVER_IDS], OPEN_TASK_STATUSES, STALE_DEMO_TRIP_MS],
    );
    for (const { record } of rows.rows) {
      try {
        await this.orders.prepareOrderAction({ orderId: record.orderId });
        const order = await this.orders.getOrderForRead(record.orderId);
        await this.finishTask(
          order,
          this.orders.getDriverTask(record.taskId),
          requestId,
        );
      } catch (error) {
        this.logger.warn(
          `referral demo: could not release stale trip ${record.orderId}: ${String(error)}`,
        );
      }
    }
  }

  private async busyDemoDrivers() {
    const rows = await this.database.query<{ driver_id: string }>(
      `SELECT DISTINCT record->>'driverId' AS driver_id FROM ops.phase1_driver_tasks
        WHERE record->>'driverId' = ANY($1::text[]) AND status = ANY($2::text[])`,
      [[...DEMO_DRIVER_IDS], OPEN_TASK_STATUSES],
    );
    return new Set(rows.rows.map((row) => row.driver_id));
  }

  private async openDemoTask(orderId: string) {
    await this.orders.prepareOrderAction({ orderId });
    return (
      this.orders
        .getDriverTasksForOrder(orderId)
        .find(
          (task) =>
            DEMO_DRIVER_IDS.has(task.driverId) &&
            OPEN_TASK_STATUSES.includes(task.status),
        ) ?? null
    );
  }

  private async requireOpenDemoTask(orderId: string) {
    const task = await this.openDemoTask(orderId);
    if (!task)
      throw new ApiRequestError(
        HttpStatus.BAD_GATEWAY,
        "REFERRAL_DEMO_TRIP_TASK_MISSING",
        "The assignment did not produce a driver task.",
      );
    return task;
  }

  private isAssignable(
    order: OwnedOrderRecord,
    pair: (typeof REFERRAL_DEMO_SUPPLY)[number],
  ) {
    try {
      this.eligibility.assertDispatchAssignmentEligible(
        order,
        pair.vehicleId,
        pair.driverId,
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `referral demo: ${pair.driverId} not eligible: ${this.errorCode(error) ?? String(error)}`,
      );
      return false;
    }
  }

  private isCandidate(
    candidates: DispatchCandidate[],
    pair: (typeof REFERRAL_DEMO_SUPPLY)[number],
  ) {
    return candidates.some(
      (c) =>
        c.driverId === pair.driverId &&
        c.vehicleId === pair.vehicleId &&
        c.eligibilityDecision !== "ineligible" &&
        (c.hardReasonCodes?.length ?? 0) === 0,
    );
  }

  private requireReferralBusinessOrder(order: OwnedOrderRecord) {
    if (
      order.serviceBucket !== "business_dispatch" ||
      !order.referralPassengerLifecycle
    )
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REFERRAL_DEMO_TRIP_UNSUPPORTED_ORDER",
        "Only referral business trips can use the demo driver.",
      );
  }

  private requireEnabled() {
    if (!referralDemoTripEnabled(process.env))
      throw new ApiRequestError(404, "not_found", "Not found.");
  }

  private point(address: OwnedOrderRecord["pickup"], field: string) {
    const lat = address?.lat;
    const lng = address?.lng;
    if (typeof lat !== "number" || typeof lng !== "number")
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        "REFERRAL_DEMO_TRIP_COORDINATES_MISSING",
        `The trip ${field} has no coordinates.`,
      );
    return { lat, lng };
  }

  private errorCode(error: unknown) {
    return error instanceof ApiRequestError ? error.code : undefined;
  }

  private async result(
    orderId: string,
    driverId: string | null,
  ): Promise<ReferralDemoTripResult> {
    const order = await this.orders.getOrderForRead(orderId);
    return { orderId, status: order.status, driverId, simulated: true };
  }
}
