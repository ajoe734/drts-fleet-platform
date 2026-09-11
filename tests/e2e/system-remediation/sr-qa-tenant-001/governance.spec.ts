import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { withTenantAcceptance } from "./acceptance-context";

// These cases mutate only the runner's disposable PostgreSQL through the
// unmodified AppModule HTTP routes, then query the same IDs independently.
test("Tenant quotas and approval decisions have real HTTP/DB readback", async ({
  playwright,
}, testInfo) => {
  await withTenantAcceptance(playwright, testInfo, async (ctx) => {
    const code = `QA-${ctx.runId.slice(0, 8)}`;
    await ctx.data("tenant/cost-centers", "adminA", "POST", {
      code,
      name: "QA governed bookings",
    });
    await ctx.checkpoint({
      apiPath: "tenant/cost-centers",
      actor: "adminA",
      selector: { key: "code", value: code },
      expected: { tenantId: ctx.tenantA, code, activeFlag: true },
      sql: "SELECT record FROM core.phase1_tenant_cost_centers WHERE tenant_id=$1 AND code=$2",
      parameters: [ctx.tenantA, code],
    });
    const policy = {
      costCenterCode: code,
      period: "monthly",
      limit: {
        bookingCountLimit: 3,
        amountMinorLimit: 5_000_000,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    };
    await ctx.data("tenant/quotas/policies", "adminA", "POST", policy);
    await ctx.checkpoint({
      apiPath: `tenant/cost-centers/${code}/quota`,
      actor: "adminA",
      expected: {
        tenantId: ctx.tenantA,
        costCenterCode: code,
        period: "monthly",
        limit: policy.limit,
      },
      sql: "SELECT record FROM core.phase1_tenant_quota_policies WHERE tenant_id=$1 AND cost_center_code=$2 AND period=$3",
      parameters: [ctx.tenantA, code, "monthly"],
    });
    await ctx.negative(
      "tenant/quotas/policies",
      "readonlyA",
      "POST",
      policy,
      403,
    );
    const rule = await ctx.data<{ ruleId: string }>(
      "tenant/approval-rules",
      "adminA",
      "POST",
      {
        ruleName: `QA approve ${code}`,
        priority: 10,
        conditions: [{ field: "cost_center.code", op: "eq", value: code }],
        action: "require_approval",
        approvers: [{ kind: "tenant_admin" }],
      },
    );
    ctx.evidence.recordResourceId("approval_rule", rule.ruleId);
    const command = {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: new Date(Date.now() + 6 * 3600_000).toISOString(),
      reservationWindowEnd: new Date(Date.now() + 7 * 3600_000).toISOString(),
      pickup: { address: "QA pickup", lat: 25.033, lng: 121.565 },
      dropoff: { address: "QA dropoff", lat: 25.047, lng: 121.517 },
      passenger: { name: "QA passenger", phone: "0900000000" },
      costCenter: code,
    };
    const booking = await ctx.data<{ bookingId: string; orderId: string }>(
      "tenant/bookings",
      "adminA",
      "POST",
      command,
    );
    ctx.evidence.recordResourceId("booking", booking.bookingId);
    ctx.evidence.recordResourceId("order", booking.orderId);
    const requests = await ctx.data<{
      items: { approvalRequestId: string; status: string }[];
    }>(
      `tenant/approval-requests?bookingId=${encodeURIComponent(booking.bookingId)}`,
    );
    expect(requests.items).toHaveLength(1);
    const approval = requests.items[0]!;
    expect(approval.status).toBe("pending");
    const approvalPath = `tenant/approval-requests/${approval.approvalRequestId}`;
    await ctx.negative(
      approvalPath,
      "adminB",
      "GET",
      undefined,
      404,
      "APPROVAL_REQUEST_NOT_FOUND",
    );
    await ctx.negative(
      `${approvalPath}/approve`,
      "readonlyA",
      "POST",
      { reasonNote: "Forbidden QA decision" },
      403,
    );
    await ctx.data(`${approvalPath}/approve`, "adminA", "POST", {
      reasonNote: "QA approved budget",
    });
    await ctx.checkpoint({
      apiPath: approvalPath,
      actor: "adminA",
      expected: {
        approvalRequestId: approval.approvalRequestId,
        tenantId: ctx.tenantA,
        bookingId: booking.bookingId,
        orderId: booking.orderId,
        status: "approved",
      },
      sql: "SELECT record FROM core.phase1_tenant_approval_requests WHERE tenant_id=$1 AND approval_request_id=$2",
      parameters: [ctx.tenantA, approval.approvalRequestId],
    });
    expect(
      await ctx.data(`tenant/bookings/${booking.bookingId}`),
    ).toMatchObject({
      bookingId: booking.bookingId,
      approvalState: "approved",
    });
    await ctx.checkpoint({
      apiPath: `tenant/bookings/${booking.bookingId}`,
      actor: "adminA",
      expected: {
        bookingId: booking.bookingId,
        orderId: booking.orderId,
        tenantId: ctx.tenantA,
        approvalState: "approved",
      },
      sql: "SELECT record FROM ops.phase1_owned_orders WHERE order_id=$1 AND record->>'tenantId'=$2",
      parameters: [booking.orderId, ctx.tenantA],
    });
    await ctx.negative(
      `${approvalPath}/approve`,
      "adminA",
      "POST",
      { reasonNote: "Duplicate QA decision" },
      409,
      "APPROVAL_REQUEST_NOT_PENDING",
    );
    const ledger = await ctx.data<{
      items: {
        ledgerEntryId: string;
        bookingId: string;
        costCenterCode: string;
      }[];
    }>(
      `tenant/quotas/ledger?bookingId=${encodeURIComponent(booking.bookingId)}`,
    );
    expect(ledger.items.length).toBeGreaterThan(0);
    for (const entry of ledger.items) {
      await ctx.checkpoint({
        apiPath: `tenant/quotas/ledger?bookingId=${encodeURIComponent(booking.bookingId)}`,
        actor: "adminA",
        selector: { key: "ledgerEntryId", value: entry.ledgerEntryId },
        expected: {
          ledgerEntryId: entry.ledgerEntryId,
          bookingId: booking.bookingId,
          costCenterCode: code,
        },
        sql: "SELECT record FROM core.phase1_tenant_quota_ledger WHERE tenant_id=$1 AND ledger_entry_id=$2",
        parameters: [ctx.tenantA, entry.ledgerEntryId],
      });
    }
    expect(
      (
        await ctx.data<{ items: unknown[] }>(
          `tenant/quotas/ledger?bookingId=${encodeURIComponent(booking.bookingId)}`,
          "adminB",
        )
      ).items,
    ).toHaveLength(0);
    const summary = await ctx.data<{
      usage: {
        confirmedBookingCount: number;
        pendingReservedBookingCount: number;
      };
    }>(`tenant/cost-centers/${code}/quota`);
    expect(
      summary.usage.confirmedBookingCount +
        summary.usage.pendingReservedBookingCount,
    ).toBe(1);
    const zeroCode = `QA-Z-${ctx.runId.slice(0, 8)}`;
    await ctx.data("tenant/cost-centers", "adminA", "POST", {
      code: zeroCode,
      name: "QA zero quota",
    });
    await ctx.data("tenant/quotas/policies", "adminA", "POST", {
      ...policy,
      costCenterCode: zeroCode,
      limit: { ...policy.limit, bookingCountLimit: 0, amountMinorLimit: 0 },
    });
    await ctx.negative(
      "tenant/bookings",
      "adminA",
      "POST",
      { ...command, costCenter: zeroCode },
      409,
      "QUOTA_INSUFFICIENT_AT_COMMIT",
    );
    expect(
      (
        await ctx.data<{ items: unknown[] }>(
          `tenant/quotas/ledger?costCenterCode=${zeroCode}`,
        )
      ).items,
    ).toHaveLength(0);
    const none = await ctx.db.query(
      "SELECT ledger_entry_id FROM core.phase1_tenant_quota_ledger WHERE tenant_id=$1 AND cost_center_code=$2",
      [ctx.tenantA, zeroCode],
    );
    expect(none.rows).toHaveLength(0);
  });
});

test("Tenant lifecycle and integration settings persist and reject tenant actors", async ({
  playwright,
}, testInfo) => {
  await withTenantAcceptance(playwright, testInfo, async (ctx) => {
    const command = {
      name: "QA lifecycle tenant",
      code: `qa_life_${randomUUID().replaceAll("-", "_")}`,
      integrationMode: "api_key_and_webhook",
      sandboxBaseUrl: "https://qa-integration.example.invalid",
    };
    await ctx.negative(
      "platform-admin/tenants",
      "adminA",
      "POST",
      command,
      403,
    );
    const tenant = await ctx.data<{ id: string }>(
      "platform-admin/tenants",
      "platform",
      "POST",
      command,
    );
    ctx.evidence.recordResourceId("platform_tenant", tenant.id);
    const base = `platform-admin/tenants/${tenant.id}`;
    const sql =
      "SELECT record FROM admin.phase1_platform_tenants WHERE tenant_id=$1";
    const checkpoint = (expected: Record<string, unknown>) =>
      ctx.checkpoint({
        apiPath: base,
        actor: "platform",
        expected: { id: tenant.id, ...expected },
        sql,
        parameters: [tenant.id],
      });
    await checkpoint({ code: command.code, status: "active" });
    await ctx.negative(
      "platform-admin/tenants",
      "platform",
      "POST",
      command,
      409,
      "TENANT_CODE_CONFLICT",
    );
    await ctx.data(`${base}/settings`, "platform", "POST", {
      name: "QA lifecycle updated",
      quotas: { monthlyBookings: 37 },
    });
    await checkpoint({
      name: "QA lifecycle updated",
      quotas: { monthlyBookings: 37 },
    });
    await ctx.negative(
      `${base}/settings`,
      "platform",
      "POST",
      { quotas: { monthlyBookings: -1 } },
      400,
    );
    const integrationPackage = {
      mode: "api_key_and_webhook",
      apiKeyScopes: ["tenant:read"],
      sandboxBaseUrl: "https://updated.example.invalid",
      productionBaseUrl: null,
    };
    await ctx.data(`${base}/onboarding`, "platform", "POST", {
      integrationPackage,
    });
    await checkpoint({ integrationPackage });
    await ctx.negative(
      `${base}/onboarding`,
      "adminB",
      "POST",
      { integrationPackage: { mode: "none" } },
      403,
    );
    await ctx.data(`${base}/suspend`, "platform", "POST", {});
    await checkpoint({ status: "paused" });
    await ctx.data(`${base}/activate`, "platform", "POST", {});
    await checkpoint({ status: "active" });
    await ctx.negative(
      `platform-admin/tenants/missing-${randomUUID()}/activate`,
      "platform",
      "POST",
      {},
      404,
      "TENANT_NOT_FOUND",
    );
  });
});

test("Tenant feature flag override has durable isolated readback", async ({
  playwright,
}, testInfo) => {
  await withTenantAcceptance(playwright, testInfo, async (ctx) => {
    const key = "tenant-portal.reports";
    const flagPath = `admin/flags/${key}`;
    const globalBefore = await ctx.data<{ enabled: boolean }>(
      `${flagPath}/enabled`,
      "platform",
    );
    const otherBefore = await ctx.data<{ enabled: boolean }>(
      `${flagPath}/enabled`,
      "platform",
      "GET",
      undefined,
      ctx.tenantB,
    );
    const enabled = !globalBefore.enabled;
    const mutation = `${flagPath}/tenant-overrides?tenantId=${encodeURIComponent(ctx.tenantA)}`;
    await ctx.negative(mutation, "adminA", "POST", { enabled }, 403);
    await ctx.data(mutation, "platform", "POST", {
      enabled,
      description: "QA isolated override",
    });
    await ctx.checkpoint({
      apiPath: flagPath,
      actor: "platform",
      tenant: ctx.tenantA,
      expected: { key, enabled, tenantId: ctx.tenantA },
      sql: 'SELECT flag_key AS key, enabled, tenant_id AS "tenantId" FROM admin.feature_flags WHERE flag_key=$1 AND tenant_id=$2',
      parameters: [key, ctx.tenantA],
    });
    expect(
      await ctx.data(
        `${flagPath}/enabled`,
        "platform",
        "GET",
        undefined,
        ctx.tenantB,
      ),
    ).toMatchObject(otherBefore);
    expect(await ctx.data(`${flagPath}/enabled`, "platform")).toMatchObject(
      globalBefore,
    );
    expect(
      await ctx.data(`admin/flags/missing-${randomUUID()}/enabled`, "platform"),
    ).toMatchObject({ enabled: false });
  });
});
