import Link from "next/link";
import type {
  DriverStatementRecord,
  DriverTaskRecord,
  OwnedOrderRecord,
  VehicleRegistryRecord,
} from "@drts/contracts";
import { getOpsClient } from "@/lib/api-client";
import { getServerLocale } from "@/lib/server-locale";
import { formatOpsCodeLabel } from "@/lib/localized-labels";
import { t } from "@/lib/translations";
import {
  buildRevenueInsights,
  formatCompactNumber,
  formatMinorCurrency,
  type RevenueFilters,
  type RevenuePeriod,
} from "@/lib/ops-analytics";
import { PageHeader } from "@drts/ui-web";
import { StatCard } from "@drts/ui-web";
import { Card, CardHeader, CardBody } from "@drts/ui-web";
import { DataTable, Tr, Td } from "@drts/ui-web";
import { Badge } from "@drts/ui-web";

type RevenuePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
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
  if (next.serviceBucket !== "all")
    params.set("serviceBucket", next.serviceBucket);
  if (next.vehicleId !== "all") params.set("vehicleId", next.vehicleId);
  const query = params.toString();
  return query ? `/revenue?${query}` : "/revenue";
}

function ChipLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      style={{
        padding: "5px 12px",
        borderRadius: "999px",
        border: `1px solid ${active ? "#0f172a" : "#cbd5e1"}`,
        textDecoration: "none",
        color: active ? "#ffffff" : "#475569",
        background: active ? "#0f172a" : "#ffffff",
        fontSize: "12.5px",
        fontWeight: active ? 600 : 400,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </Link>
  );
}

export default async function RevenuePage({ searchParams }: RevenuePageProps) {
  const client = getOpsClient();
  const resolvedSearchParams = await (searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>));
  const filters = resolveFilters(resolvedSearchParams);
  const [orders, tasks, statements, vehicles, locale] = await Promise.all([
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
    getServerLocale(),
  ]);

  const insights = buildRevenueInsights(orders, tasks, statements, filters);
  const vehicleOptions = vehicles
    .map((v) => v.vehicleId)
    .sort((a, b) => a.localeCompare(b));

  return (
    <>
      <PageHeader
        title={t("revenue.title", locale)}
        subtitle={t("revenue.subtitle", locale)}
      />

      {/* Filter bar */}
      <Card style={{ marginBottom: "20px" }}>
        <CardBody style={{ padding: "12px 16px" }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "16px",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "11.5px",
                  color: "#64748b",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {t("revenue.periodLabel", locale)}
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                {(["today", "7d", "30d", "all"] as RevenuePeriod[]).map((p) => (
                  <ChipLink
                    key={p}
                    href={buildHref(filters, { period: p })}
                    active={p === filters.period}
                  >
                    {t(`revenue.period.${p}`, locale)}
                  </ChipLink>
                ))}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  fontSize: "11.5px",
                  color: "#64748b",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {t("revenue.productLabel", locale)}
              </span>
              <div style={{ display: "flex", gap: "6px" }}>
                {(["all", "standard_taxi", "business_dispatch"] as const).map(
                  (sb) => (
                    <ChipLink
                      key={sb}
                      href={buildHref(filters, { serviceBucket: sb })}
                      active={sb === filters.serviceBucket}
                    >
                      {sb === "all"
                        ? t("revenue.bucket.all", locale)
                        : t(`revenue.bucket.${sb}`, locale)}
                    </ChipLink>
                  ),
                )}
              </div>
            </div>
          </div>
          {vehicleOptions.length > 0 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginTop: "10px",
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: "11.5px",
                  color: "#64748b",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {t("common.vehicle", locale)}
              </span>
              <ChipLink
                href={buildHref(filters, { vehicleId: "all" })}
                active={filters.vehicleId === "all"}
              >
                {t("revenue.vehicle.all", locale)}
              </ChipLink>
              {vehicleOptions.map((vid) => (
                <ChipLink
                  key={vid}
                  href={buildHref(filters, { vehicleId: vid })}
                  active={vid === filters.vehicleId}
                >
                  {vid}
                </ChipLink>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* KPI strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <StatCard
          label={t("revenue.completedTrips", locale)}
          value={formatCompactNumber(insights.completedTrips)}
          sub={t("revenue.completedTripsSub", locale)}
          accent="#15803d"
        />
        <StatCard
          label={t("revenue.recognizedRevenue", locale)}
          value={formatMinorCurrency(insights.totalRevenueMinor)}
          sub={t("revenue.recognizedRevenueSub", locale)}
          accent="#1d4ed8"
        />
        <StatCard
          label={t("revenue.averageTrip", locale)}
          value={formatMinorCurrency(insights.averageRevenueMinor)}
          sub={t("revenue.averageTripSub", locale)}
          accent="#7c3aed"
        />
        <StatCard
          label={t("revenue.queuedPipeline", locale)}
          value={formatMinorCurrency(insights.queuedRevenueMinor)}
          sub={t("revenue.queuedPipelineSub", locale)}
          accent="#b45309"
        />
      </div>

      {/* Breakdowns */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "20px",
          marginBottom: "20px",
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
              {t("revenue.breakdownLabel", locale)}
            </div>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              {t("revenue.breakdownByProduct", locale)}
            </div>
          </CardHeader>
          <DataTable
            columns={[
              { label: t("revenue.col.product", locale) },
              { label: t("revenue.col.trips", locale) },
              { label: t("revenue.col.revenue", locale) },
              { label: t("revenue.col.average", locale) },
            ]}
            empty={t("revenue.emptyByProduct", locale)}
          >
            {insights.serviceBuckets.map((row) => (
              <Tr key={row.key}>
                <Td>{row.label}</Td>
                <Td>{formatCompactNumber(row.trips)}</Td>
                <Td>{formatMinorCurrency(row.revenueMinor)}</Td>
                <Td muted>{formatMinorCurrency(row.averageMinor)}</Td>
              </Tr>
            ))}
          </DataTable>
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
              {t("revenue.breakdownLabel", locale)}
            </div>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              {t("revenue.breakdownByVehicle", locale)}
            </div>
          </CardHeader>
          <DataTable
            columns={[
              { label: t("revenue.col.vehicle", locale) },
              { label: t("revenue.col.trips", locale) },
              { label: t("revenue.col.revenue", locale) },
              { label: t("revenue.col.average", locale) },
            ]}
            empty={t("revenue.emptyByVehicle", locale)}
          >
            {insights.vehicles.map((row) => (
              <Tr key={row.key}>
                <Td mono>{row.label}</Td>
                <Td>{formatCompactNumber(row.trips)}</Td>
                <Td>{formatMinorCurrency(row.revenueMinor)}</Td>
                <Td muted>{formatMinorCurrency(row.averageMinor)}</Td>
              </Tr>
            ))}
          </DataTable>
        </Card>
      </div>

      {/* Settlement */}
      <Card>
        <CardHeader>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "11px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: "#64748b",
                  marginBottom: "2px",
                }}
              >
                {t("revenue.settlementTitle", locale)}
              </div>
              <div
                style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
              >
                {t("revenue.settlementSub", locale)}
              </div>
            </div>
            <span style={{ fontSize: "13.5px", color: "#64748b" }}>
              {t("revenue.statementNet", locale, {
                value: formatMinorCurrency(insights.statementNetMinor),
              })}
            </span>
          </div>
        </CardHeader>
        {insights.payoutStatuses.length > 0 && (
          <div
            style={{
              padding: "12px 16px",
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              borderBottom: "1px solid #f1f5f9",
            }}
          >
            {insights.payoutStatuses.map((item) => (
              <div
                key={item.status}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                }}
              >
                <div
                  style={{
                    fontSize: "11px",
                    color: "#64748b",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {formatOpsCodeLabel(locale, item.status)}
                </div>
                <div
                  style={{
                    fontSize: "20px",
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  {formatCompactNumber(item.count)}
                </div>
                <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                  {formatMinorCurrency(item.netMinor)}
                </div>
              </div>
            ))}
          </div>
        )}
        <DataTable
          columns={[
            { label: t("revenue.col.statement", locale) },
            { label: t("revenue.col.driver", locale) },
            { label: t("revenue.col.period", locale) },
            { label: t("revenue.col.status", locale) },
            { label: t("revenue.col.net", locale) },
          ]}
          empty={t("revenue.emptySettlement", locale)}
        >
          {statements.map((s) => (
            <Tr key={s.statementId}>
              <Td mono>{s.receiptNo}</Td>
              <Td>{s.driverId}</Td>
              <Td muted>{s.periodMonth}</Td>
              <Td>
                <Badge variant={s.payoutStatus === "paid" ? "green" : "yellow"}>
                  {formatOpsCodeLabel(locale, s.payoutStatus)}
                </Badge>
              </Td>
              <Td>{formatMinorCurrency(s.netAmount.amountMinor)}</Td>
            </Tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
