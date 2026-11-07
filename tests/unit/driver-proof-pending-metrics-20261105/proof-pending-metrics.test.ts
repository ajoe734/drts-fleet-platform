import { describe, expect, it, vi } from "vitest";
import type {
  DispatchAssignmentRecord,
  DispatchJobRecord,
  DriverCompleteTaskCommand,
  DriverTaskRecord,
  OwnedOrderRecord,
} from "@drts/contracts";
import { buildOwnedMobilityServiceForTest } from "../system-remediation/sr-qa-dispatch-001/test-support";

const PHOTO_A = "cHJvb2YtcGhvdG8tMDAx";
const PHOTO_B = "cHJvb2YtcGhvdG8tMDAy";
const MODES = ["memory", "database-port"] as const;
type Mode = (typeof MODES)[number];
type ProofCase = "photo" | "signoff" | "expense";
type Bundle = {
  order: OwnedOrderRecord;
  dispatchJob: DispatchJobRecord;
  assignment: DispatchAssignmentRecord;
  task: DriverTaskRecord;
};
type Write = {
  orders?: OwnedOrderRecord[];
  dispatchAssignments?: DispatchAssignmentRecord[];
  driverTasks?: DriverTaskRecord[];
  dispatchTraceLogs?: unknown[];
  consumerNotificationOutbox?: unknown[];
};

// Real booking, assignment and every driver transition produce the initial
// on_trip task. Its metrics genuinely start null; no invented historical
// distance is injected into the API or the Driver view.
async function createActiveTrip(mode: Mode, proofCase: ProofCase = "photo") {
  const { service, regulatoryRegistryService, auditNotificationService } =
    buildOwnedMobilityServiceForTest({
      candidates: [
        {
          driverId: "driver-proof-metrics-unit",
          vehicleId: "vehicle-proof-metrics-unit",
          etaMinutes: 5,
          operatingArea: "north",
          serviceBuckets: ["business_dispatch"],
        },
      ],
    });
  regulatoryRegistryService.getVehicleLicenseType.mockReturnValue(
    "business_vehicle",
  );
  const at = (minutes: number) =>
    new Date(Date.now() + minutes * 60_000).toISOString();
  const booking = await service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: at(60),
      reservationWindowEnd: at(120),
      pickup: { address: "Synthetic origin" },
      dropoff: { address: "Synthetic destination" },
      passenger: { name: "Proof metrics unit rider", phone: "0900000000" },
      minPhotoCount: proofCase === "photo" ? 2 : 1,
      signoffRequired: proofCase === "signoff",
      expenseProofRequired: proofCase === "expense",
    },
    "tenant-demo-001",
  );
  const job = await service.dispatchOrder(booking.orderId, { mode: "auto" });
  const assigned = await service.assignDispatch({
    dispatchJobId: job.dispatchJobId,
    driverId: "driver-proof-metrics-unit",
    vehicleId: "vehicle-proof-metrics-unit",
  });
  await service.acceptDriverTask(assigned.taskId, { acceptedAt: at(61) });
  await service.departDriverTask(assigned.taskId, { departedAt: at(62) });
  await service.arrivedPickup(assigned.taskId, { arrivedAt: at(63) });
  await service.startDriverTask(assigned.taskId, { startedAt: at(64) });
  expect(service.getDriverTask(assigned.taskId)).toMatchObject({
    status: "on_trip",
    actualDistanceKm: null,
    actualDurationSec: null,
    completedAt: null,
  });
  const initialBundle: Bundle = {
    order: service.getOrder(booking.orderId),
    dispatchJob: service
      .listDispatchJobs()
      .find((item) => item.dispatchJobId === job.dispatchJobId)!,
    assignment: service
      .getDispatchAssignmentsForOrder(booking.orderId)
      .find((item) => item.assignmentId === assigned.assignmentId)!,
    task: service.getDriverTask(assigned.taskId),
  };
  let committed = structuredClone(initialBundle);
  const writes: Write[] = [];
  const outbox = vi.fn(async () => undefined);
  const completionEvent = vi.fn(async () => undefined);
  // These are constructor collaborator ports, not replacements for service
  // transition/proof/metric methods. The SQL port snapshots committed rows in
  // memory; no DatabaseService, SQL connection or real lock is claimed.
  Object.assign(service, { eventEmitter: { emitAsync: completionEvent } });
  if (mode === "database-port") {
    const repository = {
      isEnabled: () => true,
      withTransaction: async <T>(
        work: (tx: object) => Promise<T>,
      ): Promise<T> => work({}),
      loadDriverTaskCompletionBundleForUpdate: async () =>
        structuredClone(committed),
      persistOrderWorkflow: vi.fn(async (_tx: object, changes: Write) => {
        writes.push(structuredClone(changes));
        committed = {
          ...committed,
          ...(changes.orders?.[0]
            ? { order: structuredClone(changes.orders[0]) }
            : {}),
          ...(changes.dispatchAssignments?.[0]
            ? { assignment: structuredClone(changes.dispatchAssignments[0]) }
            : {}),
          ...(changes.driverTasks?.[0]
            ? { task: structuredClone(changes.driverTasks[0]) }
            : {}),
        };
      }),
      releaseDispatchResourceReservations: vi.fn(async () => 1),
      persistDriverCompletionOutbox: outbox,
    };
    Object.assign(service, { ownedMobilityRepository: repository });
  }
  const command: DriverCompleteTaskCommand = {
    completedAt: at(84),
    actualDistanceKm: 12.4,
    actualDurationSec: 1200,
    proof: { photos: [PHOTO_A] },
  };
  function readTask() {
    return mode === "database-port"
      ? structuredClone(committed.task)
      : service.getDriverTask(assigned.taskId);
  }
  function readOrder() {
    return mode === "database-port"
      ? structuredClone(committed.order)
      : service.getOrder(booking.orderId);
  }
  return {
    service,
    taskId: assigned.taskId,
    orderId: booking.orderId,
    command,
    readTask,
    readOrder,
    writes,
    outbox,
    completionEvent,
    auditNotificationService,
  };
}

const proofCases: Array<{ proofCase: ProofCase; code: string }> = [
  { proofCase: "photo", code: "MIN_PHOTO_COUNT_NOT_MET" },
  { proofCase: "signoff", code: "PROOF_REQUIRED" },
  { proofCase: "expense", code: "EXPENSE_PROOF_REQUIRED" },
];

describe.each(MODES)(
  "Driver proof-pending submitted metric custody: %s",
  (mode) => {
    it.each(proofCases)(
      "retains submitted travel facts after actual $proofCase refusal without completing the trip",
      async ({ proofCase, code }) => {
        const h = await createActiveTrip(mode, proofCase);
        const fareBefore = h.readTask().fare;
        const quotedFareBefore = h.readOrder().quotedFare;
        await expect(
          h.service.completeDriverTask(h.taskId, h.command),
        ).rejects.toMatchObject({ code });
        const pending = h.readTask();
        expect(pending.status).toBe("proof_pending");
        expect(h.readOrder().status).toBe("proof_pending");
        expect(pending.completedAt).toBeNull();
        expect(pending.proof?.photos).toEqual([PHOTO_A]);
        expect(pending.fare).toEqual(fareBefore);
        expect(h.readOrder().quotedFare).toEqual(quotedFareBefore);
        expect(h.completionEvent).not.toHaveBeenCalled();
        expect(h.outbox).not.toHaveBeenCalled();
        expect(
          h.auditNotificationService.recordAuditLog.mock.calls.some(
            ([input]) => input.actionName === "complete_trip",
          ),
        ).toBe(false);
        if (mode === "database-port") {
          expect(h.writes).toHaveLength(1);
          expect(h.writes[0]?.consumerNotificationOutbox).toBeUndefined();
        }
        // These are valid submitted observations, not completion/fare authority.
        // The real Driver remount reads these fields via the task API.
        expect(pending.actualDistanceKm).toBe(12.4);
        expect(pending.actualDurationSec).toBe(1200);
      },
    );

    it("keeps the original distance when proof retry uses only canonical task readback after remount", async () => {
      const h = await createActiveTrip(mode);
      await expect(
        h.service.completeDriverTask(h.taskId, h.command),
      ).rejects.toMatchObject({ code: "MIN_PHOTO_COUNT_NOT_MET" });
      const reloaded = h.readTask();
      const completed = await h.service.completeDriverTask(h.taskId, {
        ...h.command,
        // TripScreen.syncTripMetricsFromTask uses this exact null fallback on
        // remount. No remembered first command supplies the original distance.
        actualDistanceKm: reloaded.actualDistanceKm ?? 0,
        actualDurationSec: reloaded.actualDurationSec ?? 0,
        proof: { photos: [PHOTO_A, PHOTO_B] },
      });
      expect(completed.taskId).toBe(h.taskId);
      expect(completed.orderId).toBe(h.orderId);
      expect(completed.status).toBe("completed");
      expect(h.readOrder().status).toBe("completed");
      expect(completed.completedAt).toBe(h.command.completedAt);
      expect(completed.fare).toEqual(h.readOrder().quotedFare);
      expect(completed.actualDistanceKm).toBe(12.4);
      // This backend retry checks retained draft duration only. Actual Trip's
      // final submit still derives duration from startedAt; no proof-wait-time
      // billing or timer policy is introduced here.
      expect(completed.actualDurationSec).toBe(1200);
    });

    it("preserves fixed-fare validation before any proof-pending observation write", async () => {
      const h = await createActiveTrip(mode);
      const before = h.readTask();
      const quoted = h.readOrder().quotedFare!;
      await expect(
        h.service.completeDriverTask(h.taskId, {
          ...h.command,
          fare: { ...quoted, amountMinor: quoted.amountMinor + 1 },
        }),
      ).rejects.toMatchObject({ code: "FIXED_PRICE_IMMUTABLE" });
      expect(h.readTask()).toEqual(before);
      expect(h.readOrder().status).toBe("on_trip");
      expect(h.completionEvent).not.toHaveBeenCalled();
      expect(h.outbox).not.toHaveBeenCalled();
      expect(h.writes).toHaveLength(0);
    });

    it("still accepts a complete lawful proof with explicit zero metrics", async () => {
      const h = await createActiveTrip(mode);
      const completed = await h.service.completeDriverTask(h.taskId, {
        ...h.command,
        actualDistanceKm: 0,
        actualDurationSec: 0,
        proof: { photos: [PHOTO_A, PHOTO_B] },
      });
      expect(completed.status).toBe("completed");
      expect(completed.actualDistanceKm).toBe(0);
      expect(completed.actualDurationSec).toBe(0);
      expect(completed.fare).toEqual(h.readOrder().quotedFare);
    });
  },
);
