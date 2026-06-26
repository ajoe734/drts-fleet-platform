import type { SandboxFulfillmentProjectionView } from "@drts/contracts";

export const PASSENGER_FALLBACK_SCREENS = [
  "fb_vehicle_change",
  "fb_human_assigned",
  "fb_service_continuing",
  "fb_eta_updated",
] as const;

export type PassengerFallbackScreen =
  (typeof PASSENGER_FALLBACK_SCREENS)[number];

export type PassengerFallbackStage =
  | "vehicle_change_in_progress"
  | "human_fallback_assigned"
  | "service_continuing";

export type PassengerFallbackTone = "warn" | "success";

export type PassengerFallbackIcon =
  | "refresh"
  | "user"
  | "check"
  | "clock";

export type PassengerFallbackView = {
  screen: PassengerFallbackScreen;
  tone: PassengerFallbackTone;
  icon: PassengerFallbackIcon;
  progressStage: PassengerFallbackStage | null;
  messageCode: string;
  copyCode: string;
  etaMinutes: number | null;
};

type PassengerFallbackConfig = Omit<
  PassengerFallbackView,
  "messageCode" | "copyCode" | "etaMinutes"
> & {
  defaultMessageCode: string;
  fallbackEtaMinutes: number | null;
};

export const PASSENGER_STATUS_UPDATE_CODE =
  "sandbox_fulfillment.status_update_available";
export const PASSENGER_HUMAN_CONTINUING_CODE =
  "sandbox_fulfillment.service_continues_with_human_driver";
export const PASSENGER_HUMAN_FALLBACK_ACTIVE_CODE =
  "sandbox_fulfillment.human_fallback_active";

const PASSENGER_FALLBACK_CONFIG = {
  fb_vehicle_change: {
    screen: "fb_vehicle_change",
    tone: "warn",
    icon: "refresh",
    progressStage: "vehicle_change_in_progress",
    defaultMessageCode: PASSENGER_STATUS_UPDATE_CODE,
    fallbackEtaMinutes: null,
  },
  fb_human_assigned: {
    screen: "fb_human_assigned",
    tone: "success",
    icon: "user",
    progressStage: "human_fallback_assigned",
    defaultMessageCode: PASSENGER_STATUS_UPDATE_CODE,
    fallbackEtaMinutes: 7,
  },
  fb_service_continuing: {
    screen: "fb_service_continuing",
    tone: "success",
    icon: "check",
    progressStage: "service_continuing",
    defaultMessageCode: PASSENGER_HUMAN_CONTINUING_CODE,
    fallbackEtaMinutes: 4,
  },
  fb_eta_updated: {
    screen: "fb_eta_updated",
    tone: "warn",
    icon: "clock",
    progressStage: null,
    defaultMessageCode: PASSENGER_STATUS_UPDATE_CODE,
    fallbackEtaMinutes: 9,
  },
} as const satisfies Record<PassengerFallbackScreen, PassengerFallbackConfig>;

export function isPassengerFallbackScreen(
  value: string,
): value is PassengerFallbackScreen {
  return (PASSENGER_FALLBACK_SCREENS as readonly string[]).includes(value);
}

export function normalizePassengerMessageCode(code: string) {
  if (code === PASSENGER_HUMAN_FALLBACK_ACTIVE_CODE) {
    return PASSENGER_HUMAN_CONTINUING_CODE;
  }

  return code;
}

export function resolvePassengerFallbackView(input: {
  screen: PassengerFallbackScreen;
  projection: Pick<SandboxFulfillmentProjectionView, "messages" | "etaMinutes">;
}): PassengerFallbackView {
  const config = PASSENGER_FALLBACK_CONFIG[input.screen];
  const messageCode =
    input.projection.messages[0]?.messageCode ?? config.defaultMessageCode;
  const etaMinutes =
    config.fallbackEtaMinutes === null
      ? null
      : (input.projection.etaMinutes ?? config.fallbackEtaMinutes);

  return {
    screen: input.screen,
    tone: config.tone,
    icon: config.icon,
    progressStage: config.progressStage,
    messageCode,
    copyCode: normalizePassengerMessageCode(messageCode),
    etaMinutes,
  };
}

export function buildPassengerMessageTitleKey(
  code: string,
  screen: PassengerFallbackScreen,
) {
  return `passengerMessageCode.${normalizePassengerMessageCode(code)}.${screen}.title`;
}

export function buildPassengerMessageBodyKey(
  code: string,
  screen: PassengerFallbackScreen,
) {
  return `passengerMessageCode.${normalizePassengerMessageCode(code)}.${screen}.body`;
}
