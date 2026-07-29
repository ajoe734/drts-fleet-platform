import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const script = resolve(process.cwd(), "scripts/check-map-provider-config.sh");

function runPreflight(overrides: Record<string, string> = {}) {
  return spawnSync("bash", [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      CI: "false",
      MAP_PROVIDER_BACKEND: "mock",
      ...overrides,
    },
  });
}

describe("map provider deployment preflight", () => {
  it("allows deterministic local mock mode", () => {
    const result = runPreflight();

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("backend=mock tier=local");
  });

  it("fails closed when a production tile template is missing", () => {
    const result = runPreflight({
      CI: "true",
      MAP_PROVIDER_DEPLOYMENT_TIER: "production",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "requires NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE",
    );
  });

  it("rejects insecure or incomplete production tile templates", () => {
    const insecure = runPreflight({
      MAP_PROVIDER_DEPLOYMENT_TIER: "staging",
      NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE: "http://tiles.example/{z}/{x}/{y}.png",
    });
    const incomplete = runPreflight({
      MAP_PROVIDER_DEPLOYMENT_TIER: "production",
      NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE: "https://tiles.example/{z}/{x}.png",
    });

    expect(insecure.status).toBe(1);
    expect(insecure.stderr).toContain("must use HTTPS");
    expect(incomplete.status).toBe(1);
    expect(incomplete.stderr).toContain("missing {y}");
  });

  it("accepts a complete HTTPS production tile template", () => {
    const result = runPreflight({
      MAP_PROVIDER_DEPLOYMENT_TIER: "production",
      NEXT_PUBLIC_MAP_TILE_URL_TEMPLATE:
        "https://tiles.example/{z}/{x}/{y}.png",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("backend=mock tier=production");
  });

  it("accepts Google staging without a generic tile template when all live keys are present", () => {
    const result = runPreflight({
      MAP_PROVIDER_DEPLOYMENT_TIER: "staging",
      MAP_PROVIDER_BACKEND: "google",
      GOOGLE_MAPS_GEOCODING_API_KEY: "geocoding-key",
      GOOGLE_MAPS_ROUTES_API_KEY: "routes-key",
      GOOGLE_MAPS_BROWSER_KEY: "browser-key",
      MAP_PROVIDER_ALLOWED_ORIGINS: "https://ops.example.test",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("live provider config is ready");
  });

  it("fails closed when strict Google runtime is missing its browser key", () => {
    const result = runPreflight({
      MAP_PROVIDER_DEPLOYMENT_TIER: "production",
      MAP_PROVIDER_BACKEND: "google",
      GOOGLE_MAPS_GEOCODING_API_KEY: "geocoding-key",
      GOOGLE_MAPS_ROUTES_API_KEY: "routes-key",
      MAP_PROVIDER_ALLOWED_ORIGINS: "https://ops.example.test",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("GOOGLE_MAPS_BROWSER_KEY");
  });
});
