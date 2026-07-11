import { afterEach, describe, expect, it, vi } from "vitest";

import { createTenantConsoleGeoProvider } from "../../lib/geo-map-provider";

describe("tenant console geo map provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rethrows backend outages as provider-unavailable picker errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Geo provider unavailable." }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );

    const provider = createTenantConsoleGeoProvider();

    await expect(provider.search({ q: "Taipei 101" })).rejects.toMatchObject({
      reasonCode: "request_failed",
      message: "Geo provider unavailable.",
    });
  });

  it("keeps healthy responses available to the picker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              provider: "mock",
              mode: "mock",
              status: "healthy",
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          ),
      ),
    );

    const provider = createTenantConsoleGeoProvider();

    expect(provider.getHealth).toBeDefined();
    await expect(provider.getHealth!()).resolves.toEqual({
      provider: "mock",
      mode: "mock",
      status: "healthy",
    });
  });

  it("normalizes transport failures into picker outages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    );

    const provider = createTenantConsoleGeoProvider();

    expect(provider.evaluateServiceArea).toBeDefined();
    await expect(
      provider.evaluateServiceArea!({
        serviceProductType: "enterprise_dispatch",
        pickup: { lat: 25.0338, lng: 121.5645 },
        dropoff: { lat: 25.0478, lng: 121.517 },
      }),
    ).rejects.toMatchObject({
      name: "AddressProviderUnavailableError",
      reasonCode: "request_failed",
      message: "socket hang up",
    });
  });
});
