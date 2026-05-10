export const DENSITY_NAMES = ["compact", "comfortable"] as const;

export type DensityName = (typeof DENSITY_NAMES)[number];

export interface DensityScale {
  readonly rowHeight: number;
  readonly cellPaddingY: number;
  readonly cellPaddingX: number;
  readonly sectionGap: number;
  readonly cardPadding: number;
  readonly baseFontSize: number;
  readonly titleFontSize: number;
  readonly sectionTitleFontSize: number;
  readonly eyebrowFontSize: number;
}

export const DENSITY_SCALES = {
  compact: {
    rowHeight: 34,
    cellPaddingY: 7,
    cellPaddingX: 12,
    sectionGap: 14,
    cardPadding: 14,
    baseFontSize: 13,
    titleFontSize: 20,
    sectionTitleFontSize: 15,
    eyebrowFontSize: 11,
  },
  comfortable: {
    rowHeight: 44,
    cellPaddingY: 10,
    cellPaddingX: 14,
    sectionGap: 18,
    cardPadding: 18,
    baseFontSize: 14,
    titleFontSize: 22,
    sectionTitleFontSize: 17,
    eyebrowFontSize: 11.5,
  },
} as const satisfies Record<DensityName, DensityScale>;
