import Link from "next/link";
import type {
  CrossAppResourceLink,
  DriverRegistryRecord,
  EmptyReason,
  EmptyStateEnvelope,
  MaintenanceRecord,
  RefreshTier,
  ResourceActionDescriptor,
  ShiftRecord,
  UiRefreshMetadata,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { OpsAutoRefresh } from "@/components/ops-auto-refresh";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import type { Locale } from "@/lib/translations";
import {
  CanvasBanner as Banner,
  CanvasBtn as Btn,
  CanvasCard as Card,
  CanvasField as Field,
  CanvasIcon,
  CanvasKPI as KPI,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type VehiclesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type VehicleStatusFilter =
  | "all"
  | "dispatchable"
  | "offline"
  | "offboarding"
  | "attention";

type VehiclePageEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;
type VehicleEmptyStateEnvelope = EmptyStateEnvelope & {
  reason: VehiclePageEmptyReason;
};

type VehicleFilters = {
  q: string;
  status: VehicleStatusFilter;
  type: string;
  dispatchable: "all" | "yes" | "no";
  overdue: "all" | "yes" | "no";
  emptyReason: VehiclePageEmptyReason | undefined;
};

type VehicleListRow = Record<string, unknown> & {
  vehicleId: string;
  plateNo: string;
  serviceType: string;
  serviceTypeLabel: string;
  status: VehicleStatusFilter;
  statusLabel: string;
  statusTone: CanvasTone;
  dispatchableLabel: string;
  dispatchableTone: CanvasTone;
  currentDriverLabel: string;
  currentDriverDetail: string;
  currentDriverHref?: string;
  contractLabel: string;
  contractDetail: string;
  insuranceLabel: string;
  insuranceTone: CanvasTone;
  debrandDueLabel: string;
  debrandTone: CanvasTone;
  debrandDetail: string;
  overdueMaintenance: boolean;
  overdueLabel: string;
  overdueTone: CanvasTone;
  lastSeenLabel: string;
  lastSeenDetail: string;
  healthSummary: string;
  healthDetail: string;
  actionDescriptors: ResourceActionDescriptor[];
  crossLinks: CrossAppResourceLink[];
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const REFRESH_TIER: RefreshTier = "medium";
const REFRESH_INTERVAL_MS = 15_000;
const PLATFORM_ADMIN_BASE_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
  "https://platform-admin.drts.io";

const pageBodyStyle = {
  padding: 24,
  display: "flex",
  flexDirection: "column" as const,
  gap: 16,
};

const kpiGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const topGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
  gap: 16,
  alignItems: "start",
};

const infoListStyle = {
  display: "grid",
  gap: 8,
};

const infoRowStyle = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 10px",
  borderRadius: 8,
  background: theme.surfaceLo,
};

const filterGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1.2fr) repeat(4, minmax(140px, 0.7fr))",
  gap: 12,
  alignItems: "end",
};

const inputStyle = {
  width: "100%",
  height: 34,
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.surfaceLo,
  color: theme.text,
  padding: "0 10px",
  fontFamily: theme.fontFamily,
  fontSize: 12.5,
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseEmptyReason(
  value: string | undefined,
): VehiclePageEmptyReason | undefined {
  if (
    value === "no_data" ||
    value === "not_provisioned" ||
    value === "fetch_failed" ||
    value === "permission_denied" ||
    value === "external_unavailable" ||
    value === "filtered_empty"
  ) {
    return value;
  }
  return undefined;
}

function resolveFilters(
  searchParams?: Record<string, string | string[] | undefined>,
): VehicleFilters {
  const status = firstParam(searchParams?.status);
  const dispatchable = firstParam(searchParams?.dispatchable);
  const overdue = firstParam(searchParams?.overdue);

  return {
    q: firstParam(searchParams?.q)?.trim() ?? "",
    status:
      status === "dispatchable" ||
      status === "offline" ||
      status === "offboarding" ||
      status === "attention"
        ? status
        : "all",
    type: firstParam(searchParams?.type) ?? "all",
    dispatchable:
      dispatchable === "yes" || dispatchable === "no" ? dispatchable : "all",
    overdue: overdue === "yes" || overdue === "no" ? overdue : "all",
    emptyReason: parseEmptyReason(firstParam(searchParams?.emptyReason)),
  };
}

async function loadOrCapture<T>(
  loader: () => Promise<T>,
): Promise<{ data: T | null; error: string | null }> {
  try {
    return { data: await loader(), error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

function formatDateTime(value: string | null | undefined, locale: Locale) {
  if (!value) return copy(locale, "No signal", "尚無訊號");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDateOnly(value: string | null | undefined, locale: Locale) {
  if (!value) return copy(locale, "n/a", "未設定");
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  });
}

function inferEmptyReasonFromError(message: string): VehiclePageEmptyReason {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("403") ||
    normalized.includes("forbidden") ||
    normalized.includes("permission")
  ) {
    return "permission_denied";
  }
  if (
    normalized.includes("provision") ||
    normalized.includes("not configured") ||
    normalized.includes("not enabled")
  ) {
    return "not_provisioned";
  }
  if (
    normalized.includes("upstream") ||
    normalized.includes("external") ||
    normalized.includes("dependency")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

function getVehicleStatusDisplay(
  locale: Locale,
  vehicle: VehicleRegistryRecord,
  overdue: boolean,
) {
  if (vehicle.supplyLifecycle.offboarding.status !== "none") {
    return {
      status: "offboarding" as const,
      label: copy(locale, "offboarding", "退場中"),
      tone: "warn" as const,
    };
  }
  if (!vehicle.dispatchableFlag) {
    return {
      status: "offline" as const,
      label: copy(locale, "offline", "離線"),
      tone: "danger" as const,
    };
  }
  if (overdue || vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0) {
    return {
      status: "attention" as const,
      label: copy(locale, "attention", "需留意"),
      tone: "warn" as const,
    };
  }
  return {
    status: "dispatchable" as const,
    label: copy(locale, "dispatchable", "可派"),
    tone: "success" as const,
  };
}

function getDisabledReasonLabel(
  locale: Locale,
  disabledReasonCode: string | undefined,
) {
  if (disabledReasonCode === "no_current_driver") {
    return copy(locale, "No active driver binding", "目前沒有綁定司機");
  }
  if (disabledReasonCode === "ops_read_only") {
    return copy(locale, "Read-only in Ops Console", "Ops Console 目前為唯讀");
  }
  if (disabledReasonCode === "external_unavailable") {
    return copy(
      locale,
      "External dependency unavailable",
      "外部依賴暫時不可用",
    );
  }
  return disabledReasonCode
    ? formatOpsCodeLabel(locale, disabledReasonCode)
    : copy(locale, "Unavailable", "暫不可用");
}

function buildCrossAppHref(link: CrossAppResourceLink) {
  if (link.targetApp === "platform-admin") {
    return `${PLATFORM_ADMIN_BASE_URL}${link.route}`;
  }
  return link.route;
}

function buildVehicleHref(
  filters: VehicleFilters,
  overrides: Partial<VehicleFilters>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status !== "all") params.set("status", next.status);
  if (next.type !== "all") params.set("type", next.type);
  if (next.dispatchable !== "all")
    params.set("dispatchable", next.dispatchable);
  if (next.overdue !== "all") params.set("overdue", next.overdue);
  if (next.emptyReason) params.set("emptyReason", next.emptyReason);
  const query = params.toString();
  return query ? `/vehicles?${query}` : "/vehicles";
}

function withDisabledReason(
  descriptor: ResourceActionDescriptor,
  disabledReasonCode: string | undefined,
): ResourceActionDescriptor {
  return disabledReasonCode
    ? { ...descriptor, disabledReasonCode }
    : descriptor;
}

function buildPageActionDescriptors(
  filteredCount: number,
  filters: VehicleFilters,
): [
  ResourceActionDescriptor,
  ResourceActionDescriptor,
  ResourceActionDescriptor,
] {
  const canClearFilters =
    filteredCount === 0 ||
    filters.q.length > 0 ||
    filters.status !== "all" ||
    filters.type !== "all" ||
    filters.dispatchable !== "all" ||
    filters.overdue !== "all" ||
    filters.emptyReason !== undefined;

  return [
    {
      action: "search",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "refresh",
      enabled: true,
      riskLevel: "low",
    },
    withDisabledReason(
      {
        action: "clear_filters",
        enabled: canClearFilters,
        riskLevel: "low",
      },
      canClearFilters
        ? undefined
        : filteredCount > 0 &&
            filters.q.length === 0 &&
            filters.status === "all" &&
            filters.type === "all" &&
            filters.dispatchable === "all" &&
            filters.overdue === "all" &&
            !filters.emptyReason
          ? "ops_read_only"
          : undefined,
    ),
  ];
}

function buildVehicleRow(
  locale: Locale,
  vehicle: VehicleRegistryRecord,
  driverById: Map<string, DriverRegistryRecord>,
  activeShiftByVehicleId: Map<string, ShiftRecord>,
  maintenanceByVehicleId: Map<string, MaintenanceRecord[]>,
): VehicleListRow {
  const maintenance = maintenanceByVehicleId.get(vehicle.vehicleId) ?? [];
  const activeShift = activeShiftByVehicleId.get(vehicle.vehicleId);
  const currentDriver = activeShift
    ? driverById.get(activeShift.driverId)
    : undefined;
  const overdueMaintenance = maintenance.some(
    (record) => record.status === "overdue",
  );
  const status = getVehicleStatusDisplay(locale, vehicle, overdueMaintenance);
  const primaryServiceType =
    vehicle.supportedServiceBuckets[0] ?? "standard_taxi";
  const blockedReasons = vehicle.supplyLifecycle.dispatch.blockedReasons;
  const contractId = vehicle.supplyLifecycle.contract.contractId;
  const debrandDueAt = vehicle.supplyLifecycle.offboarding.debrandingDueAt;
  const currentDriverLabel =
    currentDriver?.name ?? copy(locale, "Unassigned", "未綁定");
  const currentDriverDetail = activeShift
    ? `${activeShift.driverId} · ${copy(locale, "active shift", "當班中")}`
    : copy(locale, "No active shift on this vehicle", "目前沒有當班班次");
  const healthSummary = [
    formatOpsCodeLabel(
      locale,
      vehicle.supplyLifecycle.contract.lifecycleStatus,
    ),
    formatOpsCodeLabel(
      locale,
      vehicle.supplyLifecycle.insurance.lifecycleStatus,
    ),
    formatOpsCodeLabel(locale, vehicle.supplyLifecycle.offboarding.status),
  ].join(" / ");
  const healthDetail =
    blockedReasons.length > 0
      ? blockedReasons
          .map((reason) => formatOpsCodeLabel(locale, reason))
          .join(" · ")
      : copy(locale, "Dispatch gates clear", "派遣閘門正常");
  const crossLinks: CrossAppResourceLink[] = [
    {
      targetApp: "platform-admin",
      route: `/fleet?vehicleId=${encodeURIComponent(vehicle.vehicleId)}`,
      resourceType: "vehicle",
      resourceId: vehicle.vehicleId,
      openMode: "new_tab",
      label: copy(locale, "Platform Admin fleet", "Platform Admin 車隊"),
    },
  ];

  // Backend `availableActions[]` has not been added to vehicle records yet,
  // so this page emits descriptors in the shared ui-runtime shape.
  const actionDescriptors: ResourceActionDescriptor[] = [
    {
      action: "open_vehicle_detail",
      enabled: true,
      riskLevel: "low",
    },
    withDisabledReason(
      {
        action: "open_driver_binding",
        enabled: Boolean(activeShift?.driverId),
        riskLevel: "low",
      },
      activeShift?.driverId ? undefined : "no_current_driver",
    ),
    {
      action: "open_maintenance",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "open_platform_admin_fleet",
      enabled: true,
      riskLevel: "medium",
    },
  ];

  return {
    vehicleId: vehicle.vehicleId,
    plateNo: vehicle.plateNo,
    serviceType: primaryServiceType,
    serviceTypeLabel: formatOpsCodeLabel(locale, primaryServiceType),
    status: status.status,
    statusLabel: status.label,
    statusTone: status.tone,
    dispatchableLabel: vehicle.dispatchableFlag
      ? copy(locale, "yes", "可派")
      : copy(locale, "no", "停派"),
    dispatchableTone: vehicle.dispatchableFlag ? "success" : "danger",
    currentDriverLabel,
    currentDriverDetail,
    ...(activeShift?.driverId
      ? {
          currentDriverHref: `/drivers/${encodeURIComponent(activeShift.driverId)}`,
        }
      : {}),
    contractLabel: contractId ?? copy(locale, "No contract", "無合約"),
    contractDetail: `${formatOpsCodeLabel(
      locale,
      vehicle.supplyLifecycle.contract.lifecycleStatus,
    )} · ${formatOpsCodeLabel(locale, vehicle.operatingArea)}`,
    insuranceLabel:
      vehicle.insuranceStatus === "valid"
        ? copy(locale, "valid", "有效")
        : copy(locale, "expired", "已過期"),
    insuranceTone: vehicle.insuranceStatus === "valid" ? "success" : "danger",
    debrandDueLabel: formatDateOnly(debrandDueAt, locale),
    debrandTone:
      vehicle.supplyLifecycle.offboarding.status !== "none" ||
      vehicle.supplyLifecycle.offboarding.debrandingStatus === "pending"
        ? "warn"
        : "neutral",
    debrandDetail:
      vehicle.supplyLifecycle.offboarding.status !== "none"
        ? `${formatOpsCodeLabel(
            locale,
            vehicle.supplyLifecycle.offboarding.status,
          )} · ${formatOpsCodeLabel(
            locale,
            vehicle.supplyLifecycle.offboarding.debrandingStatus,
          )}`
        : copy(locale, "No offboarding workflow", "目前沒有退場流程"),
    overdueMaintenance,
    overdueLabel: overdueMaintenance
      ? copy(locale, "overdue", "逾期")
      : copy(locale, "clear", "正常"),
    overdueTone: overdueMaintenance ? "danger" : "success",
    lastSeenLabel: formatDateTime(vehicle.updatedAt, locale),
    lastSeenDetail: vehicle.supplyLifecycle.lastTrace?.message
      ? vehicle.supplyLifecycle.lastTrace.message
      : copy(locale, "No lifecycle trace", "尚無 lifecycle trace"),
    healthSummary,
    healthDetail,
    actionDescriptors,
    crossLinks,
  };
}

function filterRows(rows: VehicleListRow[], filters: VehicleFilters) {
  const query = filters.q.toLowerCase();

  return rows.filter((row) => {
    const matchesQuery =
      !query ||
      row.vehicleId.toLowerCase().includes(query) ||
      row.plateNo.toLowerCase().includes(query) ||
      row.currentDriverLabel.toLowerCase().includes(query) ||
      row.currentDriverDetail.toLowerCase().includes(query);
    const matchesStatus =
      filters.status === "all" || row.status === filters.status;
    const matchesType =
      filters.type === "all" || row.serviceType === filters.type;
    const matchesDispatchable =
      filters.dispatchable === "all" ||
      (filters.dispatchable === "yes" && row.dispatchableTone === "success") ||
      (filters.dispatchable === "no" && row.dispatchableTone !== "success");
    const matchesOverdue =
      filters.overdue === "all" ||
      (filters.overdue === "yes" && row.overdueMaintenance) ||
      (filters.overdue === "no" && !row.overdueMaintenance);

    return (
      matchesQuery &&
      matchesStatus &&
      matchesType &&
      matchesDispatchable &&
      matchesOverdue
    );
  });
}

function getEmptyStateEnvelope(
  locale: Locale,
  reason: VehiclePageEmptyReason,
): VehicleEmptyStateEnvelope {
  const baseMessageCode = `vehicles.empty.${reason}`;
  if (reason === "not_provisioned") {
    return {
      reason,
      messageCode: baseMessageCode,
      nextAction: {
        action: "open_platform_admin_fleet",
        enabled: true,
        riskLevel: "low",
      },
    };
  }
  if (reason === "permission_denied") {
    return {
      reason,
      messageCode: baseMessageCode,
      nextAction: {
        action: "open_access_request",
        enabled: true,
        riskLevel: "low",
      },
    };
  }
  if (reason === "external_unavailable") {
    return {
      reason,
      messageCode: baseMessageCode,
      nextAction: {
        action: "open_platform_admin_status",
        enabled: true,
        riskLevel: "low",
      },
    };
  }
  return { reason, messageCode: baseMessageCode };
}

function renderActionLink(
  locale: Locale,
  descriptor: ResourceActionDescriptor,
  href: string,
  label: string,
  target?: "_blank",
) {
  const button = (
    <Btn
      theme={theme}
      size="xs"
      variant={descriptor.riskLevel === "medium" ? "secondary" : "ghost"}
    >
      {label}
    </Btn>
  );

  if (!descriptor.enabled) {
    return (
      <span
        title={getDisabledReasonLabel(locale, descriptor.disabledReasonCode)}
      >
        <Btn theme={theme} size="xs" variant="ghost" disabled>
          {label}
        </Btn>
      </span>
    );
  }

  return (
    <Link href={href} target={target} style={{ textDecoration: "none" }}>
      {button}
    </Link>
  );
}

function renderEmptyStateCard(
  locale: Locale,
  emptyState: VehicleEmptyStateEnvelope,
  filters: VehicleFilters,
) {
  const emptyStateConfig: Record<
    VehiclePageEmptyReason,
    {
      tone: "info" | "warn" | "danger";
      title: string;
      body: string;
      icon: "fleet" | "warn" | "health" | "audit" | "ext" | "filter";
    }
  > = {
    no_data: {
      tone: "info" as const,
      title: copy(locale, "Vehicle registry is empty", "車輛主資料目前為空"),
      body: copy(
        locale,
        "No vehicles are provisioned into the ops registry yet. Once fleet records land, dispatchability and maintenance linkage appear here.",
        "目前還沒有任何車輛進入 ops registry。車隊主資料建立後，這裡才會顯示派遣與保修連動。",
      ),
      icon: "fleet" as const,
    },
    not_provisioned: {
      tone: "warn" as const,
      title: copy(
        locale,
        "Fleet registry not provisioned",
        "車隊 registry 尚未佈建",
      ),
      body: copy(
        locale,
        "The environment is missing fleet provisioning. Use the cross-app fleet setup in Platform Admin before returning to Ops Console.",
        "目前環境尚未完成 fleet provisioning。請先到 Platform Admin 建立車隊設定，再回到 Ops Console。",
      ),
      icon: "warn" as const,
    },
    fetch_failed: {
      tone: "danger" as const,
      title: copy(
        locale,
        "Vehicle snapshot failed to load",
        "車輛清單載入失敗",
      ),
      body: copy(
        locale,
        "The registry request failed before a valid snapshot was assembled. Retry the page refresh or inspect API health.",
        "在組成有效快照前，registry 請求已失敗。請重新整理頁面，或檢查 API 健康狀態。",
      ),
      icon: "health" as const,
    },
    permission_denied: {
      tone: "danger" as const,
      title: copy(
        locale,
        "Access denied for vehicle registry",
        "沒有車輛 registry 權限",
      ),
      body: copy(
        locale,
        "This actor can open the Ops shell but lacks scope to read fleet registry records. Request `ops_manager` or `ops_dispatcher` access.",
        "目前帳號可以進入 Ops shell，但沒有讀取 fleet registry 的 scope。請申請 `ops_manager` 或 `ops_dispatcher` 權限。",
      ),
      icon: "audit" as const,
    },
    external_unavailable: {
      tone: "warn" as const,
      title: copy(
        locale,
        "External dependency unavailable",
        "外部依賴暫時不可用",
      ),
      body: copy(
        locale,
        "A linked upstream or mirrored service is unavailable, so the registry cannot guarantee a trustworthy vehicle snapshot.",
        "關聯的上游或鏡像服務目前不可用，因此這頁無法保證提供可信的車輛快照。",
      ),
      icon: "ext" as const,
    },
    filtered_empty: {
      tone: "info" as const,
      title: copy(
        locale,
        "No vehicles match the current filters",
        "目前篩選條件沒有符合車輛",
      ),
      body: copy(
        locale,
        "Adjust status, type, dispatchable, or overdue filters. Search stays low-risk and should never hide available rows without explicit filters.",
        "請調整狀態、類型、可派遣或逾期條件。搜尋屬於 low-risk 動作，不應在未明確設定篩選時隱藏資料。",
      ),
      icon: "filter" as const,
    },
  };
  const config = emptyStateConfig[emptyState.reason];

  const cta =
    emptyState.reason === "not_provisioned" ? (
      renderActionLink(
        locale,
        emptyState.nextAction!,
        `${PLATFORM_ADMIN_BASE_URL}/fleet`,
        copy(locale, "Open Platform Admin fleet", "前往 Platform Admin 車隊"),
        "_blank",
      )
    ) : emptyState.reason === "permission_denied" ? (
      renderActionLink(
        locale,
        emptyState.nextAction!,
        `${PLATFORM_ADMIN_BASE_URL}/access-requests`,
        copy(locale, "Request access", "申請權限"),
        "_blank",
      )
    ) : emptyState.reason === "external_unavailable" ? (
      renderActionLink(
        locale,
        emptyState.nextAction!,
        `${PLATFORM_ADMIN_BASE_URL}/adapters`,
        copy(locale, "Open adapter status", "查看 adapter 狀態"),
        "_blank",
      )
    ) : emptyState.reason === "filtered_empty" ? (
      <Link
        href={buildVehicleHref(filters, {
          q: "",
          status: "all",
          type: "all",
          dispatchable: "all",
          overdue: "all",
        })}
        style={{ textDecoration: "none" }}
      >
        <Btn theme={theme} size="xs" variant="secondary">
          {copy(locale, "Clear filters", "清除篩選")}
        </Btn>
      </Link>
    ) : null;

  return (
    <Card
      theme={theme}
      title={copy(locale, "Empty state handling", "空狀態處理")}
      subtitle={copy(
        locale,
        "Q-X15 distinct reasons",
        "Q-X15 六種原因需獨立處理",
      )}
      actions={
        filters.emptyReason ? (
          <Pill theme={theme} tone="info">
            {copy(locale, "QA override active", "QA override 啟用中")}
          </Pill>
        ) : undefined
      }
    >
      <Banner
        theme={theme}
        tone={config.tone}
        icon={<CanvasIcon name={config.icon} size={16} />}
        title={config.title}
        body={config.body}
        actions={cta}
      />
      <div style={{ marginTop: 12, color: theme.textMuted, fontSize: 12 }}>
        {copy(locale, "Reason code", "原因代碼")}{" "}
        <strong style={{ color: theme.text }}>{emptyState.reason}</strong>
      </div>
    </Card>
  );
}

export default async function VehiclesPage({
  searchParams,
}: VehiclesPageProps) {
  const [client, locale, resolvedSearchParams] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
    searchParams ?? Promise.resolve({}),
  ]);

  const filters = resolveFilters(resolvedSearchParams);
  const generatedAt = new Date().toISOString();
  const refreshMeta: UiRefreshMetadata = {
    generatedAt,
    staleAfterMs: REFRESH_INTERVAL_MS,
    dataFreshness: "fresh",
    source: "live",
  };

  const [vehiclesResult, driversResult, shiftsResult, maintenanceResult] =
    await Promise.all([
      loadOrCapture(() => client.listVehicles()),
      loadOrCapture(() => client.listDrivers()),
      loadOrCapture(() => client.listShifts()),
      loadOrCapture(() => client.listMaintenance()),
    ]);

  const vehicles = vehiclesResult.data ?? [];
  const drivers = driversResult.data ?? [];
  const shifts = shiftsResult.data ?? [];
  const maintenance = maintenanceResult.data ?? [];

  const degradedMessages = [
    driversResult.error
      ? copy(
          locale,
          `Driver registry degraded: ${driversResult.error}`,
          `司機 registry 降級：${driversResult.error}`,
        )
      : null,
    shiftsResult.error
      ? copy(
          locale,
          `Shift monitor degraded: ${shiftsResult.error}`,
          `班次監控降級：${shiftsResult.error}`,
        )
      : null,
    maintenanceResult.error
      ? copy(
          locale,
          `Maintenance feed degraded: ${maintenanceResult.error}`,
          `保修資料降級：${maintenanceResult.error}`,
        )
      : null,
  ].filter(Boolean) as string[];

  const emptyReason =
    filters.emptyReason ??
    (vehiclesResult.error
      ? inferEmptyReasonFromError(vehiclesResult.error)
      : vehicles.length === 0
        ? "no_data"
        : undefined);

  const driverById = new Map(
    drivers.map((driver) => [driver.driverId, driver]),
  );
  const activeShiftByVehicleId = new Map(
    shifts
      .filter(
        (shift): shift is ShiftRecord & { vehicleId: string } =>
          shift.status === "active" && Boolean(shift.vehicleId),
      )
      .map((shift) => [shift.vehicleId, shift]),
  );
  const maintenanceByVehicleId = new Map<string, MaintenanceRecord[]>();
  for (const record of maintenance) {
    const current = maintenanceByVehicleId.get(record.vehicleId) ?? [];
    current.push(record);
    maintenanceByVehicleId.set(record.vehicleId, current);
  }

  const rows = vehicles.map((vehicle) =>
    buildVehicleRow(
      locale,
      vehicle,
      driverById,
      activeShiftByVehicleId,
      maintenanceByVehicleId,
    ),
  );
  const filteredRows = filterRows(rows, filters);
  const effectiveEmptyState: VehiclePageEmptyReason | undefined =
    emptyReason ?? (filteredRows.length === 0 ? "filtered_empty" : undefined);

  const [searchAction, refreshAction, resetAction] = buildPageActionDescriptors(
    filteredRows.length,
    filters,
  );
  const totalVehicles = rows.length;
  const dispatchableCount = rows.filter(
    (row) => row.dispatchableTone === "success",
  ).length;
  const offlineCount = rows.filter((row) => row.status === "offline").length;
  const overdueCount = rows.filter((row) => row.overdueMaintenance).length;
  const offboardingCount = rows.filter(
    (row) => row.status === "offboarding",
  ).length;
  const typeOptions = Array.from(
    new Set(rows.map((row) => row.serviceType)),
  ).sort();
  const manyOffline = totalVehicles > 0 && offlineCount / totalVehicles >= 0.4;

  const tabAll = (
    <Link
      href={buildVehicleHref(filters, { status: "all" })}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      {copy(locale, "All", "全部")} ({totalVehicles})
    </Link>
  );
  const tabDispatchable = (
    <Link
      href={buildVehicleHref(filters, { status: "dispatchable" })}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      {copy(locale, "Dispatchable", "可派")} ({dispatchableCount})
    </Link>
  );
  const tabOffboarding = (
    <Link
      href={buildVehicleHref(filters, { status: "offboarding" })}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      {copy(locale, "Offboarding", "退場中")} ({offboardingCount})
    </Link>
  );
  const activeTab =
    filters.status === "dispatchable"
      ? tabDispatchable
      : filters.status === "offboarding"
        ? tabOffboarding
        : tabAll;

  const tableColumns: CanvasTableColumn<VehicleListRow>[] = [
    {
      h: "PLATE",
      w: 170,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <span style={{ fontWeight: 700 }}>{row.plateNo}</span>
          <span
            style={{
              fontSize: 11.5,
              color: theme.textMuted,
              fontFamily: theme.monoFamily,
            }}
          >
            {row.vehicleId} · {row.lastSeenLabel}
          </span>
        </div>
      ),
    },
    {
      h: "MODEL / STATUS",
      w: 190,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <Pill theme={theme} tone={row.statusTone} dot>
            {row.statusLabel}
          </Pill>
          <span style={{ fontWeight: 600 }}>{row.serviceTypeLabel}</span>
          <span style={{ fontSize: 11.5, color: theme.textMuted }}>
            {row.lastSeenDetail}
          </span>
        </div>
      ),
    },
    {
      h: "DISPATCHABLE",
      w: 132,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <Pill theme={theme} tone={row.dispatchableTone} dot>
            {row.dispatchableLabel}
          </Pill>
          <span style={{ fontSize: 11.5, color: theme.textMuted }}>
            {row.overdueMaintenance
              ? copy(locale, "maintenance overdue", "保修逾期")
              : copy(locale, "maintenance clear", "保修正常")}
          </span>
        </div>
      ),
    },
    {
      h: "CURRENT DRIVER",
      w: 188,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          {row.currentDriverHref ? (
            <Link
              href={row.currentDriverHref}
              style={{
                color: theme.accent,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              {row.currentDriverLabel}
            </Link>
          ) : (
            <span style={{ fontWeight: 600 }}>{row.currentDriverLabel}</span>
          )}
          <span style={{ fontSize: 11.5, color: theme.textMuted }}>
            {row.currentDriverDetail}
          </span>
        </div>
      ),
    },
    {
      h: "CONTRACT",
      w: 144,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <span
            style={{
              fontFamily: theme.monoFamily,
              fontWeight: 600,
              fontSize: 12,
            }}
          >
            {row.contractLabel}
          </span>
          <span style={{ fontSize: 11.5, color: theme.textMuted }}>
            {row.contractDetail}
          </span>
        </div>
      ),
    },
    {
      h: "INSURANCE",
      w: 132,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <Pill theme={theme} tone={row.insuranceTone} dot>
            {row.insuranceLabel}
          </Pill>
          <span style={{ fontSize: 11.5, color: theme.textMuted }}>
            {row.healthSummary}
          </span>
        </div>
      ),
    },
    {
      h: "DEBRAND DUE",
      w: 160,
      r: (row) => (
        <div style={{ display: "grid", gap: 4 }}>
          <Pill theme={theme} tone={row.debrandTone}>
            {row.debrandDueLabel}
          </Pill>
          <span style={{ fontSize: 11.5, color: theme.textMuted }}>
            {row.debrandDetail}
          </span>
        </div>
      ),
    },
    {
      h: "ACTIONS",
      w: 220,
      r: (row) => {
        const detailAction = row.actionDescriptors.find(
          (descriptor) => descriptor.action === "open_vehicle_detail",
        );
        const driverAction = row.actionDescriptors.find(
          (descriptor) => descriptor.action === "open_driver_binding",
        );
        const maintenanceAction = row.actionDescriptors.find(
          (descriptor) => descriptor.action === "open_maintenance",
        );
        const adminAction = row.actionDescriptors.find(
          (descriptor) => descriptor.action === "open_platform_admin_fleet",
        );
        const adminLink = row.crossLinks[0];

        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {detailAction
              ? renderActionLink(
                  locale,
                  detailAction,
                  `/vehicles/${encodeURIComponent(row.vehicleId)}`,
                  copy(locale, "Detail", "詳情"),
                )
              : null}
            {driverAction
              ? renderActionLink(
                  locale,
                  driverAction,
                  row.currentDriverHref ?? "#",
                  copy(locale, "Driver", "司機"),
                )
              : null}
            {maintenanceAction
              ? renderActionLink(
                  locale,
                  maintenanceAction,
                  `/maintenance?vehicleId=${encodeURIComponent(row.vehicleId)}`,
                  copy(locale, "Maintenance", "保修"),
                )
              : null}
            {adminAction && adminLink
              ? renderActionLink(
                  locale,
                  adminAction,
                  buildCrossAppHref(adminLink),
                  copy(locale, "Platform Admin", "Platform Admin"),
                  "_blank",
                )
              : null}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <OpsAutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
      <PageHeader
        theme={theme}
        title={copy(locale, "Vehicles", "車輛")}
        subtitle={copy(
          locale,
          "dispatchable · contract · insurance · debrand",
          "dispatchable · 合約 · 保險 · debrand",
        )}
        tabs={[tabAll, tabDispatchable, tabOffboarding]}
        activeTab={activeTab}
        actions={
          <>
            <Pill theme={theme} tone="info">
              {copy(locale, "T3 · 15s refresh", "T3 · 15 秒刷新")}
            </Pill>
            <Link href="#vehicle-filters" style={{ textDecoration: "none" }}>
              <Btn theme={theme} variant="secondary" size="sm" icon="filter">
                {copy(locale, "Filters", "篩選")}
              </Btn>
            </Link>
            {renderActionLink(
              locale,
              refreshAction,
              buildVehicleHref(filters, {}),
              copy(locale, "Refresh", "重新整理"),
            )}
          </>
        }
      />

      <div style={pageBodyStyle}>
        {manyOffline ? (
          <Banner
            theme={theme}
            tone="danger"
            icon={<CanvasIcon name="warn" size={16} />}
            title={copy(locale, "Many vehicles offline", "大量車輛離線")}
            body={copy(
              locale,
              `${offlineCount} of ${totalVehicles} vehicles are currently offline or not dispatchable. This is the supply-emergency state variant from the packet.`,
              `${totalVehicles} 輛車中有 ${offlineCount} 輛目前離線或不可派遣。這是 packet 指定的供給緊急狀態變體。`,
            )}
          />
        ) : null}

        {degradedMessages.length > 0 ? (
          <Banner
            theme={theme}
            tone="warn"
            icon={<CanvasIcon name="health" size={16} />}
            title={copy(locale, "Partial data degradation", "部分資料降級")}
            body={degradedMessages.join(" · ")}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <KPI
            theme={theme}
            label={copy(locale, "Total vehicles", "車輛總數")}
            value={totalVehicles}
            sub={copy(
              locale,
              "Registry rows loaded",
              "成功載入的 registry 列數",
            )}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Dispatchable", "可派遣")}
            value={dispatchableCount}
            delta={`${Math.max(0, totalVehicles - dispatchableCount)}`}
            deltaTone={dispatchableCount === totalVehicles ? "neutral" : "down"}
            sub={copy(locale, "Ready for queue supply", "可直接投入派遣供給")}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Offline / blocked", "離線 / 阻塞")}
            value={offlineCount}
            delta={copy(locale, "needs recovery", "需回復")}
            deltaTone={offlineCount > 0 ? "down" : "neutral"}
            sub={copy(locale, "Not dispatchable now", "目前不可派遣")}
          />
          <KPI
            theme={theme}
            label={copy(locale, "Overdue maintenance", "逾期保修")}
            value={overdueCount}
            delta={
              offboardingCount > 0
                ? `${offboardingCount} offboarding`
                : undefined
            }
            deltaTone={overdueCount > 0 ? "down" : "neutral"}
            sub={copy(locale, "Vehicle upkeep watchlist", "保修風險觀察清單")}
          />
        </div>

        <div style={topGridStyle}>
          <div id="vehicle-filters">
            <Card
              theme={theme}
              title={copy(locale, "Filters", "篩選條件")}
              subtitle={copy(
                locale,
                "Status, type, dispatchable, overdue, plus low-risk search.",
                "包含狀態、類型、可派遣、逾期，以及 low-risk 搜尋。",
              )}
            >
              <form action="/vehicles" method="get" style={filterGridStyle}>
                <Field
                  theme={theme}
                  label={copy(locale, "Search", "搜尋")}
                  hint={copy(
                    locale,
                    "Vehicle ID, plate, or driver",
                    "車輛編號、車牌或司機",
                  )}
                >
                  <input
                    name="q"
                    defaultValue={filters.q}
                    placeholder={copy(
                      locale,
                      "veh-demo-001 / ABC-1001",
                      "veh-demo-001 / ABC-1001",
                    )}
                    style={inputStyle}
                  />
                </Field>
                <Field theme={theme} label={copy(locale, "Status", "狀態")}>
                  <select
                    name="status"
                    defaultValue={filters.status}
                    style={inputStyle}
                  >
                    <option value="all">{copy(locale, "All", "全部")}</option>
                    <option value="dispatchable">
                      {copy(locale, "Dispatchable", "可派")}
                    </option>
                    <option value="offline">
                      {copy(locale, "Offline", "離線")}
                    </option>
                    <option value="offboarding">
                      {copy(locale, "Offboarding", "退場中")}
                    </option>
                    <option value="attention">
                      {copy(locale, "Attention", "需留意")}
                    </option>
                  </select>
                </Field>
                <Field theme={theme} label={copy(locale, "Type", "類型")}>
                  <select
                    name="type"
                    defaultValue={filters.type}
                    style={inputStyle}
                  >
                    <option value="all">
                      {copy(locale, "All types", "全部類型")}
                    </option>
                    {typeOptions.map((serviceType) => (
                      <option key={serviceType} value={serviceType}>
                        {formatOpsCodeLabel(locale, serviceType)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  theme={theme}
                  label={copy(locale, "Dispatchable", "可派遣")}
                >
                  <select
                    name="dispatchable"
                    defaultValue={filters.dispatchable}
                    style={inputStyle}
                  >
                    <option value="all">{copy(locale, "All", "全部")}</option>
                    <option value="yes">{copy(locale, "Yes", "是")}</option>
                    <option value="no">{copy(locale, "No", "否")}</option>
                  </select>
                </Field>
                <Field theme={theme} label={copy(locale, "Overdue", "逾期")}>
                  <select
                    name="overdue"
                    defaultValue={filters.overdue}
                    style={inputStyle}
                  >
                    <option value="all">{copy(locale, "All", "全部")}</option>
                    <option value="yes">{copy(locale, "Yes", "是")}</option>
                    <option value="no">{copy(locale, "No", "否")}</option>
                  </select>
                </Field>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    title={getDisabledReasonLabel(
                      locale,
                      searchAction.disabledReasonCode,
                    )}
                  >
                    <Btn
                      theme={theme}
                      variant="primary"
                      size="sm"
                      icon="search"
                      disabled={!searchAction.enabled}
                    >
                      {copy(locale, "Apply", "套用")}
                    </Btn>
                  </span>
                  {resetAction.enabled ? (
                    <Link href="/vehicles" style={{ textDecoration: "none" }}>
                      <Btn theme={theme} variant="ghost" size="sm">
                        {copy(locale, "Reset", "重設")}
                      </Btn>
                    </Link>
                  ) : null}
                </div>
              </form>
            </Card>
          </div>

          <Card
            theme={theme}
            title={copy(locale, "Refresh + deep links", "刷新與 deep links")}
            subtitle={copy(
              locale,
              "Q-X01/Q-X03 envelope surfaced in chrome.",
              "Q-X01/Q-X03 envelope 已反映到畫面。",
            )}
          >
            <div style={infoListStyle}>
              <div style={infoRowStyle}>
                <div>
                  <div style={{ fontWeight: 600, color: theme.text }}>
                    {copy(locale, "Generated at", "生成時間")}
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                    {formatDateTime(refreshMeta.generatedAt, locale)}
                  </div>
                </div>
                <Pill theme={theme} tone="success">
                  {refreshMeta.dataFreshness}
                </Pill>
              </div>
              <div style={infoRowStyle}>
                <div>
                  <div style={{ fontWeight: 600, color: theme.text }}>
                    {copy(locale, "Cross-app", "跨 app")}
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                    {copy(
                      locale,
                      "Platform Admin fleet governance opens in a new tab.",
                      "Platform Admin 車隊治理會以新分頁開啟。",
                    )}
                  </div>
                </div>
                <Link
                  href={`${PLATFORM_ADMIN_BASE_URL}/fleet`}
                  target="_blank"
                  style={{ textDecoration: "none" }}
                >
                  <Btn theme={theme} size="xs" variant="secondary">
                    {copy(locale, "Open fleet", "開啟車隊")}
                  </Btn>
                </Link>
              </div>
              <div style={infoRowStyle}>
                <div>
                  <div style={{ fontWeight: 600, color: theme.text }}>
                    {copy(locale, "Refresh tier", "刷新層級")}
                  </div>
                  <div style={{ fontSize: 11.5, color: theme.textMuted }}>
                    {copy(locale, "T3 medium cadence", "T3 中速節奏")}
                  </div>
                </div>
                <Pill theme={theme} tone="info">
                  {REFRESH_TIER}
                </Pill>
              </div>
            </div>
          </Card>
        </div>

        {effectiveEmptyState ? (
          renderEmptyStateCard(
            locale,
            getEmptyStateEnvelope(locale, effectiveEmptyState),
            filters,
          )
        ) : (
          <Card
            theme={theme}
            title={copy(locale, "Vehicle registry", "車輛 registry")}
            subtitle={copy(
              locale,
              `${filteredRows.length} rows after filters. Must-show fields align to packet §5.16.`,
              `套用篩選後共 ${filteredRows.length} 列，欄位對齊 packet §5.16。`,
            )}
          >
            <Table theme={theme} columns={tableColumns} rows={filteredRows} />
          </Card>
        )}
      </div>
    </>
  );
}
