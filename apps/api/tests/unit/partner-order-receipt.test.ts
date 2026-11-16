// Actual controller/service + the existing JSONB and payment repositories.
// Database.query/connect replies are a synthetic unit boundary, not real PG,
// payment production/capture, HTTP admission or hosted-browser evidence.
import { describe, expect, it, vi } from "vitest";
import type {
  DispatchAssignmentRecord,
  DispatchJobRecord,
  DriverTaskRecord,
} from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../src/common/auth/auth.types";
import { resolveRouteAuthPolicy } from "../../src/common/auth/auth.policy";
import type { DatabaseService } from "../../src/common/db/database.service";
import { OwnedMobilityController } from "../../src/modules/owned-mobility/owned-mobility.controller";
import { OwnedMobilityService } from "../../src/modules/owned-mobility/owned-mobility.service";
import { OwnedMobilityRepository } from "../../src/modules/owned-mobility/owned-mobility.repository";
import { MultiTaxiRepository } from "../../src/modules/multi-taxi/multi-taxi.repository";
import { PartnerNotificationNavigationRepository } from "../../src/modules/tenant-partner/partner-notification-navigation.repository";
import { buildOrderFixture } from "../integration/voice-order-fixture";

function fixture() {
  const order = buildOrderFixture({
    orderId: "28bd5e48-f97b-4029-953c-656b8e76aa8c",
    bookingId: "booking-SIM-receipt",
    orderNo: "SIM-RECEIPT",
    tenantId: "SIM-tenant",
    partnerId: "SIM-partner",
    partnerProgramId: "SIM-program",
    partnerEntrySlug: "SIM-entry",
    passenger: {
      passengerId: "SIM-passenger",
      name: "SIM Rider",
      phone: "0900000000",
    },
    status: "completed",
    serviceBucket: "business_dispatch",
    businessDispatchSubtype: "travel_agency_transfer",
    quotedFare: { currency: "TWD", amountMinor: 4000 },
  });
  const identity = {
    actorId: "SIM-passenger",
    drtsPassengerId: "SIM-passenger",
    actorType: "referral_passenger",
    realm: "partner",
    authMode: "jwt_bearer",
    tenantId: "SIM-tenant",
    partnerId: "SIM-partner",
    partnerProgramId: "SIM-program",
    partnerEntrySlug: "SIM-entry",
    roleFamilies: ["partner"],
    roles: ["referral_passenger"],
    scopes: ["partner:book"],
  } as BootstrapRequestIdentity;
  const assignment = {
    assignmentId: "SIM-assignment",
    taskId: "SIM-task",
    dispatchJobId: "SIM-job",
    orderId: order.orderId,
    driverId: "SIM-driver",
    vehicleId: "SIM-vehicle",
    status: "completed",
    assignmentType: "metered",
    acceptedAt: "2026-11-12T01:00:00Z",
    rejectedAt: null,
    rejectReasonCode: null,
    createdAt: "2026-11-12T01:00:00Z",
    updatedAt: "2026-11-12T01:30:00Z",
  } as DispatchAssignmentRecord;
  const task = {
    taskId: assignment.taskId,
    assignmentId: assignment.assignmentId,
    dispatchJobId: assignment.dispatchJobId,
    orderId: order.orderId,
    driverId: assignment.driverId,
    vehicleId: assignment.vehicleId,
    sourcePlatform: null,
    routeProvided: false,
    waypoints: [],
    status: "completed",
    acceptedAt: "2026-11-12T01:00:00Z",
    departedAt: "2026-11-12T01:02:00Z",
    arrivedPickupAt: "2026-11-12T01:05:00Z",
    startedAt: "2026-11-12T01:10:00Z",
    completedAt: "2026-11-12T01:30:00Z",
    actualDistanceKm: 3.21,
    actualDurationSec: 1200,
    fare: { currency: "NTD", amountMinor: 5500 },
    actualFareBreakdown: {
      startMinor: 4000,
      distanceMinor: 1000,
      delayMinor: 300,
      nightMinor: 200,
    },
    proof: null,
  } as DriverTaskRecord;
  const context = {
    orders: [order],
    dispatchJobs: [
      { dispatchJobId: assignment.dispatchJobId, orderId: order.orderId },
    ] as DispatchJobRecord[],
    dispatchAssignments: [assignment],
    driverTasks: [task],
    dispatchAttempts: [],
    dispatchTraceLogs: [],
    passengerDisclosureSnapshots: [],
  };
  const state = {
    order,
    context,
    ledger: { status: "captured", amount_minor: "6100", currency: "TWD" } as {
      status: string;
      amount_minor: string | null;
      currency: string;
    } | null,
    ledgerFailure: false,
    contextMissing: false,
    routeTenant: identity.tenantId,
  };
  const reads: string[] = [];
  const query = vi.fn(async (text: string, values: readonly unknown[] = []) => {
    const sql = text.replace(/\s+/g, " ").trim();
    const rows = (data: unknown[]) => ({
      rows: structuredClone(data),
      rowCount: data.length,
    });
    if (sql.startsWith("SELECT jsonb_build_object(")) {
      reads.push("context");
      expect(values).toEqual([order.orderId]);
      return rows(state.contextMissing ? [] : [{ record: state.context }]);
    }
    if (
      sql.includes("FROM ops.phase1_owned_orders") &&
      sql.includes("WHERE order_id = $1")
    ) {
      reads.push("order");
      return rows(values[0] === order.orderId ? [{ record: state.order }] : []);
    }
    if (sql.includes("FROM billing.multi_taxi_passenger_payments")) {
      reads.push("payment");
      expect(values).toEqual([order.orderId]);
      if (state.ledgerFailure)
        throw new Error("SIM durable payment read unavailable");
      return rows(state.ledger ? [state.ledger] : []);
    }
    if (
      sql.includes("FROM mobility.phase1_order_partner_notification_routes r")
    ) {
      reads.push("notification-owner");
      return rows([
        {
          order_id: order.orderId,
          tenant_id: state.routeTenant,
          partner_id: identity.partnerId,
          entry_slug: identity.partnerEntrySlug,
          partner_user_ref: "SIM-existing-reference",
          drts_passenger_id: identity.actorId,
          ride_ref: "SIM-ride-ref",
          status: state.order.status,
          consent_bundle_version: null,
        },
      ]);
    }
    throw new Error("Unsupported synthetic unit read: " + sql);
  });
  const database = {
    isEnabled: () => true,
    query,
    connect: vi.fn(async () => ({ query, release: vi.fn() })),
  } as unknown as DatabaseService;
  const payments = new MultiTaxiRepository(database);
  const owned = new OwnedMobilityRepository(database, payments);
  const navigation = new PartnerNotificationNavigationRepository(database);
  const makeService = () => {
    const service = new OwnedMobilityService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      owned,
      {} as never,
    );
    // Direct-constructor fixture wiring only. Formal OwnedMobilityModule already
    // provides both actual repositories and TenantPartnerModule exports navigation.
    Reflect.set(service, "multiTaxiRepository", payments);
    Reflect.set(service, "partnerNotificationNavigationRepository", navigation);
    return service;
  };
  const service = makeService();
  const controller = new OwnedMobilityController(service, {} as never);
  const read = () =>
    controller.getPartnerOrderReceipt(
      order.orderId,
      identity,
      "SIM-read-request",
    );
  return {
    state,
    order,
    identity,
    task,
    assignment,
    context,
    reads,
    owned,
    payments,
    service,
    controller,
    read,
    makeService,
  };
}

describe("normal partner same-order completion and payment read projection", () => {
  it("reads quote, real completed task and billing as three independent amounts through the actual controller and repositories", async () => {
    const f = fixture();
    const response = await f.read();
    expect(response.data).toMatchObject({
      orderId: f.order.orderId,
      bookingId: f.order.bookingId,
      orderStatus: "completed",
      quotedFare: { currency: "TWD", amountMinor: 4000 },
      completion: {
        taskId: f.task.taskId,
        assignmentId: f.assignment.assignmentId,
        dispatchJobId: f.task.dispatchJobId,
        driverId: f.task.driverId,
        vehicleId: f.task.vehicleId,
        completedAt: f.task.completedAt,
        actualFare: { currency: "TWD", amountMinor: 5500 },
        actualFareBreakdown: f.task.actualFareBreakdown,
        actualDistanceKm: 3.21,
        actualDurationSec: 1200,
      },
      payment: {
        availability: "available",
        status: "captured",
        amount: { currency: "TWD", amountMinor: 6100 },
      },
    });
    expect(f.reads).toEqual(["order", "context", "payment"]);
    expect(response.data).not.toHaveProperty("paidAt");
    expect(response.data).not.toHaveProperty("certificateNo");
    expect(JSON.stringify(response)).not.toContain("provider_payment_ref");
  });

  it("distinguishes a successful empty ledger read from an unconfigured legacy dependency", async () => {
    const f = fixture();
    f.state.ledger = null;
    expect((await f.read()).data.payment).toEqual({
      availability: "not_recorded",
      status: null,
      amount: null,
    });
    f.reads.length = 0;
    Reflect.set(f.service, "multiTaxiRepository", undefined);
    expect((await f.read()).data.payment).toEqual({
      availability: "unavailable",
      status: null,
      amount: null,
    });
    expect(f.reads).not.toContain("payment");
  });

  it("does not invent completion or zero payment for a legacy service with no repositories", async () => {
    const f = fixture();
    Reflect.set(f.service, "orders", [f.order]);
    Reflect.set(f.service, "ownedMobilityRepository", undefined);
    Reflect.set(f.service, "multiTaxiRepository", undefined);
    const record = (await f.read()).data;
    expect(record.quotedFare?.amountMinor).toBe(4000);
    expect(record.completion).toBeNull();
    expect(record.payment).toEqual({
      availability: "unavailable",
      status: null,
      amount: null,
    });
    expect(f.reads).toEqual([]);
  });

  it.each([
    "not_selected",
    "authorized",
    "captured",
    "failed",
    "refunded",
    "manual_recovery",
  ])(
    "returns the actual %s status without promoting completion or a quote to paid",
    async (status) => {
      const f = fixture();
      f.state.ledger!.status = status;
      expect((await f.read()).data.payment).toMatchObject({
        availability: "available",
        status,
        amount: { amountMinor: 6100 },
      });
    },
  );

  it("keeps captured amount missing instead of filling it from the task or quote, and preserves valid zero", async () => {
    const f = fixture();
    f.state.ledger!.amount_minor = null;
    expect((await f.read()).data.payment).toEqual({
      availability: "available",
      status: "captured",
      amount: null,
    });
    f.task.fare = { currency: "NTD", amountMinor: 0 };
    f.state.order.quotedFare = { currency: "NTD", amountMinor: 0 };
    f.state.ledger!.amount_minor = "0";
    f.state.ledger!.currency = "NTD";
    const zero = (await f.read()).data;
    expect(zero.quotedFare).toEqual({ currency: "TWD", amountMinor: 0 });
    expect(zero.completion?.actualFare).toEqual({
      currency: "TWD",
      amountMinor: 0,
    });
    expect(zero.payment.amount).toEqual({ currency: "TWD", amountMinor: 0 });
  });

  it("does not substitute authoritative-looking amounts for malformed actual fare or missing captured components", async () => {
    const f = fixture();
    f.task.fare = { currency: "TWD", amountMinor: -100 };
    f.task.actualFareBreakdown = {
      startMinor: 4000,
      distanceMinor: 1000,
      delayMinor: -300,
      nightMinor: 200,
    };
    f.state.ledger!.amount_minor = String(Number.MAX_SAFE_INTEGER + 1);
    const record = (await f.read()).data;
    expect(record.quotedFare?.amountMinor).toBe(4000);
    expect(record.completion?.actualFare).toBeNull();
    expect(record.completion?.actualFareBreakdown).toBeNull();
    expect(record.payment).toEqual({
      availability: "available",
      status: "captured",
      amount: null,
    });
  });

  it.each([
    "taskId",
    "assignmentId",
    "dispatchJobId",
    "orderId",
    "driverId",
    "vehicleId",
  ] as const)(
    "does not project an actual amount from a task with mismatched %s",
    async (field) => {
      const f = fixture();
      f.task[field] = "SIM-other-" + field;
      const result = (await f.read()).data;
      expect(result.completion).toBeNull();
      expect(result.quotedFare?.amountMinor).toBe(4000);
      expect(result.payment.status).toBe("captured");
      expect(result.payment.amount?.amountMinor).toBe(6100);
    },
  );

  it("requires the matching job and completed assignment/task without selecting cancelled old reassignments", async () => {
    const f = fixture();
    const oldTask = {
      ...f.task,
      taskId: "SIM-old-task",
      status: "cancelled" as const,
      fare: { currency: "TWD", amountMinor: 999999 },
    };
    f.context.driverTasks.unshift(oldTask);
    expect((await f.read()).data.completion?.taskId).toBe(f.task.taskId);
    f.assignment.status = "cancelled";
    expect((await f.read()).data.completion).toBeNull();
    f.assignment.status = "completed";
    f.context.dispatchJobs = [];
    expect((await f.read()).data.completion).toBeNull();
  });

  it("does not choose an arbitrary completion when two full persisted relations match", async () => {
    const f = fixture();
    const otherTask = {
      ...f.task,
      taskId: "SIM-another-completed-task",
      assignmentId: "SIM-another-completed-assignment",
    };
    f.context.driverTasks.push(otherTask);
    f.context.dispatchAssignments.push({
      ...f.assignment,
      assignmentId: otherTask.assignmentId,
      taskId: otherTask.taskId,
    });
    expect((await f.read()).data.completion).toBeNull();
  });

  it("keeps incomplete trips and missing actual fields honest while returning the independent original quote", async () => {
    const f = fixture();
    f.order.status = "on_trip";
    f.state.ledger = null;
    const active = (await f.read()).data;
    expect(active.completion).toBeNull();
    expect(active.quotedFare?.amountMinor).toBe(4000);
    expect(active.payment.availability).toBe("not_recorded");
    f.order.status = "completed";
    f.task.fare = null;
    delete f.task.actualFareBreakdown;
    expect((await f.read()).data.completion).toMatchObject({
      taskId: f.task.taskId,
      actualFare: null,
      actualFareBreakdown: null,
    });
  });

  it.each([
    "tenantId",
    "partnerId",
    "partnerProgramId",
    "partnerEntrySlug",
  ] as const)(
    "runs the original owner check for wrong %s before reading aggregate or payment",
    async (field) => {
      const f = fixture();
      await expect(
        f.controller.getPartnerOrderReceipt(
          f.order.orderId,
          { ...f.identity, [field]: "SIM-another-owner" },
          "SIM-denied",
        ),
      ).rejects.toMatchObject({ code: "PARTNER_SCOPE_MISMATCH" });
      expect(f.reads).toEqual(["order"]);
    },
  );

  it("retains truthy passenger ownership and the existing null-passenger program relation", async () => {
    const f = fixture();
    f.order.passenger.passengerId = "SIM-another-passenger";
    await expect(f.read()).rejects.toMatchObject({
      code: "PARTNER_SCOPE_MISMATCH",
    });
    expect(f.reads).toEqual(["order"]);
    f.reads.length = 0;
    f.order.passenger.passengerId = null;
    expect((await f.read()).data.orderId).toBe(f.order.orderId);
  });

  it("rechecks the newer aggregate owner and never reads payment for a changed scope", async () => {
    const f = fixture();
    f.context.orders = [
      { ...f.order, partnerProgramId: "SIM-changed-program" },
    ];
    await expect(f.read()).rejects.toMatchObject({
      code: "PARTNER_SCOPE_MISMATCH",
    });
    expect(f.reads).toEqual(["order", "context"]);
  });

  it("uses the original persisted notification-route owner relation for tenant-null first-party orders", async () => {
    const f = fixture();
    f.order.tenantId = null;
    expect((await f.read()).data.orderId).toBe(f.order.orderId);
    expect(f.reads).toEqual([
      "order",
      "notification-owner",
      "context",
      "notification-owner",
      "payment",
    ]);
    f.reads.length = 0;
    f.state.routeTenant = "SIM-other-tenant";
    await expect(f.read()).rejects.toMatchObject({
      code: "PARTNER_SCOPE_MISMATCH",
    });
    expect(f.reads).toEqual(["order", "notification-owner"]);
  });

  it("does not turn repository errors or a missing aggregate into an empty/paid ledger", async () => {
    const f = fixture();
    f.state.ledgerFailure = true;
    await expect(f.read()).rejects.toThrow(
      "SIM durable payment read unavailable",
    );
    f.state.ledgerFailure = false;
    f.state.contextMissing = true;
    f.reads.length = 0;
    await expect(f.read()).rejects.toMatchObject({
      code: "PARTNER_RECEIPT_CONTEXT_UNAVAILABLE",
    });
    expect(f.reads).toEqual(["order", "context"]);
  });

  it("uses fresh repository facts on a cold reader and does not recalculate fixed completion fare from a later quote", async () => {
    const f = fixture();
    f.order.fixedPrice = true;
    await f.read();
    f.order.quotedFare = { currency: "TWD", amountMinor: 9000 };
    f.state.ledger!.status = "refunded";
    f.state.ledger!.amount_minor = "6100";
    const fresh = await f
      .makeService()
      .getPartnerOrderReceipt(f.order.orderId, f.identity);
    expect(fresh.quotedFare?.amountMinor).toBe(9000);
    expect(fresh.completion?.actualFare?.amountMinor).toBe(5500);
    expect(fresh.payment).toMatchObject({
      status: "refunded",
      amount: { amountMinor: 6100 },
    });
  });

  it("classifies only the new exact normal receipt GET under the existing partner read ability", () => {
    const ordinary = resolveRouteAuthPolicy(
      "GET",
      "/api/partner/orders/SIM-order",
    );
    const receipt = resolveRouteAuthPolicy(
      "GET",
      "/api/partner/orders/SIM-order/receipt",
    );
    expect(receipt).toMatchObject({ routeKey: "partner:orders:receipt" });
    expect(receipt?.requiredScopes).toEqual(ordinary?.requiredScopes);
    expect(receipt?.allowedRealms).toEqual(ordinary?.allowedRealms);
  });
});
