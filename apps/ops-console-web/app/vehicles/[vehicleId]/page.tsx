import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";
import type {
  AuditLogRecord,
  CrossAppResourceLink,
  EmptyReason,
  IncidentRecord,
  MaintenanceRecord,
  ResourceActionDescriptor,
  ShiftRecord,
  UiRefreshMetadata,
  VehicleContractRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import {
  CanvasBanner as Banner,
  CanvasCard as Card,
  CanvasDL as DL,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  WorkflowEmptyState,
  buildCanvasTheme,
  type CanvasTableColumn,
} from "@drts/ui-web";

type VehicleDetailPageProps = {
  params: Promise<{
    vehicleId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type Locale = "en" | "zh";

type VehicleWithActions = VehicleRegistryRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type ContractWithActions = VehicleContractRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type LoadState<T> = {
  data: T;
  error: string | null;
  reason: EmptyReason | null;
};

type TableRow = Record<string, unknown> & {
  key: string;
};

type CurrentBinding = {
  shift: ShiftRecord;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const PLATFORM_ADMIN_BASE_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3002";
const TENANT_CONSOLE_BASE_URL =
  process.env.NEXT_PUBLIC_TENANT_CONSOLE_URL ?? "http://localhost:3003";

const REFRESH_LABEL = "T3 / 15s";
const REFRESH_STALE_AFTER_MS = 15_000;

const pageStackStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  padding: "18px 24px 28px",
};

const splitGridStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
};

const leftRailStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
};

const rightRailStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gap: "12px",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
};

const summaryTileStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: "10px",
  padding: "12px 14px",
  background: theme.surfaceLo,
};

const summaryValueStyle: CSSProperties = {
  fontSize: "26px",
  fontWeight: 700,
  color: theme.text,
  lineHeight: 1,
  marginTop: "6px",
};

const summaryLabelStyle: CSSProperties = {
  fontSize: "11px",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: theme.textMuted,
};

const summaryNoteStyle: CSSProperties = {
  marginTop: "6px",
  fontSize: "12px",
  color: theme.textMuted,
  lineHeight: 1.45,
};

const actionGridStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
};

const actionItemStyle: CSSProperties = {
  border: `1px solid ${theme.border}`,
  borderRadius: "10px",
  padding: "12px 14px",
  background: theme.surfaceLo,
  display: "grid",
  gap: "8px",
};

const actionLinkStyle: CSSProperties = {
  color: theme.accent,
  textDecoration: "none",
  fontSize: "12px",
  fontWeight: 600,
};

const subtleLinkStyle: CSSProperties = {
  color: theme.text,
  textDecoration: "none",
  fontWeight: 600,
};

const mutedTextStyle: CSSProperties = {
  color: theme.textMuted,
  fontSize: "12px",
  lineHeight: 1.5,
};

const monoStyle: CSSProperties = {
  fontFamily: theme.monoFamily,
  fontSize: "12px",
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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

function classifyReason(error: string): EmptyReason {
  if (error.includes("401") || error.includes("403")) {
    return "permission_denied";
  }
  if (
    error.includes("502") ||
    error.includes("503") ||
    error.includes("504") ||
    error.toLowerCase().includes("external")
  ) {
    return "external_unavailable";
  }
  return "fetch_failed";
}

async function loadOptional<T>(
  loader: () => Promise<T>,
): Promise<LoadState<T>> {
  try {
    return {
      data: await loader(),
      error: null,
      reason: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown fetch failure";
    return {
      data: [] as T,
      error: message,
      reason: classifyReason(message),
    };
  }
}

function dispatchTone(vehicle: VehicleRegistryRecord) {
  return vehicle.dispatchableFlag ? ("success" as const) : ("danger" as const);
}

function getCurrentBinding(
  shifts: ShiftRecord[],
  vehicleId: string,
): CurrentBinding | null {
  const shift = [...shifts]
    .filter((candidate) => candidate.vehicleId === vehicleId)
    .sort((left, right) =>
      (right.updatedAt ?? right.clockedInAt).localeCompare(
        left.updatedAt ?? left.clockedInAt,
      ),
    )[0];

  if (!shift) {
    return null;
  }

  return {
    shift,
  };
}

function refreshTone(metadata: UiRefreshMetadata) {
  switch (metadata.dataFreshness) {
    case "fresh":
      return "success" as const;
    case "stale":
      return "warn" as const;
    case "degraded":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function buildRefreshMetadata(
  vehicle: VehicleRegistryRecord,
  overrides?: {
    dataFreshness?: UiRefreshMetadata["dataFreshness"];
    source?: UiRefreshMetadata["source"];
  },
): UiRefreshMetadata {
  const generatedAt = vehicle.updatedAt || new Date().toISOString();

  return {
    generatedAt,
    staleAfterMs: REFRESH_STALE_AFTER_MS,
    dataFreshness:
      overrides?.dataFreshness ??
      (Date.now() - new Date(generatedAt).getTime() > REFRESH_STALE_AFTER_MS
        ? "stale"
        : "fresh"),
    source: overrides?.source ?? "live",
  };
}

function getEmptyCopy(
  reason: EmptyReason,
  locale: Locale,
): { title: string; description: string; tone: "info" | "warning" | "danger" } {
  switch (reason) {
    case "not_provisioned":
      return {
        title: copy(locale, "Not provisioned yet", "尚未佈建"),
        description: copy(
          locale,
          "This vehicle surface exists, but the supporting operational module is not provisioned yet.",
          "此車輛頁面存在，但支撐它的營運模組尚未完成佈建。",
        ),
        tone: "warning",
      };
    case "fetch_failed":
      return {
        title: copy(locale, "Unable to load data", "資料載入失敗"),
        description: copy(
          locale,
          "The control-plane request failed before the vehicle snapshot could be assembled.",
          "控制平面請求失敗，無法組裝車輛詳情快照。",
        ),
        tone: "danger",
      };
    case "permission_denied":
      return {
        title: copy(locale, "Permission denied", "權限不足"),
        description: copy(
          locale,
          "Your current role cannot access this vehicle surface.",
          "你目前的角色無法存取這個車輛營運視圖。",
        ),
        tone: "danger",
      };
    case "external_unavailable":
      return {
        title: copy(locale, "External system unavailable", "外部系統不可用"),
        description: copy(
          locale,
          "A dependent service is unavailable, so this section is temporarily partial.",
          "依賴的外部服務目前不可用，因此此區塊暫時只有部分資料。",
        ),
        tone: "warning",
      };
    case "filtered_empty":
      return {
        title: copy(locale, "No matching records", "沒有符合條件的資料"),
        description: copy(
          locale,
          "The surface is working, but nothing matches the current slice.",
          "畫面本身可用，但目前切片條件下沒有符合資料。",
        ),
        tone: "info",
      };
    case "no_data":
    default:
      return {
        title: copy(locale, "No data yet", "目前沒有資料"),
        description: copy(
          locale,
          "The vehicle record exists, but this section has no data to show yet.",
          "車輛主檔存在，但此區塊目前沒有可顯示資料。",
        ),
        tone: "info",
      };
  }
}

function renderEmptyState(
  reason: EmptyReason,
  locale: Locale,
  actions?: ReactNode,
) {
  const copyBlock = getEmptyCopy(reason, locale);

  return (
    <WorkflowEmptyState
      title={copyBlock.title}
      description={copyBlock.description}
      tone={copyBlock.tone}
      density="compact"
      actions={actions}
    />
  );
}

function getCrossAppUrl(link: CrossAppResourceLink) {
  const baseUrl =
    link.targetApp === "platform-admin"
      ? PLATFORM_ADMIN_BASE_URL
      : link.targetApp === "tenant-console"
        ? TENANT_CONSOLE_BASE_URL
        : "";

  return `${baseUrl}${link.route}`;
}

function createActionDescriptors(
  vehicle: VehicleWithActions,
  binding: CurrentBinding | null,
  contracts: ContractWithActions[],
): ResourceActionDescriptor[] {
  if (vehicle.availableActions && vehicle.availableActions.length > 0) {
    return vehicle.availableActions;
  }

  return [
    {
      action: "open_driver_binding",
      enabled: Boolean(binding),
      riskLevel: "low",
      ...(!binding
        ? {
            disabledReasonCode: "driver_binding_missing",
          }
        : {}),
    },
    {
      action: "open_maintenance_workspace",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "open_contract_reference",
      enabled: contracts.length > 0,
      riskLevel: "low",
      ...(contracts.length === 0
        ? {
            disabledReasonCode: "contract_reference_missing",
          }
        : {}),
    },
    {
      action: "open_platform_admin_fleet",
      enabled: true,
      riskLevel: "low",
    },
    {
      action: "add_operational_note",
      enabled: false,
      disabledReasonCode: "ops_note_endpoint_pending",
      requiresReason: true,
      riskLevel: "medium",
    },
  ];
}

function getActionLabel(action: ResourceActionDescriptor, locale: Locale) {
  switch (action.action) {
    case "open_driver_binding":
      return copy(locale, "Open driver binding", "打開司機綁定");
    case "open_maintenance_workspace":
      return copy(locale, "Open maintenance board", "打開保修工作台");
    case "open_contract_reference":
      return copy(locale, "Open contract detail", "打開合約詳情");
    case "open_platform_admin_fleet":
      return copy(
        locale,
        "Open fleet in platform-admin",
        "到 platform-admin 開啟車隊主檔",
      );
    case "add_operational_note":
      return copy(locale, "Add operational note", "新增營運備註");
    default:
      return formatOpsCodeLabel(locale, action.action);
  }
}

function renderActionLink(
  action: ResourceActionDescriptor,
  locale: Locale,
  vehicleId: string,
  binding: CurrentBinding | null,
  contracts: ContractWithActions[],
) {
  switch (action.action) {
    case "open_driver_binding":
      return binding ? (
        <Link
          href={`/drivers/${encodeURIComponent(binding.shift.driverId)}`}
          style={actionLinkStyle}
        >
          {copy(locale, "Open driver detail", "打開司機詳情")}
        </Link>
      ) : null;
    case "open_maintenance_workspace":
      return (
        <Link
          href={`/maintenance?vehicleId=${encodeURIComponent(vehicleId)}`}
          style={actionLinkStyle}
        >
          {copy(
            locale,
            "Filter maintenance for this vehicle",
            "切到此車的保修清單",
          )}
        </Link>
      );
    case "open_contract_reference":
      return contracts[0] ? (
        <Link
          href={`/contracts/${encodeURIComponent(contracts[0].contractId)}`}
          style={actionLinkStyle}
        >
          {copy(locale, "Open current contract", "打開目前合約")}
        </Link>
      ) : null;
    case "open_platform_admin_fleet":
      return (
        <Link
          href={`${PLATFORM_ADMIN_BASE_URL}/fleet`}
          target="_blank"
          rel="noreferrer"
          style={actionLinkStyle}
        >
          {copy(
            locale,
            "Cross-app to fleet governance",
            "跨 app 前往 fleet 治理",
          )}
        </Link>
      );
    case "add_operational_note":
      return (
        <span style={mutedTextStyle}>
          {copy(
            locale,
            `Pending API support for ${vehicleId}.`,
            `${vehicleId} 的 API 尚未提供備註寫入。`,
          )}
        </span>
      );
    default:
      return null;
  }
}

function buildMaintenanceRows(
  locale: Locale,
  records: MaintenanceRecord[],
): TableRow[] {
  return records.map((record) => ({
    key: record.maintenanceId,
    workOrder: record.maintenanceId,
    type: formatOpsCodeLabel(locale, record.type),
    status: record.status,
    scheduledAt: formatDateTime(locale, record.scheduledAt),
    technician: record.technician ?? "—",
  }));
}

function buildIncidentRows(
  locale: Locale,
  incidents: IncidentRecord[],
): TableRow[] {
  return incidents.map((incident) => ({
    key: incident.incidentId,
    incidentId: incident.incidentId,
    title: incident.title,
    severity: incident.severity,
    status: incident.status,
    occurredAt: formatDateTime(locale, incident.occurredAt),
    severityLabel: formatOpsCodeLabel(locale, incident.severity),
    statusLabel: formatOpsCodeLabel(locale, incident.status),
  }));
}

function buildAuditRows(locale: Locale, audits: AuditLogRecord[]): TableRow[] {
  return audits.map((audit) => ({
    key: audit.auditId,
    auditId: audit.auditId,
    moduleName: audit.moduleName,
    actionName: audit.actionName,
    actor: audit.actorId ?? audit.actorType,
    createdAt: formatDateTime(locale, audit.createdAt),
  }));
}

export default async function VehicleDetailPage({
  params,
  searchParams,
}: VehicleDetailPageProps) {
  const { vehicleId } = await params;
  const query = searchParams ? await searchParams : undefined;
  const forcedReason = firstParam(query?.emptyReason) as
    | EmptyReason
    | undefined;
  const forcedFreshness = firstParam(query?.dataFreshness) as
    | UiRefreshMetadata["dataFreshness"]
    | undefined;
  const forcedSource = firstParam(query?.source) as
    | UiRefreshMetadata["source"]
    | undefined;

  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  const headerActions = (
    <>
      <Link href="/vehicles" style={actionLinkStyle}>
        {copy(locale, "Back to vehicles", "返回車輛清單")}
      </Link>
      <Link
        href={`${PLATFORM_ADMIN_BASE_URL}/fleet`}
        target="_blank"
        rel="noreferrer"
        style={actionLinkStyle}
      >
        {copy(locale, "Platform admin fleet", "Platform Admin 車隊主檔")}
      </Link>
    </>
  );

  if (forcedReason) {
    return (
      <>
        <PageHeader
          theme={theme}
          title={copy(locale, "Vehicle detail", "車輛詳情")}
          subtitle={`${vehicleId} · ${copy(locale, "empty-state preview", "空狀態預覽")}`}
          actions={headerActions}
        />
        <div style={pageStackStyle}>
          {renderEmptyState(
            forcedReason,
            locale,
            <Link href="/vehicles" style={actionLinkStyle}>
              {copy(locale, "Return to registry", "回到車輛名冊")}
            </Link>,
          )}
        </div>
      </>
    );
  }

  const vehiclesResult = await loadOptional<VehicleWithActions[]>(() =>
    client.listVehicles(),
  );

  if (vehiclesResult.error) {
    return (
      <>
        <PageHeader
          theme={theme}
          title={copy(locale, "Vehicle detail", "車輛詳情")}
          subtitle={vehicleId}
          actions={headerActions}
        />
        <div style={pageStackStyle}>
          {renderEmptyState(vehiclesResult.reason ?? "fetch_failed", locale)}
        </div>
      </>
    );
  }

  const vehicle = vehiclesResult.data.find(
    (candidate) => candidate.vehicleId === vehicleId,
  );

  if (!vehicle) {
    notFound();
  }

  const [
    driversResult,
    contractsResult,
    policiesResult,
    shiftsResult,
    maintenanceResult,
    incidentsResult,
    auditsResult,
  ] = await Promise.all([
    loadOptional(() => client.listDrivers()),
    loadOptional(() => client.listContracts()),
    loadOptional(() => client.listPolicies()),
    loadOptional(() => client.listShifts()),
    loadOptional(() => client.listMaintenance(vehicleId)),
    loadOptional(() => client.listIncidents()),
    loadOptional(() => client.listAuditLogs()),
  ]);

  const contracts = (contractsResult.data as ContractWithActions[])
    .filter((contract) => contract.vehicleId === vehicleId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const policy = (
    policiesResult.data as Array<{
      vehicleId: string;
      policyNo: string;
      insurerName: string;
      endAt: string;
      lifecycleStatus: string;
    }>
  ).find((candidate) => candidate.vehicleId === vehicleId);
  const currentBinding = getCurrentBinding(
    shiftsResult.data as ShiftRecord[],
    vehicleId,
  );
  const driver =
    currentBinding &&
    (driversResult.data as Array<{ driverId: string; name: string }>).find(
      (candidate) => candidate.driverId === currentBinding.shift.driverId,
    );
  const incidents = (incidentsResult.data as IncidentRecord[])
    .filter((incident) => incident.relatedVehicleId === vehicleId)
    .sort((left, right) =>
      (right.occurredAt ?? "").localeCompare(left.occurredAt ?? ""),
    );
  const audits = (auditsResult.data as AuditLogRecord[])
    .filter(
      (audit) =>
        audit.resourceId === vehicleId ||
        String(audit.newValuesSummary?.vehicleId ?? "") === vehicleId ||
        String(audit.oldValuesSummary?.vehicleId ?? "") === vehicleId,
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 6);

  const refreshMetadata = buildRefreshMetadata(vehicle, {
    ...(forcedFreshness ? { dataFreshness: forcedFreshness } : {}),
    ...(forcedSource ? { source: forcedSource } : {}),
  });
  const refreshPillTone = refreshTone(refreshMetadata);
  const auditLink: CrossAppResourceLink | null =
    audits[0] != null
      ? {
          targetApp: "platform-admin",
          route: `/audit?auditId=${encodeURIComponent(audits[0].auditId)}`,
          resourceType: "audit_log",
          resourceId: audits[0].auditId,
          openMode: "new_tab",
          label: copy(locale, "View audit", "查看稽核"),
        }
      : null;

  const actionDescriptors = createActionDescriptors(
    vehicle,
    currentBinding,
    contracts,
  );
  const overdueMaintenance = (
    maintenanceResult.data as MaintenanceRecord[]
  ).filter((record) => record.status === "overdue");

  const maintenanceColumns: CanvasTableColumn<TableRow>[] = [
    {
      h: "WO",
      k: "workOrder",
      mono: true,
      w: 110,
    },
    { h: copy(locale, "Type", "類別"), k: "type", w: 170 },
    {
      h: "STATUS",
      w: 130,
      r: (row) => (
        <Pill
          theme={theme}
          tone={
            row.status === "completed"
              ? "success"
              : row.status === "overdue"
                ? "danger"
                : "warn"
          }
          dot
        >
          {formatOpsCodeLabel(locale, String(row.status))}
        </Pill>
      ),
    },
    { h: copy(locale, "Scheduled", "排定"), k: "scheduledAt", mono: true },
    { h: copy(locale, "Technician", "技師"), k: "technician", w: 110 },
  ];
  const incidentColumns: CanvasTableColumn<TableRow>[] = [
    {
      h: copy(locale, "Incident", "事件"),
      w: 210,
      r: (row) => (
        <Link
          href={`/incidents/${encodeURIComponent(String(row.incidentId))}`}
          style={subtleLinkStyle}
        >
          <span style={{ display: "grid", gap: "4px" }}>
            <span style={monoStyle}>{String(row.incidentId)}</span>
            <span style={mutedTextStyle}>{String(row.title)}</span>
          </span>
        </Link>
      ),
    },
    {
      h: copy(locale, "Severity", "嚴重度"),
      w: 120,
      r: (row) => (
        <Pill
          theme={theme}
          tone={String(row.severity) === "critical" ? "danger" : "warn"}
          dot
        >
          {String(row.severityLabel)}
        </Pill>
      ),
    },
    {
      h: copy(locale, "Status", "狀態"),
      w: 120,
      r: (row) => <span>{String(row.statusLabel)}</span>,
    },
    { h: copy(locale, "Occurred", "發生時間"), k: "occurredAt", mono: true },
  ];
  const auditColumns: CanvasTableColumn<TableRow>[] = [
    {
      h: "AUDIT",
      w: 170,
      r: (row) => (
        <Link
          href={`${PLATFORM_ADMIN_BASE_URL}/audit?auditId=${encodeURIComponent(String(row.auditId))}`}
          target="_blank"
          rel="noreferrer"
          style={subtleLinkStyle}
        >
          <span style={monoStyle}>{String(row.auditId)}</span>
        </Link>
      ),
    },
    { h: copy(locale, "Module", "模組"), k: "moduleName", w: 120 },
    { h: copy(locale, "Action", "動作"), k: "actionName", w: 170 },
    { h: copy(locale, "Actor", "執行者"), k: "actor", w: 150 },
    { h: copy(locale, "Created", "建立時間"), k: "createdAt", mono: true },
  ];

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
            <Pill theme={theme} tone={dispatchTone(vehicle)} dot>
              {vehicle.dispatchableFlag
                ? copy(locale, "dispatchable", "可派遣")
                : copy(locale, "not_dispatchable", "不可派遣")}
            </Pill>
            {vehicle.supplyLifecycle.offboarding.status !== "none" ? (
              <Pill theme={theme} tone="warn">
                {formatOpsCodeLabel(
                  locale,
                  vehicle.supplyLifecycle.offboarding.status,
                )}
              </Pill>
            ) : null}
            <Pill theme={theme} tone={refreshPillTone}>
              {`${REFRESH_LABEL} · ${refreshMetadata.dataFreshness}`}
            </Pill>
          </span>
        }
        subtitle={`${vehicle.vehicleId} · ${vehicle.operatingArea} · ${refreshMetadata.source} · ${formatDateTime(locale, refreshMetadata.generatedAt)}`}
        actions={headerActions}
      />
      <div style={pageStackStyle}>
        {refreshMetadata.dataFreshness !== "fresh" ? (
          <Banner
            theme={theme}
            tone={
              refreshMetadata.dataFreshness === "degraded" ? "danger" : "warn"
            }
            title={copy(
              locale,
              "Vehicle snapshot is not fresh",
              "車輛快照不是最新",
            )}
            body={copy(
              locale,
              `Generated at ${formatDateTime(locale, refreshMetadata.generatedAt)} via ${refreshMetadata.source}; use refresh affordances before acting.`,
              `此快照於 ${formatDateTime(locale, refreshMetadata.generatedAt)} 由 ${refreshMetadata.source} 來源產生；操作前請先重新整理。`,
            )}
          />
        ) : null}

        {vehicle.supplyLifecycle.offboarding.status !== "none" ? (
          <Banner
            theme={theme}
            tone="warn"
            title={copy(
              locale,
              "Vehicle is in the offboarding state machine",
              "此車輛已進入 offboarding 狀態機",
            )}
            body={`${formatOpsCodeLabel(locale, vehicle.supplyLifecycle.offboarding.status)} · ${formatOpsCodeLabel(locale, vehicle.supplyLifecycle.offboarding.debrandingStatus)} · ${copy(locale, "Debrand due", "去識別化期限")} ${formatDateTime(locale, vehicle.supplyLifecycle.offboarding.debrandingDueAt)}`}
            actions={
              <Link
                href={`${PLATFORM_ADMIN_BASE_URL}/fleet`}
                target="_blank"
                rel="noreferrer"
                style={actionLinkStyle}
              >
                {copy(
                  locale,
                  "Cross-app to Platform Admin fleet",
                  "跨 app 前往 Platform Admin 車隊",
                )}
              </Link>
            }
          />
        ) : null}

        {overdueMaintenance.length > 0 ? (
          <Banner
            theme={theme}
            tone="danger"
            title={copy(
              locale,
              "Overdue maintenance affects dispatchable supply",
              "逾期保修正在影響可派遣供給",
            )}
            body={copy(
              locale,
              `${overdueMaintenance.length} records are overdue for this vehicle.`,
              `這台車有 ${overdueMaintenance.length} 筆工單已逾期。`,
            )}
            actions={
              <Link
                href={`/maintenance?vehicleId=${encodeURIComponent(vehicleId)}`}
                style={actionLinkStyle}
              >
                {copy(locale, "Review maintenance", "檢視保修")}
              </Link>
            }
          />
        ) : null}

        <section style={splitGridStyle}>
          <div style={leftRailStyle}>
            <Card
              theme={theme}
              title={copy(locale, "Regulatory profile", "法規與合規檔案")}
              subtitle={copy(
                locale,
                "Dispatchability, insurance, contract, and lifecycle context.",
                "派遣、保險、合約與生命週期情境。",
              )}
            >
              <div style={summaryGridStyle}>
                <div style={summaryTileStyle}>
                  <div style={summaryLabelStyle}>
                    {copy(locale, "Dispatch holds", "派遣阻擋")}
                  </div>
                  <div style={summaryValueStyle}>
                    {vehicle.supplyLifecycle.dispatch.blockedReasons.length}
                  </div>
                  <div style={summaryNoteStyle}>
                    {vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0
                      ? vehicle.supplyLifecycle.dispatch.blockedReasons
                          .map((reason) => formatOpsCodeLabel(locale, reason))
                          .join(" / ")
                      : copy(locale, "No active hold.", "目前沒有阻擋。")}
                  </div>
                </div>
                <div style={summaryTileStyle}>
                  <div style={summaryLabelStyle}>
                    {copy(locale, "Current driver", "目前司機")}
                  </div>
                  <div style={summaryValueStyle}>
                    {currentBinding ? currentBinding.shift.driverId : "—"}
                  </div>
                  <div style={summaryNoteStyle}>
                    {driver?.name ??
                      copy(locale, "No driver binding.", "目前沒有司機綁定。")}
                  </div>
                </div>
                <div style={summaryTileStyle}>
                  <div style={summaryLabelStyle}>
                    {copy(locale, "Contracts", "合約")}
                  </div>
                  <div style={summaryValueStyle}>{contracts.length}</div>
                  <div style={summaryNoteStyle}>
                    {contracts[0]
                      ? `${contracts[0].contractId} · ${formatOpsCodeLabel(locale, contracts[0].lifecycleStatus)}`
                      : copy(locale, "No linked contract.", "尚未綁定合約。")}
                  </div>
                </div>
                <div style={summaryTileStyle}>
                  <div style={summaryLabelStyle}>
                    {copy(locale, "Incidents", "事件")}
                  </div>
                  <div style={summaryValueStyle}>{incidents.length}</div>
                  <div style={summaryNoteStyle}>
                    {incidents[0]?.title ??
                      copy(locale, "No linked incidents.", "沒有關聯事件。")}
                  </div>
                </div>
              </div>

              <div style={{ marginTop: "16px" }}>
                <DL
                  theme={theme}
                  cols={2}
                  items={[
                    {
                      label: copy(locale, "Vehicle ID", "車輛編號"),
                      value: <span style={monoStyle}>{vehicle.vehicleId}</span>,
                    },
                    {
                      label: copy(locale, "Plate", "車牌"),
                      value: vehicle.plateNo,
                    },
                    {
                      label: copy(locale, "Operating area", "營運區域"),
                      value: vehicle.operatingArea,
                    },
                    {
                      label: copy(locale, "Service buckets", "服務桶"),
                      value: vehicle.supportedServiceBuckets.join(" · ") || "—",
                    },
                    {
                      label: copy(locale, "Insurance expiry", "保單到期"),
                      value: formatDateTime(locale, policy?.endAt),
                    },
                    {
                      label: copy(locale, "Insurance status", "保險狀態"),
                      value: policy
                        ? `${policy.policyNo} · ${policy.insurerName}`
                        : copy(locale, "No active policy.", "沒有有效保單。"),
                    },
                    {
                      label: copy(locale, "Offboarding state", "退場狀態"),
                      value: formatOpsCodeLabel(
                        locale,
                        vehicle.supplyLifecycle.offboarding.status,
                      ),
                    },
                    {
                      label: copy(locale, "Debrand due", "去識別化期限"),
                      value: formatDateTime(
                        locale,
                        vehicle.supplyLifecycle.offboarding.debrandingDueAt,
                      ),
                    },
                  ]}
                />
              </div>
            </Card>

            <Card
              theme={theme}
              title={copy(locale, "Maintenance records", "保修紀錄")}
              subtitle={copy(
                locale,
                "Recent, scheduled, and overdue maintenance for this vehicle.",
                "此車的近期、排程中、逾期保修紀錄。",
              )}
            >
              {maintenanceResult.error ? (
                renderEmptyState(
                  maintenanceResult.reason ?? "fetch_failed",
                  locale,
                )
              ) : (maintenanceResult.data as MaintenanceRecord[]).length > 0 ? (
                <>
                  <Table
                    theme={theme}
                    columns={maintenanceColumns}
                    rows={buildMaintenanceRows(
                      locale,
                      maintenanceResult.data as MaintenanceRecord[],
                    )}
                  />
                  <div style={{ marginTop: "12px" }}>
                    <Link
                      href={`/maintenance?vehicleId=${encodeURIComponent(vehicleId)}`}
                      style={actionLinkStyle}
                    >
                      {copy(
                        locale,
                        "Open full maintenance board",
                        "打開完整保修工作台",
                      )}
                    </Link>
                  </div>
                </>
              ) : (
                renderEmptyState("no_data", locale)
              )}
            </Card>

            <Card
              theme={theme}
              title={copy(locale, "Contract references", "合約參照")}
              subtitle={copy(
                locale,
                "Ops is read-only here; contract mutation stays in the owner app.",
                "Ops 在此唯讀；合約異動仍留在 owner app。",
              )}
            >
              {contracts.length > 0 ? (
                <DL
                  theme={theme}
                  cols={2}
                  items={contracts.slice(0, 4).flatMap((contract) => [
                    {
                      label: contract.contractId,
                      value: (
                        <Link
                          href={`/contracts/${encodeURIComponent(contract.contractId)}`}
                          style={subtleLinkStyle}
                        >
                          {`${formatOpsCodeLabel(locale, contract.status)} · ${contract.serviceScope}`}
                        </Link>
                      ),
                    },
                    {
                      label: copy(locale, "Range", "期間"),
                      value: `${formatDateTime(locale, contract.startAt)} → ${formatDateTime(locale, contract.endAt)}`,
                    },
                  ])}
                />
              ) : (
                renderEmptyState(
                  "not_provisioned",
                  locale,
                  <Link href="/contracts" style={actionLinkStyle}>
                    {copy(locale, "Open contract registry", "打開合約清單")}
                  </Link>,
                )
              )}
            </Card>
          </div>

          <div style={rightRailStyle}>
            <Card
              theme={theme}
              title={copy(locale, "Current driver binding", "目前司機綁定")}
            >
              {currentBinding ? (
                <DL
                  theme={theme}
                  cols={1}
                  items={[
                    {
                      label: copy(locale, "Driver", "司機"),
                      value: (
                        <Link
                          href={`/drivers/${encodeURIComponent(currentBinding.shift.driverId)}`}
                          style={actionLinkStyle}
                        >
                          {currentBinding.shift.driverId}
                          {driver?.name ? ` · ${driver.name}` : ""}
                        </Link>
                      ),
                    },
                    {
                      label: copy(locale, "Shift status", "班次狀態"),
                      value: formatOpsCodeLabel(
                        locale,
                        currentBinding.shift.status,
                      ),
                    },
                    {
                      label: copy(locale, "Clocked in", "上線時間"),
                      value: formatDateTime(
                        locale,
                        currentBinding.shift.clockedInAt,
                      ),
                    },
                    {
                      label: copy(locale, "Start location", "出發地"),
                      value: currentBinding.shift.startLocation ?? "—",
                    },
                  ]}
                />
              ) : (
                renderEmptyState(
                  vehicle.supplyLifecycle.offboarding.status !== "none"
                    ? "not_provisioned"
                    : "filtered_empty",
                  locale,
                )
              )}
            </Card>

            <Card
              theme={theme}
              title={copy(locale, "Available actions", "可用動作")}
            >
              <div style={actionGridStyle}>
                {actionDescriptors.map((action) => (
                  <div key={action.action} style={actionItemStyle}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "center",
                      }}
                    >
                      <strong style={{ color: theme.text, fontSize: "12.5px" }}>
                        {getActionLabel(action, locale)}
                      </strong>
                      <Pill
                        theme={theme}
                        tone={action.enabled ? "success" : "neutral"}
                      >
                        {action.enabled
                          ? copy(locale, "enabled", "可用")
                          : copy(locale, "disabled", "不可用")}
                      </Pill>
                    </div>
                    <div style={mutedTextStyle}>
                      {action.disabledReasonCode
                        ? formatOpsCodeLabel(locale, action.disabledReasonCode)
                        : `${copy(locale, "risk", "風險")} ${action.riskLevel}${action.requiresReason ? ` · ${copy(locale, "reason required", "需填原因")}` : ""}`}
                    </div>
                    {renderActionLink(
                      action,
                      locale,
                      vehicleId,
                      currentBinding,
                      contracts,
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <Card
              theme={theme}
              title={copy(locale, "Linked incidents", "關聯事件")}
            >
              {incidentsResult.error ? (
                renderEmptyState(
                  incidentsResult.reason ?? "fetch_failed",
                  locale,
                )
              ) : incidents.length > 0 ? (
                <Table
                  theme={theme}
                  columns={incidentColumns}
                  rows={buildIncidentRows(locale, incidents)}
                />
              ) : (
                renderEmptyState("no_data", locale)
              )}
            </Card>

            <Card
              theme={theme}
              title={copy(locale, "Audit subset", "稽核子集")}
            >
              {auditsResult.error ? (
                renderEmptyState(auditsResult.reason ?? "fetch_failed", locale)
              ) : audits.length > 0 ? (
                <>
                  <Table
                    theme={theme}
                    columns={auditColumns}
                    rows={buildAuditRows(locale, audits)}
                  />
                  {auditLink ? (
                    <div style={{ marginTop: "12px" }}>
                      <Link
                        href={getCrossAppUrl(auditLink)}
                        target="_blank"
                        rel="noreferrer"
                        style={actionLinkStyle}
                      >
                        {auditLink.label}
                      </Link>
                    </div>
                  ) : null}
                </>
              ) : (
                renderEmptyState("no_data", locale)
              )}
            </Card>
          </div>
        </section>
      </div>
    </>
  );
}
