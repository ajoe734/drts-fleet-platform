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
import { formatCount, formatDateTime, formatMoney } from "@/lib/formatters";

export const dynamic = "force-dynamic";

type BillingPageData = {
  profile: TenantBillingProfile | null;
  invoices: TenantInvoiceRecord[];
  errors: string[];
};

async function loadBillingPageData(): Promise<BillingPageData> {
  const client = getTenantClient();
  const [profileResult, invoicesResult] = await Promise.allSettled([
    client.getBillingProfile() as Promise<TenantBillingProfile>,
    client.listInvoices() as Promise<TenantInvoiceRecord[]>,
  ]);

  const errors: string[] = [];

  if (profileResult.status === "rejected") {
    errors.push(
      profileResult.reason instanceof Error
        ? profileResult.reason.message
        : "Unable to load billing profile.",
    );
  }

  if (invoicesResult.status === "rejected") {
    errors.push(
      invoicesResult.reason instanceof Error
        ? invoicesResult.reason.message
        : "Unable to load tenant invoices.",
    );
  }

  return {
    profile: profileResult.status === "fulfilled" ? profileResult.value : null,
    invoices: invoicesResult.status === "fulfilled" ? invoicesResult.value : [],
    errors,
  };
}

export default async function BillingPage() {
  const data = await loadBillingPageData();
  const openInvoices = data.invoices.filter(
    (invoice) => invoice.status !== "paid",
  );
  const latestInvoice = [...data.invoices].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )[0];

  return (
    <div className="page-shell">
      <PageHero
        eyebrow="Billing"
        title="Tenant billing now has its own overview route in the rebuild."
        description="The route combines billing profile ownership with invoice visibility so finance and tenant admins can understand where artifacts, contacts, and outstanding balances stand before drilling into `/invoices`."
      />

      <section className="metric-grid">
        <article className="metric-card">
          <span className="metric-label">Invoices</span>
          <strong>{formatCount(data.invoices.length)}</strong>
          <p>
            {formatCount(openInvoices.length)} invoice(s) are not yet marked
            paid.
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-label">Latest update</span>
          <strong>
            {latestInvoice ? formatDateTime(latestInvoice.updatedAt) : "—"}
          </strong>
          <p>Most recent invoice artifact visible to the tenant realm.</p>
        </article>
      </section>

      <section className="surface-grid surface-grid-wide">
        <SurfaceCard
          kicker="Profile"
          title="Billing authority context"
          description="Invoice title, tax ID, contact owner, and billing email stay bound to the canonical tenant billing profile."
        >
          {data.profile ? (
            <dl className="definition-grid">
              <div>
                <dt>Invoice title</dt>
                <dd>{data.profile.invoiceTitle}</dd>
              </div>
              <div>
                <dt>Contact</dt>
                <dd>{data.profile.contactName ?? "Not set"}</dd>
              </div>
              <div>
                <dt>Billing email</dt>
                <dd>{data.profile.email}</dd>
              </div>
              <div>
                <dt>Tax ID</dt>
                <dd>{data.profile.taxId ?? "Not set"}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{data.profile.address ?? "Not set"}</dd>
              </div>
              <div>
                <dt>Updated at</dt>
                <dd>{formatDateTime(data.profile.updatedAt)}</dd>
              </div>
            </dl>
          ) : (
            <div className="empty-panel">
              Billing profile data is not available.
            </div>
          )}
        </SurfaceCard>

        <SurfaceCard
          kicker="Invoices"
          title={`Recent invoice artifacts (${formatCount(data.invoices.length)})`}
          description="Invoice detail remains available from `/invoices`; this overview focuses on payment posture and artifact availability."
        >
          {data.invoices.length > 0 ? (
            <div className="table-wrap">
              <table className="data-grid">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Period</th>
                    <th>Artifact</th>
                  </tr>
                </thead>
                <tbody>
                  {data.invoices.slice(0, 8).map((invoice) => (
                    <tr key={invoice.invoiceId}>
                      <td>
                        <div className="table-primary">
                          <span>{invoice.invoiceId}</span>
                          <span className="table-secondary">
                            Updated {formatDateTime(invoice.updatedAt)}
                          </span>
                        </div>
                      </td>
                      <td>{invoice.status}</td>
                      <td>{formatMoney(invoice.amount)}</td>
                      <td>
                        {formatDateTime(invoice.periodStart)} to{" "}
                        {formatDateTime(invoice.periodEnd)}
                      </td>
                      <td>{invoice.artifactUrl ? "Available" : "Pending"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-panel">
              No tenant invoice artifacts were returned.
            </div>
          )}
        </SurfaceCard>
      </section>

      {data.errors.length > 0 ? (
        <CalloutPanel
          title="Partial data warning"
          description="Billing profile and invoice reads are independent; this route keeps the successful slice visible when one call fails."
          tone="warning"
        >
          <ul className="panel-list">
            {data.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </CalloutPanel>
      ) : null}
    </div>
  );
}
