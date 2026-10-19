import { describe, expect, it, vi } from "vitest";
import type { TenantApprovalMode } from "@drts/contracts";
import type { AuditNotificationEmailAdapter } from "../../../apps/api/src/modules/audit-notification/audit-notification.email-adapter";
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
async function approvalHarness(
  durable = true,
  consumed = false,
  mode: TenantApprovalMode = "any_of",
) {
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
    approvalMode: mode,
    approvers:
      mode === "any_of"
        ? [{ kind: "tenant_finance_admin" }]
        : [{ kind: "tenant_finance_admin" }, { kind: "tenant_admin" }],
  });
  const h = harness(order(), undefined, tenant);
  const booking = await h.service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      costCenter,
      reservationWindowStart: new Date(Date.now() + 3 * 3600_000).toISOString(),
      reservationWindowEnd: new Date(Date.now() + 4 * 3600_000).toISOString(),
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
  const opsActor = {
    actorType: "ops_user",
    actorId: "ops-lifecycle-reviewer",
    realm: "ops",
    roles: ["ops_dispatcher"],
  } as never;
  const opsDecide = (action: "approve" | "reject" | "escalate" = "approve") =>
    action === "reject"
      ? controller.rejectOpsApprovalRequest(
          request.approvalRequestId,
          { reasonCode: "budget_exceeded" },
          opsActor,
          "ops-lifecycle-reject",
        )
      : action === "escalate"
        ? controller.escalateOpsApprovalRequest(
            request.approvalRequestId,
            {},
            opsActor,
            "ops-lifecycle-escalate",
          )
        : controller.approveOpsApprovalRequest(
            request.approvalRequestId,
            {},
            opsActor,
            "ops-lifecycle-approve",
          );
  return {
    ...h,
    tenant,
    controller,
    db,
    request,
    booking,
    before,
    decide,
    opsDecide,
    opsActor,
    tenantAudit: audit,
  };
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
  it("moves only the original cost-center reserve and keeps the tenant total at one", async () => {
    const h = await approvalHarness();
    const previous = h.db.committed.costCenter;
    const other = h.tenant
      .listCostCenters(tenantId)
      .find((row) => row.activeFlag && row.code !== previous)!;
    expect(other).toBeDefined();
    await h.service.updateTenantBooking(tenantId, h.booking.bookingId, {
      costCenter: other.code,
    });
    const snapshots =
      h.tenant.createGovernanceMutationSnapshot().quotaMonthlySnapshots;
    expect(
      snapshots.find((row) => row.costCenterCode === null)!.usage
        .pendingReservedBookingCount,
    ).toBe(1);
    expect(
      snapshots.find((row) => row.costCenterCode === previous)!.usage
        .pendingReservedBookingCount,
    ).toBe(0);
    expect(
      snapshots.find((row) => row.costCenterCode === other.code)!.usage
        .pendingReservedBookingCount,
    ).toBe(1);
    const ledger = clone(h.db.tables[ledgerTable]!);
    await h.service.updateTenantBooking(tenantId, h.booking.bookingId, {
      costCenter: other.code,
    });
    expect(h.db.tables[ledgerTable]).toEqual(ledger);
  });
  it("can move back to an original period and reject the current request without stranded/double release", async () => {
    const h = await approvalHarness();
    const later = new Date(Date.now());
    later.setUTCMonth(later.getUTCMonth() + 1);
    later.setUTCHours(14, 0, 0, 0);
    await h.service.updateTenantBooking(tenantId, h.booking.bookingId, {
      reservationWindowStart: later.toISOString(),
    });
    await h.service.updateTenantBooking(tenantId, h.booking.bookingId, {
      reservationWindowStart: new Date(Date.now() + 5 * 3600_000).toISOString(),
    });
    const current = h.tenant.listApprovalRequests(tenantId, {
      bookingId: h.booking.bookingId,
      status: "pending",
    })[0]!;
    expect(
      h.service.getTenantBooking(tenantId, h.booking.bookingId)
        .approvalRequestIds,
    ).toEqual([current.approvalRequestId]);
    await h.controller.rejectApprovalRequest(
      current.approvalRequestId,
      { reasonCode: "budget_exceeded" },
      {
        actorType: "tenant_admin",
        realm: "tenant",
        actorId: current.resolvedApproverUserIds[0],
        tenantId,
      } as never,
      tenantId,
    );
    expect(h.db.committed.status).toBe("cancelled");
    expect(
      h.tenant
        .createGovernanceMutationSnapshot()
        .quotaMonthlySnapshots.every(
          (row) =>
            row.usage.pendingReservedBookingCount === 0 &&
            row.usage.pendingReservedAmountMinor === 0,
        ),
    ).toBe(true);
  });
});

describe("C025 actual Ops Controller decision → durable order/quota/audit closure", () => {
  it("Ops approve updates the same durable order and retains the original Ops actor audit", async () => {
    const h = await approvalHarness();
    const result = await h.opsDecide();
    expect(result.data.status).toBe("approved");
    expect(h.db.committed.approvalState).toBe("approved");
    expect(h.service.getOrder(h.booking.orderId).approvalState).toBe(
      "approved",
    );
    expect(
      h.tenant.getApprovalRequest(tenantId, h.request.approvalRequestId)
        .decisions,
    ).toHaveLength(1);
    expect(h.tenantAudit.getAuditLogsSnapshot()).toContainEqual(
      expect.objectContaining({
        actionName: "booking.approval_request.approved",
        actorId: "ops-lifecycle-reviewer",
        actorType: "ops_user",
        resourceId: h.booking.bookingId,
      }),
    );
  });
  it("Ops reject cancels the same order and releases tenant and cost-center reserves exactly once", async () => {
    const h = await approvalHarness();
    const result = await h.opsDecide("reject");
    expect(result.data.status).toBe("rejected");
    expect(h.db.committed.status).toBe("cancelled");
    const releases = h.db.tables[ledgerTable]!.filter(
      (row) => row.entryType === "release",
    );
    expect(releases).toHaveLength(h.before.quotaLedger.length);
    for (const snapshot of h.db.tables[snapshotTable]!)
      expect(
        (snapshot.usage as { pendingReservedBookingCount: number })
          .pendingReservedBookingCount,
      ).toBe(0);
    await expect(h.opsDecide("reject")).rejects.toBeDefined();
    expect(
      h.db.tables[ledgerTable]!.filter((row) => row.entryType === "release"),
    ).toHaveLength(releases.length);
  });
  it.each(["request", "order"] as const)(
    "Ops %s SQL rejection retains request/decision/order and allows retry",
    async (failure) => {
      const h = await approvalHarness();
      h.db.failTable = failure === "request" ? requestTable : null;
      h.db.failWrite = failure === "order";
      await expect(h.opsDecide()).rejects.toThrow("controlled real repository");
      expect(
        h.tenant.getApprovalRequest(tenantId, h.request.approvalRequestId),
      ).toEqual(h.request);
      expect(
        h.tenant.createGovernanceMutationSnapshot().approvalDecisions,
      ).toEqual(h.before.approvalDecisions);
      expect(h.db.tables[requestTable]![0]!.status).toBe("pending");
      expect(h.db.committed.approvalState).toBe("pending");
      h.db.failTable = null;
      h.db.failWrite = false;
      expect((await h.opsDecide()).data.status).toBe("approved");
      expect(h.db.committed.approvalState).toBe("approved");
    },
  );
  it("Ops escalate performs the order write before ACK rather than independent request-only success", async () => {
    const h = await approvalHarness();
    h.db.failWrite = true;
    await expect(h.opsDecide("escalate")).rejects.toThrow(
      "controlled real repository",
    );
    expect(
      h.tenant.getApprovalRequest(tenantId, h.request.approvalRequestId),
    ).toEqual(h.request);
    expect(h.db.tables[requestTable]![0]!.escalatedAt).toBe(
      h.request.escalatedAt,
    );
    h.db.failWrite = false;
    const result = await h.opsDecide("escalate");
    expect(result.data.status).toBe("pending");
    expect(result.data.escalatedAt).toBeTruthy();
    expect(h.db.committed.approvalRequestIds).toEqual([
      h.request.approvalRequestId,
    ]);
  });
});

describe("C025 Ops current authority and acknowledgement preservation", () => {
  it.each(["approve", "reject", "escalate"] as const)(
    "Ops %s awaits shared COMMIT with no tentative request/order/audit visibility",
    async (action) => {
      const h = await approvalHarness();
      const hold = deferred();
      h.db.holdCommit = hold;
      const auditCount = h.tenantAudit.getAuditLogsSnapshot().length;
      let settled = false;
      const command = h.opsDecide(action).then((result) => {
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
        auditCount: h.tenantAudit.getAuditLogsSnapshot().length,
      };
      hold.resolve();
      await command;
      expect(observed.settled).toBe(false);
      expect(observed.request).toEqual(h.request);
      expect(observed.order.approvalState).toBe("pending");
      expect(observed.auditCount).toBe(auditCount);
      const locks = h.db.statements.filter((sql) => sql.includes("FOR UPDATE"));
      expect(locks[0]).toContain("ops.phase1_owned_orders");
      expect(locks[1]).toContain(requestTable);
    },
  );
  it("discovers the canonical Ops tenant/order even when the worker request cache is empty", async () => {
    const h = await approvalHarness();
    Object.assign(h.tenant, { approvalRequests: [] });
    const result = await h.opsDecide();
    expect(result.data.tenantId).toBe(tenantId);
    expect(h.db.committed.approvalState).toBe("approved");
  });
  it("rejects a canonical resolved request despite a stale pending Ops cache", async () => {
    const h = await approvalHarness();
    h.db.tables[requestTable]![0]!.status = "approved";
    await expect(h.opsDecide()).rejects.toMatchObject({
      code: "APPROVAL_REQUEST_NOT_PENDING",
    });
    expect(h.db.tables[decisionTable]).toHaveLength(0);
    expect(h.db.committed.approvalState).toBe("pending");
  });
  it.each(["approve", "reject", "escalate"] as const)(
    "preserves the existing Ops guard for %s before any write",
    async (action) => {
      const h = await approvalHarness();
      const invalid = {
        actorType: "tenant_admin",
        actorId: "tenant-user-demo-001",
        realm: "tenant",
        tenantId,
      } as never;
      const call =
        action === "approve"
          ? h.controller.approveOpsApprovalRequest(
              h.request.approvalRequestId,
              {},
              invalid,
            )
          : action === "reject"
            ? h.controller.rejectOpsApprovalRequest(
                h.request.approvalRequestId,
                { reasonCode: "budget_exceeded" },
                invalid,
              )
            : h.controller.escalateOpsApprovalRequest(
                h.request.approvalRequestId,
                {},
                invalid,
              );
      await expect(call).rejects.toMatchObject({
        code: "APPROVAL_NOT_AUTHORIZED",
      });
      expect(h.db.statements).toHaveLength(0);
      expect(
        h.tenant.getApprovalRequest(tenantId, h.request.approvalRequestId),
      ).toEqual(h.request);
    },
  );
  it.each(["approve", "reject", "escalate"] as const)(
    "preserves lawful Ops %s and original output shape in noDB mode",
    async (action) => {
      const h = await approvalHarness(false);
      const result = await h.opsDecide(action);
      expect(result.data.availableActions).toBeDefined();
      expect(h.service.getOrder(h.booking.orderId).approvalState).toBe(
        action === "approve"
          ? "approved"
          : action === "reject"
            ? "rejected"
            : "pending",
      );
      if (action === "reject")
        expect(h.service.getOrder(h.booking.orderId).status).toBe("cancelled");
      if (action === "escalate") expect(result.data.escalatedAt).toBeTruthy();
    },
  );
  it("serializes a Tenant approval against an Ops rejection without double decisions or quota release", async () => {
    const h = await approvalHarness();
    const results = await Promise.allSettled([
      h.opsDecide("reject"),
      h.decide(),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(h.db.tables[decisionTable]).toHaveLength(1);
    expect(h.db.committed.status).toBe("cancelled");
    expect(
      h.db.tables[ledgerTable]!.filter((row) => row.entryType === "release"),
    ).toHaveLength(h.before.quotaLedger.length);
  });
});

describe("original noDB same-request approval command coherence", () => {
  it("allows only one same-actor approval ACK, decision and audit for simultaneous actual Controller calls", async () => {
    const h = await approvalHarness(false);
    const before =
      h.tenant.createGovernanceMutationSnapshot().approvalDecisions.length;
    const results = await Promise.allSettled([h.decide(), h.decide()]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect([
      "APPROVAL_REQUEST_NOT_PENDING",
      "APPROVAL_DECISION_ALREADY_RECORDED",
    ]).toContain(rejected.reason.code);
    const after = h.tenant.createGovernanceMutationSnapshot();
    expect(after.approvalDecisions.length - before).toBe(1);
    const current = h.tenant.getApprovalRequest(
      tenantId,
      h.request.approvalRequestId,
    );
    expect(current.decisions).toHaveLength(1);
    expect(
      after.approvalDecisions.filter(
        (row) => row.approvalRequestId === current.approvalRequestId,
      ),
    ).toEqual(current.decisions);
    expect(
      h.tenantAudit
        .getAuditLogsSnapshot()
        .filter(
          (row) =>
            row.resourceId === h.booking.bookingId &&
            row.actionName === "booking.approval_request.approved",
        ),
    ).toHaveLength(1);
    expect(h.service.getOrder(h.booking.orderId).approvalState).toBe(
      "approved",
    );
  });
  it.each(["all_of_parallel", "ordered_chain"] as const)(
    "retains both lawful distinct decisions and current order for existing %s semantics",
    async (mode) => {
      const h = await approvalHarness(false, false, mode);
      expect(h.request.resolvedApproverUserIds).toHaveLength(2);
      const approve = (actorId: string) =>
        h.controller.approveApprovalRequest(
          h.request.approvalRequestId,
          {},
          {
            realm: "tenant",
            actorType: "tenant_admin",
            tenantId,
            actorId,
          } as never,
          tenantId,
        );
      const results = await Promise.all(
        h.request.resolvedApproverUserIds.map(approve),
      );
      expect(results.map((result) => result.data.status)).toEqual([
        "pending",
        "approved",
      ]);
      const current = h.tenant.getApprovalRequest(
        tenantId,
        h.request.approvalRequestId,
      );
      expect(current.decisions).toHaveLength(2);
      expect(
        new Set(current.decisions.map((row) => row.actorUserId)).size,
      ).toBe(2);
      expect(
        h.tenant
          .createGovernanceMutationSnapshot()
          .approvalDecisions.filter(
            (row) => row.approvalRequestId === current.approvalRequestId,
          ),
      ).toHaveLength(2);
      expect(h.service.getOrder(h.booking.orderId).approvalState).toBe(
        "approved",
      );
      expect(h.service.getOrder(h.booking.orderId).approvalRequestIds).toEqual(
        [],
      );
    },
  );
  it("serializes actual noDB Tenant approve and Ops reject without contradictory receipts or release", async () => {
    const h = await approvalHarness(false);
    const results = await Promise.allSettled([
      h.opsDecide("reject"),
      h.decide(),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const current = h.tenant.getApprovalRequest(
      tenantId,
      h.request.approvalRequestId,
    );
    expect(current.status).toBe("rejected");
    expect(current.decisions).toHaveLength(1);
    expect(h.service.getOrder(h.booking.orderId).status).toBe("cancelled");
    expect(
      h.tenant
        .createGovernanceMutationSnapshot()
        .quotaLedger.filter((row) => row.entryType === "release"),
    ).toHaveLength(h.before.quotaLedger.length);
  });
  it("preserves original standalone Tenant same-actor conflict rather than duplicate decisions", async () => {
    const h = await approvalHarness(false);
    const command = () =>
      h.tenant.approveApprovalRequest({
        tenantId,
        approvalRequestId: h.request.approvalRequestId,
        actorUserId: h.request.resolvedApproverUserIds[0]!,
        actorRoleCode: null,
        command: {},
      });
    const results = await Promise.allSettled([command(), command()]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      h.tenant.getApprovalRequest(tenantId, h.request.approvalRequestId)
        .decisions,
    ).toHaveLength(1);
    expect(
      h.tenant
        .createGovernanceMutationSnapshot()
        .approvalDecisions.filter(
          (row) => row.approvalRequestId === h.request.approvalRequestId,
        ),
    ).toHaveLength(1);
  });
  it("releases same-request sequencing after a rejected original actor and permits lawful queued retry", async () => {
    const h = await approvalHarness(false);
    const invalid = h.controller.approveApprovalRequest(
      h.request.approvalRequestId,
      {},
      {
        realm: "tenant",
        actorType: "tenant_admin",
        tenantId,
        actorId: "not-the-resolved-approver",
      } as never,
      tenantId,
    );
    const results = await Promise.allSettled([invalid, h.decide()]);
    expect(results[0]).toMatchObject({
      status: "rejected",
      reason: { code: "APPROVAL_NOT_AUTHORIZED" },
    });
    expect(results[1]).toMatchObject({
      status: "fulfilled",
      value: { data: { status: "approved" } },
    });
    expect(
      h.tenant.getApprovalRequest(tenantId, h.request.approvalRequestId)
        .decisions,
    ).toHaveLength(1);
  });
});

it("independent noDB approval requests progress while another request awaits its external notification port", async () => {
  const h = await approvalHarness(false);
  const second = await h.service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      costCenter: h.request.evaluationSnapshot.inputSnapshot!.costCenterCode!,
      reservationWindowStart: new Date(Date.now() + 3 * 3600_000).toISOString(),
      reservationWindowEnd: new Date(Date.now() + 4 * 3600_000).toISOString(),
      pickup: { address: "Independent A" },
      dropoff: { address: "Independent B" },
      passenger: { name: "Independent", phone: "0912000000" },
    },
    tenantId,
  );
  const secondRequest = h.tenant.listApprovalRequests(tenantId, {
    bookingId: second.bookingId,
  })[0]!;
  const held = deferred(),
    entered = deferred();
  const adapter = (
    h.tenantAudit as unknown as {
      auditNotificationEmailAdapter: AuditNotificationEmailAdapter;
    }
  ).auditNotificationEmailAdapter;
  const original = adapter.send.bind(adapter);
  const mock = vi.spyOn(adapter, "send").mockImplementation(async (input) => {
    if (
      input.approvalRequestId === h.request.approvalRequestId &&
      input.templateKey === "approved"
    ) {
      entered.resolve();
      await held.promise;
    }
    return original(input);
  });
  const first = h.decide();
  await entered.promise;
  let settled = false;
  const next = h.controller
    .approveApprovalRequest(
      secondRequest.approvalRequestId,
      {},
      {
        actorType: "tenant_admin",
        realm: "tenant",
        tenantId,
        actorId: secondRequest.resolvedApproverUserIds[0],
      } as never,
      tenantId,
    )
    .then((value) => {
      settled = true;
      return value;
    });
  try {
    await vi.waitFor(() => expect(settled).toBe(true));
    expect((await next).data.status).toBe("approved");
    expect(h.service.getOrder(second.orderId).approvalState).toBe("approved");
  } finally {
    held.resolve();
    await first;
    mock.mockRestore();
  }
});
