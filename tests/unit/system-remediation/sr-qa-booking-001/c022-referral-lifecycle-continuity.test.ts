import { describe, expect, it } from "vitest";

import { domainFixture } from "../../referral-embed-verified-session-canonical-journey-20261015/domain-fixture";
import type { OwnedMobilityService } from "../../../../apps/api/src/modules/owned-mobility/owned-mobility.service";

// Original C022 business assertions run through actual quote/create/readback and
// normal driver lifecycle, with explicitly published unit policy and SQL ports.
async function createReferralTestHarness() {
  const f = await domainFixture();
  return {
    ...f,
    tenantPartnerService: f.partner,
    referralIdentity: async (overrides: Record<string, unknown> = {}) =>
      f.identity(String(overrides.drtsPassengerId ?? "unit-referral")),
  };
}
async function book(service: OwnedMobilityService, command: any, who: any) {
  if (
    who.realm !== "partner" ||
    who.actorType !== "referral_passenger" ||
    command.entrySlug !== who.partnerEntrySlug
  )
    return service.createReferralPassengerBooking(command, who);
  const quote = await service.quoteReferralPassengerFare(
    {
      entrySlug: command.entrySlug,
      pickupAddress: command.pickupAddress,
      dropoffAddress: command.dropoffAddress,
      ...(command.scheduledAt ? { scheduledAt: command.scheduledAt } : {}),
      ...(command.vehicleType ? { vehicleType: command.vehicleType } : {}),
    },
    who,
  );
  // Exact same command retries must keep their original owned quote too.
  const keyed = ((service as any).__c022Commands ??= new Map());
  const quoteId = command.idempotencyKey
    ? (keyed.get(command.idempotencyKey) ?? quote.quoteId)
    : quote.quoteId;
  if (command.idempotencyKey) keyed.set(command.idempotencyKey, quoteId);
  return service.createReferralPassengerBooking(
    {
      ...command,
      quoteId,
      passengerName: "C022 synthetic passenger",
      passengerPhone: "0912345678",
    },
    who,
  );
}

async function completeOrder(service: OwnedMobilityService, orderId: string) {
  const dispatchJob = await service.dispatchOrder(orderId, { mode: "auto" });
  const assignment = await service.assignDispatch({
    dispatchJobId: (dispatchJob as { dispatchJobId: string }).dispatchJobId,
    vehicleId: "vehicle-referral-001",
    driverId: "driver-referral-001",
  });
  await service.acceptDriverTask(assignment.taskId, {
    acceptedAt: new Date().toISOString(),
  });
  await service.departDriverTask(assignment.taskId, {
    departedAt: new Date().toISOString(),
  });
  await service.arrivedPickup(assignment.taskId, {
    arrivedAt: new Date().toISOString(),
  });
  await service.startDriverTask(assignment.taskId, {
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
      const { service, referralIdentity } = await createReferralTestHarness();
      const booking = await book(
        service,
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Taipei Main Station",
          dropoffAddress: "Taoyuan Airport T2",
        } as never,
        await referralIdentity(),
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
        await referralIdentity(),
      );
      expect(cancelled.status).toBe("cancelled");

      // 回讀一致性：同一 orderId 在取消後再次查詢仍為同一筆訂單且狀態持久化。
      const reread = service.getOrder(booking.orderId);
      expect(reread.orderId).toBe(booking.orderId);
      expect(reread.status).toBe("cancelled");
    });

    it("1.2 建單冪等鍵重放回傳同一 booking，不重複建立第二筆訂單", async () => {
      const { service, referralIdentity } = await createReferralTestHarness();
      const command = {
        entrySlug: "yuhe-residence",
        pickupAddress: "Taipei Main Station",
        dropoffAddress: "Taoyuan Airport T2",
        idempotencyKey: "idem-referral-continuity-001",
      } as never;

      const first = await book(service, command, await referralIdentity());
      const replay = await book(service, command, await referralIdentity());

      expect(replay.orderId).toBe(first.orderId);
      expect(replay.replayed).toBe(true);
      expect(
        service.listOrders().filter((o) => o.orderId === first.orderId),
      ).toHaveLength(1);
    });

    it("1.3 完成行程後可評分一次，回讀分數與標籤一致；重複提交相同評分冪等回傳", async () => {
      const { service, referralIdentity } = await createReferralTestHarness();
      const booking = await book(
        service,
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Taipei Main Station",
          dropoffAddress: "Taoyuan Airport T2",
        } as never,
        await referralIdentity({
          actorId: "referral-passenger-rating-001",
          drtsPassengerId: "referral-passenger-rating-001",
        }),
      );
      await completeOrder(service, booking.orderId);

      const rating = await service.submitReferralPassengerRating(
        booking.orderId,
        {
          orderId: booking.orderId,
          contactRequested: false,
          score: 5,
          tags: ["polite", "on_time"],
          comment: "很準時",
        } as never,
        await referralIdentity({
          actorId: "referral-passenger-rating-001",
          drtsPassengerId: "referral-passenger-rating-001",
        }),
      );
      expect(rating.score).toBe(5);
      expect(rating.tags.sort()).toEqual(["on_time", "polite"]);

      const replay = await service.submitReferralPassengerRating(
        booking.orderId,
        {
          orderId: booking.orderId,
          contactRequested: false,
          score: 5,
          tags: ["polite", "on_time"],
          comment: "很準時",
        } as never,
        await referralIdentity({
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
      const { service } = await createReferralTestHarness();
      await expect(
        book(
          service,
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
      const { service, referralIdentity } = await createReferralTestHarness();
      await expect(
        book(
          service,
          {
            entrySlug: "some-other-community",
            pickupAddress: "Taipei Main Station",
            dropoffAddress: "Taoyuan Airport T2",
          } as never,
          await referralIdentity(),
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "PARTNER_SCOPE_MISMATCH" } },
      });
    });

    it("2.3 跨乘客取消他人行程一律拒絕 (403 PARTNER_SCOPE_MISMATCH)", async () => {
      const { service, referralIdentity } = await createReferralTestHarness();
      const booking = await book(
        service,
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Taipei Main Station",
          dropoffAddress: "Taoyuan Airport T2",
        } as never,
        await referralIdentity({
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
          await referralIdentity({
            actorId: "referral-passenger-attacker-001",
            drtsPassengerId: "referral-passenger-attacker-001",
          }),
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "PARTNER_SCOPE_MISMATCH" } },
      });
    });

    it("2.4 尚未完成行程評分一律拒絕 (409 PASSENGER_RATING_TRIP_NOT_COMPLETED)", async () => {
      const { service, referralIdentity } = await createReferralTestHarness();
      const booking = await book(
        service,
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Taipei Main Station",
          dropoffAddress: "Taoyuan Airport T2",
        } as never,
        await referralIdentity({
          actorId: "referral-passenger-early-rate-001",
          drtsPassengerId: "referral-passenger-early-rate-001",
        }),
      );

      await expect(
        service.submitReferralPassengerRating(
          booking.orderId,
          {
            orderId: booking.orderId,
            contactRequested: false,
            score: 5,
            tags: [],
          } as never,
          await referralIdentity({
            actorId: "referral-passenger-early-rate-001",
            drtsPassengerId: "referral-passenger-early-rate-001",
          }),
        ),
      ).rejects.toMatchObject({
        response: { error: { code: "PASSENGER_RATING_TRIP_NOT_COMPLETED" } },
      });
    });

    it("2.5 完成後提交不同分數的評分視為衝突 (409 PASSENGER_RATING_ALREADY_SUBMITTED)", async () => {
      const { service, referralIdentity } = await createReferralTestHarness();
      const booking = await book(
        service,
        {
          entrySlug: "yuhe-residence",
          pickupAddress: "Taipei Main Station",
          dropoffAddress: "Taoyuan Airport T2",
        } as never,
        await referralIdentity({
          actorId: "referral-passenger-conflict-001",
          drtsPassengerId: "referral-passenger-conflict-001",
        }),
      );
      await completeOrder(service, booking.orderId);

      await service.submitReferralPassengerRating(
        booking.orderId,
        {
          orderId: booking.orderId,
          contactRequested: false,
          score: 5,
          tags: [],
        } as never,
        await referralIdentity({
          actorId: "referral-passenger-conflict-001",
          drtsPassengerId: "referral-passenger-conflict-001",
        }),
      );

      await expect(
        service.submitReferralPassengerRating(
          booking.orderId,
          {
            orderId: booking.orderId,
            contactRequested: false,
            score: 1,
            tags: [],
          } as never,
          await referralIdentity({
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
