import type { CallCenterMapFallbackReview } from "@drts/contracts";
import type {
  AddressProviderState,
  AddressSubmitGateState,
} from "@drts/ui-web";

import type { Translator } from "./translations";

function isApiClientError(
  error: unknown,
): error is { code: string; statusCode: number; rawBody: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { code?: unknown }).code === "string" &&
    typeof (error as { statusCode?: unknown }).statusCode === "number" &&
    typeof (error as { rawBody?: unknown }).rawBody === "string"
  );
}

export function buildCallCenterMapFallbackReview(params: {
  mapGate: AddressSubmitGateState;
  providerState: AddressProviderState | null | undefined;
}): CallCenterMapFallbackReview | null {
  const { mapGate, providerState } = params;
  if (
    mapGate.code !== "dispatch_manual_review_required" ||
    !providerState ||
    providerState.available
  ) {
    return null;
  }

  return {
    reasonCode: "map_provider_unavailable",
    providerAvailable: providerState.available,
    providerDegraded: providerState.degraded,
    providerReasonCode: providerState.reasonCode ?? null,
  };
}

export function formatConciergeApiError(
  error: unknown,
  t: Translator,
  fallbackKey: string,
): string {
  if (isApiClientError(error)) {
    if (error.code === "DISPATCH_REQUIRES_MANUAL_REVIEW") {
      return t("booking.error.manualReviewRequired");
    }
    if (
      error.code === "PICKUP_NOT_ALLOWED" ||
      error.code === "SERVICE_AREA_NOT_SERVICEABLE"
    ) {
      return t("booking.error.outsideServiceArea");
    }
    return t(fallbackKey);
  }

  return error instanceof Error ? error.message : t(fallbackKey);
}
