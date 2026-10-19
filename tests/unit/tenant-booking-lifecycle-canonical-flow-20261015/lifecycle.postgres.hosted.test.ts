import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  TenantUserRoleRecord,
  OwnedOrderRecord,
  TenantQuotaPolicyRecord,
} from "@drts/contracts";
import { DatabaseService } from "../../../apps/api/src/common/db";
import { AuditNotificationService } from "../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityRepository } from "../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { TenantPartnerService } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.service";
import { TenantPartnerRepository } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerController } from "../../../apps/api/src/modules/tenant-partner/tenant-partner.controller";
import { harness, order, deferred } from "./fixtures";

// Existing mandatory ci-integ root shards apply the official migrations.
// This opens no PG connection on the VM; actual execution is hosted only.
const hosted =
  process.env.GITHUB_ACTIONS === "true" && Boolean(process.env.DATABASE_URL);
async function cleanup(db: DatabaseService, tenantId: string) {
  await db.query(
    "DELETE FROM core.phase1_tenant_approval_decisions WHERE approval_request_id IN (SELECT approval_request_id FROM core.phase1_tenant_approval_requests WHERE tenant_id=$1)",
    [tenantId],
  );
  for (const table of [
    "core.phase1_tenant_approval_requests",
    "core.phase1_tenant_quota_ledger",
    "core.phase1_tenant_quota_monthly_snapshots",
    "core.phase1_tenant_quota_policies",
  ])
    await db.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [tenantId]);
  await db.query(
    "DELETE FROM ops.phase1_dispatch_trace_logs WHERE order_id IN (SELECT order_id FROM ops.phase1_owned_orders WHERE tenant_id=$1)",
    [tenantId],
  );
  await db.query("DELETE FROM ops.phase1_owned_orders WHERE tenant_id=$1", [
    tenantId,
  ]);
}
function transport(
  db: DatabaseService,
  options: {
    failTable?: string | null;
    holdCommit?: ReturnType<typeof deferred> | null;
    entered?: ReturnType<typeof deferred>;
  },
) {
  return {
    isEnabled: () => true,
    query: db.query.bind(db),
    connect: async () => {
      const client = await db.connect();
      return {
        query: async (sql: string, values?: unknown[]) => {
          if (
            options.failTable &&
            (sql.includes(`INSERT INTO ${options.failTable}`) ||
              sql.includes(`UPDATE ${options.failTable}`))
          )
            throw new Error("controlled hosted SQL write failure");
          if (sql.trim() === "COMMIT" && options.holdCommit) {
            options.entered?.resolve();
            await options.holdCommit.promise;
          }
          return client.query(sql, values);
        },
        release: () => client.release(),
      };
    },
  };
}
async function approval(
  db: DatabaseService,
  tenantId: string,
  options: Parameters<typeof transport>[1],
) {
  const audit = new AuditNotificationService();
  const tenant = new TenantPartnerService(audit);
  const users: TenantUserRoleRecord[] = tenant
    .listTenantUsers("tenant-demo-001")
    .map((user) => ({ ...user, tenantId, userId: randomUUID() }));
  Object.assign(tenant, { userRoles: users });
  await tenant.upsertTenantQuotaPolicy(tenantId, {
    period: "monthly",
    limit: {
      bookingCountLimit: 10,
      amountMinorLimit: 5_000_000,
      currency: "TWD",
      enforcementMode: "require_approval",
    },
  });
  await tenant.upsertApprovalRule(tenantId, {
    ruleName: "Official schema lifecycle",
    priority: 1,
    conditions: [{ field: "booking.amount_minor", op: "gte", value: 0 }],
    action: "require_approval",
    approvalMode: "any_of",
    approvers: [{ kind: "tenant_finance_admin" }],
  });
  const h = harness(order({ tenantId }), undefined, tenant);
  const booking = await h.service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: new Date(Date.now() + 3 * 3600_000).toISOString(),
      reservationWindowEnd: new Date(Date.now() + 4 * 3600_000).toISOString(),
      pickup: { address: "A" },
      dropoff: { address: "B" },
      passenger: { name: "Hosted fixture", phone: "0912000000" },
    },
    tenantId,
  );
  const request = tenant.listApprovalRequests(tenantId, {
    bookingId: booking.bookingId,
  })[0]!;
  expect(request.status).toBe("pending");
  const tenantRepo = new TenantPartnerRepository(db);
  const ownedRepo = new OwnedMobilityRepository(
    transport(db, options) as never,
  );
  const snapshot = tenant.createGovernanceMutationSnapshot();
  const policies = [
    ...(
      tenant as unknown as {
        quotaPolicies: Map<string, TenantQuotaPolicyRecord>;
      }
    ).quotaPolicies.values(),
  ];
  await tenantRepo.persistChanges({
    approvalRequests: snapshot.approvalRequests,
    approvalDecisions: snapshot.approvalDecisions,
    quotaLedger: snapshot.quotaLedger,
    quotaMonthlySnapshots: snapshot.quotaMonthlySnapshots,
    quotaPolicies: policies,
  });
  await ownedRepo.persistChanges({
    orders: [h.service.getOrder(booking.orderId)],
  });
  Object.assign(tenant, { tenantPartnerRepository: tenantRepo });
  Object.assign(h.service, { ownedMobilityRepository: ownedRepo });
  const controller = new TenantPartnerController(
    tenant,
    {} as never,
    h.service,
    {} as never,
    {} as never,
  );
  const actor = {
    realm: "tenant",
    actorType: "tenant_admin",
    tenantId,
    actorId: request.resolvedApproverUserIds[0],
  } as never;
  return { ...h, tenant, booking, request, controller, actor, snapshot };
}

describe.skipIf(!hosted)(
  "Tenant official-schema canonical lifecycle (hosted only)",
  () => {
    it("serializes actual normal cancellation and stale replica PUT without resurrection", async () => {
      const db = new DatabaseService();
      const tenantId = `tenant-lifecycle-${randomUUID()}`;
      const initial = order({
        tenantId,
        orderId: randomUUID(),
        bookingId: randomUUID(),
      });
      const repo = new OwnedMobilityRepository(db);
      const entered = deferred();
      const hold = deferred();
      const options = { entered, holdCommit: hold };
      const a = harness(initial);
      const b = harness(initial);
      Object.assign(a.service, { ownedMobilityRepository: repo });
      Object.assign(b.service, {
        ownedMobilityRepository: new OwnedMobilityRepository(
          transport(db, options) as never,
        ),
      });
      try {
        await repo.persistChanges({ orders: [initial] });
        const cancellation = b.service.cancelTenantBooking(
          tenantId,
          initial.bookingId!,
          { reason: "hosted cancellation" },
        );
        await entered.promise;
        const mutation = a.controller
          .updateTenantBooking(
            initial.bookingId!,
            { notes: "stale replica" },
            null,
            tenantId,
          )
          .catch((error: unknown) => error);
        hold.resolve();
        await cancellation;
        expect(await mutation).toMatchObject({ code: "ORDER_NOT_MODIFIABLE" });
        const current = await repo.findOrderByBookingId(
          initial.bookingId!,
          tenantId,
        );
        expect(current?.status).toBe("cancelled");
        expect(current?.notes).toBe(initial.notes);
        expect(a.service.getOrder(initial.orderId).status).toBe("cancelled");
      } finally {
        hold.resolve();
        await cleanup(db, tenantId);
        await db.onModuleDestroy();
      }
    });
    it("rolls back actual request/decision/order on rejected SQL, then rejects with one original quota release", async () => {
      const db = new DatabaseService();
      const tenantId = `tenant-lifecycle-${randomUUID()}`;
      const options = { failTable: "ops.phase1_owned_orders" as string | null };
      try {
        const h = await approval(db, tenantId, options);
        const decide = () =>
          h.controller.rejectApprovalRequest(
            h.request.approvalRequestId,
            { reasonCode: "budget_exceeded" },
            h.actor,
            tenantId,
          );
        await expect(decide()).rejects.toThrow(
          "controlled hosted SQL write failure",
        );
        const request = await db.query<{ record: { status: string } }>(
          "SELECT record FROM core.phase1_tenant_approval_requests WHERE approval_request_id=$1",
          [h.request.approvalRequestId],
        );
        expect(request.rows[0]!.record.status).toBe("pending");
        const decisions = await db.query<{ count: string }>(
          "SELECT count(*) FROM core.phase1_tenant_approval_decisions WHERE approval_request_id=$1",
          [h.request.approvalRequestId],
        );
        expect(Number(decisions.rows[0]!.count)).toBe(0);
        expect(
          h.tenant.getApprovalRequest(tenantId, h.request.approvalRequestId),
        ).toEqual(h.request);
        options.failTable = null;
        const result = await decide();
        expect(result.data.status).toBe("rejected");
        const orderRead = await db.query<{ record: OwnedOrderRecord }>(
          "SELECT record FROM ops.phase1_owned_orders WHERE order_id=$1",
          [h.booking.orderId],
        );
        expect(orderRead.rows[0]!.record.status).toBe("cancelled");
        const snapshots = await db.query<{
          record: { usage: { pendingReservedBookingCount: number } };
        }>(
          "SELECT record FROM core.phase1_tenant_quota_monthly_snapshots WHERE tenant_id=$1",
          [tenantId],
        );
        expect(
          snapshots.rows.every(
            (row) => row.record.usage.pendingReservedBookingCount === 0,
          ),
        ).toBe(true);
        const beforeCount = await db.query<{ count: string }>(
          "SELECT count(*) FROM core.phase1_tenant_quota_ledger WHERE tenant_id=$1 AND entry_type='release'",
          [tenantId],
        );
        expect(Number(beforeCount.rows[0]!.count)).toBeGreaterThan(0);
        await expect(decide()).rejects.toBeDefined();
        const afterCount = await db.query<{ count: string }>(
          "SELECT count(*) FROM core.phase1_tenant_quota_ledger WHERE tenant_id=$1 AND entry_type='release'",
          [tenantId],
        );
        expect(afterCount.rows[0]!.count).toBe(beforeCount.rows[0]!.count);
      } finally {
        await cleanup(db, tenantId);
        await db.onModuleDestroy();
      }
    });
    it.each(["approve", "reject", "escalate"] as const)(
      "actual Ops %s rolls back failed order SQL and commits request/order/quota together on retry",
      async (action) => {
        const db = new DatabaseService();
        const tenantId = `tenant-lifecycle-${randomUUID()}`;
        const options = {
          failTable: "ops.phase1_owned_orders" as string | null,
        };
        try {
          const h = await approval(db, tenantId, options);
          const actor = {
            realm: "ops",
            actorType: "ops_user",
            actorId: "ops-lifecycle-hosted",
            roles: ["ops_dispatcher"],
          } as never;
          const decide = () =>
            action === "approve"
              ? h.controller.approveOpsApprovalRequest(
                  h.request.approvalRequestId,
                  {},
                  actor,
                )
              : action === "reject"
                ? h.controller.rejectOpsApprovalRequest(
                    h.request.approvalRequestId,
                    { reasonCode: "budget_exceeded" },
                    actor,
                  )
                : h.controller.escalateOpsApprovalRequest(
                    h.request.approvalRequestId,
                    {},
                    actor,
                  );
          await expect(decide()).rejects.toThrow(
            "controlled hosted SQL write failure",
          );
          const failedRequest = await new TenantPartnerRepository(
            db,
          ).findApprovalRequest(tenantId, h.request.approvalRequestId);
          expect(failedRequest).toEqual(h.request);
          expect(
            h.tenant.getApprovalRequest(tenantId, h.request.approvalRequestId),
          ).toEqual(h.request);
          options.failTable = null;
          const result = await decide();
          const currentRequest = await new TenantPartnerRepository(
            db,
          ).findApprovalRequest(tenantId, h.request.approvalRequestId);
          const currentOrder = await new OwnedMobilityRepository(
            db,
          ).findOrderByBookingId(h.booking.bookingId, tenantId);
          expect(currentRequest?.status).toBe(
            action === "approve"
              ? "approved"
              : action === "reject"
                ? "rejected"
                : "pending",
          );
          expect(result.data.availableActions).toBeDefined();
          expect(currentOrder?.approvalState).toBe(currentRequest?.status);
          if (action === "reject") {
            expect(currentOrder?.status).toBe("cancelled");
            const snapshots = await db.query<{
              record: { usage: { pendingReservedBookingCount: number } };
            }>(
              "SELECT record FROM core.phase1_tenant_quota_monthly_snapshots WHERE tenant_id=$1",
              [tenantId],
            );
            expect(snapshots.rows.length).toBeGreaterThan(0);
            expect(
              snapshots.rows.every(
                (row) => row.record.usage.pendingReservedBookingCount === 0,
              ),
            ).toBe(true);
          } else if (action === "escalate") {
            expect(currentRequest?.escalatedAt).toBeTruthy();
            expect(currentOrder?.approvalRequestIds).toEqual([
              h.request.approvalRequestId,
            ]);
          }
        } finally {
          await cleanup(db, tenantId);
          await db.onModuleDestroy();
        }
      },
    );
    it("preserves the same-booking reservation on same-period edit and moves only the original period delta", async () => {
      const db = new DatabaseService();
      const tenantId = `tenant-lifecycle-${randomUUID()}`;
      try {
        const h = await approval(db, tenantId, {});
        await h.service.updateTenantBooking(tenantId, h.booking.bookingId, {
          reservationWindowStart: new Date(
            Date.now() + 5 * 3600_000,
          ).toISOString(),
        });
        const same = await db.query<{ count: string }>(
          "SELECT count(*) FROM core.phase1_tenant_quota_ledger WHERE tenant_id=$1 AND dimension='booking_count'",
          [tenantId],
        );
        expect(Number(same.rows[0]!.count)).toBe(1);
        const next = new Date(Date.now());
        next.setUTCMonth(next.getUTCMonth() + 1);
        next.setUTCHours(14, 0, 0, 0);
        const command = { reservationWindowStart: next.toISOString() };
        await h.service.updateTenantBooking(
          tenantId,
          h.booking.bookingId,
          command,
        );
        const snapshots = await db.query<{
          record: {
            periodKey: string;
            usage: { pendingReservedBookingCount: number };
          };
        }>(
          "SELECT record FROM core.phase1_tenant_quota_monthly_snapshots WHERE tenant_id=$1 ORDER BY period_key",
          [tenantId],
        );
        expect(snapshots.rows).toHaveLength(2);
        expect(
          snapshots.rows.map(
            (row) => row.record.usage.pendingReservedBookingCount,
          ),
        ).toEqual([0, 1]);
        const before = await db.query<{ count: string }>(
          "SELECT count(*) FROM core.phase1_tenant_quota_ledger WHERE tenant_id=$1",
          [tenantId],
        );
        await h.service.updateTenantBooking(
          tenantId,
          h.booking.bookingId,
          command,
        );
        const after = await db.query<{ count: string }>(
          "SELECT count(*) FROM core.phase1_tenant_quota_ledger WHERE tenant_id=$1",
          [tenantId],
        );
        expect(after.rows[0]!.count).toBe(before.rows[0]!.count);
      } finally {
        await cleanup(db, tenantId);
        await db.onModuleDestroy();
      }
    });
  },
);
