import type {
  BusinessDispatchSubtype,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import { t } from "./translations";

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

function formatDateTimeLocalInputValue(value: Date) {
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

export function createDefaultPartnerBookingDraft(): PartnerBookingDraftValues {
  const start = new Date();
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
  };
}

export function getPartnerProgramLabel(
  subtype: BusinessDispatchSubtype,
): string {
  return t(`book.program.${subtype}`);
}

export function getPartnerProgramCoverage(
  subtype: BusinessDispatchSubtype,
): string {
  return t(`book.coverage.${subtype}`);
}

export function getPartnerProgramGate(params: {
  entry: Pick<
    PartnerChannelEntryRecord,
    "businessDispatchSubtype" | "eligibilityMode" | "entrySlug"
  >;
  draft: PartnerBookingDraftValues;
  eligibilityVerificationId: string | null;
}): PartnerProgramGate {
  const { entry, draft, eligibilityVerificationId } = params;

  if (
    entry.businessDispatchSubtype === "credit_card_airport_transfer" &&
    entry.eligibilityMode !== "none" &&
    !eligibilityVerificationId?.trim()
  ) {
    return {
      state: "blocked",
      message: t("book.eligibility.airport.message"),
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
        message: t("book.eligibility.insurance.message"),
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
      message: t("book.eligibility.travel.message"),
      actionHref: null,
    };
  }

  return {
    state: "ready",
    message: t("book.ready"),
    actionHref: null,
  };
}

function setRequiredError(
  errors: PartnerBookingFieldErrors,
  field: keyof PartnerBookingDraftValues,
  labelKey: Parameters<typeof t>[0],
) {
  errors[field] = t("error.required", { label: t(labelKey) });
}

export function getPartnerBookingFieldErrors(params: {
  draft: PartnerBookingDraftValues;
  subtype: BusinessDispatchSubtype;
}): PartnerBookingFieldErrors {
  const { draft, subtype } = params;
  const errors: PartnerBookingFieldErrors = {};

  if (!hasText(draft.pickupAddress)) {
    setRequiredError(errors, "pickupAddress", "field.pickupAddress");
  }
  if (!hasText(draft.dropoffAddress)) {
    setRequiredError(errors, "dropoffAddress", "field.dropoffAddress");
  }
  if (!hasText(draft.passengerName)) {
    setRequiredError(errors, "passengerName", "field.passengerName");
  }
  if (!hasText(draft.passengerPhone)) {
    setRequiredError(errors, "passengerPhone", "field.passengerPhone");
  }

  if (!hasText(draft.reservationWindowStart)) {
    setRequiredError(
      errors,
      "reservationWindowStart",
      "field.reservationWindowStart",
    );
  } else if (!isValidDateTime(draft.reservationWindowStart)) {
    errors.reservationWindowStart = t("error.datetime", {
      label: t("field.reservationWindowStart"),
    });
  }

  if (!hasText(draft.reservationWindowEnd)) {
    setRequiredError(
      errors,
      "reservationWindowEnd",
      "field.reservationWindowEnd",
    );
  } else if (!isValidDateTime(draft.reservationWindowEnd)) {
    errors.reservationWindowEnd = t("error.datetime", {
      label: t("field.reservationWindowEnd"),
    });
  }

  if (
    isValidDateTime(draft.reservationWindowStart) &&
    isValidDateTime(draft.reservationWindowEnd) &&
    new Date(draft.reservationWindowStart).getTime() >=
      new Date(draft.reservationWindowEnd).getTime()
  ) {
    errors.reservationWindowEnd = t("error.windowOrder");
  }

  if (subtype === "credit_card_airport_transfer") {
    if (!hasText(draft.cardTier)) {
      setRequiredError(errors, "cardTier", "field.cardTier");
    }
    if (!hasText(draft.flightNo)) {
      setRequiredError(errors, "flightNo", "field.flightNo");
    }
    if (!hasText(draft.terminal)) {
      setRequiredError(errors, "terminal", "field.terminal");
    }
    if (!draft.direction) {
      setRequiredError(errors, "direction", "field.direction");
    }
  }

  if (subtype === "insurance_replacement_vehicle") {
    if (!hasText(draft.claimNumber)) {
      setRequiredError(errors, "claimNumber", "field.claimNumber");
    }
    if (!hasText(draft.policyNumber)) {
      setRequiredError(errors, "policyNumber", "field.policyNumber");
    }
    if (!hasText(draft.claimReference)) {
      setRequiredError(errors, "claimReference", "field.claimReference");
    }
    if (!hasText(draft.claimantName)) {
      setRequiredError(errors, "claimantName", "field.claimantName");
    }
    if (!hasText(draft.replacementVehicleClass)) {
      setRequiredError(
        errors,
        "replacementVehicleClass",
        "field.replacementVehicleClass",
      );
    }
    if (!hasText(draft.replacementStart)) {
      setRequiredError(errors, "replacementStart", "field.replacementStart");
    } else if (!isValidDateTime(draft.replacementStart)) {
      errors.replacementStart = t("error.datetime", {
        label: t("field.replacementStart"),
      });
    }
    if (!hasText(draft.replacementEnd)) {
      setRequiredError(errors, "replacementEnd", "field.replacementEnd");
    } else if (!isValidDateTime(draft.replacementEnd)) {
      errors.replacementEnd = t("error.datetime", {
        label: t("field.replacementEnd"),
      });
    }
    if (
      isValidDateTime(draft.replacementStart) &&
      isValidDateTime(draft.replacementEnd) &&
      new Date(draft.replacementStart).getTime() >=
        new Date(draft.replacementEnd).getTime()
    ) {
      errors.replacementEnd = t("error.periodOrder");
    }
  }

  if (subtype === "travel_agency_transfer") {
    if (!hasText(draft.groupCode)) {
      setRequiredError(errors, "groupCode", "field.groupCode");
    }
    if (!hasText(draft.itineraryLink)) {
      setRequiredError(errors, "itineraryLink", "field.itineraryLink");
    } else if (!isValidUrl(draft.itineraryLink)) {
      errors.itineraryLink = t("error.url", {
        label: t("field.itineraryLink"),
      });
    }
    if (!hasText(draft.meetingPoint)) {
      setRequiredError(errors, "meetingPoint", "field.meetingPoint");
    }
    if (!hasText(draft.rosterPassengers)) {
      setRequiredError(errors, "rosterPassengers", "field.rosterPassengers");
    }

    const groupSize = parseInteger(draft.groupSize);
    if (groupSize == null || groupSize <= 0) {
      errors.groupSize = t("error.positiveInteger", {
        label: t("field.groupSize"),
      });
    }
  }

  if (hasText(draft.luggageCount)) {
    const luggageCount = parseInteger(draft.luggageCount);
    if (luggageCount == null) {
      errors.luggageCount = t("error.nonNegativeInteger", {
        label: t("field.luggageCount"),
      });
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
}): boolean {
  const { entry, draft, eligibilityVerificationId } = params;
  return (
    Object.keys(
      getPartnerBookingFieldErrors({
        draft,
        subtype: entry.businessDispatchSubtype,
      }),
    ).length === 0 &&
    getPartnerProgramGate({
      entry,
      draft,
      eligibilityVerificationId,
    }).state === "ready"
  );
}
