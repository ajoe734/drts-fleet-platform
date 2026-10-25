/** BUREAU-R13 §4: a missing source value is shown as 未提供, never as 0. */
export const NOT_PROVIDED = "未提供";

export function display(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return NOT_PROVIDED;
  if (typeof value === "string" && value.trim().length === 0) {
    return NOT_PROVIDED;
  }
  return String(value);
}

export function displayDateTime(value: string | null | undefined): string {
  if (!value) return NOT_PROVIDED;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return NOT_PROVIDED;
  return new Date(parsed).toLocaleString("zh-TW", {
    timeZone: "Asia/Taipei",
    hour12: false,
  });
}

export function displayPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) {
    return NOT_PROVIDED;
  }
  return `${(rate * 100).toFixed(2)}%`;
}

export function displayMinor(
  amountMinor: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amountMinor === null || amountMinor === undefined) return NOT_PROVIDED;
  return `${amountMinor} ${currency ?? ""}`.trim();
}

export function displayBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return NOT_PROVIDED;
  return value ? "是" : "否";
}

export const EXPIRY_STATUS_LABELS: Record<string, string> = {
  expired: "已過期",
  expiring: "即將到期",
  valid: "有效",
  unavailable: NOT_PROVIDED,
};

export function errorMessage(
  error: { code: string | null; message: string | null } | null,
  status: number,
): string {
  if (status === 403) return "此帳號無權存取此資料（存取已記錄）。";
  if (status === 503)
    return "存取紀錄服務暫時無法使用，基於稽核要求不提供資料。";
  return error?.message || error?.code || `查詢失敗（HTTP ${status}）`;
}
