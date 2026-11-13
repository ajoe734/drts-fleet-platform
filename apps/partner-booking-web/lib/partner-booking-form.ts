import type {
  ComputeGeoRouteCommand,
  GeoRouteResponse,
  GeoSearchResponse,
  GeoResolveResponse,
  GeoReverseResponse,
  SearchGeoQuery,
  ResolveAddressCommand,
  ReverseGeocodeCommand,
  BusinessDispatchSubtype,
  BookingRecord,
  PartnerBookingDetails,
  PartnerChannelEntryRecord,
  VerifyPartnerEligibilityCommand,
  PartnerEligibilityVerificationRecord,
} from "@drts/contracts";
import {
  AddressProviderUnavailableError,
  type AddressMapPickerProvider,
  type AddressProviderHealth,
  evaluateAddressSubmitGate,
  type AddressPayload,
  type AddressProviderState,
  type AddressSubmitGateState,
  type ServiceAreaEvaluationResult,
} from "@drts/ui-web";
import { type Locale, t } from "./translations";

const DEFAULT_LOCALE: Locale = "zh";

export interface PartnerBookingDraftValues {
  pickupAddress: string;
  dropoffAddress: string;
  reservationWindowStart: string;
  reservationWindowEnd: string;
  passengerName: string;
  passengerPhone: string;
  notes: string;
  cardTier: string;
  flightNo: string;
  terminal: string;
  direction: "" | "pickup" | "dropoff";
  claimNumber: string;
  policyNumber: string;
  claimReference: string;
  claimantName: string;
  replacementStart: string;
  replacementEnd: string;
  replacementVehicleClass: string;
  caseHandler: string;
  groupCode: string;
  groupSize: string;
  itineraryLink: string;
  rosterPassengers: string;
  luggageCount: string;
  meetingPoint: string;
  guideName: string;
  guidePhone: string;
  viaStops: string;
  signage: string;
  travelPlanDocument: string;
  travelPlanLegId: string;
  travelPlanBatchId: string;
  travelPlanVehicleId: string;
}

export type PartnerBookingFieldErrors = Partial<
  Record<keyof PartnerBookingDraftValues, string>
>;

export type PartnerProgramGate = {
  state: "ready" | "blocked" | "inline_required";
  message: string;
  actionHref: string | null;
};

function padDateTimeSegment(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDateTimeLocalInputValue(value: Date) {
  return [
    value.getFullYear(),
    padDateTimeSegment(value.getMonth() + 1),
    padDateTimeSegment(value.getDate()),
  ]
    .join("-")
    .concat(
      `T${padDateTimeSegment(value.getHours())}:${padDateTimeSegment(value.getMinutes())}`,
    );
}

function hasText(value: string) {
  return value.trim().length > 0;
}

function hasTextAddressFallback(
  draft: Pick<PartnerBookingDraftValues, "pickupAddress" | "dropoffAddress">,
) {
  return hasText(draft.pickupAddress) && hasText(draft.dropoffAddress);
}

function isValidDateTime(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

function isValidUrl(value: string) {
  if (!hasText(value)) {
    return false;
  }

  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function parseInteger(value: string) {
  if (!hasText(value)) {
    return null;
  }
  if (!/^\d+$/.test(value.trim())) {
    return null;
  }
  return Number.parseInt(value.trim(), 10);
}

export function createDefaultPartnerBookingDraft(
  baseTime: Date | string | number = new Date(),
): PartnerBookingDraftValues {
  const start = new Date(baseTime);
  start.setMinutes(start.getMinutes() + 90, 0, 0);
  const end = new Date(start.getTime());
  end.setMinutes(end.getMinutes() + 60);

  return {
    pickupAddress: "",
    dropoffAddress: "",
    reservationWindowStart: formatDateTimeLocalInputValue(start),
    reservationWindowEnd: formatDateTimeLocalInputValue(end),
    passengerName: "",
    passengerPhone: "",
    notes: "",
    cardTier: "",
    flightNo: "",
    terminal: "",
    direction: "",
    claimNumber: "",
    policyNumber: "",
    claimReference: "",
    claimantName: "",
    replacementStart: formatDateTimeLocalInputValue(start),
    replacementEnd: formatDateTimeLocalInputValue(end),
    replacementVehicleClass: "",
    caseHandler: "",
    groupCode: "",
    groupSize: "",
    itineraryLink: "",
    rosterPassengers: "",
    luggageCount: "",
    meetingPoint: "",
    guideName: "",
    guidePhone: "",
    viaStops: "",
    signage: "",
    travelPlanDocument: "",
    travelPlanLegId: "",
    travelPlanBatchId: "",
    travelPlanVehicleId: "",
  };
}

/** Operator-supplied planning data. Vehicle IDs here identify plan slots only. */
export interface PartnerTravelPlan {
  source: {
    kind: "sim" | "operator_declared";
    id: string;
    revision: string;
    label: string;
  };
  groupCode: string;
  groupSize: number;
  itineraryLink: string;
  guideName: string;
  guidePhone: string;
  fareBasis: "included_in_tour";
  legs: Array<{
    id: string;
    label: string;
    pickupAddress: string;
    dropoffAddress: string;
    viaStops: string[];
    signage: string;
    batches: Array<{
      id: string;
      label: string;
      windowStart: string;
      windowEnd: string;
      meetingPoint: string;
      vehicles: Array<{
        id: string;
        label: string;
        seats: number;
        luggageCount: number;
        rosterPassengers: string[];
      }>;
    }>;
  }>;
}

/** Parse the declared source, never infer vehicles or legs from people/luggage. */
export function parsePartnerTravelPlan(
  document: string,
): PartnerTravelPlan | null {
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid tour plan object");
    return value as Record<string, unknown>;
  };
  const text = (value: unknown) => {
    if (typeof value !== "string" || !value.trim())
      throw new Error("Missing tour plan text");
    return value.trim();
  };
  const integer = (value: unknown, minimum: number) => {
    if (
      typeof value !== "number" ||
      !Number.isSafeInteger(value) ||
      value < minimum
    )
      throw new Error("Invalid tour plan number");
    return value;
  };
  const list = <T>(value: unknown, parse: (item: unknown) => T): T[] => {
    if (!Array.isArray(value) || value.length === 0)
      throw new Error("Missing tour plan list");
    return value.map(parse);
  };
  const unique = <T extends { id: string }>(items: T[]) => {
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new Error("Duplicate tour plan selection");
    return items;
  };
  try {
    const raw = object(JSON.parse(document));
    const source = object(raw.source);
    if (source.kind !== "sim" && source.kind !== "operator_declared")
      return null;
    if (raw.fareBasis !== "included_in_tour") return null;
    const itineraryLink = text(raw.itineraryLink);
    if (!isValidUrl(itineraryLink)) return null;
    const plan: PartnerTravelPlan = {
      source: {
        kind: source.kind,
        id: text(source.id),
        revision: text(source.revision),
        label: text(source.label),
      },
      groupCode: text(raw.groupCode),
      groupSize: integer(raw.groupSize, 1),
      itineraryLink,
      guideName: text(raw.guideName),
      guidePhone: text(raw.guidePhone),
      fareBasis: raw.fareBasis,
      legs: unique(
        list(raw.legs, (value) => {
          const leg = object(value);
          if (!Array.isArray(leg.viaStops) || typeof leg.signage !== "string")
            throw new Error("Invalid tour stop details");
          return {
            id: text(leg.id),
            label: text(leg.label),
            pickupAddress: text(leg.pickupAddress),
            dropoffAddress: text(leg.dropoffAddress),
            viaStops: leg.viaStops.map(text),
            signage: leg.signage.trim(),
            batches: unique(
              list(leg.batches, (value) => {
                const batch = object(value);
                const windowStart = text(batch.windowStart);
                const windowEnd = text(batch.windowEnd);
                if (
                  !/(?:Z|[+-]\d{2}:\d{2})$/i.test(windowStart) ||
                  !/(?:Z|[+-]\d{2}:\d{2})$/i.test(windowEnd) ||
                  !isValidDateTime(windowStart) ||
                  !isValidDateTime(windowEnd) ||
                  new Date(windowStart).getTime() >=
                    new Date(windowEnd).getTime()
                )
                  throw new Error("Invalid tour plan window");
                return {
                  id: text(batch.id),
                  label: text(batch.label),
                  windowStart,
                  windowEnd,
                  meetingPoint: text(batch.meetingPoint),
                  vehicles: unique(
                    list(batch.vehicles, (value) => {
                      const vehicle = object(value);
                      return {
                        id: text(vehicle.id),
                        label: text(vehicle.label),
                        seats: integer(vehicle.seats, 1),
                        luggageCount: integer(vehicle.luggageCount, 0),
                        rosterPassengers: list(vehicle.rosterPassengers, text),
                      };
                    }),
                  ),
                };
              }),
            ),
          };
        }),
      ),
    };
    // Each batch describes one allocation; people may recur in another leg/batch.
    for (const leg of plan.legs) {
      for (const batch of leg.batches) {
        let allocatedPeople = 0;
        for (const vehicle of batch.vehicles) {
          if (vehicle.rosterPassengers.length > vehicle.seats) return null;
          allocatedPeople += vehicle.rosterPassengers.length;
        }
        if (allocatedPeople > plan.groupSize) return null;
      }
    }
    return plan;
  } catch {
    return null;
  }
}

export function getPartnerTravelPlanSelection(
  draft: PartnerBookingDraftValues,
) {
  if (!draft.travelPlanDocument) return null;
  const plan = parsePartnerTravelPlan(draft.travelPlanDocument);
  const leg = plan?.legs.find((item) => item.id === draft.travelPlanLegId);
  const batch = leg?.batches.find(
    (item) => item.id === draft.travelPlanBatchId,
  );
  const vehicle = batch?.vehicles.find(
    (item) => item.id === draft.travelPlanVehicleId,
  );
  return plan && leg && batch && vehicle ? { plan, leg, batch, vehicle } : null;
}

/** Copy only one explicit allocation into the existing single-booking intake. */
export function applyPartnerTravelPlanSelection(
  draft: PartnerBookingDraftValues,
  document: string,
  selection?: { legId: string; batchId?: string; vehicleId?: string },
): PartnerBookingDraftValues | null {
  const plan = parsePartnerTravelPlan(document);
  const leg = selection
    ? plan?.legs.find((item) => item.id === selection.legId)
    : plan?.legs[0];
  const batch = selection?.batchId
    ? leg?.batches.find((item) => item.id === selection.batchId)
    : leg?.batches[0];
  const vehicle = selection?.vehicleId
    ? batch?.vehicles.find((item) => item.id === selection.vehicleId)
    : batch?.vehicles[0];
  if (!plan || !leg || !batch || !vehicle) return null;
  const localInput = (value: string) => {
    const date = new Date(value);
    const fraction = String(date.getMilliseconds())
      .padStart(3, "0")
      .replace(/0+$/, "");
    const seconds = padDateTimeSegment(date.getSeconds());
    return (
      formatDateTimeLocalInputValue(date) +
      (seconds !== "00" || fraction
        ? `:${seconds}${fraction ? "." + fraction : ""}`
        : "")
    );
  };
  return {
    ...draft,
    groupCode: plan.groupCode,
    groupSize: String(vehicle.rosterPassengers.length),
    itineraryLink: plan.itineraryLink,
    guideName: plan.guideName,
    guidePhone: plan.guidePhone,
    pickupAddress: leg.pickupAddress,
    dropoffAddress: leg.dropoffAddress,
    viaStops: leg.viaStops.join("\n"),
    signage: leg.signage,
    reservationWindowStart: localInput(batch.windowStart),
    reservationWindowEnd: localInput(batch.windowEnd),
    meetingPoint: batch.meetingPoint,
    luggageCount: String(vehicle.luggageCount),
    rosterPassengers: vehicle.rosterPassengers.join("\n"),
    travelPlanDocument: document,
    travelPlanLegId: leg.id,
    travelPlanBatchId: batch.id,
    travelPlanVehicleId: vehicle.id,
  };
}

export function buildPartnerTravelBookingDetails(
  draft: PartnerBookingDraftValues,
): Extract<PartnerBookingDetails, { subtype: "travel_agency_transfer" }> {
  const selected = getPartnerTravelPlanSelection(draft);
  const viaStops = draft.viaStops
    .split(/\r?\n/)
    .map((stop) => stop.trim())
    .filter(Boolean);
  return {
    subtype: "travel_agency_transfer",
    groupCode: draft.groupCode.trim(),
    groupSize: Number(draft.groupSize),
    itineraryLink: draft.itineraryLink.trim(),
    rosterPassengers: draft.rosterPassengers
      .split(/\r?\n/)
      .map((name) => name.trim())
      .filter(Boolean),
    meetingPoint: draft.meetingPoint.trim(),
    guideName: draft.guideName.trim(),
    guidePhone: draft.guidePhone.trim(),
    ...(viaStops.length ? { viaStops } : {}),
    ...(draft.signage.trim() ? { signage: draft.signage.trim() } : {}),
    ...(selected
      ? {
          planSourceKind: selected.plan.source.kind,
          planSourceId: selected.plan.source.id,
          planSourceRevision: selected.plan.source.revision,
          planSourceLabel: selected.plan.source.label,
          planGroupSize: selected.plan.groupSize,
          planLegId: selected.leg.id,
          planLegLabel: selected.leg.label,
          planPickupAddress: selected.leg.pickupAddress,
          planDropoffAddress: selected.leg.dropoffAddress,
          planLegIndex: selected.plan.legs.indexOf(selected.leg) + 1,
          planLegCount: selected.plan.legs.length,
          planBatchId: selected.batch.id,
          planBatchLabel: selected.batch.label,
          planWindowStart: new Date(selected.batch.windowStart).toISOString(),
          planWindowEnd: new Date(selected.batch.windowEnd).toISOString(),
          planBatchIndex: selected.leg.batches.indexOf(selected.batch) + 1,
          planBatchCount: selected.leg.batches.length,
          planVehicleId: selected.vehicle.id,
          planVehicleLabel: selected.vehicle.label,
          planVehicleSeats: selected.vehicle.seats,
          planVehicleCount: selected.batch.vehicles.length,
          planVehicleLabels: selected.batch.vehicles.map(
            (vehicle) => vehicle.label,
          ),
          planFareBasis: selected.plan.fareBasis,
        }
      : {}),
  };
}

/** Explicit opt-in example of an external SIM source, not a fleet allocation. */
export function createPartnerTravelPlanExample(
  draft: PartnerBookingDraftValues,
) {
  const defaults = createDefaultPartnerBookingDraft();
  const validWindow =
    isValidDateTime(draft.reservationWindowStart) &&
    isValidDateTime(draft.reservationWindowEnd) &&
    new Date(draft.reservationWindowStart).getTime() <
      new Date(draft.reservationWindowEnd).getTime();
  const windowStart = new Date(
    validWindow
      ? draft.reservationWindowStart
      : defaults.reservationWindowStart,
  ).toISOString();
  const windowEnd = new Date(
    validWindow ? draft.reservationWindowEnd : defaults.reservationWindowEnd,
  ).toISOString();
  const firstRoster = ["SIM Traveller One", "SIM Traveller Two"];
  const vehicles = [
    {
      id: "SIM-slot-A",
      label: "SIM planned minibus A",
      seats: 8,
      luggageCount: parseInteger(draft.luggageCount) ?? 2,
      rosterPassengers: firstRoster,
    },
    {
      id: "SIM-slot-B",
      label: "SIM planned minibus B",
      seats: 8,
      luggageCount: 0,
      rosterPassengers: ["SIM Traveller Three", "SIM Traveller Four"],
    },
  ];
  const plan: PartnerTravelPlan = {
    source: {
      kind: "sim",
      id: "SIM-tour-plan",
      revision: "1",
      label: "SIM tour-plan example",
    },
    groupCode: draft.groupCode.trim() || "SIM-GROUP-EXAMPLE",
    groupSize: 4,
    itineraryLink: isValidUrl(draft.itineraryLink)
      ? draft.itineraryLink.trim()
      : "https://travel.example.test/SIM-tour-plan",
    guideName: draft.guideName.trim() || "SIM Tour Guide",
    guidePhone: draft.guidePhone.trim() || "0900000000",
    fareBasis: "included_in_tour",
    legs: [
      {
        id: "SIM-leg-out",
        label: "SIM outbound transfer",
        pickupAddress: "SIM meeting point",
        dropoffAddress: "SIM tour destination",
        viaStops: draft.viaStops.trim()
          ? draft.viaStops
              .split(/\r?\n/)
              .map((stop) => stop.trim())
              .filter(Boolean)
          : ["SIM planned stop"],
        signage: draft.signage.trim() || "SIM tour sign",
        batches: [
          {
            id: "SIM-batch-A",
            label: "SIM first departure",
            windowStart,
            windowEnd,
            meetingPoint: draft.meetingPoint.trim() || "SIM meeting point",
            vehicles,
          },
        ],
      },
      {
        id: "SIM-leg-return",
        label: "SIM return transfer",
        pickupAddress: "SIM tour destination",
        dropoffAddress: "SIM meeting point",
        viaStops: [],
        signage: "",
        batches: [
          {
            id: "SIM-batch-B",
            label: "SIM return departure",
            windowStart: new Date(
              new Date(windowStart).getTime() + 2 * 60 * 60_000,
            ).toISOString(),
            windowEnd: new Date(
              new Date(windowEnd).getTime() + 2 * 60 * 60_000,
            ).toISOString(),
            meetingPoint: "SIM tour destination",
            vehicles,
          },
        ],
      },
    ],
  };
  return JSON.stringify(plan, null, 2);
}

export function getPartnerProgramLabel(
  subtype: BusinessDispatchSubtype,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return t(`book.program.${subtype}`, undefined, locale);
}

export function getPartnerProgramCoverage(
  subtype: BusinessDispatchSubtype,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return t(`book.coverage.${subtype}`, undefined, locale);
}

export function getPartnerProgramGate(params: {
  entry: Pick<
    PartnerChannelEntryRecord,
    "businessDispatchSubtype" | "eligibilityMode" | "entrySlug"
  >;
  draft: PartnerBookingDraftValues;
  eligibilityVerificationId: string | null;
  locale?: Locale;
}): PartnerProgramGate {
  const {
    entry,
    draft,
    eligibilityVerificationId,
    locale = DEFAULT_LOCALE,
  } = params;

  if (
    entry.businessDispatchSubtype === "credit_card_airport_transfer" &&
    entry.eligibilityMode !== "none" &&
    !eligibilityVerificationId?.trim()
  ) {
    return {
      state: "blocked",
      message: t("book.eligibility.airport.message", undefined, locale),
      actionHref: `/${entry.entrySlug}/eligibility`,
    };
  }

  if (entry.businessDispatchSubtype === "insurance_replacement_vehicle") {
    if (
      !hasText(draft.claimNumber) ||
      !hasText(draft.policyNumber) ||
      !hasText(draft.replacementVehicleClass)
    ) {
      return {
        state: "inline_required",
        message: t("book.eligibility.insurance.message", undefined, locale),
        actionHref: null,
      };
    }
  }

  if (
    entry.businessDispatchSubtype === "travel_agency_transfer" &&
    entry.eligibilityMode === "reference_required" &&
    !hasText(draft.groupCode)
  ) {
    return {
      state: "inline_required",
      message: t("book.eligibility.travel.message", undefined, locale),
      actionHref: null,
    };
  }

  return {
    state: "ready",
    message: t("book.ready", undefined, locale),
    actionHref: null,
  };
}

function setRequiredError(
  errors: PartnerBookingFieldErrors,
  field: keyof PartnerBookingDraftValues,
  labelKey: Parameters<typeof t>[0],
  locale: Locale,
) {
  errors[field] = t(
    "error.required",
    {
      label: t(labelKey, undefined, locale),
    },
    locale,
  );
}

export function getPartnerBookingFieldErrors(params: {
  draft: PartnerBookingDraftValues;
  subtype: BusinessDispatchSubtype;
  locale?: Locale;
}): PartnerBookingFieldErrors {
  const { draft, subtype, locale = DEFAULT_LOCALE } = params;
  const errors: PartnerBookingFieldErrors = {};

  if (!hasText(draft.pickupAddress)) {
    setRequiredError(errors, "pickupAddress", "field.pickupAddress", locale);
  }
  if (!hasText(draft.dropoffAddress)) {
    setRequiredError(errors, "dropoffAddress", "field.dropoffAddress", locale);
  }
  if (!hasText(draft.passengerName)) {
    setRequiredError(errors, "passengerName", "field.passengerName", locale);
  }
  if (!hasText(draft.passengerPhone)) {
    setRequiredError(errors, "passengerPhone", "field.passengerPhone", locale);
  }

  if (!hasText(draft.reservationWindowStart)) {
    setRequiredError(
      errors,
      "reservationWindowStart",
      "field.reservationWindowStart",
      locale,
    );
  } else if (!isValidDateTime(draft.reservationWindowStart)) {
    errors.reservationWindowStart = t(
      "error.datetime",
      { label: t("field.reservationWindowStart", undefined, locale) },
      locale,
    );
  }

  if (!hasText(draft.reservationWindowEnd)) {
    setRequiredError(
      errors,
      "reservationWindowEnd",
      "field.reservationWindowEnd",
      locale,
    );
  } else if (!isValidDateTime(draft.reservationWindowEnd)) {
    errors.reservationWindowEnd = t(
      "error.datetime",
      { label: t("field.reservationWindowEnd", undefined, locale) },
      locale,
    );
  }

  if (
    isValidDateTime(draft.reservationWindowStart) &&
    isValidDateTime(draft.reservationWindowEnd) &&
    new Date(draft.reservationWindowStart).getTime() >=
      new Date(draft.reservationWindowEnd).getTime()
  ) {
    errors.reservationWindowEnd = t("error.windowOrder", undefined, locale);
  }

  if (subtype === "credit_card_airport_transfer") {
    if (!hasText(draft.cardTier)) {
      setRequiredError(errors, "cardTier", "field.cardTier", locale);
    }
    if (!hasText(draft.flightNo)) {
      setRequiredError(errors, "flightNo", "field.flightNo", locale);
    }
    if (!hasText(draft.terminal)) {
      setRequiredError(errors, "terminal", "field.terminal", locale);
    }
    if (!draft.direction) {
      setRequiredError(errors, "direction", "field.direction", locale);
    }
  }

  if (subtype === "insurance_replacement_vehicle") {
    if (!hasText(draft.claimNumber)) {
      setRequiredError(errors, "claimNumber", "field.claimNumber", locale);
    }
    if (!hasText(draft.policyNumber)) {
      setRequiredError(errors, "policyNumber", "field.policyNumber", locale);
    }
    if (!hasText(draft.claimReference)) {
      setRequiredError(
        errors,
        "claimReference",
        "field.claimReference",
        locale,
      );
    }
    if (!hasText(draft.claimantName)) {
      setRequiredError(errors, "claimantName", "field.claimantName", locale);
    }
    if (!hasText(draft.replacementVehicleClass)) {
      setRequiredError(
        errors,
        "replacementVehicleClass",
        "field.replacementVehicleClass",
        locale,
      );
    }
    if (!hasText(draft.replacementStart)) {
      setRequiredError(
        errors,
        "replacementStart",
        "field.replacementStart",
        locale,
      );
    } else if (!isValidDateTime(draft.replacementStart)) {
      errors.replacementStart = t(
        "error.datetime",
        { label: t("field.replacementStart", undefined, locale) },
        locale,
      );
    }
    if (!hasText(draft.replacementEnd)) {
      setRequiredError(
        errors,
        "replacementEnd",
        "field.replacementEnd",
        locale,
      );
    } else if (!isValidDateTime(draft.replacementEnd)) {
      errors.replacementEnd = t(
        "error.datetime",
        { label: t("field.replacementEnd", undefined, locale) },
        locale,
      );
    }
    if (
      isValidDateTime(draft.replacementStart) &&
      isValidDateTime(draft.replacementEnd) &&
      new Date(draft.replacementStart).getTime() >=
        new Date(draft.replacementEnd).getTime()
    ) {
      errors.replacementEnd = t("error.periodOrder", undefined, locale);
    }
  }

  if (subtype === "travel_agency_transfer") {
    if (!hasText(draft.luggageCount)) {
      setRequiredError(errors, "luggageCount", "field.luggageCount", locale);
    }
    if (!hasText(draft.guideName)) {
      setRequiredError(errors, "guideName", "field.guideName", locale);
    }
    if (!hasText(draft.guidePhone)) {
      setRequiredError(errors, "guidePhone", "field.guidePhone", locale);
    }
    if (draft.travelPlanDocument && !getPartnerTravelPlanSelection(draft)) {
      errors.travelPlanDocument = t(
        "book.travel.plan.invalid",
        undefined,
        locale,
      );
    }
    if (!hasText(draft.groupCode)) {
      setRequiredError(errors, "groupCode", "field.groupCode", locale);
    }
    if (!hasText(draft.itineraryLink)) {
      setRequiredError(errors, "itineraryLink", "field.itineraryLink", locale);
    } else if (!isValidUrl(draft.itineraryLink)) {
      errors.itineraryLink = t(
        "error.url",
        { label: t("field.itineraryLink", undefined, locale) },
        locale,
      );
    }
    if (!hasText(draft.meetingPoint)) {
      setRequiredError(errors, "meetingPoint", "field.meetingPoint", locale);
    }
    if (!hasText(draft.rosterPassengers)) {
      setRequiredError(
        errors,
        "rosterPassengers",
        "field.rosterPassengers",
        locale,
      );
    }

    const groupSize = parseInteger(draft.groupSize);
    if (groupSize == null || groupSize <= 0) {
      errors.groupSize = t(
        "error.positiveInteger",
        { label: t("field.groupSize", undefined, locale) },
        locale,
      );
    }
  }

  if (hasText(draft.luggageCount)) {
    const luggageCount = parseInteger(draft.luggageCount);
    if (luggageCount == null) {
      errors.luggageCount = t(
        "error.nonNegativeInteger",
        { label: t("field.luggageCount", undefined, locale) },
        locale,
      );
    }
  }

  return errors;
}

export function isPartnerBookingDraftReady(params: {
  entry: Pick<
    PartnerChannelEntryRecord,
    "businessDispatchSubtype" | "eligibilityMode" | "entrySlug"
  >;
  draft: PartnerBookingDraftValues;
  eligibilityVerificationId: string | null;
  locale?: Locale;
}): boolean {
  const {
    entry,
    draft,
    eligibilityVerificationId,
    locale = DEFAULT_LOCALE,
  } = params;
  return (
    Object.keys(
      getPartnerBookingFieldErrors({
        draft,
        subtype: entry.businessDispatchSubtype,
        locale,
      }),
    ).length === 0 &&
    getPartnerProgramGate({
      entry,
      draft,
      eligibilityVerificationId,
      locale,
    }).state === "ready"
  );
}

export function getPartnerMapSubmitGate(params: {
  draft: Pick<PartnerBookingDraftValues, "pickupAddress" | "dropoffAddress">;
  pickup: AddressPayload | null;
  dropoff: AddressPayload | null;
  serviceability: ServiceAreaEvaluationResult | null;
  providerState?: AddressProviderState | null;
  routeStops?: Array<AddressPayload | null>;
}): AddressSubmitGateState {
  if (
    params.routeStops !== undefined &&
    (!Array.isArray(params.routeStops) ||
      params.routeStops.some(
        (stop) =>
          !stop ||
          !stop.address?.trim() ||
          typeof stop.lat !== "number" ||
          !Number.isFinite(stop.lat) ||
          Math.abs(stop.lat) > 90 ||
          typeof stop.lng !== "number" ||
          !Number.isFinite(stop.lng) ||
          Math.abs(stop.lng) > 180,
      ))
  ) {
    return { blocking: true, code: "coordinates_required" };
  }
  const baseGate = evaluateAddressSubmitGate({
    pickup: params.pickup,
    dropoff: params.dropoff,
    serviceability: params.serviceability,
    ...(params.providerState === undefined
      ? {}
      : { providerState: params.providerState }),
  });

  if (
    baseGate.code === "coordinates_required" &&
    params.providerState &&
    !params.providerState.available &&
    hasTextAddressFallback(params.draft)
  ) {
    return {
      blocking: false,
      code: "dispatch_manual_review_required",
    };
  }

  return baseGate;
}

/** Serializable form/action contract. Partner credentials never enter this payload. */
export type PartnerBookingSubmission = {
  draft: PartnerBookingDraftValues;
  pickup: AddressPayload | null;
  dropoff: AddressPayload | null;
  routeStops?: Array<AddressPayload | null>;
  serviceability: ServiceAreaEvaluationResult | null;
  providerState: AddressProviderState;
  idempotencyKey: string;
  eligibilityVerificationId?: string;
};

export type PartnerBookingConfirmation = Pick<
  BookingRecord,
  | "bookingId"
  | "orderId"
  | "orderStatus"
  | "reservationWindowStart"
  | "reservationWindowEnd"
> & {
  partnerBookingDetails?: PartnerBookingDetails;
  businessDispatchSubtype?: BookingRecord["businessDispatchSubtype"];
  direction?: BookingRecord["direction"];
  flightNo?: BookingRecord["flightNo"];
  terminal?: BookingRecord["terminal"];
  eligibilityVerificationId: string | null;
};

export type PartnerBookingActionResult =
  | { ok: true; confirmation: PartnerBookingConfirmation }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      eligibilityVerificationId?: string;
    };

/** Read links carry normal ingress context and real IDs, never a bearer/key. */
export function partnerBookingReadHref(
  entrySlug: string,
  screen: "confirmed" | "receipt" | "trips",
  partnerUserRef: string,
  ids: { bookingId?: string; orderId?: string; page?: number } = {},
): string {
  const query = new URLSearchParams({ partnerUserRef });
  if (ids.bookingId) query.set("bookingId", ids.bookingId);
  if (ids.orderId) query.set("orderId", ids.orderId);
  if (ids.page) query.set("page", String(ids.page));
  return (
    "/" + encodeURIComponent(entrySlug) + "/" + screen + "?" + query.toString()
  );
}

/** Existing partner eligibility fields only; no session/key enters this payload. */
export type PartnerEligibilitySubmission = Omit<
  VerifyPartnerEligibilityCommand,
  "entrySlug"
>;

export type PartnerEligibilityActionResult =
  | {
      ok: true;
      verification: Pick<
        PartnerEligibilityVerificationRecord,
        | "eligibilityVerificationId"
        | "verificationStatus"
        | "verificationReasonCode"
      >;
    }
  | { ok: false; errorCode: string; errorMessage: string };

/** Serializable map inputs; the BFF supplies the actual Partner bearer/actor. */
export type PartnerAirportMapRequest =
  | { operation: "health" }
  | { operation: "search"; query: SearchGeoQuery }
  | { operation: "resolve"; command: ResolveAddressCommand }
  | { operation: "reverse"; command: ReverseGeocodeCommand }
  | {
      operation: "route";
      origin: ComputeGeoRouteCommand["origin"];
      destination: ComputeGeoRouteCommand["destination"];
      direction: "pickup" | "dropoff";
    };
export type PartnerAirportMapResult =
  | {
      ok: true;
      data:
        | AddressProviderHealth
        | GeoSearchResponse
        | GeoResolveResponse
        | GeoReverseResponse
        | GeoRouteResponse;
    }
  | { ok: false; errorCode: string };
export type PartnerAirportMapAction = (
  request: PartnerAirportMapRequest,
) => Promise<PartnerAirportMapResult>;

/** Geo and coverage remain normal API reads, including when external maps are SIM. */
export function createPartnerAirportMapProvider(
  action: PartnerAirportMapAction | undefined,
  direction: "" | "pickup" | "dropoff",
): AddressMapPickerProvider {
  async function read<T>(request: PartnerAirportMapRequest): Promise<T> {
    if (!action)
      throw new AddressProviderUnavailableError(
        "The address service is unavailable.",
        "partner_map_unavailable",
      );
    const result = await action(request);
    if (!result.ok)
      throw new AddressProviderUnavailableError(
        "The address service is unavailable.",
        result.errorCode,
      );
    return result.data as T;
  }
  let pendingHealth: Promise<AddressProviderHealth> | null = null;
  return {
    search: (query) => read<GeoSearchResponse>({ operation: "search", query }),
    resolve: (command) =>
      read<GeoResolveResponse>({ operation: "resolve", command }),
    reverse: (command) =>
      read<GeoReverseResponse>({ operation: "reverse", command }),
    getHealth: () => {
      if (!pendingHealth) {
        pendingHealth = read<AddressProviderHealth>({
          operation: "health",
        }).then(
          (health) => {
            pendingHealth = null;
            return health;
          },
          (error: unknown) => {
            pendingHealth = null;
            throw error;
          },
        );
      }
      return pendingHealth;
    },
    async evaluateServiceArea(command) {
      if (!command.dropoff || !direction)
        throw new AddressProviderUnavailableError(
          "Confirm both stops and the airport direction.",
          "airport_route_incomplete",
        );
      const route = await read<GeoRouteResponse>({
        operation: "route",
        origin: command.pickup,
        destination: command.dropoff,
        direction,
      });
      if (!route.serviceAreaEvaluation)
        throw new AddressProviderUnavailableError(
          "The route service-area result is unavailable.",
          "airport_preview_unavailable",
        );
      return route.serviceAreaEvaluation;
    },
  };
}
