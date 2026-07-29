import type { ReactNode } from "react";
import type { DispatchQueueMode, RuntimeProfileCode } from "@drts/contracts";
import {
  CanvasPill as Pill,
  type CanvasTheme,
  type CanvasTone,
} from "@drts/ui-web";
import type {
  OpsQueueEntryRecord,
  QueueEligibilityDecision,
} from "@/lib/queue-operations";
import { t, type Locale } from "@/lib/translations";

export function queueModeLabel(
  mode: DispatchQueueMode | undefined,
  locale: Locale,
): string {
  switch (mode) {
    case "virtual_matching":
      return t("dispatch.queue.virtualMatchingText", locale);
    case "physical_rank":
      return t("dispatch.queue.physicalRankText", locale);
    case "taxi_stand":
      return t("dispatch.queue.taxiStandText", locale);
    default:
      return t("common.notAvailable", locale);
  }
}

export function runtimeProfileLabel(
  profile: RuntimeProfileCode | undefined,
  locale: Locale,
): string {
  return profile
    ? t(`opsCode.${profile}`, locale)
    : t("common.notAvailable", locale);
}

export function eligibilityLabel(
  decision: QueueEligibilityDecision,
  locale: Locale,
): string {
  return t(`dispatch.queue.eligibility.${decision}`, locale);
}

export function formatQueueTimestamp(
  value: string | null | undefined,
  locale: Locale,
): string {
  if (!value) {
    return t("common.notAvailable", locale);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return t("common.notAvailable", locale);
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Taipei",
  }).format(parsed);
}

export function QueueModePill({
  entry,
  locale,
  theme,
}: {
  entry: OpsQueueEntryRecord;
  locale: Locale;
  theme: CanvasTheme;
}) {
  const tone: CanvasTone =
    entry.queueMode === "virtual_matching"
      ? "info"
      : entry.runtimeProfileCode === "multi_taxi_direct"
        ? "danger"
        : "neutral";

  return (
    <Pill theme={theme} tone={tone} dot>
      {queueModeLabel(entry.queueMode, locale)}
      <span
        style={{
          marginLeft: 4,
          opacity: 0.68,
          fontFamily: theme.monoFamily,
          fontSize: 9,
        }}
      >
        {entry.queueMode ?? "unknown"}
      </span>
    </Pill>
  );
}

export function QueueEligibilityPill({
  entry,
  locale,
  theme,
}: {
  entry: OpsQueueEntryRecord;
  locale: Locale;
  theme: CanvasTheme;
}) {
  const decision = entry.eligibility?.decision ?? "unknown";
  const tone: CanvasTone =
    decision === "eligible"
      ? "success"
      : decision === "denied"
        ? "danger"
        : "neutral";

  return (
    <Pill theme={theme} tone={tone} dot>
      {eligibilityLabel(decision, locale)}
    </Pill>
  );
}

export function QueueValue({
  children,
  mono = false,
  theme,
}: {
  children: ReactNode;
  mono?: boolean;
  theme: CanvasTheme;
}) {
  return (
    <span
      style={{
        color: theme.text,
        fontFamily: mono ? theme.monoFamily : theme.fontFamily,
      }}
    >
      {children}
    </span>
  );
}
