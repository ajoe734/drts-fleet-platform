import Link from "next/link";
import { notFound } from "next/navigation";
import type {
  IncidentRecord,
  ShiftRecord,
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
  CanvasIcon,
  CanvasPageHeader as PageHeader,
  CanvasPill as Pill,
  CanvasTable as Table,
  buildCanvasTheme,
  type CanvasTableColumn,
  type CanvasTone,
} from "@drts/ui-web";

type VehicleDetailPageProps = {
  params: Promise<{
    vehicleId: string;
  }>;
};

const theme = buildCanvasTheme({
  surface: "ops",
  dark: true,
  density: "compact",
});

const REFRESH_INTERVAL_MS = 15_000;
const PLATFORM_ADMIN_BASE_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ??
  "https://platform-admin.drts.io";

const pageBodyStyle = {
  padding: 24,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(320px, 1fr)",
  gap: 16,
};

const stackStyle = {
  display: "grid",
  gap: 16,
};

const infoGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};

const infoItemStyle = {
  padding: "10px 12px",
  borderRadius: 10,
  background: theme.surfaceLo,
  border: `1px solid ${theme.border}`,
  display: "grid",
  gap: 4,
};

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

type ContractRow = Record<string, unknown> & {
  contractId: string;
  partner: string;
  scope: string;
  status: string;
  term: string;
};

type MaintenanceRow = Record<string, unknown> & {
  maintenanceId: string;
  typeLabel: string;
  description: string;
  statusLabel: string;
  statusTone: CanvasTone;
  scheduledAtLabel: string;
};

type IncidentRow = Record<string, unknown> & {
  incidentId: string;
  title: string;
  severityLabel: string;
  severityTone: CanvasTone;
  statusLabel: string;
  occurredAtLabel: string;
};

type AuditRow = Record<string, unknown> & {
  auditId: string;
  actionName: string;
  actor: string;
  createdAtLabel: string;
};

function copy(locale: Locale, en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

async function loadOrCapture<T>(
  loader: () => Promise<T>,
): Promise<LoadResult<T>> {
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
  if (!value) return copy(locale, "n/a", "未設定");
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

function getVehicleStatusDisplay(
  locale: Locale,
  vehicle: VehicleRegistryRecord,
  overdue: boolean,
) {
  if (vehicle.supplyLifecycle.offboarding.status !== "none") {
    return {
      label: copy(locale, "offboarding", "退場中"),
      tone: "warn" as const,
    };
  }
  if (!vehicle.dispatchableFlag) {
    return {
      label: copy(locale, "offline", "離線"),
      tone: "danger" as const,
    };
  }
  if (overdue || vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0) {
    return {
      label: copy(locale, "attention", "需留意"),
      tone: "warn" as const,
    };
  }
  return {
    label: copy(locale, "dispatchable", "可派"),
    tone: "success" as const,
  };
}

function getIncidentTone(incident: IncidentRecord): CanvasTone {
  if (incident.severity === "critical") return "danger";
  if (incident.severity === "high") return "warn";
  return "info";
}

export default async function VehicleDetailPage({
  params,
}: VehicleDetailPageProps) {
  const [{ vehicleId }, client, locale] = await Promise.all([
    params,
    getServerOpsClient(),
    getServerLocale(),
  ]);

  const [
    vehiclesResult,
    driversResult,
    shiftsResult,
    maintenanceResult,
    contractsResult,
    incidentsResult,
    auditResult,
  ] = await Promise.all([
    loadOrCapture(() => client.listVehicles()),
    loadOrCapture(() => client.listDrivers()),
    loadOrCapture(() => client.listShifts()),
    loadOrCapture(() => client.listMaintenance(vehicleId)),
    loadOrCapture(() => client.listContracts()),
    loadOrCapture(() => client.listIncidents()),
    loadOrCapture(() => client.listAuditLogs()),
  ]);

  if (vehiclesResult.error) {
    return (
      <>
        <OpsAutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
        <PageHeader
          theme={theme}
          title={copy(locale, "Vehicle detail", "車輛詳情")}
          subtitle={copy(
            locale,
            "Vehicle registry unavailable",
            "車輛 registry 目前不可用",
          )}
          actions={
            <Link href="/vehicles" style={{ textDecoration: "none" }}>
              <Btn theme={theme} variant="secondary" size="sm">
                {copy(locale, "Back to vehicles", "返回車輛列表")}
              </Btn>
            </Link>
          }
        />
        <div style={{ padding: 24 }}>
          <Banner
            theme={theme}
            tone="danger"
            icon={<CanvasIcon name="health" size={16} />}
            title={copy(
              locale,
              "Failed to load vehicle registry",
              "車輛 registry 載入失敗",
            )}
            body={vehiclesResult.error}
          />
        </div>
      </>
    );
  }

  const vehicle = (vehiclesResult.data ?? []).find(
    (entry) => entry.vehicleId === vehicleId,
  );
  if (!vehicle) {
    notFound();
  }

  const activeShift = (shiftsResult.data ?? []).find(
    (shift): shift is ShiftRecord & { vehicleId: string } =>
      shift.status === "active" && shift.vehicleId === vehicle.vehicleId,
  );
  const currentDriver = activeShift
    ? (driversResult.data ?? []).find(
        (driver) => driver.driverId === activeShift.driverId,
      )
    : null;
  const maintenanceRows = (maintenanceResult.data ?? [])
    .slice()
    .sort((a, b) =>
      (b.scheduledAt ?? b.updatedAt).localeCompare(
        a.scheduledAt ?? a.updatedAt,
      ),
    )
    .map<MaintenanceRow>((record) => ({
      maintenanceId: record.maintenanceId,
      typeLabel: formatOpsCodeLabel(locale, record.type),
      description: record.description,
      statusLabel: formatOpsCodeLabel(locale, record.status),
      statusTone:
        record.status === "overdue"
          ? "danger"
          : record.status === "completed"
            ? "success"
            : "warn",
      scheduledAtLabel: formatDateTime(
        record.scheduledAt ?? record.updatedAt,
        locale,
      ),
    }));
  const contractRows = (contractsResult.data ?? [])
    .filter((contract) => contract.vehicleId === vehicle.vehicleId)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map<ContractRow>((contract) => ({
      contractId: contract.contractId,
      partner: `${contract.partnerType} · ${contract.partnerId}`,
      scope: formatOpsCodeLabel(locale, contract.serviceScope),
      status: formatOpsCodeLabel(locale, contract.lifecycleStatus),
      term: `${formatDateOnly(contract.startAt, locale)} - ${formatDateOnly(contract.endAt, locale)}`,
    }));
  const incidentRows = (incidentsResult.data ?? [])
    .filter((incident) => incident.relatedVehicleId === vehicle.vehicleId)
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map<IncidentRow>((incident) => ({
      incidentId: incident.incidentId,
      title: incident.title,
      severityLabel: formatOpsCodeLabel(locale, incident.severity),
      severityTone: getIncidentTone(incident),
      statusLabel: formatOpsCodeLabel(locale, incident.status),
      occurredAtLabel: formatDateTime(
        incident.occurredAt ?? incident.updatedAt,
        locale,
      ),
    }));
  const auditRows = (auditResult.data ?? [])
    .filter(
      (audit) =>
        audit.resourceId === vehicle.vehicleId ||
        (audit.resourceType === "vehicle" &&
          audit.resourceId === vehicle.vehicleId),
    )
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)
    .map<AuditRow>((audit) => ({
      auditId: audit.auditId,
      actionName: audit.actionName,
      actor: audit.actorId ?? audit.actorType,
      createdAtLabel: formatDateTime(audit.createdAt, locale),
    }));

  const overdueMaintenance = maintenanceRows.some(
    (record) => record.statusTone === "danger",
  );
  const status = getVehicleStatusDisplay(locale, vehicle, overdueMaintenance);
  const degradedMessages = [
    driversResult.error
      ? copy(
          locale,
          `Driver binding degraded: ${driversResult.error}`,
          `司機綁定資料降級：${driversResult.error}`,
        )
      : null,
    shiftsResult.error
      ? copy(
          locale,
          `Shift linkage degraded: ${shiftsResult.error}`,
          `班次連結降級：${shiftsResult.error}`,
        )
      : null,
    maintenanceResult.error
      ? copy(
          locale,
          `Maintenance degraded: ${maintenanceResult.error}`,
          `保修資料降級：${maintenanceResult.error}`,
        )
      : null,
    contractsResult.error
      ? copy(
          locale,
          `Contract references degraded: ${contractsResult.error}`,
          `合約參照降級：${contractsResult.error}`,
        )
      : null,
    incidentsResult.error
      ? copy(
          locale,
          `Incident linkage degraded: ${incidentsResult.error}`,
          `事故連結降級：${incidentsResult.error}`,
        )
      : null,
    auditResult.error
      ? copy(
          locale,
          `Audit subset degraded: ${auditResult.error}`,
          `稽核子集降級：${auditResult.error}`,
        )
      : null,
  ].filter(Boolean) as string[];

  const maintenanceColumns: CanvasTableColumn<MaintenanceRow>[] = [
    { h: "WO", w: 108, r: (row) => row.maintenanceId },
    { h: "TYPE", w: 148, r: (row) => row.typeLabel },
    { h: "DESCRIPTION", w: 240, r: (row) => row.description },
    {
      h: "STATUS",
      w: 132,
      r: (row) => (
        <Pill theme={theme} tone={row.statusTone} dot>
          {row.statusLabel}
        </Pill>
      ),
    },
    { h: "SCHEDULED", w: 150, r: (row) => row.scheduledAtLabel },
  ];
  const contractColumns: CanvasTableColumn<ContractRow>[] = [
    { h: "CONTRACT", w: 120, r: (row) => row.contractId },
    { h: "PARTNER", w: 180, r: (row) => row.partner },
    { h: "SCOPE", w: 140, r: (row) => row.scope },
    { h: "STATUS", w: 120, r: (row) => row.status },
    { h: "TERM", w: 180, r: (row) => row.term },
  ];
  const incidentColumns: CanvasTableColumn<IncidentRow>[] = [
    {
      h: "INCIDENT",
      w: 164,
      r: (row) => (
        <Link
          href={`/incidents/${encodeURIComponent(row.incidentId)}`}
          style={{ color: theme.accent, textDecoration: "none" }}
        >
          {row.incidentId}
        </Link>
      ),
    },
    { h: "TITLE", w: 220, r: (row) => row.title },
    {
      h: "SEVERITY",
      w: 124,
      r: (row) => (
        <Pill theme={theme} tone={row.severityTone} dot>
          {row.severityLabel}
        </Pill>
      ),
    },
    { h: "STATUS", w: 124, r: (row) => row.statusLabel },
    { h: "AT", w: 150, r: (row) => row.occurredAtLabel },
  ];
  const auditColumns: CanvasTableColumn<AuditRow>[] = [
    { h: "AUDIT", w: 130, r: (row) => row.auditId },
    { h: "ACTION", w: 180, r: (row) => row.actionName },
    { h: "ACTOR", w: 150, r: (row) => row.actor },
    { h: "AT", w: 150, r: (row) => row.createdAtLabel },
  ];

  return (
    <>
      <OpsAutoRefresh intervalMs={REFRESH_INTERVAL_MS} />
      <PageHeader
        theme={theme}
        title={
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 10 }}
          >
            {vehicle.plateNo}
            <Pill theme={theme} tone={status.tone} dot>
              {status.label}
            </Pill>
            {vehicle.supplyLifecycle.offboarding.status !== "none" ? (
              <Pill theme={theme} tone="warn">
                {copy(locale, "offboarding", "退場中")}
              </Pill>
            ) : null}
          </span>
        }
        subtitle={`${vehicle.vehicleId} · ${formatOpsCodeLabel(
          locale,
          vehicle.supportedServiceBuckets[0] ?? "standard_taxi",
        )}`}
        actions={
          <>
            <Pill theme={theme} tone="info">
              {copy(locale, "T3 · 15s refresh", "T3 · 15 秒刷新")}
            </Pill>
            <Link href="/vehicles" style={{ textDecoration: "none" }}>
              <Btn theme={theme} variant="secondary" size="sm">
                {copy(locale, "Back to vehicles", "返回車輛列表")}
              </Btn>
            </Link>
            <Link
              href={`${PLATFORM_ADMIN_BASE_URL}/fleet?vehicleId=${encodeURIComponent(vehicle.vehicleId)}`}
              target="_blank"
              style={{ textDecoration: "none" }}
            >
              <Btn theme={theme} variant="ghost" size="sm" icon="ext">
                {copy(locale, "Platform Admin", "Platform Admin")}
              </Btn>
            </Link>
          </>
        }
      />

      <div style={pageBodyStyle}>
        <div style={stackStyle}>
          {vehicle.supplyLifecycle.offboarding.status !== "none" ? (
            <Banner
              theme={theme}
              tone="warn"
              icon={<CanvasIcon name="warn" size={16} />}
              title={copy(
                locale,
                "Vehicle is in offboarding workflow",
                "車輛已進入退場流程",
              )}
              body={`${formatOpsCodeLabel(
                locale,
                vehicle.supplyLifecycle.offboarding.status,
              )} · ${formatOpsCodeLabel(
                locale,
                vehicle.supplyLifecycle.offboarding.debrandingStatus,
              )} · ${copy(locale, "debrand due", "debrand 截止")} ${formatDateOnly(
                vehicle.supplyLifecycle.offboarding.debrandingDueAt,
                locale,
              )}`}
            />
          ) : null}

          {degradedMessages.length > 0 ? (
            <Banner
              theme={theme}
              tone="warn"
              icon={<CanvasIcon name="health" size={16} />}
              title={copy(locale, "Detail page degraded", "詳情頁部分降級")}
              body={degradedMessages.join(" · ")}
            />
          ) : null}

          <Card
            theme={theme}
            title={copy(locale, "Regulatory profile", "監管與供給檔案")}
            subtitle={copy(
              locale,
              "Dispatchability, insurance, contract, and offboarding state.",
              "可派遣、保險、合約與退場狀態。",
            )}
          >
            <div style={infoGridStyle}>
              <div style={infoItemStyle}>
                <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  PLATE
                </span>
                <strong>{vehicle.plateNo}</strong>
              </div>
              <div style={infoItemStyle}>
                <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  TYPE
                </span>
                <strong>
                  {formatOpsCodeLabel(
                    locale,
                    vehicle.supportedServiceBuckets[0] ?? "standard_taxi",
                  )}
                </strong>
              </div>
              <div style={infoItemStyle}>
                <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  {copy(locale, "Dispatchable", "可派遣")}
                </span>
                <strong>
                  {vehicle.dispatchableFlag
                    ? copy(locale, "yes", "是")
                    : copy(locale, "no", "否")}
                </strong>
              </div>
              <div style={infoItemStyle}>
                <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  LAST SEEN
                </span>
                <strong>{formatDateTime(vehicle.updatedAt, locale)}</strong>
              </div>
              <div style={infoItemStyle}>
                <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  {copy(locale, "Insurance expiry", "保險到期")}
                </span>
                <strong>
                  {formatDateOnly(
                    vehicle.supplyLifecycle.insurance.endAt,
                    locale,
                  )}
                </strong>
              </div>
              <div style={infoItemStyle}>
                <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  {copy(locale, "Contract", "合約")}
                </span>
                <strong>
                  {vehicle.supplyLifecycle.contract.contractId ??
                    copy(locale, "No contract", "無合約")}
                </strong>
              </div>
              <div style={infoItemStyle}>
                <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  {copy(locale, "Dispatch blocks", "派遣阻塞")}
                </span>
                <strong>
                  {vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0
                    ? vehicle.supplyLifecycle.dispatch.blockedReasons
                        .map((reason) => formatOpsCodeLabel(locale, reason))
                        .join(" · ")
                    : copy(locale, "clear", "正常")}
                </strong>
              </div>
              <div style={infoItemStyle}>
                <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  {copy(locale, "Debrand due", "debrand 截止")}
                </span>
                <strong>
                  {formatDateOnly(
                    vehicle.supplyLifecycle.offboarding.debrandingDueAt,
                    locale,
                  )}
                </strong>
              </div>
            </div>
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Maintenance records", "保修紀錄")}
            subtitle={copy(
              locale,
              "Recent + scheduled + overdue for this vehicle.",
              "此車輛的近期、排定與逾期保修。",
            )}
          >
            {maintenanceRows.length > 0 ? (
              <Table
                theme={theme}
                columns={maintenanceColumns}
                rows={maintenanceRows}
              />
            ) : (
              <Banner
                theme={theme}
                tone="info"
                icon={<CanvasIcon name="fleet" size={16} />}
                title={copy(
                  locale,
                  "No maintenance records",
                  "目前沒有保修紀錄",
                )}
                body={copy(
                  locale,
                  "This vehicle has no scheduled or historical maintenance rows yet.",
                  "此車輛目前沒有排定或歷史保修資料。",
                )}
              />
            )}
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Contract references", "合約參照")}
            subtitle={copy(
              locale,
              "Read-only ops view of linked contract rows.",
              "營運端對應合約的唯讀視圖。",
            )}
          >
            {contractRows.length > 0 ? (
              <Table
                theme={theme}
                columns={contractColumns}
                rows={contractRows}
              />
            ) : (
              <Banner
                theme={theme}
                tone="info"
                icon={<CanvasIcon name="audit" size={16} />}
                title={copy(locale, "No linked contracts", "目前沒有關聯合約")}
                body={copy(
                  locale,
                  "No contract rows were returned for this vehicle.",
                  "此車輛目前沒有回傳任何合約紀錄。",
                )}
              />
            )}
          </Card>
        </div>

        <div style={stackStyle}>
          <Card
            theme={theme}
            title={copy(locale, "Current driver binding", "目前司機綁定")}
            subtitle={copy(
              locale,
              "Active shift link from vehicle to driver.",
              "透過當班班次建立的車輛到司機連結。",
            )}
          >
            {currentDriver ? (
              <div style={infoItemStyle}>
                <Link
                  href={`/drivers/${encodeURIComponent(currentDriver.driverId)}`}
                  style={{
                    color: theme.accent,
                    textDecoration: "none",
                    fontWeight: 700,
                  }}
                >
                  {currentDriver.name}
                </Link>
                <span style={{ color: theme.textMuted, fontSize: 11.5 }}>
                  {currentDriver.driverId} ·{" "}
                  {formatOpsCodeLabel(locale, currentDriver.workState)}
                </span>
              </div>
            ) : (
              <Banner
                theme={theme}
                tone="info"
                icon={<CanvasIcon name="users" size={16} />}
                title={copy(
                  locale,
                  "No active driver binding",
                  "目前沒有當班司機",
                )}
                body={copy(
                  locale,
                  "This vehicle is not attached to an active shift right now.",
                  "此車輛目前沒有綁定到當班班次。",
                )}
              />
            )}
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Linked incidents", "關聯事故")}
            subtitle={copy(
              locale,
              "Recent incident linkage for this vehicle.",
              "此車輛近期的事故關聯。",
            )}
          >
            {incidentRows.length > 0 ? (
              <Table
                theme={theme}
                columns={incidentColumns}
                rows={incidentRows}
              />
            ) : (
              <Banner
                theme={theme}
                tone="info"
                icon={<CanvasIcon name="health" size={16} />}
                title={copy(locale, "No linked incidents", "目前沒有關聯事故")}
                body={copy(
                  locale,
                  "No incident rows reference this vehicle.",
                  "目前沒有事故資料引用這台車。",
                )}
              />
            )}
          </Card>

          <Card
            theme={theme}
            title={copy(locale, "Audit subset", "稽核子集")}
            subtitle={copy(
              locale,
              "Latest vehicle-scoped audit entries.",
              "最新的車輛範圍稽核事件。",
            )}
          >
            {auditRows.length > 0 ? (
              <Table theme={theme} columns={auditColumns} rows={auditRows} />
            ) : (
              <Banner
                theme={theme}
                tone="info"
                icon={<CanvasIcon name="audit" size={16} />}
                title={copy(locale, "No audit entries", "目前沒有稽核事件")}
                body={copy(
                  locale,
                  "No audit log rows matched this vehicle ID.",
                  "目前沒有符合此 vehicle ID 的稽核紀錄。",
                )}
              />
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
