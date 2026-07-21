import { REALM_COLORS, STATUS_TONES, type ToneRamp } from "@drts/ui-tokens";
import { buildCanvasTheme } from "@drts/ui-web";
import {
  getPassengerRideFixture,
  PASSENGER_SCREEN_IDS,
  type PassengerBadgeTone,
  type PassengerRideFixture,
  type PassengerScreenId,
} from "./passenger-fixtures";
import { type PassengerDataMode } from "./runtime-config";

export const passengerTheme = buildCanvasTheme({
  surface: "enterprise",
  density: "compact",
});

export const passengerChrome = {
  shell: passengerTheme.accent,
  shellDark: passengerTheme.accentHi,
  background: passengerTheme.bg,
  card: passengerTheme.surface,
  border: passengerTheme.border,
  borderStrong: passengerTheme.borderStrong,
  text: passengerTheme.text,
  muted: passengerTheme.textMuted,
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
          "預留 passenger-rides SSE 接口；目前未回退到假 rating 或外部平台資訊。",
      }
    : {
        tone: passengerChrome.warning,
        title: "Fixture preview",
        detail:
          "目前以 fixture 模擬 passenger-rides 契約與 SSE 事件，正式上線前切換為 live。",
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

export function resolvePassengerScreenId(
  value: string | string[] | undefined,
  kind: "ride" | "fares",
): PassengerScreenId {
  const normalized = Array.isArray(value) ? value[0] : value;
  if (
    normalized &&
    PASSENGER_SCREEN_IDS.includes(normalized as PassengerScreenId)
  ) {
    return normalized as PassengerScreenId;
  }

  return kind === "fares" ? "A03" : "P5-01";
}

export function resolvePassengerRideFixture(
  token: string,
  kind: "ride" | "fares",
  screenParam: string | string[] | undefined,
): PassengerRideFixture {
  const screenId = resolvePassengerScreenId(screenParam, kind);
  return getPassengerRideFixture(screenId, token);
}
