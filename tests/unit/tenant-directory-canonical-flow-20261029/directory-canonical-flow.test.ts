import { afterEach, describe, expect, it } from "vitest";
import { EventEmitter2 } from "../../../apps/api/node_modules/@nestjs/event-emitter";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import type { CreateTenantBookingCommand } from "@drts/contracts";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { BillingSettlementService } from "../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { JwtAuthService } from "../../../apps/api/src/common/auth/jwt-auth.service";
import {
  IdempotencyService,
  IdempotencyRepository,
} from "../../../apps/api/src/common/idempotency";

const tenantId = "tenant-c027-canonical";
const services: TenantPartnerService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.onModuleDestroy();
});

type Row = Record<string, unknown>;
/** Only the SQL transport is SIM. Actual public controllers, original repositories,
 * transaction sequencing, service validators and booking projection execute. */
class SqlTransport {
  tables = new Map<string, Row[]>();
  statements: Array<{ sql: string; values: readonly unknown[] }> = [];
  holdNextPassengerRead: { release: Promise<void> } | null = null;
  isEnabled() {
    return true;
  }
  async query(raw: string, values: readonly unknown[] = []) {
    const sql = raw.replace(/\s+/g, " ").trim();
    this.statements.push({ sql, values: structuredClone(values) });
    const result = (rows: Row[] = []) => ({
      rows: structuredClone(rows),
      rowCount: rows.length,
    });
    if (
      /^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET LOCAL)/.test(sql) ||
      sql.includes("pg_advisory")
    )
      return result();
    const table = sql.match(
      /(?:FROM|INTO|UPDATE)\s+((?:core|ops|admin|crm)\.[a-z0-9_]+)/,
    )?.[1];
    if (!table) return result();
    const rows = this.tables.get(table) ?? [];
    if (/^(INSERT INTO|UPDATE)/.test(sql)) {
      const json = values.find(
        (v) => typeof v === "string" && v.startsWith("{") && v.endsWith("}"),
      );
      if (!json) return result();
      const record = JSON.parse(String(json)) as Row;
      const key = (row: Row) =>
        String(
          row.passengerId ??
            row.addressId ??
            row.orderId ??
            row.traceLogId ??
            row.approvalRequestId ??
            [row.tenantId, row.code, row.periodKey].join(":"),
        );
      const index = rows.findIndex((row) => key(row) === key(record));
      if (
        sql.includes("aggregate_version = $15") &&
        (index < 0 || (rows[index]?.aggregateVersion ?? 1) !== values[14])
      )
        return result();
      // Model the conditional PostgreSQL conflict update only when the real
      // statement supplies that predicate. The unguarded predecessor must still
      // overwrite a foreign row so the ownership regressions remain real REDs.
      if (
        index >= 0 &&
        /WHERE\s+tenant_(?:passenger|address)\.tenant_id\s*=\s*EXCLUDED\.tenant_id/i.test(
          sql,
        ) &&
        rows[index]?.tenantId !== record.tenantId
      )
        return result();
      if (index < 0) rows.push(structuredClone(record));
      else rows[index] = structuredClone(record);
      this.tables.set(table, rows);
      return result(
        sql.includes("RETURNING aggregate_version")
          ? [{ aggregate_version: record.aggregateVersion ?? 1 }]
          : /RETURNING passenger_id\b/i.test(sql)
            ? [{ passenger_id: record.passengerId }]
            : /RETURNING address_id\b/i.test(sql)
              ? [{ address_id: record.addressId }]
              : [],
      );
    }
    const selected = rows.filter((row) =>
      Object.entries({
        tenant_id: "tenantId",
        passenger_id: "passengerId",
        address_id: "addressId",
        booking_id: "bookingId",
        order_id: "orderId",
        code: "code",
      }).every(([column, field]) => {
        const bound = sql.match(
          new RegExp("\\b" + column + "\\s*=\\s*\\$(\\d+)"),
        );
        return !bound || row[field] === values[Number(bound[1]) - 1];
      }),
    );
    if (/SELECT COUNT\(/i.test(sql))
      return result([{ count: selected.length }]);
    const response = result(
      selected.map((record) => ({
        record,
        aggregate_version: record.aggregateVersion ?? 1,
      })),
    );
    if (
      table === "core.phase1_tenant_passengers" &&
      sql.includes("WHERE tenant_id") &&
      this.holdNextPassengerRead
    ) {
      const gate = this.holdNextPassengerRead;
      this.holdNextPassengerRead = null;
      await gate.release;
    }
    return response;
  }
  async connect() {
    const snapshot = structuredClone(this.tables);
    return {
      query: async (sql: string, values: readonly unknown[] = []) => {
        if (sql.trim() === "ROLLBACK") this.tables = snapshot;
        return this.query(sql, values);
      },
      release() {},
    };
  }
}
async function replica(db: SqlTransport) {
  const audit = new AuditNotificationService();
  const tenant = new TenantPartnerService(
    audit,
    new TenantPartnerRepository(db as unknown as DatabaseService),
  );
  services.push(tenant);
  await tenant.onModuleInit(); // B really boots BEFORE A's new directory writes.
  const emitter = new EventEmitter2();
  const ops = new OpsDispatchEventsService(emitter);
  const registry = new RegulatoryRegistryService(
    ops,
    audit,
    new DriverProfileService(audit),
  );
  const ownedRepository = new OwnedMobilityRepository(
    db as unknown as DatabaseService,
  );
  const owned = new OwnedMobilityService(
    registry,
    audit,
    new CallcenterService(audit),
    new OwnedMobilityTaskEventsService(emitter),
    ops,
    ownedRepository,
    tenant,
  );
  const controller = new TenantPartnerController(
    tenant,
    new BillingSettlementService(audit),
    owned,
    new JwtAuthService(),
    new IdempotencyService(new IdempotencyRepository()),
  );
  return {
    tenant,
    controller,
    owned,
    ownedRepository,
    ownedController: new OwnedMobilityController(
      owned,
      new IdempotencyService(new IdempotencyRepository()),
      tenant,
    ),
  };
}
async function pair() {
  const db = new SqlTransport();
  const a = await replica(db);
  const b = await replica(db);
  return { db, a, b };
}
async function seed(a: Awaited<ReturnType<typeof replica>>) {
  const passenger = (
    await a.controller.upsertPassenger(
      {
        passengerId: "c027-passenger",
        fullName: "Original passenger",
        mobile: "0912345678",
        employeeNo: "E027",
        departmentName: "Original department",
      },
      tenantId,
      "p-create",
    )
  ).data;
  const address = (
    await a.controller.upsertAddress(
      {
        addressId: "c027-address",
        addressName: "Office",
        addressText: "新北市板橋區中山路一段1號",
        lat: 25.01,
        lng: 121.46,
        tags: ["office"],
      },
      tenantId,
      "a-create",
    )
  ).data;
  const costCenter = (
    await a.controller.upsertCostCenter(
      {
        code: "C027",
        name: "Original center",
        description: "Original description",
      },
      tenantId,
      "c-create",
    )
  ).data;
  return { passenger, address, costCenter };
}
function command(reference = true): CreateTenantBookingCommand {
  return {
    businessDispatchSubtype: "enterprise_dispatch",
    reservationWindowStart: new Date(Date.now() + 4 * 3600000).toISOString(),
    reservationWindowEnd: new Date(Date.now() + 5 * 3600000).toISOString(),
    pickup: { address: "Fallback pickup", lat: 25.02, lng: 121.47 },
    dropoff: { address: "Destination", lat: 25.03, lng: 121.48 },
    passenger: { name: "Fallback passenger", phone: "0911222333" },
    ...(reference
      ? {
          passengerId: "c027-passenger",
          pickupAddressId: "c027-address",
          costCenter: "C027",
        }
      : {}),
  };
}
function create(r: Awaited<ReturnType<typeof replica>>, reference = true) {
  return r.ownedController.createTenantBooking(
    command(reference),
    null,
    tenantId,
    "booking-create",
    undefined,
    "c027-create-" + reference,
  );
}

describe("C027 canonical directory normal callers across warm replicas", () => {
  it("same replica original POST/GET and booking reference positive control", async () => {
    const { a } = await pair();
    const saved = await seed(a);
    expect(
      (await a.controller.listPassengers(tenantId)).data.items,
    ).toContainEqual(saved.passenger);
    const booked = await create(a);
    expect(booked.data.bookingId).toBeTruthy();
  });
  it("A passenger POST ACK is visible in warm B normal GET", async () => {
    const { a, b } = await pair();
    const saved = await seed(a);
    expect(
      (await b.controller.listPassengers(tenantId)).data.items,
    ).toContainEqual(saved.passenger);
  });
  it("A address POST ACK is visible in warm B normal GET", async () => {
    const { a, b } = await pair();
    const saved = await seed(a);
    expect(
      (await b.controller.listAddresses(tenantId)).data.items,
    ).toContainEqual(saved.address);
    expect(
      (await b.controller.listAddressExportView(tenantId)).data.items,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          addressId: saved.address.addressId,
          maskedAddressText: saved.address.maskedAddressText,
          tags: saved.address.tags,
        }),
      ]),
    );
  });
  it("A cost-center POST ACK is visible in warm B normal filtered GET", async () => {
    const { a, b } = await pair();
    const saved = await seed(a);
    expect(
      (await b.controller.listCostCenters("true", undefined, "C027", tenantId))
        .data.items,
    ).toContainEqual(saved.costCenter);
  });
  it("warm B passenger same-ID edit preserves A optional master values", async () => {
    const { a, b } = await pair();
    await seed(a);
    const changed = await b.controller.upsertPassenger(
      { passengerId: "c027-passenger", fullName: "Edited passenger" },
      tenantId,
    );
    expect(changed.data).toMatchObject({
      passengerId: "c027-passenger",
      fullName: "Edited passenger",
      mobile: "0912345678",
      employeeNo: "E027",
      departmentName: "Original department",
    });
  });
  it("warm B address same-ID edit preserves A coordinates and tags", async () => {
    const { a, b } = await pair();
    await seed(a);
    const changed = await b.controller.upsertAddress(
      {
        addressId: "c027-address",
        addressName: "Edited office",
        addressText: "新北市板橋區中山路一段2號",
      },
      tenantId,
    );
    expect(changed.data).toMatchObject({
      addressId: "c027-address",
      lat: 25.01,
      lng: 121.46,
      tags: ["office"],
    });
  });
  it("warm B cost-center same-code edit preserves A description", async () => {
    const { a, b } = await pair();
    await seed(a);
    const changed = await b.controller.upsertCostCenter(
      { code: "C027", name: "Edited center" },
      tenantId,
    );
    expect(changed.data).toMatchObject({
      code: "C027",
      description: "Original description",
    });
  });
  it("warm B normal address POST accepts the A acknowledged owner passenger", async () => {
    const { a, b } = await pair();
    await seed(a);
    const changed = await b.controller.upsertAddress(
      {
        addressId: "c027-owned-address",
        addressName: "Owned office",
        addressText: "新北市板橋區中山路一段3號",
        ownerPassengerId: "c027-passenger",
      },
      tenantId,
    );
    expect(changed.data.ownerPassengerId).toBe("c027-passenger");
  });
  it("warm B normal booking POST resolves A exact passenger/address/cost-center", async () => {
    const { a, b } = await pair();
    await seed(a);
    const booked = await create(b);
    expect(booked.data.bookingId).toBeTruthy();
    expect(
      await b.ownedRepository.findOrderById(booked.data.orderId),
    ).toMatchObject({
      passenger: {
        passengerId: "c027-passenger",
        name: "Original passenger",
        phone: "0912345678",
      },
      pickup: {
        addressId: "c027-address",
        address: "新北市板橋區中山路一段1號",
      },
      costCenter: "C027",
    });
  });
  it("warm B normal booking update resolves A new master references on same booking", async () => {
    const { a, b } = await pair();
    const original = await create(a, false);
    await seed(a);
    const changed = await b.ownedController.updateTenantBooking(
      original.data.bookingId,
      {
        passengerId: "c027-passenger",
        pickupAddressId: "c027-address",
        costCenter: "C027",
      },
      null,
      tenantId,
      "booking-update",
    );
    expect(changed.data).toMatchObject({
      bookingId: original.data.bookingId,
      passenger: { passengerId: "c027-passenger", name: "Original passenger" },
      pickup: { addressId: "c027-address" },
      costCenter: "C027",
    });
  });
  it("inflight detached GET never replaces B's subsequently committed local master", async () => {
    const { a, b, db } = await pair();
    await seed(a);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    db.holdNextPassengerRead = { release: gate };
    const inflight = Promise.resolve(b.controller.listPassengers(tenantId));
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      await b.controller.upsertPassenger(
        { passengerId: "c027-passenger", fullName: "B committed latest" },
        tenantId,
      );
    } finally {
      release();
    }
    await inflight;
    expect(
      b.tenant.getPassengerMasterRecord(tenantId, "c027-passenger").fullName,
    ).toBe("B committed latest");
    expect(
      db.tables
        .get("core.phase1_tenant_passengers")
        ?.find((row) => row.passengerId === "c027-passenger")?.fullName,
    ).toBe("B committed latest");
  });
  it.each(["passenger", "address"] as const)(
    "warm B rejects another tenant's later-created %s ID without rebinding it",
    async (kind) => {
      const { a, b, db } = await pair();
      const saved = await seed(a);
      const before = structuredClone(db.tables);
      const foreignTenant = "tenant-c027-other";
      const attempt =
        kind === "passenger"
          ? b.controller.upsertPassenger(
              {
                passengerId: saved.passenger.passengerId,
                fullName: "Foreign edit",
              },
              foreignTenant,
            )
          : b.controller.upsertAddress(
              {
                addressId: saved.address.addressId,
                addressName: "Foreign edit",
                addressText: "Foreign address",
              },
              foreignTenant,
            );
      await expect(attempt).rejects.toMatchObject({
        status: 404,
        code:
          kind === "passenger" ? "PASSENGER_NOT_FOUND" : "ADDRESS_NOT_FOUND",
      });
      expect(db.tables).toEqual(before);
      expect(b.tenant.listPassengers(foreignTenant)).toEqual([]);
      expect(b.tenant.listAddresses(foreignTenant)).toEqual([]);
    },
  );
  it.each(["passenger", "address"] as const)(
    "a detached directory read cannot authorize rebinding a %s created before its write",
    async (kind) => {
      const { a, b, db } = await pair();
      const foreignTenant = "tenant-c027-other";
      const id = `c027-interleaved-${kind}`;
      const write = (replica: typeof a, targetTenant: string) =>
        kind === "passenger"
          ? replica.controller.upsertPassenger(
              { passengerId: id, fullName: "Interleaved passenger" },
              targetTenant,
            )
          : replica.controller.upsertAddress(
              {
                addressId: id,
                addressName: "Interleaved office",
                addressText: "Interleaved address",
              },
              targetTenant,
            );
      let release!: () => void;
      db.holdNextPassengerRead = {
        release: new Promise<void>((resolve) => {
          release = resolve;
        }),
      };
      // Attach the rejection handler before releasing the detached read so the
      // expected refusal cannot become an unhandled rejection.
      const pending = write(b, foreignTenant).then(
        () => null,
        (error: unknown) => error,
      );
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(db.holdNextPassengerRead).toBeNull();
      let committed!: Map<string, Row[]>;
      try {
        await write(a, tenantId);
        committed = structuredClone(db.tables);
      } finally {
        release();
      }
      expect(await pending).toMatchObject({
        status: 404,
        code:
          kind === "passenger" ? "PASSENGER_NOT_FOUND" : "ADDRESS_NOT_FOUND",
      });
      expect(db.tables).toEqual(committed);
      expect(b.tenant.listPassengers(foreignTenant)).toEqual([]);
      expect(b.tenant.listAddresses(foreignTenant)).toEqual([]);
    },
  );
  it("a foreign address conflict rolls back an earlier valid passenger in the same repository command", async () => {
    const { a, db } = await pair();
    const saved = await seed(a);
    const before = structuredClone(db.tables);
    const statementStart = db.statements.length;
    const repository = new TenantPartnerRepository(
      db as unknown as DatabaseService,
    );
    await expect(
      repository.persistChanges({
        passengers: [
          {
            ...saved.passenger,
            passengerId: "c027-must-rollback",
            tenantId: "tenant-c027-other",
          },
        ],
        addresses: [{ ...saved.address, tenantId: "tenant-c027-other" }],
      }),
    ).rejects.toMatchObject({
      name: "TenantMasterDirectoryOwnershipConflict",
      kind: "address",
      recordId: saved.address.addressId,
    });
    expect(db.tables).toEqual(before);
    const statements = db.statements
      .slice(statementStart)
      .map((item) => item.sql);
    expect(statements).toContain("BEGIN");
    expect(statements).toContain("ROLLBACK");
    expect(statements).not.toContain("COMMIT");
  });
});
