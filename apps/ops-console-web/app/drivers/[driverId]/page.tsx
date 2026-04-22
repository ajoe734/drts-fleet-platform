import Link from "next/link";
import { notFound } from "next/navigation";
import type { DriverStatementRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
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
      <main className="app-grid">
        <AppShellCard
          title="Driver Earnings"
          description={`Unable to load driver registry data for ${driverId}.`}
        >
          <div className="error-banner">
            <strong>Driver registry unavailable:</strong> {driversResult.error}
          </div>
          <p className="read-only-copy">
            This is a degraded read-only state. The driver may exist, but ops
            cannot verify it until the registry endpoint recovers.
          </p>
          <div className="footer-links">
            <Link className="route-link" href="/drivers">
              <strong>Back to drivers</strong> Return to the registry and retry
              once the API recovers.
            </Link>
            <Link className="route-link" href="/revenue">
              <strong>Revenue overview</strong> Compare fleet-wide revenue while
              registry data is degraded.
            </Link>
          </div>

          <style jsx>{`
            .error-banner,
            .footer-links {
              display: grid;
              gap: 0.75rem;
            }
            .error-banner {
              margin-bottom: 1rem;
              padding: 0.75rem 1rem;
              border-radius: 0.75rem;
              background: #fef2f2;
              color: #b91c1c;
            }
            .read-only-copy {
              color: #64748b;
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
    <main className="app-grid">
      <AppShellCard
        title="Driver Earnings"
        description={`Read-only ops drilldown for ${driver.name} (${driver.driverId}). Mirrors billing-settlement statements with the gross, service fee, subsidy, and net values required by OC-017.`}
      >
        {statementsResult.error && (
          <div className="error-banner">
            <strong>Settlement data unavailable:</strong>{" "}
            {statementsResult.error}
          </div>
        )}
        <section className="hero">
          <div className="identity-card">
            <p className="eyebrow">Driver</p>
            <h2>{driver.name}</h2>
            <div className="meta-list">
              <span className="meta-pill">{driver.driverId}</span>
              <span className="meta-pill">{driver.workState}</span>
              <span className="meta-pill">
                {driver.licensesValid ? "licenses valid" : "license review"}
              </span>
            </div>
          </div>
          <div className="identity-card">
            <p className="eyebrow">Ops Note</p>
            <p className="read-only-copy">
              Earnings are read-only in ops console. Statement generation and
              payout actions remain in finance workflows.
            </p>
          </div>
        </section>

        <section className="summary-grid">
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
            <div key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
              <small>{card.note}</small>
            </div>
          ))}
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Earnings</p>
              <h3>Statement history</h3>
            </div>
            <span className="panel-note">Read-only by design</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Statement</th>
                <th>Fee plan</th>
                <th>Gross</th>
                <th>Service fee</th>
                <th>Subsidy</th>
                <th>Net</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {statementsResult.error ? (
                <tr>
                  <td colSpan={8}>
                    Driver statements could not be loaded. Retry when the
                    billing-settlement service recovers.
                  </td>
                </tr>
              ) : driverStatements.length > 0 ? (
                driverStatements.map((statement) => (
                  <tr key={statement.statementId}>
                    <td>{statement.periodMonth}</td>
                    <td>
                      <div>{statement.receiptNo}</div>
                      <small className="row-meta">
                        {statement.statementId}
                      </small>
                    </td>
                    <td>{statement.feePlanVersion}</td>
                    <td>
                      {formatMinorCurrency(statement.grossEarning.amountMinor)}
                    </td>
                    <td>
                      {formatMinorCurrency(statement.serviceFee.amountMinor)}
                    </td>
                    <td>
                      {formatMinorCurrency(statement.subsidy.amountMinor)}
                    </td>
                    <td>
                      {formatMinorCurrency(statement.netAmount.amountMinor)}
                    </td>
                    <td>{statement.payoutStatus}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    No driver statements available yet for this driver.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="footer-links">
          <Link className="route-link" href="/drivers">
            <strong>Back to drivers</strong> Return to the registry and select a
            different driver.
          </Link>
          <Link className="route-link" href="/revenue">
            <strong>Revenue overview</strong> Compare statement detail against
            fleet-wide revenue pulse.
          </Link>
        </div>

        <style jsx>{`
          .hero,
          .summary-grid,
          .meta-list,
          .footer-links,
          .error-banner {
            display: grid;
            gap: 0.75rem;
          }
          .error-banner {
            margin-bottom: 1rem;
            padding: 0.75rem 1rem;
            border-radius: 0.75rem;
            background: #fef2f2;
            color: #b91c1c;
          }
          .hero {
            grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
            margin-bottom: 1rem;
          }
          .identity-card,
          .summary-card,
          .panel {
            padding: 1rem;
            border-radius: 1rem;
            border: 1px solid #e2e8f0;
            background: #fff;
          }
          .summary-grid {
            grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
            margin-bottom: 1rem;
          }
          .summary-card {
            background: #f8fafc;
          }
          .summary-card strong {
            display: block;
            margin: 0.35rem 0;
            font-size: 1.4rem;
          }
          .eyebrow,
          .panel-note,
          .read-only-copy,
          .row-meta {
            color: #64748b;
          }
          .eyebrow {
            margin: 0 0 0.25rem;
            font-size: 0.75rem;
            letter-spacing: 0.08em;
            text-transform: uppercase;
          }
          .identity-card h2,
          .panel h3 {
            margin: 0;
          }
          .meta-list {
            grid-auto-flow: column;
            grid-auto-columns: max-content;
            overflow-x: auto;
            margin-top: 0.75rem;
          }
          .meta-pill {
            display: inline-flex;
            padding: 0.35rem 0.65rem;
            border-radius: 999px;
            background: #eff6ff;
            color: #1d4ed8;
            font-size: 0.875rem;
          }
          .panel-head {
            display: flex;
            justify-content: space-between;
            gap: 1rem;
            align-items: flex-start;
            margin-bottom: 0.75rem;
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
