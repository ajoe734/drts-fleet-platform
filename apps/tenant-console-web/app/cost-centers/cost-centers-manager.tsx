"use client";

import type { CSSProperties } from "react";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  EmptyReason,
  ReportJobRecord,
  ResourceActionDescriptor,
  TenantApprovalRuleCondition,
  TenantApprovalRuleRecord,
  TenantCostCenterCoverageReport,
  TenantCostCenterQuotaSummary,
  TenantCostCenterRecord,
  TenantUserRoleRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasField,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { useTranslation } from "@/lib/i18n";
import { disableCostCenterAction, upsertCostCenterAction } from "./actions";
import type { CostCenterFlashPayload } from "./constants";

type CostCentersManagerProps = {
  costCenters: Array<
    TenantCostCenterRecord & {
      availableActions?: ResourceActionDescriptor[];
    }
  >;
  quotaSummariesByCode: Partial<Record<string, TenantCostCenterQuotaSummary>>;
  approvalRules: TenantApprovalRuleRecord[];
  users: TenantUserRoleRecord[];
  coverageReport: TenantCostCenterCoverageReport | null;
  reportJobs: ReportJobRecord[];
  errors: string[];
  initialEmptyReason: EmptyReason | null;
};

type ManagerMode = "create" | "update" | "disable" | "reactivate" | null;

type CostCenterAction = ResourceActionDescriptor & {
  label: string;
  intent: "create" | "update" | "disable" | "reactivate";
  code?: string;
};

type CostCenterDraft = {
  code: string;
  name: string;
  description: string;
  ownerUserId: string;
  ownerName: string;
  activeFlag: boolean;
};

type CostCenterRow = {
  code: string;
  name: string;
  description: string | null;
  ownerName: string | null;
  ownerUserId: string | null;
  activeFlag: boolean;
  disabledReason: string | null;
  quotaLabel: string;
  quotaMeta: string;
  usageLabel: string;
  usageMeta: string;
  usagePercent: number | null;
  approvalLabel: string;
  approvalMeta: string;
  reportLabel: string;
  reportMeta: string;
  reportJobCount: number;
  overQuota: boolean;
  availableActions: CostCenterAction[];
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

const topGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const contentGridStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
  alignItems: "flex-start",
};

const tableCardStyle: CSSProperties = {
  flex: "1.65 1 760px",
  minWidth: 0,
};

const sideLaneStyle: CSSProperties = {
  flex: "1 1 320px",
  minWidth: 0,
  display: "grid",
  gap: 16,
};

const filterGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 12,
  alignItems: "end",
};

const fieldLabelStyle: CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const nativeInputStyle: CSSProperties = {
  width: "100%",
  background: th.bgRaised,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  padding: "8px 10px",
  fontSize: 12.5,
  color: th.text,
  outline: "none",
  fontFamily: th.fontFamily,
  boxSizing: "border-box",
};

const nativeTextAreaStyle: CSSProperties = {
  ...nativeInputStyle,
  minHeight: 92,
  resize: "vertical",
};

const checkboxRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minHeight: 34,
  color: th.text,
  fontSize: 12.5,
};

const kpiStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  borderRadius: 10,
  border: `1px solid ${th.border}`,
  background: th.bgRaised,
  padding: "14px 16px",
};

const kpiLabelStyle: CSSProperties = {
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const kpiValueStyle: CSSProperties = {
  fontSize: 24,
  fontWeight: 600,
  color: th.text,
  lineHeight: 1.1,
};

const kpiMetaStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textDim,
  lineHeight: 1.4,
};

const titleStackStyle: CSSProperties = {
  display: "grid",
  gap: 2,
};

const titlePrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const titleMetaStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.45,
};

const monoStyle: CSSProperties = {
  fontFamily: th.monoFamily,
};

const textWrapStyle: CSSProperties = {
  whiteSpace: "normal",
  lineHeight: 1.4,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const actionColumnStyle: CSSProperties = {
  ...actionRowStyle,
  justifyContent: "flex-end",
};

const inlineButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 6,
  padding: "5px 10px",
  minHeight: 28,
  fontSize: 11.5,
  fontWeight: 500,
  background: th.surface,
  color: th.text,
  border: `1px solid ${th.border}`,
  borderRadius: 7,
  cursor: "pointer",
  lineHeight: 1,
  fontFamily: th.fontFamily,
};

const inlineDangerButtonStyle: CSSProperties = {
  ...inlineButtonStyle,
  borderColor: "rgba(248, 113, 113, 0.55)",
  color: th.danger,
};

const primaryDangerButtonStyle: CSSProperties = {
  ...inlineDangerButtonStyle,
  background: "rgba(127, 29, 29, 0.18)",
  minHeight: 32,
  padding: "6px 12px",
};

const linkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const formFooterStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
};

const formNoteStyle: CSSProperties = {
  fontSize: 11,
  color: th.textMuted,
  lineHeight: 1.45,
};

const emptyStateStyle: CSSProperties = {
  padding: 28,
  display: "grid",
  gap: 10,
  justifyItems: "center",
  textAlign: "center",
};

const emptyTitleStyle: CSSProperties = {
  color: th.text,
  fontSize: 15,
  fontWeight: 600,
};

const emptyBodyStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 12.5,
  maxWidth: 460,
  lineHeight: 1.5,
};

const progressTrackStyle: CSSProperties = {
  flex: 1,
  height: 6,
  background: th.surface,
  borderRadius: 999,
  overflow: "hidden",
  minWidth: 72,
};

const progressMetaStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  display: "grid",
  gap: 6,
  color: th.text,
  fontSize: 12,
  lineHeight: 1.45,
};

const sectionLabelStyle: CSSProperties = {
  marginBottom: 8,
  fontSize: 10.5,
  fontWeight: 600,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: th.textMuted,
};

const T5_REFRESH_INTERVAL_MS = 30_000;
type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

function getConditionValues(condition: TenantApprovalRuleCondition) {
  if (Array.isArray(condition.values) && condition.values.length > 0) {
    return condition.values;
  }
  if (Array.isArray(condition.value)) {
    return condition.value;
  }
  if (condition.value === null || condition.value === undefined) {
    return [];
  }
  return [condition.value];
}

function ruleTargetsCostCenter(rule: TenantApprovalRuleRecord, code: string) {
  const codeConditions = rule.conditions.filter(
    (condition) => condition.field === "cost_center.code",
  );
  if (codeConditions.length > 0) {
    return codeConditions.some((condition) =>
      getConditionValues(condition).some((value) => String(value) === code),
    );
  }
  return rule.approvers.some(
    (approver) =>
      approver.kind === "cost_center_owner" &&
      (!approver.costCenterCode || approver.costCenterCode === code),
  );
}

function ruleUsesCostCenterOwner(rule: TenantApprovalRuleRecord, code: string) {
  return rule.approvers.some(
    (approver) =>
      approver.kind === "cost_center_owner" &&
      (!approver.costCenterCode || approver.costCenterCode === code),
  );
}

function getAmountThresholdMinor(rule: TenantApprovalRuleRecord) {
  const thresholdCondition = rule.conditions.find(
    (condition) => condition.field === "booking.amount_minor",
  );
  const thresholdValue = thresholdCondition
    ? getConditionValues(thresholdCondition)[0]
    : null;
  return typeof thresholdValue === "number" ? thresholdValue : null;
}

function formatSubtypeLabel(value: string, translate: TranslateFn) {
  const normalized = value.toLowerCase();
  if (normalized.includes("airport")) {
    return translate("costCenters.approval.subtype.airport");
  }
  if (normalized.includes("overnight")) {
    return translate("costCenters.approval.subtype.overnight");
  }
  return value;
}

function describeApproval(
  code: string,
  rules: TenantApprovalRuleRecord[],
  translate: TranslateFn,
  formatCount: (value: number) => string,
): { label: string; meta: string } {
  const relevantRules = rules.filter((rule) =>
    ruleTargetsCostCenter(rule, code),
  );
  if (relevantRules.length === 0) {
    return {
      label: translate("costCenters.approval.inherit.label"),
      meta: translate("costCenters.approval.inherit.meta"),
    };
  }

  const primaryRule = relevantRules[0];
  if (!primaryRule) {
    return {
      label: translate("costCenters.approval.inherit.label"),
      meta: translate("costCenters.approval.missingMeta"),
    };
  }

  const subtypeLabels = Array.from(
    new Set(
      primaryRule.conditions
        .filter(
          (condition) =>
            condition.field === "booking.business_dispatch_subtype",
        )
        .flatMap((condition) => getConditionValues(condition))
        .map((value) =>
          typeof value === "string"
            ? formatSubtypeLabel(value, translate)
            : null,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (subtypeLabels.length > 0) {
    return {
      label: translate("costCenters.approval.ruleCount", {
        count: relevantRules.length,
      }),
      meta: translate("costCenters.approval.subtypeMeta", {
        subtypes: subtypeLabels.join(" / "),
      }),
    };
  }

  const amountThresholdMinor = getAmountThresholdMinor(primaryRule);
  if (amountThresholdMinor !== null) {
    return {
      label: translate("costCenters.approval.ruleCount", {
        count: relevantRules.length,
      }),
      meta: translate("costCenters.approval.amountMeta", {
        amount: formatCount(Math.round(amountThresholdMinor / 100)),
      }),
    };
  }

  if (primaryRule.action === "warn") {
    return {
      label: translate("costCenters.approval.ruleCount", {
        count: relevantRules.length,
      }),
      meta: translate("costCenters.approval.warnMeta"),
    };
  }

  if (primaryRule.action === "block") {
    return {
      label: translate("costCenters.approval.ruleCount", {
        count: relevantRules.length,
      }),
      meta: translate("costCenters.approval.blockMeta"),
    };
  }

  if (ruleUsesCostCenterOwner(primaryRule, code)) {
    return {
      label: translate("costCenters.approval.ruleCount", {
        count: relevantRules.length,
      }),
      meta: translate("costCenters.approval.ownerMeta"),
    };
  }

  return {
    label: translate("costCenters.approval.ruleCount", {
      count: relevantRules.length,
    }),
    meta: translate("costCenters.approval.fallbackMeta"),
  };
}

function includesCostCenterValue(value: unknown, code: string): boolean {
  if (value === code) return true;
  if (Array.isArray(value)) {
    return value.some((item) => includesCostCenterValue(item, code));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nestedValue]) => {
      if (key.toLowerCase().includes("costcenter")) {
        return includesCostCenterValue(nestedValue, code);
      }
      return includesCostCenterValue(nestedValue, code);
    });
  }
  return false;
}

function describeReports(
  code: string,
  reportJobs: ReportJobRecord[],
  translate: TranslateFn,
  formatDateTime: (value: string | null | undefined) => string,
) {
  const matches = reportJobs.filter((job) =>
    includesCostCenterValue(job.filters, code),
  );
  if (matches.length === 0) {
    return {
      count: 0,
      label: translate("costCenters.report.available.label"),
      meta: translate("costCenters.report.available.meta"),
    };
  }

  const latest = [...matches].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )[0];

  return {
    count: matches.length,
    label: translate("costCenters.report.jobCount", { count: matches.length }),
    meta: latest
      ? translate("costCenters.report.latestMeta", {
          jobType: latest.jobType,
          updatedAt: formatDateTime(latest.updatedAt),
        })
      : translate("costCenters.report.historyMeta"),
  };
}

function getEmptyReasonLabel(reason: EmptyReason, translate: TranslateFn) {
  switch (reason) {
    case "not_provisioned":
      return translate("costCenters.emptyReason.notProvisioned");
    case "fetch_failed":
      return translate("costCenters.emptyReason.fetchFailed");
    case "permission_denied":
      return translate("costCenters.emptyReason.permissionDenied");
    case "external_unavailable":
      return translate("costCenters.emptyReason.externalUnavailable");
    case "filtered_empty":
      return translate("costCenters.emptyReason.filteredEmpty");
    case "no_data":
    default:
      return translate("costCenters.emptyReason.noData");
  }
}

function formatQuotaLabel(
  summary: TenantCostCenterQuotaSummary | undefined,
  translate: TranslateFn,
  formatCount: (value: number) => string,
) {
  if (!summary) return translate("costCenters.value.empty");
  if (summary.limit.bookingCountLimit === null) {
    return translate("costCenters.value.unlimited");
  }
  return translate("costCenters.quota.bookingCount", {
    count: formatCount(summary.limit.bookingCountLimit),
  });
}

function formatQuotaMeta(
  summary: TenantCostCenterQuotaSummary | undefined,
  translate: TranslateFn,
  formatCount: (value: number) => string,
) {
  if (!summary) return translate("costCenters.quota.meta.pending");
  if (summary.inheritedFromTenant) {
    return translate("costCenters.quota.meta.inherited");
  }
  if (summary.limit.amountMinorLimit !== null) {
    return translate("costCenters.quota.meta.amount", {
      currency: summary.limit.currency,
      amount: formatCount(Math.round(summary.limit.amountMinorLimit / 100)),
    });
  }
  return translate("costCenters.quota.meta.override");
}

function formatUsageLabel(
  summary: TenantCostCenterQuotaSummary | undefined,
  translate: TranslateFn,
  formatCount: (value: number) => string,
) {
  if (!summary) return translate("costCenters.value.empty");
  return translate("costCenters.usage.label", {
    count: formatCount(
      summary.usage.confirmedBookingCount +
        summary.usage.pendingReservedBookingCount,
    ),
  });
}

function formatUsageMeta(
  summary: TenantCostCenterQuotaSummary | undefined,
  translate: TranslateFn,
  formatCount: (value: number) => string,
) {
  if (!summary) return translate("costCenters.usage.meta.pending");
  if (summary.usage.bookingCountRemaining !== null) {
    return translate("costCenters.usage.meta.remainingBookings", {
      count: formatCount(summary.usage.bookingCountRemaining),
      percent:
        summary.usage.remainingPercent ?? translate("costCenters.value.empty"),
    });
  }
  if (summary.usage.amountMinorRemaining !== null) {
    return translate("costCenters.usage.meta.remainingAmount", {
      currency: summary.limit.currency,
      amount: formatCount(Math.round(summary.usage.amountMinorRemaining / 100)),
    });
  }
  return summary.inheritedFromTenant
    ? translate("costCenters.usage.meta.inherited")
    : translate("costCenters.usage.meta.noLimit");
}

function getUsagePercent(summary?: TenantCostCenterQuotaSummary) {
  if (!summary) return null;
  if (
    summary.limit.bookingCountLimit !== null &&
    summary.limit.bookingCountLimit > 0
  ) {
    const used =
      summary.usage.confirmedBookingCount +
      summary.usage.pendingReservedBookingCount;
    return Math.max(
      0,
      Math.min(100, Math.round((used / summary.limit.bookingCountLimit) * 100)),
    );
  }
  return null;
}

function getUsageBarTone(percent: number | null) {
  if (percent === null) return th.textDim;
  if (percent >= 90) return th.danger;
  if (percent >= 80) return th.warn;
  return th.success;
}

function isOverQuota(summary?: TenantCostCenterQuotaSummary) {
  if (!summary) return false;
  return (
    (summary.usage.bookingCountRemaining ?? 0) < 0 ||
    (summary.usage.amountMinorRemaining ?? 0) < 0
  );
}

function buildTopLevelAction(): CostCenterAction {
  return {
    action: "create",
    enabled: true,
    riskLevel: "medium",
    label: "",
    intent: "create",
  };
}

function buildFallbackRowActions(
  costCenter: TenantCostCenterRecord,
): ResourceActionDescriptor[] {
  const updateAction: ResourceActionDescriptor = {
    action: "update",
    enabled: true,
    riskLevel: "medium",
  };

  if (costCenter.activeFlag) {
    return [
      updateAction,
      {
        action: "disable",
        enabled: true,
        riskLevel: "high",
        requiresReason: true,
      },
    ];
  }

  return [
    updateAction,
    {
      action: "reactivate",
      enabled: true,
      riskLevel: "medium",
    },
  ];
}

function toCostCenterActionLabel(action: string, translate: TranslateFn) {
  switch (action) {
    case "create":
      return translate("costCenters.action.create");
    case "update":
      return translate("costCenters.action.update");
    case "disable":
      return translate("costCenters.action.disable");
    case "reactivate":
      return translate("costCenters.action.reactivate");
    default:
      return null;
  }
}

function toCostCenterActionIntent(action: string): ManagerMode {
  switch (action) {
    case "create":
    case "update":
    case "disable":
    case "reactivate":
      return action;
    default:
      return null;
  }
}

function buildRowActions(
  costCenter: TenantCostCenterRecord & {
    availableActions?: ResourceActionDescriptor[];
  },
  translate: TranslateFn,
): CostCenterAction[] {
  const sourceActions =
    costCenter.availableActions && costCenter.availableActions.length > 0
      ? costCenter.availableActions
      : buildFallbackRowActions(costCenter);

  const resolvedActions: CostCenterAction[] = [];

  sourceActions.forEach((action) => {
    const intent = toCostCenterActionIntent(action.action);
    const label = toCostCenterActionLabel(action.action, translate);
    if (!intent || !label) {
      return;
    }

    resolvedActions.push({
      ...action,
      label,
      intent,
      code: costCenter.code,
    });
  });

  return resolvedActions.length > 0
    ? resolvedActions
    : buildFallbackRowActions(costCenter).map((action) => ({
        ...action,
        label:
          toCostCenterActionLabel(action.action, translate) ?? action.action,
        intent: toCostCenterActionIntent(action.action) ?? "update",
        code: costCenter.code,
      }));
}

function buildLinkedUserHref(userId: string) {
  return `/users?userId=${encodeURIComponent(userId)}`;
}

function buildStateMeta(row: CostCenterRow, translate: TranslateFn) {
  if (row.activeFlag) {
    return translate("costCenters.state.activeMeta");
  }
  return (
    row.disabledReason?.trim() || translate("costCenters.state.disabledMeta")
  );
}

function buildStateTone(row: CostCenterRow): CanvasTone {
  return row.activeFlag ? "success" : "neutral";
}

function buildStateLabel(row: CostCenterRow, translate: TranslateFn) {
  return row.activeFlag
    ? translate("costCenters.state.active")
    : translate("costCenters.state.disabled");
}

function getActionHelpText(action: CostCenterAction, translate: TranslateFn) {
  if (action.enabled) {
    if (action.intent === "disable" && action.requiresReason) {
      return translate("costCenters.action.disableReasonRequired");
    }
    return translate(`costCenters.risk.${action.riskLevel}`);
  }
  return (
    action.disabledReasonCode ?? translate("costCenters.action.unavailable")
  );
}

function buildDraft(
  mode: ManagerMode,
  costCenter?: TenantCostCenterRecord,
): CostCenterDraft {
  if (!costCenter || mode === "create") {
    return {
      code: "",
      name: "",
      description: "",
      ownerUserId: "",
      ownerName: "",
      activeFlag: true,
    };
  }

  return {
    code: costCenter.code,
    name: costCenter.name,
    description: costCenter.description ?? "",
    ownerUserId: costCenter.ownerUserId ?? "",
    ownerName: costCenter.ownerName ?? "",
    activeFlag: mode === "reactivate" ? true : costCenter.activeFlag,
  };
}

function resolveEmptyReason(
  initialEmptyReason: EmptyReason | null,
  sourceCostCenters: TenantCostCenterRecord[],
  filteredRows: CostCenterRow[],
  errors: string[],
): EmptyReason | null {
  if (initialEmptyReason) {
    return initialEmptyReason;
  }

  if (sourceCostCenters.length === 0) {
    const joinedErrors = errors.join(" ").toLowerCase();
    if (joinedErrors.includes("403")) return "permission_denied";
    if (joinedErrors.includes("502") || joinedErrors.includes("503")) {
      return "external_unavailable";
    }
    if (errors.length > 0) return "fetch_failed";
    return "no_data";
  }

  if (filteredRows.length === 0) {
    return "filtered_empty";
  }

  return null;
}

function getEmptyCopy(reason: EmptyReason, translate: TranslateFn) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: translate("costCenters.empty.notProvisioned.title"),
        body: translate("costCenters.empty.notProvisioned.body"),
        tone: "info" as CanvasTone,
      };
    case "fetch_failed":
      return {
        title: translate("costCenters.empty.fetchFailed.title"),
        body: translate("costCenters.empty.fetchFailed.body"),
        tone: "warn" as CanvasTone,
      };
    case "permission_denied":
      return {
        title: translate("costCenters.empty.permissionDenied.title"),
        body: translate("costCenters.empty.permissionDenied.body"),
        tone: "warn" as CanvasTone,
      };
    case "external_unavailable":
      return {
        title: translate("costCenters.empty.externalUnavailable.title"),
        body: translate("costCenters.empty.externalUnavailable.body"),
        tone: "warn" as CanvasTone,
      };
    case "filtered_empty":
      return {
        title: translate("costCenters.empty.filteredEmpty.title"),
        body: translate("costCenters.empty.filteredEmpty.body"),
        tone: "neutral" as CanvasTone,
      };
    case "no_data":
    default:
      return {
        title: translate("costCenters.empty.noData.title"),
        body: translate("costCenters.empty.noData.body"),
        tone: "info" as CanvasTone,
      };
  }
}

export function CostCentersManager({
  costCenters,
  quotaSummariesByCode,
  approvalRules,
  users,
  coverageReport,
  reportJobs,
  errors,
  initialEmptyReason,
}: CostCentersManagerProps) {
  const router = useRouter();
  const { locale, t } = useTranslation();
  const [flash, setFlash] = useState<CostCenterFlashPayload | null>(null);
  const [pending, startTransition] = useTransition();
  const [lastRefreshAt, setLastRefreshAt] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [showDisabled, setShowDisabled] = useState(true);
  const [mode, setMode] = useState<ManagerMode>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<CostCenterDraft>(() =>
    buildDraft("create"),
  );
  const [disableReason, setDisableReason] = useState("");
  const safeUsers = Array.isArray(users) ? users : [];
  const safeCostCenters = Array.isArray(costCenters) ? costCenters : [];
  const safeApprovalRules = Array.isArray(approvalRules) ? approvalRules : [];
  const safeReportJobs = Array.isArray(reportJobs) ? reportJobs : [];

  function formatDateTime(value: string | null | undefined) {
    if (!value) return t("costCenters.value.empty");
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return t("costCenters.value.empty");
    return new Intl.DateTimeFormat(locale === "zh" ? "zh-Hant" : "en-US", {
      dateStyle: "short",
      timeStyle: "short",
    })
      .format(parsed)
      .replace(/[\u00a0\u202f\u2009]/g, " ");
  }

  function formatCount(value: number) {
    return new Intl.NumberFormat(locale === "zh" ? "zh-TW" : "en-US").format(
      value,
    );
  }

  function getRefreshMetaLabel(lastRefreshAt: string | null) {
    if (!lastRefreshAt) {
      return t("costCenters.refresh.polling");
    }
    return t("costCenters.refresh.requestedAt", {
      requestedAt: formatDateTime(lastRefreshAt),
    });
  }

  const topLevelAction = buildTopLevelAction();
  const activeUsers = safeUsers
    .filter((user) => user.status === "active")
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, "zh-Hant"),
    );

  const rows: CostCenterRow[] = [...safeCostCenters]
    .sort((left, right) => {
      if (left.activeFlag !== right.activeFlag) {
        return left.activeFlag ? -1 : 1;
      }
      return left.code.localeCompare(right.code, "en");
    })
    .map((costCenter) => {
      const quotaSummary = quotaSummariesByCode[costCenter.code];
      const approval = describeApproval(
        costCenter.code,
        safeApprovalRules,
        t,
        formatCount,
      );
      const reports = describeReports(
        costCenter.code,
        safeReportJobs,
        t,
        formatDateTime,
      );
      return {
        code: costCenter.code,
        name: costCenter.name,
        description: costCenter.description,
        ownerName: costCenter.ownerName,
        ownerUserId: costCenter.ownerUserId,
        activeFlag: costCenter.activeFlag,
        disabledReason: costCenter.disabledReason,
        quotaLabel: formatQuotaLabel(quotaSummary, t, formatCount),
        quotaMeta: formatQuotaMeta(quotaSummary, t, formatCount),
        usageLabel: formatUsageLabel(quotaSummary, t, formatCount),
        usageMeta: formatUsageMeta(quotaSummary, t, formatCount),
        usagePercent: getUsagePercent(quotaSummary),
        approvalLabel: approval.label,
        approvalMeta: approval.meta,
        reportLabel: reports.label,
        reportMeta: reports.meta,
        reportJobCount: reports.count,
        overQuota: isOverQuota(quotaSummary),
        availableActions: buildRowActions(costCenter, t),
      };
    });

  const filteredRows = rows.filter((row) => {
    if (!showDisabled && !row.activeFlag) {
      return false;
    }
    if (ownerFilter && row.ownerUserId !== ownerFilter) {
      return false;
    }
    if (!query.trim()) {
      return true;
    }
    const normalizedQuery = query.trim().toLowerCase();
    return [row.code, row.name, row.description ?? "", row.ownerName ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  const emptyReason = resolveEmptyReason(
    initialEmptyReason,
    safeCostCenters,
    filteredRows,
    errors,
  );

  const activeCount = rows.filter((row) => row.activeFlag).length;
  const disabledCount = rows.length - activeCount;
  const overQuotaCount = rows.filter((row) => row.overQuota).length;
  const attributedReportCount = rows.filter((row) => row.reportJobCount > 0)
    .length;
  const unresolvedSamples = coverageReport?.unresolvedSamples ?? [];
  const freshestQuotaAt = Object.values(quotaSummariesByCode)
    .filter(
      (summary): summary is TenantCostCenterQuotaSummary =>
        summary !== undefined,
    )
    .reduce<string | null>((latest, summary) => {
      if (!latest) return summary.refreshedAt;
      return new Date(summary.refreshedAt) > new Date(latest)
        ? summary.refreshedAt
        : latest;
    }, null);

  useEffect(() => {
    if (mode === null) {
      return;
    }

    const target =
      mode === "create"
        ? undefined
        : (safeCostCenters.find((item) => item.code === selectedCode) ??
          undefined);
    setDraft(buildDraft(mode, target));
    setDisableReason(target?.disabledReason ?? "");
  }, [mode, selectedCode, safeCostCenters]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (pending) {
        return;
      }
      setLastRefreshAt(new Date().toISOString());
      router.refresh();
    }, T5_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [pending, router]);

  function closeEditor() {
    setMode(null);
    setSelectedCode(null);
    setDisableReason("");
  }

  function openAction(action: CostCenterAction) {
    setFlash(null);
    setSelectedCode(action.code ?? null);
    setMode(action.intent);
  }

  function updateDraft<K extends keyof CostCenterDraft>(
    key: K,
    value: CostCenterDraft[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function runAction(
    action: (formData: FormData) => Promise<CostCenterFlashPayload>,
    formData: FormData,
  ) {
    startTransition(async () => {
      const result = await action(formData);
      setFlash(result);
      if (result.tone === "default") {
        closeEditor();
        router.refresh();
      }
    });
  }

  function submitUpsertForm(submitMode: "create" | "update" | "reactivate") {
    const formData = new FormData();
    formData.set("mode", submitMode);
    formData.set("code", draft.code);
    formData.set("name", draft.name);
    formData.set("description", draft.description);
    formData.set("ownerUserId", draft.ownerUserId);
    formData.set("ownerName", draft.ownerName);
    if (draft.activeFlag) {
      formData.set("activeFlag", "on");
    }
    runAction(upsertCostCenterAction, formData);
  }

  function submitDisableForm() {
    const formData = new FormData();
    if (selectedCode) {
      formData.set("code", selectedCode);
    }
    formData.set("reason", disableReason);
    runAction(disableCostCenterAction, formData);
  }

  const columns: CanvasTableColumn<CostCenterRow>[] = [
    {
      h: t("costCenters.table.code"),
      k: "code",
      w: 124,
      mono: true,
      r: (row) => (
        <span
          style={{
            ...monoStyle,
            color: row.activeFlag ? th.text : th.textMuted,
            fontWeight: 600,
          }}
        >
          {row.code}
        </span>
      ),
    },
    {
      h: t("costCenters.table.name"),
      w: 214,
      r: (row) => (
        <div style={titleStackStyle}>
          <span style={titlePrimaryStyle}>{row.name}</span>
          <span style={titleMetaStyle}>
            {row.description ??
              (row.activeFlag
                ? t("costCenters.table.descriptionMissing")
                : t("costCenters.state.disabled"))}
          </span>
        </div>
      ),
    },
    {
      h: t("costCenters.table.state"),
      w: 150,
      r: (row) => (
        <div style={titleStackStyle}>
          <span>
            <CanvasPill theme={th} tone={buildStateTone(row)}>
              {buildStateLabel(row, t)}
            </CanvasPill>
          </span>
          <span style={titleMetaStyle}>{buildStateMeta(row, t)}</span>
        </div>
      ),
    },
    {
      h: t("costCenters.table.owner"),
      w: 144,
      r: (row) => (
        <div style={titleStackStyle}>
          {row.ownerUserId ? (
            <Link
              href={buildLinkedUserHref(row.ownerUserId)}
              style={{ ...linkStyle, ...titlePrimaryStyle }}
            >
              {row.ownerName ?? row.ownerUserId}
            </Link>
          ) : (
            <span style={titlePrimaryStyle}>
              {row.ownerName ?? t("costCenters.owner.unassigned")}
            </span>
          )}
          <span style={titleMetaStyle}>
            {row.ownerUserId ?? t("costCenters.owner.assignable")}
          </span>
        </div>
      ),
    },
    {
      h: t("costCenters.table.quota"),
      w: 138,
      r: (row) => (
        <div style={titleStackStyle}>
          <span style={{ ...titlePrimaryStyle, ...monoStyle }}>
            {row.quotaLabel}
          </span>
          <span style={titleMetaStyle}>{row.quotaMeta}</span>
        </div>
      ),
    },
    {
      h: t("costCenters.table.usage"),
      w: 188,
      r: (row) => (
        <div style={titleStackStyle}>
          <span
            style={{
              ...titlePrimaryStyle,
              ...monoStyle,
              color: row.overQuota ? th.danger : th.text,
            }}
          >
            {row.usageLabel}
          </span>
          <div style={progressMetaStyle}>
            <div style={progressTrackStyle}>
              <div
                style={{
                  width: `${row.usagePercent ?? 0}%`,
                  height: "100%",
                  background: getUsageBarTone(row.usagePercent),
                }}
              />
            </div>
            <span style={{ ...titleMetaStyle, ...monoStyle }}>
              {row.usagePercent === null
                ? t("costCenters.value.empty")
                : `${row.usagePercent}%`}
            </span>
          </div>
          <span style={titleMetaStyle}>{row.usageMeta}</span>
        </div>
      ),
    },
    {
      h: t("costCenters.table.approvalReports"),
      w: 236,
      r: (row) => (
        <div style={titleStackStyle}>
          <span style={titlePrimaryStyle}>{row.approvalLabel}</span>
          <span style={titleMetaStyle}>
            <Link
              href={`/rules?costCenter=${encodeURIComponent(row.code)}`}
              style={linkStyle}
            >
              {row.approvalMeta}
            </Link>
          </span>
          <span style={titleMetaStyle}>
            <Link
              href={`/reports?costCenter=${encodeURIComponent(row.code)}`}
              style={linkStyle}
            >
              {`${row.reportLabel} · ${row.reportMeta}`}
            </Link>
          </span>
        </div>
      ),
    },
    {
      h: t("costCenters.table.actions"),
      w: 160,
      r: (row) => (
        <div style={actionColumnStyle}>
          {row.availableActions.map((action) => (
            <button
              key={`${row.code}:${action.action}`}
              type="button"
              disabled={pending || !action.enabled}
              onClick={() => openAction(action)}
              title={getActionHelpText(action, t)}
              style={{
                ...(action.intent === "disable"
                  ? inlineDangerButtonStyle
                  : inlineButtonStyle),
                cursor: pending || !action.enabled ? "not-allowed" : "pointer",
                opacity: pending || !action.enabled ? 0.55 : 1,
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ),
    },
  ];

  const emptyCopy = emptyReason ? getEmptyCopy(emptyReason, t) : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title={t("costCenters.header.title")}
        subtitle={t("costCenters.header.subtitle")}
        actions={
          <>
            <CanvasBtn
              theme={th}
              icon="refresh"
              size="sm"
              onClick={() => {
                setLastRefreshAt(new Date().toISOString());
                router.refresh();
              }}
            >
              {t("costCenters.action.refresh")}
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="plus"
              size="sm"
              onClick={() => openAction(topLevelAction)}
              disabled={pending || !topLevelAction.enabled}
            >
              {t("costCenters.action.create")}
            </CanvasBtn>
          </>
        }
      />

      <div style={pageBodyStyle}>
        {flash ? (
          <CanvasBanner
            theme={th}
            tone={flash.tone === "warning" ? "warn" : "success"}
            icon="warn"
            title={flash.title}
            body={flash.description}
          />
        ) : null}

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title={t("costCenters.banner.partialLoad.title")}
            body={errors.join(" · ")}
          />
        ) : null}

        <CanvasBanner
          theme={th}
          tone="info"
          icon="warn"
          title={t("costCenters.banner.refresh.title")}
          body={t("costCenters.banner.refresh.body", {
            refreshMeta: getRefreshMetaLabel(lastRefreshAt),
            latestQuotaAt: formatDateTime(freshestQuotaAt),
          })}
        />

        <div style={topGridStyle}>
          <div style={kpiStyle}>
            <span style={kpiLabelStyle}>
              {t("costCenters.kpi.total.label")}
            </span>
            <span style={kpiValueStyle}>{formatCount(rows.length)}</span>
            <span style={kpiMetaStyle}>{t("costCenters.kpi.total.meta")}</span>
          </div>
          <div style={kpiStyle}>
            <span style={kpiLabelStyle}>
              {t("costCenters.kpi.active.label")}
            </span>
            <span style={kpiValueStyle}>{formatCount(activeCount)}</span>
            <span style={kpiMetaStyle}>{t("costCenters.kpi.active.meta")}</span>
          </div>
          <div style={kpiStyle}>
            <span style={kpiLabelStyle}>
              {t("costCenters.kpi.overQuota.label")}
            </span>
            <span style={kpiValueStyle}>{formatCount(overQuotaCount)}</span>
            <span style={kpiMetaStyle}>
              {t("costCenters.kpi.overQuota.meta")}
            </span>
          </div>
          <div style={kpiStyle}>
            <span style={kpiLabelStyle}>
              {t("costCenters.kpi.reports.label")}
            </span>
            <span style={kpiValueStyle}>
              {formatCount(attributedReportCount)}
            </span>
            <span style={kpiMetaStyle}>
              {t("costCenters.kpi.reports.meta")}
            </span>
          </div>
        </div>

        <CanvasCard theme={th}>
          <div style={filterGridStyle}>
            <label>
              <span style={fieldLabelStyle}>
                {t("costCenters.filter.search")}
              </span>
              <input
                style={nativeInputStyle}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("costCenters.filter.searchPlaceholder")}
              />
            </label>
            <label>
              <span style={fieldLabelStyle}>
                {t("costCenters.filter.owner")}
              </span>
              <select
                style={nativeInputStyle}
                value={ownerFilter}
                onChange={(event) => setOwnerFilter(event.target.value)}
              >
                <option value="">{t("costCenters.filter.ownerAll")}</option>
                {activeUsers.map((user) => (
                  <option key={user.userId} value={user.userId}>
                    {user.displayName}
                  </option>
                ))}
              </select>
            </label>
            <label style={checkboxRowStyle}>
              <input
                checked={showDisabled}
                onChange={(event) => setShowDisabled(event.target.checked)}
                type="checkbox"
              />
              {t("costCenters.filter.showDisabled")}
            </label>
            <div style={checkboxRowStyle}>
              <span style={{ color: th.textMuted }}>
                {t("costCenters.filter.emptyPreview")}
              </span>
              <code style={monoStyle}>
                {initialEmptyReason ?? t("costCenters.filter.emptyPreviewAuto")}
              </code>
            </div>
          </div>
        </CanvasCard>

        <div style={contentGridStyle}>
          <div style={tableCardStyle}>
            <CanvasCard theme={th} padding={0}>
              {emptyCopy ? (
                <div style={emptyStateStyle}>
                  <CanvasPill theme={th} tone={emptyCopy.tone}>
                    {getEmptyReasonLabel(emptyReason ?? "no_data", t)}
                  </CanvasPill>
                  <div style={emptyTitleStyle}>{emptyCopy.title}</div>
                  <div style={emptyBodyStyle}>{emptyCopy.body}</div>
                  <div style={actionRowStyle}>
                    <CanvasBtn
                      theme={th}
                      size="sm"
                      onClick={() => {
                        setLastRefreshAt(new Date().toISOString());
                        router.refresh();
                      }}
                    >
                      {t("costCenters.action.refresh")}
                    </CanvasBtn>
                    {(emptyReason === "no_data" ||
                      emptyReason === "not_provisioned") &&
                    topLevelAction.enabled ? (
                      <CanvasBtn
                        theme={th}
                        variant="primary"
                        size="sm"
                        onClick={() => openAction(topLevelAction)}
                      >
                        {t("costCenters.empty.createFirst")}
                      </CanvasBtn>
                    ) : null}
                    {emptyReason === "filtered_empty" ? (
                      <CanvasBtn
                        theme={th}
                        size="sm"
                        onClick={() => {
                          setQuery("");
                          setOwnerFilter("");
                          setShowDisabled(true);
                        }}
                      >
                        {t("costCenters.action.clearFilters")}
                      </CanvasBtn>
                    ) : null}
                  </div>
                </div>
              ) : (
                <CanvasTable<CostCenterRow>
                  theme={th}
                  columns={columns}
                  rows={filteredRows}
                />
              )}
            </CanvasCard>
          </div>

          <div style={sideLaneStyle}>
            <CanvasCard theme={th}>
              <div style={sectionLabelStyle}>
                {t("costCenters.editor.title")}
              </div>
              {mode === null ? (
                <div style={textWrapStyle}>
                  {t("costCenters.editor.idleBody")}
                </div>
              ) : mode === "disable" ? (
                <div style={formGridStyle}>
                  <CanvasField
                    theme={th}
                    label={t("costCenters.form.disableReason")}
                  >
                    <textarea
                      style={nativeTextAreaStyle}
                      value={disableReason}
                      onChange={(event) => setDisableReason(event.target.value)}
                      placeholder={t(
                        "costCenters.form.disableReasonPlaceholder",
                      )}
                    />
                  </CanvasField>
                  <div style={formFooterStyle}>
                    <span style={formNoteStyle}>
                      {t("costCenters.form.disableNote")}
                    </span>
                    <div style={actionRowStyle}>
                      <CanvasBtn theme={th} size="sm" onClick={closeEditor}>
                        {t("costCenters.action.cancel")}
                      </CanvasBtn>
                      <button
                        type="button"
                        onClick={submitDisableForm}
                        disabled={pending}
                        style={{
                          ...primaryDangerButtonStyle,
                          cursor: pending ? "not-allowed" : "pointer",
                          opacity: pending ? 0.55 : 1,
                        }}
                      >
                        {t("costCenters.action.confirmDisable")}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={formGridStyle}>
                  <input type="hidden" value={draft.code} />
                  <CanvasField theme={th} label={t("costCenters.form.code")}>
                    <input
                      style={nativeInputStyle}
                      value={draft.code}
                      onChange={(event) =>
                        updateDraft("code", event.target.value)
                      }
                      placeholder={t("costCenters.form.codePlaceholder")}
                      disabled={mode !== "create"}
                    />
                  </CanvasField>
                  <CanvasField theme={th} label={t("costCenters.form.name")}>
                    <input
                      style={nativeInputStyle}
                      value={draft.name}
                      onChange={(event) =>
                        updateDraft("name", event.target.value)
                      }
                      placeholder={t("costCenters.form.namePlaceholder")}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={t("costCenters.form.description")}
                  >
                    <textarea
                      style={nativeTextAreaStyle}
                      value={draft.description}
                      onChange={(event) =>
                        updateDraft("description", event.target.value)
                      }
                      placeholder={t("costCenters.form.descriptionPlaceholder")}
                    />
                  </CanvasField>
                  <CanvasField
                    theme={th}
                    label={t("costCenters.form.ownerUser")}
                  >
                    <select
                      style={nativeInputStyle}
                      value={draft.ownerUserId}
                      onChange={(event) => {
                        const value = event.target.value;
                        const user = activeUsers.find(
                          (item) => item.userId === value,
                        );
                        updateDraft("ownerUserId", value);
                        updateDraft("ownerName", user?.displayName ?? "");
                      }}
                    >
                      <option value="">
                        {t("costCenters.owner.unassigned")}
                      </option>
                      {activeUsers.map((user) => (
                        <option key={user.userId} value={user.userId}>
                          {user.displayName}
                        </option>
                      ))}
                    </select>
                  </CanvasField>
                  <label style={checkboxRowStyle}>
                    <input
                      checked={draft.activeFlag}
                      onChange={(event) =>
                        updateDraft("activeFlag", event.target.checked)
                      }
                      type="checkbox"
                    />
                    {t("costCenters.form.activeRow")}
                  </label>
                  <div style={formFooterStyle}>
                    <span style={formNoteStyle}>
                      {t("costCenters.form.upsertNote")}
                    </span>
                    <div style={actionRowStyle}>
                      <CanvasBtn theme={th} size="sm" onClick={closeEditor}>
                        {t("costCenters.action.cancel")}
                      </CanvasBtn>
                      <CanvasBtn
                        theme={th}
                        variant="primary"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          submitUpsertForm(
                            mode === "reactivate"
                              ? "reactivate"
                              : mode === "update"
                                ? "update"
                                : "create",
                          )
                        }
                      >
                        {mode === "reactivate"
                          ? t("costCenters.action.reactivate")
                          : mode === "update"
                            ? t("costCenters.action.saveUpdate")
                            : t("costCenters.action.createCenter")}
                      </CanvasBtn>
                    </div>
                  </div>
                </div>
              )}
            </CanvasCard>

            <CanvasCard theme={th}>
              <div style={sectionLabelStyle}>
                {t("costCenters.links.title")}
              </div>
              <ul style={listStyle}>
                <li>
                  <Link href="/users" style={linkStyle}>
                    /users
                  </Link>{" "}
                  {t("costCenters.links.users")}
                </li>
                <li>
                  <Link href="/rules" style={linkStyle}>
                    /rules
                  </Link>{" "}
                  {t("costCenters.links.rules")}
                </li>
                <li>
                  <Link href="/reports" style={linkStyle}>
                    /reports
                  </Link>{" "}
                  {t("costCenters.links.reports")}
                </li>
                <li>
                  <Link href="/audit" style={linkStyle}>
                    /audit
                  </Link>{" "}
                  {t("costCenters.links.audit")}
                </li>
              </ul>
            </CanvasCard>

            <CanvasCard theme={th}>
              <div style={sectionLabelStyle}>
                {t("costCenters.coverage.title")}
              </div>
              <div style={titleStackStyle}>
                <span style={titlePrimaryStyle}>
                  {coverageReport
                    ? t("costCenters.coverage.summary", {
                        count: formatCount(coverageReport.unresolvedCount),
                      })
                    : t("costCenters.coverage.unavailable")}
                </span>
                <span style={titleMetaStyle}>
                  {coverageReport
                    ? t("costCenters.coverage.meta", {
                        resolved: formatCount(coverageReport.resolvedCount),
                        total: formatCount(coverageReport.totalBookings),
                        generatedAt: formatDateTime(coverageReport.generatedAt),
                      })
                    : t("costCenters.coverage.help")}
                </span>
              </div>
              {unresolvedSamples.length > 0 ? (
                <>
                  <div style={sectionLabelStyle}>
                    {t("costCenters.coverage.samplesTitle")}
                  </div>
                  <ul style={listStyle}>
                    {unresolvedSamples.slice(0, 4).map((sample) => (
                      <li key={sample.rawCostCenter}>
                        <span style={monoStyle}>{sample.rawCostCenter}</span>
                        {t("costCenters.coverage.sampleOccurrences", {
                          count: formatCount(sample.occurrences),
                        })}
                        {sample.suggestion
                          ? t("costCenters.coverage.sampleSuggestion", {
                              suggestion: sample.suggestion,
                            })
                          : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </CanvasCard>

            <CanvasCard theme={th}>
              <div style={sectionLabelStyle}>
                {t("costCenters.visibility.title")}
              </div>
              <div style={titleStackStyle}>
                <span style={titlePrimaryStyle}>
                  {t("costCenters.visibility.summary", {
                    count: formatCount(disabledCount),
                  })}
                </span>
                <span style={titleMetaStyle}>
                  {t("costCenters.visibility.meta")}
                </span>
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
