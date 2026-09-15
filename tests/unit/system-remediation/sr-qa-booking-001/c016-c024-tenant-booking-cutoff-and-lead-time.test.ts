import { afterEach, describe, expect, it, vi } from "vitest";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { ServiceProductService } from "../../../../apps/api/src/modules/service-product/service-product.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// SR-QA-BOOKING-001 / C016 + C024: 企業／租戶通道的建單時窗（過去日期／最短提前
// 時間）與修改／取消 cutoff 驗收。
//
// 9/6 audit (C016) 觀察：「前端過期日期可進確認；multi-taxi backend 已有最短提前
// 時間檢查」，要求「企業與 multi-taxi 各通道分開驗證 UI/API 邊界，勿宣稱 backend
// 完全缺檢核」。經直接檢視 apps/api/src/modules/owned-mobility/owned-mobility.service.ts
// 原始碼：
//   - `createMultiTaxiRide()`（multi-taxi 通道，scheduled 模式）在 requestedPickupAt
//     早於 `getMinLeadTimeMinutes()`（預設 15 分鐘）時拋出 400 TOO_SOON_TO_BOOK。
//   - `createTenantBooking()` / `_executeCreateTenantBooking()`（企業／租戶通道，
//     含轉介乘客底層共用同一路徑）呼叫的 `assertBookingRules()` 只檢查機場接機
//     班機號，`computeBookingWindows()` 只計算 modifiableUntil/cancelableUntil，
//     全程沒有任何 minLeadTime／過去日期檢查。
// 本檔案的 2.x 區塊即是這個落差的可重跑重現（現況記錄，非預期通過的產品行為）；
// 已依規範另建 SR-QA-BOOKING-001-FIX-TENANT-LEAD-TIME 修復子任務追蹤，不在本
// verification-only 任務內直接修改 owned-mobility.service.ts。
function createBookingCutoffHarness() {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService as never,
  );
  const serviceProductService = new ServiceProductService(
    auditNotificationService as never,
    undefined,
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
    undefined,
    serviceProductService,
  );
  return { service, tenantPartnerService, serviceProductService };
}

const TENANT_ID = "tenant-cutoff-demo-001";
const TENANT_ADMIN = {
  actorType: "tenant_admin",
  actorId: "tenant-cutoff-admin-001",
} as never;

function bookingCommand(overrides?: Record<string, unknown>) {
  return {
    businessDispatchSubtype: "enterprise_dispatch",
    reservationWindowStart: new Date(Date.now() + 3 * 3600_000).toISOString(),
    pickup: { address: "Pickup" },
    dropoff: { address: "Dropoff" },
    passenger: { name: "Cutoff Rider", phone: "0912000000" },
    ...overrides,
  } as never;
}

describe("SR-QA-BOOKING-001 / C024: 租戶建單修改／取消 cutoff", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("1.1 建單依 businessDispatchSubtype 計算對應 modifiableUntil / cancelableUntil", async () => {
    const { service } = createBookingCutoffHarness();
    const reservationWindowStart = new Date(
      Date.now() + 3 * 3600_000,
    ).toISOString();
    const created = await service.createTenantBooking(
      bookingCommand({ reservationWindowStart }),
      TENANT_ID,
      TENANT_ADMIN,
    );
    const order = service.getOrder(created.orderId);
    const expectedCutoffMs =
      new Date(reservationWindowStart).getTime() - 30 * 60_000;
    expect(new Date(order.modifiableUntil!).getTime()).toBe(expectedCutoffMs);
    expect(new Date(order.cancelableUntil!).getTime()).toBe(expectedCutoffMs);
  });

  it("1.2 cutoff 前修改與取消皆成功", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    const { service } = createBookingCutoffHarness();
    const created = await service.createTenantBooking(
      bookingCommand({
        reservationWindowStart: "2026-06-01T03:00:00.000Z",
      }),
      TENANT_ID,
      TENANT_ADMIN,
    );

    const updated = service.updateTenantBooking(
      TENANT_ID,
      created.bookingId,
      { notes: "改備註" } as never,
      TENANT_ADMIN,
    );
    expect((updated as { notes?: string }).notes).toBe("改備註");

    const cancelled = await service.cancelTenantBooking(
      TENANT_ID,
      created.bookingId,
      { reason: "cutoff 前取消" },
    );
    expect(cancelled.status).toBe("cancelled");
  });

  it("2.1 [負向] 超過 modifiableUntil 後修改遭拒 (409 ORDER_NOT_MODIFIABLE)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    const { service } = createBookingCutoffHarness();
    // enterprise_dispatch modifiableMinutes = 30；reservationWindowStart 訂在
    // 40 分鐘後，故 modifiableUntil = 系統時間 + 10 分鐘。
    const created = await service.createTenantBooking(
      bookingCommand({
        reservationWindowStart: "2026-06-01T00:40:00.000Z",
      }),
      TENANT_ID,
      TENANT_ADMIN,
    );

    vi.setSystemTime(new Date("2026-06-01T00:15:00.000Z"));
    expect(() =>
      service.updateTenantBooking(
        TENANT_ID,
        created.bookingId,
        { notes: "cutoff 後嘗試修改" } as never,
        TENANT_ADMIN,
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({ code: "ORDER_NOT_MODIFIABLE" }),
        }),
      }),
    );
  });

  it("2.2 [負向] 超過 cancelableUntil 後取消遭拒 (409 ORDER_NOT_CANCELABLE)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T00:00:00.000Z"));
    const { service } = createBookingCutoffHarness();
    const created = await service.createTenantBooking(
      bookingCommand({
        reservationWindowStart: "2026-06-01T00:40:00.000Z",
      }),
      TENANT_ID,
      TENANT_ADMIN,
    );

    vi.setSystemTime(new Date("2026-06-01T00:15:00.000Z"));
    await expect(
      service.cancelTenantBooking(TENANT_ID, created.bookingId, {
        reason: "cutoff 後嘗試取消",
      }),
    ).rejects.toMatchObject({
      response: { error: { code: "ORDER_NOT_CANCELABLE" } },
    });
  });

  it("2.3 [負向] 不存在的 bookingId 取消回傳 404", async () => {
    const { service } = createBookingCutoffHarness();
    await expect(
      service.cancelTenantBooking(TENANT_ID, "booking-does-not-exist", {
        reason: "x",
      }),
    ).rejects.toThrow();
  });

  describe("3. C031/C032: 機場接送／旅行社／保險等產品差異化 cutoff 與啟用狀態", () => {
    it("3.1 credit_card_airport_transfer 的 cutoff 為 60 分鐘（預設啟用）", async () => {
      const { service } = createBookingCutoffHarness();
      const reservationWindowStart = new Date(
        Date.now() + 5 * 3600_000,
      ).toISOString();
      const created = await service.createTenantBooking(
        bookingCommand({
          businessDispatchSubtype: "credit_card_airport_transfer",
          direction: "dropoff",
          reservationWindowStart,
        }),
        TENANT_ID,
        TENANT_ADMIN,
      );
      const order = service.getOrder(created.orderId);
      const expectedCutoffMs =
        new Date(reservationWindowStart).getTime() - 60 * 60_000;
      expect(new Date(order.cancelableUntil!).getTime()).toBe(expectedCutoffMs);
    });

    it("3.2 [負向] travel_agency_transfer 預設停用，建單遭拒 (409 SERVICE_PRODUCT_INACTIVE)", () => {
      const { service } = createBookingCutoffHarness();
      // createTenantBooking() 在無 idempotency key 時走同步分支，遇到
      // requireActiveBookingServiceProduct() 拒絕時是同步 throw，故用
      // toThrowError 而非 rejects（否則 throw 發生在 promise 建立之前）。
      expect(() =>
        service.createTenantBooking(
          bookingCommand({ businessDispatchSubtype: "travel_agency_transfer" }),
          TENANT_ID,
          TENANT_ADMIN,
        ),
      ).toThrowError(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.objectContaining({
              code: "SERVICE_PRODUCT_INACTIVE",
            }),
          }),
        }),
      );
    });

    it("3.3 tenant 啟用 travel_agency_transfer 後可建單，cutoff 為 90 分鐘", async () => {
      const { service, serviceProductService } = createBookingCutoffHarness();
      // DEFAULT_RUNTIME_SERVICE_PRODUCTS 是唯讀 fallback 常數，從未寫入
      // ServiceProductService 的 `records`；要讓 tenant「主動啟用」某產品，
      // 須透過 createServiceProduct() 實際建立一筆可變記錄，而非對唯讀 seed
      // 呼叫 updateServiceProduct（那會回 404 NOT_FOUND，因為 records 內
      // 本來就沒有這筆）。
      serviceProductService.createServiceProduct({
        serviceProductType: "travel_agency_transfer",
        displayName: "Travel Agency Transfer",
        timing: "reservation",
        active: true,
        defaultBillingMode: "partner_settlement",
      } as never);
      const reservationWindowStart = new Date(
        Date.now() + 5 * 3600_000,
      ).toISOString();
      const created = await service.createTenantBooking(
        bookingCommand({
          businessDispatchSubtype: "travel_agency_transfer",
          reservationWindowStart,
        }),
        TENANT_ID,
        TENANT_ADMIN,
      );
      const order = service.getOrder(created.orderId);
      const expectedCutoffMs =
        new Date(reservationWindowStart).getTime() - 90 * 60_000;
      expect(new Date(order.modifiableUntil!).getTime()).toBe(expectedCutoffMs);
    });

    it("3.4 insurance_replacement_vehicle 啟用後 cutoff 為 120 分鐘", async () => {
      const { service, serviceProductService } = createBookingCutoffHarness();
      serviceProductService.createServiceProduct({
        serviceProductType: "insurance_replacement_vehicle",
        displayName: "Insurance Replacement Vehicle",
        timing: "reservation",
        active: true,
        defaultBillingMode: "partner_settlement",
      } as never);
      const reservationWindowStart = new Date(
        Date.now() + 5 * 3600_000,
      ).toISOString();
      const created = await service.createTenantBooking(
        bookingCommand({
          businessDispatchSubtype: "insurance_replacement_vehicle",
          reservationWindowStart,
        }),
        TENANT_ID,
        TENANT_ADMIN,
      );
      const order = service.getOrder(created.orderId);
      const expectedCutoffMs =
        new Date(reservationWindowStart).getTime() - 120 * 60_000;
      expect(new Date(order.cancelableUntil!).getTime()).toBe(expectedCutoffMs);
    });
  });
});

describe("SR-QA-BOOKING-001 / C016 [產品缺口重現，非預期通過]: 企業／租戶通道缺少最短提前時間與過去日期檢查", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("gap-1 對照組：multi-taxi 排班通道在提前時間不足 15 分鐘時正確拒絕 (400 TOO_SOON_TO_BOOK)", () => {
    const { service } = createBookingCutoffHarness();
    const authorization = {
      operatingAuthorizationId: "auth-multi-taxi-001",
      vehicleId: "veh-demo-001",
      driverId: "drv-demo-001",
    } as never;
    expect(() =>
      service.createMultiTaxiRide(
        {
          timingMode: "scheduled",
          requestedPickupAt: new Date(Date.now() + 2 * 60_000).toISOString(),
          pickup: { address: "Pickup" },
          dropoff: { address: "Dropoff" },
        } as never,
        authorization,
      ),
    ).toThrowError(
      expect.objectContaining({
        response: expect.objectContaining({
          error: expect.objectContaining({ code: "TOO_SOON_TO_BOOK" }),
        }),
      }),
    );
  });

  it("gap-2 [現況缺陷重現] 企業／租戶通道建單 2 分鐘後即出發，目前未被拒絕（無對應的 TOO_SOON_TO_BOOK 檢查）", async () => {
    const { service } = createBookingCutoffHarness();
    const reservationWindowStart = new Date(
      Date.now() + 2 * 60_000,
    ).toISOString();

    // 現況：與 gap-1 使用完全相同的提前時間（2 分鐘 < 15 分鐘門檻），
    // multi-taxi 通道會拒絕，但企業／租戶通道（createTenantBooking）目前
    // 直接成功建立訂單。這證明 C016 稽核所述落差在目前程式碼中確實存在，
    // 且與轉介乘客通道共用同一路徑（createReferralPassengerBooking 內部呼叫
    // createTenantBooking），故轉介乘客亦受影響。追蹤修復：
    // SR-QA-BOOKING-001-FIX-TENANT-LEAD-TIME。
    const created = await service.createTenantBooking(
      bookingCommand({ reservationWindowStart }),
      TENANT_ID,
      TENANT_ADMIN,
    );
    expect(created.orderId).toBeTruthy();
    expect(service.getOrder(created.orderId).reservationWindowStart).toBe(
      reservationWindowStart,
    );
  });

  it("gap-3 [現況缺陷重現] 企業／租戶通道建單可用過去時間作為 reservationWindowStart，目前未被拒絕", async () => {
    const { service } = createBookingCutoffHarness();
    const pastReservationWindowStart = new Date(
      Date.now() - 3600_000,
    ).toISOString();

    const created = await service.createTenantBooking(
      bookingCommand({ reservationWindowStart: pastReservationWindowStart }),
      TENANT_ID,
      TENANT_ADMIN,
    );
    expect(created.orderId).toBeTruthy();
    // 現況缺陷連帶效應：cutoff 也隨之落在過去，訂單建立當下即已超過
    // modifiableUntil/cancelableUntil，形同建立即不可修改／不可取消。
    const order = service.getOrder(created.orderId);
    expect(new Date(order.cancelableUntil!).getTime()).toBeLessThan(Date.now());
  });
});
