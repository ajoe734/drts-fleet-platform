import type {
  BookingRecord,
  CreateTenantBookingCommand,
  UpdateTenantBookingCommand,
} from "@drts/contracts";
import {
  enterpriseBookingDraft,
  getEnterpriseBookingDraft,
} from "./enterprise-fixtures";
import { t as translate, type Locale } from "./translations";

export type EnterprisePassengerMode = "self" | "other";
export type EnterpriseAirportDirection = "pickup" | "dropoff";
export type EnterpriseVehiclePreference = "sedan" | "business" | "van";

export type EnterpriseBookingDraftForm = {
  passengerMode: EnterprisePassengerMode;
  passenger: string;
  bookedBy: string;
  pickup: string;
  dropoff: string;
  reservationDate: string;
  reservationTime: string;
  onsiteContactPhone: string;
  costCenterCode: string;
  costCenterLabel: string;
  vehicle: EnterpriseVehiclePreference;
  notes: string;
  airportDirection: EnterpriseAirportDirection;
  terminal: string;
  flight: string;
  luggageCount: string;
  placard: string;
};

type SearchParamRecord = Record<string, string | string[] | undefined>;

export type EnterpriseBookingPreview = {
  estimatedFare: number;
  estimatedFareLabel: string;
  remainingBudgetLabel: string;
  quotaImpactLabel: string;
  approvalRequired: boolean;
  approvalLabel: string;
  bannerTone: "success" | "warn";
  bannerBody: string;
  reservationWindowLabel: string;
};

const QUERY_KEYS = {
  passengerMode: "pm",
  passenger: "passenger",
  bookedBy: "bookedBy",
  pickup: "pickup",
  dropoff: "dropoff",
  reservationDate: "date",
  reservationTime: "time",
  onsiteContact: "contact",
  costCenterCode: "cc",
  costCenterLabel: "ccLabel",
  vehicle: "vehicle",
  notes: "notes",
  airportDirection: "dir",
  terminal: "terminal",
  flight: "flight",
  luggageCount: "luggage",
  placard: "placard",
  entry: "entry",
} as const;

const DISPLAY_BUDGET_TOTAL = 60_000;
const DISPLAY_BUDGET_AVAILABLE = 31_000;
const APPROVAL_THRESHOLD = 1_500;
export const DEFAULT_TIMEZONE_OFFSET = "+08:00";
export const DEFAULT_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;
export const MIN_LEAD_TIME_MINUTES = 15;

export function derivePlacard(passenger: string): string {
  const trimmed = passenger.replace(/^(訪客|Guest)\s*[·•-]?\s*/i, "").trim();
  if (!trimmed) {
    return "";
  }
  if (/^sato/i.test(trimmed) && !/様/.test(trimmed)) {
    return `${trimmed.split(/\s+/)[0]} 様`;
  }
  return trimmed;
}

export function getEarliestReservationTime(
  now = new Date(),
  leadTimeMinutes = MIN_LEAD_TIME_MINUTES,
) {
  const minMs = now.getTime() + leadTimeMinutes * 60 * 1000;
  const roundedMs = Math.ceil(minMs / (5 * 60 * 1000)) * (5 * 60 * 1000);
  const localWallClock = new Date(
    roundedMs + DEFAULT_TIMEZONE_OFFSET_MS,
  ).toISOString();
  const date = localWallClock.slice(0, 10);
  const time = localWallClock.slice(11, 16);
  return {
    date,
    time,
    isoString: new Date(roundedMs).toISOString(),
    label: `${date} ${time} (UTC+8)`,
  };
}

export type ReservationValidationResult = {
  valid: boolean;
  code?: "INVALID_FORMAT" | "PAST_DATE" | "TOO_SOON_TO_BOOK";
  reason?: string;
  earliestAllowedDate: string;
  earliestAllowedTime: string;
  earliestAllowedLabel: string;
};

export function validateReservationWindow(
  date: string,
  time: string,
  now = new Date(),
  leadTimeMinutes = MIN_LEAD_TIME_MINUTES,
): ReservationValidationResult {
  const earliest = getEarliestReservationTime(now, leadTimeMinutes);
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const timePattern = /^\d{2}:\d{2}$/;

  if (!datePattern.test(date) || !timePattern.test(time)) {
    return {
      valid: false,
      code: "INVALID_FORMAT",
      reason: "請輸入有效的用車日期 (YYYY-MM-DD) 與時間 (HH:mm)",
      earliestAllowedDate: earliest.date,
      earliestAllowedTime: earliest.time,
      earliestAllowedLabel: earliest.label,
    };
  }

  const dateParts = date.split("-").map(Number);
  const timeParts = time.split(":").map(Number);
  const y = dateParts[0];
  const m = dateParts[1];
  const d = dateParts[2];
  const hh = timeParts[0];
  const mm = timeParts[1];

  if (
    y === undefined ||
    m === undefined ||
    d === undefined ||
    hh === undefined ||
    mm === undefined ||
    Number.isNaN(y) ||
    Number.isNaN(m) ||
    Number.isNaN(d) ||
    Number.isNaN(hh) ||
    Number.isNaN(mm) ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31 ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    return {
      valid: false,
      code: "INVALID_FORMAT",
      reason: "日期或時間數值超出合理範圍",
      earliestAllowedDate: earliest.date,
      earliestAllowedTime: earliest.time,
      earliestAllowedLabel: earliest.label,
    };
  }

  const reservationStart = new Date(
    `${date}T${time}:00${DEFAULT_TIMEZONE_OFFSET}`,
  );
  if (Number.isNaN(reservationStart.getTime())) {
    return {
      valid: false,
      code: "INVALID_FORMAT",
      reason: "無法解析預約時間",
      earliestAllowedDate: earliest.date,
      earliestAllowedTime: earliest.time,
      earliestAllowedLabel: earliest.label,
    };
  }

  const reservationMs = reservationStart.getTime();
  const nowMs = now.getTime();
  const minRequiredMs = nowMs + leadTimeMinutes * 60 * 1000;

  if (reservationMs <= nowMs) {
    return {
      valid: false,
      code: "PAST_DATE",
      reason: `預約時間不能為過去時間。最早可預約時間為：${earliest.label}`,
      earliestAllowedDate: earliest.date,
      earliestAllowedTime: earliest.time,
      earliestAllowedLabel: earliest.label,
    };
  }

  if (reservationMs < minRequiredMs) {
    return {
      valid: false,
      code: "TOO_SOON_TO_BOOK",
      reason: `預約時間需至少提前 ${leadTimeMinutes} 分鐘（最短提前預約限制）。最早可預約時間為：${earliest.label}`,
      earliestAllowedDate: earliest.date,
      earliestAllowedTime: earliest.time,
      earliestAllowedLabel: earliest.label,
    };
  }

  return {
    valid: true,
    earliestAllowedDate: earliest.date,
    earliestAllowedTime: earliest.time,
    earliestAllowedLabel: earliest.label,
  };
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function hasQueryKey(
  params: SearchParamRecord,
  key: (typeof QUERY_KEYS)[keyof typeof QUERY_KEYS],
) {
  return Object.hasOwn(params, key);
}

function parseEditableText(
  params: SearchParamRecord,
  key: (typeof QUERY_KEYS)[keyof typeof QUERY_KEYS],
  fallback: string,
) {
  if (!hasQueryKey(params, key)) {
    return fallback;
  }

  return firstParam(params[key])?.trim() ?? "";
}

function formatCurrency(amount: number) {
  return `NT$ ${amount.toLocaleString("en-US")}`;
}

function hasAirportContext(value: string) {
  return /airport|機場|terminal|航廈|taoyuan|songshan/i.test(value);
}

function estimateFare(draft: EnterpriseBookingDraftForm) {
  // Stage 1 has no enterprise quote API yet; this is display-only preview logic.
  let amount = 620;
  const routeText = `${draft.pickup} ${draft.dropoff}`;

  if (hasAirportContext(routeText)) {
    amount += 560;
  }

  if (/hsinchu|新竹/i.test(routeText)) {
    amount += 980;
  }

  if (draft.vehicle === "business") {
    amount += 0;
  } else if (draft.vehicle === "van") {
    amount += 420;
  } else {
    amount -= 80;
  }

  if (draft.airportDirection === "dropoff") {
    amount += 120;
  }

  const luggageCount = Number.parseInt(draft.luggageCount, 10);
  if (!Number.isNaN(luggageCount) && luggageCount > 2) {
    amount += (luggageCount - 2) * 60;
  }

  return Math.max(480, Math.round(amount / 10) * 10);
}

function getReservationStart(date: string, time: string, now = new Date()) {
  const normalizedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "2026-06-13";
  const normalizedTime = /^\d{2}:\d{2}$/.test(time) ? time : "15:20";
  const parsed = new Date(
    `${normalizedDate}T${normalizedTime}:00${DEFAULT_TIMEZONE_OFFSET}`,
  );

  return Number.isNaN(parsed.getTime()) ? now : parsed;
}

function getReservationWallClockFields(reservationWindowStart: string) {
  const reservationStart = new Date(reservationWindowStart);

  if (Number.isNaN(reservationStart.getTime())) {
    return { date: "", time: "" };
  }

  // Booking commands interpret the form's date/time as +08:00 wall-clock
  // values. Shift the UTC instant before ISO formatting so an Edit → Update
  // cycle preserves the original instant rather than applying the offset twice.
  const localWallClock = new Date(
    reservationStart.getTime() + DEFAULT_TIMEZONE_OFFSET_MS,
  ).toISOString();

  return {
    date: localWallClock.slice(0, 10),
    time: localWallClock.slice(11, 16),
  };
}

export function formatReservationWindowLabel(
  draft: Pick<
    EnterpriseBookingDraftForm,
    "reservationDate" | "reservationTime"
  >,
) {
  const date = draft.reservationDate;
  const time = draft.reservationTime;

  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time)) {
    return `${date.slice(5).replace("-", "/")} ${time}`;
  }

  return `${date} ${time}`.trim();
}

export function createEnterpriseBookingDraft(
  locale: Locale,
  now = new Date(),
  mode: EnterprisePassengerMode = "self",
): EnterpriseBookingDraftForm {
  const seed = getEnterpriseBookingDraft(locale);
  const vehicle = normalizeVehicle(enterpriseBookingDraft.vehicle, "business");
  const defaultReservation = new Date(
    now.getTime() + 2 * 24 * 60 * 60 * 1000 + DEFAULT_TIMEZONE_OFFSET_MS,
  )
    .toISOString()
    .slice(0, 10);
  const isSelf = mode === "self";
  const passenger = isSelf ? seed.bookedBy : seed.passenger;
  const placard = isSelf ? seed.bookedBy : derivePlacard(passenger);

  return {
    passengerMode: mode,
    passenger,
    bookedBy: seed.bookedBy,
    pickup: seed.pickup,
    dropoff: seed.dropoff,
    // A new booking must begin inside its editable window; the former demo
    // date made every post-release create/update journey immediately stale.
    reservationDate: defaultReservation,
    reservationTime: "10:00",
    onsiteContactPhone: seed.onsiteContact,
    costCenterCode: enterpriseBookingDraft.costCenterCode,
    costCenterLabel: seed.costCenter,
    vehicle,
    notes: seed.notes,
    airportDirection: "pickup",
    terminal: seed.terminal,
    flight: seed.flight,
    luggageCount: "3",
    placard,
  } satisfies EnterpriseBookingDraftForm;
}

export function parseEnterpriseBookingDraft(
  searchParams: SearchParamRecord | undefined,
  locale: Locale,
  now = new Date(),
): EnterpriseBookingDraftForm {
  const params = searchParams ?? {};
  const explicitPm = firstParam(params[QUERY_KEYS.passengerMode]);
  const hasPassengerParam = hasQueryKey(params, QUERY_KEYS.passenger);
  const seed = getEnterpriseBookingDraft(locale);

  let passengerMode: EnterprisePassengerMode = "self";
  if (explicitPm === "other") {
    passengerMode = "other";
  } else if (explicitPm === "self") {
    passengerMode = "self";
  } else if (hasPassengerParam) {
    const rawPassenger = firstParam(params[QUERY_KEYS.passenger])?.trim();
    if (rawPassenger && rawPassenger !== seed.bookedBy) {
      passengerMode = "other";
    }
  }

  const fallback = createEnterpriseBookingDraft(locale, now, passengerMode);
  const bookedBy = parseEditableText(
    params,
    QUERY_KEYS.bookedBy,
    fallback.bookedBy,
  );
  let passenger = parseEditableText(
    params,
    QUERY_KEYS.passenger,
    fallback.passenger,
  );
  if (passengerMode === "self") {
    passenger = bookedBy;
  }

  let placard = "";
  if (hasQueryKey(params, QUERY_KEYS.placard)) {
    placard = parseEditableText(params, QUERY_KEYS.placard, "");
  } else {
    placard = passengerMode === "self" ? bookedBy : derivePlacard(passenger);
  }

  const draft: EnterpriseBookingDraftForm = {
    passengerMode,
    passenger,
    bookedBy,
    pickup: parseEditableText(params, QUERY_KEYS.pickup, fallback.pickup),
    dropoff: parseEditableText(params, QUERY_KEYS.dropoff, fallback.dropoff),
    reservationDate: parseEditableText(
      params,
      QUERY_KEYS.reservationDate,
      fallback.reservationDate,
    ),
    reservationTime: parseEditableText(
      params,
      QUERY_KEYS.reservationTime,
      fallback.reservationTime,
    ),
    onsiteContactPhone: parseEditableText(
      params,
      QUERY_KEYS.onsiteContact,
      fallback.onsiteContactPhone,
    ),
    costCenterCode: parseEditableText(
      params,
      QUERY_KEYS.costCenterCode,
      fallback.costCenterCode,
    ),
    costCenterLabel: parseEditableText(
      params,
      QUERY_KEYS.costCenterLabel,
      fallback.costCenterLabel,
    ),
    vehicle: normalizeVehicle(
      firstParam(params[QUERY_KEYS.vehicle]),
      fallback.vehicle,
    ),
    notes: parseEditableText(params, QUERY_KEYS.notes, fallback.notes),
    airportDirection:
      firstParam(params[QUERY_KEYS.airportDirection]) === "dropoff"
        ? "dropoff"
        : "pickup",
    terminal: parseEditableText(params, QUERY_KEYS.terminal, fallback.terminal),
    flight: parseEditableText(params, QUERY_KEYS.flight, fallback.flight),
    luggageCount: parseEditableText(
      params,
      QUERY_KEYS.luggageCount,
      fallback.luggageCount,
    ),
    placard,
  };

  return draft;
}

function normalizeVehicle(
  value: string | undefined,
  fallback: EnterpriseVehiclePreference,
): EnterpriseVehiclePreference {
  return value === "sedan" || value === "business" || value === "van"
    ? value
    : fallback;
}

export function serializeEnterpriseBookingDraft(
  draft: EnterpriseBookingDraftForm,
) {
  const params = new URLSearchParams();

  params.set(QUERY_KEYS.passengerMode, draft.passengerMode);
  params.set(QUERY_KEYS.passenger, draft.passenger);
  params.set(QUERY_KEYS.bookedBy, draft.bookedBy);
  params.set(QUERY_KEYS.pickup, draft.pickup);
  params.set(QUERY_KEYS.dropoff, draft.dropoff);
  params.set(QUERY_KEYS.reservationDate, draft.reservationDate);
  params.set(QUERY_KEYS.reservationTime, draft.reservationTime);
  params.set(QUERY_KEYS.onsiteContact, draft.onsiteContactPhone);
  params.set(QUERY_KEYS.costCenterCode, draft.costCenterCode);
  params.set(QUERY_KEYS.costCenterLabel, draft.costCenterLabel);
  params.set(QUERY_KEYS.vehicle, draft.vehicle);
  params.set(QUERY_KEYS.notes, draft.notes);
  params.set(QUERY_KEYS.airportDirection, draft.airportDirection);
  params.set(QUERY_KEYS.terminal, draft.terminal);
  params.set(QUERY_KEYS.flight, draft.flight);
  params.set(QUERY_KEYS.luggageCount, draft.luggageCount);
  if (draft.placard) {
    params.set(QUERY_KEYS.placard, draft.placard);
  }

  return params;
}

export function getEnterpriseBookingPreview(
  draft: EnterpriseBookingDraftForm,
  locale: Locale,
): EnterpriseBookingPreview {
  const estimatedFare = estimateFare(draft);
  const approvalRequired =
    estimatedFare > APPROVAL_THRESHOLD || draft.vehicle === "van";
  const remainingBudget = Math.max(0, DISPLAY_BUDGET_AVAILABLE - estimatedFare);
  const isZh = locale === "zh";

  return {
    estimatedFare,
    estimatedFareLabel: `${isZh ? "約 " : "≈ "}${formatCurrency(estimatedFare)}`,
    remainingBudgetLabel: `${formatCurrency(remainingBudget)} / ${DISPLAY_BUDGET_TOTAL.toLocaleString("en-US")}`,
    quotaImpactLabel: isZh ? "本趟預扣 1 趟" : "Reserves 1 ride this trip",
    approvalRequired,
    approvalLabel: approvalRequired
      ? isZh
        ? "需主管審批"
        : "Manager approval needed"
      : isZh
        ? "免審批"
        : "No approval",
    bannerTone: approvalRequired ? "warn" : "success",
    bannerBody: approvalRequired
      ? isZh
        ? `預估金額 ${formatCurrency(estimatedFare)} 已達審批門檻（NT$ 1,500），送出後會先進入待審批。`
        : `Estimated fare ${formatCurrency(estimatedFare)} reaches the NT$ 1,500 threshold, so submission will enter approval first.`
      : isZh
        ? `預估金額 ${formatCurrency(estimatedFare)} 未達審批門檻（NT$ 1,500），送出後可直接派車。`
        : `Estimated fare ${formatCurrency(estimatedFare)} stays below the NT$ 1,500 approval threshold, so dispatch can proceed directly.`,
    reservationWindowLabel: formatReservationWindowLabel(draft),
  };
}

export function buildEnterpriseBookingCommand(
  draft: EnterpriseBookingDraftForm,
  now = new Date(),
): CreateTenantBookingCommand {
  const reservationWindowStart = getReservationStart(
    draft.reservationDate,
    draft.reservationTime,
    now,
  );
  const reservationWindowEnd = new Date(
    reservationWindowStart.getTime() + 30 * 60 * 1000,
  );
  const preview = getEnterpriseBookingPreview(draft, "zh");
  const luggageCount = Number.parseInt(draft.luggageCount, 10);
  const passengerName =
    draft.passengerMode === "self" ? draft.bookedBy : draft.passenger;
  const onsiteContactPhone = draft.onsiteContactPhone.trim();

  return {
    businessDispatchSubtype: "enterprise_dispatch",
    pickup: {
      address: draft.pickup,
      addressName: inferAddressName(draft.pickup),
    },
    dropoff: {
      address: draft.dropoff,
      addressName: inferAddressName(draft.dropoff),
    },
    reservationWindowStart: reservationWindowStart.toISOString(),
    reservationWindowEnd: reservationWindowEnd.toISOString(),
    passenger: {
      name: passengerName,
      phone: onsiteContactPhone,
    },
    bookedBy: {
      name: draft.bookedBy.trim(),
      // The enterprise UI only collects the coordinator display name. The
      // authenticated actor remains authoritative; this address is a stable
      // command contact required by the tenant contract, not user-entered data.
      email: "enterprise-dispatch-web@drts.local",
    },
    onsiteContact: {
      name: passengerName,
      phone: onsiteContactPhone,
    },
    costCenter: draft.costCenterCode,
    vehiclePreference: draft.vehicle,
    signoffRequired: preview.approvalRequired,
    direction: draft.airportDirection,
    ...(draft.flight.trim() ? { flightNo: draft.flight.trim() } : {}),
    ...(draft.terminal.trim() ? { terminal: draft.terminal.trim() } : {}),
    ...(!Number.isNaN(luggageCount) ? { luggageCount } : {}),
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
  };
}

export function buildEnterpriseBookingUpdateCommand(
  draft: EnterpriseBookingDraftForm,
  now = new Date(),
): UpdateTenantBookingCommand {
  return buildEnterpriseBookingCommand(draft, now);
}

export function createEnterpriseBookingDraftFromRecord(
  record: BookingRecord,
): EnterpriseBookingDraftForm {
  const { date, time } = getReservationWallClockFields(
    record.reservationWindowStart,
  );
  const passengerMode =
    record.bookedBy?.name === record.passenger.name ? "self" : "other";
  const passenger = record.passenger.name;
  const bookedBy = record.bookedBy?.name ?? record.passenger.name;
  const placard =
    passengerMode === "self" ? bookedBy : derivePlacard(passenger);

  return {
    passengerMode,
    passenger,
    bookedBy,
    pickup: record.pickup.address,
    dropoff: record.dropoff.address,
    reservationDate: date,
    reservationTime: time,
    onsiteContactPhone: record.onsiteContact?.phone ?? record.passenger.phone,
    costCenterCode: record.costCenter ?? "",
    costCenterLabel: record.costCenter ?? "",
    vehicle: normalizeVehicle(
      record.vehiclePreference ?? undefined,
      "business",
    ),
    notes: record.notes ?? "",
    airportDirection: record.direction === "dropoff" ? "dropoff" : "pickup",
    terminal: record.terminal ?? "",
    flight: record.flightNo ?? "",
    luggageCount: record.luggageCount?.toString() ?? "",
    placard,
  };
}

function inferAddressName(address: string) {
  const trimmed = address.trim();
  const [head] = trimmed.split("·");
  return head?.trim() || trimmed;
}

export function isEnterpriseDraftComplete(
  draft: EnterpriseBookingDraftForm,
  now = new Date(),
) {
  const fieldsFilled = [
    draft.passengerMode === "self" ? draft.bookedBy : draft.passenger,
    draft.bookedBy,
    draft.pickup,
    draft.dropoff,
    draft.reservationDate,
    draft.reservationTime,
    draft.onsiteContactPhone,
    draft.costCenterCode,
    draft.costCenterLabel,
  ].every((value) => value.trim().length > 0);

  if (!fieldsFilled) {
    return false;
  }

  return validateReservationWindow(
    draft.reservationDate,
    draft.reservationTime,
    now,
  ).valid;
}

export function getVehicleLabelFromDraft(
  draft: EnterpriseBookingDraftForm,
  locale: Locale,
) {
  if (draft.vehicle === "sedan") {
    return translate("fixture.vehicle.standard", undefined, locale);
  }

  if (draft.vehicle === "van") {
    return translate("fixture.vehicle.van", undefined, locale);
  }

  return translate("fixture.vehicle.business", undefined, locale);
}
