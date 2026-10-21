import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Reflector } from "@nestjs/core";
import { PATH_METADATA } from "@nestjs/common/constants";
import type { ExecutionContext } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DriverStatementRecord } from "@drts/contracts";
import type { BootstrapRequestIdentity } from "../../src/common/auth";
import { BootstrapAuthGuard } from "../../src/common/auth/bootstrap-auth.guard";
import { JwtAuthService } from "../../src/common/auth/jwt-auth.service";
import type { IdentityRepository } from "../../src/modules/identity/identity.repository";
import { AuditNotificationService } from "../../src/modules/audit-notification/audit-notification.service";
import { BillingSettlementController } from "../../src/modules/billing-settlement/billing-settlement.controller";
import type { BillingSettlementRepository } from "../../src/modules/billing-settlement/billing-settlement.repository";
import { BillingSettlementService } from "../../src/modules/billing-settlement/billing-settlement.service";

const originalEnv = { ...process.env };
afterEach(() => {
  process.env = { ...originalEnv };
});
const standardDriverScopes = ["driver:read", "driver:write", "dispatch:read"];
const money = (amountMinor: number) => ({
  amountMinor,
  currency: "TWD" as const,
});
function statement(
  id: string,
  driverId: string,
  periodMonth = "2026-10",
): DriverStatementRecord {
  return {
    statementId: id,
    driverId,
    periodMonth,
    receiptNo: `receipt-${id}`,
    payoutStatus: "paid",
    grossEarning: money(100000),
    serviceFee: money(5000),
    subsidy: money(2000),
    netAmount: money(97000),
    feePlanVersion: "fee-plan.v1",
    lines: [],
    artifactUrl: null,
    createdAt: "2026-10-13T00:00:00.000Z",
    updatedAt: "2026-10-13T00:00:00.000Z",
  };
}
async function fixture() {
  process.env.APP_ENV = "staging";
  process.env.JWT_SECRET =
    "driver_statement_real_guard_test_secret_at_least_32_characters";
  process.env.JWT_ISSUER = "driver-statement-test";
  process.env.JWT_AUDIENCE = "driver-statement-api";
  const sessionId = randomUUID(),
    tokenId = randomUUID();
  const getSession = vi.fn(async () => ({
    sessionId,
    status: "active",
    currentTokenId: tokenId,
    tokenVersion: 1,
    deviceSummary: { deviceId: "driver-test-phone" },
  }));
  const jwt = new JwtAuthService({
    getSession,
  } as unknown as IdentityRepository);
  // Same scopes issued by actual DriverDeviceSessionService (1015/1039).
  const token = jwt.sign({
    authMode: "jwt_bearer",
    actorType: "driver_user",
    actorId: "drv-statement-001",
    realm: "driver",
    tenantId: null,
    roles: ["driver_user"],
    roleFamilies: ["driver"],
    scopes: standardDriverScopes,
    requestId: null,
    sessionId,
    tokenId,
    tokenVersion: 1,
    driverBindingId: sessionId,
    driverDeviceId: "driver-test-phone",
    authTime: new Date().toISOString(),
    amr: ["device_binding"],
    acr: "aal1",
    policyVersion: "driver-device.v1",
  });
  expect(await jwt.verifyAccessToken(token)).not.toBeNull();
  const loadState = vi.fn(async () => ({
    tenantBillingProfiles: [],
    tenantInvoices: [],
    driverFeePlans: [],
    driverStatements: [
      statement("own", "drv-statement-001"),
      statement("prior", "drv-statement-001", "2026-09"),
      statement("other", "drv-statement-002"),
    ],
    reimbursementBatches: [],
    reconciliationIssues: [],
    fulfillmentSegments: [],
    sandboxBillingTreatments: [],
  }));
  const repository = {
    loadState,
    persistChanges: vi.fn(async () => {}),
  } as unknown as BillingSettlementRepository;
  const service = new BillingSettlementService(
    new AuditNotificationService(),
    repository,
  );
  await service.onModuleInit();
  const controller = new BillingSettlementController(service);
  const guard = new BootstrapAuthGuard(new Reflector(), jwt);
  type Request = {
    method: string;
    originalUrl: string;
    url: string;
    headers: Record<string, string>;
    identity?: BootstrapRequestIdentity;
  };
  async function activate(
    path: string,
    method:
      | "listDriverStatements"
      | "getDriverStatement"
      | "listDriverOwnStatements"
      | "getDriverOwnStatement",
    bearer = true,
    scope = "billing:read",
  ) {
    const request: Request = {
      method: "GET",
      originalUrl: `/api/${path}`,
      url: `/api/${path}`,
      headers: bearer
        ? { authorization: `Bearer ${token}` }
        : {
            "x-actor-type": "ops_user",
            "x-actor-id": "ops-fixture",
            "x-realm": "ops",
            "x-scopes": scope,
          },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => BillingSettlementController.prototype[method],
      getClass: () => BillingSettlementController,
    } as unknown as ExecutionContext;
    await guard.canActivate(context);
    return request.identity!;
  }
  function registered(
    method:
      | "listDriverStatements"
      | "getDriverStatement"
      | "listDriverOwnStatements"
      | "getDriverOwnStatement",
    path: string,
  ) {
    const metadata: unknown = Reflect.getMetadata(
      PATH_METADATA,
      BillingSettlementController.prototype[method],
    );
    const paths = Array.isArray(metadata) ? metadata : [metadata];
    expect(paths).toContain(path);
  }
  return { controller, activate, registered, getSession, loadState };
}
describe("actual driver bearer + driver earnings statement routes", () => {
  it.each(["listDriverStatements", "getDriverStatement"] as const)(
    "records existing billing-scoped %s rejection for the standard live-driver session",
    async (method) => {
      const f = await fixture();
      await expect(
        f.activate(
          method === "listDriverStatements"
            ? "driver-statements"
            : "driver-statements/own",
          method,
        ),
      ).rejects.toMatchObject({ code: "AUTH_SCOPE_DENIED" });
      expect(f.getSession).toHaveBeenCalled();
    },
  );
  it("registers actual Nest list alias, passes unchanged driver scopes, and returns only the driver's selected month", async () => {
    const f = await fixture();
    f.registered("listDriverOwnStatements", "driver/profile/statements");
    const identity = await f.activate(
      "driver/profile/statements?periodMonth=2026-10",
      "listDriverOwnStatements",
    );
    expect(identity.scopes).toEqual(standardDriverScopes);
    const response = f.controller.listDriverOwnStatements(
      identity,
      undefined,
      "2026-10",
    );
    expect(response.data.items.map((x) => x.statementId)).toEqual(["own"]);
    expect(response.data.items[0]?.netAmount).toEqual(money(97000));
    expect(response.data.pageInfo.totalItems).toBe(1);
  });
  it("registers actual Nest detail alias and returns the same complete own statement data", async () => {
    const f = await fixture();
    f.registered(
      "getDriverOwnStatement",
      "driver/profile/statements/:statementId",
    );
    const identity = await f.activate(
      "driver/profile/statements/own",
      "getDriverOwnStatement",
    );
    expect(
      f.controller.getDriverOwnStatement("own", identity, "detail-request"),
    ).toMatchObject({
      data: {
        statementId: "own",
        driverId: "drv-statement-001",
        receiptNo: "receipt-own",
        grossEarning: money(100000),
        serviceFee: money(5000),
        subsidy: money(2000),
        netAmount: money(97000),
      },
      meta: { requestId: "detail-request" },
    });
  });
  it("keeps original controller/service ownership behavior on both aliases", async () => {
    const f = await fixture();
    f.registered("listDriverOwnStatements", "driver/profile/statements");
    f.registered(
      "getDriverOwnStatement",
      "driver/profile/statements/:statementId",
    );
    const identity = await f.activate(
      "driver/profile/statements",
      "listDriverOwnStatements",
    );
    expect(() =>
      f.controller.listDriverStatements(
        identity,
        undefined,
        undefined,
        "drv-statement-002",
      ),
    ).toThrow(expect.objectContaining({ code: "DRIVER_IDENTITY_MISMATCH" }));
    expect(() => f.controller.getDriverOwnStatement("other", identity)).toThrow(
      expect.objectContaining({ code: "DRIVER_IDENTITY_MISMATCH" }),
    );
    expect(
      f.controller
        .listDriverOwnStatements(identity)
        .data.items.map((x) => x.statementId),
    ).toEqual(["own", "prior"]);
  });
  it("does not grant ops a new all-statements route through driver read scope", async () => {
    const f = await fixture();
    process.env.APP_ENV = "development";
    await expect(
      f.activate(
        "driver/profile/statements",
        "listDriverOwnStatements",
        false,
        "driver:read",
      ),
    ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
    await expect(
      f.activate(
        "driver/profile/statements/own",
        "getDriverOwnStatement",
        false,
        "driver:read",
      ),
    ).rejects.toMatchObject({ code: "AUTH_REALM_DENIED" });
  });
  it("keeps existing ops billing list/detail route behavior and monetary data unchanged", async () => {
    const f = await fixture();
    process.env.APP_ENV = "development";
    f.registered("listDriverStatements", "driver-statements");
    f.registered("getDriverStatement", "driver-statements/:statementId");
    const ops = await f.activate(
      "driver-statements",
      "listDriverStatements",
      false,
    );
    expect(
      f.controller
        .listDriverStatements(ops, undefined, "2026-10")
        .data.items.map((x) => x.statementId),
    ).toEqual(["own", "other"]);
    expect(
      f.controller.getDriverStatement("other", ops).data.netAmount,
    ).toEqual(money(97000));
  });
});
