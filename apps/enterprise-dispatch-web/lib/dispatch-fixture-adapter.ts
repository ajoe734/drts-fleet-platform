import type {
  BookingRecord,
  ComplianceGateRecord,
  CreateTenantBookingCommand,
  CrossAppResourceLink,
} from "@drts/contracts";
import type {
  AvailableAction,
  BookingState,
  EnterpriseBooking,
} from "./enterprise-fixtures";

export type EnterpriseDispatchBookingFixture = {
  reservationWindowStart: string;
  reservationWindowEnd: string;
  pickupAddress: string;
  pickupAddressName?: string;
  pickupLat?: number | null;
  pickupLng?: number | null;
  dropoffAddress: string;
  dropoffAddressName?: string;
  dropoffLat?: number | null;
  dropoffLng?: number | null;
  passengerName: string;
  passengerPhone: string;
  bookedByName?: string;
  bookedByEmail?: string;
  onsiteContactName?: string;
  onsiteContactPhone?: string;
  costCenter?: string;
  vehiclePreference?: string;
  notes?: string;
  flightNo?: string;
  terminal?: string;
  luggageCount?: number | null;
  signoffRequired?: boolean;
  direction?: "pickup" | "dropoff";
};

export type EnterpriseDispatchGateSnapshot = {
  totalCount: number;
  blockingCount: number;
  reviewRequiredCount: number;
  clearCount: number;
  primaryGateType: ComplianceGateRecord["gateType"] | null;
  primaryGateState: ComplianceGateRecord["state"] | "clear";
  nextAction: string | null;
  summary: string;
};

export type EnterpriseDispatchEmbedDisposition = {
  allowed: false;
  mode: "deep_link_only";
  reasonCode:
    | "PHASE1_DEEP_LINK_ONLY"
    | "FORBIDDEN_CROSS_APP_LINK"
    | "MISSING_CROSS_APP_LINK";
  fallbackHref: string | null;
  targetApp: CrossAppResourceLink["targetApp"] | null;
};

export function adaptBookingFixtureToCreateCommand(
  fixture: EnterpriseDispatchBookingFixture,
): CreateTenantBookingCommand {
  const bookedByName = fixture.bookedByName?.trim();
  const bookedByEmail = fixture.bookedByEmail?.trim();
  const onsiteContactName = fixture.onsiteContactName?.trim();
  const onsiteContactPhone = fixture.onsiteContactPhone?.trim();
  const notes = fixture.notes?.trim();
  const costCenter = fixture.costCenter?.trim();
  const vehiclePreference = fixture.vehiclePreference?.trim();
  const flightNo = fixture.flightNo?.trim();
  const terminal = fixture.terminal?.trim();

  return {
    businessDispatchSubtype: "enterprise_dispatch",
    pickup: {
      address: fixture.pickupAddress,
      ...(fixture.pickupAddressName
        ? { addressName: fixture.pickupAddressName }
        : {}),
      ...(fixture.pickupLat !== undefined ? { lat: fixture.pickupLat } : {}),
      ...(fixture.pickupLng !== undefined ? { lng: fixture.pickupLng } : {}),
    },
    dropoff: {
      address: fixture.dropoffAddress,
      ...(fixture.dropoffAddressName
        ? { addressName: fixture.dropoffAddressName }
        : {}),
      ...(fixture.dropoffLat !== undefined ? { lat: fixture.dropoffLat } : {}),
      ...(fixture.dropoffLng !== undefined ? { lng: fixture.dropoffLng } : {}),
    },
    reservationWindowStart: fixture.reservationWindowStart,
    reservationWindowEnd: fixture.reservationWindowEnd,
    passenger: {
      name: fixture.passengerName,
      phone: fixture.passengerPhone,
    },
    ...(bookedByName && bookedByEmail
      ? {
          bookedBy: {
            name: bookedByName,
            email: bookedByEmail,
          },
        }
      : {}),
    ...(onsiteContactName && onsiteContactPhone
      ? {
          onsiteContact: {
            name: onsiteContactName,
            phone: onsiteContactPhone,
          },
        }
      : {}),
    ...(costCenter ? { costCenter } : {}),
    ...(vehiclePreference ? { vehiclePreference } : {}),
    ...(fixture.signoffRequired !== undefined
      ? { signoffRequired: fixture.signoffRequired }
      : {}),
    ...(fixture.direction ? { direction: fixture.direction } : {}),
    ...(flightNo ? { flightNo } : {}),
    ...(terminal ? { terminal } : {}),
    ...(fixture.luggageCount != null
      ? { luggageCount: fixture.luggageCount }
      : {}),
    ...(notes ? { notes } : {}),
  };
}

function pickPrimaryGate(
  gates: ComplianceGateRecord[],
): ComplianceGateRecord | null {
  return (
    gates.find((gate) => gate.blocking) ??
    gates.find((gate) => gate.state === "review_required") ??
    gates[0] ??
    null
  );
}

export function summarizeBookingGates(
  bookingOrGates: BookingRecord | ComplianceGateRecord[] | undefined,
): EnterpriseDispatchGateSnapshot {
  const gates = Array.isArray(bookingOrGates)
    ? bookingOrGates
    : (bookingOrGates?.complianceGates ?? []);
  const blockingCount = gates.filter((gate) => gate.blocking).length;
  const reviewRequiredCount = gates.filter(
    (gate) => gate.state === "review_required",
  ).length;
  const clearCount = gates.filter((gate) => gate.state === "clear").length;
  const primaryGate = pickPrimaryGate(gates);

  if (gates.length === 0) {
    return {
      totalCount: 0,
      blockingCount: 0,
      reviewRequiredCount: 0,
      clearCount: 0,
      primaryGateType: null,
      primaryGateState: "clear",
      nextAction: null,
      summary: "No compliance gates published on the tenant booking record.",
    };
  }

  return {
    totalCount: gates.length,
    blockingCount,
    reviewRequiredCount,
    clearCount,
    primaryGateType: primaryGate?.gateType ?? null,
    primaryGateState: primaryGate?.state ?? "clear",
    nextAction: primaryGate?.nextAction ?? null,
    summary:
      blockingCount > 0
        ? `${blockingCount} blocking gate(s) require dispatch follow-up.`
        : reviewRequiredCount > 0
          ? `${reviewRequiredCount} gate(s) are pending manual review.`
          : `${clearCount} gate(s) published and currently clear.`,
  };
}

export function resolveDispatchEmbedDisposition(
  link?: CrossAppResourceLink | null,
): EnterpriseDispatchEmbedDisposition {
  if (!link) {
    return {
      allowed: false,
      mode: "deep_link_only",
      reasonCode: "MISSING_CROSS_APP_LINK",
      fallbackHref: null,
      targetApp: null,
    };
  }

  if (link.openMode !== "new_tab" && link.openMode !== "same_tab") {
    return {
      allowed: false,
      mode: "deep_link_only",
      reasonCode: "FORBIDDEN_CROSS_APP_LINK",
      fallbackHref: null,
      targetApp: link.targetApp,
    };
  }

  return {
    allowed: false,
    mode: "deep_link_only",
    reasonCode: "PHASE1_DEEP_LINK_ONLY",
    fallbackHref: link.route,
    targetApp: link.targetApp,
  };
}

export interface EnterpriseTripDriverInfo {
  hasDriver: boolean;
  status: "assigned" | "unassigned";
  driverName: string;
  vehicle: string;
  placard?: string | null;
  phone?: string | null;
  isPhoneAuthorized: boolean;
  unassignedReason?: string;
}

export interface EnterpriseContactAction {
  available: boolean;
  type: "tel" | "nav" | "disabled" | "support_redirect";
  href?: string;
  label: string;
  phone?: string;
  reason?: string;
}

export interface EnterpriseTripContactConfig {
  driver: EnterpriseContactAction;
  support: EnterpriseContactAction;
}

export interface EnterpriseBookingErrorState {
  isNotFound: boolean;
  isRetryable: boolean;
  statusCode: number;
  errorCode: string;
  title: string;
  message: string;
  suggestedAction: "list" | "retry" | "support";
}

export function resolveTripDriverInfo(
  booking: BookingRecord,
): EnterpriseTripDriverInfo {
  const isDispatched = [
    "assigned",
    "driver_accepted",
    "enroute_pickup",
    "arrived_pickup",
    "on_trip",
  ].includes(booking.orderStatus);

  const raw = booking as unknown as {
    driver?: {
      name?: string;
      vehicle?: string;
      phone?: string;
      phoneAuthorized?: boolean;
      placard?: string;
    };
    driverName?: string;
    vehiclePlateNo?: string;
    driverPhone?: string;
    driverPhoneAuthorized?: boolean;
    placard?: string;
  };

  const name = raw.driver?.name ?? raw.driverName;
  const vehicle = raw.driver?.vehicle ?? raw.vehiclePlateNo;
  const phone = raw.driver?.phone ?? raw.driverPhone ?? null;
  const placard = raw.driver?.placard ?? raw.placard ?? null;
  const isPhoneAuthorized = Boolean(
    phone &&
    raw.driver?.phoneAuthorized !== false &&
    raw.driverPhoneAuthorized !== false,
  );

  if (isDispatched && name) {
    return {
      hasDriver: true,
      status: "assigned",
      driverName: name,
      vehicle: vehicle ?? "已派車輛",
      placard,
      phone: isPhoneAuthorized ? phone : null,
      isPhoneAuthorized,
    };
  }

  if (isDispatched) {
    return {
      hasDriver: false,
      status: "unassigned",
      driverName: "尚未指派司機",
      vehicle: "車輛安排中",
      phone: null,
      isPhoneAuthorized: false,
      unassignedReason: "系統已確認派車，正在媒合司機；暫無司機資訊",
    };
  }

  const isNoSupply =
    booking.orderStatus === "no_supply" ||
    booking.orderStatus === "dispatch_failed";
  return {
    hasDriver: false,
    status: "unassigned",
    driverName: isNoSupply ? "暫無可派車輛" : "尚未指派司機",
    vehicle: "車輛安排中",
    phone: null,
    isPhoneAuthorized: false,
    unassignedReason: isNoSupply
      ? "目前運能吃緊暫無車輛，請改期或洽客服協助"
      : "尚未到達派車時間，請稍候",
  };
}

export function resolveTripContactConfig(
  driverInfo: EnterpriseTripDriverInfo,
  supportPhone = "0800-200-118",
): EnterpriseTripContactConfig {
  const support: EnterpriseContactAction = {
    available: true,
    type: "tel",
    href: `tel:${supportPhone}`,
    label: "企業客服",
    phone: supportPhone,
  };

  let driver: EnterpriseContactAction;
  if (
    driverInfo.hasDriver &&
    driverInfo.isPhoneAuthorized &&
    driverInfo.phone
  ) {
    driver = {
      available: true,
      type: "tel",
      href: `tel:${driverInfo.phone}`,
      label: "聯絡司機",
      phone: driverInfo.phone,
    };
  } else if (driverInfo.hasDriver && !driverInfo.isPhoneAuthorized) {
    driver = {
      available: false,
      type: "support_redirect",
      href: `tel:${supportPhone}`,
      label: "聯絡司機",
      reason: "司機電話未公開，請改洽企業客服協助轉達",
    };
  } else {
    driver = {
      available: false,
      type: "disabled",
      label: "聯絡司機",
      reason: driverInfo.unassignedReason ?? "尚未指派司機，無法通話",
    };
  }

  return { driver, support };
}

export function mapBookingRecordToProgressStage(record: BookingRecord): {
  activeStage: number;
  label: string;
} {
  switch (record.orderStatus) {
    case "assigned":
    case "driver_accepted":
      return { activeStage: 0, label: "已派車" };
    case "enroute_pickup":
      return { activeStage: 1, label: "前往上車" };
    case "arrived_pickup":
      return { activeStage: 2, label: "抵達上車" };
    case "on_trip":
      return { activeStage: 3, label: "行程中" };
    case "completed":
    case "proof_pending":
      return { activeStage: 4, label: "完成" };
    default:
      return { activeStage: 0, label: "預約成立" };
  }
}

export function formatReservationWindow(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${m}/${day} ${h}:${min}`;
  } catch {
    return isoString;
  }
}

export function mapRecordToBookingState(record: BookingRecord): BookingState {
  if (record.status === "cancelled" || record.orderStatus === "cancelled") {
    return "cancelled";
  }
  if (
    record.orderStatus === "no_supply" ||
    record.orderStatus === "dispatch_failed" ||
    record.orderStatus === "dispatch_timeout"
  ) {
    return "nosupply";
  }
  if (record.orderStatus === "completed" || record.status === "completed") {
    return "completed";
  }
  if (
    record.orderStatus === "enroute_pickup" ||
    record.orderStatus === "arrived_pickup" ||
    record.orderStatus === "on_trip"
  ) {
    return "enroute";
  }
  if (
    record.orderStatus === "assigned" ||
    record.orderStatus === "driver_accepted"
  ) {
    return "assigned";
  }
  if (record.approvalState === "pending") {
    return "approval";
  }
  return "reserved";
}

export function adaptBookingRecordToEnterpriseBooking(
  record: BookingRecord,
): EnterpriseBooking {
  const state = mapRecordToBookingState(record);
  const self =
    !record.bookedBy ||
    record.bookedBy.name.trim() === record.passenger.name.trim();

  const rawEta = (record as unknown as { etaMinutes?: number | null })
    .etaMinutes;
  let etaMinutes: number | null = null;
  if (typeof rawEta === "number" && rawEta >= 0) {
    etaMinutes = rawEta;
  }

  const pickupName = record.pickup.addressName
    ? `${record.pickup.addressName} (${record.pickup.address})`
    : record.pickup.address;
  const dropoffName = record.dropoff.addressName
    ? `${record.dropoff.addressName} (${record.dropoff.address})`
    : record.dropoff.address;

  const formattedFare = record.quotedFare
    ? `${record.quotedFare.currency === "TWD" ? "NT$" : record.quotedFare.currency} ${(record.quotedFare.amountMinor / 100).toLocaleString()}`
    : undefined;

  return {
    id: record.bookingId,
    passenger: record.passenger.name,
    bookedBy: record.bookedBy?.name || record.passenger.name,
    self,
    from: pickupName,
    to: dropoffName,
    window: formatReservationWindow(record.reservationWindowStart),
    state,
    costCenter: record.costCenter ?? "",
    etaMinutes,
    vehicle: record.vehiclePreference || "商務車",
    approval:
      record.approvalState === "approved"
        ? "approved"
        : record.approvalState === "pending"
          ? "pending"
          : "auto",
    receiptReady: state === "completed",
    ...(formattedFare ? { fare: formattedFare } : {}),
    ...(record.flightNo ? { flight: record.flightNo } : {}),
    ...(record.terminal ? { terminal: record.terminal } : {}),
    ...(record.luggageCount != null
      ? { luggage: `${record.luggageCount} 件` }
      : {}),
    ...(record.onsiteContact?.phone
      ? {
          onsiteContact: `${record.onsiteContact.name ?? "現場聯絡"} · ${record.onsiteContact.phone}`,
        }
      : {}),
    availableActions: [
      "view",
      ...(state !== "cancelled" && state !== "completed"
        ? (["track_trip"] as AvailableAction[])
        : []),
      "contact_support",
      ...(state === "completed" ? (["view_receipt"] as AvailableAction[]) : []),
      ...(record.cancelableUntil &&
      new Date(record.cancelableUntil).getTime() > Date.now() &&
      state !== "cancelled"
        ? (["cancel"] as AvailableAction[])
        : []),
    ],
  };
}

export function classifyBookingApiError(
  error: unknown,
  bookingId?: string,
): EnterpriseBookingErrorState {
  const err = error as
    | { statusCode?: number; code?: string; message?: string }
    | undefined;
  const statusCode =
    typeof err?.statusCode === "number"
      ? err.statusCode
      : typeof (error as { status?: number })?.status === "number"
        ? (error as { status: number }).status
        : 500;
  const errorCode = typeof err?.code === "string" ? err.code : "UNKNOWN_ERROR";

  if (statusCode === 404 || errorCode.toLowerCase().includes("not_found")) {
    return {
      isNotFound: true,
      isRetryable: false,
      statusCode: 404,
      errorCode: "BOOKING_NOT_FOUND",
      title: "查無此行程 (404)",
      message: bookingId
        ? `找不到預約編號「${bookingId}」的行程資訊。此預約可能不存在或已被刪除。`
        : "找不到指定的預約行程資訊。",
      suggestedAction: "list",
    };
  }

  const isServer = statusCode >= 500;
  return {
    isNotFound: false,
    isRetryable: isServer,
    statusCode,
    errorCode,
    title: isServer ? "服務暫時不穩定" : "讀取行程失敗",
    message: isServer
      ? "目前系統連線不穩定，請稍後再試。"
      : typeof err?.message === "string"
        ? err.message
        : "無法取得行程資料，請檢查網路連線或聯繫客服。",
    suggestedAction: isServer ? "retry" : "support",
  };
}
