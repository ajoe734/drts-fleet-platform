import type { OwnedOrderRecord } from "@drts/contracts";
import {
  applyVoiceBookingQualification,
  type QualifiedVoiceBookingSnapshot,
} from "./voice-booking-qualification";

/** Pure creation from server-confirmed data. No arrays, listeners or network. */
export function prepareVoiceOrder(input: {
  commandId: string;
  callId: string;
  intentId: string;
  resourceScopeId: string;
  confirmationId: string;
  recordingId: string;
  checkpointId: string;
  actorId: string;
  snapshotHash: string;
  snapshot: QualifiedVoiceBookingSnapshot & { pickupNotes?: string };
}) {
  const now = new Date().toISOString();
  const order: OwnedOrderRecord = {
    orderId: `voice-${input.commandId}`,
    orderNo: `VOICE-${input.commandId}`,
    orderSource: "phone", orderDomain: "owned",
    tenantId: null, partnerId: null, partnerProgramId: null,
    partnerEntrySlug: null, eligibilityVerificationId: null,
    issuerAuthorizationRef: null, passengerDisclosure: null,
    serviceBucket: "standard_taxi", dispatchSemantics: "realtime",
    businessDispatchSubtype: null, status: "ready_for_dispatch",
    pickup: input.snapshot.bookingQualification.pickup.address,
    dropoff: input.snapshot.bookingQualification.dropoff.address,
    passenger: input.snapshot.bookingRequirements.passengerContact,
    bookingId: null, bookingType: null, etaSnapshot: null,
    callId: input.callId, voiceIntentId: input.intentId, aggregateVersion: 1,
    recordingId: input.recordingId,
    reservationWindowStart: null, reservationWindowEnd: null,
    recurrenceRule: null, modifiableUntil: null, cancelableUntil: null,
    bookedBy: null, onsiteContact: null, costCenter: null,
    vehiclePreference: null, benefitReference: null, direction: null,
    flightNo: null, terminal: null, luggageCount: null,
    notes: input.snapshot.pickupNotes ?? null, fixedPrice: false,
    quotedFare: null, quotedFareSource: null, quotedFareRuleVersion: null,
    manualFareOverride: null, exceptionHold: null,
    proofRequirements: { minPhotoCount: 0, signoffRequired: false, expenseProofRequired: false },
    approvalState: "not_required", approvalRequestIds: [],
    complianceFlags: ["recording_bound"], cancelledAt: null, cancelReason: null,
    reservationHoldStatus: "none", reservationHoldId: null,
    reservationHoldExpiresAt: null, dispatchAttemptCount: 0,
    lastDispatchFailureReason: null, noSupplyEscalation: null,
    dispatchTimeout: null, createdAt: now, updatedAt: now,
  };
  return {
    ...applyVoiceBookingQualification(order, input.snapshot),
    resourceScopeId: input.resourceScopeId,
    bookingActor: { type: "voice_agent" as const, actorId: input.actorId },
    customerConfirmationId: input.confirmationId,
    confirmationSnapshotHash: input.snapshotHash,
    recordingEvidenceRef: input.checkpointId,
    commandId: input.commandId,
  };
}
