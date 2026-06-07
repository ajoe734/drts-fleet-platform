import type { MoneyAmount } from "@drts/contracts";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-Hant", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("zh-Hant", {
  numeric: "auto",
});

const STABLE_DATE_TIME_PARTS_FORMATTER = new Intl.DateTimeFormat("zh-Hant", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export function formatStableDateTime(
  value: string | null | undefined,
  fallback = "未提供",
) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  const parts = STABLE_DATE_TIME_PARTS_FORMATTER.formatToParts(parsed);
  let year = "";
  let month = "";
  let day = "";
  let hour = "";
  let minute = "";
  let dayPeriod = "";

  for (const part of parts) {
    switch (part.type) {
      case "year":
        year = part.value;
        break;
      case "month":
        month = part.value;
        break;
      case "day":
        day = part.value;
        break;
      case "hour":
        hour = part.value;
        break;
      case "minute":
        minute = part.value;
        break;
      case "dayPeriod":
        dayPeriod = part.value;
        break;
      default:
        break;
    }
  }

  const dateLabel = [year, month, day].filter(Boolean).join("/");
  const timeLabel =
    hour && minute
      ? `${dayPeriod ? `${dayPeriod} ` : ""}${hour}:${minute}`
      : "";

  return [dateLabel, timeLabel].filter(Boolean).join(" ") || fallback;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "未提供";
  }

  return formatStableDateTime(value);
}

export function formatDateInput(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return DATE_FORMATTER.format(new Date(value));
}

export function formatMoney(value: MoneyAmount | null | undefined) {
  if (!value) {
    return "未提供";
  }

  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: value.currency,
  }).format(value.amountMinor / 100);
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("zh-TW").format(value);
}

export function isFutureIso(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return new Date(value).getTime() > Date.now();
}

export function formatRelativeTime(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const diffMs = new Date(value).getTime() - Date.now();
  if (Number.isNaN(diffMs)) {
    return null;
  }

  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 60) {
    return RELATIVE_TIME_FORMATTER.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) {
    return RELATIVE_TIME_FORMATTER.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return RELATIVE_TIME_FORMATTER.format(diffDays, "day");
}
