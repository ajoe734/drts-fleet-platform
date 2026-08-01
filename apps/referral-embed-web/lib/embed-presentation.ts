import type { PartnerChannelEntryRecord } from "@drts/contracts";
import { REALM_COLORS, STATUS_TONES, SURFACE_ACCENTS } from "@drts/ui-tokens";

const defaultEntryHost = "unknown-host";

const EMBED_TYPOGRAPHY = {
  sans:
    '"Inter","Noto Sans TC",-apple-system,BlinkMacSystemFont,system-ui,sans-serif',
  mono: '"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace',
} as const;

const EMBED_CANVAS_LIGHT = {
  pageBg: "#ECEEF3",
  shellBg: "#F4F6FA",
  surface: "#FFFFFF",
  surfaceLo: "#F7F9FC",
  text: "#19223A",
  textMuted: "#6B7689",
  textDim: "#43506B",
  textFaint: "#98A2B3",
  line: "#E5E9F1",
  lineSoft: "#EEF1F7",
  frameBorder: "#D8DEE9",
  frameShadow: "0 18px 50px rgba(20,30,60,.14)",
  cardShadow: "0 1px 2px rgba(16,24,40,.06)",
  hostBlue: "#1A45AD",
} as const;

export type EmbedTheme = ReturnType<typeof buildEmbedTheme>;

export function buildEmbedTheme(accent: string) {
  const brand = {
    fg: accent,
    hi: SURFACE_ACCENTS.tenant.light.hi,
    bg: REALM_COLORS.tenant.light.bg,
    border: REALM_COLORS.tenant.light.border,
  };

  return {
    typography: EMBED_TYPOGRAPHY,
    pageBg: EMBED_CANVAS_LIGHT.pageBg,
    shellBg: EMBED_CANVAS_LIGHT.shellBg,
    surface: EMBED_CANVAS_LIGHT.surface,
    surfaceLo: EMBED_CANVAS_LIGHT.surfaceLo,
    text: EMBED_CANVAS_LIGHT.text,
    textMuted: EMBED_CANVAS_LIGHT.textMuted,
    textDim: EMBED_CANVAS_LIGHT.textDim,
    textFaint: EMBED_CANVAS_LIGHT.textFaint,
    line: EMBED_CANVAS_LIGHT.line,
    lineSoft: EMBED_CANVAS_LIGHT.lineSoft,
    frameBorder: EMBED_CANVAS_LIGHT.frameBorder,
    frameShadow: EMBED_CANVAS_LIGHT.frameShadow,
    cardShadow: EMBED_CANVAS_LIGHT.cardShadow,
    invert: "#FFFFFF",
    hostChrome: {
      bg: EMBED_CANVAS_LIGHT.hostBlue,
      fg: "#FFFFFF",
      chipBg: "rgba(255,255,255,.14)",
      buttonBg: "rgba(255,255,255,.16)",
    },
    brand,
    status: {
      info: STATUS_TONES.info.light,
      warn: STATUS_TONES.warning.light,
      danger: STATUS_TONES.danger.light,
      success: STATUS_TONES.success.light,
      neutral: STATUS_TONES.neutral.light,
    },
    buttonShadow: `0 10px 24px ${accent}3d`,
  };
}

export function getEntryHost(entry: PartnerChannelEntryRecord) {
  return entry.entryHost?.trim() || defaultEntryHost;
}

export function resolveAccent(entry: PartnerChannelEntryRecord) {
  return (
    entry.themeAccent?.trim() ||
    entry.brandingMetadata?.themeAccent?.trim() ||
    SURFACE_ACCENTS.tenant.light.fg
  );
}
