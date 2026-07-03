import type { AddressPayload, ServiceProductType } from "@drts/contracts";
import {
  hasAddressCoordinateProvenance,
  hasAddressCoordinates,
} from "@drts/contracts";
import type {
  AddressProviderState,
  ServiceAreaEvaluationDecision,
  ServiceAreaEvaluationResult,
} from "@drts/ui-web";

/**
 * Partner assisted entry shares the callcenter/concierge coordinate model and
 * evaluates the same realtime taxi service product, so reason codes stay
 * consistent across every assisted-entry surface.
 */
export const PARTNER_MAP_SERVICE_PRODUCT_TYPE: ServiceProductType =
  "taxi_realtime";

export type PartnerServiceabilityPreviewStatus =
  | "idle"
  | "evaluating"
  | "ready"
  | "error";

/** Stable reason codes, identical vocabulary to the concierge surface. */
export type PartnerMapBookingBlockReason =
  | "pickup_coordinates_required"
  | "dropoff_coordinates_required"
  | "pickup_provenance_required"
  | "dropoff_provenance_required"
  | "serviceability_preview_required"
  | "serviceability_blocked";

export type PartnerMapBookingOutcome =
  | {
      kind: "dispatch";
      decision: Exclude<ServiceAreaEvaluationDecision, "not_serviceable">;
    }
  | { kind: "provider_outage_manual_review" };

export type PartnerMapBookingGate =
  | { canSubmit: true; outcome: PartnerMapBookingOutcome }
  | { canSubmit: false; reason: PartnerMapBookingBlockReason };

export interface PartnerMapBookingGateInput {
  pickup: AddressPayload | null;
  dropoff: AddressPayload | null;
  serviceability: ServiceAreaEvaluationResult | null;
  previewStatus: PartnerServiceabilityPreviewStatus;
  providerOutage: boolean;
}

export function hasPartnerAddressCoordinates(
  value: AddressPayload | null | undefined,
): value is AddressPayload & { lat: number; lng: number } {
  return hasAddressCoordinates(value);
}

export function hasPartnerCoordinateProvenance(
  value: AddressPayload | null | undefined,
): boolean {
  if (hasAddressCoordinateProvenance(value)) {
    return true;
  }
  if (!hasAddressCoordinates(value)) {
    return false;
  }
  return Boolean(
    value?.coordinateSource ||
    value?.coordinateProvenance?.coordinateSource ||
    value?.coordinateProvenance?.geocodeProvider ||
    value?.coordinateProvenance?.providerCandidateId ||
    value?.coordinateProvenance?.placeId ||
    value?.coordinateProvenance?.pinnedByActorId ||
    value?.coordinateProvenance?.pinnedAt,
  );
}

export function isPartnerProviderOutage(
  ...states: Array<AddressProviderState | null | undefined>
): boolean {
  return states.some((state) => state != null && state.available === false);
}

/**
 * Same gate reducer semantics as the concierge surface. Provider outage never
 * yields a silent normal order: a coordinate-less booking during outage becomes
 * an explicit manual-review path.
 */
export function getPartnerMapBookingGate({
  pickup,
  dropoff,
  serviceability,
  previewStatus,
  providerOutage,
}: PartnerMapBookingGateInput): PartnerMapBookingGate {
  const pickupReady =
    hasPartnerAddressCoordinates(pickup) &&
    hasPartnerCoordinateProvenance(pickup);
  const dropoffReady =
    hasPartnerAddressCoordinates(dropoff) &&
    hasPartnerCoordinateProvenance(dropoff);

  if (providerOutage && !(pickupReady && dropoffReady)) {
    return {
      canSubmit: true,
      outcome: { kind: "provider_outage_manual_review" },
    };
  }

  if (!hasPartnerAddressCoordinates(pickup)) {
    return { canSubmit: false, reason: "pickup_coordinates_required" };
  }
  if (!hasPartnerAddressCoordinates(dropoff)) {
    return { canSubmit: false, reason: "dropoff_coordinates_required" };
  }
  if (!hasPartnerCoordinateProvenance(pickup)) {
    return { canSubmit: false, reason: "pickup_provenance_required" };
  }
  if (!hasPartnerCoordinateProvenance(dropoff)) {
    return { canSubmit: false, reason: "dropoff_provenance_required" };
  }
  if (previewStatus === "error") {
    return {
      canSubmit: true,
      outcome: { kind: "provider_outage_manual_review" },
    };
  }
  if (previewStatus !== "ready" || !serviceability) {
    return { canSubmit: false, reason: "serviceability_preview_required" };
  }
  if (serviceability.decision === "not_serviceable") {
    return { canSubmit: false, reason: "serviceability_blocked" };
  }
  return {
    canSubmit: true,
    outcome: { kind: "dispatch", decision: serviceability.decision },
  };
}

export type PartnerMapBookingBannerCode =
  | PartnerMapBookingBlockReason
  | "serviceable"
  | "manual_review"
  | "provider_outage_manual_review";

export function getPartnerMapBookingBannerCode(
  gate: PartnerMapBookingGate,
): PartnerMapBookingBannerCode {
  if (!gate.canSubmit) {
    return gate.reason;
  }
  if (gate.outcome.kind === "provider_outage_manual_review") {
    return "provider_outage_manual_review";
  }
  return gate.outcome.decision === "manual_review"
    ? "manual_review"
    : "serviceable";
}
