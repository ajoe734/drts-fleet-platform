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
  type RecordRow = Record<string, unknown>;
  type Tables = Map<string, Map<string, RecordRow>>;
  type Transaction = { pending: Tables | null };
  let nextWrite: ReturnType<typeof deferred> | undefined;
  const rows: Tables = new Map();
  // Canonical reads precede writes; observe the actual INSERT entry separately.
  const writeQuery = vi.fn();
  const query = vi.fn(
    async (
      sql: string,
      values?: readonly unknown[],
      transaction?: Transaction,
    ) => {
      const result = (
        records: RecordRow[] = [],
        rowCount = records.length,
      ) => ({
        rows: structuredClone(records),
        rowCount,
      });
      if (sql.trim() === "BEGIN") {
        if (!transaction || transaction.pending)
          throw new Error("Unexpected SQL transaction start");
        transaction.pending = new Map();
        return result();
      }
      if (sql.trim() === "COMMIT") {
        if (!transaction?.pending)
          throw new Error("Unexpected SQL transaction commit");
        // Commit only this client's staged rows. A sibling client's successful
        // write must survive both this commit and a later rollback.
        for (const [table, staged] of transaction.pending) {
          const committed = rows.get(table) ?? new Map<string, RecordRow>();
          for (const [key, record] of staged)
            committed.set(key, structuredClone(record));
          rows.set(table, committed);
        }
        transaction.pending = null;
        return result();
      }
      if (sql.trim() === "ROLLBACK") {
        if (!transaction) throw new Error("Unexpected SQL rollback");
        transaction.pending = null;
        return result();
      }
      if (sql.includes("INSERT INTO")) {
        writeQuery(sql, values);
        const table = /INSERT INTO\s+(\S+)/.exec(sql)?.[1];
        if (!table) throw new Error("Unexpected SQL insert");
        const record = JSON.parse(String(values![5])) as RecordRow;
        const gate = nextWrite;
        nextWrite = undefined;
        if (gate) await gate.promise;
        const key = String(
          record.passengerId ??
            record.addressId ??
            String(record.tenantId) + ":" + String(record.code),
        );
        const current =
          transaction?.pending?.get(table)?.get(key) ??
          rows.get(table)?.get(key);
        // Model only the real SQL's conditional conflict update. A rejected
        // foreign owner returns zero rows, never a fabricated successful ACK.
        if (
          current &&
          /WHERE\s+tenant_(?:passenger|address)\.tenant_id\s*=\s*EXCLUDED\.tenant_id/i.test(
            sql,
          ) &&
          current.tenantId !== record.tenantId
        )
          return result();
        const target = transaction?.pending ?? rows;
        const tableRows = target.get(table) ?? new Map<string, RecordRow>();
        tableRows.set(key, structuredClone(record));
        target.set(table, tableRows);
        return result(
          /RETURNING passenger_id\b/i.test(sql)
            ? [{ passenger_id: record.passengerId }]
            : /RETURNING address_id\b/i.test(sql)
              ? [{ address_id: record.addressId }]
              : [],
          1,
        );
      }
      const table = /FROM\s+(\S+)/.exec(sql)?.[1];
      const committed = table ? rows.get(table) : undefined;
      const staged = table ? transaction?.pending?.get(table) : undefined;
      const visible = new Map([...(committed ?? []), ...(staged ?? [])]);
      const tenantParameter = /\btenant_id\s*=\s*\$(\d+)/.exec(sql);
      return result(
        [...visible.values()]
          .filter(
            (record) =>
              !tenantParameter ||
              record.tenantId === values?.[Number(tenantParameter[1]) - 1],
          )
          .map((record) => ({ record })),
      );
    },
  );
  const repository = new TenantPartnerRepository({
    isEnabled: () => true,
    query,
    connect: async () => {
      const transaction: Transaction = { pending: null };
      return {
        query: (sql: string, values?: readonly unknown[]) =>
          query(sql, values, transaction),
        release() {
          if (transaction.pending)
            throw new Error("SQL transaction released before its outcome");
        },
      };
    },
  } as unknown as DatabaseService);
  vi.spyOn(repository, "reportPersistenceFailure").mockImplementation(() => {});
  const audit = new AuditNotificationService();
  const service = new TenantPartnerService(audit, repository);
  services.push(service);
  const controller = new TenantPartnerController(
    service,
    new BillingSettlementService(audit),
    {} as OwnedMobilityService,
    {} as JwtAuthService,
    {} as IdempotencyService,
  );
  return {
    service,
    controller,
    repository,
    audit,
    query,
    writeQuery,
    delay() {
      nextWrite = deferred();
      return nextWrite;
    },
  };
}

const cases = [
  {
    name: "passenger",
    bucket: "passengers" as const,
    seed: (s: TenantPartnerService) =>
      s.upsertPassenger(tenantId, {
        passengerId: "ack-passenger",
        fullName: "Original passenger",
      }),
    mutate: (c: TenantPartnerController, id = "ack-passenger") =>
      c.upsertPassenger(
        { passengerId: id, fullName: "Changed passenger" },
        tenantId,
        "req-ack",
      ),
    read: (s: TenantPartnerService) => s.listPassengers(tenantId),
    changed: { passengerId: "ack-passenger", fullName: "Changed passenger" },
  },
  {
    name: "address",
    bucket: "addresses" as const,
    seed: (s: TenantPartnerService) =>
      s.upsertAddress(tenantId, {
        addressId: "ack-address",
        addressName: "Original address",
        addressText: "Original Street 10",
      }),
    mutate: (c: TenantPartnerController, id = "ack-address") =>
      c.upsertAddress(
        {
          addressId: id,
          addressName: "Changed address",
          addressText: "Changed Street 20",
        },
        tenantId,
        "req-ack",
      ),
    read: (s: TenantPartnerService) => s.listAddresses(tenantId),
    changed: { addressId: "ack-address", addressName: "Changed address" },
  },
  {
    name: "cost center",
    bucket: "costCenters" as const,
    seed: (s: TenantPartnerService) =>
      s.upsertCostCenter(tenantId, { code: "ACK", name: "Original center" }),
    mutate: (c: TenantPartnerController, id = "ACK") =>
      c.upsertCostCenter(
        { code: id, name: "Changed center" },
        tenantId,
        "req-ack",
      ),
    read: (s: TenantPartnerService) => s.listCostCenters(tenantId),
    changed: { code: "ACK", name: "Changed center" },
  },
  {
    name: "disable cost center",
    bucket: "costCenters" as const,
    seed: (s: TenantPartnerService) =>
      s.upsertCostCenter(tenantId, { code: "ACK", name: "Original center" }),
    mutate: (c: TenantPartnerController) =>
      c.disableCostCenter(
        { code: "ACK", reason: "retired" },
        tenantId,
        "req-ack",
      ),
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
      const auditBefore = f.audit
        .listAuditLogs()
        .filter((log) => log.tenantId === tenantId);
      const gate = f.delay();
      let settled = false;
      const result = Promise.resolve(operation.mutate(f.controller)).finally(
        () => {
          settled = true;
        },
      );
      await vi.waitFor(() => expect(f.writeQuery).toHaveBeenCalledTimes(2));
      await new Promise<void>((resolve) => setImmediate(resolve));
      const pending = !settled;
      const whilePending = operation.read(f.service);
      const pendingAudit = f.audit
        .listAuditLogs()
        .filter((log) => log.tenantId === tenantId);
      gate.resolve();
      const envelope = await result;
      expect(pending).toBe(true);
      expect(whilePending).toEqual(before);
      expect(pendingAudit).toEqual(auditBefore);
      expect(envelope).toMatchObject({
        data: operation.changed,
        meta: { requestId: "req-ack" },
      });
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
      const rejected = expect(
        Promise.resolve(operation.mutate(f.controller)),
      ).rejects.toThrow("SQL refused");
      await vi.waitFor(() => expect(f.writeQuery).toHaveBeenCalledTimes(2));
      const unrelated = await f.service.upsertPassenger(tenantId, {
        passengerId: "unrelated",
        fullName: "Unrelated committed user",
      });
      gate.reject(new Error("SQL refused"));
      await rejected;
      expect(
        operation
          .read(f.service)
          .filter(
            (record) =>
              !("passengerId" in record && record.passengerId === "unrelated"),
          ),
      ).toEqual(before);
      expect(f.service.getPassengerMasterRecord(tenantId, "unrelated")).toEqual(
        unrelated,
      );
      const persisted = (await f.repository.loadState())[operation.bucket];
      for (const record of before) expect(persisted).toContainEqual(record);
      expect(f.repository.reportPersistenceFailure).toHaveBeenCalledWith(
        expect.any(Error),
        expect.any(String),
      );
      const success = await operation.mutate(f.controller);
      expect(success.data).toMatchObject(operation.changed);
    });
  }

  for (const operation of cases.slice(0, 3)) {
    it(`${operation.name}: rejected create never enters local or persisted readback`, async () => {
      const f = fixture();
      const before = operation.read(f.service);
      const gate = f.delay();
      const rejected = expect(
        Promise.resolve(operation.mutate(f.controller, "new-record")),
      ).rejects.toThrow("SQL refused");
      await vi.waitFor(() => expect(f.writeQuery).toHaveBeenCalledTimes(1));
      gate.reject(new Error("SQL refused"));
      await rejected;
      expect(operation.read(f.service)).toEqual(before);
      expect((await f.repository.loadState())[operation.bucket]).toEqual([]);
      expect(
        f.audit.listAuditLogs().filter((log) => log.tenantId === tenantId),
      ).toEqual([]);
    });
  }

  it("preserves no-DB writes, validation, and tenant ownership", async () => {
    const service = new TenantPartnerService(new AuditNotificationService());
    services.push(service);
    const passenger = await service.upsertPassenger(tenantId, {
      fullName: "Owner",
    });
    const address = await service.upsertAddress(tenantId, {
      ownerPassengerId: passenger.passengerId,
      addressName: "Office",
      addressText: "Office Street 1",
    });
    await expect(
      service.upsertPassenger("other-tenant", {
        passengerId: passenger.passengerId,
        fullName: "Hijacked",
      }),
    ).rejects.toMatchObject({ code: "PASSENGER_NOT_FOUND" });
    await expect(
      service.upsertAddress("other-tenant", {
        addressId: address.addressId,
        addressName: "Hijacked",
        addressText: "Other Street 2",
      }),
    ).rejects.toMatchObject({ code: "ADDRESS_NOT_FOUND" });
    await expect(
      service.upsertAddress("other-tenant", {
        ownerPassengerId: passenger.passengerId,
        addressName: "Bad owner",
        addressText: "Other Street 2",
      }),
    ).rejects.toMatchObject({ code: "PASSENGER_NOT_FOUND" });
    await expect(
      service.upsertCostCenter(tenantId, {
        code: "bad code!",
        name: "Invalid",
      }),
    ).rejects.toMatchObject({ code: "COST_CENTER_CODE_INVALID" });
    await expect(
      service.upsertCostCenter(tenantId, {
        code: "OWNER",
        name: "Invalid owner",
        ownerUserId: "missing-user",
      }),
    ).rejects.toThrow();
    const center = await service.upsertCostCenter(tenantId, {
      code: " ok ",
      name: "Valid center",
    });
    expect(center.code).toBe("OK");
    await service.disableCostCenter(tenantId, {
      code: "ok",
      reason: "retired",
    });
    expect(service.getCostCenter(tenantId, "ok")).toMatchObject({
      activeFlag: false,
      disabledReason: "retired",
    });
    expect(
      service.getPassengerMasterRecord(tenantId, passenger.passengerId),
    ).toEqual(passenger);
    expect(service.getAddressMasterRecord(tenantId, address.addressId)).toEqual(
      address,
    );
  });

  it("serializes a shared passenger ID so a pending create cannot bypass tenant ownership", async () => {
    const f = fixture();
    const gate = f.delay();
    const first = f.service.upsertPassenger(tenantId, {
      passengerId: "shared-id",
      fullName: "Original tenant owner",
    });
    await vi.waitFor(() => expect(f.writeQuery).toHaveBeenCalledTimes(1));
    const refused = expect(
      f.service.upsertPassenger("other-tenant", {
        passengerId: "shared-id",
        fullName: "Hijacked",
      }),
    ).rejects.toMatchObject({ code: "PASSENGER_NOT_FOUND" });
    gate.resolve();
    const committed = await first;
    await refused;
    expect(f.writeQuery).toHaveBeenCalledTimes(1);
    expect(f.service.getPassengerMasterRecord(tenantId, "shared-id")).toEqual(
      committed,
    );
    expect(f.service.listPassengers("other-tenant")).toEqual([]);
  });

  it("a failed same-record write releases the queue without overwriting later success", async () => {
    const f = fixture();
    const original = await f.service.upsertPassenger(tenantId, {
      passengerId: "ordered",
      fullName: "Original",
      metadata: { retained: "user-data" },
    });
    const gate = f.delay();
    const refused = expect(
      f.service.upsertPassenger(tenantId, {
        passengerId: "ordered",
        fullName: "Rejected",
      }),
    ).rejects.toThrow("SQL refused");
    await vi.waitFor(() => expect(f.writeQuery).toHaveBeenCalledTimes(2));
    const later = f.service.upsertPassenger(tenantId, {
      passengerId: "ordered",
      fullName: "Later success",
    });
    expect(f.service.getPassengerMasterRecord(tenantId, "ordered")).toEqual(
      original,
    );
    gate.reject(new Error("SQL refused"));
    await refused;
    const result = await later;
    expect(result).toMatchObject({
      fullName: "Later success",
      metadata: { retained: "user-data" },
    });
    expect(f.service.getPassengerMasterRecord(tenantId, "ordered")).toEqual(
      result,
    );
    expect((await f.repository.loadState()).passengers).toEqual([result]);
  });
});
