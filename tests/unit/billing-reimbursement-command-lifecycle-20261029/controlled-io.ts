import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import { databaseSocket } from "../billing-monthly-batch-resumption-20261015/fixtures";
import { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { RemittanceProofService } from "../../../apps/api/src/modules/billing-settlement/remittance-proof.service";
import { InMemoryRemittanceProofStorageAdapter } from "../../../apps/api/src/modules/billing-settlement/remittance-proof-storage.adapter";
import { InMemoryDocumentArtifactStore } from "../../../apps/api/src/common/document-artifacts";

// SQL/storage/scanner IO only. No product handler or finance decision is replaced.
export function controlledIO() {
  const socket = databaseSocket();
  const proofs = new Map<string, any>();
  const receipts = new Map<string, any>();
  const calls: Array<{
    replica: string;
    client: number | null;
    sql: string;
    values: readonly unknown[];
  }> = [];
  const events: string[] = [];
  const pools: Array<{
    replica: string;
    active: number;
    maximum: number;
    checkouts: number;
    releases: Array<boolean>;
  }> = [];
  const artifactStore = new InMemoryDocumentArtifactStore();
  const proofStorage = new InMemoryRemittanceProofStorageAdapter();
  const scanner = {
    providerName: "SIM-controlled-scanner",
    available: true,
    availability: () =>
      scanner.available
        ? { state: "available" as const }
        : { state: "unavailable" as const, reason: "SIM scanner unavailable" },
    scan: vi.fn(async () => ({
      scanState: "clean" as const,
      rejectionReason: null,
      scanCompletedAt: new Date().toISOString(),
    })),
  };
  let serial = 0;
  let failNextBatchWrite = false;
  let failNextLockAck = false;
  let failNextUnlockAck = false;

  async function query(
    sql: string,
    values: readonly unknown[],
    replica: string,
    client: number | null,
    pending: Map<string, any> | null,
    forward: () => Promise<any>,
  ) {
    calls.push({ replica, client, sql, values });
    if (sql.includes("INSERT INTO billing.phase1_remittance_proofs")) {
      const row = {
        proof_id: randomUUID(),
        batch_id: values[0],
        driver_id: values[1],
        uploaded_by_actor_id: values[2],
        original_filename: values[3],
        content_hash: values[4],
        content_type: values[5],
        size_bytes: values[6],
        created_at: values[7],
        scan_state: "pending_scan",
        scan_completed_at: null,
        rejection_reason: null,
      };
      proofs.set(row.proof_id, row);
      return { rows: [structuredClone(row)], rowCount: 1 };
    }
    if (sql.includes("UPDATE billing.phase1_remittance_proofs")) {
      const row = proofs.get(String(values[0]));
      if (!row || row.scan_state !== "pending_scan")
        return { rows: [], rowCount: 0 };
      Object.assign(row, {
        scan_state: values[1],
        scan_completed_at: values[2],
        rejection_reason: values[3],
      });
      return { rows: [structuredClone(row)], rowCount: 1 };
    }
    if (/SELECT \* FROM billing\.phase1_remittance_proofs/.test(sql)) {
      const rows = [...proofs.values()].filter((row) =>
        sql.includes("WHERE proof_id")
          ? row.proof_id === values[0]
          : row.batch_id === values[0],
      );
      return {
        rows: structuredClone(rows.slice(0, 1)),
        rowCount: rows.length ? 1 : 0,
      };
    }
    if (
      sql.includes(
        "INSERT INTO billing.phase1_remittance_proof_payment_receipts",
      )
    ) {
      if (!pending)
        throw new Error("SIM receipt INSERT outside its real BEGIN/COMMIT");
      const exists = [...receipts.values(), ...pending.values()].some(
        (row) =>
          row.batch_id === values[0] && row.idempotency_key === values[2],
      );
      if (exists) return { rows: [], rowCount: 0 };
      const row = {
        receipt_id: randomUUID(),
        batch_id: values[0],
        proof_id: values[1],
        idempotency_key: values[2],
        driver_id: values[3],
        amount_minor: values[4],
        currency: values[5],
        paid_at: values[6],
        created_at: new Date().toISOString(),
      };
      pending.set(row.receipt_id, row);
      return { rows: [structuredClone(row)], rowCount: 1 };
    }
    if (
      /SELECT \* FROM billing\.phase1_remittance_proof_payment_receipts/.test(
        sql,
      )
    ) {
      const rows = [...receipts.values(), ...(pending?.values() ?? [])].filter(
        (row) =>
          row.batch_id === values[0] &&
          (values.length < 2 || row.idempotency_key === values[1]),
      );
      return {
        rows: structuredClone(rows.slice(0, 1)),
        rowCount: rows.length ? 1 : 0,
      };
    }
    if (
      sql.includes("INSERT INTO billing.phase1_reimbursement_batches") &&
      failNextBatchWrite
    ) {
      failNextBatchWrite = false;
      events.push(`batch-rejected-after-${receipts.size}-committed-receipts`);
      throw new Error("SIM batch persistence rejected after receipt COMMIT");
    }
    const result = await forward();
    if (sql.includes("WHERE batch_id = $1") && /SELECT record/.test(sql)) {
      result.rows = result.rows.filter(
        (row: any) => row.record.batchId === values[0],
      );
    }
    if (sql.includes("WHERE statement_id = $1") && /SELECT record/.test(sql)) {
      result.rows = result.rows.filter(
        (row: any) => row.record.statementId === values[0],
      );
    }
    if (sql.includes("pg_advisory_lock(") && failNextLockAck) {
      failNextLockAck = false;
      throw new Error("SIM session lock ACK lost");
    }
    if (sql.includes("pg_advisory_unlock(") && failNextUnlockAck) {
      failNextUnlockAck = false;
      throw new Error("SIM session unlock ACK lost");
    }
    return result;
  }

  async function replica(name: string) {
    // Each actual DatabaseService has its own pool capped at one checkout.
    // All pools point at the same controlled committed SQL rows/session locks.
    const state = {
      replica: name,
      active: 0,
      maximum: 0,
      checkouts: 0,
      releases: [] as boolean[],
    };
    pools.push(state);
    const waiting: Array<() => void> = [];
    const pool = {
      query: (sql: string, values: readonly unknown[] = []) =>
        query(sql, values, name, null, null, () => socket.query(sql, values)),
      connect: async () => {
        if (state.active)
          await new Promise<void>((resolve) => waiting.push(resolve));
        state.active += 1;
        state.maximum = Math.max(state.maximum, state.active);
        state.checkouts += 1;
        const raw = await socket.connect();
        const client = ++serial;
        let pending: Map<string, any> | null = null;
        let released = false;
        return {
          query: async (sql: string, values: readonly unknown[] = []) => {
            if (sql === "BEGIN") {
              if (pending) throw new Error("SIM unexpected nested BEGIN");
              pending = new Map();
              events.push(`BEGIN:${client}`);
            }
            const result = await query(sql, values, name, client, pending, () =>
              raw.query(sql, values),
            );
            if (sql === "COMMIT") {
              for (const [key, row] of pending ?? [])
                receipts.set(key, structuredClone(row));
              pending = null;
              events.push(`COMMIT:${client}:receipts=${receipts.size}`);
            }
            if (sql === "ROLLBACK") {
              pending = null;
              events.push(`ROLLBACK:${client}`);
            }
            return result;
          },
          release: (error?: Error) => {
            if (released) throw new Error("SIM client released twice");
            released = true;
            pending = null;
            raw.release(error);
            state.active -= 1;
            state.releases.push(Boolean(error));
            waiting.shift()?.();
          },
        };
      },
      end: async () => undefined,
    };
    const database = new DatabaseService(
      pool as unknown as NonNullable<
        ConstructorParameters<typeof DatabaseService>[0]
      >,
    );
    const repository = new BillingSettlementRepository(database);
    const audit = new AuditNotificationService();
    const proofService = new RemittanceProofService(
      repository,
      proofStorage,
      scanner,
    );
    const service = new BillingSettlementService(
      audit,
      repository,
      undefined,
      undefined,
      artifactStore,
      proofService,
    );
    await service.onModuleInit();
    return {
      service,
      controller: new BillingSettlementController(service),
      repository,
      database,
      audit,
      proofService,
      pool: state,
    };
  }
  function addTrip(driverId: string, suffix: string) {
    socket.liveRows.push({
      order_record: {
        orderId: `SIM-order-${suffix}`,
        tenantId: "SIM-command-tenant",
        orderSource: "api",
        serviceBucket: "business_dispatch",
        businessDispatchSubtype: "credit_card_airport_transfer",
        serviceProductCode: "credit_card_airport_transfer",
        costCenter: null,
        passenger: null,
        partnerId: "SIM-command-partner",
        partnerProgramId: null,
        partnerEntrySlug: null,
        eligibilityVerificationId: null,
        issuerAuthorizationRef: "SIM-command-issuer-ref",
        benefitReference: "SIM-command-benefit-ref",
      },
      task_record: {
        taskId: `SIM-task-${suffix}`,
        orderId: `SIM-order-${suffix}`,
        driverId,
        status: "completed",
        completedAt: "2026-07-15T12:00:00.000Z",
        fare: { currency: "TWD", amountMinor: 12345 },
      },
    });
  }
  return {
    socket,
    calls,
    events,
    pools,
    proofs,
    receipts,
    artifactStore,
    scanner,
    replica,
    addTrip,
    rejectNextBatchWrite: () => {
      failNextBatchWrite = true;
    },
    loseNextLockAck: () => {
      failNextLockAck = true;
    },
    loseNextUnlockAck: () => {
      failNextUnlockAck = true;
    },
  };
}
