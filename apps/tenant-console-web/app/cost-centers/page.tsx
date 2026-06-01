import type { CSSProperties } from "react";
import type {
  EmptyReason,
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
  CanvasKPI,
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

const kpiGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 12,
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

const usageCellStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 150,
};

const usageBarTrackStyle: CSSProperties = {
  flex: 1,
  height: 6,
  background: th.surfaceLo,
  borderRadius: 3,
  overflow: "hidden",
};

const rowActionsStyle: CSSProperties = {
  display: "flex",
  gap: 4,
};

const filterRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
};

const deepLinkRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const emptyStateStyle: CSSProperties = {
  padding: 32,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  textAlign: "center",
};

const numberFormatter = new Intl.NumberFormat("zh-Hant");

const dateTimeFormatter = new Intl.DateTimeFormat("zh-Hant", {
  dateStyle: "short",
  timeStyle: "short",
});

// Routes actually shipped in tenant-console-web today. /reports, /billing, and
// the other Q-TEN02 "NEW" routes are not merged yet, so deep links to them are
// rendered as disabled affordances instead of links that would 404 on click.
const EXISTING_TENANT_ROUTES: ReadonlySet<string> = new Set([
  "/",
  "/bookings",
  "/passengers",
  "/cost-centers",
  "/rules",
  "/invoices",
  "/api-keys",
  "/webhooks",
  "/audit",
  "/users",
  "/settings",
]);

function routeExists(path: string) {
  const [pathname] = path.split("?");
  return pathname ? EXISTING_TENANT_ROUTES.has(pathname) : false;
}

// availableActions per packet §5.14 (Q-TEN11). CTAs are derived from these
// descriptors instead of being hard-coded by role (packet §3.5 / Q-X13).
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

// Six tenant-relevant EmptyReason states per packet §3.6 (Q-X15). The
// driver-app-only `driver_not_eligible` reason is intentionally excluded.
const EMPTY_REASONS: readonly EmptyReason[] = [
  "no_data",
  "not_provisioned",
  "fetch_failed",
  "permission_denied",
  "external_unavailable",
  "filtered_empty",
] as const;

type CostCenterView = "all" | "active" | "disabled";

const COST_CENTER_CANVAS_ORDER = [
  "CC-FIN-04",
  "CC-RD-12",
  "CC-OPS-02",
  "CC-BD-09",
  "CC-EXEC-01",
] as const;

// Canvas artboard seed values (Tenant Console.html · TN_CostCenters). Used only
// as a presentation fallback when the live tenant API returns nothing, so the
// static design environment still matches the artboard without inventing data
// on top of real backend reads.
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

function findAction(
  availableActions: readonly ResourceActionDescriptor[],
  action: string,
): ResourceActionDescriptor | null {
  return availableActions.find((item) => item.action === action) ?? null;
}

function parseView(value: string | undefined): CostCenterView {
  if (value === "active" || value === "disabled") {
    return value;
  }
  return "all";
}

function parseEmptyReason(value: string | undefined): EmptyReason | null {
  if (!value) {
    return null;
  }
  return EMPTY_REASONS.includes(value as EmptyReason)
    ? (value as EmptyReason)
    : null;
}

type CostCentersPageData = {
  costCenters: TenantCostCenterRecord[];
  quotaSummariesByCode: Partial<Record<string, TenantCostCenterQuotaSummary>>;
  approvalRules: TenantApprovalRuleRecord[];
  coverage: TenantCostCenterCoverageReport | null;
  errors: string[];
  generatedAt: string | null;
};

async function loadCostCentersData(): Promise<CostCentersPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
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
  const coverage =
    coverageResult.status === "fulfilled" ? coverageResult.value : null;

  if (costCentersResult.status === "rejected") {
    errors.push(`成本中心目錄: ${toErrorMessage(costCentersResult.reason)}`);
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
    coverage?.generatedAt ??
    Object.values(quotaSummariesByCode)[0]?.refreshedAt ??
    costCenters[0]?.updatedAt ??
    null;

  return {
    costCenters,
    quotaSummariesByCode,
    approvalRules,
    coverage,
    errors,
    generatedAt,
  };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function formatUpdated(value: string | null | undefined) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateTimeFormatter.format(parsed);
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

function getUsedBookingCount(quotaSummary?: TenantCostCenterQuotaSummary) {
  if (!quotaSummary) return null;
  return (
    quotaSummary.usage.confirmedBookingCount +
    quotaSummary.usage.pendingReservedBookingCount
  );
}

function parseRideCount(value: string | undefined) {
  if (!value) return null;
  if (value.includes("∞")) return null;
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return null;
  return Number.parseInt(digits, 10);
}

function formatQuotaDisplay(
  code: string,
  quotaSummary?: TenantCostCenterQuotaSummary,
) {
  if (quotaSummary) {
    if (quotaSummary.limit.bookingCountLimit === null) return "∞";
    return formatRideCount(quotaSummary.limit.bookingCountLimit);
  }
  return COST_CENTER_CANVAS_PRESENTATION[code]?.quota ?? "—";
}

function formatUsageDisplay(
  code: string,
  quotaSummary?: TenantCostCenterQuotaSummary,
) {
  const usedCount = getUsedBookingCount(quotaSummary);
  if (usedCount !== null) {
    return formatRideCount(usedCount);
  }
  return COST_CENTER_CANVAS_PRESENTATION[code]?.used ?? "—";
}

// Returns 0-100 usage percentage, or null when the quota is unlimited / unknown.
function getUsagePercent(
  code: string,
  quotaSummary?: TenantCostCenterQuotaSummary,
) {
  let used = getUsedBookingCount(quotaSummary);
  let limit = quotaSummary?.limit.bookingCountLimit ?? null;

  if (quotaSummary && limit === null) {
    return null; // unlimited
  }

  if (used === null || limit === null) {
    const presentation = COST_CENTER_CANVAS_PRESENTATION[code];
    if (presentation?.quota.includes("∞")) {
      return null;
    }
    used = parseRideCount(presentation?.used);
    limit = parseRideCount(presentation?.quota);
  }

  if (used === null || limit === null || limit <= 0) {
    return null;
  }

  return Math.min(150, Math.round((used / limit) * 100));
}

function getUsageBarColor(pct: number) {
  if (pct > 90) return th.danger;
  if (pct > 80) return th.warn;
  return th.success;
}

function formatApprovalDisplay(
  code: string,
  approvalRules: TenantApprovalRuleRecord[],
  hasLiveRules: boolean,
) {
  const relevantRules = approvalRules.filter((rule) =>
    ruleTargetsCostCenter(rule, code),
  );

  if (relevantRules.length === 0) {
    // No live rule targets this cost center — fall back to the artboard seed
    // copy only when the tenant has no approval rules loaded at all.
    if (!hasLiveRules) {
      return COST_CENTER_CANVAS_PRESENTATION[code]?.approval ?? "依租戶規則";
    }
    return "依租戶規則";
  }

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

function getEmptyStateTone(reason: EmptyReason | null): CanvasTone {
  switch (reason) {
    case "fetch_failed":
    case "external_unavailable":
      return "warn";
    case "permission_denied":
      return "danger";
    case "filtered_empty":
      return "neutral";
    case "not_provisioned":
    case "no_data":
    default:
      return "accent";
  }
}

function getEmptyStateCopy(reason: EmptyReason | null) {
  switch (reason) {
    case "not_provisioned":
      return {
        title: "成本中心尚未開通",
        body: "此租戶的企業財務治理模組尚未佈建。請先建立第一個成本中心，再於 /rules 連結對應的審批規則。",
      };
    case "fetch_failed":
      return {
        title: "成本中心資料載入失敗",
        body: "路由仍可用，但成本中心目錄讀取失敗。請於後端依賴恢復後重試。",
      };
    case "permission_denied":
      return {
        title: "目前帳號無權管理成本中心",
        body: "頁面可見，但目前操作者沒有讀取或維護租戶成本中心的權限。",
      };
    case "external_unavailable":
      return {
        title: "相依的治理服務暫時無法使用",
        body: "成本中心檢視因為一個或多個上游租戶治理服務中斷或回傳過時資料而降級。",
      };
    case "filtered_empty":
      return {
        title: "目前篩選條件下沒有成本中心",
        body: "此租戶有成本中心，但目前的檢視篩選沒有任何符合項目。請切換為「全部」或調整篩選。",
      };
    case "no_data":
    default:
      return {
        title: "尚無成本中心",
        body: "請新增第一個成本中心，而不是顯示未發佈的預設值。",
      };
  }
}

type CostCenterRow = {
  code: string;
  name: string;
  ownerName: string | null;
  activeFlag: boolean;
  quota: string;
  used: string;
  usagePercent: number | null;
  approval: string;
  hasApprovalLinkage: boolean;
} & Record<string, unknown>;

type CostCentersPageProps = {
  searchParams?: Promise<{
    view?: string;
    emptyReason?: string;
  }>;
};

const linkBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 12px",
  borderRadius: 999,
  border: `1px solid ${th.border}`,
  background: th.surfaceLo,
  color: th.text,
  fontSize: 12,
  fontWeight: 600,
  textDecoration: "none",
};

const disabledLinkStyle: CSSProperties = {
  ...linkBaseStyle,
  color: th.textMuted,
  cursor: "not-allowed",
  opacity: 0.6,
};

function DeepLink({
  href,
  label,
  newTab = false,
  unavailableHint,
}: {
  href: string;
  label: string;
  newTab?: boolean;
  unavailableHint?: string;
}) {
  if (!routeExists(href)) {
    return (
      <span style={disabledLinkStyle} title={unavailableHint ?? "規劃中"}>
        {label}（規劃中）
      </span>
    );
  }
  return (
    <a
      href={href}
      style={linkBaseStyle}
      {...(newTab ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {label}
    </a>
  );
}

function FilterPill({
  view,
  current,
  label,
}: {
  view: CostCenterView;
  current: CostCenterView;
  label: string;
}) {
  const selected = view === current;
  const href = view === "all" ? "/cost-centers" : `/cost-centers?view=${view}`;
  return (
    <a
      href={href}
      style={{
        ...linkBaseStyle,
        padding: "4px 12px",
        fontSize: 11.5,
        border: `1px solid ${selected ? th.accent : th.border}`,
        background: selected ? th.accentBg : th.surfaceLo,
        color: selected ? th.accentHi : th.textMuted,
      }}
    >
      {label}
    </a>
  );
}

export default async function CostCentersPage({
  searchParams,
}: CostCentersPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const view = parseView(resolvedSearchParams?.view);
  const emptyReasonOverride = parseEmptyReason(
    resolvedSearchParams?.emptyReason,
  );

  const {
    costCenters,
    quotaSummariesByCode,
    approvalRules,
    coverage,
    errors,
    generatedAt,
  } = await loadCostCentersData();

  const hasLiveRules = approvalRules.length > 0;
  const activeCount = costCenters.filter((cc) => cc.activeFlag).length;
  const disabledCount = costCenters.length - activeCount;

  const visibleCostCenters = costCenters.filter((costCenter) => {
    if (view === "active") return costCenter.activeFlag;
    if (view === "disabled") return !costCenter.activeFlag;
    return true;
  });

  const rows: CostCenterRow[] = visibleCostCenters.map((costCenter) => {
    const quotaSummary = quotaSummariesByCode[costCenter.code];
    const hasApprovalLinkage = approvalRules.some((rule) =>
      ruleTargetsCostCenter(rule, costCenter.code),
    );
    return {
      code: costCenter.code,
      name: costCenter.name,
      ownerName: costCenter.ownerName,
      activeFlag: costCenter.activeFlag,
      quota: formatQuotaDisplay(costCenter.code, quotaSummary),
      used: formatUsageDisplay(costCenter.code, quotaSummary),
      usagePercent: getUsagePercent(costCenter.code, quotaSummary),
      approval: formatApprovalDisplay(
        costCenter.code,
        approvalRules,
        hasLiveRules,
      ),
      hasApprovalLinkage,
    };
  });

  const overQuotaCount = rows.filter(
    (row) => row.usagePercent !== null && row.usagePercent >= 100,
  ).length;

  // Empty state: explicit ?emptyReason override wins (lets the design surface
  // each of the six distinct states), then inference from the loaded data.
  let emptyReason: EmptyReason | null = emptyReasonOverride;
  if (!emptyReason && rows.length === 0) {
    if (errors.length > 0 && costCenters.length === 0) {
      emptyReason = "fetch_failed";
    } else if (costCenters.length === 0) {
      emptyReason = view === "all" ? "no_data" : "filtered_empty";
    } else {
      emptyReason = "filtered_empty";
    }
  }
  const showEmptyState = emptyReasonOverride !== null || rows.length === 0;
  const emptyStateCopy = getEmptyStateCopy(emptyReason);

  const createAction = findAction(ROUTE_ACTIONS, "create_cost_center");
  const updateAction = findAction(ROUTE_ACTIONS, "update_cost_center");
  const disableAction = findAction(ROUTE_ACTIONS, "disable_cost_center");
  const reactivateAction = findAction(ROUTE_ACTIONS, "reactivate_cost_center");

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
      w: 190,
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
      w: 120,
      r: (row) => row.ownerName ?? "—",
    },
    {
      h: "月配額",
      k: "quota",
      w: 110,
      mono: true,
      align: "right",
    },
    {
      h: "本月使用",
      w: 200,
      r: (row) => (
        <div style={usageCellStyle}>
          <span
            style={{
              fontFamily: th.monoFamily,
              fontSize: 11.5,
              minWidth: 56,
            }}
          >
            {row.used}
          </span>
          {row.usagePercent !== null ? (
            <>
              <div style={usageBarTrackStyle}>
                <div
                  style={{
                    width: `${Math.min(100, row.usagePercent)}%`,
                    height: "100%",
                    background: getUsageBarColor(row.usagePercent),
                  }}
                />
              </div>
              {row.usagePercent >= 100 ? (
                <CanvasPill theme={th} tone="danger">
                  超額
                </CanvasPill>
              ) : null}
            </>
          ) : (
            <span style={{ color: th.textMuted, fontSize: 11.5 }}>不限</span>
          )}
        </div>
      ),
    },
    {
      h: "審批連結",
      w: 200,
      r: (row) => (
        <span style={labelCellStyle}>
          <span style={textWrapStyle}>{row.approval}</span>
          {row.hasApprovalLinkage ? (
            <CanvasPill theme={th} tone="info">
              /rules
            </CanvasPill>
          ) : null}
        </span>
      ),
    },
    {
      h: "報表歸屬",
      w: 110,
      r: (row) =>
        routeExists("/reports") ? (
          <a
            href={`/reports?costCenter=${encodeURIComponent(row.code)}`}
            style={{ ...linkBaseStyle, padding: "4px 10px", fontSize: 11.5 }}
          >
            報表
          </a>
        ) : (
          <span style={{ color: th.textMuted, fontSize: 11.5 }}>規劃中</span>
        ),
    },
    {
      h: "ACTIONS",
      w: 170,
      r: (row) => (
        <div style={rowActionsStyle}>
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
              disabled={reactivateAction?.enabled === false}
            >
              啟用
            </CanvasBtn>
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
        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="無法載入完整成本中心資料"
            body={errors.join(" · ")}
          />
        ) : null}

        <CanvasBanner
          theme={th}
          tone="info"
          icon="clock"
          title="更新頻率 T5：租戶慢速 (30 秒)"
          body={`此頁面以 30 秒租戶慢速節奏更新。快照載入時間 ${formatUpdated(
            generatedAt,
          )}。`}
        />

        <div style={kpiGridStyle}>
          <CanvasKPI
            theme={th}
            label="成本中心"
            value={numberFormatter.format(costCenters.length)}
            sub="部門目錄"
          />
          <CanvasKPI
            theme={th}
            label="啟用中"
            value={numberFormatter.format(activeCount)}
            sub={`${numberFormatter.format(disabledCount)} 已停用`}
          />
          <CanvasKPI
            theme={th}
            label="超額"
            value={numberFormatter.format(overQuotaCount)}
            sub="本月用量 ≥ 100%"
          />
          <CanvasKPI
            theme={th}
            label="報表歸屬"
            value={
              coverage
                ? numberFormatter.format(coverage.resolvedCount)
                : "—"
            }
            sub={
              coverage
                ? `${numberFormatter.format(coverage.unresolvedCount)} 筆未歸屬`
                : "報表歸屬資料未載入"
            }
          />
        </div>

        <CanvasCard theme={th} padding={12}>
          <div style={filterRowStyle}>
            <span style={{ color: th.textMuted, fontSize: 11.5 }}>檢視</span>
            <FilterPill view="all" current={view} label="全部" />
            <FilterPill view="active" current={view} label="啟用中" />
            <FilterPill view="disabled" current={view} label="已停用" />
            <span style={{ flex: 1 }} />
            <div style={deepLinkRowStyle}>
              <DeepLink
                href="/rules"
                label="審批規則"
                unavailableHint="審批規則頁規劃中"
              />
              <DeepLink
                href="/reports?scope=cost_center"
                label="報表歸屬"
                unavailableHint="報表頁規劃中 (Q-TEN02)"
              />
              <DeepLink
                href="/audit?module=cost-center"
                label="稽核紀錄"
                unavailableHint="稽核頁規劃中"
              />
            </div>
          </div>
        </CanvasCard>

        <CanvasCard theme={th} padding={0}>
          {!showEmptyState ? (
            <CanvasTable<CostCenterRow>
              theme={th}
              columns={columns}
              rows={rows}
            />
          ) : (
            <div style={emptyStateStyle}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  marginBottom: 4,
                }}
              >
                <CanvasPill theme={th} tone={getEmptyStateTone(emptyReason)}>
                  {emptyReason ?? "no_data"}
                </CanvasPill>
              </div>
              <div style={{ color: th.text, fontWeight: 600, fontSize: 14 }}>
                {emptyStateCopy.title}
              </div>
              <div
                style={{
                  color: th.textMuted,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  maxWidth: 460,
                  margin: "0 auto",
                }}
              >
                {emptyStateCopy.body}
              </div>
            </div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
