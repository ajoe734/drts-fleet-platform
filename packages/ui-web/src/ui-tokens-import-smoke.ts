import {
  DENSITY_SCALES,
  DISPLAY_STRINGS,
  STATUS_DISPLAY_STRINGS,
  STATUS_TONE_BY_VALUE,
  SURFACE_ACCENTS,
} from "@drts/ui-tokens";

export const uiTokensImportSmoke = {
  accentBorder: SURFACE_ACCENTS.platform.light.border,
  densityRowHeight: DENSITY_SCALES.compact.rowHeight,
  forwardedLabel: STATUS_DISPLAY_STRINGS.accept_pending.zhTW,
  forwardedTone: STATUS_TONE_BY_VALUE.sync_failed,
  surfaceName: DISPLAY_STRINGS.surfaces.ops.en,
} as const;
