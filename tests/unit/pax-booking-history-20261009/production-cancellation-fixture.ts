import type { OwnedOrderRecord } from "@drts/contracts";
import {
  createProductionBookingFixture,
  OWNER,
} from "./production-booking-fixture";

// Only database transport responses and audit/event sinks are replaced. The
// real controller, ownership guard, services, cancellation repository, locked
// read, workflow writes and resource-release logic all execute. This is not PG.
export async function observeTrustedCancellation(
  status: OwnedOrderRecord["status"],
  memory: "synchronized" | "stale" | "race" = "synchronized",
  leadMinutes = 120,
  compensation = false,
) {
  const f = createProductionBookingFixture([], leadMinutes);
  const created = await f.service.createRide(OWNER, f.command);
  const orderId = created.ride.order.orderId;
  const effects = { audit: 0, taskEvents: 0, orderEvents: 0 };
  const internals = f.owned as unknown as {
    orders: OwnedOrderRecord[];
    auditNotificationService: { recordAuditLog(): void };
    ownedMobilityTaskEventsService: { publishTaskCancelled(): void };
    opsDispatchEventsService: { publishOrderUpdated(): void };
  };
  internals.auditNotificationService = {
    recordAuditLog: () => effects.audit++,
  };
  internals.ownedMobilityTaskEventsService = {
    publishTaskCancelled: () => effects.taskEvents++,
  };
  internals.opsDispatchEventsService.publishOrderUpdated = () =>
    effects.orderEvents++;
  if (memory !== "race") f.state.order!.status = status;
  if (memory === "synchronized") internals.orders[0]!.status = status;
  const durableBefore = structuredClone(f.state.order);
  const memoryBefore = f.owned.listOrders()[0];
  const links = {
    assignmentId: "assignment-race",
    taskId: "task-race",
    orderId,
    dispatchJobId: "job-race",
    driverId: "driver-race",
    vehicleId: "vehicle-race",
  };
  const hasAssignment = () =>
    ["assigned", "driver_accepted", "on_trip", "proof_pending"].includes(
      f.state.order!.status,
    );
  let signalEntered!: () => void;
  const entered = new Promise<void>((resolve) => {
    signalEntered = resolve;
  });
  let releaseGate!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  const connect = f.database.connect.bind(f.database);
  f.database.connect = async () => {
    if (memory === "race") {
      signalEntered();
      await gate; // The passenger's outer check passed, but no rows are locked.
    }
    const client = await connect();
    const query = client.query.bind(client);
    client.query = (async (sql: string, values?: readonly unknown[]) => {
      const result = await query(sql, values ? [...values] : []);
      const text = sql.trim().replace(/\s+/g, " ");
      const current = f.state.order!.status;
      if (hasAssignment()) {
        if (
          text.startsWith("SELECT record FROM ops.phase1_dispatch_assignments")
        )
          return {
            rows: [
              {
                record: {
                  ...links,
                  status: current === "assigned" ? "assigned" : "accepted",
                },
              },
            ],
            rowCount: 1,
          };
        if (text.startsWith("SELECT record FROM ops.phase1_driver_tasks"))
          return {
            rows: [
              {
                record: {
                  ...links,
                  status:
                    current === "assigned"
                      ? "pending_acceptance"
                      : current === "driver_accepted"
                        ? "accepted"
                        : current,
                },
              },
            ],
            rowCount: 1,
          };
        if (
          text.startsWith(
            "SELECT assignment_id FROM ops.phase1_dispatch_assignments",
          )
        )
          return { rows: [{ assignment_id: links.assignmentId }], rowCount: 1 };
      }
      return result;
    }) as typeof client.query;
    return client;
  };
  const callStart = f.calls.length;
  const cancel = async () => {
    try {
      const result = compensation
        ? await f.multi.compensateFailedTrustedPassengerRide(
            orderId,
            "creation_failed",
            "r9-request",
          )
        : await f.controller.cancelRide(
            { realm: "passenger", drtsPassengerId: OWNER } as never,
            orderId,
            "r9-request",
          );
      return { result, error: null };
    } catch (error) {
      return {
        result: null,
        error: error as { code?: string; message?: string },
      };
    }
  };
  const cancelling = cancel();
  if (memory === "race") {
    await entered;
    f.state.order!.status = status; // A driver transition wins before locking.
    durableBefore!.status = status;
    releaseGate();
  }
  const outcome = await cancelling;
  return {
    ...outcome,
    f,
    effects,
    durableBefore,
    memoryBefore,
    cancellationCalls: f.calls.slice(callStart),
  };
}
