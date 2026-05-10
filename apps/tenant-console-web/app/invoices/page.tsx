import Link from "next/link";
import type {
  TenantBillingProfile,
  TenantInvoiceRecord,
} from "@drts/contracts";
import {
  CalloutPanel,
  PageHero,
  SurfaceCard,
} from "@/components/page-primitives";
import { getTenantClient } from "@/lib/api-client";
import {
  formatCount,
  formatDateInput,
  formatDateTime,
  formatMoney,
} from "@/lib/formatters";
import { summarizeInvoiceSourceDomains } from "@/lib/source-domain";

export const dynamic = "force-dynamic";

const PERIOD_LABEL_FORMATTER = new Intl.DateTimeFormat("en", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

type InvoicesData = {
  profile: TenantBillingProfile | null;
  invoices: TenantInvoiceRecord[];
  errors: string[];
};

async function loadInvoicesData(): Promise<InvoicesData> {
  const client = getTenantClient();
  const [profileResult, invoicesResult] = await Promise.allSettled([
    client.getBillingProfile() as Promise<TenantBillingProfile>,
    client.listInvoices() as Promise<TenantInvoiceRecord[]>,
  ]);

  const errors: string[] = [];

  if (profileResult.status === "rejected") {
    errors.push(
      `Billing profile: ${
        profileResult.reason instanceof Error
          ? profileResult.reason.message
          : "Unknown error"
      }`,
    );
  }

  if (invoicesResult.status === "rejected") {
    errors.push(
      `Invoices: ${
        invoicesResult.reason instanceof Error
          ? invoicesResult.reason.message
          : "Unknown error"
      }`,
    );
  }

  return {
    profile: profileResult.status === "fulfilled" ? profileResult.value : null,
    invoices: invoicesResult.status === "fulfilled" ? invoicesResult.value : [],
    errors,
  };
}

function toPeriodKey(value: string) {
  return value.slice(0, 7);
}

function formatPeriodLabel(invoice: TenantInvoiceRecord) {
  return PERIOD_LABEL_FORMATTER.format(new Date(invoice.periodStart));
}

function getInvoiceStatusClassName(status: TenantInvoiceRecord["status"]) {
  switch (status) {
    case "paid":
      return "status-chip is-active";
    case "issued":
      return "status-chip is-warning";
    case "draft":
    default:
      return "status-chip";
  }
}

function getInvoiceStatusDescription(status: TenantInvoiceRecord["status"]) {
  switch (status) {
    case "paid":
      return "Settled";
    case "issued":
      return "Published";
    case "draft":
    default:
      return "Pending publication";
  }
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const data = await loadInvoicesData();
  const resolvedSearchParams = await searchParams;
  const requestedPeriod = Array.isArray(resolvedSearchParams.period)
    ? resolvedSearchParams.period[0]
    : resolvedSearchParams.period;

  const allInvoices = [...data.invoices].sort((left, right) =>
    right.periodEnd.localeCompare(left.periodEnd),
  );
  const periodOptions = Array.from(
    new Set(allInvoices.map((invoice) => toPeriodKey(invoice.periodStart))),
  );
  const selectedPeriod =
    requestedPeriod && periodOptions.includes(requestedPeriod)
      ? requestedPeriod
      : null;
  const visibleInvoices = selectedPeriod
    ? allInvoices.filter(
        (invoice) => toPeriodKey(invoice.periodStart) === selectedPeriod,
      )
    : allInvoices;
  const latestInvoice = visibleInvoices[0] ?? allInvoices[0] ?? null;
  const totalLineCount = visibleInvoices.reduce(
    (count, invoice) => count + invoice.lines.length,
    0,
  );
  const downloadReadyCount = visibleInvoices.filter((invoice) =>
    Boolean(invoice.artifactUrl),
  ).length;
  const openInvoiceCount = visibleInvoices.filter(
    (invoice) => invoice.status !== "paid",
  ).length;
  const sourceSummary =
    visibleInvoices.length > 0
      ? summarizeInvoiceSourceDomains({
          lines: visibleInvoices.flatMap((invoice) => invoice.lines),
        })
      : null;

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Billing & invoices"
        title="Tenant invoices now read from published billing profile and invoice contracts."
        description="This route keeps the billing recipient, monthly invoice rows, and signed artifact readiness grounded in `/api/tenant/billing/profile` and `/api/tenant/invoices` without inventing due-date or expiry fields that the contract does not publish."
      />

      {data.errors.length > 0 ? (
        <CalloutPanel
          title="Some finance data could not be loaded"
          description="The route keeps partial contract-backed content visible when possible and surfaces transport failures explicitly instead of falling back to UI-local truth."
          tone="warning"
        >
          <ul className="panel-list">
            {data.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </CalloutPanel>
      ) : null}

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">
            {selectedPeriod ? `Period ${selectedPeriod}` : "Latest period"}
          </span>
          <strong>
            {latestInvoice ? formatMoney(latestInvoice.amount) : "No invoices"}
          </strong>
          <p>
            {latestInvoice
              ? `${formatPeriodLabel(latestInvoice)} invoice snapshot is currently in focus.`
              : "No invoice row is currently published for this tenant scope."}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Visible invoices</span>
          <strong>{formatCount(visibleInvoices.length)}</strong>
          <p>
            {selectedPeriod
              ? "Filtered to the selected period from the published invoice list."
              : "All published invoice rows currently visible to the tenant scope."}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Invoice lines</span>
          <strong>{formatCount(totalLineCount)}</strong>
          <p>
            Line count is derived from the published invoice record instead of a
            UI-local monthly total.
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Artifact ready</span>
          <strong>{formatCount(downloadReadyCount)}</strong>
          <p>
            {openInvoiceCount > 0
              ? `${formatCount(openInvoiceCount)} invoice(s) remain in draft or issued status.`
              : "Every visible invoice is already settled as paid."}
          </p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Billing profile"
          title="Published billing recipient"
          description="Invoice title, recipient, tax, and address details come directly from `/api/tenant/billing/profile`."
        >
          {data.profile ? (
            <dl className="definition-grid">
              <div>
                <dt>Invoice title</dt>
                <dd>{data.profile.invoiceTitle}</dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>{data.profile.contactName ?? "Not published"}</dd>
              </div>
              <div>
                <dt>Billing email</dt>
                <dd>{data.profile.email}</dd>
              </div>
              <div>
                <dt>Tax ID</dt>
                <dd>{data.profile.taxId ?? "Not published"}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{data.profile.address ?? "Not published"}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatDateTime(data.profile.updatedAt)}</dd>
              </div>
            </dl>
          ) : (
            <div className="empty-panel">
              Billing profile data is not currently available for this tenant.
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard
          kicker="Period focus"
          title="Client-side period framing"
          description="The published tenant invoice contract returns the full list, so this route scopes period focus locally without inventing a new backend filter."
        >
          <div className="panel-stack">
            <div className="chip-row">
              <Link
                className={`status-chip${selectedPeriod === null ? " is-active" : ""}`}
                href="/invoices"
              >
                All periods
                <span>{formatCount(allInvoices.length)}</span>
              </Link>
              {periodOptions.map((period) => (
                <Link
                  className={`status-chip${selectedPeriod === period ? " is-active" : ""}`}
                  href={`/invoices?period=${encodeURIComponent(period)}`}
                  key={period}
                >
                  {period}
                </Link>
              ))}
            </div>
            {latestInvoice?.artifactUrl ? (
              <p>
                Latest signed artifact:{" "}
                <a
                  className="text-link"
                  href={latestInvoice.artifactUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Download {latestInvoice.invoiceId}
                </a>
              </p>
            ) : (
              <p className="muted-copy">
                No signed artifact is currently published for the focused
                invoice row.
              </p>
            )}
            {sourceSummary ? (
              <p className="muted-copy">
                {sourceSummary.badge}: {sourceSummary.detail}
              </p>
            ) : null}
          </div>
        </SurfaceCard>
      </section>

      {sourceSummary?.badge === "External finance authority present" ? (
        <CalloutPanel
          title="External settlement authority stays visible but unchanged"
          description="Tenant billing can mirror audit-safe amounts while settlement ownership, reconciliation, payout, and receipt issuance remain on the external-platform or finance operations lanes."
          tone="warning"
        >
          <p>{sourceSummary.detail}</p>
        </CalloutPanel>
      ) : null}

      <SurfaceCard
        kicker="Register"
        title={`Showing ${formatCount(visibleInvoices.length)} invoice row(s)`}
        description="The shipped route swaps the artboard's unpublished due-date column for contract-safe line-count and artifact-readiness cues."
      >
        <div className="table-wrap">
          <table className="data-grid">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Period</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Lines</th>
                <th>Source</th>
                <th>Artifact</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {visibleInvoices.map((invoice) => {
                const invoiceSourceSummary =
                  summarizeInvoiceSourceDomains(invoice);

                return (
                  <tr key={invoice.invoiceId}>
                    <td>
                      <div className="table-primary">
                        <strong>{invoice.invoiceId}</strong>
                        <span className="table-secondary">
                          Pricing {invoice.pricingVersionSnapshot}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        {formatPeriodLabel(invoice)}
                        <span className="table-secondary">
                          {formatDateInput(invoice.periodStart)} to{" "}
                          {formatDateInput(invoice.periodEnd)}
                        </span>
                      </div>
                    </td>
                    <td>{formatMoney(invoice.amount)}</td>
                    <td>
                      <div className="table-primary">
                        <span
                          className={getInvoiceStatusClassName(invoice.status)}
                        >
                          {invoice.status}
                        </span>
                        <span className="table-secondary">
                          {getInvoiceStatusDescription(invoice.status)}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        {formatCount(invoice.lines.length)}
                        <span className="table-secondary">
                          order-linked row(s)
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="table-primary">
                        {invoiceSourceSummary.badge}
                        <span className="table-secondary">
                          {invoiceSourceSummary.detail}
                        </span>
                      </div>
                    </td>
                    <td>
                      {invoice.artifactUrl ? (
                        <a
                          className="text-link"
                          href={invoice.artifactUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          Download artifact
                        </a>
                      ) : (
                        <span className="muted-copy">Not published</span>
                      )}
                    </td>
                    <td>{formatDateTime(invoice.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {visibleInvoices.length === 0 ? (
          <div className="empty-panel">
            No invoice matched the current period filter. Clear the filter to
            return to the published tenant invoice list.
          </div>
        ) : null}
      </SurfaceCard>

      <CalloutPanel
        title="Signed artifact boundary"
        description="Invoice download links are treated as short-lived signed URLs. This surface uses the published `artifactUrl` only and does not infer hidden expiry metadata, dispute state, or reconciliation outcomes."
      />
    </div>
  );
}
