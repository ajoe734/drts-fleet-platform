import { test, expect } from "@playwright/test";
import { withTenantAcceptance } from "./acceptance-context";

test("Tenant passenger/address relationship, rules and SLA survive durable readback", async ({
  playwright,
}, testInfo) => {
  await withTenantAcceptance(playwright, testInfo, async (ctx) => {
    const passenger = await ctx.data<{ passengerId: string }>(
      "tenant/passengers",
      "adminA",
      "POST",
      { fullName: `QA ${ctx.runId}` },
    );
    const address = await ctx.data<{ addressId: string }>(
      "tenant/addresses",
      "adminA",
      "POST",
      {
        addressName: `QA ${ctx.runId}`,
        addressText: "QA controlled address",
        ownerPassengerId: passenger.passengerId,
      },
    );
    ctx.evidence.recordResourceId("passenger", passenger.passengerId);
    ctx.evidence.recordResourceId("address", address.addressId);
    await ctx.checkpoint({
      apiPath: "tenant/passengers",
      actor: "adminA",
      selector: { key: "passengerId", value: passenger.passengerId },
      expected: {
        passengerId: passenger.passengerId,
        tenantId: ctx.tenantA,
        activeFlag: true,
      },
      sql: "SELECT record FROM core.phase1_tenant_passengers WHERE tenant_id=$1 AND passenger_id=$2",
      parameters: [ctx.tenantA, passenger.passengerId],
    });
    await ctx.checkpoint({
      apiPath: "tenant/addresses",
      actor: "adminA",
      selector: { key: "addressId", value: address.addressId },
      expected: {
        addressId: address.addressId,
        tenantId: ctx.tenantA,
        ownerPassengerId: passenger.passengerId,
        activeFlag: true,
      },
      sql: "SELECT record FROM core.phase1_tenant_addresses WHERE tenant_id=$1 AND address_id=$2",
      parameters: [ctx.tenantA, address.addressId],
    });
    await ctx.negative(
      "tenant/addresses",
      "adminB",
      "POST",
      {
        addressName: "Forbidden",
        addressText: "QA controlled address",
        ownerPassengerId: passenger.passengerId,
      },
      404,
      "PASSENGER_NOT_FOUND",
    );
    const rule = await ctx.data<{ ruleId: string }>(
      "tenant/approval-rules",
      "adminA",
      "POST",
      {
        ruleName: `QA durable ${ctx.runId}`,
        priority: 200,
        conditions: [
          {
            field: "booking.passenger.id",
            op: "eq",
            value: passenger.passengerId,
          },
        ],
        action: "block",
      },
    );
    await ctx.checkpoint({
      apiPath: `tenant/approval-rules/${rule.ruleId}`,
      actor: "adminA",
      expected: {
        ruleId: rule.ruleId,
        tenantId: ctx.tenantA,
        activeFlag: true,
        action: "block",
      },
      sql: "SELECT record FROM core.phase1_tenant_approval_rules WHERE tenant_id=$1 AND rule_id=$2",
      parameters: [ctx.tenantA, rule.ruleId],
    });
    const originalB = await ctx.data("tenant/sla", "adminB");
    const settings = {
      waitThresholdMin: 13,
      arrivalThresholdMin: 23,
      completionThresholdMin: 63,
    };
    await ctx.data("tenant/sla", "adminA", "POST", {
      ...settings,
      reason: "QA durable SLA",
    });
    await ctx.negative(
      "tenant/sla",
      "readonlyA",
      "POST",
      { ...settings, reason: "Forbidden QA SLA" },
      403,
    );
    expect(await ctx.data("tenant/sla", "adminB")).toEqual(originalB);
    await ctx.checkpoint({
      apiPath: "tenant/sla",
      actor: "adminA",
      expected: { tenantId: ctx.tenantA, ...settings },
      sql: "SELECT record FROM admin.phase1_tenant_sla_profiles WHERE tenant_id=$1",
      parameters: [ctx.tenantA],
    });
  });
});
