const CJK_TEXT_PATTERN = /[\u3400-\u9fff]/;

export function toPortalErrorMessage(error: unknown, fallback = "未知錯誤") {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return fallback;
}

function isDirectPortalMessage(message: string) {
  return (
    CJK_TEXT_PATTERN.test(message) &&
    !/permission|forbidden|unauthor|external|upstream|dependency|gateway|timeout|network|adapter|unavailable|error|exception|status|http/i.test(
      message,
    )
  );
}

export function formatPortalErrorReason(message: string | null | undefined) {
  if (!message) {
    return "資料暫時無法讀取";
  }

  if (
    /permission|forbidden|unauthor|401|403|權限|禁止|未授權|存取/i.test(message)
  ) {
    return "權限不足";
  }

  if (
    /not[\s_-]*provisioned|provision|bootstrap|module|not configured|尚未配置|未佈建|未開通|未啟用/i.test(
      message,
    )
  ) {
    return "功能尚未開通";
  }

  if (
    /external|upstream|dependency|gateway|timeout|network|adapter|unavailable|down|\b50\d\b|http 5\d\d|外部|上游|相依|閘道|逾時|超時|網路|介接器|連線/i.test(
      message,
    )
  ) {
    return "外部服務暫時無法使用";
  }

  return "資料暫時無法讀取";
}

export function formatPortalUiError(
  message: string | null | undefined,
  actionLabel = "請求失敗",
) {
  const resolved = message?.trim() ?? "";

  if (!resolved) {
    return `${actionLabel}。`;
  }

  if (isDirectPortalMessage(resolved)) {
    return resolved;
  }

  return `${actionLabel}：${formatPortalErrorReason(resolved)}。`;
}

export function formatPortalSectionError(
  sectionLabel: string,
  error: unknown,
  actionLabel?: string,
) {
  const message = toPortalErrorMessage(error);
  const detail = formatPortalUiError(
    message,
    actionLabel ?? `${sectionLabel}暫時無法載入`,
  );

  return detail.startsWith(`${sectionLabel}：`)
    ? detail
    : `${sectionLabel}：${detail}`;
}
