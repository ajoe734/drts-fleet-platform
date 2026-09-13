import { describe, expect, it } from "vitest";
import type {
  RouteFareDisclosureSnapshot,
  InvalidatePassengerTripRatingCommand,
} from "@drts/contracts";
import { FareAnomalyService } from "../../../../apps/api/src/modules/product-rule/fare-anomaly.service";
import { FareAnomalyRepository } from "../../../../apps/api/src/modules/product-rule/fare-anomaly.repository";
import { AuditNotificationService } from "../../../../apps/api/src/modules/audit-notification/audit-notification.service";
import type { FareQuoteRecoveryPort } from "../../../../apps/api/src/modules/product-rule/fare-quote-recovery.port";
import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { MultiTaxiService } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.service";
import { MultiTaxiRepository } from "../../../../apps/api/src/modules/multi-taxi/multi-taxi.repository";

function buildSnapshot(
  quoteSnapshotId: string,
  passengerConfirmedAt: string | null = null,
): RouteFareDisclosureSnapshot {
  return {
    routeSnapshotId: `route-${quoteSnapshotId}`,
    quoteSnapshotId,
    orderId: `order-${quoteSnapshotId}`,
    pickup: {
      address: "台北市信義區市府路1號",
      lat: 25.037,
      lng: 121.563,
      coordinateSource: "provider_candidate",
      geocodeConfidence: "exact",
      resolvedAt: "2026-09-01T08:00:00.000Z",
    },
    dropoff: {
      address: "台北市南港區經貿二路1號",
      lat: 25.056,
      lng: 121.618,
      coordinateSource: "provider_candidate",
      geocodeConfidence: "exact",
      resolvedAt: "2026-09-01T08:01:00.000Z",
    },
    estimatedDistanceMeters: 7500,
    estimatedDurationSeconds: 1200,
    encodedPolyline: null,
    chargingMode: "fixed_quote",
    estimatedFareMinor: 32000,
    payableFareMinor: 32000,
    currency: "TWD",
    farePolicyId: "fare-policy-standard",
    farePolicyVersion: "v1.2",
    fareChangeRuleId: "none",
    fareChangeRuleVersion: "v1",
    fareChangeRuleDisplayText: "無費率變更",
    passengerConfirmedAt,
    generatedAt: "2026-09-01T08:02:00.000Z",
  };
}

describe("C095: 車資異常處理、評價審查與補正驗收 (原交易不可覆寫)", () => {
  const audit = new AuditNotificationService();

  // ── 1. 車資異常處置與原始交易不可覆寫 ──────────────────────────────────────

  it("車資異常紀錄建立與處置：原始報價快照不可覆寫，處置透過審計與狀態追蹤", async () => {
    const repository = new FareAnomalyRepository();
    const recoveryPort: FareQuoteRecoveryPort = {
      isAvailable: () => true,
      recover: async () => ({
        status: "completed",
        message: "Recovered via provider re-quote",
      }),
    };
    const service = new FareAnomalyService(repository, audit, recoveryPort);
    await service.onModuleInit();

    const snapshot = buildSnapshot("quote-anomaly-001");

    // 1. 記錄異常
    const recorded = await service.recordQuoteAnomaly({
      reason: "calculation_mismatch",
      snapshot,
    });

    expect(recorded.snapshot.quoteSnapshotId).toBe("quote-anomaly-001");
    expect(recorded.snapshot.orderId).toBe("order-quote-anomaly-001");
    expect(recorded.snapshot.payableFareMinor).toBe(32000);
    expect(recorded.snapshot.currency).toBe("TWD");
    expect(recorded.snapshot.chargingMode).toBe("fixed_quote");

    // 2. 處置前回讀驗證
    const beforeResolve = service.get("quote-anomaly-001");
    expect(beforeResolve.snapshot.quoteSnapshotId).toBe("quote-anomaly-001");
    expect(beforeResolve.snapshot.payableFareMinor).toBe(32000);
    expect(beforeResolve.snapshot.currency).toBe("TWD");

    // 3. 處置異常（解決訂單相關異常）
    await service.resolveOrderAnomalies("order-quote-anomaly-001", "2026-09-01T09:00:00.000Z");

    // 4. 回讀確認：未解決清單已清空，原異常已標記解決
    const remaining = service.list();
    expect(remaining.find((r) => r.snapshot.quoteSnapshotId === "quote-anomaly-001")).toBeUndefined();
  });

  it("負向防禦：已由乘客確認之車資快照嚴禁事後被標記為異常 (409 FARE_ANOMALY_ALREADY_CONFIRMED)", async () => {
    const repository = new FareAnomalyRepository();
    const recoveryPort: FareQuoteRecoveryPort = {
      isAvailable: () => true,
      recover: async () => ({ status: "completed", message: "ok" }),
    };
    const service = new FareAnomalyService(repository, audit, recoveryPort);
    await service.onModuleInit();

    const confirmedSnapshot = buildSnapshot(
      "quote-confirmed-001",
      "2026-09-01T08:10:00.000Z", // 已由乘客確認
    );

    try {
      await service.recordQuoteAnomaly({
        reason: "calculation_mismatch",
        snapshot: confirmedSnapshot,
      });
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(409);
      expect(err.response?.error?.code).toBe("FARE_ANOMALY_ALREADY_CONFIRMED");
    }
  });

  // ── 2. 乘客評分審查與作廢 (Rating Invalidation) ──────────────────────────

  it("乘客評分作廢治理：不可刪除原評分紀錄，寫入審計軌跡並重新計算司機信譽權重", async () => {
    const multiTaxiRepo = new MultiTaxiRepository();
    const service = new MultiTaxiService(
      {} as never, // ownedMobilityService
      multiTaxiRepo, // repository
      {} as never, // serviceProductService
      audit, // auditNotificationService
      {} as never, // maskedCallPort
      {} as never, // passengerPushPort
    );

    const ratingId = "RATING-MALICIOUS-001";
    const driverId = "DRV-TPE-001";

    // 設置記憶體內既有評分紀錄
    (service as any).ratingsById.set(ratingId, {
      ratingId,
      orderId: "ORD-001",
      tripId: "TRIP-001",
      driverId,
      passengerSubjectRef: "PAX-001",
      score: 1, // 惡意負評
      tags: ["bad_attitude"],
      comment: "惡意留下情緒性侮辱字眼與不實投訴",
      status: "active",
      submittedAt: "2026-09-01T10:00:00.000Z",
      createdAt: "2026-09-01T10:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    });

    // 1. 執行作廢評分
    const command: InvalidatePassengerTripRatingCommand = {
      reason: "確認為乘客與司機糾紛後之惡意情緒性負評，經監理與客訴對質審核通過作廢",
      idempotencyKey: "idemp-rating-inval-001",
      confirmation: {
        action: "invalidate_rating",
        ratingId,
      },
    };

    const result = await service.invalidatePassengerRating(
      ratingId,
      command,
      "auditor-moderator-01",
      "req-inval-001",
    );

    expect(result.rating.ratingId).toBe(ratingId);
    expect(result.rating.status).toBe("invalidated");
    expect(result.audit).toBeDefined();
    expect(result.audit.reason).toContain("惡意情緒性負評");

    // 2. 使用相同 idempotency key 再次送出 -> 冪等重送（replayed: true），不報錯
    const replayResult = await service.invalidatePassengerRating(
      ratingId,
      command,
      "auditor-moderator-01",
      "req-inval-001-replay",
    );
    expect(replayResult.replayed).toBe(true);
    expect(replayResult.rating.status).toBe("invalidated");

    // 3. 使用不同 idempotency key 再次嘗試對已作廢評分進行作廢 -> 拋出 409 Conflict (RATING_ALREADY_INVALIDATED)
    const duplicateCommand: InvalidatePassengerTripRatingCommand = {
      ...command,
      idempotencyKey: "idemp-rating-inval-002-different",
    };
    try {
      await service.invalidatePassengerRating(
        ratingId,
        duplicateCommand,
        "auditor-moderator-01",
        "req-inval-002",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(409);
      expect(err.response?.error?.code).toBe("RATING_ALREADY_INVALIDATED");
    }
  });

  it("評分作廢防呆：若 confirmation 與路徑 ratingId 不一致時拋出 400", async () => {
    const service = new MultiTaxiService(
      {} as never,
      new MultiTaxiRepository(),
      {} as never,
      audit,
      {} as never,
      {} as never,
    );

    try {
      await service.invalidatePassengerRating(
        "RATING-001",
        {
          reason: "測試作廢",
          idempotencyKey: "idemp-mismatch",
          confirmation: {
            action: "invalidate_rating",
            ratingId: "RATING-DIFFERENT-002", // 不一致
          },
        },
        "admin-01",
      );
      expect.unreachable();
    } catch (err: any) {
      expect(err).toBeInstanceOf(ApiRequestError);
      expect(err.status).toBe(400);
      expect(err.response?.error?.code).toBe("RATING_INVALIDATION_CONFIRMATION_INVALID");
    }
  });
});
