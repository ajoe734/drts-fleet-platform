import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// R30 (docs/04-uat/system-remediation-20260906/source/findings.json): the
// driver web preview crashed on open at 390px for home/onboarding/SOS with
// "codegenNativeComponent is not a function", stack pointing at the native
// map import inside driver-trip-map. react-native-maps registers a native
// Fabric view config at module-evaluation time, so merely *importing* it in
// any module reachable from a web bundle throws before any Platform.OS
// runtime check ever runs. The fix relies on Metro/webpack's platform
// extension resolution: a sibling `driver-trip-map.web.tsx` is picked over
// `driver-trip-map.tsx` for web builds, so the native import never enters
// the web module graph. These tests are static source-invariant guards
// (not a rendered/bundled reproduction — see SR-DRIVER-WEB-001.md evidence
// notes for what a real Metro web bundle/browser run would still need to
// confirm) that keep that split honest in both directions.

const DRIVER_APP_DIR = resolve(__dirname, "../../../../apps/driver-app");

function readDriverAppFile(relativePath: string): string {
  return readFileSync(resolve(DRIVER_APP_DIR, relativePath), "utf8");
}

describe("SR-DRIVER-WEB-001: driver web preview platform split", () => {
  it("driver-trip-map.web.tsx never imports react-native-maps", () => {
    const webSource = readDriverAppFile("components/driver-trip-map.web.tsx");

    expect(webSource).not.toMatch(/from\s+["']react-native-maps["']/);
    expect(webSource).not.toMatch(/require\(\s*["']react-native-maps["']\s*\)/);
    expect(webSource).not.toContain("codegenNativeComponent(");
  });

  it("driver-trip-map.web.tsx keeps the same default export and location type as the native module", () => {
    const webSource = readDriverAppFile("components/driver-trip-map.web.tsx");
    const nativeSource = readDriverAppFile("components/driver-trip-map.tsx");

    for (const source of [webSource, nativeSource]) {
      expect(source).toMatch(/export default function DriverTripMap\(/);
      expect(source).toMatch(/export type DriverTripMapLocation/);
    }
  });

  it("driver-trip-map.tsx (native) still imports react-native-maps and renders MapView, so iOS/Android native map rendering is not rolled back", () => {
    const nativeSource = readDriverAppFile("components/driver-trip-map.tsx");

    expect(nativeSource).toContain(
      'import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps"',
    );
    expect(nativeSource).toContain("<MapView");
    expect(nativeSource).toContain("Platform.OS !== \"web\"");
  });

  it("app/trip.tsx imports DriverTripMap via the bare module specifier so Metro's .web.tsx platform resolution applies", () => {
    const tripScreenSource = readDriverAppFile("app/trip.tsx");

    expect(tripScreenSource).toContain(
      'from "@/components/driver-trip-map"',
    );
    expect(tripScreenSource).not.toContain("driver-trip-map.web");
    expect(tripScreenSource).not.toContain('driver-trip-map.tsx"');
  });

  it("the three web-openable driver routes named in the finding (home/onboarding/SOS) exist as route files", () => {
    for (const routeFile of ["app/index.tsx", "app/onboarding.tsx", "app/sos.tsx"]) {
      expect(() => readDriverAppFile(routeFile)).not.toThrow();
    }
  });
});
