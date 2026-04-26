/**
 * Finance Console
 * Platform-admin surface for invoice, statement, and reimbursement flows.
 */

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import type {
  DriverStatementRecord,
  ReimbursementBatchRecord,
  TenantInvoiceRecord,
} from "@drts/contracts";

const DEMO_TENANT_ID = "tenant-demo-001";

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getPreviousMonthDefaults() {
  const now = new Date();
  const firstDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
  );
  const lastDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
  );
  return {
    periodStart: toDateInputValue(firstDay),
    periodEnd: toDateInputValue(lastDay),
    periodMonth: `${firstDay.getUTCFullYear()}-${String(
      firstDay.getUTCMonth() + 1,
    ).padStart(2, "0")}`,
  };
}

function toPeriodStartIso(value: string) {
  return `${value}T00:00:00.000Z`;
}

function toPeriodEndIso(value: string) {
  return `${value}T23:59:59.000Z`;
}

function formatMoney(
  amount?: { amountMinor: number; currency: string } | null,
) {
  if (!amount) return "—";
  return `${amount.amountMinor.toLocaleString()} ${amount.currency}`;
}

function reimbursementWorkflow(
  locale: "en" | "zh",
  batch: ReimbursementBatchRecord,
) {
  if (batch.status === "paid") {
    return locale === "zh" ? "已付款" : "paid";
  }
  if (batch.approvedAt) {
    return locale === "zh" ? "已核准" : "approved";
  }
  return locale === "zh" ? "待核准" : "pending approval";
}

function paymentStatusLabel(locale: "en" | "zh", value: string) {
  if (locale !== "zh") return value;
  switch (value) {
    case "paid":
      return "已付款";
    case "issued":
      return "已開立";
    case "draft":
      return "草稿";
    default:
      return value;
  }
}

export default function PaymentsPage() {
  const client = usePlatformAdminClient();
  const { locale, t } = useTranslation();
  const defaults = getPreviousMonthDefaults();
  const [invoices, setInvoices] = useState<TenantInvoiceRecord[]>([]);
  const [statements, setStatements] = useState<DriverStatementRecord[]>([]);
  const [reimbursements, setReimbursements] = useState<
    ReimbursementBatchRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invoiceFilter, setInvoiceFilter] = useState<
    "all" | "paid" | "draft" | "issued"
  >("all");
  const [invoiceTenantId, setInvoiceTenantId] = useState(DEMO_TENANT_ID);
  const [invoicePeriodStart, setInvoicePeriodStart] = useState(
    defaults.periodStart,
  );
  const [invoicePeriodEnd, setInvoicePeriodEnd] = useState(defaults.periodEnd);
  const [statementPeriodMonth, setStatementPeriodMonth] = useState(
    defaults.periodMonth,
  );
  const [invoicePending, setInvoicePending] = useState(false);
  const [statementPending, setStatementPending] = useState(false);
  const [batchActionId, setBatchActionId] = useState<string | null>(null);
  const [remittanceProofs, setRemittanceProofs] = useState<
    Record<string, string>
  >({});

  const loadFinance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [invoiceRecords, statementRecords, reimbursementRecords] =
        await Promise.all([
          client.listPlatformInvoices(),
          client.listDriverStatements(),
          client.listReimbursementBatches(),
        ]);
      setInvoices(invoiceRecords ?? []);
      setStatements(statementRecords ?? []);
      setReimbursements(reimbursementRecords ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  async function handleGenerateInvoice(event: React.FormEvent) {
    event.preventDefault();
    setInvoicePending(true);
    setError(null);
    try {
      const tenantId = invoiceTenantId.trim() || DEMO_TENANT_ID;
      await client.post("/api/tenant/invoices/generate", {
        headers: {
          "x-tenant-id": tenantId,
        },
        body: {
          tenantId,
          periodStart: toPeriodStartIso(invoicePeriodStart),
          periodEnd: toPeriodEndIso(invoicePeriodEnd),
        },
      });
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInvoicePending(false);
    }
  }

  async function handleGenerateStatements(event: React.FormEvent) {
    event.preventDefault();
    setStatementPending(true);
    setError(null);
    try {
      await client.generateDriverStatements({
        periodMonth: statementPeriodMonth.trim(),
      });
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatementPending(false);
    }
  }

  async function handleApproveBatch(batch: ReimbursementBatchRecord) {
    setBatchActionId(batch.batchId);
    setError(null);
    try {
      await client.approveReimbursementBatch(batch.batchId, {
        statementId: batch.statementId,
      });
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchActionId(null);
    }
  }

  async function handleMarkPaid(batch: ReimbursementBatchRecord) {
    setBatchActionId(batch.batchId);
    setError(null);
    try {
      const proofId =
        remittanceProofs[batch.batchId]?.trim() ||
        `remit-${batch.batchId.slice(-8)}`;
      await client.markReimbursementPaid(batch.batchId, {
        remittanceProofId: proofId,
        paidAt: new Date().toISOString(),
      });
      setRemittanceProofs((current) => ({
        ...current,
        [batch.batchId]: proofId,
      }));
      await loadFinance();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBatchActionId(null);
    }
  }

  const filteredInvoices =
    invoiceFilter === "all"
      ? invoices
      : invoices.filter((invoice) => invoice.status === invoiceFilter);
  const totalInvoiceAmountMinor = filteredInvoices.reduce(
    (sum, invoice) => sum + (invoice.amount?.amountMinor ?? 0),
    0,
  );
  const totalStatementNetMinor = statements.reduce(
    (sum, statement) => sum + statement.netAmount.amountMinor,
    0,
  );
  const pendingReimbursementMinor = reimbursements
    .filter((batch) => batch.status !== "paid")
    .reduce((sum, batch) => sum + batch.totalAmount.amountMinor, 0);
  const paidReimbursementMinor = reimbursements
    .filter((batch) => batch.status === "paid")
    .reduce((sum, batch) => sum + batch.totalAmount.amountMinor, 0);

  if (loading) {
    return <div className="admin-empty">{t("payments.loading")}</div>;
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("payments.title")}</h1>
        <p>{t("payments.subtitle")}</p>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {t("common.error")}: {error}
          </p>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        {[
          {
            label: t("payments.invoiceTotal"),
            value: `${totalInvoiceAmountMinor.toLocaleString()} minor`,
            note: `${filteredInvoices.length} ${locale === "zh" ? "張發票" : "invoice(s) in current filter"}`,
          },
          {
            label: t("payments.statementNet"),
            value: `${totalStatementNetMinor.toLocaleString()} minor`,
            note: `${statements.length} ${locale === "zh" ? "筆司機結算單" : "driver statement(s)"}`,
          },
          {
            label: t("payments.pendingReimbursements"),
            value: `${pendingReimbursementMinor.toLocaleString()} minor`,
            note: t("payments.pendingReimbNote"),
          },
          {
            label: t("payments.paidReimbursements"),
            value: `${paidReimbursementMinor.toLocaleString()} minor`,
            note: t("payments.invoiceTotalNote"),
          },
        ].map((card) => (
          <div key={card.label} className="admin-card">
            <p
              style={{
                margin: "0 0 8px",
                fontSize: 13,
                color: "#6b7280",
              }}
            >
              {card.label}
            </p>
            <strong style={{ display: "block", fontSize: 22 }}>
              {card.value}
            </strong>
            <small style={{ color: "#6b7280" }}>{card.note}</small>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>{t("payments.generateInvoice")}</h3>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            {locale === "zh"
              ? "關帳期間的發票由後端生成，瀏覽器不計算金額。"
              : "Closed-period invoice generation stays server-side. No amount is calculated in the browser."}
          </p>
          <form onSubmit={handleGenerateInvoice}>
            <div style={formGridStyle}>
              <label style={labelStyle}>
                {t("payments.form.tenantId")}
                <input
                  value={invoiceTenantId}
                  onChange={(event) => setInvoiceTenantId(event.target.value)}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                {t("payments.form.periodStart")}
                <input
                  type="date"
                  value={invoicePeriodStart}
                  onChange={(event) =>
                    setInvoicePeriodStart(event.target.value)
                  }
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                {t("payments.form.periodEnd")}
                <input
                  type="date"
                  value={invoicePeriodEnd}
                  onChange={(event) => setInvoicePeriodEnd(event.target.value)}
                  style={inputStyle}
                />
              </label>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={invoicePending}
            >
              {invoicePending
                ? t("payments.generating")
                : t("payments.generateInvoice")}
            </button>
          </form>
        </div>

        <div className="admin-card">
          <h3 style={{ marginTop: 0 }}>{t("payments.generateStatements")}</h3>
          <p style={{ color: "#6b7280", fontSize: 14 }}>
            {locale === "zh"
              ? "需要先在定價頁發布有效的司機費用方案。"
              : "Requires an active published driver fee plan from the pricing page."}
          </p>
          <form onSubmit={handleGenerateStatements}>
            <div style={formGridStyle}>
              <label style={labelStyle}>
                {t("payments.form.periodMonth")}
                <input
                  value={statementPeriodMonth}
                  onChange={(event) =>
                    setStatementPeriodMonth(event.target.value)
                  }
                  placeholder="2026-03"
                  style={inputStyle}
                />
              </label>
            </div>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={statementPending}
            >
              {statementPending
                ? t("payments.generating")
                : t("payments.generateStatements")}
            </button>
          </form>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-toggle-group">
          {(["all", "paid", "issued", "draft"] as const).map((value) => (
            <button
              key={value}
              className={`admin-toggle-btn ${
                invoiceFilter === value ? "active" : ""
              }`}
              onClick={() => setInvoiceFilter(value)}
            >
              {value === "all"
                ? locale === "zh"
                  ? "全部"
                  : value
                : paymentStatusLabel(locale, value)}
            </button>
          ))}
        </div>
        <button
          className="admin-btn admin-btn--secondary"
          onClick={() => void loadFinance()}
        >
          {t("common.refresh")}
        </button>
      </div>

      <div
        className="admin-card"
        style={{ overflowX: "auto", marginBottom: 16 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{t("payments.tab.invoices")}</h3>
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            {filteredInvoices.length} {locale === "zh" ? "筆記錄" : "record(s)"}
          </span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("payments.col.invoice")}</th>
              <th>{t("payments.col.tenant")}</th>
              <th>{t("payments.col.amount")}</th>
              <th>{t("payments.col.status")}</th>
              <th>{locale === "zh" ? "定價快照" : "Pricing snapshot"}</th>
              <th>{t("payments.col.period")}</th>
              <th>{locale === "zh" ? "成品" : "Artifact"}</th>
            </tr>
          </thead>
          <tbody>
            {filteredInvoices.length > 0 ? (
              filteredInvoices.map((invoice) => (
                <tr key={invoice.invoiceId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    <div>{invoice.invoiceId}</div>
                    <div style={{ color: "#6b7280" }}>
                      {formatDateTime(invoice.createdAt)}
                    </div>
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {invoice.tenantId}
                  </td>
                  <td>{formatMoney(invoice.amount)}</td>
                  <td>
                    <span
                      className={`admin-badge ${
                        invoice.status === "paid"
                          ? "admin-badge--success"
                          : invoice.status === "draft"
                            ? "admin-badge--neutral"
                            : "admin-badge--warning"
                      }`}
                    >
                      {paymentStatusLabel(locale, invoice.status)}
                    </span>
                  </td>
                  <td>
                    <code>{invoice.pricingVersionSnapshot}</code>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {formatDateTime(invoice.periodStart)} —{" "}
                    {formatDateTime(invoice.periodEnd)}
                  </td>
                  <td>
                    {invoice.artifactUrl ? (
                      <a
                        href={invoice.artifactUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {locale === "zh" ? "下載 PDF" : "Download PDF"}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7}>{t("payments.noInvoices")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        className="admin-card"
        style={{ overflowX: "auto", marginBottom: 16 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{t("payments.tab.statements")}</h3>
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            {statements.length} {locale === "zh" ? "筆結算單" : "statement(s)"}
          </span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("payments.col.statement")}</th>
              <th>{t("payments.col.driver")}</th>
              <th>{t("payments.col.period")}</th>
              <th>{locale === "zh" ? "費用方案" : "Fee plan"}</th>
              <th>{locale === "zh" ? "毛額" : "Gross"}</th>
              <th>{locale === "zh" ? "服務費" : "Service fee"}</th>
              <th>{locale === "zh" ? "補貼" : "Subsidy"}</th>
              <th>{t("payments.col.net")}</th>
              <th>{locale === "zh" ? "出款" : "Payout"}</th>
            </tr>
          </thead>
          <tbody>
            {statements.length > 0 ? (
              statements.map((statement) => (
                <tr key={statement.statementId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    <div>{statement.receiptNo}</div>
                    <div style={{ color: "#6b7280" }}>
                      {statement.statementId}
                    </div>
                  </td>
                  <td>{statement.driverId}</td>
                  <td>{statement.periodMonth}</td>
                  <td>
                    <code>{statement.feePlanVersion}</code>
                  </td>
                  <td>{formatMoney(statement.grossEarning)}</td>
                  <td>{formatMoney(statement.serviceFee)}</td>
                  <td>{formatMoney(statement.subsidy)}</td>
                  <td>{formatMoney(statement.netAmount)}</td>
                  <td>
                    <span
                      className={`admin-badge ${
                        statement.payoutStatus === "paid"
                          ? "admin-badge--success"
                          : "admin-badge--warning"
                      }`}
                    >
                      {paymentStatusLabel(locale, statement.payoutStatus)}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9}>{t("payments.noStatements")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="admin-card" style={{ overflowX: "auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          <h3 style={{ margin: 0 }}>{t("payments.tab.reimbursements")}</h3>
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            {reimbursements.length} {locale === "zh" ? "批次" : "batch(es)"}
          </span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("payments.col.batch")}</th>
              <th>{t("payments.col.driver")}</th>
              <th>{t("payments.col.statement")}</th>
              <th>{locale === "zh" ? "總額" : "Total"}</th>
              <th>{locale === "zh" ? "流程" : "Workflow"}</th>
              <th>{locale === "zh" ? "匯款憑證" : "Remittance proof"}</th>
              <th>{locale === "zh" ? "項目" : "Items"}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {reimbursements.length > 0 ? (
              reimbursements.map((batch) => (
                <tr key={batch.batchId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    <div>{batch.batchId}</div>
                    <div style={{ color: "#6b7280" }}>{batch.periodMonth}</div>
                  </td>
                  <td>{batch.driverId}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {batch.statementId}
                  </td>
                  <td>{formatMoney(batch.totalAmount)}</td>
                  <td>
                    <div>{reimbursementWorkflow(locale, batch)}</div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {batch.approvedAt
                        ? `${locale === "zh" ? "核准於" : "Approved"} ${formatDateTime(batch.approvedAt)}`
                        : t("payments.awaitingApproval")}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 12 }}>
                      {batch.paidAt
                        ? `${locale === "zh" ? "付款於" : "Paid"} ${formatDateTime(batch.paidAt)}`
                        : t("payments.awaitingRemittance")}
                    </div>
                  </td>
                  <td>
                    <input
                      value={
                        remittanceProofs[batch.batchId] ??
                        batch.remittanceProofId ??
                        ""
                      }
                      onChange={(event) =>
                        setRemittanceProofs((current) => ({
                          ...current,
                          [batch.batchId]: event.target.value,
                        }))
                      }
                      placeholder={
                        locale === "zh" ? "匯款憑證編號" : "remit-proof-001"
                      }
                      style={{ ...inputStyle, minWidth: 180 }}
                      disabled={batch.status === "paid"}
                    />
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {batch.items.map((item) => item.orderId).join(", ")}
                  </td>
                  <td>
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        minWidth: 120,
                      }}
                    >
                      {!batch.approvedAt && (
                        <button
                          className="admin-btn admin-btn--secondary"
                          onClick={() => void handleApproveBatch(batch)}
                          disabled={batchActionId === batch.batchId}
                        >
                          {locale === "zh" ? "核准" : "Approve"}
                        </button>
                      )}
                      {batch.status !== "paid" && (
                        <button
                          className="admin-btn admin-btn--primary"
                          onClick={() => void handleMarkPaid(batch)}
                          disabled={batchActionId === batch.batchId}
                        >
                          {batchActionId === batch.batchId
                            ? t("common.saving")
                            : t("payments.markPaid")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8}>{t("payments.noReimbursements")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 13,
  fontWeight: 500,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 0.85rem",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 14,
};
