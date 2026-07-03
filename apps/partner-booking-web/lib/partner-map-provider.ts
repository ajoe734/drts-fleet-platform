import type { AddressMapPickerProvider } from "@drts/ui-web";
import { createMockAddressProvider } from "@drts/ui-web";

export type PartnerMapProviderMode = "healthy" | "degraded" | "unavailable";

/**
 * The partner funnel is a self-contained reference surface: it demonstrates the
 * coordinate model and degraded states without a live authenticated geo client.
 * The mock provider mode is driven by an env flag so tests can exercise the
 * outage/degraded paths deterministically.
 */
export function resolvePartnerMapProviderMode(
  value: string | null | undefined,
): PartnerMapProviderMode {
  if (value === "unavailable" || value === "degraded") {
    return value;
  }
  return "healthy";
}

export function createConfiguredPartnerMapProvider(
  mode: PartnerMapProviderMode,
): AddressMapPickerProvider {
  return createMockAddressProvider({
    unavailable: mode === "unavailable",
    degraded: mode === "degraded",
  });
}
