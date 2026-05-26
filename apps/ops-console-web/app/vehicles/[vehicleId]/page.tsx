import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { PageHeader, StatusChip } from "@drts/ui-web";

type VehicleDetailPageProps = {
  params: Promise<{
    vehicleId: string;
  }>;
};

const heroStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  marginBottom: "1rem",
};

const cardStyle: CSSProperties = {
  borderRadius: "1rem",
  border: "1px solid #e2e8f0",
  background: "#ffffff",
  padding: "1rem 1.125rem",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  marginBottom: "1rem",
};

const summaryCardStyle: CSSProperties = {
  ...cardStyle,
  display: "grid",
  gap: "0.35rem",
  background: "#f8fafc",
};

const sectionGridStyle: CSSProperties = {
  display: "grid",
  gap: "1rem",
  gridTemplateColumns: "minmax(0, 1.25fr) minmax(280px, 0.75fr)",
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 0.3rem",
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
};

const metaListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  marginTop: "0.75rem",
};

const metaPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.35rem 0.75rem",
  borderRadius: "999px",
  background: "#e2e8f0",
  color: "#0f172a",
  fontSize: "0.85rem",
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: "0.85rem",
};

const listStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  margin: 0,
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
};

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
  borderBottom: "1px solid #e2e8f0",
  padding: "0.75rem 0.5rem",
};

const tdStyle: CSSProperties = {
  padding: "0.85rem 0.5rem",
  borderBottom: "1px solid #e2e8f0",
  verticalAlign: "top",
  color: "#0f172a",
  fontSize: "0.95rem",
};

function copy(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

function formatDateTime(value: string | null, locale: "en" | "zh") {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-TW" : "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function lifecycleTone(status: string) {
  if (
    status === "active" ||
    status === "valid" ||
    status === "approved" ||
    status === "eligible"
  ) {
    return "success" as const;
  }
  if (
    status === "expired" ||
    status === "terminated" ||
    status === "revoked" ||
    status === "rejected" ||
    status === "completed"
  ) {
    return "danger" as const;
  }
  return "warning" as const;
}

function maintenanceTone(status: string) {
  if (status === "overdue") return "danger" as const;
  if (status === "scheduled" || status === "in_progress") {
    return "warning" as const;
  }
  return "neutral" as const;
}

export default async function VehicleDetailPage({
  params,
}: VehicleDetailPageProps) {
  const { vehicleId } = await params;
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);

  const [vehicles, maintenanceResponse] = await Promise.all([
    client.listVehicles(),
    client.listMaintenance(vehicleId),
  ]);

  const vehicle = vehicles.find(
    (candidate) => candidate.vehicleId === vehicleId,
  );
  if (!vehicle) {
    notFound();
  }

  const maintenanceRecords = maintenanceResponse.items ?? [];
  const openCount = maintenanceRecords.filter(
    (record) =>
      record.status === "scheduled" ||
      record.status === "in_progress" ||
      record.status === "overdue",
  ).length;

  return (
    <>
      <PageHeader
        title={copy(locale, "Vehicle Detail", "車輛詳情")}
        subtitle={copy(
          locale,
          `Dispatch, lifecycle, and maintenance context for ${vehicle.vehicleId}.`,
          `${vehicle.vehicleId} 的派遣、生命週期與維保脈絡。`,
        )}
      />

      <section style={heroStyle}>
        <div style={{ ...cardStyle, background: "#f8fafc" }}>
          <p style={eyebrowStyle}>
            {copy(locale, "Registry identity", "車籍識別")}
          </p>
          <h2 style={{ margin: 0 }}>{vehicle.plateNo}</h2>
          <p style={{ margin: "0.35rem 0 0", color: "#475569" }}>
            {vehicle.vehicleId} · {vehicle.operatingArea}
          </p>
          <div style={metaListStyle}>
            <StatusChip
              tone={vehicle.dispatchableFlag ? "success" : "warning"}
              authorityLabel={copy(locale, "dispatch", "派遣")}
              label={
                vehicle.dispatchableFlag
                  ? copy(locale, "Dispatchable", "可派車")
                  : copy(locale, "Blocked", "不可派車")
              }
            />
            <StatusChip
              tone={vehicle.exclusivityApproved ? "success" : "warning"}
              authorityLabel={copy(locale, "exclusivity", "專屬")}
              label={
                vehicle.exclusivityApproved
                  ? copy(locale, "Approved", "已核准")
                  : copy(locale, "Pending", "待審核")
              }
            />
            <span style={metaPillStyle}>
              {vehicle.supportedServiceBuckets.join(" · ")}
            </span>
          </div>
        </div>
      </section>

      <section style={summaryGridStyle}>
        <div style={summaryCardStyle}>
          <span style={eyebrowStyle}>
            {copy(locale, "Maintenance backlog", "維保積壓")}
          </span>
          <strong style={{ fontSize: "1.9rem" }}>
            {maintenanceRecords.length}
          </strong>
          <span style={{ color: "#475569" }}>
            {copy(
              locale,
              "Tracked records for this vehicle",
              "此車輛的維保紀錄數",
            )}
          </span>
        </div>
        <div style={summaryCardStyle}>
          <span style={eyebrowStyle}>
            {copy(locale, "Open work", "進行中工單")}
          </span>
          <strong style={{ fontSize: "1.9rem" }}>{openCount}</strong>
          <span style={{ color: "#475569" }}>
            {copy(
              locale,
              "Scheduled, in-progress, or overdue",
              "已排程、保修中或逾期",
            )}
          </span>
        </div>
        <div style={summaryCardStyle}>
          <span style={eyebrowStyle}>
            {copy(locale, "Blocked reasons", "阻塞原因")}
          </span>
          <strong style={{ fontSize: "1.9rem" }}>
            {vehicle.supplyLifecycle.dispatch.blockedReasons.length}
          </strong>
          <span style={{ color: "#475569" }}>
            {vehicle.supplyLifecycle.dispatch.blockedReasons.length > 0
              ? vehicle.supplyLifecycle.dispatch.blockedReasons
                  .map((reason) => formatOpsCodeLabel(locale, reason))
                  .join(" / ")
              : copy(locale, "No active dispatch block", "目前沒有派遣阻塞")}
          </span>
        </div>
        <div style={summaryCardStyle}>
          <span style={eyebrowStyle}>
            {copy(locale, "Last trace", "最後事件")}
          </span>
          <strong style={{ fontSize: "1.9rem" }}>
            {vehicle.supplyLifecycle.lastTrace
              ? formatOpsCodeLabel(
                  locale,
                  vehicle.supplyLifecycle.lastTrace.status,
                )
              : "—"}
          </strong>
          <span style={{ color: "#475569" }}>
            {formatDateTime(
              vehicle.supplyLifecycle.lastTrace?.occurredAt ?? null,
              locale,
            )}
          </span>
        </div>
      </section>

      <section style={sectionGridStyle}>
        <div style={stackStyle}>
          <div style={cardStyle}>
            <p style={eyebrowStyle}>
              {copy(locale, "Maintenance records", "維保紀錄")}
            </p>
            <h3 style={{ marginTop: 0 }}>
              {copy(locale, "Recent and scheduled work", "近期與排定工單")}
            </h3>
            {maintenanceRecords.length === 0 ? (
              <p style={{ margin: 0, color: "#475569" }}>
                {copy(
                  locale,
                  "No maintenance records found for this vehicle.",
                  "這台車目前沒有維保紀錄。",
                )}
              </p>
            ) : (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>{copy(locale, "WO", "工單")}</th>
                    <th style={thStyle}>{copy(locale, "Status", "狀態")}</th>
                    <th style={thStyle}>{copy(locale, "Schedule", "排定")}</th>
                    <th style={thStyle}>
                      {copy(locale, "Technician", "技師")}
                    </th>
                    <th style={thStyle}>{copy(locale, "Action", "操作")}</th>
                  </tr>
                </thead>
                <tbody>
                  {maintenanceRecords.map((record) => (
                    <tr key={record.maintenanceId}>
                      <td style={tdStyle}>
                        <strong>{record.maintenanceId}</strong>
                        <div style={{ color: "#64748b", marginTop: "0.2rem" }}>
                          {record.description}
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <StatusChip
                          tone={maintenanceTone(record.status)}
                          authorityLabel={copy(locale, "maintenance", "維保")}
                          label={formatOpsCodeLabel(locale, record.status)}
                        />
                      </td>
                      <td style={tdStyle}>
                        {formatDateTime(record.scheduledAt, locale)}
                      </td>
                      <td style={tdStyle}>{record.technician ?? "—"}</td>
                      <td style={tdStyle}>
                        <Link
                          href={`/maintenance?vehicleId=${encodeURIComponent(vehicle.vehicleId)}`}
                        >
                          {copy(locale, "Open in maintenance", "在維保頁開啟")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div style={stackStyle}>
          <div style={cardStyle}>
            <p style={eyebrowStyle}>
              {copy(locale, "Lifecycle gates", "生命週期閘門")}
            </p>
            <dl style={listStyle}>
              <div>
                <dt style={eyebrowStyle}>{copy(locale, "Contract", "合約")}</dt>
                <dd style={{ margin: 0 }}>
                  <StatusChip
                    tone={lifecycleTone(
                      vehicle.supplyLifecycle.contract.lifecycleStatus,
                    )}
                    authorityLabel={copy(locale, "contract", "合約")}
                    label={formatOpsCodeLabel(
                      locale,
                      vehicle.supplyLifecycle.contract.lifecycleStatus,
                    )}
                  />
                </dd>
              </div>
              <div>
                <dt style={eyebrowStyle}>
                  {copy(locale, "Insurance", "保險")}
                </dt>
                <dd style={{ margin: 0 }}>
                  <StatusChip
                    tone={lifecycleTone(
                      vehicle.supplyLifecycle.insurance.lifecycleStatus,
                    )}
                    authorityLabel={copy(locale, "insurance", "保險")}
                    label={formatOpsCodeLabel(
                      locale,
                      vehicle.supplyLifecycle.insurance.lifecycleStatus,
                    )}
                  />
                </dd>
              </div>
              <div>
                <dt style={eyebrowStyle}>
                  {copy(locale, "Offboarding", "退場")}
                </dt>
                <dd style={{ margin: 0 }}>
                  <StatusChip
                    tone={lifecycleTone(
                      vehicle.supplyLifecycle.offboarding.status,
                    )}
                    authorityLabel={copy(locale, "offboarding", "退場")}
                    label={formatOpsCodeLabel(
                      locale,
                      vehicle.supplyLifecycle.offboarding.status,
                    )}
                  />
                </dd>
              </div>
            </dl>
          </div>

          <div style={cardStyle}>
            <p style={eyebrowStyle}>
              {copy(locale, "Trace and exits", "事件與出口")}
            </p>
            <p style={{ margin: "0 0 0.75rem", color: "#475569" }}>
              {vehicle.supplyLifecycle.lastTrace?.message ??
                copy(
                  locale,
                  "No lifecycle trace recorded.",
                  "目前沒有生命週期事件。",
                )}
            </p>
            <div style={stackStyle}>
              <Link href="/vehicles">
                {copy(locale, "Back to registry", "返回車籍清單")}
              </Link>
              <Link
                href={`/maintenance?vehicleId=${encodeURIComponent(vehicle.vehicleId)}`}
              >
                {copy(locale, "Open maintenance history", "開啟維保歷史")}
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
