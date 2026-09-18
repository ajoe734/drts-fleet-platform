import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../../../..");
const COMPONENTS_DIR = resolve(REPO_ROOT, "apps/driver-app/components");

const nativeSource = readFileSync(
  resolve(COMPONENTS_DIR, "driver-trip-map.tsx"),
  "utf8",
);
const webSource = readFileSync(
  resolve(COMPONENTS_DIR, "driver-trip-map.web.tsx"),
  "utf8",
);

describe("SR-DRIVER-WEB-001 driver-trip-map platform split", () => {
  it("keeps the native file importing react-native-maps (iOS/Android must not regress)", () => {
    expect(nativeSource).toMatch(
      /from\s+["']react-native-maps["']/,
    );
    expect(nativeSource).toMatch(/PROVIDER_GOOGLE/);
    expect(nativeSource).toMatch(/export default function DriverTripMap/);
  });

  it("keeps the .web.tsx module free of react-native-maps so Metro's web bundle never pulls in the native map SDK", () => {
    expect(webSource).not.toMatch(/react-native-maps/);
    expect(webSource).not.toMatch(/\bMapView\b/);
    expect(webSource).not.toMatch(/PROVIDER_GOOGLE/);
    expect(webSource).toMatch(/export default function DriverTripMap/);
  });

  it("keeps the web module's public prop surface compatible with the native module's callers", () => {
    const propNames = [
      "task",
      "order",
      "driverLocation",
      "sourcePlatformOffline",
      "nativeMapAvailable",
      "now",
      "onNavigationResult",
    ];
    for (const prop of propNames) {
      expect(nativeSource).toContain(prop);
      expect(webSource).toContain(prop);
    }
  });

  it("keeps the web module re-exporting the DriverTripMapLocation type used by app/trip.tsx", () => {
    expect(webSource).toMatch(
      /export type DriverTripMapLocation = NonNullable<DriverLocationFixInput>/,
    );
  });
});
