import type { PartnerChannelEntryRecord } from "@drts/contracts";
import { REALM_COLORS, STATUS_TONES, SURFACE_ACCENTS } from "@drts/ui-tokens";

const defaultEntryHost = "unknown-host";

export function buildEmbedTheme(accent: string) {
  return {
    accent,
    accentHi: accent,
    accentSoft: `${accent}22`,
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
