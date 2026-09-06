/**
 * SR-DRIVER-WEB-001 regression tests
 *
 * Verifies that the web platform split for DriverTripMap:
 *  1. driver-trip-map.web.tsx does NOT import react-native-maps (prevents
 *     codegenNativeComponent crash on web – R30 root cause).
 *  2. driver-trip-map.web.tsx exports the same public API surface as the
 *     native driver-trip-map.tsx (DriverTripMapLocation type + default export).
 *  3. driver-trip-map.tsx still imports react-native-maps (native build
 *     regression guard – iOS/Android must not be degraded).
 *  4. driver-trip-map.web.tsx never references nativeMapAvailable for
 *     conditional rendering of MapView (always coordinate-handoff mode).
 *  5. Both files export DriverTripMapLocation as a type and a default function.
 *
 * These are static / AST-level checks that run in Node without a browser or
 * native runtime.  They validate the file content invariants that prevent R30
 * from regressing and confirm the native path is intact.
 *
 * Live web smoke test (not automated here):
 *   expo start --web  →  open localhost:8081  →  navigate /onboarding, /, /sos
 *   Expected: pages load, no codegenNativeComponent error in console.
 *
 * Task-ID: SR-DRIVER-WEB-001
 * LLM-Agent: Gemini2
 * Reviewer: Claude
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "../../../..");
const WEB_FILE = resolve(
  REPO_ROOT,
  "apps/driver-app/components/driver-trip-map.web.tsx",
);
const NATIVE_FILE = resolve(
  REPO_ROOT,
  "apps/driver-app/components/driver-trip-map.tsx",
);

const webSource = readFileSync(WEB_FILE, "utf-8");
const nativeSource = readFileSync(NATIVE_FILE, "utf-8");

describe("SR-DRIVER-WEB-001: driver-trip-map web platform split", () => {
  // -----------------------------------------------------------------------
  // R30 Root-cause guard: web file must NOT import react-native-maps
  // -----------------------------------------------------------------------
  it("web file does not import react-native-maps (R30 crash prevention)", () => {
    // The web file may mention react-native-maps in comments for documentation.
    // What matters is that there is no import statement that would cause the
    // codegenNativeComponent crash at module evaluation time.
    expect(webSource).not.toMatch(/from\s+['"]react-native-maps['"]/);
    expect(webSource).not.toMatch(/require\s*\(\s*['"]react-native-maps['"]\s*\)/);
  });

  it("web file does not render <MapView JSX element", () => {
    // The web file may mention MapView in comments for documentation.
    // What matters is that it never renders the JSX element.
    expect(webSource).not.toContain("<MapView");
  });

  it("web file does not import PROVIDER_GOOGLE from react-native-maps", () => {
    // PROVIDER_GOOGLE is imported from react-native-maps; its presence in
    // an import statement indicates a leaked native import.
    expect(webSource).not.toMatch(/PROVIDER_GOOGLE\s*[,}]/);
  });

  it("web file does not import from react-native-maps", () => {
    // Marker and MapView are react-native-maps exports that crash on web.
    expect(webSource).not.toMatch(/from\s+['"]react-native-maps['"]/);
  });

  // -----------------------------------------------------------------------
  // Native regression guard: native file MUST still import react-native-maps
  // -----------------------------------------------------------------------
  it("native file still imports react-native-maps (iOS/Android regression guard)", () => {
    expect(nativeSource).toContain("react-native-maps");
  });

  it("native file still imports MapView from react-native-maps", () => {
    expect(nativeSource).toMatch(/import MapView.*from\s+['"]react-native-maps['"]/);
  });

  // -----------------------------------------------------------------------
  // Public API surface parity
  // -----------------------------------------------------------------------
  it("web file exports DriverTripMapLocation type", () => {
    // The type must be exported so importers can use platform-conditional imports.
    expect(webSource).toMatch(/export\s+type\s+DriverTripMapLocation/);
  });

  it("native file exports DriverTripMapLocation type", () => {
    expect(nativeSource).toMatch(/export\s+type\s+DriverTripMapLocation/);
  });

  it("web file has a default export (DriverTripMap component)", () => {
    expect(webSource).toMatch(/export\s+default\s+function\s+DriverTripMap/);
  });

  it("native file has a default export (DriverTripMap component)", () => {
    expect(nativeSource).toMatch(/export\s+default\s+function\s+DriverTripMap/);
  });

  // -----------------------------------------------------------------------
  // nativeMapAvailable prop handling on web
  // -----------------------------------------------------------------------
  it("web file accepts nativeMapAvailable prop but does not conditionally render MapView with it", () => {
    // The prop must be present in the type/signature (for API parity),
    // but it must NOT be used to gate a MapView render on web.
    expect(webSource).toContain("nativeMapAvailable");
    // The web file must not have any conditional that shows MapView
    expect(webSource).not.toContain("<MapView");
  });

  it("web file renders coordinate handoff pin row (visual placeholder)", () => {
    // The pin row is the coordinate-handoff visual indicator.
    expect(webSource).toContain("pinRow");
    expect(webSource).toContain("pickupPin");
    expect(webSource).toContain("dropoffPin");
  });

  // -----------------------------------------------------------------------
  // Web preview mode notice
  // -----------------------------------------------------------------------
  it("web file shows a clear notice that native map is not available", () => {
    expect(webSource).toMatch(/native map.*not available|not available.*native map/i);
  });

  // -----------------------------------------------------------------------
  // Platform guard in native file (belt-and-suspenders)
  // -----------------------------------------------------------------------
  it("native file has Platform.OS !== web guard around nativeMapEnabled", () => {
    // The native file already has this guard at line ~209; this regression
    // test ensures it is not removed.
    expect(nativeSource).toMatch(/Platform\.OS\s*!==\s*['"](web)['"]/);
  });

  // -----------------------------------------------------------------------
  // Navigation functionality present on web
  // -----------------------------------------------------------------------
  it("web file imports openDriverNavigation (navigation still works on web)", () => {
    expect(webSource).toContain("openDriverNavigation");
  });

  it("web file imports buildDriverTripNavigationModel", () => {
    expect(webSource).toContain("buildDriverTripNavigationModel");
  });

  it("web file includes StopCoordinateCard with navigation buttons", () => {
    expect(webSource).toContain("StopCoordinateCard");
    expect(webSource).toContain("Google 導航");
  });
});
