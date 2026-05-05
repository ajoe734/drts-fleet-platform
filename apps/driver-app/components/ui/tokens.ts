const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  20: 20,
  24: 24,
} as const;

const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  full: 9999,
  4: 4,
  6: 6,
  8: 8,
  9999: 9999,
} as const;

export const Tokens = {
  colors: {
    // Surface
    appBg: "#F5F7FA",
    surface: "#FFFFFF",
    surfaceMuted: "#EEF2F6",
    surfaceWarning: "#FFF7E6",
    surfaceDanger: "#FFF1F2",

    // Text
    textStrong: "#17202A",
    textBody: "#344054",
    textMuted: "#667085",
    textInverse: "#FFFFFF",

    // Action
    primary: "#0B63CE",
    primaryPressed: "#0956B3",
    danger: "#C81E1E",
    success: "#18864B",
    warning: "#B7791F",

    // Border
    border: "#D8DEE7",
    borderStrong: "#B8C0CC",
  },
  radius,
  spacing,
  type: {
    screenTitle: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "700" as const,
    },
    sectionTitle: {
      fontSize: 18,
      lineHeight: 24,
      fontWeight: "600" as const,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
    },
    label: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: "500" as const,
    },
    micro: {
      fontSize: 12,
      lineHeight: 16,
    },
  },
  layout: {
    pagePadding: 16,
    headerHeight: 56,
  },
};

export const tokens = Tokens;
