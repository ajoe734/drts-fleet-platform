import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import type {
  AuditLogRecord,
  EmptyReason,
  IncidentRecord,
  MaintenanceRecord,
  ResourceActionDescriptor,
  ShiftRecord,
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

const pageStackStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  padding: "18px 24px 28px",
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "minmax(0, 1.7fr) minmax(320px, 1fr)",
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

function lifecycleTone(status: string) {
  if (status === "active" || status === "approved" || status === "completed") {
    return "success" as const;
  }
  if (
    status === "expired" ||
    status === "terminated" ||
    status === "revoked" ||
    status === "rejected"
  ) {
    return "danger" as const;
  }
  if (status === "none" || status === "missing") {
    return "neutral" as const;
  }
  return "warn" as const;
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
          "This vehicle has not been provisioned for the required operational surface yet.",
          "這台車尚未完成此營運模組所需的佈建。",
        ),
        tone: "warning",
      };
    case "fetch_failed":
      return {
        title: copy(locale, "Unable to load data", "資料載入失敗"),
        description: copy(
          locale,
          "The control-plane request failed before vehicle detail could be assembled.",
          "控制平面請求失敗，無法組裝車輛詳情。",
        ),
        tone: "danger",
      };
    case "permission_denied":
      return {
        title: copy(locale, "Permission denied", "權限不足"),
        description: copy(
          locale,
          "Your current role cannot access this vehicle surface.",
          "你目前的角色無法存取這個車輛頁面。",
        ),
        tone: "danger",
      };
    case "external_unavailable":
      return {
        title: copy(locale, "External system unavailable", "外部系統不可用"),
        description: copy(
          locale,
          "A dependent service is unavailable, so the vehicle snapshot is partial.",
          "依賴的外部系統目前不可用，因此車輛快照不完整。",
        ),
        tone: "warning",
      };
    case "filtered_empty":
      return {
        title: copy(locale, "No matching records", "沒有符合條件的資料"),
        description: copy(
          locale,
          "The section is working, but nothing matches the current slice.",
          "區塊本身可用，但目前切片條件下沒有符合資料。",
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

function createActionDescriptors(
  vehicle: VehicleRegistryRecord,
  binding: CurrentBinding | null,
  contracts: VehicleContractRecord[],
): ResourceActionDescriptor[] {
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
    {
      action: "review_dispatch_hold",
      enabled: vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0,
      riskLevel: "medium",
      ...(vehicle.supplyLifecycle.dispatch.blockedReasons.length === 0
        ? {
            disabledReasonCode: "dispatch_hold_clear",
          }
        : {}),
    },
  ];
}

function renderActionLink(
  action: ResourceActionDescriptor,
  locale: Locale,
  vehicleId: string,
  binding: CurrentBinding | null,
  contracts: VehicleContractRecord[],
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
        <Link href="/maintenance" style={actionLinkStyle}>
          {copy(locale, "Open maintenance board", "打開保修工作台")}
        </Link>
      );
    case "open_contract_reference":
      return contracts[0] ? (
        <Link href="/contracts" style={actionLinkStyle}>
          {copy(locale, "Open contract registry", "打開合約清單")}
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
          {copy(locale, "Open in platform-admin", "到 platform-admin 開啟")}
        </Link>
      );
    case "review_dispatch_hold":
      return (
        <Link href="/vehicles" style={actionLinkStyle}>
          {copy(locale, "Return to fleet watchlist", "回到車隊監看清單")}
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
    status: formatOpsCodeLabel(locale, record.status),
    scheduledAt: formatDateTime(locale, record.scheduledAt),
    detail: record.description,
  }));
}

function buildIncidentRows(
  locale: Locale,
  incidents: IncidentRecord[],
): TableRow[] {
  return incidents.map((incident) => ({
    key: incident.incidentId,
    incident: incident.incidentId,
    severity: formatOpsCodeLabel(locale, incident.severity),
    status: formatOpsCodeLabel(locale, incident.status),
    occurredAt: formatDateTime(locale, incident.occurredAt),
    detail: incident.title,
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
        {copy(locale, "Platform admin", "Platform Admin")}
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
          {renderEmptyState(forcedReason, locale)}
        </div>
      </>
    );
  }

  const vehiclesResult = await loadOptional<VehicleRegistryRecord[]>(() =>
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
    return (
      <>
        <PageHeader
          theme={theme}
          title={copy(locale, "Vehicle detail", "車輛詳情")}
          subtitle={vehicleId}
          actions={headerActions}
        />
        <div style={pageStackStyle}>
          {renderEmptyState(
            "no_data",
            locale,
            <Link href="/vehicles" style={actionLinkStyle}>
              {copy(locale, "Return to vehicle registry", "回到車輛名冊")}
            </Link>,
          )}
        </div>
      </>
    );
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

  const contracts = (contractsResult.data as VehicleContractRecord[])
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

  const actionDescriptors = createActionDescriptors(
    vehicle,
    currentBinding,
    contracts,
  );
  const overdueMaintenanceCount = (
    maintenanceResult.data as MaintenanceRecord[]
  ).filter((record) => record.status === "overdue").length;

  const maintenanceColumns: CanvasTableColumn<TableRow>[] = [
    {
      h: copy(locale, "Work order", "工單"),
      k: "workOrder",
      mono: true,
      w: 130,
    },
    { h: copy(locale, "Type", "類型"), k: "type", w: 120 },
    { h: copy(locale, "Status", "狀態"), k: "status", w: 120 },
    { h: copy(locale, "Scheduled", "排程"), k: "scheduledAt", w: 170 },
    { h: copy(locale, "Detail", "內容"), k: "detail" },
  ];
  const incidentColumns: CanvasTableColumn<TableRow>[] = [
    { h: copy(locale, "Incident", "事件"), k: "incident", mono: true, w: 140 },
    { h: copy(locale, "Severity", "嚴重度"), k: "severity", w: 120 },
    { h: copy(locale, "Status", "狀態"), k: "status", w: 120 },
    { h: copy(locale, "Occurred", "發生時間"), k: "occurredAt", w: 170 },
    { h: copy(locale, "Detail", "內容"), k: "detail" },
  ];
  const auditColumns: CanvasTableColumn<TableRow>[] = [
    { h: "Audit ID", k: "auditId", mono: true, w: 150 },
    { h: copy(locale, "Module", "模組"), k: "moduleName", w: 120 },
    { h: copy(locale, "Action", "動作"), k: "actionName", w: 170 },
    { h: copy(locale, "Actor", "執行者"), k: "actor", w: 160 },
    { h: copy(locale, "Created", "建立時間"), k: "createdAt", w: 170 },
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
            <span>{copy(locale, "Vehicle detail", "車輛詳情")}</span>
            <Pill theme={theme} tone={dispatchTone(vehicle)}>
              {vehicle.vehicleId}
            </Pill>
            <Pill
              theme={theme}
              tone={vehicle.dispatchableFlag ? "success" : "danger"}
            >
              {vehicle.dispatchableFlag
                ? copy(locale, "Dispatchable", "可派遣")
                : copy(locale, "Dispatch hold", "派遣暫停")}
            </Pill>
          </span>
        }
        subtitle={`${vehicle.plateNo} · ${vehicle.operatingArea} · T3 / 15s`}
        actions={headerActions}
      />
      <div style={pageStackStyle}>
        {vehicle.supplyLifecycle.offboarding.status !== "none" ? (
          <Banner
            theme={theme}
            tone={
              vehicle.supplyLifecycle.offboarding.status === "completed"
                ? "info"
                : "warn"
            }
            title={copy(
              locale,
              "Vehicle in offboarding flow",
              "車輛正在退場流程中",
            )}
            body={`${formatOpsCodeLabel(locale, vehicle.supplyLifecycle.offboarding.status)} · ${
              vehicle.supplyLifecycle.offboarding.reason ??
              copy(locale, "No reason provided", "未提供原因")
            }`}
          />
        ) : null}

        {overdueMaintenanceCount > 0 ? (
          <Banner
            theme={theme}
            tone="danger"
            title={copy(
              locale,
              "Overdue maintenance requires attention",
              "逾期保修需立即處理",
            )}
            body={copy(
              locale,
              `${overdueMaintenanceCount} maintenance records are overdue for this vehicle.`,
              `這台車有 ${overdueMaintenanceCount} 筆保修工單已逾期。`,
            )}
          />
        ) : null}

        <section style={heroGridStyle}>
          <Card
            theme={theme}
            title={copy(locale, "Vehicle summary", "車輛摘要")}
            subtitle={copy(
              locale,
              "Dispatch, compliance, contract, and audit context.",
              "派遣、合規、合約與稽核情境總覽。",
            )}
          >
            <div style={summaryGridStyle}>
              <div style={summaryTileStyle}>
                <div style={summaryLabelStyle}>
                  {copy(locale, "Dispatch block reasons", "派遣阻擋原因")}
                </div>
                <div style={summaryValueStyle}>
                  {vehicle.supplyLifecycle.dispatch.blockedReasons.length}
                </div>
                <div style={summaryNoteStyle}>
                  {vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0
                    ? vehicle.supplyLifecycle.dispatch.blockedReasons
                        .map((reason) => formatOpsCodeLabel(locale, reason))
                        .join(" / ")
                    : copy(
                        locale,
                        "No active dispatch hold.",
                        "目前沒有派遣阻擋。",
                      )}
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
                    copy(
                      locale,
                      "No active shift binding.",
                      "目前沒有進行中的班次綁定。",
                    )}
                </div>
              </div>
              <div style={summaryTileStyle}>
                <div style={summaryLabelStyle}>
                  {copy(locale, "Contract refs", "合約參照")}
                </div>
                <div style={summaryValueStyle}>{contracts.length}</div>
                <div style={summaryNoteStyle}>
                  {contracts[0]
                    ? `${contracts[0].contractId} · ${formatOpsCodeLabel(locale, contracts[0].lifecycleStatus)}`
                    : copy(locale, "No linked contract yet.", "尚未綁定合約。")}
                </div>
              </div>
              <div style={summaryTileStyle}>
                <div style={summaryLabelStyle}>
                  {copy(locale, "Recent incidents", "近期事件")}
                </div>
                <div style={summaryValueStyle}>{incidents.length}</div>
                <div style={summaryNoteStyle}>
                  {incidents[0]?.title ??
                    copy(
                      locale,
                      "No vehicle-linked incidents.",
                      "沒有與車輛相關的事件。",
                    )}
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
                    label: copy(locale, "Supported buckets", "服務桶"),
                    value: vehicle.supportedServiceBuckets.join(" · ") || "—",
                  },
                  {
                    label: copy(locale, "Dispatchable flag", "派遣旗標"),
                    value: formatOpsCodeLabel(
                      locale,
                      String(vehicle.dispatchableFlag),
                    ),
                  },
                  {
                    label: copy(locale, "Insurance status", "保險狀態"),
                    value: formatOpsCodeLabel(locale, vehicle.insuranceStatus),
                  },
                  {
                    label: copy(locale, "Updated at", "更新時間"),
                    value: formatDateTime(locale, vehicle.updatedAt),
                  },
                ]}
              />
            </div>
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Available actions", "可用動作")}
            subtitle={copy(
              locale,
              "Rendered from action descriptors instead of hard-coded role gates.",
              "由 action descriptor 驅動，不直接硬編角色按鈕。",
            )}
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
                      {formatOpsCodeLabel(locale, action.action)}
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
                      : copy(
                          locale,
                          "Operational surface ready.",
                          "此操作面可直接使用。",
                        )}
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
        </section>

        <section
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          }}
        >
          <Card
            theme={theme}
            title={copy(locale, "Driver binding", "司機綁定")}
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
              renderEmptyState("filtered_empty", locale)
            )}
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Regulatory profile", "法規與保單檔案")}
          >
            <DL
              theme={theme}
              cols={1}
              items={[
                {
                  label: copy(locale, "Insurance", "保險"),
                  value: policy
                    ? `${policy.policyNo} · ${policy.insurerName}`
                    : copy(
                        locale,
                        "No active policy file.",
                        "沒有有效保單檔案。",
                      ),
                },
                {
                  label: copy(locale, "Insurance expiry", "保單到期"),
                  value: formatDateTime(locale, policy?.endAt),
                },
                {
                  label: copy(locale, "Contract lifecycle", "合約生命週期"),
                  value: (
                    <span>
                      <Pill
                        theme={theme}
                        tone={lifecycleTone(
                          vehicle.supplyLifecycle.contract.lifecycleStatus,
                        )}
                      >
                        {formatOpsCodeLabel(
                          locale,
                          vehicle.supplyLifecycle.contract.lifecycleStatus,
                        )}
                      </Pill>
                    </span>
                  ),
                },
                {
                  label: copy(locale, "Exclusivity", "專屬合作"),
                  value: (
                    <span>
                      <Pill
                        theme={theme}
                        tone={lifecycleTone(
                          vehicle.supplyLifecycle.exclusivity.lifecycleStatus,
                        )}
                      >
                        {formatOpsCodeLabel(
                          locale,
                          vehicle.supplyLifecycle.exclusivity.lifecycleStatus,
                        )}
                      </Pill>
                    </span>
                  ),
                },
              ]}
            />
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Offboarding / debranding", "退場 / 去識別化")}
          >
            <DL
              theme={theme}
              cols={1}
              items={[
                {
                  label: copy(locale, "Offboarding status", "退場狀態"),
                  value: formatOpsCodeLabel(
                    locale,
                    vehicle.supplyLifecycle.offboarding.status,
                  ),
                },
                {
                  label: copy(locale, "Debranding", "去識別化"),
                  value: formatOpsCodeLabel(
                    locale,
                    vehicle.supplyLifecycle.offboarding.debrandingStatus,
                  ),
                },
                {
                  label: copy(locale, "Due at", "應完成時間"),
                  value: formatDateTime(
                    locale,
                    vehicle.supplyLifecycle.offboarding.debrandingDueAt,
                  ),
                },
                {
                  label: copy(locale, "Ticket", "工單"),
                  value:
                    vehicle.supplyLifecycle.offboarding.debrandingTicketId ??
                    "—",
                },
              ]}
            />
          </Card>
        </section>

        <Card
          theme={theme}
          title={copy(locale, "Contract references", "合約參照")}
          subtitle={copy(
            locale,
            "Read-only ops view. Mutation stays in platform-admin.",
            "Ops 端唯讀；變更仍在 platform-admin。",
          )}
        >
          {contracts.length > 0 ? (
            <DL
              theme={theme}
              cols={2}
              items={contracts.slice(0, 4).flatMap((contract) => [
                {
                  label: contract.contractId,
                  value: `${formatOpsCodeLabel(locale, contract.status)} · ${contract.serviceScope}`,
                },
                {
                  label: copy(locale, "Range", "期間"),
                  value: `${formatDateTime(locale, contract.startAt)} → ${formatDateTime(locale, contract.endAt)}`,
                },
              ])}
            />
          ) : (
            renderEmptyState("not_provisioned", locale)
          )}
        </Card>

        <Card
          theme={theme}
          title={copy(locale, "Maintenance", "保修")}
          subtitle={copy(
            locale,
            "Recent, scheduled, and overdue records tied to this vehicle.",
            "此車相關的近期、排程中、逾期工單。",
          )}
        >
          {maintenanceResult.error ? (
            renderEmptyState(maintenanceResult.reason ?? "fetch_failed", locale)
          ) : (maintenanceResult.data as MaintenanceRecord[]).length > 0 ? (
            <Table
              theme={theme}
              columns={maintenanceColumns}
              rows={buildMaintenanceRows(
                locale,
                maintenanceResult.data as MaintenanceRecord[],
              )}
            />
          ) : (
            renderEmptyState("no_data", locale)
          )}
        </Card>

        <section
          style={{
            display: "grid",
            gap: "16px",
            gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
          }}
        >
          <Card
            theme={theme}
            title={copy(locale, "Linked incidents", "關聯事件")}
          >
            {incidentsResult.error ? (
              renderEmptyState(incidentsResult.reason ?? "fetch_failed", locale)
            ) : incidents.length > 0 ? (
              <Table
                theme={theme}
                columns={incidentColumns}
                rows={buildIncidentRows(locale, incidents)}
              />
            ) : (
              renderEmptyState("filtered_empty", locale)
            )}
          </Card>

          <Card theme={theme} title={copy(locale, "Audit events", "稽核事件")}>
            {auditsResult.error ? (
              renderEmptyState(auditsResult.reason ?? "fetch_failed", locale)
            ) : audits.length > 0 ? (
              <Table
                theme={theme}
                columns={auditColumns}
                rows={buildAuditRows(locale, audits)}
              />
            ) : (
              renderEmptyState("external_unavailable", locale)
            )}
          </Card>
        </section>
      </div>
    </>
  );
}
