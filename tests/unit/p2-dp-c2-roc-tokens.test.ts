import { describe, expect, it } from "vitest";

import {
  STATUS_TONES,
  type TokenMode,
  type ToneRamp,
} from "../../packages/ui-tokens/src/colors";
import { REALM_COLORS } from "../../packages/ui-tokens/src/realms";
import {
  CONTROL_SURFACES,
  ROC_ACCENT_TONE,
  ROC_STATE_DISPLAY_STRINGS,
  ROC_STATE_NAMES,
  ROC_STATE_TONES,
  ROC_SURFACE_NAMES,
  ROC_TOKEN_ALIAS_TABLE,
  isRocStateName,
  resolveRocStateTone,
  resolveRocSurface,
  type RocStateName,
} from "../../packages/ui-tokens/src/roc";

/**
 * P2-DP-C2-001 — ROC semantic token aliases (decision packet §C2 / §4.3).
 *
 * Two guarantees:
 *  (1) every `roc.*` alias RESOLVES to an existing semantic token — the roc
 *      maps reference the shared ramps, they do not introduce a new palette;
 *  (2) every roc status token passes the colour-blind / weak-colour contrast
 *      test (§4.3 hard rule).
 */

const REALM = REALM_COLORS;

const MODES: TokenMode[] = ["light", "dark"];

function relativeLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const channel = (h: string) => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = channel(c.slice(0, 2));
  const g = channel(c.slice(2, 4));
  const b = channel(c.slice(4, 6));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * WCAG 2.1 SC 1.4.11 non-text contrast / SC 1.4.3 large-text AA threshold.
 * Status chips + dots are small graphical indicators that §4.3 additionally
 * requires be paired with text + icon + shape, so 3.0 (not the 4.5 body-text
 * bar) is the correct, defensible "weak-colour" floor here.
 */
const MIN_CONTRAST = 3.0;

describe("roc.state.* aliases resolve to existing semantic tokens", () => {
  const expected: Record<RocStateName, Record<TokenMode, ToneRamp>> = {
    healthy: STATUS_TONES.success,
    degraded: STATUS_TONES.warning,
    critical: STATUS_TONES.danger,
    offline: STATUS_TONES.neutral,
    manual_hold: STATUS_TONES.warning,
    evidence_hold: REALM.platform,
  };

  for (const state of ROC_STATE_NAMES) {
    it(`roc.state.${state} is, by reference, an existing token`, () => {
      // Identity (===): the alias must BE the existing token, not a copy.
      expect(ROC_STATE_TONES[state]).toBe(expected[state]);
      for (const mode of MODES) {
        expect(resolveRocStateTone(state, mode)).toBe(expected[state][mode]);
      }
    });
  }

  it("roc.accent.primary resolves to semantic.info (info.strong)", () => {
    expect(ROC_ACCENT_TONE).toBe(STATUS_TONES.info);
  });

  it("covers exactly the §4.3 state vocabulary", () => {
    expect([...ROC_STATE_NAMES].sort()).toEqual(
      [
        "critical",
        "degraded",
        "evidence_hold",
        "healthy",
        "manual_hold",
        "offline",
      ].sort(),
    );
    expect(Object.keys(ROC_STATE_DISPLAY_STRINGS).sort()).toEqual(
      [...ROC_STATE_NAMES].sort(),
    );
  });
});

describe("roc.surface.* aliases resolve to control-plane surfaces", () => {
  it("maps canvas/panel/elevated onto the control surface ramp", () => {
    for (const mode of MODES) {
      for (const name of ROC_SURFACE_NAMES) {
        expect(resolveRocSurface(name, mode)).toBe(CONTROL_SURFACES[mode][name]);
      }
    }
  });

  it("renders a distinct elevation order on the dark monitoring canvas", () => {
    const dark = CONTROL_SURFACES.dark;
    // canvas is the deepest layer; panel + elevated sit progressively above it.
    expect(relativeLuminance(dark.canvas)).toBeLessThan(
      relativeLuminance(dark.panel),
    );
    expect(relativeLuminance(dark.panel)).toBeLessThanOrEqual(
      relativeLuminance(dark.elevated),
    );
  });
});

describe("roc status tokens pass the weak-colour contrast test (§4.3)", () => {
  for (const state of ROC_STATE_NAMES) {
    for (const mode of MODES) {
      it(`roc.state.${state} fg-on-bg ≥ ${MIN_CONTRAST} (${mode})`, () => {
        const ramp = resolveRocStateTone(state, mode);
        expect(contrastRatio(ramp.fg, ramp.bg)).toBeGreaterThanOrEqual(
          MIN_CONTRAST,
        );
      });
    }

    it(`roc.state.${state} dark fg stays legible on the canvas`, () => {
      const ramp = resolveRocStateTone(state, "dark");
      expect(
        contrastRatio(ramp.fg, CONTROL_SURFACES.dark.canvas),
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
      expect(
        contrastRatio(ramp.fg, CONTROL_SURFACES.dark.panel),
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    });
  }

  it("roc.accent.primary passes contrast in both modes", () => {
    for (const mode of MODES) {
      expect(
        contrastRatio(ROC_ACCENT_TONE[mode].fg, ROC_ACCENT_TONE[mode].bg),
      ).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
});

describe("§4.3 alias table", () => {
  it("lists every roc token and its semantic target", () => {
    expect(ROC_TOKEN_ALIAS_TABLE).toEqual({
      "roc.surface.canvas": "control.surface.canvas",
      "roc.surface.panel": "control.surface.panel",
      "roc.surface.elevated": "control.surface.elevated",
      "roc.accent.primary": "semantic.info.strong",
      "roc.state.healthy": "semantic.success",
      "roc.state.degraded": "semantic.warning",
      "roc.state.critical": "semantic.danger",
      "roc.state.offline": "semantic.neutral",
      "roc.state.manual_hold": "semantic.warning.strong",
      "roc.state.evidence_hold": "semantic.governance",
    });
  });

  it("isRocStateName guards the vocabulary", () => {
    expect(isRocStateName("evidence_hold")).toBe(true);
    expect(isRocStateName("nope")).toBe(false);
  });
});
