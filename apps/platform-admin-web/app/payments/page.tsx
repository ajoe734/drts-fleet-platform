/**
 * Payments Page
 * Platform-wide payment records, settlement status, and financial operations.
 * Calls /api/platform-admin/invoices — platform authority only.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import type { TenantInvoiceRecord } from "@drts/contracts";

export default function PaymentsPage() {
  const client = usePlatformAdminClient();
  const [invoices, setInvoices] = useState<TenantInvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "paid" | "draft" | "issued">(
    "all",
  );

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformInvoices();
      setInvoices((result as TenantInvoiceRecord[]) || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const filtered =
    filter === "all"
      ? invoices
      : invoices.filter((inv) => inv.status === filter);

  const totalAmountMinor = filtered.reduce(
    (sum, inv) => sum + (inv.amount?.amountMinor || 0),
    0,
  );

  if (loading)
    return <div className="admin-empty">Loading payment records...</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Payments</h1>
        <p>
          View payment records, settlement status, and financial operations.
        </p>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>Error: {error}</p>
        </div>
      )}

      <div className="admin-toolbar">
        <div className="admin-toggle-group">
          {(["all", "paid", "issued", "draft"] as const).map((f) => (
            <button
              key={f}
              className={`admin-toggle-btn ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <button
          className="admin-btn admin-btn--secondary"
          onClick={loadInvoices}
        >
          Refresh
        </button>
      </div>

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 14, color: "#6b7280" }}>
            Showing {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>
            Total: {totalAmountMinor.toLocaleString()} (minor units)
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>No payment records found.</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Invoice ID</th>
                <th>Tenant ID</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Period</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inv) => (
                <tr key={inv.invoiceId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {inv.invoiceId}
                  </td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {inv.tenantId}
                  </td>
                  <td>
                    {inv.amount
                      ? `${inv.amount.amountMinor} ${inv.amount.currency}`
                      : "—"}
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${
                        inv.status === "paid"
                          ? "admin-badge--success"
                          : inv.status === "draft"
                            ? "admin-badge--neutral"
                            : "admin-badge--warning"
                      }`}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {formatDateTime(inv.periodStart)} —{" "}
                    {formatDateTime(inv.periodEnd)}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {formatDateTime(inv.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
