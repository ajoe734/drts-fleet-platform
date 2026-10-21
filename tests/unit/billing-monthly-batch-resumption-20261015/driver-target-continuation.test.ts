import { describe, expect, it } from "vitest";
import { databaseSocket, setup, publish } from "./fixtures";

describe("C089 real per-target continuation", () => {
  it("June subset drv-demo-002 then all includes drv-demo-003 and preserves committed PDF/IDs", async () => {
    const { service, controller, store } = await setup();
    await publish(service);
    const first = await controller.generateDriverStatements(
      { periodMonth: "2026-06", driverId: "drv-demo-002" },
      "c089-subset",
      "request-subset",
    );
    const statement = first.data.items[0]!;
    const artifact = await store.get("report", statement.statementId);
    const all = await controller.generateDriverStatements(
      { periodMonth: "2026-06" },
      "c089-all",
      "request-all",
    );
    expect(all.data.items.map((s) => s.driverId).sort()).toEqual([
      "drv-demo-002",
      "drv-demo-003",
    ]);
    expect(all.data.items.find((s) => s.driverId === "drv-demo-002")).toEqual(
      statement,
    );
    expect(await store.get("report", statement.statementId)).toEqual(artifact);
    const replay = await controller.generateDriverStatements(
      { periodMonth: "2026-06" },
      "c089-all-retry",
      "request-retry",
    );
    expect(replay.data).toEqual(all.data);
  });

  it("statement SQL rejection leaves no uncommitted cache or success notification/audit and can retry", async () => {
    const socket = databaseSocket();
    const { service, controller, notifications, logs } = await setup(socket);
    await publish(service);
    notifications.mockClear();
    logs.mockClear();
    socket.reject("billing.phase1_driver_statements");
    await expect(
      controller.generateDriverStatements(
        { periodMonth: "2026-06", driverId: "drv-demo-002" },
        "c089-reject",
      ),
    ).rejects.toThrow("SIM database rejected");
    expect(await service.listDriverStatements("2026-06")).toEqual([]);
    expect(notifications).not.toHaveBeenCalled();
    expect(
      logs.mock.calls.filter(
        ([log]) => log.actionName === "generate_driver_statement",
      ),
    ).toEqual([]);
    socket.reject(null);
    const retried = await controller.generateDriverStatements(
      { periodMonth: "2026-06", driverId: "drv-demo-002" },
      "c089-retry",
    );
    expect(retried.data.items).toHaveLength(1);
    const fresh = await setup(socket);
    expect(await fresh.service.listDriverStatements("2026-06")).toEqual(
      retried.data.items,
    );
  });

  it("delayed canonical ACK keeps the real command pending without exposing success effects", async () => {
    const socket = databaseSocket();
    const { service, controller, notifications, logs } = await setup(socket);
    await publish(service);
    notifications.mockClear();
    logs.mockClear();
    let entered!: () => void, release!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    socket.hold(async () => {
      entered();
      await gate;
    });
    let complete = false;
    const command = controller
      .generateDriverStatements(
        { periodMonth: "2026-06", driverId: "drv-demo-002" },
        "c089-delayed",
      )
      .then((r) => {
        complete = true;
        return r;
      });
    await started;
    try {
      expect(complete).toBe(false);
      expect(await service.listDriverStatements("2026-06")).toEqual([]);
      expect(notifications).not.toHaveBeenCalled();
      expect(
        logs.mock.calls.filter(
          ([log]) => log.actionName === "generate_driver_statement",
        ),
      ).toEqual([]);
    } finally {
      release();
      await command;
    }
    expect(notifications).toHaveBeenCalledTimes(1);
  });
});

describe("C089 independent row ACK/restart/overlap", () => {
  it("statement commits while linked reimbursement rejects: fresh real repository completes only the missing batch", async () => {
    const socket = databaseSocket();
    const first = await setup(socket);
    await publish(first.service);
    first.notifications.mockClear();
    first.logs.mockClear();
    socket.reject("billing.phase1_reimbursement_batches");
    await expect(
      first.controller.generateDriverStatements(
        { periodMonth: "2026-03", driverId: "drv-demo-001" },
        "partial-first",
      ),
    ).rejects.toThrow("SIM database rejected");
    const committed = [
      ...socket.tables.get("billing.phase1_driver_statements")!.values(),
    ][0]!;
    expect(socket.tables.get("billing.phase1_driver_statements")!.size).toBe(1);
    expect(
      socket.tables.get("billing.phase1_reimbursement_batches")?.size ?? 0,
    ).toBe(0);
    expect(first.notifications).not.toHaveBeenCalled();
    expect(
      first.logs.mock.calls.filter(([log]) =>
        log.actionName.startsWith("generate_"),
      ),
    ).toEqual([]);
    const beforeArtifact = await first.store.get(
      "report",
      String(committed.statementId),
    );
    const proposal = [
      ...socket.tables.get("ops.idempotency_records")!.values(),
    ].find((row) => row.scope === "billing:driver-statement:target-proposal")!
      .response_body as { reimbursement: { batchId: string } };
    const statementWrites = socket.query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO billing.phase1_driver_statements"),
    ).length;
    socket.reject(null);
    const fresh = await setup(socket, first.store);
    const resumed = await fresh.controller.generateDriverStatements(
      { periodMonth: "2026-03", driverId: "drv-demo-001" },
      "partial-resume",
    );
    expect(resumed.data.items).toEqual([committed]);
    expect(resumed.data.reimbursementBatchIds).toEqual([
      proposal.reimbursement.batchId,
    ]);
    expect(
      socket.query.mock.calls.filter(([sql]) =>
        sql.includes("INSERT INTO billing.phase1_driver_statements"),
      ),
    ).toHaveLength(statementWrites);
    expect(
      await fresh.store.get("report", String(committed.statementId)),
    ).toEqual(beforeArtifact);
    expect(fresh.service.listReimbursementBatches()).toEqual([
      expect.objectContaining({
        statementId: committed.statementId,
        batchId: proposal.reimbursement.batchId,
        totalAmount: { currency: "TWD", amountMinor: 20000 },
      }),
    ]);
    expect(fresh.notifications).toHaveBeenCalledTimes(2);
    const third = await setup(socket, first.store);
    expect(
      (
        await third.controller.generateDriverStatements(
          { periodMonth: "2026-03", driverId: "drv-demo-001" },
          "third-replay",
        )
      ).data,
    ).toEqual(resumed.data);
    expect(third.notifications).not.toHaveBeenCalled();
  });

  it("batch may commit while statement rejects; its proposal keeps batch/line IDs and PDF stable on restart", async () => {
    const socket = databaseSocket();
    const first = await setup(socket);
    await publish(first.service);
    socket.reject("billing.phase1_driver_statements");
    await expect(
      first.controller.generateDriverStatements(
        { periodMonth: "2026-03", driverId: "drv-demo-001" },
        "statement-reject",
      ),
    ).rejects.toThrow("SIM database rejected");
    const batch = [
      ...socket.tables.get("billing.phase1_reimbursement_batches")!.values(),
    ][0]!;
    const bytes = await first.store.get("report", String(batch.statementId));
    socket.reject(null);
    const fresh = await setup(socket, first.store);
    const result = await fresh.controller.generateDriverStatements(
      { periodMonth: "2026-03", driverId: "drv-demo-001" },
      "statement-resume",
    );
    expect(result.data.items[0]!.statementId).toBe(batch.statementId);
    expect(result.data.reimbursementBatchIds).toEqual([batch.batchId]);
    expect(fresh.service.listReimbursementBatches()).toEqual([batch]);
    expect(await first.store.get("report", String(batch.statementId))).toEqual(
      bytes,
    );
    expect(socket.tables.get("billing.phase1_driver_statements")!.size).toBe(1);
  });

  it("unknown statement ACK retains canonical rows and retry never reissues committed IDs/artifact", async () => {
    const socket = databaseSocket();
    const first = await setup(socket);
    await publish(first.service);
    socket.loseAck("billing.phase1_driver_statements");
    await expect(
      first.controller.generateDriverStatements(
        { periodMonth: "2026-06", driverId: "drv-demo-002" },
        "ack-loss",
      ),
    ).rejects.toThrow("SIM committed ACK lost");
    const committed = [
      ...socket.tables.get("billing.phase1_driver_statements")!.values(),
    ][0]!;
    const artifact = await first.store.get(
      "report",
      String(committed.statementId),
    );
    const fresh = await setup(socket, first.store);
    const retried = await fresh.controller.generateDriverStatements(
      { periodMonth: "2026-06", driverId: "drv-demo-002" },
      "ack-retry",
    );
    expect(retried.data.items).toEqual([committed]);
    expect(
      await first.store.get("report", String(committed.statementId)),
    ).toEqual(artifact);
    expect(fresh.notifications).toHaveBeenCalledTimes(1);
    expect(
      socket.query.mock.calls.filter(([sql]) =>
        sql.includes("INSERT INTO billing.phase1_driver_statements"),
      ),
    ).toHaveLength(1);
  });

  it("overlapping real controllers on two instances share the database target lock and one success fanout", async () => {
    const socket = databaseSocket();
    const first = await setup(socket);
    await publish(first.service);
    const second = await setup(socket, first.store);
    first.notifications.mockClear();
    second.notifications.mockClear();
    const [a, b] = await Promise.all([
      first.controller.generateDriverStatements(
        { periodMonth: "2026-03", driverId: "drv-demo-001" },
        "overlap-first",
      ),
      second.controller.generateDriverStatements(
        { periodMonth: "2026-03", driverId: "drv-demo-001" },
        "overlap-second",
      ),
    ]);
    expect(a.data).toEqual(b.data);
    expect(socket.tables.get("billing.phase1_driver_statements")!.size).toBe(1);
    expect(
      socket.tables.get("billing.phase1_reimbursement_batches")!.size,
    ).toBe(1);
    expect(
      first.notifications.mock.calls.length +
        second.notifications.mock.calls.length,
    ).toBe(2);
    expect(
      socket.query.mock.calls.filter(([sql]) =>
        sql.includes("INSERT INTO billing.phase1_driver_statements"),
      ),
    ).toHaveLength(1);
    expect(new Set(socket.clientCalls.map((call) => call.clientId)).size).toBe(
      2,
    );
    expect(socket.releasedSessions.sort()).toEqual([1, 2]);
    const targetQueries = socket.query.mock.calls.filter(([sql]) =>
      /INSERT INTO billing.phase1_(driver_statements|reimbursement_batches)|ops.idempotency_records|WHERE period_month =/.test(
        sql,
      ),
    );
    for (const [sql, values] of targetQueries)
      expect(
        socket.clientCalls.some(
          (call) =>
            call.sql === sql &&
            JSON.stringify(call.values) === JSON.stringify(values),
        ),
      ).toBe(true);
    for (const clientId of [1, 2]) {
      const calls = socket.clientCalls.filter(
        (call) => call.clientId === clientId,
      );
      expect(calls[0]!.sql).toContain("pg_advisory_lock(");
      expect(calls.at(-1)!.sql).toContain("pg_advisory_unlock(");
    }
  });

  it("partial driver failure followed by all resumes missing targets and retains the first successful driver", async () => {
    const socket = databaseSocket();
    const first = await setup(socket);
    await publish(first.service);
    socket.reject("billing.phase1_driver_statements");
    socket.rejectDriver("drv-demo-002");
    await expect(
      first.controller.generateDriverStatements(
        { periodMonth: "2026-06" },
        "all-partial",
      ),
    ).rejects.toThrow("SIM database rejected");
    const successful = [
      ...socket.tables.get("billing.phase1_driver_statements")!.values(),
    ][0]!;
    expect(successful.driverId).toBe("drv-demo-003");
    const artifact = await first.store.get(
      "report",
      String(successful.statementId),
    );
    socket.reject(null);
    socket.rejectDriver(null);
    const fresh = await setup(socket, first.store);
    const all = await fresh.controller.generateDriverStatements(
      { periodMonth: "2026-06" },
      "all-resume",
    );
    expect(all.data.items.map((item) => item.driverId).sort()).toEqual([
      "drv-demo-002",
      "drv-demo-003",
    ]);
    expect(
      all.data.items.find((item) => item.driverId === successful.driverId),
    ).toEqual(successful);
    expect(
      await first.store.get("report", String(successful.statementId)),
    ).toEqual(artifact);
  });
});

describe("C089 durable reservation ACK loss and legacy partial rows", () => {
  it("unknown reservation ACK reuses its saved IDs/createdAt/lines on a fresh instance", async () => {
    const socket = databaseSocket(),
      first = await setup(socket);
    await publish(first.service);
    socket.loseScopeAck("billing:driver-statement:target-proposal");
    await expect(
      first.controller.generateDriverStatements(
        { periodMonth: "2026-03", driverId: "drv-demo-001" },
        "reserve-lost",
      ),
    ).rejects.toThrow("SIM idempotency INSERT committed ACK lost");
    const saved = [
      ...socket.tables.get("ops.idempotency_records")!.values(),
    ][0]!.response_body as {
      statement: { statementId: string; createdAt: string; lines: unknown[] };
      reimbursement: { batchId: string };
    };
    expect(await first.service.listDriverStatements("2026-03")).toEqual([]);
    expect(
      await first.store.get("report", saved.statement.statementId),
    ).toBeNull();
    const fresh = await setup(socket, first.store);
    const result = await fresh.controller.generateDriverStatements(
      { periodMonth: "2026-03", driverId: "drv-demo-001" },
      "reserve-resume",
    );
    expect(result.data.items[0]).toMatchObject(saved.statement);
    expect(result.data.reimbursementBatchIds).toEqual([
      saved.reimbursement.batchId,
    ]);
  });

  it("unknown success-fanout ACK is resolved by exact attempt readback and later retries do not duplicate notices", async () => {
    const socket = databaseSocket(),
      actual = await setup(socket);
    await publish(actual.service);
    actual.notifications.mockClear();
    socket.loseScopeAck("billing:driver-statement:success-fanout");
    const first = await actual.controller.generateDriverStatements(
      { periodMonth: "2026-06", driverId: "drv-demo-002" },
      "fanout-lost",
    );
    expect(actual.notifications).toHaveBeenCalledTimes(1);
    expect(
      (
        await actual.controller.generateDriverStatements(
          { periodMonth: "2026-06", driverId: "drv-demo-002" },
          "fanout-retry",
        )
      ).data,
    ).toEqual(first.data);
    expect(actual.notifications).toHaveBeenCalledTimes(1);
  });

  it("legacy canonical statement without any new proposal repairs only its legitimate missing reimbursement", async () => {
    const original = databaseSocket(),
      issued = await setup(original);
    await publish(issued.service);
    const first = await issued.controller.generateDriverStatements(
      { periodMonth: "2026-03", driverId: "drv-demo-001" },
      "original-statement",
    );
    const statement = first.data.items[0]!,
      bytes = await issued.store.get("report", statement.statementId);
    // Rehydrate only canonical legacy rows at the external DB boundary. No
    // fixture PDF, product handler or financial calculation is substituted.
    const legacy = databaseSocket();
    for (const table of [
      "billing.phase1_tenant_billing_profiles",
      "billing.phase1_driver_fee_plans",
      "billing.phase1_driver_statements",
    ])
      legacy.tables.set(
        table,
        new Map(
          [...original.tables.get(table)!].map(([key, value]) => [
            key,
            structuredClone(value),
          ]),
        ),
      );
    const fresh = await setup(legacy, issued.store);
    const repaired = await fresh.controller.generateDriverStatements(
      { periodMonth: "2026-03", driverId: "drv-demo-001" },
      "legacy-repair",
    );
    expect(repaired.data.items).toEqual([statement]);
    expect(repaired.data.reimbursementBatchIds).toHaveLength(1);
    expect(fresh.service.listReimbursementBatches()[0]).toMatchObject({
      statementId: statement.statementId,
      totalAmount: { amountMinor: 20000 },
    });
    expect(await fresh.store.get("report", statement.statementId)).toEqual(
      bytes,
    );
    expect(fresh.notifications).toHaveBeenCalledTimes(1);
    expect(fresh.notifications.mock.calls[0]![0].title).toBe(
      "Driver reimbursement batch created",
    );
    expect(
      legacy.query.mock.calls.filter(([sql]) =>
        sql.includes("INSERT INTO billing.phase1_driver_statements"),
      ),
    ).toEqual([]);
  });
});
