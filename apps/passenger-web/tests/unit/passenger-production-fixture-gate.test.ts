import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadPassengerRideFixture } from "../../lib/passenger-fixture-loader";
import { getPassengerRideFixture } from "../../lib/passenger-fixtures";
import {
  getPassengerRuntimeConfig,
  resolvePassengerDataMode,
} from "../../lib/runtime-config";

const APP_ROOT = resolve(__dirname, "../..");
const FIXTURE_MODULE = "passenger-fixtures";

/**
 * Every module that a page can reach without an async boundary. If any of these
 * statically imports the fixture payload module, the bundler pulls it into the
 * production entry chunk and the build can serve demo data to a passenger.
 */
const PRODUCTION_REACHABLE_MODULES = [
  "components/passenger-ride-page.tsx",
  "lib/passenger-live.ts",
  "lib/passenger-presentation.ts",
  "lib/passenger-view-model.ts",
  "lib/runtime-config.tsx",
  "app/page.tsx",
  "app/layout.tsx",
  "app/ride/[token]/page.tsx",
  "app/ride/[token]/fares/page.tsx",
  "app/ride/[token]/receipt/page.tsx",
];

function readModule(relativePath: string) {
  return readFileSync(resolve(APP_ROOT, relativePath), "utf8");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("production fixture prohibition", () => {
  it("keeps the fixture payload module out of the statically reachable graph", () => {
    const offenders = PRODUCTION_REACHABLE_MODULES.filter((relativePath) =>
      // Any `import ... from ".../passenger-fixtures"` at module scope. The
      // loader's dynamic `import()` is deliberately not matched.
      new RegExp(
        String.raw`^\s*import\s[^;]*?["']@?[./\w-]*${FIXTURE_MODULE}["']`,
        "m",
      ).test(readModule(relativePath)),
    );

    expect(offenders).toEqual([]);
  });

  it("reaches the fixture payloads only through a dynamic import", () => {
    const loader = readModule("lib/passenger-fixture-loader.ts");

    expect(loader).toContain(`await import("./${FIXTURE_MODULE}")`);
    expect(loader).not.toMatch(
      new RegExp(String.raw`^\s*import\s[^;]*?["']\./${FIXTURE_MODULE}["']`, "m"),
    );
  });

  it("resolves no fixture in a production build even when fixture mode is asked for", async () => {
    vi.stubEnv("NODE_ENV", "production");

    await expect(
      loadPassengerRideFixture("opaque-token", "ride", "P5-02"),
    ).resolves.toBeNull();
  });

  it("still resolves fixtures for a non-production preview", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const fixture = await loadPassengerRideFixture(
      "opaque-token",
      "ride",
      "P5-02",
    );

    expect(fixture?.screenId).toBe("P5-02");
    expect(fixture?.token).toBe("opaque-token");
  });

  it("fails closed inside the fixture module itself", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(() => getPassengerRideFixture("P5-02", "opaque-token")).toThrow(
      /PASSENGER_PRODUCTION_FIXTURE_FORBIDDEN/,
    );
  });

  it("pins production to live regardless of the query mode", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(resolvePassengerDataMode("fixture")).toBe("live");
    expect(resolvePassengerDataMode(undefined)).toBe("live");
  });

  it("ignores an injected runtime-config global that asks for fixture data in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubGlobal("window", {
      __DRTS_PASSENGER_WEB_CONFIG__: {
        dataMode: "fixture",
        sseEndpoint: "/control-plane-proxy/passenger-rides",
      },
    });

    expect(getPassengerRuntimeConfig().dataMode).toBe("live");
  });

  it("still honours the injected global outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("window", {
      __DRTS_PASSENGER_WEB_CONFIG__: { dataMode: "fixture" },
    });

    expect(getPassengerRuntimeConfig().dataMode).toBe("fixture");
  });

  it("refuses to build a production bundle configured for fixture data", () => {
    const config = readModule("next.config.ts");

    expect(config).toContain("PASSENGER_PRODUCTION_FIXTURE_FORBIDDEN");
    expect(config).toContain('process.env.NODE_ENV === "production"');
  });
});
