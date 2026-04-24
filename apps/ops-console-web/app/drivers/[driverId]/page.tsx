import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import type { DriverStatementRecord } from "@drts/contracts";
import { PageHeader } from "@drts/ui-web";
import { getOpsClient } from "@/lib/api-client";
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
): Promise<LoadResult<T>> {
  try {
    return {
      data: await loader(),
      error: null,
    };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unknown error",
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
  const client = getOpsClient();
  const [driversResult, statementsResult] = await Promise.all([
    loadWithError(() => client.listDrivers()),
    loadWithError(() => client.listDriverStatements()),
  ]);
  const drivers = driversResult.data ?? [];
  const statements = statementsResult.data ?? [];

  if (driversResult.error) {
    return (
      <>
        <PageHeader
          title="Driver Earnings"
          subtitle={`Unable to load driver registry data for ${driverId}.`}
        />
        <div style={errorBannerStyle}>
          <strong>Driver registry unavailable:</strong> {driversResult.error}
        </div>
        <p style={mutedCopyStyle}>
          This is a degraded read-only state. The driver may exist, but ops
          cannot verify it until the registry endpoint recovers.
        </p>
        <div style={footerLinksStyle}>
          <Link href="/drivers">
            <strong>Back to drivers</strong> Return to the registry and retry
            once the API recovers.
          </Link>
          <Link href="/revenue">
            <strong>Revenue overview</strong> Compare fleet-wide revenue while
            registry data is degraded.
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
        title="Driver Earnings"
        subtitle={`${driver.name} · ${driver.driverId}`}
      />
      {statementsResult.error && (
        <div style={errorBannerStyle}>
          <strong>Settlement data unavailable:</strong> {statementsResult.error}
        </div>
      )}
      <section style={heroGridStyle}>
        <div style={identityCardStyle}>
          <p style={eyebrowStyle}>Driver</p>
          <h2 style={{ margin: 0 }}>{driver.name}</h2>
          <div style={metaListStyle}>
            <span style={metaPillStyle}>{driver.driverId}</span>
            <span style={metaPillStyle}>{driver.workState}</span>
            <span style={metaPillStyle}>
              {driver.licensesValid ? "licenses valid" : "license review"}
            </span>
          </div>
        </div>
        <div style={identityCardStyle}>
          <p style={eyebrowStyle}>Ops Note</p>
          <p style={mutedCopyStyle}>
            Earnings are read-only in ops console. Statement generation and
            payout actions remain in finance workflows.
          </p>
        </div>
      </section>

      <section style={summaryGridStyle}>
        {[
          {
            label: "Statements",
            value: statementsResult.error
              ? "Unavailable"
              : formatCompactNumber(driverStatements.length),
            note: statementsResult.error
              ? "Statement service unavailable"
              : latestStatement
                ? `Latest period ${latestStatement.periodMonth}`
                : "No periods generated yet",
          },
          {
            label: "Gross",
            value: statementsResult.error
              ? "Unavailable"
              : formatMinorCurrency(totals.grossMinor),
            note: statementsResult.error
              ? "Retry when statement service recovers"
              : "Revenue before fees and subsidy",
          },
          {
            label: "Service fee",
            value: statementsResult.error
              ? "Unavailable"
              : formatMinorCurrency(totals.serviceFeeMinor),
            note: statementsResult.error
              ? "Retry when statement service recovers"
              : "Platform fee retained from gross",
          },
          {
            label: "Subsidy",
            value: statementsResult.error
              ? "Unavailable"
              : formatMinorCurrency(totals.subsidyMinor),
            note: statementsResult.error
              ? "Retry when statement service recovers"
              : "Support programs credited to driver",
          },
          {
            label: "Net",
            value: statementsResult.error
              ? "Unavailable"
              : formatMinorCurrency(totals.netMinor),
            note: statementsResult.error
              ? "Payout detail unavailable during degraded mode"
              : latestStatement
                ? `Latest payout ${latestStatement.payoutStatus}`
                : "Awaiting statement generation",
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
            <p style={eyebrowStyle}>Earnings</p>
            <h3 style={{ margin: 0 }}>Statement history</h3>
          </div>
          <span style={mutedCopyStyle}>Read-only by design</span>
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={tableCellStyle}>Period</th>
              <th style={tableCellStyle}>Statement</th>
              <th style={tableCellStyle}>Fee plan</th>
              <th style={tableCellStyle}>Gross</th>
              <th style={tableCellStyle}>Service fee</th>
              <th style={tableCellStyle}>Subsidy</th>
              <th style={tableCellStyle}>Net</th>
              <th style={tableCellStyle}>Status</th>
            </tr>
          </thead>
          <tbody>
            {statementsResult.error ? (
              <tr>
                <td colSpan={8} style={tableCellStyle}>
                  Driver statements could not be loaded. Retry when the
                  billing-settlement service recovers.
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
                  <td style={tableCellStyle}>{statement.payoutStatus}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} style={tableCellStyle}>
                  No statements generated yet for this driver.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <div style={footerLinksStyle}>
        <Link href="/drivers">
          <strong>Back to drivers</strong> Return to the registry list.
        </Link>
        <Link href="/revenue">
          <strong>Revenue overview</strong> Compare this drilldown against the
          fleet-wide settlement pulse.
        </Link>
      </div>
    </>
  );
}
