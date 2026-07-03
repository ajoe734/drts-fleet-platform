import type {
  AddressPayload,
  ServiceAreaEvaluationDecision,
  ServiceAreaEvaluationResult,
  ServiceProductType,
} from "@drts/contracts";
import {
  hasAddressCoordinateProvenance,
  hasAddressCoordinates,
} from "@drts/contracts";
import type { AddressProviderState } from "@drts/ui-web";

/**
 * Concierge assisted-entry booking reuses the callcenter order seam, so it
 * evaluates the same realtime taxi service product for serviceability.
 */
export const CONCIERGE_MAP_SERVICE_PRODUCT_TYPE: ServiceProductType =
  "taxi_realtime";

export type ConciergeServiceabilityPreviewStatus =
  | "idle"
  | "evaluating"
  | "ready"
  | "error";

/**
 * Reasons a dispatchable submit is blocked. These stay behind customer-safe
 * copy in the UI but preserve stable codes for audit and e2e assertions.
 */
export type ConciergeMapBookingBlockReason =
  | "pickup_coordinates_required"
  | "dropoff_coordinates_required"
  | "pickup_provenance_required"
  | "dropoff_provenance_required"
  | "serviceability_preview_required"
  | "serviceability_blocked";

/**
 * A submit that is allowed to proceed. `dispatch` carries a confirmed,
 * serviceable/manual-review coordinate pair; `provider_outage_manual_review`
 * is the explicit degraded fallback: the provider is unavailable, so a
 * coordinate-less text order is submitted as manual review instead of a
 * silent normal dispatch.
 */
export type ConciergeMapBookingOutcome =
  | {
      kind: "dispatch";
      decision: Exclude<ServiceAreaEvaluationDecision, "not_serviceable">;
    }
  | { kind: "provider_outage_manual_review" };

export type ConciergeMapBookingGate =
  | { canSubmit: true; outcome: ConciergeMapBookingOutcome }
  | { canSubmit: false; reason: ConciergeMapBookingBlockReason };

export interface ConciergeMapBookingGateInput {
  pickup: AddressPayload | null;
  dropoff: AddressPayload | null;
  serviceability: ServiceAreaEvaluationResult | null;
  previewStatus: ConciergeServiceabilityPreviewStatus;
  /** True when either pickup or dropoff provider health is unavailable. */
  providerOutage: boolean;
}

export function hasConciergeAddressCoordinates(
  value: AddressPayload | null | undefined,
): value is AddressPayload & { lat: number; lng: number } {
  return hasAddressCoordinates(value);
}

export function hasConciergeCoordinateProvenance(
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

/**
 * Derive whether the map provider is currently unavailable across the pickup
 * and dropoff pickers. A single unavailable leg is enough to treat the booking
 * as degraded so the outage fallback path stays visible.
 */
export function isConciergeProviderOutage(
  ...states: Array<AddressProviderState | null | undefined>
): boolean {
  return states.some((state) => state != null && state.available === false);
}

/**
 * Pure booking-gate reducer. Provider outage dominates: with no usable
 * coordinates it routes to an explicit manual-review fallback rather than
 * blocking or silently dispatching. Otherwise both stops must carry
 * coordinates + provenance and pass a serviceability preview before dispatch.
 */
export function getConciergeMapBookingGate({
  pickup,
  dropoff,
  serviceability,
  previewStatus,
  providerOutage,
}: ConciergeMapBookingGateInput): ConciergeMapBookingGate {
  const pickupReady =
    hasConciergeAddressCoordinates(pickup) &&
    hasConciergeCoordinateProvenance(pickup);
  const dropoffReady =
    hasConciergeAddressCoordinates(dropoff) &&
    hasConciergeCoordinateProvenance(dropoff);

  // Degraded provider without a confirmed coordinate pair: submit as manual
  // review, never a silent normal order.
  if (providerOutage && !(pickupReady && dropoffReady)) {
    return {
      canSubmit: true,
      outcome: { kind: "provider_outage_manual_review" },
    };
  }

  if (!hasConciergeAddressCoordinates(pickup)) {
    return { canSubmit: false, reason: "pickup_coordinates_required" };
  }
  if (!hasConciergeAddressCoordinates(dropoff)) {
    return { canSubmit: false, reason: "dropoff_coordinates_required" };
  }
  if (!hasConciergeCoordinateProvenance(pickup)) {
    return { canSubmit: false, reason: "pickup_provenance_required" };
  }
  if (!hasConciergeCoordinateProvenance(dropoff)) {
    return { canSubmit: false, reason: "dropoff_provenance_required" };
  }
  // A preview that errored mid-flight (provider dropped) is a degraded state,
  // not a dispatchable one: fall back to manual review instead of blocking.
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

export type ConciergeMapBookingBannerCode =
  | ConciergeMapBookingBlockReason
  | "serviceable"
  | "manual_review"
  | "provider_outage_manual_review";

/**
 * Collapse a gate result into a single stable banner code. The page maps this
 * code to customer-safe copy + tone; e2e asserts it via a data attribute.
 */
export function getConciergeMapBookingBannerCode(
  gate: ConciergeMapBookingGate,
): ConciergeMapBookingBannerCode {
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

/**
 * Build the order address for a stop. When the provider is degraded and no pin
 * was confirmed, submit the text address with no coordinate source so the
 * backend coerces it to `legacy_text` and routes the order to spatial manual
 * review (auto-dispatch blocked, audit recorded).
 */
export function buildConciergeOrderAddress(
  pin: AddressPayload | null,
  fallbackAddress: string,
): AddressPayload {
  const address = fallbackAddress.trim();
  if (pin && hasConciergeAddressCoordinates(pin)) {
    return {
      ...pin,
      address: pin.address?.trim() || address || pin.address,
    };
  }
  return { address };
}
