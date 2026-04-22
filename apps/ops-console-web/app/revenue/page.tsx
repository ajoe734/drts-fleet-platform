"use client";
import Link from "next/link";
import type {
  DriverStatementRecord,
  DriverTaskRecord,
  OwnedOrderRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
import {
  buildRevenueInsights,
  formatCompactNumber,
  formatMinorCurrency,
  type RevenueFilters,
  type RevenuePeriod,
} from "@/lib/ops-analytics";

type RevenuePageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
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

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveFilters(
  searchParams?: Record<string, string | string[] | undefined>,
): RevenueFilters {
  const rawPeriod = firstParam(searchParams?.period);
  const period: RevenuePeriod =
    rawPeriod === "today" ||
    rawPeriod === "7d" ||
    rawPeriod === "30d" ||
    rawPeriod === "all"
      ? rawPeriod
      : "7d";
  const serviceBucket = firstParam(searchParams?.serviceBucket) ?? "all";
  const vehicleId = firstParam(searchParams?.vehicleId) ?? "all";

  return {
    period,
    serviceBucket:
      serviceBucket === "standard_taxi" || serviceBucket === "business_dispatch"
        ? serviceBucket
        : "all",
    vehicleId,
  };
}

function buildHref(
  filters: RevenueFilters,
  overrides: Partial<RevenueFilters>,
) {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.period !== "7d") params.set("period", next.period);
  if (next.serviceBucket !== "all") {
    params.set("serviceBucket", next.serviceBucket);
  }
  if (next.vehicleId !== "all") params.set("vehicleId", next.vehicleId);
  const query = params.toString();
  return query ? `/revenue?${query}` : "/revenue";
}

export default async function RevenuePage({ searchParams }: RevenuePageProps) {
  const client = getOpsClient();
  const filters = resolveFilters(searchParams);
  const [orders, tasks, statements, vehicles] = await Promise.all([
    resolveOrFallback(() => client.listOrders(), [] as OwnedOrderRecord[]),
    resolveOrFallback(() => client.listDriverTasks(), [] as DriverTaskRecord[]),
    resolveOrFallback(
      () => client.listDriverStatements(),
      [] as DriverStatementRecord[],
    ),
    resolveOrFallback(
      () => client.listVehicles(),
      [] as VehicleRegistryRecord[],
    ),
  ]);

  const insights = buildRevenueInsights(orders, tasks, statements, filters);
  const vehicleOptions = vehicles
    .map((vehicle) => vehicle.vehicleId)
    .sort((left, right) => left.localeCompare(right));

  return (
    <main className="app-grid">
      <AppShellCard
        title="Revenue Overview"
        description="Ops-facing revenue, trip yield, and settlement pulse built from live order, task, and statement surfaces."
      >
        <section className="filter-bar">
          <div className="filter-group">
            <span className="filter-label">Period</span>
            {(["today", "7d", "30d", "all"] as RevenuePeriod[]).map(
              (period) => (
                <Link
                  key={period}
                  className={
                    period === filters.period ? "chip chip-active" : "chip"
                  }
                  href={buildHref(filters, { period })}
                >
                  {period}
                </Link>
              ),
            )}
          </div>
          <div className="filter-group">
            <span className="filter-label">Product</span>
            {(["all", "standard_taxi", "business_dispatch"] as const).map(
              (serviceBucket) => (
                <Link
                  key={serviceBucket}
                  className={
                    serviceBucket === filters.serviceBucket
                      ? "chip chip-active"
                      : "chip"
                  }
                  href={buildHref(filters, { serviceBucket })}
                >
                  {serviceBucket === "all"
                    ? "all"
                    : serviceBucket.replace(/_/g, " ")}
                </Link>
              ),
            )}
          </div>
        </section>

        <section className="filter-group vehicle-group">
          <span className="filter-label">Vehicle</span>
          <Link
            className={
              filters.vehicleId === "all" ? "chip chip-active" : "chip"
            }
            href={buildHref(filters, { vehicleId: "all" })}
          >
            all
          </Link>
          {vehicleOptions.map((vehicleId) => (
            <Link
              key={vehicleId}
              className={
                vehicleId === filters.vehicleId ? "chip chip-active" : "chip"
              }
              href={buildHref(filters, { vehicleId })}
            >
              {vehicleId}
            </Link>
          ))}
        </section>

        <section className="summary-grid">
          {[
            {
              label: "Completed trips",
              value: formatCompactNumber(insights.completedTrips),
              note: "Filtered revenue-bearing trips",
            },
            {
              label: "Recognized revenue",
              value: formatMinorCurrency(insights.totalRevenueMinor),
              note: "Completed-task fare plus fixed-price fallback",
            },
            {
              label: "Average trip",
              value: formatMinorCurrency(insights.averageRevenueMinor),
              note: "Average revenue per completed trip",
            },
            {
              label: "Queued pipeline",
              value: formatMinorCurrency(insights.queuedRevenueMinor),
              note: "Quoted revenue still in active dispatch flow",
            },
          ].map((card) => (
            <div key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </div>
          ))}
        </section>

        <section className="content-grid">
          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Breakdown</p>
                <h3>By product</h3>
              </div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Trips</th>
                  <th>Revenue</th>
                  <th>Average</th>
                </tr>
              </thead>
              <tbody>
                {insights.serviceBuckets.length > 0 ? (
                  insights.serviceBuckets.map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{formatCompactNumber(row.trips)}</td>
                      <td>{formatMinorCurrency(row.revenueMinor)}</td>
                      <td>{formatMinorCurrency(row.averageMinor)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      No completed revenue rows for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Breakdown</p>
                <h3>By vehicle</h3>
              </div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Trips</th>
                  <th>Revenue</th>
                  <th>Average</th>
                </tr>
              </thead>
              <tbody>
                {insights.vehicles.length > 0 ? (
                  insights.vehicles.map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{formatCompactNumber(row.trips)}</td>
                      <td>{formatMinorCurrency(row.revenueMinor)}</td>
                      <td>{formatMinorCurrency(row.averageMinor)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4}>
                      No vehicle-level revenue for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Settlement</p>
              <h3>Driver statement pulse</h3>
            </div>
            <span className="panel-note">
              Statement net total:{" "}
              {formatMinorCurrency(insights.statementNetMinor)}
            </span>
          </div>
          <div className="status-strip">
            {insights.payoutStatuses.length > 0 ? (
              insights.payoutStatuses.map((item) => (
                <div key={item.status} className="summary-card">
                  <span>{item.status}</span>
                  <strong>{formatCompactNumber(item.count)}</strong>
                  <small>{formatMinorCurrency(item.netMinor)}</small>
                </div>
              ))
            ) : (
              <p className="empty-copy">
                No driver statements available yet for settlement review.
              </p>
            )}
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Statement</th>
                <th>Driver</th>
                <th>Period</th>
                <th>Status</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {statements.length > 0 ? (
                statements.map((statement) => (
                  <tr key={statement.statementId}>
                    <td>{statement.receiptNo}</td>
                    <td>
                      <Link
                        href={`/drivers/${encodeURIComponent(statement.driverId)}`}
                      >
                        {statement.driverId}
                      </Link>
                    </td>
                    <td>{statement.periodMonth}</td>
                    <td>{statement.payoutStatus}</td>
                    <td>
                      {formatMinorCurrency(statement.netAmount.amountMinor)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>No statements generated yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="footer-links">
          <Link className="route-link" href="/dashboard">
            <strong>Back to dashboard</strong> Return to the operations
            overview.
          </Link>
          <Link className="route-link" href="/reports">
            <strong>Export reports</strong> Open the reports center for
            CSV/XLSX/PDF jobs.
          </Link>
        </div>

        <style jsx>{`
          .filter-bar,
          .filter-group,
          .summary-grid,
          .content-grid,
          .status-strip,
          .footer-links {
            display: grid;
            gap: 0.75rem;
          }
          .filter-group {
            grid-auto-flow: column;
            grid-auto-columns: max-content;
            align-items: center;
            overflow-x: auto;
            padding-bottom: 0.25rem;
          }
          .vehicle-group {
            margin: 0.75rem 0 1rem;
          }
          .filter-label,
          .eyebrow,
          .panel-note,
          .empty-copy {
            color: #64748b;
          }
          .eyebrow {
            margin: 0 0 0.25rem;
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .chip {
            padding: 0.45rem 0.8rem;
            border-radius: 999px;
            border: 1px solid #cbd5e1;
            text-decoration: none;
            color: #0f172a;
            background: white;
          }
          .chip-active {
            background: #0f172a;
            color: white;
            border-color: #0f172a;
          }
          .summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            margin-bottom: 1rem;
          }
          .summary-card,
          .panel {
            padding: 1rem;
            border-radius: 1rem;
            border: 1px solid #e2e8f0;
            background: #fff;
          }
          .summary-card {
            display: grid;
            gap: 0.35rem;
            background: #f8fafc;
          }
          .summary-card strong {
            font-size: 1.4rem;
          }
          .content-grid {
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            margin-bottom: 1rem;
          }
          .panel-head {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            align-items: flex-start;
            margin-bottom: 0.75rem;
          }
          .panel h3 {
            margin: 0;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
          }
          .table th,
          .table td {
            padding: 0.75rem 0.5rem;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
            vertical-align: top;
          }
          .footer-links {
            grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
            margin-top: 1rem;
          }
        `}</style>
      </AppShellCard>
    </main>
  );
}
