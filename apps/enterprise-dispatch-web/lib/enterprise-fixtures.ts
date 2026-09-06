import {
  adaptBookingRecordToEnterpriseBooking,
  type EnterpriseDispatchBookingFixture,
} from "./dispatch-fixture-adapter";
import type { BookingRecord } from "@drts/contracts";
import { type Locale, type TranslationKey, t } from "@/lib/translations";

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

export function getAuthoritativeEnterpriseBooking(
  bookingId: string,
  records: BookingRecord[],
): EnterpriseBooking | undefined {
  const record = records.find((item) => item.bookingId === bookingId);
  if (!record) {
    return undefined;
  }
  return adaptBookingRecordToEnterpriseBooking(record);
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
