import type { MoneyAmount } from "@drts/contracts";
import type { Locale } from "./translations";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function toIntlLocale(locale: Locale) {
  return locale === "zh" ? "zh-TW" : "en";
}

export function formatDateTime(
  value: string | null | undefined,
  locale: Locale = "en",
) {
  if (!value) {
    return locale === "zh" ? "無資料" : "Not available";
  }

  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatDateInput(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return DATE_FORMATTER.format(new Date(value));
}

export function formatMoney(
  value: MoneyAmount | null | undefined,
  locale: Locale = "en",
) {
  if (!value) {
    return locale === "zh" ? "無資料" : "Not available";
  }

  return new Intl.NumberFormat(toIntlLocale(locale), {
    style: "currency",
    currency: value.currency,
  }).format(value.amountMinor / 100);
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

export function isFutureIso(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  return new Date(value).getTime() > Date.now();
}

export function formatRelativeTime(
  value: string | null | undefined,
  locale: Locale = "en",
) {
  if (!value) {
    return null;
  }

  const diffMs = new Date(value).getTime() - Date.now();
  if (Number.isNaN(diffMs)) {
    return null;
  }

  const diffMinutes = Math.round(diffMs / 60000);
  const formatter = new Intl.RelativeTimeFormat(toIntlLocale(locale), {
    numeric: "auto",
  });
  if (Math.abs(diffMinutes) < 60) {
    return formatter.format(diffMinutes, "minute");
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 48) {
    return formatter.format(diffHours, "hour");
  }

  const diffDays = Math.round(diffHours / 24);
  return formatter.format(diffDays, "day");
}
