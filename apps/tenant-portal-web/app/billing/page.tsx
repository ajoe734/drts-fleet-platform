import Link from "next/link";
import type {
  MoneyAmount,
  TenantBillingProfile,
  TenantInvoiceRecord,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { summarizeInvoiceSourceDomains } from "@/lib/source-domain";

function formatMoney(amount: MoneyAmount | null | undefined): string {
  if (!amount) {
    return "-";
  }
  return `${amount.currency} ${(amount.amountMinor / 100).toFixed(2)}`;
}

export default async function BillingPage() {
  const client = await getTenantClient();

  let profile: TenantBillingProfile | null = null;
  let invoices: TenantInvoiceRecord[] = [];
  let error: string | null = null;

  try {
    const [profileData, invoiceData] = await Promise.all([
      client.getBillingProfile(),
      client.listInvoices(),
    ]);
    profile = profileData;
    invoices = invoiceData;
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

  const invoiceSummary =
    invoices.length > 0
      ? summarizeInvoiceSourceDomains({
          lines: invoices.flatMap((invoice) => invoice.lines),
        })
      : null;

  return (
    <main className="app-grid">
      <AppShellCard
        title="Billing"
        description={`Fetched from /api/tenant/billing/profile and /api/tenant/invoices. ${invoices.length} invoice(s) found.`}
      >
        {error && (
          <div className="error-banner">
            <strong>Error:</strong> {error}
          </div>
        )}

        {profile && (
          <div className="billing-profile">
            <h3>Billing Profile</h3>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Invoice Title
                  </td>
                  <td>{profile.invoiceTitle}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Contact
                  </td>
                  <td>{profile.contactName ?? "-"}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Billing Email
                  </td>
                  <td>{profile.email}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Tax ID
                  </td>
                  <td>{profile.taxId ?? "-"}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    Source-Domain Note
                  </td>
                  <td>
                    DRTS-operated lines bill through platform finance. Any
                    externally fulfilled or shadow-only lines stay visible here
                    with their external finance authority preserved.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {invoiceSummary?.badge === "External finance authority present" ? (
          <article className="callout-panel is-warning">
            <strong>Forwarded finance authority remains external</strong>
            <p>{invoiceSummary.detail}</p>
            <p>
              Tenant billing can mirror audit-safe amounts, but settlement,
              receipt ownership, payout, and reconciliation remain on the
              external-platform or ops authority lanes.
            </p>
          </article>
        ) : null}

        {invoices.length > 0 ? (
          <div className="data-table">
            <h3>Invoices</h3>
            <table>
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Source Domain</th>
                  <th>Billing Period</th>
                  <th>Updated</th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const sourceSummary = summarizeInvoiceSourceDomains(invoice);
                  return (
                    <tr key={invoice.invoiceId}>
                      <td>{invoice.invoiceId}</td>
                      <td>{invoice.status}</td>
                      <td>{formatMoney(invoice.amount)}</td>
                      <td>
                        <strong>{sourceSummary.badge}</strong>
                        <div className="source-detail">
                          {sourceSummary.detail}
                        </div>
                      </td>
                      <td>
                        {new Date(invoice.periodStart).toLocaleDateString()} -{" "}
                        {new Date(invoice.periodEnd).toLocaleDateString()}
                      </td>
                      <td>{new Date(invoice.updatedAt).toLocaleString()}</td>
                      <td>
                        {invoice.artifactUrl ? (
                          <a
                            href={invoice.artifactUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Download
                          </a>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-state">
            No invoices found for the current tenant.
          </p>
        )}

        <Link className="route-link" href="/">
          <strong>Back to home</strong>
          Return to the tenant portal overview.
        </Link>
      </AppShellCard>
    </main>
  );
}
