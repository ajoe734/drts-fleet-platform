import type { CSSProperties } from "react";
import type {
  TenantApprovalRuleCondition,
  TenantApprovalRuleRecord,
  TenantBookingApprovalRequestRecord,
  TenantPrincipalRef,
  TenantQuotaLedgerEntry,
  TenantQuotaSummary,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

type RulesPageData = {
  rules: TenantApprovalRuleRecord[];
  quotaSummary: TenantQuotaSummary | null;
  approvalRequests: TenantBookingApprovalRequestRecord[];
  ledgerEntries: TenantQuotaLedgerEntry[];
  errors: string[];
};

type RulesTableRow = {
  ruleId: string;
  priority: number;
  conditionExpression: string;
  actionLabel: string;
  actionDetail: string | null;
  approverLabel: string;
  activeFlag: boolean;
} & Record<string, unknown>;

const th = buildCanvasTheme({
  surface: "tenant",
  dark: true,
  density: "compact",
});

const pageBodyStyle: CSSProperties = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const conditionCellStyle: CSSProperties = {
  whiteSpace: "normal",
  lineHeight: 1.45,
};

const actionCellStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  whiteSpace: "normal",
  lineHeight: 1.35,
};

const secondaryTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
};

const priorityTextStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  color: th.textMuted,
  fontSize: 12.5,
  textAlign: "center",
};

const numberFormatter = new Intl.NumberFormat("en-US");

const CONDITION_FIELD_LABELS: Record<string, string> = {
  "booking.amount_minor": "fare",
  "booking.business_dispatch_subtype": "service_type",
  "booking.vehicle_preference": "vehicle_preference",
  "booking.direction": "direction",
  "booking.flight_no_present": "flight_no_present",
  "booking.reservation_window_start": "pickup_time",
  "booking.passenger.role": "passenger.role",
  "booking.passenger.id": "passenger.id",
  "cost_center.code": "cost_center",
  "cost_center.monthly_quota_remaining_amount_minor":
    "cost_center.quota_remaining_amount",
  "cost_center.monthly_quota_remaining_percent":
    "cost_center.quota_remaining_percent",
  "tenant.monthly_quota_remaining_amount_minor":
    "tenant.quota_remaining_amount",
  "tenant.monthly_quota_remaining_percent": "tenant.quota_remaining_percent",
};

const CONDITION_OPERATOR_LABELS: Record<string, string> = {
  eq: "=",
  equals: "=",
  neq: "!=",
  not_equals: "!=",
  gt: ">",
  greater_than: ">",
  gte: ">=",
  greater_than_or_equal: ">=",
  lt: "<",
  less_than: "<",
  lte: "<=",
  less_than_or_equal: "<=",
  in: "∈",
  not_in: "∉",
  exists: "exists",
};

const ACTION_LABELS: Record<TenantApprovalRuleRecord["action"], string> = {
  allow: "免審",
  warn: "通知 / 警示",
  flag_manual_review: "人工審核",
  require_approval: "需審批",
  block: "阻擋",
};

const APPROVAL_MODE_LABELS: Record<string, string> = {
  any_of: "任一簽核",
  all_of_parallel: "雙簽",
  ordered_chain: "依序簽核",
};

function formatAmountMinor(value: number) {
  return `NT$ ${numberFormatter.format(value / 100)}`;
}

function formatConditionValue(
  field: TenantApprovalRuleCondition["field"],
  value:
    | TenantApprovalRuleCondition["value"]
    | TenantApprovalRuleCondition["values"],
) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => formatConditionScalar(field, item)).join(", ")}]`;
  }

  return formatConditionScalar(field, value);
}

function formatConditionScalar(
  field: TenantApprovalRuleCondition["field"],
  value: string | number | boolean | null | undefined,
) {
  if (value === null || value === undefined) {
    return "null";
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  if (typeof value === "number") {
    if (field.includes("amount_minor")) {
      return formatAmountMinor(value);
    }
    if (field.includes("percent")) {
      return `${value}%`;
    }
    return numberFormatter.format(value);
  }

  return String(value);
}

function formatConditionSummary(condition: TenantApprovalRuleCondition) {
  const field = CONDITION_FIELD_LABELS[condition.field] ?? condition.field;
  const operator = condition.op ?? condition.operator ?? "eq";
  const operatorLabel = CONDITION_OPERATOR_LABELS[operator] ?? operator;

  if (operator === "exists") {
    return `${field} ${operatorLabel}`;
  }

  return `${field} ${operatorLabel} ${formatConditionValue(condition.field, condition.value ?? condition.values)}`;
}

function describeApprover(approver: TenantPrincipalRef) {
  if (approver.displayName) {
    return approver.displayName;
  }

  switch (approver.kind) {
    case "cost_center_owner":
      return approver.costCenterCode
        ? `cost_center.owner:${approver.costCenterCode}`
        : "cost_center.owner";
    case "tenant_finance_admin":
      return "finance";
    case "tenant_admin":
      return "tenant.admin";
    case "tenant_role":
    case "role":
      return approver.roleCode ?? "role";
    case "tenant_user":
    case "user":
      return approver.userId ?? "user";
    default:
      return approver.kind;
  }
}

function formatApproverLabel(rule: TenantApprovalRuleRecord) {
  if (rule.action !== "require_approval") {
    return "—";
  }

  if (rule.approvers.length === 0) {
    return "未設定";
  }

  return rule.approvers.map(describeApprover).join(" + ");
}

function getStateTone(activeFlag: boolean): CanvasTone {
  return activeFlag ? "success" : "neutral";
}

function buildRuleRow(rule: TenantApprovalRuleRecord): RulesTableRow {
  return {
    ruleId: rule.ruleId,
    priority: rule.priority,
    conditionExpression:
      rule.conditions.length > 0
        ? rule.conditions.map(formatConditionSummary).join(" AND ")
        : "—",
    actionLabel: ACTION_LABELS[rule.action] ?? rule.action,
    actionDetail: rule.approvalMode
      ? (APPROVAL_MODE_LABELS[rule.approvalMode] ?? rule.approvalMode)
      : null,
    approverLabel: formatApproverLabel(rule),
    activeFlag: rule.activeFlag,
  };
}

async function loadRulesPageData(): Promise<RulesPageData> {
  const client = getTenantClient();
  const errors: string[] = [];

  const [
    rulesResult,
    quotaSummaryResult,
    approvalRequestsResult,
    ledgerEntriesResult,
  ] = await Promise.allSettled([
    client.listApprovalRules() as Promise<TenantApprovalRuleRecord[]>,
    client.getTenantQuotaSummary() as Promise<TenantQuotaSummary>,
    client.listApprovalRequests({
      status: "pending",
    }) as Promise<TenantBookingApprovalRequestRecord[]>,
    client.listTenantQuotaLedger() as Promise<TenantQuotaLedgerEntry[]>,
  ]);

  const rules = rulesResult.status === "fulfilled" ? rulesResult.value : [];
  const quotaSummary =
    quotaSummaryResult.status === "fulfilled" ? quotaSummaryResult.value : null;
  const approvalRequests =
    approvalRequestsResult.status === "fulfilled"
      ? approvalRequestsResult.value
      : [];
  const ledgerEntries =
    ledgerEntriesResult.status === "fulfilled" ? ledgerEntriesResult.value : [];

  if (rulesResult.status === "rejected") {
    errors.push(
      rulesResult.reason instanceof Error
        ? rulesResult.reason.message
        : "Unable to load tenant approval rules.",
    );
  }

  if (quotaSummaryResult.status === "rejected") {
    errors.push(
      quotaSummaryResult.reason instanceof Error
        ? quotaSummaryResult.reason.message
        : "Unable to load tenant quota summary.",
    );
  }

  if (approvalRequestsResult.status === "rejected") {
    errors.push(
      approvalRequestsResult.reason instanceof Error
        ? approvalRequestsResult.reason.message
        : "Unable to load pending approval requests.",
    );
  }

  if (ledgerEntriesResult.status === "rejected") {
    errors.push(
      ledgerEntriesResult.reason instanceof Error
        ? ledgerEntriesResult.reason.message
        : "Unable to load tenant quota ledger entries.",
    );
  }

  return {
    rules,
    quotaSummary,
    approvalRequests,
    ledgerEntries: ledgerEntries
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 12),
    errors,
  };
}

export default async function RulesPage() {
  const pageData = await loadRulesPageData();
  const rows = [...pageData.rules]
    .sort((left, right) => left.priority - right.priority)
    .map(buildRuleRow);

  const columns: CanvasTableColumn<RulesTableRow>[] = [
    {
      h: "PRI",
      w: 60,
      mono: true,
      align: "right",
      r: (row) => <span style={priorityTextStyle}>{row.priority}</span>,
    },
    {
      h: "條件",
      w: 380,
      r: (row) => (
        <div style={conditionCellStyle}>{row.conditionExpression}</div>
      ),
    },
    {
      h: "動作",
      w: 220,
      r: (row) => (
        <div style={actionCellStyle}>
          <span>{row.actionLabel}</span>
          {row.actionDetail ? (
            <span style={secondaryTextStyle}>{row.actionDetail}</span>
          ) : null}
        </div>
      ),
    },
    {
      h: "審批者",
      w: 180,
      r: (row) => <div style={conditionCellStyle}>{row.approverLabel}</div>,
    },
    {
      h: "STATE",
      w: 100,
      r: (row) => (
        <CanvasPill theme={th} tone={getStateTone(row.activeFlag)} dot>
          {row.activeFlag ? "active" : "paused"}
        </CanvasPill>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="審批規則"
        subtitle="條件 → 動作 · 規則先後優先級"
        actions={
          <CanvasBtn theme={th} variant="primary" icon="plus" size="sm">
            新增規則
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        {pageData.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分治理資料無法載入"
            body={pageData.errors.join(" · ")}
          />
        ) : null}

        <CanvasCard theme={th} padding={0}>
          {rows.length > 0 ? (
            <CanvasTable<RulesTableRow>
              theme={th}
              columns={columns}
              rows={rows}
            />
          ) : (
            <div style={emptyStateStyle}>目前沒有任何審批規則。</div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
