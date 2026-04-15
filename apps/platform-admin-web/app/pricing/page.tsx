/**
 * Pricing & Split Page
 * Platform-level pricing rules, draft creation, and publish workflow.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import type {
  CreatePlatformPricingRuleCommand,
  PlatformPricingRuleRecord,
} from "@drts/contracts";

type PricingFormState = {
  ruleName: string;
  version: string;
  serviceFeeBps: string;
  reimbursementMode: "platform_funded" | "mixed";
  applicableTo: string;
  notes: string;
};

const EMPTY_FORM: PricingFormState = {
  ruleName: "",
  version: "",
  serviceFeeBps: "1500",
  reimbursementMode: "platform_funded",
  applicableTo: "all",
  notes: "",
};

export default function PricingPage() {
  const client = usePlatformAdminClient();
  const [rules, setRules] = useState<PlatformPricingRuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "archived">(
    "all",
  );
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<PricingFormState>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [publishingRuleId, setPublishingRuleId] = useState<string | null>(null);

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
    void loadData();
  }, [loadData]);

  const filtered = useMemo(
    () =>
      filter === "all" ? rules : rules.filter((rule) => rule.status === filter),
    [filter, rules],
  );

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const command: CreatePlatformPricingRuleCommand = {
        ruleName: form.ruleName,
        version: form.version,
        serviceFeeBps: Number(form.serviceFeeBps),
        reimbursementMode: form.reimbursementMode,
        applicableTo: form.applicableTo.trim() || "all",
        notes: form.notes,
      };
      await client.createPlatformPricingRule(command);
      setForm(EMPTY_FORM);
      setShowCreate(false);
      await loadData();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setCreating(false);
    }
  };

  const handlePublish = async (ruleId: string) => {
    setPublishingRuleId(ruleId);
    setError(null);
    try {
      await client.publishPlatformPricingRule(ruleId, {
        publishedBy: "platform-admin-web",
      });
      await loadData();
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setPublishingRuleId(null);
    }
  };

  if (loading)
    return <div className="admin-empty">Loading pricing rules...</div>;

  return (
    <div>
      <div className="admin-page-header">
        <h1>Pricing &amp; Split</h1>
        <p>
          Publish tenant pricing templates with auditable version changes and
          reimbursement policy.
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
          {(["all", "active", "draft", "archived"] as const).map((value) => (
            <button
              key={value}
              className={`admin-toggle-btn ${filter === value ? "active" : ""}`}
              onClick={() => setFilter(value)}
            >
              {value.charAt(0).toUpperCase() + value.slice(1)}
              {value === "all"
                ? ` (${rules.length})`
                : ` (${rules.filter((rule) => rule.status === value).length})`}
            </button>
          ))}
        </div>
        <button
          className="admin-btn admin-btn--primary"
          onClick={() => setShowCreate((current) => !current)}
        >
          {showCreate ? "Cancel" : "New Draft"}
        </button>
        <button
          className="admin-btn admin-btn--secondary"
          onClick={() => void loadData()}
        >
          Refresh
        </button>
      </div>

      {showCreate && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
            Create Draft Pricing Rule
          </h3>
          <form onSubmit={handleCreate}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <label>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Rule Name
                </div>
                <input
                  value={form.ruleName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      ruleName: event.target.value,
                    }))
                  }
                  required
                  placeholder="Standard Service Fee"
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Version
                </div>
                <input
                  value={form.version}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      version: event.target.value,
                    }))
                  }
                  required
                  placeholder="2026.05"
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Applicable To
                </div>
                <input
                  value={form.applicableTo}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      applicableTo: event.target.value,
                    }))
                  }
                  placeholder="all or tenant code"
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Service Fee (bps)
                </div>
                <input
                  type="number"
                  min={0}
                  value={form.serviceFeeBps}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      serviceFeeBps: event.target.value,
                    }))
                  }
                  required
                  style={inputStyle}
                />
              </label>
              <label>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                  Reimbursement Mode
                </div>
                <select
                  value={form.reimbursementMode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reimbursementMode: event.target
                        .value as PricingFormState["reimbursementMode"],
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="platform_funded">Platform Funded</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
            </div>

            <label style={{ display: "block", marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>
                Notes
              </div>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={3}
                placeholder="Describe why this pricing update is needed."
                style={{
                  ...inputStyle,
                  minHeight: 96,
                  resize: "vertical",
                }}
              />
            </label>

            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={
                creating || !form.ruleName.trim() || !form.version.trim()
              }
            >
              {creating ? "Creating..." : "Create Draft"}
            </button>
          </form>
        </div>
      )}

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
                <th>Version</th>
                <th>Service Fee</th>
                <th>Reimbursement</th>
                <th>Applicable To</th>
                <th>Status</th>
                <th>Published</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((rule) => (
                <tr key={rule.ruleId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    {rule.ruleId}
                  </td>
                  <td>{rule.ruleName}</td>
                  <td>
                    <code>v{rule.version}</code>
                  </td>
                  <td>{(rule.serviceFeeBps / 100).toFixed(2)}%</td>
                  <td>
                    <span className="admin-badge admin-badge--info">
                      {rule.reimbursementMode}
                    </span>
                  </td>
                  <td>
                    {rule.applicableTo === "all"
                      ? "All Tenants"
                      : rule.applicableTo}
                  </td>
                  <td>
                    <span
                      className={`admin-badge ${
                        rule.status === "active"
                          ? "admin-badge--success"
                          : rule.status === "draft"
                            ? "admin-badge--warning"
                            : "admin-badge--neutral"
                      }`}
                    >
                      {rule.status}
                    </span>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {rule.publishedAt ? formatDateTime(rule.publishedAt) : "—"}
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 260 }}>
                    {rule.notes || "—"}
                  </td>
                  <td>
                    {rule.status === "draft" ? (
                      <button
                        className="admin-btn admin-btn--primary admin-btn--sm"
                        onClick={() => void handlePublish(rule.ruleId)}
                        disabled={publishingRuleId === rule.ruleId}
                        type="button"
                      >
                        {publishingRuleId === rule.ruleId
                          ? "Publishing..."
                          : "Publish"}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: "#6b7280" }}>
                        Published by {rule.publishedBy || "system"}
                      </span>
                    )}
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 8,
  fontSize: 14,
};
