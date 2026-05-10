"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  actionButtonStyle,
  emptyStateStyle,
  inputStyle,
} from "@/components/platform-ui";
import { formatDateTime, usePlatformAdminClient } from "@/lib/admin-client";
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
import {
  CalloutBanner,
  DataCellStack,
  DataFilterBar,
  DataTable,
  DataViewCard,
  DetailList,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Stepper,
  Td,
  Tr,
  WorkflowPanel,
} from "@drts/ui-web";

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

function formatBpsAsPercent(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

function formatEffectiveRange(
  effectiveFrom: string | null | undefined,
  effectiveTo: string | null | undefined,
  openEndedLabel: string,
) {
  if (!effectiveFrom && !effectiveTo) {
    return "—";
  }

  const fromLabel = effectiveFrom ? formatDateTime(effectiveFrom) : "—";
  const toLabel = effectiveTo ? formatDateTime(effectiveTo) : openEndedLabel;
  return `${fromLabel} -> ${toLabel}`;
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

  useEffect(() => {
    setFeePlanForm((current) => {
      if (current.planName.trim().length > 0) {
        return current;
      }
      return {
        ...current,
        planName: defaultPlanName,
      };
    });
  }, [defaultPlanName]);

  const filteredRules = useMemo(
    () =>
      filter === "all" ? rules : rules.filter((rule) => rule.status === filter),
    [filter, rules],
  );
  const activeRules = rules.filter((rule) => rule.status === "active");
  const draftRules = rules.filter((rule) => rule.status === "draft");
  const archivedRules = rules.filter((rule) => rule.status === "archived");
  const latestActiveRule = activeRules[0] ?? null;
  const nextPublishCandidate = draftRules[0] ?? null;
  const latestFeePlan = feePlans[0] ?? null;

  const copy =
    locale === "en"
      ? {
          eyebrow: "Pricing governance",
          pageTitle: "Pricing",
          pageSubtitle: "pricing rules · driver fee plans · publish windows",
          openEnded: "Open ended",
          errorHint:
            "The pricing control plane did not complete the last request. Review the failing action before retrying publication.",
          publishFlowTitle: "Publish flow",
          publishFlowDescription:
            "Draft creation, publish-window confirmation, and fee-plan publication stay visible as one operator workflow.",
          overrideTitle: "Authority guardrails",
          overrideSubtitle:
            "Canonical pricing truth and manual override constraints.",
          overrideSummary:
            "Quoted fare authority remains backend-owned even when operators stage publish windows from this console.",
          overrideFooter:
            "Tenant and partner channels remain read-only for quoted fare generation.",
          createDraftSubtitle:
            "Author the next pricing draft without mutating the currently effective rule.",
          createDraftFooter:
            "Drafts stay isolated until a publish window is confirmed.",
          publishPlanSubtitle:
            "Publish the immutable fee-plan snapshot used for driver settlement.",
          publishPlanFooter:
            "Settlement plans are append-only snapshots consumed by downstream payout flows.",
          rulesSubtitle: (count: number) =>
            `${count} pricing rule row(s) visible in the current filter.`,
          rulesSummary:
            "The primary table stays aligned to rule version, scope, effective window, and publish action state.",
          rulesFooter:
            "Only draft rows can open the publish-window form; active and archived rows remain immutable history.",
          feePlansSubtitle: (count: number) =>
            `${count} published fee plan snapshot(s).`,
          feePlansFooter:
            "Each published fee plan is immutable and safe to reference from driver statements.",
          releaseTitle: "Release posture",
          releaseSubtitle:
            "Quick scan of the live rule, next candidate, fee-plan snapshot, and supported service buckets.",
          releaseFooter:
            "Use this panel to validate that pricing publication and settlement publication stay in lockstep.",
          nextCandidateNone: "No draft candidate is waiting for publication.",
          liveRuleNone: "No active pricing rule is published yet.",
          feePlanNone: "No fee plan snapshot has been published.",
          serviceBucketsHint:
            "Phase 1 service buckets remain contract-owned; this surface only governs which rule version becomes effective.",
          stepDraftTitle: "Draft rule authored",
          stepDraftDescription:
            "Operators stage a new rule version, scope, reimbursement mode, and notes.",
          stepWindowTitle: "Publish window confirmed",
          stepWindowDescription:
            "A bounded effective range is applied before the rule can become the live pricing authority.",
          stepPlanTitle: "Driver fee plan snapshot published",
          stepPlanDescription:
            "Settlement follows a published fee-plan snapshot instead of ad-hoc operator memory.",
          stepStateReady: "ready",
          stepStateEditing: "editing",
          stepStateQueued: "queued",
          stepStateLive: "live",
          stepStatePending: "pending",
          stepStateMissing: "missing",
          pricingRulesLabel: "Pricing rules",
          liveRuleLabel: "Live rule",
          nextCandidateLabel: "Next candidate",
          feePlanLabel: "Latest fee plan",
          serviceBucketsLabel: "Service buckets",
          kpiDrafts: "Draft queue",
          kpiActive: "Live rules",
          kpiFeePlans: "Fee-plan snapshots",
          kpiOverride: "Override fields",
        }
      : {
          eyebrow: "計價治理",
          pageTitle: "計價",
          pageSubtitle: "pricing rules · driver fee plans · publish windows",
          openEnded: "未設定結束時間",
          errorHint:
            "上一次計價治理動作沒有完成，請先確認失敗原因，再重新發布或補跑費用方案。",
          publishFlowTitle: "發布流程",
          publishFlowDescription:
            "把草稿建立、publish window 確認、司機費用方案發布放在同一條治理流程裡檢視。",
          overrideTitle: "權威與 override guardrails",
          overrideSubtitle:
            "顯示 canonical pricing authority 與人工 override 限制。",
          overrideSummary:
            "即使平台端能安排 publish window，quoted fare 真值仍由後端權威規則擁有。",
          overrideFooter:
            "租戶與合作夥伴通路都不能自行產生 quoted fare，僅能讀取平台公布後的結果。",
          createDraftSubtitle:
            "先建立下一版定價草稿，不直接改動目前生效中的規則。",
          createDraftFooter:
            "草稿在 publish window 確認前保持隔離，不會碰到正式租戶。",
          publishPlanSubtitle: "發布給司機結算使用的不可變 fee-plan snapshot。",
          publishPlanFooter:
            "結算方案採 append-only snapshot，避免人工記憶覆蓋下游 payout 判讀。",
          rulesSubtitle: (count: number) =>
            `目前 filter 下可見 ${count} 筆定價規則。`,
          rulesSummary:
            "主表保留版本、scope、生效區間與 publish action，對齊設計稿中的 pricing rules 主視圖。",
          rulesFooter:
            "只有 draft row 可以開啟 publish-window 表單；active 與 archived row 保持 immutable history。",
          feePlansSubtitle: (count: number) =>
            `已發布 ${count} 個 fee-plan snapshot。`,
          feePlansFooter:
            "每個 fee plan 都是不可變版本，供司機結算與 statement pipeline 引用。",
          releaseTitle: "發布姿態",
          releaseSubtitle:
            "快速查看 live rule、下一個候選草稿、fee-plan snapshot 與涵蓋的 service buckets。",
          releaseFooter:
            "用這張卡確認 pricing publication 與 settlement publication 是否仍然保持一致。",
          nextCandidateNone: "目前沒有等待發布的草稿候選。",
          liveRuleNone: "目前尚未有 active pricing rule。",
          feePlanNone: "目前尚未發布 fee plan snapshot。",
          serviceBucketsHint:
            "Phase 1 service buckets 仍由 contract 定義；此頁面只治理哪個 rule version 成為正式權威。",
          stepDraftTitle: "定價草稿已建立",
          stepDraftDescription:
            "治理人建立新版本、scope、報銷模式與備註，先形成待發布草稿。",
          stepWindowTitle: "publish window 已確認",
          stepWindowDescription:
            "在規則成為 live authority 之前，必須先補齊生效區間與發布治理。",
          stepPlanTitle: "司機費用方案已發布",
          stepPlanDescription:
            "結算依附在已發布的 fee-plan snapshot，而不是口頭記憶或暫時表格。",
          stepStateReady: "可發布",
          stepStateEditing: "編輯中",
          stepStateQueued: "排隊中",
          stepStateLive: "生效中",
          stepStatePending: "待補齊",
          stepStateMissing: "尚未建立",
          pricingRulesLabel: "定價規則",
          liveRuleLabel: "目前生效規則",
          nextCandidateLabel: "下一個候選草稿",
          feePlanLabel: "最新 fee plan",
          serviceBucketsLabel: "服務 bucket",
          kpiDrafts: "草稿佇列",
          kpiActive: "生效規則",
          kpiFeePlans: "fee-plan snapshot",
          kpiOverride: "override 必填欄位",
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

  const publishFlowItems = [
    {
      id: "draft",
      title: copy.stepDraftTitle,
      description: copy.stepDraftDescription,
      state:
        rules.length === 0
          ? ("current" as const)
          : draftRules.length > 0
            ? ("complete" as const)
            : ("complete" as const),
      stateLabel:
        draftRules.length > 0 ? copy.stepStateReady : copy.stepStateMissing,
      meta: `${draftRules.length} ${copy.pricingRulesLabel.toLowerCase()}`,
      supportingContent: nextPublishCandidate ? (
        <DataCellStack
          primary={
            <strong>
              {nextPublishCandidate.ruleName} · v{nextPublishCandidate.version}
            </strong>
          }
          secondary={
            nextPublishCandidate.applicableTo === "all"
              ? t("common.allTenants")
              : nextPublishCandidate.applicableTo
          }
          tertiary={nextPublishCandidate.notes ?? undefined}
        />
      ) : undefined,
    },
    {
      id: "window",
      title: copy.stepWindowTitle,
      description: copy.stepWindowDescription,
      state: publishRuleFormRuleId
        ? ("current" as const)
        : draftRules.length > 0
          ? ("upcoming" as const)
          : activeRules.length > 0
            ? ("complete" as const)
            : ("upcoming" as const),
      stateLabel: publishRuleFormRuleId
        ? copy.stepStateEditing
        : draftRules.length > 0
          ? copy.stepStateQueued
          : activeRules.length > 0
            ? copy.stepStateLive
            : copy.stepStatePending,
      supportingContent: publishRuleFormRuleId ? (
        <DataCellStack
          primary={publishRuleFormRuleId}
          secondary={t("pricing.leaveBlank")}
        />
      ) : latestActiveRule ? (
        <DataCellStack
          primary={
            <strong>
              {latestActiveRule.ruleName} · v{latestActiveRule.version}
            </strong>
          }
          secondary={formatEffectiveRange(
            latestActiveRule.effectiveFrom,
            latestActiveRule.effectiveTo,
            copy.openEnded,
          )}
        />
      ) : undefined,
    },
    {
      id: "fee-plan",
      title: copy.stepPlanTitle,
      description: copy.stepPlanDescription,
      state:
        feePlans.length > 0
          ? ("complete" as const)
          : activeRules.length > 0
            ? ("current" as const)
            : ("upcoming" as const),
      stateLabel:
        feePlans.length > 0 ? copy.stepStateLive : copy.stepStatePending,
      supportingContent: latestFeePlan ? (
        <DataCellStack
          primary={
            <strong>
              {latestFeePlan.planName} · {latestFeePlan.version}
            </strong>
          }
          secondary={`${formatBpsAsPercent(latestFeePlan.serviceFeeBps)} · ${formatPlatformCodeLabel(
            locale,
            latestFeePlan.reimbursementMode,
          )}`}
          tertiary={formatDateTime(latestFeePlan.publishedAt)}
        />
      ) : undefined,
    },
  ];

  return (
    <div style={pageStackStyle}>
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.pageTitle}
        subtitle={copy.pageSubtitle}
        meta={[
          { label: copy.kpiDrafts, value: draftRules.length, tone: "warning" },
          { label: copy.kpiActive, value: activeRules.length, tone: "success" },
          { label: copy.kpiFeePlans, value: feePlans.length, tone: "info" },
        ]}
        actions={
          <>
            <button
              type="button"
              style={actionButtonStyle({ tone: "primary" })}
              onClick={() => setShowCreate((current) => !current)}
            >
              {showCreate
                ? t("pricing.cancelDraft")
                : t("pricing.newPricingDraft")}
            </button>
            <button
              type="button"
              style={actionButtonStyle()}
              onClick={() => void loadData()}
            >
              {t("common.refresh")}
            </button>
          </>
        }
      />

      {error ? (
        <CalloutBanner
          tone="danger"
          title={`${getPlatformLabel(locale, "error")}: ${error}`}
          description={copy.errorHint}
        />
      ) : null}

      {productRuleCatalog ? (
        <CalloutBanner
          tone="platform"
          eyebrow={copy.overrideTitle}
          title={copy.overrideSubtitle}
          description={copy.overrideSummary}
          meta={
            <div style={chipRowStyle}>
              <StatusChip
                tone="platform"
                label={
                  productRuleCatalog.pricingAuthority.canonicalQuotedFareSource
                }
              />
              <StatusChip
                tone="success"
                label={
                  productRuleCatalog.pricingAuthority
                    .canonicalPricingRuleVersion
                }
              />
            </div>
          }
          footer={copy.overrideFooter}
        />
      ) : null}

      <KpiRow minWidth="170px">
        <KpiCard
          label={copy.kpiDrafts}
          value={draftRules.length}
          detail={
            nextPublishCandidate
              ? `${nextPublishCandidate.ruleName} · v${nextPublishCandidate.version}`
              : copy.nextCandidateNone
          }
          tone="warning"
        />
        <KpiCard
          label={copy.kpiActive}
          value={activeRules.length}
          detail={
            latestActiveRule
              ? `${latestActiveRule.ruleName} · v${latestActiveRule.version}`
              : copy.liveRuleNone
          }
          tone="success"
        />
        <KpiCard
          label={copy.kpiFeePlans}
          value={feePlans.length}
          detail={
            latestFeePlan
              ? `${latestFeePlan.planName} · ${latestFeePlan.version}`
              : copy.feePlanNone
          }
          tone="info"
        />
        <KpiCard
          label={copy.kpiOverride}
          value={
            productRuleCatalog?.pricingAuthority.manualOverrideRequiredFields
              .length ?? 0
          }
          detail={
            productRuleCatalog
              ? productRuleCatalog.pricingAuthority.manualOverrideRequiredFields.join(
                  ", ",
                )
              : "—"
          }
          tone="platform"
        />
      </KpiRow>

      <div style={cardGridStyle}>
        <WorkflowPanel
          title={copy.publishFlowTitle}
          description={copy.publishFlowDescription}
          tone="info"
          footer={
            publishRuleFormRuleId
              ? `${copy.stepWindowTitle}: ${publishRuleFormRuleId}`
              : copy.rulesFooter
          }
        >
          <Stepper items={publishFlowItems} density="compact" />
        </WorkflowPanel>

        {productRuleCatalog ? (
          <DataViewCard
            title={copy.overrideTitle}
            subtitle={copy.overrideSubtitle}
            tone="platform"
            density="compact"
            summary={copy.overrideSummary}
            footer={copy.overrideFooter}
          >
            <DetailList
              columns={1}
              dense
              items={[
                {
                  id: "source",
                  label: "Quoted fare source",
                  value: (
                    <code>
                      {
                        productRuleCatalog.pricingAuthority
                          .canonicalQuotedFareSource
                      }
                    </code>
                  ),
                },
                {
                  id: "version",
                  label: "Rule version",
                  value: (
                    <code>
                      {
                        productRuleCatalog.pricingAuthority
                          .canonicalPricingRuleVersion
                      }
                    </code>
                  ),
                },
                {
                  id: "actors",
                  label: "Override actors",
                  value:
                    productRuleCatalog.pricingAuthority.manualOverrideActorTypes.join(
                      " / ",
                    ),
                },
                {
                  id: "fields",
                  label: "Required fields",
                  value:
                    productRuleCatalog.pricingAuthority.manualOverrideRequiredFields.join(
                      ", ",
                    ),
                },
              ]}
            />
          </DataViewCard>
        ) : null}

        {showCreate ? (
          <DataViewCard
            title={t("pricing.sectionCreateDraft")}
            subtitle={copy.createDraftSubtitle}
            tone="platform"
            density="compact"
            footer={copy.createDraftFooter}
          >
            <form onSubmit={handleCreatePricingRule} style={formStackStyle}>
              <div style={fieldGridStyle}>
                <label style={fieldGroupStyle}>
                  <span style={fieldLabelStyle}>
                    {t("pricing.form.ruleName")}
                  </span>
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
                <label style={fieldGroupStyle}>
                  <span style={fieldLabelStyle}>
                    {t("pricing.form.version")}
                  </span>
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
                <label style={fieldGroupStyle}>
                  <span style={fieldLabelStyle}>
                    {t("pricing.form.applicableTo")}
                  </span>
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
                <label style={fieldGroupStyle}>
                  <span style={fieldLabelStyle}>
                    {t("pricing.form.serviceFeeBps")}
                  </span>
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
                <label style={fieldGroupStyle}>
                  <span style={fieldLabelStyle}>
                    {t("pricing.form.reimbMode")}
                  </span>
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
              <label style={fieldGroupStyle}>
                <span style={fieldLabelStyle}>{t("pricing.form.notes")}</span>
                <textarea
                  value={pricingForm.notes}
                  onChange={(event) =>
                    setPricingForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={4}
                  style={textareaStyle}
                />
              </label>
              <div style={actionsRowStyle}>
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
              </div>
            </form>
          </DataViewCard>
        ) : null}

        <DataViewCard
          title={t("pricing.sectionPublishPlan")}
          subtitle={copy.publishPlanSubtitle}
          tone="platform"
          density="compact"
          footer={copy.publishPlanFooter}
        >
          <form onSubmit={handlePublishFeePlan} style={formStackStyle}>
            <div style={fieldGridStyle}>
              <label style={fieldGroupStyle}>
                <span style={fieldLabelStyle}>
                  {t("pricing.form.planName")}
                </span>
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
              <label style={fieldGroupStyle}>
                <span style={fieldLabelStyle}>{t("pricing.form.version")}</span>
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
              <label style={fieldGroupStyle}>
                <span style={fieldLabelStyle}>
                  {t("pricing.form.serviceFeeBps")}
                </span>
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
              <label style={fieldGroupStyle}>
                <span style={fieldLabelStyle}>
                  {t("pricing.form.reimbMode")}
                </span>
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
            <div style={actionsRowStyle}>
              <button
                type="submit"
                style={actionButtonStyle({ tone: "primary" })}
                disabled={publishingFeePlan || !feePlanForm.version.trim()}
              >
                {publishingFeePlan
                  ? t("pricing.publishing")
                  : t("pricing.publishSettlementPlan")}
              </button>
            </div>
          </form>
        </DataViewCard>
      </div>

      <DataViewCard
        title={t("pricing.sectionPricingRules")}
        subtitle={copy.rulesSubtitle(filteredRules.length)}
        tone="platform"
        density="compact"
        filters={
          <DataFilterBar
            value={filter}
            ariaLabel={copy.pricingRulesLabel}
            onChange={setFilter}
            filters={[
              {
                value: "all",
                label: formatPlatformCodeLabel(locale, "all"),
                count: rules.length,
              },
              {
                value: "active",
                label: formatPlatformCodeLabel(locale, "active"),
                count: activeRules.length,
                tone: "success",
              },
              {
                value: "draft",
                label: formatPlatformCodeLabel(locale, "draft"),
                count: draftRules.length,
                tone: "warning",
              },
              {
                value: "archived",
                label: formatPlatformCodeLabel(locale, "archived"),
                count: archivedRules.length,
              },
            ]}
          />
        }
        summary={copy.rulesSummary}
        footer={copy.rulesFooter}
      >
        <DataTable
          density="compact"
          tone="platform"
          minWidth={1180}
          empty={t("pricing.noRules")}
          columns={[
            { label: t("pricing.col.rule"), width: "220px" },
            { label: t("pricing.col.version"), width: "110px" },
            { label: t("pricing.col.status"), width: "120px" },
            {
              label: t("pricing.col.serviceFee"),
              width: "120px",
              align: "right",
            },
            { label: t("pricing.col.reimbMode"), width: "150px" },
            { label: getPlatformLabel(locale, "applicableTo"), width: "150px" },
            { label: "Effective window", width: "220px" },
            { label: t("pricing.form.notes"), width: "240px" },
            { label: t("common.actions"), width: "280px" },
          ]}
        >
          {filteredRules.map((rule) => (
            <Tr
              key={rule.ruleId}
              highlighted={publishRuleFormRuleId === rule.ruleId}
            >
              <Td density="compact">
                <DataCellStack
                  primary={<strong>{rule.ruleName}</strong>}
                  secondary={rule.ruleId}
                  tertiary={rule.publishedBy ?? undefined}
                />
              </Td>
              <Td density="compact" mono>
                v{rule.version}
              </Td>
              <Td density="compact">
                <StatusChip
                  tone={pricingRuleStatusTone(rule.status)}
                  label={formatPlatformCodeLabel(locale, rule.status)}
                />
              </Td>
              <Td density="compact" mono align="right">
                {formatBpsAsPercent(rule.serviceFeeBps)}
              </Td>
              <Td density="compact">
                <StatusChip
                  tone="info"
                  label={formatPlatformCodeLabel(
                    locale,
                    rule.reimbursementMode,
                  )}
                />
              </Td>
              <Td density="compact">
                {rule.applicableTo === "all"
                  ? t("common.allTenants")
                  : rule.applicableTo}
              </Td>
              <Td density="compact">
                <DataCellStack
                  primary={formatEffectiveRange(
                    rule.effectiveFrom,
                    rule.effectiveTo,
                    copy.openEnded,
                  )}
                  secondary={
                    rule.publishedAt
                      ? `${t("pricing.confirmPublish")} · ${formatDateTime(
                          rule.publishedAt,
                        )}`
                      : undefined
                  }
                />
              </Td>
              <Td density="compact" muted={!rule.notes}>
                {rule.notes || "—"}
              </Td>
              <Td density="compact">
                {rule.status === "draft" ? (
                  <div style={inlineActionStackStyle}>
                    <button
                      type="button"
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
                      <div style={inlinePublishCardStyle}>
                        {publishRuleFormError ? (
                          <p style={inlineErrorStyle}>{publishRuleFormError}</p>
                        ) : null}
                        <label style={fieldGroupStyle}>
                          <span style={fieldLabelStyle}>
                            {t("pricing.effectiveFromOverride")}
                          </span>
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
                        <label style={fieldGroupStyle}>
                          <span style={fieldLabelStyle}>
                            {t("pricing.effectiveToOverride")}
                          </span>
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
                        <p style={inlineHelperStyle}>
                          {t("pricing.leaveBlank")}
                        </p>
                        <div style={actionsRowStyle}>
                          <button
                            type="button"
                            style={actionButtonStyle()}
                            onClick={closePublishRuleForm}
                            disabled={publishingRuleId === rule.ruleId}
                          >
                            {t("common.cancel")}
                          </button>
                          <button
                            type="button"
                            style={actionButtonStyle({ tone: "primary" })}
                            onClick={() => void handlePublishRule(rule.ruleId)}
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
                  <span style={immutableTextStyle}>
                    {t("common.immutableHistory")}
                  </span>
                )}
              </Td>
            </Tr>
          ))}
        </DataTable>
      </DataViewCard>

      <div style={cardGridStyle}>
        <DataViewCard
          title={t("pricing.sectionSettlementPlans")}
          subtitle={copy.feePlansSubtitle(feePlans.length)}
          tone="platform"
          density="compact"
          footer={copy.feePlansFooter}
        >
          <DataTable
            density="compact"
            tone="platform"
            minWidth={760}
            empty={t("pricing.noPlans")}
            columns={[
              { label: t("pricing.col.plan"), width: "220px" },
              { label: t("pricing.col.version"), width: "120px" },
              {
                label: t("pricing.col.serviceFee"),
                width: "120px",
                align: "right",
              },
              { label: t("pricing.col.reimbMode"), width: "150px" },
              { label: t("pricing.col.status"), width: "120px" },
              { label: "Published at", width: "180px" },
            ]}
          >
            {feePlans.map((plan) => (
              <Tr key={plan.feePlanId}>
                <Td density="compact">
                  <DataCellStack
                    primary={<strong>{plan.planName}</strong>}
                    secondary={plan.feePlanId}
                  />
                </Td>
                <Td density="compact" mono>
                  {plan.version}
                </Td>
                <Td density="compact" mono align="right">
                  {formatBpsAsPercent(plan.serviceFeeBps)}
                </Td>
                <Td density="compact">
                  <StatusChip
                    tone="info"
                    label={formatPlatformCodeLabel(
                      locale,
                      plan.reimbursementMode,
                    )}
                  />
                </Td>
                <Td density="compact">
                  <StatusChip
                    tone="success"
                    label={formatPlatformCodeLabel(locale, plan.status)}
                  />
                </Td>
                <Td density="compact" mono>
                  {formatDateTime(plan.publishedAt)}
                </Td>
              </Tr>
            ))}
          </DataTable>
        </DataViewCard>

        <DataViewCard
          title={copy.releaseTitle}
          subtitle={copy.releaseSubtitle}
          tone="info"
          density="compact"
          footer={copy.releaseFooter}
        >
          <DetailList
            columns={1}
            dense
            items={[
              {
                id: "live-rule",
                label: copy.liveRuleLabel,
                value: latestActiveRule ? (
                  <DataCellStack
                    primary={
                      <strong>
                        {latestActiveRule.ruleName} · v
                        {latestActiveRule.version}
                      </strong>
                    }
                    secondary={formatEffectiveRange(
                      latestActiveRule.effectiveFrom,
                      latestActiveRule.effectiveTo,
                      copy.openEnded,
                    )}
                    tertiary={latestActiveRule.publishedBy ?? undefined}
                  />
                ) : (
                  copy.liveRuleNone
                ),
              },
              {
                id: "candidate",
                label: copy.nextCandidateLabel,
                value: nextPublishCandidate ? (
                  <DataCellStack
                    primary={
                      <strong>
                        {nextPublishCandidate.ruleName} · v
                        {nextPublishCandidate.version}
                      </strong>
                    }
                    secondary={
                      nextPublishCandidate.applicableTo === "all"
                        ? t("common.allTenants")
                        : nextPublishCandidate.applicableTo
                    }
                    tertiary={nextPublishCandidate.notes ?? undefined}
                  />
                ) : (
                  copy.nextCandidateNone
                ),
              },
              {
                id: "fee-plan",
                label: copy.feePlanLabel,
                value: latestFeePlan ? (
                  <DataCellStack
                    primary={
                      <strong>
                        {latestFeePlan.planName} · {latestFeePlan.version}
                      </strong>
                    }
                    secondary={`${formatBpsAsPercent(
                      latestFeePlan.serviceFeeBps,
                    )} · ${formatPlatformCodeLabel(
                      locale,
                      latestFeePlan.reimbursementMode,
                    )}`}
                    tertiary={formatDateTime(latestFeePlan.publishedAt)}
                  />
                ) : (
                  copy.feePlanNone
                ),
              },
              {
                id: "service-buckets",
                label: copy.serviceBucketsLabel,
                value:
                  productRuleCatalog?.phase1ServiceBuckets.join(" / ") ?? "—",
                hint: copy.serviceBucketsHint,
              },
            ]}
          />
        </DataViewCard>
      </div>
    </div>
  );
}

const pageStackStyle: React.CSSProperties = {
  display: "grid",
  gap: 20,
};

const cardGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
  gap: 16,
  alignItems: "start",
};

const chipRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const formStackStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const fieldGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const fieldGroupStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  color: "#475569",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 104,
  resize: "vertical",
};

const actionsRowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const inlineActionStackStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  minWidth: 260,
};

const inlinePublishCardStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  padding: 12,
  borderRadius: 16,
  background: "#f8fafc",
  border: "1px solid rgba(148,163,184,0.24)",
};

const inlineHelperStyle: React.CSSProperties = {
  margin: 0,
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.5,
};

const inlineErrorStyle: React.CSSProperties = {
  margin: 0,
  color: "#dc2626",
  fontSize: 12.5,
  lineHeight: 1.5,
};

const immutableTextStyle: React.CSSProperties = {
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.5,
};
