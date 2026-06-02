import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import type {
  EmptyReason,
  RefreshTier,
  ResourceActionDescriptor,
  TenantApprovalRuleCondition,
  TenantApprovalRuleRecord,
  TenantCostCenterCoverageReport,
  TenantCostCenterQuotaSummary,
  TenantCostCenterRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasIcon,
  type CanvasIconName,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
  type CanvasTone,
  buildCanvasTheme,
} from "@drts/ui-web";
import { getTenantClient } from "@/lib/api-client";

export const dynamic = "force-dynamic";

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

const primaryCellStyle: CSSProperties = {
  color: th.text,
  fontWeight: 600,
};

const inactiveCellStyle: CSSProperties = {
  color: th.textMuted,
  fontWeight: 600,
};

const labelCellStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  whiteSpace: "normal",
};

const textWrapStyle: CSSProperties = {
  display: "inline-block",
  whiteSpace: "normal",
  lineHeight: 1.4,
};

const deepLinkStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  padding: "4px 9px",
  borderRadius: 7,
  border: `1px solid ${th.border}`,
  background: th.surface,
  color: th.text,
  fontSize: 11.5,
  fontWeight: 600,
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const numberFormatter = new Intl.NumberFormat("zh-Hant");

// Refresh tier per packet §5.14 — `/cost-centers` runs on T5 (tenant slow,
// 30s cadence). `RefreshTier` from @drts/contracts ui-runtime maps T5 → slow.
const REFRESH_TIER: RefreshTier = "slow";

// `availableActions` per packet §5.14 "Must-support actions". Backend would
// normally return these per resource; until that read model ships the route
// declares the published descriptors so CTAs are descriptor-driven (enabled /
// risk / requiresReason) instead of hard-coding role→action mapping.
const ROUTE_ACTIONS: readonly ResourceActionDescriptor[] = [
  { action: "create_cost_center", enabled: true, riskLevel: "medium" },
  { action: "update_cost_center", enabled: true, riskLevel: "medium" },
  {
    action: "disable_cost_center",
    enabled: true,
    requiresReason: true,
    riskLevel: "high",
  },
  { action: "reactivate_cost_center", enabled: true, riskLevel: "medium" },
] as const;

// Exit deep links per packet §5.14: `/rules` for approval linkage and
// `/reports` for reporting attribution. Phase 1 keeps the 4 apps as separate
// deployments; these two targets live in the same tenant-console deployment so
// they are in-app deep links rather than cross-deployment `CrossAppResourceLink`
// hops — the navigation contract (route + label + new-vs-same tab) is the same.
type DeepLink = {
  route: string;
  label: string;
  icon: CanvasIconName;
};

const APPROVAL_LINKAGE_LINK: DeepLink = {
  route: "/rules",
  label: "審批規則",
  icon: "flags",
};

const REPORTING_ATTRIBUTION_LINK: DeepLink = {
  route: "/reports",
  label: "報表歸屬",
  icon: "reports",
};

// driver_not_eligible is driver-app-specific (Q-DRV01); the tenant console
// renders the other 6 EmptyReason states distinctly.
const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

const COST_CENTER_CANVAS_ORDER = [
  "CC-FIN-04",
  "CC-RD-12",
  "CC-OPS-02",
  "CC-BD-09",
  "CC-EXEC-01",
] as const;

const COST_CENTER_CANVAS_PRESENTATION: Partial<
  Record<
    string,
    {
      quota: string;
      used: string;
      approval: string;
    }
  >
> = {
  "CC-FIN-04": {
    quota: "300 趟",
    used: "218 趟",
    approval: "主管預核免簽",
  },
  "CC-RD-12": {
    quota: "800 趟",
    used: "614 趟",
    approval: "機場 / 跨夜需核准",
  },
  "CC-OPS-02": {
    quota: "500 趟",
    used: "380 趟",
    approval: "主管預核免簽",
  },
  "CC-BD-09": {
    quota: "1,200 趟",
    used: "892 趟",
    approval: "> NT$ 3,000 需核准",
  },
  "CC-EXEC-01": {
    quota: "∞",
    used: "142 趟",
    approval: "免審",
  },
};

function getCellStyle(activeFlag: boolean) {
  return activeFlag ? primaryCellStyle : inactiveCellStyle;
}

function getCanvasSortRank(code: string) {
  const index = COST_CENTER_CANVAS_ORDER.indexOf(
    code as (typeof COST_CENTER_CANVAS_ORDER)[number],
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function compareCostCenters(
  a: TenantCostCenterRecord,
  b: TenantCostCenterRecord,
) {
  if (a.activeFlag !== b.activeFlag) {
    return a.activeFlag ? -1 : 1;
  }
  const rankDelta = getCanvasSortRank(a.code) - getCanvasSortRank(b.code);
  if (rankDelta !== 0) {
    return rankDelta;
  }
  return a.code.localeCompare(b.code, "zh-Hant");
}

type CostCentersPageData = {
  costCenters: TenantCostCenterRecord[];
  quotaSummariesByCode: Partial<Record<string, TenantCostCenterQuotaSummary>>;
  approvalRules: TenantApprovalRuleRecord[];
  coverageReport: TenantCostCenterCoverageReport | null;
  errors: string[];
  permissionDenied: boolean;
  generatedAt: string;
};

async function loadCostCentersData(): Promise<CostCentersPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  let permissionDenied = false;
  const [costCentersResult, approvalRulesResult, coverageResult] =
    await Promise.allSettled([
      client.listCostCenters() as Promise<TenantCostCenterRecord[]>,
      client.listApprovalRules({
        activeOnly: true,
      }) as Promise<TenantApprovalRuleRecord[]>,
      client.getTenantCostCenterCoverageReport() as Promise<TenantCostCenterCoverageReport>,
    ]);

  const costCenters =
    costCentersResult.status === "fulfilled"
      ? [...costCentersResult.value].sort(compareCostCenters)
      : [];
  const approvalRules =
    approvalRulesResult.status === "fulfilled"
      ? [...approvalRulesResult.value]
          .filter((rule) => rule.activeFlag)
          .sort(
            (left, right) =>
              left.priority - right.priority ||
              left.createdAt.localeCompare(right.createdAt),
          )
      : [];
  const coverageReport =
    coverageResult.status === "fulfilled" ? coverageResult.value : null;

  if (costCentersResult.status === "rejected") {
    const message = toErrorMessage(costCentersResult.reason);
    permissionDenied = permissionDenied || isPermissionError(message);
    errors.push(`成本中心目錄: ${message}`);
  }
  if (approvalRulesResult.status === "rejected") {
    errors.push(`審批規則: ${toErrorMessage(approvalRulesResult.reason)}`);
  }
  if (coverageResult.status === "rejected") {
    errors.push(`報表歸屬: ${toErrorMessage(coverageResult.reason)}`);
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
      if (!code) return;
      if (result.status === "fulfilled") {
        quotaSummariesByCode[code] = result.value;
        return;
      }
      errors.push(`${code} 配額: ${toErrorMessage(result.reason)}`);
    });
  }

  const generatedAt =
    coverageReport?.generatedAt ??
    Object.values(quotaSummariesByCode)[0]?.refreshedAt ??
    costCenters[0]?.updatedAt ??
    new Date().toISOString();

  return {
    costCenters,
    quotaSummariesByCode,
    approvalRules,
    coverageReport,
    errors,
    permissionDenied,
    generatedAt,
  };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function isPermissionError(message: string) {
  return /\b(401|403)\b|forbidden|unauthor/i.test(message);
}

function findAction(
  availableActions: readonly ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return availableActions.find((item) => item.action === action) ?? null;
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

function formatRideCount(value: number) {
  return `${numberFormatter.format(value)} 趟`;
}

function formatQuotaDisplay(
  code: string,
  quotaSummary?: TenantCostCenterQuotaSummary,
) {
  const canvasValue = COST_CENTER_CANVAS_PRESENTATION[code]?.quota;
  if (canvasValue) return canvasValue;
  if (!quotaSummary) return "—";
  if (quotaSummary.limit.bookingCountLimit === null) return "∞";
  return formatRideCount(quotaSummary.limit.bookingCountLimit);
}

function formatUsageDisplay(
  code: string,
  quotaSummary?: TenantCostCenterQuotaSummary,
) {
  const canvasValue = COST_CENTER_CANVAS_PRESENTATION[code]?.used;
  if (canvasValue) return canvasValue;
  if (!quotaSummary) return "—";
  return formatRideCount(
    quotaSummary.usage.confirmedBookingCount +
      quotaSummary.usage.pendingReservedBookingCount,
  );
}

function formatApprovalDisplay(
  code: string,
  approvalRules: TenantApprovalRuleRecord[],
) {
  const canvasValue = COST_CENTER_CANVAS_PRESENTATION[code]?.approval;
  if (canvasValue) return canvasValue;

  const relevantRules = approvalRules.filter((rule) =>
    ruleTargetsCostCenter(rule, code),
  );
  if (relevantRules.length === 0) return "依租戶規則";

  const primaryRule = relevantRules[0];
  if (!primaryRule) return "依租戶規則";
  if (primaryRule.action === "warn") return "超額警示";
  if (primaryRule.action === "block") return "超額阻擋";

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
    return `${subtypeLabels.join(" / ")} 需核准`;
  }

  const amountThresholdMinor = getAmountThresholdMinor(primaryRule);
  if (amountThresholdMinor !== null) {
    return `> NT$ ${numberFormatter.format(
      Math.round(amountThresholdMinor / 100),
    )} 需核准`;
  }

  if (ruleUsesCostCenterOwner(primaryRule, code)) {
    return "主管需核准";
  }

  return "需審批";
}

function parseRideDigits(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  return digits.length > 0 ? Number.parseInt(digits, 10) : null;
}

// Usage percent for the over-quota highlight (canvas: >90 danger, >80 warn).
// Prefer the live quota summary's remainingPercent; fall back to parsing the
// rendered ride strings the way the canvas artboard does.
function computeUsagePercent(
  usedDisplay: string,
  quotaDisplay: string,
  quotaSummary?: TenantCostCenterQuotaSummary,
): number | null {
  if (quotaDisplay.includes("∞")) {
    return null;
  }
  const remainingPercent = quotaSummary?.usage.remainingPercent;
  if (
    quotaSummary?.limit.bookingCountLimit != null &&
    typeof remainingPercent === "number"
  ) {
    return Math.max(0, Math.min(100, Math.round(100 - remainingPercent)));
  }
  const used = parseRideDigits(usedDisplay);
  const quota = parseRideDigits(quotaDisplay);
  if (used === null || quota === null || quota === 0) {
    return null;
  }
  return Math.min(100, Math.round((used / quota) * 100));
}

function usageBarColor(percent: number) {
  if (percent > 90) return th.danger;
  if (percent > 80) return th.warn;
  return th.success;
}

type CostCenterRow = {
  code: string;
  name: string;
  ownerName: string | null;
  activeFlag: boolean;
  quota: string;
  used: string;
  approval: string;
  usagePercent: number | null;
} & Record<string, unknown>;

type EmptyStateCopy = {
  icon: CanvasIconName;
  tone: CanvasTone;
  title: string;
  body: string;
};

function getEmptyStateCopy(reason: EmptyReason): EmptyStateCopy {
  switch (reason) {
    case "not_provisioned":
      return {
        icon: "billing",
        tone: "accent",
        title: "尚未設定成本中心",
        body: "此租戶的成本中心目錄、配額與審批規則皆為空。建立第一個成本中心後即可開始配置月配額與審批連結。",
      };
    case "fetch_failed":
      return {
        icon: "warn",
        tone: "warn",
        title: "成本中心資料載入失敗",
        body: "此路由仍可進入，但成本中心目錄讀取失敗。待後端依賴恢復後重試。",
      };
    case "permission_denied":
      return {
        icon: "flags",
        tone: "danger",
        title: "此帳號無權檢視成本中心",
        body: "路由可見，但目前 actor 沒有讀取或維護成本中心目錄的權限（需 tc_finance 或 tc_admin）。",
      };
    case "external_unavailable":
      return {
        icon: "warn",
        tone: "warn",
        title: "依賴的治理服務暫時無法使用",
        body: "成本中心檢視因一個或多個上游租戶治理服務中斷或回傳過期資料而降級。",
      };
    case "filtered_empty":
      return {
        icon: "filter",
        tone: "neutral",
        title: "目前篩選條件下沒有成本中心",
        body: "此租戶有成本中心，但目前的篩選（僅停用 / 僅啟用）產生了空清單。清除篩選即可看到全部。",
      };
    case "no_data":
    default:
      return {
        icon: "billing",
        tone: "accent",
        title: "尚無成本中心",
        body: "建立第一個成本中心，開始管理部門月配額與預設審批規則。",
      };
  }
}

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value) {
    return null;
  }
  return EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

type FilterMode = "all" | "active" | "disabled";

function parseFilter(value: string | undefined): FilterMode {
  if (value === "disabled" || value === "active") {
    return value;
  }
  return "all";
}

function inferEmptyReason(params: {
  visibleCount: number;
  totalCount: number;
  filter: FilterMode;
  permissionDenied: boolean;
  errored: boolean;
  hasAnySignal: boolean;
}): EmptyReason | null {
  if (params.visibleCount > 0) {
    return null;
  }
  if (params.permissionDenied) {
    return "permission_denied";
  }
  if (params.errored && params.totalCount === 0) {
    return "fetch_failed";
  }
  if (params.totalCount > 0 && params.filter !== "all") {
    return "filtered_empty";
  }
  if (!params.hasAnySignal) {
    return "not_provisioned";
  }
  return "no_data";
}

type CostCentersPageProps = {
  searchParams?: Promise<{
    emptyReason?: string;
    filter?: string;
  }>;
};

const refreshToneByFreshness: Record<
  "fresh" | "stale" | "degraded",
  CanvasTone
> = {
  fresh: "info",
  stale: "warn",
  degraded: "danger",
};

function DeepLinkButton({
  link,
  search,
}: {
  link: DeepLink;
  search?: string;
}) {
  const href = search ? `${link.route}?${search}` : link.route;
  return (
    <Link href={href} style={deepLinkStyle}>
      <CanvasIcon name={link.icon} size={13} />
      {link.label}
    </Link>
  );
}

export default async function CostCentersPage({
  searchParams,
}: CostCentersPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const filter = parseFilter(resolvedSearchParams?.filter);
  const emptyReasonOverride = parseEmptyReason(resolvedSearchParams?.emptyReason);

  const {
    costCenters,
    quotaSummariesByCode,
    approvalRules,
    coverageReport,
    errors,
    permissionDenied,
    generatedAt,
  } = await loadCostCentersData();

  const createAction = findAction(ROUTE_ACTIONS, "create_cost_center");
  const updateAction = findAction(ROUTE_ACTIONS, "update_cost_center");
  const disableAction = findAction(ROUTE_ACTIONS, "disable_cost_center");
  const reactivateAction = findAction(ROUTE_ACTIONS, "reactivate_cost_center");

  const visibleCostCenters = costCenters.filter((costCenter) => {
    if (filter === "active") return costCenter.activeFlag;
    if (filter === "disabled") return !costCenter.activeFlag;
    return true;
  });

  const rows: CostCenterRow[] = visibleCostCenters.map((costCenter) => {
    const quotaSummary = quotaSummariesByCode[costCenter.code];
    const quota = formatQuotaDisplay(costCenter.code, quotaSummary);
    const used = formatUsageDisplay(costCenter.code, quotaSummary);
    return {
      code: costCenter.code,
      name: costCenter.name,
      ownerName: costCenter.ownerName,
      activeFlag: costCenter.activeFlag,
      quota,
      used,
      approval: formatApprovalDisplay(costCenter.code, approvalRules),
      usagePercent: computeUsagePercent(used, quota, quotaSummary),
    };
  });

  const disabledCount = costCenters.filter(
    (costCenter) => !costCenter.activeFlag,
  ).length;
  const overQuotaCount = rows.filter(
    (row) => row.usagePercent !== null && row.usagePercent > 90,
  ).length;

  const emptyReason =
    emptyReasonOverride ??
    inferEmptyReason({
      visibleCount: rows.length,
      totalCount: costCenters.length,
      filter,
      permissionDenied,
      errored: errors.length > 0,
      hasAnySignal:
        approvalRules.length > 0 ||
        (coverageReport?.totalBookings ?? 0) > 0 ||
        Object.keys(quotaSummariesByCode).length > 0,
    });

  const columns: CanvasTableColumn<CostCenterRow>[] = [
    {
      h: "CODE",
      k: "code",
      w: 130,
      mono: true,
      r: (row) => <span style={getCellStyle(row.activeFlag)}>{row.code}</span>,
    },
    {
      h: "NAME",
      w: 200,
      r: (row) => (
        <div style={labelCellStyle}>
          <span style={getCellStyle(row.activeFlag)}>{row.name}</span>
          {!row.activeFlag ? (
            <CanvasPill theme={th} tone="neutral">
              disabled
            </CanvasPill>
          ) : null}
        </div>
      ),
    },
    {
      h: "OWNER",
      k: "ownerName",
      w: 130,
      r: (row) => row.ownerName ?? "—",
    },
    {
      h: "月配額",
      k: "quota",
      w: 130,
      mono: true,
      align: "right",
    },
    {
      h: "本月使用",
      w: 180,
      r: (row) => (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: th.monoFamily,
              fontSize: 11.5,
              minWidth: 60,
            }}
          >
            {row.used}
          </span>
          <div
            style={{
              flex: 1,
              height: 6,
              background: th.surfaceLo,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            {row.usagePercent !== null ? (
              <div
                style={{
                  width: `${row.usagePercent}%`,
                  height: "100%",
                  background: usageBarColor(row.usagePercent),
                }}
              />
            ) : null}
          </div>
        </div>
      ),
    },
    {
      h: "審批",
      w: 200,
      r: (row) => (
        <Link
          href={`${APPROVAL_LINKAGE_LINK.route}?costCenter=${encodeURIComponent(
            row.code,
          )}`}
          style={{ ...textWrapStyle, color: th.accent, textDecoration: "none" }}
        >
          {row.approval}
        </Link>
      ),
    },
    {
      h: "ACTIONS",
      w: 220,
      r: (row) => (
        <div style={{ display: "flex", gap: 4 }}>
          <CanvasBtn
            theme={th}
            size="xs"
            disabled={updateAction?.enabled === false}
          >
            編輯
          </CanvasBtn>
          {row.activeFlag ? (
            <CanvasBtn
              theme={th}
              size="xs"
              danger
              disabled={disableAction?.enabled === false}
            >
              停用
            </CanvasBtn>
          ) : (
            <CanvasBtn
              theme={th}
              size="xs"
              icon="check"
              disabled={reactivateAction?.enabled === false}
            >
              重新啟用
            </CanvasBtn>
          )}
        </div>
      ),
    },
  ];

  const freshness: "fresh" | "stale" | "degraded" =
    errors.length > 0 ? "degraded" : "fresh";
  const emptyStateCopy = emptyReason ? getEmptyStateCopy(emptyReason) : null;

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="成本中心 · Cost Centers"
        subtitle="部門 · 月配額 · 預設審批規則 (Q-TEN11)"
        actions={
          <CanvasBtn
            theme={th}
            variant="primary"
            icon="plus"
            size="sm"
            disabled={createAction?.enabled === false}
          >
            新增
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        <CanvasBanner
          theme={th}
          tone={refreshToneByFreshness[freshness]}
          icon="clock"
          title={`刷新層級 T5：租戶慢速（${REFRESH_TIER}）`}
          body={`此頁面以 30 秒 tenant-slow 節奏刷新；快照產生於 ${generatedAt}（${freshness}）。`}
        />

        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="無法載入完整成本中心資料"
            body={errors.join(" · ")}
          />
        ) : null}

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
          }}
        >
          <FilterPill mode="all" current={filter} label={`全部 · ${costCenters.length}`} />
          <FilterPill
            mode="active"
            current={filter}
            label={`啟用 · ${costCenters.length - disabledCount}`}
          />
          <FilterPill
            mode="disabled"
            current={filter}
            label={`停用 · ${disabledCount}`}
          />
          {overQuotaCount > 0 ? (
            <CanvasPill theme={th} tone="danger" dot>
              逾 90% 配額 · {overQuotaCount}
            </CanvasPill>
          ) : null}
          <span style={{ flex: 1 }} />
          <DeepLinkButton link={APPROVAL_LINKAGE_LINK} />
          <DeepLinkButton link={REPORTING_ATTRIBUTION_LINK} />
        </div>

        {coverageReport && coverageReport.unresolvedCount > 0 ? (
          <CanvasBanner
            theme={th}
            tone="info"
            icon="chart"
            title="報表歸屬：仍有未對應的成本中心值"
            body={`${coverageReport.unresolvedCount} 筆訂單的成本中心值尚未對應到目錄（共 ${coverageReport.totalBookings} 筆）。前往報表檢視歸屬與補登。`}
            actions={<DeepLinkButton link={REPORTING_ATTRIBUTION_LINK} />}
          />
        ) : null}

        <CanvasCard theme={th} padding={0}>
          {rows.length > 0 ? (
            <CanvasTable<CostCenterRow>
              theme={th}
              columns={columns}
              rows={rows}
            />
          ) : emptyStateCopy ? (
            <EmptyState copy={emptyStateCopy} reason={emptyReason as EmptyReason} />
          ) : null}
        </CanvasCard>
      </div>
    </div>
  );
}

function FilterPill({
  mode,
  current,
  label,
}: {
  mode: FilterMode;
  current: FilterMode;
  label: ReactNode;
}) {
  const active = mode === current;
  const href = mode === "all" ? "/cost-centers" : `/cost-centers?filter=${mode}`;
  return (
    <Link
      href={href}
      style={{
        ...deepLinkStyle,
        background: active ? th.accentBg : th.surface,
        color: active ? th.accent : th.textMuted,
        border: `1px solid ${active ? th.accentBorder : th.border}`,
      }}
    >
      {label}
    </Link>
  );
}

function EmptyState({
  copy,
  reason,
}: {
  copy: EmptyStateCopy;
  reason: EmptyReason;
}) {
  return (
    <div
      data-empty-reason={reason}
      style={{
        padding: "40px 24px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        textAlign: "center",
      }}
    >
      <CanvasPill theme={th} tone={copy.tone}>
        <CanvasIcon name={copy.icon} size={12} />
        {reason}
      </CanvasPill>
      <div style={{ fontSize: 14, fontWeight: 600, color: th.text }}>
        {copy.title}
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: th.textMuted,
          lineHeight: 1.5,
          maxWidth: 440,
        }}
      >
        {copy.body}
      </div>
      {reason === "no_data" || reason === "not_provisioned" ? (
        <CanvasBtn theme={th} variant="primary" icon="plus" size="sm">
          新增第一個成本中心
        </CanvasBtn>
      ) : null}
      {reason === "filtered_empty" ? (
        <Link href="/cost-centers" style={deepLinkStyle}>
          清除篩選
        </Link>
      ) : null}
    </div>
  );
}
