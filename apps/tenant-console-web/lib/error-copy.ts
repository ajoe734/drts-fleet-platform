import type { EmptyReason } from "@drts/contracts";
import { formatTenantCodeLabel } from "./localized-labels";

const CJK_TEXT_PATTERN = /[\u3400-\u9fff]/;

export function toTenantErrorMessage(error: unknown, fallback = "未知錯誤") {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return fallback;
}

export function classifyTenantErrorReason(
  message: string | null | undefined,
): EmptyReason {
  if (!message) {
    return "fetch_failed";
  }

  if (/permission|forbidden|unauthorized|401|403/i.test(message)) {
    return "permission_denied";
  }

  if (
    /external|upstream|dependency|gateway|timeout|temporar|unavailable|refused|identity|session|oauth|oidc/i.test(
      message,
    )
  ) {
    return "external_unavailable";
  }

  return "fetch_failed";
}

export function formatTenantErrorReasonLabel(
  message: string | null | undefined,
) {
  return formatTenantCodeLabel(classifyTenantErrorReason(message), "載入失敗");
}

export function formatTenantErrorSummary(
  scopeLabel: string,
  message: string | null | undefined,
) {
  return `${scopeLabel}：${formatTenantErrorReasonLabel(message)}`;
}

export function formatTenantUiError(
  message: string | null | undefined,
  actionLabel = "操作未完成",
) {
  const resolved = message?.trim() ?? "";
  if (!resolved) {
    return `${actionLabel}。`;
  }

  if (
    CJK_TEXT_PATTERN.test(resolved) &&
    !/permission|forbidden|unauthorized|external|upstream|dependency|gateway|timeout|unavailable|http|error|exception/i.test(
      resolved,
    )
  ) {
    return resolved;
  }

  return `${actionLabel}：${formatTenantErrorReasonLabel(resolved)}。`;
}
