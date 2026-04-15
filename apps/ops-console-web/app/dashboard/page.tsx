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
import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import {
  buildDashboardTrend,
  buildDispatchInsights,
  buildOperationsOverview,
  buildRevenueInsights,
  formatCompactNumber,
  formatMinorCurrency,
} from "@/lib/ops-analytics";

type IdentitySummary = {
  realm?: string;
  actorType?: string;
} | null;

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
  const maxTrips = Math.max(1, ...trend.map((point) => point.completedTrips));
  const actionItems = [
    dispatch.redispatchOrders > 0
      ? `${dispatch.redispatchOrders} orders need redispatch`
      : null,
    operations.openIncidents > 0
      ? `${operations.openIncidents} incidents are still open`
      : null,
    operations.overdueMaintenance > 0
      ? `${operations.overdueMaintenance} maintenance work orders are overdue`
      : null,
    operations.failedReports > 0
      ? `${operations.failedReports} report jobs need retry or review`
      : null,
  ].filter(Boolean) as string[];

  return (
    <main className="app-grid">
      <AppShellCard
        title="Dashboard"
        description="Host / OpCo operational overview: KPI, dispatch health, revenue pulse, and exception backlog."
      >
        <div className="dashboard-grid">
          <section className="hero-panel">
            <div>
              <p className="eyebrow">Phase 1 Role Lens</p>
              <h2>OpCo operates, ROC monitors, Host reads scoped data.</h2>
              <p className="hero-copy">
                ROC remains read-only in Phase 1, while OpCo owns assignment and
                redispatch. Host-facing visibility stays limited to its own
                vehicles, maintenance, and revenue surfaces.
              </p>
            </div>
            <div className="hero-metrics">
              <div className="metric-card metric-primary">
                <span className="metric-label">Today&apos;s revenue</span>
                <strong>
                  {formatMinorCurrency(todayRevenue.totalRevenueMinor)}
                </strong>
                <span className="metric-subcopy">
                  {formatCompactNumber(todayRevenue.completedTrips)} completed
                  trip(s) today
                </span>
              </div>
              <div className="metric-card">
                <span className="metric-label">Queue depth</span>
                <strong>{formatCompactNumber(dispatch.queueDepth)}</strong>
                <span className="metric-subcopy">
                  {dispatch.averageEtaMinutes
                    ? `Avg ETA ${dispatch.averageEtaMinutes} min`
                    : "ETA pending"}
                </span>
              </div>
            </div>
          </section>

          <section className="metric-strip">
            {[
              {
                label: "Active orders",
                value: dispatch.activeOrders,
                note: "Across realtime and reservation flows",
              },
              {
                label: "Dispatchable vehicles",
                value: operations.dispatchableVehicles,
                note: `${operations.offlineVehicles} offline / blocked`,
              },
              {
                label: "Online drivers",
                value: operations.onlineDrivers,
                note: "Active shift count falls back to available drivers",
              },
              {
                label: "Open incidents",
                value: operations.openIncidents,
                note: `${operations.overdueMaintenance} overdue maintenance item(s)`,
              },
            ].map((metric) => (
              <div key={metric.label} className="metric-card">
                <span className="metric-label">{metric.label}</span>
                <strong>{formatCompactNumber(metric.value)}</strong>
                <span className="metric-subcopy">{metric.note}</span>
              </div>
            ))}
          </section>

          <section className="trend-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">7-Day Trend</p>
                <h3>Completed trips and new order intake</h3>
              </div>
              <span className="panel-note">
                Revenue trend is based on completed driver tasks.
              </span>
            </div>
            <div className="trend-chart">
              {trend.map((point) => (
                <div key={point.date} className="trend-column">
                  <div
                    className="trend-bar"
                    style={{
                      height: `${Math.max(14, Math.round((point.completedTrips / maxTrips) * 88))}px`,
                    }}
                    title={`${point.label}: ${point.completedTrips} completed trip(s), ${formatMinorCurrency(point.revenueMinor)}`}
                  />
                  <strong>{point.completedTrips}</strong>
                  <span>{point.label}</span>
                  <small>{point.createdOrders} new order(s)</small>
                </div>
              ))}
            </div>
          </section>

          <section className="side-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Exceptions</p>
                <h3>Attention queue</h3>
              </div>
            </div>
            {actionItems.length > 0 ? (
              <ul className="attention-list">
                {actionItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="empty-copy">
                No critical exceptions are waiting right now.
              </p>
            )}
            <div className="quick-links">
              {(
                [
                  ["/dispatch", "Open dispatch board"],
                  ["/revenue", "Review revenue breakdown"],
                  ["/incidents", "Coordinate incidents"],
                  ["/maintenance", "Check maintenance backlog"],
                  ["/reports", "Generate operational exports"],
                ] as Array<[string, string]>
              ).map(([href, label]) => (
                <Link key={href} className="route-link" href={href}>
                  {label}
                </Link>
              ))}
            </div>
          </section>

          <section className="health-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Runtime</p>
                <h3>System health and execution context</h3>
              </div>
            </div>
            <dl className="health-grid">
              <div>
                <dt>API</dt>
                <dd>{health.status}</dd>
              </div>
              <div>
                <dt>Service</dt>
                <dd>{health.service}</dd>
              </div>
              <div>
                <dt>Mode</dt>
                <dd>{health.mode}</dd>
              </div>
              <div>
                <dt>Execution</dt>
                <dd>{health.execution_mode}</dd>
              </div>
              <div>
                <dt>Identity realm</dt>
                <dd>{identity?.realm ?? "anonymous"}</dd>
              </div>
              <div>
                <dt>Actor</dt>
                <dd>{identity?.actorType ?? "anonymous"}</dd>
              </div>
            </dl>
          </section>
        </div>
        <style jsx>{`
          .dashboard-grid {
            display: grid;
            gap: 1rem;
          }
          .hero-panel,
          .trend-panel,
          .side-panel,
          .health-panel {
            border: 1px solid #e5e7eb;
            border-radius: 1rem;
            padding: 1rem;
            background: #fff;
          }
          .hero-panel {
            display: grid;
            gap: 1rem;
            background:
              radial-gradient(circle at top left, #f0fdf4, transparent 48%),
              linear-gradient(135deg, #f8fafc, #fff7ed);
          }
          .eyebrow {
            margin: 0 0 0.25rem;
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #64748b;
          }
          h2,
          h3 {
            margin: 0;
          }
          .hero-copy {
            margin: 0.75rem 0 0;
            color: #334155;
            line-height: 1.6;
          }
          .hero-metrics,
          .metric-strip,
          .quick-links,
          .health-grid {
            display: grid;
            gap: 0.75rem;
          }
          .metric-strip {
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          }
          .hero-metrics {
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          }
          .metric-card {
            padding: 0.9rem 1rem;
            border-radius: 0.9rem;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            display: grid;
            gap: 0.35rem;
          }
          .metric-primary {
            background: #0f172a;
            color: white;
            border-color: #0f172a;
          }
          .metric-label {
            font-size: 0.78rem;
            color: inherit;
            opacity: 0.72;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }
          .metric-card strong {
            font-size: 1.5rem;
          }
          .metric-subcopy {
            color: inherit;
            opacity: 0.74;
            font-size: 0.9rem;
          }
          .panel-head {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            align-items: flex-start;
            margin-bottom: 1rem;
          }
          .panel-note,
          .empty-copy {
            color: #64748b;
          }
          .trend-chart {
            display: grid;
            grid-template-columns: repeat(7, minmax(0, 1fr));
            gap: 0.75rem;
            align-items: end;
          }
          .trend-column {
            display: grid;
            justify-items: center;
            gap: 0.3rem;
            color: #475569;
          }
          .trend-bar {
            width: 100%;
            max-width: 52px;
            border-radius: 0.9rem 0.9rem 0.35rem 0.35rem;
            background: linear-gradient(180deg, #0ea5e9, #14b8a6);
          }
          .attention-list {
            margin: 0;
            padding-left: 1rem;
            color: #0f172a;
          }
          .quick-links {
            margin-top: 1rem;
          }
          .route-link {
            display: block;
            padding: 0.85rem 1rem;
            border-radius: 0.85rem;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            color: #0f172a;
            text-decoration: none;
          }
          .health-grid {
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          }
          .health-grid dt {
            font-size: 0.8rem;
            color: #64748b;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }
          .health-grid dd {
            margin: 0.25rem 0 0;
            font-weight: 600;
            color: #0f172a;
          }
        `}</style>
      </AppShellCard>
    </main>
  );
}
