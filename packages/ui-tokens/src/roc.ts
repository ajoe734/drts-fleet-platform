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
 * Every `roc.*` alias here resolves, BY REFERENCE, to an EXISTING token — the
 * maps below point at the shared `STATUS_TONES` / `REALM_COLORS` ramps; they
 * never re-declare a new hex palette.
 *
 * Surfaces (`roc.surface.canvas/panel/elevated` -> `control.surface.*`) are NOT
 * redefined here. The neutral dark control-plane canvas already exists in
 * `@drts/ui-web` (`CANVAS_DARK_NAVY_PALETTE` / `CANVAS_LIGHT_PALETTE`, consumed
 * via `buildCanvasTheme({ surface: "roc", dark: true })`): `roc.surface.canvas`
 * is that theme's `bg`, `roc.surface.panel` its `surface`, `roc.surface.elevated`
 * its `surfaceHi`. Duplicating those hex values in the token layer would create a
 * second source of truth, so this file only records the surface mapping
 * symbolically in `ROC_TOKEN_ALIAS_TABLE` and leaves the canvas as the single
 * source. ROC differs from Ops only in its blue/cyan *accent* (wired in
 * `@drts/ui-web` `canvas-tokens.ts` as the `roc` surface accent) so duty staff
 * can tell the two control-plane apps apart.
 *
 * §4.3 hard rule: status colour expresses state only, never decoration; it must
 * always be paired with text + icon + shape, and every status token must pass
 * the colour-blind / weak-colour contrast test (see
 * `tests/unit/p2-dp-c2-roc-tokens.test.ts`).
 */

// ─────────────────────────────────────────────────────────────────────────────
// roc.surface.* (symbolic) — realised by the shared @drts/ui-web canvas
// ─────────────────────────────────────────────────────────────────────────────

export type RocSurfaceName = "canvas" | "panel" | "elevated";

export const ROC_SURFACE_NAMES = [
  "canvas",
  "panel",
  "elevated",
] as const satisfies readonly RocSurfaceName[];

/**
 * The `@drts/ui-web` `CanvasTheme` palette field each `roc.surface.*` token maps
 * onto. This is a symbolic reference to the existing canvas (the single source
 * of the neutral surfaces), NOT a redefinition of the colours.
 */
export const ROC_SURFACE_CANVAS_FIELD = {
  canvas: "bg",
  panel: "surface",
  elevated: "surfaceHi",
} as const satisfies Record<RocSurfaceName, string>;

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
 * test. The surface rows point at `control.surface.*` — realised by the shared
 * `@drts/ui-web` control-plane canvas (see `ROC_SURFACE_CANVAS_FIELD`), not
 * redefined as hex in this package. Two naming reconciliations vs the packet
 * text: §4.3 wrote `semantic.critical` (this token system names it `danger`)
 * and `semantic.purple / governance` (resolved to the `platform` realm indigo).
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
