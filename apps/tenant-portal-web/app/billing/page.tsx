import Link from "next/link";
import type { MoneyAmount, TenantInvoiceRecord } from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

function formatMoney(amount: MoneyAmount | null | undefined): string {
  if (!amount) {
    return "-";
  }
  return `${amount.currency} ${(amount.amountMinor / 100).toFixed(2)}`;
}

export default async function BillingPage() {
  const client = getTenantClient();

  let profile: Record<string, unknown> | null = null;
  let invoices: TenantInvoiceRecord[] = [];
  let error: string | null = null;

  try {
    const [profileData, invoiceData] = await Promise.all([
      client.getBillingProfile() as Promise<Record<string, unknown>>,
      client.listInvoices(),
    ]);
    profile = profileData;
    invoices = invoiceData;
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error";
  }

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
            <pre>{JSON.stringify(profile, null, 2)}</pre>
          </div>
        )}

        {invoices.length > 0 ? (
          <div className="data-table">
            <h3>Invoices</h3>
            <table>
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Billing Period</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.invoiceId}>
                    <td>{invoice.invoiceId}</td>
                    <td>{invoice.status}</td>
                    <td>{formatMoney(invoice.amount)}</td>
                    <td>
                      {new Date(invoice.periodStart).toLocaleDateString()} -{" "}
                      {new Date(invoice.periodEnd).toLocaleDateString()}
                    </td>
                    <td>{new Date(invoice.updatedAt).toLocaleString()}</td>
                  </tr>
                ))}
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
