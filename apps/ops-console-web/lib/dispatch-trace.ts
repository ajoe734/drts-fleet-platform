import type { DispatchTraceLogRecord } from "@drts/contracts";
import { formatOpsCodeLabel } from "./localized-labels";
import type { Locale } from "./translations";

function readStringDetail(
  details: Record<string, unknown> | undefined,
  key: string,
) {
  const value = details?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readNumberDetail(
  details: Record<string, unknown> | undefined,
  key: string,
) {
  const value = details?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatField(
  locale: Locale,
  label: { en: string; zh: string },
  value: string | number,
  { code = false }: { code?: boolean } = {},
) {
  const resolvedValue =
    typeof value === "string" && code
      ? formatOpsCodeLabel(locale, value)
      : String(value);
  return locale === "zh"
    ? `${label.zh}：${resolvedValue}`
    : `${label.en}: ${resolvedValue}`;
}

function looksLikeSystemCode(value: string) {
  return /^[a-z0-9._-]+$/i.test(value.trim());
}

export function readDispatchTraceActor(
  details: Record<string, unknown> | undefined,
) {
  const directActor =
    readStringDetail(details, "actorId") ??
    readStringDetail(details, "actor") ??
    readStringDetail(details, "operatorId") ??
    readStringDetail(details, "driverId") ??
    readStringDetail(details, "source");
  if (directActor) {
    return directActor;
  }

  const requestedBy = details?.requestedBy;
  if (
    requestedBy &&
    typeof requestedBy === "object" &&
    "actorId" in requestedBy &&
    typeof requestedBy.actorId === "string" &&
    requestedBy.actorId.trim().length > 0
  ) {
    return requestedBy.actorId.trim();
  }

  return null;
}

export function formatDispatchTraceMessage(
  locale: Locale,
  entry: DispatchTraceLogRecord,
) {
  const details = entry.details;
  const fragments: string[] = [];
  const actor = readDispatchTraceActor(details);
  const dispatchJobId = readStringDetail(details, "dispatchJobId");
  const queueType = readStringDetail(details, "queueType");
  const reasonCode = readStringDetail(details, "reasonCode");
  const reasonNote = readStringDetail(details, "reasonNote");
  const resolution = readStringDetail(details, "resolution");
  const overrideType = readStringDetail(details, "overrideType");
  const escalationAction = readStringDetail(details, "escalationAction");
  const escalationTarget = readStringDetail(details, "escalationTarget");
  const status = readStringDetail(details, "status");
  const attemptCount = readNumberDetail(details, "attemptCount");

  if (actor) {
    fragments.push(formatField(locale, { en: "Actor", zh: "執行者" }, actor));
  }
  if (dispatchJobId) {
    fragments.push(
      formatField(
        locale,
        { en: "Dispatch job", zh: "派遣工作" },
        dispatchJobId,
      ),
    );
  }
  if (queueType) {
    fragments.push(
      formatField(locale, { en: "Queue", zh: "佇列" }, queueType, {
        code: true,
      }),
    );
  }
  if (reasonCode) {
    fragments.push(
      formatField(locale, { en: "Reason", zh: "原因" }, reasonCode, {
        code: true,
      }),
    );
  }
  if (reasonNote) {
    fragments.push(formatField(locale, { en: "Note", zh: "備註" }, reasonNote));
  }
  if (resolution) {
    fragments.push(
      formatField(locale, { en: "Outcome", zh: "結果" }, resolution, {
        code: true,
      }),
    );
  }
  if (overrideType) {
    fragments.push(
      formatField(
        locale,
        { en: "Override type", zh: "覆寫類型" },
        overrideType,
        { code: true },
      ),
    );
  }
  if (escalationAction) {
    fragments.push(
      formatField(
        locale,
        { en: "Escalation action", zh: "升級動作" },
        escalationAction,
        { code: true },
      ),
    );
  }
  if (escalationTarget) {
    fragments.push(
      formatField(
        locale,
        { en: "Escalation target", zh: "升級對象" },
        escalationTarget,
        { code: true },
      ),
    );
  }
  if (status) {
    fragments.push(
      formatField(locale, { en: "Status", zh: "狀態" }, status, {
        code: true,
      }),
    );
  }
  if (attemptCount !== null) {
    fragments.push(
      formatField(locale, { en: "Attempts", zh: "嘗試次數" }, attemptCount),
    );
  }

  if (fragments.length > 0) {
    return fragments.join(locale === "zh" ? "；" : "; ");
  }

  const fallbackMessage =
    typeof entry.message === "string" ? entry.message.trim() : "";
  if (
    locale === "en" &&
    fallbackMessage.length > 0 &&
    fallbackMessage !== entry.eventType &&
    !looksLikeSystemCode(fallbackMessage)
  ) {
    return fallbackMessage;
  }

  return locale === "zh"
    ? `事件：${formatOpsCodeLabel(locale, entry.eventType)}`
    : `Event: ${formatOpsCodeLabel(locale, entry.eventType)}`;
}
