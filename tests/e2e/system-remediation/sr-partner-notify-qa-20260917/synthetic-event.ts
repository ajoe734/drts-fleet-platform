import { randomUUID } from "node:crypto";
import type {
  ConsumerNotificationOutboxRecord,
  PassengerDispatchDisclosureSnapshot,
} from "@drts/contracts";

export interface SyntheticEvent {
  createdAt?: string;
  nextAttemptAt?: string;
  eventType?: ConsumerNotificationOutboxRecord["eventType"];
  assignmentVersion?: number;
  payload?: Record<string, unknown>;
  relevanceVersion?: number;
}

// Explicit upstream fixture boundary: an assignment disclosure produced by a
// synthetic dispatcher. Persist through the real repository and migration;
// this tests downstream relevance, not driver qualification/dispatch acceptance.
export function disclosureFixture(
  orderId: string,
  assignmentVersion: number,
  now: string,
): PassengerDispatchDisclosureSnapshot {
  if (!Number.isSafeInteger(assignmentVersion) || assignmentVersion < 1)
    throw new Error("Expected positive synthetic assignment version");
  const address = {
    address: "Controlled fixture location",
    lat: 25.03,
    lng: 121.56,
    coordinateSource: "manual_pin" as const,
    geocodeConfidence: "high" as const,
    resolvedAt: now,
  };
  return {
    snapshotId: randomUUID(),
    runtimeProfileCode: "multi_taxi_direct",
    orderId,
    bookingId: null,
    dispatchJobId: `qa-${randomUUID()}`,
    assignmentId: `qa-${randomUUID()}`,
    assignmentVersion,
    vehicle: {
      vehicleId: "qa-vehicle", make: "QA", model: "Fixture", plateNo: "QA-0000",
      modelYear: 2026, doorCount: 4, color: null, profileVersion: 1,
    },
    driver: {
      driverId: "qa-driver", displayName: null, registrationMaskedDisplay: "QA***",
      registrationStatus: "verified_active", registrationEffectiveUntil: "2099-01-01T00:00:00.000Z",
      credentialVersion: 1,
    },
    rating: { displayState: "new_driver", averageRating: null, ratingCount: 0, aggregateVersion: 1 },
    eta: { minutes: 4, calculatedAt: now, locationFreshness: "fresh" },
    routeFare: {
      routeSnapshotId: randomUUID(), quoteSnapshotId: randomUUID(), orderId,
      pickup: address, dropoff: address, estimatedDistanceMeters: null,
      estimatedDurationSeconds: null, encodedPolyline: null, chargingMode: "meter_estimate",
      estimatedFareMinor: null, payableFareMinor: null, currency: "TWD",
      farePolicyId: "qa-policy", farePolicyVersion: "1", fareChangeRuleId: "qa-rule",
      fareChangeRuleVersion: "1", fareChangeRuleDisplayText: "Controlled fixture",
      passengerConfirmedAt: null, generatedAt: now,
    },
    createdAt: now,
    supersededAt: null,
  };
}
