import { describe, expect, it } from "vitest";
import type { CallSessionRecord } from "@drts/contracts";
import type { DatabaseService } from "../../apps/api/src/common/db";
import { AuditNotificationService } from "../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterController } from "../../apps/api/src/modules/callcenter/callcenter.controller";
import { CallcenterRepository } from "../../apps/api/src/modules/callcenter/callcenter.repository";
import { CallcenterService } from "../../apps/api/src/modules/callcenter/callcenter.service";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

type QueryResult = {
  rows: Array<{ record: CallSessionRecord }>;
  rowCount: number;
};
type Transaction = {
  writes: Map<string, CallSessionRecord>;
  releases: Array<() => void>;
};

/** Only the SQL transport is controlled. Business writers, canonical readers,
 * transaction orchestration and publication/audit are actual product methods. */
function world() {
  const rows = new Map<string, CallSessionRecord>();
  const queries: Array<{ clientId: number | null; sql: string }> = [];
  const locks = new Map<string, Promise<void>>();
  let nextClient = 0;
  let gate:
    | {
        match: string;
        entered: ReturnType<typeof deferred>;
        release: ReturnType<typeof deferred>;
      }
    | undefined;
  let failure: string | undefined;
  async function execute(
    sql: string,
    values: readonly unknown[] = [],
    tx?: Transaction,
    clientId: number | null = null,
  ): Promise<QueryResult> {
    queries.push({ clientId, sql });
    if (gate && sql.includes(gate.match)) {
      const held = gate;
      gate = undefined;
      held.entered.resolve();
      await held.release.promise;
    }
    if (failure && sql.includes(failure)) {
      failure = undefined;
      throw new Error("SIM call-session persistence rejected");
    }
    if (sql === "BEGIN" || sql.startsWith("SET LOCAL"))
      return { rows: [], rowCount: 0 };
    if (sql === "COMMIT" || sql === "ROLLBACK") {
      if (!tx) throw new Error("transaction client required");
      if (sql === "COMMIT")
        for (const [id, row] of tx.writes) rows.set(id, structuredClone(row));
      tx.writes.clear();
      for (const release of tx.releases.splice(0)) release();
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("pg_advisory_xact_lock")) {
      if (!tx) throw new Error("lock requires transaction");
      const key = String(values[0]);
      const previous = locks.get(key) ?? Promise.resolve();
      const next = deferred();
      locks.set(
        key,
        previous.then(() => next.promise),
      );
      await previous;
      tx.releases.push(next.resolve);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO crm.phase1_call_sessions")) {
      const record = JSON.parse(String(values.at(-1))) as CallSessionRecord;
      (tx?.writes ?? rows).set(String(values[0]), structuredClone(record));
      return { rows: [], rowCount: 1 };
    }
    if (
      sql.includes("SELECT record") &&
      sql.includes("crm.phase1_call_sessions")
    ) {
      const source = new Map([...rows, ...(tx?.writes ?? [])]);
      const selected = sql.includes("WHERE call_id")
        ? [source.get(String(values[0]))].filter(
            (row): row is CallSessionRecord => !!row,
          )
        : [...source.values()];
      return {
        rows: selected.map((record) => ({ record: structuredClone(record) })),
        rowCount: selected.length,
      };
    }
    throw new Error(`Unexpected SQL IO: ${sql}`);
  }
  const database = {
    isEnabled: () => true,
    query: (sql: string, values?: readonly unknown[]) => execute(sql, values),
    connect: async () => {
      const clientId = ++nextClient;
      const tx: Transaction = { writes: new Map(), releases: [] };
      return {
        query: (sql: string, values?: readonly unknown[]) =>
          execute(sql, values, tx, clientId),
        release: () => {
          for (const unlock of tx.releases.splice(0)) unlock();
        },
      };
    },
  } as unknown as DatabaseService;
  function replica() {
    const audit = new AuditNotificationService();
    const calls = new CallcenterService(
      audit,
      new CallcenterRepository(database),
    );
    const controller = new CallcenterController(
      calls,
      {} as never,
      {} as never,
      {} as never,
    );
    return { audit, calls, controller };
  }
  async function open(writer: ReturnType<typeof replica>) {
    return (
      await writer.controller.openCallSession({
        callType: "booking",
        callerPhone: "+886900000043",
        agentId: "unit-C043-original-operator",
        agentIdentityAnnounced: false,
      })
    ).data;
  }
  function hold(match: string) {
    const held = { match, entered: deferred(), release: deferred() };
    gate = held;
    return held;
  }
  return {
    rows,
    queries,
    replica,
    open,
    hold,
    failNext: (match: string) => {
      failure = match;
    },
  };
}
const identity = {
  realm: "ops",
  actorType: "ops_user",
  actorId: "unit-C043-operator",
  tenantId: null,
  roles: ["ops"],
  scopes: [],
} as const;
function announcedAudit(
  replica: ReturnType<ReturnType<typeof world>["replica"]>,
  callId: string,
  action: string,
) {
  return replica.audit
    .listAuditLogs()
    .filter(
      (entry) => entry.resourceId === callId && entry.actionName === action,
    );
}

describe("C043 canonical same-call announcement and ETA commands", () => {
  it("already booted B can announce the same normal call that A committed and B just read", async () => {
    const h = world();
    const a = h.replica();
    const b = h.replica();
    await b.calls.onModuleInit();
    const opened = await h.open(a);
    const id = opened.callId;
    expect(h.rows.get(id)?.callId).toBe(id);
    expect(
      (await b.controller.listCallSessions(identity as never)).data.items.some(
        (row) => row.callId === id,
      ),
    ).toBe(true);
    expect(
      (await b.controller.getCallSession(id, identity as never)).data.callId,
    ).toBe(id);
    expect(b.calls.listCallSessions()).toHaveLength(0);
    const announced = await b.controller.announceAgentIdentity(id, {
      agentId: "unit-C043-operator",
    });
    expect(announced.data).toMatchObject({
      callId: id,
      agentIdentityAnnounced: true,
    });
    expect(h.rows.get(id)?.agentIdentityAnnounced).toBe(true);
    const eta = await b.controller.quoteCallEta(id, { etaMinutes: 7 });
    expect(eta.data).toMatchObject({
      callId: id,
      lastEtaQuotedMinutes: 7,
      agentIdentityAnnounced: true,
    });
    expect(h.rows.get(id)?.lastEtaQuotedMinutes).toBe(7);
  });

  it("does not overwrite A's later same-call order/case linkage and operator from B's stale cache", async () => {
    const h = world();
    const a = h.replica();
    const opened = await h.open(a);
    const b = h.replica();
    await b.calls.onModuleInit();
    await a.controller.linkCallOrder(opened.callId, {
      orderId: "unit-C043-link-target-order",
    });
    await a.calls.linkCaseToCallSession(
      opened.callId,
      "unit-C043-link-target-case",
    );
    await a.controller.announceAgentIdentity(opened.callId, {
      agentId: "unit-C043-new-operator",
    });
    const announced = await b.controller.announceAgentIdentity(
      opened.callId,
      {},
    );
    const eta = await b.controller.quoteCallEta(opened.callId, {
      etaMinutes: 9,
    });
    for (const row of [announced.data, eta.data, h.rows.get(opened.callId)])
      expect(row).toMatchObject({
        linkedOrderId: "unit-C043-link-target-order",
        linkedCaseNo: "unit-C043-link-target-case",
        agentId: "unit-C043-new-operator",
      });
  });

  it.each(["announce", "eta"] as const)(
    "%s waits for COMMIT before success, cache publication and mutation audit",
    async (kind) => {
      const h = world();
      const a = h.replica();
      const opened = await h.open(a);
      const b = h.replica();
      await b.calls.onModuleInit();
      const held = h.hold("COMMIT");
      let settled = false;
      const pending = Promise.resolve(
        kind === "announce"
          ? b.controller.announceAgentIdentity(opened.callId, {})
          : b.controller.quoteCallEta(opened.callId, { etaMinutes: 6 }),
      ).then((result) => {
        settled = true;
        return result;
      });
      await held.entered.promise;
      expect(settled).toBe(false);
      expect(b.calls.getCallSession(opened.callId)).toMatchObject({
        agentIdentityAnnounced: false,
        lastEtaQuotedMinutes: null,
      });
      expect(h.rows.get(opened.callId)).toMatchObject({
        agentIdentityAnnounced: false,
        lastEtaQuotedMinutes: null,
      });
      expect(
        announcedAudit(
          b,
          opened.callId,
          kind === "announce" ? "announce_agent_identity" : "quote_call_eta",
        ),
      ).toHaveLength(0);
      held.release.resolve();
      await pending;
      expect(settled).toBe(true);
      expect(h.rows.get(opened.callId)).toMatchObject(
        kind === "announce"
          ? { agentIdentityAnnounced: true }
          : { lastEtaQuotedMinutes: 6 },
      );
      expect(
        announcedAudit(
          b,
          opened.callId,
          kind === "announce" ? "announce_agent_identity" : "quote_call_eta",
        ),
      ).toHaveLength(1);
    },
  );

  it.each(["announce", "eta"] as const)(
    "%s rejects failed persistence without false cache/audit and recovers through the same original route",
    async (kind) => {
      const h = world();
      const a = h.replica();
      const opened = await h.open(a);
      const b = h.replica();
      await b.calls.onModuleInit();
      const run = () =>
        kind === "announce"
          ? b.controller.announceAgentIdentity(opened.callId, {})
          : b.controller.quoteCallEta(opened.callId, { etaMinutes: 8 });
      h.failNext(
        kind === "announce" ? "INSERT INTO crm.phase1_call_sessions" : "COMMIT",
      );
      await expect(run()).rejects.toThrow(
        "SIM call-session persistence rejected",
      );
      expect(b.calls.getCallSession(opened.callId)).toMatchObject({
        agentIdentityAnnounced: false,
        lastEtaQuotedMinutes: null,
      });
      expect(h.rows.get(opened.callId)).toMatchObject({
        agentIdentityAnnounced: false,
        lastEtaQuotedMinutes: null,
      });
      expect(
        announcedAudit(
          b,
          opened.callId,
          kind === "announce" ? "announce_agent_identity" : "quote_call_eta",
        ),
      ).toHaveLength(0);
      await run();
      expect(h.rows.get(opened.callId)).toMatchObject(
        kind === "announce"
          ? { agentIdentityAnnounced: true }
          : { lastEtaQuotedMinutes: 8 },
      );
    },
  );

  it("two original writers serialize the same call and retain both updates and existing linkage on one client per transaction", async () => {
    const h = world();
    const a = h.replica();
    const opened = await h.open(a);
    await a.controller.linkCallOrder(opened.callId, {
      orderId: "unit-C043-shared-order",
    });
    const b = h.replica();
    const c = h.replica();
    await Promise.all([b.calls.onModuleInit(), c.calls.onModuleInit()]);
    const from = h.queries.length;
    const held = h.hold("INSERT INTO crm.phase1_call_sessions");
    const announcing = b.controller.announceAgentIdentity(opened.callId, {
      agentId: "unit-C043-current-operator",
    });
    await held.entered.promise;
    const eta = c.controller.quoteCallEta(opened.callId, { etaMinutes: 11 });
    await Promise.resolve();
    held.release.resolve();
    await Promise.all([announcing, eta]);
    expect(
      (await a.controller.getCallSession(opened.callId, identity as never))
        .data,
    ).toMatchObject({
      linkedOrderId: "unit-C043-shared-order",
      agentId: "unit-C043-current-operator",
      agentIdentityAnnounced: true,
      lastEtaQuotedMinutes: 11,
    });
    const writes = h.queries
      .slice(from)
      .filter((q) => q.sql.includes("INSERT INTO crm.phase1_call_sessions"));
    expect(writes).toHaveLength(2);
    expect(writes.every((q) => q.clientId !== null)).toBe(true);
    for (const write of writes)
      expect(
        h.queries
          .slice(from)
          .filter((q) => q.clientId === write.clientId)
          .map((q) => q.sql),
      ).toEqual(
        expect.arrayContaining([
          "BEGIN",
          "COMMIT",
          expect.stringContaining("pg_advisory_xact_lock"),
          expect.stringContaining("FOR UPDATE"),
        ]),
      );
  });

  it("keeps original no-DB synchronous commands, input validation and missing-call outcomes", async () => {
    const audit = new AuditNotificationService();
    const calls = new CallcenterService(audit);
    const opened = calls.openCallSession({
      callType: "booking",
      callerPhone: "+886900000043",
    });
    expect(
      calls.announceAgentIdentity(opened.callId, { agentId: "unit-C043-sync" }),
    ).toMatchObject({
      agentId: "unit-C043-sync",
      agentIdentityAnnounced: true,
    });
    expect(calls.quoteEta(opened.callId, { etaMinutes: 3 })).toMatchObject({
      lastEtaQuotedMinutes: 3,
    });
    expect(() => calls.quoteEta(opened.callId, { etaMinutes: 0 })).toThrow();
    const h = world();
    const peer = h.replica();
    await expect(
      peer.controller.announceAgentIdentity("unit-C043-missing", {}),
    ).rejects.toMatchObject({ code: "CALL_SESSION_NOT_FOUND" });
    await expect(
      peer.controller.quoteCallEta("unit-C043-missing", { etaMinutes: 4 }),
    ).rejects.toMatchObject({ code: "CALL_SESSION_NOT_FOUND" });
    await expect(
      peer.controller.quoteCallEta(opened.callId, { etaMinutes: -1 }),
    ).rejects.toMatchObject({ code: "ETA_MINUTES_INVALID" });
  });
});
