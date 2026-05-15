import type { CSSProperties } from "react";
import type {
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
import { formatCount } from "@/lib/formatters";

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

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, 1fr)",
  gap: 12,
};

const cellStackStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 0,
};

const cellPrimaryStyle: CSSProperties = {
  color: th.text,
  fontWeight: 500,
};

const cellSecondaryStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 11,
};

const mutedStyle: CSSProperties = {
  color: th.textDim,
  fontSize: 11.5,
};

type CostCenterData = {
  costCenters: TenantCostCenterRecord[];
  coverage: TenantCostCenterCoverageReport | null;
  quotaByCode: Record<string, TenantCostCenterQuotaSummary>;
  rules: TenantApprovalRuleRecord[];
  errors: string[];
};

type ApprovalSummary = {
  title: string;
  detail: string;
  tone: CanvasTone;
};

type CostCenterRow = TenantCostCenterRecord & Record<string, unknown>;

async function loadCostCenterData(): Promise<CostCenterData> {
  const client = getTenantClient();
  const [costCentersResult, coverageResult, rulesResult] =
    await Promise.allSettled([
      client.listCostCenters() as Promise<TenantCostCenterRecord[]>,
      client.getTenantCostCenterCoverageReport() as Promise<TenantCostCenterCoverageReport>,
      client.listApprovalRules({ activeOnly: true }) as Promise<
        TenantApprovalRuleRecord[]
      >,
    ]);

  const errors: string[] = [];

  if (costCentersResult.status === "rejected") {
    errors.push(`成本中心: ${toErrorMessage(costCentersResult.reason)}`);
  }
  if (coverageResult.status === "rejected") {
    errors.push(`覆蓋報告: ${toErrorMessage(coverageResult.reason)}`);
  }
  if (rulesResult.status === "rejected") {
    errors.push(`審批規則: ${toErrorMessage(rulesResult.reason)}`);
  }

  const costCenters =
    costCentersResult.status === "fulfilled"
      ? [...costCentersResult.value].sort(compareCostCenters)
      : [];
  const quotaByCode: Record<string, TenantCostCenterQuotaSummary> = {};

  if (costCenters.length > 0) {
    const quotaResults = await Promise.allSettled(
      costCenters.map(async (costCenter) => ({
        code: costCenter.code,
        summary: (await client.getTenantCostCenterQuota(
          costCenter.code,
        )) as TenantCostCenterQuotaSummary,
      })),
    );

    for (const result of quotaResults) {
      if (result.status === "fulfilled") {
        quotaByCode[result.value.code] = result.value.summary;
        continue;
      }
      errors.push(`月配額查詢: ${toErrorMessage(result.reason)}`);
    }
  }

  return {
    costCenters,
    coverage:
      coverageResult.status === "fulfilled" ? coverageResult.value : null,
    quotaByCode,
    rules: rulesResult.status === "fulfilled" ? rulesResult.value : [],
    errors,
  };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
}

function compareCostCenters(
  left: TenantCostCenterRecord,
  right: TenantCostCenterRecord,
) {
  if (left.activeFlag !== right.activeFlag) {
    return left.activeFlag ? -1 : 1;
  }
  return left.code.localeCompare(right.code);
}

function getRuleName(rule: TenantApprovalRuleRecord) {
  return rule.ruleName ?? rule.name ?? rule.ruleId;
}

function getConditionValues(condition: TenantApprovalRuleCondition) {
  const values = Array.isArray(condition.values)
    ? condition.values
    : Array.isArray(condition.value)
      ? condition.value
      : condition.value === undefined || condition.value === null
        ? []
        : [condition.value];
  return values.map((value) => String(value).trim().toLowerCase());
}

function matchesExplicitCostCenter(
  rule: TenantApprovalRuleRecord,
  costCenterCode: string,
) {
  const normalizedCode = costCenterCode.trim().toLowerCase();
  return rule.conditions.some(
    (condition) =>
      condition.field === "cost_center.code" &&
      getConditionValues(condition).includes(normalizedCode),
  );
}

function usesCostCenterOwner(rule: TenantApprovalRuleRecord) {
  return rule.approvers.some(
    (approver) => approver.kind === "cost_center_owner",
  );
}

function usesSharedCostCenterSignal(rule: TenantApprovalRuleRecord) {
  return rule.conditions.some((condition) =>
    condition.field.startsWith("cost_center."),
  );
}

function describeEnforcementMode(
  mode: TenantCostCenterQuotaSummary["limit"]["enforcementMode"],
) {
  switch (mode) {
    case "hard_block":
      return "硬上限";
    case "require_approval":
      return "需審批";
    case "warn_only":
    default:
      return "警示";
  }
}

function formatCurrencyMinor(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("zh-Hant", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function formatQuotaLimit(summary: TenantCostCenterQuotaSummary) {
  const parts: string[] = [];
  if (summary.limit.bookingCountLimit !== null) {
    parts.push(`${formatCount(summary.limit.bookingCountLimit)} 趟`);
  }
  if (summary.limit.amountMinorLimit !== null) {
    parts.push(
      formatCurrencyMinor(
        summary.limit.amountMinorLimit,
        summary.limit.currency,
      ),
    );
  }
  return parts.length > 0 ? parts.join(" · ") : "∞";
}

function formatQuotaUsage(summary: TenantCostCenterQuotaSummary) {
  const totalBookings =
    summary.usage.pendingReservedBookingCount +
    summary.usage.confirmedBookingCount;
  const totalAmount =
    summary.usage.pendingReservedAmountMinor +
    summary.usage.confirmedAmountMinor;
  return {
    primary: `${formatCount(totalBookings)} 趟`,
    secondary: formatCurrencyMinor(totalAmount, summary.limit.currency),
  };
}

function buildApprovalSummary(
  costCenter: TenantCostCenterRecord,
  rules: TenantApprovalRuleRecord[],
): ApprovalSummary {
  const explicitRules = rules.filter((rule) =>
    matchesExplicitCostCenter(rule, costCenter.code),
  );
  if (explicitRules.length > 0) {
    return {
      title: `${formatCount(explicitRules.length)} 條專屬規則`,
      detail: explicitRules
        .slice(0, 2)
        .map((rule) => getRuleName(rule))
        .join(" · "),
      tone: "info",
    };
  }

  const ownerRules = rules.filter((rule) => usesCostCenterOwner(rule));
  if (ownerRules.length > 0) {
    return {
      title: costCenter.ownerUserId ? "Owner 預核" : "Owner 規則待指派",
      detail: costCenter.ownerUserId
        ? "由 owner 自動解析審批者"
        : "尚未指派 owner，無法解析審批者",
      tone: costCenter.ownerUserId ? "success" : "warn",
    };
  }

  const sharedCostCenterRules = rules.filter((rule) =>
    usesSharedCostCenterSignal(rule),
  );
  if (sharedCostCenterRules.length > 0) {
    return {
      title: `${formatCount(sharedCostCenterRules.length)} 條共用規則`,
      detail: "規則檢視 cost_center 欄位，但未指定此代碼",
      tone: "neutral",
    };
  }

  return {
    title: "免審",
    detail: "目前無連動審批規則",
    tone: "neutral",
  };
}

export default async function CostCentersPage() {
  const data = await loadCostCenterData();
  const activeCount = data.costCenters.filter((row) => row.activeFlag).length;
  const assignedOwnerCount = data.costCenters.filter(
    (row) => row.ownerUserId || row.ownerName,
  ).length;
  const directQuotaCount = data.costCenters.filter((row) => {
    const summary = data.quotaByCode[row.code];
    return summary ? !summary.inheritedFromTenant : false;
  }).length;
  const unresolvedLegacy = data.coverage?.unresolvedCount ?? 0;

  const columns: CanvasTableColumn<CostCenterRow>[] = [
    {
      h: "CODE",
      k: "code",
      w: 140,
      mono: true,
      r: (row) => (
        <span style={{ color: th.accent, fontWeight: 600 }}>{row.code}</span>
      ),
    },
    {
      h: "NAME",
      w: 220,
      r: (row) => (
        <div style={cellStackStyle}>
          <span style={cellPrimaryStyle}>{row.name}</span>
          <span style={cellSecondaryStyle}>
            {row.description ?? "未提供說明"}
          </span>
        </div>
      ),
    },
    {
      h: "OWNER",
      w: 150,
      r: (row) => (
        <div style={cellStackStyle}>
          <span style={cellPrimaryStyle}>{row.ownerName ?? "未指派"}</span>
          {row.ownerUserId ? (
            <span
              style={{
                ...cellSecondaryStyle,
                fontFamily: th.monoFamily,
              }}
            >
              {row.ownerUserId}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      h: "月配額",
      w: 170,
      mono: true,
      align: "right",
      r: (row) => {
        const summary = data.quotaByCode[row.code];
        if (!summary) {
          return <span style={mutedStyle}>—</span>;
        }
        return (
          <div style={{ ...cellStackStyle, justifyItems: "end" }}>
            <span style={cellPrimaryStyle}>{formatQuotaLimit(summary)}</span>
            <span style={cellSecondaryStyle}>
              {summary.inheritedFromTenant ? "繼承租戶" : "獨立政策"} ·{" "}
              {describeEnforcementMode(summary.limit.enforcementMode)}
            </span>
          </div>
        );
      },
    },
    {
      h: "本月使用",
      w: 170,
      mono: true,
      align: "right",
      r: (row) => {
        const summary = data.quotaByCode[row.code];
        if (!summary) {
          return <span style={mutedStyle}>—</span>;
        }
        const usage = formatQuotaUsage(summary);
        return (
          <div style={{ ...cellStackStyle, justifyItems: "end" }}>
            <span style={cellPrimaryStyle}>{usage.primary}</span>
            <span style={cellSecondaryStyle}>{usage.secondary}</span>
          </div>
        );
      },
    },
    {
      h: "審批",
      r: (row) => {
        const approval = buildApprovalSummary(row, data.rules);
        return (
          <div style={cellStackStyle}>
            <CanvasPill theme={th} tone={approval.tone} dot>
              {approval.title}
            </CanvasPill>
            {approval.detail ? (
              <span style={cellSecondaryStyle}>{approval.detail}</span>
            ) : null}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <CanvasPageHeader
        theme={th}
        title="成本中心"
        subtitle="部門 · 月配額 · 預設審批規則"
        actions={
          <CanvasBtn theme={th} variant="primary" icon="plus" size="sm">
            新增
          </CanvasBtn>
        }
      />

      <div style={pageBodyStyle}>
        {data.errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="部分治理資料無法載入"
            body={data.errors.join(" · ")}
          />
        ) : null}

        <div style={kpiRowStyle}>
          <CanvasKPI
            theme={th}
            label="成本中心"
            value={formatCount(data.costCenters.length)}
            sub="目前已發布"
          />
          <CanvasKPI
            theme={th}
            label="啟用中"
            value={formatCount(activeCount)}
            sub="可用於新單"
          />
          <CanvasKPI
            theme={th}
            label="獨立配額"
            value={formatCount(directQuotaCount)}
            sub="不繼承租戶"
          />
          <CanvasKPI
            theme={th}
            label="未對應行程"
            value={formatCount(unresolvedLegacy)}
            sub="待人工歸戶"
            delta={
              assignedOwnerCount < data.costCenters.length
                ? `${data.costCenters.length - assignedOwnerCount} 筆缺 owner`
                : undefined
            }
            deltaTone={
              assignedOwnerCount < data.costCenters.length ? "down" : "neutral"
            }
          />
        </div>

        <CanvasCard theme={th} padding={0}>
          {data.costCenters.length > 0 ? (
            <CanvasTable<CostCenterRow>
              theme={th}
              columns={columns}
              rows={data.costCenters as CostCenterRow[]}
            />
          ) : (
            <div
              style={{
                padding: 24,
                color: th.textMuted,
                fontSize: 12.5,
                textAlign: "center",
              }}
            >
              目前沒有發布中的成本中心。
            </div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
