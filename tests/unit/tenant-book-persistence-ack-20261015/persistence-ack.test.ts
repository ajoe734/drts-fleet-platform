import { afterEach, describe, expect, it, vi } from "vitest";

import type { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import { IdempotencyService } from "../../../apps/api/src/common/idempotency";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

const tenantId = "tenant-book-ack";
const services: TenantPartnerService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.onModuleDestroy();
  vi.restoreAllMocks();
});

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

// Only the SQL transport is simulated. Service, controller envelopes, SQL write
// selection, Promise.all propagation and repository loadState are production code.
function fixture() {
  let nextWrite: ReturnType<typeof deferred> | undefined;
  const rows = new Map<string, Map<string, unknown>>();
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    if (sql.includes("INSERT INTO")) {
      const table = /INSERT INTO\s+(\S+)/.exec(sql)![1];
      const record = JSON.parse(String(values![5])) as Record<string, unknown>;
      const gate = nextWrite;
      nextWrite = undefined;
      if (gate) await gate.promise;
      const key = String(record.passengerId ?? record.addressId ?? `${record.tenantId}:${record.code}`);
      const tableRows = rows.get(table) ?? new Map<string, unknown>();
      tableRows.set(key, record);
      rows.set(table, tableRows);
    }
    const table = /FROM\s+(\S+)/.exec(sql)?.[1];
    return { rows: table ? [...(rows.get(table)?.values() ?? [])].map((record) => ({ record })) : [], rowCount: 1 };
  });
  const repository = new TenantPartnerRepository({ isEnabled: () => true, query } as unknown as DatabaseService);
  vi.spyOn(repository, "reportPersistenceFailure").mockImplementation(() => {});
  const audit = new AuditNotificationService();
  const service = new TenantPartnerService(audit, repository);
  services.push(service);
  const controller = new TenantPartnerController(service, new BillingSettlementService(audit), {} as OwnedMobilityService, {} as JwtAuthService, {} as IdempotencyService);
  return { service, controller, repository, audit, query, delay() { nextWrite = deferred(); return nextWrite; } };
}

const cases = [
  {
    name: "passenger", bucket: "passengers" as const,
    seed: (s: TenantPartnerService) => s.upsertPassenger(tenantId, { passengerId: "ack-passenger", fullName: "Original passenger" }),
    mutate: (c: TenantPartnerController, id = "ack-passenger") => c.upsertPassenger({ passengerId: id, fullName: "Changed passenger" }, tenantId, "req-ack"),
    read: (s: TenantPartnerService) => s.listPassengers(tenantId),
    changed: { passengerId: "ack-passenger", fullName: "Changed passenger" },
  },
  {
    name: "address", bucket: "addresses" as const,
    seed: (s: TenantPartnerService) => s.upsertAddress(tenantId, { addressId: "ack-address", addressName: "Original address", addressText: "Original Street 10" }),
    mutate: (c: TenantPartnerController, id = "ack-address") => c.upsertAddress({ addressId: id, addressName: "Changed address", addressText: "Changed Street 20" }, tenantId, "req-ack"),
    read: (s: TenantPartnerService) => s.listAddresses(tenantId),
    changed: { addressId: "ack-address", addressName: "Changed address" },
  },
  {
    name: "cost center", bucket: "costCenters" as const,
    seed: (s: TenantPartnerService) => s.upsertCostCenter(tenantId, { code: "ACK", name: "Original center" }),
    mutate: (c: TenantPartnerController, id = "ACK") => c.upsertCostCenter({ code: id, name: "Changed center" }, tenantId, "req-ack"),
    read: (s: TenantPartnerService) => s.listCostCenters(tenantId),
    changed: { code: "ACK", name: "Changed center" },
  },
  {
    name: "disable cost center", bucket: "costCenters" as const,
    seed: (s: TenantPartnerService) => s.upsertCostCenter(tenantId, { code: "ACK", name: "Original center" }),
    mutate: (c: TenantPartnerController) => c.disableCostCenter({ code: "ACK", reason: "retired" }, tenantId, "req-ack"),
    read: (s: TenantPartnerService) => s.listCostCenters(tenantId),
    changed: { code: "ACK", activeFlag: false, disabledReason: "retired" },
  },
];

describe("tenant book canonical persistence acknowledgement", () => {
  for (const operation of cases) {
    it(`${operation.name}: controller stays pending, publishes and envelopes only after write`, async () => {
      const f = fixture();
      await operation.seed(f.service);
      const before = operation.read(f.service);
      const auditBefore = f.audit.listAuditLogs();
      const gate = f.delay();
      let settled = false;
      const result = Promise.resolve(operation.mutate(f.controller)).finally(() => { settled = true; });
      await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(2));
      await new Promise<void>((resolve) => setImmediate(resolve));
      const pending = !settled;
      const whilePending = operation.read(f.service);
      const pendingAudit = f.audit.listAuditLogs();
      gate.resolve();
      const envelope = await result;
      expect(pending).toBe(true);
      expect(whilePending).toEqual(before);
      expect(pendingAudit).toEqual(auditBefore);
      expect(envelope).toMatchObject({ data: operation.changed, meta: { requestId: "req-ack" } });
      expect(envelope.data).not.toBeInstanceOf(Promise);
      expect(operation.read(f.service)).toEqual([envelope.data]);
      const persisted = await f.repository.loadState();
      expect(persisted[operation.bucket]).toEqual([envelope.data]);
    });

    it(`${operation.name}: rejected update preserves old data and unrelated successful writes`, async () => {
      const f = fixture();
      await operation.seed(f.service);
      const before = operation.read(f.service);
      const gate = f.delay();
      const rejected = expect(Promise.resolve(operation.mutate(f.controller))).rejects.toThrow("SQL refused");
      await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(2));
      const unrelated = await f.service.upsertPassenger(tenantId, { passengerId: "unrelated", fullName: "Unrelated committed user" });
      gate.reject(new Error("SQL refused"));
      await rejected;
      expect(operation.read(f.service).filter((record) => !("passengerId" in record && record.passengerId === "unrelated"))).toEqual(before);
      expect(f.service.getPassengerMasterRecord(tenantId, "unrelated")).toEqual(unrelated);
      expect((await f.repository.loadState())[operation.bucket]).toEqual(expect.arrayContaining(before));
      expect(f.repository.reportPersistenceFailure).toHaveBeenCalledWith(expect.any(Error), expect.any(String));
      const success = await operation.mutate(f.controller);
      expect(success.data).toMatchObject(operation.changed);
    });
  }

  for (const operation of cases.slice(0, 3)) {
    it(`${operation.name}: rejected create never enters local or persisted readback`, async () => {
      const f = fixture();
      const before = operation.read(f.service);
      const gate = f.delay();
      const rejected = expect(Promise.resolve(operation.mutate(f.controller, "new-record"))).rejects.toThrow("SQL refused");
      await vi.waitFor(() => expect(f.query).toHaveBeenCalledTimes(1));
      gate.reject(new Error("SQL refused"));
      await rejected;
      expect(operation.read(f.service)).toEqual(before);
      expect((await f.repository.loadState())[operation.bucket]).toEqual([]);
      expect(f.audit.listAuditLogs()).toEqual([]);
    });
  }
});
