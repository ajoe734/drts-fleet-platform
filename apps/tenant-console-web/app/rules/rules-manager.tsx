"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  TENANT_APPROVAL_MODES,
  TENANT_APPROVAL_RULE_ACTIONS,
  TENANT_APPROVAL_RULE_CONDITION_FIELDS,
  TENANT_APPROVAL_RULE_CONDITION_OPERATORS,
  TENANT_APPROVAL_RULE_PRIORITY_STEP,
  TENANT_PRINCIPAL_KINDS,
  type EmptyReason,
  type ResourceActionDescriptor,
  type TenantApprovalEvaluationResult,
  type TenantApprovalFallbackPolicy,
  type TenantApprovalMode,
  type TenantApprovalRuleAction,
  type TenantApprovalRuleCondition,
  type TenantApprovalRuleConditionField,
  type TenantApprovalRuleConditionOperator,
  type TenantApprovalRuleRecord,
  type TenantBookingApprovalRequestRecord,
  type TenantPrincipalRef,
  type TenantQuotaEnforcementMode,
  type TenantQuotaLedgerEntry,
  type TenantQuotaSummary,
} from "@drts/contracts";
import {
  CalloutBanner,
  DataCellStack,
  DataTable,
  DataViewCard,
  DetailMetadataGrid,
  KpiCard,
  KpiRow,
  PageHeader,
  StatusChip,
  Td,
  Tr,
  WorkflowEmptyState,
  WorkflowSplitLayout,
  managementPageStackStyle,
} from "@drts/ui-web";
import { formatCount, formatDateTime } from "@/lib/formatters";
import {
  disableApprovalRuleAction,
  previewAndEvaluateApprovalRulesAction,
  reorderApprovalRulesAction,
  upsertApprovalRuleAction,
  upsertTenantQuotaPolicyAction,
} from "./actions";
import { useTranslation } from "@/lib/i18n";
import type { RulesFlashPayload } from "./constants";

type RulesManagerProps = {
  rules: TenantApprovalRuleRecord[];
  quotaSummary: TenantQuotaSummary | null;
  approvalRequests: TenantBookingApprovalRequestRecord[];
  ledgerEntries: TenantQuotaLedgerEntry[];
  errors: string[];
  emptyReason: EmptyReason | null;
  generatedAt: string;
  refreshTier: "slow";
  availableActions: ResourceActionDescriptor[];
};

type EditableCondition = {
  id: string;
  field: TenantApprovalRuleConditionField;
  operator: TenantApprovalRuleConditionOperator;
  valueKind: "text" | "number" | "boolean" | "list";
  valueText: string;
};

type EditableApprover = {
  id: string;
  kind: TenantPrincipalRef["kind"];
  userId: string;
  roleCode: string;
  costCenterCode: string;
  displayName: string;
};

type RuleDraft = {
  ruleId: string;
  ruleName: string;
  description: string;
  priority: string;
  activeFlag: boolean;
  action: TenantApprovalRuleAction;
  approvalMode: TenantApprovalMode;
  timeoutHoursOverride: string;
  fallbackPolicy: TenantApprovalFallbackPolicy;
  effectiveFrom: string;
  effectiveUntil: string;
  disabledReason: string;
  conditions: EditableCondition[];
  approvers: EditableApprover[];
};

type QuotaDraft = {
  bookingCountLimit: string;
  amountMinorLimit: string;
  currency: string;
  enforcementMode: TenantQuotaEnforcementMode;
};

type EvaluationDecision = NonNullable<
  TenantApprovalEvaluationResult["outcome"]
>["decision"];

type RulesTranslator = (
  key: string,
  params?: Record<string, string | number>,
) => string;

const TENANT_APPROVAL_FALLBACK_POLICIES: readonly TenantApprovalFallbackPolicy[] =
  ["auto_reject", "escalate_to_tenant_admin", "manual_ops_review"] as const;

const TENANT_QUOTA_ENFORCEMENT_MODES: readonly TenantQuotaEnforcementMode[] = [
  "warn_only",
  "require_approval",
  "hard_block",
] as const;

const pageStackStyle = {
  ...managementPageStackStyle(),
  maxWidth: "1180px",
  margin: "0 auto",
};

const pillButtonStyle = (primary = false) => ({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "40px",
  padding: "0 16px",
  borderRadius: "999px",
  border: primary ? "1px solid transparent" : "1px solid #99f6e4",
  background: primary ? "#0f766e" : "#f0fdfa",
  color: primary ? "#ffffff" : "#115e59",
  fontSize: "13px",
  fontWeight: 700,
  textDecoration: "none",
  cursor: "pointer",
});

const secondaryButtonStyle = {
  ...pillButtonStyle(),
  minHeight: "34px",
  padding: "0 12px",
  fontSize: "12.5px",
};

const dangerButtonStyle = {
  ...pillButtonStyle(),
  minHeight: "34px",
  padding: "0 12px",
  fontSize: "12.5px",
  border: "1px solid #fecaca",
  background: "#fff1f2",
  color: "#be123c",
};

const formGridStyle = {
  display: "grid",
  gap: "16px",
};

const columnGridStyle = {
  display: "grid",
  gap: "14px",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const fieldGridStyle = {
  display: "grid",
  gap: "6px",
};

const fieldLabelStyle = {
  fontSize: "11.5px",
  fontWeight: 700,
  color: "#475569",
  textTransform: "uppercase" as const,
  letterSpacing: "0.08em",
};

const inputStyle = {
  width: "100%",
  minHeight: "42px",
  borderRadius: "14px",
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#0f172a",
  padding: "10px 12px",
  fontSize: "13px",
};

const textareaStyle = {
  ...inputStyle,
  minHeight: "88px",
  resize: "vertical" as const,
};

const hintStyle = {
  color: "#64748b",
  fontSize: "12px",
  lineHeight: 1.5,
};

const sectionDividerStyle = {
  display: "grid",
  gap: "8px",
  paddingTop: "8px",
  borderTop: "1px solid #e2e8f0",
};

const chipWrapStyle = {
  display: "flex",
  flexWrap: "wrap" as const,
  gap: "8px",
};

const compactTableWrapStyle = {
  overflowX: "auto" as const,
};

const actionLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "40px",
  padding: "0 16px",
  borderRadius: "999px",
  border: "1px solid #99f6e4",
  background: "#f0fdfa",
  color: "#115e59",
  fontSize: "13px",
  fontWeight: 700,
  textDecoration: "none",
};

const disabledActionStyle = {
  ...actionLinkStyle,
  border: "1px solid #e2e8f0",
  background: "#f8fafc",
  color: "#94a3b8",
  cursor: "not-allowed",
};

function createId() {
  return `rule-ui-${Math.random().toString(36).slice(2, 10)}`;
}

function buildEmptyCondition(): EditableCondition {
  return {
    id: createId(),
    field: "booking.amount_minor",
    operator: "gte",
    valueKind: "number",
    valueText: "100000",
  };
}

function buildEmptyApprover(): EditableApprover {
  return {
    id: createId(),
    kind: "tenant_admin",
    userId: "",
    roleCode: "",
    costCenterCode: "",
    displayName: "",
  };
}

function formatConditionValue(
  value:
    | TenantApprovalRuleCondition["value"]
    | TenantApprovalRuleCondition["values"],
) {
  if (Array.isArray(value)) {
    return value.join(", ");
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return value === null || value === undefined ? "null" : String(value);
}

function detectConditionValueKind(
  condition: TenantApprovalRuleCondition,
): EditableCondition["valueKind"] {
  const value = condition.value ?? condition.values;
  if (Array.isArray(value)) {
    return "list";
  }
  if (typeof value === "number") {
    return "number";
  }
  if (typeof value === "boolean") {
    return "boolean";
  }
  return "text";
}

function toEditableCondition(
  condition: TenantApprovalRuleCondition,
): EditableCondition {
  return {
    id: createId(),
    field: condition.field,
    operator:
      condition.op ??
      condition.operator ??
      TENANT_APPROVAL_RULE_CONDITION_OPERATORS[0],
    valueKind: detectConditionValueKind(condition),
    valueText: formatConditionValue(condition.value ?? condition.values),
  };
}

function toEditableApprover(approver: TenantPrincipalRef): EditableApprover {
  return {
    id: createId(),
    kind: approver.kind,
    userId: approver.userId ?? "",
    roleCode: approver.roleCode ?? "",
    costCenterCode: approver.costCenterCode ?? "",
    displayName: approver.displayName ?? "",
  };
}

function normalizeIsoInput(value: string | null | undefined) {
  return value ?? "";
}

function buildRuleDraft(
  rule: TenantApprovalRuleRecord | null,
  nextPriority: number,
): RuleDraft {
  if (!rule) {
    return {
      ruleId: "",
      ruleName: "",
      description: "",
      priority: String(nextPriority),
      activeFlag: true,
      action: "require_approval",
      approvalMode: "any_of",
      timeoutHoursOverride: "",
      fallbackPolicy: "escalate_to_tenant_admin",
      effectiveFrom: "",
      effectiveUntil: "",
      disabledReason: "",
      conditions: [buildEmptyCondition()],
      approvers: [buildEmptyApprover()],
    };
  }

  return {
    ruleId: rule.ruleId,
    ruleName: rule.ruleName ?? rule.name ?? "",
    description: rule.description ?? "",
    priority: String(rule.priority),
    activeFlag: rule.activeFlag,
    action: rule.action,
    approvalMode: rule.approvalMode ?? "any_of",
    timeoutHoursOverride:
      rule.timeoutHoursOverride === null ||
      rule.timeoutHoursOverride === undefined
        ? ""
        : String(rule.timeoutHoursOverride),
    fallbackPolicy: rule.fallbackPolicyOverride ?? "escalate_to_tenant_admin",
    effectiveFrom: normalizeIsoInput(rule.effectiveFrom),
    effectiveUntil: normalizeIsoInput(rule.effectiveUntil),
    disabledReason: rule.disabledReason ?? "",
    conditions:
      rule.conditions.length > 0
        ? rule.conditions.map(toEditableCondition)
        : [buildEmptyCondition()],
    approvers:
      rule.approvers.length > 0
        ? rule.approvers.map(toEditableApprover)
        : [buildEmptyApprover()],
  };
}

function buildQuotaDraft(quotaSummary: TenantQuotaSummary | null): QuotaDraft {
  return {
    bookingCountLimit:
      quotaSummary?.limit.bookingCountLimit === null ||
      quotaSummary?.limit.bookingCountLimit === undefined
        ? ""
        : String(quotaSummary.limit.bookingCountLimit),
    amountMinorLimit:
      quotaSummary?.limit.amountMinorLimit === null ||
      quotaSummary?.limit.amountMinorLimit === undefined
        ? ""
        : String(quotaSummary.limit.amountMinorLimit),
    currency: quotaSummary?.limit.currency ?? "TWD",
    enforcementMode: quotaSummary?.limit.enforcementMode ?? "require_approval",
  };
}

function getRuleStateTone(rule: TenantApprovalRuleRecord) {
  return rule.activeFlag ? "success" : "neutral";
}

function getApprovalRequestTone(
  status: TenantBookingApprovalRequestRecord["status"],
) {
  switch (status) {
    case "pending":
      return "warning" as const;
    case "approved":
      return "success" as const;
    case "rejected":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function getDecisionTone(decision: EvaluationDecision | undefined) {
  switch (decision) {
    case "allow":
      return "success" as const;
    case "warn":
      return "warning" as const;
    case "require_approval":
    case "manual_review":
      return "tenant" as const;
    case "block":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function getQuotaTriggerTone(triggered: string) {
  switch (triggered) {
    case "none":
      return "success" as const;
    case "warn":
      return "warning" as const;
    case "approval":
      return "tenant" as const;
    case "block":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

function describeApprover(
  approver: TenantPrincipalRef,
  translate: RulesTranslator,
) {
  if (approver.displayName) {
    return approver.displayName;
  }

  switch (approver.kind) {
    case "cost_center_owner":
      return approver.costCenterCode
        ? translate("rules.approver.kindWithValue", {
            kind: translate("rules.enum.principalKind.cost_center_owner"),
            value: approver.costCenterCode,
          })
        : translate("rules.enum.principalKind.cost_center_owner");
    case "tenant_user":
    case "user":
      return approver.userId
        ? translate("rules.approver.kindWithValue", {
            kind: translate(`rules.enum.principalKind.${approver.kind}`),
            value: approver.userId,
          })
        : translate(`rules.enum.principalKind.${approver.kind}`);
    case "tenant_role":
    case "role":
      return approver.roleCode
        ? translate("rules.approver.kindWithValue", {
            kind: translate(`rules.enum.principalKind.${approver.kind}`),
            value: approver.roleCode,
          })
        : translate(`rules.enum.principalKind.${approver.kind}`);
    default:
      return translate(`rules.enum.principalKind.${approver.kind}`);
  }
}

function formatConditionSummary(
  condition: TenantApprovalRuleCondition,
  translate: RulesTranslator,
) {
  const operator = condition.op ?? condition.operator ?? "eq";
  const value = formatConditionValue(condition.value ?? condition.values);
  return translate("rules.condition.summary", {
    field: translate(`rules.enum.conditionField.${condition.field}`),
    operator: translate(`rules.enum.operator.${operator}`),
    value,
  });
}

function formatRuleSummary(
  rule: TenantApprovalRuleRecord,
  translate: RulesTranslator,
) {
  return rule.conditions
    .map((condition) => formatConditionSummary(condition, translate))
    .join(` ${translate("rules.condition.and")} `);
}

function formatRuleApprovers(
  rule: TenantApprovalRuleRecord,
  translate: RulesTranslator,
) {
  if (rule.action !== "require_approval" || rule.approvers.length === 0) {
    return translate("rules.value.noApprovalChain");
  }

  return rule.approvers
    .map((approver) => describeApprover(approver, translate))
    .join(` ${translate("rules.value.joinPlus")} `);
}

function formatQuotaValue(value: number | null, translate: RulesTranslator) {
  return value === null ? translate("rules.value.unlimited") : formatCount(value);
}

function formatPercentage(value: number | null, translate: RulesTranslator) {
  return value === null ? translate("rules.value.unknown") : `${value}%`;
}

function swapRuleOrder(ruleIds: string[], ruleId: string, delta: number) {
  const next = [...ruleIds];
  const currentIndex = next.findIndex((item) => item === ruleId);
  if (currentIndex < 0) {
    return next;
  }

  const targetIndex = currentIndex + delta;
  if (targetIndex < 0 || targetIndex >= next.length) {
    return next;
  }

  const currentValue = next[currentIndex];
  const targetValue = next[targetIndex];
  if (!currentValue || !targetValue) {
    return next;
  }

  next[currentIndex] = targetValue;
  next[targetIndex] = currentValue;
  return next;
}

function maybeCountWarnings(evaluation: TenantApprovalEvaluationResult | null) {
  if (!evaluation?.outcome?.warnings) {
    return 0;
  }

  return evaluation.outcome.warnings.length;
}

function getEmptyStateTone(reason: EmptyReason | null) {
  switch (reason) {
    case "fetch_failed":
    case "external_unavailable":
      return "warning" as const;
    case "permission_denied":
      return "danger" as const;
    case "filtered_empty":
      return "neutral" as const;
    case "not_provisioned":
      return "tenant" as const;
    case "no_data":
    default:
      return "tenant" as const;
  }
}

function getEmptyStateCopy(reason: EmptyReason | null, translate: RulesTranslator) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: translate("rules.empty.notProvisioned.title"),
        description: translate("rules.empty.notProvisioned.description"),
      };
    case "fetch_failed":
      return {
        title: translate("rules.empty.fetchFailed.title"),
        description: translate("rules.empty.fetchFailed.description"),
      };
    case "permission_denied":
      return {
        title: translate("rules.empty.permissionDenied.title"),
        description: translate("rules.empty.permissionDenied.description"),
      };
    case "external_unavailable":
      return {
        title: translate("rules.empty.externalUnavailable.title"),
        description: translate("rules.empty.externalUnavailable.description"),
      };
    case "filtered_empty":
      return {
        title: translate("rules.empty.filteredEmpty.title"),
        description: translate("rules.empty.filteredEmpty.description"),
      };
    case "no_data":
    default:
      return {
        title: translate("rules.empty.noData.title"),
        description: translate("rules.empty.noData.description"),
      };
  }
}

function findAction(
  availableActions: ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return availableActions.find((item) => item.action === action) ?? null;
}

export function RulesManager({
  rules,
  quotaSummary,
  approvalRequests,
  ledgerEntries,
  errors,
  emptyReason,
  generatedAt,
  refreshTier,
  availableActions,
}: RulesManagerProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const [flash, setFlash] = useState<RulesFlashPayload | null>(null);
  const [evaluation, setEvaluation] =
    useState<TenantApprovalEvaluationResult | null>(null);
  const [pending, startTransition] = useTransition();

  const sortedRules = [...rules].sort(
    (left, right) => left.priority - right.priority,
  );
  const nextPriority =
    (sortedRules.at(-1)?.priority ?? 0) + TENANT_APPROVAL_RULE_PRIORITY_STEP;
  const [selectedRuleId, setSelectedRuleId] = useState(
    sortedRules[0]?.ruleId ?? "",
  );
  const [ruleDraft, setRuleDraft] = useState<RuleDraft>(() =>
    buildRuleDraft(sortedRules[0] ?? null, nextPriority),
  );
  const [quotaDraft, setQuotaDraft] = useState<QuotaDraft>(() =>
    buildQuotaDraft(quotaSummary),
  );

  useEffect(() => {
    if (sortedRules.length === 0) {
      if (selectedRuleId !== "") {
        setSelectedRuleId("");
      }
      return;
    }

    const stillExists = sortedRules.some(
      (rule) => rule.ruleId === selectedRuleId,
    );
    const firstRuleId = sortedRules[0]?.ruleId;
    if (!stillExists && firstRuleId) {
      setSelectedRuleId(firstRuleId);
    }
  }, [selectedRuleId, sortedRules]);

  useEffect(() => {
    setQuotaDraft(buildQuotaDraft(quotaSummary));
  }, [quotaSummary]);

  const selectedRule =
    sortedRules.find((rule) => rule.ruleId === selectedRuleId) ?? null;
  const selectedRuleIndex = selectedRule
    ? sortedRules.findIndex((rule) => rule.ruleId === selectedRule.ruleId)
    : -1;
  const activeRules = sortedRules.filter((rule) => rule.activeFlag);
  const pendingApprovals = approvalRequests.filter(
    (request) => request.status === "pending",
  );
  const remainingQuotaPercent = quotaSummary?.usage.remainingPercent ?? null;
  const createRuleAction = findAction(availableActions, "create_rule");
  const updateRuleAction = findAction(availableActions, "update_rule");
  const disableRuleAction = findAction(availableActions, "disable_rule");
  const reorderRuleAction = findAction(availableActions, "reorder_precedence");
  const dryRunAction = findAction(availableActions, "dry_run_evaluate");
  const emptyStateCopy = getEmptyStateCopy(emptyReason, t);

  function selectRule(rule: TenantApprovalRuleRecord) {
    setSelectedRuleId(rule.ruleId);
    setRuleDraft(buildRuleDraft(rule, nextPriority));
  }

  function resetRuleDraft() {
    setSelectedRuleId("");
    setRuleDraft(buildRuleDraft(null, nextPriority));
  }

  function updateCondition(
    conditionId: string,
    field: keyof EditableCondition,
    value: string,
  ) {
    setRuleDraft((current) => ({
      ...current,
      conditions: current.conditions.map((condition) =>
        condition.id === conditionId
          ? {
              ...condition,
              [field]: value,
            }
          : condition,
      ),
    }));
  }

  function updateApprover(
    approverId: string,
    field: keyof EditableApprover,
    value: string,
  ) {
    setRuleDraft((current) => ({
      ...current,
      approvers: current.approvers.map((approver) =>
        approver.id === approverId
          ? {
              ...approver,
              [field]: value,
            }
          : approver,
      ),
    }));
  }

  function runAction(
    action: (formData: FormData) => Promise<RulesFlashPayload>,
    formData: FormData,
    options?: {
      refresh?: boolean;
      clearRuleDraft?: boolean;
    },
  ) {
    startTransition(async () => {
      const result = await action(formData);
      setFlash(result);

      if (result.evaluation) {
        setEvaluation(result.evaluation);
      }

      if (result.tone === "default") {
        if (options?.clearRuleDraft) {
          resetRuleDraft();
        }

        if (options?.refresh !== false) {
          router.refresh();
        }
      }
    });
  }

  return (
    <div style={pageStackStyle}>
      <PageHeader
        eyebrow={t("rules.header.eyebrow")}
        title={t("rules.header.title")}
        subtitle={t("rules.header.subtitle")}
        meta={[
          {
            label: t("rules.meta.rules"),
            value: formatCount(sortedRules.length),
            tone: "tenant",
          },
          {
            label: t("rules.meta.active"),
            value: formatCount(activeRules.length),
            tone: "success",
          },
          {
            label: t("rules.meta.pendingApprovals"),
            value: formatCount(pendingApprovals.length),
            tone: "warning",
          },
        ]}
        actions={
          <>
            <a
              href="#rule-editor"
              style={
                createRuleAction?.enabled === false
                  ? disabledActionStyle
                  : actionLinkStyle
              }
              title={createRuleAction?.disabledReasonCode}
            >
              {t("rules.action.newRule")}
            </a>
            <a
              href="#rule-dry-run"
              style={
                dryRunAction?.enabled === false
                  ? { ...pillButtonStyle(true), ...disabledActionStyle }
                  : pillButtonStyle(true)
              }
              title={dryRunAction?.disabledReasonCode}
            >
              {t("rules.action.dryRun")}
            </a>
          </>
        }
      />

      {flash ? (
        <CalloutBanner
          title={flash.title}
          description={flash.description}
          tone={flash.tone === "warning" ? "warning" : "tenant"}
          density="compact"
        />
      ) : null}

      {errors.length > 0 ? (
        <CalloutBanner
          title={t("rules.error.partialLoadTitle")}
          description={t("rules.error.partialLoadDescription")}
          tone="warning"
          density="compact"
        >
          <ul style={{ margin: 0, paddingLeft: "18px" }}>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </CalloutBanner>
      ) : null}

      <CalloutBanner
        title={t("rules.banner.refreshTitle")}
        description={t("rules.banner.refreshDescription", {
          refreshTier,
          generatedAt: formatDateTime(generatedAt),
        })}
        tone="info"
        density="compact"
      />

      <KpiRow minWidth="180px">
        <KpiCard
          label={t("rules.kpi.rules")}
          value={formatCount(sortedRules.length)}
          detail={t("rules.kpi.rulesDetail")}
          tone="tenant"
        />
        <KpiCard
          label={t("rules.kpi.remainingQuota")}
          value={formatPercentage(remainingQuotaPercent, t)}
          detail={t("rules.kpi.remainingQuotaDetail")}
          tone={
            remainingQuotaPercent !== null && remainingQuotaPercent <= 10
              ? "warning"
              : "success"
          }
        />
        <KpiCard
          label={t("rules.kpi.pending")}
          value={formatCount(pendingApprovals.length)}
          detail={t("rules.kpi.pendingDetail")}
          tone="warning"
        />
        <KpiCard
          label={t("rules.kpi.ledger")}
          value={formatCount(ledgerEntries.length)}
          detail={t("rules.kpi.ledgerDetail")}
          tone="info"
        />
      </KpiRow>

      <CalloutBanner
        title={t("rules.banner.contractTitle")}
        description={t("rules.banner.contractDescription")}
        tone="tenant"
        density="compact"
      />

      <CalloutBanner
        title={t("rules.banner.linksTitle")}
        description={t("rules.banner.linksDescription")}
        tone="tenant"
        density="compact"
      />

      <WorkflowSplitLayout
        main={
          <>
            <DataViewCard
              title={t("rules.list.title")}
              subtitle={t("rules.list.subtitle")}
              tone="tenant"
              density="compact"
              summary={t("rules.list.summary", {
                count: sortedRules.length,
              })}
            >
              {sortedRules.length > 0 ? (
                <div style={compactTableWrapStyle}>
                  <DataTable
                    density="compact"
                    tone="tenant"
                    columns={[
                      { label: t("rules.list.column.priority"), width: "70px" },
                      { label: t("rules.list.column.rule"), width: "220px" },
                      { label: t("rules.list.column.conditions"), width: "360px" },
                      { label: t("rules.list.column.action"), width: "140px" },
                      { label: t("rules.list.column.approvers"), width: "220px" },
                      { label: t("rules.list.column.status"), width: "110px" },
                      { label: t("rules.list.column.updatedAt"), width: "150px" },
                      { label: t("rules.list.column.focus"), width: "110px" },
                    ]}
                  >
                    {sortedRules.map((rule) => (
                      <Tr key={rule.ruleId}>
                        <Td density="compact" mono>
                          {rule.priority}
                        </Td>
                        <Td density="compact">
                          <DataCellStack
                            primary={
                              <strong>
                                {rule.ruleName ?? rule.name ?? rule.ruleId}
                              </strong>
                            }
                            secondary={rule.description ?? rule.ruleId}
                          />
                        </Td>
                        <Td density="compact">
                          <DataCellStack
                            primary={formatRuleSummary(rule, t)}
                            secondary={
                              rule.effectiveUntil
                                ? t("rules.list.window.until", {
                                    value: formatDateTime(rule.effectiveUntil),
                                  })
                                : rule.effectiveFrom
                                  ? t("rules.list.window.from", {
                                      value: formatDateTime(rule.effectiveFrom),
                                    })
                                  : t("rules.list.window.none")
                            }
                          />
                        </Td>
                        <Td density="compact">
                          <div style={chipWrapStyle}>
                            <StatusChip
                              tone="tenant"
                              label={t(`rules.enum.action.${rule.action}`)}
                            />
                            {rule.approvalMode ? (
                              <StatusChip
                                tone="info"
                                label={t(
                                  `rules.enum.approvalMode.${rule.approvalMode}`,
                                )}
                              />
                            ) : null}
                          </div>
                        </Td>
                        <Td density="compact">
                          <DataCellStack
                            primary={formatRuleApprovers(rule, t)}
                            secondary={
                              rule.timeoutHoursOverride
                                ? t("rules.list.timeout.override", {
                                    hours: rule.timeoutHoursOverride,
                                  })
                                : t("rules.list.timeout.default")
                            }
                          />
                        </Td>
                        <Td density="compact">
                          <StatusChip
                            tone={getRuleStateTone(rule)}
                            label={t(
                              rule.activeFlag
                                ? "rules.state.active"
                                : "rules.state.paused",
                            )}
                          />
                        </Td>
                        <Td density="compact" mono>
                          {formatDateTime(rule.updatedAt)}
                        </Td>
                        <Td density="compact">
                          <button
                            onClick={() => selectRule(rule)}
                            style={secondaryButtonStyle}
                            type="button"
                          >
                            {selectedRuleId === rule.ruleId
                              ? t("rules.action.selected")
                              : t("rules.action.edit")}
                          </button>
                        </Td>
                      </Tr>
                    ))}
                  </DataTable>
                </div>
              ) : (
                <WorkflowEmptyState
                  title={emptyStateCopy.title}
                  description={emptyStateCopy.description}
                  tone={getEmptyStateTone(emptyReason)}
                  density="compact"
                />
              )}
            </DataViewCard>

            <div id="rule-editor">
              <DataViewCard
                title={t("rules.editor.title")}
                subtitle={t("rules.editor.subtitle")}
                tone="tenant"
                density="compact"
                summary={
                  selectedRule
                    ? t("rules.editor.summaryEditing", {
                        name: selectedRule.ruleName ?? selectedRule.ruleId,
                      })
                    : t("rules.editor.summaryCreating", {
                        state:
                          updateRuleAction?.enabled === false
                            ? t("rules.state.disabled")
                            : t("rules.state.enabled"),
                      })
                }
              >
                <form
                  action="#"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setFlash(null);
                    const formData = new FormData(event.currentTarget);
                    runAction(upsertApprovalRuleAction, formData, {
                      clearRuleDraft: true,
                    });
                  }}
                  style={formGridStyle}
                >
                  <input name="ruleId" type="hidden" value={ruleDraft.ruleId} />
                  <input
                    name="conditionsJson"
                    type="hidden"
                    value={JSON.stringify(
                      ruleDraft.conditions.map((condition) => ({
                        field: condition.field,
                        operator: condition.operator,
                        valueKind: condition.valueKind,
                        valueText: condition.valueText,
                      })),
                    )}
                  />
                  <input
                    name="approversJson"
                    type="hidden"
                    value={JSON.stringify(
                      ruleDraft.approvers.map((approver) => ({
                        kind: approver.kind,
                        userId: approver.userId,
                        roleCode: approver.roleCode,
                        costCenterCode: approver.costCenterCode,
                        displayName: approver.displayName,
                      })),
                    )}
                  />

                  <div style={columnGridStyle}>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.form.ruleName")}</span>
                      <input
                        name="ruleName"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            ruleName: event.target.value,
                          }))
                        }
                        placeholder={t("rules.form.ruleNamePlaceholder")}
                        style={inputStyle}
                        value={ruleDraft.ruleName}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.form.priority")}</span>
                      <input
                        name="priority"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            priority: event.target.value,
                          }))
                        }
                        style={inputStyle}
                        type="number"
                        value={ruleDraft.priority}
                      />
                      <span style={hintStyle}>
                        {t("rules.form.priorityHint", {
                          step: TENANT_APPROVAL_RULE_PRIORITY_STEP,
                        })}
                      </span>
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.form.action")}</span>
                      <select
                        name="action"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            action: event.target
                              .value as TenantApprovalRuleAction,
                          }))
                        }
                        style={inputStyle}
                        value={ruleDraft.action}
                      >
                        {TENANT_APPROVAL_RULE_ACTIONS.map((action) => (
                          <option key={action} value={action}>
                            {t(`rules.enum.action.${action}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.form.active")}</span>
                      <label
                        style={{
                          ...inputStyle,
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        <input
                          checked={ruleDraft.activeFlag}
                          name="activeFlag"
                          onChange={(event) =>
                            setRuleDraft((current) => ({
                              ...current,
                              activeFlag: event.target.checked,
                            }))
                          }
                          type="checkbox"
                        />
                        <span>
                          {ruleDraft.activeFlag
                            ? t("rules.form.activeEnabled")
                            : t("rules.form.activePaused")}
                        </span>
                      </label>
                    </label>
                  </div>

                  <label style={fieldGridStyle}>
                    <span style={fieldLabelStyle}>{t("rules.form.description")}</span>
                    <textarea
                      name="description"
                      onChange={(event) =>
                        setRuleDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder={t("rules.form.descriptionPlaceholder")}
                      style={textareaStyle}
                      value={ruleDraft.description}
                    />
                  </label>

                  <div style={columnGridStyle}>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.form.effectiveFrom")}</span>
                      <input
                        name="effectiveFrom"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            effectiveFrom: event.target.value,
                          }))
                        }
                        placeholder={t("rules.form.effectiveFromPlaceholder")}
                        style={inputStyle}
                        value={ruleDraft.effectiveFrom}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.form.effectiveUntil")}</span>
                      <input
                        name="effectiveUntil"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            effectiveUntil: event.target.value,
                          }))
                        }
                        placeholder={t("rules.form.effectiveUntilPlaceholder")}
                        style={inputStyle}
                        value={ruleDraft.effectiveUntil}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.form.disabledReason")}</span>
                      <input
                        name="disabledReason"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            disabledReason: event.target.value,
                          }))
                        }
                        placeholder={t("rules.form.disabledReasonPlaceholder")}
                        style={inputStyle}
                        value={ruleDraft.disabledReason}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>
                        {t("rules.form.timeoutHoursOverride")}
                      </span>
                      <input
                        name="timeoutHoursOverride"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            timeoutHoursOverride: event.target.value,
                          }))
                        }
                        placeholder={t("rules.form.timeoutHoursOverridePlaceholder")}
                        style={inputStyle}
                        type="number"
                        value={ruleDraft.timeoutHoursOverride}
                      />
                    </label>
                  </div>

                  <section style={sectionDividerStyle}>
                    <div style={fieldGridStyle}>
                      <strong>{t("rules.conditions.title")}</strong>
                      <span style={hintStyle}>
                        {t("rules.conditions.hint")}
                      </span>
                    </div>
                    {ruleDraft.conditions.map((condition, index) => (
                      <div
                        key={condition.id}
                        style={{
                          display: "grid",
                          gap: "12px",
                          gridTemplateColumns:
                            "minmax(180px, 1.3fr) minmax(140px, 0.8fr) minmax(110px, 0.6fr) minmax(180px, 1fr) auto",
                          alignItems: "end",
                        }}
                      >
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>
                            {t("rules.conditions.field", { index: index + 1 })}
                          </span>
                          <select
                            onChange={(event) =>
                              updateCondition(
                                condition.id,
                                "field",
                                event.target.value,
                              )
                            }
                            style={inputStyle}
                            value={condition.field}
                          >
                            {TENANT_APPROVAL_RULE_CONDITION_FIELDS.map(
                              (field) => (
                                <option key={field} value={field}>
                                  {t(`rules.enum.conditionField.${field}`)}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>{t("rules.conditions.operator")}</span>
                          <select
                            onChange={(event) =>
                              updateCondition(
                                condition.id,
                                "operator",
                                event.target.value,
                              )
                            }
                            style={inputStyle}
                            value={condition.operator}
                          >
                            {TENANT_APPROVAL_RULE_CONDITION_OPERATORS.map(
                              (operator) => (
                                <option key={operator} value={operator}>
                                  {t(`rules.enum.operator.${operator}`)}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>{t("rules.conditions.valueKind")}</span>
                          <select
                            onChange={(event) =>
                              updateCondition(
                                condition.id,
                                "valueKind",
                                event.target.value,
                              )
                            }
                            style={inputStyle}
                            value={condition.valueKind}
                          >
                            <option value="text">{t("rules.enum.valueKind.text")}</option>
                            <option value="number">{t("rules.enum.valueKind.number")}</option>
                            <option value="boolean">{t("rules.enum.valueKind.boolean")}</option>
                            <option value="list">{t("rules.enum.valueKind.list")}</option>
                          </select>
                        </label>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>{t("rules.conditions.value")}</span>
                          <input
                            onChange={(event) =>
                              updateCondition(
                                condition.id,
                                "valueText",
                                event.target.value,
                              )
                            }
                            placeholder={
                              condition.valueKind === "list"
                                ? t("rules.conditions.placeholder.list")
                                : condition.valueKind === "boolean"
                                  ? t("rules.conditions.placeholder.boolean")
                                  : t("rules.conditions.placeholder.default")
                            }
                            style={inputStyle}
                            value={condition.valueText}
                          />
                        </label>
                        <button
                          disabled={ruleDraft.conditions.length === 1}
                          onClick={() =>
                            setRuleDraft((current) => ({
                              ...current,
                              conditions: current.conditions.filter(
                                (item) => item.id !== condition.id,
                              ),
                            }))
                          }
                          style={dangerButtonStyle}
                          type="button"
                        >
                          {t("rules.action.remove")}
                        </button>
                      </div>
                    ))}
                    <div
                      style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}
                    >
                      <button
                        onClick={() =>
                          setRuleDraft((current) => ({
                            ...current,
                            conditions: [
                              ...current.conditions,
                              buildEmptyCondition(),
                            ],
                          }))
                        }
                        style={secondaryButtonStyle}
                        type="button"
                      >
                        {t("rules.action.addCondition")}
                      </button>
                    </div>
                  </section>

                  {ruleDraft.action === "require_approval" ? (
                    <section style={sectionDividerStyle}>
                      <div style={fieldGridStyle}>
                        <strong>{t("rules.approvalPlan.title")}</strong>
                        <span style={hintStyle}>
                          {t("rules.approvalPlan.hint")}
                        </span>
                      </div>

                      <div style={columnGridStyle}>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>{t("rules.approvalPlan.mode")}</span>
                          <select
                            name="approvalMode"
                            onChange={(event) =>
                              setRuleDraft((current) => ({
                                ...current,
                                approvalMode: event.target
                                  .value as TenantApprovalMode,
                              }))
                            }
                            style={inputStyle}
                            value={ruleDraft.approvalMode}
                          >
                            {TENANT_APPROVAL_MODES.map((mode) => (
                              <option key={mode} value={mode}>
                                {t(`rules.enum.approvalMode.${mode}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>{t("rules.approvalPlan.fallbackPolicy")}</span>
                          <select
                            name="fallbackPolicy"
                            onChange={(event) =>
                              setRuleDraft((current) => ({
                                ...current,
                                fallbackPolicy: event.target
                                  .value as TenantApprovalFallbackPolicy,
                              }))
                            }
                            style={inputStyle}
                            value={ruleDraft.fallbackPolicy}
                          >
                            {TENANT_APPROVAL_FALLBACK_POLICIES.map((policy) => (
                              <option key={policy} value={policy}>
                                {t(`rules.enum.fallbackPolicy.${policy}`)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      {ruleDraft.approvers.map((approver, index) => (
                        <div
                          key={approver.id}
                          style={{
                            display: "grid",
                            gap: "12px",
                            gridTemplateColumns:
                              "minmax(160px, 0.9fr) repeat(4, minmax(120px, 1fr)) auto",
                            alignItems: "end",
                          }}
                        >
                          <label style={fieldGridStyle}>
                            <span style={fieldLabelStyle}>
                              {t("rules.approvalPlan.approver", {
                                index: index + 1,
                              })}
                            </span>
                            <select
                              onChange={(event) =>
                                updateApprover(
                                  approver.id,
                                  "kind",
                                  event.target.value,
                                )
                              }
                              style={inputStyle}
                              value={approver.kind}
                            >
                              {TENANT_PRINCIPAL_KINDS.map((kind) => (
                                <option key={kind} value={kind}>
                                  {t(`rules.enum.principalKind.${kind}`)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label style={fieldGridStyle}>
                            <span style={fieldLabelStyle}>{t("rules.approvalPlan.userId")}</span>
                            <input
                              onChange={(event) =>
                                updateApprover(
                                  approver.id,
                                  "userId",
                                  event.target.value,
                                )
                              }
                              placeholder={t("rules.approvalPlan.userIdPlaceholder")}
                              style={inputStyle}
                              value={approver.userId}
                            />
                          </label>
                          <label style={fieldGridStyle}>
                            <span style={fieldLabelStyle}>{t("rules.approvalPlan.roleCode")}</span>
                            <input
                              onChange={(event) =>
                                updateApprover(
                                  approver.id,
                                  "roleCode",
                                  event.target.value,
                                )
                              }
                              placeholder={t("rules.approvalPlan.roleCodePlaceholder")}
                              style={inputStyle}
                              value={approver.roleCode}
                            />
                          </label>
                          <label style={fieldGridStyle}>
                            <span style={fieldLabelStyle}>{t("rules.approvalPlan.costCenter")}</span>
                            <input
                              onChange={(event) =>
                                updateApprover(
                                  approver.id,
                                  "costCenterCode",
                                  event.target.value,
                                )
                              }
                              placeholder={t("rules.approvalPlan.costCenterPlaceholder")}
                              style={inputStyle}
                              value={approver.costCenterCode}
                            />
                          </label>
                          <label style={fieldGridStyle}>
                            <span style={fieldLabelStyle}>{t("rules.approvalPlan.displayName")}</span>
                            <input
                              onChange={(event) =>
                                updateApprover(
                                  approver.id,
                                  "displayName",
                                  event.target.value,
                                )
                              }
                              placeholder={t("rules.approvalPlan.displayNamePlaceholder")}
                              style={inputStyle}
                              value={approver.displayName}
                            />
                          </label>
                          <button
                            disabled={ruleDraft.approvers.length === 1}
                            onClick={() =>
                              setRuleDraft((current) => ({
                                ...current,
                                approvers: current.approvers.filter(
                                  (item) => item.id !== approver.id,
                                ),
                              }))
                            }
                            style={dangerButtonStyle}
                            type="button"
                          >
                            {t("rules.action.remove")}
                          </button>
                        </div>
                      ))}

                      <div
                        style={{
                          display: "flex",
                          gap: "10px",
                          flexWrap: "wrap",
                        }}
                      >
                        <button
                          onClick={() =>
                            setRuleDraft((current) => ({
                              ...current,
                              approvers: [
                                ...current.approvers,
                                buildEmptyApprover(),
                              ],
                            }))
                          }
                          style={secondaryButtonStyle}
                          type="button"
                        >
                          {t("rules.action.addApprover")}
                        </button>
                      </div>
                    </section>
                  ) : null}

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px",
                      alignItems: "center",
                    }}
                  >
                    <button
                      disabled={
                        pending ||
                        (ruleDraft.ruleId
                          ? updateRuleAction?.enabled === false
                          : createRuleAction?.enabled === false)
                      }
                      style={pillButtonStyle(true)}
                      title={
                        ruleDraft.ruleId
                          ? updateRuleAction?.disabledReasonCode
                          : createRuleAction?.disabledReasonCode
                      }
                      type="submit"
                    >
                      {ruleDraft.ruleId
                        ? t("rules.action.saveRule")
                        : t("rules.action.createRule")}
                    </button>
                    <button
                      onClick={resetRuleDraft}
                      style={secondaryButtonStyle}
                      type="button"
                    >
                      {t("rules.action.newRule")}
                    </button>
                    <button
                      disabled={
                        selectedRuleIndex <= 0 ||
                        pending ||
                        !selectedRule ||
                        reorderRuleAction?.enabled === false
                      }
                      onClick={() => {
                        if (!selectedRule) {
                          return;
                        }
                        const formData = new FormData();
                        formData.set(
                          "orderedRuleIds",
                          JSON.stringify(
                            swapRuleOrder(
                              sortedRules.map((rule) => rule.ruleId),
                              selectedRule.ruleId,
                              -1,
                            ),
                          ),
                        );
                        runAction(reorderApprovalRulesAction, formData);
                      }}
                      style={secondaryButtonStyle}
                      title={reorderRuleAction?.disabledReasonCode}
                      type="button"
                    >
                      {t("rules.action.moveEarlier")}
                    </button>
                    <button
                      disabled={
                        selectedRuleIndex < 0 ||
                        selectedRuleIndex >= sortedRules.length - 1 ||
                        pending ||
                        !selectedRule ||
                        reorderRuleAction?.enabled === false
                      }
                      onClick={() => {
                        if (!selectedRule) {
                          return;
                        }
                        const formData = new FormData();
                        formData.set(
                          "orderedRuleIds",
                          JSON.stringify(
                            swapRuleOrder(
                              sortedRules.map((rule) => rule.ruleId),
                              selectedRule.ruleId,
                              1,
                            ),
                          ),
                        );
                        runAction(reorderApprovalRulesAction, formData);
                      }}
                      style={secondaryButtonStyle}
                      title={reorderRuleAction?.disabledReasonCode}
                      type="button"
                    >
                      {t("rules.action.moveLater")}
                    </button>
                    <button
                      disabled={
                        !selectedRule ||
                        pending ||
                        disableRuleAction?.enabled === false
                      }
                      onClick={() => {
                        if (!selectedRule) {
                          return;
                        }
                        const formData = new FormData();
                        formData.set("ruleId", selectedRule.ruleId);
                        formData.set(
                          "ruleName",
                          selectedRule.ruleName ?? selectedRule.ruleId,
                        );
                        runAction(disableApprovalRuleAction, formData, {
                          clearRuleDraft: true,
                        });
                      }}
                      style={dangerButtonStyle}
                      title={disableRuleAction?.disabledReasonCode}
                      type="button"
                    >
                      {t("rules.action.disableSelected")}
                    </button>
                  </div>
                </form>
              </DataViewCard>
            </div>

            <div id="rule-dry-run">
              <DataViewCard
                title={t("rules.dryRun.title")}
                subtitle={t("rules.dryRun.subtitle")}
                tone="tenant"
                density="compact"
                summary={t("rules.dryRun.summary")}
              >
                <form
                  action="#"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setFlash(null);
                    const formData = new FormData(event.currentTarget);
                    runAction(previewAndEvaluateApprovalRulesAction, formData, {
                      refresh: false,
                    });
                  }}
                  style={formGridStyle}
                >
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}
                  >
                    <a href="/cost-centers" style={actionLinkStyle}>
                      {t("rules.link.costCenters")}
                    </a>
                    <a href="/users" style={actionLinkStyle}>
                      {t("rules.link.users")}
                    </a>
                    <a
                      href="/audit?module=tenant-governance"
                      style={actionLinkStyle}
                    >
                      {t("rules.link.auditTrail")}
                    </a>
                  </div>
                  <div style={columnGridStyle}>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>
                        {t("rules.dryRun.reservationWindowStart")}
                      </span>
                      <input
                        defaultValue={t("rules.dryRun.reservationWindowStartExample")}
                        name="reservationWindowStart"
                        placeholder={t("rules.dryRun.reservationWindowStartPlaceholder")}
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.dryRun.amountMinor")}</span>
                      <input
                        defaultValue={t("rules.dryRun.amountMinorExample")}
                        name="amountMinor"
                        placeholder={t("rules.dryRun.amountMinorPlaceholder")}
                        style={inputStyle}
                        type="number"
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.dryRun.currency")}</span>
                      <input
                        defaultValue={quotaDraft.currency}
                        name="currency"
                        placeholder={t("rules.dryRun.currencyPlaceholder")}
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.dryRun.costCenter")}</span>
                      <input
                        defaultValue=""
                        name="costCenterCode"
                        placeholder={t("rules.dryRun.costCenterPlaceholder")}
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.dryRun.passengerRole")}</span>
                      <input
                        defaultValue={t("rules.dryRun.passengerRoleExample")}
                        name="passengerRole"
                        placeholder={t("rules.dryRun.passengerRolePlaceholder")}
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.dryRun.passengerId")}</span>
                      <input
                        defaultValue={t("rules.dryRun.passengerIdExample")}
                        name="passengerId"
                        placeholder={t("rules.dryRun.passengerIdPlaceholder")}
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.dryRun.dispatchSubtype")}</span>
                      <input
                        defaultValue={t("rules.dryRun.dispatchSubtypeExample")}
                        name="businessDispatchSubtype"
                        placeholder={t("rules.dryRun.dispatchSubtypePlaceholder")}
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.dryRun.vehiclePreference")}</span>
                      <input
                        defaultValue={t("rules.dryRun.vehiclePreferenceExample")}
                        name="vehiclePreference"
                        placeholder={t("rules.dryRun.vehiclePreferencePlaceholder")}
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.dryRun.direction")}</span>
                      <input
                        defaultValue={t("rules.dryRun.directionExample")}
                        name="direction"
                        placeholder={t("rules.dryRun.directionPlaceholder")}
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.dryRun.flightNoPresent")}</span>
                      <select
                        defaultValue="false"
                        name="flightNoPresent"
                        style={inputStyle}
                      >
                        <option value="">{t("rules.value.unknown")}</option>
                        <option value="false">{t("rules.value.false")}</option>
                        <option value="true">{t("rules.value.true")}</option>
                      </select>
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>{t("rules.dryRun.flightNo")}</span>
                      <input
                        defaultValue=""
                        name="flightNo"
                        placeholder={t("rules.dryRun.flightNoPlaceholder")}
                        style={inputStyle}
                      />
                    </label>
                  </div>

                  <div
                    style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}
                  >
                    <button
                      disabled={pending || dryRunAction?.enabled === false}
                      style={pillButtonStyle(true)}
                      title={dryRunAction?.disabledReasonCode}
                      type="submit"
                    >
                      {t("rules.action.evaluateRules")}
                    </button>
                  </div>
                </form>

                {evaluation ? (
                  <div style={{ display: "grid", gap: "16px" }}>
                    <DetailMetadataGrid
                      dense
                      minColumnWidth="180px"
                      items={[
                        {
                          id: "decision",
                          label: t("rules.evaluation.decision"),
                          value: (
                            <StatusChip
                              label={t(
                                `rules.enum.decision.${evaluation.outcome?.decision ?? "unknown"}`,
                              )}
                              tone={getDecisionTone(
                                evaluation.outcome?.decision,
                              )}
                            />
                          ),
                        },
                        {
                          id: "matched",
                          label: t("rules.evaluation.matchedRules"),
                          value: formatCount(evaluation.matchedRules.length),
                        },
                        {
                          id: "approval-required",
                          label: t("rules.evaluation.approvalRequired"),
                          value: evaluation.outcome?.approvalRequired
                            ? t("rules.value.yes")
                            : t("rules.value.no"),
                        },
                        {
                          id: "blocked",
                          label: t("rules.evaluation.blocked"),
                          value: evaluation.outcome?.blocked
                            ? t("rules.value.yes")
                            : t("rules.value.no"),
                        },
                        {
                          id: "warnings",
                          label: t("rules.evaluation.warnings"),
                          value: formatCount(maybeCountWarnings(evaluation)),
                        },
                        {
                          id: "evaluated-at",
                          label: t("rules.evaluation.evaluatedAt"),
                          value: formatDateTime(evaluation.evaluatedAt),
                        },
                      ]}
                    />

                    <div style={columnGridStyle}>
                      <DataViewCard
                        title={t("rules.evaluation.matchedTitle")}
                        subtitle={t("rules.evaluation.matchedSubtitle")}
                        tone="tenant"
                        density="compact"
                      >
                        {evaluation.matchedRules.length > 0 ? (
                          <div style={{ display: "grid", gap: "10px" }}>
                            {evaluation.matchedRules.map((rule) => (
                              <div
                                key={`${rule.ruleId}-${rule.priority}`}
                                style={{
                                  display: "grid",
                                  gap: "6px",
                                  padding: "12px",
                                  borderRadius: "14px",
                                  border: "1px solid #dbe5ef",
                                  background: "#ffffff",
                                }}
                              >
                                <div style={chipWrapStyle}>
                                  <StatusChip
                                    tone="tenant"
                                    label={t(`rules.enum.action.${rule.action}`)}
                                  />
                                  <StatusChip
                                    tone="info"
                                    label={t("rules.evaluation.priority", {
                                      value: rule.priority,
                                    })}
                                  />
                                </div>
                                <strong>{rule.ruleName}</strong>
                                <span style={hintStyle}>
                                  {rule.matchedConditions
                                    .map((condition) =>
                                      formatConditionSummary(condition, t),
                                    )
                                    .join(` ${t("rules.condition.and")} `)}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <WorkflowEmptyState
                            title={t("rules.evaluation.emptyMatchedTitle")}
                            description={t("rules.evaluation.emptyMatchedDescription")}
                            tone="neutral"
                            density="compact"
                          />
                        )}
                      </DataViewCard>

                      <DataViewCard
                        title={t("rules.evaluation.planTitle")}
                        subtitle={t("rules.evaluation.planSubtitle")}
                        tone="tenant"
                        density="compact"
                      >
                        <div style={{ display: "grid", gap: "12px" }}>
                          <div style={chipWrapStyle}>
                            {(evaluation.quotaImpacts ?? []).map(
                              (impact, index) => (
                                <StatusChip
                                  key={`${impact.scope}-${impact.dimension}-${index}`}
                                  label={t("rules.evaluation.quotaImpact", {
                                    scope: impact.scope,
                                    dimension: t(
                                      `rules.enum.ledgerDimension.${impact.dimension}`,
                                    ),
                                    trigger: t(
                                      `rules.enum.quotaTrigger.${impact.triggered}`,
                                    ),
                                  })}
                                  tone={getQuotaTriggerTone(impact.triggered)}
                                />
                              ),
                            )}
                          </div>
                          {evaluation.approvalPlan ? (
                            <DetailMetadataGrid
                              dense
                              minColumnWidth="170px"
                              items={[
                                {
                                  id: "plan-mode",
                                  label: t("rules.approvalPlan.mode"),
                                  value: t(
                                    `rules.enum.approvalMode.${evaluation.approvalPlan.approvalMode}`,
                                  ),
                                },
                                {
                                  id: "plan-timeout",
                                  label: t("rules.evaluation.timeout"),
                                  value: t("rules.list.timeout.override", {
                                    hours: evaluation.approvalPlan.timeoutHours,
                                  }),
                                },
                                {
                                  id: "plan-fallback",
                                  label: t("rules.approvalPlan.fallbackPolicy"),
                                  value: t(
                                    `rules.enum.fallbackPolicy.${evaluation.approvalPlan.fallbackPolicy}`,
                                  ),
                                },
                                {
                                  id: "plan-approvers",
                                  label: t("rules.list.column.approvers"),
                                  value:
                                    evaluation.approvalPlan.approvers.length > 0
                                      ? evaluation.approvalPlan.approvers
                                          .map((approver) =>
                                            describeApprover(approver, t),
                                          )
                                          .join(` ${t("rules.value.joinPlus")} `)
                                      : t("rules.value.none"),
                                },
                              ]}
                            />
                          ) : (
                            <span style={hintStyle}>
                              {t("rules.evaluation.noApprovalPlan")}
                            </span>
                          )}
                        </div>
                      </DataViewCard>
                    </div>
                  </div>
                ) : null}
              </DataViewCard>
            </div>
          </>
        }
        side={
          <>
            <DataViewCard
              title={t("rules.emptyPreview.title")}
              subtitle={t("rules.emptyPreview.subtitle")}
              tone="tenant"
              density="compact"
            >
              <div style={{ display: "grid", gap: "10px" }}>
                {[
                  "no_data",
                  "not_provisioned",
                  "fetch_failed",
                  "permission_denied",
                  "external_unavailable",
                  "filtered_empty",
                ].map((reason) => (
                  <a
                    key={reason}
                    href={`/rules?emptyReason=${reason}`}
                    style={
                      emptyReason === reason
                        ? pillButtonStyle(true)
                        : actionLinkStyle
                    }
                  >
                    {t(`rules.enum.emptyReason.${reason}`)}
                  </a>
                ))}
              </div>
            </DataViewCard>

            <DataViewCard
              title={t("rules.quota.title")}
              subtitle={t("rules.quota.subtitle")}
              tone="tenant"
              density="compact"
            >
              {quotaSummary ? (
                <div style={{ display: "grid", gap: "14px" }}>
                  <DetailMetadataGrid
                    dense
                    minColumnWidth="170px"
                    items={[
                      {
                        id: "period",
                        label: t("rules.quota.period"),
                        value: `${quotaSummary.period}:${quotaSummary.periodKey}`,
                      },
                      {
                        id: "count-limit",
                        label: t("rules.quota.bookingCountLimit"),
                        value: formatQuotaValue(
                          quotaSummary.limit.bookingCountLimit,
                          t,
                        ),
                      },
                      {
                        id: "amount-limit",
                        label: t("rules.quota.amountMinorLimit"),
                        value: formatQuotaValue(
                          quotaSummary.limit.amountMinorLimit,
                          t,
                        ),
                      },
                      {
                        id: "enforce",
                        label: t("rules.quota.enforcementMode"),
                        value: t(
                          `rules.enum.enforcementMode.${quotaSummary.limit.enforcementMode}`,
                        ),
                      },
                      {
                        id: "remaining-count",
                        label: t("rules.quota.remainingCount"),
                        value: formatQuotaValue(
                          quotaSummary.usage.bookingCountRemaining,
                          t,
                        ),
                      },
                      {
                        id: "remaining-amount",
                        label: t("rules.quota.remainingAmount"),
                        value: formatQuotaValue(
                          quotaSummary.usage.amountMinorRemaining,
                          t,
                        ),
                      },
                      {
                        id: "remaining-percent",
                        label: t("rules.quota.remainingPercent"),
                        value: formatPercentage(
                          quotaSummary.usage.remainingPercent,
                          t,
                        ),
                      },
                      {
                        id: "refreshed",
                        label: t("rules.quota.refreshedAt"),
                        value: formatDateTime(quotaSummary.refreshedAt),
                      },
                    ]}
                  />

                  <form
                    action="#"
                    onSubmit={(event) => {
                      event.preventDefault();
                      setFlash(null);
                      runAction(
                        upsertTenantQuotaPolicyAction,
                        new FormData(event.currentTarget),
                      );
                    }}
                    style={formGridStyle}
                  >
                    <div style={columnGridStyle}>
                      <label style={fieldGridStyle}>
                        <span style={fieldLabelStyle}>{t("rules.quota.bookingCountLimitInput")}</span>
                        <input
                          name="bookingCountLimit"
                          onChange={(event) =>
                            setQuotaDraft((current) => ({
                              ...current,
                              bookingCountLimit: event.target.value,
                            }))
                          }
                          placeholder={t("rules.quota.bookingCountLimitPlaceholder")}
                          style={inputStyle}
                          type="number"
                          value={quotaDraft.bookingCountLimit}
                        />
                      </label>
                      <label style={fieldGridStyle}>
                        <span style={fieldLabelStyle}>{t("rules.quota.amountMinorLimitInput")}</span>
                        <input
                          name="amountMinorLimit"
                          onChange={(event) =>
                            setQuotaDraft((current) => ({
                              ...current,
                              amountMinorLimit: event.target.value,
                            }))
                          }
                          placeholder={t("rules.quota.amountMinorLimitPlaceholder")}
                          style={inputStyle}
                          type="number"
                          value={quotaDraft.amountMinorLimit}
                        />
                      </label>
                      <label style={fieldGridStyle}>
                        <span style={fieldLabelStyle}>{t("rules.dryRun.currency")}</span>
                        <input
                          name="currency"
                          onChange={(event) =>
                            setQuotaDraft((current) => ({
                              ...current,
                              currency: event.target.value,
                            }))
                          }
                          placeholder={t("rules.quota.currencyPlaceholder")}
                          style={inputStyle}
                          value={quotaDraft.currency}
                        />
                      </label>
                      <label style={fieldGridStyle}>
                        <span style={fieldLabelStyle}>{t("rules.quota.enforcementMode")}</span>
                        <select
                          name="enforcementMode"
                          onChange={(event) =>
                            setQuotaDraft((current) => ({
                              ...current,
                              enforcementMode: event.target
                                .value as TenantQuotaEnforcementMode,
                            }))
                          }
                          style={inputStyle}
                          value={quotaDraft.enforcementMode}
                        >
                          {TENANT_QUOTA_ENFORCEMENT_MODES.map((mode) => (
                            <option key={mode} value={mode}>
                              {t(`rules.enum.enforcementMode.${mode}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <button
                      disabled={pending}
                      style={pillButtonStyle(true)}
                      type="submit"
                    >
                      {t("rules.action.saveQuotaPolicy")}
                    </button>
                  </form>
                </div>
              ) : (
                <WorkflowEmptyState
                  title={t("rules.quota.emptyTitle")}
                  description={t("rules.quota.emptyDescription")}
                  tone="warning"
                  density="compact"
                />
              )}
            </DataViewCard>

            <DataViewCard
              title={t("rules.pendingQueue.title")}
              subtitle={t("rules.pendingQueue.subtitle")}
              tone="tenant"
              density="compact"
            >
              {pendingApprovals.length > 0 ? (
                <div style={{ display: "grid", gap: "10px" }}>
                  {pendingApprovals.slice(0, 6).map((request) => (
                    <div
                      key={request.approvalRequestId}
                      style={{
                        display: "grid",
                        gap: "6px",
                        padding: "12px",
                        borderRadius: "14px",
                        border: "1px solid #dbe5ef",
                        background: "#ffffff",
                      }}
                    >
                      <div style={chipWrapStyle}>
                        <StatusChip
                          label={t(`rules.enum.requestStatus.${request.status}`)}
                          tone={getApprovalRequestTone(request.status)}
                        />
                        <StatusChip
                          label={t(
                            `rules.enum.approvalMode.${request.approvalMode}`,
                          )}
                          tone="tenant"
                        />
                      </div>
                      <strong>{request.bookingId}</strong>
                      <span style={hintStyle}>
                        {t("rules.pendingQueue.ruleDue", {
                          count: request.ruleIds.length,
                          dueAt: formatDateTime(request.timeoutAt),
                        })}
                      </span>
                      <span style={hintStyle}>
                        {request.approvers
                          .map((approver) => describeApprover(approver, t))
                          .join(` ${t("rules.value.joinPlus")} `)}
                      </span>
                      <a
                        href={`/bookings/${request.bookingId}`}
                        style={actionLinkStyle}
                      >
                        {t("rules.action.openBooking")}
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <WorkflowEmptyState
                  title={t("rules.pendingQueue.emptyTitle")}
                  description={t("rules.pendingQueue.emptyDescription")}
                  tone="success"
                  density="compact"
                />
              )}
            </DataViewCard>

            <DataViewCard
              title={t("rules.ledger.title")}
              subtitle={t("rules.ledger.subtitle")}
              tone="tenant"
              density="compact"
            >
              {ledgerEntries.length > 0 ? (
                <div style={compactTableWrapStyle}>
                  <DataTable
                    density="compact"
                    tone="tenant"
                    columns={[
                      { label: t("rules.ledger.column.booking"), width: "120px" },
                      { label: t("rules.ledger.column.dimension"), width: "95px" },
                      { label: t("rules.ledger.column.type"), width: "90px" },
                      { label: t("rules.ledger.column.amount"), width: "95px" },
                      { label: t("rules.ledger.column.createdAt"), width: "130px" },
                    ]}
                  >
                    {ledgerEntries.slice(0, 8).map((entry) => (
                      <Tr key={entry.ledgerEntryId}>
                        <Td density="compact" mono>
                          {entry.bookingId}
                        </Td>
                        <Td density="compact">
                          {t(`rules.enum.ledgerDimension.${entry.dimension}`)}
                        </Td>
                        <Td density="compact">
                          {t(`rules.enum.ledgerEntryType.${entry.entryType}`)}
                        </Td>
                        <Td density="compact" mono>
                          {entry.amount}
                        </Td>
                        <Td density="compact" mono>
                          {formatDateTime(entry.createdAt)}
                        </Td>
                      </Tr>
                    ))}
                  </DataTable>
                </div>
              ) : (
                <WorkflowEmptyState
                  title={t("rules.ledger.emptyTitle")}
                  description={t("rules.ledger.emptyDescription")}
                  tone="neutral"
                  density="compact"
                />
              )}
            </DataViewCard>
          </>
        }
      />
    </div>
  );
}
