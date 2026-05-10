export type TokenMode = "light" | "dark";
export type ConsoleAccentName = "platform" | "ops" | "tenant" | "partner";
export type AuthorityKind = "owned" | "forwarded";
export type StatusToneName =
  | "info"
  | "warning"
  | "success"
  | "danger"
  | "neutral";

export interface ToneRamp {
  readonly fg: string;
  readonly bg: string;
  readonly border: string;
}

export interface AccentRamp extends ToneRamp {
  readonly hi: string;
}

export const OWNED = {
  light: {
    fg: "#0F4C75",
    bg: "#E6F0F8",
    border: "#BBD3E6",
  },
  dark: {
    fg: "#7BC0FF",
    bg: "#0F2236",
    border: "#1B3A5A",
  },
} as const satisfies Record<TokenMode, ToneRamp>;

export const FORWARDED = {
  light: {
    fg: "#B45309",
    bg: "#FEF3E2",
    border: "#F4D9A6",
  },
  dark: {
    fg: "#FBBF24",
    bg: "#3A2A0A",
    border: "#5C4218",
  },
} as const satisfies Record<TokenMode, ToneRamp>;

export const AUTHORITY_COLORS = {
  owned: OWNED,
  forwarded: FORWARDED,
} as const satisfies Record<AuthorityKind, Record<TokenMode, ToneRamp>>;

export const SURFACE_ACCENTS = {
  platform: {
    light: {
      fg: "#4F46E5",
      hi: "#6366F1",
      bg: "#EEF2FF",
      border: "#C7D2FE",
    },
    dark: {
      fg: "#A5B4FC",
      hi: "#C7D2FE",
      bg: "#1E1B4B",
      border: "#312E81",
    },
  },
  ops: {
    light: {
      fg: "#DC2626",
      hi: "#EF4444",
      bg: "#FEF2F2",
      border: "#FECACA",
    },
    dark: {
      fg: "#FCA5A5",
      hi: "#FECACA",
      bg: "#3F1212",
      border: "#5C1A1A",
    },
  },
  tenant: {
    light: {
      fg: "#0F766E",
      hi: "#14B8A6",
      bg: "#F0FDFA",
      border: "#99F6E4",
    },
    dark: {
      fg: "#5EEAD4",
      hi: "#99F6E4",
      bg: "#0F2A28",
      border: "#134E48",
    },
  },
  partner: {
    light: {
      fg: "#B45309",
      hi: "#D97706",
      bg: "#FFFBEB",
      border: "#FDE68A",
    },
    dark: {
      fg: "#FCD34D",
      hi: "#FDE68A",
      bg: "#3A2A0A",
      border: "#5C4218",
    },
  },
} as const satisfies Record<ConsoleAccentName, Record<TokenMode, AccentRamp>>;

export const STATUS_TONES = {
  info: {
    light: {
      fg: "#1F5DB8",
      bg: "#E4EDFB",
      border: "#B6CBEC",
    },
    dark: {
      fg: "#93C5FD",
      bg: "#0F1F36",
      border: "#1E3A5F",
    },
  },
  warning: {
    light: {
      fg: "#A8590B",
      bg: "#FCEED6",
      border: "#F0CC95",
    },
    dark: {
      fg: "#FBBF24",
      bg: "#2D1F08",
      border: "#5C4218",
    },
  },
  success: {
    light: {
      fg: "#0F7B5A",
      bg: "#E5F4ED",
      border: "#A7D7C2",
    },
    dark: {
      fg: "#34D399",
      bg: "#0E2A1F",
      border: "#1F4D38",
    },
  },
  danger: {
    light: {
      fg: "#B42318",
      bg: "#FEE4E2",
      border: "#F8B3AC",
    },
    dark: {
      fg: "#F87171",
      bg: "#2C100E",
      border: "#5C1F1A",
    },
  },
  neutral: {
    light: {
      fg: "#475569",
      bg: "#F1F4F8",
      border: "#CBD5E1",
    },
    dark: {
      fg: "#94A3B8",
      bg: "#1A2230",
      border: "#2A3445",
    },
  },
} as const satisfies Record<StatusToneName, Record<TokenMode, ToneRamp>>;

export const TOKEN_MODES = [
  "light",
  "dark",
] as const satisfies readonly TokenMode[];
export const CONSOLE_ACCENT_NAMES = [
  "platform",
  "ops",
  "tenant",
  "partner",
] as const satisfies readonly ConsoleAccentName[];
export const AUTHORITY_KINDS = [
  "owned",
  "forwarded",
] as const satisfies readonly AuthorityKind[];
export const STATUS_TONE_NAMES = [
  "info",
  "warning",
  "success",
  "danger",
  "neutral",
] as const satisfies readonly StatusToneName[];
