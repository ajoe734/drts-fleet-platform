/**
 * Non-production fixture payloads for the passenger screens.
 *
 * IMPORTANT: nothing in the statically reachable production graph may import
 * this module. It is reached only through `loadPassengerRideFixture()` in
 * `passenger-fixture-loader.ts`, whose dynamic `import()` is gated on a
 * non-production build, so the fixture chunk is never part of the production
 * entry bundle. `getPassengerRideFixture` additionally fails closed at runtime,
 * so even a bundler change that pulled the chunk in cannot serve demo data to a
 * passenger (P5-PAX-GATE-001).
 */
import type {
  MultiTaxiPublicFareVersion,
  PassengerDispatchDisclosureSnapshot,
  ResolvedAddressPayload,
} from "@drts/contracts";

import type {
  PassengerRideFixture,
  PassengerScreenId,
  PassengerTimelineEvent,
} from "./passenger-view-model";

const assignmentBase: PassengerDispatchDisclosureSnapshot = {
  snapshotId: "snap-p5-demo-001",
  runtimeProfileCode: "multi_taxi_direct",
  orderId: "ZX-240720-0186",
  bookingId: "PB-0186",
  dispatchJobId: "DJ-7810",
  assignmentId: "ASG-1288",
  assignmentVersion: 3,
  vehicle: {
    vehicleId: "veh-001",
    make: "Toyota",
    model: "Corolla Altis",
    plateNo: "BKR-2208",
    modelYear: 2024,
    doorCount: 4,
    color: "珍珠白",
    profileVersion: 11,
  },
  driver: {
    driverId: "drv-001",
    displayName: "吳明翰",
    registrationMaskedDisplay: "北市計字第12***67號",
    registrationStatus: "verified_active",
    registrationEffectiveUntil: "2027-12-31",
    credentialVersion: 8,
  },
  rating: {
    displayState: "rated",
    averageRating: 4.9,
    ratingCount: 328,
    aggregateVersion: 15,
  },
  eta: {
    minutes: 6,
    calculatedAt: "2026-07-21T14:29:00+08:00",
    locationFreshness: "fresh",
  },
  routeFare: {
    routeSnapshotId: "route-001",
    quoteSnapshotId: "quote-001",
    orderId: "ZX-240720-0186",
    pickup: createResolvedAddress(
      "臺北市信義區松仁路 100 號",
      "信義總部",
      25.0339,
      121.5645,
    ),
    dropoff: createResolvedAddress(
      "臺北市中山區南京東路二段 100 號",
      "南京辦公室",
      25.0522,
      121.5338,
    ),
    estimatedDistanceMeters: 6200,
    estimatedDurationSeconds: 1080,
    encodedPolyline: null,
    chargingMode: "meter_estimate",
    estimatedFareMinor: 35500,
    payableFareMinor: null,
    currency: "NTD",
    farePolicyId: "fare-policy-2026-07",
    farePolicyVersion: "F-2026-03",
    fareChangeRuleId: "fare-rule-001",
    fareChangeRuleVersion: "FR-2026-07",
    fareChangeRuleDisplayText:
      "若乘客要求變更目的地、增加停靠點，或因依法需支付通行費，實際車資可能調整。",
    passengerConfirmedAt: null,
    generatedAt: "2026-07-21T14:29:00+08:00",
  },
  createdAt: "2026-07-21T14:29:00+08:00",
  supersededAt: null,
};

const timelineBase: PassengerTimelineEvent[] = [
  {
    eventType: "assignment_disclosure_ready",
    happenedAt: "14:29",
    summary: "已建立乘客揭露快照",
  },
  {
    eventType: "eta_changed",
    happenedAt: "14:30",
    summary: "更新預估抵達時間",
  },
];

const fareVersion: MultiTaxiPublicFareVersion = {
  fareVersionId: "fare-public-2026-07-01",
  displayName: "現行計費表",
  status: "active",
  effectiveFrom: "2026-07-01",
  effectiveUntil: null,
  publicSummary:
    "起程運價 NT$85；續程每 200 公尺 NT$5；延滯計時每 80 秒 NT$5。",
  authorityFilingRef: "北市交運字第1130042號",
};

type AssignmentFixtureOverride = {
  assignmentVersion?: number;
  supersededAt?: string | null;
  vehicle?: Partial<PassengerDispatchDisclosureSnapshot["vehicle"]>;
  driver?: Partial<PassengerDispatchDisclosureSnapshot["driver"]>;
  rating?: Partial<PassengerDispatchDisclosureSnapshot["rating"]>;
  eta?: Partial<PassengerDispatchDisclosureSnapshot["eta"]>;
  routeFare?: Partial<PassengerDispatchDisclosureSnapshot["routeFare"]>;
};

function createResolvedAddress(
  address: string,
  addressName: string,
  lat: number,
  lng: number,
): ResolvedAddressPayload {
  return {
    address,
    addressName,
    lat,
    lng,
    coordinateSource: "provider_candidate",
    geocodeConfidence: "exact",
    resolvedAt: "2026-07-21T14:29:00+08:00",
  };
}

function cloneAssignment(
  overrides?: AssignmentFixtureOverride,
): PassengerDispatchDisclosureSnapshot {
  return {
    ...assignmentBase,
    ...overrides,
    vehicle: {
      ...assignmentBase.vehicle,
      ...overrides?.vehicle,
    },
    driver: {
      ...assignmentBase.driver,
      ...overrides?.driver,
    },
    rating: {
      ...assignmentBase.rating,
      ...overrides?.rating,
    },
    eta: {
      ...assignmentBase.eta,
      ...overrides?.eta,
    },
    routeFare: {
      ...assignmentBase.routeFare,
      ...overrides?.routeFare,
    },
  };
}

export const PASSENGER_PRODUCTION_FIXTURE_FORBIDDEN =
  "PASSENGER_PRODUCTION_FIXTURE_FORBIDDEN";

export function getPassengerRideFixture(
  screenId: PassengerScreenId,
  token: string,
): PassengerRideFixture {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${PASSENGER_PRODUCTION_FIXTURE_FORBIDDEN}: production must render live passenger authority data.`,
    );
  }
  const base = {
    token,
    pickupLabel: "臺北市信義區松仁路 100 號",
    dropoffLabel: "臺北市中山區南京東路二段 100 號",
    routeDistanceKm: "約 6.2 公里",
    routeDurationMinutes: "約 18 分鐘",
    routeFareMode: "range" as const,
    routeFareText: "預估車資 NT$ 320–380",
    routeFareHint: "依計費表實際金額收費",
    driver: {
      name: "吳明翰",
      vehicle: "Toyota Corolla Altis",
      plateNo: "BKR-2208",
      color: "珍珠白",
      registrationMaskedDisplay: "北市計字第12***67號",
      registrationEffectiveUntil: "2027/12/31",
      ratingState: "rated" as const,
    },
    actionMode: "driver_contact_ready" as const,
    mapState: "fresh" as const,
    assignment: cloneAssignment(),
    timeline: timelineBase,
  };

  switch (screenId) {
    case "P5-01":
      return {
        ...base,
        screenId,
        title: "Awaiting Assignment",
        status: "正在安排車輛",
        statusSubline: "通常 1–3 分鐘完成指派",
        mapState: "missing",
        cancelNote: "指派前取消不收費",
        actionLabel: "取消行程",
      };
    case "P5-02":
      return {
        ...base,
        screenId,
        title: "Driver En Route",
        status: "司機正在前往",
        etaMain: "預計 6 分鐘抵達",
        etaSub: "約 14:35 抵達",
        cancelNote: "2:15 內取消不收費",
      };
    case "P5-03":
      return {
        ...base,
        screenId,
        title: "Assigned New Driver",
        status: "車輛已指派",
        etaMain: "預計 8 分鐘抵達",
        etaSub: "約 14:37 抵達",
        driver: {
          ...base.driver,
          name: "林建成",
          plateNo: "TDK-9317",
          ratingState: "new_driver",
        },
        assignment: cloneAssignment({
          vehicle: { plateNo: "TDK-9317" },
          driver: { displayName: "林建成" },
          rating: {
            displayState: "new_driver",
            averageRating: null,
            ratingCount: 0,
            aggregateVersion: 0,
          },
        }),
      };
    case "P5-04":
      return {
        ...base,
        screenId,
        title: "Redispatch In Progress",
        status: "正在為您改派",
        statusSubline: "原車輛無法完成本趟服務，車資與行程不受影響",
        mapState: "missing",
        cancelNote: "改派期間取消不收費",
        banner: {
          tone: "warning",
          title: "原指派已取消",
          detail: "正在重新確認另一輛車與駕駛資料",
        },
      };
    case "P5-05":
      return {
        ...base,
        screenId,
        title: "Redispatch Complete",
        status: "車輛已指派",
        etaMain: "預計 5 分鐘抵達",
        etaSub: "約 14:36 抵達",
        banner: {
          tone: "success",
          title: "已為您改派新的車輛",
          meta: "14:31 已完成改派",
        },
        driver: {
          ...base.driver,
          name: "林建成",
          plateNo: "TDK-9317",
        },
        assignment: cloneAssignment({
          assignmentVersion: 4,
          vehicle: { plateNo: "TDK-9317" },
          driver: { displayName: "林建成" },
        }),
        timeline: [
          ...timelineBase,
          {
            eventType: "assignment_replaced",
            happenedAt: "14:31",
            summary: "改派完成，請重新核對車牌",
          },
        ],
      };
    case "P5-06":
      return {
        ...base,
        screenId,
        title: "Driver Arrived",
        status: "司機已抵達",
        etaMain: "司機已抵達上車點",
        etaSub: "請於 3 分鐘內上車 · 核對車牌後再上車",
        etaTone: "success",
        seatbeltNotice: true,
        cancelNote: "取消可能產生 NT$ 80 費用",
      };
    case "P5-07":
      return {
        ...base,
        screenId,
        title: "Trip In Progress",
        status: "行程進行中",
        etaMain: "約 14:58 抵達目的地",
        etaSub: "剩餘約 4.1 公里",
        mapState: "stale",
        seatbeltNotice: true,
      };
    case "P5-08":
      return {
        ...base,
        screenId,
        title: "Rate Completed Trip",
        status: "行程已完成",
        routeFareText: "本趟車資 NT$ 355",
        ratingSummary: {
          state: "rated",
          scoreText: "5 非常滿意",
          countText: "吳明翰 · BKR-2208 · 14:32–15:07",
          chips: ["準時抵達", "駕駛有禮", "車內整潔", "行車平穩", "路線適當"],
        },
        payment: {
          status: "captured",
          label: "付款完成",
          detail: "款項已完成扣款。",
          tone: "success",
          amountText: "NT$ 355",
        },
        certificate: {
          state: "pending",
        },
      };
    case "P5-09":
      return {
        ...base,
        screenId,
        title: "Rating Submitted",
        status: "行程已完成",
        banner: {
          tone: "success",
          title: "感謝您的評價",
          detail: "您的意見會協助我們維持服務品質。",
        },
        payment: {
          status: "captured",
          label: "付款完成",
          detail: "款項已完成扣款。",
          tone: "success",
          amountText: "NT$ 355",
        },
        certificate: {
          state: "pending",
        },
      };
    case "P5-10":
      return {
        ...base,
        screenId,
        title: "Electronic Ride Certificate",
        status: "電子乘車證明",
        payment: {
          status: "captured",
          label: "付款完成",
          detail: "款項已完成扣款。",
          tone: "success",
          amountText: "NT$ 355",
        },
        certificate: {
          state: "available",
          receiptNo: "RC-2607-0186",
          rows: [
            { label: "乘車證明編號", value: "RC-2607-0186", mono: true },
            { label: "開立時間", value: "2026/07/21 15:08", mono: true },
            { label: "車牌", value: "BKR-2208", mono: true },
            { label: "上車時間", value: "2026/07/21 14:32", mono: true },
            { label: "下車時間", value: "2026/07/21 15:07", mono: true },
            { label: "行駛時間", value: "35 分鐘" },
            {
              label: "路線",
              value: "信義區松仁路 100 號 → 中山區南京東路二段 100 號",
            },
            { label: "行駛里程", value: "6.4 公里", mono: true },
            { label: "車資", value: "NT$ 355", mono: true },
            { label: "通行費", value: "NT$ 0", mono: true },
            { label: "客服電話", value: "0800-090-000", mono: true },
            { label: "主管機關申訴電話", value: "1999", mono: true },
          ],
        },
      };
    case "P5-11":
      return {
        ...base,
        screenId,
        title: "Disclosure Unavailable",
        status: "正在安排車輛",
        mapState: "missing",
        actionMode: "support_only",
        disclosureBlockReason: "P5_RATING_STATE_UNINITIALIZED",
        banner: {
          tone: "warning",
          title: "派車資訊尚未完整",
          detail: "系統正在重新確認車輛與駕駛資料，完成後會立即通知您。",
        },
        assignment: null,
        driver: {
          ...base.driver,
          ratingState: "unavailable",
        },
      };
    case "P5-12":
      return {
        ...base,
        screenId,
        title: "Driver Contact Not Provisioned",
        status: "司機正在前往",
        etaMain: "預計 6 分鐘抵達",
        etaSub: "約 14:35 抵達",
        actionMode: "support_only",
        contactSafetyNote: "目前無法直接聯絡司機，請改聯絡客服協助轉達。",
      };
    case "A03":
      return {
        ...base,
        screenId,
        title: "Public Fare Disclosure",
        status: "計費說明",
        fareVersion,
      };
    case "A04":
      return {
        ...base,
        screenId,
        title: "Fare Quote Anomaly",
        status: "正在確認預約",
        mapState: "missing",
        routeFareMode: "anomaly",
        routeFareText: "目前無法取得正式報價",
        routeFareHint: "正式報價完成前不會為您確認訂單",
        actionMode: "support_only",
        banner: {
          tone: "warning",
          title: "請稍後重試或聯絡客服",
          detail: "quote_provider_unavailable",
        },
      };
  }
}
