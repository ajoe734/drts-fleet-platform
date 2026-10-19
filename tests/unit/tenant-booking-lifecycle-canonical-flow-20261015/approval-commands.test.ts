import { describe, expect, it } from "vitest";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import {
  harness,
  order,
  SqlTransport,
  deferred,
  tenantId,
  clone,
} from "./fixtures";

const requestTable = "core.phase1_tenant_approval_requests";
const decisionTable = "core.phase1_tenant_approval_decisions";
const ledgerTable = "core.phase1_tenant_quota_ledger";
const snapshotTable = "core.phase1_tenant_quota_monthly_snapshots";
async function approvalHarness(durable = true, consumed = false) {
  const audit = new AuditNotificationService();
  const tenant = new TenantPartnerService(audit);
  const costCenter = tenant
    .listCostCenters(tenantId)
    .find((row) => row.activeFlag)!.code;
  await tenant.upsertTenantQuotaPolicy(tenantId, {
    period: "monthly",
    limit: {
      bookingCountLimit: 10,
      amountMinorLimit: 5_000_000,
      currency: "TWD",
      enforcementMode: "require_approval",
    },
  });
  await tenant.upsertTenantQuotaPolicy(tenantId, {
    costCenterCode: costCenter,
    period: "monthly",
    limit: {
      bookingCountLimit: 10,
      amountMinorLimit: 5_000_000,
      currency: "TWD",
      enforcementMode: "require_approval",
    },
  });
  await tenant.upsertApprovalRule(tenantId, {
    ruleName: "Lifecycle finance approval",
    priority: 1,
    conditions: [{ field: "cost_center.code", op: "eq", value: costCenter }],
    action: "require_approval",
    approvalMode: "any_of",
    approvers: [{ kind: "tenant_finance_admin" }],
  });
  const h = harness(order(), undefined, tenant);
  const booking = await h.service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      costCenter,
      reservationWindowStart: new Date(Date.now() + 3 * 3600_000).toISOString(),
      pickup: { address: "A" },
      dropoff: { address: "B" },
      passenger: { name: "Lifecycle", phone: "0912000000" },
    },
    tenantId,
  );
  const request = tenant.listApprovalRequests(tenantId, {
    bookingId: booking.bookingId,
  })[0]!;
  expect(request.status).toBe("pending");
  if (consumed)
    await tenant.consumeTenantQuota({ tenantId, bookingId: booking.bookingId });
  const db = new SqlTransport(h.service.getOrder(booking.orderId));
  // Initial durable-row fixture includes the schema's aggregate_version=1.
  Object.assign(h.service, { orders: [clone(db.committed)] });
  const before = tenant.createGovernanceMutationSnapshot();
  db.tables[requestTable] = clone(before.approvalRequests) as unknown as Record<
    string,
    unknown
  >[];
  db.tables[decisionTable] = clone(
    before.approvalDecisions,
  ) as unknown as Record<string, unknown>[];
  db.tables[ledgerTable] = clone(before.quotaLedger) as unknown as Record<
    string,
    unknown
  >[];
  db.tables[snapshotTable] = clone(
    before.quotaMonthlySnapshots,
  ) as unknown as Record<string, unknown>[];
  const policies = (
    tenant as unknown as { quotaPolicies: Map<string, Record<string, unknown>> }
  ).quotaPolicies;
  db.tables["core.phase1_tenant_quota_policies"] = clone([
    ...policies.values(),
  ]);
  // Existing rows are seeded through real production creation, then the actual
  // repositories use only the controlled external SQL transport below.
  if (durable) {
    Object.assign(tenant, {
      tenantPartnerRepository: new TenantPartnerRepository(db as never),
    });
    Object.assign(h.service, {
      ownedMobilityRepository: new OwnedMobilityRepository(db as never),
    });
  }
  const controller = new TenantPartnerController(
    tenant,
    {} as never,
    h.service,
    {} as never,
    {} as never,
  );
  const actor = {
    actorType: "tenant_admin",
    actorId: request.resolvedApproverUserIds[0],
    realm: "tenant",
    tenantId,
  } as never;
  const decide = (action: "approve" | "reject" | "escalate" = "approve") =>
    action === "reject"
      ? controller.rejectApprovalRequest(
          request.approvalRequestId,
          { reasonCode: "budget_exceeded" },
          actor,
          tenantId,
          "lifecycle-reject",
        )
      : action === "escalate"
        ? controller.escalateApprovalRequest(
            request.approvalRequestId,
            {},
            {
              actorType: "tenant_admin",
              actorId: "tenant-user-demo-001",
              realm: "tenant",
              tenantId,
            } as never,
            tenantId,
            "lifecycle-escalate",
          )
        : controller.approveApprovalRequest(
            request.approvalRequestId,
            {},
            actor,
            tenantId,
            "lifecycle-approve",
          );
  return { ...h, tenant, controller, db, request, booking, before, decide };
}

describe("original mounted approval → request/decision/order/quota canonical closure", () => {
  it.each(["request", "order"] as const)(
    "rejects %s SQL failure without cache/decision poison, then permits original actor retry",
    async (failure) => {
      const h = await approvalHarness();
      const beforeOrder = h.service.getOrder(h.booking.orderId);
      h.db.failTable = failure === "request" ? requestTable : null;
      h.db.failWrite = failure === "order";
      await expect(h.decide()).rejects.toThrow("controlled real repository");
      expect(
        h.tenant.getApprovalRequest(tenantId, h.request.approvalRequestId),
      ).toEqual(h.request);
      expect(
        h.tenant.createGovernanceMutationSnapshot().approvalDecisions,
      ).toEqual(h.before.approvalDecisions);
      expect(h.service.getOrder(h.booking.orderId)).toEqual(beforeOrder);
      expect(h.db.tables[requestTable]![0]!.status).toBe("pending");
      expect(h.db.tables[decisionTable]).toHaveLength(0);
      h.db.failTable = null;
      h.db.failWrite = false;
      const result = await h.decide();
      expect(result.data.status).toBe("approved");
      expect(h.db.committed.approvalState).toBe("approved");
      expect(h.db.tables[decisionTable]).toHaveLength(1);
    },
  );
  it("does not publish request/decision/order until the shared transaction COMMIT ACK", async () => {
    const h = await approvalHarness();
    const hold = deferred();
    h.db.holdCommit = hold;
    let settled = false;
    const command = h.decide().then((result) => {
      settled = true;
      return result;
    });
    await h.db.enteredCommit.promise;
    const observed = {
      settled,
      request: h.tenant.getApprovalRequest(
        tenantId,
        h.request.approvalRequestId,
      ),
      order: h.service.getOrder(h.booking.orderId),
    };
    hold.resolve();
    await command;
    expect(observed.settled).toBe(false);
    expect(observed.request).toEqual(h.request);
    expect(observed.order.approvalState).toBe("pending");
    expect(
      h.tenant.getApprovalRequest(tenantId, h.request.approvalRequestId).status,
    ).toBe("approved");
    expect(h.service.getOrder(h.booking.orderId).approvalState).toBe(
      "approved",
    );
    const locks = h.db.statements.filter((sql) => sql.includes("FOR UPDATE"));
    expect(locks[0]).toContain("ops.phase1_owned_orders");
    expect(locks[1]).toContain(requestTable);
  });
  it("rejects a stale pending cache when the actual locked request already resolved", async () => {
    const h = await approvalHarness();
    h.db.tables[requestTable]![0]!.status = "approved";
    await expect(h.decide()).rejects.toBeDefined();
    expect(h.db.tables[decisionTable]).toHaveLength(0);
    expect(h.db.committed.approvalState).toBe("pending");
    expect(
      h.db.statements.filter(
        (sql) => sql.includes(requestTable) && sql.includes("FOR UPDATE"),
      ),
    ).toHaveLength(1);
  });
  it("rejection releases original tenant + cost-center outstanding reserve in the same transaction", async () => {
    const h = await approvalHarness();
    const reserved = clone(h.db.tables[ledgerTable]!);
    expect(
      reserved.filter((row) => row.dimension === "booking_count"),
    ).toHaveLength(2);
    const result = await h.decide("reject");
    expect(result.data.status).toBe("rejected");
    expect(h.db.committed.status).toBe("cancelled");
    expect(h.service.getOrder(h.booking.orderId).status).toBe("cancelled");
    const releases = h.db.tables[ledgerTable]!.filter(
      (row) => row.entryType === "release",
    );
    for (const reserve of reserved)
      expect(releases).toContainEqual(
        expect.objectContaining({
          tenantId: reserve.tenantId,
          bookingId: reserve.bookingId,
          costCenterCode: reserve.costCenterCode,
          periodKey: reserve.periodKey,
          dimension: reserve.dimension,
          amount: reserve.amount,
        }),
      );
    for (const snapshot of h.db.tables[snapshotTable]!)
      expect(
        (snapshot.usage as { pendingReservedBookingCount: number })
          .pendingReservedBookingCount,
      ).toBe(0);
    await expect(h.decide("reject")).rejects.toBeDefined();
    expect(
      h.db.tables[ledgerTable]!.filter((row) => row.entryType === "release"),
    ).toHaveLength(releases.length);
  });
  it("manual escalation remains pending/actionable with previous approvers after canonical ACK", async () => {
    const h = await approvalHarness();
    const result = await h.decide("escalate");
    expect(result.data.status).toBe("pending");
    expect(result.data.escalatedAt).toBeTruthy();
    expect(result.data.previousApprovers).toEqual(h.request.approvers);
    expect(h.db.committed.approvalState).toBe("pending");
    expect(h.db.committed.approvalRequestIds).toEqual([
      h.request.approvalRequestId,
    ]);
    expect(
      h.tenant.getApprovalRequest(tenantId, h.request.approvalRequestId),
    ).toEqual(result.data);
  });
  it("retains pending projections while the actual request SQL write is deferred", async () => {
    const h = await approvalHarness();
    const hold = deferred();
    h.db.holdRequestWrite = hold;
    const command = h.decide();
    await h.db.enteredRequestWrite.promise;
    const before = h.tenant.getApprovalRequest(
      tenantId,
      h.request.approvalRequestId,
    );
    hold.resolve();
    await command;
    expect(before).toEqual(h.request);
  });
  it.each([false, true])(
    "same-period same-center reschedule retains one reservation (durable=%s)",
    async (durable) => {
      const h = await approvalHarness(durable);
      const start = new Date(Date.now() + 5 * 3600_000).toISOString();
      const before = h.tenant.createGovernanceMutationSnapshot();
      await h.service.updateTenantBooking(tenantId, h.booking.bookingId, {
        reservationWindowStart: start,
      });
      const after = h.tenant.createGovernanceMutationSnapshot();
      expect(after.quotaLedger).toEqual(before.quotaLedger);
      expect(after.quotaMonthlySnapshots).toEqual(before.quotaMonthlySnapshots);
      expect(
        h.service.getTenantBooking(tenantId, h.booking.bookingId)
          .reservationWindowStart,
      ).toBe(start);
      if (durable) expect(h.db.tables[ledgerTable]).toEqual(before.quotaLedger);
    },
  );
  it("moves original period reserve with release+reserve, retries unchanged input without double count", async () => {
    const h = await approvalHarness();
    const next = new Date(Date.now());
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCHours(14, 0, 0, 0);
    const command = { reservationWindowStart: next.toISOString() };
    await h.service.updateTenantBooking(tenantId, h.booking.bookingId, command);
    const ledger = clone(h.db.tables[ledgerTable]!);
    expect(
      ledger.filter(
        (entry) =>
          entry.entryType === "release" && entry.dimension === "booking_count",
      ),
    ).toHaveLength(2);
    expect(
      ledger.filter(
        (entry) =>
          entry.entryType === "reserve" && entry.dimension === "booking_count",
      ),
    ).toHaveLength(4);
    const snapshots =
      h.tenant.createGovernanceMutationSnapshot().quotaMonthlySnapshots;
    const originalPeriod = h.before.quotaMonthlySnapshots[0]!.periodKey;
    expect(
      snapshots
        .filter((snapshot) => snapshot.periodKey === originalPeriod)
        .every((snapshot) => snapshot.usage.pendingReservedBookingCount === 0),
    ).toBe(true);
    expect(
      snapshots
        .filter((snapshot) => snapshot.periodKey !== originalPeriod)
        .every((snapshot) => snapshot.usage.pendingReservedBookingCount === 1),
    ).toBe(true);
    await h.service.updateTenantBooking(tenantId, h.booking.bookingId, command);
    expect(h.db.tables[ledgerTable]).toEqual(ledger);
  });
  it("keeps consumed booking counts/amounts in billing when re-evaluating an edit", async () => {
    const h = await approvalHarness(true, true);
    const before = h.tenant.createGovernanceMutationSnapshot();
    await h.service.updateTenantBooking(tenantId, h.booking.bookingId, {
      reservationWindowStart: new Date(Date.now() + 5 * 3600_000).toISOString(),
    });
    const after = h.tenant.createGovernanceMutationSnapshot();
    expect(after.quotaLedger).toEqual(before.quotaLedger);
    expect(after.quotaMonthlySnapshots).toEqual(before.quotaMonthlySnapshots);
    expect(
      before.quotaMonthlySnapshots.every(
        (snapshot) => snapshot.usage.confirmedBookingCount === 1,
      ),
    ).toBe(true);
  });
  it("rolls back delta ledger/order/request changes on a quota SQL failure", async () => {
    const h = await approvalHarness();
    const before = h.tenant.createGovernanceMutationSnapshot();
    const beforeOrder = h.service.getOrder(h.booking.orderId);
    h.db.failTable = ledgerTable;
    const next = new Date(Date.now());
    next.setUTCMonth(next.getUTCMonth() + 1);
    await expect(
      h.service.updateTenantBooking(tenantId, h.booking.bookingId, {
        reservationWindowStart: next.toISOString(),
      }),
    ).rejects.toThrow("controlled real repository");
    expect(h.tenant.createGovernanceMutationSnapshot()).toEqual(before);
    expect(h.service.getOrder(h.booking.orderId)).toEqual(beforeOrder);
    expect(h.db.tables[ledgerTable]).toEqual(before.quotaLedger);
    expect(h.db.committed.reservationWindowStart).toBe(
      beforeOrder.reservationWindowStart,
    );
  });
});
