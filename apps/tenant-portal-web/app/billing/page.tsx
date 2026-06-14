import Link from "next/link";
import type {
  TenantBillingProfile,
  TenantInvoiceRecord,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatMoney } from "@/lib/booking-domain";
import { summarizeInvoiceSourceDomains } from "@/lib/source-domain";
import { getServerLocale } from "@/lib/server-locale";
import { t } from "@/lib/translations";

export default async function BillingPage() {
  const locale = await getServerLocale();
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
    error = e instanceof Error ? e.message : t("billing.error.unknown", locale);
  }

  const invoiceSummary =
    invoices.length > 0
      ? summarizeInvoiceSourceDomains(
          {
            lines: invoices.flatMap((invoice) => invoice.lines),
          },
          locale,
        )
      : null;

  return (
    <main className="app-grid">
      <AppShellCard
        title={t("billing.title", locale)}
        description={t("billing.description", locale, {
          count: invoices.length,
        })}
      >
        {error && (
          <div className="error-banner">
            <strong>{t("billing.error.label", locale)}</strong> {error}
          </div>
        )}

        {profile && (
          <div className="billing-profile">
            <h3>{t("billing.profile.heading", locale)}</h3>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    {t("billing.profile.invoiceTitle", locale)}
                  </td>
                  <td>{profile.invoiceTitle}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    {t("billing.profile.contact", locale)}
                  </td>
                  <td>{profile.contactName ?? "-"}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    {t("billing.profile.billingEmail", locale)}
                  </td>
                  <td>{profile.email}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    {t("billing.profile.taxId", locale)}
                  </td>
                  <td>{profile.taxId ?? "-"}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    {t("billing.profile.sourceDomainNote.label", locale)}
                  </td>
                  <td>{t("billing.profile.sourceDomainNote.body", locale)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {invoiceSummary?.badge ===
        t("source.summary.externalFinance.badge", locale) ? (
          <article className="callout-panel is-warning">
            <strong>{t("billing.forwardedAuthority.heading", locale)}</strong>
            <p>{invoiceSummary.detail}</p>
            <p>{t("billing.forwardedAuthority.body", locale)}</p>
          </article>
        ) : null}

        {invoices.length > 0 ? (
          <div className="data-table">
            <h3>{t("billing.invoices.heading", locale)}</h3>
            <table>
              <thead>
                <tr>
                  <th>{t("billing.invoices.column.invoiceId", locale)}</th>
                  <th>{t("billing.invoices.column.status", locale)}</th>
                  <th>{t("billing.invoices.column.amount", locale)}</th>
                  <th>{t("billing.invoices.column.sourceDomain", locale)}</th>
                  <th>{t("billing.invoices.column.billingPeriod", locale)}</th>
                  <th>{t("billing.invoices.column.updated", locale)}</th>
                  <th>{t("billing.invoices.column.download", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const sourceSummary = summarizeInvoiceSourceDomains(
                    invoice,
                    locale,
                  );
                  return (
                    <tr key={invoice.invoiceId}>
                      <td>{invoice.invoiceId}</td>
                      <td>{invoice.status}</td>
                      <td>{formatMoney(invoice.amount, locale)}</td>
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
                            {t("billing.invoices.download", locale)}
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
          <p className="empty-state">{t("billing.invoices.empty", locale)}</p>
        )}

        <Link className="route-link" href="/">
          <strong>{t("billing.backHome.label", locale)}</strong>
          {t("billing.backHome.description", locale)}
        </Link>
      </AppShellCard>
    </main>
  );
}
