import { EventEmitter } from "node:events";
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
});
