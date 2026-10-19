import { expect, vi } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.controller";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { BillingSettlementRepository } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.repository";
import { InMemoryDocumentArtifactStore } from "../../../apps/api/src/common/document-artifacts";
import type { DatabaseService } from "../../../apps/api/src/common/db";

// Only the database socket is doubled. Real Controller, idempotency command,
// Billing service/repository SQL, artifact renderer/store and audit run below.
export function databaseSocket() {
  const tables = new Map<string, Map<string, Record<string, unknown>>>();
  const locks = new Map<string, Promise<void>>();
  const clientCalls: Array<{
    clientId: number;
    sql: string;
    values: readonly unknown[];
  }> = [];
  const releasedSessions: number[] = [];
  let clientNumber = 0;
  const liveRows: Array<{
    order_record: Record<string, unknown>;
    task_record: Record<string, unknown>;
  }> = [];
  let lostAckScope: string | null = null;
  let sourceRejected = false;
  let lostAckTable: string | null = null;
  let rejectedDriver: string | null = null;
  let rejectedTable: string | null = null;
  let rejectionError: Error | null = null;
  let holdStatement: (() => Promise<void>) | null = null;
  const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
    const insertion = /INSERT INTO\s+([\w.]+)/i.exec(sql)?.[1];
    if (insertion === "ops.idempotency_records") {
      const table =
        tables.get(insertion) ?? new Map<string, Record<string, unknown>>();
      tables.set(insertion, table);
      const key = JSON.stringify(values.slice(0, 2));
      if (table.has(key)) return { rows: [], rowCount: 0 };
      const body = values[3]
        ? (JSON.parse(String(values[3])) as unknown)
        : { claimed: true };
      const row = {
        record_id: key,
        scope: values[0],
        idempotency_key: values[1],
        payload_hash: values[2],
        response_body: body,
      };
      table.set(key, row);
      if (values[0] === lostAckScope) {
        lostAckScope = null;
        throw new Error("SIM idempotency INSERT committed ACK lost");
      }
      return {
        rows: sql.includes("RETURNING") ? [structuredClone(row)] : [],
        rowCount: 1,
      };
    }
    if (insertion) {
      if (insertion === "billing.phase1_driver_statements" && holdStatement)
        await holdStatement();
      if (
        insertion === rejectedTable &&
        (!rejectedDriver || values[1] === rejectedDriver)
      )
        throw rejectionError ?? new Error(`SIM database rejected ${insertion}`);
      const table =
        tables.get(insertion) ?? new Map<string, Record<string, unknown>>();
      tables.set(insertion, table);
      const encoded = [...values]
        .reverse()
        .find((v) => typeof v === "string" && v.startsWith("{"));
      const record =
        typeof encoded === "string"
          ? (JSON.parse(encoded) as Record<string, unknown>)
          : {};
      table.set(String(values[0]), structuredClone(record));
      if (insertion === lostAckTable) {
        lostAckTable = null;
        throw new Error(`SIM committed ACK lost ${insertion}`);
      }
      return { rows: [], rowCount: 1 };
    }
    const selected = /FROM\s+([\w.]+)/i.exec(sql)?.[1];
    if (selected === "ops.phase1_driver_tasks") {
      if (sourceRejected)
        throw new Error("SIM canonical trip source unavailable");
      const driverFiltered = values.length === 3;
      const start = String(values[driverFiltered ? 1 : 0]),
        end = String(values[driverFiltered ? 2 : 1]);
      expect(sql).toContain("INNER JOIN ops.phase1_owned_orders");
      expect(sql).toContain("tasks.status = 'completed'");
      expect(sql).toContain("= 'business_dispatch'");
      return {
        rows: liveRows
          .filter(
            (row) =>
              row.task_record.status === "completed" &&
              row.order_record.serviceBucket === "business_dispatch" &&
              String(row.task_record.completedAt) >= start &&
              String(row.task_record.completedAt) <= end &&
              (!driverFiltered || row.task_record.driverId === values[0]),
          )
          .map((row) => structuredClone(row)),
        rowCount: 0,
      };
    }
    if (selected === "ops.idempotency_records") {
      const row = tables.get(selected)?.get(JSON.stringify(values.slice(0, 2)));
      return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
    }
    let records = [...(tables.get(selected ?? "")?.values() ?? [])];
    if (sql.includes("WHERE period_month = $1 AND driver_id = $2"))
      records = records.filter(
        (row) =>
          row.periodMonth === values[0] &&
          row.driverId === values[1] &&
          (values[2] === undefined || row.feePlanVersion === values[2]),
      );
    return {
      rows: records.map((record) => ({ record: structuredClone(record) })),
      rowCount: records.length,
    };
  });
  const connect = async () => {
    const clientId = ++clientNumber;
    let unlock: (() => void) | undefined;
    let heldKey: string | undefined;
    return {
      query: async (sql: string, values: readonly unknown[] = []) => {
        clientCalls.push({ clientId, sql, values });
        if (sql.includes("pg_advisory_lock(")) {
          const key = String(values[0]),
            prior = locks.get(key) ?? Promise.resolve();
          let release!: () => void;
          const gate = new Promise<void>((resolve) => {
            release = resolve;
          });
          const next = prior.then(() => gate);
          locks.set(key, next);
          await prior;
          heldKey = key;
          unlock = () => {
            release();
            if (locks.get(key) === next) locks.delete(key);
          };
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes("pg_advisory_unlock(")) {
          expect(String(values[0])).toBe(heldKey);
          unlock?.();
          unlock = undefined;
          return { rows: [], rowCount: 1 };
        }
        return query(sql, values);
      },
      release: () => {
        releasedSessions.push(clientId);
        unlock?.();
      },
    };
  };
  return {
    query,
    connect,
    tables,
    liveRows,
    clientCalls,
    releasedSessions,
    loseScopeAck: (scope: string) => {
      lostAckScope = scope;
    },
    failSource: (value: boolean) => {
      sourceRejected = value;
    },
    loseAck: (table: string) => {
      lostAckTable = table;
    },
    rejectDriver: (driverId: string | null) => {
      rejectedDriver = driverId;
    },
    reject: (table: string | null, error: Error | null = null) => {
      rejectedTable = table;
      rejectionError = error;
    },
    hold: (fn: (() => Promise<void>) | null) => {
      holdStatement = fn;
    },
  };
}

export async function setup(
  socket?: ReturnType<typeof databaseSocket>,
  store = new InMemoryDocumentArtifactStore(),
) {
  const audit = new AuditNotificationService();
  const repository = socket
    ? new BillingSettlementRepository({
        isEnabled: () => true,
        query: socket.query,
        connect: socket.connect,
      } as unknown as DatabaseService)
    : undefined;
  const service = new BillingSettlementService(
    audit,
    repository,
    undefined,
    undefined,
    store,
  );
  if (socket) await service.onModuleInit();
  const controller = new BillingSettlementController(service);
  const notifications = vi.spyOn(audit, "recordNotification");
  const logs = vi.spyOn(audit, "recordAuditLog");
  return { service, controller, repository, store, notifications, logs };
}
export async function publish(service: BillingSettlementService) {
  await service.publishDriverFeePlan({
    planName: "Original C089 fee",
    version: "c089-v1",
    serviceFeeBps: 1200,
    reimbursementMode: "platform_funded",
  });
}

/** Compatibility for existing source-ingestion fixtures: their original port
 * observations remain, while target reservation/locking/readback executes the
 * actual production repository against the database socket double. */
export function canonicalTargetPersistence(
  observer: BillingSettlementRepository["persistChanges"],
) {
  const socket = databaseSocket();
  const repository = new BillingSettlementRepository({
    isEnabled: () => true,
    query: socket.query,
    connect: socket.connect,
  } as unknown as DatabaseService);
  const persist = repository.persistChanges.bind(repository);
  repository.persistChanges = async (changes, executor) => {
    await observer(changes);
    await persist(changes, executor);
  };
  return repository.withDriverStatementTarget.bind(repository);
}
