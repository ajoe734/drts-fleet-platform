import { describe, expect, it, vi } from "vitest";

import { OpsDispatchEventsService } from "../../../../apps/api/src/common/ops-dispatch-events.service";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import { OwnedMobilityTaskEventsService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility-task-events.service";
import { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";
import { TenantPartnerService } from "../../../../apps/api/src/modules/tenant-partner/tenant-partner.service";

// SR-QA-BOOKING-001 / C022: 轉介乘客即時報價→送單→續接→取消→評分／收據端到端
// 續航驗收。既有 owned-mobility.service.test.ts 的 "referral attribution
// (CRC-BE-003)" describe block已驗證單筆建單/取消的欄位歸屬（partnerEntrySlug、
// businessDispatchSubtype 推導、預約時窗）；此處聚焦在該既有測試未覆蓋的
// 「同一 order 全流程續接」與評分／權限關鍵負向案例，避免重寫已驗證內容。
function createReferralTestHarness() {
  const auditNotificationService = new AuditNotificationService();
  const tenantPartnerService = new TenantPartnerService(
    auditNotificationService as never,
  );
  const regulatoryRegistryService = {
    getEligibleCandidates: vi.fn(() => [
      {
        driverId: "driver-referral-001",
        vehicleId: "vehicle-referral-001",
        etaMinutes: 5,
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
  // Avoid importing `@nestjs/event-emitter` directly: this test file lives
  // under repo-root `tests/`, so Node module resolution walks up from here
  // (not from apps/api/) and cannot see apps/api's private dependency. A
  // plain `emit`-only stub is all these two event services call at runtime.
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
  return { service, tenantPartnerService };
}

function referralIdentity(overrides?: Partial<Record<string, unknown>>) {
  return {
    actorType: "referral_passenger",
    actorId: "referral-passenger-continuity-001",
    realm: "partner",
    tenantId: "tenant-demo-001",
    partnerId: "partner_ead6bf3d-e858-47cc-bfe1-5a3742524118",
    partnerProgramId: "program-referral-community",
    partnerEntrySlug: "yuhe-residence",
    drtsPassengerId: "referral-passenger-continuity-001",
    ...overrides,
  } as never;
}

async function completeOrder(service: OwnedMobilityService, orderId: string) {
  const dispatchJob = service.dispatchOrder(orderId, { mode: "auto" });
  const assignment = service.assignDispatch({
    dispatchJobId: (dispatchJob as { dispatchJobId: string }).dispatchJobId,
    vehicleId: "vehicle-referral-001",
    driverId: "driver-referral-001",
  });
  service.acceptDriverTask(assignment.taskId, {
    acceptedAt: new Date().toISOString(),
  });
  service.departDriverTask(assignment.taskId, {
    departedAt: new Date().toISOString(),
  });
  service.arrivedPickup(assignment.taskId, {
    arrivedAt: new Date().toISOString(),
  });
  service.startDriverTask(assignment.taskId, {
    startedAt: new Date().toISOString(),
  });
  await service.completeDriverTask(assignment.taskId, {
    completedAt: new Date().toISOString(),
    actualDistanceKm: 8.4,
    actualDurationSec: 900,
    proof: { photos: ["cmVmZXJyYWwtcHJvb2Y="] },
  });
}

describe("SR-QA-BOOKING-001 / C022: 轉介乘客報價到收據端到端續接", () => {
  describe("1. 正向業務鏈路 (Normal Flows)", () => {
    it("1.1 同一 order 全程續接：建單→取消（寬限期內）狀態一致", async () => {
      const { service } = createReferralTestHarness();
      const booking = await service.createReferralPassengerBooking(
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Taipei Main Station",
          dropoffAddress: "Taoyuan Airport T2",
        } as never,
        referralIdentity(),
      );

      expect(booking.businessDispatchSubtype).toBe("enterprise_dispatch");
      const created = service.getOrder(booking.orderId);
      expect(created.tenantId).toBe("tenant-demo-001");
      expect(created.partnerEntrySlug).toBe("yuhe-residence");
      expect(created.status).not.toBe("cancelled");

      const cancelled = await service.cancelReferralPassengerTrip(
        booking.orderId,
        {
          orderId: booking.orderId,
          reason: "Passenger changed plans",
        } as never,
        referralIdentity(),
      );
      expect(cancelled.status).toBe("cancelled");

      // 回讀一致性：同一 orderId 在取消後再次查詢仍為同一筆訂單且狀態持久化。
      const reread = service.getOrder(booking.orderId);
      expect(reread.orderId).toBe(booking.orderId);
      expect(reread.status).toBe("cancelled");
    });

    it("1.2 建單冪等鍵重放回傳同一 booking，不重複建立第二筆訂單", async () => {
      const { service } = createReferralTestHarness();
      const command = {
        entrySlug: "yuhe-residence",
        pickupAddress: "Taipei Main Station",
        dropoffAddress: "Taoyuan Airport T2",
        idempotencyKey: "idem-referral-continuity-001",
      } as never;

      const first = await service.createReferralPassengerBooking(
        command,
        referralIdentity(),
      );
      const replay = await service.createReferralPassengerBooking(
        command,
        referralIdentity(),
      );

      expect(replay.orderId).toBe(first.orderId);
      expect(replay.replayed).toBe(true);
      expect(
        service.listOrders().filter((o) => o.orderId === first.orderId),
      ).toHaveLength(1);
    });

    it("1.3 完成行程後可評分一次，回讀分數與標籤一致；重複提交相同評分冪等回傳", async () => {
      const { service } = createReferralTestHarness();
      const booking = await service.createReferralPassengerBooking(
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Taipei Main Station",
          dropoffAddress: "Taoyuan Airport T2",
        } as never,
        referralIdentity({
          actorId: "referral-passenger-rating-001",
          drtsPassengerId: "referral-passenger-rating-001",
        }),
      );
      await completeOrder(service, booking.orderId);

      const rating = await service.submitReferralPassengerRating(
        booking.orderId,
        { score: 5, tags: ["polite", "on_time"], comment: "很準時" } as never,
        referralIdentity({
          actorId: "referral-passenger-rating-001",
          drtsPassengerId: "referral-passenger-rating-001",
        }),
      );
      expect(rating.score).toBe(5);
      expect(rating.tags.sort()).toEqual(["on_time", "polite"]);

      const replay = await service.submitReferralPassengerRating(
        booking.orderId,
        { score: 5, tags: ["polite", "on_time"], comment: "很準時" } as never,
        referralIdentity({
          actorId: "referral-passenger-rating-001",
          drtsPassengerId: "referral-passenger-rating-001",
        }),
      );
      expect(replay.score).toBe(5);
      expect(replay.submittedAt).toBe(rating.submittedAt);
    });
  });

  describe("2. 關鍵負向案例 (Negative Flows)", () => {
    it("2.1 非 referral_passenger 身分建單一律拒絕 (403 REFERRAL_PASSENGER_IDENTITY_REQUIRED)", async () => {
      const { service } = createReferralTestHarness();
      await expect(
        service.createReferralPassengerBooking(
          {
            entrySlug: "yuhe-residence",
            pickupAddress: "Taipei Main Station",
            dropoffAddress: "Taoyuan Airport T2",
          } as never,
          { actorType: "tenant_admin", realm: "tenant" } as never,
        ),
      ).rejects.toMatchObject({
        response: {
          error: { code: "REFERRAL_PASSENGER_IDENTITY_REQUIRED" },
        },
      });
    });

    it("2.2 entrySlug 與身分 partnerEntrySlug 不符一律拒絕 (403 PARTNER_SCOPE_MISMATCH)", async () => {
      const { service } = createReferralTestHarness();
      await expect(
        service.createReferralPassengerBooking(
          {
            entrySlug: "some-other-community",
            pickupAddress: "Taipei Main Station",
            dropoffAddress: "Taoyuan Airport T2",
          } as never,
          referralIdentity(),
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "PARTNER_SCOPE_MISMATCH" } },
      });
    });

    it("2.3 跨乘客取消他人行程一律拒絕 (403 PARTNER_SCOPE_MISMATCH)", async () => {
      const { service } = createReferralTestHarness();
      const booking = await service.createReferralPassengerBooking(
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Taipei Main Station",
          dropoffAddress: "Taoyuan Airport T2",
        } as never,
        referralIdentity({
          actorId: "referral-passenger-victim-001",
          drtsPassengerId: "referral-passenger-victim-001",
        }),
      );

      // 現況：跨乘客存取先在 getOrder() 內的 assertPartnerOrderIdentity 被攔截
      // （回傳 PARTNER_SCOPE_MISMATCH），cancelReferralPassengerTrip 內顯式的
      // PASSENGER_SCOPE_MISMATCH 分支對 referral_passenger 身分實質不可達；
      // 仍是安全的縱深防禦攔截，非漏洞，故此處驗證實際回傳的錯誤碼。
      await expect(
        service.cancelReferralPassengerTrip(
          booking.orderId,
          { orderId: booking.orderId, reason: "attacker cancel" } as never,
          referralIdentity({
            actorId: "referral-passenger-attacker-001",
            drtsPassengerId: "referral-passenger-attacker-001",
          }),
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "PARTNER_SCOPE_MISMATCH" } },
      });
    });

    it("2.4 尚未完成行程評分一律拒絕 (409 PASSENGER_RATING_TRIP_NOT_COMPLETED)", async () => {
      const { service } = createReferralTestHarness();
      const booking = await service.createReferralPassengerBooking(
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Taipei Main Station",
          dropoffAddress: "Taoyuan Airport T2",
        } as never,
        referralIdentity({
          actorId: "referral-passenger-early-rate-001",
          drtsPassengerId: "referral-passenger-early-rate-001",
        }),
      );

      await expect(
        service.submitReferralPassengerRating(
          booking.orderId,
          { score: 5, tags: [] } as never,
          referralIdentity({
            actorId: "referral-passenger-early-rate-001",
            drtsPassengerId: "referral-passenger-early-rate-001",
          }),
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "PASSENGER_RATING_TRIP_NOT_COMPLETED" } },
      });
    });

    it("2.5 完成後提交不同分數的評分視為衝突 (409 PASSENGER_RATING_ALREADY_SUBMITTED)", async () => {
      const { service } = createReferralTestHarness();
      const booking = await service.createReferralPassengerBooking(
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Taipei Main Station",
          dropoffAddress: "Taoyuan Airport T2",
        } as never,
        referralIdentity({
          actorId: "referral-passenger-conflict-001",
          drtsPassengerId: "referral-passenger-conflict-001",
        }),
      );
      await completeOrder(service, booking.orderId);

      await service.submitReferralPassengerRating(
        booking.orderId,
        { score: 5, tags: [] } as never,
        referralIdentity({
          actorId: "referral-passenger-conflict-001",
          drtsPassengerId: "referral-passenger-conflict-001",
        }),
      );

      await expect(
        service.submitReferralPassengerRating(
          booking.orderId,
          { score: 1, tags: [] } as never,
          referralIdentity({
            actorId: "referral-passenger-conflict-001",
            drtsPassengerId: "referral-passenger-conflict-001",
          }),
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "PASSENGER_RATING_ALREADY_SUBMITTED" } },
      });
    });
  });
});
