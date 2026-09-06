import type { PartnerChannelEntryRecord } from "@drts/contracts";
import { REALM_COLORS, STATUS_TONES, SURFACE_ACCENTS } from "../../../packages/ui-tokens/src/index";

const defaultEntryHost = "unknown-host";
const pageBg = "#ECEEF3";
const hostChrome = "#1A45AD";
const surface = "#FFFFFF";
const surfaceLo = "#F7F9FC";
const line = "#E5E9F1";
const lineSoft = "#EEF1F7";
const ink = "#10203A";
const ink2 = "#334155";
const muted = "#64748B";
const faint = "#8C96A8";
const sans =
  '"Inter","Noto Sans TC",-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif';
const mono =
  '"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace';

export function buildEmbedTheme(accent: string) {
  return {
    accent,
    pageBg,
    bg: SURFACE_ACCENTS.tenant.light.bg,
    surface,
    surfaceLo,
    line,
    lineSoft,
    ink,
    ink2,
    muted,
    faint,
    sans,
    mono,
    radius: 18,
    radiusSm: 12,
    shadow:
      "0 22px 54px rgba(15, 23, 42, 0.14), 0 2px 8px rgba(15, 23, 42, 0.08)",
    primary: accent,
    primaryHi: hostChrome,
    primaryBg: "#EBF1FE",
    primaryBd: "#C7D9FB",
    tenantFg: REALM_COLORS.tenant.light.fg,
    tenantBg: REALM_COLORS.tenant.light.bg,
    tenantBorder: REALM_COLORS.tenant.light.border,
    infoFg: STATUS_TONES.info.light.fg,
    infoBg: STATUS_TONES.info.light.bg,
    infoBorder: STATUS_TONES.info.light.border,
    warnFg: STATUS_TONES.warning.light.fg,
    warnBg: STATUS_TONES.warning.light.bg,
    warnBorder: STATUS_TONES.warning.light.border,
    dangerFg: STATUS_TONES.danger.light.fg,
    dangerBg: STATUS_TONES.danger.light.bg,
    dangerBorder: STATUS_TONES.danger.light.border,
    successFg: STATUS_TONES.success.light.fg,
    successBg: STATUS_TONES.success.light.bg,
    successBorder: STATUS_TONES.success.light.border,
    neutralFg: STATUS_TONES.neutral.light.fg,
    neutralBg: STATUS_TONES.neutral.light.bg,
    neutralBorder: STATUS_TONES.neutral.light.border,
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
