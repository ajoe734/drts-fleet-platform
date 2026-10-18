import type { PassengerBookingFareDisclosure } from "@drts/contracts";

export const bookedQuote: PassengerBookingFareDisclosure = {
  fareSnapshotId: "ACCEPTED-BOOKING-QUOTE",
  fareVersion: "ACCEPTED-TARIFF",
  estimatedMin: 85,
  estimatedMax: 125,
  route: {
    provider: "external-fixture",
    distanceMeters: 4200,
    durationSeconds: 805,
    encodedPolyline: null,
    generatedAt: "2026-10-17T01:00:00Z",
  },
  tariffSnapshot: {},
  breakdown: {},
  passengerConfirmedAt: "2026-10-17T01:01:00Z",
  createdAt: "2026-10-17T01:00:00Z",
};
