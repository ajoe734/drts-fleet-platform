import type { TokenMode } from "@drts/ui-tokens";
import { STATUS_TONES } from "@drts/ui-tokens";
import {
  RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS,
  RUNTIME_ENVIRONMENT_TIER_TONE,
  type RuntimeEnvironmentTier,
} from "./runtime-environment";

export interface EnvironmentBadgeProps {
  /** Already-resolved by the caller via `resolveRuntimeEnvironmentTier`. This
   * component never re-derives the tier from a hostname or other guess. */
  tier: RuntimeEnvironmentTier;
  locale: "en" | "zh";
  mode?: TokenMode;
}

export function EnvironmentBadge({
  tier,
  locale,
  mode = "light",
}: EnvironmentBadgeProps) {
  const label =
    locale === "zh"
      ? RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS[tier].zhTW
      : RUNTIME_ENVIRONMENT_TIER_DISPLAY_STRINGS[tier].en;
  const tone = STATUS_TONES[RUNTIME_ENVIRONMENT_TIER_TONE[tier]][mode];

  return (
    <span
      data-environment-tier={tier}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 10px",
        borderRadius: "999px",
        fontSize: "11.5px",
        fontWeight: 600,
        whiteSpace: "nowrap",
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
      }}
    >
      {label}
    </span>
  );
}
