import { EventEmitter2 } from "../../../apps/api/node_modules/@nestjs/event-emitter";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OwnedOrderRecord } from "@drts/contracts";
import { createTenantClient } from "../../../packages/api-client/src/index";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import type { BootstrapRequestIdentity } from "../../../apps/api/src/common/auth/auth.types";
import type { DatabaseService } from "../../../apps/api/src/common/db/database.service";
import { IdempotencyRepository } from "../../../apps/api/src/common/idempotency/idempotency.repository";
import { IdempotencyService } from "../../../apps/api/src/common/idempotency/idempotency.service";
import { OpsDispatchEventsService } from "../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../apps/api/src/modules/callcenter/callcenter.service";
import { DriverProfileService } from "../../../apps/api/src/modules/driver-profile/driver-profile.service";
import { OwnedMobilityController } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityTaskEventsService } from "../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { RegulatoryRegistryService } from "../../../apps/api/src/modules/regulatory-registry/regulatory-registry.service";

const TENANT = "tenant-detail-sim";
const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "tenant_admin",
  actorId: "employee-sim",
  realm: "tenant",
  tenantId: TENANT,
  roleFamilies: ["tenant"],
  roles: ["tc_admin"],
  scopes: ["tenant:read"],
  requestId: "detail-read-sim",
};

// Only SQL storage and fetch routing are SIM. No Service/Repository/Controller
// methods are mocked. SQL is executed by the original repository; these narrow
// in-memory responses do not establish PostgreSQL isolation or hosted routing.
class SqlTransport {
  orders = new Map<string, OwnedOrderRecord>();
  calls: Array<{ sql: string; values: readonly unknown[] }> = [];
  failDetail = false;

  isEnabled() {
    return true;
  }

  async query(raw: string, values: readonly unknown[] = []) {
    const sql = raw.replace(/\s+/g, " ").trim();
    this.calls.push({ sql, values: structuredClone(values) });
    if (sql.startsWith("INSERT INTO ops.phase1_owned_orders")) {
      const order = JSON.parse(String(values[14])) as OwnedOrderRecord;
      this.orders.set(order.orderId, structuredClone(order));
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("FROM ops.phase1_owned_orders")) {
      let rows = [...this.orders.values()];
      if (sql.includes("WHERE booking_id = $1")) {
        if (this.failDetail)
          throw new ApiRequestError(
            503,
            "SIM_CANONICAL_READ_FAILED",
            "Controlled SQL read failure",
          );
        rows = rows.filter(
          (row) => row.bookingId === values[0] && row.tenantId === values[1],
        );
      } else if (sql.includes("WHERE tenant_id = $1")) {
        rows = rows.filter(
          (row) => row.tenantId === values[0] && row.bookingId !== null,
        );
        const textParameter = sql.match(/ILIKE \$(\d+)/)?.[1];
        if (textParameter) {
          const text = String(values[Number(textParameter) - 1])
            .slice(1, -1)
            .toLowerCase();
          rows = rows.filter((row) =>
            [
              row.passenger?.name,
              row.passenger?.phone,
              row.passenger?.passengerId,
              row.bookingId,
              row.orderId,
              row.costCenter,
            ].some((value) => value?.toLowerCase().includes(text)),
          );
        }
        if (sql.includes("status NOT IN ('cancelled', 'completed')"))
          rows = rows.filter(
            (row) => !["cancelled", "completed"].includes(row.status),
          );
        for (const [operator, predicate] of [
          [">=", (a: number, z: number) => a >= z],
          ["<", (a: number, z: number) => a < z],
        ] as const) {
          const parameter = sql.match(
            new RegExp(`::timestamptz ${operator} \\$(\\d+)::timestamptz`),
          )?.[1];
          if (parameter)
            rows = rows.filter((row) =>
              predicate(
                Date.parse(row.reservationWindowStart ?? ""),
                Date.parse(String(values[Number(parameter) - 1])),
              ),
            );
        }
        if (sql.startsWith("SELECT COUNT(*)"))
          return { rows: [{ total: rows.length }], rowCount: 1 };
        rows.sort(
          (a, z) =>
            Date.parse(z.reservationWindowStart ?? "") -
              Date.parse(a.reservationWindowStart ?? "") ||
            String(a.bookingId).localeCompare(String(z.bookingId)),
        );
        const limit = Number(values.at(-2));
        const offset = Number(values.at(-1));
        rows = rows.slice(offset, offset + limit);
      }
      return {
        rows: rows.map((record) => ({ record: structuredClone(record) })),
        rowCount: rows.length,
      };
    }
    if (
      /^SELECT record FROM ops\.phase1_/.test(sql) ||
      sql.includes("FROM ops.passenger_dispatch_disclosure_snapshots") ||
      sql.includes("FROM ops.consumer_notification_outbox")
    )
      return { rows: [], rowCount: 0 }; // Other original module-init tables.
    throw new Error("Unexpected SQL SIM boundary: " + sql);
  }
}

function replica(repository?: OwnedMobilityRepository) {
  const audit = new AuditNotificationService();
  const ops = new OpsDispatchEventsService(new EventEmitter2());
  const registry = new RegulatoryRegistryService(
    ops,
    audit,
    new DriverProfileService(audit),
  );
  const service = new OwnedMobilityService(
    registry,
    audit,
    new CallcenterService(audit),
    new OwnedMobilityTaskEventsService(new EventEmitter2()),
    ops,
    repository,
  );
  const controller = new OwnedMobilityController(
    service,
    new IdempotencyService(new IdempotencyRepository()),
  );
  return { service, controller };
}

async function produce(
  writer: ReturnType<typeof replica>,
  name = "Delegate passenger",
  tenantId = TENANT,
) {
  const created = await writer.service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: "2099-06-05T10:00:00.000Z",
      reservationWindowEnd: "2099-06-05T11:00:00.000Z",
      pickup: { address: "Original pickup" },
      dropoff: { address: "Original dropoff" },
      passenger: { name, phone: "0900000000" },
    },
    tenantId,
  );
  return writer.service.getOrder(created.orderId);
}

function clientFor(reader: ReturnType<typeof replica>) {
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      paths.push(url.pathname + url.search);
      const headers = new Headers(init?.headers);
      const tenant = headers.get("x-tenant-id") ?? undefined;
      try {
        if (init?.method !== "GET")
          throw new Error("Unexpected mutation in read-only SIM routing");
        if (url.pathname === "/api/tenant/bookings") {
          return Response.json(
            await reader.controller.listTenantBookings(
              Object.fromEntries(url.searchParams),
              identity,
              tenant,
              "detail-read-sim",
            ),
          );
        }
        const match = url.pathname.match(/^\/api\/tenant\/bookings\/([^/]+)$/);
        if (!match) throw new Error("Unexpected SIM fetch path");
        return Response.json(
          await reader.controller.getTenantBooking(
            decodeURIComponent(match[1]!),
            tenant,
            "detail-read-sim",
          ),
        );
      } catch (error) {
        if (!(error instanceof ApiRequestError)) throw error;
        return Response.json(error.getResponse(), {
          status: error.getStatus(),
        });
      }
    },
  );
  return {
    client: createTenantClient(
      "https://tenant-detail.invalid",
      TENANT,
      "employee-sim",
    ),
    paths,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("normal enterprise list opens the same canonical booking detail", () => {
  it("opens a newly persisted booking on a warm replica after filtered page2", async () => {
    const sql = new SqlTransport();
    const repository = new OwnedMobilityRepository(
      sql as unknown as DatabaseService,
    );
    const reader = replica(repository);
    await reader.service.onModuleInit(); // Warm before the writer creates rows.
    const writer = replica();
    const first = await produce(writer);
    const second = await produce(writer);
    const foreign = await produce(writer, "Delegate foreign", "other-tenant");
    await repository.persistChanges({ orders: [first, second, foreign] });
    const h = clientFor(reader);
    const query = {
      passenger: "Delegate",
      status: "active",
      dateFrom: "2099-06-05T00:00:00.000Z",
      dateTo: "2099-06-06T00:00:00.000Z",
      page: 2,
      pageSize: 1,
    } as const;
    const page = await h.client.queryTenantBookings(query);
    expect(page.pagination).toEqual({
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });
    expect(page.items).toHaveLength(1);
    const selected = page.items[0]!;
    const expected = [first, second].sort((a, z) =>
      String(a.bookingId).localeCompare(String(z.bookingId)),
    )[1]!;
    expect(selected.bookingId).toBe(expected.bookingId);
    expect(await h.client.getTenantBooking(selected.bookingId)).toEqual(
      selected,
    );
    expect(h.paths[0]).toContain("page=2&pageSize=1");
    expect(h.paths[1]).toBe(
      `/api/tenant/bookings/${encodeURIComponent(selected.bookingId)}`,
    );
    expect(sql.calls.at(-1)?.values).toEqual([selected.bookingId, TENANT]);
  });

  it("replaces a warm stale snapshot and retains the existing missing-row fallback", async () => {
    const sql = new SqlTransport();
    const repository = new OwnedMobilityRepository(
      sql as unknown as DatabaseService,
    );
    const writer = replica();
    const original = await produce(writer, "Before change");
    await repository.persistChanges({ orders: [original] });
    const reader = replica(repository);
    await reader.service.onModuleInit();
    expect(
      reader.service.getTenantBooking(TENANT, original.bookingId!).passenger
        .name,
    ).toBe("Before change");
    await writer.service.updateTenantBooking(TENANT, original.bookingId!, {
      passenger: { name: "After change", phone: "0900000001" },
    });
    await repository.persistChanges({
      orders: [writer.service.getOrder(original.orderId)],
    });
    const h = clientFor(reader);
    const page = await h.client.queryTenantBookings({
      passenger: "After change",
    });
    expect(page.items).toHaveLength(1);
    const current = page.items[0]!;
    expect(current.passenger.name).toBe("After change");
    expect(await h.client.getTenantBooking(current.bookingId)).toEqual(current);
    // Preserve the original resolver contract; this change is not a tombstone
    // policy. A real null lookup falls back to the already hydrated local row.
    sql.orders.clear();
    expect(await h.client.getTenantBooking(current.bookingId)).toEqual(current);
  });

  it("keeps genuine missing and same-ID other-tenant records as BOOKING_NOT_FOUND", async () => {
    const sql = new SqlTransport();
    const repository = new OwnedMobilityRepository(
      sql as unknown as DatabaseService,
    );
    const reader = replica(repository);
    await reader.service.onModuleInit();
    const foreign = await produce(replica(), "Foreign", "other-tenant");
    await repository.persistChanges({ orders: [foreign] });
    const h = clientFor(reader);
    await expect(
      h.client.getTenantBooking(foreign.bookingId!),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "BOOKING_NOT_FOUND",
    });
    await expect(
      h.client.getTenantBooking("genuinely-missing"),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "BOOKING_NOT_FOUND",
    });
    expect((await h.client.queryTenantBookings()).items).toEqual([]);
  });

  it("propagates the existing canonical resolver read error instead of stale success", async () => {
    const sql = new SqlTransport();
    const repository = new OwnedMobilityRepository(
      sql as unknown as DatabaseService,
    );
    const order = await produce(replica());
    await repository.persistChanges({ orders: [order] });
    const reader = replica(repository);
    await reader.service.onModuleInit();
    const h = clientFor(reader);
    expect(
      reader.service.getTenantBooking(TENANT, order.bookingId!),
    ).toMatchObject({
      orderId: order.orderId,
    });
    sql.failDetail = true;
    await expect(
      h.client.getTenantBooking(order.bookingId!),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "SIM_CANONICAL_READ_FAILED",
    });
    sql.failDetail = false;
    expect(await h.client.getTenantBooking(order.bookingId!)).toMatchObject({
      orderId: order.orderId,
      bookingId: order.bookingId,
    });
  });

  it("keeps original local booking reads and missing behavior without a database", async () => {
    const reader = replica(new OwnedMobilityRepository());
    await reader.service.onModuleInit();
    const order = await produce(reader);
    const expected = reader.service.getTenantBooking(TENANT, order.bookingId!);
    const h = clientFor(reader);
    expect(await h.client.getTenantBooking(order.bookingId!)).toEqual(expected);
    expect((await h.client.queryTenantBookings()).items).toEqual([expected]);
    await expect(
      h.client.getTenantBooking("missing-no-db"),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "BOOKING_NOT_FOUND",
    });
  });
});
