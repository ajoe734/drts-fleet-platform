import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  databaseSocket,
  setup,
  publish,
} from "../billing-monthly-batch-resumption-20261015/fixtures";
import { InMemoryDocumentArtifactStore } from "../../../apps/api/src/common/document-artifacts";

function controlledDatabaseSocket() {
  const socket = databaseSocket();
  const execute = socket.query.getMockImplementation()!;
  // SQL selection is IO: the original generic table double does not filter batch_id.
  socket.query.mockImplementation(async (sql, values = []) => {
    const result = await execute(sql, values);
    if (sql.includes("WHERE batch_id = $1")) {
      const rows = result.rows.filter(
        (row) =>
          "record" in row &&
          (row.record as { batchId?: string }).batchId === values[0],
      );
      return { rows, rowCount: rows.length };
    }
    return result;
  });
  return socket;
}

function addTrip(
  socket: ReturnType<typeof databaseSocket>,
  driverId: string,
  suffix: string,
) {
  socket.liveRows.push({
    order_record: {
      orderId: `SIM-order-${suffix}`,
      tenantId: "SIM-tenant-c080",
      orderSource: "api",
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "credit_card_airport_transfer",
      serviceProductCode: "credit_card_airport_transfer",
      costCenter: null,
      passenger: null,
      partnerId: "SIM-partner-c080",
      partnerProgramId: null,
      partnerEntrySlug: null,
      eligibilityVerificationId: null,
      issuerAuthorizationRef: "SIM-issuer-reference-c080",
      benefitReference: "SIM-benefit-reference-c080",
    },
    task_record: {
      taskId: `SIM-task-${suffix}`,
      orderId: `SIM-order-${suffix}`,
      driverId,
      completedAt: "2026-07-15T12:00:00.000Z",
      status: "completed",
      fare: { currency: "TWD", amountMinor: 10000 },
    },
  });
}

async function generate(
  service: Awaited<ReturnType<typeof setup>>["service"],
  driverId: string,
) {
  const result = await service.generateDriverStatements({
    periodMonth: "2026-07",
    driverId,
  });
  expect(result.reimbursementBatchIds).toHaveLength(1);
  return service.getReimbursementBatch(result.reimbursementBatchIds[0]!);
}

function financeIdentity() {
  return {
    authMode: "bootstrap_headers" as const,
    actorType: "platform_admin" as const,
    actorId: "SIM-finance-c080",
    realm: "platform" as const,
    tenantId: null,
    roleFamilies: ["platform" as const],
    roles: [],
    scopes: ["billing:write"],
    requestId: null,
  };
}

// Only the existing database socket and shared artifact IO are controlled.
// Actual repository, service, Controller, normal producer, PDF renderer and audit execute.
describe("C080 warm replica reads the canonical generated reimbursement batch", () => {
  it("reads A's normally generated, approved and exported same batch on already booted B", async () => {
    const socket = controlledDatabaseSocket();
    // SIM canonical completed card-benefit input, not a provider call or manually inserted batch.
    socket.liveRows.push({
      order_record: {
        orderId: "order-c080-warm-replica",
        tenantId: "tenant-c080-warm-replica",
        orderSource: "api",
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "credit_card_airport_transfer",
        serviceProductCode: "credit_card_airport_transfer",
        costCenter: null,
        passenger: null,
        partnerId: "SIM-partner-c080",
        partnerProgramId: null,
        partnerEntrySlug: null,
        eligibilityVerificationId: null,
        issuerAuthorizationRef: "SIM-issuer-reference-c080",
        benefitReference: "SIM-benefit-reference-c080",
      },
      task_record: {
        taskId: "task-c080-warm-replica",
        orderId: "order-c080-warm-replica",
        driverId: "driver-c080-warm-replica",
        completedAt: "2026-07-15T12:00:00.000Z",
        status: "completed",
        fare: { currency: "TWD", amountMinor: 10000 },
      },
    });
    const store = new InMemoryDocumentArtifactStore();
    const a = await setup(socket, store);
    const b = await setup(socket, store); // B is already booted before A creates the batch.
    await publish(a.service);
    const generated = await a.controller.generateDriverStatements(
      { periodMonth: "2026-07", driverId: "driver-c080-warm-replica" },
      "c080-warm-generate",
      "c080-warm-generate-request",
    );
    expect(generated.data.items).toHaveLength(1);
    expect(generated.data.reimbursementBatchIds).toHaveLength(1);
    const batchId = generated.data.reimbursementBatchIds[0]!;
    const statementId = generated.data.items[0]!.statementId;
    await a.controller.approveReimbursementBatch(
      batchId,
      { statementId },
      "c080-warm-approve",
      "c080-warm-approve-request",
    );
    const exported = await a.service.exportReimbursementBatch(
      batchId,
      {
        authMode: "jwt_bearer",
        actorType: "platform_admin",
        actorId: "finance-c080-warm",
        realm: "platform",
        tenantId: null,
        roleFamilies: ["platform"],
        roles: ["platform_admin"],
        scopes: ["billing:read", "billing:write"],
        requestId: null,
      },
      "c080-warm-export-request",
    );
    const artifact = await store.get("report", batchId);
    expect(artifact?.bytes.subarray(0, 5).toString()).toBe("%PDF-");
    expect(createHash("sha256").update(artifact!.bytes).digest("hex")).toBe(
      exported.manifestHash,
    );
    const committed = (
      await b.repository!.loadState()
    ).reimbursementBatches.find((row) => row.batchId === batchId)!;
    expect(committed).toMatchObject({
      batchId,
      statementId,
      workflowState: "exported",
      exportManifestHash: exported.manifestHash,
    });
    expect(
      socket.tables.get("billing.phase1_reimbursement_batches")?.has(batchId),
    ).toBe(true);
    const listed = await b.controller.listReimbursementBatches(
      undefined,
      "2026-07",
      "driver-c080-warm-replica",
    );
    let detailBatchId: string | null = null;
    let detailHash: string | null = null;
    let detailCode: string | null = null;
    try {
      const detail = await b.controller.getReimbursementBatch(batchId);
      detailBatchId = detail.data.batchId;
      detailHash = detail.data.exportManifestHash ?? null;
    } catch (error) {
      detailCode = (error as { code?: string }).code ?? "UNKNOWN";
    }
    const observed = {
      listIds: listed.data.items.map((row) => row.batchId),
      detailBatchId,
      detailHash,
      detailCode,
    };
    writeFileSync(
      "warm-reader-observations.json",
      JSON.stringify(
        {
          batchId,
          statementId,
          committedWorkflow: committed.workflowState,
          manifestHash: exported.manifestHash,
          artifactBytes: artifact!.bytes.length,
          observed,
        },
        null,
        2,
      ) + "\n",
    );
    expect(observed).toEqual({
      listIds: [batchId],
      detailBatchId: batchId,
      detailHash: exported.manifestHash,
      detailCode: null,
    });
  });

  it("keeps the original filters, exact-id NOT_FOUND, and detached money/item snapshots", async () => {
    const socket = controlledDatabaseSocket();
    addTrip(socket, "SIM-driver-first", "first");
    addTrip(socket, "SIM-driver-second", "second");
    const a = await setup(socket);
    const b = await setup(socket);
    await publish(a.service);
    const first = await generate(a.service, "SIM-driver-first");
    const second = await generate(a.service, "SIM-driver-second");
    const listed = await b.controller.listReimbursementBatches(
      "pending",
      "2026-07",
      second.driverId,
      second.statementId,
    );
    expect(listed.data.items.map((row) => row.batchId)).toEqual([
      second.batchId,
    ]);
    expect(
      (await b.controller.getReimbursementBatch(second.batchId)).data,
    ).toEqual(second);
    expect(
      (
        await b.controller.listReimbursementBatches(
          "paid",
          "2026-07",
          second.driverId,
        )
      ).data.items,
    ).toEqual([]);
    expect(
      (await b.controller.listReimbursementBatches(undefined, "2026-06")).data
        .items,
    ).toEqual([]);
    expect(
      (
        await b.controller.listReimbursementBatches(
          undefined,
          "2026-07",
          "SIM-unknown-driver",
        )
      ).data.items,
    ).toEqual([]);
    expect(
      (
        await b.controller.listReimbursementBatches(
          undefined,
          "2026-07",
          first.driverId,
          second.statementId,
        )
      ).data.items,
    ).toEqual([]);
    await expect(
      b.controller.getReimbursementBatch("SIM-nonexistent-batch"),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    listed.data.items[0]!.totalAmount.amountMinor = -1;
    listed.data.items[0]!.items[0]!.amount.amountMinor = -2;
    const detail = (await b.controller.getReimbursementBatch(second.batchId))
      .data;
    expect(detail.totalAmount).toEqual(second.totalAmount);
    expect(detail.items).toEqual(second.items);
    expect(b.service.listReimbursementBatches()).toEqual([]);
  });

  it("propagates committed read failures instead of returning a warm stale cache", async () => {
    const socket = controlledDatabaseSocket();
    addTrip(socket, "SIM-driver-failure", "failure");
    const a = await setup(socket);
    await publish(a.service);
    const batch = await generate(a.service, "SIM-driver-failure");
    const b = await setup(socket); // A known warm record must not hide database failure.
    expect(b.service.getReimbursementBatch(batch.batchId)).toEqual(batch);
    const execute = socket.query.getMockImplementation()!;
    socket.query.mockImplementation(async (sql, values = []) => {
      if (
        /SELECT record FROM billing\.phase1_reimbursement_batches/.test(sql)
      ) {
        throw new Error("SIM committed reimbursement read unavailable");
      }
      return execute(sql, values);
    });
    await expect(b.controller.listReimbursementBatches()).rejects.toThrow(
      "SIM committed reimbursement read unavailable",
    );
    await expect(
      b.controller.getReimbursementBatch(batch.batchId),
    ).rejects.toThrow("SIM committed reimbursement read unavailable");
    expect(b.service.getReimbursementBatch(batch.batchId)).toEqual(batch);
  });

  it("does not publish delayed old list/detail reads over B's normal approve/export producer cache", async () => {
    const socket = controlledDatabaseSocket();
    addTrip(socket, "SIM-driver-interleaving", "interleaving");
    const store = new InMemoryDocumentArtifactStore();
    const a = await setup(socket, store);
    await publish(a.service);
    const batch = await generate(a.service, "SIM-driver-interleaving");
    const b = await setup(socket, store);
    const execute = socket.query.getMockImplementation()!;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let heldCount = 0;
    let observed!: () => void;
    const bothCaptured = new Promise<void>((resolve) => {
      observed = resolve;
    });
    socket.query.mockImplementation(async (sql, values = []) => {
      const result = await execute(sql, values);
      if (
        /SELECT record FROM billing\.phase1_reimbursement_batches/.test(sql) &&
        heldCount < 2
      ) {
        heldCount += 1;
        if (heldCount === 2) observed();
        await gate;
      }
      return result;
    });
    const oldList = b.controller.listReimbursementBatches();
    const oldDetail = b.controller.getReimbursementBatch(batch.batchId);
    await bothCaptured;
    try {
      await b.controller.approveReimbursementBatch(
        batch.batchId,
        { statementId: batch.statementId },
        "SIM-approve-interleaving",
      );
      const exported = await b.service.exportReimbursementBatch(
        batch.batchId,
        financeIdentity(),
      );
      expect(
        b.service.getReimbursementBatch(batch.batchId).exportManifestHash,
      ).toBe(exported.manifestHash);
      release();
      expect((await oldList).data.items[0]!.workflowState).toBe(
        "pending_approval",
      );
      expect((await oldDetail).data.workflowState).toBe("pending_approval");
      expect(b.service.getReimbursementBatch(batch.batchId)).toMatchObject({
        workflowState: "exported",
        exportManifestHash: exported.manifestHash,
      });
      expect(
        (await store.get("report", batch.batchId))?.bytes
          .subarray(0, 5)
          .toString(),
      ).toBe("%PDF-");
    } finally {
      release();
      await Promise.allSettled([oldList, oldDetail]);
    }
  });

  it("preserves the existing non-database consumer behavior", async () => {
    const a = await setup();
    await publish(a.service);
    const generated = await a.service.generateDriverStatements({
      periodMonth: "2026-03",
    });
    const batchId = generated.reimbursementBatchIds[0]!;
    expect((await a.controller.listReimbursementBatches()).data.items).toEqual(
      a.service.listReimbursementBatches(),
    );
    expect((await a.controller.getReimbursementBatch(batchId)).data).toEqual(
      a.service.getReimbursementBatch(batchId),
    );
  });
});
