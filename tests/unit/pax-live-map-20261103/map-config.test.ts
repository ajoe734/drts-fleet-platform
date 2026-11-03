import { describe, expect, it } from "vitest";
import {
  resolvePassengerMapConfig,
  resolvePassengerPublicOrigin,
} from "../../../apps/passenger-app-web/lib/map/map-config";

const RIDE = "https://ride.smarttransport.tw";
const RUN_APP = "https://drts-dev-passenger-app-web-abc123-uc.a.run.app";
const env = {
  GOOGLE_MAPS_BROWSER_KEY: " browser-key ",
  MAP_PROVIDER_MODE: "external",
  MAP_PROVIDER_ALLOWED_ORIGINS: `${RIDE}, ${RUN_APP}/`,
};

describe("passenger Google map gate (same env names as the referral embed)", () => {
  it("hands the trimmed browser key only to an allowed public origin", () => {
    expect(resolvePassengerMapConfig(env, RIDE)).toEqual({
      enabled: true,
      browserKey: "browser-key",
    });
    // Trailing slashes on either side do not matter.
    expect(resolvePassengerMapConfig(env, `${RUN_APP}/`).enabled).toBe(true);
  });

  it("keeps the key on the server for an origin that is not listed", () => {
    for (const origin of [
      "https://evil.example",
      "http://ride.smarttransport.tw",
      "https://ride.smarttransport.tw.evil.example",
      null,
    ])
      expect(resolvePassengerMapConfig(env, origin)).toEqual({
        enabled: false,
        browserKey: null,
      });
  });

  it("stays off without a key, without the external mode, or for another provider", () => {
    const off = { enabled: false, browserKey: null };
    expect(
      resolvePassengerMapConfig({ ...env, GOOGLE_MAPS_BROWSER_KEY: "" }, RIDE),
    ).toEqual(off);
    expect(
      resolvePassengerMapConfig(
        { ...env, GOOGLE_MAPS_BROWSER_KEY: undefined },
        RIDE,
      ),
    ).toEqual(off);
    expect(
      resolvePassengerMapConfig({ ...env, MAP_PROVIDER_MODE: "mock" }, RIDE),
    ).toEqual(off);
    expect(
      resolvePassengerMapConfig({ ...env, MAP_PROVIDER_MODE: undefined }, RIDE),
    ).toEqual(off);
    expect(
      resolvePassengerMapConfig({ ...env, MAP_PROVIDER_NAME: "here" }, RIDE),
    ).toEqual(off);
    expect(
      resolvePassengerMapConfig(
        { ...env, MAP_PROVIDER_ALLOWED_ORIGINS: undefined },
        RIDE,
      ),
    ).toEqual(off);
  });

  it("treats an unset or empty MAP_PROVIDER_NAME as google", () => {
    expect(
      resolvePassengerMapConfig({ ...env, MAP_PROVIDER_NAME: "" }, RIDE)
        .enabled,
    ).toBe(true);
    expect(
      resolvePassengerMapConfig({ ...env, MAP_PROVIDER_NAME: "Google" }, RIDE)
        .enabled,
    ).toBe(true);
  });
});

describe("passenger public origin behind the load balancer", () => {
  const headers = (values: Record<string, string>) => new Headers(values);
  const cloudRun = { K_SERVICE: "drts-dev-passenger-app-web" };

  it("uses the forwarded host and https on Cloud Run", () => {
    expect(
      resolvePassengerPublicOrigin(
        headers({
          host: "drts-dev-passenger-app-web-abc123-uc.a.run.app",
          "x-forwarded-host": "ride.smarttransport.tw",
          "x-forwarded-proto": "http",
        }),
        cloudRun,
      ),
    ).toBe(RIDE);
    // The load balancer keeps Host; Next fills X-Forwarded-Host from it.
    expect(
      resolvePassengerPublicOrigin(
        headers({ host: "ride.smarttransport.tw" }),
        cloudRun,
      ),
    ).toBe(RIDE);
    expect(
      resolvePassengerPublicOrigin(
        headers({ host: "drts-dev-passenger-app-web-abc123-uc.a.run.app" }),
        cloudRun,
      ),
    ).toBe(RUN_APP);
  });

  it("takes the first forwarded value and falls back to Host when it is malformed", () => {
    expect(
      resolvePassengerPublicOrigin(
        headers({
          host: "internal:8080",
          "x-forwarded-host": "Ride.SmartTransport.tw, proxy.internal",
        }),
        cloudRun,
      ),
    ).toBe(RIDE);
    expect(
      resolvePassengerPublicOrigin(
        headers({
          host: "ride.smarttransport.tw",
          "x-forwarded-host": "evil.example/path",
        }),
        cloudRun,
      ),
    ).toBe(RIDE);
    expect(
      resolvePassengerPublicOrigin(headers({ host: "bad host" }), cloudRun),
    ).toBeNull();
    expect(resolvePassengerPublicOrigin(headers({}), cloudRun)).toBeNull();
  });

  it("honours the forwarded scheme off Cloud Run and keeps loopback on http", () => {
    expect(
      resolvePassengerPublicOrigin(
        headers({ host: "pax.example", "x-forwarded-proto": "http" }),
        {},
      ),
    ).toBe("http://pax.example");
    expect(
      resolvePassengerPublicOrigin(headers({ host: "pax.example" }), {}),
    ).toBe("https://pax.example");
    expect(
      resolvePassengerPublicOrigin(headers({ host: "localhost:3009" }), {}),
    ).toBe("http://localhost:3009");
  });

  it("enables the map end to end only for the listed origins", () => {
    const configFor = (host: string) =>
      resolvePassengerMapConfig(
        env,
        resolvePassengerPublicOrigin(headers({ host }), cloudRun),
      );
    expect(configFor("ride.smarttransport.tw").enabled).toBe(true);
    expect(
      configFor("drts-dev-passenger-app-web-abc123-uc.a.run.app").enabled,
    ).toBe(true);
    expect(configFor("other.smarttransport.tw")).toEqual({
      enabled: false,
      browserKey: null,
    });
  });
});
