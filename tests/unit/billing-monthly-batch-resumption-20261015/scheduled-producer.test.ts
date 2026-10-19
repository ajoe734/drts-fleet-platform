import { createRequire } from "node:module";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BillingMonthlyBatchController } from "../../../apps/api/src/modules/billing-settlement/billing-monthly-batch.controller";
import { BillingMonthlyBatchService } from "../../../apps/api/src/modules/billing-settlement/billing-monthly-batch.service";
import {
  BootstrapAuthGuard,
  JwtAuthService,
  type BootstrapRequestIdentity,
  type AuthenticatedRequestLike,
} from "../../../apps/api/src/common/auth";
import { GoogleWorkloadIdentityAdapter } from "../../../apps/api/src/modules/auth/google-workload-identity.adapter";
import { IdentityRepository } from "../../../apps/api/src/modules/identity/identity.repository";
import { databaseSocket, setup, publish } from "./fixtures";

const apiRequire = createRequire(
  new URL("../../../apps/api/package.json", import.meta.url),
);
const { Reflector } = apiRequire("@nestjs/core");
const jwt: {
  sign(
    payload: Record<string, unknown>,
    key: KeyObject,
    options: { algorithm: "RS256"; keyid: string },
  ): string;
} = apiRequire("jsonwebtoken");
const route = "/api/internal/scheduled-tasks/billing-monthly/run";
const scope = "billing:monthly:run";
const identity: BootstrapRequestIdentity = {
  authMode: "jwt_bearer",
  actorType: "system",
  actorId: "SIM-monthly-scheduler",
  realm: "system",
  tenantId: null,
  roleFamilies: [],
  roles: [],
  scopes: [scope],
  requestId: null,
};
function liveTrip(
  socket: ReturnType<typeof databaseSocket>,
  driverId: string,
  orderId: string,
  completedAt = "2026-07-15T12:00:00.000Z",
  status = "completed",
) {
  socket.liveRows.push({
    order_record: {
      orderId,
      tenantId: "tenant-live-canonical",
      orderSource: "api",
      serviceBucket: "business_dispatch",
      businessDispatchSubtype: "enterprise_dispatch",
      serviceProductCode: "enterprise_dispatch",
      costCenter: null,
      passenger: null,
      partnerId: null,
      partnerProgramId: null,
      partnerEntrySlug: null,
      eligibilityVerificationId: null,
      issuerAuthorizationRef: null,
      benefitReference: null,
    },
    task_record: {
      driverId,
      completedAt,
      status,
      fare: { currency: "TWD", amountMinor: 10000 },
    },
  });
}
function context(request: AuthenticatedRequestLike) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => BillingMonthlyBatchController.prototype.run,
    getClass: () => BillingMonthlyBatchController,
  } as never;
}
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("C089 actual scheduled producer", () => {
  it("real system Controller→batch→Billing→Repository uses canonical live targets and returns replay-stable receipts", async () => {
    const socket = databaseSocket();
    liveTrip(socket, "driver-live-a", "order-live-a");
    liveTrip(socket, "driver-live-b", "order-live-b");
    liveTrip(
      socket,
      "driver-cancelled",
      "order-cancelled",
      undefined,
      "cancelled",
    );
    const actual = await setup(socket);
    await publish(actual.service);
    const controller = new BillingMonthlyBatchController(
      new BillingMonthlyBatchService(actual.service),
    );
    const first = await controller.run(
      { periodMonth: "2026-07", operationId: "operation-july" },
      identity,
      "request-july",
    );
    expect(first.data.eligibleDriverIds).toEqual([
      "driver-live-a",
      "driver-live-b",
    ]);
    expect(first.data).toMatchObject({
      operationId: "operation-july",
      requestId: "request-july",
      status: "completed",
    });
    expect(first.meta.requestId).toBe("request-july");
    expect(first.data.targets).toHaveLength(2);
    const records = [
      ...socket.tables.get("billing.phase1_driver_statements")!.values(),
    ];
    expect(records.map((row) => row.driverId).sort()).toEqual(
      first.data.eligibleDriverIds,
    );
    expect(records[0]).toMatchObject({
      grossEarning: { amountMinor: 10000 },
      serviceFee: { amountMinor: 1200 },
      netAmount: { amountMinor: 8800 },
      lines: [expect.objectContaining({ orderId: "order-live-a" })],
    });
    const second = await controller.run(
      { periodMonth: "2026-07", operationId: "operation-july" },
      identity,
      "request-july-retry",
    );
    expect(second.data.targets).toEqual(first.data.targets);
    expect(
      socket.query.mock.calls.filter(([sql]) =>
        sql.includes("INSERT INTO billing.phase1_driver_statements"),
      ),
    ).toHaveLength(2);
  });

  it("partial failure produces actual HTTP503 details with prior committed receipts, then fresh resume completes only missing work", async () => {
    const socket = databaseSocket();
    liveTrip(socket, "driver-live-a", "order-live-a");
    liveTrip(socket, "driver-live-b", "order-live-b");
    const first = await setup(socket);
    await publish(first.service);
    socket.reject("billing.phase1_driver_statements");
    socket.rejectDriver("driver-live-b");
    const controller = new BillingMonthlyBatchController(
      new BillingMonthlyBatchService(first.service),
    );
    try {
      await controller.run(
        { periodMonth: "2026-07" },
        identity,
        "partial-request",
      );
      throw new Error("Expected partial failure");
    } catch (error) {
      expect(error).toMatchObject({ code: "BILLING_MONTHLY_PARTIAL_FAILURE" });
      const response = (
        error as {
          getResponse(): {
            error: { details: { targets: unknown[]; requestId: string } };
          };
        }
      ).getResponse();
      expect(response.error.details.requestId).toBe("partial-request");
      expect(response.error.details.targets).toEqual([
        expect.objectContaining({
          driverId: "driver-live-a",
          status: "completed",
          statementIds: [expect.any(String)],
        }),
        expect.objectContaining({
          driverId: "driver-live-b",
          status: "failed",
          errorCode: "BILLING_TARGET_PERSISTENCE_UNAVAILABLE",
        }),
      ]);
    }
    const completed = [
      ...socket.tables.get("billing.phase1_driver_statements")!.values(),
    ][0]!;
    const artifact = await first.store.get(
      "report",
      String(completed.statementId),
    );
    socket.reject(null);
    const fresh = await setup(socket, first.store);
    const resumed = await new BillingMonthlyBatchController(
      new BillingMonthlyBatchService(fresh.service),
    ).run({ periodMonth: "2026-07" }, identity, "resumed-request");
    expect(resumed.data.status).toBe("completed");
    expect(resumed.data.targets).toHaveLength(2);
    expect(resumed.data.targets[0]!.statementIds).toEqual([
      completed.statementId,
    ]);
    expect(
      await fresh.store.get("report", String(completed.statementId)),
    ).toEqual(artifact);
  });

  it("one operation identity cannot silently become a different closed period", async () => {
    const socket = databaseSocket();
    const actual = await setup(socket);
    await publish(actual.service);
    const monthly = new BillingMonthlyBatchService(actual.service);
    expect(
      (
        await monthly.run({
          periodMonth: "2026-07",
          operationId: "same-operation",
        })
      ).status,
    ).toBe("completed");
    await expect(
      monthly.run({ periodMonth: "2026-06", operationId: "same-operation" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });
  });

  it("source rejection/unconfigured source cannot become a seed-only or zero-target successful scheduled batch", async () => {
    const socket = databaseSocket();
    const actual = await setup(socket);
    await publish(actual.service);
    socket.failSource(true);
    await expect(
      new BillingMonthlyBatchService(actual.service).run({
        periodMonth: "2026-06",
      }),
    ).rejects.toMatchObject({ code: "BILLING_MONTHLY_SOURCE_UNAVAILABLE" });
    const controlled = await setup();
    await publish(controlled.service);
    await expect(
      new BillingMonthlyBatchService(controlled.service).run({
        periodMonth: "2026-06",
      }),
    ).rejects.toMatchObject({ code: "BILLING_MONTHLY_SOURCE_UNAVAILABLE" });
    expect(
      (
        await controlled.service.generateDriverStatements({
          periodMonth: "2026-06",
        })
      ).items
        .map((row) => row.driverId)
        .sort(),
    ).toEqual(["drv-demo-002", "drv-demo-003"]);
  });

  it("the real monthly producer partitions four boundary trips at exact milliseconds without loss/overlap", async () => {
    const socket = databaseSocket();
    liveTrip(
      socket,
      "driver-boundary",
      "order-june-last",
      "2026-06-30T23:59:59.999Z",
    );
    liveTrip(
      socket,
      "driver-boundary",
      "order-july-first",
      "2026-07-01T00:00:00.000Z",
    );
    liveTrip(
      socket,
      "driver-boundary",
      "order-july-last",
      "2026-07-31T23:59:59.999Z",
    );
    liveTrip(
      socket,
      "driver-boundary",
      "order-aug-first",
      "2026-08-01T00:00:00.000Z",
    );
    const actual = await setup(socket);
    await publish(actual.service);
    const monthly = new BillingMonthlyBatchService(actual.service);
    const orders: string[] = [];
    for (const periodMonth of ["2026-06", "2026-07", "2026-08"]) {
      const receipt = await monthly.run({ periodMonth });
      const statement = actual.service.getDriverStatement(
        receipt.targets[0]!.statementIds[0]!,
      );
      expect(statement.lines).toHaveLength(periodMonth === "2026-07" ? 2 : 1);
      expect(statement.grossEarning.amountMinor).toBe(
        periodMonth === "2026-07" ? 20000 : 10000,
      );
      orders.push(...statement.lines.map((line) => line.orderId));
    }
    expect(orders.sort()).toEqual(
      [
        "order-aug-first",
        "order-july-first",
        "order-july-last",
        "order-june-last",
      ].sort(),
    );
    expect(new Set(orders).size).toBe(4);
  });

  it("UTC previous closed month selection handles year/leap rollover and rejects current/future/invalid periods", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const socket = databaseSocket();
      const actual = await setup(socket);
      await publish(actual.service);
      const monthly = new BillingMonthlyBatchService(actual.service);
      vi.setSystemTime(new Date("2027-01-01T00:00:00.000Z"));
      expect((await monthly.run()).periodMonth).toBe("2026-12");
      vi.setSystemTime(new Date("2028-03-01T00:00:00.000Z"));
      expect((await monthly.run()).periodMonth).toBe("2028-02");
      const sourceArgs = socket.query.mock.calls
        .filter(([sql]) => sql.includes("INNER JOIN ops.phase1_owned_orders"))
        .at(-1)![1];
      expect(sourceArgs).toEqual([
        "2028-02-01T00:00:00.000Z",
        "2028-02-29T23:59:59.999Z",
      ]);
      for (const periodMonth of ["2028-03", "2028-04"])
        await expect(monthly.run({ periodMonth })).rejects.toMatchObject({
          code: "BILLING_PERIOD_NOT_CLOSED",
        });
      for (const periodMonth of ["2028-13", "2028-00", "2028-2", "invalid"])
        await expect(monthly.run({ periodMonth })).rejects.toMatchObject({
          code: "VALIDATION_ERROR",
        });
    } finally {
      vi.useRealTimers();
    }
  });

  it("wrong realm and missing scope reject through the real controller before any billing producer", async () => {
    const actual = await setup();
    const producer = vi.spyOn(
      actual.service,
      "listScheduledDriverStatementTargets",
    );
    const controller = new BillingMonthlyBatchController(
      new BillingMonthlyBatchService(actual.service),
    );
    for (const caller of [
      null,
      { ...identity, realm: "ops" as const, actorType: "ops_user" as const },
      { ...identity, scopes: [] },
    ])
      await expect(
        controller.run({ periodMonth: "2026-07" }, caller),
      ).rejects.toMatchObject({ code: "AUTHZ_SCOPE_DENIED" });
    expect(producer).not.toHaveBeenCalled();
  });
});

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = publicKey.export({ format: "jwk" });
const email = "monthly-sim@drts-sim-project.iam.gserviceaccount.com",
  audience = "https://billing-sim.invalid";
function registered(
  scopes: string[] = [scope],
  routeScopes: string[] = [`POST ${route}`],
  account = email,
) {
  vi.stubEnv(
    "WORKLOAD_IDENTITY_GOOGLE_SERVICE_PRINCIPALS",
    JSON.stringify([
      {
        serviceAccountEmail: account,
        principalId: "monthly-SIM",
        actorId: "monthly-SIM",
        scopes,
        roles: [],
        allowedTokenAudiences: [audience],
        routeScopes,
      },
    ]),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ keys: [{ ...jwk, kid: "monthly-sim-key" }] }),
          { status: 200 },
        ),
    ),
  );
}
function token() {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: "https://accounts.google.com",
      sub: "monthly-sim-subject",
      email,
      email_verified: true,
      aud: audience,
      iat: now,
      exp: now + 300,
    },
    privateKey,
    { algorithm: "RS256", keyid: "monthly-sim-key" },
  );
}
function guard() {
  return new BootstrapAuthGuard(
    new Reflector(),
    new JwtAuthService(),
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    new GoogleWorkloadIdentityAdapter(new IdentityRepository()),
  );
}

describe("C089 actual verified-system auth path (only external JWKS/signing fixture is SIM)", () => {
  it("same actual Google assertion may trigger this replay-safe route twice through guard and actual billing Controller", async () => {
    registered();
    const auth = guard(),
      assertion = token();
    const socket = databaseSocket();
    liveTrip(socket, "driver-verified-live", "order-verified-live");
    const actual = await setup(socket);
    await publish(actual.service);
    const controller = new BillingMonthlyBatchController(
      new BillingMonthlyBatchService(actual.service),
    );
    const invoke = async () => {
      const request: AuthenticatedRequestLike = {
        method: "POST",
        originalUrl: route,
        headers: { authorization: `Bearer ${assertion}` },
      };
      expect(await auth.canActivate(context(request))).toBe(true);
      expect(request.identity?.realm).toBe("system");
      const verified = request.identity;
      if (!verified || verified.realm !== "system")
        throw new Error("Expected actual verified system identity");
      return controller.run(
        { periodMonth: "2026-07" },
        verified,
        "verified-request",
      );
    };
    const first = await invoke(),
      second = await invoke();
    expect(second.data.targets).toEqual(first.data.targets);
    expect(socket.tables.get("billing.phase1_driver_statements")!.size).toBe(1);
  });

  it("actual signature/registry adapter keeps unregistered, wrong route and wrong scope callers denied", async () => {
    const assertion = token();
    for (const configure of [
      () =>
        registered(
          [scope],
          [`POST ${route}`],
          "other@drts-sim-project.iam.gserviceaccount.com",
        ),
      () =>
        registered(
          [scope],
          ["POST /api/internal/scheduled-tasks/mail-outbox/drain"],
        ),
      () => registered([]),
    ]) {
      configure();
      const request: AuthenticatedRequestLike = {
        method: "POST",
        originalUrl: route,
        headers: { authorization: `Bearer ${assertion}` },
      };
      await expect(guard().canActivate(context(request))).rejects.toBeDefined();
      expect(request.identity?.scopes.includes(scope) ?? false).toBe(false);
    }
  });
});
