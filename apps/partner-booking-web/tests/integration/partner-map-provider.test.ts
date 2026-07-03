import { describe, expect, it } from "vitest";
import {
  PartnerServiceabilityPreviewError,
  createConfiguredPartnerMapProvider,
  resolvePartnerMapProviderMode,
} from "@/lib/partner-map-provider";

const PICKUP = { lat: 25.033, lng: 121.5654 };
const DROPOFF = { lat: 25.0797, lng: 121.2342 };

describe("partner map provider mode resolution", () => {
  it("accepts the known degraded/outage/serviceability-error modes", () => {
    expect(resolvePartnerMapProviderMode("unavailable")).toBe("unavailable");
    expect(resolvePartnerMapProviderMode("degraded")).toBe("degraded");
    expect(resolvePartnerMapProviderMode("serviceability_error")).toBe(
      "serviceability_error",
    );
  });

  it("defaults unknown/empty input to healthy", () => {
    expect(resolvePartnerMapProviderMode(undefined)).toBe("healthy");
    expect(resolvePartnerMapProviderMode("nonsense")).toBe("healthy");
  });
});

describe("serviceability_error provider mode", () => {
  it("keeps search and health green while the serviceability preview throws", async () => {
    const provider = createConfiguredPartnerMapProvider("serviceability_error");

    // The provider is genuinely reachable: search and health succeed.
    const health = await provider.getHealth?.();
    expect(health?.status).toBe("healthy");
    const results = await provider.search({ q: "101" });
    expect(results.candidates.length).toBeGreaterThan(0);

    // But the serviceability evaluation fails: this is the "healthy provider,
    // failed backend gate" class the booking gate blocks (not an outage).
    await expect(
      provider.evaluateServiceArea?.({
        serviceProductType: "taxi_realtime",
        pickup: PICKUP,
        dropoff: DROPOFF,
      }),
    ).rejects.toBeInstanceOf(PartnerServiceabilityPreviewError);
  });

  it("still evaluates serviceability in healthy mode", async () => {
    const provider = createConfiguredPartnerMapProvider("healthy");
    const result = await provider.evaluateServiceArea?.({
      serviceProductType: "taxi_realtime",
      pickup: PICKUP,
      dropoff: DROPOFF,
    });
    expect(result?.decision).toBeTruthy();
  });
});
