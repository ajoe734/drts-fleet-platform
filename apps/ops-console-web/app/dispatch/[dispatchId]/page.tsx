import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import type {
  AdapterHealthRecord,
  CrossAppResourceLink,
  DispatchCandidate,
  DispatchJobRecord,
  DispatchTraceLogRecord,
  DriverRegistryRecord,
  DriverTaskRecord,
  EmptyReason,
  EmptyStateEnvelope,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  ResourceActionDescriptor,
  UiRefreshMetadata,
  UnifiedDriverTaskView,
  OwnedOrderRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { formatMinorCurrency } from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasField as Field,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";
import { getCandidateLocationState } from "../location-state";

type DispatchDetailPageProps = {
  params: Promise<{
    dispatchId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type RuntimeDecorated<T> = T & {
  availableActions?: ResourceActionDescriptor[];
  refreshMetadata?: UiRefreshMetadata;
  refresh?: UiRefreshMetadata;
  uiRefreshMetadata?: UiRefreshMetadata;
  emptyState?: EmptyStateEnvelope;
  domain?: "owned" | "forwarded";
};

type RuntimeListEnvelope<T> = {
  items: RuntimeDecorated<T>[];
  emptyState?: EmptyStateEnvelope;
  refreshMetadata?: UiRefreshMetadata;
  refresh?: UiRefreshMetadata;
  uiRefreshMetadata?: UiRefreshMetadata;
};

type CandidateRow = Record<string, unknown> & {
  rank: ReactNode;
  driver: ReactNode;
  eta: ReactNode;
  gates: ReactNode;
  score: ReactNode;
  actions: ReactNode;
};

type TimelineEntry = {
  id: string;
  title: string;
  body: string;
  at: string;
  tone: CanvasTone;
  actor?: string | null;
};

type EmptyStateVisual = {
  tone: Exclude<CanvasTone, "neutral">;
  title: string;
  body: string;
  icon: "warn" | "clock" | "ext" | "check";
};

type ActionRenderContext = {
  baseHref: string;
  scope: "candidate" | "dispatch" | "forwarded" | "empty_state";
  resourceId?: string;
  resourceLabel?: string;
  driverHref?: string;
  incidentHref?: string;
  approvalHref?: string;
  adapterHref?: string;
  reconciliationHref?: string;
  refreshHref?: string;
  candidatesHref?: string;
  currentTaskHref?: string;
  eligibleDriversHref?: string;
};

type ActionDestination = {
  href: string;
  openMode: "same_tab" | "new_tab";
  label: string;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const DRIVER_TASK_PRIORITY: Record<string, number> = {
  on_trip: 0,
  proof_pending: 1,
  arrived_pickup: 2,
  enroute_pickup: 3,
  accepted: 4,
  pending_acceptance: 5,
  completed: 6,
  cancelled: 7,
  rejected: 8,
};

const pageBodyStyle = {
  padding: 24,
  display: "grid",
  gap: 16,
};

const actionRowStyle = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap" as const,
};

const surfaceStackStyle = {
  display: "grid",
  gap: 16,
  alignContent: "start" as const,
};

const APP_ORIGIN_BY_TARGET: Record<CrossAppResourceLink["targetApp"], string> =
  {
    "ops-console":
      process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3003",
    "platform-admin":
      process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002",
    "tenant-console":
      process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3004",
  };

async function resolveOrFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch {
    return fallback;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function getNestedValue(
  record: Record<string, unknown>,
  path: string,
): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, record);
}

function firstRecord<T>(...values: Array<T | null | undefined>) {
  return values.find((value) => value !== null && value !== undefined) ?? null;
}

function humanizeCode(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function formatCode(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const localized = formatOpsCodeLabel(locale, value);
  return localized === value ? humanizeCode(value) : localized;
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatLongDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "UTC",
  })
    .format(new Date(value))
    .replace(",", "");
}

function formatWindow(
  locale: Locale,
  start: string | null | undefined,
  end: string | null | undefined,
) {
  if (!start || Number.isNaN(Date.parse(start))) {
    return locale === "zh" ? "即時" : "realtime";
  }

  if (end && !Number.isNaN(Date.parse(end))) {
    return `${formatDateTime(locale, start)} → ${formatDateTime(locale, end)}`;
  }

  return formatDateTime(locale, start);
}

function formatEtaLabel(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) {
    return "—";
  }

  return `${minutes} min`;
}

function getTenantLabel(order: OwnedOrderRecord) {
  return (
    order.tenantId ??
    order.partnerEntrySlug ??
    order.partnerId ??
    order.orderSource
  );
}

function getAddressLabel(
  address: OwnedOrderRecord["pickup"] | OwnedOrderRecord["dropoff"],
) {
  return address.addressName ?? address.address;
}

function readRefreshMetadata(value: unknown): UiRefreshMetadata | null {
  if (!isRecord(value)) {
    return null;
  }

  const refresh = firstRecord(
    isRecord(value.refreshMetadata) ? value.refreshMetadata : null,
    isRecord(value.refresh) ? value.refresh : null,
    isRecord(value.uiRefreshMetadata) ? value.uiRefreshMetadata : null,
  );

  if (!refresh) {
    return null;
  }

  const { generatedAt, staleAfterMs, dataFreshness, source } =
    refresh as Record<string, unknown>;

  if (
    typeof generatedAt !== "string" ||
    typeof staleAfterMs !== "number" ||
    typeof dataFreshness !== "string" ||
    typeof source !== "string"
  ) {
    return null;
  }

  return {
    generatedAt,
    staleAfterMs,
    dataFreshness: dataFreshness as UiRefreshMetadata["dataFreshness"],
    source: source as UiRefreshMetadata["source"],
  };
}

function readEmptyState(value: unknown): EmptyStateEnvelope | null {
  if (!isRecord(value) || !isRecord(value.emptyState)) {
    return null;
  }

  const emptyState = value.emptyState as Record<string, unknown>;
  if (
    typeof emptyState.reason !== "string" ||
    typeof emptyState.messageCode !== "string"
  ) {
    return null;
  }

  const nextAction = isRecord(emptyState.nextAction)
    ? (emptyState.nextAction as unknown as ResourceActionDescriptor)
    : undefined;

  return {
    reason: emptyState.reason as EmptyReason,
    messageCode: emptyState.messageCode,
    ...(nextAction ? { nextAction } : {}),
  };
}

function readAvailableActions(value: unknown): ResourceActionDescriptor[] {
  if (!isRecord(value) || !Array.isArray(value.availableActions)) {
    return [];
  }

  return value.availableActions.filter(
    (action): action is ResourceActionDescriptor => {
      if (!isRecord(action)) {
        return false;
      }

      return (
        typeof action.action === "string" &&
        typeof action.enabled === "boolean" &&
        typeof action.riskLevel === "string"
      );
    },
  );
}

function refreshTone(
  freshness: UiRefreshMetadata["dataFreshness"] | undefined,
): Exclude<CanvasTone, "neutral"> {
  switch (freshness) {
    case "fresh":
      return "success";
    case "stale":
      return "warn";
    case "degraded":
      return "danger";
    case "unknown":
    default:
      return "info";
  }
}

function refreshCopy(
  locale: Locale,
  refresh: UiRefreshMetadata | null,
  tierLabel: string,
) {
  if (!refresh) {
    return locale === "zh"
      ? `${tierLabel} · 等待 runtime freshness`
      : `${tierLabel} · waiting for runtime freshness`;
  }

  return locale === "zh"
    ? `${tierLabel} · ${formatCode(locale, refresh.dataFreshness)} · ${formatDateTime(locale, refresh.generatedAt)} · ${refresh.source}`
    : `${tierLabel} · ${refresh.dataFreshness} · ${formatDateTime(locale, refresh.generatedAt)} · ${refresh.source}`;
}

function actionLinkStyle(
  variant: "primary" | "secondary" | "ghost" = "secondary",
) {
  if (variant === "primary") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      minHeight: "28px",
      padding: "6px 10px",
      borderRadius: "8px",
      border: `1px solid ${theme.accent}`,
      background: theme.accent,
      color: "#ffffff",
      textDecoration: "none",
      fontSize: "12px",
      fontWeight: 600,
      lineHeight: 1,
    } as const;
  }

  if (variant === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      minHeight: "28px",
      padding: "6px 10px",
      borderRadius: "8px",
      border: "1px solid transparent",
      background: "transparent",
      color: theme.textMuted,
      textDecoration: "none",
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
    } as const;
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    minHeight: "28px",
    padding: "6px 10px",
    borderRadius: "8px",
    border: `1px solid ${theme.border}`,
    background: theme.surface,
    color: theme.text,
    textDecoration: "none",
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
  } as const;
}

function readSummaryText(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (!isRecord(value)) {
    return null;
  }

  const candidates = [
    value.addressName,
    value.address,
    value.label,
    value.name,
    value.summary,
    value.title,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return null;
}

function readForwardedValue(
  order: ForwardedOrderRecord,
  keys: string[],
): string | null {
  const sources = [order.authoritativeSnapshot, order.payload];
  for (const source of sources) {
    if (!isRecord(source)) {
      continue;
    }

    for (const key of keys) {
      const direct = key.includes(".")
        ? getNestedValue(source, key)
        : source[key];
      const text = readSummaryText(direct);
      if (text) {
        return text;
      }
    }
  }

  return null;
}

function readForwardedBoolean(
  order: ForwardedOrderRecord,
  keys: string[],
): boolean | null {
  const sources = [order.authoritativeSnapshot, order.payload];
  for (const source of sources) {
    if (!isRecord(source)) {
      continue;
    }

    for (const key of keys) {
      const value = key.includes(".")
        ? getNestedValue(source, key)
        : source[key];
      if (typeof value === "boolean") {
        return value;
      }
    }
  }

  return null;
}

function readForwardedList(
  order: ForwardedOrderRecord,
  keys: string[],
): string[] {
  const sources = [order.authoritativeSnapshot, order.payload];
  for (const source of sources) {
    if (!isRecord(source)) {
      continue;
    }

    for (const key of keys) {
      const value = key.includes(".")
        ? getNestedValue(source, key)
        : source[key];
      if (Array.isArray(value)) {
        return value
          .map((item) => readSummaryText(item))
          .filter((item): item is string => Boolean(item));
      }
    }
  }

  return [];
}

function pickCurrentTask(tasks: DriverTaskRecord[]) {
  return (
    [...tasks].sort((left, right) => {
      const leftRank = DRIVER_TASK_PRIORITY[left.status] ?? 99;
      const rightRank = DRIVER_TASK_PRIORITY[right.status] ?? 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      const leftTimestamp =
        left.completedAt ??
        left.startedAt ??
        left.arrivedPickupAt ??
        left.departedAt ??
        left.acceptedAt ??
        "";
      const rightTimestamp =
        right.completedAt ??
        right.startedAt ??
        right.arrivedPickupAt ??
        right.departedAt ??
        right.acceptedAt ??
        "";

      return rightTimestamp.localeCompare(leftTimestamp);
    })[0] ?? null
  );
}

function getCandidateGate(
  locale: Locale,
  candidate: DispatchCandidate,
  order: OwnedOrderRecord,
  driver: DriverRegistryRecord | null,
) {
  const locationState = getCandidateLocationState(candidate);

  if (driver && !driver.licensesValid) {
    return {
      label: locale === "zh" ? "執照失效" : "License invalid",
      tone: "danger" as const,
    };
  }

  if (driver && !driver.dispatchEligible) {
    return {
      label: formatCode(
        locale,
        driver.eligibilityBlockedReasons[0] ?? "manual_review",
      ),
      tone: "warn" as const,
    };
  }

  if (!candidate.serviceBuckets.includes(order.serviceBucket)) {
    return {
      label: locale === "zh" ? "服務桶不符" : "Service bucket gap",
      tone: "warn" as const,
    };
  }

  if (locationState === "no_location") {
    return {
      label: locale === "zh" ? "無定位" : "No location",
      tone: "warn" as const,
    };
  }

  if (locationState === "stale") {
    return {
      label: locale === "zh" ? "定位過期" : "Location stale",
      tone: "warn" as const,
    };
  }

  return {
    label: locale === "zh" ? "可派遣" : "Clear",
    tone: "success" as const,
  };
}

function getOwnedStateCode(order: OwnedOrderRecord, job?: DispatchJobRecord) {
  if (order.exceptionHold?.overrideRequest && !order.exceptionHold.resolution) {
    return "override_pending";
  }
  if (order.status === "no_supply" || order.status === "delayed_queue") {
    return "no_supply";
  }
  if (order.status === "exception_hold") {
    return "exception_hold";
  }
  if (order.status === "dispatch_timeout") {
    return "dispatch_timeout";
  }
  if (job?.status === "assigned") {
    return "assigned";
  }
  if (job?.status === "matching") {
    return "broadcasting";
  }
  if (
    job?.status === "queued" ||
    job?.status === "redispatch_required" ||
    job?.status === "reserved"
  ) {
    return "queued";
  }
  if (
    order.status === "ready_for_dispatch" ||
    order.status === "preassigned" ||
    order.status === "recording_pending"
  ) {
    return "queued";
  }
  return order.status;
}

function getStateTone(stateCode: string): CanvasTone {
  if (stateCode === "assigned" || stateCode === "completed") {
    return "success";
  }
  if (stateCode === "no_supply") {
    return "danger";
  }
  if (
    stateCode === "dispatch_timeout" ||
    stateCode === "exception_hold" ||
    stateCode === "override_pending"
  ) {
    return "warn";
  }
  if (stateCode === "broadcasting" || stateCode === "queued") {
    return "info";
  }
  return "neutral";
}

function getForwardedStateTone(
  status: ForwardedOrderRecord["status"],
): CanvasTone {
  switch (status) {
    case "sync_failed":
      return "danger";
    case "accept_pending":
      return "warn";
    case "broadcasted":
    case "received":
      return "info";
    case "confirmed_by_platform":
    case "completed_synced":
      return "success";
    default:
      return "neutral";
  }
}

function getAdapterTone(
  status: AdapterHealthRecord["status"],
): Exclude<CanvasTone, "neutral"> {
  switch (status) {
    case "down":
      return "danger";
    case "degraded":
      return "warn";
    default:
      return "success";
  }
}

function getTimelineTone(eventType: string): CanvasTone {
  if (eventType.includes("failed") || eventType.includes("timeout")) {
    return "danger";
  }
  if (
    eventType.includes("hold") ||
    eventType.includes("override") ||
    eventType.includes("no_supply")
  ) {
    return "warn";
  }
  if (
    eventType.includes("assigned") ||
    eventType.includes("accepted") ||
    eventType.includes("completed")
  ) {
    return "success";
  }
  return "info";
}

function actionVariant(action: ResourceActionDescriptor) {
  if (!action.enabled) {
    return "ghost" as const;
  }
  if (action.riskLevel === "high") {
    return "primary" as const;
  }
  return "secondary" as const;
}

function actionMetaLabel(locale: Locale, action: ResourceActionDescriptor) {
  const risk = action.riskLevel.toUpperCase();
  if (action.requiresReason) {
    return locale === "zh" ? `${risk} · 需要原因` : `${risk} · reason`;
  }
  return risk;
}

function actionStyle(action: ResourceActionDescriptor) {
  const variant = actionVariant(action);
  const baseStyle = actionLinkStyle(variant);

  if (!action.enabled) {
    return {
      ...baseStyle,
      opacity: 0.52,
      cursor: "not-allowed",
    } as const;
  }

  if (action.riskLevel === "medium") {
    return {
      ...baseStyle,
      border: `1px solid ${theme.warn}`,
      color: theme.warn,
    } as const;
  }

  return baseStyle;
}

function actionPriority(action: ResourceActionDescriptor) {
  const enabledRank = action.enabled ? 0 : 10;
  const riskRank =
    action.riskLevel === "high" ? 0 : action.riskLevel === "medium" ? 1 : 2;
  const namedRank = [
    "assign",
    "release",
    "redispatch",
    "fare_override",
    "resolve_no_supply",
    "escalate_to_incident",
    "trigger_reconciliation_completion",
    "engage_manual_fallback",
    "force_refresh",
    "broadcast_to_eligible_drivers",
    "report_sync_failure",
  ].indexOf(action.action);

  return enabledRank * 100 + riskRank * 10 + (namedRank === -1 ? 9 : namedRank);
}

function selectHeroActions(actions: ResourceActionDescriptor[], limit = 3) {
  return [...actions]
    .sort((left, right) => {
      const leftPriority = actionPriority(left);
      const rightPriority = actionPriority(right);
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }
      return left.action.localeCompare(right.action);
    })
    .slice(0, limit);
}

function renderStateMachine(
  locale: Locale,
  states: string[],
  currentState: string,
  options?: {
    exceptionalTone?: Exclude<CanvasTone, "neutral">;
    exceptionalBody?: string;
  },
) {
  const currentIndex = states.findIndex((state) => state === currentState);
  const isKnownState = currentIndex >= 0;
  const exceptionalTone = options?.exceptionalTone ?? "warn";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${states.length}, minmax(0, 1fr))`,
          gap: 8,
        }}
      >
        {states.map((state, index) => {
          const tone: CanvasTone = isKnownState
            ? index < currentIndex
              ? "success"
              : index === currentIndex
                ? "accent"
                : "neutral"
            : "neutral";
          return (
            <div
              key={state}
              style={{
                display: "grid",
                gap: 6,
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${tone === "accent" ? theme.accent : theme.border}`,
                background:
                  tone === "accent"
                    ? "rgba(133, 212, 255, 0.12)"
                    : tone === "success"
                      ? "rgba(76, 175, 80, 0.08)"
                      : theme.surfaceLo,
              }}
            >
              <span
                style={{
                  color: tone === "accent" ? theme.accent : theme.textDim,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                }}
              >
                {index + 1}
              </span>
              <span
                style={{ color: theme.text, fontSize: 12.5, fontWeight: 600 }}
              >
                {formatCode(locale, state)}
              </span>
            </div>
          );
        })}
      </div>
      {!isKnownState ? (
        <Banner
          theme={theme}
          tone={exceptionalTone}
          icon={exceptionalTone === "danger" ? "warn" : "clock"}
          title={
            locale === "zh"
              ? `例外 / 終態：${formatCode(locale, currentState)}`
              : `Exceptional or terminal state: ${formatCode(locale, currentState)}`
          }
          body={
            options?.exceptionalBody ??
            (locale === "zh"
              ? "此狀態不屬於標準進度階梯，不能回退顯示成 step 1；請改以 exception panel 與 availableActions 判讀下一步。"
              : "This state sits outside the normal progression and must not render as step 1; use the exception panel and availableActions to determine the next step.")
          }
        />
      ) : null}
    </div>
  );
}

function readSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.find(
      (candidate) => typeof candidate === "string" && candidate.trim(),
    );
  }

  return undefined;
}

function buildActionHref(
  context: ActionRenderContext,
  action: ResourceActionDescriptor,
) {
  const params = new URLSearchParams();
  params.set("action", action.action);
  params.set("scope", context.scope);
  if (context.resourceId) {
    params.set("resourceId", context.resourceId);
  }
  if (context.resourceLabel) {
    params.set("resourceLabel", context.resourceLabel);
  }
  return `${context.baseHref}?${params.toString()}`;
}

function withFragment(href: string, fragment: string) {
  const normalized = fragment.startsWith("#") ? fragment : `#${fragment}`;
  return href.includes("#") ? href : `${href}${normalized}`;
}

function buildActionDestination(
  locale: Locale,
  context: ActionRenderContext,
  action: ResourceActionDescriptor,
): ActionDestination {
  const focusHref = buildActionHref(context, action);
  const normalizedAction = action.action.toLowerCase();

  if (
    normalizedAction.includes("incident") ||
    normalizedAction.includes("sync_failure")
  ) {
    return {
      href:
        context.incidentHref ?? withFragment(focusHref, "available-actions"),
      openMode: "same_tab",
      label: locale === "zh" ? "前往事故流程" : "Open incident flow",
    };
  }

  if (
    normalizedAction.includes("override") ||
    normalizedAction.includes("approval")
  ) {
    return {
      href: context.approvalHref ?? withFragment(focusHref, "compliance-hold"),
      openMode: "same_tab",
      label: locale === "zh" ? "前往審批佇列" : "Open approval queue",
    };
  }

  if (
    normalizedAction.includes("reconciliation") ||
    normalizedAction.includes("manual_fallback")
  ) {
    return {
      href:
        context.reconciliationHref ??
        context.adapterHref ??
        withFragment(focusHref, "adapter-cross-app"),
      openMode:
        context.reconciliationHref || context.adapterHref
          ? "new_tab"
          : "same_tab",
      label: locale === "zh" ? "前往 owner surface" : "Open owner surface",
    };
  }

  if (
    normalizedAction.includes("adapter") ||
    normalizedAction.includes("platform")
  ) {
    return {
      href: context.adapterHref ?? withFragment(focusHref, "adapter-cross-app"),
      openMode: context.adapterHref ? "new_tab" : "same_tab",
      label: locale === "zh" ? "檢視 adapter owner" : "Inspect adapter owner",
    };
  }

  if (normalizedAction.includes("force_refresh")) {
    return {
      href: context.refreshHref ?? withFragment(focusHref, "refresh-tier"),
      openMode: "same_tab",
      label: locale === "zh" ? "刷新層級" : "Refresh tier",
    };
  }

  if (normalizedAction.includes("broadcast")) {
    return {
      href:
        context.eligibleDriversHref ??
        context.candidatesHref ??
        withFragment(focusHref, "eligible-drivers"),
      openMode: "same_tab",
      label:
        locale === "zh" ? "前往候選 / 廣播區" : "Open candidate broadcast area",
    };
  }

  if (normalizedAction.includes("assign")) {
    return {
      href:
        context.driverHref ??
        context.candidatesHref ??
        withFragment(focusHref, "candidates"),
      openMode: "same_tab",
      label:
        context.driverHref && context.scope === "candidate"
          ? locale === "zh"
            ? "前往司機詳情"
            : "Open driver detail"
          : locale === "zh"
            ? "前往候選區"
            : "Open candidates area",
    };
  }

  if (normalizedAction.includes("release")) {
    return {
      href:
        context.currentTaskHref ??
        withFragment(focusHref, "current-driver-task"),
      openMode: "same_tab",
      label:
        locale === "zh" ? "前往當前 driver task" : "Open current driver task",
    };
  }

  if (
    normalizedAction.includes("cancel") ||
    normalizedAction.includes("redispatch") ||
    normalizedAction.includes("resolve") ||
    normalizedAction.includes("hold")
  ) {
    return {
      href: withFragment(focusHref, "available-actions"),
      openMode: "same_tab",
      label: locale === "zh" ? "前往 action panel" : "Open action panel",
    };
  }

  return {
    href: withFragment(focusHref, "available-actions"),
    openMode: "same_tab",
    label: locale === "zh" ? "前往工作區動作" : "Open workspace action",
  };
}

function renderActionAffordance(
  locale: Locale,
  action: ResourceActionDescriptor,
  key: string,
  context?: ActionRenderContext,
) {
  const destination =
    action.enabled && context
      ? buildActionDestination(locale, context, action)
      : null;
  const content = (
    <>
      <span>{formatCode(locale, action.action)}</span>
      <span style={{ fontSize: "10px", opacity: 0.82 }}>
        {actionMetaLabel(locale, action)}
      </span>
      {destination ? (
        <span style={{ fontSize: "10px", opacity: 0.68 }}>
          {destination.label}
          {destination.openMode === "new_tab"
            ? locale === "zh"
              ? " · 新分頁"
              : " · new tab"
            : ""}
        </span>
      ) : null}
    </>
  );

  const title =
    !action.enabled && action.disabledReasonCode
      ? formatCode(locale, action.disabledReasonCode)
      : undefined;

  if (destination) {
    const commonStyle = {
      ...actionStyle(action),
      flexDirection: "column" as const,
      alignItems: "flex-start" as const,
      lineHeight: 1.15,
    };

    if (destination.openMode === "new_tab") {
      return (
        <a
          key={key}
          href={destination.href}
          target="_blank"
          rel="noreferrer noopener"
          style={commonStyle}
          title={title}
        >
          {content}
        </a>
      );
    }

    return (
      <Link key={key} href={destination.href} style={commonStyle} title={title}>
        {content}
      </Link>
    );
  }

  return (
    <span
      key={key}
      title={title}
      style={{
        ...actionStyle(action),
        flexDirection: "column",
        alignItems: "flex-start",
        lineHeight: 1.15,
      }}
    >
      {content}
    </span>
  );
}

function renderActionSection(
  locale: Locale,
  actions: ResourceActionDescriptor[],
  emptyCopy: string,
  context?: ActionRenderContext,
) {
  if (actions.length === 0) {
    return (
      <div
        style={{ color: theme.textMuted, fontSize: "12.5px", lineHeight: 1.5 }}
      >
        {emptyCopy}
      </div>
    );
  }

  return (
    <div style={actionRowStyle}>
      {actions.map((action, index) =>
        renderActionAffordance(
          locale,
          action,
          `${action.action}-${index}`,
          context,
        ),
      )}
    </div>
  );
}

function renderActionFocusBanner(
  locale: Locale,
  href: string,
  action: ResourceActionDescriptor | null,
  scope: string | undefined,
  resourceLabel: string | undefined,
) {
  if (!action) {
    return null;
  }

  return (
    <Banner
      theme={theme}
      tone={
        action.riskLevel === "high"
          ? "danger"
          : action.riskLevel === "medium"
            ? "warn"
            : "info"
      }
      icon={action.riskLevel === "high" ? "warn" : "clock"}
      title={
        locale === "zh"
          ? `Action focus · ${formatCode(locale, action.action)}`
          : `Action focus · ${formatCode(locale, action.action)}`
      }
      body={[
        resourceLabel ? `${resourceLabel}` : null,
        scope ? `scope=${scope}` : null,
        actionMetaLabel(locale, action),
        action.requiresReason
          ? locale === "zh"
            ? "依 spec 需 reason + audit receipt。"
            : "Spec requires reason + audit receipt."
          : locale === "zh"
            ? "依 spec 執行後需提供 audit receipt。"
            : "Spec requires an audit receipt after execution.",
      ]
        .filter(Boolean)
        .join(" · ")}
      actions={
        <div style={actionRowStyle}>
          <Link href={href} style={actionLinkStyle("ghost")}>
            <CanvasIcon name="arrow" size={12} />
            <span>{locale === "zh" ? "清除 focus" : "Clear focus"}</span>
          </Link>
        </div>
      }
    />
  );
}

function buildEmptyStateContent(
  locale: Locale,
  emptyState: EmptyStateEnvelope | null,
): EmptyStateVisual {
  const reason = emptyState?.reason ?? "no_data";
  switch (reason) {
    case "not_provisioned":
      return {
        tone: "info" as const,
        icon: "clock" as const,
        title:
          locale === "zh"
            ? "此工作區尚未啟用"
            : "This workspace is not provisioned",
        body:
          locale === "zh"
            ? "後端已明確回傳 not_provisioned。請先完成功能啟用或環境設定。"
            : "Backend returned not_provisioned. Enable the capability before using this surface.",
      };
    case "fetch_failed":
      return {
        tone: "danger" as const,
        icon: "warn" as const,
        title: locale === "zh" ? "資料讀取失敗" : "Data fetch failed",
        body:
          locale === "zh"
            ? "候選人資料目前不可讀。請使用 refresh tier 重新整理，必要時轉交 API 健康檢查。"
            : "Candidate data is unavailable. Retry via the refresh affordance and escalate to API health if needed.",
      };
    case "permission_denied":
      return {
        tone: "warn" as const,
        icon: "ext" as const,
        title: locale === "zh" ? "權限不足" : "Permission denied",
        body:
          locale === "zh"
            ? "此空狀態來自 permission_denied，不應顯示成一般無資料。"
            : "This empty state is permission_denied and must not collapse into a generic no-data message.",
      };
    case "external_unavailable":
      return {
        tone: "danger" as const,
        icon: "ext" as const,
        title:
          locale === "zh"
            ? "外部依賴不可用"
            : "External dependency unavailable",
        body:
          locale === "zh"
            ? "adapter 或外部平台目前無法提供候選資料。"
            : "An adapter or external platform is currently unable to provide candidate data.",
      };
    case "driver_not_eligible":
      return {
        tone: "warn" as const,
        icon: "warn" as const,
        title:
          locale === "zh"
            ? "司機目前不具派遣資格"
            : "Driver is not currently eligible",
        body:
          locale === "zh"
            ? "此空態來自 driver_not_eligible，代表資格或 gating 阻止派遣，不能視為一般 no_data。"
            : "This empty state comes from driver_not_eligible, which means eligibility or gating blocks dispatch and must not be treated as generic no_data.",
      };
    case "filtered_empty":
      return {
        tone: "info" as const,
        icon: "check" as const,
        title: locale === "zh" ? "篩選後無結果" : "No results after filtering",
        body:
          locale === "zh"
            ? "這是 filtered_empty，不是完全沒有資料。請放寬條件或檢查 board state。"
            : "This is filtered_empty rather than true no_data. Widen the filters or inspect the board state.",
      };
    case "no_data":
    default:
      return {
        tone: "info" as const,
        icon: "warn" as const,
        title: locale === "zh" ? "目前沒有候選司機" : "No candidates right now",
        body:
          locale === "zh"
            ? "這是 legitimate no_data / no-supply 情境，可改由 redispatch、人工處理或升級。"
            : "This is a legitimate no_data / no-supply state. Redispatch, manual handling, or escalation may be required.",
      };
  }
}

function renderRefreshBanner(
  locale: Locale,
  refresh: UiRefreshMetadata | null,
  tierLabel: string,
  href: string,
  title: string,
) {
  return (
    <Banner
      theme={theme}
      tone={refreshTone(refresh?.dataFreshness)}
      icon="clock"
      title={title}
      body={refreshCopy(locale, refresh, tierLabel)}
      actions={
        <Link href={href} style={actionLinkStyle()}>
          <CanvasIcon name="clock" size={12} />
          <span>{locale === "zh" ? "Refresh" : "Refresh"}</span>
        </Link>
      }
    />
  );
}

function normalizeRoutePath(route: string) {
  if (/^https?:\/\//.test(route)) {
    return route;
  }

  return route.startsWith("/") ? route : `/${route}`;
}

function resolveCrossAppHref(link: CrossAppResourceLink) {
  const route = normalizeRoutePath(link.route);
  if (/^https?:\/\//.test(route)) {
    return route;
  }

  if (link.targetApp === "ops-console") {
    return route;
  }

  return new URL(route, APP_ORIGIN_BY_TARGET[link.targetApp]).toString();
}

function buildCrossAppLink(
  route: string,
  label: string,
  resourceType: string,
  resourceId: string,
): CrossAppResourceLink {
  return {
    targetApp: "platform-admin",
    route,
    resourceType,
    resourceId,
    openMode: "new_tab",
    label,
  };
}

function renderCrossAppLink(link: CrossAppResourceLink) {
  const href = resolveCrossAppHref(link);
  return (
    <a
      href={href}
      target={link.openMode === "new_tab" ? "_blank" : undefined}
      rel={link.openMode === "new_tab" ? "noreferrer noopener" : undefined}
      style={actionLinkStyle()}
      title={link.openMode === "new_tab" ? "Opens in a new tab" : undefined}
    >
      <CanvasIcon name="ext" size={12} />
      <span>{link.label}</span>
    </a>
  );
}

export default async function DispatchDetailPage({
  params,
  searchParams,
}: DispatchDetailPageProps) {
  const [{ dispatchId }, query, locale, client] = await Promise.all([
    params,
    searchParams ??
      Promise.resolve({} as Record<string, string | string[] | undefined>),
    getServerLocale(),
    getServerOpsClient(),
  ]);

  const [
    ownedOrdersEnvelope,
    forwardedOrdersEnvelope,
    dispatchJobs,
    drivers,
    driverTasks,
    unifiedDriverTasks,
    adapterHealthResponse,
    reconciliationIssues,
  ] = await Promise.all([
    resolveOrFallback(
      () => client.get<RuntimeListEnvelope<OwnedOrderRecord>>("/api/orders"),
      { items: [] as RuntimeDecorated<OwnedOrderRecord>[] },
    ),
    resolveOrFallback(
      () =>
        client.get<RuntimeListEnvelope<ForwardedOrderRecord>>(
          "/api/forwarder/orders",
        ),
      { items: [] as RuntimeDecorated<ForwardedOrderRecord>[] },
    ),
    resolveOrFallback(
      () => client.listDispatchJobs(),
      [] as DispatchJobRecord[],
    ),
    resolveOrFallback(() => client.listDrivers(), [] as DriverRegistryRecord[]),
    resolveOrFallback(() => client.listDriverTasks(), [] as DriverTaskRecord[]),
    resolveOrFallback(
      () => client.listUnifiedDriverTasks(),
      [] as UnifiedDriverTaskView[],
    ),
    resolveOrFallback(
      () =>
        client.get<{ items: AdapterHealthRecord[] }>(
          "/api/forwarder/adapters/health",
        ),
      { items: [] as AdapterHealthRecord[] },
    ),
    resolveOrFallback(
      () => client.listForwarderReconciliationIssues(),
      [] as ForwarderReconciliationIssue[],
    ),
  ]);

  const ownedRecord =
    ownedOrdersEnvelope.items.find((order) => order.orderId === dispatchId) ??
    null;
  const forwardedRecord =
    forwardedOrdersEnvelope.items.find(
      (order) => order.mirrorOrderId === dispatchId,
    ) ?? null;

  if (!ownedRecord && !forwardedRecord) {
    notFound();
  }

  const href = `/dispatch/${encodeURIComponent(dispatchId)}`;
  const focusedActionId = readSearchParam(query.action);
  const focusedScope = readSearchParam(query.scope);
  const focusedResourceId = readSearchParam(query.resourceId);
  const focusedResourceLabel = readSearchParam(query.resourceLabel);
  const jobsByOrderId = new Map(dispatchJobs.map((job) => [job.orderId, job]));
  const driverById = new Map(
    drivers.map((driver) => [driver.driverId, driver]),
  );

  if (ownedRecord) {
    const dispatchJob = jobsByOrderId.get(ownedRecord.orderId);
    const [candidateEnvelope, traceEnvelope] = await Promise.all([
      dispatchJob
        ? resolveOrFallback(
            () =>
              client.get<RuntimeListEnvelope<DispatchCandidate>>(
                `/api/dispatch/tasks/${encodeURIComponent(dispatchJob.dispatchJobId)}/candidates`,
              ),
            { items: [] as RuntimeDecorated<DispatchCandidate>[] },
          )
        : Promise.resolve({
            items: [] as RuntimeDecorated<DispatchCandidate>[],
            emptyState: {
              reason: "no_data" as const,
              messageCode: "dispatch.candidates.none",
            },
          }),
      resolveOrFallback(
        () =>
          client.get<RuntimeListEnvelope<DispatchTraceLogRecord>>(
            `/api/orders/${encodeURIComponent(ownedRecord.orderId)}/dispatch-trace`,
          ),
        { items: [] as RuntimeDecorated<DispatchTraceLogRecord>[] },
      ),
    ]);

    const currentTask = pickCurrentTask(
      driverTasks.filter((task) => task.orderId === ownedRecord.orderId),
    );
    const stateCode = getOwnedStateCode(ownedRecord, dispatchJob);
    const incidentHref = `/incidents?create=1&relatedOrderId=${encodeURIComponent(
      ownedRecord.orderId,
    )}&title=${encodeURIComponent(
      ownedRecord.orderNo || ownedRecord.orderId,
    )}&description=${encodeURIComponent(
      `${ownedRecord.orderId} · ${getAddressLabel(ownedRecord.pickup)} → ${getAddressLabel(ownedRecord.dropoff)}`,
    )}`;
    const approvalHref = `/approval-requests?tenantId=${encodeURIComponent(
      ownedRecord.tenantId ?? "",
    )}`;
    const candidateRows: CandidateRow[] = candidateEnvelope.items.map(
      (candidate, index) => {
        const driver = driverById.get(candidate.driverId) ?? null;
        const gate = getCandidateGate(locale, candidate, ownedRecord, driver);
        const candidateActions = readAvailableActions(candidate);
        const score =
          driver?.dispatchEligible && candidate.etaMinutes > 0
            ? Math.max(0, 100 - candidate.etaMinutes * 3)
            : null;

        return {
          rank: (
            <div style={{ display: "grid", gap: 2 }}>
              <strong style={{ color: theme.accent }}>#{index + 1}</strong>
              <span style={{ color: theme.textDim, fontSize: 11 }}>
                {formatCode(locale, getCandidateLocationState(candidate))}
              </span>
            </div>
          ),
          driver: (
            <div style={{ display: "grid", gap: 2 }}>
              <Link
                href={`/drivers/${encodeURIComponent(candidate.driverId)}`}
                style={{
                  color: theme.text,
                  textDecoration: "none",
                  fontWeight: 600,
                }}
              >
                {driver?.name ?? candidate.driverId}
              </Link>
              <span style={{ color: theme.textDim, fontSize: 11 }}>
                {candidate.vehicleId}
              </span>
            </div>
          ),
          eta: (
            <div style={{ display: "grid", gap: 2 }}>
              <span>{formatEtaLabel(candidate.etaMinutes)}</span>
              <span style={{ color: theme.textDim, fontSize: 11 }}>
                {candidate.operatingArea}
              </span>
            </div>
          ),
          gates: (
            <Pill theme={theme} tone={gate.tone} dot={gate.tone !== "success"}>
              {gate.label}
            </Pill>
          ),
          score: (
            <div style={{ display: "grid", gap: 2 }}>
              <span>{score !== null ? `${score}` : "—"}</span>
              <span style={{ color: theme.textDim, fontSize: 11 }}>
                {locale === "zh" ? "rank/ETA" : "rank / ETA"}
              </span>
            </div>
          ),
          actions: renderActionSection(
            locale,
            candidateActions,
            locale === "zh"
              ? "此候選沒有可執行 action。"
              : "No actions are available for this candidate.",
            {
              baseHref: href,
              scope: "candidate",
              resourceId: candidate.driverId,
              resourceLabel: driver?.name ?? candidate.driverId,
              driverHref: `/drivers/${encodeURIComponent(candidate.driverId)}`,
              candidatesHref: withFragment(href, "candidates"),
              currentTaskHref: withFragment(href, "current-driver-task"),
              incidentHref,
              approvalHref,
            },
          ),
        };
      },
    );

    const candidateColumns: CanvasTableColumn<CandidateRow>[] = [
      { h: "RANK", k: "rank", w: 90 },
      {
        h: locale === "zh" ? "DRIVER / 車輛" : "DRIVER / VEHICLE",
        k: "driver",
        w: 220,
      },
      { h: "ETA", k: "eta", w: 120 },
      { h: locale === "zh" ? "GATES" : "GATES", k: "gates", w: 180 },
      { h: "SCORE", k: "score", w: 110 },
      { h: "ACTIONS", k: "actions", w: 340 },
    ];

    const timelineEntries: TimelineEntry[] =
      traceEnvelope.items.length > 0
        ? [...traceEnvelope.items]
            .sort(
              (left, right) =>
                new Date(right.createdAt).getTime() -
                new Date(left.createdAt).getTime(),
            )
            .map((entry) => ({
              id: entry.traceId,
              title: formatCode(locale, entry.eventType),
              body: entry.message,
              at: formatLongDateTime(locale, entry.createdAt),
              tone: getTimelineTone(entry.eventType),
              actor:
                typeof entry.details?.actorId === "string"
                  ? entry.details.actorId
                  : null,
            }))
        : [
            {
              id: "trace-empty",
              title: locale === "zh" ? "尚無 trace" : "No trace yet",
              body:
                locale === "zh"
                  ? "目前沒有 dispatch trace，保留工作區 metadata 與 action panel。"
                  : "No dispatch trace is available yet; metadata and action panel remain available.",
              at: "—",
              tone: "info",
            },
          ];

    const orderActions = readAvailableActions(ownedRecord);
    const heroActions = selectHeroActions(orderActions);
    const emptyState = readEmptyState(candidateEnvelope);
    const emptyContent = buildEmptyStateContent(locale, emptyState);

    const summaryItems = [
      {
        k: locale === "zh" ? "Domain" : "Domain",
        v: (
          <Pill theme={theme} tone="accent">
            owned
          </Pill>
        ),
      },
      {
        k: locale === "zh" ? "狀態" : "State",
        v: (
          <Pill theme={theme} tone={getStateTone(stateCode)}>
            {formatCode(locale, stateCode)}
          </Pill>
        ),
      },
      {
        k: locale === "zh" ? "Tenant" : "Tenant",
        v: getTenantLabel(ownedRecord),
      },
      {
        k: locale === "zh" ? "Window" : "Window",
        v: formatWindow(
          locale,
          ownedRecord.reservationWindowStart,
          ownedRecord.reservationWindowEnd,
        ),
        mono: true,
      },
      {
        k: locale === "zh" ? "Pickup" : "Pickup",
        v: getAddressLabel(ownedRecord.pickup),
      },
      {
        k: locale === "zh" ? "Dropoff" : "Dropoff",
        v: getAddressLabel(ownedRecord.dropoff),
      },
      {
        k: locale === "zh" ? "服務桶" : "Service bucket",
        v: formatCode(locale, ownedRecord.serviceBucket),
      },
      {
        k: locale === "zh" ? "ETA" : "ETA",
        v: formatEtaLabel(
          dispatchJob?.latestEtaMinutes ?? ownedRecord.etaSnapshot?.etaMinutes,
        ),
      },
      {
        k: locale === "zh" ? "Dispatch job" : "Dispatch job",
        v: dispatchJob?.dispatchJobId ?? "—",
        mono: true,
      },
      {
        k: locale === "zh" ? "錄音 / callback" : "Recording / callback",
        v:
          ownedRecord.callId || ownedRecord.recordingId
            ? `${ownedRecord.callId ?? "call —"} · ${ownedRecord.recordingId ?? "recording —"}`
            : locale === "zh"
              ? "無"
              : "None",
        mono: true,
      },
      {
        k: locale === "zh" ? "報價" : "Quoted fare",
        v: ownedRecord.quotedFare
          ? formatMinorCurrency(
              ownedRecord.quotedFare.amountMinor,
              ownedRecord.quotedFare.currency,
            )
          : "—",
      },
      {
        k: locale === "zh" ? "更新時間" : "Updated",
        v: formatLongDateTime(locale, ownedRecord.updatedAt),
        mono: true,
      },
    ];

    const gateItems =
      (ownedRecord.complianceGates ?? []).length > 0
        ? (ownedRecord.complianceGates ?? []).map(
            (
              gate: NonNullable<OwnedOrderRecord["complianceGates"]>[number],
            ) => ({
              k: gate.title || formatCode(locale, gate.gateType),
              v: (
                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Pill
                      theme={theme}
                      tone={
                        gate.blocking
                          ? "danger"
                          : gate.state === "clear"
                            ? "success"
                            : "warn"
                      }
                      dot
                    >
                      {formatCode(locale, gate.state)}
                    </Pill>
                    {gate.blocking ? (
                      <Pill theme={theme} tone="warn">
                        {locale === "zh" ? "blocking" : "blocking"}
                      </Pill>
                    ) : null}
                  </div>
                  <span style={{ color: theme.textMuted, fontSize: "12px" }}>
                    {gate.missingItems.length > 0
                      ? gate.missingItems.join(", ")
                      : formatCode(locale, gate.nextAction)}
                  </span>
                </div>
              ),
            }),
          )
        : [
            {
              k: locale === "zh" ? "Compliance" : "Compliance",
              v: (
                <Pill theme={theme} tone="success" dot>
                  {locale === "zh" ? "clear" : "clear"}
                </Pill>
              ),
            },
          ];

    const exceptionItems = [
      {
        k: locale === "zh" ? "Exception hold" : "Exception hold",
        v: ownedRecord.exceptionHold
          ? formatCode(locale, ownedRecord.exceptionHold.reasonCode)
          : "—",
      },
      {
        k: locale === "zh" ? "Override" : "Override",
        v: ownedRecord.exceptionHold?.overrideRequest
          ? `${ownedRecord.exceptionHold.overrideRequest.requestedBy} · ${formatCode(locale, ownedRecord.exceptionHold.overrideRequest.overrideType)}`
          : "—",
      },
      {
        k: locale === "zh" ? "No supply" : "No supply",
        v: ownedRecord.noSupplyEscalation
          ? `${formatCode(locale, ownedRecord.noSupplyEscalation.escalationAction)} · ${formatDateTime(locale, ownedRecord.noSupplyEscalation.escalatedAt)}`
          : "—",
      },
      {
        k: locale === "zh" ? "Timeout" : "Timeout",
        v: ownedRecord.dispatchTimeout
          ? `${formatCode(locale, ownedRecord.dispatchTimeout.timeoutReasonCode)} · ${formatDateTime(locale, ownedRecord.dispatchTimeout.timeoutAt)}`
          : "—",
      },
    ];
    const commsItems = [
      {
        k: locale === "zh" ? "Call session" : "Call session",
        v: ownedRecord.callId ? (
          <Link
            href="/callcenter"
            style={{ color: theme.text, textDecoration: "none" }}
          >
            {ownedRecord.callId}
          </Link>
        ) : (
          "—"
        ),
        mono: true,
      },
      {
        k: locale === "zh" ? "Recording" : "Recording",
        v: ownedRecord.recordingId ?? "—",
        mono: true,
      },
      {
        k: locale === "zh" ? "Booking" : "Booking",
        v: ownedRecord.bookingId ?? "—",
        mono: true,
      },
      {
        k: locale === "zh" ? "Approval state" : "Approval state",
        v: (
          <Pill
            theme={theme}
            tone={
              ownedRecord.approvalRequestIds.length > 0 ? "warn" : "success"
            }
          >
            {formatCode(locale, ownedRecord.approvalState)}
          </Pill>
        ),
      },
    ];
    const focusActions = [
      ...orderActions,
      ...(emptyState?.nextAction ? [emptyState.nextAction] : []),
      ...candidateEnvelope.items.flatMap((candidate) =>
        readAvailableActions(candidate),
      ),
    ];
    const focusedAction =
      focusActions.find((action) => action.action === focusedActionId) ?? null;

    return (
      <>
        <PageHeader
          theme={theme}
          title={`${ownedRecord.orderId} · ${ownedRecord.orderNo}`}
          subtitle={[
            locale === "zh" ? "Dispatch workspace" : "Dispatch workspace",
            formatCode(locale, stateCode),
            formatWindow(
              locale,
              ownedRecord.reservationWindowStart,
              ownedRecord.reservationWindowEnd,
            ),
          ].join(" · ")}
          actions={
            <div style={actionRowStyle}>
              <Link href="/dispatch" style={actionLinkStyle("ghost")}>
                <CanvasIcon name="arrow" size={12} />
                <span>
                  {locale === "zh" ? "返回 boards" : "Back to boards"}
                </span>
              </Link>
              {ownedRecord.callId ? (
                <Link href="/callcenter" style={actionLinkStyle()}>
                  <CanvasIcon name="phone" size={12} />
                  <span>
                    {locale === "zh" ? "開啟 callcenter" : "Open callcenter"}
                  </span>
                </Link>
              ) : null}
              {heroActions.map((action, index) =>
                renderActionAffordance(locale, action, `hero-${index}`, {
                  baseHref: href,
                  scope: "dispatch",
                  resourceId: ownedRecord.orderId,
                  resourceLabel: ownedRecord.orderNo || ownedRecord.orderId,
                  candidatesHref: withFragment(href, "candidates"),
                  currentTaskHref: withFragment(href, "current-driver-task"),
                  incidentHref,
                  approvalHref,
                  refreshHref: withFragment(href, "refresh-tier"),
                }),
              )}
            </div>
          }
        />

        <div style={pageBodyStyle}>
          <div id="refresh-tier">
            {renderRefreshBanner(
              locale,
              readRefreshMetadata(ownedOrdersEnvelope),
              "T2 Dispatch / 5s",
              href,
              locale === "zh"
                ? "工作項目主資料 freshness"
                : "Work item metadata freshness",
            )}
          </div>
          {renderActionFocusBanner(
            locale,
            href,
            focusedAction,
            focusedScope,
            focusedResourceLabel ??
              focusedResourceId ??
              (ownedRecord.orderNo || ownedRecord.orderId),
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.65fr)",
              gap: 16,
            }}
          >
            <div style={surfaceStackStyle}>
              <Card
                theme={theme}
                title={
                  locale === "zh" ? "Work item summary" : "Work item summary"
                }
                actions={
                  <Pill theme={theme} tone="accent">
                    owned
                  </Pill>
                }
              >
                <DL theme={theme} cols={3} items={summaryItems} />
              </Card>

              <Card
                theme={theme}
                title={locale === "zh" ? "State machine" : "State machine"}
              >
                {renderStateMachine(
                  locale,
                  [
                    "ready_for_dispatch",
                    "queued",
                    "broadcasting",
                    "assigned",
                    "on_trip",
                    "completed",
                  ],
                  stateCode,
                  {
                    exceptionalTone:
                      getStateTone(stateCode) === "neutral"
                        ? "info"
                        : (getStateTone(stateCode) as Exclude<
                            CanvasTone,
                            "neutral"
                          >),
                    exceptionalBody:
                      locale === "zh"
                        ? "owned dispatch 目前處於例外或終態；請改看 Compliance / hold、No supply、Timeout 與 availableActions，而不是把它當成流程起點。"
                        : "This owned dispatch is in an exceptional or terminal state; use Compliance / hold, No supply, Timeout, and availableActions instead of treating it as the start of the flow.",
                  },
                )}
              </Card>

              <div id="candidates">
                <Card
                  theme={theme}
                  title={
                    locale === "zh"
                      ? "候選司機與分派動作"
                      : "Candidates and assignment actions"
                  }
                  actions={
                    <div style={actionRowStyle}>
                      <Pill
                        theme={theme}
                        tone={refreshTone(
                          readRefreshMetadata(candidateEnvelope)?.dataFreshness,
                        )}
                      >
                        {candidateEnvelope.items.length}{" "}
                        {locale === "zh" ? "candidate" : "candidate"}
                      </Pill>
                      <Link href={href} style={actionLinkStyle("ghost")}>
                        <CanvasIcon name="clock" size={12} />
                        <span>
                          {locale === "zh" ? "刷新候選" : "Refresh candidates"}
                        </span>
                      </Link>
                    </div>
                  }
                >
                  {candidateRows.length > 0 ? (
                    <Table
                      theme={theme}
                      columns={candidateColumns}
                      rows={candidateRows}
                    />
                  ) : (
                    <Banner
                      theme={theme}
                      tone={emptyContent.tone}
                      icon={emptyContent.icon}
                      title={emptyContent.title}
                      body={emptyContent.body}
                      actions={
                        emptyState?.nextAction ? (
                          <div style={actionRowStyle}>
                            {renderActionAffordance(
                              locale,
                              emptyState.nextAction,
                              "empty-next",
                              {
                                baseHref: href,
                                scope: "empty_state",
                                resourceId: ownedRecord.orderId,
                                resourceLabel:
                                  ownedRecord.orderNo || ownedRecord.orderId,
                                incidentHref,
                                approvalHref,
                                candidatesHref: withFragment(
                                  href,
                                  "candidates",
                                ),
                              },
                            )}
                          </div>
                        ) : undefined
                      }
                    />
                  )}
                </Card>
              </div>

              <Card
                theme={theme}
                title={locale === "zh" ? "Dispatch trace" : "Dispatch trace"}
                actions={
                  <Pill
                    theme={theme}
                    tone={refreshTone(
                      readRefreshMetadata(traceEnvelope)?.dataFreshness,
                    )}
                  >
                    {timelineEntries.length}
                  </Pill>
                }
              >
                <div style={{ display: "grid", gap: 10 }}>
                  {timelineEntries.map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        display: "grid",
                        gap: 6,
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: `1px solid ${theme.border}`,
                        background: theme.surfaceLo,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            gap: 8,
                            flexWrap: "wrap",
                            alignItems: "center",
                          }}
                        >
                          <Pill theme={theme} tone={entry.tone} dot>
                            {entry.title}
                          </Pill>
                          {entry.actor ? (
                            <span
                              style={{ color: theme.textDim, fontSize: 11.5 }}
                            >
                              {entry.actor}
                            </span>
                          ) : null}
                        </div>
                        <span
                          style={{ color: theme.textMuted, fontSize: 11.5 }}
                        >
                          {entry.at}
                        </span>
                      </div>
                      <div
                        style={{
                          color: theme.text,
                          fontSize: "12.5px",
                          lineHeight: 1.55,
                        }}
                      >
                        {entry.body}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <div style={surfaceStackStyle}>
              <div id="available-actions">
                <Card
                  theme={theme}
                  title={
                    locale === "zh" ? "availableActions" : "availableActions"
                  }
                >
                  {renderActionSection(
                    locale,
                    orderActions,
                    locale === "zh"
                      ? "此 work item 目前沒有 backend 暴露的 action descriptor。"
                      : "This work item currently has no backend-exposed action descriptors.",
                    {
                      baseHref: href,
                      scope: "dispatch",
                      resourceId: ownedRecord.orderId,
                      resourceLabel: ownedRecord.orderNo || ownedRecord.orderId,
                      candidatesHref: withFragment(href, "candidates"),
                      currentTaskHref: withFragment(
                        href,
                        "current-driver-task",
                      ),
                      incidentHref,
                      approvalHref,
                      refreshHref: withFragment(href, "refresh-tier"),
                    },
                  )}
                  <div style={{ height: 12 }} />
                  <Field
                    theme={theme}
                    label={locale === "zh" ? "Risk pattern" : "Risk pattern"}
                  >
                    <div
                      style={{
                        display: "grid",
                        gap: 4,
                        color: theme.textMuted,
                        fontSize: "12px",
                      }}
                    >
                      <span>
                        {locale === "zh"
                          ? "low: direct + toast"
                          : "low: direct + toast"}
                      </span>
                      <span>
                        {locale === "zh"
                          ? "medium: confirm modal"
                          : "medium: confirm modal"}
                      </span>
                      <span>
                        {locale === "zh"
                          ? "high: confirm + required reason"
                          : "high: confirm + required reason"}
                      </span>
                    </div>
                  </Field>
                </Card>
              </div>

              <div id="compliance-hold">
                <Card
                  theme={theme}
                  title={
                    locale === "zh" ? "Compliance / hold" : "Compliance / hold"
                  }
                >
                  <DL theme={theme} cols={1} items={gateItems} />
                  <div style={{ height: 14 }} />
                  <DL theme={theme} cols={1} items={exceptionItems} />
                </Card>
              </div>

              <Card
                theme={theme}
                title={
                  locale === "zh"
                    ? "Linked recordings / callbacks"
                    : "Linked recordings / callbacks"
                }
              >
                <DL theme={theme} cols={1} items={commsItems} />
              </Card>

              <div id="current-driver-task">
                <Card
                  theme={theme}
                  title={
                    locale === "zh" ? "目前 driver task" : "Current driver task"
                  }
                >
                  <DL
                    theme={theme}
                    cols={1}
                    items={[
                      {
                        k: locale === "zh" ? "Task" : "Task",
                        v: currentTask?.taskId ?? "—",
                        mono: true,
                      },
                      {
                        k: locale === "zh" ? "Driver" : "Driver",
                        v: currentTask ? (
                          <Link
                            href={`/drivers/${encodeURIComponent(currentTask.driverId)}`}
                            style={{
                              color: theme.text,
                              textDecoration: "none",
                            }}
                          >
                            {driverById.get(currentTask.driverId)?.name ??
                              currentTask.driverId}
                          </Link>
                        ) : (
                          "—"
                        ),
                      },
                      {
                        k: locale === "zh" ? "狀態" : "Status",
                        v: currentTask ? (
                          <Pill
                            theme={theme}
                            tone={getStateTone(currentTask.status)}
                          >
                            {formatCode(locale, currentTask.status)}
                          </Pill>
                        ) : (
                          "—"
                        ),
                      },
                      {
                        k: locale === "zh" ? "Route" : "Route",
                        v:
                          currentTask && currentTask.waypoints.length > 0
                            ? currentTask.waypoints
                                .map(
                                  (
                                    waypoint: DriverTaskRecord["waypoints"][number],
                                  ) => waypoint.label,
                                )
                                .join(" → ")
                            : locale === "zh"
                              ? "尚未建立"
                              : "Not established",
                      },
                      {
                        k: locale === "zh" ? "Proof" : "Proof",
                        v: currentTask?.proof
                          ? locale === "zh"
                            ? "已上傳"
                            : "Uploaded"
                          : locale === "zh"
                            ? "待補"
                            : "Pending",
                      },
                    ]}
                  />
                </Card>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  const forwardedOrder = forwardedRecord!;
  const adapterHealth =
    adapterHealthResponse.items.find(
      (record) => record.platformCode === forwardedOrder.platformCode,
    ) ?? null;
  const issue =
    reconciliationIssues.find(
      (entry) => entry.mirrorOrderId === forwardedOrder.mirrorOrderId,
    ) ?? null;
  const acceptedDriver = forwardedOrder.acceptedDriverId
    ? (driverById.get(forwardedOrder.acceptedDriverId) ?? null)
    : null;
  const mirroredTask =
    unifiedDriverTasks.find(
      (task) =>
        task.externalOrderId === forwardedOrder.externalOrderId &&
        task.sourcePlatform === forwardedOrder.platformCode,
    ) ?? null;
  const forwardedActions = readAvailableActions(forwardedOrder);
  const forwardedHeroActions = selectHeroActions(forwardedActions);
  const mainRefresh = readRefreshMetadata(forwardedOrdersEnvelope);
  const routeLocked =
    readForwardedBoolean(forwardedOrder, ["routeLocked"]) ??
    mirroredTask?.routeLocked ??
    false;
  const waypointList = readForwardedList(forwardedOrder, [
    "waypoints",
    "route.waypoints",
    "trip.waypoints",
  ]);
  const externalSyncLink = buildCrossAppLink(
    "/adapter-registry",
    locale === "zh" ? "Inspect adapter" : "Inspect adapter",
    "adapter",
    forwardedOrder.platformCode,
  );
  const reconciliationResourceId =
    issue?.reconciliationJob.reconciliationJobId ??
    forwardedOrder.reconciliationJob?.reconciliationJobId ??
    forwardedOrder.mirrorOrderId;
  const reconciliationLink = buildCrossAppLink(
    issue ? "/payments" : "/payments#payments-create-issue",
    locale === "zh"
      ? issue
        ? "Open reconciliation queue"
        : "Create reconciliation issue"
      : issue
        ? "Open reconciliation queue"
        : "Create reconciliation issue",
    issue ? "reconciliation_queue" : "reconciliation_create",
    reconciliationResourceId,
  );
  const focusedForwardedAction =
    forwardedActions.find((action) => action.action === focusedActionId) ??
    null;
  const forwardedIncidentHref = `/incidents?create=1&relatedOrderId=${encodeURIComponent(
    forwardedOrder.mirrorOrderId,
  )}&title=${encodeURIComponent(
    forwardedOrder.externalOrderId || forwardedOrder.mirrorOrderId,
  )}&description=${encodeURIComponent(
    `${forwardedOrder.platformCode} · ${forwardedOrder.status}`,
  )}`;

  const forwardedSummaryItems = [
    {
      k: locale === "zh" ? "Domain" : "Domain",
      v: (
        <Pill theme={theme} tone="accent">
          forwarded
        </Pill>
      ),
    },
    {
      k: locale === "zh" ? "狀態" : "State",
      v: (
        <Pill theme={theme} tone={getForwardedStateTone(forwardedOrder.status)}>
          {formatCode(locale, forwardedOrder.status)}
        </Pill>
      ),
    },
    {
      k: locale === "zh" ? "Platform" : "Platform",
      v: formatCode(locale, forwardedOrder.platformCode),
    },
    {
      k: locale === "zh" ? "External order" : "External order",
      v: forwardedOrder.externalOrderId,
      mono: true,
    },
    {
      k: locale === "zh" ? "Pickup" : "Pickup",
      v:
        readForwardedValue(forwardedOrder, [
          "pickupSummary",
          "pickupAddress",
          "pickup.addressName",
          "pickup.address",
          "pickup",
        ]) ?? "—",
    },
    {
      k: locale === "zh" ? "Dropoff" : "Dropoff",
      v:
        readForwardedValue(forwardedOrder, [
          "dropoffSummary",
          "dropoffAddress",
          "dropoff.addressName",
          "dropoff.address",
          "dropoff",
        ]) ?? "—",
    },
    {
      k: locale === "zh" ? "Window" : "Window",
      v: formatWindow(
        locale,
        readForwardedValue(forwardedOrder, [
          "reservationWindowStart",
          "scheduledPickupAt",
          "pickupAt",
          "windowStart",
        ]),
        readForwardedValue(forwardedOrder, [
          "reservationWindowEnd",
          "scheduledDropoffAt",
          "windowEnd",
        ]),
      ),
      mono: true,
    },
    {
      k: locale === "zh" ? "Route locked" : "Route locked",
      v: routeLocked ? "true" : "false",
      mono: true,
    },
    {
      k: locale === "zh" ? "No-owned-assignment" : "No-owned-assignment",
      v: mirroredTask ? "false" : "true",
      mono: true,
    },
    {
      k: locale === "zh" ? "Last callback" : "Last callback",
      v:
        readForwardedValue(forwardedOrder, [
          "lastCallbackAt",
          "callbacks.0.createdAt",
          "callback.updatedAt",
        ]) ?? "—",
      mono: true,
    },
    {
      k: locale === "zh" ? "Native status" : "Native status",
      v: forwardedOrder.lastNativeStatus ?? mirroredTask?.nativeStatus ?? "—",
      mono: true,
    },
    {
      k: locale === "zh" ? "Updated" : "Updated",
      v: formatLongDateTime(locale, forwardedOrder.updatedAt),
      mono: true,
    },
  ];

  return (
    <>
      <PageHeader
        theme={theme}
        title={`${forwardedOrder.mirrorOrderId} · ${forwardedOrder.externalOrderId}`}
        subtitle={[
          locale === "zh"
            ? "Forwarded dispatch workspace"
            : "Forwarded dispatch workspace",
          formatCode(locale, forwardedOrder.status),
          formatCode(locale, forwardedOrder.platformCode),
        ].join(" · ")}
        actions={
          <div style={actionRowStyle}>
            <Link
              href="/dispatch?view=forwarded"
              style={actionLinkStyle("ghost")}
            >
              <CanvasIcon name="arrow" size={12} />
              <span>
                {locale === "zh"
                  ? "返回 forwarded board"
                  : "Back to forwarded board"}
              </span>
            </Link>
            {forwardedHeroActions.map((action, index) =>
              renderActionAffordance(
                locale,
                action,
                `forwarded-hero-${index}`,
                {
                  baseHref: href,
                  scope: "forwarded",
                  resourceId: forwardedOrder.mirrorOrderId,
                  resourceLabel:
                    forwardedOrder.externalOrderId ||
                    forwardedOrder.mirrorOrderId,
                  adapterHref: resolveCrossAppHref(externalSyncLink),
                  reconciliationHref: resolveCrossAppHref(reconciliationLink),
                  incidentHref: forwardedIncidentHref,
                  refreshHref: withFragment(href, "refresh-tier"),
                  eligibleDriversHref: withFragment(href, "eligible-drivers"),
                },
              ),
            )}
            {renderCrossAppLink(externalSyncLink)}
            {renderCrossAppLink(reconciliationLink)}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        <div id="refresh-tier">
          {renderRefreshBanner(
            locale,
            mainRefresh,
            "T2 Dispatch / 5s",
            href,
            locale === "zh"
              ? "鏡像訂單主資料 freshness"
              : "Mirror-order metadata freshness",
          )}
        </div>
        {renderActionFocusBanner(
          locale,
          href,
          focusedForwardedAction,
          focusedScope,
          focusedResourceLabel ??
            focusedResourceId ??
            forwardedOrder.externalOrderId,
        )}

        {adapterHealth && adapterHealth.status !== "healthy" ? (
          <Banner
            theme={theme}
            tone={getAdapterTone(adapterHealth.status)}
            icon="warn"
            title={`${formatCode(locale, forwardedOrder.platformCode)} adapter ${adapterHealth.status}`}
            body={
              adapterHealth.lastError ??
              (locale === "zh"
                ? "forwarded workspace 目前依賴 degraded adapter。"
                : "The forwarded workspace currently depends on a degraded adapter.")
            }
            actions={renderCrossAppLink(externalSyncLink)}
          />
        ) : null}

        <Banner
          theme={theme}
          tone="info"
          icon="ext"
          title={
            locale === "zh"
              ? "此訂單為 forwarded mirror"
              : "This order is a forwarded mirror"
          }
          body={
            locale === "zh"
              ? "不可假裝為 owned；本地只顯示 sync / fallback / reconciliation 狀態，跨 app mutation 需走 owner surface。"
              : "Do not treat this as an owned order; this surface only reflects sync, fallback, and reconciliation state while owner mutations stay in the owning app."
          }
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.35fr) minmax(320px, 0.65fr)",
            gap: 16,
          }}
        >
          <div style={surfaceStackStyle}>
            <Card
              theme={theme}
              title={
                locale === "zh"
                  ? "Mirror-order summary"
                  : "Mirror-order summary"
              }
              actions={
                <Pill theme={theme} tone="accent">
                  forwarded
                </Pill>
              }
            >
              <DL theme={theme} cols={3} items={forwardedSummaryItems} />
            </Card>

            <Card
              theme={theme}
              title={locale === "zh" ? "State machine" : "State machine"}
            >
              {renderStateMachine(
                locale,
                [
                  "received",
                  "broadcasted",
                  "accept_pending",
                  "confirmed_by_platform",
                  "completed_synced",
                ],
                forwardedOrder.status,
                {
                  exceptionalTone:
                    getForwardedStateTone(forwardedOrder.status) === "neutral"
                      ? "info"
                      : (getForwardedStateTone(
                          forwardedOrder.status,
                        ) as Exclude<CanvasTone, "neutral">),
                  exceptionalBody:
                    locale === "zh"
                      ? "forwarded mirror 目前不在標準同步進度上；請依 adapter health、reconciliation、manual fallback 與 availableActions 決策。"
                      : "This forwarded mirror is outside the standard sync progression; use adapter health, reconciliation, manual fallback, and availableActions to decide the next action.",
                },
              )}
            </Card>

            <div id="eligible-drivers">
              <Card
                theme={theme}
                title={
                  locale === "zh"
                    ? "適格司機 / platform handling"
                    : "Eligible drivers / platform handling"
                }
                actions={
                  <Pill theme={theme} tone="info">
                    {forwardedOrder.candidateDriverIds.length}{" "}
                    {locale === "zh" ? "drivers" : "drivers"}
                  </Pill>
                }
              >
                {forwardedOrder.candidateDriverIds.length > 0 ? (
                  <DL
                    theme={theme}
                    cols={1}
                    items={forwardedOrder.candidateDriverIds.map(
                      (driverId: string, index: number) => ({
                        k: `${index + 1}. ${driverId}`,
                        v: (
                          <div style={{ display: "grid", gap: 4 }}>
                            <Link
                              href={`/drivers/${encodeURIComponent(driverId)}`}
                              style={{
                                color: theme.text,
                                textDecoration: "none",
                              }}
                            >
                              {driverById.get(driverId)?.name ?? driverId}
                            </Link>
                            <span
                              style={{
                                color: theme.textMuted,
                                fontSize: "12px",
                              }}
                            >
                              {acceptedDriver?.driverId === driverId
                                ? locale === "zh"
                                  ? "目前 accepted driver"
                                  : "Current accepted driver"
                                : locale === "zh"
                                  ? "廣播候選"
                                  : "Broadcast candidate"}
                            </span>
                          </div>
                        ),
                      }),
                    )}
                  />
                ) : (
                  <Banner
                    theme={theme}
                    tone="info"
                    icon="warn"
                    title={
                      locale === "zh"
                        ? "目前沒有候選司機廣播名單"
                        : "No broadcast candidates right now"
                    }
                    body={
                      locale === "zh"
                        ? "forwarded payload 沒有提供 candidateDriverIds，需依 availableActions / adapter 狀態決策。"
                        : "The forwarded payload does not currently provide candidateDriverIds; use availableActions and adapter health for the next decision."
                    }
                  />
                )}
              </Card>
            </div>

            <Card
              theme={theme}
              title={
                locale === "zh"
                  ? "Route / callback / sync"
                  : "Route / callback / sync"
              }
            >
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: locale === "zh" ? "Waypoints" : "Waypoints",
                    v:
                      waypointList.length > 0
                        ? waypointList.join(" → ")
                        : locale === "zh"
                          ? "未提供"
                          : "Not provided",
                  },
                  {
                    k: locale === "zh" ? "Manual fallback" : "Manual fallback",
                    v: forwardedOrder.manualFallback.required ? (
                      <div style={{ display: "grid", gap: 4 }}>
                        <Pill theme={theme} tone="warn" dot>
                          {forwardedOrder.manualFallback.reason ??
                            "manual_fallback"}
                        </Pill>
                        <span
                          style={{ color: theme.textMuted, fontSize: "12px" }}
                        >
                          {forwardedOrder.manualFallback.requestedBy ?? "—"} ·{" "}
                          {formatDateTime(
                            locale,
                            forwardedOrder.manualFallback.requestedAt,
                          )}
                        </span>
                      </div>
                    ) : (
                      <Pill theme={theme} tone="success" dot>
                        {locale === "zh" ? "clear" : "clear"}
                      </Pill>
                    ),
                  },
                  {
                    k: locale === "zh" ? "Sync error" : "Sync error",
                    v: forwardedOrder.lastSyncError ? (
                      <div style={{ display: "grid", gap: 4 }}>
                        <Pill theme={theme} tone="danger" dot>
                          {forwardedOrder.lastSyncError.code}
                        </Pill>
                        <span
                          style={{ color: theme.textMuted, fontSize: "12px" }}
                        >
                          {forwardedOrder.lastSyncError.message}
                        </span>
                      </div>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    k: locale === "zh" ? "Reconciliation" : "Reconciliation",
                    v: issue ? (
                      <div style={{ display: "grid", gap: 4 }}>
                        <Pill theme={theme} tone="warn">
                          {issue.reconciliationJob.status} ·{" "}
                          {issue.reconciliationJob.mismatchCount}
                        </Pill>
                        <span
                          style={{ color: theme.textMuted, fontSize: "12px" }}
                        >
                          {issue.reconciliationJob.reason}
                        </span>
                      </div>
                    ) : forwardedOrder.reconciliationJob ? (
                      <Pill theme={theme} tone="info">
                        {forwardedOrder.reconciliationJob.status}
                      </Pill>
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
            </Card>
          </div>

          <div style={surfaceStackStyle}>
            <div id="available-actions">
              <Card
                theme={theme}
                title={
                  locale === "zh" ? "availableActions" : "availableActions"
                }
              >
                {renderActionSection(
                  locale,
                  forwardedActions,
                  locale === "zh"
                    ? "此 forwarded work item 目前沒有 backend action descriptor。"
                    : "This forwarded work item currently has no backend action descriptors.",
                  {
                    baseHref: href,
                    scope: "forwarded",
                    resourceId: forwardedOrder.mirrorOrderId,
                    resourceLabel:
                      forwardedOrder.externalOrderId ||
                      forwardedOrder.mirrorOrderId,
                    adapterHref: resolveCrossAppHref(externalSyncLink),
                    reconciliationHref: resolveCrossAppHref(reconciliationLink),
                    incidentHref: forwardedIncidentHref,
                    refreshHref: withFragment(href, "refresh-tier"),
                    eligibleDriversHref: withFragment(href, "eligible-drivers"),
                  },
                )}
              </Card>
            </div>

            <div id="adapter-cross-app">
              <Card
                theme={theme}
                title={
                  locale === "zh"
                    ? "Adapter / cross-app"
                    : "Adapter / cross-app"
                }
              >
                <DL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: locale === "zh" ? "Adapter health" : "Adapter health",
                      v: adapterHealth ? (
                        <Pill
                          theme={theme}
                          tone={getAdapterTone(adapterHealth.status)}
                          dot={adapterHealth.status !== "healthy"}
                        >
                          {adapterHealth.status}
                        </Pill>
                      ) : (
                        "—"
                      ),
                    },
                    {
                      k: locale === "zh" ? "Last checked" : "Last checked",
                      v: adapterHealth
                        ? formatLongDateTime(
                            locale,
                            adapterHealth.lastCheckedAt,
                          )
                        : "—",
                      mono: true,
                    },
                    {
                      k:
                        locale === "zh"
                          ? "Mirror owner app"
                          : "Mirror owner app",
                      v: renderCrossAppLink(externalSyncLink),
                    },
                    {
                      k:
                        locale === "zh"
                          ? "Reconciliation owner"
                          : "Reconciliation owner",
                      v: renderCrossAppLink(reconciliationLink),
                    },
                  ]}
                />
              </Card>
            </div>

            <Card
              theme={theme}
              title={
                locale === "zh" ? "Current task mirror" : "Current task mirror"
              }
            >
              <DL
                theme={theme}
                cols={1}
                items={[
                  {
                    k: locale === "zh" ? "Accepted driver" : "Accepted driver",
                    v: acceptedDriver ? (
                      <Link
                        href={`/drivers/${encodeURIComponent(acceptedDriver.driverId)}`}
                        style={{ color: theme.text, textDecoration: "none" }}
                      >
                        {acceptedDriver.name}
                      </Link>
                    ) : (
                      "—"
                    ),
                  },
                  {
                    k: locale === "zh" ? "Task state" : "Task state",
                    v: mirroredTask ? (
                      <Pill
                        theme={theme}
                        tone={getForwardedStateTone(forwardedOrder.status)}
                      >
                        {formatCode(locale, mirroredTask.localStatus)}
                      </Pill>
                    ) : locale === "zh" ? (
                      "沒有 owned task mirror"
                    ) : (
                      "No owned task mirror"
                    ),
                  },
                  {
                    k: locale === "zh" ? "Action state" : "Action state",
                    v: mirroredTask?.driverActionState ?? "—",
                    mono: true,
                  },
                  {
                    k: locale === "zh" ? "Sync issue" : "Sync issue",
                    v: mirroredTask?.syncIssueSummary ?? "—",
                  },
                ]}
              />
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
