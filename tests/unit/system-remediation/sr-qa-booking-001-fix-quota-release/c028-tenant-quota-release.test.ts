import { afterEach, describe, expect, it, vi } from "vitest";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// SR-QA-BOOKING-001-FIX-QUOTA-RELEASE / C028:
// 租戶訂單取消時釋放已預留額度（quota release fix）。
//
// 驗收目標：
// 1. 取消租戶訂單（cancelTenantBooking/cancelOwnedOrder）後，quota ledger 新增對應 release entry
//    且 getTenantQuotaSummary 的 pendingReservedBookingCount／pendingReservedAmountMinor 正確歸還。
// 2. 取消後可再次建單至原本額度上限（回歸驗證 SR-QA-BOOKING-001 的 gap-1/gap-2/gap-3 三個現況重現測試轉為正向通過）。
// 3. 支援 cost center 階層配額釋放、冪等性，且不破壞既有 reserve/consume 行為。

function createQuotaHarness(tenantId: string, options?: {
  bookingCountLimit?: number;
  amountMinorLimit?: number;
}) {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService as never,
  );
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => [
      {
        driverId: "driver-quota-001",
        vehicleId: "vehicle-quota-001",
        etaMinutes: 6,
        operatingArea: "taipei",
        serviceBuckets: ["business_dispatch"],
      },
    ]),
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

  tenantPartnerService.registerOrderFeedProvider(() => service.listOrders());
  tenantPartnerService.upsertTenantQuotaPolicy(tenantId, {
    period: "monthly",
    limit: {
      bookingCountLimit: options?.bookingCountLimit ?? 2,
      amountMinorLimit: options?.amountMinorLimit ?? 1_000_000,
      currency: "TWD",
      enforcementMode: "hard_block",
    },
  });

  return { service, tenantPartnerService };
}

const TENANT_ID = "tenant-quota-release-fix-001";
const TENANT_ADMIN = {
  actorType: "tenant_admin",
  actorId: `${TENANT_ID}-admin`,
} as never;
const RESERVATION_WINDOW_START = "2026-08-01T14:00:00.000Z";

async function createBooking(
  service: OwnedMobilityService,
  options?: {
    reservationWindowStart?: string;
    costCenter?: string;
  },
) {
  return service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart: options?.reservationWindowStart ?? RESERVATION_WINDOW_START,
      reservationWindowEnd: "2026-08-01T15:00:00.000Z",
      pickup: { address: "Pickup" },
      dropoff: { address: "Dropoff" },
      passenger: { name: "Quota Rider", phone: "0912000000" },
      costCenter: options?.costCenter,
    } as never,
    TENANT_ID,
    TENANT_ADMIN,
    `req-quota-create-${Math.random()}`,
  );
}

async function completeOrder(service: OwnedMobilityService, orderId: string) {
  const dispatchJob = service.dispatchOrder(orderId, { mode: "auto" });
  const assignment = service.assignDispatch({
    dispatchJobId: (dispatchJob as { dispatchJobId: string }).dispatchJobId,
    vehicleId: "vehicle-quota-001",
    driverId: "driver-quota-001",
  });
  service.acceptDriverTask(assignment.taskId, {
    acceptedAt: "2026-08-01T13:30:00.000Z",
  });
  service.departDriverTask(assignment.taskId, {
    departedAt: "2026-08-01T13:35:00.000Z",
  });
  service.arrivedPickup(assignment.taskId, {
    arrivedAt: "2026-08-01T13:50:00.000Z",
  });
  service.startDriverTask(assignment.taskId, {
    startedAt: "2026-08-01T13:55:00.000Z",
  });
  await service.completeDriverTask(assignment.taskId, {
    completedAt: "2026-08-01T14:20:00.000Z",
    actualDistanceKm: 10,
    actualDurationSec: 1200,
    proof: { photos: ["cXVvdGEtcHJvb2Y="] },
  });
}

describe("SR-QA-BOOKING-001-FIX-QUOTA-RELEASE: 租戶取消訂單配額釋放驗證 (C028)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gap-1 [正向驗證] cancelTenantBooking 取消訂單後 quota ledger 確實新增 release 分錄", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    const { service, tenantPartnerService } = createQuotaHarness(TENANT_ID);
    const created = await createBooking(service);

    const cancelled = await service.cancelTenantBooking(
      TENANT_ID,
      created.bookingId,
      { reason: "客戶臨時取消" },
    );
    expect(cancelled.status).toBe("cancelled");

    const ledger = tenantPartnerService.listTenantQuotaLedger(TENANT_ID, {
      bookingId: created.bookingId,
    });

    const releaseEntries = ledger.filter((entry) => entry.entryType === "release");
    expect(releaseEntries.length).toBeGreaterThanOrEqual(1);

    const bookingCountRelease = releaseEntries.find(
      (entry) => entry.dimension === "booking_count",
    );
    expect(bookingCountRelease).toBeDefined();
    expect(bookingCountRelease).toMatchObject({
      tenantId: TENANT_ID,
      bookingId: created.bookingId,
      entryType: "release",
      dimension: "booking_count",
      amount: 1,
    });
  });

  it("gap-2 [正向驗證] cancelTenantBooking 取消訂單後 getTenantQuotaSummary 的 pendingReserved 額度正確歸零", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    const { service, tenantPartnerService } = createQuotaHarness(TENANT_ID);
    const created = await createBooking(service);

    // 建單後 pendingReservedBookingCount 應為 1
    const usageBeforeCancel = tenantPartnerService.getTenantQuotaSummary(
      TENANT_ID,
      RESERVATION_WINDOW_START,
    ).usage;
    expect(usageBeforeCancel.pendingReservedBookingCount).toBe(1);

    await service.cancelTenantBooking(TENANT_ID, created.bookingId, {
      reason: "客戶臨時取消",
    });

    // 取消後 pendingReserved 應全數歸還（為 0），剩餘額度恢復至上限 2
    const usageAfterCancel = tenantPartnerService.getTenantQuotaSummary(
      TENANT_ID,
      RESERVATION_WINDOW_START,
    ).usage;
    expect(usageAfterCancel.pendingReservedBookingCount).toBe(0);
    expect(usageAfterCancel.confirmedBookingCount).toBe(0);
    expect(usageAfterCancel.bookingCountRemaining).toBe(2);
  });

  it("gap-3 [正向驗證／業務閉環] 額度用盡後取消一筆訂單，騰出之額度可立即供新訂單建立", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    const { service, tenantPartnerService } = createQuotaHarness(TENANT_ID, {
      bookingCountLimit: 2,
    });

    // 建立 2 筆訂單達上限
    const first = await createBooking(service, { reservationWindowStart: "2026-08-01T14:00:00.000Z" });
    const second = await createBooking(service, { reservationWindowStart: "2026-08-01T15:00:00.000Z" });
    expect(first.bookingId).toBeDefined();
    expect(second.bookingId).toBeDefined();

    expect(
      tenantPartnerService.getTenantQuotaSummary(
        TENANT_ID,
        RESERVATION_WINDOW_START,
      ).usage.bookingCountRemaining,
    ).toBe(0);

    // 取消第一筆訂單，釋放 1 個配額
    await service.cancelTenantBooking(TENANT_ID, first.bookingId, {
      reason: "騰出額度",
    });

    const usageAfterCancel = tenantPartnerService.getTenantQuotaSummary(
      TENANT_ID,
      RESERVATION_WINDOW_START,
    ).usage;
    expect(usageAfterCancel.bookingCountRemaining).toBe(1);
    expect(usageAfterCancel.pendingReservedBookingCount).toBe(1); // second 仍保留

    // 再次建單（第三筆），此時應成功建立，不再被 hard_block 拒絕
    const third = await createBooking(service, { reservationWindowStart: "2026-08-01T16:00:00.000Z" });
    expect(third.bookingId).toBeDefined();
    expect(third.status).toBe("created");

    // 第三筆建完後額度再次歸零
    expect(
      tenantPartnerService.getTenantQuotaSummary(
        TENANT_ID,
        RESERVATION_WINDOW_START,
      ).usage.bookingCountRemaining,
    ).toBe(0);
  });

  it("直接呼叫 cancelOwnedOrder 取消租戶訂單亦同步釋放配額", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    const { service, tenantPartnerService } = createQuotaHarness(TENANT_ID);
    const created = await createBooking(service);

    const cancelledOrder = await service.cancelOwnedOrder(
      created.orderId,
      { reason: "運營手動取消" },
    );
    expect(cancelledOrder.status).toBe("cancelled");

    const ledger = tenantPartnerService.listTenantQuotaLedger(TENANT_ID, {
      bookingId: created.bookingId,
    });
    expect(ledger.some((entry) => entry.entryType === "release")).toBe(true);

    const usage = tenantPartnerService.getTenantQuotaSummary(
      TENANT_ID,
      RESERVATION_WINDOW_START,
    ).usage;
    expect(usage.pendingReservedBookingCount).toBe(0);
  });

  it("成本中心配額在取消時同步釋放成本中心與租戶雙層配額", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    const { service, tenantPartnerService } = createQuotaHarness(TENANT_ID);

    // 為成本中心 CC-FIN 配置獨立 quota
    tenantPartnerService.upsertCostCenter(TENANT_ID, {
      code: "CC-FIN",
      name: "Finance Department",
    });
    tenantPartnerService.upsertTenantQuotaPolicy(TENANT_ID, {
      costCenterCode: "CC-FIN",
      period: "monthly",
      limit: {
        bookingCountLimit: 1,
        amountMinorLimit: 500_000,
        currency: "TWD",
        enforcementMode: "hard_block",
      },
    });

    const created = await createBooking(service, { costCenter: "CC-FIN" });

    // 驗證預留包含成本中心分錄
    const initialLedger = tenantPartnerService.listTenantQuotaLedger(TENANT_ID, {
      bookingId: created.bookingId,
    });
    expect(initialLedger.some((e) => e.costCenterCode === "CC-FIN" && e.entryType === "reserve")).toBe(true);

    await service.cancelTenantBooking(TENANT_ID, created.bookingId, {
      reason: "取消成本中心訂單",
    });

    const cancelledLedger = tenantPartnerService.listTenantQuotaLedger(TENANT_ID, {
      bookingId: created.bookingId,
    });
    const releaseCostCenterCount = cancelledLedger.find(
      (e) =>
        e.costCenterCode === "CC-FIN" &&
        e.entryType === "release" &&
        e.dimension === "booking_count",
    );
    expect(releaseCostCenterCount).toBeDefined();
    expect(releaseCostCenterCount?.amount).toBe(1);

    const releaseCostCenterAmount = cancelledLedger.find(
      (e) =>
        e.costCenterCode === "CC-FIN" &&
        e.entryType === "release" &&
        e.dimension === "amount_minor",
    );
    expect(releaseCostCenterAmount).toBeDefined();
    expect(releaseCostCenterAmount?.amount).toBe(150_000);

    const releaseTenantWideCount = cancelledLedger.find(
      (e) =>
        e.costCenterCode === null &&
        e.entryType === "release" &&
        e.dimension === "booking_count",
    );
    expect(releaseTenantWideCount).toBeDefined();
    expect(releaseTenantWideCount?.amount).toBe(1);
  });

  it("已完成 (completed/consumed) 的訂單不可重複釋放額度", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    const { service, tenantPartnerService } = createQuotaHarness(TENANT_ID);
    const created = await createBooking(service);
    await completeOrder(service, created.orderId);

    // 訂單完成後狀態為 completed，嘗試取消應被 assertOrderCancelable 拒絕
    await expect(
      service.cancelTenantBooking(TENANT_ID, created.bookingId, {
        reason: "試圖取消已完成訂單",
      }),
    ).rejects.toThrow();

    // 確認 ledger 只有 reserve 與 consume，沒有 release
    const ledger = tenantPartnerService.listTenantQuotaLedger(TENANT_ID, {
      bookingId: created.bookingId,
    });
    expect(ledger.some((e) => e.entryType === "consume")).toBe(true);
    expect(ledger.some((e) => e.entryType === "release")).toBe(false);

    // 且 confirmedBookingCount 仍為 1
    const usage = tenantPartnerService.getTenantQuotaSummary(
      TENANT_ID,
      RESERVATION_WINDOW_START,
    ).usage;
    expect(usage.confirmedBookingCount).toBe(1);
    expect(usage.pendingReservedBookingCount).toBe(0);
  });
});
