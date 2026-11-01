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
import { PassengerFareRepository } from "../passenger-app/fare/passenger-fare.repository";
import { RegulatoryRegistryRepository } from "../regulatory-registry/regulatory-registry.repository";
import { RegulatoryRegistryService } from "../regulatory-registry/regulatory-registry.service";
import { VehicleEligibilityService } from "../vehicle-eligibility/vehicle-eligibility.service";
import { OwnedMobilityService } from "./owned-mobility.service";
import { REFERRAL_DEMO_PROOF_PHOTO } from "./referral-demo-trip.proof";

/** One synthetic driver and vehicle a demo trip may be served by. */
export interface DemoTripSupplyPair {
  driverId: string;
  vehicleId: string;
  plateNo: string;
  name: string;
}
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

export interface DemoTripResult {
  orderId: string;
  status: OwnedOrderRecord["status"];
  driverId: string | null;
  simulated: true;
}

/**
 * Drives one order through the normal dispatch and driver services with a
 * synthetic test pair, for the bureau inspection demos only. Every state
 * change goes through the existing service methods, so audit, outbox,
 * reservation, settlement, receipt and rating behave as in a real trip; only
 * the driver, GPS and completion facts are simulated. Subclasses decide which
 * orders a caller may drive, which pairs serve them, and the quoted facts the
 * simulated driver reports.
 */
@Injectable()
export abstract class DemoTripEngine<
  Identity = BootstrapRequestIdentity | null,
> {
  protected abstract readonly logger: Logger;
  protected abstract readonly supply: readonly DemoTripSupplyPair[];
  /** Prefix of every error code, e.g. `REFERRAL_DEMO_TRIP`. */
  protected abstract readonly errorPrefix: string;
  /** Prefix of the simulated GPS device id and of log lines. */
  protected abstract readonly label: string;

  constructor(
    protected readonly orders: OwnedMobilityService,
    protected readonly registry: RegulatoryRegistryService,
    protected readonly registryRepository: RegulatoryRegistryRepository,
    protected readonly eligibility: VehicleEligibilityService,
    protected readonly fares: PassengerFareRepository,
    protected readonly geo: GeoService,
    protected readonly database: DatabaseService,
  ) {}

  /** 404 unless this demo is enabled in a nonproduction environment. */
  protected abstract requireEnabled(): void;
  /** The order, after checking the caller owns it and the demo serves it. */
  protected abstract requireDemoOrder(
    orderId: string,
    identity: Identity,
  ): Promise<OwnedOrderRecord>;
  /** The quoted route's driving time in seconds, when the quote has one. */
  protected abstract quotedRouteSeconds(
    order: OwnedOrderRecord,
  ): number | undefined;
  /** Distance, duration and fare the simulated driver reports at the end. */
  abstract simulatedActuals(order: OwnedOrderRecord): Promise<{
    fare: { currency: "TWD"; amountMinor: number };
    breakdown: ActualTripFareBreakdown;
    distanceKm: number;
    durationSec: number;
  }>;
  /** Idempotently create the test pairs this demo dispatches. */
  abstract prepareSupply(): Promise<void>;

  private get demoDriverIds() {
    return new Set(this.supply.map((pair) => pair.driverId));
  }

  protected code(suffix: string) {
    return `${this.errorPrefix}_${suffix}`;
  }

  async assign(
    orderId: string,
    identity: Identity,
    requestId?: string,
  ): Promise<DemoTripResult> {
    this.requireEnabled();
    const order = await this.requireDemoOrder(orderId, identity);
    const open = await this.openDemoTask(orderId);
    if (open) return this.result(orderId, open.driverId);
    if (!DISPATCHABLE_ORDER_STATUSES.includes(order.status))
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        this.code("NOT_DISPATCHABLE"),
        "This trip can no longer be assigned a test driver.",
        { status: order.status },
      );

    await this.prepareSupply();
    await this.releaseStaleDemoTrips(requestId);
    const pickup = this.point(order.pickup, "pickup");
    const busy = await this.busyDemoDrivers();
    const idle = this.supply.filter((p) => !busy.has(p.driverId));
    if (idle.length === 0)
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        this.code("SUPPLY_BUSY"),
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
    let assigned: DemoTripSupplyPair | null = null;
    try {
      const eligible = idle.filter((pair) => this.isAssignable(order, pair));
      // Dispatching without an eligible pair would push the passenger's order
      // into the no-supply exception path, so refuse before dispatching.
      if (eligible.length === 0)
        throw new ApiRequestError(
          HttpStatus.SERVICE_UNAVAILABLE,
          this.code("SUPPLY_UNAVAILABLE"),
          "The test drivers are not eligible for this trip.",
        );
      await this.orders.prepareOrderAction({ orderId });
      const job = await this.orders.dispatchOrder(
        orderId,
        { mode: "auto" },
        requestId,
        `${this.label}-dispatch:${orderId}:${randomUUID()}`,
        { required: true },
      );
      const dispatchJobId = String(job?.dispatchJobId ?? "");
      if (!dispatchJobId)
        throw new ApiRequestError(
          HttpStatus.BAD_GATEWAY,
          this.code("DISPATCH_FAILED"),
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
            `${this.label}-assign:${orderId}:${randomUUID()}`,
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
          this.code("SUPPLY_BUSY"),
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
                `${this.label}: could not take ${pair.driverId} offline: ${String(error)}`,
              ),
            );
    }
  }

  async complete(
    orderId: string,
    identity: Identity,
    requestId?: string,
  ): Promise<DemoTripResult> {
    this.requireEnabled();
    const order = await this.requireDemoOrder(orderId, identity);
    if (order.status === "completed") return this.result(orderId, null);
    const task = await this.openDemoTask(orderId);
    if (!task) {
      // No open demo task survived `openDemoTask`'s own canonical reload --
      // a concurrent heartbeat or tap may have already completed this
      // exact task between this call's stale `order` read and that reload.
      // That is the only benign reason; any other (cancelled, reassigned to
      // a real driver, never dispatched) must still fail as before.
      const reconciled = await this.reconcileAlreadyCompletedOrder(orderId);
      if (reconciled) return reconciled;
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        this.code("NOT_ASSIGNED"),
        "Only a trip served by a test driver can be completed here.",
      );
    }
    await this.finishTask(order, task, requestId);
    return this.result(orderId, task.driverId);
  }

  /** Tester shortcut: the test driver reaches the pickup now. */
  async arrive(
    orderId: string,
    identity: Identity,
    requestId?: string,
  ): Promise<DemoTripResult> {
    return this.moveTo(orderId, identity, "arrived_pickup", requestId);
  }

  /** The passenger boards at the pickup and the trip starts. */
  async board(
    orderId: string,
    identity: Identity,
    requestId?: string,
  ): Promise<DemoTripResult> {
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
    identity: Identity,
    requestId?: string,
  ): Promise<DemoTripResult> {
    this.requireEnabled();
    const order = await this.requireDemoOrder(orderId, identity);
    let task = await this.openDemoTask(orderId);
    if (!task) {
      const reconciled = await this.reconcileAlreadyCompletedOrder(orderId);
      if (reconciled) return reconciled;
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        this.code("NOT_ASSIGNED"),
        "Only a trip served by a test driver reports a test location.",
      );
    }
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
    identity: Identity,
    until: "arrived_pickup" | "on_trip",
    requestId?: string,
  ): Promise<DemoTripResult> {
    this.requireEnabled();
    const order = await this.requireDemoOrder(orderId, identity);
    const task = await this.openDemoTask(orderId);
    if (!task)
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        this.code("NOT_ASSIGNED"),
        "Only a trip served by a test driver can be moved along here.",
      );
    const moved = await this.advanceTo(order, task, until, requestId);
    await this.recordSimulatedLocation(order, moved);
    return this.result(orderId, task.driverId);
  }

  /** The quoted route's driving time, or three minutes when unknown. */
  private rideMs(order: OwnedOrderRecord) {
    const seconds = Number(this.quotedRouteSeconds(order));
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
          deviceId: `${this.label}-device-${task.driverId}`,
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
    let advanced: DriverTaskRecord;
    try {
      advanced = await this.advanceTo(order, task, "on_trip", requestId);
    } catch (error) {
      // `advanceTo` itself already reload-checked this code and found the
      // task no further along than the step it was retrying -- but
      // "completed" is deliberately not part of its own allowed sequence
      // (letting arrive/board treat a completed trip as a successful
      // advance would let them keep sending GPS after completion). Only
      // here, for the completion caller specifically, does a reload-
      // confirmed `completed` on the SAME order/task mean a concurrent
      // heartbeat or tap already finished this trip -- not that our own
      // pending step (which never mutated anything, by the same guarantee
      // `advanceTo` relies on) succeeded.
      const code = this.errorCode(error);
      if (!code || !DRIVER_TASK_TRANSITION_RACE_CODES.has(code)) throw error;
      if (!(await this.reloadConfirmsCompleted(order, task))) throw error;
      return;
    }
    const status = advanced.status;
    if (status !== "on_trip" && status !== "proof_pending")
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        this.code("NOT_COMPLETABLE"),
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
        this.code("PROOF_UNSUPPORTED"),
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
      // The heartbeat at the destination and a tap can both end the trip,
      // including from separate service instances that each hold their own
      // local task cache. The real completion command raises this exact
      // code before mutating anything, so it never hides our own failed
      // mutation, persistence, audit or outbox step -- but this instance's
      // local cache may never have heard about the other instance's write,
      // so only a reload of the authoritative task (never the possibly
      // stale local copy) can confirm the SAME task/order genuinely reached
      // `completed`. Any other code, an unrelated task/order, or a reload
      // that does not confirm completion is a real failure and must reach
      // the caller.
      if (this.errorCode(error) !== "TASK_ALREADY_COMPLETED") throw error;
      if (!(await this.reloadConfirmsCompleted(order, task))) throw error;
      // Another request already finished the completion this call would
      // have made, so its own offline step would be a duplicate.
      return;
    }
    await this.registry
      .updateDriverWorkStateFromPersistence(task.driverId, {
        workState: "offline",
      })
      .catch((error: unknown) =>
        this.logger.warn(
          `${this.label}: could not take ${task.driverId} offline: ${String(error)}`,
        ),
      );
  }

  /** Complete demo trips nobody finished, so their test pair can be reused. */
  private async releaseStaleDemoTrips(requestId?: string) {
    const rows = await this.database.query<{ record: DriverTaskRecord }>(
      `SELECT record FROM ops.phase1_driver_tasks
        WHERE record->>'driverId' = ANY($1::text[])
          AND status = ANY($2::text[])
          AND updated_at < now() - ($3::int * interval '1 millisecond')`,
      [[...this.demoDriverIds], OPEN_TASK_STATUSES, STALE_DEMO_TRIP_MS],
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
          `${this.label}: could not release stale trip ${record.orderId}: ${String(error)}`,
        );
      }
    }
  }

  private async busyDemoDrivers() {
    const rows = await this.database.query<{ driver_id: string }>(
      `SELECT DISTINCT record->>'driverId' AS driver_id FROM ops.phase1_driver_tasks
        WHERE record->>'driverId' = ANY($1::text[]) AND status = ANY($2::text[])`,
      [[...this.demoDriverIds], OPEN_TASK_STATUSES],
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
            this.demoDriverIds.has(task.driverId) &&
            OPEN_TASK_STATUSES.includes(task.status),
        ) ?? null
    );
  }

  /**
   * `openDemoTask` found no open demo task after its own canonical reload.
   * A concurrent heartbeat or tap may simply have completed the SAME task
   * first, between this call's earlier (now stale) order read and that
   * reload -- the only benign reason a demo order's task
   * can vanish from the open set. Any other reason (cancelled, reassigned
   * to a real driver, never dispatched) leaves the order not `completed`
   * and must still fail as before.
   */
  private async reconcileAlreadyCompletedOrder(orderId: string) {
    const order = await this.orders.getOrderForRead(orderId);
    if (order.status !== "completed") return null;
    const completedTask = this.orders
      .getDriverTasksForOrder(orderId)
      .find(
        (t) => this.demoDriverIds.has(t.driverId) && t.status === "completed",
      );
    if (!completedTask) return null;
    return this.result(orderId, completedTask.driverId);
  }

  /**
   * True only once a reload of the authoritative task -- never this
   * instance's possibly-stale local copy -- confirms the exact SAME
   * order/task genuinely reached `completed`.
   */
  private async reloadConfirmsCompleted(
    order: OwnedOrderRecord,
    task: DriverTaskRecord,
  ) {
    await this.orders.prepareOrderAction({ taskId: task.taskId });
    const latest = this.orders.getDriverTask(task.taskId);
    return latest.orderId === order.orderId && latest.status === "completed";
  }

  private async requireOpenDemoTask(orderId: string) {
    const task = await this.openDemoTask(orderId);
    if (!task)
      throw new ApiRequestError(
        HttpStatus.BAD_GATEWAY,
        this.code("TASK_MISSING"),
        "The assignment did not produce a driver task.",
      );
    return task;
  }

  private isAssignable(order: OwnedOrderRecord, pair: DemoTripSupplyPair) {
    try {
      this.eligibility.assertDispatchAssignmentEligible(
        order,
        pair.vehicleId,
        pair.driverId,
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `${this.label}: ${pair.driverId} not eligible: ${this.errorCode(error) ?? String(error)}`,
      );
      return false;
    }
  }

  private isCandidate(
    candidates: DispatchCandidate[],
    pair: DemoTripSupplyPair,
  ) {
    return candidates.some(
      (c) =>
        c.driverId === pair.driverId &&
        c.vehicleId === pair.vehicleId &&
        c.eligibilityDecision !== "ineligible" &&
        (c.hardReasonCodes?.length ?? 0) === 0,
    );
  }

  protected point(address: OwnedOrderRecord["pickup"], field: string) {
    const lat = address?.lat;
    const lng = address?.lng;
    if (typeof lat !== "number" || typeof lng !== "number")
      throw new ApiRequestError(
        HttpStatus.CONFLICT,
        this.code("COORDINATES_MISSING"),
        `The trip ${field} has no coordinates.`,
      );
    return { lat, lng };
  }

  protected errorCode(error: unknown) {
    return error instanceof ApiRequestError ? error.code : undefined;
  }

  protected async result(
    orderId: string,
    driverId: string | null,
  ): Promise<DemoTripResult> {
    const order = await this.orders.getOrderForRead(orderId);
    return { orderId, status: order.status, driverId, simulated: true };
  }
}
