import { describe, expect, it } from "vitest";
import {
  AUTHORITY_COLORS,
  DENSITY_SCALES,
  STATUS_TONE_BY_VALUE,
  STATUS_TONES,
  SURFACE_ACCENTS,
} from "@drts/ui-tokens";

import {
  createDriverTheme,
  resolveAuthorityLabel,
  resolveDriverTone,
  resolveForwardedStatusLabel,
  resolveForwardedStatusTone,
} from "../../components/ui-rn/theme";

describe("ui-rn theme wiring", () => {
  it("maps authority and accent ramps directly from @drts/ui-tokens", () => {
    expect(resolveDriverTone("owned")).toEqual({
      backgroundColor: AUTHORITY_COLORS.owned.light.bg,
      borderColor: AUTHORITY_COLORS.owned.light.border,
      foregroundColor: AUTHORITY_COLORS.owned.light.fg,
      emphasisColor: AUTHORITY_COLORS.owned.light.fg,
    });

    expect(resolveDriverTone("platform", "dark")).toEqual({
      backgroundColor: SURFACE_ACCENTS.platform.dark.bg,
      borderColor: SURFACE_ACCENTS.platform.dark.border,
      foregroundColor: SURFACE_ACCENTS.platform.dark.fg,
      emphasisColor: SURFACE_ACCENTS.platform.dark.hi,
    });
  });

  it("derives forwarded status copy and tone from the canonical status vocabulary", () => {
    const toneName = STATUS_TONE_BY_VALUE.accept_pending;

    expect(resolveForwardedStatusLabel("accept_pending")).toBe("等待平台確認");
    expect(resolveForwardedStatusTone("accept_pending")).toEqual({
      backgroundColor: STATUS_TONES[toneName].light.bg,
      borderColor: STATUS_TONES[toneName].light.border,
      foregroundColor: STATUS_TONES[toneName].light.fg,
      emphasisColor: STATUS_TONES[toneName].light.fg,
    });
  });

  it("uses density scales to seed layout and typography defaults", () => {
    const theme = createDriverTheme({ density: "compact" });

    expect(theme.densityScale).toEqual(DENSITY_SCALES.compact);
    expect(theme.layout.contentGap).toBe(DENSITY_SCALES.compact.sectionGap);
    expect(theme.layout.cardPadding).toBe(DENSITY_SCALES.compact.cardPadding);
    expect(theme.typography.screenTitle.fontSize).toBe(
      DENSITY_SCALES.compact.titleFontSize,
    );
    expect(theme.typography.body.fontSize).toBe(
      DENSITY_SCALES.compact.baseFontSize,
    );
  });

  it("reuses canonical authority display strings", () => {
    expect(resolveAuthorityLabel("forwarded")).toBe("轉派訂單");
  });
});
