import { EventEmitter2 } from "../../../apps/api/node_modules/@nestjs/event-emitter";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OwnedOrderRecord } from "@drts/contracts";
import { createTenantClient } from "../../../packages/api-client/src/index";
import { EnterpriseDispatchTenantClient } from "../../../apps/enterprise-dispatch-web/lib/api-client";
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

const TENANT = "tenant-cancel-sim";
const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "tenant_admin",
  actorId: "employee-sim",
  realm: "tenant",
  tenantId: TENANT,
  roleFamilies: ["tenant"],
  roles: ["tc_admin"],
  scopes: ["tenant:read", "tenant:write"],
  requestId: "cancel-sim",
};

// Only SQL and fetch are transport ports. Every normal SDK, Controller,
// Service and Repository method is original product code. These snapshots
// model a transaction for assertions, not PostgreSQL isolation or real locks.
class SqlTransport {
  orders = new Map<string, OwnedOrderRecord>();
  calls: Array<{
    sql: string;
    values: readonly unknown[];
    transaction: boolean;
  }> = [];
  failBookingRead = false;
  isEnabled() {
    return true;
  }
  async connect() {
    let snapshot: Map<string, OwnedOrderRecord> | null = null;
    return {
      query: async (raw: string, values: readonly unknown[] = []) => {
        const sql = raw.replace(/\s+/g, " ").trim();
        this.calls.push({
          sql,
          values: structuredClone(values),
          transaction: true,
        });
        if (sql === "BEGIN") {
          snapshot = structuredClone(this.orders);
          return { rows: [], rowCount: 0 };
        }
        if (sql === "COMMIT") {
          if (snapshot) this.orders = snapshot;
          return { rows: [], rowCount: 0 };
        }
        if (sql === "ROLLBACK") {
          snapshot = null;
          return { rows: [], rowCount: 0 };
        }
        if (sql.startsWith("SET LOCAL")) return { rows: [], rowCount: 0 };
        return this.execute(sql, values, snapshot ?? this.orders);
      },
      release() {},
    };
  }
  async query(raw: string, values: readonly unknown[] = []) {
    const sql = raw.replace(/\s+/g, " ").trim();
    this.calls.push({
      sql,
      values: structuredClone(values),
      transaction: false,
    });
    return this.execute(sql, values, this.orders);
  }
  private execute(
    sql: string,
    values: readonly unknown[],
    orders: Map<string, OwnedOrderRecord>,
  ) {
    if (sql.startsWith("INSERT INTO ops.phase1_owned_orders")) {
      const order = JSON.parse(String(values[14])) as OwnedOrderRecord;
      orders.set(order.orderId, structuredClone(order));
      return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("INSERT INTO ops.phase1_dispatch_trace_logs"))
      return { rows: [], rowCount: 1 };
    if (sql.includes("FROM ops.phase1_owned_orders")) {
      let rows = [...orders.values()];
      if (sql.includes("WHERE booking_id = $1")) {
        if (this.failBookingRead)
          throw new ApiRequestError(
            503,
            "SIM_CANONICAL_READ_FAILED",
            "Controlled SQL read failure",
          );
        rows = rows.filter(
          (row) => row.bookingId === values[0] && row.tenantId === values[1],
        );
      } else if (sql.includes("WHERE order_id = $1")) {
        rows = rows.filter((row) => row.orderId === values[0]);
      } else if (sql.includes("WHERE tenant_id = $1")) {
        rows = rows.filter(
          (row) => row.tenantId === values[0] && row.bookingId !== null,
        );
        if (sql.startsWith("SELECT COUNT(*)"))
          return { rows: [{ total: rows.length }], rowCount: 1 };
        rows = rows.slice(
          Number(values.at(-1)),
          Number(values.at(-1)) + Number(values.at(-2)),
        );
      }
      return {
        rows: rows.map((record) => ({
          record: structuredClone(record),
          aggregate_version: record.aggregateVersion ?? 1,
        })),
        rowCount: rows.length,
      };
    }
    if (sql.startsWith("SELECT count(*) FROM ops.phase1_dispatch_assignments"))
      return { rows: [{ count: "0" }], rowCount: 1 };
    if (
      sql.includes("FROM mobility.phase1_order_partner_notification_routes") ||
      sql.includes("FROM ops.phase1_dispatch_assignments") ||
      sql.includes("FROM ops.phase1_dispatch_jobs")
    )
      return { rows: [], rowCount: 0 };
    if (
      /^SELECT record FROM ops\.phase1_/.test(sql) ||
      sql.includes("FROM ops.passenger_dispatch_disclosure_snapshots") ||
      sql.includes("FROM ops.consumer_notification_outbox")
    )
      return { rows: [], rowCount: 0 };
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

function repository(sql: SqlTransport) {
  return new OwnedMobilityRepository(sql as unknown as DatabaseService);
}
function clientFor(
  listReplica: ReturnType<typeof replica>,
  cancelReplica = listReplica,
) {
  const paths: string[] = [];
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      paths.push(`${init?.method ?? "GET"} ${url.pathname}`);
      const tenant = new Headers(init?.headers).get("x-tenant-id") ?? undefined;
      try {
        if (url.pathname === "/api/tenant/bookings" && init?.method === "GET")
          return Response.json(
            await listReplica.controller.listTenantBookings(
              Object.fromEntries(url.searchParams),
              identity,
              tenant,
              "cancel-sim",
            ),
          );
        const route = url.pathname.match(
          /^\/api\/tenant\/bookings\/([^/]+)\/cancel$/,
        );
        if (!route || init?.method !== "POST")
          throw new Error("Unexpected SIM fetch path");
        return Response.json(
          await cancelReplica.controller.cancelTenantBooking(
            decodeURIComponent(route[1]!),
            JSON.parse(String(init.body)),
            tenant,
            "cancel-sim",
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
    client: new EnterpriseDispatchTenantClient(
      createTenantClient(
        "https://tenant-cancel.invalid",
        TENANT,
        "employee-sim",
      ),
    ),
    paths,
  };
}
async function seed(sql: SqlTransport, tenant = TENANT) {
  // Original noDB producer plus original persistChanges prepares durable-read
  // fixture rows. This is not a real create ACK/COMMIT or hosted session proof.
  const order = await produce(replica(), "Original booking", tenant);
  await repository(sql).persistChanges({ orders: [order] });
  return order;
}
afterEach(() => vi.unstubAllGlobals());

describe("normal tenant list to same canonical booking cancellation", () => {
  it("cancels on a third warm replica without any preceding detail GET there", async () => {
    const sql = new SqlTransport();
    const list = replica(repository(sql));
    const cancel = replica(repository(sql));
    await list.service.onModuleInit();
    await cancel.service.onModuleInit();
    const order = await seed(sql);
    let cacheError: unknown;
    try {
      cancel.service.getTenantBooking(TENANT, order.bookingId!);
    } catch (error) {
      cacheError = error;
    }
    expect(cacheError).toMatchObject({ code: "BOOKING_NOT_FOUND" });
    const h = clientFor(list, cancel);
    const page = await h.client.queryBookings({});
    expect(page.items).toHaveLength(1);
    expect(page.items[0]!.bookingId).toBe(order.bookingId);
    const result = await h.client.cancelBooking(order.bookingId!, {
      reason: "Schedule changed",
    });
    expect(result.bookingId).toBe(order.bookingId);
    expect(result.orderId).toBe(order.orderId);
    expect(result.status).toBe("cancelled");
    expect(sql.orders.get(order.orderId)?.status).toBe("cancelled");
    expect(sql.orders.get(order.orderId)?.cancelReason).toBe(
      "Schedule changed",
    );
    expect(h.paths).toEqual([
      "GET /api/tenant/bookings",
      `POST /api/tenant/bookings/${order.bookingId}/cancel`,
    ]);
    const begin = sql.calls.findIndex((x) => x.sql === "BEGIN");
    const commit = sql.calls.findIndex((x) => x.sql === "COMMIT");
    expect(begin).toBeGreaterThan(-1);
    expect(commit).toBeGreaterThan(begin);
    expect(
      sql.calls
        .slice(0, begin)
        .some(
          (x) =>
            x.sql.includes("WHERE booking_id = $1") &&
            x.values[0] === order.bookingId &&
            x.values[1] === TENANT,
        ),
    ).toBe(true);
    expect(
      sql.calls.slice(begin, commit).some((x) => x.sql.includes("FOR UPDATE")),
    ).toBe(true);
  });
  it("keeps the original completed-order rejection from the canonical cancellation path", async () => {
    const sql = new SqlTransport();
    const cold = replica(repository(sql));
    await cold.service.onModuleInit();
    const order = await seed(sql);
    const closed: OwnedOrderRecord = { ...order, status: "completed" };
    await repository(sql).persistChanges({ orders: [closed] });
    const h = clientFor(cold);
    await expect(
      h.client.cancelBooking(order.bookingId!, {
        reason: "Schedule changed",
      }),
    ).rejects.toMatchObject({ code: "ORDER_NOT_CANCELABLE" });
    expect(sql.orders.get(order.orderId)?.status).toBe("completed");
    expect(sql.calls.some((x) => x.sql === "ROLLBACK")).toBe(true);
  });
  it("returns a canonical read failure before cancellation and can recover normally", async () => {
    const sql = new SqlTransport();
    const cold = replica(repository(sql));
    await cold.service.onModuleInit();
    const order = await seed(sql);
    const h = clientFor(cold);
    sql.failBookingRead = true;
    await expect(
      h.client.cancelBooking(order.bookingId!, {
        reason: "Schedule changed",
      }),
    ).rejects.toMatchObject({ code: "SIM_CANONICAL_READ_FAILED" });
    expect(sql.calls.some((x) => x.sql === "BEGIN")).toBe(false);
    expect(sql.orders.get(order.orderId)?.status).toBe(order.status);
    sql.failBookingRead = false;
    expect(
      (
        await h.client.cancelBooking(order.bookingId!, {
          reason: "Schedule changed",
        })
      ).status,
    ).toBe("cancelled");
  });
  it("retains genuine missing and another tenant booking as BOOKING_NOT_FOUND", async () => {
    const sql = new SqlTransport();
    const cold = replica(repository(sql));
    await cold.service.onModuleInit();
    const foreign = await seed(sql, "other-tenant");
    const h = clientFor(cold);
    for (const id of [
      "00000000-0000-4000-8000-000000000001",
      foreign.bookingId!,
    ])
      await expect(
        h.client.cancelBooking(id, { reason: "Schedule changed" }),
      ).rejects.toMatchObject({ code: "BOOKING_NOT_FOUND" });
    expect(sql.calls.some((x) => x.sql === "BEGIN")).toBe(false);
    expect(sql.orders.get(foreign.orderId)?.status).toBe(foreign.status);
  });
  it("preserves an already warm same-replica canonical cancellation", async () => {
    const sql = new SqlTransport();
    const order = await seed(sql);
    const warm = replica(repository(sql));
    await warm.service.onModuleInit();
    expect(
      warm.service.getTenantBooking(TENANT, order.bookingId!).orderId,
    ).toBe(order.orderId);
    const h = clientFor(warm);
    expect(
      (
        await h.client.cancelBooking(order.bookingId!, {
          reason: "Schedule changed",
        })
      ).status,
    ).toBe("cancelled");
    expect(sql.orders.get(order.orderId)?.status).toBe("cancelled");
  });
  it("preserves the original no-database booking cancellation", async () => {
    const local = replica();
    const order = await produce(local);
    const h = clientFor(local);
    const result = await h.client.cancelBooking(order.bookingId!, {
      reason: "Schedule changed",
    });
    expect(result.orderId).toBe(order.orderId);
    expect(result.status).toBe("cancelled");
    expect(
      local.service.getTenantBooking(TENANT, order.bookingId!).status,
    ).toBe("cancelled");
  });
});
