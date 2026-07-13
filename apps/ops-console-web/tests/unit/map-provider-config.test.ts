import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "../../app/api/map-provider-config/route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("map provider browser config", () => {
  it("exposes only the referrer-restricted browser key for an allowed origin", async () => {
    vi.stubEnv("MAP_PROVIDER_MODE", "external");
    vi.stubEnv("MAP_PROVIDER_NAME", "google");
    vi.stubEnv("GOOGLE_MAPS_BROWSER_KEY", "browser-key");
    vi.stubEnv("MAP_PROVIDER_ALLOWED_ORIGINS", "https://ops.example.test");
    vi.stubEnv("GOOGLE_MAPS_GEOCODING_API_KEY", "server-key-must-not-leak");

    const response = GET(
      new NextRequest("https://ops.example.test/api/map-provider-config"),
    );
    const payload = await response.json();

    expect(payload).toEqual({
      provider: "google",
      enabled: true,
      browserKey: "browser-key",
      mapId: null,
      reasonCode: null,
    });
    expect(JSON.stringify(payload)).not.toContain("server-key-must-not-leak");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("fails closed without disclosing the key to an unapproved origin", async () => {
    vi.stubEnv("MAP_PROVIDER_MODE", "external");
    vi.stubEnv("MAP_PROVIDER_NAME", "google");
    vi.stubEnv("GOOGLE_MAPS_BROWSER_KEY", "browser-key");
    vi.stubEnv("MAP_PROVIDER_ALLOWED_ORIGINS", "https://ops.example.test");

    const response = GET(
      new NextRequest("https://untrusted.example.test/api/map-provider-config"),
    );

    await expect(response.json()).resolves.toMatchObject({
      provider: "fallback",
      enabled: false,
      browserKey: null,
      reasonCode: "origin_not_allowed",
    });
  });

  it("uses the external proxy origin instead of Next's internal origin", async () => {
    vi.stubEnv("MAP_PROVIDER_MODE", "external");
    vi.stubEnv("MAP_PROVIDER_NAME", "google");
    vi.stubEnv("GOOGLE_MAPS_BROWSER_KEY", "browser-key");
    vi.stubEnv("MAP_PROVIDER_ALLOWED_ORIGINS", "https://ops.example.test");

    const response = GET(
      new NextRequest("http://localhost:3000/api/map-provider-config", {
        headers: {
          host: "ops.example.test",
          "x-forwarded-proto": "https",
        },
      }),
    );

    await expect(response.json()).resolves.toMatchObject({
      provider: "google",
      enabled: true,
      browserKey: "browser-key",
      reasonCode: null,
    });
  });
});
