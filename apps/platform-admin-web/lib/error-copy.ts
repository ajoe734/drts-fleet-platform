import { formatPlatformCodeLabel } from "./localized-labels";
import type { Locale } from "./translations";

const CJK_TEXT_PATTERN = /[\u3400-\u9fff]/;

export function toPlatformErrorMessage(
  error: unknown,
  fallback = "Unknown error",
) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function classifyPlatformErrorReason(
  message: string | null | undefined,
) {
  if (!message) {
    return "fetch_failed";
  }

  if (
    /permission|forbidden|unauthor|401|403|權限|禁止|未授權|存取/i.test(message)
  ) {
    return "permission_denied";
  }

  if (
    /not[\s_-]*provisioned|provision|bootstrap|module|not configured|尚未配置|未佈建|未開通|未啟用/i.test(
      message,
    )
  ) {
    return "not_provisioned";
  }

  if (
    /external|upstream|dependency|gateway|timeout|network|adapter|unavailable|down|\b50\d\b|http 5\d\d|外部|上游|相依|閘道|逾時|超時|網路|介接器|連線/i.test(
      message,
    )
  ) {
    return "external_unavailable";
  }

  return "fetch_failed";
}

export function formatPlatformErrorReasonLabel(
  locale: Locale,
  message: string | null | undefined,
) {
  return formatPlatformCodeLabel(locale, classifyPlatformErrorReason(message));
}

export function formatPlatformUiError(
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
    !/permission|forbidden|unauthor|external|upstream|dependency|gateway|timeout|network|adapter|unavailable|error|exception|status|http/i.test(
      resolved,
    )
  ) {
    return resolved;
  }

  const reason = formatPlatformErrorReasonLabel(locale, resolved);
  return locale === "en"
    ? `${fallbackAction}: ${reason}.`
    : `${fallbackAction}：${reason}。`;
}
