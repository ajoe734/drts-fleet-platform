// SR-QA-DRIVER-001 -- C057 (收益日週月、服務費與補助追溯) and C058
// (下載自己的 statement／收據).
//
// Existing coverage this file does NOT re-derive: `tests/unit/billing-
// settlement.test.ts` and `apps/api/tests/unit/billing-settlement.service.
// test.ts` already exercise `generateDriverStatements` fee-plan math,
// reimbursement-instead-of-clawback behaviour, and idempotent regeneration.
//
// Part 1 (C057, positive regression): `PlatformEarningsController`'s
// `resolveDriverId` (platform-earnings.controller.ts) IS a correctly
// implemented 本人限定存取 (self-only access) gate for the day/week/month
// earnings summary -- a driver identity requesting another driver's
// earnings gets DRIVER_IDENTITY_MISMATCH. This is verified here directly
// against the real controller method (not re-implemented/mocked), since no
// existing test file in this repo covers `resolveDriverId`'s driver-realm
// mismatch branch.
//
// Part 2 (C058, confirmed CURRENT-BEHAVIOUR finding): reading
// `billing-settlement.controller.ts` end-to-end confirms `POST
// driver-statements/generate`, `GET driver-statements`, and `GET
// driver-statements/:statementId` carry no `@RequireRealms`/`@CurrentIdentity`
// of their own, so `apps/api/src/common/auth/auth.policy.ts`'s path-based
// default applies (`routePath.startsWith("driver-statements")` ->
// `baseAllowedRealms("platform", "ops")`, auth.policy.ts:833-844) -- realm
// "driver" is NOT in that list, so a driver cannot reach these routes at
// all today; C058's own capabilities.json entry independently confirms this
// ("API／導向存在；不能由銀行或通路下載成功推論司機可下載" -- API/redirect
// exists, but that channel's success does not prove a driver can download).
// Separately, and unlike every other driver-facing endpoint touched in this
// task (`PlatformEarningsController.resolveDriverId`,
// `DriverSettingsController`'s `isDriverIdentityMatching` checks,
// `DriverHeartbeatController`'s `DRIVER_IDENTITY_MISMATCH` checks),
// `BillingSettlementService.getDriverStatement(statementId)` and
// `.listDriverStatements(periodMonth?)` (billing-settlement.service.ts
// ~2125-2148) take NO identity/ownership parameter at all and perform no
// per-driver filtering -- `listDriverStatements` returns every driver's
// gross earning / service fee / subsidy / net amount unfiltered, and
// `getDriverStatement` returns any statement by id with no ownership check.
// This file proves that at the service layer directly (real write via
// `generateDriverStatements`, real read-back with no identity supplied),
// documented as a confirmed gap, not fixed here (verification-only task);
// also confirmed: `DriverStatementRecord` (packages/contracts/src/
// index.ts:5425-5439) has no downloadable-artifact field at all (no PDF/
// bytes/signed-URL, unlike `TenantInvoiceRecord`'s
// `artifactDownloadMetadata`), so there is currently no real "download
// bytes" implementation for a driver statement/receipt to verify in the
// first place -- reported as a sourced follow-up, not fabricated with a
// fixture download link.
//
// 真機下載 (real-device download) and bank/channel redirect delivery are
// out of scope for this VM (see SR-LIVE-DRIVER-001).

import { describe, expect, it } from "vitest";

import type { BootstrapRequestIdentity } from "../../../../apps/api/src/common/auth";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { BillingSettlementService } from "../../../../apps/api/src/modules/billing-settlement/billing-settlement.service";
import { PlatformEarningsController } from "../../../../apps/api/src/modules/platform-earnings/platform-earnings.controller";
import { PlatformEarningsService } from "../../../../apps/api/src/modules/platform-earnings/platform-earnings.service";

function driverIdentityFor(driverId: string): BootstrapRequestIdentity {
  return {
    authMode: "bootstrap_headers",
    actorType: "driver_user",
    actorId: driverId,
    realm: "driver",
    tenantId: null,
    roleFamilies: ["driver"],
    roles: ["driver"],
    scopes: ["driver:read"],
    requestId: null,
  };
}

describe("SR-QA-DRIVER-001 C057: platform-earnings self-only access (positive regression)", () => {
  it("lets a driver read their own earnings summary and by-platform breakdown", async () => {
    const controller = new PlatformEarningsController(
      new PlatformEarningsService(),
    );

    const summary = await controller.getSummary(
      driverIdentityFor("drv-demo-001"),
      undefined,
    );
    expect(summary.data).toBeTruthy();

    const byPlatform = await controller.getByPlatform(
      driverIdentityFor("drv-demo-001"),
      undefined,
    );
    expect(byPlatform.data).toBeTruthy();
  });

  it("rejects a driver identity requesting a DIFFERENT driver's earnings (DRIVER_IDENTITY_MISMATCH)", async () => {
    const controller = new PlatformEarningsController(
      new PlatformEarningsService(),
    );

    await expect(
      controller.getSummary(driverIdentityFor("drv-demo-001"), "drv-demo-002"),
    ).rejects.toMatchObject({ code: "DRIVER_IDENTITY_MISMATCH" });

    await expect(
      controller.getByPlatform(
        driverIdentityFor("drv-demo-001"),
        "drv-demo-002",
      ),
    ).rejects.toMatchObject({ code: "DRIVER_IDENTITY_MISMATCH" });
  });

  it("rejects an unauthenticated (null-identity) earnings request (AUTH_REQUIRED)", async () => {
    const controller = new PlatformEarningsController(
      new PlatformEarningsService(),
    );

    await expect(controller.getSummary(null, undefined)).rejects.toMatchObject({
      code: "AUTH_REQUIRED",
    });
  });
});

describe("SR-QA-DRIVER-001 C058: driver statement ownership (current-behaviour finding)", () => {
  it("CURRENT-BEHAVIOUR FINDING: getDriverStatement/listDriverStatements return another driver's financial data with no identity parameter to check against", async () => {
    const auditService = new AuditNotificationService();
    const billingSettlementService = new BillingSettlementService(auditService);

    await billingSettlementService.publishDriverFeePlan({
      planName: "SR-QA-DRIVER-001 fee plan",
      version: "sr-qa-driver-001-v1",
      serviceFeeBps: 1200,
      reimbursementMode: "platform_funded",
    });

    const generated = await billingSettlementService.generateDriverStatements({
      periodMonth: "2026-03",
    });
    const someoneElsesStatement = generated.items.find(
      (item) => item.driverId === "drv-demo-001",
    );
    expect(someoneElsesStatement).toBeTruthy();

    // `getDriverStatement`'s TypeScript signature is `(statementId: string)`
    // -- there is no second "requesting driver identity" parameter to even
    // pass a different caller's id into. Calling it with only the
    // statementId (as the controller does verbatim) succeeds and returns
    // drv-demo-001's real gross earning / service fee / subsidy / net
    // amount to this call site, which is exactly what a differently-scoped
    // caller would receive too, since there is no filter in between.
    const fetched = billingSettlementService.getDriverStatement(
      someoneElsesStatement!.statementId,
    );
    expect(fetched.driverId).toBe("drv-demo-001");
    expect(fetched.grossEarning).toBeTruthy();
    expect(fetched.serviceFee).toBeTruthy();
    expect(fetched.subsidy).toBeTruthy();

    // listDriverStatements(periodMonth) has the same shape: no driverId
    // filter parameter exists at all, so it returns every driver's
    // statement for the period, not just one caller's own.
    const allForPeriod =
      billingSettlementService.listDriverStatements("2026-03");
    expect(allForPeriod.length).toBeGreaterThanOrEqual(1);
    expect(allForPeriod.some((s) => s.driverId === "drv-demo-001")).toBe(true);
  });

  it("confirms DriverStatementRecord carries no downloadable-artifact field (no bytes/PDF/signed-URL) as of this SHA", async () => {
    const auditService = new AuditNotificationService();
    const billingSettlementService = new BillingSettlementService(auditService);
    await billingSettlementService.publishDriverFeePlan({
      planName: "SR-QA-DRIVER-001 fee plan 2",
      version: "sr-qa-driver-001-v2",
      serviceFeeBps: 1200,
      reimbursementMode: "platform_funded",
    });
    const generated = await billingSettlementService.generateDriverStatements({
      periodMonth: "2026-03",
    });
    const statement = generated.items[0]!;

    expect(statement).not.toHaveProperty("artifactUrl");
    expect(statement).not.toHaveProperty("artifactDownloadMetadata");
  });
});
