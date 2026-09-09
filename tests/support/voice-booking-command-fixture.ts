import { randomUUID } from "node:crypto";
import type {
  BookingQualification,
  BookingRequirements,
} from "@drts/contracts";
import { voiceSnapshotHash } from "../../apps/api/src/modules/voice-booking/voice-confirmation.service";
import type { CommitVoiceBooking } from "../../apps/api/src/modules/voice-booking/voice-booking-command.service";

export function voiceCommandFixture() {
  const now = new Date().toISOString();
  const expiry = new Date(Date.now() + 120_000).toISOString();
  const scopeId = randomUUID();
  const callId = randomUUID();
  const checkpointId = randomUUID();
  const playbackId = randomUUID();
  const place = (address: string) => ({
    selectedCandidateId: randomUUID(),
    resolutionVersion: "v1",
    validUntil: expiry,
    address: {
      address,
      normalizedAddress: address,
      lat: 25.03,
      lng: 121.56,
      coordinateSource: "provider_candidate" as const,
    },
  });
  const snapshot: {
    bookingRequirements: BookingRequirements;
    bookingQualification: BookingQualification;
  } = {
    bookingRequirements: {
      passengerCount: 2,
      luggageCount: 1,
      luggageSize: "standard",
      requiredCapabilities: [],
      bookerContact: { name: "Booker", phone: "0912345678" },
      passengerContact: { name: "Passenger", phone: "0987654321" },
      driverContactRole: "passenger",
      policyVersion: "voice-v1:1:policy-v1:product-v1",
      validationReference: randomUUID(),
    },
    bookingQualification: {
      resourceScopeId: scopeId,
      scopeVersion: 1,
      runtimeProfileCode: "ordinary_taxi",
      serviceProductCode: "taxi_realtime",
      timingMode: "on_demand",
      timeZone: "Asia/Taipei",
      requestedAt: now,
      validatedAt: now,
      validUntil: expiry,
      pickup: place("台北車站"),
      dropoff: place("松山機場"),
      serviceArea: {
        decision: "serviceable",
        serviceProductType: "taxi_realtime",
        evaluatedAt: now,
        stops: [
          {
            decision: "serviceable",
          } as BookingQualification["serviceArea"]["stops"][number],
        ],
        serviceAreaCodes: [],
        geometryVersionRefs: [],
        reasonCodes: [],
        reasonMessages: [],
      },
    },
  };
  const request: CommitVoiceBooking = {
    voiceSessionId: randomUUID(),
    intentId: randomUUID(),
    confirmationId: randomUUID(),
    snapshotHash: voiceSnapshotHash(snapshot),
    sessionVersion: 1,
    draftVersion: 1,
    inputEpoch: 0,
    leaseEpoch: 1,
    controlCutoff: { mediaEpoch: 0, controlSequence: 1 },
  };
  const authority = {
    brandId: "test-brand",
    resourceScopeId: scopeId,
    providerAccountId: "test-provider",
    actorId: "voice-principal",
    leaseEpoch: 1,
  };
  return {
    now,
    expiry,
    callId,
    checkpointId,
    playbackId,
    scopeId,
    snapshot,
    request,
    authority,
  };
}
