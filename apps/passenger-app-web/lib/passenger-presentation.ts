import {
  REALM_COLORS,
  STATUS_TONES,
  CORE_FOREGROUNDS,
  PASSENGER_P5_COLORS,
  PASSENGER_P5_STATUS_TONES,
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
  background: PASSENGER_P5_COLORS.bg,
  brandBg: PASSENGER_P5_COLORS.brandBg,
  headerBg: REALM_COLORS.passenger.light.headerBg,
  card: PASSENGER_P5_COLORS.surface,
  border: PASSENGER_P5_COLORS.line,
  borderSoft: PASSENGER_P5_COLORS.lineSoft,
  text: PASSENGER_P5_COLORS.ink,
  muted: PASSENGER_P5_COLORS.mut,
  dim: PASSENGER_P5_COLORS.dim,
  success: PASSENGER_P5_STATUS_TONES.success,
  warning: PASSENGER_P5_STATUS_TONES.warning,
  danger: PASSENGER_P5_STATUS_TONES.danger,
  info: STATUS_TONES.info.light,
  neutral: PASSENGER_P5_STATUS_TONES.neutral,
  driverRealm: REALM_COLORS.driver.light,
  invert: CORE_FOREGROUNDS.foregroundInvert,
  fontFamily: '"Inter", "Noto Sans TC", system-ui, sans-serif',
  monoFont: PASSENGER_P5_COLORS.mono,
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
