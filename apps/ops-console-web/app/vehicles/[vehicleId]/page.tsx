import Link from "next/link";
import { headers } from "next/headers";
import type { CSSProperties, ReactNode } from "react";
import type {
  AuditLogRecord,
  CrossAppResourceLink,
  DriverRegistryRecord,
  DriverTaskRecord,
  EmptyReason,
  IncidentRecord,
  MaintenanceRecord,
  RefreshTier,
  ResourceActionDescriptor,
  ShiftRecord,
  UiRefreshMetadata,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { isMaintenanceOverdue } from "@/lib/ops-analytics";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  Timeline,
  WorkflowEmptyState,
  buildCanvasTheme,
  type CanvasTableColumn,
  type ManagementTone,
  type CanvasTheme,
  type CanvasTone,
  type TimelineItem,
} from "@drts/ui-web";

type VehicleDetailPageProps = {
  params: Promise<{
    vehicleId: string;
  }>;
};

type LoadResult<T> = {
  data: T;
  error: string | null;
};

type VehicleBinding = {
  driver: DriverRegistryRecord | null;
  source: "task" | "shift";
  statusCode: string;
  bindingId: string;
  boundAt: string | null;
};

type VehicleAction = {
  descriptor: ResourceActionDescriptor;
  label: string;
  icon?: "arrow" | "check" | "ext" | "filter" | "plus" | "users" | "warn" | "x";
  href?: string;
  openInNewTab?: boolean;
  variant?: "primary" | "secondary" | "ghost";
};

type MaintenanceRow = Record<string, unknown> & {
  id: ReactNode;
  kind: string;
  status: string;
  scheduled: string;
  overdue: boolean;
};

type ContractRow = Record<string, unknown> & {
  id: ReactNode;
  partner: string;
  type: string;
  term: string;
  status: string;
  expiringSoon: boolean;
};

type IncidentRow = Record<string, unknown> & {
  id: ReactNode;
  title: string;
  severity: string;
  status: string;
  updated: string;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "medium";
const REFRESH_STALE_AFTER_MS = 15_000;
const ACTIVE_DRIVER_TASK_STATUSES = new Set<DriverTaskRecord["status"]>([
  "pending_acceptance",
  "accepted",
  "enroute_pickup",
  "arrived_pickup",
  "on_trip",
  "proof_pending",
]);

const pageBodyStyle: CSSProperties = {
  padding: "24px",
  display: "grid",
  gap: "16px",
};

const detailGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
  gap: "16px",
};

const columnStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function normalizeOrigin(value: string | null | undefined) {
  return value ? value.replace(/\/+$/, "") : null;
}

function formatDateTime(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
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

function formatDateOnly(locale: Locale, value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

function formatList(locale: Locale, values: readonly string[]) {
  if (values.length === 0) {
    return "—";
  }

  return values
    .map((value) => formatOpsCodeLabel(locale, value))
    .join(locale === "zh" ? "、" : ", ");
}

function getVehicleTypeLabel(locale: Locale, vehicle: VehicleRegistryRecord) {
  return formatList(locale, vehicle.supportedServiceBuckets);
}

function summarizeBlockedReasons(
  locale: Locale,
  vehicle: VehicleRegistryRecord,
): string {
  const reasons = vehicle.supplyLifecycle.dispatch.blockedReasons;
  if (reasons.length === 0) {
    return copy(locale, "No active dispatch blockers", "目前沒有派遣阻塞");
  }

  return reasons
    .map((reason: string) => formatOpsCodeLabel(locale, reason))
    .join(" · ");
}

function getPrimaryVehicleStatusCode(vehicle: VehicleRegistryRecord) {
  if (vehicle.supplyLifecycle.offboarding.status !== "none") {
    return vehicle.supplyLifecycle.offboarding.status;
  }

  if (!vehicle.dispatchableFlag) {
    return (
      vehicle.supplyLifecycle.dispatch.blockedReasons[0] ?? "not_dispatchable"
    );
  }

  if (vehicle.insuranceStatus === "expired") {
    return "expired";
  }

  return "active";
}

function getPillTone(
  tone: "success" | "warn" | "danger" | "info" | "neutral",
): CanvasTone {
  return tone;
}

function getVehicleStatusTone(vehicle: VehicleRegistryRecord): CanvasTone {
  if (vehicle.supplyLifecycle.offboarding.status !== "none") {
    return "warn";
  }
  if (!vehicle.dispatchableFlag || vehicle.insuranceStatus === "expired") {
    return "danger";
  }
  return "success";
}

function classifyErrorReason(error: string): EmptyReason {
  const lower = error.toLowerCase();
  if (
    lower.includes("permission") ||
    lower.includes("forbidden") ||
    lower.includes("403") ||
    lower.includes("401")
  ) {
    return "permission_denied";
  }
  if (
    lower.includes("external") ||
    lower.includes("unavailable") ||
    lower.includes("timeout") ||
    lower.includes("gateway") ||
    lower.includes("adapter")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function emptyTone(reason: EmptyReason): ManagementTone {
  if (reason === "fetch_failed") return "danger";
  if (
    reason === "permission_denied" ||
    reason === "external_unavailable" ||
    reason === "not_provisioned"
  ) {
    return "warning";
  }
  return "neutral";
}

function emptyIcon(reason: EmptyReason) {
  if (reason === "no_data") return "check" as const;
  if (reason === "not_provisioned") return "plus" as const;
  if (reason === "fetch_failed") return "x" as const;
  if (reason === "permission_denied") return "warn" as const;
  if (reason === "external_unavailable") return "warn" as const;
  return "filter" as const;
}

function emptyTitle(locale: Locale, reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return copy(locale, "No records yet", "目前沒有資料");
    case "not_provisioned":
      return copy(locale, "Not provisioned", "尚未 provision");
    case "fetch_failed":
      return copy(locale, "Snapshot unavailable", "快照暫不可用");
    case "permission_denied":
      return copy(locale, "Permission required", "權限不足");
    case "external_unavailable":
      return copy(
        locale,
        "External dependency unavailable",
        "外部相依暫不可用",
      );
    case "filtered_empty":
      return copy(locale, "No matches after filtering", "套用篩選後沒有結果");
    default:
      return copy(locale, "No records yet", "目前沒有資料");
  }
}

function defaultEmptyDescription(locale: Locale, reason: EmptyReason) {
  switch (reason) {
    case "no_data":
      return copy(
        locale,
        "This section is healthy, but there is nothing to show for the current vehicle.",
        "這個區塊健康可用，但目前這輛車沒有對應資料。",
      );
    case "not_provisioned":
      return copy(
        locale,
        "The required upstream record has not been provisioned for this vehicle yet.",
        "這輛車所需的上游資料尚未 provision。",
      );
    case "fetch_failed":
      return copy(
        locale,
        "The service responded with an error before a usable snapshot could be rendered.",
        "服務在回傳可用快照前發生錯誤。",
      );
    case "permission_denied":
      return copy(
        locale,
        "Your current authority can open this page, but this subsection needs a higher-scope read grant.",
        "你可以進入此頁，但此子區塊需要更高權限才能讀取。",
      );
    case "external_unavailable":
      return copy(
        locale,
        "The section depends on an external or degraded upstream system that is temporarily unavailable.",
        "此區塊依賴的外部或降級上游系統目前暫不可用。",
      );
    case "filtered_empty":
      return copy(
        locale,
        "The upstream dataset exists, but the current filter left no matching rows.",
        "上游資料存在，但目前篩選條件沒有留下任何符合的列。",
      );
    default:
      return copy(
        locale,
        "No records are currently available.",
        "目前沒有可顯示的資料。",
      );
  }
}

function actionStyle(
  themeValue: CanvasTheme,
  descriptor: ResourceActionDescriptor,
  variant: "primary" | "secondary" | "ghost" = "secondary",
  disabled = false,
): CSSProperties {
  if (descriptor.riskLevel === "high") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "5px 10px",
      height: "28px",
      borderRadius: "7px",
      border: `1px solid ${themeValue.danger}`,
      background: themeValue.danger,
      color: "#fff",
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      fontFamily: themeValue.fontFamily,
    };
  }

  if (variant === "primary") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "5px 10px",
      height: "28px",
      borderRadius: "7px",
      border: `1px solid ${themeValue.accent}`,
      background: themeValue.accent,
      color: "#fff",
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      fontFamily: themeValue.fontFamily,
    };
  }

  if (variant === "ghost") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "5px 10px",
      height: "28px",
      borderRadius: "7px",
      border: "1px solid transparent",
      background: "transparent",
      color: themeValue.textMuted,
      fontSize: "12px",
      fontWeight: 500,
      lineHeight: 1,
      textDecoration: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? 0.55 : 1,
      fontFamily: themeValue.fontFamily,
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 10px",
    height: "28px",
    borderRadius: "7px",
    border: `1px solid ${themeValue.border}`,
    background: themeValue.surface,
    color: themeValue.text,
    fontSize: "12px",
    fontWeight: 500,
    lineHeight: 1,
    textDecoration: "none",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    fontFamily: themeValue.fontFamily,
  };
}

function renderVehicleAction(action: VehicleAction) {
  const disabled = !action.descriptor.enabled || !action.href;
  const href = action.href;
  const content = (
    <>
      {action.icon ? <CanvasIcon name={action.icon} size={13} /> : null}
      <span>{action.label}</span>
    </>
  );
  const style = actionStyle(
    theme,
    action.descriptor,
    action.variant ?? "secondary",
    disabled,
  );
  const title = disabled
    ? (action.descriptor.disabledReasonCode ?? action.descriptor.action)
    : action.label;

  if (disabled || !href) {
    return (
      <button
        key={action.label}
        type="button"
        disabled
        title={title}
        style={style}
      >
        {content}
      </button>
    );
  }

  if (action.openInNewTab && href) {
    return (
      <a
        key={action.label}
        href={href}
        target="_blank"
        rel="noreferrer"
        title={title}
        style={style}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      key={action.label}
      href={href}
      prefetch={false}
      title={title}
      style={style}
    >
      {content}
    </Link>
  );
}

function renderEmptyState(
  locale: Locale,
  reason: EmptyReason,
  messageOverride?: string,
  action?: VehicleAction,
) {
  return (
    <WorkflowEmptyState
      title={
        <span
          style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}
        >
          <span>{emptyTitle(locale, reason)}</span>
          <span
            style={{ ...monoStyle, fontSize: "11px", color: theme.textDim }}
          >
            {reason}
          </span>
        </span>
      }
      description={messageOverride ?? defaultEmptyDescription(locale, reason)}
      tone={emptyTone(reason)}
      density="compact"
      icon={<CanvasIcon name={emptyIcon(reason)} size={22} />}
      actions={action ? <div>{renderVehicleAction(action)}</div> : undefined}
    />
  );
}

async function resolveWithFallback<T>(
  loader: () => Promise<T>,
  fallback: T,
  locale: Locale,
): Promise<LoadResult<T>> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: fallback,
      error:
        error instanceof Error
          ? error.message
          : copy(locale, "Unknown error", "未知錯誤"),
    };
  }
}

function latestTaskTimestamp(task: DriverTaskRecord) {
  return (
    task.startedAt ??
    task.arrivedPickupAt ??
    task.departedAt ??
    task.acceptedAt ??
    task.completedAt ??
    ""
  );
}

function pickCurrentBinding(
  vehicleId: string,
  drivers: DriverRegistryRecord[],
  tasks: DriverTaskRecord[],
  shifts: ShiftRecord[],
): VehicleBinding | null {
  const activeTask = [...tasks]
    .filter(
      (task) =>
        task.vehicleId === vehicleId &&
        ACTIVE_DRIVER_TASK_STATUSES.has(task.status),
    )
    .sort((left, right) =>
      latestTaskTimestamp(right).localeCompare(latestTaskTimestamp(left)),
    )[0];

  if (activeTask) {
    return {
      driver:
        drivers.find(
          (candidate) => candidate.driverId === activeTask.driverId,
        ) ?? null,
      source: "task",
      statusCode: activeTask.status,
      bindingId: activeTask.taskId,
      boundAt: latestTaskTimestamp(activeTask),
    };
  }

  const activeShift = [...shifts]
    .filter(
      (shift) => shift.vehicleId === vehicleId && shift.status === "active",
    )
    .sort((left, right) =>
      right.clockedInAt.localeCompare(left.clockedInAt),
    )[0];

  if (!activeShift) {
    return null;
  }

  return {
    driver:
      drivers.find(
        (candidate) => candidate.driverId === activeShift.driverId,
      ) ?? null,
    source: "shift",
    statusCode: activeShift.status,
    bindingId: activeShift.shiftId,
    boundAt: activeShift.clockedInAt,
  };
}

function resolvePlatformAdminOrigin(requestHeaders: Headers) {
  const explicit = normalizeOrigin(
    process.env.NEXT_PUBLIC_PLATFORM_ADMIN_ORIGIN ??
      process.env.PLATFORM_ADMIN_ORIGIN ??
      process.env.DEV_PLATFORM_ADMIN_ORIGIN ??
      process.env.STAGING_PLATFORM_ADMIN_ORIGIN ??
      process.env.PROD_PLATFORM_ADMIN_ORIGIN,
  );
  if (explicit) {
    return explicit;
  }

  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  if (!host) {
    return null;
  }

  const proto =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");

  try {
    const origin = new URL(`${proto}://${host}`);
    if (origin.hostname === "localhost" && origin.port === "3003") {
      origin.port = "3002";
      return origin.origin;
    }
    if (origin.hostname.startsWith("ops.")) {
      origin.hostname = origin.hostname.slice(4);
      return origin.origin;
    }
  } catch {
    return null;
  }

  return null;
}

function buildCrossAppHref(origin: string, link: CrossAppResourceLink) {
  const route = link.route.startsWith("/") ? link.route : `/${link.route}`;
  return `${origin}${route}`;
}

function buildRefreshMetadata(hasErrors: boolean): UiRefreshMetadata {
  return {
    generatedAt: new Date().toISOString(),
    staleAfterMs: REFRESH_STALE_AFTER_MS,
    dataFreshness: hasErrors ? "degraded" : "fresh",
    source: "live",
  };
}

function buildRefreshBannerBody(
  locale: Locale,
  metadata: UiRefreshMetadata,
  degradedSections: string[],
) {
  const freshnessLabel = formatOpsCodeLabel(locale, metadata.dataFreshness);
  const sectionSummary =
    degradedSections.length > 0
      ? copy(
          locale,
          `Degraded sections: ${degradedSections.join(", ")}`,
          `降級區塊：${degradedSections.join("、")}`,
        )
      : copy(
          locale,
          "All vehicle detail surfaces loaded.",
          "車輛詳情區塊已完整載入。",
        );

  return [
    copy(
      locale,
      `T3 cadence · ${metadata.source} snapshot · ${freshnessLabel}`,
      `T3 節奏 · ${metadata.source} 快照 · ${freshnessLabel}`,
    ),
    copy(
      locale,
      `Generated ${formatDateTime(locale, metadata.generatedAt)}`,
      `生成時間 ${formatDateTime(locale, metadata.generatedAt)}`,
    ),
    sectionSummary,
  ].join(" · ");
}

function formatPartnerLabel(contract: VehicleContractRecord) {
  return [contract.partnerId, contract.partnerType].filter(Boolean).join(" · ");
}

function isContractExpiringSoon(contract: VehicleContractRecord) {
  const endAt = new Date(contract.endAt).getTime();
  if (!Number.isFinite(endAt)) {
    return false;
  }

  return endAt <= Date.now() + 30 * 24 * 60 * 60 * 1000;
}

function buildAuditTimelineItems(
  locale: Locale,
  entries: AuditLogRecord[],
): TimelineItem[] {
  return entries.map((entry) => ({
    id: entry.auditId,
    title: formatOpsCodeLabel(locale, entry.actionName),
    detail: [entry.moduleName, entry.resourceType, entry.resourceId]
      .filter(Boolean)
      .join(" · "),
    timestamp: formatDateTime(locale, entry.createdAt),
    tone:
      entry.actionName.includes("offboarding") ||
      entry.actionName.includes("reject")
        ? "warning"
        : entry.actionName.includes("create") ||
            entry.actionName.includes("activate")
          ? "success"
          : "accent",
    eyebrow: entry.actorId ?? entry.actorType,
    supportingContent: (
      <span style={{ ...monoStyle, fontSize: "11px", color: theme.textDim }}>
        {entry.requestId}
      </span>
    ),
  }));
}

function collectVehicleAuditEntries(
  vehicleId: string,
  audits: AuditLogRecord[],
  contracts: VehicleContractRecord[],
  maintenance: MaintenanceRecord[],
  vehicle: VehicleRegistryRecord,
): AuditLogRecord[] {
  const relatedIds = new Set<string>([
    vehicleId,
    vehicle.supplyLifecycle.contract.contractId ?? "",
    vehicle.supplyLifecycle.insurance.policyId ?? "",
    ...contracts.map((entry) => entry.contractId),
    ...maintenance.map((entry) => entry.maintenanceId),
  ]);

  return audits
    .filter((entry) => {
      if (entry.resourceId && relatedIds.has(entry.resourceId)) {
        return true;
      }
      const newVehicleId = entry.newValuesSummary?.vehicleId;
      const oldVehicleId = entry.oldValuesSummary?.vehicleId;
      return newVehicleId === vehicleId || oldVehicleId === vehicleId;
    })
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )
    .slice(0, 8);
}

function sectionErrorLabel(locale: Locale, key: string) {
  switch (key) {
    case "drivers":
      return copy(locale, "driver binding", "司機綁定");
    case "maintenance":
      return copy(locale, "maintenance", "保修");
    case "contracts":
      return copy(locale, "contracts", "合約");
    case "incidents":
      return copy(locale, "incidents", "事故");
    case "audit":
      return copy(locale, "audit", "稽核");
    default:
      return key;
  }
}

export default async function VehicleDetailPage({
  params,
}: VehicleDetailPageProps) {
  const [{ vehicleId }, locale, client, requestHeaders] = await Promise.all([
    params,
    getServerLocale(),
    getServerOpsClient(),
    headers(),
  ]);

  const platformAdminOrigin = resolvePlatformAdminOrigin(requestHeaders);
  const [
    vehiclesResult,
    driversResult,
    tasksResult,
    shiftsResult,
    maintenanceResult,
    contractsResult,
    incidentsResult,
    auditsResult,
  ] = await Promise.all([
    resolveWithFallback<VehicleRegistryRecord[]>(
      () => client.listVehicles(),
      [] as VehicleRegistryRecord[],
      locale,
    ),
    resolveWithFallback<DriverRegistryRecord[]>(
      () => client.listDrivers(),
      [] as DriverRegistryRecord[],
      locale,
    ),
    resolveWithFallback<DriverTaskRecord[]>(
      () => client.listDriverTasks(),
      [] as DriverTaskRecord[],
      locale,
    ),
    resolveWithFallback<ShiftRecord[]>(
      () => client.listShifts(),
      [] as ShiftRecord[],
      locale,
    ),
    resolveWithFallback<MaintenanceRecord[]>(
      () => client.listMaintenance(vehicleId),
      [] as MaintenanceRecord[],
      locale,
    ),
    resolveWithFallback<VehicleContractRecord[]>(
      () => client.listContracts(),
      [] as VehicleContractRecord[],
      locale,
    ),
    resolveWithFallback<IncidentRecord[]>(
      () => client.listIncidents(),
      [] as IncidentRecord[],
      locale,
    ),
    resolveWithFallback<AuditLogRecord[]>(
      () => client.listAuditLogs(),
      [] as AuditLogRecord[],
      locale,
    ),
  ]);

  const vehicle = vehiclesResult.data.find(
    (candidate) => candidate.vehicleId === vehicleId,
  );

  if (vehiclesResult.error) {
    const reason = classifyErrorReason(vehiclesResult.error);
    const refreshAction: VehicleAction = {
      descriptor: { action: "refresh", enabled: true, riskLevel: "low" },
      label: copy(locale, "Retry vehicle snapshot", "重試車輛快照"),
      icon: "arrow",
      href: `/vehicles/${encodeURIComponent(vehicleId)}`,
    };

    return (
      <>
        <PageHeader
          theme={theme}
          title={copy(locale, "Vehicle detail", "車輛詳情")}
          subtitle={`${vehicleId} · ${copy(
            locale,
            "registry fetch failed",
            "名冊載入失敗",
          )}`}
          actions={renderVehicleAction(refreshAction)}
        />
        <div style={pageBodyStyle}>
          {renderEmptyState(
            locale,
            reason,
            vehiclesResult.error,
            refreshAction,
          )}
        </div>
      </>
    );
  }

  if (!vehicle) {
    const backAction: VehicleAction = {
      descriptor: { action: "open_registry", enabled: true, riskLevel: "low" },
      label: copy(locale, "Back to registry", "回到車輛名冊"),
      href: "/vehicles",
    };

    return (
      <>
        <PageHeader
          theme={theme}
          title={copy(locale, "Vehicle not found", "找不到車輛")}
          subtitle={vehicleId}
          actions={renderVehicleAction(backAction)}
        />
        <div style={pageBodyStyle}>
          {renderEmptyState(
            locale,
            "no_data",
            copy(
              locale,
              "No vehicle record matches this id in the current ops registry snapshot.",
              "目前 ops 名冊快照中沒有符合此編號的車輛。",
            ),
            backAction,
          )}
        </div>
      </>
    );
  }

  const relatedMaintenance = [...maintenanceResult.data].sort((left, right) =>
    (right.scheduledAt ?? right.updatedAt).localeCompare(
      left.scheduledAt ?? left.updatedAt,
    ),
  );
  const relatedContracts = contractsResult.data
    .filter((entry) => entry.vehicleId === vehicleId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const relatedIncidents = incidentsResult.data
    .filter((entry) => entry.relatedVehicleId === vehicleId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const currentBinding = pickCurrentBinding(
    vehicleId,
    driversResult.data,
    tasksResult.data,
    shiftsResult.data,
  );
  const overdueMaintenanceCount = relatedMaintenance.filter((entry) =>
    isMaintenanceOverdue(entry),
  ).length;
  const degradedSections = [
    driversResult.error ? sectionErrorLabel(locale, "drivers") : null,
    maintenanceResult.error ? sectionErrorLabel(locale, "maintenance") : null,
    contractsResult.error ? sectionErrorLabel(locale, "contracts") : null,
    incidentsResult.error ? sectionErrorLabel(locale, "incidents") : null,
    auditsResult.error ? sectionErrorLabel(locale, "audit") : null,
  ].filter((entry): entry is string => Boolean(entry));
  const refreshMetadata = buildRefreshMetadata(degradedSections.length > 0);

  const platformAdminLink: CrossAppResourceLink = {
    targetApp: "platform-admin",
    route: `/fleet?vehicleId=${encodeURIComponent(vehicle.vehicleId)}&tab=offboarding`,
    resourceType: "vehicle",
    resourceId: vehicle.vehicleId,
    openMode: "new_tab",
    label: copy(
      locale,
      "Open offboarding in Platform Admin",
      "在 Platform Admin 開啟退場流程",
    ),
  };
  const platformAdminHref = platformAdminOrigin
    ? buildCrossAppHref(platformAdminOrigin, platformAdminLink)
    : undefined;

  const pageActions: VehicleAction[] = [
    {
      descriptor: { action: "refresh", enabled: true, riskLevel: "low" },
      label: copy(locale, "Refresh", "重新整理"),
      icon: "arrow",
      href: `/vehicles/${encodeURIComponent(vehicle.vehicleId)}`,
      variant: "secondary",
    },
    {
      descriptor: {
        action: "open_maintenance",
        enabled: true,
        riskLevel: "low",
      },
      label: copy(locale, "Open maintenance", "查看保修"),
      icon: "ext",
      href: `/maintenance?vehicleId=${encodeURIComponent(vehicle.vehicleId)}`,
      variant: "secondary",
    },
    {
      descriptor: {
        action: "open_driver",
        enabled: Boolean(currentBinding?.driver?.driverId),
        disabledReasonCode: currentBinding
          ? "driver_record_missing"
          : "driver_binding_missing",
        riskLevel: "low",
      },
      label: copy(locale, "Open current driver", "開啟目前司機"),
      icon: "users",
      ...(currentBinding?.driver?.driverId
        ? {
            href: `/drivers/${encodeURIComponent(currentBinding.driver.driverId)}`,
          }
        : {}),
      variant: "secondary",
    },
    {
      descriptor: {
        action: "open_platform_admin_offboarding",
        enabled:
          Boolean(platformAdminHref) &&
          (vehicle.supplyLifecycle.offboarding.status !== "none" ||
            vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending"),
        disabledReasonCode:
          platformAdminOrigin === null
            ? "platform_admin_origin_unresolved"
            : "offboarding_inactive",
        riskLevel: "medium",
      },
      label: copy(locale, "Platform Admin /fleet", "Platform Admin /fleet"),
      icon: "ext",
      ...(platformAdminHref ? { href: platformAdminHref } : {}),
      openInNewTab: true,
      variant: "primary",
    },
    {
      descriptor: {
        action: "add_ops_note",
        enabled: false,
        disabledReasonCode: "ops_note_endpoint_pending",
        riskLevel: "medium",
      },
      label: copy(locale, "Add ops note", "新增營運備註"),
      icon: "plus",
      variant: "secondary",
    },
  ];
  const refreshPageAction = pageActions[0]!;
  const maintenancePageAction = pageActions[1]!;
  const offboardingPageAction = pageActions[3]!;

  const maintenanceRows: MaintenanceRow[] = relatedMaintenance
    .slice(0, 5)
    .map((record) => ({
      id: (
        <Link
          href={`/maintenance?vehicleId=${encodeURIComponent(record.vehicleId)}`}
          prefetch={false}
          style={{ color: theme.text, textDecoration: "none", ...monoStyle }}
        >
          {record.maintenanceId}
        </Link>
      ),
      kind: formatOpsCodeLabel(locale, record.type),
      status: formatOpsCodeLabel(
        locale,
        isMaintenanceOverdue(record) ? "overdue" : record.status,
      ),
      scheduled: formatDateTime(locale, record.scheduledAt ?? record.updatedAt),
      overdue: isMaintenanceOverdue(record),
    }));

  const maintenanceColumns: CanvasTableColumn<MaintenanceRow>[] = [
    { h: "WO", k: "id", w: 120, mono: true },
    {
      h: copy(locale, "Type", "類別"),
      k: "kind",
      w: 200,
    },
    {
      h: "STATUS",
      w: 140,
      r: (row) => (
        <Pill
          theme={theme}
          tone={getPillTone(
            row.overdue
              ? "danger"
              : row.status === formatOpsCodeLabel(locale, "completed")
                ? "success"
                : "warn",
          )}
          dot
        >
          {row.status}
        </Pill>
      ),
    },
    {
      h: copy(locale, "Scheduled", "排定"),
      k: "scheduled",
      mono: true,
    },
  ];

  const contractRows: ContractRow[] = relatedContracts.map((record) => ({
    id: (
      <Link
        href={`/contracts/${encodeURIComponent(record.contractId)}`}
        prefetch={false}
        style={{ color: theme.text, textDecoration: "none", ...monoStyle }}
      >
        {record.contractId}
      </Link>
    ),
    partner: formatPartnerLabel(record),
    type: formatOpsCodeLabel(locale, record.contractType),
    term: `${formatDateOnly(locale, record.startAt)} → ${formatDateOnly(
      locale,
      record.endAt,
    )}`,
    status: formatOpsCodeLabel(locale, record.lifecycleStatus),
    expiringSoon: isContractExpiringSoon(record),
  }));

  const contractColumns: CanvasTableColumn<ContractRow>[] = [
    { h: "CONTRACT", k: "id", w: 130, mono: true },
    { h: copy(locale, "Counterparty", "對象"), k: "partner", w: 220 },
    { h: copy(locale, "Type", "類型"), k: "type", w: 180 },
    { h: copy(locale, "Term", "期間"), k: "term", mono: true, w: 200 },
    {
      h: "STATUS",
      w: 130,
      r: (row) => (
        <Pill theme={theme} tone={row.expiringSoon ? "warn" : "success"} dot>
          {row.status}
        </Pill>
      ),
    },
  ];

  const incidentRows: IncidentRow[] = relatedIncidents
    .slice(0, 5)
    .map((record) => ({
      id: (
        <Link
          href={`/incidents/${encodeURIComponent(record.incidentId)}`}
          prefetch={false}
          style={{ color: theme.text, textDecoration: "none", ...monoStyle }}
        >
          {record.incidentId}
        </Link>
      ),
      title: record.title,
      severity: formatOpsCodeLabel(locale, record.severity),
      status: formatOpsCodeLabel(locale, record.status),
      updated: formatDateTime(locale, record.updatedAt),
    }));

  const incidentColumns: CanvasTableColumn<IncidentRow>[] = [
    { h: "INCIDENT", k: "id", w: 120, mono: true },
    { h: copy(locale, "Title", "標題"), k: "title", w: 240 },
    {
      h: copy(locale, "Severity", "嚴重度"),
      w: 120,
      r: (row) => (
        <Pill
          theme={theme}
          tone={
            row.severity === formatOpsCodeLabel(locale, "critical") ||
            row.severity === formatOpsCodeLabel(locale, "high")
              ? "danger"
              : "warn"
          }
          dot
        >
          {row.severity}
        </Pill>
      ),
    },
    {
      h: copy(locale, "Status", "狀態"),
      w: 120,
      r: (row) => (
        <Pill
          theme={theme}
          tone={
            row.status === formatOpsCodeLabel(locale, "closed")
              ? "success"
              : "info"
          }
          dot
        >
          {row.status}
        </Pill>
      ),
    },
    { h: copy(locale, "Updated", "更新"), k: "updated", mono: true, w: 180 },
  ];

  const auditEntries = collectVehicleAuditEntries(
    vehicle.vehicleId,
    auditsResult.data,
    relatedContracts,
    relatedMaintenance,
    vehicle,
  );
  const auditTimeline = buildAuditTimelineItems(locale, auditEntries);

  const regulatoryItems = [
    {
      k: copy(locale, "Vehicle ID", "車輛編號"),
      v: vehicle.vehicleId,
      mono: true,
    },
    {
      k: copy(locale, "Plate", "車牌"),
      v: vehicle.plateNo,
      mono: true,
    },
    {
      k: copy(locale, "Type", "類型"),
      v: getVehicleTypeLabel(locale, vehicle),
    },
    {
      k: copy(locale, "Operating area", "營運區域"),
      v: vehicle.operatingArea,
      mono: true,
    },
    {
      k: copy(locale, "Dispatchable", "可派遣"),
      v: vehicle.dispatchableFlag
        ? copy(locale, "yes", "是")
        : copy(locale, "no", "否"),
      mono: true,
    },
    {
      k: copy(locale, "Primary status", "主狀態"),
      v: formatOpsCodeLabel(locale, getPrimaryVehicleStatusCode(vehicle)),
      mono: true,
    },
    {
      k: copy(locale, "Dispatch blockers", "派遣阻塞"),
      v: summarizeBlockedReasons(locale, vehicle),
    },
    {
      k: copy(locale, "Insurance expiry", "保險到期"),
      v: formatDateOnly(locale, vehicle.supplyLifecycle.insurance.endAt),
      mono: true,
    },
    {
      k: copy(locale, "Vehicle license", "車輛牌照"),
      v: copy(
        locale,
        "No dedicated field in current read model",
        "目前 read model 沒有獨立欄位",
      ),
    },
    {
      k: copy(locale, "Contract", "合約"),
      v: vehicle.supplyLifecycle.contract.contractId ?? "—",
      mono: true,
    },
    {
      k: copy(locale, "Exclusivity", "排他委託"),
      v: formatOpsCodeLabel(
        locale,
        vehicle.supplyLifecycle.exclusivity.lifecycleStatus,
      ),
      mono: true,
    },
    {
      k: copy(locale, "Offboarding state", "退場狀態"),
      v: formatOpsCodeLabel(locale, vehicle.supplyLifecycle.offboarding.status),
      mono: true,
    },
    {
      k: copy(locale, "Debrand due", "除標識期限"),
      v: formatDateOnly(
        locale,
        vehicle.supplyLifecycle.offboarding.debrandingDueAt,
      ),
      mono: true,
    },
    {
      k: copy(locale, "Last lifecycle trace", "最近 lifecycle 追蹤"),
      v: vehicle.supplyLifecycle.lastTrace?.message ?? "—",
    },
  ];

  const driverBindingAction: VehicleAction = currentBinding?.driver?.driverId
    ? {
        descriptor: {
          action: "open_driver",
          enabled: true,
          riskLevel: "low",
        },
        label: copy(locale, "Open driver detail", "開啟司機詳情"),
        href: `/drivers/${encodeURIComponent(currentBinding.driver.driverId)}`,
        icon: "users",
      }
    : {
        descriptor: {
          action: "open_platform_admin_offboarding",
          enabled:
            Boolean(platformAdminHref) &&
            (vehicle.supplyLifecycle.offboarding.status !== "none" ||
              !vehicle.dispatchableFlag),
          disabledReasonCode:
            platformAdminOrigin === null
              ? "platform_admin_origin_unresolved"
              : "offboarding_inactive",
          riskLevel: "medium",
        },
        label: copy(
          locale,
          "Open Platform Admin /fleet",
          "開啟 Platform Admin /fleet",
        ),
        icon: "ext",
        ...(platformAdminHref ? { href: platformAdminHref } : {}),
        openInNewTab: true,
        variant: "primary",
      };

  return (
    <>
      <PageHeader
        theme={theme}
        title={
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
            }}
          >
            <span>{vehicle.plateNo}</span>
            <Pill theme={theme} tone={getVehicleStatusTone(vehicle)} dot>
              {formatOpsCodeLabel(locale, getPrimaryVehicleStatusCode(vehicle))}
            </Pill>
            <Pill
              theme={theme}
              tone={vehicle.dispatchableFlag ? "success" : "danger"}
            >
              {vehicle.dispatchableFlag
                ? copy(locale, "dispatchable", "可派遣")
                : copy(locale, "not_dispatchable", "不可派遣")}
            </Pill>
            {overdueMaintenanceCount > 0 ? (
              <Pill theme={theme} tone="danger">
                {copy(
                  locale,
                  `${overdueMaintenanceCount} overdue maintenance`,
                  `${overdueMaintenanceCount} 筆逾期保修`,
                )}
              </Pill>
            ) : null}
          </span>
        }
        subtitle={`${vehicle.vehicleId} · ${getVehicleTypeLabel(
          locale,
          vehicle,
        )} · ${vehicle.operatingArea}`}
        actions={
          <div style={actionRowStyle}>
            {pageActions.map((action) => renderVehicleAction(action))}
          </div>
        }
      />

      <div style={pageBodyStyle}>
        <Banner
          theme={theme}
          tone={degradedSections.length > 0 ? "warn" : "info"}
          icon={degradedSections.length > 0 ? "warn" : "info"}
          title={copy(
            locale,
            `Refresh tier T3 · ${REFRESH_TIER}`,
            `刷新層級 T3 · ${REFRESH_TIER}`,
          )}
          body={buildRefreshBannerBody(
            locale,
            refreshMetadata,
            degradedSections,
          )}
          actions={renderVehicleAction(refreshPageAction)}
        />

        {vehicle.supplyLifecycle.offboarding.status !== "none" ? (
          <Banner
            theme={theme}
            tone="warn"
            icon="warn"
            title={copy(
              locale,
              "This vehicle is inside the offboarding state machine",
              "此車輛已進入 offboarding state machine",
            )}
            body={[
              formatOpsCodeLabel(
                locale,
                vehicle.supplyLifecycle.offboarding.status,
              ),
              vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending"
                ? copy(locale, "debranding pending", "除標識待完成")
                : null,
              vehicle.supplyLifecycle.offboarding.debrandingDueAt
                ? copy(
                    locale,
                    `debrand due ${formatDateOnly(locale, vehicle.supplyLifecycle.offboarding.debrandingDueAt)}`,
                    `除標識期限 ${formatDateOnly(locale, vehicle.supplyLifecycle.offboarding.debrandingDueAt)}`,
                  )
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={renderVehicleAction(offboardingPageAction)}
          />
        ) : overdueMaintenanceCount > 0 ? (
          <Banner
            theme={theme}
            tone="danger"
            icon="warn"
            title={copy(
              locale,
              "Overdue maintenance is impacting dispatchability",
              "逾期保修已影響派遣判斷",
            )}
            body={copy(
              locale,
              `${overdueMaintenanceCount} work order(s) remain overdue for this vehicle.`,
              `此車目前有 ${overdueMaintenanceCount} 筆逾期工單未結案。`,
            )}
          />
        ) : null}

        <div style={detailGridStyle}>
          <div style={columnStyle}>
            <Card
              theme={theme}
              title={copy(locale, "Regulatory profile", "監管檔案")}
            >
              <DL theme={theme} cols={2} items={regulatoryItems} />
            </Card>

            <Card
              theme={theme}
              title={copy(
                locale,
                "Maintenance records · latest 5",
                "保修紀錄 · 最近 5 筆",
              )}
              padding={0}
            >
              {maintenanceResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(maintenanceResult.error),
                  maintenanceResult.error,
                  maintenancePageAction,
                )
              ) : maintenanceRows.length > 0 ? (
                <Table
                  theme={theme}
                  columns={maintenanceColumns}
                  rows={maintenanceRows}
                />
              ) : (
                renderEmptyState(
                  locale,
                  "no_data",
                  copy(
                    locale,
                    "No maintenance records are currently attached to this vehicle.",
                    "目前這輛車沒有任何保修紀錄。",
                  ),
                  maintenancePageAction,
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={copy(locale, "Contract references", "合約參照")}
              padding={0}
            >
              {contractsResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(contractsResult.error),
                  contractsResult.error,
                )
              ) : contractRows.length > 0 ? (
                <Table
                  theme={theme}
                  columns={contractColumns}
                  rows={contractRows}
                />
              ) : (
                renderEmptyState(
                  locale,
                  "not_provisioned",
                  copy(
                    locale,
                    "No active or historical contract references were found for this vehicle.",
                    "這輛車目前找不到任何有效或歷史合約參照。",
                  ),
                )
              )}
            </Card>
          </div>

          <div style={columnStyle}>
            <Card
              theme={theme}
              title={copy(locale, "Current driver binding", "目前司機綁定")}
            >
              {driversResult.error ||
              tasksResult.error ||
              shiftsResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(
                    driversResult.error ??
                      tasksResult.error ??
                      shiftsResult.error ??
                      "",
                  ),
                  driversResult.error ??
                    tasksResult.error ??
                    shiftsResult.error ??
                    undefined,
                  driverBindingAction,
                )
              ) : currentBinding ? (
                <DL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      k: copy(locale, "Driver", "司機"),
                      v: currentBinding.driver?.driverId ? (
                        <Link
                          href={`/drivers/${encodeURIComponent(currentBinding.driver.driverId)}`}
                          prefetch={false}
                          style={{ color: theme.text, textDecoration: "none" }}
                        >
                          {currentBinding.driver.name} ·{" "}
                          <span style={monoStyle}>
                            {currentBinding.driver.driverId}
                          </span>
                        </Link>
                      ) : (
                        "—"
                      ),
                    },
                    {
                      k: copy(locale, "Source", "來源"),
                      v:
                        currentBinding.source === "task"
                          ? copy(
                              locale,
                              "active driver task",
                              "進行中 driver task",
                            )
                          : copy(locale, "active shift", "進行中班次"),
                    },
                    {
                      k: copy(locale, "Binding state", "綁定狀態"),
                      v: formatOpsCodeLabel(locale, currentBinding.statusCode),
                      mono: true,
                    },
                    {
                      k: copy(locale, "Binding id", "綁定編號"),
                      v: currentBinding.bindingId,
                      mono: true,
                    },
                    {
                      k: copy(locale, "Bound at", "綁定時間"),
                      v: formatDateTime(locale, currentBinding.boundAt),
                      mono: true,
                    },
                  ]}
                />
              ) : (
                renderEmptyState(
                  locale,
                  vehicle.supplyLifecycle.offboarding.status !== "none" ||
                    !vehicle.dispatchableFlag
                    ? "not_provisioned"
                    : "no_data",
                  vehicle.supplyLifecycle.offboarding.status !== "none"
                    ? copy(
                        locale,
                        "This vehicle is dispatch-disabled while offboarding, so no active driver binding is expected.",
                        "此車正在退場且已停派，因此目前不預期會有 active driver binding。",
                      )
                    : copy(
                        locale,
                        "No active task or shift currently binds a driver to this vehicle.",
                        "目前沒有 active task 或 shift 將司機綁定到此車。",
                      ),
                  driverBindingAction,
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={copy(
                locale,
                `Linked incidents · ${relatedIncidents.length} (90d)`,
                `關聯事故 · ${relatedIncidents.length} 筆（90 天）`,
              )}
              padding={0}
            >
              {incidentsResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(incidentsResult.error),
                  incidentsResult.error,
                )
              ) : incidentRows.length > 0 ? (
                <Table
                  theme={theme}
                  columns={incidentColumns}
                  rows={incidentRows}
                />
              ) : (
                renderEmptyState(
                  locale,
                  "no_data",
                  copy(
                    locale,
                    "No incidents in the current incident snapshot reference this vehicle.",
                    "目前事故快照中沒有任何事件關聯到這輛車。",
                  ),
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={copy(
                locale,
                "Audit subset · vehicle scope",
                "稽核子集 · 車輛範圍",
              )}
              padding={0}
            >
              {auditsResult.error ? (
                renderEmptyState(
                  locale,
                  classifyErrorReason(auditsResult.error),
                  auditsResult.error,
                )
              ) : auditTimeline.length > 0 ? (
                <Timeline
                  items={auditTimeline}
                  emptyState={copy(
                    locale,
                    "No audit events recorded for this vehicle yet.",
                    "目前這輛車還沒有任何稽核事件。",
                  )}
                />
              ) : (
                renderEmptyState(
                  locale,
                  "no_data",
                  copy(
                    locale,
                    "No audit entries for this vehicle or its linked maintenance / contract resources were found.",
                    "目前找不到這輛車或其關聯 maintenance / contract resource 的稽核紀錄。",
                  ),
                )
              )}
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
