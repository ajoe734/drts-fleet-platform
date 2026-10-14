import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { MultiTaxiRepository } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";
import { MultiTaxiService } from "../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { PassengerBookingController } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.controller";
import { PassengerBookingRepository } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.repository";
import { PassengerBookingService } from "../../../apps/api/src/modules/passenger-app/booking/passenger-booking.service";
import { PassengerAccountRepository } from "../../../apps/api/src/modules/passenger-app/account/passenger-account.repository";
import { PassengerFareRepository } from "../../../apps/api/src/modules/passenger-app/fare/passenger-fare.repository";
import {
  DiagnosedDatabaseService,
  hostedPaymentEnabled,
  PaymentPostgresHarness,
} from "../pax-qa-20261009/payment-postgres-harness";

export function latch() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

export async function within<T>(promise: Promise<T>, label: string, ms = 8000) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Attach both handlers immediately, including when an actor is held at a gate.
export function settled<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ value, error: undefined }),
    (error: unknown) => ({ value: undefined, error }),
  );
}

export function evidence(label: string, value: unknown) {
  process.stdout.write(`PAX Book native ${label} ${JSON.stringify(value)}\n`);
}

/** Observation of the real owner's query completion, never replacement SQL/rows. */
export class ObservedBookingRepository extends PassengerBookingRepository {
  ownerObserved?: (owner: string | null) => Promise<void>;
  override async getBookingHistoryOwner(orderId: string) {
    const owner = await super.getBookingHistoryOwner(orderId);
    await this.ownerObserved?.(owner);
    return owner;
  }
}

export async function bookingActor(
  h: PaymentPostgresHarness,
  database = h.database,
) {
  if (!hostedPaymentEnabled)
    throw new Error("Book native runtime is hosted only.");
  const candidate = {
    driverId: "book-synthetic-driver",
    vehicleId: "book-synthetic-vehicle",
    etaMinutes: 5,
    operatingArea: "taipei",
    serviceBuckets: ["standard_taxi"],
  };
  // External eligibility registry and delivery only. All lifecycle logic,
  // repositories, transaction queries, resource constraints and feed are real.
  const registry = {
    getEligibleCandidates: () => [candidate],
    getVehicleDispatchability: () => true,
    getDriverAvailability: () => true,
    getVehicleLicenseType: () => null,
    getVehiclePassengerDisclosureProfile: () => null,
    getDriverPublicRegistrationCredential: () => null,
    listVehicles: () => [
      { vehicleId: candidate.vehicleId, plateNo: "QA-0000" },
    ],
  };
  const audit = new AuditNotificationService();
  const audited = vi.spyOn(audit, "recordAuditLogAsync");
  const taskEvents = new OwnedMobilityTaskEventsService(
    new EventEmitter() as never,
  );
  const assigned = vi.spyOn(taskEvents, "publishTaskAssigned");
  const updated = vi.spyOn(taskEvents, "publishTaskUpdated");
  const cancelled = vi.spyOn(taskEvents, "publishTaskCancelled");
  const ops = {
    publishOrderCreated: vi.fn(),
    publishOrderUpdated: vi.fn(),
    publishDispatchJobUpdated: vi.fn(),
  };
  const taxi = new MultiTaxiRepository(database);
  if (!(await taxi.loadState()).authorizations.length) {
    const now = new Date().toISOString();
    await taxi.persistAuthorization({
      authorizationId: randomUUID(),
      operatorId: "qa-synthetic-operator",
      authorityCode: "QA-SYNTHETIC",
      businessPlanVersion: "qa-native-booking",
      status: "approved",
      serviceAreaCodes: ["TPE"],
      activeFareVersionId: "taipei-20230401",
      effectiveFrom: "2023-04-01T00:00:00.000Z",
      effectiveUntil: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  // Eligibility is external, but production assignment also checks the native
  // authorization membership. Seed it through the real repository before
  // hydration; never replace isActiveMultiTaxiAuthorizedVehicle or its SQL.
  const authorizationState = await taxi.loadState();
  for (const authorization of authorizationState.authorizations) {
    if (
      authorization.status === "approved" &&
      !authorizationState.vehicles.some(
        (vehicle) =>
          vehicle.authorizationId === authorization.authorizationId &&
          vehicle.vehicleId === candidate.vehicleId,
      )
    ) {
      await taxi.persistVehicle({
        authorizationVehicleId: randomUUID(),
        authorizationId: authorization.authorizationId,
        vehicleId: candidate.vehicleId,
        status: "active",
        effectiveFrom: authorization.effectiveFrom,
        effectiveUntil: authorization.effectiveUntil,
      });
    }
  }
  const repository = new OwnedMobilityRepository(database, taxi);
  const owned = new OwnedMobilityService(
    registry as never,
    audit,
    {
      registerRecordingAttachmentListener() {},
      registerRecordingStateChangeListener() {},
    } as never,
    taskEvents,
    ops as never,
    repository,
  );
  // Hydrate only; never invoke scheduler/application bootstrap.
  await owned.onModuleInit();
  const multi = new MultiTaxiService(owned, taxi, undefined, audit);
  await multi.onModuleInit();
  const bookings = new ObservedBookingRepository(database);
  const booking = new PassengerBookingService(
    bookings,
    multi,
    new PassengerFareRepository(database),
    new PassengerAccountRepository(database),
  );
  const controller = new PassengerBookingController(booking, multi);
  const effects = () => ({
    audit: audited.mock.calls.length,
    assigned: assigned.mock.calls.length,
    updated: updated.mock.calls.length,
    cancelled: cancelled.mock.calls.length,
    orderCreated: ops.publishOrderCreated.mock.calls.length,
    orderUpdated: ops.publishOrderUpdated.mock.calls.length,
    jobUpdated: ops.publishDispatchJobUpdated.mock.calls.length,
  });
  return {
    database: database as DiagnosedDatabaseService,
    owned,
    multi,
    booking,
    bookings,
    controller,
    repository,
    candidate,
    effects,
  };
}
export type BookingActor = Awaited<ReturnType<typeof bookingActor>>;

export async function bookedRide(h: PaymentPostgresHarness) {
  const account = await h.authenticatedAccount();
  await h.accounts.updateMe(account.identity, {
    displayName: "Book native actions",
    contactPhone: "0900000000",
    contactConsent: true,
    termsVersion: "qa-terms",
    privacyVersion: "qa-privacy",
    feeAcknowledgementVersion: "qa-fees",
  });
  const method = await h.method(account.owner);
  const fares = await h.fareServices();
  const actor = await bookingActor(h);
  const scheduledAt = new Date(Date.now() + 20 * 60000).toISOString();
  const quote = await fares.fares.quote(account.identity, {
    originLat: 25.08,
    originLng: 121.55,
    destinationLat: 25.1,
    destinationLng: 121.57,
    scheduledAt,
  });
  if (quote.serviceAreaResult !== "serviceable" || !quote.fareSnapshotId)
    throw new Error(
      "Real fare service did not produce an owned serviceable quote.",
    );
  const created = await actor.booking.createRide(
    account.owner,
    {
      origin: { lat: 25.08, lng: 121.55, address: "QA origin" },
      destination: { lat: 25.1, lng: 121.57, address: "QA destination" },
      scheduledAt,
      fareSnapshotId: quote.fareSnapshotId,
      paymentMethodId: method.paymentMethodId,
      passengerConfirmedAt: new Date(Date.now() - 1000).toISOString(),
    },
    `book-native-create-${randomUUID()}`,
  );
  return { ...account, actor, orderId: created.ride.order.orderId };
}

export async function assignedRide(actor: BookingActor, orderId: string) {
  const job = await actor.owned.dispatchOrder(orderId, { mode: "auto" });
  // Production assign drains its preceding fire-and-forget dispatch writes.
  return actor.owned.assignDispatch({
    dispatchJobId: job.dispatchJobId,
    ...actor.candidate,
  });
}

export async function startRide(actor: BookingActor, taskId: string) {
  const now = new Date().toISOString();
  await actor.owned.acceptDriverTask(taskId, { acceptedAt: now });
  await actor.owned.departDriverTask(taskId, { departedAt: now });
  await actor.owned.arrivedPickup(taskId, { arrivedAt: now });
  await actor.owned.startDriverTask(taskId, { startedAt: now });
}

export function completeRide(actor: BookingActor, taskId: string) {
  return actor.owned.completeDriverTask(
    taskId,
    {
      completedAt: new Date().toISOString(),
      actualDistanceKm: 1.251,
      actualDurationSec: 60,
      fare: { amountMinor: 100, currency: "NTD" },
      proof: { photos: [] },
    },
    `book-driver-complete-${randomUUID()}`,
  );
}

/** Legitimate proof configuration through the production repository, before
 * fresh service hydration. No private cache edits or substituted business SQL. */
export async function requireProof(actor: BookingActor, orderId: string) {
  const order = (await actor.repository.loadState()).orders.find(
    (o) => o.orderId === orderId,
  );
  if (!order) throw new Error("Missing real created order.");
  order.proofRequirements = {
    minPhotoCount: 1,
    signoffRequired: false,
    expenseProofRequired: false,
  };
  await actor.repository.persistChanges({ orders: [order] });
}

export async function snapshot(h: PaymentPostgresHarness, orderId: string) {
  // Case-owned native rows, including generated versions and every trace/outbox.
  const tables = [
    "phase1_owned_orders",
    "phase1_driver_tasks",
    "phase1_dispatch_assignments",
    "phase1_dispatch_jobs",
    "phase1_dispatch_attempts",
    "dispatch_resource_reservations",
    "phase1_dispatch_trace_logs",
    "consumer_notification_outbox",
    "driver_completion_outbox",
  ] as const;
  const state = {} as Record<
    (typeof tables)[number],
    Record<string, unknown>[]
  >;
  for (const table of tables) {
    state[table] = (
      await h.pool!.query(
        `SELECT * FROM ops.${table} WHERE order_id=$1 ORDER BY to_jsonb(${table})::text`,
        [orderId],
      )
    ).rows;
  }
  return state;
}

export async function blockedBy(h: PaymentPostgresHarness, holder: number) {
  const deadline = performance.now() + 1200;
  do {
    const result = await h.pool!.query(
      `SELECT pid,pg_blocking_pids(pid) AS blockers,query FROM pg_stat_activity
       WHERE datname=current_database() AND pid<>pg_backend_pid()
       AND wait_event_type='Lock' AND position('phase1_dispatch_assignments' in query)>0`,
    );
    const row = result.rows.find((r) => r.blockers.includes(holder));
    if (row) {
      evidence("driver holder/cancellation waiter", {
        holder,
        waiter: row.pid,
        blockers: row.blockers,
        waiterSqlSha256: createHash("sha256").update(row.query).digest("hex"),
      });
      return row.pid as number;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (performance.now() < deadline);
  throw new Error(
    "Native cancellation did not wait on the real driver assignment lock.",
  );
}

export function observeTransactions(actor: BookingActor) {
  const statements: {
    pid: number;
    transaction: string | null;
    sqlSha256: string;
    verb: string;
  }[] = [];
  actor.database.leaseObserver = async (sql, client) => {
    if (sql.includes("pg_backend_pid()")) return;
    const row = (
      await client.query(
        "SELECT pg_backend_pid() AS pid,pg_current_xact_id_if_assigned()::text AS transaction",
      )
    ).rows[0];
    statements.push({
      ...row,
      sqlSha256: createHash("sha256").update(sql).digest("hex"),
      verb: sql.trim().split(/\s/)[0]!,
    });
  };
  return statements;
}
