import { afterEach, describe, expect, it, vi } from "vitest";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
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
});
