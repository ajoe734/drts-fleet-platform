import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter2 } from "../../../apps/api/node_modules/@nestjs/event-emitter";
import type { DatabaseService } from "../../../apps/api/src/common/db";
import type {
  CreateTenantBookingCommand,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import { createTenantClient } from "@drts/api-client";
import { ApiRequestError } from "../../../apps/api/src/common/api-envelope";
import { EnterpriseDispatchTenantClient } from "../../../apps/enterprise-dispatch-web/lib/api-client";
import {
  buildEnterpriseBookingCommand,
  buildEnterpriseBookingUpdateCommand,
  createEnterpriseBookingDraftFromRecord,
  type EnterpriseBookingDraftForm,
} from "../../../apps/enterprise-dispatch-web/lib/enterprise-booking-draft";
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

const tenantId = "tenant-enterprise-clear-sim";
const services: TenantPartnerService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.onModuleDestroy();
  vi.unstubAllGlobals();
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
      if (index < 0) rows.push(structuredClone(record));
      else rows[index] = structuredClone(record);
      this.tables.set(table, rows);
      return result(
        sql.includes("RETURNING aggregate_version")
          ? [{ aggregate_version: record.aggregateVersion ?? 1 }]
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

function draft(
  patch: Partial<EnterpriseBookingDraftForm> = {},
): EnterpriseBookingDraftForm {
  return {
    passengerMode: "other",
    passenger: "Named passenger",
    bookedBy: "Coordinator",
    pickup: "Original pickup",
    dropoff: "Original destination",
    reservationDate: "2099-06-05",
    reservationTime: "18:00",
    onsiteContactPhone: "0912345678",
    costCenterCode: "ECLEAR",
    costCenterLabel: "Original center",
    vehicle: "business",
    notes: "Original note",
    airportDirection: "pickup",
    terminal: "T1",
    flight: "CI027",
    luggageCount: "2",
    ...patch,
  };
}
async function setup() {
  const f = await pair();
  const requests: Array<{ method: string; path: string; body: unknown }> = [];
  // Only fetch routing is SIM. Actual Enterprise wrapper/SDK and original
  // Controller/Service/Repository/SQL execute; no business handler is mocked.
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      const method = init?.method ?? "GET";
      const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ method, path: url.pathname, body });
      try {
        if (method === "POST" && url.pathname === "/api/tenant/bookings") {
          return Response.json(
            await f.a.ownedController.createTenantBooking(
              body as CreateTenantBookingCommand,
              null,
              headers.get("x-tenant-id") ?? undefined,
              "create-sim",
              undefined,
              headers.get("idempotency-key") ?? undefined,
            ),
          );
        }
        const match = url.pathname.match(/^\/api\/tenant\/bookings\/([^/]+)$/);
        if (!match)
          throw new Error(
            "Unexpected fetch SIM route: " + method + " " + url.pathname,
          );
        const id = decodeURIComponent(match[1]!);
        if (method === "PUT")
          return Response.json(
            await f.b.ownedController.updateTenantBooking(
              id,
              body as UpdateTenantBookingCommand,
              null,
              tenantId,
              "update-sim",
            ),
          );
        if (method === "GET")
          return Response.json(
            await f.b.ownedController.getTenantBooking(
              id,
              tenantId,
              "read-sim",
            ),
          );
        throw new Error("Unexpected fetch SIM method: " + method);
      } catch (error) {
        if (!(error instanceof ApiRequestError)) throw error;
        return Response.json(error.getResponse(), {
          status: error.getStatus(),
        });
      }
    },
  );
  return {
    ...f,
    requests,
    client: new EnterpriseDispatchTenantClient(
      createTenantClient(
        "https://enterprise-clear.invalid",
        tenantId,
        "coordinator-sim",
      ),
    ),
  };
}
async function create(f: Awaited<ReturnType<typeof setup>>, initial = draft()) {
  const ack = await f.client.createBooking(
    buildEnterpriseBookingCommand(initial),
    { idempotencyKey: "enterprise-clear-create" },
  );
  const current = await f.client.getBooking(ack.bookingId);
  expect(current.bookingId).toBe(ack.bookingId);
  return current;
}
const original = {
  notes: "Original note",
  flightNo: "CI027",
  terminal: "T1",
  luggageCount: 2,
};

describe("normal Enterprise optional edit clear reaches canonical same booking", () => {
  it("clears all four existing nullable fields when the edit form is emptied", async () => {
    const f = await setup();
    const booking = await create(f);
    expect(booking).toMatchObject(original);
    const edited = {
      ...createEnterpriseBookingDraftFromRecord(booking),
      notes: "",
      flight: "",
      terminal: "",
      luggageCount: "",
    };
    await f.client.updateBooking(
      booking.bookingId,
      buildEnterpriseBookingUpdateCommand(edited),
    );
    const reloaded = await f.client.getBooking(booking.bookingId);
    expect(reloaded).toMatchObject({
      bookingId: booking.bookingId,
      orderId: booking.orderId,
      notes: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
    });
    expect(
      await f.b.ownedRepository.findOrderById(booking.orderId),
    ).toMatchObject({
      notes: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
    });
  });
  it("keeps nonempty edits and zero luggage on the same order", async () => {
    const f = await setup();
    const booking = await create(f);
    const edited = {
      ...createEnterpriseBookingDraftFromRecord(booking),
      notes: "Changed note",
      flight: "CI028",
      terminal: "T2",
      luggageCount: "0",
      placard: "Original supported custom placard",
    };
    await f.client.updateBooking(
      booking.bookingId,
      buildEnterpriseBookingUpdateCommand(edited),
    );
    expect(await f.client.getBooking(booking.bookingId)).toMatchObject({
      bookingId: booking.bookingId,
      orderId: booking.orderId,
      notes: "Changed note · 需舉牌「Original supported custom placard」",
      flightNo: "CI028",
      terminal: "T2",
      luggageCount: 0,
    });
  });
  it("preserves existing partial API omission behavior", async () => {
    const f = await setup();
    const booking = await create(f);
    await f.client.updateBooking(booking.bookingId, {
      passenger: { name: "Changed passenger", phone: "0912345678" },
    });
    expect(await f.client.getBooking(booking.bookingId)).toMatchObject({
      ...original,
      bookingId: booking.bookingId,
      orderId: booking.orderId,
      passenger: { name: "Changed passenger" },
    });
  });
  it("confirms original explicit-null update support without backend changes", async () => {
    const f = await setup();
    const booking = await create(f);
    await f.client.updateBooking(booking.bookingId, {
      notes: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
    });
    expect(await f.client.getBooking(booking.bookingId)).toMatchObject({
      bookingId: booking.bookingId,
      notes: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
    });
  });
  it("keeps create omission semantics for initially blank optional fields", async () => {
    const f = await setup();
    const booking = await create(
      f,
      draft({ notes: "", flight: "", terminal: "", luggageCount: "" }),
    );
    const posted = f.requests.find((r) => r.method === "POST")?.body;
    expect(posted).not.toHaveProperty("notes");
    expect(posted).not.toHaveProperty("flightNo");
    expect(posted).not.toHaveProperty("terminal");
    expect(posted).not.toHaveProperty("luggageCount");
    expect(booking).toMatchObject({
      notes: null,
      flightNo: null,
      terminal: null,
      luggageCount: null,
    });
  });
  it("retains existing luggage for a nonempty unparseable edit without a new validation policy", async () => {
    const f = await setup();
    const booking = await create(f);
    const edited = {
      ...createEnterpriseBookingDraftFromRecord(booking),
      luggageCount: "abc",
    };
    await f.client.updateBooking(
      booking.bookingId,
      buildEnterpriseBookingUpdateCommand(edited),
    );
    const request = f.requests.find((r) => r.method === "PUT");
    expect(request?.body).not.toHaveProperty("luggageCount");
    expect(await f.client.getBooking(booking.bookingId)).toMatchObject({
      bookingId: booking.bookingId,
      orderId: booking.orderId,
      luggageCount: 2,
    });
    expect(
      await f.b.ownedRepository.findOrderById(booking.orderId),
    ).toMatchObject({ luggageCount: 2 });
  });
});
