import { afterEach, describe, expect, it, vi } from "vitest";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// SR-QA-BOOKING-001 / C028: 租戶額度（quota）建單預留與完成消費／取消返還驗收。
//
// 正向鏈路（1.x）沿用並重跑既有
// apps/api/tests/integration/tenant-governance-e2e.test.ts 的
// "booking -> approval -> dispatch -> completion -> billing with quota
// consumption" 已驗證之 建單預留(reserve) -> 完成消費(consume) 路徑，作為本任務
// 的獨立回歸證據，非重寫。
//
// 2.x 區塊是本任務新發現、直接檢視原始碼確認的產品缺口重現：
//   - `owned-mobility.service.ts` 的 `cancelOwnedOrder()` / `cancelTenantBooking()`
//     （3355-5555 行）完整讀過，全程未呼叫 `tenantPartnerService` 的任何方法。
//   - `tenant-quota-ledger.ts` 的 `buildQuotaLifecycleEntrySpecs()` 明確支援
//     "cancel" -> "release" ledger entry transition，且
//     `tenant-partner.service.ts` 的用量彙總邏輯（約 2443-2447 行）也已支援
//     解讀 entryType "release"；但全庫搜尋 `buildQuotaLifecycleEntrySpecs` 僅
//     `tenant-quota-ledger.test.ts` 呼叫，生產路徑從未呼叫。
//   - 換言之：取消租戶訂單目前「完全不會」釋放建單時預留的額度，
//     `pendingReservedBookingCount` 永久停留，額度用盡後即使取消訂單仍無法
//     再次建單。此為現況缺陷重現（非預期通過），已依規範另建
//     SR-QA-BOOKING-001-FIX-QUOTA-RELEASE 修復子任務追蹤，不在本
//     verification-only 任務內直接修改業務碼。
function createQuotaHarness(tenantId: string) {
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
      bookingCountLimit: 2,
      amountMinorLimit: 1_000_000,
      currency: "TWD",
      enforcementMode: "hard_block",
    },
  });

  return { service, tenantPartnerService };
}

const TENANT_ID = "tenant-quota-gap-demo-001";
const TENANT_ADMIN = {
  actorType: "tenant_admin",
  actorId: `${TENANT_ID}-admin`,
} as never;
const RESERVATION_WINDOW_START = "2026-08-01T14:00:00.000Z";

async function createBooking(
  service: OwnedMobilityService,
  reservationWindowStart = RESERVATION_WINDOW_START,
) {
  return service.createTenantBooking(
    {
      businessDispatchSubtype: "enterprise_dispatch",
      reservationWindowStart,
      reservationWindowEnd: "2026-08-01T15:00:00.000Z",
      pickup: { address: "Pickup" },
      dropoff: { address: "Dropoff" },
      passenger: { name: "Quota Rider", phone: "0912000000" },
    } as never,
    TENANT_ID,
    TENANT_ADMIN,
    "req-quota-create",
  );
}

async function completeOrder(service: OwnedMobilityService, orderId: string) {
  const dispatchJob = service.dispatchOrder(orderId, { mode: "auto" });
  const assignment = await service.assignDispatch({
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

describe("SR-QA-BOOKING-001 / C028: 租戶額度建單預留與完成消費", () => {
  it("1.1 建單即時預留額度，quota ledger 記錄 reserve", async () => {
    const { service, tenantPartnerService } = createQuotaHarness(TENANT_ID);
    const created = await createBooking(service);

    const ledger = tenantPartnerService.listTenantQuotaLedger(TENANT_ID, {
      bookingId: created.bookingId,
    });
    expect(ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: created.bookingId,
          entryType: "reserve",
          dimension: "booking_count",
        }),
      ]),
    );
    expect(
      tenantPartnerService.getTenantQuotaSummary(
        TENANT_ID,
        RESERVATION_WINDOW_START,
      ).usage,
    ).toMatchObject({
      pendingReservedBookingCount: 1,
      confirmedBookingCount: 0,
    });
  });

  it("1.2 完成行程後預留額度轉為已消費 (consume)，回讀 pendingReservedBookingCount 歸零", async () => {
    const { service, tenantPartnerService } = createQuotaHarness(TENANT_ID);
    const created = await createBooking(service);
    await completeOrder(service, created.orderId);

    const ledger = tenantPartnerService.listTenantQuotaLedger(TENANT_ID, {
      bookingId: created.bookingId,
    });
    expect(ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: created.bookingId,
          entryType: "consume",
          dimension: "booking_count",
        }),
      ]),
    );
    expect(
      tenantPartnerService.getTenantQuotaSummary(
        TENANT_ID,
        RESERVATION_WINDOW_START,
      ).usage,
    ).toMatchObject({
      pendingReservedBookingCount: 0,
      confirmedBookingCount: 1,
    });
  });
});

describe("SR-QA-BOOKING-001 / C028 [產品缺口重現，非預期通過]: 取消租戶訂單不釋放已預留額度", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gap-1 [現況缺陷重現] 取消訂單後 quota ledger 沒有任何 release 分錄", async () => {
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
    // 現況：cancel 只有最初的 "reserve" 分錄，沒有任何 "release" 分錄
    // （buildQuotaLifecycleEntrySpecs 的 cancel->release 路徑在生產程式碼
    // 中從未被呼叫）。
    expect(ledger.some((entry) => entry.entryType === "release")).toBe(false);
    expect(ledger.every((entry) => entry.entryType === "reserve")).toBe(true);
  });

  it("gap-2 [現況缺陷重現] 取消訂單後 getTenantQuotaSummary 的 pendingReservedBookingCount 仍計入已取消的訂單", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    const { service, tenantPartnerService } = createQuotaHarness(TENANT_ID);
    const created = await createBooking(service);

    await service.cancelTenantBooking(TENANT_ID, created.bookingId, {
      reason: "客戶臨時取消",
    });

    const usageAfterCancel = tenantPartnerService.getTenantQuotaSummary(
      TENANT_ID,
      RESERVATION_WINDOW_START,
    ).usage;
    // 預期正確行為應為 0（取消應歸還額度）；現況記錄實際仍為 1，
    // 證明取消未觸發額度釋放。此斷言驗證的是「現況」而非「正確」行為。
    expect(usageAfterCancel.pendingReservedBookingCount).toBe(1);
    expect(usageAfterCancel.confirmedBookingCount).toBe(0);
  });

  it("gap-3 [現況缺陷重現／業務衝擊] 額度用盡後取消一筆訂單，仍無法建立新訂單（quota 未真正騰出）", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    const { service, tenantPartnerService } = createQuotaHarness(TENANT_ID);

    // bookingCountLimit = 2（見 createQuotaHarness）。建立 2 筆訂單即達上限。
    const first = await createBooking(service, "2026-08-01T14:00:00.000Z");
    await createBooking(service, "2026-08-01T15:00:00.000Z");
    expect(
      tenantPartnerService.getTenantQuotaSummary(
        TENANT_ID,
        RESERVATION_WINDOW_START,
      ).usage.bookingCountRemaining,
    ).toBe(0);

    // 取消第一筆訂單，業務上應該騰出 1 個額度。
    await service.cancelTenantBooking(TENANT_ID, first.bookingId, {
      reason: "騰出額度",
    });

    // 現況缺陷：因取消未釋放額度，第三筆訂單仍因 hard_block 被拒絕
    // （QUOTA_INSUFFICIENT_AT_COMMIT），即使邏輯上應有 1 個空位。
    await expect(
      createBooking(service, "2026-08-01T16:00:00.000Z"),
    ).rejects.toMatchObject({
      response: {
        error: { code: "QUOTA_INSUFFICIENT_AT_COMMIT" },
      },
    });
  });
});
