import type { Locale } from "@/lib/translations";

export function formatModifiableWindow(
  locale: Locale,
  cutoffMinutes: number,
  leadTimeMinutes: number,
): string {
  if (locale === "zh") {
    return `出車前 ${cutoffMinutes} 分鐘截止修改（前置 ${leadTimeMinutes} 分鐘）`;
  }
  return `Cutoff: ${cutoffMinutes}m before departure (Lead time: ${leadTimeMinutes}m)`;
}

export function formatWaitingRule(
  locale: Locale,
  gracePeriodMinutes: number,
  chargeableIntervalMinutes: number | null | undefined,
): string {
  if (locale === "zh") {
    return `免費等候 ${gracePeriodMinutes} 分鐘${
      chargeableIntervalMinutes
        ? `（逾時每 ${chargeableIntervalMinutes} 分鐘計費）`
        : ""
    }`;
  }
  return `Grace period: ${gracePeriodMinutes}m${
    chargeableIntervalMinutes
      ? ` (Charge interval: ${chargeableIntervalMinutes}m)`
      : ""
  }`;
}

export function formatNoShowRule(
  locale: Locale,
  thresholdMinutes: number,
  feeApplicable: boolean,
): string {
  if (locale === "zh") {
    return `門檻 ${thresholdMinutes} 分鐘${
      feeApplicable ? "（收取 No-show 費用）" : "（不另收費）"
    }`;
  }
  return `Threshold: ${thresholdMinutes}m${
    feeApplicable ? " (Fee applicable)" : " (No fee)"
  }`;
}
