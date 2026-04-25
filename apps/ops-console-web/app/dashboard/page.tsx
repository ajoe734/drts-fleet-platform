import Link from "next/link";
import type {
  DispatchJobRecord,
  DriverRegistryRecord,
  DriverStatementRecord,
  DriverTaskRecord,
  IncidentRecord,
  MaintenanceRecord,
  OwnedOrderRecord,
  ReportJobRecord,
  ShiftRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import {
  buildDashboardTrend,
  buildDispatchInsights,
  buildOperationsOverview,
  buildRevenueInsights,
  formatCompactNumber,
  formatMinorCurrency,
} from "@/lib/ops-analytics";
import { PageHeader } from "@drts/ui-web";
import { StatCard } from "@drts/ui-web";
import { Card, CardHeader, CardBody } from "@drts/ui-web";

type IdentitySummary = { realm?: string; actorType?: string } | null;
type HealthPayload = {
  service: string;
  status: string;
  mode: string;
  execution_mode: string;
  timestamp: string;
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

export default async function DashboardPage() {
  const client = getOpsClient();
  const locale = await getServerLocale();
  const [
    identity,
    health,
    orders,
    dispatchJobs,
    driverTasks,
    vehicles,
    drivers,
    shifts,
    incidents,
    maintenance,
    reportJobs,
    driverStatements,
  ] = await Promise.all([
    resolveOrFallback<IdentitySummary>(
      () => client.getIdentityContext() as Promise<IdentitySummary>,
      null,
    ),
    resolveOrFallback(() => client.get<HealthPayload>("/api/health"), {
      service: "api",
      status: "degraded",
      mode: "unknown",
      execution_mode: "unknown",
      timestamp: new Date().toISOString(),
    }),
    resolveOrFallback(() => client.listOrders(), [] as OwnedOrderRecord[]),
    resolveOrFallback(
      () => client.listDispatchJobs(),
      [] as DispatchJobRecord[],
    ),
    resolveOrFallback(() => client.listDriverTasks(), [] as DriverTaskRecord[]),
    resolveOrFallback(
      () => client.listVehicles(),
      [] as VehicleRegistryRecord[],
    ),
    resolveOrFallback(() => client.listDrivers(), [] as DriverRegistryRecord[]),
    resolveOrFallback(() => client.listShifts(), [] as ShiftRecord[]),
    resolveOrFallback(() => client.listIncidents(), [] as IncidentRecord[]),
    resolveOrFallback(
      () => client.listMaintenance(),
      [] as MaintenanceRecord[],
    ),
    resolveOrFallback(() => client.listReportJobs(), [] as ReportJobRecord[]),
    resolveOrFallback(
      () => client.listDriverStatements(),
      [] as DriverStatementRecord[],
    ),
  ]);

  const dispatch = buildDispatchInsights(orders, dispatchJobs);
  const operations = buildOperationsOverview({
    vehicles,
    drivers,
    shifts,
    incidents,
    maintenance,
    reportJobs,
  });
  const todayRevenue = buildRevenueInsights(
    orders,
    driverTasks,
    driverStatements,
    {
      period: "today",
      serviceBucket: "all",
      vehicleId: "all",
    },
  );
  const trend = buildDashboardTrend(orders, driverTasks, incidents);
  const maxTrips = Math.max(1, ...trend.map((p) => p.completedTrips));
  const actionItems = [
    dispatch.redispatchOrders > 0
      ? t("dashboard.exceptions.redispatch", locale, {
          count: dispatch.redispatchOrders,
        })
      : null,
    operations.openIncidents > 0
      ? t("dashboard.exceptions.incidents", locale, {
          count: operations.openIncidents,
        })
      : null,
    operations.overdueMaintenance > 0
      ? t("dashboard.exceptions.maintenance", locale, {
          count: operations.overdueMaintenance,
        })
      : null,
    operations.failedReports > 0
      ? t("dashboard.exceptions.reports", locale, {
          count: operations.failedReports,
        })
      : null,
  ].filter(Boolean) as string[];

  const quickLinks: [string, string][] = [
    ["/dispatch", t("dashboard.quicklink.dispatch", locale)],
    ["/revenue", t("dashboard.quicklink.revenue", locale)],
    ["/incidents", t("dashboard.quicklink.incidents", locale)],
    ["/maintenance", t("dashboard.quicklink.maintenance", locale)],
    ["/reports", t("dashboard.quicklink.reports", locale)],
  ];

  return (
    <>
      <PageHeader
        title={t("dashboard.title", locale)}
        subtitle={t("dashboard.subtitle", locale)}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <StatCard
          label={t("dashboard.todayRevenue", locale)}
          value={formatMinorCurrency(todayRevenue.totalRevenueMinor)}
          sub={t("dashboard.todayRevenueSub", locale, {
            trips: formatCompactNumber(todayRevenue.completedTrips),
          })}
          accent="#15803d"
        />
        <StatCard
          label={t("dashboard.queueDepth", locale)}
          value={formatCompactNumber(dispatch.queueDepth)}
          sub={
            dispatch.averageEtaMinutes
              ? t("dashboard.queueDepthSub", locale, {
                  eta: dispatch.averageEtaMinutes,
                })
              : t("dashboard.queueDepthSubPending", locale)
          }
          accent="#1d4ed8"
        />
        <StatCard
          label={t("dashboard.activeOrders", locale)}
          value={formatCompactNumber(dispatch.activeOrders)}
          sub={t("dashboard.activeOrdersSub", locale)}
          accent="#7c3aed"
        />
        <StatCard
          label={t("dashboard.dispatchableVehicles", locale)}
          value={formatCompactNumber(operations.dispatchableVehicles)}
          sub={t("dashboard.dispatchableVehiclesSub", locale, {
            count: operations.offlineVehicles,
          })}
          accent="#b45309"
        />
        <StatCard
          label={t("dashboard.onlineDrivers", locale)}
          value={formatCompactNumber(operations.onlineDrivers)}
          sub={t("dashboard.onlineDriversSub", locale)}
          accent="#0891b2"
        />
        <StatCard
          label={t("dashboard.openIncidents", locale)}
          value={formatCompactNumber(operations.openIncidents)}
          sub={t("dashboard.openIncidentsSub", locale, {
            count: operations.overdueMaintenance,
          })}
          accent="#dc2626"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 300px",
          gap: "20px",
          marginBottom: "24px",
        }}
      >
        <Card>
          <CardHeader>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#64748b",
                marginBottom: "2px",
              }}
            >
              {t("dashboard.trend.title", locale)}
            </div>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              {t("dashboard.trend.subtitle", locale)}
            </div>
          </CardHeader>
          <CardBody>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "8px",
                alignItems: "end",
                minHeight: "120px",
              }}
            >
              {trend.map((point) => (
                <div
                  key={point.date}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "40px",
                      height: `${Math.max(12, Math.round((point.completedTrips / maxTrips) * 80))}px`,
                      background: "linear-gradient(180deg, #3b82f6, #06b6d4)",
                      borderRadius: "4px 4px 2px 2px",
                    }}
                    title={`${point.label}: ${point.completedTrips} trips, ${formatMinorCurrency(point.revenueMinor)}`}
                  />
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: "#0f172a",
                    }}
                  >
                    {point.completedTrips}
                  </span>
                  <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                    {point.label}
                  </span>
                  <span style={{ fontSize: "10px", color: "#cbd5e1" }}>
                    {point.createdOrders} new
                  </span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div
              style={{
                fontSize: "11px",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "#64748b",
                marginBottom: "2px",
              }}
            >
              {t("dashboard.exceptions.title", locale)}
            </div>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              {t("dashboard.exceptions.subtitle", locale)}
            </div>
          </CardHeader>
          <CardBody>
            {actionItems.length > 0 ? (
              <ul
                style={{
                  margin: 0,
                  paddingLeft: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                }}
              >
                {actionItems.map((item) => (
                  <li
                    key={item}
                    style={{ fontSize: "13.5px", color: "#dc2626" }}
                  >
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p style={{ margin: 0, fontSize: "13.5px", color: "#94a3b8" }}>
                {t("dashboard.exceptions.none", locale)}
              </p>
            )}
            <div
              style={{
                marginTop: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
              }}
            >
              {quickLinks.map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  style={{
                    display: "block",
                    padding: "8px 12px",
                    borderRadius: "8px",
                    background: "#f8fafc",
                    border: "1px solid #e2e8f0",
                    color: "#1d4ed8",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  {label} →
                </Link>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div
            style={{
              fontSize: "11px",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "#64748b",
              marginBottom: "2px",
            }}
          >
            {t("dashboard.runtime.title", locale)}
          </div>
          <div style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}>
            {t("dashboard.runtime.subtitle", locale)}
          </div>
        </CardHeader>
        <CardBody>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "16px",
            }}
          >
            {(
              [
                [t("dashboard.runtime.apiStatus", locale), health.status],
                [t("dashboard.runtime.service", locale), health.service],
                [t("dashboard.runtime.mode", locale), health.mode],
                [
                  t("dashboard.runtime.execution", locale),
                  health.execution_mode,
                ],
                [
                  t("dashboard.runtime.realm", locale),
                  identity?.realm ?? t("dashboard.runtime.anonymous", locale),
                ],
                [
                  t("dashboard.runtime.actor", locale),
                  identity?.actorType ??
                    t("dashboard.runtime.anonymous", locale),
                ],
              ] as [string, string][]
            ).map(([label, value]) => (
              <div key={label}>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {label}
                </div>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#0f172a",
                    marginTop: "4px",
                  }}
                >
                  {value}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </>
  );
}
