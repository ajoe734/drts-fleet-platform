import type {
  CallRecordingState,
  CallSessionStatus,
  CallbackTaskStatus,
  OwnedOrderStatus,
} from "@drts/contracts";
import type { Locale, Translator } from "./translations";

export function formatDateTime(
  value: string | null | undefined,
  locale: Locale,
  t: Translator,
) {
  if (!value) {
    return t("common.notSet");
  }

  return new Date(value).toLocaleString(locale === "zh" ? "zh-TW" : "en-US");
}

export function formatOrderStatus(status: OwnedOrderStatus, t: Translator) {
  return t(`status.order.${status}`);
}

export function formatCallStatus(status: CallSessionStatus, t: Translator) {
  return t(`status.call.${status}`);
}

export function formatCallbackStatus(
  status: CallbackTaskStatus | null | undefined,
  t: Translator,
) {
  return status ? t(`status.callback.${status}`) : t("status.callback.none");
}

export function formatRecordingState(
  status: CallRecordingState | null | undefined,
  t: Translator,
) {
  return status ? t(`status.recording.${status}`) : t("status.recording.none");
}

export function formatComplianceFlag(flag: string, t: Translator) {
  const key = `status.compliance.${flag}`;
  const translated = t(key);
  return translated === key ? flag : translated;
}

export function formatTraceEventType(eventType: string, t: Translator) {
  const key = `status.trace.${eventType}`;
  const translated = t(key);
  return translated === key ? eventType : translated;
}
