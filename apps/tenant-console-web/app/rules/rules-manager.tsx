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

function describeApprover(approver: TenantPrincipalRef) {
  if (approver.displayName) {
    return approver.displayName;
  }

  switch (approver.kind) {
    case "cost_center_owner":
      return approver.costCenterCode
        ? `cost_center_owner:${approver.costCenterCode}`
        : "cost_center_owner";
    case "tenant_user":
    case "user":
      return approver.userId ? `user:${approver.userId}` : approver.kind;
    case "tenant_role":
    case "role":
      return approver.roleCode ? `role:${approver.roleCode}` : approver.kind;
    default:
      return approver.kind;
  }
}

function formatConditionSummary(condition: TenantApprovalRuleCondition) {
  const operator = condition.op ?? condition.operator ?? "eq";
  const value = formatConditionValue(condition.value ?? condition.values);
  return `${condition.field} ${operator} ${value}`;
}

function formatRuleSummary(rule: TenantApprovalRuleRecord) {
  return rule.conditions.map(formatConditionSummary).join(" AND ");
}

function formatRuleApprovers(rule: TenantApprovalRuleRecord) {
  if (rule.action !== "require_approval" || rule.approvers.length === 0) {
    return "無審批鏈";
  }

  return rule.approvers.map(describeApprover).join(" + ");
}

function formatQuotaValue(value: number | null) {
  return value === null ? "Unlimited" : formatCount(value);
}

function formatPercentage(value: number | null) {
  return value === null ? "Unknown" : `${value}%`;
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
        title: "Approval governance is not provisioned yet",
        description:
          "此租戶的配額讀取、審批待辦與規則狀態都是空的。請先定義第一條審批規則，並連結相關的成本中心負責人。",
      };
    case "fetch_failed":
      return {
        title: "Approval rules could not be loaded",
        description:
          "租戶治理路由仍可連線，但規則清單載入失敗。請待後端依賴恢復後重試。",
      };
    case "permission_denied":
      return {
        title: "This actor cannot administer approval rules",
        description:
          "頁面可見，但目前的 actor 沒有讀取或變更租戶審批治理的權限。",
      };
    case "external_unavailable":
      return {
        title: "A dependent governance service is unavailable",
        description:
          "規則編輯功能降級，因為一個以上的上游租戶治理服務停擺或回傳過期資料。",
      };
    case "filtered_empty":
      return {
        title: "No rules match the current filter",
        description:
          "此租戶有審批規則，但目前篩選條件產生了空清單。請清除篩選或選擇其他 action 類型。",
      };
    case "no_data":
    default:
      return {
        title: "No approval rules published yet",
        description:
          "請在下方建立第一條租戶治理規則，而非自行假設未發布的預設值。",
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
        subtitle="審批規則、配額狀態、待審項目與 dry-run 評估，現在都集中在同一個由已發布租戶契約支撐的租戶治理介面。"
        meta={[
          {
            label: "規則",
            value: formatCount(sortedRules.length),
            tone: "tenant",
          },
          {
            label: "啟用",
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
              New rule
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
              Dry-run
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
          title="規則資料無法完整載入"
          description="頁面仍可使用，但一個以上的治理讀取失敗。"
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
        title="更新層級 T5：租戶慢速"
        description={`This route refreshes on the 30-second tenant-slow cadence (${refreshTier}). Snapshot loaded ${formatDateTime(generatedAt)}.`}
        tone="info"
        density="compact"
      />

      <KpiRow minWidth="180px">
        <KpiCard
          label="規則"
          value={formatCount(sortedRules.length)}
          detail="Priority-ordered tenant governance rules"
          tone="tenant"
        />
        <KpiCard
          label="剩餘配額"
          value={formatPercentage(remainingQuotaPercent)}
          detail="Tenant-wide monthly remaining percentage"
          tone={
            remainingQuotaPercent !== null && remainingQuotaPercent <= 10
              ? "warning"
              : "success"
          }
        />
        <KpiCard
          label="審批待辦"
          value={formatCount(pendingApprovals.length)}
          detail="Tenant approval requests still unresolved"
          tone="warning"
        />
        <KpiCard
          label="帳冊筆數"
          value={formatCount(ledgerEntries.length)}
          detail="Recent quota ledger evidence loaded on this page"
          tone="info"
        />
      </KpiRow>

      <CalloutBanner
        title="所有治理變更都以契約為依據"
        description="本頁直接使用租戶的 approval-rule、quota-policy、approval-request 與 quota-ledger API，不會自行假造前端審批狀態或配額計算。"
        tone="tenant"
        density="compact"
      />

      <CalloutBanner
        title="審批連結與其所屬租戶資源緊鄰呈現"
        description={`Entry comes from /cost-centers, approver maintenance stays on /users, and live approval backlog can jump straight into /bookings/[id]. Available actions stay routed through published descriptors for create, update, disable, reorder, and dry-run.`}
        tone="tenant"
        density="compact"
      />

      <WorkflowSplitLayout
        main={
          <>
            <DataViewCard
              title="規則清單"
              subtitle="主表格在同一視野內保留優先序、條件摘要、action、審批路徑與狀態，符合 TN_Rules 對齊目標。"
              tone="tenant"
              density="compact"
              summary={`${sortedRules.length} rule(s) currently loaded from /api/tenant/approval-rules. Entry: /cost-centers. Approver maintenance: /users.`}
            >
              {sortedRules.length > 0 ? (
                <div style={compactTableWrapStyle}>
                  <DataTable
                    density="compact"
                    tone="tenant"
                    columns={[
                      { label: "優先序", width: "70px" },
                      { label: "規則", width: "220px" },
                      { label: "條件", width: "360px" },
                      { label: "動作", width: "140px" },
                      { label: "審批人", width: "220px" },
                      { label: "狀態", width: "110px" },
                      { label: "更新時間", width: "150px" },
                      { label: "焦點", width: "110px" },
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
                            primary={formatRuleSummary(rule)}
                            secondary={
                              rule.effectiveUntil
                                ? `Until ${formatDateTime(rule.effectiveUntil)}`
                                : rule.effectiveFrom
                                  ? `From ${formatDateTime(rule.effectiveFrom)}`
                                  : "No time window"
                            }
                          />
                        </Td>
                        <Td density="compact">
                          <div style={chipWrapStyle}>
                            <StatusChip tone="tenant" label={rule.action} />
                            {rule.approvalMode ? (
                              <StatusChip
                                tone="info"
                                label={rule.approvalMode}
                              />
                            ) : null}
                          </div>
                        </Td>
                        <Td density="compact">
                          <DataCellStack
                            primary={formatRuleApprovers(rule)}
                            secondary={
                              rule.timeoutHoursOverride
                                ? `${rule.timeoutHoursOverride}h timeout`
                                : "Default timeout"
                            }
                          />
                        </Td>
                        <Td density="compact">
                          <StatusChip
                            tone={getRuleStateTone(rule)}
                            label={rule.activeFlag ? "active" : "paused"}
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
                              ? "Selected"
                              : "Edit"}
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
                subtitle="編輯器直接寫入 approval-rule 命令介面，明確保留條件／審批人結構，而非藏在文字區塊中。"
                tone="tenant"
                density="compact"
                summary={
                  selectedRule
                    ? `Editing ${selectedRule.ruleName ?? selectedRule.ruleId}.`
                    : `Creating a new tenant approval rule. Update action published: ${updateRuleAction?.enabled === false ? "disabled" : "enabled"}.`
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
                        placeholder="高額財務審批"
                        style={inputStyle}
                        value={ruleDraft.ruleName}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>優先序</span>
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
                        Backend normalizes reorder results to increments of{" "}
                        {TENANT_APPROVAL_RULE_PRIORITY_STEP}.
                      </span>
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>動作</span>
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
                            {action}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>啟用</span>
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
                            ? "Rule participates in evaluation"
                            : "Rule is paused"}
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
                      placeholder="說明此規則的治理原因或營運政策。"
                      style={textareaStyle}
                      value={ruleDraft.description}
                    />
                  </label>

                  <div style={columnGridStyle}>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>生效起</span>
                      <input
                        name="effectiveFrom"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            effectiveFrom: event.target.value,
                          }))
                        }
                        placeholder="2026-06-01T00:00:00+08:00"
                        style={inputStyle}
                        value={ruleDraft.effectiveFrom}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>生效迄</span>
                      <input
                        name="effectiveUntil"
                        onChange={(event) =>
                          setRuleDraft((current) => ({
                            ...current,
                            effectiveUntil: event.target.value,
                          }))
                        }
                        placeholder="2026-06-30T23:59:59+08:00"
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
                        placeholder="季節性活動已結束"
                        style={inputStyle}
                        value={ruleDraft.disabledReason}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>
                        Timeout override (hours)
                      </span>
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
                        Each rule can compose multiple structured conditions;
                        the backend evaluates all of them in priority order.
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
                                  {field}
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
                                  {operator}
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>值類型</span>
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
                            <option value="text">text</option>
                            <option value="number">number</option>
                            <option value="boolean">boolean</option>
                            <option value="list">list</option>
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
                          Remove
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
                        Add condition
                      </button>
                    </div>
                  </section>

                  {ruleDraft.action === "require_approval" ? (
                    <section style={sectionDividerStyle}>
                      <div style={fieldGridStyle}>
                        <strong>審批計畫</strong>
                        <span style={hintStyle}>
                          Approvers stay structured as tenant principals so
                          dry-run output and live approval requests resolve
                          against the same backend-owned descriptors.
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
                                {mode}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label style={fieldGridStyle}>
                          <span style={fieldLabelStyle}>後備策略</span>
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
                                {policy}
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
                              Approver {index + 1}
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
                                  {kind}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label style={fieldGridStyle}>
                            <span style={fieldLabelStyle}>使用者 ID</span>
                            <input
                              onChange={(event) =>
                                updateApprover(
                                  approver.id,
                                  "userId",
                                  event.target.value,
                                )
                              }
                              placeholder="tenant-demo-admin"
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
                              placeholder="tenant_finance_admin"
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
                              placeholder="CC-FIN"
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
                              placeholder="財務管理員"
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
                            Remove
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
                          Add approver
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
                      {ruleDraft.ruleId ? "Save rule" : "Create rule"}
                    </button>
                    <button
                      onClick={resetRuleDraft}
                      style={secondaryButtonStyle}
                      type="button"
                    >
                      New rule
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
                      Move earlier
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
                      Move later
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
                      Disable selected
                    </button>
                  </div>
                </form>
              </DataViewCard>
            </div>

            <div id="rule-dry-run">
              <DataViewCard
                title="Dry-run 評估"
                subtitle="評估器會先預覽配額影響，再把影響快照送入規則評估，讓配額相關規則與審批決策保持一致。"
                tone="tenant"
                density="compact"
                summary="用一筆具代表性的訂單快照，在正式流量進入後端前，先看看符合的規則、配額觸發與審批計畫輸出。"
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
                      Cost centers
                    </a>
                    <a href="/users" style={actionLinkStyle}>
                      Users
                    </a>
                    <a
                      href="/audit?module=tenant-governance"
                      style={actionLinkStyle}
                    >
                      Audit trail
                    </a>
                  </div>
                  <div style={columnGridStyle}>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>
                        Reservation window start
                      </span>
                      <input
                        defaultValue="2026-06-01T09:30:00+08:00"
                        name="reservationWindowStart"
                        placeholder="2026-06-01T09:30:00+08:00"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>金額（minor）</span>
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
                        placeholder="TWD"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>成本中心</span>
                      <input
                        defaultValue=""
                        name="costCenterCode"
                        placeholder="CC-FIN"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>乘客角色</span>
                      <input
                        defaultValue="employee"
                        name="passengerRole"
                        placeholder="employee"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>乘客 ID</span>
                      <input
                        defaultValue="passenger-demo-001"
                        name="passengerId"
                        placeholder="passenger-demo-001"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>派遣子類型</span>
                      <input
                        defaultValue="enterprise_dispatch"
                        name="businessDispatchSubtype"
                        placeholder="enterprise_dispatch"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>車輛偏好</span>
                      <input
                        defaultValue="standard_taxi"
                        name="vehiclePreference"
                        placeholder="standard_taxi"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>方向</span>
                      <input
                        defaultValue="pickup"
                        name="direction"
                        placeholder="pickup"
                        style={inputStyle}
                      />
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>有航班編號</span>
                      <select
                        defaultValue="false"
                        name="flightNoPresent"
                        style={inputStyle}
                      >
                        <option value="">Unknown</option>
                        <option value="false">false</option>
                        <option value="true">true</option>
                      </select>
                    </label>
                    <label style={fieldGridStyle}>
                      <span style={fieldLabelStyle}>航班編號</span>
                      <input
                        defaultValue=""
                        name="flightNo"
                        placeholder="CI201"
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
                      Evaluate rules
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
                          label: "判定",
                          value: (
                            <StatusChip
                              label={evaluation.outcome?.decision ?? "unknown"}
                              tone={getDecisionTone(
                                evaluation.outcome?.decision,
                              )}
                            />
                          ),
                        },
                        {
                          id: "matched",
                          label: "符合規則",
                          value: formatCount(evaluation.matchedRules.length),
                        },
                        {
                          id: "approval-required",
                          label: "需審批",
                          value: evaluation.outcome?.approvalRequired
                            ? "Yes"
                            : "No",
                        },
                        {
                          id: "blocked",
                          label: "已封鎖",
                          value: evaluation.outcome?.blocked ? "Yes" : "No",
                        },
                        {
                          id: "warnings",
                          label: "警告",
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
                        title="符合的規則"
                        subtitle="dry-run 輸出中保留 all-match 語意。"
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
                                    label={rule.action}
                                  />
                                  <StatusChip
                                    tone="info"
                                    label={`priority ${rule.priority}`}
                                  />
                                </div>
                                <strong>{rule.ruleName}</strong>
                                <span style={hintStyle}>
                                  {rule.matchedConditions
                                    .map(formatConditionSummary)
                                    .join(" AND ")}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <WorkflowEmptyState
                            title="沒有規則符合此樣本"
                            description="配額預覽仍有執行，但規則評估器未對此輸入快照選出任何啟用中的租戶規則。"
                            tone="neutral"
                            density="compact"
                          />
                        )}
                      </DataViewCard>

                      <DataViewCard
                        title="配額影響與審批計畫"
                        subtitle="配額預覽輸出附在同一個評估封包中。"
                        tone="tenant"
                        density="compact"
                      >
                        <div style={{ display: "grid", gap: "12px" }}>
                          <div style={chipWrapStyle}>
                            {(evaluation.quotaImpacts ?? []).map(
                              (impact, index) => (
                                <StatusChip
                                  key={`${impact.scope}-${impact.dimension}-${index}`}
                                  label={`${impact.scope}:${impact.dimension}:${impact.triggered}`}
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
                                  value: evaluation.approvalPlan.approvalMode,
                                },
                                {
                                  id: "plan-timeout",
                                  label: "逾時",
                                  value: `${evaluation.approvalPlan.timeoutHours}h`,
                                },
                                {
                                  id: "plan-fallback",
                                  label: "後備",
                                  value: evaluation.approvalPlan.fallbackPolicy,
                                },
                                {
                                  id: "plan-approvers",
                                  label: "審批人",
                                  value:
                                    evaluation.approvalPlan.approvers.length > 0
                                      ? evaluation.approvalPlan.approvers
                                          .map(describeApprover)
                                          .join(" + ")
                                      : "None",
                                },
                              ]}
                            />
                          ) : (
                            <span style={hintStyle}>
                              No approval plan was required for this evaluation.
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
              title="狀態變體"
              subtitle="在後端 envelope 補齊前，Q-X15 的各種空狀態原因仍可在此路由個別預覽。"
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
                    {reason}
                  </a>
                ))}
              </div>
            </DataViewCard>

            <DataViewCard
              title="配額狀態"
              subtitle="租戶配額摘要與政策編輯相鄰呈現，因為配額相關規則依賴同一份後端擁有的強制狀態。"
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
                        label: "期別",
                        value: `${quotaSummary.period}:${quotaSummary.periodKey}`,
                      },
                      {
                        id: "count-limit",
                        label: "訂單上限",
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
                        label: "強制方式",
                        value: quotaSummary.limit.enforcementMode,
                      },
                      {
                        id: "remaining-count",
                        label: "剩餘次數",
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
                        <span style={fieldLabelStyle}>訂單次數上限</span>
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
                        <span style={fieldLabelStyle}>金額上限（minor）</span>
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
                          placeholder="TWD"
                          style={inputStyle}
                          value={quotaDraft.currency}
                        />
                      </label>
                      <label style={fieldGridStyle}>
                        <span style={fieldLabelStyle}>強制方式</span>
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
                              {mode}
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
                      Save quota policy
                    </button>
                  </form>
                </div>
              ) : (
                <WorkflowEmptyState
                  title="配額摘要無法取得"
                  description="頁面仍可編輯規則，但此請求的租戶配額讀取失敗。"
                  tone="warning"
                  density="compact"
                />
              )}
            </DataViewCard>

            <DataViewCard
              title="待審批佇列"
              subtitle="審批請求保留在此，讓規則變更可對照即時待辦來判斷。"
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
                          label={request.status}
                          tone={getApprovalRequestTone(request.status)}
                        />
                        <StatusChip
                          label={request.approvalMode}
                          tone="tenant"
                        />
                      </div>
                      <strong>{request.bookingId}</strong>
                      <span style={hintStyle}>
                        {request.ruleIds.length} rule(s) · due{" "}
                        {formatDateTime(request.timeoutAt)}
                      </span>
                      <span style={hintStyle}>
                        {request.approvers.map(describeApprover).join(" + ")}
                      </span>
                      <a
                        href={`/bookings/${request.bookingId}`}
                        style={actionLinkStyle}
                      >
                        Open booking
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <WorkflowEmptyState
                  title="沒有待審批的請求"
                  description="目前租戶沒有待辦，因此規則變更不會與進行中的審批佇列競爭。"
                  tone="success"
                  density="compact"
                />
              )}
            </DataViewCard>

            <DataViewCard
              title="近期配額帳冊"
              subtitle="配額 reserve／release／consume 事件可在規則介面旁檢視。"
              tone="tenant"
              density="compact"
            >
              {ledgerEntries.length > 0 ? (
                <div style={compactTableWrapStyle}>
                  <DataTable
                    density="compact"
                    tone="tenant"
                    columns={[
                      { label: "訂單", width: "120px" },
                      { label: "維度", width: "95px" },
                      { label: "類型", width: "90px" },
                      { label: "金額", width: "95px" },
                      { label: "建立時間", width: "130px" },
                    ]}
                  >
                    {ledgerEntries.slice(0, 8).map((entry) => (
                      <Tr key={entry.ledgerEntryId}>
                        <Td density="compact" mono>
                          {entry.bookingId}
                        </Td>
                        <Td density="compact">{entry.dimension}</Td>
                        <Td density="compact">{entry.entryType}</Td>
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
                  title="未載入配額帳冊資料"
                  description="已載入的快照中，租戶配額沒有近期的 reserve/release/consume 紀錄。"
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
