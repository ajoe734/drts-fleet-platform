import type { StatusToneName } from "./colors";
import type { LocalizedDisplayString } from "./status";

/**
 * Risk levels — design canvas mgmt-tokens.jsx `RISK_LEVELS` (authority-doc
 * Q-X09). Drives the confirmation pattern and the badge tone shown on
 * risk-bearing CTAs across the management consoles.
 */
export type RiskLevel = "low" | "medium" | "high";

export const RISK_LEVELS = [
  "low",
  "medium",
  "high",
] as const satisfies readonly RiskLevel[];

export const RISK_TONE_BY_LEVEL = {
  low: "success",
  medium: "warning",
  high: "danger",
} as const satisfies Record<RiskLevel, StatusToneName>;

export const RISK_DISPLAY_STRINGS = {
  low: { en: "Low risk", zhTW: "低風險" },
  medium: { en: "Medium risk", zhTW: "中風險" },
  high: { en: "High risk", zhTW: "高風險" },
} as const satisfies Record<RiskLevel, LocalizedDisplayString>;

export function isRiskLevel(value: string): value is RiskLevel {
  return (RISK_LEVELS as readonly string[]).includes(value);
}
