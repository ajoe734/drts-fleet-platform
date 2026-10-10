import { REALM_COLORS, STATUS_TONES, type ToneRamp } from "@drts/ui-tokens";
import { buildCanvasTheme } from "@drts/ui-web";
import { type PassengerDataMode } from "./runtime-config";
import {
  resolvePassengerScreenId,
  type PassengerBadgeTone,
} from "@drts/passenger-client";

export { resolvePassengerScreenId };

export const passengerTheme = buildCanvasTheme({
  surface: "tenant",
  density: "compact",
});

export const passengerChrome = {
  shell: REALM_COLORS.passenger.light.fg,
  shellDark: REALM_COLORS.passenger.light.fg, // fallback
  background: REALM_COLORS.passenger.light.bg,
  headerBg: REALM_COLORS.passenger.light.headerBg,
  card: passengerTheme.surface,
  border: "#E3E8EE",
  borderStrong: passengerTheme.borderStrong,
  text: "#16212C",
  muted: "#5A6A7B",
  dim: passengerTheme.textDim,
  success: STATUS_TONES.success.light,
  warning: STATUS_TONES.warning.light,
  danger: STATUS_TONES.danger.light,
  info: STATUS_TONES.info.light,
  neutral: STATUS_TONES.neutral.light,
  driverRealm: REALM_COLORS.driver.light,
  invert: passengerTheme.invert,
  shadow: passengerTheme.shadow,
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
