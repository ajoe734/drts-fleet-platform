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
) {
  const errors = Object.values(getTenantBookingFieldErrors(draft)).filter(
    (value): value is string => Boolean(value),
  );
  return Array.from(new Set(errors));
}

export function getTenantBookingFieldErrors(
  draft: TenantBookingDraftValues,
  options: {
    includeRequired?: boolean;
    requireCostCenter?: boolean;
  } = {},
): TenantBookingFieldErrors {
  const errors: TenantBookingFieldErrors = {};
  const { includeRequired = false, requireCostCenter = false } = options;

  if (includeRequired) {
    if (!hasText(draft.reservationWindowStart)) {
      errors.reservationWindowStart = "Reservation window start is required.";
    }
    if (!hasText(draft.reservationWindowEnd)) {
      errors.reservationWindowEnd = "Reservation window end is required.";
    }
    if (!hasText(draft.passengerName)) {
      errors.passengerName = "Passenger name is required.";
    }
    if (!hasText(draft.passengerPhone)) {
      errors.passengerPhone = "Passenger phone is required.";
    }
    if (!hasText(draft.pickupAddress)) {
      errors.pickupAddress = "Pickup address is required.";
    }
    if (!hasText(draft.dropoffAddress)) {
      errors.dropoffAddress = "Drop-off address is required.";
    }
    if (requireCostCenter && !hasText(draft.costCenter)) {
      errors.costCenter = "Cost center is required.";
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
      errors.reservationWindowStart =
        "Reservation window start and end must be valid date-time values.";
      errors.reservationWindowEnd =
        "Reservation window start and end must be valid date-time values.";
    } else if (
      new Date(draft.reservationWindowStart).getTime() >=
      new Date(draft.reservationWindowEnd).getTime()
    ) {
      errors.reservationWindowEnd =
        "Reservation window end must be after the reservation window start.";
    }
  }

  if (
    draft.businessDispatchSubtype === "credit_card_airport_transfer" &&
    draft.direction === "pickup" &&
    !hasText(draft.flightNo)
  ) {
    errors.flightNo = "Flight number is required for airport pickup bookings.";
  }

  if (
    (hasText(draft.bookedByName) && !hasText(draft.bookedByEmail)) ||
    (!hasText(draft.bookedByName) && hasText(draft.bookedByEmail))
  ) {
    errors.bookedByName =
      "Provide both booked-by name and email, or leave both blank.";
    errors.bookedByEmail =
      "Provide both booked-by name and email, or leave both blank.";
  }

  if (
    (hasText(draft.onsiteContactName) && !hasText(draft.onsiteContactPhone)) ||
    (!hasText(draft.onsiteContactName) && hasText(draft.onsiteContactPhone))
  ) {
    errors.onsiteContactName =
      "Provide both onsite contact name and phone, or leave both blank.";
    errors.onsiteContactPhone =
      "Provide both onsite contact name and phone, or leave both blank.";
  }

  if (
    hasText(draft.estimatedAmount) &&
    parseAmountMajor(draft.estimatedAmount) === null
  ) {
    errors.estimatedAmount =
      "Estimated spend must be a valid non-negative amount.";
  }

  if (hasText(draft.luggageCount)) {
    const luggageCount = parseOptionalInteger(draft.luggageCount);
    if (luggageCount == null || luggageCount < 0) {
      errors.luggageCount =
        "Luggage count must be a whole number of 0 or more.";
    }
  }

  const coordinates: Array<[keyof TenantBookingFieldErrors, string, string]> = [
    ["pickupLat", "Pickup latitude", draft.pickupLat],
    ["pickupLng", "Pickup longitude", draft.pickupLng],
    ["dropoffLat", "Drop-off latitude", draft.dropoffLat],
    ["dropoffLng", "Drop-off longitude", draft.dropoffLng],
  ];
  for (const [field, label, value] of coordinates) {
    if (hasText(value) && parseOptionalFloat(value) == null) {
      errors[field] = `${label} must be a valid number when provided.`;
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
