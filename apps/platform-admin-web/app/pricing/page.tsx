/**
 * Pricing & Split Page
 * Pricing rules, revenue split configuration, and payment admin.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import type {
  TenantBillingProfile,
  TenantInvoiceRecord,
} from "@drts/contracts";

export default function PricingPage() {
  const client = usePlatformAdminClient();
  const [billingProfile, setBillingProfile] =
    useState<TenantBillingProfile | null>(null);
  const [invoices, setInvoices] = useState<TenantInvoiceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"profile" | "invoices">("profile");
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bp, inv] = await Promise.all([
        client.getBillingProfile(),
        client.listInvoices(),
      ]);
      setBillingProfile((bp as TenantBillingProfile) || null);
      setInvoices((inv as TenantInvoiceRecord[]) || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateInvoice = async () => {
    setGenerating(true);
    try {
      await client.generateInvoice();
      await loadData();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setGenerating(false);
    }
  };

  if (loading)
    return <div className="admin-empty">Loading pricing data...</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Pricing &amp; Split</h1>
        <p>
          Configure billing profiles, pricing rules, and manage invoice
          generation.
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
          <button
            className={`admin-toggle-btn ${activeTab === "profile" ? "active" : ""}`}
            onClick={() => setActiveTab("profile")}
          >
            Billing Profile
          </button>
          <button
            className={`admin-toggle-btn ${activeTab === "invoices" ? "active" : ""}`}
            onClick={() => setActiveTab("invoices")}
          >
            Invoices ({invoices.length})
          </button>
        </div>
        <button className="admin-btn admin-btn--secondary" onClick={loadData}>
          Refresh
        </button>
        {activeTab === "invoices" && (
          <button
            className="admin-btn admin-btn--primary"
            onClick={handleGenerateInvoice}
            disabled={generating}
          >
            {generating ? "Generating..." : "Generate Invoice"}
          </button>
        )}
      </div>

      <div className="admin-card">
        {activeTab === "profile" &&
          (billingProfile ? (
            <div>
              <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>
                Current Billing Profile
              </h3>
              <table className="admin-table">
                <tbody>
                  <tr>
                    <th style={{ width: 200 }}>Tenant ID</th>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {billingProfile.tenantId}
                    </td>
                  </tr>
                  <tr>
                    <th>Invoice Title</th>
                    <td>{billingProfile.invoiceTitle || "—"}</td>
                  </tr>
                  <tr>
                    <th>Tax ID</th>
                    <td>{billingProfile.taxId || "—"}</td>
                  </tr>
                  <tr>
                    <th>Contact</th>
                    <td>
                      {billingProfile.contactName ||
                        billingProfile.email ||
                        "—"}
                    </td>
                  </tr>
                  <tr>
                    <th>Address</th>
                    <td>{billingProfile.address || "—"}</td>
                  </tr>
                  <tr>
                    <th>Updated</th>
                    <td>{formatDateTime(billingProfile.updatedAt)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="admin-empty">No billing profile configured.</p>
          ))}

        {activeTab === "invoices" &&
          (invoices.length === 0 ? (
            <p className="admin-empty">No invoices generated yet.</p>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Period</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.invoiceId}>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {inv.invoiceId}
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
                    <td>
                      {formatDateTime(inv.periodStart)} —{" "}
                      {formatDateTime(inv.periodEnd)}
                    </td>
                    <td>{formatDateTime(inv.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>
    </div>
  );
}
