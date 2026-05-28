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
import { disableCostCenterAction, upsertCostCenterAction } from "./actions";
import type { CostCenterFlashPayload } from "./constants";

type CostCentersManagerProps = {
  costCenters: TenantCostCenterRecord[];
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
  usageLabel: string;
  usageMeta: string;
  approvalLabel: string;
  approvalMeta: string;
  reportLabel: string;
  reportMeta: string;
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

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

const numberFormatter = new Intl.NumberFormat("en-US");

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
}

function formatCount(value: number) {
  return numberFormatter.format(value);
}

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

function formatSubtypeLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("airport")) return "機場";
  if (normalized.includes("overnight")) return "跨夜";
  return value;
}

function describeApproval(
  code: string,
  rules: TenantApprovalRuleRecord[],
): { label: string; meta: string } {
  const relevantRules = rules.filter((rule) =>
    ruleTargetsCostCenter(rule, code),
  );
  if (relevantRules.length === 0) {
    return {
      label: "沿用租戶規則",
      meta: "此成本中心沒有明確 code-targeted rule。",
    };
  }

  const primaryRule = relevantRules[0];
  if (!primaryRule) {
    return {
      label: "沿用租戶規則",
      meta: "沒有可用的審批規則摘要。",
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
          typeof value === "string" ? formatSubtypeLabel(value) : null,
        )
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (subtypeLabels.length > 0) {
    return {
      label: `${relevantRules.length} 條規則`,
      meta: `${subtypeLabels.join(" / ")} 需核准`,
    };
  }

  const amountThresholdMinor = getAmountThresholdMinor(primaryRule);
  if (amountThresholdMinor !== null) {
    return {
      label: `${relevantRules.length} 條規則`,
      meta: `> NT$ ${numberFormatter.format(
        Math.round(amountThresholdMinor / 100),
      )} 需核准`,
    };
  }

  if (primaryRule.action === "warn") {
    return {
      label: `${relevantRules.length} 條規則`,
      meta: "超額警示，不阻擋建立。",
    };
  }

  if (primaryRule.action === "block") {
    return {
      label: `${relevantRules.length} 條規則`,
      meta: "超額直接阻擋建立。",
    };
  }

  if (ruleUsesCostCenterOwner(primaryRule, code)) {
    return {
      label: `${relevantRules.length} 條規則`,
      meta: "使用 cost_center_owner approver。",
    };
  }

  return {
    label: `${relevantRules.length} 條規則`,
    meta: "需要進一步查看 `/rules` 的命中條件。",
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

function describeReports(code: string, reportJobs: ReportJobRecord[]) {
  const matches = reportJobs.filter((job) =>
    includesCostCenterValue(job.filters, code),
  );
  if (matches.length === 0) {
    return {
      label: "可做成本中心切片",
      meta: "至 `/reports` 以 cost center scope 建立新報表。",
    };
  }

  const latest = [...matches].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )[0];

  return {
    label: `${matches.length} 份報表作業`,
    meta: latest
      ? `${latest.jobType} · 最新 ${formatDateTime(latest.updatedAt)}`
      : "已有歷史作業引用此成本中心。",
  };
}

function formatQuotaLabel(summary?: TenantCostCenterQuotaSummary) {
  if (!summary) return "—";
  if (summary.limit.bookingCountLimit === null) return "∞";
  return `${formatCount(summary.limit.bookingCountLimit)} 趟 / 月`;
}

function formatUsageLabel(summary?: TenantCostCenterQuotaSummary) {
  if (!summary) return "—";
  return `${formatCount(
    summary.usage.confirmedBookingCount +
      summary.usage.pendingReservedBookingCount,
  )} 趟`;
}

function formatUsageMeta(summary?: TenantCostCenterQuotaSummary) {
  if (!summary) return "配額資料尚未同步";
  if (summary.usage.bookingCountRemaining !== null) {
    return `${formatCount(summary.usage.bookingCountRemaining)} 趟剩餘 · ${summary.usage.remainingPercent ?? "—"}%`;
  }
  if (summary.usage.amountMinorRemaining !== null) {
    return `${summary.limit.currency} ${formatCount(
      Math.round(summary.usage.amountMinorRemaining / 100),
    )} 剩餘`;
  }
  return summary.inheritedFromTenant
    ? "沿用租戶月配額"
    : "此成本中心無硬性上限";
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
    label: "新增",
    intent: "create",
  };
}

function buildRowActions(
  costCenter: TenantCostCenterRecord,
): CostCenterAction[] {
  const updateAction: CostCenterAction = {
    action: "update",
    enabled: true,
    riskLevel: "medium",
    label: "更新",
    intent: "update",
    code: costCenter.code,
  };

  if (costCenter.activeFlag) {
    return [
      updateAction,
      {
        action: "disable",
        enabled: true,
        riskLevel: "high",
        requiresReason: true,
        label: "停用",
        intent: "disable",
        code: costCenter.code,
      },
    ];
  }

  return [
    updateAction,
    {
      action: "reactivate",
      enabled: true,
      riskLevel: "medium",
      label: "重新啟用",
      intent: "reactivate",
      code: costCenter.code,
    },
  ];
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

function getEmptyCopy(reason: EmptyReason) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "治理模組尚未開通",
        body: "租戶尚未完成成本中心治理初始設定。先建立第一個成本中心，之後才能穩定做 quota 與 approval linkage。",
        tone: "info" as CanvasTone,
      };
    case "fetch_failed":
      return {
        title: "成本中心清單暫時載入失敗",
        body: "頁面沒有拿到完整目錄。請重新整理；若持續失敗，改去 `/audit` 檢查最近治理寫入與 API 錯誤。",
        tone: "warn" as CanvasTone,
      };
    case "permission_denied":
      return {
        title: "目前身分沒有治理權限",
        body: "這個 actor 沒有可用的成本中心維護能力，因此不顯示可寫入的治理資料。",
        tone: "warn" as CanvasTone,
      };
    case "external_unavailable":
      return {
        title: "外部依賴暫時不可用",
        body: "配額或報表切片依賴的下游資料目前不穩定。可以先重整，或稍後再回來查看 attribution 與 quota posture。",
        tone: "warn" as CanvasTone,
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件沒有命中任何成本中心",
        body: "清空搜尋文字、放寬 owner filter，或把 disabled rows 打開即可回到完整目錄。",
        tone: "neutral" as CanvasTone,
      };
    case "no_data":
    default:
      return {
        title: "尚未建立任何成本中心",
        body: "這是 `no_data` 狀態。先建立第一個成本中心，再把 quota 與 approval linkage 導回 `/rules`、報表 attribution 導回 `/reports`。",
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
  const [flash, setFlash] = useState<CostCenterFlashPayload | null>(null);
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [showDisabled, setShowDisabled] = useState(true);
  const [mode, setMode] = useState<ManagerMode>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [draft, setDraft] = useState<CostCenterDraft>(() =>
    buildDraft("create"),
  );
  const [disableReason, setDisableReason] = useState("");

  const topLevelAction = buildTopLevelAction();
  const activeUsers = users
    .filter((user) => user.status === "active")
    .sort((left, right) =>
      left.displayName.localeCompare(right.displayName, "zh-Hant"),
    );

  const rows: CostCenterRow[] = [...costCenters]
    .sort((left, right) => {
      if (left.activeFlag !== right.activeFlag) {
        return left.activeFlag ? -1 : 1;
      }
      return left.code.localeCompare(right.code, "en");
    })
    .map((costCenter) => {
      const quotaSummary = quotaSummariesByCode[costCenter.code];
      const approval = describeApproval(costCenter.code, approvalRules);
      const reports = describeReports(costCenter.code, reportJobs);
      return {
        code: costCenter.code,
        name: costCenter.name,
        description: costCenter.description,
        ownerName: costCenter.ownerName,
        ownerUserId: costCenter.ownerUserId,
        activeFlag: costCenter.activeFlag,
        disabledReason: costCenter.disabledReason,
        quotaLabel: formatQuotaLabel(quotaSummary),
        usageLabel: formatUsageLabel(quotaSummary),
        usageMeta: formatUsageMeta(quotaSummary),
        approvalLabel: approval.label,
        approvalMeta: approval.meta,
        reportLabel: reports.label,
        reportMeta: reports.meta,
        overQuota: isOverQuota(quotaSummary),
        availableActions: buildRowActions(costCenter),
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
    costCenters,
    filteredRows,
    errors,
  );

  const activeCount = rows.filter((row) => row.activeFlag).length;
  const disabledCount = rows.length - activeCount;
  const overQuotaCount = rows.filter((row) => row.overQuota).length;
  const attributedReportCount = rows.filter((row) =>
    row.reportLabel.includes("報表作業"),
  ).length;
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
        : (costCenters.find((item) => item.code === selectedCode) ?? undefined);
    setDraft(buildDraft(mode, target));
    setDisableReason(target?.disabledReason ?? "");
  }, [mode, selectedCode, costCenters]);

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
      h: "CODE",
      k: "code",
      w: 120,
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
      h: "NAME",
      w: 210,
      r: (row) => (
        <div style={titleStackStyle}>
          <span style={titlePrimaryStyle}>{row.name}</span>
          <span style={titleMetaStyle}>
            {row.description ?? (row.activeFlag ? "未填描述" : "disabled")}
          </span>
        </div>
      ),
    },
    {
      h: "OWNER",
      w: 150,
      r: (row) => (
        <div style={titleStackStyle}>
          <span style={titlePrimaryStyle}>{row.ownerName ?? "未指定"}</span>
          <span style={titleMetaStyle}>
            {row.ownerUserId ?? "可改派 tenant user"}
          </span>
        </div>
      ),
    },
    {
      h: "配額",
      w: 124,
      mono: true,
      align: "right",
      r: (row) => row.quotaLabel,
    },
    {
      h: "使用",
      w: 170,
      r: (row) => (
        <div style={titleStackStyle}>
          <span
            style={{
              ...titlePrimaryStyle,
              color: row.overQuota ? th.danger : th.text,
            }}
          >
            {row.usageLabel}
          </span>
          <span style={titleMetaStyle}>{row.usageMeta}</span>
        </div>
      ),
    },
    {
      h: "APPROVAL",
      w: 180,
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
        </div>
      ),
    },
    {
      h: "REPORTS",
      w: 180,
      r: (row) => (
        <div style={titleStackStyle}>
          <span style={titlePrimaryStyle}>{row.reportLabel}</span>
          <span style={titleMetaStyle}>
            <Link
              href={`/reports?costCenter=${encodeURIComponent(row.code)}`}
              style={linkStyle}
            >
              {row.reportMeta}
            </Link>
          </span>
        </div>
      ),
    },
    {
      h: "ACTIONS",
      w: 160,
      r: (row) => (
        <div style={actionRowStyle}>
          {row.availableActions.map((action) => (
            <button
              key={`${row.code}:${action.action}`}
              type="button"
              disabled={pending || !action.enabled}
              onClick={() => openAction(action)}
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

  const emptyCopy = emptyReason ? getEmptyCopy(emptyReason) : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="成本中心"
        subtitle="Directory · quota posture · approval linkage · report attribution"
        actions={
          <>
            <CanvasBtn
              theme={th}
              icon="refresh"
              size="sm"
              onClick={() => router.refresh()}
            >
              重新整理
            </CanvasBtn>
            <CanvasBtn
              theme={th}
              variant="primary"
              icon="plus"
              size="sm"
              onClick={() => openAction(topLevelAction)}
              disabled={pending || !topLevelAction.enabled}
            >
              {topLevelAction.label}
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
            title="部分治理切片未完整載入"
            body={errors.join(" · ")}
          />
        ) : null}

        <CanvasBanner
          theme={th}
          tone="info"
          icon="warn"
          title="T5 refresh tier 已接上目錄、quota、rules、reports 四個切片"
          body={`最新 quota refresh: ${formatDateTime(freshestQuotaAt)} · approval linkage 請往 /rules 深入，report attribution 請往 /reports 深入。`}
        />

        <div style={topGridStyle}>
          <div style={kpiStyle}>
            <span style={kpiLabelStyle}>成本中心</span>
            <span style={kpiValueStyle}>{formatCount(rows.length)}</span>
            <span style={kpiMetaStyle}>目前租戶目錄總數</span>
          </div>
          <div style={kpiStyle}>
            <span style={kpiLabelStyle}>Active</span>
            <span style={kpiValueStyle}>{formatCount(activeCount)}</span>
            <span style={kpiMetaStyle}>disabled 可用獨立 filter 顯示</span>
          </div>
          <div style={kpiStyle}>
            <span style={kpiLabelStyle}>Over quota</span>
            <span style={kpiValueStyle}>{formatCount(overQuotaCount)}</span>
            <span style={kpiMetaStyle}>超額列以 danger 標記</span>
          </div>
          <div style={kpiStyle}>
            <span style={kpiLabelStyle}>Attributed reports</span>
            <span style={kpiValueStyle}>
              {formatCount(attributedReportCount)}
            </span>
            <span style={kpiMetaStyle}>
              已命中 cost-center filter 的報表作業
            </span>
          </div>
        </div>

        <CanvasCard theme={th}>
          <div style={filterGridStyle}>
            <label>
              <span style={fieldLabelStyle}>Search</span>
              <input
                style={nativeInputStyle}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜尋 code、名稱、owner"
              />
            </label>
            <label>
              <span style={fieldLabelStyle}>Owner</span>
              <select
                style={nativeInputStyle}
                value={ownerFilter}
                onChange={(event) => setOwnerFilter(event.target.value)}
              >
                <option value="">全部 owner</option>
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
              顯示 disabled 成本中心
            </label>
            <div style={checkboxRowStyle}>
              <span style={{ color: th.textMuted }}>Empty reason preview:</span>
              <code style={monoStyle}>{initialEmptyReason ?? "auto"}</code>
            </div>
          </div>
        </CanvasCard>

        <div style={contentGridStyle}>
          <div style={tableCardStyle}>
            <CanvasCard theme={th} padding={0}>
              {emptyCopy ? (
                <div style={emptyStateStyle}>
                  <CanvasPill theme={th} tone={emptyCopy.tone}>
                    {emptyReason}
                  </CanvasPill>
                  <div style={emptyTitleStyle}>{emptyCopy.title}</div>
                  <div style={emptyBodyStyle}>{emptyCopy.body}</div>
                  <div style={actionRowStyle}>
                    <CanvasBtn
                      theme={th}
                      size="sm"
                      onClick={() => router.refresh()}
                    >
                      重新整理
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
                        建立第一個成本中心
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
                        清空篩選
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
              <div style={sectionLabelStyle}>編輯器</div>
              {mode === null ? (
                <div style={textWrapStyle}>
                  選擇新增、更新、停用或重新啟用，所有 CTA 都由本頁的
                  `availableActions`
                  描述陣列驅動，而不是直接把按鈕硬寫在表格外。
                </div>
              ) : mode === "disable" ? (
                <div style={formGridStyle}>
                  <CanvasField theme={th} label="停用原因">
                    <textarea
                      style={nativeTextAreaStyle}
                      value={disableReason}
                      onChange={(event) => setDisableReason(event.target.value)}
                      placeholder="例如：合併至新部門成本中心、停用舊代碼"
                    />
                  </CanvasField>
                  <div style={formFooterStyle}>
                    <span style={formNoteStyle}>
                      high-risk action 需要原因。停用後 row 仍保留並可透過
                      disabled filter 查看。
                    </span>
                    <div style={actionRowStyle}>
                      <CanvasBtn theme={th} size="sm" onClick={closeEditor}>
                        取消
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
                        確認停用
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={formGridStyle}>
                  <input type="hidden" value={draft.code} />
                  <CanvasField theme={th} label="Code">
                    <input
                      style={nativeInputStyle}
                      value={draft.code}
                      onChange={(event) =>
                        updateDraft("code", event.target.value)
                      }
                      placeholder="CC-FIN-04"
                      disabled={mode !== "create"}
                    />
                  </CanvasField>
                  <CanvasField theme={th} label="Name">
                    <input
                      style={nativeInputStyle}
                      value={draft.name}
                      onChange={(event) =>
                        updateDraft("name", event.target.value)
                      }
                      placeholder="財務處"
                    />
                  </CanvasField>
                  <CanvasField theme={th} label="Description">
                    <textarea
                      style={nativeTextAreaStyle}
                      value={draft.description}
                      onChange={(event) =>
                        updateDraft("description", event.target.value)
                      }
                      placeholder="描述此成本中心主要歸屬的差旅與使用情境"
                    />
                  </CanvasField>
                  <CanvasField theme={th} label="Owner tenant user">
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
                      <option value="">未指定</option>
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
                    Active directory row
                  </label>
                  <div style={formFooterStyle}>
                    <span style={formNoteStyle}>
                      medium-risk action 會直接送到 published upsert command。
                    </span>
                    <div style={actionRowStyle}>
                      <CanvasBtn theme={th} size="sm" onClick={closeEditor}>
                        取消
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
                          ? "重新啟用"
                          : mode === "update"
                            ? "儲存更新"
                            : "建立成本中心"}
                      </CanvasBtn>
                    </div>
                  </div>
                </div>
              )}
            </CanvasCard>

            <CanvasCard theme={th}>
              <div style={sectionLabelStyle}>Cross-app deep links</div>
              <ul style={listStyle}>
                <li>
                  <Link href="/rules" style={linkStyle}>
                    /rules
                  </Link>{" "}
                  查看 code-targeted rule、owner-based approver 與 precedence。
                </li>
                <li>
                  <Link href="/reports" style={linkStyle}>
                    /reports
                  </Link>{" "}
                  追查哪些報表 job 對成本中心做 period/scope attribution。
                </li>
                <li>
                  <Link href="/audit" style={linkStyle}>
                    /audit
                  </Link>{" "}
                  驗證 `upsert_cost_center` / `disable_cost_center` 的治理軌跡。
                </li>
              </ul>
            </CanvasCard>

            <CanvasCard theme={th}>
              <div style={sectionLabelStyle}>Coverage follow-up</div>
              <div style={titleStackStyle}>
                <span style={titlePrimaryStyle}>
                  {coverageReport
                    ? `${formatCount(coverageReport.unresolvedCount)} unresolved legacy values`
                    : "尚未取得 coverage report"}
                </span>
                <span style={titleMetaStyle}>
                  {coverageReport
                    ? `resolved ${formatCount(coverageReport.resolvedCount)} / total ${formatCount(coverageReport.totalBookings)} · generated ${formatDateTime(coverageReport.generatedAt)}`
                    : "這個切片用來判斷該建立新成本中心，還是擴充既有目錄。"}
                </span>
              </div>
              {unresolvedSamples.length > 0 ? (
                <>
                  <div style={sectionLabelStyle}>Unresolved samples</div>
                  <ul style={listStyle}>
                    {unresolvedSamples.slice(0, 4).map((sample) => (
                      <li key={sample.rawCostCenter}>
                        <span style={monoStyle}>{sample.rawCostCenter}</span>
                        {` · ${formatCount(sample.occurrences)} 筆`}
                        {sample.suggestion
                          ? ` · 建議 ${sample.suggestion}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </CanvasCard>

            <CanvasCard theme={th}>
              <div style={sectionLabelStyle}>Disabled visibility</div>
              <div style={titleStackStyle}>
                <span style={titlePrimaryStyle}>
                  {formatCount(disabledCount)} disabled rows
                </span>
                <span style={titleMetaStyle}>
                  packet 要求 disabled 成本中心可見且有獨立
                  filter，不能直接從目錄消失。
                </span>
              </div>
            </CanvasCard>
          </div>
        </div>
      </div>
    </div>
  );
}
