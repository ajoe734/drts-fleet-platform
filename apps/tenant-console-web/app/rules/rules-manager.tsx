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
import { formatTenantCodeLabel } from "@/lib/localized-labels";
import {
  disableApprovalRuleAction,
  previewAndEvaluateApprovalRulesAction,
  reorderApprovalRulesAction,
  upsertApprovalRuleAction,
  upsertTenantQuotaPolicyAction,
} from "./actions";
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

function formatConditionDisplayValue(
  value:
    | TenantApprovalRuleCondition["value"]
    | TenantApprovalRuleCondition["values"],
): string {
  if (Array.isArray(value)) {
    return value.map((item) => formatConditionDisplayValue(item)).join("、");
  }

  if (typeof value === "boolean") {
    return formatTenantCodeLabel(String(value));
  }

  if (value === null || value === undefined) {
    return "未設定";
  }

  if (typeof value === "string") {
    return formatTenantCodeLabel(value, value, { humanizeUnknown: false });
  }

  return String(value);
}

function describeApprover(approver: TenantPrincipalRef) {
  if (approver.displayName) {
    return approver.displayName;
  }

  switch (approver.kind) {
    case "cost_center_owner":
      return approver.costCenterCode
        ? `成本中心負責人：${approver.costCenterCode}`
        : "成本中心負責人";
    case "tenant_user":
    case "user":
      return approver.userId
        ? `使用者：${approver.userId}`
        : formatTenantCodeLabel(approver.kind);
    case "tenant_role":
    case "role":
      return approver.roleCode
        ? `角色：${approver.roleCode}`
        : formatTenantCodeLabel(approver.kind);
    default:
      return formatTenantCodeLabel(approver.kind);
  }
}

function formatConditionSummary(condition: TenantApprovalRuleCondition) {
  const operator = condition.op ?? condition.operator ?? "eq";
  const value = formatConditionDisplayValue(
    condition.value ?? condition.values,
  );
  return `${formatTenantCodeLabel(condition.field)} ${formatTenantCodeLabel(operator)} ${value}`;
}

function formatRuleSummary(rule: TenantApprovalRuleRecord) {
  return rule.conditions.map(formatConditionSummary).join(" 且 ");
}

function formatRuleApprovers(rule: TenantApprovalRuleRecord) {
  if (rule.action !== "require_approval" || rule.approvers.length === 0) {
    return "無審批鏈";
  }

  return rule.approvers.map(describeApprover).join("、");
}

function formatQuotaValue(value: number | null) {
  return value === null ? "無上限" : formatCount(value);
}

function formatPercentage(value: number | null) {
  return value === null ? "未知" : `${value}%`;
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

function getEmptyStateCopy(reason: EmptyReason | null) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "審批治理尚未完成佈建",
        description:
          "這個租戶目前沒有配額、審批佇列與規則資料。請先建立第一條規則，並指定對應的成本中心負責人。",
      };
    case "fetch_failed":
      return {
        title: "無法載入審批規則",
        description:
          "租戶治理頁面仍可開啟，但規則清單讀取失敗。待後端依賴恢復後再重新整理。",
      };
    case "permission_denied":
      return {
        title: "目前帳號無法管理審批規則",
        description: "目前可看見此頁，但沒有讀取或異動租戶審批治理資料的權限。",
      };
    case "external_unavailable":
      return {
        title: "治理依賴服務目前不可用",
        description:
          "一個或多個上游治理服務中斷或回傳過期資料，因此規則編輯能力已降級。",
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有命中規則",
        description:
          "租戶已有審批規則，但目前篩選條件沒有命中。請清除篩選或切換其他動作類型。",
      };
    case "no_data":
    default:
      return {
        title: "尚未發佈任何審批規則",
        description:
          "請直接在下方建立第一條租戶治理規則，不要依賴未發佈的前端預設值。",
      };
  }
}

function formatRuleWindow(rule: TenantApprovalRuleRecord) {
  if (rule.effectiveUntil) {
    return `生效至 ${formatDateTime(rule.effectiveUntil)}`;
  }
  if (rule.effectiveFrom) {
    return `自 ${formatDateTime(rule.effectiveFrom)} 生效`;
  }
  return "未設定生效期間";
}

function formatTimeoutLabel(rule: TenantApprovalRuleRecord) {
  return rule.timeoutHoursOverride
    ? `${rule.timeoutHoursOverride} 小時逾時`
    : "使用預設逾時";
}

function formatQuotaImpactLabel(
  impact: NonNullable<TenantApprovalEvaluationResult["quotaImpacts"]>[number],
) {
  return [
    formatTenantCodeLabel(impact.scope),
    formatTenantCodeLabel(impact.dimension),
    formatTenantCodeLabel(impact.triggered),
  ].join(" · ");
}

function getEmptyReasonLabel(reason: EmptyReason | string) {
  switch (reason) {
    case "no_data":
      return "尚無資料";
    case "not_provisioned":
      return "尚未佈建";
    case "fetch_failed":
      return "讀取失敗";
    case "permission_denied":
      return "權限不足";
    case "external_unavailable":
      return "外部服務不可用";
    case "filtered_empty":
      return "篩選後為空";
    default:
      return formatTenantCodeLabel(reason, String(reason));
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
  const emptyStateCopy = getEmptyStateCopy(emptyReason);

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
        eyebrow="治理"
        title="審批與配額"
        subtitle="把審批規則、配額狀態、待處理申請與試跑評估集中在同一個租戶治理頁面，並直接對接正式契約。"
        meta={[
          {
            label: "規則數",
            value: formatCount(sortedRules.length),
            tone: "tenant",
          },
          {
            label: "啟用中",
            value: formatCount(activeRules.length),
            tone: "success",
          },
          {
            label: "待審批",
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
              新增規則
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
              試跑評估
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
          title="規則資料未完整載入"
          description="頁面仍可使用，但有一個或多個治理讀取請求失敗。"
          tone="warning"
          density="compact"
        >
          <ul style={{ margin: 0, paddingLeft: "18px" }}>
            {errors.map((error, index) => (
              <li key={`${error}-${index}`}>{error}</li>
            ))}
          </ul>
        </CalloutBanner>
      ) : null}

      <CalloutBanner
        title="刷新層級 T5：租戶慢速"
        description={`此頁以 30 秒的租戶慢速節奏更新（${formatTenantCodeLabel(refreshTier, refreshTier)}）。快照載入時間：${formatDateTime(generatedAt)}。`}
        tone="info"
        density="compact"
      />

      <KpiRow minWidth="180px">
        <KpiCard
          label="規則數"
          value={formatCount(sortedRules.length)}
          detail="依優先順序排列的租戶治理規則"
          tone="tenant"
        />
        <KpiCard
          label="剩餘配額"
          value={formatPercentage(remainingQuotaPercent)}
          detail="租戶每月剩餘配額百分比"
          tone={
            remainingQuotaPercent !== null && remainingQuotaPercent <= 10
              ? "warning"
              : "success"
          }
        />
        <KpiCard
          label="審批待辦"
          value={formatCount(pendingApprovals.length)}
          detail="尚未完成處理的租戶審批申請"
          tone="warning"
        />
        <KpiCard
          label="帳務列數"
          value={formatCount(ledgerEntries.length)}
          detail="本頁已載入的近期配額帳務紀錄"
          tone="info"
        />
      </KpiRow>

      <CalloutBanner
        title="所有治理異動都直接走正式契約"
        description="此頁直接使用租戶審批規則、配額政策、審批申請與配額帳務正式介面，不會在前端自行拼裝假的審批狀態或配額計算。"
        tone="tenant"
        density="compact"
      />

      <CalloutBanner
        title="審批入口維持貼近租戶原始資料"
        description="入口來自成本中心頁，審批人維護位於使用者頁，待處理申請可直接跳到對應叫車單。可執行動作也都維持走正式發佈的新增、更新、停用、重排與試跑描述。"
        tone="tenant"
        density="compact"
      />

      <WorkflowSplitLayout
        main={
          <>
            <DataViewCard
              title="規則總表"
              subtitle="主表同時呈現優先順序、條件摘要、動作、審批路徑與狀態，方便一次掃描整體治理設定。"
              tone="tenant"
              density="compact"
              summary={`目前已載入 ${sortedRules.length} 條審批規則。入口：成本中心頁；審批人維護：使用者頁。`}
            >
              {sortedRules.length > 0 ? (
                <div style={compactTableWrapStyle}>
                  <DataTable
                    density="compact"
                    tone="tenant"
                    columns={[
                      { label: "優先", width: "70px" },
                      { label: "規則", width: "220px" },
                      { label: "條件", width: "360px" },
                      { label: "動作", width: "140px" },
                      { label: "審批人", width: "220px" },
                      { label: "狀態", width: "110px" },
                      { label: "更新時間", width: "150px" },
                      { label: "操作", width: "110px" },
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
                                {rule.ruleName ??
                                  rule.name ??
                                  `規則編號 ${rule.ruleId}`}
                              </strong>
                            }
                            secondary={
                              rule.description ?? `規則編號 ${rule.ruleId}`
                            }
                          />
                        </Td>
                        <Td density="compact">
                          <DataCellStack
                            primary={formatRuleSummary(rule)}
                            secondary={formatRuleWindow(rule)}
                          />
                        </Td>
                        <Td density="compact">
                          <div style={chipWrapStyle}>
                            <StatusChip
                              tone="tenant"
                              label={formatTenantCodeLabel(rule.action)}
                            />
                            {rule.approvalMode ? (
                              <StatusChip
                                tone="info"
                                label={formatTenantCodeLabel(rule.approvalMode)}
                              />
                            ) : null}
                          </div>
                        </Td>
                        <Td density="compact">
                          <DataCellStack
                            primary={formatRuleApprovers(rule)}
                            secondary={formatTimeoutLabel(rule)}
                          />
                        </Td>
                        <Td density="compact">
                          <StatusChip
                            tone={getRuleStateTone(rule)}
                            label={formatTenantCodeLabel(
                              rule.activeFlag ? "active" : "paused",
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
                            {selectedRuleId === rule.ruleId ? "已選取" : "編輯"}
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
                title="建立或編輯規則"
                subtitle="編輯器直接寫入審批規則指令介面，並把條件與審批人維持為結構化欄位，不會藏在文字描述裡。"
                tone="tenant"
                density="compact"
                summary={
                  selectedRule
                    ? `目前正在編輯「${selectedRule.ruleName ?? `規則編號 ${selectedRule.ruleId}`}」。`
                    : `正在建立新的租戶審批規則。更新動作目前${updateRuleAction?.enabled === false ? "停用" : "可用"}。`
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
                      <span style={fieldLabelStyle}>規則名稱</span>
                      <input
                        name="ruleName"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            ruleName: event.target.value,
                          }))
                        }
                        placeholder="高金額行程需財務審批"
                        style={inputStyle}
                        value={ruleDraft.ruleName}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>優先順序</span>
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
                        後端會把重排結果整理為每{" "}
                        {TENANT_APPROVAL_RULE_PRIORITY_STEP} 為一級距。
                      </span>
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>規則動作</span>
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
                            {formatTenantCodeLabel(action)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>啟用狀態</span>
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
                            ? "此規則會參與評估"
                            : "此規則目前已暫停"}
                        </span>
                      </label>
                    </label>
                  </div>

                  <label style={fieldGridStyle}>
                    <span style={fieldLabelStyle}>說明</span>
                    <textarea
                      name="description"
                      onChange={(event) =>
                        setRuleDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="說明這條規則的治理目的或營運政策背景。"
                      style={textareaStyle}
                      value={ruleDraft.description}
                    />
                  </label>

                  <div style={columnGridStyle}>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>生效起始</span>
                      <input
                        name="effectiveFrom"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            effectiveFrom: event.target.value,
                          }))
                        }
                        placeholder="例如：2026-06-01T00:00:00+08:00"
                        style={inputStyle}
                        value={ruleDraft.effectiveFrom}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>生效截止</span>
                      <input
                        name="effectiveUntil"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            effectiveUntil: event.target.value,
                          }))
                        }
                        placeholder="例如：2026-06-30T23:59:59+08:00"
                        style={inputStyle}
                        value={ruleDraft.effectiveUntil}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>停用原因</span>
                      <input
                        name="disabledReason"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            disabledReason: event.target.value,
                          }))
                        }
                        placeholder="例如：季節性方案結束"
                        style={inputStyle}
                        value={ruleDraft.disabledReason}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>逾時覆寫（小時）</span>
                      <input
                        name="timeoutHoursOverride"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            timeoutHoursOverride: event.target.value,
                          }))
                        }
                        placeholder="24"
                        style={inputStyle}
                        type="number"
                        value={ruleDraft.timeoutHoursOverride}
                      />
                    </label>
                  </div>

                  <section style={sectionDividerStyle}>
                    <div style={fieldGridStyle}>
                      <strong>條件</strong>
                      <span style={hintStyle}>
                        每條規則都可以組合多個結構化條件，後端會依優先順序逐條評估。
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
                          <span style={fieldLabelStyle}>欄位 {index + 1}</span>
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
                                  {formatTenantCodeLabel(field)}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>運算子</span>
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
                                  {formatTenantCodeLabel(operator)}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>值型別</span>
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
                            <option value="text">文字</option>
                            <option value="number">數字</option>
                            <option value="boolean">布林</option>
                            <option value="list">清單</option>
                          </select>
                        </label>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>值</span>
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
                                ? "enterprise_dispatch, airport_pickup"
                                : condition.valueKind === "boolean"
                                  ? "true"
                                  : "100000"
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
                          移除
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
                        新增條件
                      </button>
                    </div>
                  </section>

                  {ruleDraft.action === "require_approval" ? (
                    <section style={sectionDividerStyle}>
                      <div style={fieldGridStyle}>
                        <strong>審批計畫</strong>
                        <span style={hintStyle}>
                          審批人維持結構化的租戶主體格式，讓試跑結果與正式審批申請都能對應同一套後端描述。
                        </span>
                      </div>

                      <div style={columnGridStyle}>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>審批模式</span>
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
                                {formatTenantCodeLabel(mode)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>備援策略</span>
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
                                {formatTenantCodeLabel(policy)}
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
                              審批人 {index + 1}
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
                                  {formatTenantCodeLabel(kind)}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label style={fieldGridStyle}>
                            <span style={fieldLabelStyle}>使用者編號</span>
                            <input
                              onChange={(event) =>
                                updateApprover(
                                  approver.id,
                                  "userId",
                                  event.target.value,
                                )
                              }
                              placeholder="例如：租戶管理員帳號"
                              style={inputStyle}
                              value={approver.userId}
                            />
                          </label>
                          <label style={fieldGridStyle}>
                            <span style={fieldLabelStyle}>角色代碼</span>
                            <input
                              onChange={(event) =>
                                updateApprover(
                                  approver.id,
                                  "roleCode",
                                  event.target.value,
                                )
                              }
                              placeholder="例如：租戶財務管理員角色代碼"
                              style={inputStyle}
                              value={approver.roleCode}
                            />
                          </label>
                          <label style={fieldGridStyle}>
                            <span style={fieldLabelStyle}>成本中心</span>
                            <input
                              onChange={(event) =>
                                updateApprover(
                                  approver.id,
                                  "costCenterCode",
                                  event.target.value,
                                )
                              }
                              placeholder="例如：財務中心"
                              style={inputStyle}
                              value={approver.costCenterCode}
                            />
                          </label>
                          <label style={fieldGridStyle}>
                            <span style={fieldLabelStyle}>顯示名稱</span>
                            <input
                              onChange={(event) =>
                                updateApprover(
                                  approver.id,
                                  "displayName",
                                  event.target.value,
                                )
                              }
                              placeholder="例如：財務主管"
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
                            移除
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
                          新增審批人
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
                      {ruleDraft.ruleId ? "儲存規則" : "建立規則"}
                    </button>
                    <button
                      onClick={resetRuleDraft}
                      style={secondaryButtonStyle}
                      type="button"
                    >
                      清空改建新規則
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
                      往前移
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
                      往後移
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
                      停用目前規則
                    </button>
                  </div>
                </form>
              </DataViewCard>
            </div>

            <div id="rule-dry-run">
              <DataViewCard
                title="試跑評估"
                subtitle="系統會先預估配額影響，再把快照送進規則評估，確保配額與審批決策維持一致。"
                tone="tenant"
                density="compact"
                summary="可先用代表性的叫車資料預覽命中規則、配額觸發與審批計畫，再決定是否上線到正式流量。"
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
                      成本中心
                    </a>
                    <a href="/users" style={actionLinkStyle}>
                      人員與角色
                    </a>
                    <a
                      href="/audit?module=tenant-governance"
                      style={actionLinkStyle}
                    >
                      稽核軌跡
                    </a>
                  </div>
                  <div style={columnGridStyle}>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>預約起始時間</span>
                      <input
                        defaultValue="2026-06-01T09:30:00+08:00"
                        name="reservationWindowStart"
                        placeholder="例如：2026-06-01T09:30:00+08:00"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>金額（最小貨幣單位）</span>
                      <input
                        defaultValue="180000"
                        name="amountMinor"
                        placeholder="180000"
                        style={inputStyle}
                        type="number"
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>幣別</span>
                      <input
                        defaultValue={quotaDraft.currency}
                        name="currency"
                        placeholder="例如：新台幣（TWD）"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>成本中心</span>
                      <input
                        defaultValue=""
                        name="costCenterCode"
                        placeholder="例如：財務中心"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>乘客角色</span>
                      <input
                        defaultValue="員工"
                        name="passengerRole"
                        placeholder="例如：員工"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>乘客編號</span>
                      <input
                        defaultValue="乘客示例-001"
                        name="passengerId"
                        placeholder="例如：乘客示例-001"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>派遣子類型</span>
                      <input
                        defaultValue="enterprise_dispatch"
                        name="businessDispatchSubtype"
                        placeholder="例如：企業派遣（enterprise_dispatch）"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>車型偏好</span>
                      <input
                        defaultValue="standard_taxi"
                        name="vehiclePreference"
                        placeholder="例如：標準計程車（standard_taxi）"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>方向</span>
                      <input
                        defaultValue="pickup"
                        name="direction"
                        placeholder="例如：上車（pickup）"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>是否有航班號</span>
                      <select
                        defaultValue="false"
                        name="flightNoPresent"
                        style={inputStyle}
                      >
                        <option value="">未知</option>
                        <option value="false">否</option>
                        <option value="true">是</option>
                      </select>
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>航班號</span>
                      <input
                        defaultValue=""
                        name="flightNo"
                        placeholder="例如：CI201"
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
                      執行試跑評估
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
                          label: "結果",
                          value: (
                            <StatusChip
                              label={formatTenantCodeLabel(
                                evaluation.outcome?.decision ?? "unknown",
                              )}
                              tone={getDecisionTone(
                                evaluation.outcome?.decision,
                              )}
                            />
                          ),
                        },
                        {
                          id: "matched",
                          label: "命中規則",
                          value: formatCount(evaluation.matchedRules.length),
                        },
                        {
                          id: "approval-required",
                          label: "是否需要審批",
                          value: evaluation.outcome?.approvalRequired
                            ? "是"
                            : "否",
                        },
                        {
                          id: "blocked",
                          label: "是否阻擋",
                          value: evaluation.outcome?.blocked ? "是" : "否",
                        },
                        {
                          id: "warnings",
                          label: "警示數",
                          value: formatCount(maybeCountWarnings(evaluation)),
                        },
                        {
                          id: "evaluated-at",
                          label: "評估時間",
                          value: formatDateTime(evaluation.evaluatedAt),
                        },
                      ]}
                    />

                    <div style={columnGridStyle}>
                      <DataViewCard
                        title="命中規則"
                        subtitle="試跑結果會完整呈現命中的規則與條件。"
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
                                    label={formatTenantCodeLabel(rule.action)}
                                  />
                                  <StatusChip
                                    tone="info"
                                    label={`優先 ${rule.priority}`}
                                  />
                                </div>
                                <strong>{rule.ruleName}</strong>
                                <span style={hintStyle}>
                                  {rule.matchedConditions
                                    .map(formatConditionSummary)
                                    .join(" 且 ")}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <WorkflowEmptyState
                            title="此範例沒有命中任何規則"
                            description="配額預覽已完成，但這份輸入快照沒有命中任何啟用中的租戶規則。"
                            tone="neutral"
                            density="compact"
                          />
                        )}
                      </DataViewCard>

                      <DataViewCard
                        title="配額影響與審批計畫"
                        subtitle="配額預覽結果會與本次評估資料一併顯示。"
                        tone="tenant"
                        density="compact"
                      >
                        <div style={{ display: "grid", gap: "12px" }}>
                          <div style={chipWrapStyle}>
                            {(evaluation.quotaImpacts ?? []).map(
                              (impact, index) => (
                                <StatusChip
                                  key={`${impact.scope}-${impact.dimension}-${index}`}
                                  label={formatQuotaImpactLabel(impact)}
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
                                  label: "審批模式",
                                  value: formatTenantCodeLabel(
                                    evaluation.approvalPlan.approvalMode,
                                  ),
                                },
                                {
                                  id: "plan-timeout",
                                  label: "逾時",
                                  value: `${evaluation.approvalPlan.timeoutHours} 小時`,
                                },
                                {
                                  id: "plan-fallback",
                                  label: "Fallback 策略",
                                  value: formatTenantCodeLabel(
                                    evaluation.approvalPlan.fallbackPolicy,
                                  ),
                                },
                                {
                                  id: "plan-approvers",
                                  label: "審批人",
                                  value:
                                    evaluation.approvalPlan.approvers.length > 0
                                      ? evaluation.approvalPlan.approvers
                                          .map(describeApprover)
                                          .join("、")
                                      : "無",
                                },
                              ]}
                            />
                          ) : (
                            <span style={hintStyle}>
                              這次評估不需要審批計畫。
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
              title="空狀態預覽"
              subtitle="可在這裡逐一切換不同的空狀態，確認治理頁在各種後端回應下的顯示。"
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
                ].map((reason, index) => (
                  <a
                    key={`${reason}-${index}`}
                    href={`/rules?emptyReason=${reason}`}
                    style={
                      emptyReason === reason
                        ? pillButtonStyle(true)
                        : actionLinkStyle
                    }
                  >
                    {getEmptyReasonLabel(reason)}
                  </a>
                ))}
              </div>
            </DataViewCard>

            <DataViewCard
              title="配額狀態"
              subtitle="配額摘要與政策編輯維持放在一起，因為配額敏感規則依賴同一份後端治理狀態。"
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
                        label: "期間",
                        value: `${formatTenantCodeLabel(quotaSummary.period)}：${quotaSummary.periodKey}`,
                      },
                      {
                        id: "count-limit",
                        label: "趟次上限",
                        value: formatQuotaValue(
                          quotaSummary.limit.bookingCountLimit,
                        ),
                      },
                      {
                        id: "amount-limit",
                        label: "金額上限",
                        value: formatQuotaValue(
                          quotaSummary.limit.amountMinorLimit,
                        ),
                      },
                      {
                        id: "enforce",
                        label: "管制模式",
                        value: formatTenantCodeLabel(
                          quotaSummary.limit.enforcementMode,
                        ),
                      },
                      {
                        id: "remaining-count",
                        label: "剩餘趟次",
                        value: formatQuotaValue(
                          quotaSummary.usage.bookingCountRemaining,
                        ),
                      },
                      {
                        id: "remaining-amount",
                        label: "剩餘金額",
                        value: formatQuotaValue(
                          quotaSummary.usage.amountMinorRemaining,
                        ),
                      },
                      {
                        id: "remaining-percent",
                        label: "剩餘百分比",
                        value: formatPercentage(
                          quotaSummary.usage.remainingPercent,
                        ),
                      },
                      {
                        id: "refreshed",
                        label: "更新時間",
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
                        <span style={fieldLabelStyle}>趟次上限</span>
                        <input
                          name="bookingCountLimit"
                          onChange={(event) =>
                            setQuotaDraft((current) => ({
                              ...current,
                              bookingCountLimit: event.target.value,
                            }))
                          }
                          placeholder="12"
                          style={inputStyle}
                          type="number"
                          value={quotaDraft.bookingCountLimit}
                        />
                      </label>
                      <label style={fieldGridStyle}>
                        <span style={fieldLabelStyle}>
                          金額上限（最小貨幣單位）
                        </span>
                        <input
                          name="amountMinorLimit"
                          onChange={(event) =>
                            setQuotaDraft((current) => ({
                              ...current,
                              amountMinorLimit: event.target.value,
                            }))
                          }
                          placeholder="500000"
                          style={inputStyle}
                          type="number"
                          value={quotaDraft.amountMinorLimit}
                        />
                      </label>
                      <label style={fieldGridStyle}>
                        <span style={fieldLabelStyle}>幣別</span>
                        <input
                          name="currency"
                          onChange={(event) =>
                            setQuotaDraft((current) => ({
                              ...current,
                              currency: event.target.value,
                            }))
                          }
                          placeholder="例如：新台幣（TWD）"
                          style={inputStyle}
                          value={quotaDraft.currency}
                        />
                      </label>
                      <label style={fieldGridStyle}>
                        <span style={fieldLabelStyle}>管制模式</span>
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
                              {formatTenantCodeLabel(mode)}
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
                      儲存配額政策
                    </button>
                  </form>
                </div>
              ) : (
                <WorkflowEmptyState
                  title="無法取得配額摘要"
                  description="此請求的租戶配額讀取失敗，但仍可先編輯規則。"
                  tone="warning"
                  density="compact"
                />
              )}
            </DataViewCard>

            <DataViewCard
              title="待處理審批佇列"
              subtitle="規則調整前可先對照目前的即時審批待辦，避免和現場處理衝突。"
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
                          label={formatTenantCodeLabel(request.status)}
                          tone={getApprovalRequestTone(request.status)}
                        />
                        <StatusChip
                          label={formatTenantCodeLabel(request.approvalMode)}
                          tone="tenant"
                        />
                      </div>
                      <strong>{request.bookingId}</strong>
                      <span style={hintStyle}>
                        命中 {request.ruleIds.length} 條規則 · 截止於{" "}
                        {formatDateTime(request.timeoutAt)}
                      </span>
                      <span style={hintStyle}>
                        {request.approvers.map(describeApprover).join("、")}
                      </span>
                      <a
                        href={`/bookings/${request.bookingId}`}
                        style={actionLinkStyle}
                      >
                        開啟叫車單
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <WorkflowEmptyState
                  title="目前沒有待處理審批申請"
                  description="租戶目前沒有審批待辦，因此規則調整不會和現場審批工作互相干擾。"
                  tone="success"
                  density="compact"
                />
              )}
            </DataViewCard>

            <DataViewCard
              title="近期配額帳務"
              subtitle="可在規則頁旁直接檢視配額保留、釋放與消耗事件。"
              tone="tenant"
              density="compact"
            >
              {ledgerEntries.length > 0 ? (
                <div style={compactTableWrapStyle}>
                  <DataTable
                    density="compact"
                    tone="tenant"
                    columns={[
                      { label: "叫車單", width: "120px" },
                      { label: "維度", width: "95px" },
                      { label: "類型", width: "90px" },
                      { label: "數值", width: "95px" },
                      { label: "建立時間", width: "130px" },
                    ]}
                  >
                    {ledgerEntries.slice(0, 8).map((entry) => (
                      <Tr key={entry.ledgerEntryId}>
                        <Td density="compact" mono>
                          {entry.bookingId}
                        </Td>
                        <Td density="compact">
                          {formatTenantCodeLabel(entry.dimension)}
                        </Td>
                        <Td density="compact">
                          {formatTenantCodeLabel(entry.entryType)}
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
                  title="目前沒有載入任何配額帳務列"
                  description="這份快照中沒有近期的配額保留、釋放或消耗紀錄。"
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
