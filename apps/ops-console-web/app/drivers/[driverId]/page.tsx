import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import type { DriverStatementRecord } from "@drts/contracts";
import { getServerOpsClient } from "@/lib/api-client.server";
import { formatOpsCodeLabel, getOpsLabel } from "@/lib/localized-labels";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";
import { PageHeader } from "@drts/ui-web";
import { formatCompactNumber, formatMinorCurrency } from "@/lib/ops-analytics";

type DriverEarningsPageProps = {
  params: Promise<{
    driverId: string;
  }>;
};

type LoadResult<T> = {
  data: T | null;
  error: string | null;
};

async function loadWithError<T>(
  loader: () => Promise<T>,
  locale: Awaited<ReturnType<typeof getServerLocale>>,
): Promise<LoadResult<T>> {
  try {
    return {
      data: await loader(),
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error ? error.message : t("common.unknown", locale),
    };
  }
}

function sortStatementsDescending(
  left: DriverStatementRecord,
  right: DriverStatementRecord,
) {
  return right.periodMonth.localeCompare(left.periodMonth);
}

const errorBannerStyle: CSSProperties = {
  marginBottom: "1rem",
  padding: "0.75rem 1rem",
  borderRadius: "0.75rem",
  background: "#fef2f2",
  color: "#b91c1c",
};

const mutedCopyStyle: CSSProperties = {
  color: "#64748b",
};

const footerLinksStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  marginTop: "1rem",
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  marginBottom: "1rem",
};

const cardStyle: CSSProperties = {
  padding: "1rem",
  borderRadius: "1rem",
  border: "1px solid #e2e8f0",
  background: "#fff",
};

const identityCardStyle: CSSProperties = {
  ...cardStyle,
  background: "#f8fafc",
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gap: "0.75rem",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  marginBottom: "1rem",
};

const summaryCardStyle: CSSProperties = {
  ...cardStyle,
  display: "grid",
  gap: "0.35rem",
  background: "#f8fafc",
};

const metaListStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
};

const metaPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  padding: "0.35rem 0.75rem",
  borderRadius: "999px",
  background: "#e2e8f0",
  color: "#0f172a",
  fontSize: "0.9rem",
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 0.25rem",
  fontSize: "0.75rem",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
};

const panelHeadStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "1rem",
  alignItems: "flex-start",
  marginBottom: "0.75rem",
};

const tableStyle: CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  display: "block",
  overflowX: "auto",
};

const tableCellStyle: CSSProperties = {
  padding: "0.75rem 0.5rem",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  verticalAlign: "top",
};

const rowMetaStyle: CSSProperties = {
  color: "#64748b",
};

export default async function DriverEarningsPage({
  params,
}: DriverEarningsPageProps) {
  const { driverId } = await params;
  const [client, locale] = await Promise.all([
    getServerOpsClient(),
    getServerLocale(),
  ]);
  const [driversResult, statementsResult] = await Promise.all([
    loadWithError(() => client.listDrivers(), locale),
    loadWithError(() => client.listDriverStatements(), locale),
  ]);
  const drivers = driversResult.data ?? [];
  const statements = statementsResult.data ?? [];

  if (driversResult.error) {
    return (
      <>
        <PageHeader
          title={t("driverEarnings.title", locale)}
          subtitle={getOpsLabel(locale, "driverRegistryUnavailableSubtitle", {
            driverId,
          })}
        />
        <div style={errorBannerStyle}>
          <strong>{t("driverEarnings.registryUnavailable", locale)}</strong>{" "}
          {driversResult.error}
        </div>
        <p style={mutedCopyStyle}>{t("driverEarnings.degradedNote", locale)}</p>
        <div style={footerLinksStyle}>
          <Link href="/drivers">
            <strong>{t("driverEarnings.backToDrivers", locale)}</strong>{" "}
            {t("driverEarnings.backToDriversErrorSub", locale)}
          </Link>
          <Link href="/revenue">
            <strong>{t("driverEarnings.revenueOverview", locale)}</strong>{" "}
            {t("driverEarnings.revenueOverviewDegradedSub", locale)}
          </Link>
        </div>
      </>
    );
  }

  const driver = drivers.find((candidate) => candidate.driverId === driverId);
  if (!driver) {
    notFound();
  }

  const driverStatements = statements
    .filter((statement) => statement.driverId === driver.driverId)
    .sort(sortStatementsDescending);
  const latestStatement = driverStatements[0] ?? null;
  const totals = driverStatements.reduce(
    (summary, statement) => ({
      grossMinor: summary.grossMinor + statement.grossEarning.amountMinor,
      serviceFeeMinor:
        summary.serviceFeeMinor + statement.serviceFee.amountMinor,
      subsidyMinor: summary.subsidyMinor + statement.subsidy.amountMinor,
      netMinor: summary.netMinor + statement.netAmount.amountMinor,
    }),
    {
      grossMinor: 0,
      serviceFeeMinor: 0,
      subsidyMinor: 0,
      netMinor: 0,
    },
  );

  return (
    <>
      <PageHeader
        title={t("driverEarnings.title", locale)}
        subtitle={t("driverEarnings.subtitle", locale, {
          name: driver.name,
          driverId: driver.driverId,
        })}
      />
      {statementsResult.error && (
        <div style={errorBannerStyle}>
          <strong>{t("driverEarnings.settlementsError", locale)}</strong>{" "}
          {statementsResult.error}
        </div>
      )}
      <section style={heroGridStyle}>
        <div style={identityCardStyle}>
          <p style={eyebrowStyle}>{t("driverEarnings.driverLabel", locale)}</p>
          <h2 style={{ margin: 0 }}>{driver.name}</h2>
          <div style={metaListStyle}>
            <span style={metaPillStyle}>{driver.driverId}</span>
            <span style={metaPillStyle}>
              {formatOpsCodeLabel(locale, driver.workState)}
            </span>
            <span style={metaPillStyle}>
              {driver.licensesValid
                ? t("driverEarnings.licensesValid", locale)
                : t("driverEarnings.licenseReview", locale)}
            </span>
          </div>
        </div>
        <div style={identityCardStyle}>
          <p style={eyebrowStyle}>{t("driverEarnings.opsNote", locale)}</p>
          <p style={mutedCopyStyle}>
            {t("driverEarnings.readOnlyNote", locale)}
          </p>
        </div>
      </section>

      <section style={summaryGridStyle}>
        {[
          {
            label: t("driverEarnings.statements", locale),
            value: statementsResult.error
              ? t("driverEarnings.unavailable", locale)
              : formatCompactNumber(driverStatements.length),
            note: statementsResult.error
              ? t("driverEarnings.serviceUnavailable", locale)
              : latestStatement
                ? t("driverEarnings.latestPeriod", locale, {
                    period: latestStatement.periodMonth,
                  })
                : t("driverEarnings.noPeriodsYet", locale),
          },
          {
            label: t("driverEarnings.gross", locale),
            value: statementsResult.error
              ? t("driverEarnings.unavailable", locale)
              : formatMinorCurrency(totals.grossMinor),
            note: statementsResult.error
              ? t("driverEarnings.retryWhenRecovered", locale)
              : t("driverEarnings.revenueBeforeFees", locale),
          },
          {
            label: t("driverEarnings.serviceFee", locale),
            value: statementsResult.error
              ? t("driverEarnings.unavailable", locale)
              : formatMinorCurrency(totals.serviceFeeMinor),
            note: statementsResult.error
              ? t("driverEarnings.retryWhenRecovered", locale)
              : t("driverEarnings.platformFee", locale),
          },
          {
            label: t("driverEarnings.subsidy", locale),
            value: statementsResult.error
              ? t("driverEarnings.unavailable", locale)
              : formatMinorCurrency(totals.subsidyMinor),
            note: statementsResult.error
              ? t("driverEarnings.retryWhenRecovered", locale)
              : t("driverEarnings.supportPrograms", locale),
          },
          {
            label: t("driverEarnings.net", locale),
            value: statementsResult.error
              ? t("driverEarnings.unavailable", locale)
              : formatMinorCurrency(totals.netMinor),
            note: statementsResult.error
              ? t("driverEarnings.unavailableDegraded", locale)
              : latestStatement
                ? t("driverEarnings.latestPayout", locale, {
                    status: formatOpsCodeLabel(
                      locale,
                      latestStatement.payoutStatus,
                    ),
                  })
                : t("driverEarnings.awaitingStatement", locale),
          },
        ].map((card) => (
          <div key={card.label} style={summaryCardStyle}>
            <span>{card.label}</span>
            <strong style={{ fontSize: "1.4rem" }}>{card.value}</strong>
            <small>{card.note}</small>
          </div>
        ))}
      </section>

      <section style={{ ...cardStyle, marginBottom: "1rem" }}>
        <div style={panelHeadStyle}>
          <div>
            <p style={eyebrowStyle}>
              {t("driverEarnings.earningsLabel", locale)}
            </p>
            <h3 style={{ margin: 0 }}>
              {t("driverEarnings.statementHistory", locale)}
            </h3>
          </div>
          <span style={mutedCopyStyle}>
            {t("driverEarnings.readOnlyByDesign", locale)}
          </span>
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={tableCellStyle}>
                {t("driverEarnings.col.period", locale)}
              </th>
              <th style={tableCellStyle}>
                {t("driverEarnings.col.statement", locale)}
              </th>
              <th style={tableCellStyle}>
                {t("driverEarnings.col.feePlan", locale)}
              </th>
              <th style={tableCellStyle}>
                {t("driverEarnings.col.gross", locale)}
              </th>
              <th style={tableCellStyle}>
                {t("driverEarnings.col.serviceFee", locale)}
              </th>
              <th style={tableCellStyle}>
                {t("driverEarnings.col.subsidy", locale)}
              </th>
              <th style={tableCellStyle}>
                {t("driverEarnings.col.net", locale)}
              </th>
              <th style={tableCellStyle}>
                {t("driverEarnings.col.status", locale)}
              </th>
            </tr>
          </thead>
          <tbody>
            {statementsResult.error ? (
              <tr>
                <td colSpan={8} style={tableCellStyle}>
                  {t("driverEarnings.loadError", locale)}
                </td>
              </tr>
            ) : driverStatements.length > 0 ? (
              driverStatements.map((statement) => (
                <tr key={statement.statementId}>
                  <td style={tableCellStyle}>{statement.periodMonth}</td>
                  <td style={tableCellStyle}>
                    <div>{statement.receiptNo}</div>
                    <small style={rowMetaStyle}>{statement.statementId}</small>
                  </td>
                  <td style={tableCellStyle}>{statement.feePlanVersion}</td>
                  <td style={tableCellStyle}>
                    {formatMinorCurrency(statement.grossEarning.amountMinor)}
                  </td>
                  <td style={tableCellStyle}>
                    {formatMinorCurrency(statement.serviceFee.amountMinor)}
                  </td>
                  <td style={tableCellStyle}>
                    {formatMinorCurrency(statement.subsidy.amountMinor)}
                  </td>
                  <td style={tableCellStyle}>
                    {formatMinorCurrency(statement.netAmount.amountMinor)}
                  </td>
                  <td style={tableCellStyle}>
                    {formatOpsCodeLabel(locale, statement.payoutStatus)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} style={tableCellStyle}>
                  {t("driverEarnings.noStatements", locale)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div style={footerLinksStyle}>
        <Link href="/drivers">
          <strong>{t("driverEarnings.backToDrivers", locale)}</strong>{" "}
          {t("driverEarnings.backToDriversSub", locale)}
        </Link>
        <Link href="/revenue">
          <strong>{t("driverEarnings.revenueOverview", locale)}</strong>{" "}
          {t("driverEarnings.revenueOverviewSub", locale)}
        </Link>
      </div>
    </>
  );
}
