/**
 * Pricing & Settlement Plans
 * Draft pricing templates plus authoritative driver fee plan publication.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { usePlatformAdminClient, formatDateTime } from "@/lib/admin-client";
import {
  actionButtonStyle,
  emptyStateStyle,
  mergeStyles,
  monoTextStyle,
  pageHeaderStyle,
  pageHeaderSubtitleStyle,
  pageHeaderTitleStyle,
  statusBadgeStyle,
  surfaceCardStyle,
  tableCardStyle,
  tableCellStyle,
  tableHeadCellStyle,
  tableStyle,
  toggleButtonStyle,
  toggleGroupStyle,
  toolbarStyle,
  inputStyle,
} from "@/components/platform-ui";
import { useTranslation } from "@/lib/i18n";
import {
  formatPlatformCodeLabel,
  getPlatformLabel,
} from "@/lib/localized-labels";
import type {
  DriverFeePlanRecord,
  PlatformPricingRuleRecord,
  ProductRuleCatalog,
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

function pricingRuleStatusTone(status: PlatformPricingRuleRecord["status"]) {
  if (status === "active") {
    return "success" as const;
  }
  if (status === "draft") {
    return "warning" as const;
  }
  return "neutral" as const;
}

export default function PricingPage() {
  const { t, locale } = useTranslation();
  const client = usePlatformAdminClient();
  const defaultPlanName = getPlatformLabel(locale, "defaultPlanName");
  const [rules, setRules] = useState<PlatformPricingRuleRecord[]>([]);
  const [feePlans, setFeePlans] = useState<DriverFeePlanRecord[]>([]);
  const [productRuleCatalog, setProductRuleCatalog] =
    useState<ProductRuleCatalog | null>(null);
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
      const [pricingRules, settlementPlans, productRules] = await Promise.all([
        client.listPlatformPricingRules(),
        client.listDriverFeePlans(),
        client.getProductRuleCatalog(),
      ]);
      setRules(pricingRules ?? []);
      setFeePlans(settlementPlans ?? []);
      setProductRuleCatalog(productRules);
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
  const activeRules = rules.filter((rule) => rule.status === "active");
  const draftRules = rules.filter((rule) => rule.status === "draft");
  const pricingWorkflowCopy =
    locale === "en"
      ? {
          publishWindowTitle: "Publish-window governance",
          publishWindowNote:
            "Pricing drafts stay isolated until a controlled publish window sets the effective range. Driver fee plans remain visible so operator overrides do not bypass the canonical pricing authority.",
          nextPublish: "Next publish candidate",
          overrideActors: "Override actors",
          overrideFields: "Required override fields",
          noDrafts: "No draft pricing rule is waiting for publication.",
        }
      : {
          publishWindowTitle: "發布窗口治理",
          publishWindowNote:
            "定價草稿在設定生效區間前都維持隔離；司機費用方案則持續可見，避免人工 override 繞過 canonical pricing authority。",
          nextPublish: "下一個發布候選",
          overrideActors: "可執行 override 的角色",
          overrideFields: "override 必填欄位",
          noDrafts: "目前沒有等待發布的定價草稿。",
        };

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
    return <div style={emptyStateStyle}>{t("pricing.loading")}</div>;
  }

  return (
    <div>
      <div style={pageHeaderStyle}>
        <h1 style={pageHeaderTitleStyle}>{t("pricing.title")}</h1>
        <p style={pageHeaderSubtitleStyle}>
          {t("pricing.subtitle", {
            rules: rules.length,
            plans: feePlans.length,
          })}
        </p>
      </div>

      {error && (
        <div
          style={mergeStyles(surfaceCardStyle, {
            borderColor: "rgba(239,68,68,0.3)",
          })}
        >
          <p style={{ color: "#dc2626", margin: 0 }}>
            {getPlatformLabel(locale, "error")}: {error}
          </p>
        </div>
      )}

      {productRuleCatalog && (
        <div style={mergeStyles(surfaceCardStyle, { marginBottom: 16 })}>
          <h3 style={{ marginTop: 0 }}>{t("pricing.title")} Governance</h3>
          <p style={{ margin: "0 0 8px", color: "#374151" }}>
            Canonical quoted fare source:{" "}
            <strong>
              {productRuleCatalog.pricingAuthority.canonicalQuotedFareSource}
            </strong>
            {" · "}
            rule version{" "}
            <strong>
              {productRuleCatalog.pricingAuthority.canonicalPricingRuleVersion}
            </strong>
          </p>
          <p style={{ margin: "0 0 8px", color: "#6b7280" }}>
            Tenant and partner booking channels are read-only for quoted fare.
            Manual override is allowed only for{" "}
            {productRuleCatalog.pricingAuthority.manualOverrideActorTypes.join(
              " / ",
            )}{" "}
            and must include{" "}
            {productRuleCatalog.pricingAuthority.manualOverrideRequiredFields.join(
              ", ",
            )}
            .
          </p>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={mergeStyles(surfaceCardStyle, {
            marginBottom: 0,
            background: "rgba(15,118,110,0.04)",
          })}
        >
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6b7280" }}>
            {pricingWorkflowCopy.publishWindowTitle}
          </p>
          <p style={{ margin: 0, fontSize: 13, color: "#374151" }}>
            {pricingWorkflowCopy.publishWindowNote}
          </p>
        </div>
        <div style={mergeStyles(surfaceCardStyle, { marginBottom: 0 })}>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6b7280" }}>
            {pricingWorkflowCopy.nextPublish}
          </p>
          {draftRules[0] ? (
            <>
              <strong style={{ display: "block", fontSize: 20 }}>
                {draftRules[0].ruleName}
              </strong>
              <small style={{ color: "#6b7280" }}>
                {draftRules[0].version} · {draftRules[0].applicableTo}
              </small>
            </>
          ) : (
            <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>
              {pricingWorkflowCopy.noDrafts}
            </p>
          )}
        </div>
        <div style={mergeStyles(surfaceCardStyle, { marginBottom: 0 })}>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6b7280" }}>
            {pricingWorkflowCopy.overrideActors}
          </p>
          <strong style={{ display: "block", fontSize: 20 }}>
            {productRuleCatalog
              ? productRuleCatalog.pricingAuthority.manualOverrideActorTypes.join(
                  " / ",
                )
              : "—"}
          </strong>
          <small style={{ color: "#6b7280" }}>
            {activeRules.length} active · {draftRules.length} draft
          </small>
        </div>
        <div style={mergeStyles(surfaceCardStyle, { marginBottom: 0 })}>
          <p style={{ margin: "0 0 6px", fontSize: 13, color: "#6b7280" }}>
            {pricingWorkflowCopy.overrideFields}
          </p>
          <strong style={{ display: "block", fontSize: 20 }}>
            {productRuleCatalog
              ? productRuleCatalog.pricingAuthority.manualOverrideRequiredFields.join(
                  ", ",
                )
              : "—"}
          </strong>
        </div>
      </div>

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
          <div key={card.label} style={surfaceCardStyle}>
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

      <div style={toolbarStyle}>
        <div style={toggleGroupStyle}>
          {(["all", "active", "draft", "archived"] as const).map((value) => (
            <button
              key={value}
              type="button"
              style={toggleButtonStyle(filter === value)}
              onClick={() => setFilter(value)}
            >
              {formatPlatformCodeLabel(locale, value)}
            </button>
          ))}
        </div>
        <button
          type="button"
          style={actionButtonStyle({ tone: "primary" })}
          onClick={() => setShowCreate((current) => !current)}
        >
          {showCreate ? t("pricing.cancelDraft") : t("pricing.newPricingDraft")}
        </button>
        <button
          type="button"
          style={actionButtonStyle()}
          onClick={() => void loadData()}
        >
          {t("common.refresh")}
        </button>
      </div>

      {showCreate && (
        <div style={mergeStyles(surfaceCardStyle, { marginBottom: 16 })}>
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
              style={actionButtonStyle({ tone: "primary" })}
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

      <div style={mergeStyles(surfaceCardStyle, { marginBottom: 16 })}>
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
            style={actionButtonStyle({ tone: "primary" })}
            disabled={publishingFeePlan || !feePlanForm.version.trim()}
          >
            {publishingFeePlan
              ? t("pricing.publishing")
              : t("pricing.publishSettlementPlan")}
          </button>
        </form>
      </div>

      <div style={mergeStyles(tableCardStyle, { marginBottom: 16 })}>
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
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={tableHeadCellStyle}>{t("pricing.col.plan")}</th>
              <th style={tableHeadCellStyle}>{t("pricing.col.version")}</th>
              <th style={tableHeadCellStyle}>{t("pricing.col.serviceFee")}</th>
              <th style={tableHeadCellStyle}>{t("pricing.col.reimbMode")}</th>
              <th style={tableHeadCellStyle}>{t("pricing.col.status")}</th>
              <th style={tableHeadCellStyle}>{t("notices.col.created")}</th>
            </tr>
          </thead>
          <tbody>
            {feePlans.length > 0 ? (
              feePlans.map((plan) => (
                <tr key={plan.feePlanId}>
                  <td style={mergeStyles(tableCellStyle, monoTextStyle)}>
                    <div>{plan.planName}</div>
                    <div style={{ color: "#6b7280" }}>{plan.feePlanId}</div>
                  </td>
                  <td style={tableCellStyle}>
                    <code>{plan.version}</code>
                  </td>
                  <td style={tableCellStyle}>
                    {(plan.serviceFeeBps / 100).toFixed(2)}%
                  </td>
                  <td style={tableCellStyle}>
                    <span style={statusBadgeStyle("info")}>
                      {formatPlatformCodeLabel(locale, plan.reimbursementMode)}
                    </span>
                  </td>
                  <td style={tableCellStyle}>
                    <span style={statusBadgeStyle("success")}>
                      {formatPlatformCodeLabel(locale, plan.status)}
                    </span>
                  </td>
                  <td style={tableCellStyle}>
                    {formatDateTime(plan.publishedAt)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={tableCellStyle}>
                  {t("pricing.noPlans")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={tableCardStyle}>
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
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={tableHeadCellStyle}>{t("pricing.col.rule")}</th>
              <th style={tableHeadCellStyle}>{t("pricing.col.version")}</th>
              <th style={tableHeadCellStyle}>{t("pricing.col.serviceFee")}</th>
              <th style={tableHeadCellStyle}>{t("pricing.col.reimbMode")}</th>
              <th style={tableHeadCellStyle}>
                {getPlatformLabel(locale, "applicableTo")}
              </th>
              <th style={tableHeadCellStyle}>{t("pricing.col.status")}</th>
              <th style={tableHeadCellStyle}>{t("notices.col.created")}</th>
              <th style={tableHeadCellStyle}>{t("pricing.form.notes")}</th>
              <th style={tableHeadCellStyle}>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRules.length > 0 ? (
              filteredRules.map((rule) => (
                <tr key={rule.ruleId}>
                  <td style={mergeStyles(tableCellStyle, monoTextStyle)}>
                    <div>{rule.ruleName}</div>
                    <div style={{ color: "#6b7280" }}>{rule.ruleId}</div>
                  </td>
                  <td style={tableCellStyle}>
                    <code>v{rule.version}</code>
                  </td>
                  <td style={tableCellStyle}>
                    {(rule.serviceFeeBps / 100).toFixed(2)}%
                  </td>
                  <td style={tableCellStyle}>
                    <span style={statusBadgeStyle("info")}>
                      {formatPlatformCodeLabel(locale, rule.reimbursementMode)}
                    </span>
                  </td>
                  <td style={tableCellStyle}>
                    {rule.applicableTo === "all"
                      ? t("common.allTenants")
                      : rule.applicableTo}
                  </td>
                  <td style={tableCellStyle}>
                    <span
                      style={statusBadgeStyle(
                        pricingRuleStatusTone(rule.status),
                      )}
                    >
                      {formatPlatformCodeLabel(locale, rule.status)}
                    </span>
                  </td>
                  <td style={tableCellStyle}>
                    {rule.publishedAt ? formatDateTime(rule.publishedAt) : "—"}
                  </td>
                  <td
                    style={mergeStyles(tableCellStyle, {
                      fontSize: 12,
                      maxWidth: 260,
                    })}
                  >
                    {rule.notes || "—"}
                  </td>
                  <td style={tableCellStyle}>
                    {rule.status === "draft" ? (
                      <div style={{ display: "grid", gap: 10, minWidth: 260 }}>
                        <button
                          style={actionButtonStyle()}
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
                                style={actionButtonStyle()}
                                type="button"
                                onClick={closePublishRuleForm}
                                disabled={publishingRuleId === rule.ruleId}
                              >
                                {t("common.cancel")}
                              </button>
                              <button
                                style={actionButtonStyle({ tone: "primary" })}
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
                <td colSpan={9} style={tableCellStyle}>
                  {t("pricing.noRules")}
                </td>
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
