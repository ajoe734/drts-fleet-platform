import type {
  BookingRecord,
  ComplianceGateRecord,
  CreateTenantBookingCommand,
  CrossAppResourceLink,
} from "@drts/contracts";

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
    : bookingOrGates?.complianceGates ?? [];
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
