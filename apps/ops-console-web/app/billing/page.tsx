import type { CSSProperties } from "react";
import type { MoneyAmount, TenantInvoiceRecord } from "@drts/contracts";
import { getServerOpsClient } from "../../lib/api-client.server";
import { getServerLocale } from "../../lib/server-locale";
import { t, type Locale } from "../../lib/translations";

type BillingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const panelStyle: CSSProperties = {
  padding: 20,
  border: "1px solid var(--border, #334155)",
  borderRadius: 12,
};

function money(amount: MoneyAmount, locale: Locale): string {
  return `${amount.currency} ${new Intl.NumberFormat(
    locale === "zh" ? "zh-TW" : "en-US",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  ).format(amount.amountMinor / 100)}`;
}

export default async function BillingPage({ searchParams }: BillingPageProps) {
  const locale = await getServerLocale();
  const params = (await searchParams) ?? {};
  const selected = Array.isArray(params.orderId)
    ? params.orderId[0]
    : params.orderId;
  const orderId = selected?.trim() ?? "";
  let invoices: TenantInvoiceRecord[] | null = null;
  try {
    const client = await getServerOpsClient();
    invoices = await client.listPlatformInvoices();
  } catch {
    // A failed authorized read is not an empty invoice register.
  }
  const matches = invoices?.filter(
    (invoice) =>
      !orderId || invoice.lines.some((line) => line.orderId === orderId),
  );
  const refreshHref = orderId
    ? `/billing?orderId=${encodeURIComponent(orderId)}`
    : "/billing";

  return (
    <main style={{ padding: 24, display: "grid", gap: 20 }}>
      <header>
        <h1>{t("billing.title", locale)}</h1>
        <p>{t("billing.description", locale)}</p>
      </header>
      <form action="/billing" method="get" style={panelStyle}>
        <label htmlFor="billing-order-id">{t("billing.orderId", locale)}</label>
        <input id="billing-order-id" name="orderId" defaultValue={orderId} />
        <button type="submit">{t("billing.search", locale)}</button>
        <a href="/billing">{t("billing.clear", locale)}</a>{" "}
        <a href={refreshHref}>{t("billing.refresh", locale)}</a>
      </form>
      <p>{t("billing.boundary", locale)}</p>
      {invoices === null ? (
        <p role="alert">{t("billing.error", locale)}</p>
      ) : matches?.length === 0 ? (
        <p role="status">
          {t(orderId ? "billing.noMatch" : "billing.empty", locale)}
        </p>
      ) : (
        matches?.map((invoice) => {
          const lines = orderId
            ? invoice.lines.filter((line) => line.orderId === orderId)
            : invoice.lines;
          return (
            <details
              key={invoice.invoiceId}
              open={Boolean(orderId)}
              style={panelStyle}
              data-invoice-id={invoice.invoiceId}
            >
              <summary>
                {t("billing.invoiceId", locale)}: {invoice.invoiceId}
              </summary>
              <dl>
                <dt>{t("billing.tenantId", locale)}</dt>
                <dd>{invoice.tenantId}</dd>
                <dt>{t("billing.period", locale)}</dt>
                <dd>
                  {invoice.periodStart} – {invoice.periodEnd}
                </dd>
                <dt>{t("billing.status", locale)}</dt>
                <dd>{invoice.status}</dd>
                <dt>{t("billing.invoiceTotal", locale)}</dt>
                <dd>{money(invoice.amount, locale)}</dd>
              </dl>
              {lines.length === 0 ? (
                <p>{t("billing.noLines", locale)}</p>
              ) : (
                <table>
                  <caption>{t("billing.lines", locale)}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("billing.orderId", locale)}</th>
                      <th scope="col">
                        {t("billing.descriptionColumn", locale)}
                      </th>
                      <th scope="col">{t("billing.lineAmount", locale)}</th>
                      <th scope="col">{t("billing.partnerEntry", locale)}</th>
                      <th scope="col">{t("billing.originalOrder", locale)}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.lineId} data-order-id={line.orderId}>
                        <td>{line.orderId}</td>
                        <td>{line.description}</td>
                        <td>{money(line.amount, locale)}</td>
                        <td>{line.partnerEntrySlug ?? "—"}</td>
                        <td>
                          <a
                            href={`/dispatch/${encodeURIComponent(line.orderId)}`}
                          >
                            {t("billing.originalOrder", locale)}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {invoice.artifactUrl ? (
                <a href={invoice.artifactUrl}>
                  {t("billing.download", locale)}
                </a>
              ) : null}
            </details>
          );
        })
      )}
    </main>
  );
}
