import type { CSSProperties } from "react";
import type {
  TenantApprovalRuleCondition,
  TenantApprovalRuleRecord,
  TenantCostCenterQuotaSummary,
  TenantCostCenterRecord,
} from "@drts/contracts";
import {
  CanvasBanner,
  CanvasBtn,
  CanvasCard,
  CanvasPageHeader,
  CanvasPill,
  CanvasTable,
  type CanvasTableColumn,
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

const numberFormatter = new Intl.NumberFormat("zh-Hant");

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
  errors: string[];
};

async function loadCostCentersData(): Promise<CostCentersPageData> {
  const client = getTenantClient();
  const errors: string[] = [];
  const [costCentersResult, approvalRulesResult] = await Promise.allSettled([
    client.listCostCenters() as Promise<TenantCostCenterRecord[]>,
    client.listApprovalRules({
      activeOnly: true,
    }) as Promise<TenantApprovalRuleRecord[]>,
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

  if (costCentersResult.status === "rejected") {
    errors.push(`成本中心目錄: ${toErrorMessage(costCentersResult.reason)}`);
  }
  if (approvalRulesResult.status === "rejected") {
    errors.push(`審批規則: ${toErrorMessage(approvalRulesResult.reason)}`);
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

  return { costCenters, quotaSummariesByCode, approvalRules, errors };
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "未知錯誤";
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

type CostCenterRow = {
  code: string;
  name: string;
  ownerName: string | null;
  activeFlag: boolean;
  quota: string;
  used: string;
  approval: string;
} & Record<string, unknown>;

export default async function CostCentersPage() {
  const { costCenters, quotaSummariesByCode, approvalRules, errors } =
    await loadCostCentersData();

  const rows: CostCenterRow[] = costCenters.map((costCenter) => ({
    code: costCenter.code,
    name: costCenter.name,
    ownerName: costCenter.ownerName,
    activeFlag: costCenter.activeFlag,
    quota: formatQuotaDisplay(
      costCenter.code,
      quotaSummariesByCode[costCenter.code],
    ),
    used: formatUsageDisplay(
      costCenter.code,
      quotaSummariesByCode[costCenter.code],
    ),
    approval: formatApprovalDisplay(costCenter.code, approvalRules),
  }));

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
      w: 150,
      mono: true,
      align: "right",
    },
    {
      h: "本月使用",
      k: "used",
      w: 150,
      mono: true,
      align: "right",
    },
    {
      h: "審批",
      w: 220,
      r: (row) => <span style={textWrapStyle}>{row.approval}</span>,
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
        {errors.length > 0 ? (
          <CanvasBanner
            theme={th}
            tone="warn"
            icon="warn"
            title="無法載入完整成本中心資料"
            body={errors.join(" · ")}
          />
        ) : null}

        <CanvasCard theme={th} padding={0}>
          {rows.length > 0 ? (
            <CanvasTable<CostCenterRow>
              theme={th}
              columns={columns}
              rows={rows}
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
              尚無成本中心，請新增第一個成本中心。
            </div>
          )}
        </CanvasCard>
      </div>
    </div>
  );
}
