import { describe, expect, it } from "vitest";
import type { TenantAddressRecord } from "@drts/contracts";
import {
  TENANT_CONSOLE_MAP_SURFACE,
  coordinateToDraftString,
  payloadHasCoordinates,
  savedAddressToPayload,
} from "../../lib/tenant-address-map";
import {
  buildTenantBookingCreateCommand,
  type TenantBookingDraftValues,
} from "../../app/bookings/new/tenant-booking-create-form-utils";

function makeAddress(
  overrides: Partial<TenantAddressRecord> = {},
): TenantAddressRecord {
  return {
    addressId: "addr-1",
    tenantId: "tenant-1",
    ownerPassengerId: null,
    addressName: "HQ",
    addressText: "台北市信義區松仁路 100 號",
    lat: 25.0338,
    lng: 121.5645,
    tags: [],
    activeFlag: true,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("savedAddressToPayload", () => {
  it("seeds a confirmed saved pin when the record has coordinates", () => {
    const payload = savedAddressToPayload(makeAddress());
    expect(payload).toMatchObject({
      addressId: "addr-1",
      address: "台北市信義區松仁路 100 號",
      lat: 25.0338,
      lng: 121.5645,
      coordinateSource: "saved_address",
      surface: TENANT_CONSOLE_MAP_SURFACE,
    });
    expect(payloadHasCoordinates(payload)).toBe(true);
  });

  it("yields an unpinned text-only payload when coordinates are missing", () => {
    const payload = savedAddressToPayload(
      makeAddress({ lat: null, lng: null }),
    );
    expect(payload.coordinateSource).toBeNull();
    expect(payloadHasCoordinates(payload)).toBe(false);
  });

  it("rejects out-of-range coordinates as uncoordinated", () => {
    const payload = savedAddressToPayload(makeAddress({ lat: 200, lng: 400 }));
    expect(payloadHasCoordinates(payload)).toBe(false);
  });
});

describe("coordinateToDraftString", () => {
  it("stringifies finite coordinates and blanks the rest", () => {
    expect(coordinateToDraftString(25.0338)).toBe("25.0338");
    expect(coordinateToDraftString(null)).toBe("");
    expect(coordinateToDraftString(undefined)).toBe("");
    expect(coordinateToDraftString(Number.NaN)).toBe("");
  });
});

describe("picker payload -> booking command consistency", () => {
  it("keeps address text and coordinates paired in the submitted payload", () => {
    const pickup = savedAddressToPayload(makeAddress());
    const dropoff = savedAddressToPayload(
      makeAddress({
        addressId: "addr-2",
        addressText: "桃園國際機場第一航廈",
        lat: 25.0797,
        lng: 121.2342,
      }),
    );

    const draft: TenantBookingDraftValues = {
      businessDispatchSubtype: "enterprise_dispatch",
      selectedPassengerId: "",
      pickupAddressId: pickup.addressId ?? "",
      dropoffAddressId: dropoff.addressId ?? "",
      pickupAddress: pickup.address,
      pickupLat: coordinateToDraftString(pickup.lat),
      pickupLng: coordinateToDraftString(pickup.lng),
      dropoffAddress: dropoff.address,
      dropoffLat: coordinateToDraftString(dropoff.lat),
      dropoffLng: coordinateToDraftString(dropoff.lng),
      reservationWindowStart: "2026-07-10T09:00",
      reservationWindowEnd: "2026-07-10T10:00",
      passengerName: "王小明",
      passengerPhone: "0912345678",
      costCenter: "",
      benefitReference: "",
      vehiclePreference: "",
      direction: "",
      flightNo: "",
      terminal: "",
      luggageCount: "",
      notes: "",
      bookedByName: "",
      bookedByEmail: "",
      onsiteContactName: "",
      onsiteContactPhone: "",
      estimatedAmount: "",
      signoffRequired: false,
      expenseProofRequired: false,
    };

    const command = buildTenantBookingCreateCommand({ draft, passengers: [] });

    expect(command.pickup).toMatchObject({
      address: "台北市信義區松仁路 100 號",
      addressId: "addr-1",
      lat: 25.0338,
      lng: 121.5645,
    });
    expect(command.dropoff).toMatchObject({
      address: "桃園國際機場第一航廈",
      addressId: "addr-2",
      lat: 25.0797,
      lng: 121.2342,
    });
  });
});
