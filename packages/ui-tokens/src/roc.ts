import {
  STATUS_TONES,
  type StatusToneName,
  type ToneRamp,
  type TokenMode,
} from "./colors";
import { REALM_COLORS } from "./realms";
import type { LocalizedDisplayString } from "./status";

/**
 * ROC Console semantic token aliases — Phase 2 Tesla FSD sandbox decision
 * packet §C2 / §4.3 (`docs/02-architecture/
 * phase2_tesla_fsd_sandbox_system_design_decision_packet_c1c6_b1b5_20260625.md`).
 *
 * The ROC Console reuses the Ops Console shell + `@drts/ui-web` primitives; it
 * does NOT introduce a second component library or a bespoke colour palette.
 * Per §4.2 the token layering is:
 *
 *   semantic / control-plane tokens  (this file's `CONTROL_SURFACES` + the
 *                                      existing `STATUS_TONES` / `REALM_COLORS`)
 *     └─ roc aliases                  (the `ROC_*` maps below)
 *
 * Every `roc.*` alias resolves to an EXISTING semantic token — the maps below
 * reference the shared ramps by value (identity), they never re-declare a new
 * hex palette. ROC differs from Ops only in its blue/cyan *accent* (wired in
 * `@drts/ui-web` `canvas-tokens.ts` as the `roc` surface accent) so duty staff
 * can tell the two control-plane apps apart; the neutral dark canvas, status
 * tones and realm chips are shared.
 *
 * §4.3 hard rule: status colour expresses state only, never decoration; it must
 * always be paired with text + icon + shape, and every status token must pass
 * the colour-blind / weak-colour contrast test (see
 * `tests/unit/p2-dp-c2-roc-tokens.test.ts`).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Control-plane surface tokens (§4.3 `control.surface.*`)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Neutral control-plane monitoring surfaces shared by ROC + Ops. Mirrors the
 * `@drts/ui-web` canvas palette (`CANVAS_DARK_NAVY_PALETTE` / `CANVAS_LIGHT_
 * PALETTE`) so the token layer and the shell render the same surfaces. ROC runs
 * dark by default (中性深色監控盤); the light ramp is provided for completeness.
 */
export interface ControlSurfaceTokens {
  readonly canvas: string;
  readonly panel: string;
  readonly elevated: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly text: string;
  readonly textMuted: string;
}

export const CONTROL_SURFACES = {
  light: {
    canvas: "#F7F8FB",
    panel: "#FFFFFF",
    elevated: "#FFFFFF",
    border: "#E5E8EE",
    borderStrong: "#C9D2DD",
    text: "#0B1220",
    textMuted: "#475569",
  },
  dark: {
    canvas: "#0A0E16",
    panel: "#141B2B",
    elevated: "#1A2235",
    border: "#22304A",
    borderStrong: "#324A6E",
    text: "#E5EAF3",
    textMuted: "#94A3B8",
  },
} as const satisfies Record<TokenMode, ControlSurfaceTokens>;

// ─────────────────────────────────────────────────────────────────────────────
// roc.surface.* aliases
// ─────────────────────────────────────────────────────────────────────────────

export type RocSurfaceName = "canvas" | "panel" | "elevated";

export const ROC_SURFACE_NAMES = [
  "canvas",
  "panel",
  "elevated",
] as const satisfies readonly RocSurfaceName[];

export function resolveRocSurface(
  name: RocSurfaceName,
  mode: TokenMode,
): string {
  return CONTROL_SURFACES[mode][name];
}

export function isRocSurfaceName(value: string): value is RocSurfaceName {
  return (ROC_SURFACE_NAMES as readonly string[]).includes(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// roc.accent.primary alias (-> semantic.info.strong)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ROC primary accent resolves to the existing `info` status tone (the "strong"
 * variant being its `fg`). The blue/cyan *identity* accent of the shell is the
 * `roc` surface accent in `@drts/ui-web`; this alias is the semantic anchor the
 * §4.3 table points at.
 */
export const ROC_ACCENT_TONE: Record<TokenMode, ToneRamp> = STATUS_TONES.info;

export function resolveRocAccent(mode: TokenMode): ToneRamp {
  return ROC_ACCENT_TONE[mode];
}

// ─────────────────────────────────────────────────────────────────────────────
// roc.state.* aliases
// ─────────────────────────────────────────────────────────────────────────────

export type RocStateName =
  | "healthy"
  | "degraded"
  | "critical"
  | "offline"
  | "manual_hold"
  | "evidence_hold";

export const ROC_STATE_NAMES = [
  "healthy",
  "degraded",
  "critical",
  "offline",
  "manual_hold",
  "evidence_hold",
] as const satisfies readonly RocStateName[];

/**
 * Resolved roc.state.* ramps. Each value is, by reference, an existing
 * semantic token — `STATUS_TONES.*` or, for the governance / evidence-hold
 * state, the `platform` realm ramp (indigo, the §4.3 "purple / governance"
 * colour). No new colour is introduced here.
 */
export const ROC_STATE_TONES = {
  healthy: STATUS_TONES.success,
  degraded: STATUS_TONES.warning,
  critical: STATUS_TONES.danger,
  offline: STATUS_TONES.neutral,
  manual_hold: STATUS_TONES.warning,
  evidence_hold: REALM_COLORS.platform,
} as const satisfies Record<RocStateName, Record<TokenMode, ToneRamp>>;

export function resolveRocStateTone(
  state: RocStateName,
  mode: TokenMode,
): ToneRamp {
  return ROC_STATE_TONES[state][mode];
}

export function isRocStateName(value: string): value is RocStateName {
  return (ROC_STATE_NAMES as readonly string[]).includes(value);
}

export const ROC_STATE_DISPLAY_STRINGS = {
  healthy: { en: "Healthy", zhTW: "正常" },
  degraded: { en: "Degraded", zhTW: "降級" },
  critical: { en: "Critical", zhTW: "重大" },
  offline: { en: "Offline", zhTW: "失聯" },
  manual_hold: { en: "Manual Hold", zhTW: "人工保留" },
  evidence_hold: { en: "Evidence Hold", zhTW: "證據保全" },
} as const satisfies Record<RocStateName, LocalizedDisplayString>;

/**
 * Nearest `StatusToneName` for callers that drive a status-tone-keyed
 * primitive. The precise ramp is always `ROC_STATE_TONES`; `evidence_hold`
 * has no status-tone twin (it is the indigo governance realm) and is mapped to
 * the cool `info` tone as its closest status-tone hint.
 */
export const ROC_STATE_STATUS_TONE = {
  healthy: "success",
  degraded: "warning",
  critical: "danger",
  offline: "neutral",
  manual_hold: "warning",
  evidence_hold: "info",
} as const satisfies Record<RocStateName, StatusToneName>;

// ─────────────────────────────────────────────────────────────────────────────
// §4.3 alias table (symbolic) — what each roc.* token points at
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verbatim §4.3 mapping in symbolic form, for documentation + the resolution
 * test. Two naming reconciliations vs the packet text: §4.3 wrote
 * `semantic.critical` (this token system names it `danger`) and
 * `semantic.purple / governance` (resolved to the `platform` realm indigo).
 */
export const ROC_TOKEN_ALIAS_TABLE = {
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
} as const;
