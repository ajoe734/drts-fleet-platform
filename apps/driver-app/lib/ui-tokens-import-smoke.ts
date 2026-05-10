import {
  AUTHORITY_COLORS,
  DENSITY_SCALES,
  DISPLAY_STRINGS,
  STATUS_DISPLAY_STRINGS,
  STATUS_VOCABULARY,
} from "@drts/ui-tokens";

export const uiTokensImportSmoke = {
  authorityBorder: AUTHORITY_COLORS.forwarded.dark.border,
  densityGap: DENSITY_SCALES.comfortable.sectionGap,
  firstStatus: STATUS_VOCABULARY[0],
  ownedLabel: DISPLAY_STRINGS.authority.owned.zhTW,
  receivedLabel: STATUS_DISPLAY_STRINGS.received.zhTW,
} as const;
