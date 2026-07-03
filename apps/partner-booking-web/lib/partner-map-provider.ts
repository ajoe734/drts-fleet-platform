import type {
  AddressMapPickerProvider,
  ServiceAreaEvaluationResult,
} from "@drts/ui-web";
import { createMockAddressProvider } from "@drts/ui-web";

export type PartnerMapProviderMode =
  | "healthy"
  | "degraded"
  | "unavailable"
  | "serviceability_error";

/**
 * The partner funnel is a self-contained reference surface: it demonstrates the
 * coordinate model and degraded states without a live authenticated geo client.
 * The mock provider mode is driven by an env flag so tests can exercise the
 * outage/degraded paths deterministically.
 */
export function resolvePartnerMapProviderMode(
  value: string | null | undefined,
): PartnerMapProviderMode {
  if (
    value === "unavailable" ||
    value === "degraded" ||
    value === "serviceability_error"
  ) {
    return value;
  }
  return "healthy";
}

/**
 * Thrown by the mock provider's `serviceability_error` mode: search and health
 * stay green (the provider is genuinely reachable), but the serviceability
 * preview fails. This is the "healthy provider, failed backend gate" class that
 * the booking gate blocks as `serviceability_preview_unavailable` — distinct
 * from a provider outage, which degrades to manual review.
 */
export class PartnerServiceabilityPreviewError extends Error {
  constructor(message = "Serviceability preview failed.") {
    super(message);
    this.name = "PartnerServiceabilityPreviewError";
  }
}

export function createConfiguredPartnerMapProvider(
  mode: PartnerMapProviderMode,
): AddressMapPickerProvider {
  const base = createMockAddressProvider({
    unavailable: mode === "unavailable",
    degraded: mode === "degraded",
  });

  if (mode !== "serviceability_error") {
    return base;
  }

  // Healthy search + health, but serviceability evaluation throws: exercises the
  // backend-gate-failure path without flipping the provider to an outage.
  return {
    ...base,
    async evaluateServiceArea(): Promise<ServiceAreaEvaluationResult> {
      throw new PartnerServiceabilityPreviewError();
    },
  };
}
