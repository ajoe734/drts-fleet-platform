import Link from "next/link";
import type {
  DriverStatementRecord,
  DriverTaskRecord,
  ForwardedOrderRecord,
  ForwarderReconciliationIssue,
  OwnedOrderRecord,
  ReconciliationIssueRecord,
  SettlementMatrixRecord,
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

const MATRIX_CHANNEL_ORDER = [
  "tenant_enterprise",
  "partner_airport",
  "phone_dispatch",
  "forwarded_shadow",
];

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

function sortSettlementMatrix(rows: SettlementMatrixRecord[]) {
  const priority = new Map(
    MATRIX_CHANNEL_ORDER.map((channelKey, index) => [channelKey, index]),
  );
  return [...rows].sort(
    (left, right) =>
      (priority.get(left.channelKey) ?? Number.MAX_SAFE_INTEGER) -
      (priority.get(right.channelKey) ?? Number.MAX_SAFE_INTEGER),
  );
}

function settlementMatrixKey(
  category:
    | "channel"
    | "payer"
    | "sponsor"
    | "invoiceOwner"
    | "receipt"
    | "payout"
    | "discount"
    | "reimbursement"
    | "reconciliation",
  channelKey: string,
) {
  return `revenue.matrix.${category}.${channelKey}`;
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

function copyText(locale: "en" | "zh", en: string, zh: string) {
  return locale === "zh" ? zh : en;
}

export default async function RevenuePage({ searchParams }: RevenuePageProps) {
  const client = getOpsClient();
  const resolvedSearchParams = await (searchParams ??
    Promise.resolve({} as Record<string, string | string[] | undefined>));
  const filters = resolveFilters(resolvedSearchParams);
  const [
    orders,
    tasks,
    statements,
    vehicles,
    forwardedOrders,
    settlementMatrix,
    reconciliationIssues,
    settlementReconciliationIssues,
    locale,
  ] = await Promise.all([
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
    resolveOrFallback(
      () => client.listForwarderOrders(),
      [] as ForwardedOrderRecord[],
    ),
    resolveOrFallback(
      () => client.listSettlementMatrix(),
      [] as SettlementMatrixRecord[],
    ),
    resolveOrFallback(
      () => client.listForwarderReconciliationIssues(),
      [] as ForwarderReconciliationIssue[],
    ),
    resolveOrFallback(
      () => client.listReconciliationIssues(),
      [] as ReconciliationIssueRecord[],
    ),
    getServerLocale(),
  ]);
  const financeIssueByJobId = new Map(
    settlementReconciliationIssues
      .filter(
        (issue) =>
          issue.issueType === "forwarder_status_mismatch" &&
          issue.linkedReconciliationJobId,
      )
      .map((issue) => [issue.linkedReconciliationJobId!, issue]),
  );

  const insights = buildRevenueInsights(orders, tasks, statements, filters);
  const vehicleOptions = vehicles
    .map((v) => v.vehicleId)
    .sort((a, b) => a.localeCompare(b));
  const partnerBenefitRows = orders
    .filter(
      (order) =>
        order.status === "completed" &&
        order.serviceBucket === "business_dispatch" &&
        order.businessDispatchSubtype === "credit_card_airport_transfer" &&
        order.partnerId,
    )
    .filter((order) => {
      if (
        filters.serviceBucket !== "all" &&
        order.serviceBucket !== filters.serviceBucket
      ) {
        return false;
      }
      if (filters.period !== "all") {
        const days =
          filters.period === "today" ? 0 : filters.period === "7d" ? 6 : 29;
        const threshold = new Date();
        threshold.setHours(0, 0, 0, 0);
        threshold.setDate(threshold.getDate() - days);
        if (new Date(order.updatedAt).getTime() < threshold.getTime()) {
          return false;
        }
      }
      return true;
    });
  const enterpriseOrders = orders.filter(
    (order) =>
      order.serviceBucket === "business_dispatch" &&
      order.businessDispatchSubtype === "enterprise_dispatch",
  );
  const phoneOrders = orders.filter((order) => order.orderSource === "phone");
  const forwardedSyncFailedCount = forwardedOrders.filter(
    (order) => order.status === "sync_failed",
  ).length;
  const shadowLedgerCount = settlementMatrix.filter(
    (row) => row.localLedgerMode === "shadow_only",
  ).length;
  const settlementChannels = sortSettlementMatrix(settlementMatrix);
  const mismatchedJobsCount = reconciliationIssues.length;

  const describeMatrixChannel = (channelKey: string) => {
    const key = settlementMatrixKey("channel", channelKey);
    const value = t(key, locale);
    return value === key ? channelKey : value;
  };

  const describeMatrixField = (
    category:
      | "payer"
      | "sponsor"
      | "invoiceOwner"
      | "receipt"
      | "payout"
      | "discount"
      | "reimbursement"
      | "reconciliation",
    row: SettlementMatrixRecord,
    fallback: string,
  ) => {
    const key = settlementMatrixKey(category, row.channelKey);
    const value = t(key, locale);
    return value === key ? fallback : value;
  };

  const describeLedgerMode = (
    mode: SettlementMatrixRecord["localLedgerMode"],
  ) =>
    mode === "shadow_only"
      ? t("revenue.matrix.ledger.shadow_only", locale)
      : t("revenue.matrix.ledger.full_service", locale);

  const describeEvidence = (channelKey: string) => {
    switch (channelKey) {
      case "tenant_enterprise":
        return t("revenue.matrix.evidence.tenant_enterprise", locale, {
          orders: String(enterpriseOrders.length),
          statements: String(statements.length),
        });
      case "partner_airport":
        return t("revenue.matrix.evidence.partner_airport", locale, {
          trips: String(partnerBenefitRows.length),
        });
      case "phone_dispatch":
        return t("revenue.matrix.evidence.phone_dispatch", locale, {
          orders: String(phoneOrders.length),
        });
      case "forwarded_shadow":
        return t("revenue.matrix.evidence.forwarded_shadow", locale, {
          mirrors: String(forwardedOrders.length),
          syncFailed: String(forwardedSyncFailedCount),
        });
      default:
        return t("common.noData", locale);
    }
  };

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

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "16px",
          marginBottom: "20px",
        }}
      >
        <StatCard
          label={t("revenue.matrix.title", locale)}
          value={formatCompactNumber(settlementChannels.length)}
          sub={copyText(
            locale,
            "Settlement channels under review",
            "目前檢視中的結算通道",
          )}
          accent="#0f766e"
        />
        <StatCard
          label={copyText(locale, "Shadow ledger lanes", "影子帳務通道")}
          value={formatCompactNumber(shadowLedgerCount)}
          sub={copyText(
            locale,
            "Channels still settled externally",
            "仍由外部結算的通道",
          )}
          accent="#b45309"
        />
        <StatCard
          label={copyText(locale, "Mismatch queue", "不一致佇列")}
          value={formatCompactNumber(mismatchedJobsCount)}
          sub={copyText(
            locale,
            "Forwarded orders waiting on reconciliation follow-up",
            "等待對帳後續處理的轉派訂單",
          )}
          accent="#dc2626"
        />
        <StatCard
          label={copyText(locale, "Sync failures", "同步失敗")}
          value={formatCompactNumber(forwardedSyncFailedCount)}
          sub={copyText(
            locale,
            "Mirror orders with adapter sync failures",
            "鏡像訂單發生 adapter 同步失敗",
          )}
          accent="#7c3aed"
        />
      </div>

      <Card style={{ marginBottom: "20px" }}>
        <CardBody style={{ padding: "14px 16px" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr",
              gap: "12px",
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
                  marginBottom: "4px",
                }}
              >
                {copyText(locale, "Monitoring posture", "監控視角")}
              </div>
              <div style={{ fontWeight: 600, color: "#0f172a" }}>
                {copyText(
                  locale,
                  "Settlement-matrix-first review keeps payout, receipt, and reconciliation authority visible before statement close.",
                  "以結算矩陣優先的檢視方式，能在關帳前先看清 payout、receipt 與 reconciliation 權責。",
                )}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <Badge variant="green">
                {formatCompactNumber(insights.payoutStatuses.length)}{" "}
                {copyText(locale, "payout lanes", "付款通道")}
              </Badge>
              <Badge variant="yellow">
                {formatCompactNumber(shadowLedgerCount)}{" "}
                {copyText(locale, "shadow-only", "僅影子帳")}
              </Badge>
              <Badge variant={mismatchedJobsCount > 0 ? "red" : "green"}>
                {formatCompactNumber(mismatchedJobsCount)}{" "}
                {copyText(locale, "mismatches", "不一致")}
              </Badge>
            </div>
          </div>
        </CardBody>
      </Card>

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

      <Card style={{ marginBottom: "20px" }}>
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
            {t("revenue.partnerBenefitTitle", locale)}
          </div>
          <div style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}>
            {t("revenue.partnerBenefitSub", locale)}
          </div>
        </CardHeader>
        <DataTable
          columns={[
            { label: t("revenue.col.order", locale) },
            { label: t("revenue.col.partner", locale) },
            { label: t("revenue.col.eligibility", locale) },
            { label: t("revenue.col.benefit", locale) },
            { label: t("revenue.col.revenue", locale) },
          ]}
          empty={t("revenue.emptyPartnerBenefit", locale)}
        >
          {partnerBenefitRows.map((order) => (
            <Tr key={order.orderId}>
              <Td>
                <div>{order.orderNo}</div>
                <div style={{ color: "#64748b", fontSize: "12px" }}>
                  {formatOpsCodeLabel(locale, order.businessDispatchSubtype!)}
                </div>
              </Td>
              <Td>
                <div>{order.partnerId}</div>
                <div style={{ color: "#64748b", fontSize: "12px" }}>
                  {order.partnerEntrySlug}
                </div>
              </Td>
              <Td>
                <div>{order.eligibilityVerificationId ?? "—"}</div>
                <div style={{ color: "#64748b", fontSize: "12px" }}>
                  {order.issuerAuthorizationRef ?? "—"}
                </div>
              </Td>
              <Td>
                <div>{order.benefitReference ?? "—"}</div>
                <div style={{ color: "#64748b", fontSize: "12px" }}>
                  {order.partnerProgramId ?? "—"}
                </div>
              </Td>
              <Td>{formatMinorCurrency(order.quotedFare?.amountMinor ?? 0)}</Td>
            </Tr>
          ))}
        </DataTable>
      </Card>

      <Card style={{ marginBottom: "20px" }}>
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
            {t("revenue.matrix.title", locale)}
          </div>
          <div style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}>
            {t("revenue.matrix.subtitle", locale)}
          </div>
        </CardHeader>
        <DataTable
          columns={[
            { label: t("revenue.matrix.col.channel", locale) },
            { label: t("revenue.matrix.col.payer", locale) },
            { label: t("revenue.matrix.col.sponsor", locale) },
            { label: t("revenue.matrix.col.documents", locale) },
            { label: t("revenue.matrix.col.payout", locale) },
            { label: t("revenue.matrix.col.discount", locale) },
            { label: t("revenue.matrix.col.evidence", locale) },
            { label: t("revenue.matrix.col.ledger", locale) },
          ]}
          empty={t("revenue.matrix.empty", locale)}
        >
          {sortSettlementMatrix(settlementMatrix).map((row) => (
            <Tr key={row.channelKey}>
              <Td>
                <div>{describeMatrixChannel(row.channelKey)}</div>
                <div style={{ color: "#64748b", fontSize: "12px" }}>
                  {row.orderDomain} · {row.orderSources.join(" / ")}
                </div>
              </Td>
              <Td>{describeMatrixField("payer", row, row.payerType)}</Td>
              <Td>{describeMatrixField("sponsor", row, row.sponsorType)}</Td>
              <Td>
                <div>
                  {describeMatrixField("invoiceOwner", row, row.invoiceOwner)}
                </div>
                <div style={{ color: "#64748b", fontSize: "12px" }}>
                  {describeMatrixField("receipt", row, row.receiptOwner)}
                </div>
                <div style={{ color: "#64748b", fontSize: "12px" }}>
                  {describeMatrixField(
                    "reconciliation",
                    row,
                    row.reconciliationPath,
                  )}
                </div>
              </Td>
              <Td>
                {describeMatrixField("payout", row, row.driverPayoutAuthority)}
              </Td>
              <Td>
                <div>
                  {describeMatrixField(
                    "discount",
                    row,
                    row.discountFundingSource,
                  )}
                </div>
                <div style={{ color: "#64748b", fontSize: "12px" }}>
                  {describeMatrixField(
                    "reimbursement",
                    row,
                    row.reimbursementRule,
                  )}
                </div>
              </Td>
              <Td muted>{describeEvidence(row.channelKey)}</Td>
              <Td>
                <Badge
                  variant={
                    row.localLedgerMode === "shadow_only" ? "yellow" : "green"
                  }
                >
                  {describeLedgerMode(row.localLedgerMode)}
                </Badge>
              </Td>
            </Tr>
          ))}
        </DataTable>
      </Card>

      {/* Reconciliation Issues */}
      {reconciliationIssues.length > 0 && (
        <Card style={{ marginBottom: "20px" }}>
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
              {t("revenue.reconciliation.title", locale)}
            </div>
            <div
              style={{ fontWeight: 600, fontSize: "15px", color: "#0f172a" }}
            >
              {t("revenue.reconciliation.subtitle", locale)}
            </div>
          </CardHeader>
          <div
            style={{
              padding: "12px 16px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              margin: "0 16px 12px",
              color: "#991b1b",
              fontSize: "13px",
            }}
          >
            {t("revenue.reconciliation.banner", locale, {
              count: String(reconciliationIssues.length),
            })}
          </div>
          <DataTable
            columns={[
              { label: t("revenue.reconciliation.col.mirror", locale) },
              { label: t("revenue.reconciliation.col.platform", locale) },
              { label: t("revenue.reconciliation.col.status", locale) },
              { label: t("revenue.reconciliation.col.error", locale) },
              { label: t("revenue.reconciliation.col.driver", locale) },
              { label: t("revenue.reconciliation.col.finance", locale) },
              { label: t("revenue.reconciliation.col.fareAuthority", locale) },
              { label: t("revenue.reconciliation.col.ledger", locale) },
            ]}
            empty={t("revenue.reconciliation.empty", locale)}
          >
            {reconciliationIssues.map((issue) => {
              const financeIssue = financeIssueByJobId.get(
                issue.reconciliationJob.reconciliationJobId,
              );
              return (
                <Tr key={issue.reconciliationJob.reconciliationJobId}>
                  <Td>
                    <div>{issue.mirrorOrderId.slice(0, 12)}...</div>
                    <div style={{ color: "#64748b", fontSize: "12px" }}>
                      {issue.externalOrderId}
                    </div>
                  </Td>
                  <Td>{formatOpsCodeLabel(locale, issue.platformCode)}</Td>
                  <Td>
                    <Badge
                      variant={
                        issue.status === "sync_failed" ? "red" : "yellow"
                      }
                    >
                      {formatOpsCodeLabel(locale, issue.status)}
                    </Badge>
                    <div style={{ color: "#64748b", fontSize: "12px" }}>
                      {formatOpsCodeLabel(
                        locale,
                        issue.reconciliationJob.reason,
                      )}
                    </div>
                  </Td>
                  <Td>
                    {issue.lastSyncError ? (
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 600 }}>
                          {issue.lastSyncError.code}
                        </div>
                        <div style={{ color: "#64748b", fontSize: "11px" }}>
                          {issue.lastSyncError.retryable
                            ? t("revenue.reconciliation.retryable", locale)
                            : t("revenue.reconciliation.notRetryable", locale)}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>—</span>
                    )}
                  </Td>
                  <Td>{issue.acceptedDriverId ?? "—"}</Td>
                  <Td>
                    {financeIssue ? (
                      <div>
                        <Badge
                          variant={
                            financeIssue.status === "resolved"
                              ? "green"
                              : financeIssue.status === "assigned"
                                ? "yellow"
                                : "red"
                          }
                        >
                          {formatOpsCodeLabel(locale, financeIssue.status)}
                        </Badge>
                        <div style={{ color: "#64748b", fontSize: "11px" }}>
                          {financeIssue.ownerId ??
                            t("revenue.reconciliation.unassigned", locale)}
                        </div>
                      </div>
                    ) : (
                      <span style={{ color: "#94a3b8" }}>
                        {t("revenue.reconciliation.notCreated", locale)}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <div style={{ fontSize: "12px" }}>
                      {t("revenue.reconciliation.fareExternal", locale)}
                    </div>
                    <div style={{ color: "#64748b", fontSize: "11px" }}>
                      {t("revenue.reconciliation.settlementExternal", locale)}
                    </div>
                  </Td>
                  <Td>
                    <Badge variant="yellow">
                      {t("revenue.reconciliation.shadowOnly", locale)}
                    </Badge>
                  </Td>
                </Tr>
              );
            })}
          </DataTable>
        </Card>
      )}

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
