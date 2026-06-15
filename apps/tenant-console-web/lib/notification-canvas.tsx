import type { CSSProperties } from "react";
import type { EmptyReason, RefreshTier } from "@drts/contracts";
import type { CanvasTheme } from "@drts/ui-web";

/**
 * Local canvas display metadata for the tenant-console /notifications screen.
 *
 * The canonical enums (`EmptyReason`, `RefreshTier`, `ActionRiskLevel`) live in
 * `@drts/contracts`. All page-facing display copy — empty-reason labels/hints,
 * refresh-tier and risk-level descriptions — is centralised in
 * `lib/translations.ts` and read through `t()` at the call site, so this module
 * only retains the locale-independent tier code tokens (Q-X02) the
 * `/notifications` screen still references directly.
 */

export type CanvasEmptyReason = EmptyReason;

export interface CanvasRefreshTierMeta {
  /** Tenant-console tier code (Q-X02), locale-independent. */
  code: string;
}

export const CANVAS_REFRESH_TIERS: Record<RefreshTier, CanvasRefreshTierMeta> = {
  urgent: { code: "T0" },
  fast: { code: "T1" },
  dispatch: { code: "T2" },
  medium: { code: "T3" },
  medium_slow: { code: "T4" },
  slow: { code: "T5" },
  manual: { code: "T6" },
};

export interface CanvasToggleProps {
  theme: CanvasTheme;
  on: boolean;
  label?: string;
}

/**
 * Read-only on/off indicator styled as a switch. The /notifications screen is a
 * server-rendered snapshot (T5 cadence), so this renders state only — mutation
 * happens through the `update_subscription` action / save CTA, not by toggling
 * here.
 */
export function CanvasToggle({ theme, on, label }: CanvasToggleProps) {
  const trackStyle: CSSProperties = {
    position: "relative",
    width: 30,
    height: 16,
    borderRadius: 999,
    background: on ? theme.accent : theme.neutralBg,
    border: `1px solid ${on ? theme.accentBorder : theme.border}`,
    flex: "0 0 auto",
    transition: "background 120ms ease",
  };
  const knobStyle: CSSProperties = {
    position: "absolute",
    top: 1,
    left: on ? 15 : 1,
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: on ? theme.invert : theme.textMuted,
    transition: "left 120ms ease",
  };
  const wrapStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
  const labelStyle: CSSProperties = {
    fontFamily: theme.monoFamily,
    fontSize: 11,
    color: on ? theme.text : theme.textDim,
  };
  return (
    <span style={wrapStyle} role="img" aria-label={on ? "on" : "off"}>
      <span style={trackStyle}>
        <span style={knobStyle} />
      </span>
      {label ? <span style={labelStyle}>{label}</span> : null}
    </span>
  );
}
