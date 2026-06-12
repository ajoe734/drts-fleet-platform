import type {
  BusinessDispatchSubtype,
  PartnerChannelEntryRecord,
} from "@drts/contracts";
import { type Locale, t } from "./translations";

const DEFAULT_LOCALE: Locale = "zh";

function tx(
  locale: Locale,
  key: Parameters<typeof t>[0],
  params?: Record<string, string | number>,
) {
  return t(key, params, locale);
}

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
  locale: Locale = DEFAULT_LOCALE,
): string {
  return tx(locale, `book.program.${subtype}`);
}

export function getPartnerProgramCoverage(
  subtype: BusinessDispatchSubtype,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return tx(locale, `book.coverage.${subtype}`);
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
      message: tx(locale, "book.eligibility.airport.message"),
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
        message: tx(locale, "book.eligibility.insurance.message"),
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
      message: tx(locale, "book.eligibility.travel.message"),
      actionHref: null,
    };
  }

  return {
    state: "ready",
    message: tx(locale, "book.ready"),
    actionHref: null,
  };
}

function setRequiredError(
  errors: PartnerBookingFieldErrors,
  field: keyof PartnerBookingDraftValues,
  labelKey: Parameters<typeof t>[0],
  locale: Locale,
) {
  errors[field] = tx(locale, "error.required", {
    label: tx(locale, labelKey),
  });
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
    errors.reservationWindowStart = tx(locale, "error.datetime", {
      label: tx(locale, "field.reservationWindowStart"),
    });
  }

  if (!hasText(draft.reservationWindowEnd)) {
    setRequiredError(
      errors,
      "reservationWindowEnd",
      "field.reservationWindowEnd",
      locale,
    );
  } else if (!isValidDateTime(draft.reservationWindowEnd)) {
    errors.reservationWindowEnd = tx(locale, "error.datetime", {
      label: tx(locale, "field.reservationWindowEnd"),
    });
  }

  if (
    isValidDateTime(draft.reservationWindowStart) &&
    isValidDateTime(draft.reservationWindowEnd) &&
    new Date(draft.reservationWindowStart).getTime() >=
      new Date(draft.reservationWindowEnd).getTime()
  ) {
    errors.reservationWindowEnd = tx(locale, "error.windowOrder");
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
      setRequiredError(errors, "claimReference", "field.claimReference", locale);
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
      errors.replacementStart = tx(locale, "error.datetime", {
        label: tx(locale, "field.replacementStart"),
      });
    }
    if (!hasText(draft.replacementEnd)) {
      setRequiredError(errors, "replacementEnd", "field.replacementEnd", locale);
    } else if (!isValidDateTime(draft.replacementEnd)) {
      errors.replacementEnd = tx(locale, "error.datetime", {
        label: tx(locale, "field.replacementEnd"),
      });
    }
    if (
      isValidDateTime(draft.replacementStart) &&
      isValidDateTime(draft.replacementEnd) &&
      new Date(draft.replacementStart).getTime() >=
        new Date(draft.replacementEnd).getTime()
    ) {
      errors.replacementEnd = tx(locale, "error.periodOrder");
    }
  }

  if (subtype === "travel_agency_transfer") {
    if (!hasText(draft.groupCode)) {
      setRequiredError(errors, "groupCode", "field.groupCode", locale);
    }
    if (!hasText(draft.itineraryLink)) {
      setRequiredError(errors, "itineraryLink", "field.itineraryLink", locale);
    } else if (!isValidUrl(draft.itineraryLink)) {
      errors.itineraryLink = tx(locale, "error.url", {
        label: tx(locale, "field.itineraryLink"),
      });
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
      errors.groupSize = tx(locale, "error.positiveInteger", {
        label: tx(locale, "field.groupSize"),
      });
    }
  }

  if (hasText(draft.luggageCount)) {
    const luggageCount = parseInteger(draft.luggageCount);
    if (luggageCount == null) {
      errors.luggageCount = tx(locale, "error.nonNegativeInteger", {
        label: tx(locale, "field.luggageCount"),
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
  locale?: Locale;
}): boolean {
  const { entry, draft, eligibilityVerificationId, locale = DEFAULT_LOCALE } =
    params;
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
