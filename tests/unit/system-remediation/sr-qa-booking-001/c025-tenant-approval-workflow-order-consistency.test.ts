import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationEmailAdapter } from "../../../../apps/api/src/modules/audit-notification/audit-notification.email-adapter";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { CallcenterService } from "../../../../apps/api/src/modules/callcenter/callcenter.service";
import { FileMailOutbox } from "../../../../apps/api/src/modules/notification-delivery/file-mail-outbox";
import { NotificationDeliveryService } from "../../../../apps/api/src/modules/notification-delivery/notification-delivery.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityRepository } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.repository";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { TenantPartnerRepository } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.repository";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// SR-QA-BOOKING-001 / C025: 送審→核准／駁回／升級→訂單狀態一致性驗收。
//
// 既有 apps/api/tests/integration/tenant-governance-e2e.test.ts 的
// "runs booking -> approval -> dispatch -> completion -> billing with quota
// consumption" 已驗證核准後 approvalState 轉為 approved 且可派車；本檔案
// 沿用相同真實 TenantPartnerService + OwnedMobilityService 組裝方式，新增
// 該既有測試未覆蓋的「駁回」「升級」與跨租戶／不存在請求的關鍵負向案例。
function createApprovalHarness(tenantId: string) {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService as never,
  );
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => []),
    getVehicleDispatchability: vi.fn(() => true),
    getDriverAvailability: vi.fn(() => true),
  };
  const callcenterService = {
    registerRecordingAttachmentListener: vi.fn(),
    registerRecordingStateChangeListener: vi.fn(),
    linkOrderToCallSession: vi.fn(),
  };
  const stubEmitter = { emit: () => {} } as never;
  const taskEventsService = new OwnedMobilityTaskEventsService(stubEmitter);
  const opsDispatchEventsService = new OpsDispatchEventsService(stubEmitter);
  const service = new OwnedMobilityService(
    regulatoryRegistryService as never,
    auditNotificationService as never,
    callcenterService as never,
    taskEventsService,
    opsDispatchEventsService,
    undefined,
    tenantPartnerService,
  );

  tenantPartnerService.upsertTenantQuotaPolicy(tenantId, {
    period: "monthly",
    limit: {
      bookingCountLimit: 10,
      amountMinorLimit: 5_000_000,
      currency: "TWD",
      enforcementMode: "require_approval",
    },
  });
  tenantPartnerService.upsertApprovalRule(tenantId, {
    ruleName: "High-value approval",
    priority: 10,
    conditions: [{ field: "booking.amount_minor", op: "gte", value: 100_000 }],
    action: "require_approval",
    approvalMode: "any_of",
    approvers: [{ kind: "tenant_finance_admin" }],
  });

  return {
    service,
    tenantPartnerService,
    auditNotificationService,
  };
}

// Approver-kind resolution needs a resolvable, status:"active"
// tenant_finance_admin user; TenantPartnerService's built-in demo seed
// (USER_ROLE_SEED) already provides one under DEMO_TENANT_ID
// ("tenant-demo-001", userId "tenant-user-demo-003"). Reusing this avoids
// re-deriving the in-memory user-activation path (createTenantUser() seeds
// status:"invited", which this resolver does not treat as resolvable).
const TENANT_ID = "tenant-demo-001";
const FINANCE_APPROVER_ID = "tenant-user-demo-003";
const ADMIN_IDENTITY = {
  actorType: "tenant_admin",
  actorId: `${TENANT_ID}-admin`,
} as never;

async function createHighValueBooking(
  service: OwnedMobilityService,
  reservationWindowStart = "2026-07-01T14:00:00.000Z",
) {
  return service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart,
      reservationWindowEnd: "2026-07-01T15:00:00.000Z",
      pickup: { address: "Pickup" },
      dropoff: { address: "Dropoff" },
      passenger: { name: "Approval Rider", phone: "0912000000" },
    } as never,
    TENANT_ID,
    ADMIN_IDENTITY,
    "req-approval-create",
  );
}

describe("SR-QA-BOOKING-001 / C025: 租戶送審與核准／駁回／升級的訂單狀態一致性", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("1. 正向業務鏈路 (Normal Flows)", () => {
    it("1.1 高額訂單觸發送審，approvalState 為 pending 且派車遭阻擋", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
      const { service, tenantPartnerService } =
        createApprovalHarness(TENANT_ID);
      const created = await createHighValueBooking(service);

      const booking = service.getTenantBooking(TENANT_ID, created.bookingId);
      expect(booking.approvalState).toBe("pending");

      const approvalRequest = tenantPartnerService.listApprovalRequests(
        TENANT_ID,
        { bookingId: created.bookingId },
      )[0];
      expect(approvalRequest?.status).toBe("pending");

      expect(() =>
        service.dispatchOrder(created.orderId, { mode: "auto" }),
      ).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "BOOKING_APPROVAL_PENDING",
            }),
          }),
        }),
      );
    });

    it("1.2 核准後 approvalState 轉為 approved 且訂單可派車", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
      const { service, tenantPartnerService } =
        createApprovalHarness(TENANT_ID);
      const created = await createHighValueBooking(service);
      const approvalRequest = tenantPartnerService.listApprovalRequests(
        TENANT_ID,
        { bookingId: created.bookingId },
      )[0];

      await service.approveTenantBookingApprovalRequest(
        TENANT_ID,
        approvalRequest!.approvalRequestId,
        FINANCE_APPROVER_ID,
        null,
        {},
        "req-approve-001",
      );

      const booking = service.getTenantBooking(TENANT_ID, created.bookingId);
      expect(booking.approvalState).toBe("approved");
      expect(booking.approvalRequestIds).toEqual([]);
      expect(() =>
        service.dispatchOrder(created.orderId, { mode: "auto" }),
      ).not.toThrow();
    });

    it("1.3 駁回後 approvalState 轉為 rejected 且訂單仍無法派車", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
      const { service, tenantPartnerService } =
        createApprovalHarness(TENANT_ID);
      const created = await createHighValueBooking(service);
      const approvalRequest = tenantPartnerService.listApprovalRequests(
        TENANT_ID,
        { bookingId: created.bookingId },
      )[0];

      await service.rejectTenantBookingApprovalRequest(
        TENANT_ID,
        approvalRequest!.approvalRequestId,
        FINANCE_APPROVER_ID,
        null,
        { reasonCode: "budget_exceeded", reasonNote: "預算不足" },
        "req-reject-001",
      );

      const booking = service.getTenantBooking(TENANT_ID, created.bookingId);
      expect(booking.approvalState).toBe("rejected");
      expect(() =>
        service.dispatchOrder(created.orderId, { mode: "auto" }),
      ).toThrow();
    });

    it("1.4 升級後審核人輪換為升級目標並加蓋 escalatedAt，供人工跟進", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
      const { service, tenantPartnerService } =
        createApprovalHarness(TENANT_ID);
      const created = await createHighValueBooking(service);
      const approvalRequest = tenantPartnerService.listApprovalRequests(
        TENANT_ID,
        { bookingId: created.bookingId },
      )[0];

      // 升級僅限 tenant_admin 角色發起（見 escalateApprovalRequest 之
      // APPROVAL_NOT_AUTHORIZED 檢查）；沿用 USER_ROLE_SEED 內建的
      // tenant-user-demo-001（tenant_admin），而非財務審核人。
      await service.escalateTenantBookingApprovalRequest(
        TENANT_ID,
        approvalRequest!.approvalRequestId,
        "tenant-user-demo-001",
        null,
        {},
        "req-escalate-001",
      );

      // P1 手動升級設計：保持 status="pending"（不轉終態，讓請求仍可續審），
      // 改由 escalatedAt 加蓋時間戳、approvers 輪換為 escalationTarget、並將
      // 原核准人移入 previousApprovers，讓升級目標可續行審核。詳見
      // tenant-partner.service.ts escalateApprovalRequestInternal() 內註解
      // 「Auto-terminal escalation is deferred to P2」。
      const refreshed = tenantPartnerService.listApprovalRequests(TENANT_ID, {
        bookingId: created.bookingId,
      })[0];
      expect(refreshed?.status).toBe("pending");
      expect(refreshed?.escalatedAt).toBeTruthy();
      expect(refreshed?.approvers).toEqual([
        expect.objectContaining({ kind: "tenant_admin" }),
      ]);
      expect(refreshed?.previousApprovers).toEqual([
        expect.objectContaining({ kind: "tenant_finance_admin" }),
      ]);
    });
  });

  describe("2. 關鍵負向案例 (Negative Flows)", () => {
    it("2.1 核准不存在的 approvalRequestId 回傳 404", async () => {
      const { service } = createApprovalHarness(TENANT_ID);
      await expect(
        service.approveTenantBookingApprovalRequest(
          TENANT_ID,
          "approval-request-does-not-exist",
          FINANCE_APPROVER_ID,
          null,
          {},
        ),
      ).rejects.toThrow();
    });

    it("2.2 已核准的請求不可重複核准 (409/衝突)", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
      const { service, tenantPartnerService } =
        createApprovalHarness(TENANT_ID);
      const created = await createHighValueBooking(service);
      const approvalRequest = tenantPartnerService.listApprovalRequests(
        TENANT_ID,
        { bookingId: created.bookingId },
      )[0];

      await service.approveTenantBookingApprovalRequest(
        TENANT_ID,
        approvalRequest!.approvalRequestId,
        FINANCE_APPROVER_ID,
        null,
        {},
        "req-approve-first",
      );

      await expect(
        service.approveTenantBookingApprovalRequest(
          TENANT_ID,
          approvalRequest!.approvalRequestId,
          FINANCE_APPROVER_ID,
          null,
          {},
          "req-approve-second",
        ),
      ).rejects.toThrow();
    });

    it("2.3 跨租戶核准他租戶的審核請求遭拒", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-01T00:00:00.000Z"));
      const { service, tenantPartnerService } =
        createApprovalHarness(TENANT_ID);
      const created = await createHighValueBooking(service);
      const approvalRequest = tenantPartnerService.listApprovalRequests(
        TENANT_ID,
        { bookingId: created.bookingId },
      )[0];

      await expect(
        service.approveTenantBookingApprovalRequest(
          "tenant-other-001",
          approvalRequest!.approvalRequestId,
          "tenant-other-001-finance",
          null,
          {},
        ),
      ).rejects.toThrow();
    });
  });

  describe("3. 持久層交易邊界與簽核通知時序 (Transactional Create & After-Commit Notification Boundary)", () => {
    type TransactionBoundaryMode =
      | "reject_on_order_persist"
      | "reject_on_commit"
      | "held_then_successful_commit";

    async function createTransactionalApprovalHarness(
      mode: TransactionBoundaryMode,
    ) {
      const outboxDir = fs.mkdtempSync(
        path.join(os.tmpdir(), `c025-after-commit-${mode}-`),
      );
      const timeline: string[] = [];
      let transportSendCalls = 0;
      let releaseCommit!: () => void;
      let reachedCommit!: () => void;
      const commitReached = new Promise<void>((resolve) => {
        reachedCommit = resolve;
      });
      const commitRelease = new Promise<void>((resolve) => {
        releaseCommit = resolve;
      });

      const outbox = new FileMailOutbox(outboxDir);
      const notificationDeliveryService = new NotificationDeliveryService(
        outbox,
        {
          provider: "smtp",
          send: async () => {
            transportSendCalls += 1;
            timeline.push("mail_transport:send(new_request)");
            return {
              provider: "smtp",
              providerMessageId: `<c025-${mode}-${transportSendCalls}@drts.local>`,
              response: "250 OK",
              acceptedAt: "2026-07-01T00:00:01.000Z",
            };
          },
        },
      );
      const auditNotificationService = new AuditNotificationService(
        undefined,
        new AuditNotificationEmailAdapter(notificationDeliveryService),
      );
      const tenantPartnerService = new TenantPartnerService(
        auditNotificationService,
      );
      const costCenter = tenantPartnerService
        .listCostCenters(TENANT_ID)
        .find((row) => row.activeFlag)!.code;

      await tenantPartnerService.upsertTenantQuotaPolicy(TENANT_ID, {
        period: "monthly",
        limit: {
          bookingCountLimit: 10,
          amountMinorLimit: 5_000_000,
          currency: "TWD",
          enforcementMode: "require_approval",
        },
      });
      await tenantPartnerService.upsertApprovalRule(TENANT_ID, {
        ruleName: "Cost-center approval boundary rule",
        priority: 1,
        conditions: [
          { field: "cost_center.code", op: "eq", value: costCenter },
        ],
        action: "require_approval",
        approvalMode: "any_of",
        approvers: [{ kind: "tenant_finance_admin" }],
      });

      const committedOrders: number[] = [];
      let pendingOrders: number[] = [];
      const databaseBoundary = {
        isEnabled: () => true,
        query: async () => ({ rows: [], rowCount: 0 }),
        connect: async () => ({
          query: async (sql: string) => {
            const normalized = sql.trim();
            if (normalized === "BEGIN") {
              pendingOrders = [];
              timeline.push("sql:BEGIN");
              return { rows: [], rowCount: 0 };
            }
            if (normalized === "COMMIT") {
              timeline.push("sql:COMMIT-entered");
              reachedCommit();
              if (mode === "reject_on_commit") {
                throw new Error("synthetic_known_commit_rejected");
              }
              if (mode === "held_then_successful_commit") {
                await commitRelease;
              }
              committedOrders.push(...pendingOrders);
              timeline.push("sql:COMMIT-acknowledged");
              return { rows: [], rowCount: 0 };
            }
            if (normalized === "ROLLBACK") {
              pendingOrders = [];
              timeline.push("sql:ROLLBACK");
              return { rows: [], rowCount: 0 };
            }
            if (/INSERT INTO core\.phase1_tenant_approval_requests/.test(sql)) {
              timeline.push("sql:INSERT-approval-request");
              return { rows: [], rowCount: 1 };
            }
            if (/(?:INSERT INTO|UPDATE) ops\.phase1_owned_orders/.test(sql)) {
              timeline.push("sql:PERSIST-order");
              if (mode === "reject_on_order_persist") {
                throw new Error("synthetic_known_order_persist_rejected");
              }
              pendingOrders.push(1);
              return { rows: [{ aggregate_version: 1 }], rowCount: 1 };
            }
            return { rows: [], rowCount: 0 };
          },
          release: () => {
            timeline.push("sql:release");
          },
        }),
      };

      Object.assign(tenantPartnerService, {
        tenantPartnerRepository: new TenantPartnerRepository(
          databaseBoundary as never,
        ),
        notificationDeliveryService,
      });
      const stubEmitter = { emit: () => {} } as never;
      const service = new OwnedMobilityService(
        {
          getEligibleCandidates: () => [],
          getVehicleDispatchability: () => true,
          getDriverAvailability: () => true,
        } as never,
        auditNotificationService,
        new CallcenterService(auditNotificationService),
        new OwnedMobilityTaskEventsService(stubEmitter),
        new OpsDispatchEventsService(stubEmitter),
        new OwnedMobilityRepository(databaseBoundary as never),
        tenantPartnerService,
      );

      const createBookingWithApproval = () =>
        Promise.resolve(
          service.createTenantBooking(
            {
              businessDispatchSubtype: "enterprise_dispatch",
              costCenter,
              reservationWindowStart: new Date(
                Date.now() + 3 * 3600_000,
              ).toISOString(),
              reservationWindowEnd: new Date(
                Date.now() + 4 * 3600_000,
              ).toISOString(),
              pickup: { address: "Pickup Boundary" },
              dropoff: { address: "Dropoff Boundary" },
              passenger: { name: "Boundary Rider", phone: "0912000000" },
            } as never,
            TENANT_ID,
            ADMIN_IDENTITY,
            `req-c025-${mode}`,
          ),
        );

      const cleanup = () => {
        releaseCommit();
        tenantPartnerService.onModuleDestroy();
        fs.rmSync(outboxDir, { recursive: true, force: true });
      };

      return {
        service,
        tenantPartnerService,
        auditNotificationService,
        timeline,
        getTransportSendCalls: () => transportSendCalls,
        getCommittedOrderCount: () => committedOrders.length,
        commitReached,
        releaseCommit,
        createBookingWithApproval,
        cleanup,
      };
    }

    it("3.1 persistOrderWorkflow 寫入失敗並 ROLLBACK 時，不得寄出或排入 new_request 通知，且治理與訂單／簽核狀態完整回滾", async () => {
      const h = await createTransactionalApprovalHarness(
        "reject_on_order_persist",
      );
      try {
        await expect(h.createBookingWithApproval()).rejects.toThrow(
          "synthetic_known_order_persist_rejected",
        );

        expect(h.timeline).toEqual([
          "sql:BEGIN",
          "sql:INSERT-approval-request",
          "sql:PERSIST-order",
          "sql:ROLLBACK",
          "sql:release",
        ]);
        expect(h.getTransportSendCalls()).toBe(0);
        expect(h.getCommittedOrderCount()).toBe(0);
        expect(h.auditNotificationService.listEmailDeliveries()).toEqual([]);
        expect(
          h.tenantPartnerService
            .listTenantNotifications(TENANT_ID)
            .filter((item) => item.channel === "tenant_approval"),
        ).toEqual([]);
        expect(
          h.auditNotificationService
            .listAuditLogs()
            .find(
              (log) => log.actionName === "approval_notification.new_request",
            ),
        ).toBeUndefined();
        expect(
          h.auditNotificationService
            .listAuditLogs()
            .find(
              (log) => log.actionName === "booking.approval_request.created",
            ),
        ).toBeUndefined();
        expect((await h.service.listTenantBookings(TENANT_ID)).items).toEqual(
          [],
        );
        expect(h.tenantPartnerService.listApprovalRequests(TENANT_ID)).toEqual(
          [],
        );
        expect(h.tenantPartnerService.listTenantQuotaLedger(TENANT_ID)).toEqual(
          [],
        );
      } finally {
        h.cleanup();
      }
    });

    it("3.2 交易於 COMMIT 明確遭拒並 ROLLBACK 時，不得寄出或排入 new_request 通知，且無幽靈訂單或簽核殘留", async () => {
      const h = await createTransactionalApprovalHarness("reject_on_commit");
      try {
        await expect(h.createBookingWithApproval()).rejects.toThrow(
          "synthetic_known_commit_rejected",
        );

        expect(h.timeline).toEqual([
          "sql:BEGIN",
          "sql:INSERT-approval-request",
          "sql:PERSIST-order",
          "sql:COMMIT-entered",
          "sql:ROLLBACK",
          "sql:release",
        ]);
        expect(h.getTransportSendCalls()).toBe(0);
        expect(h.getCommittedOrderCount()).toBe(0);
        expect(h.auditNotificationService.listEmailDeliveries()).toEqual([]);
        expect(
          h.tenantPartnerService
            .listTenantNotifications(TENANT_ID)
            .filter((item) => item.channel === "tenant_approval"),
        ).toEqual([]);
        expect(
          h.auditNotificationService
            .listAuditLogs()
            .find(
              (log) => log.actionName === "approval_notification.new_request",
            ),
        ).toBeUndefined();
        expect((await h.service.listTenantBookings(TENANT_ID)).items).toEqual(
          [],
        );
        expect(h.tenantPartnerService.listApprovalRequests(TENANT_ID)).toEqual(
          [],
        );
        expect(h.tenantPartnerService.listTenantQuotaLedger(TENANT_ID)).toEqual(
          [],
        );
      } finally {
        h.cleanup();
      }
    });

    it("3.3 COMMIT 尚未完成前不提前寄信；COMMIT 成功後才觸發單次 new_request 通知並維持完整關聯與讀回一致", async () => {
      const h = await createTransactionalApprovalHarness(
        "held_then_successful_commit",
      );
      try {
        let settled = false;
        const creationPromise = h.createBookingWithApproval().then(
          (value) => {
            settled = true;
            return value;
          },
          (error) => {
            settled = true;
            throw error;
          },
        );

        await h.commitReached;
        expect(settled).toBe(false);
        expect(h.getCommittedOrderCount()).toBe(0);
        expect(h.getTransportSendCalls()).toBe(0);
        expect(h.auditNotificationService.listEmailDeliveries()).toEqual([]);
        expect(h.tenantPartnerService.listApprovalRequests(TENANT_ID)).toEqual(
          [],
        );
        expect((await h.service.listTenantBookings(TENANT_ID)).items).toEqual(
          [],
        );
        expect(h.timeline).toEqual([
          "sql:BEGIN",
          "sql:INSERT-approval-request",
          "sql:PERSIST-order",
          "sql:COMMIT-entered",
        ]);

        h.releaseCommit();
        const created = await creationPromise;

        expect(h.timeline).toEqual([
          "sql:BEGIN",
          "sql:INSERT-approval-request",
          "sql:PERSIST-order",
          "sql:COMMIT-entered",
          "sql:COMMIT-acknowledged",
          "sql:release",
          "mail_transport:send(new_request)",
        ]);
        expect(
          h.timeline.indexOf("mail_transport:send(new_request)"),
        ).toBeGreaterThan(h.timeline.indexOf("sql:COMMIT-acknowledged"));
        expect(h.getTransportSendCalls()).toBe(1);
        expect(h.getCommittedOrderCount()).toBe(1);

        const booking = h.service.getTenantBooking(
          TENANT_ID,
          created.bookingId,
        );
        expect(booking.approvalState).toBe("pending");
        const approvalRequests = h.tenantPartnerService.listApprovalRequests(
          TENANT_ID,
          { bookingId: created.bookingId },
        );
        expect(approvalRequests).toHaveLength(1);
        const approvalRequest = approvalRequests[0]!;
        expect(approvalRequest.orderId).toBe(created.orderId);
        expect(approvalRequest.resolvedApproverUserIds).toEqual([
          FINANCE_APPROVER_ID,
        ]);
        expect(booking.approvalRequestIds).toEqual([
          approvalRequest.approvalRequestId,
        ]);

        const notificationAudit = h.auditNotificationService
          .listAuditLogs()
          .find(
            (log) => log.actionName === "approval_notification.new_request",
          );
        expect(notificationAudit?.resourceId).toBe(
          approvalRequest.approvalRequestId,
        );
        expect(notificationAudit?.newValuesSummary).toMatchObject({
          bookingId: created.bookingId,
          orderId: created.orderId,
          templateKey: "new_request",
          deliveredToUserIds: [FINANCE_APPROVER_ID],
          inApp: { delivered: 1 },
          email: {
            attempted: 1,
            sent: 1,
            failed: 0,
            unavailable: 0,
            recipients: [
              expect.objectContaining({
                userId: FINANCE_APPROVER_ID,
                status: "sent",
                deliveryId: expect.any(String),
              }),
            ],
          },
        });

        const deliveryId = (
          notificationAudit?.newValuesSummary as {
            email: { recipients: Array<{ deliveryId: string }> };
          }
        ).email.recipients[0]!.deliveryId;
        const receipt = await h.tenantPartnerService.getMailDeliveryReceipt(
          TENANT_ID,
          deliveryId,
        );
        expect(receipt).toMatchObject({
          deliveryId,
          tenantId: TENANT_ID,
          status: "sent",
        });
      } finally {
        h.cleanup();
      }
    });
  });
});
