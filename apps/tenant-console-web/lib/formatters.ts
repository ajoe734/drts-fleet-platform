import type { MoneyAmount } from "@drts/contracts";

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
});

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return DATE_TIME_FORMATTER.format(new Date(value));
}

export function formatDateInput(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return DATE_FORMATTER.format(new Date(value));
}

export function formatMoney(value: MoneyAmount | null | undefined) {
  if (!value) {
    return "Not available";
  }

  return new Intl.NumberFormat("en", {
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
