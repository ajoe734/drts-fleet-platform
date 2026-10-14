import {
  REALM_COLORS,
  CORE_SURFACES,
  CORE_FOREGROUNDS,
  type ToneRamp,
} from "@drts/ui-tokens";
import {
  resolvePassengerScreenId,
  type PassengerBadgeTone,
} from "@drts/passenger-client";

export { resolvePassengerScreenId };

export type PassengerDataMode = "fixture" | "live";

export const passengerChrome = {
  shell: REALM_COLORS.passenger.light.fg,
  shellDark: REALM_COLORS.passenger.light.headerBg,
  background: "#F3F5F8",
  brandBg: REALM_COLORS.passenger.light.bg,
  headerBg: REALM_COLORS.passenger.light.headerBg,
  card: CORE_SURFACES.surface,
  border: "#E3E8EE",
  borderSoft: "#EDF1F5",
  text: "#16212C",
  muted: "#5A6A7B",
  dim: "#93A0AE",
  success: { fg: "#1B7F4D", bg: "#E9F5EF", border: "#BFE3D0" as const },
  warning: { fg: "#A86407", bg: "#FBF2DF", border: "#EAD3A4" as const },
  danger: { fg: "#C03A2E", bg: "#FBECEA", border: "#EFC8C2" as const },
  info: { fg: "#0B5CAB", bg: "#EAF2FB", border: "#0B5CAB" as const },
  neutral: { fg: "#5A6A7B", bg: "#F3F5F8", border: "#E3E8EE" as const },
  driverRealm: REALM_COLORS.driver.light,
  invert: CORE_FOREGROUNDS.foregroundInvert,
  fontFamily: '"Inter", "Noto Sans TC", system-ui, sans-serif',
  monoFont: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  shadow: "0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)",
};

export const passengerTheme = {
  surface: passengerChrome.card,
  border: passengerChrome.border,
  borderStrong: passengerChrome.border,
  text: passengerChrome.text,
  textMuted: passengerChrome.muted,
  textDim: passengerChrome.dim,
  invert: passengerChrome.invert,
  shadow: passengerChrome.shadow,
  fontFamily: passengerChrome.fontFamily,
  monoFamily: passengerChrome.monoFont,
};

export function getPassengerFixtureSourceLabel(
  mode: PassengerDataMode,
): string {
  return mode === "live" ? "Live SSE" : "Fixture preview";
}

export function getPassengerSourceCallout(mode: PassengerDataMode) {
  return mode === "live"
    ? {
        tone: passengerChrome.info,
        title: "Live mode",
        detail:
          "目前由 passenger-rides API 與版本化 SSE 提供即時權威資料，不會回退到假 rating 或外部平台資訊。",
      }
    : {
        tone: passengerChrome.warning,
        title: "Fixture preview",
        detail: "僅供非正式環境檢視畫面；production 建置與執行均禁止 fixture。",
      };
}

export function getToneRamp(tone: PassengerBadgeTone): ToneRamp {
  switch (tone) {
    case "success":
      return passengerChrome.success;
    case "warning":
      return passengerChrome.warning;
    case "danger":
      return passengerChrome.danger;
    case "info":
    default:
      return passengerChrome.info;
  }
}
