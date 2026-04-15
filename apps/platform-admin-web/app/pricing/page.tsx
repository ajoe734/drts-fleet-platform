/**
 * Pricing & Split Page
 * Platform-level pricing rules and revenue split configuration.
 * Calls /api/platform-admin/pricing-rules — platform authority only.
 */

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import type { PlatformPricingRuleRecord } from "@drts/contracts";

export default function PricingPage() {
  const client = usePlatformAdminClient();
  const [rules, setRules] = useState<PlatformPricingRuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "archived">(
    "all",
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.listPlatformPricingRules();
      setRules(result || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered =
    filter === "all" ? rules : rules.filter((r) => r.status === filter);

  if (loading)
    return <div className="admin-empty">Loading pricing rules...</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Pricing &amp; Split</h1>
        <p>
          Platform-level pricing rules and revenue split configuration for all
          tenants.
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
          {(["all", "active", "draft", "archived"] as const).map((f) => (
            <button
              key={f}
              className={`admin-toggle-btn ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === "all"
                ? ` (${rules.length})`
                : ` (${rules.filter((r) => r.status === f).length})`}
            </button>
          ))}
        </div>
        <button className="admin-btn admin-btn--secondary" onClick={loadData}>
          Refresh
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="admin-card admin-empty">
          <p>No pricing rules found for the selected filter.</p>
        </div>
      ) : (
        <div className="admin-card" style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Rule ID</th>
                <th>Name</th>
                <th>Service Fee</th>
                <th>Reimbursement Mode</th>
                <th>Applicable To</th>
                <th>Status</th>
                <th>Effective From</th>
                <th>Effective To</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.ruleId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {r.ruleId}
                  </td>
                  <td>{r.ruleName}</td>
                  <td>
                    <code
                      style={{
                        fontSize: 13,
                        background: "#f3f4f6",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      {(r.serviceFeeBps / 100).toFixed(2)}%
                    </code>
                  </td>
                  <td>
                    <span className="admin-badge admin-badge--info">
                      {r.reimbursementMode}
                    </span>
                  </td>
                  <td>
                    {r.applicableTo === "all" ? (
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        All Tenants
                      </span>
                    ) : (
                      <code style={{ fontSize: 12 }}>{r.applicableTo}</code>
                    )}
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${
                        r.status === "active"
                          ? "admin-badge--success"
                          : r.status === "draft"
                            ? "admin-badge--warning"
                            : "admin-badge--neutral"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {formatDateTime(r.effectiveFrom)}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {r.effectiveTo ? formatDateTime(r.effectiveTo) : "—"}
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
