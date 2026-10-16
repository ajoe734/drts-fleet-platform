import { EventEmitter } from "node:events";
import { IdempotencyRepository } from "../../../apps/api/src/common/idempotency/idempotency.repository";
import { IdempotencyService } from "../../../apps/api/src/common/idempotency/idempotency.service";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { describe, expect, it, vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterController } from "../../../apps/api/src/modules/callcenter/callcenter.controller";
import { CallcenterRepository } from "../../../apps/api/src/modules/callcenter/callcenter.repository";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

export function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Only the SQL executor is simulated. Services, controllers, repositories,
// serialization, and the strict canonical reader are production code.
export function fixture() {
  const rows = new Map<string, unknown>();
  let staged = new Map<string, unknown>();
  let gate: ReturnType<typeof deferred> | undefined;
  let block = "";
  const entered = deferred();
  const execute = async (
    sql: string,
    values: readonly unknown[] = [],
    tx = false,
  ) => {
    if (block && sql.includes(block)) {
      entered.resolve();
      await gate!.promise;
    }
    if (sql === "BEGIN") staged = new Map(rows);
    if (sql === "COMMIT") {
      rows.clear();
      for (const [k, v] of staged) rows.set(k, v);
    }
    const target = tx ? staged : rows;
    const table = /(?:INSERT INTO|FROM)\s+((?:ops|crm)\.phase1_\w+)/.exec(
      sql,
    )?.[1];
    if (table && /INSERT INTO/.test(sql)) {
      target.set(`${table}:${values[0]}`, JSON.parse(String(values.at(-1))));
    }
    if (table && /SELECT record/.test(sql)) {
      if (values.length === 0) {
        return {
          rows: [...target.entries()]
            .filter(([key]) => key.startsWith(`${table}:`))
            .map(([, record]) => ({ record: structuredClone(record) })),
          rowCount: target.size,
        };
      }
      const record = target.get(`${table}:${values[0]}`);
      return {
        rows: record ? [{ record: structuredClone(record) }] : [],
        rowCount: record ? 1 : 0,
      };
    }
    return { rows: [], rowCount: 1 };
  };
  const database = {
    isEnabled: () => true,
    query: (sql: string, values?: readonly unknown[]) => execute(sql, values),
    connect: async () => ({
      query: (sql: string, values?: readonly unknown[]) =>
        execute(sql, values, true),
      release() {},
    }),
  };
  const audit = new AuditNotificationService();
  const auditWrite = vi.spyOn(audit, "recordAuditLog");
  const calls = new CallcenterService(
    audit,
    new CallcenterRepository(database as never),
  );
  const events = new OpsDispatchEventsService(new EventEmitter() as never);
  const published = vi.spyOn(events, "publishOrderCreated");
  const repository = new OwnedMobilityRepository(database as never);
  const owned = new OwnedMobilityService(
    new RegulatoryRegistryService(
      events,
      audit,
      new DriverProfileService(audit),
    ),
    audit,
    calls,
    new OwnedMobilityTaskEventsService(new EventEmitter() as never),
    events,
    repository,
  );
  owned.registerCallRecordingListeners();
  const controller = new CallcenterController(
    calls,
    {} as never,
    {} as never,
    {} as never,
  );
  return {
    calls,
    owned,
    controller,
    rows,
    database,
    repository,
    auditWrite,
    published,
    entered,
    release() {
      block = "";
    },
    hold(fragment: string) {
      block = fragment;
      gate = deferred();
      return gate;
    },
  };
}

export const phoneCommand = (callId: string) => ({
  callId,
  agentId: "synthetic-agent",
  passenger: { name: "Synthetic Caller", phone: "+886900000203" },
  pickup: { address: "Synthetic pickup" },
  dropoff: { address: "Synthetic dropoff" },
});

describe("phone durable acknowledgement", () => {
  it("does not envelope session success or publish it before its SQL write finishes", async () => {
    const h = fixture();
    const gate = h.hold("INSERT INTO crm.phase1_call_sessions");
    let settled = false;
    const pending = Promise.resolve(
      h.controller.openCallSession({
        callType: "booking",
        callerPhone: "+886900000203",
      }),
    ).then((x) => {
      settled = true;
      return x;
    });
    await h.entered.promise;
    await Promise.resolve();
    const early = settled;
    gate.resolve();
    await pending;
    expect(early).toBe(false);
  });

  it("phone create waits for the real repository and does not audit/publish success early", async () => {
    const h = fixture();
    const gate = h.hold("INSERT INTO ops.phase1_owned_orders");
    let settled = false;
    const pending = Promise.resolve(
      h.owned.createCallCenterOrder(phoneCommand("synthetic-call-create")),
    ).then((x) => {
      settled = true;
      return x;
    });
    await h.entered.promise;
    await Promise.resolve();
    const early = {
      settled,
      published: h.published.mock.calls.length,
      visible: h.owned.listOrders().length,
    };
    gate.resolve();
    const order = await pending;
    expect(early).toEqual({ settled: false, published: 0, visible: 0 });
    expect(await h.owned.getOrderForRead(order.orderId)).toMatchObject({
      orderId: order.orderId,
      callId: "synthetic-call-create",
      status: "recording_pending",
    });
  });
  it.each([
    "INSERT INTO ops.phase1_owned_orders",
    "INSERT INTO crm.phase1_call_sessions",
    "COMMIT",
  ])(
    "rolls back a rejected %s without phantom orders, links, audits, or successful replay",
    async (fragment) => {
      const h = fixture();
      const idem = new IdempotencyRepository();
      const controller = new OwnedMobilityController(
        h.owned,
        new IdempotencyService(idem),
      );
      const command = phoneCommand("synthetic-call-failure");
      const gate = h.hold(fragment);
      const response = { setHeader: vi.fn(), status: vi.fn() };
      const pending = controller.createCallCenterOrder(
        command,
        response as never,
        "synthetic-key",
      );
      const rejected = expect(pending).rejects.toThrow(
        "synthetic write failure",
      );
      await h.entered.promise;
      expect(h.owned.listOrders()).toEqual([]);
      expect(h.calls.listCallSessions()).toEqual([]);
      expect(h.published).not.toHaveBeenCalled();
      gate.reject(new Error("synthetic write failure"));
      await rejected;
      expect([...h.rows.keys()]).toEqual([]);
      expect(
        h.auditWrite.mock.calls.filter(
          ([row]) => row.actionName === "create_phone_order",
        ),
      ).toEqual([]);
      const receipt = await idem.findByKey(
        `crm:callcenter:session:${command.callId}:order_create`,
        "synthetic-key",
      );
      expect(receipt?.status).not.toBe("completed");
      h.release();
      const created = await controller.createCallCenterOrder(
        command,
        response as never,
        "synthetic-key",
      );
      const replayed = await controller.createCallCenterOrder(
        command,
        response as never,
        "synthetic-key",
      );
      expect(replayed.data).toEqual(created.data);
      expect(h.owned.listOrders()).toHaveLength(1);
      expect(h.published).toHaveBeenCalledTimes(1);
      expect(await h.owned.getOrderForRead(created.data.orderId)).toMatchObject(
        { callId: command.callId },
      );
    },
  );

  it("recording callback waits for order propagation and commits both read models before acknowledgement", async () => {
    const h = fixture();
    const created = await h.owned.createCallCenterOrder(
      phoneCommand("synthetic-recording"),
    );
    const gate = h.hold("INSERT INTO ops.phase1_owned_orders");
    let settled = false;
    const pending = Promise.resolve(
      h.controller.attachRecordingCallback(created.callId!, {
        recordingId: "synthetic-rec",
        recordingUrl: "https://recordings.example.com/synthetic-rec",
      }),
    ).then((result) => {
      settled = true;
      return result;
    });
    await h.entered.promise;
    await Promise.resolve();
    const early = {
      settled,
      order: await h.owned.getOrderForRead(created.orderId),
      session: h.calls.getCallSession(created.callId!),
    };
    gate.resolve();
    await pending;
    expect(early.settled).toBe(false);
    expect(early.order.recordingId).toBeNull();
    expect(early.session.recordingId).toBeNull();
    expect(await h.owned.getOrderForRead(created.orderId)).toMatchObject({
      recordingId: "synthetic-rec",
      status: "ready_for_dispatch",
      complianceFlags: ["recording_bound"],
    });
    // A peer with no hydrated session cache must use the production PG reader.
    const cold = new CallcenterService(
      new AuditNotificationService(),
      new CallcenterRepository(h.database as never),
    );
    expect(await cold.getCallSessionForRead(created.callId!)).toMatchObject({
      recordingId: "synthetic-rec",
      linkedOrderId: created.orderId,
      recordingState: "ready",
    });
    const beforeReplay = h.auditWrite.mock.calls.length;
    await h.controller.attachRecordingCallback(created.callId!, {
      recordingId: "synthetic-rec",
      recordingUrl: "https://recordings.example.com/synthetic-rec",
    });
    expect(h.auditWrite.mock.calls.length).toBe(beforeReplay);
  });

  it("a failed order propagation rolls back a recording-bound session; identical callback can be retried", async () => {
    const h = fixture();
    const created = await h.owned.createCallCenterOrder(
      phoneCommand("synthetic-callback-fail"),
    );
    const gate = h.hold("INSERT INTO ops.phase1_owned_orders");
    const pending = h.controller.attachRecordingCallback(created.callId!, {
      recordingId: "synthetic-rec-fail",
    });
    const rejected = expect(pending).rejects.toThrow(
      "synthetic recording failure",
    );
    await h.entered.promise;
    gate.reject(new Error("synthetic recording failure"));
    await rejected;
    expect(await h.calls.getCallSessionForRead(created.callId!)).toMatchObject({
      recordingId: null,
      flags: ["recording_pending"],
    });
    expect(await h.owned.getOrderForRead(created.orderId)).toMatchObject({
      recordingId: null,
      status: "recording_pending",
    });
    expect(h.calls.getCallSession(created.callId!).recordingId).toBeNull();
    h.release();
    await h.controller.attachRecordingCallback(created.callId!, {
      recordingId: "synthetic-rec-fail",
    });
    expect(await h.owned.getOrderForRead(created.orderId)).toMatchObject({
      recordingId: "synthetic-rec-fail",
      status: "ready_for_dispatch",
    });
  });

  it.each(["pending", "failed"] as const)(
    "recording %s ACK includes its required order-state write",
    async (state) => {
      const h = fixture();
      const created = await h.owned.createCallCenterOrder({
        ...phoneCommand(`synthetic-state-${state}`),
        recordingId: "synthetic-start-rec",
      });
      const gate = h.hold("INSERT INTO ops.phase1_owned_orders");
      let settled = false;
      const operation =
        state === "pending"
          ? h.calls.markRecordingPendingForWrite.bind(h.calls)
          : h.calls.markRecordingFailedForWrite.bind(h.calls);
      const pending = Promise.resolve(operation(created.callId!)).then(
        (result) => {
          settled = true;
          return result;
        },
      );
      await h.entered.promise;
      await Promise.resolve();
      const early = settled;
      gate.resolve();
      await pending;
      expect(early).toBe(false);
      expect(await h.owned.getOrderForRead(created.orderId)).toMatchObject({
        recordingId: null,
        status: "recording_pending",
        complianceFlags: [
          state === "failed" ? "recording_missing" : "recording_pending",
        ],
      });
      expect(
        await h.calls.getCallSessionForRead(created.callId!),
      ).toMatchObject({
        recordingId: null,
        recordingState: state === "failed" ? "missing" : "pending",
      });
    },
  );

  it("does not rebind a call to a second phone order", async () => {
    const h = fixture();
    const command = phoneCommand("synthetic-single-call");
    const created = await h.owned.createCallCenterOrder(command);
    await expect(
      Promise.resolve(h.owned.createCallCenterOrder(command)),
    ).rejects.toMatchObject({ code: "VOICE_ORDER_ALREADY_LINKED" });
    expect(h.owned.listOrders()).toHaveLength(1);
    expect(await h.calls.getCallSessionForRead(command.callId)).toMatchObject({
      linkedOrderId: created.orderId,
    });
  });
  it("rejected open does not publish a phantom session or successful audit", async () => {
    const h = fixture();
    const gate = h.hold("COMMIT");
    const pending = h.controller.openCallSession({
      callType: "booking",
      callerPhone: "+886900000203",
    });
    const rejected = expect(pending).rejects.toThrow("synthetic open failure");
    await h.entered.promise;
    expect(h.calls.listCallSessions()).toEqual([]);
    const successfulOpens = () =>
      h.auditWrite.mock.calls.filter(
        ([row]) => row.actionName === "open_call_session",
      );
    expect(successfulOpens()).toEqual([]);
    gate.reject(new Error("synthetic open failure"));
    await rejected;
    expect(h.calls.listCallSessions()).toEqual([]);
    expect([...h.rows.keys()]).toEqual([]);
    expect(successfulOpens()).toEqual([]);
  });

  it("a cold peer opening another call preserves the first committed call identity and order link", async () => {
    const h = fixture();
    const first = await h.controller.openCallSession({
      callType: "booking",
      callerPhone: "+886900000203",
    });
    const order = await h.owned.createCallCenterOrder(
      phoneCommand(first.data.callId),
    );
    const cold = new CallcenterService(
      new AuditNotificationService(),
      new CallcenterRepository(h.database as never),
    );
    const second = await cold.openCallSessionForWrite({
      callType: "booking",
      callerPhone: "+886900000204",
    });
    expect(second.callId).not.toBe(first.data.callId);
    expect(await cold.getCallSessionForRead(first.data.callId)).toMatchObject({
      linkedOrderId: order.orderId,
      callerPhone: "+886900000203",
    });
  });
});
