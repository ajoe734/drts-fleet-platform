import type {
  AddressPayload,
  CreateCallCenterOrderCommand,
  ServiceAreaEvaluationDecision,
  ServiceAreaEvaluationResult,
  ServiceProductType,
} from "@drts/contracts";
import {
  hasAddressCoordinateProvenance,
  hasAddressCoordinates,
} from "@drts/contracts";

export const CALLCENTER_MAP_SERVICE_PRODUCT_TYPE: ServiceProductType =
  "taxi_realtime";

export type CallcenterServiceabilityPreviewStatus =
  | "idle"
  | "evaluating"
  | "ready"
  | "error";

export type CallcenterMapBookingBlockReason =
  | "pickup_coordinates_required"
  | "dropoff_coordinates_required"
  | "pickup_provenance_required"
  | "dropoff_provenance_required"
  | "serviceability_preview_required"
  | "serviceability_preview_unavailable"
  | "serviceability_blocked";

export type CallcenterMapBookingGate =
  | {
      canSubmit: true;
      decision: Exclude<ServiceAreaEvaluationDecision, "not_serviceable">;
    }
  | {
      canSubmit: false;
      reason: CallcenterMapBookingBlockReason;
    };

export interface CallcenterMapBookingGateInput {
  pickup: AddressPayload | null;
  dropoff: AddressPayload | null;
  serviceability: ServiceAreaEvaluationResult | null;
  previewStatus: CallcenterServiceabilityPreviewStatus;
}

export interface BuildCallcenterMapOrderCommandInput {
  callId: string;
  agentId: string;
  recordingId?: string | null;
  pickup: AddressPayload;
  dropoff: AddressPayload;
  passengerName: string;
  passengerPhone: string;
  fallbackPassengerPhone: string;
  notes?: string;
}

export function hasCallcenterAddressCoordinates(
  value: AddressPayload | null | undefined,
): value is AddressPayload & { lat: number; lng: number } {
  return hasAddressCoordinates(value);
}

export function hasCallcenterCoordinateProvenance(
  value: AddressPayload | null | undefined,
) {
  if (hasAddressCoordinateProvenance(value)) {
    return true;
  }
  if (!hasAddressCoordinates(value)) {
    return false;
  }
  return Boolean(
    value?.coordinateProvenance?.coordinateSource ||
    value?.coordinateProvenance?.geocodeProvider ||
    value?.coordinateProvenance?.providerCandidateId ||
    value?.coordinateProvenance?.placeId ||
    value?.coordinateProvenance?.pinnedByActorId ||
    value?.coordinateProvenance?.pinnedAt,
  );
}

export function getCallcenterMapBookingGate({
  pickup,
  dropoff,
  serviceability,
  previewStatus,
}: CallcenterMapBookingGateInput): CallcenterMapBookingGate {
  if (!hasCallcenterAddressCoordinates(pickup)) {
    return { canSubmit: false, reason: "pickup_coordinates_required" };
  }
  if (!hasCallcenterAddressCoordinates(dropoff)) {
    return { canSubmit: false, reason: "dropoff_coordinates_required" };
  }
  if (!hasCallcenterCoordinateProvenance(pickup)) {
    return { canSubmit: false, reason: "pickup_provenance_required" };
  }
  if (!hasCallcenterCoordinateProvenance(dropoff)) {
    return { canSubmit: false, reason: "dropoff_provenance_required" };
  }
  if (previewStatus === "error") {
    return { canSubmit: false, reason: "serviceability_preview_unavailable" };
  }
  if (previewStatus !== "ready" || !serviceability) {
    return { canSubmit: false, reason: "serviceability_preview_required" };
  }
  if (serviceability.decision === "not_serviceable") {
    return { canSubmit: false, reason: "serviceability_blocked" };
  }
  return { canSubmit: true, decision: serviceability.decision };
}

export function buildCallcenterMapOrderCommand({
  callId,
  agentId,
  recordingId,
  pickup,
  dropoff,
  passengerName,
  passengerPhone,
  fallbackPassengerPhone,
  notes,
}: BuildCallcenterMapOrderCommandInput): CreateCallCenterOrderCommand {
  const command: CreateCallCenterOrderCommand = {
    callId,
    agentId,
    pickup,
    dropoff,
    passenger: {
      name: passengerName.trim(),
      phone: passengerPhone.trim() || fallbackPassengerPhone,
    },
  };

  if (recordingId !== undefined) {
    command.recordingId = recordingId;
  }

  const trimmedNotes = notes?.trim();
  if (trimmedNotes) {
    command.notes = trimmedNotes;
  }

  return command;
}
