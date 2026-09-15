import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
// 2.x 區塊沿革說明：
//   - 原在 SR-QA-BOOKING-001 任務中作為產品缺口重現（gap-1/gap-2/gap-3）：
//     當時檢視原始碼發現 `owned-mobility.service.ts` 取消訂單時全程未呼叫 `tenantPartnerService`，
//     導致建單預留之額度在取消時完全不會釋放，`pendingReservedBookingCount` 永久停留，
//     額度用盡後即使取消訂單仍無法再次建單。當時依 verification-only 任務紀律
//     以「現況缺陷重現，非預期通過」斷言鎖定該缺口，並建立子任務追蹤。
//   - 後續於 SR-QA-BOOKING-001-FIX-QUOTA-RELEASE（PR #2029, commit acfe53f65）完成修復：
//     `owned-mobility.service.ts` 取消鏈路已完整接通 `tenantPartnerService`，
//     並透過 `tenant-quota-ledger.ts` 的 `buildQuotaLifecycleEntrySpecs()` 產生
//     entryType 為 "release" 的分錄，正確釋放 pendingReserved 配額。
//   - 本任務（SR-QA-BOOKING-001-FIX-QUOTA-RELEASE-STALE-GAP-ASSERTIONS）：
//     將原已過期的缺口重現斷言改寫為驗證「修復後正確行為」的回歸測試（regression suite），
//     涵蓋 release 分錄生成 (gap-1)、pendingReservedBookingCount 歸零 (gap-2)、
//     以及額度騰出後可再次成功建單 (gap-3)，並完整保留歷史沿革說明。
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
  requestId = `req-quota-create-${Math.random()}`,
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
    requestId,
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
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

describe("SR-QA-BOOKING-001 / C028 [回歸驗證，原產品缺口已修復]: 取消租戶訂單釋放已預留額度 (原 gap-1/gap-2/gap-3 回歸防線)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gap-1 [回歸驗證／原現況缺陷已修復] 取消訂單後 quota ledger 確實新增 release 分錄", async () => {
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
    // 沿革說明：
    // 原 SR-QA-BOOKING-001 現況缺陷重現階段，cancel 因未對接 tenantPartnerService
    // 而只有最初的 "reserve" 分錄，無任何 "release" 分錄。
    // 經 SR-QA-BOOKING-001-FIX-QUOTA-RELEASE 修復後，cancelTenantBooking / cancelOwnedOrder
    // 會在取消時呼叫 tenantPartnerService 並透過 buildQuotaLifecycleEntrySpecs
    // 寫入 release 分錄。此處更新為正確行為的回歸斷言：
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

  it("gap-2 [回歸驗證／原現況缺陷已修復] 取消訂單後 getTenantQuotaSummary 的 pendingReservedBookingCount 正確歸零", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-01T00:00:00.000Z"));
    const { service, tenantPartnerService } = createQuotaHarness(TENANT_ID);
    const created = await createBooking(service);

    // 建單後預留額度為 1
    const usageBeforeCancel = tenantPartnerService.getTenantQuotaSummary(
      TENANT_ID,
      RESERVATION_WINDOW_START,
    ).usage;
    expect(usageBeforeCancel.pendingReservedBookingCount).toBe(1);

    await service.cancelTenantBooking(TENANT_ID, created.bookingId, {
      reason: "客戶臨時取消",
    });

    const usageAfterCancel = tenantPartnerService.getTenantQuotaSummary(
      TENANT_ID,
      RESERVATION_WINDOW_START,
    ).usage;
    // 沿革說明：
    // 原 SR-QA-BOOKING-001 現況缺陷重現階段，取消後 pendingReservedBookingCount
    // 仍殘留為 1（斷言驗證了該未釋放缺陷）。
    // 經 SR-QA-BOOKING-001-FIX-QUOTA-RELEASE 修復後，取消後預留額度已正確釋放，
    // pendingReservedBookingCount 歸零，且可用額度恢復至上限 2。
    expect(usageAfterCancel.pendingReservedBookingCount).toBe(0);
    expect(usageAfterCancel.confirmedBookingCount).toBe(0);
    expect(usageAfterCancel.bookingCountRemaining).toBe(2);
  });

  it("gap-3 [回歸驗證／原現況缺陷已修復／業務閉環] 額度用盡後取消一筆訂單，額度騰出後可再次成功建立新訂單", async () => {
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

    // 沿革說明：
    // 原 SR-QA-BOOKING-001 現況缺陷重現階段，因取消未釋放額度，第三筆訂單
    // 即使在取消一筆訂單後仍被 hard_block (QUOTA_INSUFFICIENT_AT_COMMIT) 拒絕。
    // 經 SR-QA-BOOKING-001-FIX-QUOTA-RELEASE 修復後，取消訂單已能即時釋放額度，
    // 騰出之額度可立即供第三筆訂單成功建立（完成業務閉環）。
    const third = await createBooking(service, "2026-08-01T16:00:00.000Z");
    expect(third.status).toBe("created");
    expect(third.bookingId).toBeDefined();
    expect(
      tenantPartnerService.getTenantQuotaSummary(
        TENANT_ID,
        RESERVATION_WINDOW_START,
      ).usage,
    ).toMatchObject({
      pendingReservedBookingCount: 2,
      confirmedBookingCount: 0,
      bookingCountRemaining: 0,
    });
  });
});
