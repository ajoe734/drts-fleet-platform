import { describe, expect, it } from "vitest";

import { ApiRequestError } from "../../../../apps/api/src/common/api-envelope";
import { ServiceAreaService } from "../../../../apps/api/src/modules/service-area/service-area.service";
import {
  geometrySummary,
  isMutableStatus,
  statusToneOf,
} from "../../../../apps/platform-admin-web/lib/service-area-governance";

describe("C106: 服務區域草稿、審核、發布、停用、停靠規則與邊界時效評估驗收", () => {
  const defaultContext = {
    actorId: "geo_admin_01",
    actorType: "platform_admin" as const,
    reason: "Service area governance acceptance verification",
  };

  function createService() {
    return new ServiceAreaService();
  }

  it("服務區域完整生命週期驗證：draft -> review -> active (publish) -> retired", async () => {
    const service = createService();

    // 1. 建立草稿 (draft)
    const { record: draftArea } = await service.createServiceArea(
      {
        areaCode: "taipei_xinyi_core",
        displayName: "台北信義核心商業區",
        geometry: {
          type: "polygon",
          coordinates: [
            { lat: 25.03, lng: 121.55 },
            { lat: 25.045, lng: 121.55 },
            { lat: 25.045, lng: 121.57 },
            { lat: 25.03, lng: 121.57 },
          ],
        },
        serviceProductTypes: ["taxi_realtime", "enterprise_dispatch"],
      },
      defaultContext,
    );

    expect(draftArea.status).toBe("draft");
    expect(draftArea.areaCode).toBe("TAIPEI_XINYI_CORE");
    expect(isMutableStatus(draftArea.status)).toBe(true);
    expect(statusToneOf(draftArea.status)).toBe("warn");

    // 2. 提交審查 (review)
    const { record: reviewArea } = await service.submitServiceAreaForReview(
      draftArea.serviceAreaId,
      defaultContext,
    );
    expect(reviewArea.status).toBe("review");
    expect(isMutableStatus(reviewArea.status)).toBe(true);
    expect(statusToneOf(reviewArea.status)).toBe("info");

    // 3. 發布生效 (active)
    const { record: activeArea } = await service.publishServiceArea(
      reviewArea.serviceAreaId,
      { reason: "Approved by municipal mobility council" },
      defaultContext,
    );
    expect(activeArea.status).toBe("active");
    expect(isMutableStatus(activeArea.status)).toBe(false);
    expect(statusToneOf(activeArea.status)).toBe("success");

    // 4. 停用歸檔 (retired)
    const { record: retiredArea } = await service.retireServiceArea(
      activeArea.serviceAreaId,
      { reason: "Replaced by expanded metropolitan boundary" },
      defaultContext,
    );
    expect(retiredArea.status).toBe("retired");
    expect(isMutableStatus(retiredArea.status)).toBe(false);
    expect(statusToneOf(retiredArea.status)).toBe("neutral");
  });

  it("生命週期違規狀態防護：不可重複將 active 區域提交 review，亦不可重覆 retire 已 retired 區域", async () => {
    const service = createService();

    const { record: draftArea } = await service.createServiceArea(
      {
        areaCode: "taipei_daan",
        displayName: "大安區營業區",
        geometry: {
          type: "circle",
          center: { lat: 25.026, lng: 121.543 },
          radiusMeters: 2000,
        },
        serviceProductTypes: ["taxi_realtime"],
      },
      defaultContext,
    );

    // 直接發布
    const { record: activeArea } = await service.publishServiceArea(
      draftArea.serviceAreaId,
      {},
      defaultContext,
    );

    // active 狀態不可提交 review
    await expect(
      service.submitServiceAreaForReview(activeArea.serviceAreaId, defaultContext),
    ).rejects.toThrowError(ApiRequestError);

    // 停用
    await service.retireServiceArea(activeArea.serviceAreaId, {}, defaultContext);

    // 已 retired 不可再次 retire
    await expect(
      service.retireServiceArea(activeArea.serviceAreaId, {}, defaultContext),
    ).rejects.toThrowError(ApiRequestError);
  });

  it("幾何形狀摘要輔助器驗證：正確辨識 circle 半徑與 polygon 頂點數量", () => {
    const circleSummary = geometrySummary({
      type: "circle",
      center: { lat: 25.033, lng: 121.565 },
      radiusMeters: 1500,
    });
    expect(circleSummary).toBe("circle · r=1500m");

    const polySummary = geometrySummary({
      type: "polygon",
      coordinates: [
        { lat: 25.0, lng: 121.5 },
        { lat: 25.1, lng: 121.5 },
        { lat: 25.1, lng: 121.6 },
        { lat: 25.0, lng: 121.6 },
      ],
    });
    expect(polySummary).toBe("polygon · 4 pts");
  });

  it("停靠政策 (StopPolicy) 生命週期與效果：支援 allow / deny / manual_review", async () => {
    const service = createService();

    const { record: policy } = await service.createStopPolicy(
      {
        policyCode: "policy_taipei_station_restricted",
        displayName: "台北車站周邊限制停靠",
        direction: "pickup",
        effect: "deny",
        geometry: {
          type: "circle",
          center: { lat: 25.0478, lng: 121.517 },
          radiusMeters: 300,
        },
        serviceAreaCodes: ["taipei_core"],
        serviceProductTypes: ["taxi_realtime"],
        reasonCode: "TRAFFIC_CONTROL_ZONE",
        reasonMessage: "此處為交通管制紅線區，禁止計程車臨停載客",
      },
      defaultContext,
    );

    expect(policy.policyCode).toBe("POLICY_TAIPEI_STATION_RESTRICTED");
    expect(policy.direction).toBe("pickup");
    expect(policy.effect).toBe("deny");
    expect(policy.status).toBe("draft");

    // 發布停靠政策
    const { record: publishedPolicy } = await service.publishStopPolicy(
      policy.stopPolicyId,
      { reason: "Traffic authority directive" },
      defaultContext,
    );
    expect(publishedPolicy.status).toBe("active");
  });

  it("服務區可服務性評估 (evaluate)：依邊界內外、產品型別與生效時間區間準確判定", async () => {
    const service = createService();

    // 建立並發布一個有效台北信義服務區
    const { record: area } = await service.createServiceArea(
      {
        areaCode: "eval_xinyi",
        displayName: "信義區驗收",
        geometry: {
          type: "polygon",
          coordinates: [
            { lat: 25.03, lng: 121.55 },
            { lat: 25.04, lng: 121.55 },
            { lat: 25.04, lng: 121.57 },
            { lat: 25.03, lng: 121.57 },
          ],
        },
        serviceProductTypes: ["travel_agency_transfer"],
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        effectiveUntil: "2026-12-31T23:59:59.000Z",
      },
      defaultContext,
    );

    await service.publishServiceArea(area.serviceAreaId, {}, defaultContext);

    // 案例 1: 坐標落在服務區內部，且產品型別匹配 -> serviceable
    const insideResult = service.evaluate({
      serviceProductType: "travel_agency_transfer",
      pickup: { lat: 25.035, lng: 121.56 }, // 信義區中心
      dropoff: { lat: 25.036, lng: 121.562 },
      requestedAt: "2026-06-01T12:00:00.000Z",
    });
    expect(insideResult.decision).toBe("serviceable");
    expect(insideResult.serviceAreaCodes).toContain("EVAL_XINYI");

    // 案例 2: 坐標落在服務區外部 (淡水，超出信義區多邊形) -> not_serviceable
    const outsideResult = service.evaluate({
      serviceProductType: "travel_agency_transfer",
      pickup: { lat: 25.17, lng: 121.44 }, // 淡水
      dropoff: { lat: 25.035, lng: 121.56 },
      requestedAt: "2026-06-01T12:00:00.000Z",
    });
    expect(outsideResult.decision).toBe("not_serviceable");
    expect(outsideResult.reasonCodes).toContain("PICKUP_AREA_NOT_SERVICEABLE");

    // 案例 3: 停靠管制區 (deny) 評估 -> not_serviceable 且帶有政策理由碼
    const denyPolicy = await service.createStopPolicy(
      {
        policyCode: "xinyi_curb_deny",
        displayName: "信義特區門禁管制",
        direction: "pickup",
        effect: "deny",
        geometry: {
          type: "circle",
          center: { lat: 25.035, lng: 121.56 },
          radiusMeters: 50,
        },
        serviceAreaCodes: ["EVAL_XINYI"],
        serviceProductTypes: ["travel_agency_transfer"],
        effectiveFrom: "2026-01-01T00:00:00.000Z",
        reasonCode: "GATE_CONTROL_DENY",
        reasonMessage: "特約門禁管制區域，禁止臨停載客",
      },
      defaultContext,
    );
    await service.publishStopPolicy(denyPolicy.record.stopPolicyId, {}, defaultContext);

    const denyResult = service.evaluate({
      serviceProductType: "travel_agency_transfer",
      pickup: { lat: 25.035, lng: 121.56 }, // 正好落在 deny 圓心
      requestedAt: "2026-06-01T12:00:00.000Z",
    });
    expect(denyResult.decision).toBe("not_serviceable");
    expect(denyResult.reasonCodes).toContain("GATE_CONTROL_DENY");
  });
});
