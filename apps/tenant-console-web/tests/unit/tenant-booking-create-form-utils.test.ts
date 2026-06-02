import { describe, expect, it } from "vitest";
import type { TenantPassengerRecord } from "@drts/contracts";
import {
  buildTenantBookingCreateCommand,
  formatDateTimeLocalInputValue,
  getDefaultDateTimeLocalValue,
  getBlockingTenantBookingDraftErrors,
  getTenantBookingFieldErrors,
  isMissingRequiredBookingFields,
  isReadyForTenantBookingPolicyPreview,
  type TenantBookingDraftValues,
} from "../../app/bookings/new/tenant-booking-create-form-utils";

const baseDraft: TenantBookingDraftValues = {
  businessDispatchSubtype: "enterprise_dispatch",
  selectedPassengerId: "passenger-1",
  pickupAddressId: "address-1",
  dropoffAddressId: "address-2",
  pickupAddress: "台北市信義區松仁路 100 號",
  pickupLat: "25.0338",
  pickupLng: "121.5645",
  dropoffAddress: "桃園機場 第二航廈",
  dropoffLat: "25.0777",
  dropoffLng: "121.2328",
  reservationWindowStart: "2026-05-15T09:30",
  reservationWindowEnd: "2026-05-15T10:00",
  passengerName: "林士群",
  passengerPhone: "0912345678",
  costCenter: "CC-FIN-04",
  benefitReference: "PRJ-2026-Q2-AUDIT",
  vehiclePreference: "Sedan",
  direction: "",
  flightNo: "",
  terminal: "",
  luggageCount: "2",
  notes: "Quarterly audit trip",
  bookedByName: "王小美",
  bookedByEmail: "may@example.com",
  onsiteContactName: "張先生",
  onsiteContactPhone: "0987654321",
  estimatedAmount: "1580",
  signoffRequired: false,
  expenseProofRequired: false,
};

const passenger: TenantPassengerRecord = {
  passengerId: "passenger-1",
  tenantId: "tenant-demo-001",
  fullName: "林士群",
  employeeNo: "Y2103",
  departmentName: "Finance",
  mobile: "0912345678",
  email: "lin@example.com",
  roles: ["employee"],
  qualityIssues: [],
  activeFlag: true,
  metadata: {},
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

function formatExpectedLocalValue(value: Date) {
  const pad = (segment: number) => String(segment).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

describe("tenant booking create form utils", () => {
  it("keeps estimated spend out of the create-booking command", () => {
    const command = buildTenantBookingCreateCommand({
      draft: baseDraft,
      passengers: [passenger],
    });

    expect(command).not.toHaveProperty("quotedFare");
    expect(command.costCenter).toBe("CC-FIN-04");
    expect(command.bookedBy).toEqual({
      name: "王小美",
      email: "may@example.com",
    });
  });

  it("reports blocking validation errors for timing, paired fields, and spend", () => {
    const errors = getBlockingTenantBookingDraftErrors({
      ...baseDraft,
      businessDispatchSubtype: "credit_card_airport_transfer",
      direction: "pickup",
      flightNo: "",
      reservationWindowEnd: "2026-05-15T09:00",
      bookedByEmail: "",
      estimatedAmount: "-1",
      luggageCount: "2.5",
    });

    expect(errors).toContain(
      "Reservation window end must be after the reservation window start.",
    );
    expect(errors).toContain(
      "Flight number is required for airport pickup bookings.",
    );
    expect(errors).toContain(
      "Provide both booked-by name and email, or leave both blank.",
    );
    expect(errors).toContain(
      "Estimated spend must be a valid non-negative amount.",
    );
    expect(errors).toContain(
      "Luggage count must be a whole number of 0 or more.",
    );
  });

  it("maps field-level errors for inline validation", () => {
    const fieldErrors = getTenantBookingFieldErrors(
      {
        ...baseDraft,
        passengerPhone: "",
        costCenter: "",
        bookedByEmail: "",
      },
      {
        includeRequired: true,
        requireCostCenter: true,
      },
    );

    expect(fieldErrors.passengerPhone).toBe("Passenger phone is required.");
    expect(fieldErrors.costCenter).toBe("Cost center is required.");
    expect(fieldErrors.bookedByName).toBe(
      "Provide both booked-by name and email, or leave both blank.",
    );
    expect(fieldErrors.bookedByEmail).toBe(
      "Provide both booked-by name and email, or leave both blank.",
    );
  });

  it("separates missing required fields from preview readiness", () => {
    expect(isMissingRequiredBookingFields(baseDraft, true)).toBe(false);
    expect(isReadyForTenantBookingPolicyPreview(baseDraft)).toBe(true);

    expect(
      isReadyForTenantBookingPolicyPreview({
        ...baseDraft,
        reservationWindowEnd: "not-a-date",
      }),
    ).toBe(false);

    expect(
      isMissingRequiredBookingFields(
        {
          ...baseDraft,
          costCenter: "",
        },
        true,
      ),
    ).toBe(true);
  });

  it("formats datetime-local defaults without UTC slicing drift", () => {
    const now = new Date("2026-05-15T01:02:33.000Z");
    const expectedNow = formatExpectedLocalValue(now);
    const expectedOffset = new Date(now.getTime());
    expectedOffset.setMinutes(expectedOffset.getMinutes() + 30);
    expectedOffset.setSeconds(0, 0);

    expect(formatDateTimeLocalInputValue(now)).toBe(expectedNow);
    expect(getDefaultDateTimeLocalValue(30, now)).toBe(
      formatExpectedLocalValue(expectedOffset),
    );
  });
});
