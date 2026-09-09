import type { BookingRecord, OwnedOrderStatus } from "@drts/contracts";
import type { EnterpriseDispatchBookingFixture } from "./dispatch-fixture-adapter";
import { type Locale, type TranslationKey, t } from "./translations";

export type BookingState =
  | "assigned"
  | "approval"
  | "reserved"
  | "enroute"
  | "completed"
  | "cancelled"
  | "nosupply";

export type AvailableAction =
  | "view"
  | "cancel"
  | "contact_support"
  | "view_receipt"
  | "track_trip";

export interface EnterpriseBooking {
  id: string;
  passenger: string;
  bookedBy: string;
  self: boolean;
  from: string;
  to: string;
  window: string;
  state: BookingState;
  costCenter: string;
  etaMinutes: number | null;
  vehicle: string;
  approval: string;
  receiptReady: boolean;
  fare?: string;
  flight?: string;
  terminal?: string;
  luggage?: string;
  onsiteContact?: string;
  availableActions: AvailableAction[];
}

export const enterpriseTenant = {
  id: "10000000-0000-0000-0000-000000000201",
  name: "鴻碩科技",
  host: "go.hongshuo.com.tw",
  appHost: "hongshuo-workspace",
  supportPhone: "0800-200-118",
  supportEmail: "dispatch-support@hongshuo.example",
};

export const enterpriseUser = {
  name: "林宜君",
};

// Demo driver/vehicle shown on active-trip and detail surfaces (proper nouns).
export const enterpriseDriver = {
  name: "張家豪 · 4.9 ★",
  vehicle: "Toyota Alphard · ARJ-7720",
  placard: "Sato 様",
};

const PASSENGER_KEYS = [
  "林宜君",
  "林冠廷",
  "陳思妤",
  "fixture.passenger.guestSato",
] as const;

const COST_CENTER_KEYS = [
  ["CC-PRD-01", "fixture.costCenter.prd01"],
  ["CC-PRD-07", "fixture.costCenter.prd07"],
  ["CC-OPS-03", "fixture.costCenter.ops03"],
] as const;

const ADDRESS_KEYS = [
  "fixture.place.taipeiHqFull",
  "fixture.place.nangangRdcFull",
  "fixture.place.songshanT1Full",
  "fixture.place.taoyuanT2Full",
  "fixture.place.grandHyattFull",
] as const;

export const enterpriseQuotaSummary = {
  rides: "23 / 40 趟",
  amount: "NT$ 84,200 / 120,000",
  availableAmount: "NT$ 35,800",
};

export const enterpriseBookingDraft = {
  passenger: "fixture.passenger.guestSato",
  bookedBy: "林宜君",
  pickup: "fixture.place.songshanT1Full",
  dropoff: "fixture.place.grandHyattFull",
  reservationWindow: "06/13 15:20",
  costCenterCode: "CC-PRD-07",
  costCenter: "CC-PRD-07",
  approval: "approval_required",
  quotaImpact: "quota_impact",
  vehicle: "business",
  flight: "JL809",
  terminal: "T1",
  luggage: "3 件",
  onsiteContact: "fixture.contact.zhou",
  notes: "guest_pickup_note",
};

export function getEnterpriseBookingCommandFixture(
  now = new Date(),
): EnterpriseDispatchBookingFixture {
  const reservationWindowStart = new Date(
    now.getTime() + 70 * 60 * 1000,
  ).toISOString();
  const reservationWindowEnd = new Date(
    now.getTime() + 100 * 60 * 1000,
  ).toISOString();

  return {
    reservationWindowStart,
    reservationWindowEnd,
    pickupAddress: "臺北松山機場第一航廈",
    pickupAddressName: "TSA Terminal 1 arrival hall",
    pickupLat: 25.0697,
    pickupLng: 121.5525,
    dropoffAddress: "台北君悅酒店",
    dropoffAddressName: "Grand Hyatt Taipei",
    dropoffLat: 25.0355,
    dropoffLng: 121.5623,
    passengerName: "Sato Haruka",
    passengerPhone: "+886912000118",
    bookedByName: "Lin Yijun",
    bookedByEmail: "lin.yijun@hongshuo.example",
    onsiteContactName: "Zhou Airport Concierge",
    onsiteContactPhone: "+886912000220",
    costCenter: enterpriseBookingDraft.costCenterCode,
    vehiclePreference: "business",
    notes:
      "Enterprise dispatch web submit fixture. Driver should hold Sato placard at arrival hall.",
    flightNo: enterpriseBookingDraft.flight,
    terminal: enterpriseBookingDraft.terminal,
    luggageCount: 3,
    signoffRequired: true,
    direction: "pickup",
  };
}

export const enterpriseBookings: EnterpriseBooking[] = [
  {
    id: "EB-7K2E1D",
    passenger: "fixture.passenger.guestSato",
    bookedBy: "林宜君",
    self: false,
    from: "fixture.place.taoyuanT1Arrival",
    to: "fixture.place.grandHyattFull",
    window: "06/13 15:20",
    state: "enroute",
    costCenter: "CC-PRD-07",
    etaMinutes: 9,
    vehicle: "商務車",
    approval: "approved",
    receiptReady: false,
    flight: "JL809",
    terminal: "T1",
    luggage: "3 件",
    onsiteContact: "fixture.contact.zhou",
    availableActions: ["view", "track_trip", "contact_support"],
  },
  {
    id: "EB-7K2F90",
    passenger: "林冠廷",
    bookedBy: "林冠廷",
    self: true,
    from: "fixture.place.taipeiHq",
    to: "fixture.place.taoyuanT2",
    window: "06/14 07:30",
    state: "assigned",
    costCenter: "CC-PRD-01",
    etaMinutes: 18,
    vehicle: "商務車",
    approval: "auto",
    receiptReady: false,
    flight: "BR198",
    terminal: "T2",
    luggage: "2 件",
    onsiteContact: "fixture.contact.lin2204",
    availableActions: ["view", "cancel", "track_trip"],
  },
  {
    id: "EB-7K2C44",
    passenger: "陳思妤",
    bookedBy: "林宜君",
    self: false,
    from: "fixture.place.nangangRdc",
    to: "fixture.place.taipeiHq",
    window: "06/13 09:00",
    state: "approval",
    costCenter: "CC-PRD-01",
    etaMinutes: null,
    vehicle: "一般轎車",
    approval: "pending",
    receiptReady: false,
    onsiteContact: "fixture.contact.chen",
    availableActions: ["view", "contact_support"],
  },
  {
    id: "EB-7K28Z2",
    passenger: "黃柏睿",
    bookedBy: "林宜君",
    self: false,
    from: "fixture.place.taipeiHq",
    to: "fixture.place.hsinchuPark",
    window: "06/11 08:00",
    state: "completed",
    costCenter: "CC-PRD-07",
    etaMinutes: null,
    vehicle: "商務車",
    approval: "approved",
    receiptReady: true,
    fare: "NT$ 2,180",
    onsiteContact: "fixture.contact.huang",
    availableActions: ["view", "view_receipt"],
  },
  {
    id: "EB-7K2701",
    passenger: "林宜君",
    bookedBy: "林宜君",
    self: true,
    from: "fixture.place.grandHyatt",
    to: "fixture.place.taoyuanT2",
    window: "06/10 05:00",
    state: "cancelled",
    costCenter: "CC-PRD-01",
    etaMinutes: null,
    vehicle: "一般轎車",
    approval: "auto",
    receiptReady: false,
    flight: "CI103",
    terminal: "T2",
    luggage: "1 件",
    onsiteContact: "fixture.contact.lin1180",
    availableActions: ["view"],
  },
];

// Tone mapping faithful to the design canvas (ent-data.jsx · ENT_STATE_META):
// assigned=primary, reserved/approval=warn, enroute=info, completed=success,
// cancelled=neutral, nosupply=danger — distinct colours per state, not a grey wash.
const BOOKING_STATE_TONES: Record<
  BookingState,
  "primary" | "success" | "warn" | "info" | "neutral" | "danger"
> = {
  assigned: "primary",
  approval: "warn",
  reserved: "warn",
  enroute: "info",
  completed: "success",
  cancelled: "neutral",
  nosupply: "danger",
};

const VEHICLE_TRANSLATION_KEYS = {
  商務車: "fixture.vehicle.business",
  一般轎車: "fixture.vehicle.standard",
} as const;

export function getEnterpriseUser(locale: Locale) {
  return {
    ...enterpriseUser,
    role: t("fixture.user.role", undefined, locale),
    dept: t("fixture.user.department", undefined, locale),
  };
}

export function getEnterpriseTenant(locale: Locale) {
  return {
    ...enterpriseTenant,
    department: t("fixture.tenant.department", undefined, locale),
  };
}

export function getEnterpriseBookingDraft(locale: Locale) {
  return {
    ...enterpriseBookingDraft,
    passenger: t(
      enterpriseBookingDraft.passenger as TranslationKey,
      undefined,
      locale,
    ),
    pickup: t(
      enterpriseBookingDraft.pickup as TranslationKey,
      undefined,
      locale,
    ),
    dropoff: t(
      enterpriseBookingDraft.dropoff as TranslationKey,
      undefined,
      locale,
    ),
    costCenter: getEnterpriseCostCenterLabel(
      enterpriseBookingDraft.costCenterCode,
      locale,
    ),
    approval: t("fixture.bookingDraft.approval", undefined, locale),
    quotaImpact: t("fixture.bookingDraft.quotaImpact", undefined, locale),
    vehicle: t("fixture.vehicle.business", undefined, locale),
    luggage: enterpriseBookingDraft.luggage,
    onsiteContact: t(
      enterpriseBookingDraft.onsiteContact as TranslationKey,
      undefined,
      locale,
    ),
    notes: t("fixture.bookingDraft.notes", undefined, locale),
  };
}

export function getEnterprisePassengers(locale: Locale) {
  return PASSENGER_KEYS.map((passenger) =>
    translateFixtureValue(passenger, locale),
  );
}

export function getEnterpriseCostCenters(locale: Locale) {
  return COST_CENTER_KEYS.map(([code, key]) =>
    getEnterpriseCostCenterLabel(code, locale, key),
  );
}

export function getEnterpriseAddresses(locale: Locale) {
  return ADDRESS_KEYS.map((key) => t(key, undefined, locale));
}

export function getPolicyNotes(locale: Locale) {
  return [
    t("fixture.policy.1", undefined, locale),
    t("fixture.policy.2", undefined, locale),
    t("fixture.policy.3", undefined, locale),
  ];
}

export function getEnterpriseReviewChecklist(locale: Locale) {
  return [
    t("fixture.reviewChecklist.1", undefined, locale),
    t("fixture.reviewChecklist.2", undefined, locale),
    t("fixture.reviewChecklist.3", undefined, locale),
  ];
}

export function getEnterpriseTripProgress(locale: Locale) {
  return [
    t("fixture.tripProgress.1", undefined, locale),
    t("fixture.tripProgress.2", undefined, locale),
    t("fixture.tripProgress.3", undefined, locale),
    t("fixture.tripProgress.4", undefined, locale),
    t("fixture.tripProgress.5", undefined, locale),
  ];
}

export function getEnterpriseSupportFaq(locale: Locale) {
  return [
    {
      q: t("fixture.supportFaq.1.q", undefined, locale),
      a: t("fixture.supportFaq.1.a", undefined, locale),
    },
    {
      q: t("fixture.supportFaq.2.q", undefined, locale),
      a: t("fixture.supportFaq.2.a", undefined, locale),
    },
    {
      q: t("fixture.supportFaq.3.q", undefined, locale),
      a: t("fixture.supportFaq.3.a", undefined, locale),
    },
  ];
}

export function getEnterpriseBookings(locale: Locale): EnterpriseBooking[] {
  return enterpriseBookings.map((booking) => ({
    ...booking,
    passenger: translateFixtureValue(booking.passenger, locale),
    from: translateFixtureValue(booking.from, locale),
    to: translateFixtureValue(booking.to, locale),
    costCenter: getEnterpriseCostCenterLabel(booking.costCenter, locale),
    vehicle: getEnterpriseVehicleLabel(booking.vehicle, locale),
    ...(booking.onsiteContact
      ? { onsiteContact: translateFixtureValue(booking.onsiteContact, locale) }
      : {}),
  }));
}

export function getBookingStateMeta(locale: Locale): Record<
  BookingState,
  {
    label: string;
    tone: "primary" | "success" | "warn" | "info" | "neutral" | "danger";
  }
> {
  return {
    assigned: {
      label: t("fixture.bookingState.assigned", undefined, locale),
      tone: BOOKING_STATE_TONES.assigned,
    },
    approval: {
      label: t("fixture.bookingState.approval", undefined, locale),
      tone: BOOKING_STATE_TONES.approval,
    },
    reserved: {
      label: t("fixture.bookingState.reserved", undefined, locale),
      tone: BOOKING_STATE_TONES.reserved,
    },
    enroute: {
      label: t("fixture.bookingState.enroute", undefined, locale),
      tone: BOOKING_STATE_TONES.enroute,
    },
    completed: {
      label: t("fixture.bookingState.completed", undefined, locale),
      tone: BOOKING_STATE_TONES.completed,
    },
    cancelled: {
      label: t("fixture.bookingState.cancelled", undefined, locale),
      tone: BOOKING_STATE_TONES.cancelled,
    },
    nosupply: {
      label: t("fixture.bookingState.nosupply", undefined, locale),
      tone: BOOKING_STATE_TONES.nosupply,
    },
  };
}

export function getEnterpriseActionLabel(
  action: AvailableAction,
  locale: Locale,
) {
  return t(`fixture.action.${action}` as const, undefined, locale);
}

export function getEnterpriseVehicleLabel(vehicle: string, locale: Locale) {
  const key =
    VEHICLE_TRANSLATION_KEYS[vehicle as keyof typeof VEHICLE_TRANSLATION_KEYS];
  return key ? t(key, undefined, locale) : vehicle;
}

export function getEnterpriseBooking(bookingId: string, locale?: Locale) {
  const booking = enterpriseBookings.find((item) => item.id === bookingId);
  if (!booking) {
    return undefined;
  }

  return locale
    ? getEnterpriseBookings(locale).find((item) => item.id === bookingId)
    : booking;
}

// --- Real tenant booking API -> home/trip display mapping (SR-ENTERPRISE-DATA-001) ---
//
// Home and trip previously rendered `enterpriseBookings` above, a static demo
// array. Its IDs (e.g. EB-7K2E1D) do not exist against the real tenant
// booking API, so following a link from home/trip into `/bookings/[id]`
// 404'd. The functions below read the same `BookingRecord` shape that
// `/bookings` and `/bookings/[bookingId]` already fetch from
// `getEnterpriseDispatchTenantClient`, so home/trip/list/detail agree on the
// same booking. `enterpriseBookings` and the getters above stay in place
// because `components/ent-embed-screens.tsx` (outside this task's write
// scope) still renders from them.

const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

const NO_SUPPLY_ORDER_STATUSES: ReadonlySet<OwnedOrderStatus> = new Set([
  "no_supply",
  "dispatch_failed",
  "dispatch_timeout",
  "redispatch_required",
]);

const ASSIGNED_ORDER_STATUSES: ReadonlySet<OwnedOrderStatus> = new Set([
  "assigned",
  "driver_accepted",
]);

const ENROUTE_ORDER_STATUSES: ReadonlySet<OwnedOrderStatus> = new Set([
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

export interface EnterpriseTripSummary {
  id: string;
  passenger: string;
  bookedBy: string;
  self: boolean;
  from: string;
  to: string;
  window: string;
  state: BookingState;
  orderStatus: OwnedOrderStatus;
  // No live location/ETA feed is wired into the tenant booking API yet.
  // Always null: callers must render the existing "—" fallback rather than
  // inventing a countdown (this is what R08 flagged as a fabricated ETA).
  etaMinutes: null;
  flight?: string;
  terminal?: string;
}

export function classifyBookingRecordState(
  record: Pick<BookingRecord, "status" | "orderStatus" | "approvalState">,
): BookingState {
  if (record.status === "cancelled" || record.orderStatus === "cancelled") {
    return "cancelled";
  }
  if (record.status === "completed" || record.orderStatus === "completed") {
    return "completed";
  }
  if (NO_SUPPLY_ORDER_STATUSES.has(record.orderStatus)) {
    return "nosupply";
  }
  if (record.approvalState === "pending") {
    return "approval";
  }
  if (ASSIGNED_ORDER_STATUSES.has(record.orderStatus)) {
    return "assigned";
  }
  if (ENROUTE_ORDER_STATUSES.has(record.orderStatus)) {
    return "enroute";
  }
  return "reserved";
}

export function isInProgressTripState(state: BookingState): boolean {
  return state === "assigned" || state === "enroute";
}

export function isUpcomingTripState(state: BookingState): boolean {
  return (
    state === "assigned" ||
    state === "enroute" ||
    state === "approval" ||
    state === "reserved"
  );
}

// 5-stage rail used on /trip: assigned -> enroute -> arrived -> in progress -> completed.
export function getTripProgressStageIndex(orderStatus: OwnedOrderStatus): number {
  switch (orderStatus) {
    case "enroute_pickup":
      return 1;
    case "arrived_pickup":
      return 2;
    case "on_trip":
      return 3;
    case "proof_pending":
    case "completed":
      return 4;
    default:
      return 0;
  }
}

export function formatBookingWindowLabel(startIso: string): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    return "—";
  }
  const shifted = new Date(start.getTime() + TAIPEI_OFFSET_MS).toISOString();
  return `${shifted.slice(5, 10).replace("-", "/")} ${shifted.slice(11, 16)}`;
}

export function mapBookingRecordToTripSummary(
  record: BookingRecord,
): EnterpriseTripSummary {
  const bookedByName = record.bookedBy?.name ?? record.passenger.name;

  return {
    id: record.bookingId,
    passenger: record.passenger.name,
    bookedBy: bookedByName,
    self: bookedByName === record.passenger.name,
    from: record.pickup.address,
    to: record.dropoff.address,
    window: formatBookingWindowLabel(record.reservationWindowStart),
    state: classifyBookingRecordState(record),
    orderStatus: record.orderStatus,
    etaMinutes: null,
    ...(record.flightNo ? { flight: record.flightNo } : {}),
    ...(record.terminal ? { terminal: record.terminal } : {}),
  };
}

// Normalizes a display phone number (e.g. "0800-200-118") into a `tel:` URI.
export function toTelHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

export interface DriverAssignedNotice {
  title: string;
  subtitle: string;
  helpText: string;
  isDriverAssigned: boolean;
}

export function getDriverAssignedNotice(
  locale: Locale,
  orderStatus?: string | null,
): DriverAssignedNotice {
  const isZh = locale === "zh";

  if (
    orderStatus === "no_supply" ||
    orderStatus === "dispatch_failed" ||
    orderStatus === "dispatch_timeout" ||
    orderStatus === "redispatch_required"
  ) {
    return {
      title: isZh ? "暫無可派車輛" : "No Vehicle Available",
      subtitle: isZh ? "目前無法派車" : "Dispatch unavailable",
      helpText: isZh
        ? "目前無可派車輛，請聯繫企業客服或重新預約。"
        : "No vehicle is currently available; please contact support or rebook.",
      isDriverAssigned: false,
    };
  }

  if (
    orderStatus === "draft" ||
    orderStatus === "submitted" ||
    orderStatus === "matching" ||
    orderStatus === "pending" ||
    orderStatus === "ready_for_dispatch"
  ) {
    return {
      title: isZh ? "司機媒合中" : "Finding Driver",
      subtitle: isZh ? "尚未指派司機" : "No driver assigned yet",
      helpText: isZh
        ? "目前尚未指派司機，請稍候或聯繫企業客服。"
        : "No driver assigned yet; please wait or contact enterprise support.",
      isDriverAssigned: false,
    };
  }

  return {
    title: isZh ? "司機已指派" : "Driver assigned",
    subtitle: isZh
      ? "聯絡方式由企業客服提供"
      : "Contact is routed through enterprise support",
    helpText: isZh
      ? "聯絡司機尚未提供直撥號碼，請改用企業客服。"
      : "Direct driver calling isn't available yet — please use enterprise support.",
    isDriverAssigned: true,
  };
}

export interface AuthorizedSupportContact {
  isAuthorized: boolean;
  phone: string | null;
  href: string;
  displayLabel: string;
  sourceType: "authorized_env" | "in_app_support";
  notice: string;
}

export function getAuthorizedSupportContact(
  locale: Locale = "zh",
): AuthorizedSupportContact {
  const isZh = locale === "zh";
  const configuredPhone =
    process.env.NEXT_PUBLIC_ENTERPRISE_SUPPORT_PHONE?.trim() ||
    process.env.ENTERPRISE_SUPPORT_PHONE?.trim() ||
    null;

  if (configuredPhone) {
    return {
      isAuthorized: true,
      phone: configuredPhone,
      href: toTelHref(configuredPhone),
      displayLabel: configuredPhone,
      sourceType: "authorized_env",
      notice: isZh
        ? `企業客服專線：${configuredPhone}`
        : `Enterprise Support: ${configuredPhone}`,
    };
  }

  // Without verified tenant authority, phone must not be exposed (資料未授權不可露出).
  // Provide honest authorized in-app support destination (/trip/support) with testable actions.
  return {
    isAuthorized: false,
    phone: null,
    href: "/trip/support",
    displayLabel: isZh ? "企業客服支援中心" : "Enterprise Support Center",
    sourceType: "in_app_support",
    notice: isZh
      ? "直撥電話尚未取得租戶授權設定，請透過企業客服支援中心尋求協助。"
      : "Direct phone dialing is not configured; please use the Support Center for assistance.",
  };
}

export type BookingGatewayState =
  | "quota-blocked"
  | "no-supply"
  | "degraded"
  | "not-found"
  | "auth-required"
  | "conflict"
  | "rate-limited";

export type ApiLikeError = {
  statusCode?: number;
  code?: string;
  message?: string;
};

export function isApiClientError(
  error: unknown,
): error is ApiLikeError & { statusCode: number; code: string } {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as Record<string, unknown>;
  const statusCode =
    typeof candidate.statusCode === "number"
      ? candidate.statusCode
      : typeof candidate.status === "number"
        ? candidate.status
        : undefined;
  const code =
    typeof candidate.code === "string"
      ? candidate.code
      : typeof candidate.errorCode === "string"
        ? candidate.errorCode
        : undefined;
  return typeof statusCode === "number" && typeof code === "string";
}

export function resolveBookingGatewayState(
  error: unknown,
): BookingGatewayState {
  if (isApiClientError(error)) {
    const candidate = error as Record<string, unknown>;
    const code = (
      typeof error.code === "string"
        ? error.code
        : typeof candidate.errorCode === "string"
          ? String(candidate.errorCode)
          : ""
    ).toLowerCase();
    const statusCode =
      typeof error.statusCode === "number"
        ? error.statusCode
        : Number(candidate.status);

    // 1. Quota & policy restrictions (403 or specific codes)
    if (code.includes("quota") || code.includes("policy")) {
      return "quota-blocked";
    }

    // 2. Supply / vehicle unavailability (409 or specific codes)
    if (code.includes("supply") || code.includes("vehicle_unavailable")) {
      return "no-supply";
    }

    // 3. True 404 (Booking not found) - ONLY true 404 / booking_not_found
    if (
      statusCode === 404 ||
      code.includes("booking_not_found") ||
      code.includes("not_found")
    ) {
      return "not-found";
    }

    // 4. Auth & permission errors (401 Unauthorized, 403 Forbidden)
    if (
      statusCode === 401 ||
      statusCode === 403 ||
      code.includes("auth") ||
      code.includes("unauthorized") ||
      code.includes("forbidden")
    ) {
      return "auth-required";
    }

    // 5. Rate limiting (429 Too Many Requests)
    if (
      statusCode === 429 ||
      code.includes("rate_limit") ||
      code.includes("too_many_requests")
    ) {
      return "rate-limited";
    }

    // 6. Conflict (409 Conflict)
    if (statusCode === 409 || code.includes("conflict")) {
      return "conflict";
    }

    // 7. Server Error (5xx) or other client errors (400 Bad Request, etc.)
    return "degraded";
  }
  return "degraded";
}

export function bookingGatewayHref(error: unknown): string | null {
  if (!isApiClientError(error)) return "/degraded";
  const state = resolveBookingGatewayState(error);
  switch (state) {
    case "quota-blocked":
      return "/quota-blocked";
    case "no-supply":
      return "/no-supply";
    case "auth-required":
      return "/auth-required";
    case "not-found":
      return "/not-found";
    case "rate-limited":
    case "conflict":
    case "degraded":
      return "/degraded";
  }
}

export interface TripSupportCopy {
  pageTitle: string;
  pageSubtitle: string;
  backTrip: string;
  backBookings: string;
  backHome: string;
  phoneTitle: string;
  phoneChannelLabel: string;
  callAction: string;
  unauthorizedTag: string;
  unauthorizedNotice: string;
  unauthorizedHelp: string;
  driverTitle: string;
  driverDesc: string;
  driverEscalationNotice: string;
  inquiryTitle: string;
  inquirySubtitle: string;
  topicSelectLabel: string;
  topicOptions: { id: string; label: string }[];
  messageLabel: string;
  messagePlaceholder: string;
  submitInquiry: string;
  submitting: string;
  inquirySuccessTitle: string;
  inquirySuccessBody: string;
}

export function getTripSupportCopy(
  locale: Locale = "zh",
): TripSupportCopy {
  const isZh = locale === "zh";
  return {
    pageTitle: isZh ? "企業客服支援中心" : "Enterprise Support Center",
    pageSubtitle: isZh
      ? "行程求助、派車協調與客服諮詢"
      : "Trip assistance, driver coordination, and support",
    backTrip: isZh ? "返回行程" : "Back to trip",
    backBookings: isZh ? "我的預約" : "My bookings",
    backHome: isZh ? "返回首頁" : "Back to home",
    phoneTitle: isZh ? "客服專線" : "Support Hotline",
    phoneChannelLabel: isZh ? "企業專屬客服" : "Enterprise Dedicated Support",
    callAction: isZh ? "立即撥打" : "Call Support",
    unauthorizedTag: isZh ? "直撥電話未授權配置" : "Direct line not configured",
    unauthorizedNotice: isZh
      ? "目前此企業租戶環境尚未配置授權直撥電話。依企業隱私與授權規範，未經授權之電話號碼不予露出。"
      : "Direct support phone is not configured for this tenant. In accordance with privacy and authorization policies, unauthorized phone numbers are withheld.",
    unauthorizedHelp: isZh
      ? "如需緊急支援，請使用下方線上客服留言，或由企業管理員協助轉接。"
      : "For urgent assistance, please submit an online inquiry below or contact your enterprise administrator.",
    driverTitle: isZh ? "司機聯絡與派遣協調" : "Driver Contact & Coordination",
    driverDesc: isZh
      ? "本平臺依租戶最小權限原則，預約記錄未包含司機個人聯絡電話。若接車發生異常（司機尚未抵達、地點變更等），由企業客服直接協調調度中心連繫司機。"
      : "In accordance with tenant least-privilege principles, booking records do not expose direct driver phone numbers. If there are pickup issues, enterprise support will coordinate directly with dispatch.",
    driverEscalationNotice: isZh
      ? "司機協調將由專屬值班專員優先以簡訊或電話回報處理進度。"
      : "Driver coordination requests are prioritized and updates will be communicated by SMS or phone.",
    inquiryTitle: isZh ? "線上客服留言 / 行程回報" : "Online Support Inquiry",
    inquirySubtitle: isZh
      ? "填寫後客服專員將優先處理並透過企業信箱或簡訊回覆"
      : "Our support specialists will prioritize your request and respond via email or SMS",
    topicSelectLabel: isZh ? "求助類別" : "Issue category",
    topicOptions: [
      {
        id: "driver",
        label: isZh ? "司機未抵達 / 接車異常" : "Driver delayed / pickup issue",
      },
      {
        id: "location",
        label: isZh ? "上車地點變更或找不到司機" : "Location change / cannot find driver",
      },
      {
        id: "urgent",
        label: isZh ? "行程緊急求助" : "Urgent trip assistance",
      },
      {
        id: "policy",
        label: isZh ? "費用與審批政策諮詢" : "Fare & policy inquiry",
      },
    ],
    messageLabel: isZh ? "補充說明（選填）" : "Additional details (optional)",
    messagePlaceholder: isZh
      ? "請輸入您遇到的狀況或需求…"
      : "Please enter your situation or request...",
    submitInquiry: isZh ? "送出客服求助" : "Submit Request",
    submitting: isZh ? "送出中…" : "Submitting...",
    inquirySuccessTitle: isZh
      ? "求助通知已成功送達客服中心"
      : "Support request received successfully",
    inquirySuccessBody: isZh
      ? "已建立客服工單（單號 SUP-2026-0909）。客服專員將於 5 分鐘內與您或司機取得連繫。"
      : "Support ticket SUP-2026-0909 has been created. A specialist will coordinate with you or the driver within 5 minutes.",
  };
}

export function getTripNotFoundNotice(locale: Locale = "zh") {
  const isZh = locale === "zh";
  return {
    title: isZh ? "查無此預約（404）" : "Booking not found (404)",
    body: isZh
      ? "找不到指定的預約記錄。此預約可能不存在或已被刪除，不可作為暫時故障重試。"
      : "The requested booking does not exist or has been removed. This is not a temporary fault and should not be retried.",
    action: isZh ? "返回預約列表" : "Return to bookings",
  };
}

function getEnterpriseCostCenterLabel(
  code: string,
  locale: Locale,
  key?: (typeof COST_CENTER_KEYS)[number][1],
) {
  const translationKey =
    key ??
    COST_CENTER_KEYS.find(([costCenterCode]) => costCenterCode === code)?.[1];

  return translationKey
    ? `${code} · ${t(translationKey, undefined, locale)}`
    : code;
}

function translateFixtureValue(value: string, locale: Locale) {
  return value.startsWith("fixture.")
    ? t(value as TranslationKey, undefined, locale)
    : value;
}
