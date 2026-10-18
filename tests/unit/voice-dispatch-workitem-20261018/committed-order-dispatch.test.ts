import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedAutonomousDispatchExecutorService } from "../../../apps/api/src/modules/owned-mobility/owned-autonomous-dispatch-executor.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { VoiceCommandRunnerService } from "../../../apps/api/src/modules/voice-booking/voice-command-runner.service";
import type { VoiceCommandReceiptRecord } from "../../../apps/api/src/modules/voice-booking/voice-booking.repository";

function domain() {
  const audit = new AuditNotificationService();
  const registry = new RegulatoryRegistryService(
    new OpsDispatchEventsService(new EventEmitter() as never),
    audit,
    new DriverProfileService(audit),
  );
  const owned = new OwnedMobilityService(
    registry,
    audit,
    new CallcenterService(audit),
    new OwnedMobilityTaskEventsService(new EventEmitter() as never),
    new OpsDispatchEventsService(new EventEmitter() as never),
  );
  const order = owned.createPassengerOrder({
    pickup: { address: "台中市梧棲區中二路一段9號" },
    dropoff: { address: "台中市大安區興安路378號" },
    passenger: { name: "語音派車單元演練乘客", phone: "0900000000" },
  });
  return { owned, order };
}

// Isolate only the queue/receipt database boundary. Actual dispatch matching,
// assignments and Driver tasks use the original domain implementation. This is
// an in-memory unit regression, not durable booking or PostgreSQL evidence.
function work(
  orderId: string,
  executor?: OwnedAutonomousDispatchExecutorService,
  status: VoiceCommandReceiptRecord["status"] = "succeeded",
) {
  const receipt = { commandId: "committed-command", orderId, status };
  const queries: string[] = [];
  const query = vi.fn(async (sql: string) => {
    queries.push(sql);
    if (sql.includes("WITH candidate AS"))
      return {
        rowCount: 1,
        rows: [
          {
            work_id: "dispatch-work",
            command_id: receipt.commandId,
            voice_session_id: "voice-session",
            work_type: "request_dispatch",
            dedupe_key: receipt.commandId + ":request_dispatch",
            payload_ref: "irrelevant-transport-payload",
            lease_epoch: 1,
            attempt: 1,
          },
        ],
      };
    if (sql.includes("to_regclass"))
      return { rowCount: 1, rows: [{ exists: false }] };
    return { rowCount: 1, rows: [{ work_id: "dispatch-work" }] };
  });
  const findReceiptById = vi.fn(async () => receipt);
  const repository = {
    findReceiptById,
    withTransaction: async (fn: (tx: { query: typeof query }) => unknown) =>
      fn({ query }),
  };
  const runner = new VoiceCommandRunnerService(
    { repository } as never,
    {} as never,
    executor,
  );
  return { runner, receipt, queries, findReceiptById };
}

describe("voice committed booking dispatch work item", () => {
  it("creates an actual offer and Driver task for the receipt's original order", async () => {
    const { owned, order } = domain();
    const h = work(order.orderId, owned.getAutonomousDispatchExecutor());
    const result = await h.runner.runOnce();
    expect(result).toMatchObject({
      success: true,
      commandId: h.receipt.commandId,
      result: { status: "offered", orderId: order.orderId },
    });
    expect(h.findReceiptById).toHaveBeenCalledWith(h.receipt.commandId);
    const tasks = owned.getDriverTasksForOrder(order.orderId);
    expect(tasks).toHaveLength(1);
    expect(result?.result).toMatchObject({
      taskId: tasks[0]!.taskId,
      dispatchJobId: tasks[0]!.dispatchJobId,
    });
    expect(
      h.queries.some((sql) => sql.includes("SET status = 'completed'")),
    ).toBe(true);
  });

  it("a fresh executor resumes the existing offered task without creating a second task", async () => {
    const { owned, order } = domain();
    const first = await work(
      order.orderId,
      owned.getAutonomousDispatchExecutor(),
    ).runner.runOnce();
    const second = await work(
      order.orderId,
      new OwnedAutonomousDispatchExecutorService(owned),
    ).runner.runOnce();
    expect(first?.success).toBe(true);
    expect(second?.success).toBe(true);
    expect(second?.result).toMatchObject({
      taskId: (first!.result as { taskId: string }).taskId,
      orderId: order.orderId,
    });
    expect(owned.getDriverTasksForOrder(order.orderId)).toHaveLength(1);
  });

  it.each(["pending", "rejected"] as const)(
    "does not complete dispatch for a %s booking receipt",
    async (status) => {
      const { owned, order } = domain();
      const h = work(
        order.orderId,
        owned.getAutonomousDispatchExecutor(),
        status,
      );
      expect(await h.runner.runOnce()).toMatchObject({
        success: false,
        error: "Committed booking order unavailable for request_dispatch",
      });
      expect(owned.getDriverTasksForOrder(order.orderId)).toHaveLength(0);
      expect(
        h.queries.some((sql) => sql.includes("SET status = 'completed'")),
      ).toBe(false);
      expect(h.queries.some((sql) => sql.includes("last_error = $4"))).toBe(
        true,
      );
    },
  );

  it("retries an unavailable executor instead of returning dispatched success", async () => {
    const h = work("committed-order");
    expect(await h.runner.runOnce()).toMatchObject({
      success: false,
      error: "Automatic dispatch executor is unavailable",
    });
    expect(
      h.queries.some((sql) => sql.includes("SET status = 'completed'")),
    ).toBe(false);
    expect(h.queries.some((sql) => sql.includes("last_error = $4"))).toBe(true);
  });
});
