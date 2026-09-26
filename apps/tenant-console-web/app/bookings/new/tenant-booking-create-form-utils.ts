import type {
  BusinessDispatchSubtype,
  CreateTenantBookingCommand,
  TenantPassengerRecord,
} from "@drts/contracts";

export interface TenantBookingDraftValues {
  businessDispatchSubtype: BusinessDispatchSubtype;
  selectedPassengerId: string;
  pickupAddressId: string;
  dropoffAddressId: string;
  pickupAddress: string;
  pickupLat: string;
  pickupLng: string;
  dropoffAddress: string;
  dropoffLat: string;
  dropoffLng: string;
  reservationWindowStart: string;
  reservationWindowEnd: string;
  passengerName: string;
  passengerPhone: string;
  costCenter: string;
  benefitReference: string;
  vehiclePreference: string;
  direction: "" | "pickup" | "dropoff";
  flightNo: string;
  terminal: string;
  luggageCount: string;
  notes: string;
  bookedByName: string;
  bookedByEmail: string;
  onsiteContactName: string;
  onsiteContactPhone: string;
  estimatedAmount: string;
  signoffRequired: boolean;
  expenseProofRequired: boolean;
}

export type TenantBookingFieldErrors = Partial<
  Record<keyof TenantBookingDraftValues, string>
>;

export type TenantBookingValidationMessages = {
  reservationWindowStartRequired: string;
  reservationWindowEndRequired: string;
  passengerNameRequired: string;
  passengerPhoneRequired: string;
  pickupAddressRequired: string;
  dropoffAddressRequired: string;
  costCenterRequired: string;
  reservationWindowInvalid: string;
  reservationWindowOrder: string;
  flightNoRequired: string;
  bookedByPairRequired: string;
  onsiteContactPairRequired: string;
  estimatedAmountInvalid: string;
  luggageCountInvalid: string;
  pickupLatInvalid: string;
  pickupLngInvalid: string;
  dropoffLatInvalid: string;
  dropoffLngInvalid: string;
};

export const DEFAULT_TENANT_BOOKING_VALIDATION_MESSAGES: TenantBookingValidationMessages =
  {
    reservationWindowStartRequired: "Reservation window start is required.",
    reservationWindowEndRequired: "Reservation window end is required.",
    passengerNameRequired: "Passenger name is required.",
    passengerPhoneRequired: "Passenger phone is required.",
    pickupAddressRequired: "Pickup address is required.",
    dropoffAddressRequired: "Drop-off address is required.",
    costCenterRequired: "Cost center is required.",
    reservationWindowInvalid:
      "Reservation window start and end must be valid date-time values.",
    reservationWindowOrder:
      "Reservation window end must be after the reservation window start.",
    flightNoRequired: "Flight number is required for airport pickup bookings.",
    bookedByPairRequired:
      "Provide both booked-by name and email, or leave both blank.",
    onsiteContactPairRequired:
      "Provide both onsite contact name and phone, or leave both blank.",
    estimatedAmountInvalid:
      "Estimated spend must be a valid non-negative amount.",
    luggageCountInvalid: "Luggage count must be a whole number of 0 or more.",
    pickupLatInvalid: "Pickup latitude must be a valid number when provided.",
    pickupLngInvalid: "Pickup longitude must be a valid number when provided.",
    dropoffLatInvalid:
      "Drop-off latitude must be a valid number when provided.",
    dropoffLngInvalid:
      "Drop-off longitude must be a valid number when provided.",
  };

function hasText(value: string) {
  return value.trim().length > 0;
}

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

export function getDefaultDateTimeLocalValue(
  offsetMinutes: number,
  now = new Date(),
) {
  const next = new Date(now.getTime());
  next.setMinutes(next.getMinutes() + offsetMinutes);
  next.setSeconds(0, 0);
  return formatDateTimeLocalInputValue(next);
}

function parseOptionalFloat(value: string) {
  if (!hasText(value)) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalInteger(value: string) {
  if (!hasText(value)) {
    return null;
  }

  if (!/^-?\d+$/.test(value.trim())) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidDateTime(value: string) {
  return Number.isFinite(new Date(value).getTime());
}

export function parseAmountMajor(value: string): number | null {
  if (!hasText(value)) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

export function isMissingRequiredBookingFields(
  draft: TenantBookingDraftValues,
  requireCostCenter: boolean,
) {
  return (
    !draft.reservationWindowStart ||
    !draft.reservationWindowEnd ||
    !hasText(draft.passengerName) ||
    !hasText(draft.passengerPhone) ||
    !hasText(draft.pickupAddress) ||
    !hasText(draft.dropoffAddress) ||
    (requireCostCenter && !hasText(draft.costCenter))
  );
}

export function isReadyForTenantBookingPolicyPreview(
  draft: TenantBookingDraftValues,
) {
  if (isMissingRequiredBookingFields(draft, false)) {
    return false;
  }

  if (
    !isValidDateTime(draft.reservationWindowStart) ||
    !isValidDateTime(draft.reservationWindowEnd)
  ) {
    return false;
  }

  if (
    new Date(draft.reservationWindowStart).getTime() >=
    new Date(draft.reservationWindowEnd).getTime()
  ) {
    return false;
  }

  return (
    !hasText(draft.estimatedAmount) ||
    parseAmountMajor(draft.estimatedAmount) !== null
  );
}

export function getBlockingTenantBookingDraftErrors(
  draft: TenantBookingDraftValues,
  options: {
    includeRequired?: boolean;
    requireCostCenter?: boolean;
    messages?: Partial<TenantBookingValidationMessages>;
  } = {},
) {
  const errors = Object.values(
    getTenantBookingFieldErrors(draft, options),
  ).filter((value): value is string => Boolean(value));
  return Array.from(new Set(errors));
}

export function getTenantBookingFieldErrors(
  draft: TenantBookingDraftValues,
  options: {
    includeRequired?: boolean;
    requireCostCenter?: boolean;
    messages?: Partial<TenantBookingValidationMessages>;
  } = {},
): TenantBookingFieldErrors {
  const errors: TenantBookingFieldErrors = {};
  const {
    includeRequired = false,
    requireCostCenter = false,
    messages: customMessages,
  } = options;
  const messages = {
    ...DEFAULT_TENANT_BOOKING_VALIDATION_MESSAGES,
    ...customMessages,
  };

  if (includeRequired) {
    if (!hasText(draft.reservationWindowStart)) {
      errors.reservationWindowStart = messages.reservationWindowStartRequired;
    }
    if (!hasText(draft.reservationWindowEnd)) {
      errors.reservationWindowEnd = messages.reservationWindowEndRequired;
    }
    if (!hasText(draft.passengerName)) {
      errors.passengerName = messages.passengerNameRequired;
    }
    if (!hasText(draft.passengerPhone)) {
      errors.passengerPhone = messages.passengerPhoneRequired;
    }
    if (!hasText(draft.pickupAddress)) {
      errors.pickupAddress = messages.pickupAddressRequired;
    }
    if (!hasText(draft.dropoffAddress)) {
      errors.dropoffAddress = messages.dropoffAddressRequired;
    }
    if (requireCostCenter && !hasText(draft.costCenter)) {
      errors.costCenter = messages.costCenterRequired;
    }
  }

  if (
    hasText(draft.reservationWindowStart) &&
    hasText(draft.reservationWindowEnd)
  ) {
    if (
      !isValidDateTime(draft.reservationWindowStart) ||
      !isValidDateTime(draft.reservationWindowEnd)
    ) {
      errors.reservationWindowStart = messages.reservationWindowInvalid;
      errors.reservationWindowEnd = messages.reservationWindowInvalid;
    } else if (
      new Date(draft.reservationWindowStart).getTime() >=
      new Date(draft.reservationWindowEnd).getTime()
    ) {
      errors.reservationWindowEnd = messages.reservationWindowOrder;
    }
  }

  if (
    draft.businessDispatchSubtype === "credit_card_airport_transfer" &&
    draft.direction === "pickup" &&
    !hasText(draft.flightNo)
  ) {
    errors.flightNo = messages.flightNoRequired;
  }

  if (
    (hasText(draft.bookedByName) && !hasText(draft.bookedByEmail)) ||
    (!hasText(draft.bookedByName) && hasText(draft.bookedByEmail))
  ) {
    errors.bookedByName = messages.bookedByPairRequired;
    errors.bookedByEmail = messages.bookedByPairRequired;
  }

  if (
    (hasText(draft.onsiteContactName) && !hasText(draft.onsiteContactPhone)) ||
    (!hasText(draft.onsiteContactName) && hasText(draft.onsiteContactPhone))
  ) {
    errors.onsiteContactName = messages.onsiteContactPairRequired;
    errors.onsiteContactPhone = messages.onsiteContactPairRequired;
  }

  if (
    hasText(draft.estimatedAmount) &&
    parseAmountMajor(draft.estimatedAmount) === null
  ) {
    errors.estimatedAmount = messages.estimatedAmountInvalid;
  }

  if (hasText(draft.luggageCount)) {
    const luggageCount = parseOptionalInteger(draft.luggageCount);
    if (luggageCount == null || luggageCount < 0) {
      errors.luggageCount = messages.luggageCountInvalid;
    }
  }

  const coordinates: Array<
    [
      keyof TenantBookingFieldErrors,
      keyof TenantBookingValidationMessages,
      string,
    ]
  > = [
    ["pickupLat", "pickupLatInvalid", draft.pickupLat],
    ["pickupLng", "pickupLngInvalid", draft.pickupLng],
    ["dropoffLat", "dropoffLatInvalid", draft.dropoffLat],
    ["dropoffLng", "dropoffLngInvalid", draft.dropoffLng],
  ];
  for (const [field, messageKey, value] of coordinates) {
    if (hasText(value) && parseOptionalFloat(value) == null) {
      errors[field] = messages[messageKey];
    }
  }

  return errors;
}

export function buildTenantBookingCreateCommand(params: {
  draft: TenantBookingDraftValues;
  passengers: TenantPassengerRecord[];
}): CreateTenantBookingCommand {
  const { draft, passengers } = params;
  const passengerRoles =
    passengers.find((row) => row.passengerId === draft.selectedPassengerId)
      ?.roles ?? undefined;
  const luggageCount = parseOptionalInteger(draft.luggageCount);

  return {
    businessDispatchSubtype: draft.businessDispatchSubtype,
    ...(draft.selectedPassengerId
      ? { passengerId: draft.selectedPassengerId }
      : {}),
    ...(draft.pickupAddressId
      ? { pickupAddressId: draft.pickupAddressId }
      : {}),
    ...(draft.dropoffAddressId
      ? { dropoffAddressId: draft.dropoffAddressId }
      : {}),
    pickup: {
      address: draft.pickupAddress.trim(),
      ...(draft.pickupAddressId ? { addressId: draft.pickupAddressId } : {}),
      lat: parseOptionalFloat(draft.pickupLat),
      lng: parseOptionalFloat(draft.pickupLng),
    },
    dropoff: {
      address: draft.dropoffAddress.trim(),
      ...(draft.dropoffAddressId ? { addressId: draft.dropoffAddressId } : {}),
      lat: parseOptionalFloat(draft.dropoffLat),
      lng: parseOptionalFloat(draft.dropoffLng),
    },
    reservationWindowStart: new Date(
      draft.reservationWindowStart,
    ).toISOString(),
    reservationWindowEnd: new Date(draft.reservationWindowEnd).toISOString(),
    passenger: {
      name: draft.passengerName.trim(),
      phone: draft.passengerPhone.trim(),
      ...(draft.selectedPassengerId
        ? { passengerId: draft.selectedPassengerId }
        : {}),
      ...(passengerRoles ? { roles: passengerRoles } : {}),
    },
    signoffRequired: draft.signoffRequired,
    expenseProofRequired: draft.expenseProofRequired,
    ...(draft.costCenter.trim() ? { costCenter: draft.costCenter.trim() } : {}),
    ...(draft.benefitReference.trim()
      ? { benefitReference: draft.benefitReference.trim() }
      : {}),
    ...(draft.vehiclePreference.trim()
      ? { vehiclePreference: draft.vehiclePreference.trim() }
      : {}),
    ...(draft.direction ? { direction: draft.direction } : {}),
    ...(draft.flightNo.trim() ? { flightNo: draft.flightNo.trim() } : {}),
    ...(draft.terminal.trim() ? { terminal: draft.terminal.trim() } : {}),
    ...(luggageCount == null ? {} : { luggageCount }),
    ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
    ...(draft.bookedByName.trim() && draft.bookedByEmail.trim()
      ? {
          bookedBy: {
            name: draft.bookedByName.trim(),
            email: draft.bookedByEmail.trim(),
          },
        }
      : {}),
    ...(draft.onsiteContactName.trim() && draft.onsiteContactPhone.trim()
      ? {
          onsiteContact: {
            name: draft.onsiteContactName.trim(),
            phone: draft.onsiteContactPhone.trim(),
          },
        }
      : {}),
  };
}
