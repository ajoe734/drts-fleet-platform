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
import { getEnterpriseVehicleLabel } from "./enterprise-fixtures";
import type { Locale } from "./translations";

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

export function formatReservationWindow(isoString?: string | null): string {
  if (!isoString) return "—";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${mm}/${dd} ${hh}:${min}`;
  } catch {
    return isoString;
  }
}

export function resolveEnterpriseBookingState(
  record: BookingRecord,
): BookingState {
  if (record.status === "cancelled" || record.orderStatus === "cancelled") {
    return "cancelled";
  }
  if (record.status === "completed" || record.orderStatus === "completed") {
    return "completed";
  }
  if (record.orderStatus === "no_supply") {
    return "nosupply";
  }
  if (record.approvalState === "pending") {
    return "approval";
  }
  if (
    record.orderStatus === "enroute_pickup" ||
    record.orderStatus === "on_trip" ||
    record.orderStatus === "arrived_pickup"
  ) {
    return "enroute";
  }
  if (
    record.orderStatus === "driver_accepted" ||
    record.orderStatus === "assigned"
  ) {
    return "assigned";
  }
  return "reserved";
}

function actionAllowed(record: BookingRecord, action: "edit" | "cancel"): boolean {
  const cutoff =
    action === "edit" ? record.modifiableUntil : record.cancelableUntil;
  return Boolean(
    cutoff &&
      new Date(cutoff).getTime() > Date.now() &&
      record.status !== "cancelled",
  );
}

function mapVehiclePreference(pref: string, locale?: Locale): string {
  let label = pref;
  if (pref === "business") label = "商務車";
  else if (pref === "standard") label = "一般轎車";
  else if (pref === "wheelchair_van") label = "無障礙車";
  return locale ? getEnterpriseVehicleLabel(label, locale) : label;
}

export function adaptBookingRecordToEnterpriseBooking(
  record: BookingRecord,
  locale?: Locale,
): EnterpriseBooking {
  const isSelf =
    !record.bookedBy ||
    !record.bookedBy.name ||
    record.bookedBy.name.trim() === record.passenger.name.trim();

  const state = resolveEnterpriseBookingState(record);
  const windowStr = formatReservationWindow(record.reservationWindowStart);

  const availableActions: AvailableAction[] = ["view"];
  if (state === "completed") {
    availableActions.push("view_receipt");
  } else if (state !== "cancelled") {
    availableActions.push("contact_support");
    if (state === "enroute" || state === "assigned") {
      availableActions.push("track_trip");
    }
    if (actionAllowed(record, "cancel")) {
      availableActions.push("cancel");
    }
  }

  return {
    id: record.bookingId,
    passenger: record.passenger.name,
    bookedBy: record.bookedBy?.name ?? record.passenger.name,
    self: isSelf,
    from: record.pickup.addressName
      ? `${record.pickup.address} (${record.pickup.addressName})`
      : record.pickup.address,
    to: record.dropoff.addressName
      ? `${record.dropoff.address} (${record.dropoff.addressName})`
      : record.dropoff.address,
    window: windowStr,
    state,
    costCenter: record.costCenter ?? "—",
    etaMinutes: null,
    vehicle: record.vehiclePreference
      ? mapVehiclePreference(record.vehiclePreference, locale)
      : "商務車",
    approval: record.approvalState ?? "approved",
    receiptReady:
      record.status === "completed" || record.orderStatus === "completed",
    ...(record.quotedFare
      ? {
          fare: `NT$ ${Math.round(record.quotedFare.amountMinor / 100).toLocaleString()}`,
        }
      : {}),
    ...(record.flightNo ? { flight: record.flightNo } : {}),
    ...(record.terminal ? { terminal: record.terminal } : {}),
    ...(record.luggageCount ? { luggage: `${record.luggageCount} 件` } : {}),
    ...(record.onsiteContact
      ? {
          onsiteContact: `${record.onsiteContact.name} · ${record.onsiteContact.phone}`,
        }
      : {}),
    availableActions,
  };
}

export interface EnterpriseTripDriverContact {
  assigned: boolean;
  name: string;
  vehicle: string;
  placard?: string | null;
  rating?: string | null;
  phone: string | null;
  phoneAuthorized: boolean;
  disclosureStatus:
    | "authorized"
    | "masked_only"
    | "unauthorized"
    | "not_assigned";
  statusDescription: string;
  statusTone: "info" | "primary" | "warn" | "neutral" | "danger" | "success";
  contactNotice: string | null;
}

export function resolveEnterpriseTripDriverContact(
  record?: BookingRecord | null,
  options?: {
    driverOverride?: {
      name?: string;
      phone?: string | null;
      vehicle?: string;
      placard?: string;
      rating?: string;
      phoneAuthorized?: boolean;
    };
  },
): EnterpriseTripDriverContact {
  if (!record) {
    return {
      assigned: false,
      name: "尚未指派司機",
      vehicle: "車輛調度中",
      placard: null,
      rating: null,
      phone: null,
      phoneAuthorized: false,
      disclosureStatus: "not_assigned",
      statusDescription: "尚未建立行程",
      statusTone: "neutral",
      contactNotice: "目前無有效行程，無法進行司機通訊。",
    };
  }

  const unassignedStatuses = new Set([
    "created",
    "submitted",
    "processing",
    "approved",
    "dispatch_requested",
    "dispatched",
    "no_supply",
    "delayed_queue",
    "exception_hold",
    "cancelled",
  ]);

  const isAssigned =
    !unassignedStatuses.has(record.orderStatus) &&
    record.status !== "cancelled" &&
    record.orderStatus !== "no_supply";

  if (!isAssigned) {
    const isNoSupply = record.orderStatus === "no_supply";
    return {
      assigned: false,
      name: "尚未指派司機",
      vehicle: record.vehiclePreference
        ? `調度中 (${record.vehiclePreference})`
        : "車輛調度中",
      placard: null,
      rating: null,
      phone: null,
      phoneAuthorized: false,
      disclosureStatus: "not_assigned",
      statusDescription: isNoSupply ? "目前無可派車輛" : "車輛調度配對中",
      statusTone: isNoSupply ? "danger" : "warn",
      contactNotice: isNoSupply
        ? "目前區域內暫無可派車輛，尚未指派司機。請洽企業客服尋求代訂或改派支援。"
        : "尚未指派司機，調度系統正為您指派合適車輛與司機，派定後方可進行通訊。",
    };
  }

  const disclosure = record.passengerDisclosure;
  const requiresAck = disclosure?.requiresAcknowledgement ?? false;
  const isAcknowledged = Boolean(disclosure?.acknowledgedAt);
  const isDisclosureAuthorized = !requiresAck || isAcknowledged;

  const override = options?.driverOverride;
  const rawPhone = override?.phone ?? null;
  const isAuthorized =
    (override?.phoneAuthorized ?? isDisclosureAuthorized) && Boolean(rawPhone);

  const driverName = override?.name || "特約司機";
  const vehicleName =
    override?.vehicle || record.vehiclePreference || "商務接送車";
  const rating = override?.rating || "4.9 ★";
  const placard = override?.placard || `${record.passenger.name} 様`;

  let statusDesc = "前往上車點";
  let statusTone: EnterpriseTripDriverContact["statusTone"] = "info";
  if (record.orderStatus === "driver_accepted") {
    statusDesc = "已派車 · 司機接單";
    statusTone = "primary";
  } else if (record.orderStatus === "enroute_pickup") {
    statusDesc = "前往上車點";
    statusTone = "info";
  } else if (record.orderStatus === "arrived_pickup") {
    statusDesc = "已抵達上車點";
    statusTone = "info";
  } else if (record.orderStatus === "on_trip") {
    statusDesc = "行程進行中";
    statusTone = "info";
  } else if (record.orderStatus === "completed") {
    statusDesc = "行程已完成";
    statusTone = "success";
  }

  return {
    assigned: true,
    name: driverName,
    vehicle: vehicleName,
    placard,
    rating,
    phone: isAuthorized ? rawPhone : null,
    phoneAuthorized: isAuthorized,
    disclosureStatus: isAuthorized ? "authorized" : "unauthorized",
    statusDescription: statusDesc,
    statusTone,
    contactNotice: isAuthorized
      ? null
      : "依個資與隱私保護政策，司機個人電話未直接露出。如有緊急事項請聯繫企業客服或透過系統轉接。",
  };
}

export type AuthoritativeBookingLookupResult = {
  booking: BookingRecord | null;
  isNotFound: boolean;
  error: string | null;
};

export async function fetchAuthoritativeEnterpriseBookings(
  tenantIdOrClient?:
    | string
    | { listBookings: () => Promise<BookingRecord[]> },
): Promise<BookingRecord[]> {
  try {
    if (
      typeof tenantIdOrClient === "object" &&
      tenantIdOrClient !== null &&
      "listBookings" in tenantIdOrClient
    ) {
      return await tenantIdOrClient.listBookings();
    }
    const { getEnterpriseDispatchTenantClient } = await import("./api-client");
    const { enterpriseTenant } = await import("./enterprise-fixtures");
    const client = getEnterpriseDispatchTenantClient(
      typeof tenantIdOrClient === "string"
        ? tenantIdOrClient
        : enterpriseTenant.id,
    );
    return await client.listBookings();
  } catch {
    return [];
  }
}

export async function fetchAuthoritativeEnterpriseBooking(
  bookingId: string,
  tenantIdOrClient?:
    | string
    | { getBooking: (id: string) => Promise<BookingRecord> },
): Promise<AuthoritativeBookingLookupResult> {
  const trimmedId = bookingId?.trim();
  if (!trimmedId) {
    return { booking: null, isNotFound: true, error: null };
  }
  try {
    let booking: BookingRecord;
    if (
      typeof tenantIdOrClient === "object" &&
      tenantIdOrClient !== null &&
      "getBooking" in tenantIdOrClient
    ) {
      booking = await tenantIdOrClient.getBooking(trimmedId);
    } else {
      const { getEnterpriseDispatchTenantClient } = await import("./api-client");
      const { enterpriseTenant } = await import("./enterprise-fixtures");
      const client = getEnterpriseDispatchTenantClient(
        typeof tenantIdOrClient === "string"
          ? tenantIdOrClient
          : enterpriseTenant.id,
      );
      booking = await client.getBooking(trimmedId);
    }
    return { booking, isNotFound: false, error: null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const isNotFound =
      message.includes("404") ||
      message.includes("BOOKING_NOT_FOUND") ||
      ("statusCode" in (error as Record<string, unknown>) &&
        (error as { statusCode: number }).statusCode === 404);
    return {
      booking: null,
      isNotFound,
      error: isNotFound ? null : message,
    };
  }
}
