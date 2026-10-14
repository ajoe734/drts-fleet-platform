import type {
  FareVersion,
  PassengerDispatchDisclosureSnapshot,
  PassengerRideAuthorityView,
  ResolvedAddressPayload,
  MultiTaxiElectronicReceipt,
} from "@drts/contracts";

export const NATIVE_DEMO_BASE_URL = "https://native-passenger-demo.invalid";
export const NATIVE_DEMO_OTP = "123456";
export const NATIVE_DEMO_NOTICE =
  "模擬示意：全部帳號、車輛、業者與付款資料為虛構；未發送訊息、預約真實車輛、扣款或開立正式憑證。";
/** Captured shared booking fixture numbers; no pricing/service-area calculation here. */
export const NATIVE_DEMO_FARE: FareVersion = {
  version: "DEMO-captured-tariff",
  effectiveAt: "2023-04-01T00:00:00+08:00",
  baseFare: 85,
  baseDistanceMeters: 1250,
  distanceRate: 5,
  distanceIncrementMeters: 200,
  delayRate: 5,
  delayIncrementSeconds: 60,
  nightSurcharge: 20,
  nightSurchargeWindowStart: "23:00",
  nightSurchargeWindowEnd: "06:00",
  additionalFees: {},
};
export const NATIVE_DEMO_QUOTE = {
  estimatedMin: 260,
  estimatedMax: 280,
  amountMinor: 26000,
};
export const NATIVE_DEMO_ADDRESSES: ResolvedAddressPayload[] = [
  {
    address: "示意起點：中央廣場 DEMO",
    lat: 25.0478,
    lng: 121.517,
    addressId: "DEMO-central",
    providerCandidateId: "DEMO-central",
    coordinateSource: "provider_candidate",
    geocodeConfidence: "approximate",
    geocodeProvider: "DEMO",
    surface: "passenger_entry",
    resolvedAt: "2026-10-14T00:00:00Z",
  },
  {
    address: "示意終點：展示中心 DEMO",
    lat: 25.0338,
    lng: 121.5645,
    addressId: "DEMO-exhibition",
    providerCandidateId: "DEMO-exhibition",
    coordinateSource: "provider_candidate",
    geocodeConfidence: "approximate",
    geocodeProvider: "DEMO",
    surface: "passenger_entry",
    resolvedAt: "2026-10-14T00:00:00Z",
  },
];
export function capturedDemoAssignment(
  ride: PassengerRideAuthorityView,
  quoteId: string,
  at: string,
): PassengerDispatchDisclosureSnapshot {
  return {
    snapshotId: `DEMO-snapshot-${ride.order.orderId}`,
    runtimeProfileCode: "multi_taxi_direct",
    orderId: ride.order.orderId,
    bookingId: null,
    dispatchJobId: "DEMO-job",
    assignmentId: "DEMO-assignment",
    assignmentVersion: 1,
    vehicle: {
      vehicleId: "DEMO-vehicle",
      make: "示意車輛",
      model: "DEMO房車",
      plateNo: "DEMO-001",
      modelYear: 2026,
      doorCount: 4,
      color: "示意白色",
      profileVersion: 1,
    },
    driver: {
      driverId: "DEMO-driver",
      displayName: "示意司機 DEMO",
      registrationMaskedDisplay: "示意資格 DEMO***001",
      registrationStatus: "verified_active",
      registrationEffectiveUntil: "2099-01-01T00:00:00Z",
      credentialVersion: 1,
    },
    rating: {
      displayState: "new_driver",
      averageRating: null,
      ratingCount: 0,
      aggregateVersion: 1,
    },
    eta: { minutes: 5, calculatedAt: at, locationFreshness: "fresh" },
    routeFare: {
      routeSnapshotId: "DEMO-route",
      quoteSnapshotId: quoteId,
      orderId: ride.order.orderId,
      pickup: {
        ...ride.order.pickup,
        lat: ride.order.pickup.lat!,
        lng: ride.order.pickup.lng!,
        coordinateSource: "provider_candidate",
        geocodeConfidence: "approximate",
        resolvedAt: at,
      },
      dropoff: {
        ...ride.order.dropoff,
        lat: ride.order.dropoff.lat!,
        lng: ride.order.dropoff.lng!,
        coordinateSource: "provider_candidate",
        geocodeConfidence: "approximate",
        resolvedAt: at,
      },
      estimatedDistanceMeters: 5500,
      estimatedDurationSeconds: 900,
      encodedPolyline: null,
      chargingMode: "meter_estimate",
      estimatedFareMinor: NATIVE_DEMO_QUOTE.amountMinor,
      payableFareMinor: null,
      currency: "TWD",
      farePolicyId: "DEMO-policy",
      farePolicyVersion: NATIVE_DEMO_FARE.version,
      fareChangeRuleId: "DEMO-rule",
      fareChangeRuleVersion: "DEMO-1",
      fareChangeRuleDisplayText: "固定示意報價，非實際計費或保證價格",
      passengerConfirmedAt: at,
      generatedAt: at,
    },
    createdAt: at,
    supersededAt: null,
  };
}
export function capturedDemoReceipt(
  ride: PassengerRideAuthorityView,
  at: string,
): MultiTaxiElectronicReceipt {
  return {
    receiptId: `DEMO-receipt-${ride.order.orderId}`,
    receiptNo: `DEMO-${ride.order.orderNo}`,
    orderId: ride.order.orderId,
    amountMinor: NATIVE_DEMO_QUOTE.amountMinor,
    currency: "TWD",
    issuedAt: at,
    record: {
      demo: true,
      notice: NATIVE_DEMO_NOTICE,
      tripId: `DEMO-trip-${ride.order.orderId}`,
      plateNo: "DEMO-001",
      pickupAt: at,
      dropoffAt: at,
      travelDurationSeconds: 900,
      routeSummary: `${ride.order.pickup.address} → ${ride.order.dropoff.address}`,
      distanceMeters: 5500,
      tollMinor: 0,
      consumerServicePhone: "02-2944-0985",
      authorityComplaintPhone: "示意申訴電話 DEMO（未撥號）",
      e04Snapshot: {
        fleetOperatorName: "示意業者 DEMO（虛構）",
        driverSurname: "示意",
        driverRegistrationMasked: "DEMO***001",
        paymentMethodDisplay: "示意卡片 DEMO（未實際扣款）",
        fareBreakdown: {
          startMinor: 8500,
          distanceMinor: 17500,
          delayMinor: 0,
          nightMinor: 0,
        },
      },
    },
  };
}
