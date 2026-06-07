import Link from "next/link";
import type {
  MoneyAmount,
  TenantBillingProfile,
  TenantInvoiceRecord,
} from "@drts/contracts";
import { AppShellCard } from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";
import { formatPortalUiError, toPortalErrorMessage } from "@/lib/error-copy";
import { summarizeInvoiceSourceDomains } from "@/lib/source-domain";

function formatMoney(amount: MoneyAmount | null | undefined): string {
  if (!amount) {
    return "-";
  }
  return `${amount.currency} ${(amount.amountMinor / 100).toFixed(2)}`;
}

function formatInvoiceStatus(status: string): string {
  switch (status) {
    case "issued":
      return "已開立";
    case "paid":
      return "已付款";
    case "pending":
      return "待處理";
    case "overdue":
      return "已逾期";
    default:
      return status;
  }
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
    error = formatPortalUiError(toPortalErrorMessage(e), "無法載入計費資料");
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
        title="計費"
        description={`資料來自租戶計費資料與發票端點，目前共有 ${invoices.length} 份發票。`}
      >
        {error && (
          <div className="error-banner">
            <strong>錯誤：</strong> {error}
          </div>
        )}

        {profile && (
          <div className="billing-profile">
            <h3>計費資料</h3>
            <table style={{ width: "100%" }}>
              <tbody>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    發票抬頭
                  </td>
                  <td>{profile.invoiceTitle}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    聯絡人
                  </td>
                  <td>{profile.contactName ?? "-"}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    計費電子郵件
                  </td>
                  <td>{profile.email}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    統一編號
                  </td>
                  <td>{profile.taxId ?? "-"}</td>
                </tr>
                <tr>
                  <td style={{ fontWeight: "bold", paddingRight: "1rem" }}>
                    來源領域說明
                  </td>
                  <td>
                    DRTS 自營明細會由平台財務結算；若是外部履約或僅鏡像的資料
                    列，也會在此保留顯示，同時維持其外部財務權限脈絡。
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {invoiceSummary?.badge === "存在外部財務權限" ? (
          <article className="callout-panel is-warning">
            <strong>轉送財務權限仍在外部</strong>
            <p>{invoiceSummary.detail}</p>
            <p>
              租戶計費可以鏡射可供稽核的金額，但結算、收據歸屬、撥款與對帳
              仍會留在外部平台或營運權限路徑。
            </p>
          </article>
        ) : null}

        {invoices.length > 0 ? (
          <div className="data-table">
            <h3>發票</h3>
            <table>
              <thead>
                <tr>
                  <th>發票 ID</th>
                  <th>狀態</th>
                  <th>金額</th>
                  <th>來源領域</th>
                  <th>計費期間</th>
                  <th>更新時間</th>
                  <th>下載</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const sourceSummary = summarizeInvoiceSourceDomains(invoice);
                  return (
                    <tr key={invoice.invoiceId}>
                      <td>{invoice.invoiceId}</td>
                      <td>{formatInvoiceStatus(invoice.status)}</td>
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
                            下載
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
          <p className="empty-state">目前租戶沒有可顯示的發票。</p>
        )}

        <Link className="route-link" href="/">
          <strong>返回首頁</strong>
          回到租戶入口總覽。
        </Link>
      </AppShellCard>
    </main>
  );
}
