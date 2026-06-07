const CJK_TEXT_PATTERN = /[\u3400-\u9fff]/;

export function toDriverErrorMessage(error: unknown, fallback = "未知錯誤") {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

function formatDriverErrorReason(message: string | null | undefined) {
  if (!message) {
    return "服務暫時無法使用";
  }

  if (
    /permission|forbidden|unauthor|401|403|權限|禁止|未授權|存取/i.test(message)
  ) {
    return "權限不足";
  }

  if (
    /identity|session|oauth|oidc|token|credential|login|登入|身份|身分|憑證/i.test(
      message,
    )
  ) {
    return "身分狀態暫時無法確認";
  }

  if (
    /external|upstream|dependency|gateway|timeout|network|adapter|unavailable|down|\b50\d\b|http 5\d\d|外部|上游|相依|閘道|逾時|超時|網路|介接器|連線/i.test(
      message,
    )
  ) {
    return "外部服務暫時無法使用";
  }

  return "服務暫時無法使用";
}

export function formatDriverUiError(
  message: string | null | undefined,
  actionLabel = "操作未完成",
) {
  const resolved = message?.trim() ?? "";
  const normalizedAction =
    actionLabel.trim().replace(/[。.!?！？]+$/u, "") || "操作未完成";

  if (!resolved) {
    return `${normalizedAction}。`;
  }

  if (
    CJK_TEXT_PATTERN.test(resolved) &&
    !/permission|forbidden|unauthor|external|upstream|dependency|gateway|timeout|network|adapter|identity|session|token|error|exception|status|http/i.test(
      resolved,
    )
  ) {
    return resolved;
  }

  return `${normalizedAction}：${formatDriverErrorReason(resolved)}。`;
}
