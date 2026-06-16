import { REALM_COLORS, STATUS_TONES, SURFACE_ACCENTS } from "@drts/ui-tokens";

function hexToRgbTriplet(hex: string) {
  const normalized = hex.replace("#", "");
  const sized =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : normalized;

  const red = Number.parseInt(sized.slice(0, 2), 16);
  const green = Number.parseInt(sized.slice(2, 4), 16);
  const blue = Number.parseInt(sized.slice(4, 6), 16);

  return `${red} ${green} ${blue}`;
}

const tenantLight = SURFACE_ACCENTS.tenant.light;
const tenantDark = SURFACE_ACCENTS.tenant.dark;
const neutralLight = STATUS_TONES.neutral.light;
const warningLight = STATUS_TONES.warning.light;
const dangerLight = STATUS_TONES.danger.light;
const systemLight = REALM_COLORS.system.light;

export const conciergeThemeStyle = {
  "--bg-base": neutralLight.bg,
  "--bg-base-rgb": hexToRgbTriplet(neutralLight.bg),
  "--bg-wash": tenantLight.bg,
  "--bg-wash-rgb": hexToRgbTriplet(tenantLight.bg),
  "--ink": neutralLight.fg,
  "--ink-rgb": hexToRgbTriplet(neutralLight.fg),
  "--muted": systemLight.fg,
  "--muted-rgb": hexToRgbTriplet(systemLight.fg),
  "--shell": tenantDark.bg,
  "--shell-rgb": hexToRgbTriplet(tenantDark.bg),
  "--shell-strong": tenantDark.border,
  "--shell-strong-rgb": hexToRgbTriplet(tenantDark.border),
  "--sidebar-ink": tenantDark.fg,
  "--sidebar-ink-rgb": hexToRgbTriplet(tenantDark.fg),
  "--sidebar-border": tenantLight.border,
  "--sidebar-border-rgb": hexToRgbTriplet(tenantLight.border),
  "--panel": neutralLight.bg,
  "--panel-rgb": hexToRgbTriplet(neutralLight.bg),
  "--panel-border": neutralLight.border,
  "--panel-border-rgb": hexToRgbTriplet(neutralLight.border),
  "--accent": tenantLight.fg,
  "--accent-rgb": hexToRgbTriplet(tenantLight.fg),
  "--accent-hi": tenantLight.hi,
  "--accent-hi-rgb": hexToRgbTriplet(tenantLight.hi),
  "--accent-border": tenantLight.border,
  "--accent-border-rgb": hexToRgbTriplet(tenantLight.border),
  "--warning": warningLight.fg,
  "--warning-rgb": hexToRgbTriplet(warningLight.fg),
  "--warning-bg": warningLight.bg,
  "--warning-bg-rgb": hexToRgbTriplet(warningLight.bg),
  "--warning-border": warningLight.border,
  "--warning-border-rgb": hexToRgbTriplet(warningLight.border),
  "--danger": dangerLight.fg,
  "--danger-rgb": hexToRgbTriplet(dangerLight.fg),
  "--danger-bg": dangerLight.bg,
  "--danger-bg-rgb": hexToRgbTriplet(dangerLight.bg),
  "--danger-border": dangerLight.border,
  "--danger-border-rgb": hexToRgbTriplet(dangerLight.border),
  "--shadow-rgb": hexToRgbTriplet(tenantDark.bg),
} as const;
