import { describe, expect, it } from "vitest";
import {
  buildCanvasTheme,
  CANVAS_DARK_NAVY_PALETTE,
  CANVAS_EMPTY_REASONS,
  CANVAS_LIGHT_PALETTE,
  CANVAS_REALM_COLORS,
  CANVAS_REFRESH_TIERS,
  CANVAS_RISK_LEVELS,
  CANVAS_SURFACE_ACCENTS,
} from "../../src/canvas-tokens";

describe("canvas-tokens v0.6 alignment", () => {
  it("exposes per-app dark accents matching the design-canvas v0.6 spec", () => {
    expect(CANVAS_SURFACE_ACCENTS.ops.dark).toBe("#FCA5A5");
    expect(CANVAS_SURFACE_ACCENTS.admin.dark).toBe("#A5B4FC");
    expect(CANVAS_SURFACE_ACCENTS.platform.dark).toBe("#A5B4FC");
    expect(CANVAS_SURFACE_ACCENTS.tenant.dark).toBe("#5EEAD4");
    expect(CANVAS_SURFACE_ACCENTS.driver.dark).toBe("#7BC0FF");
  });

  it("treats admin as an alias of platform for the accent set", () => {
    expect(CANVAS_SURFACE_ACCENTS.admin).toBe(CANVAS_SURFACE_ACCENTS.platform);
  });

  it("includes realm chip colors for cross-actor pills", () => {
    expect(CANVAS_REALM_COLORS.dark.ops.fg).toBe("#FCA5A5");
    expect(CANVAS_REALM_COLORS.dark.platform.fg).toBe("#A5B4FC");
    expect(CANVAS_REALM_COLORS.dark.tenant.fg).toBe("#5EEAD4");
    expect(CANVAS_REALM_COLORS.dark.driver.fg).toBe("#7BC0FF");
    expect(CANVAS_REALM_COLORS.light.driver.fg).toBe("#0F4C75");
  });

  it("wires realm palette into the light and dark base palettes", () => {
    expect(CANVAS_LIGHT_PALETTE.realm).toBe(CANVAS_REALM_COLORS.light);
    expect(CANVAS_DARK_NAVY_PALETTE.realm).toBe(CANVAS_REALM_COLORS.dark);
  });

  it("derives surface-coloured rowSelect in light themes", () => {
    const tenantLight = buildCanvasTheme({ surface: "tenant" });
    expect(tenantLight.rowSelect).toBe(CANVAS_SURFACE_ACCENTS.tenant.lightBg);

    const opsLight = buildCanvasTheme({ surface: "ops" });
    expect(opsLight.rowSelect).toBe(CANVAS_SURFACE_ACCENTS.ops.lightBg);
  });

  it("preserves the navy rowSelect in dark themes", () => {
    const opsDark = buildCanvasTheme({ surface: "ops", dark: true });
    expect(opsDark.rowSelect).toBe(CANVAS_DARK_NAVY_PALETTE.rowSelect);
  });

  it("builds an admin theme equivalent to the platform theme", () => {
    const admin = buildCanvasTheme({ surface: "admin", dark: true });
    const platform = buildCanvasTheme({ surface: "platform", dark: true });
    expect(admin.accent).toBe(platform.accent);
    expect(admin.accentBg).toBe(platform.accentBg);
  });

  it("ships the 7-tier refresh cadence vocabulary", () => {
    const codes = Object.values(CANVAS_REFRESH_TIERS).map((tier) => tier.code);
    expect(codes).toEqual(["T0", "T1", "T2", "T3", "T4", "T5", "T6"]);
    expect(CANVAS_REFRESH_TIERS.manual.ms).toBeNull();
  });

  it("ships the 7 EmptyReason codes (incl. driver_not_eligible)", () => {
    expect(Object.keys(CANVAS_EMPTY_REASONS).sort()).toEqual(
      [
        "driver_not_eligible",
        "external_unavailable",
        "fetch_failed",
        "filtered_empty",
        "no_data",
        "not_provisioned",
        "permission_denied",
      ].sort(),
    );
  });

  it("ships the low/medium/high risk vocabulary", () => {
    expect(CANVAS_RISK_LEVELS.low.tone).toBe("success");
    expect(CANVAS_RISK_LEVELS.medium.tone).toBe("warn");
    expect(CANVAS_RISK_LEVELS.high.tone).toBe("danger");
  });
});
