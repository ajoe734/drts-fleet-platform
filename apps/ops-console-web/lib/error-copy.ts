import type { EmptyReason } from "@drts/contracts";
import { formatOpsCodeLabel } from "./localized-labels";
import type { Locale } from "./translations";

const CJK_TEXT_PATTERN = /[\u3400-\u9fff]/;

export function toOpsErrorMessage(error: unknown, fallback = "Unknown error") {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function classifyOpsErrorReason(
  message: string | null | undefined,
): EmptyReason {
  if (!message) {
    return "fetch_failed";
  }

  if (
    /permission|forbidden|unauthor|401|403|權限|禁止|未授權|存取/i.test(message)
  ) {
    return "permission_denied";
  }

  if (
    /not[\s_-]*provisioned|provision|bootstrap|module|not configured|尚未開通|未佈建|未配置|未啟用/i.test(
      message,
    )
  ) {
    return "not_provisioned";
  }

  if (
    /external|upstream|dependency|gateway|timeout|network|adapter|telephony|cti|recording|unavailable|down|\b50\d\b|http 5\d\d|外部|上游|相依|閘道|逾時|超時|網路|介接器|錄音|電話|連線/i.test(
      message,
    )
  ) {
    return "external_unavailable";
  }

  return "fetch_failed";
}

export function formatOpsErrorReasonLabel(
  locale: Locale,
  message: string | null | undefined,
) {
  return formatOpsCodeLabel(locale, classifyOpsErrorReason(message));
}

export function formatOpsErrorSummary(
  locale: Locale,
  scopeLabel: string,
  message: string | null | undefined,
) {
  const reason = formatOpsErrorReasonLabel(locale, message);
  return locale === "en"
    ? `${scopeLabel}: ${reason}`
    : `${scopeLabel}：${reason}`;
}

export function formatOpsUiError(
  locale: Locale,
  message: string | null | undefined,
  actionLabel?: string,
) {
  const resolved = message?.trim() ?? "";
  const fallbackAction =
    actionLabel ?? (locale === "en" ? "Request failed" : "請求失敗");

  if (!resolved) {
    return locale === "en" ? `${fallbackAction}.` : `${fallbackAction}。`;
  }

  if (
    CJK_TEXT_PATTERN.test(resolved) &&
    !/permission|forbidden|unauthor|external|upstream|dependency|gateway|timeout|network|adapter|telephony|cti|recording|unavailable|error|exception|status|http/i.test(
      resolved,
    )
  ) {
    return resolved;
  }

  const reason = formatOpsErrorReasonLabel(locale, resolved);
  return locale === "en"
    ? `${fallbackAction}: ${reason}.`
    : `${fallbackAction}：${reason}。`;
}
