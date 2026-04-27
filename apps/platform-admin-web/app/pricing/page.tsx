/**
 * Pricing & Settlement Plans
 * Draft pricing templates plus authoritative driver fee plan publication.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  DriverFeePlanRecord,
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

type FeePlanFormState = {
  planName: string;
  version: string;
  serviceFeeBps: string;
  reimbursementMode: "platform_funded" | "mixed";
};

type PublishRuleFormState = {
  effectiveFrom: string;
  effectiveTo: string;
};

const EMPTY_PRICING_FORM: PricingFormState = {
  ruleName: "",
  version: "",
  serviceFeeBps: "1500",
  reimbursementMode: "platform_funded",
  applicableTo: "all",
  notes: "",
};

const EMPTY_FEE_PLAN_FORM: FeePlanFormState = {
  planName: "",
  version: "",
  serviceFeeBps: "1500",
  reimbursementMode: "platform_funded",
};

const EMPTY_PUBLISH_RULE_FORM: PublishRuleFormState = {
  effectiveFrom: "",
  effectiveTo: "",
};

function normalizeDateTimeLocalValue(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return { localValue: "", isoValue: null };
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return { localValue: normalized, isoValue: null };
  }

  const localValue = [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ]
    .join("-")
    .concat("T")
    .concat(
      [
        String(parsed.getHours()).padStart(2, "0"),
        String(parsed.getMinutes()).padStart(2, "0"),
      ].join(":"),
    );

  return {
    localValue,
    isoValue: parsed.toISOString(),
  };
}

export default function PricingPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const defaultPlanName = getPlatformLabel(locale, "defaultPlanName");
  const [rules, setRules] = useState<PlatformPricingRuleRecord[]>([]);
  const [feePlans, setFeePlans] = useState<DriverFeePlanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "active" | "draft" | "archived">(
    "all",
  );
  const [showCreate, setShowCreate] = useState(false);
  const [pricingForm, setPricingForm] =
    useState<PricingFormState>(EMPTY_PRICING_FORM);
  const [feePlanForm, setFeePlanForm] = useState<FeePlanFormState>(() => ({
    ...EMPTY_FEE_PLAN_FORM,
    planName: defaultPlanName,
  }));
  const [publishRuleFormRuleId, setPublishRuleFormRuleId] = useState<
    string | null
  >(null);
  const [publishRuleForm, setPublishRuleForm] = useState(
    EMPTY_PUBLISH_RULE_FORM,
  );
  const [publishRuleFormError, setPublishRuleFormError] = useState<
    string | null
  >(null);
  const [creatingPricingRule, setCreatingPricingRule] = useState(false);
  const [publishingRuleId, setPublishingRuleId] = useState<string | null>(null);
  const [publishingFeePlan, setPublishingFeePlan] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pricingRules, settlementPlans] = await Promise.all([
        client.listPlatformPricingRules(),
        client.listDriverFeePlans(),
      ]);
      setRules(pricingRules ?? []);
      setFeePlans(settlementPlans ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredRules = useMemo(
    () =>
      filter === "all" ? rules : rules.filter((rule) => rule.status === filter),
    [filter, rules],
  );

  async function handleCreatePricingRule(event: React.FormEvent) {
    event.preventDefault();
    setCreatingPricingRule(true);
    setError(null);
    try {
      await client.createPlatformPricingRule({
        ruleName: pricingForm.ruleName,
        version: pricingForm.version,
        serviceFeeBps: Number(pricingForm.serviceFeeBps),
        reimbursementMode: pricingForm.reimbursementMode,
        applicableTo: pricingForm.applicableTo.trim() || "all",
        notes: pricingForm.notes,
      });
      setPricingForm(EMPTY_PRICING_FORM);
      setShowCreate(false);
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreatingPricingRule(false);
    }
  }

  function openPublishRuleForm(rule: PlatformPricingRuleRecord) {
    const normalizedEffectiveFrom = normalizeDateTimeLocalValue(
      rule.effectiveFrom ?? "",
    );
    const normalizedEffectiveTo = normalizeDateTimeLocalValue(
      rule.effectiveTo ?? "",
    );
    setError(null);
    setPublishRuleFormError(null);
    setPublishRuleFormRuleId(rule.ruleId);
    setPublishRuleForm({
      effectiveFrom: normalizedEffectiveFrom.localValue,
      effectiveTo: normalizedEffectiveTo.localValue,
    });
  }

  function closePublishRuleForm() {
    setPublishRuleFormRuleId(null);
    setPublishRuleForm(EMPTY_PUBLISH_RULE_FORM);
    setPublishRuleFormError(null);
  }

  async function handlePublishRule(ruleId: string) {
    const normalizedEffectiveFrom = normalizeDateTimeLocalValue(
      publishRuleForm.effectiveFrom,
    );
    const normalizedEffectiveTo = normalizeDateTimeLocalValue(
      publishRuleForm.effectiveTo,
    );

    if (
      publishRuleForm.effectiveFrom.trim() &&
      !normalizedEffectiveFrom.isoValue
    ) {
      setPublishRuleFormError(t("switchboard.err.effectiveFrom"));
      return;
    }

    if (publishRuleForm.effectiveTo.trim() && !normalizedEffectiveTo.isoValue) {
      setPublishRuleFormError(t("switchboard.err.effectiveTo"));
      return;
    }

    if (
      normalizedEffectiveFrom.isoValue &&
      normalizedEffectiveTo.isoValue &&
      normalizedEffectiveTo.isoValue < normalizedEffectiveFrom.isoValue
    ) {
      setPublishRuleFormError(t("switchboard.err.effectiveToOrder"));
      return;
    }

    setPublishingRuleId(ruleId);
    setError(null);
    setPublishRuleFormError(null);
    try {
      await client.publishPlatformPricingRule(ruleId, {
        effectiveFrom: normalizedEffectiveFrom.isoValue,
        effectiveTo: normalizedEffectiveTo.isoValue,
        publishedBy: "platform-admin-web",
      });
      closePublishRuleForm();
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishingRuleId(null);
    }
  }

  async function handlePublishFeePlan(event: React.FormEvent) {
    event.preventDefault();
    setPublishingFeePlan(true);
    setError(null);
    try {
      await client.publishDriverFeePlan({
        planName: feePlanForm.planName,
        version: feePlanForm.version,
        serviceFeeBps: Number(feePlanForm.serviceFeeBps),
        reimbursementMode: feePlanForm.reimbursementMode,
      });
      setFeePlanForm({
        ...EMPTY_FEE_PLAN_FORM,
        planName: feePlanForm.planName,
      });
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPublishingFeePlan(false);
    }
  }

  if (loading) {
    return <div className="admin-empty">{t("pricing.loading")}</div>;
  }

  return (
    <div>
      <div className="admin-page-header">
        <h1>{t("pricing.title")}</h1>
        <p>
          {t("pricing.subtitle", {
            rules: rules.length,
            plans: feePlans.length,
          })}
        </p>
      </div>

      {error && (
        <div
          className="admin-card"
          style={{ borderColor: "rgba(239,68,68,0.3)" }}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {getPlatformLabel(locale, "error")}: {error}
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
            label: t("pricing.platformDrafts"),
            value: `${rules.length}`,
            note: t("pricing.platformDraftsNote"),
          },
          {
            label: t("pricing.activeTemplates"),
            value: `${rules.filter((rule) => rule.status === "active").length}`,
            note: t("pricing.platformDraftsNote"),
          },
          {
            label: t("pricing.publishedPlans"),
            value: `${feePlans.length}`,
            note: t("pricing.publishedPlansNote"),
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

      <div className="admin-toolbar">
        <div className="admin-toggle-group">
          {(["all", "active", "draft", "archived"] as const).map((value) => (
            <button
              key={value}
              className={`admin-toggle-btn ${filter === value ? "active" : ""}`}
              onClick={() => setFilter(value)}
            >
              {formatPlatformCodeLabel(locale, value)}
            </button>
          ))}
        </div>
        <button
          className="admin-btn admin-btn--primary"
          onClick={() => setShowCreate((current) => !current)}
        >
          {showCreate ? t("pricing.cancelDraft") : t("pricing.newPricingDraft")}
        </button>
        <button
          className="admin-btn admin-btn--secondary"
          onClick={() => void loadData()}
        >
          {t("common.refresh")}
        </button>
      </div>

      {showCreate && (
        <div className="admin-card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>{t("pricing.sectionCreateDraft")}</h3>
          <form onSubmit={handleCreatePricingRule}>
            <div style={formGridStyle}>
              <label style={labelStyle}>
                {t("pricing.form.ruleName")}
                <input
                  value={pricingForm.ruleName}
                  onChange={(event) =>
                    setPricingForm((current) => ({
                      ...current,
                      ruleName: event.target.value,
                    }))
                  }
                  required
                  placeholder={defaultPlanName}
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                {t("pricing.form.version")}
                <input
                  value={pricingForm.version}
                  onChange={(event) =>
                    setPricingForm((current) => ({
                      ...current,
                      version: event.target.value,
                    }))
                  }
                  required
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                {t("pricing.form.applicableTo")}
                <input
                  value={pricingForm.applicableTo}
                  onChange={(event) =>
                    setPricingForm((current) => ({
                      ...current,
                      applicableTo: event.target.value,
                    }))
                  }
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                {t("pricing.form.serviceFeeBps")}
                <input
                  type="number"
                  min={0}
                  value={pricingForm.serviceFeeBps}
                  onChange={(event) =>
                    setPricingForm((current) => ({
                      ...current,
                      serviceFeeBps: event.target.value,
                    }))
                  }
                  required
                  style={inputStyle}
                />
              </label>
              <label style={labelStyle}>
                {t("pricing.form.reimbMode")}
                <select
                  value={pricingForm.reimbursementMode}
                  onChange={(event) =>
                    setPricingForm((current) => ({
                      ...current,
                      reimbursementMode: event.target
                        .value as PricingFormState["reimbursementMode"],
                    }))
                  }
                  style={inputStyle}
                >
                  <option value="platform_funded">
                    {t("pricing.platformFunded")}
                  </option>
                  <option value="mixed">{t("pricing.mixed")}</option>
                </select>
              </label>
            </div>
            <label style={labelStyle}>
              {t("pricing.form.notes")}
              <textarea
                value={pricingForm.notes}
                onChange={(event) =>
                  setPricingForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                rows={3}
                style={{ ...inputStyle, minHeight: 96, resize: "vertical" }}
              />
            </label>
            <button
              type="submit"
              className="admin-btn admin-btn--primary"
              disabled={
                creatingPricingRule ||
                !pricingForm.ruleName.trim() ||
                !pricingForm.version.trim()
              }
            >
              {creatingPricingRule
                ? t("pricing.creating")
                : t("pricing.createDraft")}
            </button>
          </form>
        </div>
      )}

      <div className="admin-card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{t("pricing.sectionPublishPlan")}</h3>
        <form onSubmit={handlePublishFeePlan}>
          <div style={formGridStyle}>
            <label style={labelStyle}>
              {t("pricing.form.planName")}
              <input
                value={feePlanForm.planName}
                onChange={(event) =>
                  setFeePlanForm((current) => ({
                    ...current,
                    planName: event.target.value,
                  }))
                }
                required
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("pricing.form.version")}
              <input
                value={feePlanForm.version}
                onChange={(event) =>
                  setFeePlanForm((current) => ({
                    ...current,
                    version: event.target.value,
                  }))
                }
                required
                placeholder="drv-fee-v2"
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("pricing.form.serviceFeeBps")}
              <input
                type="number"
                min={0}
                value={feePlanForm.serviceFeeBps}
                onChange={(event) =>
                  setFeePlanForm((current) => ({
                    ...current,
                    serviceFeeBps: event.target.value,
                  }))
                }
                required
                style={inputStyle}
              />
            </label>
            <label style={labelStyle}>
              {t("pricing.form.reimbMode")}
              <select
                value={feePlanForm.reimbursementMode}
                onChange={(event) =>
                  setFeePlanForm((current) => ({
                    ...current,
                    reimbursementMode: event.target
                      .value as FeePlanFormState["reimbursementMode"],
                  }))
                }
                style={inputStyle}
              >
                <option value="platform_funded">
                  {t("pricing.platformFunded")}
                </option>
                <option value="mixed">{t("pricing.mixed")}</option>
              </select>
            </label>
          </div>
          <button
            type="submit"
            className="admin-btn admin-btn--primary"
            disabled={publishingFeePlan || !feePlanForm.version.trim()}
          >
            {publishingFeePlan
              ? t("pricing.publishing")
              : t("pricing.publishSettlementPlan")}
          </button>
        </form>
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
          <h3 style={{ margin: 0 }}>{t("pricing.sectionSettlementPlans")}</h3>
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            {feePlans.length}
          </span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("pricing.col.plan")}</th>
              <th>{t("pricing.col.version")}</th>
              <th>{t("pricing.col.serviceFee")}</th>
              <th>{t("pricing.col.reimbMode")}</th>
              <th>{t("pricing.col.status")}</th>
              <th>{t("notices.col.created")}</th>
            </tr>
          </thead>
          <tbody>
            {feePlans.length > 0 ? (
              feePlans.map((plan) => (
                <tr key={plan.feePlanId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    <div>{plan.planName}</div>
                    <div style={{ color: "#6b7280" }}>{plan.feePlanId}</div>
                  </td>
                  <td>
                    <code>{plan.version}</code>
                  </td>
                  <td>{(plan.serviceFeeBps / 100).toFixed(2)}%</td>
                  <td>
                    <span className="admin-badge admin-badge--info">
                      {formatPlatformCodeLabel(locale, plan.reimbursementMode)}
                    </span>
                  </td>
                  <td>
                    <span className="admin-badge admin-badge--success">
                      {formatPlatformCodeLabel(locale, plan.status)}
                    </span>
                  </td>
                  <td>{formatDateTime(plan.publishedAt)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6}>{t("pricing.noPlans")}</td>
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
          <h3 style={{ margin: 0 }}>{t("pricing.sectionPricingRules")}</h3>
          <span style={{ color: "#6b7280", fontSize: 13 }}>
            {filteredRules.length}
          </span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>{t("pricing.col.rule")}</th>
              <th>{t("pricing.col.version")}</th>
              <th>{t("pricing.col.serviceFee")}</th>
              <th>{t("pricing.col.reimbMode")}</th>
              <th>{getPlatformLabel(locale, "applicableTo")}</th>
              <th>{t("pricing.col.status")}</th>
              <th>{t("notices.col.created")}</th>
              <th>{t("pricing.form.notes")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.length > 0 ? (
              filteredRules.map((rule) => (
                <tr key={rule.ruleId}>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                    <div>{rule.ruleName}</div>
                    <div style={{ color: "#6b7280" }}>{rule.ruleId}</div>
                  </td>
                  <td>
                    <code>v{rule.version}</code>
                  </td>
                  <td>{(rule.serviceFeeBps / 100).toFixed(2)}%</td>
                  <td>
                    <span className="admin-badge admin-badge--info">
                      {formatPlatformCodeLabel(locale, rule.reimbursementMode)}
                    </span>
                  </td>
                  <td>
                    {rule.applicableTo === "all"
                      ? t("common.allTenants")
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
                      {formatPlatformCodeLabel(locale, rule.status)}
                    </span>
                  </td>
                  <td>
                    {rule.publishedAt ? formatDateTime(rule.publishedAt) : "—"}
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 260 }}>
                    {rule.notes || "—"}
                  </td>
                  <td>
                    {rule.status === "draft" ? (
                      <div style={{ display: "grid", gap: 10, minWidth: 260 }}>
                        <button
                          className="admin-btn admin-btn--secondary"
                          onClick={() =>
                            publishRuleFormRuleId === rule.ruleId
                              ? closePublishRuleForm()
                              : openPublishRuleForm(rule)
                          }
                          disabled={publishingRuleId === rule.ruleId}
                        >
                          {publishRuleFormRuleId === rule.ruleId
                            ? t("pricing.hidePublishForm")
                            : t("pricing.publishDraft")}
                        </button>
                        {publishRuleFormRuleId === rule.ruleId ? (
                          <div
                            style={{
                              display: "grid",
                              gap: 8,
                              padding: 12,
                              borderRadius: 12,
                              background: "#f8fafc",
                              border: "1px solid rgba(148,163,184,0.24)",
                            }}
                          >
                            {publishRuleFormError ? (
                              <p style={{ color: "#dc2626", margin: 0 }}>
                                {publishRuleFormError}
                              </p>
                            ) : null}
                            <label style={labelStyle}>
                              {t("pricing.effectiveFromOverride")}
                              <input
                                type="datetime-local"
                                value={publishRuleForm.effectiveFrom}
                                onChange={(event) => {
                                  setPublishRuleFormError(null);
                                  setPublishRuleForm((current) => ({
                                    ...current,
                                    effectiveFrom: event.target.value,
                                  }));
                                }}
                                style={inputStyle}
                                max={publishRuleForm.effectiveTo || undefined}
                              />
                            </label>
                            <label style={labelStyle}>
                              {t("pricing.effectiveToOverride")}
                              <input
                                type="datetime-local"
                                value={publishRuleForm.effectiveTo}
                                onChange={(event) => {
                                  setPublishRuleFormError(null);
                                  setPublishRuleForm((current) => ({
                                    ...current,
                                    effectiveTo: event.target.value,
                                  }));
                                }}
                                style={inputStyle}
                                min={publishRuleForm.effectiveFrom || undefined}
                              />
                            </label>
                            <p style={{ ...subcopyStyle, margin: 0 }}>
                              {t("pricing.leaveBlank")}
                            </p>
                            <div style={actionsStyle}>
                              <button
                                className="admin-btn admin-btn--secondary"
                                type="button"
                                onClick={closePublishRuleForm}
                                disabled={publishingRuleId === rule.ruleId}
                              >
                                {t("common.cancel")}
                              </button>
                              <button
                                className="admin-btn admin-btn--primary"
                                type="button"
                                onClick={() =>
                                  void handlePublishRule(rule.ruleId)
                                }
                                disabled={publishingRuleId === rule.ruleId}
                              >
                                {publishingRuleId === rule.ruleId
                                  ? t("pricing.publishing")
                                  : t("pricing.confirmPublish")}
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <span style={{ color: "#6b7280", fontSize: 12 }}>
                        {t("common.immutableHistory")}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9}>{t("pricing.noRules")}</td>
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
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginBottom: 16,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 4,
  fontSize: 13,
  fontWeight: 500,
};

const subcopyStyle: React.CSSProperties = {
  color: "#6b7280",
  fontSize: 12,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.75rem 0.85rem",
  borderRadius: 12,
  border: "1px solid #d1d5db",
  background: "#fff",
  fontSize: 14,
};
