import type { CSSProperties } from "react";
import Link from "next/link";
import type {
  CrossAppResourceLink,
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  TenantApprovalRuleCondition,
  TenantApprovalRuleRecord,
  TenantCostCenterCoverageReport,
  TenantCostCenterQuotaSummary,
  TenantCostCenterRecord,
  TenantUserRoleRecord,
  UiRefreshMetadata,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasKPI,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { DEMO_TENANT_ID, getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

const PLATFORM_ADMIN_URL =
  process.env.NEXT_PUBLIC_PLATFORM_ADMIN_URL ?? "http://localhost:3102";
const OPS_CONSOLE_URL =
  process.env.NEXT_PUBLIC_OPS_CONSOLE_URL ?? "http://localhost:3103";

const REFRESH_TIER: RefreshTier = "slow";
const REFRESH_STALE_AFTER_MS = 30_000;

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

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 12,
};

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.4fr) minmax(300px, 0.8fr)",
  gap: 16,
};

const cardStackStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const summaryHeadlineStyle: CSSProperties = {
  margin: 0,
  color: th.text,
  fontSize: 17,
  fontWeight: 700,
  lineHeight: 1.35,
};

const summaryBodyStyle: CSSProperties = {
  margin: 0,
  color: th.textMuted,
  fontSize: 12.5,
  lineHeight: 1.6,
};

const summaryStripStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
};

const summaryMetricStyle: CSSProperties = {
  border: `1px solid ${th.border}`,
  borderRadius: 14,
  background: th.surfaceLo,
  padding: "12px 14px",
  display: "grid",
  gap: 4,
};

const summaryMetricLabelStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 10.5,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const summaryMetricValueStyle: CSSProperties = {
  color: th.text,
  fontSize: 16,
  fontWeight: 700,
};

const linkRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
};

const filterPanelStyle: CSSProperties = {
  display: "grid",
  gap: 12,
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const filterFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1.3fr) minmax(160px, 0.9fr) auto auto",
  gap: 10,
  alignItems: "center",
};

const fieldStyle: CSSProperties = {
  width: "100%",
  borderRadius: 12,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.text,
  fontSize: 12.5,
  padding: "10px 12px",
  outline: "none",
};

const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  color: th.textMuted,
  fontSize: 11,
};

const tableCellStackStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  minWidth: 0,
};

const tablePrimaryTextStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const tableMutedTextStyle: CSSProperties = {
  fontSize: 11.5,
  color: th.textMuted,
  whiteSpace: "normal",
  lineHeight: 1.45,
};

const actionRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
};

const quotaMeterTrackStyle: CSSProperties = {
  flex: 1,
  minWidth: 84,
  height: 6,
  borderRadius: 999,
  overflow: "hidden",
  background: th.surfaceLo,
  border: `1px solid ${th.border}`,
};

const inlineLinkStyle: CSSProperties = {
  color: th.accent,
  textDecoration: "none",
  fontSize: 12,
  fontWeight: 600,
};

const panelGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 16,
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  display: "grid",
  gap: 8,
  color: th.text,
  fontSize: 12.5,
  lineHeight: 1.55,
};

const emptyStateStyle: CSSProperties = {
  padding: 24,
  display: "grid",
  gap: 12,
};

const helperTextStyle: CSSProperties = {
  color: th.textMuted,
  fontSize: 11.5,
  lineHeight: 1.5,
};

const numberFormatter = new Intl.NumberFormat("en-US");

type ViewFilter = "all" | "active" | "disabled" | "over_quota";
type FreshnessOverride = UiRefreshMetadata["dataFreshness"] | "auto";
type SupportedEmptyReason = Exclude<EmptyReason, "driver_not_eligible">;

type SearchParamValue = string | string[] | undefined;

type CostCenterRow = Record<string, unknown> & {
  code: string;
  name: string;
  description: string | null;
  ownerName: string | null;
  ownerLabel: string;
  ownerUserId: string | null;
  activeFlag: boolean;
  quotaLabel: string;
  quotaDetail: string;
  usageLabel: string;
  remainingLabel: string;
  approvalLabel: string;
  approvalDetail: string;
  reportLabel: string;
  reportDetail: string;
  overQuota: boolean;
  usagePercent: number | null;
  disabledReason: string | null;
  actions: ResourceActionDescriptor[];
};

type CostCenterActionRecord = TenantCostCenterRecord & {
  availableActions?: ResourceActionDescriptor[];
};

type CostCentersPageData = {
  costCenters: CostCenterActionRecord[];
  quotaSummariesByCode: Partial<Record<string, TenantCostCenterQuotaSummary>>;
  approvalRules: TenantApprovalRuleRecord[];
  coverageReport: TenantCostCenterCoverageReport | null;
  users: TenantUserRoleRecord[];
  usersById: Map<string, TenantUserRoleRecord>;
  refreshMetadata: UiRefreshMetadata;
  errors: string[];
};

type CostCentersPageProps = {
  searchParams?: Promise<Record<string, SearchParamValue>>;
};

type CostCenterQuery = {
  emptyReason: SupportedEmptyReason | null;
  view: ViewFilter;
  freshnessOverride: FreshnessOverride;
  search: string;
  ownerUserId: string;
};

const EMPTY_REASON_LABELS: Record<SupportedEmptyReason, string> = {
  no_data: "尚無資料",
  not_provisioned: "尚未啟用",
  fetch_failed: "載入失敗",
  permission_denied: "權限不足",
  external_unavailable: "外部依賴中斷",
  filtered_empty: "篩選後無結果",
};

const ACTION_LABELS: Record<string, string> = {
  create: "新增",
  update: "編輯",
  disable: "停用",
  reactivate: "重新啟用",
  refresh: "重新整理",
};

const DISABLED_REASON_LABELS: Record<string, string> = {
  already_disabled: "此成本中心已停用。",
  already_active: "此成本中心已啟用。",
  owner_unlinked: "尚未綁定 owner user，請先補齊維護責任人。",
  requires_provisioning: "租戶尚未啟用成本中心與配額模組。",
  permission_denied: "目前角色只有唯讀權限。",
  upstream_unavailable: "配額或規則依賴目前無法讀取。",
};

const VIEW_FILTERS: { value: ViewFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "active", label: "啟用中" },
  { value: "disabled", label: "已停用" },
  { value: "over_quota", label: "超額 / 告警" },
];

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function getFirstParamValue(value: SearchParamValue) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
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

function formatRideCount(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }

  return `${numberFormatter.format(value)} 趟`;
}

function compareCostCenters(
  a: TenantCostCenterRecord,
  b: TenantCostCenterRecord,
) {
  if (a.activeFlag !== b.activeFlag) {
    return a.activeFlag ? -1 : 1;
  }
  return a.code.localeCompare(b.code, "zh-Hant");
}

function deriveRefreshMetadata(
  generatedAtCandidates: (string | null | undefined)[],
  override: FreshnessOverride,
): UiRefreshMetadata {
  const latestGeneratedAt =
    generatedAtCandidates
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => right.localeCompare(left))[0] ??
    new Date().toISOString();

  const ageMs = Date.now() - new Date(latestGeneratedAt).getTime();
  const autoFreshness: UiRefreshMetadata["dataFreshness"] =
    Number.isNaN(ageMs) || ageMs < 0
      ? "unknown"
      : ageMs > REFRESH_STALE_AFTER_MS
        ? "stale"
        : "fresh";

  return {
    generatedAt: latestGeneratedAt,
    staleAfterMs: REFRESH_STALE_AFTER_MS,
    dataFreshness: override === "auto" ? autoFreshness : override,
    source: "live",
  };
}

async function loadCostCentersData(
  query: CostCenterQuery,
): Promise<CostCentersPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  const costCenterOptions: {
    search?: string;
    ownerUserId?: string;
  } = {};

  if (query.search) {
    costCenterOptions.search = query.search;
  }
  if (query.ownerUserId) {
    costCenterOptions.ownerUserId = query.ownerUserId;
  }

  const [
    costCentersResult,
    approvalRulesResult,
    coverageReportResult,
    usersResult,
  ] = await Promise.allSettled([
    client.listCostCenters(costCenterOptions) as Promise<
      TenantCostCenterRecord[]
    >,
    client.listApprovalRules() as Promise<TenantApprovalRuleRecord[]>,
    client.getTenantCostCenterCoverageReport() as Promise<TenantCostCenterCoverageReport>,
    client.listTenantUsers() as Promise<TenantUserRoleRecord[]>,
  ]);

  const costCenters =
    costCentersResult.status === "fulfilled"
      ? [...(costCentersResult.value as CostCenterActionRecord[])].sort(
          compareCostCenters,
        )
      : [];
  const approvalRules =
    approvalRulesResult.status === "fulfilled"
      ? [...approvalRulesResult.value]
          .filter((rule) => rule.activeFlag)
          .sort((left, right) => left.priority - right.priority)
      : [];
  const coverageReport =
    coverageReportResult.status === "fulfilled"
      ? coverageReportResult.value
      : null;
  const users = usersResult.status === "fulfilled" ? usersResult.value : [];

  if (costCentersResult.status === "rejected") {
    errors.push(`成本中心目錄: ${toErrorMessage(costCentersResult.reason)}`);
  }
  if (approvalRulesResult.status === "rejected") {
    errors.push(`審批規則: ${toErrorMessage(approvalRulesResult.reason)}`);
  }
  if (coverageReportResult.status === "rejected") {
    errors.push(`報表歸因: ${toErrorMessage(coverageReportResult.reason)}`);
  }
  if (usersResult.status === "rejected") {
    errors.push(`租戶使用者: ${toErrorMessage(usersResult.reason)}`);
  }

  const quotaSummariesByCode: Partial<
    Record<string, TenantCostCenterQuotaSummary>
  > = {};

  if (costCenters.length > 0) {
    const quotaResults = await Promise.allSettled(
      costCenters.map(
        (costCenter) =>
          client.getCostCenterQuotaSummary(
            costCenter.code,
          ) as Promise<TenantCostCenterQuotaSummary>,
      ),
    );

    quotaResults.forEach((result, index) => {
      const code = costCenters[index]?.code;
      if (!code) {
        return;
      }

      if (result.status === "fulfilled") {
        quotaSummariesByCode[code] = result.value;
        return;
      }

      errors.push(`${code} 配額: ${toErrorMessage(result.reason)}`);
    });
  }

  const refreshMetadata = deriveRefreshMetadata(
    [
      coverageReport?.generatedAt,
      ...Object.values(quotaSummariesByCode).map(
        (summary) => summary?.refreshedAt,
      ),
    ],
    query.freshnessOverride,
  );

  return {
    costCenters,
    quotaSummariesByCode,
    approvalRules,
    coverageReport,
    users,
    usersById: new Map(users.map((user) => [user.userId, user])),
    refreshMetadata,
    errors,
  };
}

function getApprovalLabel(
  code: string,
  approvalRules: TenantApprovalRuleRecord[],
) {
  const relevantRules = approvalRules.filter((rule) =>
    ruleTargetsCostCenter(rule, code),
  );

  if (relevantRules.length === 0) {
    return "未直接綁定；沿用租戶規則";
  }

  const primaryRule = relevantRules[0];
  if (!primaryRule) {
    return "未直接綁定；沿用租戶規則";
  }

  if (primaryRule.action === "allow") {
    return "免審";
  }
  if (primaryRule.action === "warn") {
    return "配額警示";
  }
  if (primaryRule.action === "block") {
    return "超額阻擋";
  }
  if (primaryRule.action === "flag_manual_review") {
    return "人工審核";
  }

  return primaryRule.approvers.some(
    (approver) => approver.kind === "cost_center_owner",
  )
    ? "owner-based approval"
    : "需審批";
}

function getUsagePercent(summary?: TenantCostCenterQuotaSummary) {
  if (!summary) {
    return null;
  }
  if (summary.usage.remainingPercent === null) {
    return null;
  }
  return Math.max(0, Math.min(140, 100 - summary.usage.remainingPercent));
}

function isOverQuota(summary?: TenantCostCenterQuotaSummary) {
  if (!summary) {
    return false;
  }

  return (
    (summary.usage.bookingCountRemaining ?? 0) < 0 ||
    (summary.usage.amountMinorRemaining ?? 0) < 0 ||
    (summary.usage.remainingPercent ?? 100) < 0
  );
}

function buildPageActions(
  emptyReason: EmptyReason | null,
): ResourceActionDescriptor[] {
  if (emptyReason === "permission_denied") {
    return [
      {
        action: "create",
        enabled: false,
        disabledReasonCode: "permission_denied",
        riskLevel: "medium",
      },
      {
        action: "refresh",
        enabled: true,
        riskLevel: "low",
      },
    ];
  }

  if (emptyReason === "not_provisioned") {
    return [
      {
        action: "create",
        enabled: false,
        disabledReasonCode: "requires_provisioning",
        riskLevel: "medium",
      },
      {
        action: "refresh",
        enabled: true,
        riskLevel: "low",
      },
    ];
  }

  if (emptyReason === "external_unavailable") {
    return [
      {
        action: "create",
        enabled: false,
        disabledReasonCode: "upstream_unavailable",
        riskLevel: "medium",
      },
      {
        action: "refresh",
        enabled: true,
        riskLevel: "low",
      },
    ];
  }

  return [
    {
      action: "create",
      enabled: true,
      riskLevel: "medium",
    },
    {
      action: "refresh",
      enabled: true,
      riskLevel: "low",
    },
  ];
}

function buildRowActions(
  costCenter: CostCenterActionRecord,
  usersById: Map<string, TenantUserRoleRecord>,
): ResourceActionDescriptor[] {
  if (Array.isArray(costCenter.availableActions)) {
    return costCenter.availableActions;
  }

  const ownerLinked = costCenter.ownerUserId
    ? usersById.has(costCenter.ownerUserId)
    : false;

  if (!costCenter.activeFlag) {
    return [
      {
        action: "update",
        enabled: false,
        disabledReasonCode: "already_disabled",
        riskLevel: "medium",
      },
      {
        action: "reactivate",
        enabled: true,
        riskLevel: "medium",
      },
    ];
  }

  const updateAction: ResourceActionDescriptor =
    ownerLinked || !costCenter.ownerUserId
      ? {
          action: "update",
          enabled: true,
          riskLevel: "medium",
        }
      : {
          action: "update",
          enabled: false,
          disabledReasonCode: "owner_unlinked",
          riskLevel: "medium",
        };

  return [
    updateAction,
    {
      action: "disable",
      enabled: true,
      requiresReason: true,
      riskLevel: "high",
    },
  ];
}

function buildCostCenterRows(
  costCenters: CostCenterActionRecord[],
  quotaSummariesByCode: Partial<Record<string, TenantCostCenterQuotaSummary>>,
  approvalRules: TenantApprovalRuleRecord[],
  coverageReport: TenantCostCenterCoverageReport | null,
  usersById: Map<string, TenantUserRoleRecord>,
): CostCenterRow[] {
  return costCenters.map((costCenter) => {
    const quotaSummary = quotaSummariesByCode[costCenter.code];
    const usageCount =
      (quotaSummary?.usage.confirmedBookingCount ?? 0) +
      (quotaSummary?.usage.pendingReservedBookingCount ?? 0);
    const ownerRecord = costCenter.ownerUserId
      ? (usersById.get(costCenter.ownerUserId) ?? null)
      : null;
    const unresolvedCoverage =
      coverageReport?.unresolvedSamples.find(
        (sample) => sample.suggestion === costCenter.code,
      ) ?? null;
    const remainingLabel =
      quotaSummary?.usage.bookingCountRemaining === null
        ? "無上限"
        : `${numberFormatter.format(quotaSummary?.usage.bookingCountRemaining ?? 0)} 趟剩餘`;
    const approvalLabel = getApprovalLabel(costCenter.code, approvalRules);
    const quotaDetail = !quotaSummary
      ? "Quota service snapshot unavailable"
      : quotaSummary.limit.amountMinorLimit === null
        ? "No hard amount ceiling"
        : `Budget ${numberFormatter.format(quotaSummary.limit.amountMinorLimit)} minor`;

    return {
      code: costCenter.code,
      name: costCenter.name,
      description: costCenter.description,
      ownerName: costCenter.ownerName,
      ownerLabel: ownerRecord
        ? `${ownerRecord.displayName} · ${ownerRecord.roleCode}`
        : (costCenter.ownerName ?? "未設定 owner"),
      ownerUserId: costCenter.ownerUserId,
      activeFlag: costCenter.activeFlag,
      quotaLabel:
        quotaSummary?.limit.bookingCountLimit === null
          ? "∞"
          : formatRideCount(quotaSummary?.limit.bookingCountLimit),
      quotaDetail,
      usageLabel: formatRideCount(usageCount),
      remainingLabel,
      approvalLabel,
      approvalDetail:
        approvalLabel === "未直接綁定；沿用租戶規則"
          ? "需去 `/rules` 看 tenant-level precedence"
          : "可從 `/rules` 驗證條件與 approver",
      reportLabel: unresolvedCoverage
        ? `仍有 ${numberFormatter.format(unresolvedCoverage.occurrences)} 筆 legacy 值待歸因`
        : "已納入月報與稽核彙整",
      reportDetail: unresolvedCoverage
        ? `raw value: ${unresolvedCoverage.rawCostCenter}`
        : "月報與 audit attribution 已可用",
      overQuota: isOverQuota(quotaSummary),
      usagePercent: getUsagePercent(quotaSummary),
      disabledReason: costCenter.disabledReason,
      actions: buildRowActions(costCenter, usersById),
    };
  });
}

function getDataFreshnessTone(
  freshness: UiRefreshMetadata["dataFreshness"],
): Exclude<CanvasTone, "neutral"> {
  switch (freshness) {
    case "fresh":
      return "success";
    case "stale":
    case "degraded":
      return "warn";
    case "unknown":
    default:
      return "info";
  }
}

function getFreshnessLabel(freshness: UiRefreshMetadata["dataFreshness"]) {
  switch (freshness) {
    case "fresh":
      return "fresh";
    case "stale":
      return "stale";
    case "degraded":
      return "degraded";
    case "unknown":
    default:
      return "unknown";
  }
}

function getEmptyStateTone(reason: SupportedEmptyReason): CanvasTone {
  switch (reason) {
    case "fetch_failed":
    case "external_unavailable":
      return "warn";
    case "permission_denied":
      return "danger";
    case "not_provisioned":
      return "info";
    case "filtered_empty":
      return "neutral";
    case "no_data":
    default:
      return "accent";
  }
}

function getViewPillTone(active: boolean): CanvasTone {
  return active ? "accent" : "neutral";
}

function renderDescriptorButton(
  descriptor: ResourceActionDescriptor,
  key: string,
  variant: "primary" | "secondary" = "secondary",
) {
  const label = ACTION_LABELS[descriptor.action] ?? descriptor.action;
  const tooltip = descriptor.enabled
    ? descriptor.requiresReason
      ? "此動作需在確認流程填寫原因。"
      : undefined
    : descriptor.disabledReasonCode
      ? (DISABLED_REASON_LABELS[descriptor.disabledReasonCode] ??
        descriptor.disabledReasonCode)
      : "目前不可用";

  return (
    <span key={key} title={tooltip}>
      <CanvasBtn
        theme={th}
        size="xs"
        variant={variant}
        danger={descriptor.riskLevel === "high"}
        disabled={!descriptor.enabled}
      >
        {label}
      </CanvasBtn>
    </span>
  );
}

function resolveCrossAppHref(link: CrossAppResourceLink) {
  const baseUrl =
    link.targetApp === "platform-admin"
      ? PLATFORM_ADMIN_URL
      : link.targetApp === "ops-console"
        ? OPS_CONSOLE_URL
        : "";

  return baseUrl ? `${baseUrl}${link.route}` : link.route;
}

function buildCrossAppLinks(): CrossAppResourceLink[] {
  return [
    {
      targetApp: "platform-admin",
      route: `/tenant-governance?tenantId=${encodeURIComponent(DEMO_TENANT_ID)}`,
      resourceType: "tenant_governance",
      resourceId: DEMO_TENANT_ID,
      openMode: "new_tab",
      label: "在 platform-admin 檢視 tenant governance",
    },
    {
      targetApp: "ops-console",
      route: `/audit?tenantId=${encodeURIComponent(DEMO_TENANT_ID)}`,
      resourceType: "audit",
      resourceId: DEMO_TENANT_ID,
      openMode: "new_tab",
      label: "在 ops-console 追查跨 actor 稽核",
    },
  ];
}

function CrossAppAnchor({ link }: { link: CrossAppResourceLink }) {
  return (
    <a
      href={resolveCrossAppHref(link)}
      target={link.openMode === "new_tab" ? "_blank" : undefined}
      rel={link.openMode === "new_tab" ? "noreferrer" : undefined}
      style={inlineLinkStyle}
    >
      {link.label}
    </a>
  );
}

function getBaseQueryParams(query: CostCenterQuery) {
  return {
    view: query.view === "all" ? "" : query.view,
    q: query.search,
    owner: query.ownerUserId,
    freshness:
      query.freshnessOverride === "auto" ? "" : query.freshnessOverride,
  };
}

function buildCostCenterHref(
  query: CostCenterQuery,
  patch: Partial<
    Record<"view" | "q" | "owner" | "freshness" | "emptyReason", string>
  >,
) {
  const params = new URLSearchParams();
  const next = {
    ...getBaseQueryParams(query),
    emptyReason: "",
    ...patch,
  };

  Object.entries(next).forEach(([key, value]) => {
    if (value) {
      params.set(key, value);
    }
  });

  const queryString = params.toString();
  return `/cost-centers${queryString ? `?${queryString}` : ""}`;
}

function EmptyStateCard({
  reason,
  actions,
}: {
  reason: SupportedEmptyReason;
  actions: ResourceActionDescriptor[];
}) {
  const reasonTitle: Record<SupportedEmptyReason, string> = {
    no_data: "尚未建立任何成本中心",
    not_provisioned: "成本中心模組尚未開通",
    fetch_failed: "成本中心資料載入失敗",
    permission_denied: "你沒有讀取此頁的權限",
    external_unavailable: "配額或規則服務暫時不可用",
    filtered_empty: "目前篩選條件沒有符合項目",
  };

  const reasonBody: Record<SupportedEmptyReason, string> = {
    no_data:
      "Brand-new tenant 可以從這裡建立第一個成本中心，之後再銜接配額與審批規則。",
    not_provisioned:
      "依 Q-TEN11，這個狀態必須和真正的空資料分開。請先完成 tenant governance 啟用。",
    fetch_failed:
      "後端沒有提供可用快照，請手動 refresh。若持續失敗，改走 audit / integration escalation。",
    permission_denied:
      "此畫面依 availableActions 應維持唯讀或完全不可見。現在先忠實呈現拒絕狀態。",
    external_unavailable:
      "Quota summary 或 approval linkage 依賴未返回，頁面不能用假資料補洞。",
    filtered_empty:
      "試著切換成全部或啟用中的成本中心，或清除搜尋 / owner 篩選。",
  };

  return (
    <CanvasCard theme={th}>
      <div style={emptyStateStyle}>
        <div style={filterRowStyle}>
          <CanvasPill theme={th} tone={getEmptyStateTone(reason)}>
            {EMPTY_REASON_LABELS[reason]}
          </CanvasPill>
          <span style={tableMutedTextStyle}>Q-X15 distinct EmptyReason</span>
        </div>
        <div style={tableCellStackStyle}>
          <div style={tablePrimaryTextStyle}>{reasonTitle[reason]}</div>
          <div style={tableMutedTextStyle}>{reasonBody[reason]}</div>
        </div>
        <div style={actionRowStyle}>
          {actions.map((descriptor, index) =>
            renderDescriptorButton(
              descriptor,
              `${reason}-${descriptor.action}-${index}`,
              index === 0 ? "primary" : "secondary",
            ),
          )}
        </div>
      </div>
    </CanvasCard>
  );
}

function resolveQuery(
  searchParams: Record<string, SearchParamValue>,
): CostCenterQuery {
  const emptyReasonParam = getFirstParamValue(searchParams.emptyReason);
  const viewParam = getFirstParamValue(searchParams.view);
  const freshnessParam = getFirstParamValue(searchParams.freshness);
  const search = getFirstParamValue(searchParams.q).trim();
  const ownerUserId = getFirstParamValue(searchParams.owner).trim();

  const emptyReason =
    emptyReasonParam &&
    [
      "no_data",
      "not_provisioned",
      "fetch_failed",
      "permission_denied",
      "external_unavailable",
      "filtered_empty",
    ].includes(emptyReasonParam)
      ? (emptyReasonParam as SupportedEmptyReason)
      : null;

  const view: ViewFilter =
    viewParam === "active" ||
    viewParam === "disabled" ||
    viewParam === "over_quota"
      ? viewParam
      : "all";

  const freshnessOverride: FreshnessOverride =
    freshnessParam === "fresh" ||
    freshnessParam === "stale" ||
    freshnessParam === "degraded" ||
    freshnessParam === "unknown"
      ? freshnessParam
      : "auto";

  return {
    emptyReason,
    view,
    freshnessOverride,
    search,
    ownerUserId,
  };
}

export default async function CostCentersPage({
  searchParams,
}: CostCentersPageProps) {
  const query = resolveQuery((await searchParams) ?? {});
  const {
    costCenters,
    quotaSummariesByCode,
    approvalRules,
    coverageReport,
    users,
    usersById,
    refreshMetadata,
    errors,
  } = await loadCostCentersData(query);

  const allRows = buildCostCenterRows(
    costCenters,
    quotaSummariesByCode,
    approvalRules,
    coverageReport,
    usersById,
  );

  const filteredRows = allRows.filter((row) => {
    if (query.view === "active") {
      return row.activeFlag;
    }
    if (query.view === "disabled") {
      return !row.activeFlag;
    }
    if (query.view === "over_quota") {
      return row.overQuota;
    }
    return true;
  });

  const resolvedEmptyReason: SupportedEmptyReason | null =
    query.emptyReason ??
    (errors.length > 0 && allRows.length === 0
      ? "fetch_failed"
      : filteredRows.length === 0 && allRows.length > 0
        ? "filtered_empty"
        : filteredRows.length === 0
          ? "no_data"
          : null);

  const pageActions = buildPageActions(resolvedEmptyReason);
  const crossAppLinks = buildCrossAppLinks();
  const activeCount = allRows.filter((row) => row.activeFlag).length;
  const disabledCount = allRows.length - activeCount;
  const overQuotaCount = allRows.filter((row) => row.overQuota).length;
  const directRuleCount = allRows.filter(
    (row) => row.approvalLabel !== "未直接綁定；沿用租戶規則",
  ).length;
  const unresolvedCoverageCount = coverageReport?.unresolvedCount ?? 0;
  const owners = users
    .slice()
    .sort((left, right) => left.displayName.localeCompare(right.displayName));

  const columns: CanvasTableColumn<CostCenterRow>[] = [
    {
      h: "CODE",
      w: 136,
      mono: true,
      r: (row) => (
        <span style={{ color: row.activeFlag ? th.accent : th.textMuted }}>
          {row.code}
        </span>
      ),
    },
    {
      h: "NAME",
      w: 228,
      r: (row) => (
        <div style={tableCellStackStyle}>
          <div style={filterRowStyle}>
            <span style={tablePrimaryTextStyle}>{row.name}</span>
            {!row.activeFlag ? (
              <CanvasPill theme={th} tone="neutral">
                disabled
              </CanvasPill>
            ) : null}
            {row.overQuota ? (
              <CanvasPill theme={th} tone="warn">
                over quota
              </CanvasPill>
            ) : null}
          </div>
          <span style={tableMutedTextStyle}>
            {row.description ?? "未填寫補充說明"}
          </span>
          {!row.activeFlag && row.disabledReason ? (
            <span style={tableMutedTextStyle}>
              停用原因: {row.disabledReason}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: "OWNER",
      w: 176,
      r: (row) => (
        <div style={tableCellStackStyle}>
          <span style={tablePrimaryTextStyle}>{row.ownerName ?? "未指派"}</span>
          <span style={tableMutedTextStyle}>{row.ownerLabel}</span>
        </div>
      ),
    },
    {
      h: "月配額",
      w: 156,
      mono: true,
      align: "right",
      r: (row) => (
        <div style={tableCellStackStyle}>
          <span style={tablePrimaryTextStyle}>{row.quotaLabel}</span>
          <span style={tableMutedTextStyle}>{row.quotaDetail}</span>
        </div>
      ),
    },
    {
      h: "本月使用",
      w: 228,
      r: (row) => (
        <div style={tableCellStackStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                minWidth: 72,
                fontFamily: th.monoFamily,
                fontSize: 11.5,
                color: row.overQuota ? th.danger : th.text,
              }}
            >
              {row.usageLabel}
            </span>
            <div style={quotaMeterTrackStyle}>
              <div
                style={{
                  width: `${Math.max(6, Math.min(row.usagePercent ?? 0, 100))}%`,
                  height: "100%",
                  background: row.overQuota
                    ? th.danger
                    : (row.usagePercent ?? 0) >= 85
                      ? th.warn
                      : th.success,
                }}
              />
            </div>
          </div>
          <span style={tableMutedTextStyle}>{row.remainingLabel}</span>
        </div>
      ),
    },
    {
      h: "審批",
      w: 188,
      r: (row) => (
        <div style={tableCellStackStyle}>
          <span style={tablePrimaryTextStyle}>{row.approvalLabel}</span>
          <span style={tableMutedTextStyle}>{row.approvalDetail}</span>
        </div>
      ),
    },
    {
      h: "ACTIONS",
      w: 216,
      r: (row) => (
        <div style={actionRowStyle}>
          {row.actions.map((descriptor, index) =>
            renderDescriptorButton(
              descriptor,
              `${row.code}-${descriptor.action}-${index}`,
            ),
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="成本中心 · Cost Centers"
        subtitle="部門 · 月配額 · 預設審批規則 (Q-TEN11)"
        actions={
          <>
            {pageActions.map((descriptor, index) =>
              renderDescriptorButton(
                descriptor,
                `page-${descriptor.action}-${index}`,
                descriptor.action === "create" ? "primary" : "secondary",
              ),
            )}
          </>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone={getDataFreshnessTone(refreshMetadata.dataFreshness)}
          icon="refresh"
          title={`refresh tier ${REFRESH_TIER} · ${getFreshnessLabel(
            refreshMetadata.dataFreshness,
          )}`}
          body={`目前畫面顯示 ${refreshMetadata.generatedAt} 產生的 snapshot；${REFRESH_STALE_AFTER_MS / 1000}s poll cadence 依 Q-X02 套用在 /cost-centers。`}
        />

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分資料來源未完整返回"
            body={errors.join(" · ")}
          />
        ) : null}

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="Cost centers"
            value={numberFormatter.format(allRows.length)}
            sub="Directory rows"
            delta={`${numberFormatter.format(activeCount)} active`}
            deltaTone="neutral"
          />
          <CanvasKPI
            theme={th}
            label="Disabled"
            value={numberFormatter.format(disabledCount)}
            sub="Visible through filter"
            delta="Separate treatment"
            deltaTone={disabledCount > 0 ? "down" : "neutral"}
          />
          <CanvasKPI
            theme={th}
            label="Over quota"
            value={numberFormatter.format(overQuotaCount)}
            sub="Highlighted in table"
            delta={overQuotaCount > 0 ? "Needs review" : "Within limit"}
            deltaTone={overQuotaCount > 0 ? "down" : "up"}
          />
          <CanvasKPI
            theme={th}
            label="Approval linked"
            value={numberFormatter.format(directRuleCount)}
            sub="Direct / owner-based rules"
            delta={`${numberFormatter.format(unresolvedCoverageCount)} unresolved`}
            deltaTone={unresolvedCoverageCount > 0 ? "down" : "neutral"}
          />
        </div>

        <div style={summaryGridStyle}>
          <CanvasCard theme={th}>
            <div style={cardStackStyle}>
              <p style={summaryHeadlineStyle}>
                維護成本中心目錄，同時看清楚 quota posture、approval linkage 與
                reporting attribution。
              </p>
              <p style={summaryBodyStyle}>
                Q-TEN11 的決策點不是單純增刪資料，而是判斷該新建一個成本中心，
                還是擴充既有配額；若超額或沿用 tenant-level 規則，應立即檢查
                `/rules` 與 `/reports` 的下游影響。
              </p>
              <div style={summaryStripStyle}>
                <div style={summaryMetricStyle}>
                  <span style={summaryMetricLabelStyle}>Quota posture</span>
                  <span style={summaryMetricValueStyle}>
                    {overQuotaCount > 0
                      ? `${numberFormatter.format(overQuotaCount)} flagged`
                      : "Within range"}
                  </span>
                </div>
                <div style={summaryMetricStyle}>
                  <span style={summaryMetricLabelStyle}>Rule coverage</span>
                  <span style={summaryMetricValueStyle}>
                    {numberFormatter.format(directRuleCount)} linked
                  </span>
                </div>
                <div style={summaryMetricStyle}>
                  <span style={summaryMetricLabelStyle}>Reporting gaps</span>
                  <span style={summaryMetricValueStyle}>
                    {unresolvedCoverageCount > 0
                      ? `${numberFormatter.format(unresolvedCoverageCount)} unresolved`
                      : "Coverage clean"}
                  </span>
                </div>
              </div>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="Exit Links"
            subtitle="Cross-slice follow-up"
          >
            <div style={cardStackStyle}>
              <div style={tableCellStackStyle}>
                <span style={tablePrimaryTextStyle}>Approval linkage</span>
                <span style={tableMutedTextStyle}>
                  檢查 cost center 是否命中 rule precedence、owner-based
                  approver、或 quota-aware blocking。
                </span>
              </div>
              <div style={linkRowStyle}>
                <Link href="/rules" style={inlineLinkStyle}>
                  前往 `/rules`
                </Link>
                {crossAppLinks[0] ? (
                  <CrossAppAnchor link={crossAppLinks[0]} />
                ) : null}
              </div>
              <div style={tableCellStackStyle}>
                <span style={tablePrimaryTextStyle}>Reporting attribution</span>
                <span style={tableMutedTextStyle}>
                  驗證 legacy cost center 值的報表歸因與 audit trail 追查。
                </span>
              </div>
              <div style={linkRowStyle}>
                <Link href="/reports" style={inlineLinkStyle}>
                  前往 `/reports`
                </Link>
                {crossAppLinks[1] ? (
                  <CrossAppAnchor link={crossAppLinks[1]} />
                ) : null}
              </div>
            </div>
          </CanvasCard>
        </div>

        <CanvasCard theme={th}>
          <div style={filterPanelStyle}>
            <div style={filterRowStyle}>
              {VIEW_FILTERS.map((filter) => (
                <Link
                  key={filter.value}
                  href={buildCostCenterHref(query, { view: filter.value })}
                  style={{ textDecoration: "none" }}
                >
                  <CanvasPill
                    theme={th}
                    tone={getViewPillTone(query.view === filter.value)}
                  >
                    {filter.label}
                  </CanvasPill>
                </Link>
              ))}
              <span style={helperTextStyle}>
                Disabled rows 維持可見；6 EmptyReason 可用 `?emptyReason=`
                切換驗證。
              </span>
            </div>

            <form action="/cost-centers" method="get" style={filterFormStyle}>
              <label style={fieldLabelStyle}>
                搜尋 code / name
                <input
                  type="search"
                  name="q"
                  defaultValue={query.search}
                  placeholder="例如 CC-FIN-04 / 財務處"
                  style={fieldStyle}
                />
              </label>

              <label style={fieldLabelStyle}>
                Owner
                <select
                  name="owner"
                  defaultValue={query.ownerUserId}
                  style={fieldStyle}
                >
                  <option value="">全部 owner</option>
                  {owners.map((user) => (
                    <option key={user.userId} value={user.userId}>
                      {user.displayName}
                    </option>
                  ))}
                </select>
              </label>

              <input
                type="hidden"
                name="view"
                value={query.view === "all" ? "" : query.view}
              />
              {query.freshnessOverride !== "auto" ? (
                <input
                  type="hidden"
                  name="freshness"
                  value={query.freshnessOverride}
                />
              ) : null}

              <div style={{ display: "flex", gap: 8, alignSelf: "end" }}>
                <button type="submit" style={fieldStyle}>
                  套用篩選
                </button>
              </div>

              <Link
                href="/cost-centers"
                style={{
                  ...inlineLinkStyle,
                  alignSelf: "end",
                  paddingBottom: 10,
                }}
              >
                清除條件
              </Link>
            </form>
          </div>
        </CanvasCard>

        {resolvedEmptyReason ? (
          <EmptyStateCard reason={resolvedEmptyReason} actions={pageActions} />
        ) : (
          <CanvasCard theme={th} padding={0}>
            <CanvasTable<CostCenterRow>
              theme={th}
              columns={columns}
              rows={filteredRows}
            />
          </CanvasCard>
        )}

        <div style={panelGridStyle}>
          <CanvasCard
            theme={th}
            title="審批連動"
            subtitle="approval linkage per `/rules`"
          >
            <ul style={listStyle}>
              {filteredRows.slice(0, 4).map((row) => (
                <li key={`rule-${row.code}`}>
                  <strong>{row.code}</strong> · {row.approvalLabel}
                </li>
              ))}
              {filteredRows.length === 0 ? (
                <li>目前沒有可列出的成本中心。</li>
              ) : null}
            </ul>
            <div style={linkRowStyle}>
              <Link href="/rules" style={inlineLinkStyle}>
                在 tenant console 檢查 `/rules`
              </Link>
            </div>
          </CanvasCard>

          <CanvasCard
            theme={th}
            title="報表歸因"
            subtitle="reporting attribution and legacy coverage"
          >
            <div style={tableCellStackStyle}>
              <div style={filterRowStyle}>
                <CanvasPill
                  theme={th}
                  tone={unresolvedCoverageCount > 0 ? "warn" : "success"}
                >
                  {unresolvedCoverageCount > 0
                    ? `${numberFormatter.format(unresolvedCoverageCount)} unresolved`
                    : "Coverage clean"}
                </CanvasPill>
                <span style={tableMutedTextStyle}>
                  disabled hits{" "}
                  {numberFormatter.format(coverageReport?.disabledHits ?? 0)}
                </span>
              </div>
              <ul style={listStyle}>
                {(coverageReport?.unresolvedSamples ?? [])
                  .slice(0, 3)
                  .map((sample) => (
                    <li key={sample.rawCostCenter}>
                      <strong>{sample.rawCostCenter}</strong> ·{" "}
                      {numberFormatter.format(sample.occurrences)} bookings
                    </li>
                  ))}
                {(coverageReport?.unresolvedSamples ?? []).length === 0 ? (
                  <li>所有 legacy cost center 值都已被歸因到可報表化代碼。</li>
                ) : null}
              </ul>
            </div>
            <div style={linkRowStyle}>
              <Link href="/reports" style={inlineLinkStyle}>
                在 tenant console 檢查 `/reports`
              </Link>
            </div>
          </CanvasCard>
        </div>

        <CanvasCard
          theme={th}
          title="State Coverage"
          subtitle="Distinct EmptyReason treatments for reviewer verification"
        >
          <div style={filterRowStyle}>
            {(
              [
                "no_data",
                "not_provisioned",
                "fetch_failed",
                "permission_denied",
                "external_unavailable",
                "filtered_empty",
              ] as const
            ).map((reason) => (
              <Link
                key={reason}
                href={buildCostCenterHref(query, { emptyReason: reason })}
                style={{ textDecoration: "none" }}
              >
                <CanvasPill
                  theme={th}
                  tone={
                    query.emptyReason === reason
                      ? "accent"
                      : getEmptyStateTone(reason)
                  }
                >
                  {EMPTY_REASON_LABELS[reason]}
                </CanvasPill>
              </Link>
            ))}
          </div>
        </CanvasCard>
      </div>
    </div>
  );
}
